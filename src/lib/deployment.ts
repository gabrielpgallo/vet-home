import { appUrl } from "./app-url";
export function deploymentErrors(
  env: Record<string, string | undefined>,
): string[] {
  if (!env.VERCEL) return [];
  const errors: string[] = [];
  if (env.AUTH_MODE !== "google")
    errors.push(
      "AUTH_MODE deve ser google; Supabase Auth ainda não está integrado.",
    );
  if (env.APP_LOCAL_MODE !== "false")
    errors.push("APP_LOCAL_MODE deve ser false na Vercel.");
  for (const key of [
    "DATABASE_URL",
    "BETTER_AUTH_SECRET",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "APP_ORG_ID",
  ]) {
    if (!env[key]) errors.push(`Configure ${key}.`);
  }
  if ((env.BETTER_AUTH_SECRET?.length || 0) < 32)
    errors.push(
      "BETTER_AUTH_SECRET precisa ter pelo menos 32 caracteres aleatórios.",
    );
  try {
    const url = new URL(appUrl(env) || "");
    if (
      url.protocol !== "https:" ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      url.username ||
      url.password
    )
      errors.push("BETTER_AUTH_URL deve ser a origem HTTPS da aplicação.");
  } catch {
    errors.push("BETTER_AUTH_URL inválida.");
  }
  try {
    const url = new URL(env.DATABASE_URL || "");
    if (!["postgres:", "postgresql:"].includes(url.protocol))
      errors.push("DATABASE_URL deve usar PostgreSQL.");
    if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
      errors.push("DATABASE_URL não pode apontar para o computador local.");
    if (!/^vet_app(?:\.|$)/.test(decodeURIComponent(url.username)))
      errors.push("DATABASE_URL deve usar o papel vet_app, sujeito a RLS.");
    if (url.searchParams.get("sslmode") !== "verify-full")
      errors.push("Configure sslmode=verify-full na DATABASE_URL de produção.");
  } catch {
    errors.push("DATABASE_URL inválida.");
  }
  return errors;
}
