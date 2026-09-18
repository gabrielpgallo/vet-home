import "../scripts/env";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { requestIdentity } from "../src/server/context";
import { pool } from "../src/server/db";
import { loadBrand } from "../src/server/settings";
import { defaultSettings } from "../src/lib/settings";

// Authentication has separate coverage; exercise the real settings handler and DB.
vi.mock("../src/server/access", () => ({
  withAccess: (
    _permission: unknown,
    handler: (req: Request) => Promise<Response>,
  ) => handler,
}));
import { POST } from "../src/app/api/settings/route";

const admin = new Pool({ connectionString: process.env.ADMIN_DATABASE_URL });
const org = "settings-test-" + randomUUID();
const otherOrg = "settings-test-" + randomUUID();
const actor = {
  userId: "settings-test",
  name: "Test",
  email: "",
  orgId: org,
  role: "admin" as const,
  local: true,
};
beforeAll(async () => {
  await admin.query(
    "INSERT INTO organizations(id,name) VALUES($1,$1),($2,$2)",
    [org, otherOrg],
  );
});
afterAll(async () => {
  for (const table of ["audit_log", "practice_settings", "organizations"])
    await admin.query(
      `DELETE FROM ${table} WHERE ${table === "organizations" ? "id" : "organization_id"}=ANY($1::text[])`,
      [[org, otherOrg]],
    );
  await admin.end();
  await pool.end();
});
async function save(revision: number, sipeagro?: string) {
  const form = new FormData();
  for (const key of ["companyName", "veterinarianName", "crmv"] as const)
    form.set(key, defaultSettings[key]);
  form.set("revision", String(revision));
  if (sipeagro !== undefined) form.set("sipeagro", sipeagro);
  return requestIdentity.run(actor, () =>
    POST(
      new Request("http://localhost/api/settings", {
        method: "POST",
        body: form,
      }),
    ),
  );
}
const brand = () => requestIdentity.run(actor, loadBrand);
it("persists the registration, preserves it for old clients, checks revision and allows clearing it", async () => {
  expect((await save(0, "  000123/SP  ")).status).toBe(200);
  expect((await brand()).sipeagro).toBe("000123/SP");
  expect((await save(1)).status).toBe(200);
  expect((await brand()).sipeagro).toBe("000123/SP");
  expect((await save(1, "overwrite")).status).toBe(409);
  expect((await brand()).sipeagro).toBe("000123/SP");
  expect(
    (await requestIdentity.run({ ...actor, orgId: otherOrg }, loadBrand))
      .sipeagro,
  ).toBe("");
  expect((await save(2, "x".repeat(61))).status).toBe(400);
  expect((await save(2, "")).status).toBe(200);
  expect((await brand()).sipeagro).toBe("");
});
