import "./env";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { pool } from "../src/server/db";
import { ORG_ID } from "../src/lib/domain";
const email = z
  .string()
  .email()
  .parse(process.env.IAM_INITIAL_ADMIN_EMAIL)
  .toLowerCase();
const db = await pool.connect();
try {
  await db.query("BEGIN");
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    "iam:" + ORG_ID,
  ]);
  const existing = await db.query(
    "SELECT 1 FROM iam_memberships WHERE organization_id=$1 UNION ALL SELECT 1 FROM iam_invitations WHERE organization_id=$1 AND role='admin' AND (status='accepted' OR (status='pending' AND expires_at>now()))",
    [ORG_ID],
  );
  if (existing.rowCount)
    console.log("IAM já inicializado; nenhum acesso alterado.");
  else {
    await db.query(
      "UPDATE iam_invitations SET status='revoked' WHERE organization_id=$1 AND email=$2 AND status='pending'",
      [ORG_ID, email],
    );
    await db.query(
      "INSERT INTO iam_invitations(id,organization_id,email,role,created_by,expires_at) VALUES($1,$2,$3,'admin','bootstrap',now()+interval '30 days')",
      [randomUUID(), ORG_ID, email],
    );
    console.log(
      "Convite inicial da administradora criado. Nenhum e-mail foi enviado.",
    );
  }
  await db.query("COMMIT");
} catch (e) {
  await db.query("ROLLBACK");
  throw e;
} finally {
  db.release();
  await pool.end();
}
