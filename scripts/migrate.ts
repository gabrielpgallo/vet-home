import "./env";
import { Pool } from "pg";
import { readdir, readFile } from "node:fs/promises";
const pool = new Pool({ connectionString: process.env.ADMIN_DATABASE_URL });
// Only application-owned tables: never grant access to other Supabase data.
const appTables = [
  "tutors",
  "patients",
  "visits",
  "visit_patients",
  "consultations",
  "products",
  "applications",
  "prescriptions",
  "attachments",
  "exams",
  "exam_links",
  "payments",
  "timeline",
  "mutations",
  "audit_log",
  "practice_settings",
  "expenses",
  "auth_user",
  "auth_session",
  "auth_account",
  "auth_verification",
  "auth_rate_limit",
  "iam_memberships",
  "iam_invitations",
];
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
  const role = (
    await client.query(
      "SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname='vet_app'",
    )
  ).rows[0];
  if (role.rolsuper || role.rolbypassrls)
    throw new Error("vet_app não pode ser superuser nem ignorar RLS.");
  await client.query(
    `GRANT SELECT,INSERT,UPDATE,DELETE ON ${appTables.map((t) => `public.${t}`).join(",")} TO vet_app`,
  );
  await client.query(
    "REVOKE ALL ON schema_migrations,organizations FROM vet_app",
  );
  await client.query("GRANT SELECT ON organizations TO vet_app");
  await client.query(
    "GRANT USAGE,SELECT ON SEQUENCE public.audit_log_id_seq TO vet_app",
  );
  // IAM and authentication tables are accessed exclusively by the server.
  // Supabase's default API grants must not expose them via PostgREST.
  const protectedTables = [...appTables, "organizations", "schema_migrations"]
    .map((t) => `public.${t}`)
    .join(",");
  await client.query(`REVOKE ALL ON ${protectedTables} FROM PUBLIC`);
  for (const apiRole of ["anon", "authenticated"]) {
    if (
      (await client.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [apiRole]))
        .rowCount
    )
      await client.query(`REVOKE ALL ON ${protectedTables} FROM ${apiRole}`);
  }
  console.log("Database ready. App role has RLS enabled.");
} finally {
  await client.query("SELECT pg_advisory_unlock(741203)");
  client.release();
  await pool.end();
}
