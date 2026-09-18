import "../scripts/env";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { requestIdentity } from "../src/server/context";
import { can } from "../src/lib/permissions";
import { pool, forOrg } from "../src/server/db";
import { runCommand } from "../src/server/commands";
import { loadData } from "../src/server/data";
import { loadBrand } from "../src/server/settings";
import { defaultSettings } from "../src/lib/settings";
import { decryptIntegrationKey } from "../src/server/integration-secrets";
import { suggestAnamnesis } from "../src/server/anamnesis-service";
import { generateAnamnesis } from "../src/server/gemini";
vi.mock("../src/server/gemini", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/server/gemini")>()),
  generateAnamnesis: vi.fn(),
}));
vi.mock("../src/server/access", () => ({
  withAccess:
    (
      permission: Parameters<typeof can>[1],
      handler: (req: Request, ...args: unknown[]) => Promise<Response>,
    ) =>
    (req: Request, ...args: unknown[]) =>
      can(requestIdentity.getStore()!.role, permission)
        ? handler(req, ...args)
        : Promise.resolve(new Response(null, { status: 403 })),
}));
import { POST as saveSettings } from "../src/app/api/settings/route";
import { POST as generateRoute } from "../src/app/api/consultations/[id]/anamnesis/route";

const admin = new Pool({ connectionString: process.env.ADMIN_DATABASE_URL });
const org = "ai-test-" + randomUUID(),
  otherOrg = "ai-test-" + randomUUID();
const actor = {
  userId: "ai-test",
  name: "Test",
  email: "",
  orgId: org,
  role: "admin" as const,
  local: true,
};
const fakeKey = "AQ.fake-key-for-local-tests-only";
const result = {
  transcription: "",
  sections: [
    { title: "Queixa principal" as const, content: "Sem diarreia relatada." },
  ],
  warnings: [],
};
let consultationId: string,
  settingsRevision = 0;
