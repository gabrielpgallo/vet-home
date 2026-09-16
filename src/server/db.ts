import { Pool, PoolClient } from "pg";
import { ORG_ID } from "@/lib/domain";
const globalDb = globalThis as unknown as { vetPool?: Pool };
export const pool =
  globalDb.vetPool ??
  new Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
if (process.env.NODE_ENV !== "production") globalDb.vetPool = pool;
export async function forOrg<T>(
  fn: (db: PoolClient) => Promise<T>,
  orgId = ORG_ID,
): Promise<T> {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query("SELECT set_config('app.current_org',$1,true)", [orgId]);
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
