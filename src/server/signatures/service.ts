import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import { requestIdentity, getOrgId } from "../context";
import { AppError, forOrg } from "../db";
import { readSettings } from "../settings";
import { createPrescriptionPdf } from "../prescription-pdf";
import { checkCertificate, completePdf, preparePdf, sha256 } from "./crypto";
const base64 = z
  .string()
  .min(4)
  .max(32000)
  .regex(/^[A-Za-z0-9+/]+={0,2}$/);
export const prepareSchema = z
  .object({ certificate: base64, chain: z.array(base64).max(8) })
  .strict();
export const finishSchema = z
  .object({
    attemptId: z.uuid(),
    signature: z
      .string()
      .max(1024)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  })
  .strict();
async function source(db: PoolClient, id: string) {
  const rx = (
    await db.query(
      `SELECT r.*,p.name AS patient,p.species,p.breed,p.sex,
    to_char(p.birth_date,'YYYY-MM-DD') AS birth_date_text,c.vitals->>'weight' AS weight,
    t.name AS tutor,t.phone,t.address,t.document
    FROM prescriptions r JOIN consultations c ON c.id=r.consultation_id
    JOIN patients p ON p.id=c.patient_id JOIN tutors t ON t.id=p.tutor_id WHERE r.id=$1 FOR SHARE OF r,c,p,t`,
      [id],
    )
  ).rows[0];
  if (!rx) throw new AppError("Receita não encontrada.", 404);
  await db.query(
    "SELECT organization_id FROM practice_settings WHERE organization_id=$1 FOR SHARE",
    [getOrgId()],
  );
  const brand = await readSettings(db);
  return {
    rx,
    brand,
    hash: sha256(Buffer.from(JSON.stringify({ rx, brand }))),
  };
}
export async function preparePrescription(id: string, input: unknown) {
  const body = prepareSchema.parse(input);
  const certificate = Buffer.from(body.certificate, "base64"),
    chain = body.chain.map((c) => Buffer.from(c, "base64"));
  const actor = requestIdentity.getStore()!;
  return forOrg(async (db) => {
    await db.query("SELECT id FROM prescriptions WHERE id=$1 FOR UPDATE", [id]);
    const data = await source(db, id);
    const info = await checkCertificate(
      certificate,
      chain,
      data.brand.veterinarianCpf,
    );
    const pdf = await createPrescriptionPdf(
      {
        ...data.rx,
        createdAt: data.rx.created_at.toISOString(),
        birthDate: data.rx.birth_date_text || null,
      },
      data.brand,
      true,
    );
    const prepared = await preparePdf(pdf, certificate, chain, info.size);
    if (prepared.pdf.length > 4 * 1024 * 1024)
      throw new AppError("PDF acima do limite de 4 MB.");
    const attempt = randomUUID();
    const result = await db.query(
      `INSERT INTO prescription_signatures(organization_id,prescription_id,attempt_id,actor_id,prepared_pdf,signed_attributes,certificate,certificate_chain,signer_name,fingerprint,expected_cpf,source_hash)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT(prescription_id) DO UPDATE SET attempt_id=EXCLUDED.attempt_id,actor_id=EXCLUDED.actor_id,prepared_pdf=EXCLUDED.prepared_pdf,signed_attributes=EXCLUDED.signed_attributes,certificate=EXCLUDED.certificate,certificate_chain=EXCLUDED.certificate_chain,signer_name=EXCLUDED.signer_name,fingerprint=EXCLUDED.fingerprint,expected_cpf=EXCLUDED.expected_cpf,source_hash=EXCLUDED.source_hash,expires_at=now()+interval '15 minutes'
      WHERE prescription_signatures.signed_at IS NULL RETURNING attempt_id`,
      [
        getOrgId(),
        id,
        attempt,
        actor.userId,
        prepared.pdf,
        prepared.attributes,
        certificate,
        JSON.stringify(body.chain),
        info.name,
        info.fingerprint,
        data.brand.veterinarianCpf,
        data.hash,
      ],
    );
    if (!result.rowCount)
      throw new AppError(
        "Esta receita já foi assinada. Emita outra receita para fazer alterações.",
        409,
      );
    return {
      attemptId: attempt,
      attributes: prepared.attributes.toString("base64"),
      signerName: info.name,
      pdf: prepared.pdf.toString("base64"),
    };
  });
}
export async function finishPrescription(id: string, input: unknown) {
  const body = finishSchema.parse(input),
    actor = requestIdentity.getStore()!;
  return forOrg(async (db) => {
    await db.query("SELECT id FROM prescriptions WHERE id=$1 FOR UPDATE", [id]);
    const row = (
      await db.query(
        "SELECT * FROM prescription_signatures WHERE prescription_id=$1 FOR UPDATE",
        [id],
      )
    ).rows[0];
    if (
      !row ||
      row.attempt_id !== body.attemptId ||
      row.actor_id !== actor.userId
    )
      throw new AppError(
        "Solicitação de assinatura não encontrada. Reabra a receita.",
        404,
      );
    if (row.signed_at)
      return { signedAt: row.signed_at, pdfSha256: row.pdf_sha256 };
    if (row.expires_at < new Date())
      throw new AppError(
        "A solicitação expirou. Prepare a assinatura novamente.",
        409,
      );
    const data = await source(db, id);
    if (data.hash !== row.source_hash)
      throw new AppError(
        "Os dados da receita foram alterados. Reabra e revise o documento antes de assinar.",
        409,
      );
    await checkCertificate(
      row.certificate,
      row.certificate_chain.map((c: string) => Buffer.from(c, "base64")),
      row.expected_cpf,
    );
    const final = await completePdf(
      row.prepared_pdf,
      row.signed_attributes,
      row.certificate,
      Buffer.from(body.signature, "base64"),
    );
    const hash = sha256(final);
    const saved = (
      await db.query(
        "UPDATE prescription_signatures SET signed_pdf=$2,pdf_sha256=$3,signed_at=now(),prepared_pdf=NULL,signed_attributes=NULL WHERE prescription_id=$1 RETURNING signed_at",
        [id, final, hash],
      )
    ).rows[0];
    await db.query(
      "INSERT INTO audit_log(organization_id,action,entity_id) VALUES($1,'prescription.signed',$2)",
      [getOrgId(), id],
    );
    return { signedAt: saved.signed_at, pdfSha256: hash };
  });
}
