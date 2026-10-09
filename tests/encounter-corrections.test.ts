import "../scripts/env";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
vi.mock("../src/server/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/server/access")>();
  return {
    ...actual,
    withAccess:
      (
        permission: Parameters<typeof actual.assertPermission>[0] | null,
        handler: (...args: unknown[]) => Promise<Response>,
      ) =>
      (...args: unknown[]) => {
        if (permission) actual.assertPermission(permission);
        return handler(...args);
      },
  };
});
import { runCommand } from "../src/server/commands";
import { loadData } from "../src/server/data";
import { forOrg, pool } from "../src/server/db";
import { requestIdentity } from "../src/server/context";
import { readAudit } from "../src/server/audit";
import { documentPdf } from "../src/server/issued-documents";
import { buildFinance, financeCsv } from "../src/lib/finance";
import { dateKey } from "../src/lib/domain";
import type { Identity } from "../src/lib/permissions";
import { POST as upload } from "../src/app/api/exams/upload/route";
import { POST as commandRoute } from "../src/app/api/commands/route";
const org = "correction-test-" + randomUUID(),
  other = "correction-other-" + randomUUID();
const admin = new Pool({ connectionString: process.env.ADMIN_DATABASE_URL });
const actor: Identity = {
  userId: randomUUID(),
  name: "Veterinária de teste",
  email: "corrections@example.com",
  orgId: org,
  role: "admin",
  isVeterinarian: true,
  local: false,
};
const act = <T>(fn: () => Promise<T>, identity = actor) =>
  requestIdentity.run(identity, fn);
const execute = (cmd: unknown, id = randomUUID()) =>
  act(() => runCommand(cmd, id));
const data = () => act(() => loadData());
const reason = "Correção solicitada durante a conferência";
const rxItems = [
  {
    name: "Medicamento fictício",
    concentration: "Teste",
    dose: "Teste",
    route: "Teste",
    frequency: "Teste",
    duration: "Teste",
    quantity: "Teste",
    instructions: "Sem validade clínica",
  },
];
let tutor: string,
  patient: string,
  product: string,
  cid: string,
  vid: string,
  appId: string;