const scoped = <T>(fn: () => Promise<T>) => requestIdentity.run(actor, fn);
async function settings(extra: Record<string, string> = {}) {
  const form = new FormData();
  for (const key of ["companyName", "veterinarianName", "crmv"] as const)
    form.set(key, defaultSettings[key]);
  form.set("revision", String(settingsRevision));
  for (const [key, value] of Object.entries(extra)) form.set(key, value);
  const response = await scoped(() =>
    saveSettings(
      new Request("http://localhost/api/settings", {
        method: "POST",
        body: form,
      }),
    ),
  );
  if (response.ok) settingsRevision = (await response.clone().json()).revision;
  return response;
}
beforeAll(async () => {
  await admin.query(
    "INSERT INTO organizations(id,name) VALUES($1,'AI test'),($2,'Other AI test')",
    [org, otherOrg],
  );
  await scoped(async () => {
    const tutor = await runCommand(
      {
        type: "tutor.create",
        data: { name: "Teste", phone: "", email: "", address: "Rua teste" },
        patientNames: ["Animal fictício"],
      },
      randomUUID(),
    );
    const patient = (await loadData()).patients.find(
      (p) => p.tutorId === tutor.id,
    )!;
    const visit = await runCommand(
      {
        type: "visit.create",
        tutorId: tutor.id,
        patientIds: [patient.id],
        date: "2026-09-18",
        time: "09:00",
        duration: 60,
        address: "Rua teste",
        baseCents: 0,
        reason: "Teste",
      },
      randomUUID(),
    );
    consultationId = (
      await runCommand(
        {
          type: "consultation.start",
          visitId: visit.id,
          patientId: patient.id,
        },
        randomUUID(),
      )
    ).id;
  });
  expect((await settings({ geminiApiKey: fakeKey })).status).toBe(200);
});
beforeEach(async () => {
  vi.mocked(generateAnamnesis).mockReset().mockResolvedValue(result);
  await admin.query(
    "UPDATE consultations SET status='draft',revision=0,notes='Original preservado' WHERE id=$1",
    [consultationId],
  );
  await admin.query(
    "UPDATE clinic_ai_settings SET lease_id=NULL,lease_until=NULL,request_count=0,window_start=now() WHERE organization_id=$1",
    [org],
  );
});
afterAll(async () => {
  for (const table of [
    "audit_log",
    "mutations",
    "timeline",
    "consultations",
    "visit_patients",
    "visits",
    "patients",
    "tutors",
    "clinic_ai_settings",
    "practice_settings",
  ])
    await admin.query(
      `DELETE FROM ${table} WHERE organization_id=ANY($1::text[])`,
      [[org, otherOrg]],
    );
  await admin.query("DELETE FROM organizations WHERE id=ANY($1::text[])", [
    [org, otherOrg],
  ]);
  await admin.end();
  await pool.end();
});
it("retorna apenas a presença da chave, preserva em clientes antigos e aplica RLS", async () => {
  expect((await scoped(loadBrand)).hasGeminiKey).toBe(true);
  expect(JSON.stringify(await scoped(loadData))).not.toContain(fakeKey);
  const cipher = (
    await admin.query(
      "SELECT encrypted_key FROM clinic_ai_settings WHERE organization_id=$1",
      [org],
    )
  ).rows[0].encrypted_key;
  expect(cipher).not.toContain(fakeKey);
  expect(decryptIntegrationKey(cipher, org)).toBe(fakeKey);
  expect((await settings()).status).toBe(200);
  expect((await scoped(loadBrand)).hasGeminiKey).toBe(true);
  expect(
    (
      await requestIdentity.run({ ...actor, orgId: otherOrg }, () =>
        forOrg((db) => db.query("SELECT * FROM clinic_ai_settings")),
      )
    ).rows,
  ).toEqual([]);
  expect((await pool.query("SELECT * FROM clinic_ai_settings")).rows).toEqual(
    [],
  );
});
it("gera uma sugestão sem alterar o prontuário ou salvar texto na auditoria", async () => {
  const source = "Relato confidencial apenas de teste";
  expect(
    await scoped(() => suggestAnamnesis(consultationId, 0, { text: source })),
  ).toEqual(result);
  expect(vi.mocked(generateAnamnesis)).toHaveBeenCalledWith(
    fakeKey,
    { text: source },
    undefined,
  );
  expect(
    (
      await admin.query(
        "SELECT notes,revision FROM consultations WHERE id=$1",
        [consultationId],
      )
    ).rows[0],
  ).toEqual({ notes: "Original preservado", revision: 0 });
  const audits = (
    await admin.query(
      "SELECT action,entity_id FROM audit_log WHERE organization_id=$1 AND action LIKE 'ai.%'",
      [org],
    )
  ).rows;
  expect(audits).toContainEqual({
    action: "ai.anamnesis.text",
    entity_id: consultationId,
  });
  expect(JSON.stringify(audits)).not.toContain(source);
});
it("bloqueia atendimento alheio, concluído e revisão desatualizada antes de chamar o Gemini", async () => {
  await expect(
    requestIdentity.run({ ...actor, orgId: otherOrg }, () =>
      suggestAnamnesis(consultationId, 0, { text: "Teste" }),
    ),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    scoped(() => suggestAnamnesis(consultationId, 2, { text: "Teste" })),
  ).rejects.toMatchObject({ status: 409 });
  await admin.query("UPDATE consultations SET status='completed' WHERE id=$1", [
    consultationId,
  ]);
  await expect(
    scoped(() => suggestAnamnesis(consultationId, 0, { text: "Teste" })),
  ).rejects.toMatchObject({ status: 409 });
  expect(generateAnamnesis).not.toHaveBeenCalled();
});
it("limita cota e concorrência e libera a reserva após falha", async () => {
  await admin.query(
    "UPDATE clinic_ai_settings SET request_count=30 WHERE organization_id=$1",
    [org],
  );
  await expect(
    scoped(() => suggestAnamnesis(consultationId, 0, { text: "Teste" })),
  ).rejects.toMatchObject({ status: 429 });
  await admin.query(
    "UPDATE clinic_ai_settings SET request_count=0,lease_until=now()+interval '1 minute' WHERE organization_id=$1",
    [org],
  );
  await expect(
    scoped(() => suggestAnamnesis(consultationId, 0, { text: "Teste" })),
  ).rejects.toMatchObject({ status: 429 });
  await admin.query(
    "UPDATE clinic_ai_settings SET lease_until=NULL WHERE organization_id=$1",
    [org],
  );
  vi.mocked(generateAnamnesis).mockRejectedValueOnce(Error("provider failure"));
  await expect(
    scoped(() => suggestAnamnesis(consultationId, 0, { text: "Teste" })),
  ).rejects.toThrow("provider failure");
  expect(
    (
      await admin.query(
        "SELECT lease_until FROM clinic_ai_settings WHERE organization_id=$1",
        [org],
      )
    ).rows[0].lease_until,
  ).toBeNull();
  expect(
    await scoped(() => suggestAnamnesis(consultationId, 0, { text: "Teste" })),
  ).toEqual(result);
});
it("descarta resultado se outra aba salvar durante a geração", async () => {
  vi.mocked(generateAnamnesis).mockImplementationOnce(async () => {
    await admin.query(
      "UPDATE consultations SET revision=1,notes='Nova versão' WHERE id=$1",
      [consultationId],
    );
    return result;
  });
  await expect(
    scoped(() => suggestAnamnesis(consultationId, 0, { text: "Teste" })),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    (
      await admin.query("SELECT notes FROM consultations WHERE id=$1", [
        consultationId,
      ])
    ).rows[0].notes,
  ).toBe("Nova versão");
});
it("aceita áudio multipart e nega assistentes, excesso de tamanho e arquivos disfarçados", async () => {
  const send = (file: Blob, role: "admin" | "assistant" = "admin") => {
    const form = new FormData();
    form.set("text", "");
    form.set("revision", "0");
    form.set("audio", file, "teste.wav");
    return requestIdentity.run({ ...actor, role }, () =>
      generateRoute(
        new Request("http://localhost/api/consultations/test/anamnesis", {
          method: "POST",
          body: form,
        }),
        { params: Promise.resolve({ id: consultationId }) },
      ),
    );
  };
  expect(
    (await send(new Blob(["RIFF0000WAVEsynthetic"], { type: "audio/wav" })))
      .status,
  ).toBe(200);
  expect(vi.mocked(generateAnamnesis).mock.calls[0][1].audio?.mimeType).toBe(
    "audio/wav",
  );
  expect(
    (await send(new Blob(["RIFF0000WAVEsynthetic"]), "assistant")).status,
  ).toBe(403);
  expect(
    (await send(new Blob(["%PDF-not-an-audio"], { type: "audio/wav" }))).status,
  ).toBe(400);
  expect(
    (await send(new Blob([new Uint8Array(3 * 1024 * 1024 + 1)]))).status,
  ).toBe(413);
});
it("remove a chave sem retornar o segredo e desabilita futuras gerações", async () => {
  const response = await settings({ removeGeminiKey: "true" });
  expect(response.status).toBe(200);
  expect(await response.text()).not.toContain(fakeKey);
  expect((await scoped(loadBrand)).hasGeminiKey).toBe(false);
  await expect(
    scoped(() => suggestAnamnesis(consultationId, 0, { text: "Teste" })),
  ).rejects.toMatchObject({ status: 409 });
});
