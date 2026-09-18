import "./env";
import { Pool } from "pg";
import { ORG_ID } from "../src/lib/domain";
import { defaultSettings } from "../src/lib/settings";
import { databaseConfig } from "../src/lib/database-config";

if (!process.env.ADMIN_DATABASE_URL)
  throw new Error("Configure ADMIN_DATABASE_URL.");
const pool = new Pool({
  ...databaseConfig(process.env.ADMIN_DATABASE_URL),
  max: 1,
});
const db = await pool.connect();
try {
  await db.query("BEGIN");
  await db.query(
    "INSERT INTO organizations(id,name) VALUES($1,$2) ON CONFLICT DO NOTHING",
    [ORG_ID, defaultSettings.companyName],
  );
  await db.query(
    "INSERT INTO practice_settings(organization_id,company_name,veterinarian_name,crmv) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
    [
      ORG_ID,
      defaultSettings.companyName,
      defaultSettings.veterinarianName,
      defaultSettings.crmv,
    ],
  );
  await db.query("COMMIT");
  console.log(
    "Clínica inicializada sem dados de demonstração. Cadastros existentes preservados.",
  );
} catch (error) {
  await db.query("ROLLBACK");
  throw error;
} finally {
  db.release();
  await pool.end();
}
