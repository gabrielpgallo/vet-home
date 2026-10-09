import "../scripts/env";
import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { writeFile } from "node:fs/promises";
import { signingCertificate } from "./helpers/signing-certificate";
const trust = vi.hoisted(() => ({ roots: [] as string[] }));
vi.mock("../src/server/signatures/icp-roots", () => ({
  icpRoots: trust.roots,
}));
import { openLocalCertificate } from "../src/lib/local-signature";
import {
  certificateCpf,
  checkCertificate,
  completePdf,
  preparePdf,
} from "../src/server/signatures/crypto";
import {
  preparePrescription,
  finishPrescription,
} from "../src/server/signatures/service";
import { createPrescriptionPdf } from "../src/server/prescription-pdf";
import {
  saveProfessionalProfile,
  readProfessionalProfile,
} from "../src/server/professional-profile";
import { runCommand } from "../src/server/commands";
import { documentPdf } from "../src/server/issued-documents";
import { defaultSettings } from "../src/lib/settings";
import { requestIdentity } from "../src/server/context";
import { forOrg, pool } from "../src/server/db";
import type { Identity } from "../src/lib/permissions";
const admin = new Pool({ connectionString: process.env.ADMIN_DATABASE_URL });
const org = "sign-test-" + randomUUID(),
  user = randomUUID(),
  rx = randomUUID(),
  tutor = randomUUID(),
  patient = randomUUID(),
  visit = randomUUID(),
  consult = randomUUID();
