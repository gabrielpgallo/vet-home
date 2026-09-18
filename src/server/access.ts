import { headers, cookies } from "next/headers";
import { AppError, pool } from "./db";
import { auth, googleReady } from "./auth";
import { can, type Permission, type Identity } from "@/lib/permissions";
import { ORG_ID } from "@/lib/domain";
import { requestIdentity } from "./context";
import { apiError } from "./http";
export async function identity(): Promise<Identity> {
  const h = await headers(),
    host = h.get("host") || "";
  if (process.env.AUTH_MODE === "local") {
    if (
      process.env.VERCEL ||
      process.env.APP_LOCAL_MODE !== "true" ||
      !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)
    )
      throw new AppError(
        "O modo de desenvolvimento só permite acesso local.",
        403,
      );
    return {
      userId: "local-developer",
      email: "",
      name: "Desenvolvimento local",
      orgId: ORG_ID,
      role: "admin",
      local: true,
    };
  }
  if (process.env.AUTH_MODE !== "google" || !googleReady())
    throw new AppError("O login Google ainda precisa ser configurado.", 401);
  const session = await auth.api.getSession({ headers: h });
  if (!session || !session.user.emailVerified)
    throw new AppError("Entre com sua conta Google para continuar.", 401);
  const selected = (await cookies()).get("vet-clinic")?.value;
  const memberships = await pool.query(
    "SELECT organization_id,role FROM iam_memberships WHERE user_id=$1 AND status='active' ORDER BY created_at",
    [session.user.id],
  );
  const member = selected
    ? memberships.rows.find((m) => m.organization_id === selected)
    : memberships.rows[0];
  if (!member)
    throw new AppError(
      "Sua conta não tem acesso ativo a esta clínica. Consulte seus convites.",
      403,
    );
  return {
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
    orgId: member.organization_id,
    role: member.role,
    local: false,
    sessionId: session.session.id,
  };
}
export async function checkOrigin(req: Request) {
  const host = req.headers.get("host") || "";
  const expected =
    process.env.AUTH_MODE === "local"
      ? "http://" + host
      : process.env.BETTER_AUTH_URL;
  if (!expected || req.headers.get("origin") !== new URL(expected).origin)
    throw new AppError("Origem da requisição não autorizada.", 403);
}
export function assertPermission(permission: Permission) {
  const actor = requestIdentity.getStore();
  if (!actor || !can(actor.role, permission))
    throw new AppError("Seu perfil não tem permissão para esta ação.", 403);
}
export function withAccess<A extends unknown[]>(
  permission: Permission | null,
  handler: (req: Request, ...args: A) => Promise<Response>,
) {
  return async (req: Request, ...args: A) => {
    try {
      if (!["GET", "HEAD"].includes(req.method)) await checkOrigin(req);
      const actor = await identity();
      if (permission && !can(actor.role, permission))
        throw new AppError("Seu perfil não tem permissão para esta ação.", 403);
      return await requestIdentity.run(actor, () => handler(req, ...args));
    } catch (e) {
      return apiError(e);
    }
  };
}
