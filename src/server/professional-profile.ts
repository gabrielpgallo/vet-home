import type { PoolClient } from "pg";
import { isVeterinarian } from "@/lib/permissions";
import {
  professionalSchema,
  type ProfessionalProfile,
} from "@/lib/professional-profile";
import { requestIdentity, getOrgId } from "./context";
import { AppError, forOrg } from "./db";
export function requireVeterinarian() {
  const actor = requestIdentity.getStore();
  if (!isVeterinarian(actor))
    throw new AppError(
      "Somente usuários habilitados como veterinários podem emitir receitas.",
      403,
    );
  return actor!;
}
export async function readProfessionalProfile(
  db: PoolClient,
): Promise<ProfessionalProfile | null> {
  const actor = requestIdentity.getStore();
  if (!actor) return null;
  const row = (
    await db.query(
      `SELECT veterinarian_name AS "veterinarianName",veterinarian_title AS "veterinarianTitle",crmv,sipeagro,veterinarian_cpf AS "veterinarianCpf",revision FROM professional_profiles WHERE user_id=$1`,
      [actor.userId],
    )
  ).rows[0];
  return row || null;
}
export async function saveProfessionalProfile(input: unknown) {
  const actor = requireVeterinarian(),
    data = professionalSchema.parse(input);
  return forOrg(async (db) => {
    const result = await db.query(
      `INSERT INTO professional_profiles(organization_id,user_id,veterinarian_name,veterinarian_title,crmv,sipeagro,veterinarian_cpf)
 SELECT $1,$2,$3,$4,$5,$6,$7 WHERE $8=0 OR EXISTS(SELECT 1 FROM professional_profiles WHERE user_id=$2)
 ON CONFLICT(organization_id,user_id) DO UPDATE SET veterinarian_name=EXCLUDED.veterinarian_name,veterinarian_title=EXCLUDED.veterinarian_title,crmv=EXCLUDED.crmv,sipeagro=EXCLUDED.sipeagro,veterinarian_cpf=EXCLUDED.veterinarian_cpf,revision=professional_profiles.revision+1
 WHERE professional_profiles.revision=$8 RETURNING revision`,
      [
        getOrgId(),
        actor.userId,
        data.veterinarianName,
        data.veterinarianTitle,
        data.crmv,
        data.sipeagro,
        data.veterinarianCpf,
        data.revision,
      ],
    );
    if (!result.rowCount)
      throw new AppError(
        "Seu cadastro mudou em outra aba. Recarregue antes de salvar.",
        409,
      );
    return result.rows[0];
  });
}
export async function prescriptionAuthor(db: PoolClient) {
  const actor = requireVeterinarian();
  const profile = await readProfessionalProfile(db);
  if (!profile)
    throw new AppError(
      "Complete seu cadastro em Configurações → Meu perfil veterinário antes de emitir receitas.",
      409,
    );
  const { revision, ...snapshot } = profile;
  void revision;
  return { id: actor.userId, snapshot };
}
export function requirePrescriptionOwner(rx: { prescriber_id: string | null }) {
  const actor = requireVeterinarian();
  if (!rx.prescriber_id)
    throw new AppError(
      "Esta receita é anterior ao cadastro de autoria. Emita uma nova receita com seu perfil para assinar.",
      409,
    );
  if (rx.prescriber_id !== actor.userId)
    throw new AppError(
      "Somente o veterinário que emitiu esta receita pode assiná-la.",
      403,
    );
}