const actor: Identity = {
  userId: user,
  name: "Test",
  email: "test@example.com",
  orgId: org,
  role: "admin",
  isVeterinarian: true,
  local: false,
};
const act = <T>(fn: () => Promise<T>) => requestIdentity.run(actor, fn);
let cert: Awaited<ReturnType<typeof signingCertificate>>;
beforeAll(async () => {
  cert = await signingCertificate();
  trust.roots.push(cert.root.toString("base64"));
  await admin.query("INSERT INTO organizations(id,name) VALUES($1,'TEST')", [
    org,
  ]);
  await admin.query(
    "INSERT INTO practice_settings(organization_id,company_name,veterinarian_name,crmv,veterinarian_cpf) VALUES($1,'TEST','Veterinaria Ficticia','TEST','11144477735')",
    [org],
  );
  await admin.query(
    "INSERT INTO tutors(id,organization_id,name,address) VALUES($1,$2,'Tutor ficticio','Rua de teste')",
    [tutor, org],
  );
  await admin.query(
    "INSERT INTO patients(id,organization_id,tutor_id,name) VALUES($1,$2,$3,'Paciente teste')",
    [patient, org, tutor],
  );
  await admin.query(
    "INSERT INTO visits(id,organization_id,tutor_id,starts_at,duration_minutes,address) VALUES($1,$2,$3,now(),60,'Rua')",
    [visit, org, tutor],
  );
  await admin.query(
    "INSERT INTO visit_patients(organization_id,visit_id,patient_id) VALUES($1,$2,$3)",
    [org, visit, patient],
  );
  await admin.query(
    "INSERT INTO consultations(id,organization_id,visit_id,patient_id) VALUES($1,$2,$3,$4)",
    [consult, org, visit, patient],
  );
  await admin.query(
    "INSERT INTO prescriptions(id,organization_id,consultation_id,items,prescriber_id,prescriber) VALUES($1,$2,$3,$4,$5,$6)",
    [
      rx,
      org,
      consult,
      JSON.stringify([
        {
          name: "Medicamento ficticio",
          concentration: "Teste",
          route: "Oral",
          quantity: "1",
          dose: "Teste",
          frequency: "Teste",
          duration: "Teste",
          instructions: "Documento de teste sem validade clinica",
        },
      ]),
      user,
      JSON.stringify({
        veterinarianName: "Veterinaria Ficticia",
        veterinarianTitle: "Dra.",
        crmv: "TEST",
        sipeagro: "",
        veterinarianCpf: "11144477735",
      }),
    ],
  );
});
afterAll(async () => {
  for (const table of [
    "professional_profiles",
    "mutations",
    "timeline",
    "prescription_signatures",
    "prescriptions",
    "consultations",
    "visit_patients",
    "visits",
    "patients",
    "tutors",
    "practice_settings",
    "audit_log",
  ])
    await admin.query(`DELETE FROM ${table} WHERE organization_id=$1`, [org]);
  await admin.query("DELETE FROM organizations WHERE id=$1", [org]);
  await admin.end();
  await pool.end();
});
it("opens AES and legacy PFX only locally and rejects a wrong PIN", async () => {
  for (const legacy of [false, true]) {
    const local = await openLocalCertificate(cert.pfx(legacy), "test-pin");
    expect(local.certificate).toBe(cert.leaf.toString("base64"));
    expect(local.chain).toContain(cert.root.toString("base64"));
  }
  await expect(openLocalCertificate(cert.pfx(), "wrong")).rejects.toThrow(
    "PIN",
  );
});
it("rejects foreign CPF, an untrusted chain and tampered signing attributes", async () => {
  await expect(
    checkCertificate(cert.leaf, [cert.root], "12345678901"),
  ).rejects.toThrow("CPF");
  await expect(
    checkCertificate(cert.leaf, [cert.root], "11144477735", []),
  ).rejects.toThrow("Cadeia");
  const local = await openLocalCertificate(cert.pfx(), "test-pin");
  const pdf = await createPrescriptionPdf(
    {
      id: rx,
      createdAt: new Date().toISOString(),
      patient: "TESTE",
      species: "Cão",
      breed: "",
      sex: "",
      birthDate: null,
      tutor: "TESTE",
      address: "Rua",
      phone: "",
      items: [],
      instructions: "TESTE",
    },
    { ...defaultSettings, logo: null },
    true,
  );
  const prepared = await preparePdf(pdf, cert.leaf, [cert.root], 256);
  const signature = Buffer.from(
    await local.sign(prepared.attributes.toString("base64")),
    "base64",
  );
  await expect(
    completePdf(prepared.pdf, Buffer.from("tampered"), cert.leaf, signature),
  ).rejects.toThrow("não corresponde");
  const tampered = Buffer.from(prepared.pdf);
  tampered[10] ^= 1;
  await expect(
    completePdf(tampered, prepared.attributes, cert.leaf, signature),
  ).rejects.toThrow();
});
it("binds attempts to the clinic, actor and current source data; expires old requests", async () => {
  const input = {
    certificate: cert.leaf.toString("base64"),
    chain: [cert.root.toString("base64")],
  };
  const prepared = await act(() => preparePrescription(rx, input));
  const local = await openLocalCertificate(cert.pfx(), "test-pin");
  const finish = {
    attemptId: prepared.attemptId,
    signature: await local.sign(prepared.attributes),
  };
  await expect(
    requestIdentity.run({ ...actor, userId: "other" }, () =>
      finishPrescription(rx, finish),
    ),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    requestIdentity.run({ ...actor, orgId: "other" }, () =>
      finishPrescription(rx, finish),
    ),
  ).rejects.toMatchObject({ status: 404 });
  await admin.query("UPDATE tutors SET name='Changed' WHERE id=$1", [tutor]);
  await expect(act(() => finishPrescription(rx, finish))).rejects.toThrow(
    "alterados",
  );
  await admin.query(
    "UPDATE prescription_signatures SET expires_at=now()-interval '1 second' WHERE prescription_id=$1",
    [rx],
  );
  await expect(act(() => finishPrescription(rx, finish))).rejects.toThrow(
    "expirou",
  );
});
it("stores immutable signed PDF, is idempotent and logs signature metadata without PFX/PIN", async () => {
  const local = await openLocalCertificate(cert.pfx(), "test-pin");
  const prepared = await act(() =>
    preparePrescription(rx, {
      certificate: local.certificate,
      chain: local.chain,
    }),
  );
  const finish = {
    attemptId: prepared.attemptId,
    signature: await local.sign(prepared.attributes),
  };
  const result = await act(() => finishPrescription(rx, finish));
  expect(await act(() => finishPrescription(rx, finish))).toEqual(result);
  const stored = (
    await admin.query(
      "SELECT * FROM prescription_signatures WHERE prescription_id=$1",
      [rx],
    )
  ).rows[0];
  expect(stored.prepared_pdf).toBeNull();
  expect(stored.signed_pdf.toString("latin1")).toContain("ETSI.CAdES.detached");
  await writeFile("/tmp/vet-signature-test.pdf", stored.signed_pdf);
  for (const sql of [
    "DELETE FROM prescription_signatures WHERE prescription_id=$1",
    "UPDATE prescription_signatures SET signed_pdf='bad' WHERE prescription_id=$1",
  ])
    await expect(
      act(() => forOrg((db) => db.query(sql, [rx]))),
    ).rejects.toThrow("immutable");
  const log = (
    await admin.query(
      "SELECT after_data FROM change_log WHERE organization_id=$1 AND entity_type='prescription_signatures' AND after_data->>'signed_at' IS NOT NULL",
      [org],
    )
  ).rows;
  expect(log).toHaveLength(1);
  expect(JSON.stringify(log)).not.toContain("test-pin");
  expect(log[0].after_data).not.toHaveProperty("signed_pdf");
});

