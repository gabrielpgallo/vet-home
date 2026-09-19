import "../scripts/env";
import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { writeFile } from "node:fs/promises";
import forge from "node-forge";
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
  local: false,
};
const act = <T>(fn: () => Promise<T>) => requestIdentity.run(actor, fn);
let cert: ReturnType<typeof signingCertificate>;
beforeAll(async () => {
  cert = signingCertificate();
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
    "INSERT INTO prescriptions(id,organization_id,consultation_id,items) VALUES($1,$2,$3,$4)",
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
    ],
  );
});
afterAll(async () => {
  for (const table of [
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
  const modern = signingCertificate({ serialCpf: "11144477735", sanCpf: null });
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
it.each([
  forge.asn1.Type.OCTETSTRING,
  forge.asn1.Type.PRINTABLESTRING,
  forge.asn1.Type.UTF8,
])("reads legacy CPF in ASN.1 type %s", (type) => {
  expect(certificateCpf(signingCertificate({ sanType: type }).leaf)).toBe(
    "11144477735",
  );
});
it("does not infer CPF from the certificate serial and distinguishes missing CPF from mismatch", async () => {
  const missing = signingCertificate({ sanCpf: null });
  expect(certificateCpf(missing.leaf)).toBe("");
  await expect(
    checkCertificate(missing.leaf, [missing.root], "11144477735"),
  ).rejects.toThrow("Não foi possível identificar");
});
it("rejects contradictory CPF fields and company certificates", () => {
  expect(() =>
    certificateCpf(signingCertificate({ serialCpf: "12345678901" }).leaf),
  ).toThrow("conflitantes");
  expect(
    certificateCpf(signingCertificate({ serialCpf: "12345678000199" }).leaf),
  ).toBe("");
  expect(
    certificateCpf(
      signingCertificate({ serialCpf: "11144477735", corporate: true }).leaf,
    ),
  ).toBe("");
});
