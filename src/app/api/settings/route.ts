import { getOrgId } from "@/server/context";
import { NextResponse } from "next/server";
import { settingsSchema } from "@/lib/settings";
import { withAccess } from "@/server/access";
import { forOrg, AppError } from "@/server/db";
import { apiError } from "@/server/http";
import { normalizeLogo } from "@/server/settings";
import { z } from "zod";
import { encryptIntegrationKey } from "@/server/integration-secrets";
export const runtime = "nodejs";
async function handlePOST(req: Request) {
  try {
    if (Number(req.headers.get("content-length") || 0) > 3 * 1024 * 1024)
      throw new AppError("O limite do logo é de 2 MB.", 413);
    const form = await req.formData();
    const geminiKey = z
      .string()
      .trim()
      .max(200)
      .regex(/^[A-Za-z0-9_.-]*$/)
      .parse(form.get("geminiApiKey") ?? "");
    const removeGeminiKey = form.get("removeGeminiKey") === "true";
    if (geminiKey && geminiKey.length < 20)
      throw new AppError("Confira a chave de API do Gemini.");
    if (geminiKey && removeGeminiKey)
      throw new AppError("Escolha remover ou substituir a chave Gemini.");
    const encryptedKey = geminiKey
      ? encryptIntegrationKey(geminiKey, getOrgId())
      : null;
    const data = settingsSchema.parse({
      companyName: form.get("companyName"),
      primaryColor: form.get("primaryColor") ?? undefined,
      veterinarianName: form.get("veterinarianName"),
      veterinarianTitle: form.get("veterinarianTitle") ?? undefined,
      crmv: form.get("crmv"),
      sipeagro: form.get("sipeagro") ?? undefined,
      phone: form.get("phone") ?? undefined,
      email: form.get("email") ?? undefined,
      cnpj: form.get("cnpj") ?? undefined,
      veterinarianCpf: form.get("veterinarianCpf") ?? undefined,
      revision: Number(form.get("revision")),
    });
    const file = form.get("logo"),
      remove = form.get("removeLogo") === "true";
    const logo =
      file instanceof File && file.size
        ? await normalizeLogo(Buffer.from(await file.arrayBuffer()))
        : null;
    if (remove && logo)
      throw new AppError("Escolha remover ou substituir o logo.");
    const revision = await forOrg(async (db) => {
      const result = await db.query(
        `INSERT INTO practice_settings(organization_id,company_name,veterinarian_name,crmv,logo,revision,sipeagro,phone,email,cnpj,veterinarian_cpf,veterinarian_title,primary_color)
         VALUES($1,$2,$3,$4,$5,1,COALESCE($8::text,''),COALESCE($9::text,''),COALESCE($10::text,''),COALESCE($11::text,''),COALESCE($12::text,''),COALESCE($13::text,'Dra.'),COALESCE($14::text,'#245bdb'))
         ON CONFLICT(organization_id) DO UPDATE SET company_name=EXCLUDED.company_name,veterinarian_name=EXCLUDED.veterinarian_name,crmv=EXCLUDED.crmv,
         sipeagro=COALESCE($8::text,practice_settings.sipeagro),phone=COALESCE($9::text,practice_settings.phone),email=COALESCE($10::text,practice_settings.email),cnpj=COALESCE($11::text,practice_settings.cnpj),veterinarian_cpf=COALESCE($12::text,practice_settings.veterinarian_cpf),
         primary_color=COALESCE($14::text,practice_settings.primary_color),veterinarian_title=COALESCE($13::text,practice_settings.veterinarian_title),logo=CASE WHEN $6 THEN NULL WHEN $5::bytea IS NOT NULL THEN $5 ELSE practice_settings.logo END,revision=practice_settings.revision+1,updated_at=now() WHERE practice_settings.revision=$7 RETURNING revision`,
        [
          getOrgId(),
          data.companyName,
          data.veterinarianName,
          data.crmv,
          logo,
          remove,
          data.revision,
          data.sipeagro ?? null,
          data.phone ?? null,
          data.email ?? null,
          data.cnpj ?? null,
          data.veterinarianCpf ?? null,
          data.veterinarianTitle ?? null,
          data.primaryColor ?? null,
        ],
      );
      if (!result.rowCount)
        throw new AppError(
          "As configurações mudaram em outra aba. Recarregue antes de salvar.",
          409,
        );
      await db.query(
        "INSERT INTO audit_log(organization_id,action,entity_id) VALUES($1,'settings.update',$1)",
        [getOrgId()],
      );
      if (removeGeminiKey)
        await db.query(
          "DELETE FROM clinic_ai_settings WHERE organization_id=$1",
          [getOrgId()],
        );
      if (encryptedKey)
        await db.query(
          "INSERT INTO clinic_ai_settings(organization_id,encrypted_key) VALUES($1,$2) ON CONFLICT(organization_id) DO UPDATE SET encrypted_key=EXCLUDED.encrypted_key,updated_at=now()",
          [getOrgId(), encryptedKey],
        );
      if (removeGeminiKey || encryptedKey)
        await db.query(
          "INSERT INTO audit_log(organization_id,action,entity_id) VALUES($1,$2,$1)",
          [
            getOrgId(),
            removeGeminiKey ? "gemini.key.remove" : "gemini.key.update",
          ],
        );
      return result.rows[0].revision;
    });
    return NextResponse.json({ revision });
  } catch (e) {
    return apiError(e);
  }
}

export const POST = withAccess("settings.write", handlePOST);
