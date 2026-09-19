import { withAccess } from "@/server/access";
import { pool } from "@/server/db";
import { requestIdentity } from "@/server/context";
export const GET = withAccess(null, async () => {
  const actor = requestIdentity.getStore()!;
  const result = await pool.query(
    "SELECT id,action,created_at FROM security_events WHERE user_id=$1 AND (organization_id IS NULL OR organization_id=$2) ORDER BY created_at DESC,id DESC LIMIT 30",
    [actor.userId, actor.orgId],
  );
  return Response.json(result.rows, {
    headers: { "Cache-Control": "no-store" },
  });
});
