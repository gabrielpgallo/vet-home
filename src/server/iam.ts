import { randomUUID } from "node:crypto";
import { z } from "zod";
import { pool, forOrg, AppError } from "./db";
import { requestIdentity } from "./context";
import { roles, type Identity } from "@/lib/permissions";
import { requireRecentIdentity } from "./session-security";
const email = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((s) => s.toLowerCase());
export const iamCommand = z.discriminatedUnion("type", [
  z.object({ type: z.literal("invite"), email, role: z.enum(roles) }).strict(),
  z.object({ type: z.literal("revokeInvite"), id: z.string().uuid() }).strict(),
  z
    .object({
      type: z.literal("membership"),
      id: z.string().uuid(),
      role: z.enum(roles),
      isVeterinarian: z.boolean().optional(),
      status: z.enum(["active", "suspended"]),
      revision: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({ type: z.literal("revokeUserSessions"), id: z.string().uuid() })
    .strict(),
]);
export async function listIam(actor: Identity) {
  const members = await pool.query(
    "SELECT m.id,m.role,m.is_veterinarian,m.status,m.revision,u.name,u.email FROM iam_memberships m JOIN auth_user u ON u.id=m.user_id WHERE m.organization_id=$1 ORDER BY u.name",
    [actor.orgId],
  );
  const invitations = await pool.query(
    "SELECT id,email,role,status,expires_at FROM iam_invitations WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 100",
    [actor.orgId],
  );
  const audit = await forOrg((db) =>
    db.query(
      "SELECT a.id,a.action,a.entity_id,a.created_at,COALESCE(u.email,a.actor_id) AS actor FROM audit_log a LEFT JOIN auth_user u ON u.id=a.actor_id ORDER BY a.created_at DESC,a.id DESC LIMIT 50",
    ),
  );
  const security = await pool.query(
    "SELECT e.id,e.action,e.created_at,COALESCE(u.email,'Sistema') AS actor FROM security_events e LEFT JOIN auth_user u ON u.id=e.user_id WHERE e.organization_id=$1 ORDER BY e.created_at DESC,e.id DESC LIMIT 50",
    [actor.orgId],
  );
  return {
    members: members.rows,
    invitations: invitations.rows,
    audit: audit.rows,
    security: security.rows,
  };
}
export async function manageIam(input: unknown, actor: Identity) {
  requireRecentIdentity(actor);
  const cmd = iamCommand.parse(input);
  return requestIdentity.run(actor, () =>
    forOrg(async (db) => {
      // Serializes membership changes, including concurrent removal of the last admin.
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        "iam:" + actor.orgId,
      ]);
      if (!actor.local) {
        const current = await db.query(
          "SELECT 1 FROM iam_memberships WHERE user_id=$1 AND organization_id=$2 AND role='admin' AND status='active'",
          [actor.userId, actor.orgId],
        );
        if (!current.rowCount)
          throw new AppError("Acesso de administradora necessário.", 403);
      }
      let id: string;
      if (cmd.type === "invite") {
        const existing = await db.query(
          "SELECT 1 FROM iam_memberships m JOIN auth_user u ON u.id=m.user_id WHERE m.organization_id=$1 AND lower(u.email)=$2",
          [actor.orgId, cmd.email],
        );
        if (existing.rowCount)
          throw new AppError(
            "Esta pessoa já possui vínculo. Edite seu acesso na lista de usuários.",
            409,
          );
        await db.query(
          "UPDATE iam_invitations SET status='revoked' WHERE organization_id=$1 AND email=$2 AND status='pending' AND expires_at<=now()",
          [actor.orgId, cmd.email],
        );
        const r = await db.query(
          "INSERT INTO iam_invitations(id,organization_id,email,role,created_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING id",
          [randomUUID(), actor.orgId, cmd.email, cmd.role, actor.userId],
        );
        if (!r.rowCount)
          throw new AppError(
            "Já existe um convite pendente para este e-mail.",
            409,
          );
        id = r.rows[0].id;
      } else if (cmd.type === "revokeInvite") {
        id = cmd.id;
        const r = await db.query(
          "UPDATE iam_invitations SET status='revoked' WHERE id=$1 AND organization_id=$2 AND status='pending' RETURNING id",
          [id, actor.orgId],
        );
        if (!r.rowCount)
          throw new AppError("Convite não encontrado ou já utilizado.", 409);
      } else {
        id = cmd.id;
        const m = (
          await db.query(
            "SELECT * FROM iam_memberships WHERE id=$1 AND organization_id=$2 FOR UPDATE",
            [id, actor.orgId],
          )
        ).rows[0];
        if (!m) throw new AppError("Usuário não encontrado.", 404);
        if (cmd.type === "membership") {
          if (m.revision !== cmd.revision)
            throw new AppError(
              "O acesso foi alterado em outra aba. Atualize a lista.",
              409,
            );
          if (
            m.role === "admin" &&
            m.status === "active" &&
            (cmd.role !== "admin" || cmd.status !== "active")
          ) {
            const count = await db.query(
              "SELECT 1 FROM iam_memberships WHERE organization_id=$1 AND role='admin' AND status='active' AND id<>$2",
              [actor.orgId, id],
            );
            if (!count.rowCount)
              throw new AppError(
                "Mantenha pelo menos uma administradora ativa.",
                409,
              );
          }
          await db.query(
            "UPDATE iam_memberships SET role=$2,status=$3,is_veterinarian=$4,revision=revision+1 WHERE id=$1",
            [
              id,
              cmd.role,
              cmd.status,
              cmd.role === "veterinarian" ||
                (cmd.role === "admin" &&
                  (cmd.isVeterinarian ?? m.is_veterinarian)),
            ],
          );
        } else {
          await db.query(
            "UPDATE iam_memberships SET sessions_valid_after=now(),revision=revision+1 WHERE id=$1",
            [id],
          );
          await db.query(
            "INSERT INTO security_events(action,user_id,organization_id) VALUES('session.clinic_revoked',$1,$2)",
            [m.user_id, actor.orgId],
          );
        }
      }
      await db.query(
        "INSERT INTO audit_log(organization_id,action,entity_id) VALUES($1,$2,$3)",
        [actor.orgId, "iam." + cmd.type, id],
      );
      return { id };
    }),
  );
}
export async function acceptInvitation(
  user: { id: string; email: string; emailVerified: boolean },
  id: string,
) {
  if (!user.emailVerified) throw new AppError("E-mail não verificado.", 403);
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const invitation = (
      await db.query(
        "SELECT * FROM iam_invitations WHERE id=$1 AND email=lower($2) AND status='pending' AND expires_at>now() FOR UPDATE",
        [z.string().uuid().parse(id), user.email],
      )
    ).rows[0];
    if (!invitation)
      throw new AppError(
        "Convite inválido, expirado ou destinado a outro e-mail.",
        403,
      );
    await db.query(
      "INSERT INTO iam_memberships(id,organization_id,user_id,role,is_veterinarian) VALUES($1,$2,$3,$4,$4='veterinarian') ON CONFLICT(organization_id,user_id) DO NOTHING",
      [randomUUID(), invitation.organization_id, user.id, invitation.role],
    );
    await db.query(
      "UPDATE iam_invitations SET status='accepted',accepted_by=$2 WHERE id=$1",
      [id, user.id],
    );
    await db.query(
      "SELECT set_config('app.current_org',$1,true),set_config('app.actor_id',$2,true)",
      [invitation.organization_id, user.id],
    );
    await db.query(
      "INSERT INTO audit_log(organization_id,action,entity_id) VALUES($1,'iam.acceptInvite',$2)",
      [invitation.organization_id, id],
    );
    await db.query("COMMIT");
    return invitation.organization_id as string;
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}
