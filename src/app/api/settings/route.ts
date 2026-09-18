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
      crmv: form.get("crmv"),
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
        `INSERT INTO practice_settings(organization_id,company_name,veterinarian_name,crmv,logo,revision) VALUES($1,$2,$3,$4,$5,1) ON CONFLICT(organization_id) DO UPDATE SET company_name=EXCLUDED.company_name,veterinarian_name=EXCLUDED.veterinarian_name,crmv=EXCLUDED.crmv,logo=CASE WHEN $6 THEN NULL WHEN $5::bytea IS NOT NULL THEN $5 ELSE practice_settings.logo END,revision=practice_settings.revision+1,updated_at=now() WHERE practice_settings.revision=$7 RETURNING revision`,
        [
          getOrgId(),
          data.companyName,
          data.veterinarianName,
          data.crmv,
          logo,
          remove,
          data.revision,
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
