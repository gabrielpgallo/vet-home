import type { PoolClient } from "pg";
import { AppError } from "./db";
import { readSettings } from "./settings";
import { createPrescriptionPdf } from "./prescription-pdf";
import { createExamRequestPdf } from "./exam-pdf";
// Called inside a tenant-scoped transaction. The row lock serializes download/replacement.
export async function documentPdf(
  db: PoolClient,
  kind: "prescription" | "exam",
  id: string,
): Promise<Buffer> {
  const table = kind === "prescription" ? "prescriptions" : "exams";
  const record = (
    await db.query(`SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`, [id])
  ).rows[0];
  if (!record || (kind === "exam" && record.kind !== "order"))
    throw new AppError("Documento não encontrado.", 404);
  if (kind === "prescription") {
    const signed = (
      await db.query(
        "SELECT signed_pdf FROM prescription_signatures WHERE prescription_id=$1 AND signed_at IS NOT NULL",
        [id],
      )
    ).rows[0];
    if (signed) return signed.signed_pdf;
  }
  if (record.issued_pdf) return record.issued_pdf;
  const source =
    kind === "prescription"
      ? `SELECT r.*,p.name AS patient,p.species,p.breed,p.sex,to_char(p.birth_date,'YYYY-MM-DD') AS birth_date_text,c.vitals->>'weight' AS weight,t.name AS tutor,t.phone,t.address,t.document FROM prescriptions r JOIN consultations c ON c.id=r.consultation_id JOIN patients p ON p.id=c.patient_id JOIN tutors t ON t.id=p.tutor_id WHERE r.id=$1`
      : `SELECT e.*,p.name AS patient,p.species,p.breed,p.sex,to_char(p.birth_date,'YYYY-MM-DD') AS birth_date_text,c.vitals->>'weight' AS weight,t.name AS tutor,t.phone,t.address,t.document,to_char(e.occurred_on,'YYYY-MM-DD') AS request_date,to_char(c.occurred_on,'YYYY-MM-DD') AS consultation_date FROM exams e JOIN patients p ON p.id=e.patient_id JOIN tutors t ON t.id=p.tutor_id LEFT JOIN consultations c ON c.id=e.consultation_id WHERE e.id=$1`;
  const data = (await db.query(source, [id])).rows[0],
    brand = await readSettings(db);
  const pdf =
    kind === "prescription"
      ? await createPrescriptionPdf(
          {
            ...data,
            createdAt: data.created_at.toISOString(),
            birthDate: data.birth_date_text || null,
          },
          brand,
        )
      : await createExamRequestPdf(
          {
            ...data,
            occurredOn: data.request_date,
            consultationDate: data.consultation_date,
            birthDate: data.birth_date_text || null,
          },
          brand,
        );
  await db.query(`UPDATE ${table} SET issued_pdf=$2 WHERE id=$1`, [id, pdf]);
  return pdf;
}
