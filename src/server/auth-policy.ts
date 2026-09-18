import { Pool } from "pg";
import { databaseConfig } from "../lib/database-config";

const globalDb = globalThis as unknown as { vetAuthPolicyPool?: Pool };
// Better Auth holds a transaction connection while running create.before.
// A separate bounded pool avoids nested acquisition from the same pool,
// including when several OAuth callbacks execute concurrently.
export const authPolicyPool =
  globalDb.vetAuthPolicyPool ??
  new Pool({
    ...databaseConfig(process.env.DATABASE_URL),
    max: 1,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 20_000,
  });
if (process.env.NODE_ENV !== "production")
  globalDb.vetAuthPolicyPool = authPolicyPool;
