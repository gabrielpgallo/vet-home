import { getOrgId } from "@/server/context";
import { NextResponse } from "next/server";
import { settingsSchema } from "@/lib/settings";
import { withAccess } from "@/server/access";
import { forOrg, AppError } from "@/server/db";
import { apiError } from "@/server/http";
import { normalizeLogo } from "@/server/settings";
export const runtime = "nodejs";
async function handlePOST(req: Request) {
  try {
    if (Number(req.headers.get("content-length") || 0) > 3 * 1024 * 1024)
      throw new AppError("O limite do logo é de 2 MB.", 413);
    const form = await req.formData();
    const data = settingsSchema.parse({
      companyName: form.get("companyName"),
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
        `INSERT INTO practice_settings(organization_id,company_name,veterinarian_name,crmv,logo,revision,sipeagro,phone,email,cnpj,veterinarian_cpf,veterinarian_title)
         VALUES($1,$2,$3,$4,$5,1,COALESCE($8::text,''),COALESCE($9::text,''),COALESCE($10::text,''),COALESCE($11::text,''),COALESCE($12::text,''),COALESCE($13::text,'Dra.'))
         ON CONFLICT(organization_id) DO UPDATE SET company_name=EXCLUDED.company_name,veterinarian_name=EXCLUDED.veterinarian_name,crmv=EXCLUDED.crmv,
         sipeagro=COALESCE($8::text,practice_settings.sipeagro),phone=COALESCE($9::text,practice_settings.phone),email=COALESCE($10::text,practice_settings.email),cnpj=COALESCE($11::text,practice_settings.cnpj),veterinarian_cpf=COALESCE($12::text,practice_settings.veterinarian_cpf),
         veterinarian_title=COALESCE($13::text,practice_settings.veterinarian_title),logo=CASE WHEN $6 THEN NULL WHEN $5::bytea IS NOT NULL THEN $5 ELSE practice_settings.logo END,revision=practice_settings.revision+1,updated_at=now() WHERE practice_settings.revision=$7 RETURNING revision`,
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
      return result.rows[0].revision;
    });
    return NextResponse.json({ revision });
  } catch (e) {
    return apiError(e);
  }
}

export const POST = withAccess("settings.write", handlePOST);
