import { headers, cookies } from "next/headers";
import { z } from "zod";
import { auth, googleReady } from "@/server/auth";
import { pool, AppError } from "@/server/db";
import { checkOrigin } from "@/server/access";
import { acceptInvitation } from "@/server/iam";
import { apiError } from "@/server/http";
async function userSession() {
  if (!googleReady()) throw new AppError("Configure o login Google.", 401);
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user.emailVerified)
    throw new AppError("Entre com sua conta Google.", 401);
  return session;
}
export async function GET() {
  try {
    const session = await userSession();
    const memberships = await pool.query(
      "SELECT m.organization_id AS id,o.name,m.role FROM iam_memberships m JOIN organizations o ON o.id=m.organization_id WHERE m.user_id=$1 AND m.status='active'",
      [session.user.id],
    );
    const invitations = await pool.query(
      "SELECT i.id,i.role,o.name FROM iam_invitations i JOIN organizations o ON o.id=i.organization_id WHERE i.email=lower($1) AND i.status='pending' AND i.expires_at>now()",
      [session.user.email],
    );
    return Response.json(
      {
        email: session.user.email,
        memberships: memberships.rows,
        invitations: invitations.rows,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(req: Request) {
  try {
    await checkOrigin(req);
    const session = await userSession();
    const input = z
      .object({
        type: z.enum(["accept", "select"]),
        id: z.string().min(1).max(200),
      })
      .strict()
      .parse(await req.json());
    let orgId = input.id;
    if (input.type === "accept")
      orgId = await acceptInvitation(session.user, input.id);
    const member = await pool.query(
      "SELECT 1 FROM iam_memberships WHERE user_id=$1 AND organization_id=$2 AND status='active'",
      [session.user.id, orgId],
    );
    if (!member.rowCount) throw new AppError("Sem acesso a esta clínica.", 403);
    (await cookies()).set("vet-clinic", orgId, {
      httpOnly: true,
      secure: process.env.BETTER_AUTH_URL?.startsWith("https:") || false,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
