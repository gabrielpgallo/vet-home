import { pool, AppError } from "./db";
import { requestIdentity } from "./context";
import type { Identity } from "@/lib/permissions";

export const SESSION_ABSOLUTE_SECONDS = 12 * 60 * 60;
export const SESSION_IDLE_SECONDS = 2 * 60 * 60;
export const SESSION_FRESH_SECONDS = 15 * 60;

export async function securityEvent(
  action: string,
  userId?: string,
  orgId?: string,
) {
  await pool.query(
    "INSERT INTO security_events(action,user_id,organization_id) VALUES($1,$2,$3)",
    [action, userId || null, orgId || null],
  );
}

// The DB clock and a conditional update make concurrent expiration fail closed.
export async function validateSession(id: string, userId: string) {
  const result = await pool.query(
    `UPDATE auth_session SET last_seen_at=now()
     WHERE id=$1 AND "userId"=$2 AND "expiresAt">now()
       AND "createdAt">now()-make_interval(secs => CASE WHEN shared_device THEN 14400 ELSE $3 END)
       AND last_seen_at>now()-make_interval(secs => CASE WHEN shared_device THEN 1800 ELSE $4 END)
     RETURNING "createdAt", "createdAt">now()-make_interval(secs => $5) AS fresh`,
    [
      id,
      userId,
      SESSION_ABSOLUTE_SECONDS,
      SESSION_IDLE_SECONDS,
      SESSION_FRESH_SECONDS,
    ],
  );
  if (!result.rowCount) {
    await pool.query(
      `WITH expired AS (DELETE FROM auth_session WHERE id=$1 AND "userId"=$2 RETURNING "userId")
       INSERT INTO security_events(action,user_id) SELECT 'session.expired',"userId" FROM expired`,
      [id, userId],
    );
    throw new AppError(
      "Sua sessão expirou. Entre novamente; os dados no formulário foram preservados.",
      401,
    );
  }
  return {
    createdAt: result.rows[0].createdAt as Date,
    fresh: result.rows[0].fresh as boolean,
  };
}

export function requireRecentIdentity(
  actor: Identity = requestIdentity.getStore()!,
) {
  if (actor?.local) return;
  if (!actor?.sessionFresh)
    throw new AppError(
      "Confirme sua conta Google novamente antes desta ação. O formulário foi preservado.",
      428,
    );
}

export function checkExpectedIdentity(req: Request, actor: Identity) {
  if (
    (req.headers.has("x-vet-user") &&
      req.headers.get("x-vet-user") !== actor.userId) ||
    (req.headers.has("x-vet-clinic") &&
      req.headers.get("x-vet-clinic") !== actor.orgId)
  )
    throw new AppError(
      "A conta ou clínica mudou em outra aba. Recarregue antes de salvar.",
      409,
    );
}
