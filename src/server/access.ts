import { headers } from "next/headers";
import { AppError } from "./db";
export async function requireLocalAccess(mutating = false) {
  const h = await headers(),
    host = h.get("host") || "";
  if (
    process.env.APP_LOCAL_MODE !== "true" ||
    !/^localhost(?::\d+)?$|^127\.0\.0\.1(?::\d+)?$/.test(host)
  )
    throw new AppError(
      "Esta versão permite acesso apenas local. Configure autenticação antes de disponibilizar na internet.",
      403,
    );
  if (mutating) {
    const origin = h.get("origin");
    if (!origin || !["http://" + host, "https://" + host].includes(origin))
      throw new AppError("Origem da requisição não autorizada.", 403);
  }
}