it("accepts modern subject serialNumber CPF without a legacy SAN and still enforces matching CPF", async () => {
  const modern = await signingCertificate({
    serialCpf: "11144477735",
    sanCpf: null,
  });
  expect(certificateCpf(modern.leaf)).toBe("11144477735");
  await expect(
    checkCertificate(modern.leaf, [modern.root], "111.444.777-35", [
      modern.root.toString("base64"),
    ]),
  ).resolves.toHaveProperty("fingerprint");
  await expect(
    checkCertificate(modern.leaf, [modern.root], "12345678901", [
      modern.root.toString("base64"),
    ]),
  ).rejects.toThrow("não corresponde");
});
it.each(["octet", "printable", "utf8"] as const)(
  "reads legacy CPF in ASN.1 type %s",
  async (type) => {
    expect(
      certificateCpf((await signingCertificate({ sanType: type })).leaf),
    ).toBe("11144477735");
  },
);
it("does not infer CPF from the certificate serial and distinguishes missing CPF from mismatch", async () => {
  const missing = await signingCertificate({ sanCpf: null });
  expect(certificateCpf(missing.leaf)).toBe("");
  await expect(
    checkCertificate(missing.leaf, [missing.root], "11144477735"),
  ).rejects.toThrow("Não foi possível identificar");
});
it("rejects contradictory CPF fields and company certificates", async () => {
  const conflict = await signingCertificate({ serialCpf: "12345678901" });
  expect(() => certificateCpf(conflict.leaf)).toThrow("conflitantes");
  expect(
    certificateCpf(
      (await signingCertificate({ serialCpf: "12345678000199" })).leaf,
    ),
  ).toBe("");
  expect(
    certificateCpf(
      (await signingCertificate({ serialCpf: "11144477735", corporate: true }))
        .leaf,
    ),
  ).toBe("");
});

it("matches the key regardless of certificate order and rejects multiple keys or a mismatched certificate", async () => {
  const local = await openLocalCertificate(
    await cert.customPfx({ rootFirst: true }),
    "test-pin",
  );
  expect(local.certificate).toBe(cert.leaf.toString("base64"));
  await expect(
    openLocalCertificate(await cert.customPfx({ extraKey: true }), "test-pin"),
  ).rejects.toThrow("única chave privada RSA");
  await expect(
    openLocalCertificate(await cert.customPfx({ mismatch: true }), "test-pin"),
  ).rejects.toThrow("correspondente");
});
it("keeps the RSA key non-extractable, uses no network and rejects expired or tampered PFX", async () => {
  const originalImport = crypto.subtle.importKey.bind(crypto.subtle);
  const privateKeys: CryptoKey[] = [];
  const importSpy = vi
    .spyOn(crypto.subtle, "importKey")
    .mockImplementation(async (...args) => {
      const key = await originalImport(...args);
      if (key.type === "private") privateKeys.push(key);
      return key;
    });
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("No network allowed"));
  try {
    await openLocalCertificate(cert.pfx(), "test-pin");
    expect(privateKeys.length).toBeGreaterThan(0);
    for (const key of privateKeys) {
      expect(key.extractable).toBe(false);
      await expect(crypto.subtle.exportKey("pkcs8", key)).rejects.toThrow();
    }
    const invalid = cert.pfx();
    invalid[invalid.length - 10] ^= 1;
    await expect(openLocalCertificate(invalid, "test-pin")).rejects.toThrow(
      "PIN",
    );
    const expired = await signingCertificate({ expired: true });
    await expect(
      openLocalCertificate(expired.pfx(), "test-pin"),
    ).rejects.toThrow("vencido");
    expect(fetcher).not.toHaveBeenCalled();
  } finally {
    importSpy.mockRestore();
    fetcher.mockRestore();
  }
});

