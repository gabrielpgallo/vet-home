import { Pool, PoolClient } from "pg";
import { databaseConfig } from "../lib/database-config";
import { getOrgId, requestIdentity } from "./context";
const globalDb = globalThis as unknown as { vetPool?: Pool };
export const pool =
  globalDb.vetPool ??
  new Pool({
    ...databaseConfig(process.env.DATABASE_URL),
    max: process.env.VERCEL ? 1 : 8,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 20_000,
  });
if (process.env.NODE_ENV !== "production") globalDb.vetPool = pool;
export async function forOrg<T>(
  fn: (db: PoolClient) => Promise<T>,
  orgId = getOrgId(),
): Promise<T> {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query("SELECT set_config('app.current_org',$1,true)", [orgId]);
    await db.query("SELECT set_config('app.actor_id',$1,true)", [
      requestIdentity.getStore()?.userId || "system",
    ]);
    const result = await fn(db);
    await db.query("COMMIT");
    return result;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
}
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
