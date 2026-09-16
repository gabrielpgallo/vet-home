import "./env";
import { Pool } from "pg";
import { readdir, readFile } from "node:fs/promises";
const pool = new Pool({ connectionString: process.env.ADMIN_DATABASE_URL });
const client = await pool.connect();
try {
  await client.query("SELECT pg_advisory_lock(741203)");
  await client.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz DEFAULT now())",
  );
  for (const name of (await readdir("db"))
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    if (
      (
        await client.query("SELECT 1 FROM schema_migrations WHERE name=$1", [
          name,
        ])
      ).rowCount
    )
      continue;
    await client.query("BEGIN");
    try {
      await client.query(await readFile("db/" + name, "utf8"));
      await client.query("INSERT INTO schema_migrations(name) VALUES($1)", [
        name,
      ]);
      await client.query("COMMIT");
      console.log("Applied", name);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  }
  const password = process.env.APP_DB_PASSWORD;
  if (!password || !/^[A-Za-z0-9_-]{20,128}$/.test(password))
    throw Error(
      "Set APP_DB_PASSWORD to a random password of 20+ safe characters.",
    );
  if (
    !(await client.query("SELECT 1 FROM pg_roles WHERE rolname='vet_app'"))
      .rowCount
  )
    await client.query(
      `CREATE ROLE vet_app LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS`,
    );
  await client.query("GRANT USAGE ON SCHEMA public TO vet_app");
  await client.query(
    "GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO vet_app",
  );
  await client.query(
    "REVOKE ALL ON schema_migrations,organizations FROM vet_app",
  );
  await client.query("GRANT SELECT ON organizations TO vet_app");
  await client.query(
    "GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO vet_app",
  );
  console.log("Database ready. App role has RLS enabled.");
} finally {
  await client.query("SELECT pg_advisory_unlock(741203)");
  client.release();
  await pool.end();
}
