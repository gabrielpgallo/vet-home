import { auth, googleReady } from "@/server/auth";
export const runtime = "nodejs";
async function handle(req: Request) {
  if (!googleReady() || process.env.AUTH_MODE === "local")
    return Response.json(
      { error: "Login Google não está ativo neste ambiente." },
      { status: 503 },
    );
  return auth.handler(req);
}
export const GET = handle;
export const POST = handle;
