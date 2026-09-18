import { randomUUID } from "node:crypto";
import { forOrg, AppError } from "./db";
import { getOrgId } from "./context";
import { decryptIntegrationKey } from "./integration-secrets";
import { generateAnamnesis, type AnamnesisInput } from "./gemini";

export async function suggestAnamnesis(
  id: string,
  revision: number,
  input: AnamnesisInput,
  signal?: AbortSignal,
) {
  const org = getOrgId(),
    lease = randomUUID();
  const key = await forOrg(async (db) => {
    const consultation = (
      await db.query(
        "SELECT c.status,c.revision,v.status AS visit_status FROM consultations c JOIN visits v ON v.id=c.visit_id WHERE c.id=$1",
        [id],
      )
    ).rows[0];
    if (!consultation) throw new AppError("Atendimento não encontrado.", 404);
    if (
      consultation.status !== "draft" ||
      consultation.visit_status === "cancelled"
    )
      throw new AppError(
        "A IA está disponível apenas em atendimentos em andamento.",
        409,
      );
    if (consultation.revision !== revision)
      throw new AppError(
        "O atendimento mudou em outra aba. Recarregue antes de usar a IA.",
        409,
      );
    const config = (
      await db.query(
        "SELECT * FROM clinic_ai_settings WHERE organization_id=$1 FOR UPDATE",
        [org],
      )
    ).rows[0];
    if (!config)
      throw new AppError(
        "Cadastre a chave Gemini em Configurações para usar a IA.",
        409,
      );
    if (config.lease_until && config.lease_until.getTime() > Date.now())
      throw new AppError(
        "Há uma geração em andamento nesta clínica. Aguarde um momento.",
        429,
      );
    const freshWindow = config.window_start.getTime() < Date.now() - 3600000;
    if (!freshWindow && config.request_count >= 30)
      throw new AppError(
        "O limite de 30 gerações por hora desta clínica foi atingido. Tente mais tarde.",
        429,
      );
    const decrypted = decryptIntegrationKey(config.encrypted_key, org);
    await db.query(
      "UPDATE clinic_ai_settings SET lease_id=$2,lease_until=now()+interval '60 seconds',window_start=CASE WHEN $3 THEN now() ELSE window_start END,request_count=CASE WHEN $3 THEN 1 ELSE request_count+1 END WHERE organization_id=$1",
      [org, lease, freshWindow],
    );
    return decrypted;
  });
  try {
    const result = await generateAnamnesis(key, input, signal);
    await forOrg(async (db) => {
      const current = (
        await db.query(
          "SELECT status,revision FROM consultations WHERE id=$1",
          [id],
        )
      ).rows[0];
      if (
        !current ||
        current.status !== "draft" ||
        current.revision !== revision
      )
        throw new AppError(
          "O atendimento mudou durante a geração. Nenhum texto foi substituído; recarregue e tente novamente.",
          409,
        );
      await db.query(
        "INSERT INTO audit_log(organization_id,action,entity_id) VALUES($1,$2,$3)",
        [org, input.audio ? "ai.anamnesis.audio" : "ai.anamnesis.text", id],
      );
    });
    return result;
  } finally {
    await forOrg((db) =>
      db.query(
        "UPDATE clinic_ai_settings SET lease_id=NULL,lease_until=NULL WHERE organization_id=$1 AND lease_id=$2",
        [org, lease],
      ),
    );
  }
}
