import "../scripts/env";
import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { auth } from "../src/server/auth";
import { pool } from "../src/server/db";
import { authPolicyPool } from "../src/server/auth-policy";

const admin = new Pool({ connectionString: process.env.ADMIN_DATABASE_URL });
const org = "auth-registration-test-" + randomUUID();
const emails = [randomUUID() + "@example.com", randomUUID() + "@example.com"];
beforeAll(async () => {
  if (
    !["localhost", "127.0.0.1"].includes(
      new URL(process.env.ADMIN_DATABASE_URL!).hostname,
    )
  )
    throw new Error("Este teste requer o banco local.");
  // Reproduce the Vercel pool, including acquisition failure instead of hanging.
  pool.options.max = 1;
  pool.options.connectionTimeoutMillis = 500;
  await admin.query("INSERT INTO organizations(id,name) VALUES($1,$1)", [org]);
  for (const email of emails)
    await admin.query(
      "INSERT INTO iam_invitations(id,organization_id,email,role,created_by) VALUES($1,$2,$3,'admin','test')",
      [randomUUID(), org, email],
    );
});
afterAll(async () => {
  await admin.query(
    'DELETE FROM auth_account WHERE "userId" IN (SELECT id FROM auth_user WHERE email=ANY($1::text[]))',
    [emails],
  );
  await admin.query("DELETE FROM auth_user WHERE email=ANY($1::text[])", [
    emails,
  ]);
  await admin.query("DELETE FROM iam_invitations WHERE organization_id=$1", [
    org,
  ]);
  await admin.query("DELETE FROM organizations WHERE id=$1", [org]);
  await admin.end();
  await pool.end();
  await authPolicyPool.end();
});
it("creates invited OAuth users with a one-connection transaction pool", async () => {
  const ctx = await auth.$context;
  const results = await Promise.allSettled(
    emails.map((email) =>
      ctx.internalAdapter.createOAuthUser(
        { name: "OAuth test", email, emailVerified: true },
        { providerId: "google", accountId: randomUUID() },
      ),
    ),
  );
  expect(results.every((r) => r.status === "fulfilled")).toBe(true);
  expect(
    results
      .flatMap((r) => (r.status === "fulfilled" ? [r.value.user.email] : []))
      .sort(),
  ).toEqual([...emails].sort());
});
it("still rejects accounts without an invitation or verified email", async () => {
  const ctx = await auth.$context;
  await expect(
    ctx.internalAdapter.createOAuthUser(
      {
        name: "Uninvited test",
        email: randomUUID() + "@example.com",
        emailVerified: true,
      },
      { providerId: "google", accountId: randomUUID() },
    ),
  ).rejects.toThrow("É necessário um convite ativo");
  await expect(
    ctx.internalAdapter.createOAuthUser(
      { name: "Unverified test", email: emails[0], emailVerified: false },
      { providerId: "google", accountId: randomUUID() },
    ),
  ).rejects.toThrow("Use um e-mail verificado");
});
