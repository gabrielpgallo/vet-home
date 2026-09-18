import type { PoolConfig } from "pg";

/** Preserve certificate and hostname verification with Supabase's private CA. */
export function databaseConfig(
  connectionString: string | undefined,
): PoolConfig {
  const ca = process.env.DATABASE_SSL_CA;
  if (!ca || !connectionString) return { connectionString };
  const url = new URL(connectionString);
  // pg connection-string SSL options override the explicit ssl object.
  for (const key of [
    "sslmode",
    "sslrootcert",
    "sslcert",
    "sslkey",
    "ssl",
    "uselibpqcompat",
  ])
    url.searchParams.delete(key);
  return {
    connectionString: url.toString(),
    ssl: { ca: ca.replace(/\\n/g, "\n"), rejectUnauthorized: true },
  };
}
