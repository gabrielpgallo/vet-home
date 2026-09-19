import { z } from "zod";
import { auditEntities, type AuditEntry } from "@/lib/audit";
import { assertPermission } from "./access";
import { AppError, forOrg } from "./db";
const id = z
  .string()
  .regex(/^[1-9]\d{0,18}$/)
  .refine((v) => BigInt(v) <= 9223372036854775807n);
const filters = z
  .object({
    id: id.optional(),
    cursor: id.optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    entity: z
      .enum(Object.keys(auditEntities) as [string, ...string[]])
      .optional(),
    operation: z.enum(["INSERT", "UPDATE", "DELETE"]).optional(),
    actor: z.string().trim().max(150).optional(),
  })
  .refine(
    (v) => !v.from || !v.to || v.from <= v.to,
    "O início deve ser anterior ao fim.",
  );
export async function readAudit(params: URLSearchParams) {
  assertPermission("audit.read");
  const f = filters.parse(Object.fromEntries(params));
  return forOrg(async (db) => {
    if (f.id) {
      const row = (
        await db.query<AuditEntry>("SELECT * FROM change_log WHERE id=$1", [
          f.id,
        ])
      ).rows[0];
      if (!row) throw new AppError("Registro não encontrado.", 404);
      return row;
    }
    const values: string[] = [];
    const where: string[] = [];
    const add = (sql: string, value: string) => {
      values.push(value);
      where.push(sql.replace("?", "$" + values.length));
    };
    if (f.cursor) add("id < ?::bigint", f.cursor);
    // Calendar filters consistently use the clinic's current Brazilian timezone.
    if (f.from)
      add(
        "created_at >= (?::date::timestamp AT TIME ZONE 'America/Sao_Paulo')",
        f.from,
      );
    if (f.to)
      add(
        "created_at < ((?::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo')",
        f.to,
      );
    if (f.entity) add("entity_type = ?", f.entity);
    if (f.operation) add("operation = ?", f.operation);
    if (f.actor) add("strpos(lower(actor),lower(?)) > 0", f.actor);
    const result = await db.query<AuditEntry>(
      `
      SELECT id,created_at,actor,entity_type,entity_id,operation,changed_fields,
        COALESCE(after_data->>'name',before_data->>'name',after_data->>'product_name',before_data->>'product_name',
          after_data->>'description',before_data->>'description',after_data->>'company_name',before_data->>'company_name',
          after_data->>'title',before_data->>'title',after_data->>'signer_name',before_data->>'signer_name','') AS label
      FROM change_log ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY id DESC LIMIT 51`,
      values,
    );
    return {
      entries: result.rows.slice(0, 50),
      nextCursor: result.rows.length > 50 ? result.rows[49].id : null,
    };
  });
}
