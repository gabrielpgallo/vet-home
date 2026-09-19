import "../scripts/env";
import { beforeAll, beforeEach, afterAll, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
const mock = vi.hoisted(() => ({
  getSession: vi.fn(),
  selected: "",
  headers: new Headers(),
}));
vi.mock("next/headers", () => ({
  headers: async () => mock.headers,
  cookies: async () => ({
    get: () => (mock.selected ? { value: mock.selected } : undefined),
  }),
}));
vi.mock("../src/server/auth", () => ({
  googleReady: () => true,
  auth: { api: { getSession: mock.getSession } },
}));
import { pool } from "../src/server/db";
import { identity, withAccess } from "../src/server/access";
import {
  validateSession,
  requireRecentIdentity,
} from "../src/server/session-security";
import { manageIam } from "../src/server/iam";
import { POST as revokeOwnSession } from "../src/app/api/sessions/route";
import { GET as confirmIdentity } from "../src/app/api/reauth/route";
import { GET as events } from "../src/app/api/security-events/route";
const db = new Pool({ connectionString: process.env.ADMIN_DATABASE_URL });
const user = randomUUID(),
  other = randomUUID(),
  session = randomUUID();
const org = "session-test-" + randomUUID(),
  orgB = "session-test-" + randomUUID();
const member = randomUUID();
const userData = {
  id: user,
  email: user + "@example.com",
  emailVerified: true,
  name: "Test",
};
const origin = "https://vet.example.com";
const request = (method = "GET", extra: Record<string, string> = {}) =>
  new Request(origin + "/api/test", { method, headers: { origin, ...extra } });
beforeAll(async () => {
  await db.query("INSERT INTO organizations(id,name) VALUES($1,$1),($2,$2)", [
    org,
    orgB,
  ]);
  await db.query(
    'INSERT INTO auth_user(id,name,email,"emailVerified") VALUES($1,$1,$2,true),($3,$3,$4,true)',
    [user, userData.email, other, other + "@example.com"],
  );
  await db.query(
    "INSERT INTO iam_memberships(id,organization_id,user_id,role) VALUES($1,$2,$3,'admin'),($4,$5,$3,'admin')",
    [member, org, user, randomUUID(), orgB],
  );
});
beforeEach(async () => {
  vi.stubEnv("AUTH_MODE", "google");
  vi.stubEnv("BETTER_AUTH_URL", origin);
  vi.stubEnv("VERCEL", "");
  await db.query('DELETE FROM auth_session WHERE "userId"=ANY($1::text[])', [
    [user, other],
  ]);
  await db.query(
    'INSERT INTO auth_session(id,token,"userId","updatedAt","createdAt","expiresAt") VALUES($1,$1,$2,now(),now()-interval \'1 minute\',now()+interval \'12 hours\')',
    [session, user],
  );
  await db.query(
    "UPDATE iam_memberships SET status='active',role='admin',sessions_valid_after='-infinity' WHERE user_id=$1",
    [user],
  );
  mock.selected = org;
  mock.headers = new Headers({ host: "vet.example.com" });
  mock.getSession.mockResolvedValue({
    user: userData,
    session: {
      id: session,
      userId: user,
      createdAt: new Date(Date.now() - 60000),
    },
  });
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await db.query(
    "DELETE FROM audit_log WHERE organization_id=ANY($1::text[])",
    [[org, orgB]],
  );
  await db.query(
    "DELETE FROM iam_invitations WHERE organization_id=ANY($1::text[])",
    [[org, orgB]],
  );
  await db.query(
    "DELETE FROM iam_memberships WHERE organization_id=ANY($1::text[])",
    [[org, orgB]],
  );
  await db.query("DELETE FROM auth_user WHERE id=ANY($1::text[])", [
    [user, other],
  ]);
  await db.query("DELETE FROM organizations WHERE id=ANY($1::text[])", [
    [org, orgB],
  ]);
  await db.end();
  await pool.end();
});
it("rejects missing sessions and unverified email", async () => {
  mock.getSession.mockResolvedValue(null);
  expect(
    (await withAccess(null, async () => Response.json({ ok: true }))(request()))
      .status,
  ).toBe(401);
  mock.getSession.mockResolvedValue({
    user: { ...userData, emailVerified: false },
    session: { id: session },
  });
  await expect(identity()).rejects.toMatchObject({ status: 401 });
});
it("checks suspended memberships and selected-clinic cookie without trusting it", async () => {
  mock.selected = "unknown-clinic";
  await expect(identity()).rejects.toMatchObject({ status: 403 });
  mock.selected = org;
  await db.query("UPDATE iam_memberships SET status='suspended' WHERE id=$1", [
    member,
  ]);
  await expect(identity()).rejects.toMatchObject({ status: 403 });
});
it("rejects foreign and missing origins before reaching a mutation", async () => {
  const handler = vi.fn(async () => Response.json({ ok: true }));
  const route = withAccess("iam.manage", handler);
  expect(
    (await route(request("POST", { origin: "https://evil.example" }))).status,
  ).toBe(403);
  expect((await route(new Request(origin, { method: "POST" }))).status).toBe(
    403,
  );
  expect(handler).not.toHaveBeenCalled();
});
it("blocks lower-privilege users and audits permission denial", async () => {
  await db.query("UPDATE iam_memberships SET role='assistant' WHERE id=$1", [
    member,
  ]);
  expect(
    (await withAccess("iam.manage", async () => Response.json({}))(request()))
      .status,
  ).toBe(403);
  expect(
    (
      await db.query(
        "SELECT 1 FROM security_events WHERE user_id=$1 AND organization_id=$2 AND action='access.permission_denied'",
        [user, org],
      )
    ).rowCount,
  ).toBeGreaterThan(0);
});
it("does not save a stale form under a different account or clinic", async () => {
  const handler = vi.fn(async () => Response.json({}));
  const route = withAccess(null, handler);
  expect((await route(request("POST", { "x-vet-user": other }))).status).toBe(
    409,
  );
  expect((await route(request("POST", { "x-vet-clinic": orgB }))).status).toBe(
    409,
  );
  expect(handler).not.toHaveBeenCalled();
});
it("requires recent Google authentication for IAM even if the session is otherwise valid", async () => {
  await db.query(
    "UPDATE auth_session SET \"createdAt\"=now()-interval '20 minutes' WHERE id=$1",
    [session],
  );
  const actor = await identity();
  expect(actor.sessionFresh).toBe(false);
  expect(() => requireRecentIdentity(actor)).toThrow("Confirme sua conta");
  await expect(
    manageIam(
      { type: "invite", email: "test@example.com", role: "admin" },
      actor,
    ),
  ).rejects.toMatchObject({ status: 428 });
});
it.each([
  ["absolute", '"createdAt"', "13 hours"],
  ["idle", "last_seen_at", "3 hours"],
])(
  "expires %s sessions server-side and removes their DB token",
  async (_, column, age) => {
    await db.query(
      `UPDATE auth_session SET ${column}=now()-$2::interval WHERE id=$1`,
      [session, age],
    );
    await expect(validateSession(session, user)).rejects.toMatchObject({
      status: 401,
    });
    expect(
      (await db.query("SELECT 1 FROM auth_session WHERE id=$1", [session]))
        .rowCount,
    ).toBe(0);
    expect(
      (
        await db.query(
          "SELECT 1 FROM security_events WHERE user_id=$1 AND action='session.expired'",
          [user],
        )
      ).rowCount,
    ).toBeGreaterThan(0);
  },
);
it.each([
  ['"createdAt"', "5 hours"],
  ["last_seen_at", "31 minutes"],
])("uses shorter limits on shared devices (%s)", async (column, age) => {
  await db.query(
    `UPDATE auth_session SET shared_device=true,${column}=now()-$2::interval WHERE id=$1`,
    [session, age],
  );
  await expect(validateSession(session, user)).rejects.toMatchObject({
    status: 401,
  });
});
it("revokes only access to the admin's clinic and preserves the global session", async () => {
  const actor = await identity();
  await manageIam({ type: "revokeUserSessions", id: member }, actor);
  await expect(identity()).rejects.toMatchObject({ status: 403 });
  mock.selected = orgB;
  expect((await identity()).orgId).toBe(orgB);
  expect(
    (await db.query("SELECT 1 FROM auth_session WHERE id=$1", [session]))
      .rowCount,
  ).toBe(1);
  await db.query(
    "UPDATE auth_session SET \"createdAt\"=now()+interval '1 second' WHERE id=$1",
    [session],
  );
  mock.selected = org;
  expect((await identity()).orgId).toBe(org);
});
it("a user cannot revoke another person's session", async () => {
  const otherSession = randomUUID();
  await db.query(
    'INSERT INTO auth_session(id,token,"userId","createdAt","updatedAt","expiresAt") VALUES($1,$1,$2,now(),now(),now()+interval \'1 hour\')',
    [otherSession, other],
  );
  await revokeOwnSession(
    new Request(origin, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ id: otherSession }),
    }),
  );
  expect(
    (await db.query("SELECT 1 FROM auth_session WHERE id=$1", [otherSession]))
      .rowCount,
  ).toBe(1);
});
it("reauthentication checks the same account and freshness", async () => {
  expect(
    (await confirmIdentity(new Request(`${origin}/api/reauth?user=${other}`)))
      .status,
  ).toBe(409);
  expect(
    (await confirmIdentity(new Request(`${origin}/api/reauth?user=${user}`)))
      .status,
  ).toBe(200);
  await db.query(
    "UPDATE auth_session SET \"createdAt\"=now()-interval '20 minutes' WHERE id=$1",
    [session],
  );
  expect(
    (await confirmIdentity(new Request(`${origin}/api/reauth?user=${user}`)))
      .status,
  ).toBe(428);
});
it("audits session creation without storing bearer tokens and hides other clinics' events", async () => {
  await db.query(
    "INSERT INTO security_events(action,user_id,organization_id) VALUES('test.other_clinic',$1,$2)",
    [user, orgB],
  );
  const response = await events(request());
  const rows = await response.json();
  expect(
    rows.some((r: { action: string }) => r.action === "session.created"),
  ).toBe(true);
  expect(
    rows.some((r: { action: string }) => r.action === "test.other_clinic"),
  ).toBe(false);
  expect(JSON.stringify(rows)).not.toContain(session);
});
it("never permits the development bypass on Vercel or a remote host", async () => {
  vi.stubEnv("AUTH_MODE", "local");
  vi.stubEnv("APP_LOCAL_MODE", "true");
  vi.stubEnv("VERCEL", "1");
  mock.headers = new Headers({ host: "localhost:3010" });
  await expect(identity()).rejects.toMatchObject({ status: 403 });
  vi.stubEnv("VERCEL", "");
  mock.headers = new Headers({ host: "evil.example" });
  await expect(identity()).rejects.toMatchObject({ status: 403 });
});