beforeAll(async () => {
  await admin.query(
    "INSERT INTO organizations(id,name) VALUES($1,'TEST'),($2,'OTHER')",
    [org, other],
  );
  await admin.query(
    'INSERT INTO auth_user(id,name,email,"emailVerified") VALUES($1,$2,$3,true)',
    [actor.userId, actor.name, actor.email],
  );
  await admin.query(
    "INSERT INTO professional_profiles(organization_id,user_id,veterinarian_name,veterinarian_title,crmv) VALUES($1,$2,'Fictícia','Dra.','TEST')",
    [org, actor.userId],
  );
  tutor = (
    await execute({
      type: "tutor.create",
      data: {
        name: "Tutor de teste",
        phone: "",
        email: "",
        address: "Rua teste",
      },
    })
  ).id;
  patient = (
    await execute({
      type: "patient.create",
      data: {
        tutorId: tutor,
        name: "Paciente fictício",
        species: "Cão",
        breed: "",
        sex: "Não informado",
        birthDate: null,
        notes: "",
      },
    })
  ).id;
  product = (
    await execute({
      type: "product.create",
      data: {
        name: "Produto de teste",
        unit: "mL",
        costCents: 200,
        saleCents: 1000,
      },
    })
  ).id;
});
afterAll(async () => {
  for (const table of [
    "prescription_signatures",
    "professional_profiles",
    "mutations",
    "timeline",
    "exam_links",
    "exams",
    "attachments",
    "payments",
    "prescriptions",
    "applications",
    "consultations",
    "visit_patients",
    "visits",
    "products",
    "patients",
    "tutors",
    "practice_settings",
    "audit_log",
  ])
    await admin.query(
      `DELETE FROM ${table} WHERE organization_id=ANY($1::text[])`,
      [[org, other]],
    );
  await admin.query("DELETE FROM organizations WHERE id=ANY($1::text[])", [
    [org, other],
  ]);
  await admin.query("DELETE FROM auth_user WHERE id=$1", [actor.userId]);
  await admin.end();
  await pool.end();
});
describe.sequential("atendimentos avulsos e correções auditadas", () => {
  it("cria um rascunho sem agenda/data, de forma idempotente, e exige data para concluir", async () => {
    const key = randomUUID(),
      cmd = { type: "consultation.create", patientId: patient };
    const [a, b] = await Promise.all([execute(cmd, key), execute(cmd, key)]);
    expect(a.id).toBe(b.id);
    cid = a.id;
    let loaded = await data();
    const c = loaded.consultations.find((x) => x.id === cid)!;
    vid = c.visitId;
    expect(c).toMatchObject({
      occurredOn: null,
      occurredTime: null,
      status: "draft",
    });
    expect(loaded.visits.find((x) => x.id === vid)).toMatchObject({
      origin: "direct",
      startsAt: null,
      performedOn: null,
      status: "draft",
    });
    const draftVisit = loaded.visits.find((x) => x.id === vid)!;
    await execute({
      type: "visit.correct",
      id: vid,
      revision: draftVisit.revision,
      baseCents: 0,
      address: "Endereço ajustado antes de concluir",
      performedOn: null,
    });
    const save = {
      type: "consultation.save",
      id: cid,
      revision: 0,
      notes: "Registro de teste",
      vitals: { weight: "10" },
      occurredOn: null,
      occurredTime: null,
    };
    await execute(save);
    await expect(
      execute({ ...save, revision: 1, complete: true }),
    ).rejects.toThrow("data");
    await expect(
      execute({ ...save, revision: 1, occurredOn: "9999-01-01" }),
    ).rejects.toThrow("futuro");
    await expect(
      execute({ ...save, revision: 1, occurredTime: "10:00" }),
    ).rejects.toThrow("data");
    loaded = await data();
    expect(loaded.consultations.find((x) => x.id === cid)?.revision).toBe(1);
    expect(
      buildFinance(loaded, { start: "2026-08-01", end: "2026-10-31" }).visits,
    ).toHaveLength(0);
    await execute({
      ...save,
      revision: 1,
      occurredOn: "2026-09-12",
      complete: true,
    });
    loaded = await data();
    expect(loaded.visits.find((x) => x.id === vid)).toMatchObject({
      startsAt: null,
      performedOn: "2026-09-12",
      status: "completed",
    });
  });
  it("corrige consulta concluída com motivo, antes/depois e proteção contra sobrescrita", async () => {
    const key = randomUUID(),
      cmd = {
        type: "consultation.save",
        id: cid,
        revision: 2,
        notes: "Registro corrigido",
        vitals: { weight: "10.8" },
        occurredOn: "2026-09-10",
        occurredTime: "09:45",
        reason,
      };
    await expect(execute({ ...cmd, reason: undefined })).rejects.toThrow(
      "motivo",
    );
    const [first, again] = await Promise.all([
      execute(cmd, key),
      execute(cmd, key),
    ]);
    expect(first).toEqual(again);
    await expect(execute({ ...cmd, notes: "Versão antiga" })).rejects.toThrow(
      "outra aba",
    );
    const loaded = await data(),
      c = loaded.consultations.find((x) => x.id === cid)!;
    expect(c).toMatchObject({
      status: "completed",
      notes: cmd.notes,
      occurredOn: cmd.occurredOn,
      occurredTime: cmd.occurredTime,
      correctedBy: actor.name,
    });
    expect(c.correctedAt).toBeTruthy();
    await execute({
      type: "consultation.save",
      id: cid,
      revision: c.revision,
      notes: c.notes,
      vitals: c.vitals,
      reason,
    });
    expect(
      (await data()).consultations.find((x) => x.id === cid)?.occurredOn,
    ).toBe(cmd.occurredOn);
    expect(loaded.timeline.filter((x) => x.entityId === cid)).toHaveLength(1);
    expect(
      dateKey(loaded.timeline.find((x) => x.entityId === cid)!.occurredAt),
    ).toBe(cmd.occurredOn);
    const logs = (
      await admin.query(
        "SELECT * FROM change_log WHERE request_id=$1 AND entity_type='consultations'",
        [key],
      )
    ).rows;
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      reason,
      actor: actor.email,
      before_data: { notes: "Registro de teste", vitals: { weight: "10" } },
      after_data: { notes: cmd.notes, vitals: { weight: "10.8" } },
    });
    await expect(
      act(() => readAudit(new URLSearchParams()), {
        ...actor,
        role: "veterinarian",
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("corrige aplicações com preço histórico, cancela sem apagar e recalcula o financeiro", async () => {
    appId = (
      await execute({
        type: "application.create",
        consultationId: cid,
        productId: product,
        quantityMilli: 2000,
        batch: "L1",
        route: "Teste",
        reason,
      })
    ).id;
    await execute({
      type: "product.update",
      id: product,
      data: {
        name: "Produto renomeado",
        unit: "mL",
        costCents: 900,
        saleCents: 3000,
      },
    });
    await execute({
      type: "application.correct",
      id: appId,
      revision: 0,
      reason,
      productId: product,
      quantityMilli: 3000,
      unitSaleCents: 1200,
      batch: "L2",
      route: "Teste corrigido",
    });
    let loaded = await data();
    expect(
      dateKey(loaded.timeline.find((x) => x.entityId === appId)!.occurredAt),
    ).toBe("2026-09-10");
    expect(loaded.applications.find((x) => x.id === appId)).toMatchObject({
      unitCostCents: 200,
      unitSaleCents: 1200,
      totalCents: 3600,
      productName: "Produto de teste",
    });
    let report = buildFinance(loaded, {
      start: "2026-09-01",
      end: "2026-09-30",
    });
    expect(report.applicationCostsCents).toBe(600);
    expect(report.billedCents).toBe(3600);
    await expect(
      execute({ type: "application.void", id: appId, revision: 0, reason }),
    ).rejects.toThrow("outra aba");
    await execute({ type: "application.void", id: appId, revision: 1, reason });
    loaded = await data();
    report = buildFinance(loaded, { start: "2026-09-01", end: "2026-09-30" });
    expect(report.applicationCostsCents).toBe(0);
    expect(report.billedCents).toBe(0);
    expect(loaded.applications.find((x) => x.id === appId)?.status).toBe(
      "voided",
    );
  });
  it("preserva recebimentos corrigidos, usa a data real e mostra saldo recebido a maior", async () => {
    let v = (await data()).visits.find((x) => x.id === vid)!;
    await expect(
      execute({
        type: "visit.correct",
        id: vid,
        revision: v.revision,
        baseCents: 20000,
        address: v.address,
        performedOn: v.performedOn,
      }),
    ).rejects.toThrow("motivo");
    await execute({
      type: "visit.correct",
      id: vid,
      revision: v.revision,
      reason,
      baseCents: 20000,
      address: v.address,
      performedOn: v.performedOn,
    });
    const payment = (
      await execute({
        type: "payment.create",
        visitId: vid,
        amountCents: 20000,
        method: "Pix",
        paidOn: "2026-09-10",
      })
    ).id;
    v = (await data()).visits.find((x) => x.id === vid)!;
    await execute({
      type: "visit.correct",
      id: vid,
      revision: v.revision,
      reason,
      baseCents: 15000,
      address: v.address,
      performedOn: v.performedOn,
    });
    let loaded = await data(),
      report = buildFinance(loaded, { start: "2026-09-01", end: "2026-09-30" });
    expect(report.creditCents).toBe(5000);
    expect(report.receivedCents).toBe(20000);
    expect(financeCsv(report, "TEST")).toContain("Recebido a maior");
    const cmd = {
      type: "payment.correct",
      id: payment,
      reason,
      amountCents: 15000,
      method: "Dinheiro",
      paidOn: "2026-09-11",
    };
    const results = await Promise.allSettled([execute(cmd), execute(cmd)]);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    loaded = await data();
    expect(loaded.payments.find((x) => x.id === payment)?.status).toBe(
      "voided",
    );
    const replacement = loaded.payments.find((x) => x.replacesId === payment)!;
    expect(replacement.paidOn).toBe("2026-09-11");
    report = buildFinance(loaded, { start: "2026-09-01", end: "2026-09-30" });
    expect(report.receivedCents).toBe(15000);
    expect(report.creditCents).toBe(0);
    await execute({ type: "payment.void", id: replacement.id, reason });
    expect((await data()).visits.find((x) => x.id === vid)?.receivedCents).toBe(
      0,
    );
  });
  it("mantém o horário agendado independente das datas clínica e financeira", async () => {
    const visit = (
      await execute({
        type: "visit.create",
        tutorId: tutor,
        patientIds: [patient],
        date: "2026-09-15",
        time: "10:00",
        duration: 60,
        address: "Rua teste",
        baseCents: 5000,
        reason: "Consulta",
      })
    ).id;
    const c = (
      await execute({
        type: "consultation.start",
        visitId: visit,
        patientId: patient,
      })
    ).id;
    expect((await data()).consultations.find((x) => x.id === c)).toMatchObject({
      occurredOn: "2026-09-15",
      occurredTime: "10:00",
    });
    await execute({
      type: "consultation.save",
      id: c,
      revision: 0,
      notes: "Registro",
      vitals: {},
      occurredOn: "2026-09-14",
      occurredTime: null,
      complete: true,
    });
    const v = (await data()).visits.find((x) => x.id === visit)!;
    await execute({
      type: "visit.correct",
      id: v.id,
      revision: v.revision,
      reason,
      baseCents: v.baseCents,
      address: v.address,
      performedOn: "2026-09-14",
    });
    const saved = (await data()).visits.find((x) => x.id === visit)!;
    expect(dateKey(saved.startsAt)).toBe("2026-09-15");
    expect(saved.performedOn).toBe("2026-09-14");
  });
  it("versiona receitas, congela PDFs emitidos e impede dados binários no bootstrap/auditoria", async () => {
    const rx = (
      await execute({
        type: "prescription.create",
        consultationId: cid,
        items: rxItems,
        instructions: "Original",
      })
    ).id;
    const bytes = await act(() =>
      forOrg((db) => documentPdf(db, "prescription", rx)),
    );
    await expect(
      act(() =>
        forOrg((db) =>
          db.query(
            "UPDATE prescriptions SET instructions='Adulterado' WHERE id=$1",
            [rx],
          ),
        ),
      ),
    ).rejects.toThrow("immutable");
    const replacement = (
      await execute({
        type: "prescription.replace",
        id: rx,
        reason,
        items: rxItems,
        instructions: "Corrigida",
      })
    ).id;
    await expect(
      execute({
        type: "prescription.replace",
        id: rx,
        reason,
        items: rxItems,
        instructions: "Outra",
      }),
    ).rejects.toThrow("substituída");
    expect(
      await act(() => forOrg((db) => documentPdf(db, "prescription", rx))),
    ).toEqual(bytes);
    const loaded = await data();
    expect(loaded.prescriptions.find((x) => x.id === rx)?.recordStatus).toBe(
      "replaced",
    );
    expect(
      loaded.prescriptions.find((x) => x.id === replacement),
    ).toMatchObject({
      replacesId: rx,
      instructions: "Corrigida",
      prescriberId: actor.userId,
      signedAt: null,
    });
    expect(JSON.stringify(loaded)).not.toContain("issuedPdf");
    const logs = (
      await admin.query(
        "SELECT after_data FROM change_log WHERE organization_id=$1",
        [org],
      )
    ).rows;
    expect(JSON.stringify(logs)).not.toContain("issued_pdf");
    await execute({ type: "prescription.void", id: replacement, reason });
    expect(
      (await data()).prescriptions.find((x) => x.id === replacement)
        ?.recordStatus,
    ).toBe("voided");
  });
  it("versiona pedidos e resultados, preservando a ligação e os anexos originais", async () => {
    const order = (
      await execute({
        type: "exam.order",
        patientId: patient,
        consultationId: cid,
        name: "Exame fictício",
        mode: "Coleta pela veterinária",
        partner: "Lab teste",
        notes: "Original",
        date: "2026-09-10",
      })
    ).id;
    const bytes = await act(() =>
      forOrg((db) => documentPdf(db, "exam", order)),
    );
    const replacement = (
      await execute({
        type: "exam.replace",
        id: order,
        reason,
        name: "Exame corrigido",
        mode: "Encaminhamento a outro profissional",
        partner: "Lab teste",
        notes: "Corrigido",
        date: dateKey(),
      })
    ).id;
    expect(
      await act(() => forOrg((db) => documentPdf(db, "exam", order))),
    ).toEqual(bytes);
    const uploadResult = async (replacesId?: string) => {
      const form = new FormData();
      form.set(
        "file",
        new File([new Uint8Array(bytes)], "resultado-ficticio.pdf", {
          type: "application/pdf",
        }),
      );
      form.set("requestIdempotency", randomUUID());
      form.set(
        "data",
        JSON.stringify({
          patientId: patient,
          consultationId: cid,
          requestId: order,
          name: "Resultado de teste",
          notes: replacesId ? "Corrigido" : "Original",
          date: "2026-09-11",
          ...(replacesId ? { replacesId, reason } : {}),
        }),
      );
      const res = await act(() =>
        upload(
          new Request("http://localhost/api/exams/upload", {
            method: "POST",
            body: form,
          }),
        ),
      );
      expect(res.status).toBe(200);
      return (await res.json()) as { id: string };
    };
    const result = await uploadResult(),
      next = await uploadResult(result.id);
    const loaded = await data();
    expect(loaded.exams.find((x) => x.id === order)).toMatchObject({
      recordStatus: "replaced",
      occurredOn: "2026-09-10",
    });
    expect(loaded.exams.find((x) => x.id === replacement)?.replacesId).toBe(
      order,
    );
    expect(loaded.exams.find((x) => x.id === result.id)?.recordStatus).toBe(
      "replaced",
    );
    expect(loaded.exams.find((x) => x.id === next.id)).toMatchObject({
      replacesId: result.id,
      requestId: order,
    });
    const attachments = (
      await admin.query(
        "SELECT data FROM attachments WHERE organization_id=$1",
        [org],
      )
    ).rows;
    expect(attachments).toHaveLength(2);
    expect(attachments[0].data).toEqual(bytes);
  });
  it("nega correções clínicas ao assistente, receitas ao não veterinário e acesso entre clínicas", async () => {
    const request = (command: unknown) =>
      new Request("http://localhost/api/commands", {
        method: "POST",
        body: JSON.stringify({ id: randomUUID(), command }),
      });
    const blocked = await act(
      () =>
        commandRoute(
          request({ type: "application.void", id: appId, revision: 2, reason }),
        ),
      { ...actor, role: "assistant", isVeterinarian: false },
    );
    expect(blocked.status).toBe(403);
    await expect(
      act(
        () =>
          runCommand(
            {
              type: "prescription.create",
              consultationId: cid,
              items: rxItems,
              instructions: "",
            },
            randomUUID(),
          ),
        { ...actor, isVeterinarian: false },
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      act(
        () =>
          runCommand(
            { type: "consultation.create", patientId: patient },
            randomUUID(),
          ),
        { ...actor, orgId: other },
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      act(
        () =>
          runCommand(
            { type: "application.void", id: appId, revision: 2, reason },
            randomUUID(),
          ),
        { ...actor, orgId: other },
      ),
    ).rejects.toMatchObject({ status: 404 });
    const loaded = await act(() => loadData(), { ...actor, orgId: other });
    expect(loaded.consultations).toHaveLength(0);
  });
});
