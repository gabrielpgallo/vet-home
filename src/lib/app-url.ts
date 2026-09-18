export function appUrl(env: Record<string, string | undefined> = process.env) {
  if (env.BETTER_AUTH_URL) return env.BETTER_AUTH_URL;
  // Preview must never silently authenticate against the production domain.
  if (
    env.VERCEL &&
    env.VERCEL_ENV === "production" &&
    env.VERCEL_PROJECT_PRODUCTION_URL
  )
    return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return undefined;
}
