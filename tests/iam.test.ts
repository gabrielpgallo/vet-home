import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import "../scripts/env";
import { can, commandPermission, type Identity } from "../src/lib/permissions";
import { requestIdentity } from "../src/server/context";
import { manageIam, acceptInvitation } from "../src/server/iam";
import { runCommand } from "../src/server/commands";
import { loadData } from "../src/server/data";
import { pool } from "../src/server/db";
const db = new Pool({ connectionString: process.env.ADMIN_DATABASE_URL });
const org = "iam-test-" + randomUUID(),
  otherOrg = "iam-test-" + randomUUID();
const uid = randomUUID(),
  otherUser = randomUUID(),
  adminMember = randomUUID();
const actor: Identity = {
  userId: uid,
  name: "Test Admin",
  email: uid + "@example.com",
  orgId: org,
  role: "admin",
  local: false,
  sessionFresh: true,
};
beforeAll(async () => {
  await db.query("INSERT INTO organizations(id,name) VALUES($1,$1),($2,$2)", [
    org,
    otherOrg,
  ]);
  await db.query(
    'INSERT INTO auth_user(id,name,email,"emailVerified") VALUES($1,$1,$2,true),($3,$3,$4,true)',
    [uid, actor.email, otherUser, otherUser + "@example.com"],
  );
  await db.query(
    "INSERT INTO iam_memberships(id,organization_id,user_id,role) VALUES($1,$2,$3,'admin')",
    [adminMember, org, uid],
  );
});
afterAll(async () => {
  for (const t of [
    "audit_log",
    "mutations",
    "tutors",
    "iam_invitations",
    "iam_memberships",
  ])
    await db.query(`DELETE FROM ${t} WHERE organization_id=ANY($1::text[])`, [
      [org, otherOrg],
    ]);
  await db.query("DELETE FROM auth_user WHERE id=ANY($1::text[])", [
    [uid, otherUser],
  ]);
  await db.query("DELETE FROM organizations WHERE id=ANY($1::text[])", [
    [org, otherOrg],
  ]);
  await db.end();
  await pool.end();
});
it("perfis bloqueiam finanças, prontuários e IAM conforme a função", () => {
  expect(can("assistant", "clinical.read")).toBe(false);
  expect(can("assistant", "payments.write")).toBe(true);
  expect(can("veterinarian", "clinical.write")).toBe(true);
  expect(can("veterinarian", "finance.read")).toBe(false);
  expect(can("veterinarian", "iam.manage")).toBe(false);
  expect(can("admin", "iam.manage")).toBe(true);
  expect(commandPermission("consultation.save")).toBe("clinical.write");
  expect(commandPermission("expense.create")).toBe("finance.write");
  expect(commandPermission("unknown")).toBe(null);
});
it("convite só pode ser aceito pelo e-mail verificado e uma única vez", async () => {
  const invite = await manageIam(
    {
      type: "invite",
      email: otherUser.toUpperCase() + "@EXAMPLE.COM",
      role: "assistant",
    },
    actor,
  );
  await expect(
    acceptInvitation(
      { id: uid, email: actor.email, emailVerified: true },
      invite.id,
    ),
  ).rejects.toThrow("Convite inválido");
  await expect(
    acceptInvitation(
      {
        id: otherUser,
        email: otherUser + "@example.com",
        emailVerified: false,
      },
      invite.id,
    ),
  ).rejects.toThrow("não verificado");
  expect(
    await acceptInvitation(
      { id: otherUser, email: otherUser + "@example.com", emailVerified: true },
      invite.id,
    ),
  ).toBe(org);
  await expect(
    acceptInvitation(
      { id: otherUser, email: otherUser + "@example.com", emailVerified: true },
      invite.id,
    ),
  ).rejects.toThrow("Convite inválido");
  const row = (
    await db.query(
      "SELECT role FROM iam_memberships WHERE user_id=$1 AND organization_id=$2",
      [otherUser, org],
    )
  ).rows[0];
  expect(row.role).toBe("assistant");
});
it("convites revogados e expirados não dão acesso", async () => {
  const invite = await manageIam(
    {
      type: "invite",
      email: "expired-" + uid + "@example.com",
      role: "veterinarian",
    },
    actor,
  );
  await db.query(
    "UPDATE iam_invitations SET expires_at=now()-interval '1 day' WHERE id=$1",
    [invite.id],
  );
  await expect(
    acceptInvitation(
      {
        id: otherUser,
        email: "expired-" + uid + "@example.com",
        emailVerified: true,
      },
      invite.id,
    ),
  ).rejects.toThrow("Convite inválido");
  const revoked = await manageIam(
    {
      type: "invite",
      email: "revoked-" + uid + "@example.com",
      role: "assistant",
    },
    actor,
  );
  await manageIam({ type: "revokeInvite", id: revoked.id }, actor);
  await expect(
    acceptInvitation(
      {
        id: otherUser,
        email: "revoked-" + uid + "@example.com",
        emailVerified: true,
      },
      revoked.id,
    ),
  ).rejects.toThrow("Convite inválido");
});
it("preserva a última administradora e bloqueia alterações sem vínculo administrativo", async () => {
  await expect(
    manageIam(
      {
        type: "membership",
        id: adminMember,
        role: "assistant",
        status: "active",
        revision: 0,
      },
      actor,
    ),
  ).rejects.toThrow("pelo menos uma");
  await expect(
    manageIam(
      { type: "invite", email: "deny@example.com", role: "admin" },
      { ...actor, userId: otherUser },
    ),
  ).rejects.toThrow("administradora necessário");
  await expect(
    manageIam(
      {
        type: "membership",
        id: adminMember,
        role: "admin",
        status: "active",
        revision: 9,
      },
      actor,
    ),
  ).rejects.toThrow("outra aba");
});
it("o contexto de cada requisição isola clínicas e registra a identidade na auditoria", async () => {
  const result = await requestIdentity.run(actor, () =>
    runCommand(
      {
        type: "tutor.create",
        data: {
          name: "Isolamento IAM",
          phone: "",
          email: "",
          address: "Teste",
        },
        patientNames: [],
      },
      randomUUID(),
    ),
  );
  const same = await requestIdentity.run(actor, () => loadData());
  expect(same.tutors.some((t) => t.id === result.id)).toBe(true);
  const other = await requestIdentity.run({ ...actor, orgId: otherOrg }, () =>
    loadData(),
  );
  expect(other.tutors).toHaveLength(0);
  await expect(
    requestIdentity.run({ ...actor, orgId: otherOrg }, () =>
      runCommand(
        {
          type: "tutor.update",
          id: result.id,
          data: {
            name: "Não permitido",
            phone: "",
            email: "",
            address: "Teste",
          },
        },
        randomUUID(),
      ),
    ),
  ).rejects.toThrow("não encontrado");
  const audit = (
    await db.query("SELECT actor_id FROM audit_log WHERE entity_id=$1", [
      result.id,
    ])
  ).rows[0];
  expect(audit.actor_id).toBe(uid);
});
it("não permite remover simultaneamente todas as administradoras", async () => {
  const second = (
    await db.query(
      "UPDATE iam_memberships SET role='admin',revision=revision+1 WHERE user_id=$1 AND organization_id=$2 RETURNING id,revision",
      [otherUser, org],
    )
  ).rows[0];
  const results = await Promise.allSettled([
    manageIam(
      {
        type: "membership",
        id: adminMember,
        role: "assistant",
        status: "active",
        revision: 0,
      },
      actor,
    ),
    manageIam(
      {
        type: "membership",
        id: second.id,
        role: "assistant",
        status: "active",
        revision: second.revision,
      },
      { ...actor, userId: otherUser },
    ),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const count = await db.query(
    "SELECT count(*) FROM iam_memberships WHERE organization_id=$1 AND role='admin' AND status='active'",
    [org],
  );
  expect(Number(count.rows[0].count)).toBe(1);
});

it("separates veterinary qualification from administrative access", async () => {
  await db.query(
    "UPDATE iam_memberships SET role=CASE WHEN id=$1 THEN 'admin' ELSE 'assistant' END WHERE organization_id=$2",
    [adminMember, org],
  );
  const row = (
    await db.query("SELECT revision FROM iam_memberships WHERE id=$1", [
      adminMember,
    ])
  ).rows[0];
  await manageIam(
    {
      type: "membership",
      id: adminMember,
      role: "admin",
      status: "active",
      revision: row.revision,
      isVeterinarian: true,
    },
    actor,
  );
  const member = (
    await db.query(
      "SELECT role,is_veterinarian,revision FROM iam_memberships WHERE id=$1",
      [adminMember],
    )
  ).rows[0];
  expect(member.role).toBe("admin");
  expect(member.is_veterinarian).toBe(true);
  await expect(
    manageIam(
      {
        type: "membership",
        id: adminMember,
        role: "admin",
        status: "active",
        revision: member.revision,
        isVeterinarian: false,
      },
      { ...actor, userId: otherUser },
    ),
  ).rejects.toThrow("administradora necessário");
  await manageIam(
    {
      type: "membership",
      id: adminMember,
      role: "admin",
      status: "active",
      revision: member.revision,
      isVeterinarian: false,
    },
    actor,
  );
  expect(
    (
      await db.query(
        "SELECT is_veterinarian FROM iam_memberships WHERE id=$1",
        [adminMember],
      )
    ).rows[0].is_veterinarian,
  ).toBe(false);
});
