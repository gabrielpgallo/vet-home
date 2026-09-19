import { headers } from "next/headers";
import { auth } from "@/server/auth";
import { AppError } from "@/server/db";
import { apiError } from "@/server/http";
import { validateSession } from "@/server/session-security";

export async function GET(req: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user.emailVerified)
      throw new AppError("Entre novamente com sua conta Google.", 401);
    if (session.user.id !== new URL(req.url).searchParams.get("user"))
      throw new AppError(
        "Você selecionou outra conta. Confirme com a conta original antes de voltar ao formulário.",
        409,
      );
    const security = await validateSession(session.session.id, session.user.id);
    if (!security.fresh)
      throw new AppError(
        "A confirmação expirou. Entre novamente com Google.",
        428,
      );
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
