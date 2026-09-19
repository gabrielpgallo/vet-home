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
async function save(
  revision: number,
  sipeagro?: string,
  details: Record<string, string> = {},
) {
  const form = new FormData();
  for (const key of ["companyName", "veterinarianName", "crmv"] as const)
    form.set(key, defaultSettings[key]);
  form.set("revision", String(revision));
  if (sipeagro !== undefined) form.set("sipeagro", sipeagro);
  for (const [key, value] of Object.entries(details)) form.set(key, value);
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
  expect((await save(1, "000124/SP")).status).toBe(409);
  expect((await brand()).sipeagro).toBe("000123/SP");
  expect(
    (await requestIdentity.run({ ...actor, orgId: otherOrg }, loadBrand))
      .sipeagro,
  ).toBe("");
  expect((await save(2, "x".repeat(61))).status).toBe(400);
  expect((await save(2, "")).status).toBe(200);
  expect((await brand()).sipeagro).toBe("");
  const details = {
    phone: "(16) 90000-0000",
    email: "clinica@example.com",
    cnpj: "11.222.333/0001-81",
    veterinarianCpf: "111.444.777-35",
  };
  expect((await save(3, undefined, details)).status).toBe(200);
  expect(await brand()).toMatchObject({
    ...details,
    phone: "16900000000",
    cnpj: "11222333000181",
    veterinarianCpf: "11144477735",
  });
  expect((await save(4)).status).toBe(200);
  expect(await brand()).toMatchObject({
    ...details,
    phone: "16900000000",
    cnpj: "11222333000181",
    veterinarianCpf: "11144477735",
  });
  expect(
    await requestIdentity.run({ ...actor, orgId: otherOrg }, loadBrand),
  ).toMatchObject({ phone: "", email: "", cnpj: "", veterinarianCpf: "" });
  expect((await save(5, undefined, { email: "invalid" })).status).toBe(400);
  expect((await save(5, undefined, { phone: "x".repeat(61) })).status).toBe(
    400,
  );
  expect(
    (
      await save(5, undefined, {
        phone: "",
        email: "",
        cnpj: "",
        veterinarianCpf: "",
      })
    ).status,
  ).toBe(200);
  expect(await brand()).toMatchObject({
    phone: "",
    email: "",
    cnpj: "",
    veterinarianCpf: "",
  });
  expect((await brand()).veterinarianTitle).toBe("Dra.");
  expect((await brand()).primaryColor).toBe("#245bdb");
  expect((await save(6, undefined, { veterinarianTitle: "Dr." })).status).toBe(
    200,
  );
  expect((await brand()).veterinarianTitle).toBe("Dr.");
  expect((await save(7)).status).toBe(200);
  expect((await brand()).veterinarianTitle).toBe("Dr.");
  expect(
    (await save(8, undefined, { veterinarianTitle: "invalid" })).status,
  ).toBe(400);
  expect((await save(8, undefined, { veterinarianTitle: "Dra." })).status).toBe(
    200,
  );
  expect((await brand()).veterinarianTitle).toBe("Dra.");
  expect((await save(9, undefined, { primaryColor: "#148A83" })).status).toBe(
    200,
  );
  expect((await brand()).primaryColor).toBe("#148a83");
  expect((await save(10)).status).toBe(200);
  expect((await brand()).primaryColor).toBe("#148a83");
  expect(
    (await requestIdentity.run({ ...actor, orgId: otherOrg }, loadBrand))
      .primaryColor,
  ).toBe("#245bdb");
  expect((await save(11, undefined, { primaryColor: "invalid" })).status).toBe(
    400,
  );
  expect((await save(10, undefined, { primaryColor: "#ff0000" })).status).toBe(
    409,
  );
  expect((await brand()).primaryColor).toBe("#148a83");
  expect((await save(11, undefined, { primaryColor: "#245bdb" })).status).toBe(
    200,
  );
  expect((await brand()).primaryColor).toBe("#245bdb");
});
