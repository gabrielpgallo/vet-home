import { withAccess } from "@/server/access";
import { requestIdentity } from "@/server/context";
import { pool, AppError } from "@/server/db";
import { z } from "zod";
import {
  SESSION_ABSOLUTE_SECONDS,
  SESSION_IDLE_SECONDS,
} from "@/server/session-security";
export const GET = withAccess(null, async () => {
  const actor = requestIdentity.getStore()!;
  const rows = await pool.query(
    'SELECT id,"createdAt","updatedAt",LEAST("expiresAt","createdAt"+make_interval(secs => CASE WHEN shared_device THEN 14400 ELSE $2 END),last_seen_at+make_interval(secs => CASE WHEN shared_device THEN 1800 ELSE $3 END)) AS "expiresAt","userAgent" FROM auth_session WHERE "userId"=$1 AND "expiresAt">now() AND "createdAt">now()-make_interval(secs => CASE WHEN shared_device THEN 14400 ELSE $2 END) AND last_seen_at>now()-make_interval(secs => CASE WHEN shared_device THEN 1800 ELSE $3 END) ORDER BY "updatedAt" DESC',
    [actor.userId, SESSION_ABSOLUTE_SECONDS, SESSION_IDLE_SECONDS],
  );
  return Response.json(
    rows.rows.map((s) => ({ ...s, current: s.id === actor.sessionId })),
    { headers: { "Cache-Control": "no-store" } },
  );
});
export const POST = withAccess(null, async (req) => {
  const actor = requestIdentity.getStore()!;
  const { id } = z
    .object({ id: z.string().min(1).max(200) })
    .strict()
    .parse(await req.json());
  if (id === actor.sessionId)
    throw new AppError("Use Sair para encerrar esta sessão.");
  await pool.query('DELETE FROM auth_session WHERE id=$1 AND "userId"=$2', [
    id,
    actor.userId,
  ]);
  return Response.json({ ok: true });
});
