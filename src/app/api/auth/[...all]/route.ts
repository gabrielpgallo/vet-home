import { auth, googleReady } from "@/server/auth";
import { securityEvent, validateSession } from "@/server/session-security";
import { apiError } from "@/server/http";
export const runtime = "nodejs";
async function handle(req: Request) {
  if (!googleReady() || process.env.AUTH_MODE !== "google")
    return Response.json(
      { error: "Login Google não está ativo neste ambiente." },
      { status: 503 },
    );
  const path = new URL(req.url).pathname.replace(/^\/api\/auth/, "");
  if (
    !["/sign-in/social", "/sign-out", "/error"].includes(path) &&
    !path.startsWith("/callback/")
  ) {
    try {
      const session = await auth.api.getSession({ headers: req.headers });
      if (session) await validateSession(session.session.id, session.user.id);
    } catch (error) {
      return apiError(error);
    }
  }
  const response = await auth.handler(req);
  const location = response.headers.get("location");
  const failedRedirect =
    location && new URL(location, req.url).searchParams.has("error");
  if (response.status >= 400 || failedRedirect) {
    // No request body, OAuth code, URL, token or email enters the audit log.
    await securityEvent(
      response.status === 429 ? "auth.rate_limited" : "auth.failed",
    );
  }
  return response;
}
export const GET = handle;
export const POST = handle;