it("rejects prescription creation by non-veterinary admins and assistants", async () => {
  for (const role of ["admin", "assistant"] as const) {
    await expect(
      requestIdentity.run({ ...actor, role, isVeterinarian: false }, () =>
        runCommand(
          {
            type: "prescription.create",
            consultationId: consult,
            items: [
              {
                name: "Test",
                concentration: "Teste",
                route: "Oral",
                quantity: "1",
                dose: "1",
                frequency: "1",
                duration: "1",
                instructions: "",
              },
            ],
            instructions: "",
          },
          randomUUID(),
        ),
      ),
    ).rejects.toMatchObject({ status: 403 });
  }
});
it("binds professional settings and new prescriptions to the current user and freezes the snapshot", async () => {
  const profile = {
    veterinarianName: "Professional One",
    veterinarianTitle: "Dra.",
    crmv: "CRMV-SP 12345",
    sipeagro: "",
    veterinarianCpf: "11144477735",
    revision: 0,
  };
  await act(() => saveProfessionalProfile(profile));
  await expect(
    act(() => saveProfessionalProfile(profile)),
  ).rejects.toMatchObject({ status: 409 });
  const command = {
    type: "prescription.create",
    consultationId: consult,
    items: [
      {
        name: "Test",
        concentration: "Teste",
        route: "Oral",
        quantity: "1",
        dose: "1",
        frequency: "1",
        duration: "1",
        instructions: "",
      },
    ],
    instructions: "",
  };
  const created = await act(() => runCommand(command, randomUUID()));
  await act(() =>
    saveProfessionalProfile({
      ...profile,
      veterinarianName: "Updated Name",
      revision: 1,
    }),
  );
  const row = (
    await admin.query(
      "SELECT prescriber_id,prescriber FROM prescriptions WHERE id=$1",
      [created.id],
    )
  ).rows[0];
  expect(row.prescriber_id).toBe(user);
  expect(row.prescriber.veterinarianName).toBe("Professional One");
  await expect(
    act(() =>
      forOrg((db) =>
        db.query("UPDATE prescriptions SET prescriber_id='other' WHERE id=$1", [
          created.id,
        ]),
      ),
    ),
  ).rejects.toThrow("immutable");
  expect(
    await requestIdentity.run({ ...actor, userId: "other" }, () =>
      forOrg(readProfessionalProfile),
    ),
  ).toBeNull();
  expect(
    await requestIdentity.run({ ...actor, orgId: "other" }, () =>
      forOrg(readProfessionalProfile),
    ),
  ).toBeNull();
  await expect(
    requestIdentity.run({ ...actor, userId: "other" }, () =>
      runCommand(command, randomUUID()),
    ),
  ).rejects.toThrow("Complete seu cadastro");
  await expect(
    requestIdentity.run({ ...actor, isVeterinarian: false }, () =>
      saveProfessionalProfile(profile),
    ),
  ).rejects.toMatchObject({ status: 403 });
  const input = {
    certificate: cert.leaf.toString("base64"),
    chain: [cert.root.toString("base64")],
  };
  await expect(
    requestIdentity.run({ ...actor, userId: "other" }, () =>
      preparePrescription(created.id, input),
    ),
  ).rejects.toMatchObject({ status: 403 });
});
it("does not guess the author of a historical prescription", async () => {
  const legacy = randomUUID();
  await admin.query(
    "INSERT INTO prescriptions(id,organization_id,consultation_id,items) VALUES($1,$2,$3,'[]')",
    [legacy, org, consult],
  );
  await expect(
    act(() =>
      preparePrescription(legacy, {
        certificate: cert.leaf.toString("base64"),
        chain: [cert.root.toString("base64")],
      }),
    ),
  ).rejects.toThrow("anterior ao cadastro de autoria");
});

it("replaces a signed prescription without changing its signed bytes or transferring its signature", async () => {
  const original = await act(() =>
    forOrg((db) => documentPdf(db, "prescription", rx)),
  );
  await expect(
    act(() =>
      forOrg((db) =>
        db.query(
          "UPDATE prescriptions SET instructions='Tampered' WHERE id=$1",
          [rx],
        ),
      ),
    ),
  ).rejects.toThrow("immutable");
  const replacement = await act(() =>
    runCommand(
      {
        type: "prescription.replace",
        id: rx,
        reason: "Corrigir instruções da receita de teste",
        instructions: "Nova versão de teste sem validade clínica",
        items: [
          {
            name: "Item corrigido",
            concentration: "Teste",
            route: "Oral",
            quantity: "1",
            dose: "Teste",
            frequency: "Teste",
            duration: "Teste",
            instructions: "",
          },
        ],
      },
      randomUUID(),
    ),
  );
  expect(
    await act(() => forOrg((db) => documentPdf(db, "prescription", rx))),
  ).toEqual(original);
  const records = (
    await admin.query(
      "SELECT id,record_status,replaces_id FROM prescriptions WHERE id=ANY($1::uuid[])",
      [[rx, replacement.id]],
    )
  ).rows;
  expect(records.find((r) => r.id === rx).record_status).toBe("replaced");
  expect(records.find((r) => r.id === replacement.id)).toMatchObject({
    record_status: "active",
    replaces_id: rx,
  });
  expect(
    (
      await admin.query(
        "SELECT id FROM prescription_signatures WHERE prescription_id=$1",
        [replacement.id],
      )
    ).rows,
  ).toHaveLength(0);
  await expect(
    act(() =>
      preparePrescription(rx, {
        certificate: cert.leaf.toString("base64"),
        chain: [cert.root.toString("base64")],
      }),
    ),
  ).rejects.toThrow("substituída");
  const unsigned = await act(() =>
    forOrg((db) => documentPdf(db, "prescription", replacement.id)),
  );
  expect(unsigned.equals(original)).toBe(false);
  expect(unsigned.toString("latin1")).not.toContain("ETSI.CAdES.detached");
});
