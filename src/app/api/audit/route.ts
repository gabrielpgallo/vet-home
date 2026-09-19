import { withAccess } from "@/server/access";
import { readAudit } from "@/server/audit";
export const GET = withAccess("audit.read", async (req) =>
  Response.json(await readAudit(new URL(req.url).searchParams), {
    headers: { "Cache-Control": "no-store" },
  }),
);
