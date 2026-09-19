import "../scripts/env";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { beforeAll, afterAll, expect, it } from "vitest";
import { pool, forOrg } from "../src/server/db";
import { requestIdentity } from "../src/server/context";
import { readAudit } from "../src/server/audit";
import { runCommand } from "../src/server/commands";
import type { Identity } from "../src/lib/permissions";
const admin = new Pool({ connectionString: process.env.ADMIN_DATABASE_URL });
const org = "audit-" + randomUUID(),
  other = "audit-" + randomUUID();
const user = randomUUID(),
  tutor = randomUUID();
const identity: Identity = {
  userId: user,
  email: user + "@example.com",
  name: "Audit test",
  orgId: org,
  role: "admin",
  local: false,
};
const act = <T>(fn: () => Promise<T>) => requestIdentity.run(identity, fn);
const read = (query = "") => act(() => readAudit(new URLSearchParams(query)));
beforeAll(async () => {
  await admin.query(
    "INSERT INTO organizations(id,name) VALUES($1,$1),($2,$2)",
    [org, other],
  );
  await admin.query(
    'INSERT INTO auth_user(id,name,email,"emailVerified") VALUES($1,$1,$2,true)',
    [user, identity.email],
  );
});
afterAll(async () => {
  for (const table of [
    "practice_settings",
    "attachments",
    "tutors",
    "mutations",
    "audit_log",
  ])
    await admin.query(
      `DELETE FROM ${table} WHERE organization_id=ANY($1::text[])`,
      [[org, other]],
    );
  await admin.query("DELETE FROM organizations WHERE id=ANY($1::text[])", [
    [org, other],
  ]);
  await admin.query("DELETE FROM auth_user WHERE id=$1", [user]);
  await admin.end();
  await pool.end();
});
it("captures creation, meaningful edits and deletion with actor and before/after, ignoring no-ops", async () => {
  await act(() =>
    forOrg(async (db) => {
      await db.query(
        "INSERT INTO tutors(id,organization_id,name,address) VALUES($1,$2,'Original','Rua A')",
        [tutor, org],
      );
      await db.query("UPDATE tutors SET name='Alterado' WHERE id=$1", [tutor]);
      await db.query("UPDATE tutors SET name='Alterado' WHERE id=$1", [tutor]);
      await db.query("DELETE FROM tutors WHERE id=$1", [tutor]);
    }),
  );
  const entries = ((await read()) as { entries: { id: string }[] }).entries;
  expect(entries).toHaveLength(3);
  const detail = await read("id=" + entries[1].id);
  expect(detail).toMatchObject({
    actor: identity.email,
    actor_id: user,
    entity_id: tutor,
    operation: "UPDATE",
    changed_fields: ["name"],
    before_data: { name: "Original" },
    after_data: { name: "Alterado" },
  });
  expect(await read("id=" + entries[0].id)).toMatchObject({
    operation: "DELETE",
    after_data: null,
  });
});
it("rolls back history with failed writes and prevents the app role from tampering with history", async () => {
  const before = await read();
  await expect(
    act(() =>
      forOrg(async (db) => {
        await db.query(
          "INSERT INTO tutors(id,organization_id,name,address) VALUES($1,$2,'Rollback','Rua')",
          [tutor, org],
        );
        throw Error("rollback");
      }),
    ),
  ).rejects.toThrow("rollback");
  expect(await read()).toEqual(before);
  for (const sql of [
    "DELETE FROM change_log",
    "UPDATE change_log SET actor='fake'",
    "TRUNCATE change_log",
    "INSERT INTO change_log(organization_id) VALUES('fake')",
  ]) {
    await expect(
      act(() => forOrg((db) => db.query(sql))),
    ).rejects.toMatchObject({ code: "42501" });
  }
});
it("isolates clinics, denies non-admins and validates filters", async () => {
  await admin.query(
    "INSERT INTO tutors(id,organization_id,name,address) VALUES($1,$2,'Private','Rua')",
    [randomUUID(), other],
  );
  const foreign = (
    await admin.query("SELECT id FROM change_log WHERE organization_id=$1", [
      other,
    ])
  ).rows[0].id;
  await expect(read("id=" + foreign)).rejects.toMatchObject({ status: 404 });
  for (const role of ["veterinarian", "assistant"] as const)
    await expect(
      requestIdentity.run({ ...identity, role }, () =>
        readAudit(new URLSearchParams()),
      ),
    ).rejects.toMatchObject({ status: 403 });
  expect(await read("entity=patients")).toMatchObject({ entries: [] });
  expect(
    await read("operation=UPDATE&actor=" + encodeURIComponent(identity.email)),
  ).toMatchObject({ entries: [{ operation: "UPDATE" }] });
  expect(await read("from=2000-01-01&to=2000-01-02")).toMatchObject({
    entries: [],
  });
  for (const query of [
    "from=2026-02-30",
    "from=2026-09-20&to=2026-09-01",
    "cursor=oops",
    "id=9999999999999999999",
    "entity=auth_account",
  ])
    await expect(read(query)).rejects.toThrow();
});
it("never serializes binary attachments or credentials, and ignores settings revision-only updates", async () => {
  await act(() =>
    forOrg(async (db) => {
      await db.query(
        "INSERT INTO attachments(id,organization_id,name,mime,data,size) VALUES($1,$2,'Test.pdf','application/pdf',$3,4)",
        [randomUUID(), org, Buffer.from("test")],
      );
      await db.query(
        "INSERT INTO practice_settings(organization_id,company_name,veterinarian_name,crmv,logo) VALUES($1,'Clinic','Vet','123',$2)",
        [org, Buffer.from("logo")],
      );
      await db.query(
        "UPDATE practice_settings SET revision=revision+1,updated_at=now() WHERE organization_id=$1",
        [org],
      );
    }),
  );
  const rows = (
    await admin.query(
      "SELECT * FROM change_log WHERE organization_id=$1 AND entity_type IN ('attachments','practice_settings')",
      [org],
    )
  ).rows;
  expect(rows).toHaveLength(2);
  for (const row of rows) {
    expect(row.after_data).not.toHaveProperty("data");
    expect(row.after_data).not.toHaveProperty("logo");
    expect(row.after_data).not.toHaveProperty("revision");
    expect(row.after_data).not.toHaveProperty("encrypted_key");
  }
});
it("does not duplicate audit on idempotent commands; pagination has no overlapping rows", async () => {
  const id = randomUUID();
  const cmd = {
    type: "tutor.create",
    data: {
      name: "Idempotent",
      phone: "",
      email: "",
      address: "Rua",
      document: "",
    },
  };
  await act(() => runCommand(cmd, id));
  await act(() => runCommand(cmd, id));
  expect(
    (
      await admin.query(
        "SELECT id FROM change_log WHERE organization_id=$1 AND after_data->>'name'='Idempotent'",
        [org],
      )
    ).rowCount,
  ).toBe(1);
  await act(() =>
    forOrg(async (db) => {
      for (let n = 0; n < 52; n++)
        await db.query(
          "INSERT INTO tutors(id,organization_id,name,address) VALUES($1,$2,$3,'Rua')",
          [randomUUID(), org, "Pagination " + n],
        );
    }),
  );
  const first = (await read()) as {
    entries: { id: string }[];
    nextCursor: string;
  };
  const second = (await read("cursor=" + first.nextCursor)) as {
    entries: { id: string }[];
  };
  expect(first.entries).toHaveLength(50);
  expect(second.entries.length).toBeGreaterThan(0);
  expect(
    second.entries.every((r) => !first.entries.some((a) => a.id === r.id)),
  ).toBe(true);
});
