import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { AppError } from "./db";
import { getOrgId, requestIdentity } from "./context";
export async function row(db: PoolClient, table: string, id: string) {
  const r = await db.query(`SELECT * FROM ${table} WHERE id=$1`, [id]);
  if (!r.rows[0]) throw new AppError("Registro não encontrado.", 404);
  return r.rows[0];
}
export async function event(
  db: PoolClient,
  patientId: string,
  consultationId: string | null,
  type: string,
  entityId: string | null,
  title: string,
  text = "",
  occurredAt?: string,
) {
  await db.query(
    "INSERT INTO timeline(id,organization_id,patient_id,consultation_id,type,entity_id,title,text,occurred_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9::timestamptz,(SELECT (occurred_on+COALESCE(occurred_time,'12:00'::time)) AT TIME ZONE 'America/Sao_Paulo' FROM consultations WHERE id=$4 AND $5 IN ('consultation','application')),now()))",
    [
      randomUUID(),
      getOrgId(),
      patientId,
      consultationId,
      type,
      entityId,
      title,
      text,
      occurredAt || null,
    ],
  );
}
export async function consultation(db: PoolClient, id: string) {
  let c = await row(db, "consultations", id);
  await db.query("SELECT id FROM visits WHERE id=$1 FOR UPDATE", [c.visit_id]);
  c = (
    await db.query(
      "SELECT c.*,to_char(occurred_on,'YYYY-MM-DD') AS occurred_on FROM consultations c WHERE id=$1",
      [id],
    )
  ).rows[0];
  const v = await row(db, "visits", c.visit_id);
  if (v.status === "cancelled")
    throw new AppError("Esta visita foi cancelada.");
  return c;
}
export async function checkPatientConsultation(
  db: PoolClient,
  patientId: string,
  id: string | null,
) {
  await row(db, "patients", patientId);
  if (id) {
    const c = await row(db, "consultations", id);
    if (c.patient_id !== patientId)
      throw new AppError("A consulta não pertence a este paciente.");
  }
}

export async function markCorrection(db: PoolClient, consultationId: string) {
  const actor = requestIdentity.getStore();
  await db.query(
    "UPDATE consultations SET corrected_at=now(),corrected_by=$2 WHERE id=$1 AND status='completed'",
    [consultationId, actor?.name || actor?.email || "Sistema"],
  );
}
export function checkRevision(actual: number, expected: number) {
  if (actual !== expected)
    throw new AppError(
      "Este registro mudou em outra aba. Recarregue antes de salvar para evitar sobrescrever dados.",
      409,
    );
}
