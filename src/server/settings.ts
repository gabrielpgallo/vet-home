import { getOrgId } from "@/server/context";
import type { PoolClient } from "pg";
import sharp from "sharp";
import { defaultSettings, type PracticeSettings } from "@/lib/settings";
import { AppError, forOrg } from "./db";
export type PracticeBrand = PracticeSettings & { logo: Buffer | null };
export async function readSettings(db: PoolClient): Promise<PracticeBrand> {
  const row = (
    await db.query(
      "SELECT company_name,veterinarian_name,crmv,sipeagro,logo,revision FROM practice_settings WHERE organization_id=$1",
      [getOrgId()],
    )
  ).rows[0];
  return row
    ? {
        companyName: row.company_name,
        veterinarianName: row.veterinarian_name,
        crmv: row.crmv,
        sipeagro: row.sipeagro,
        hasLogo: !!row.logo,
        revision: row.revision,
        logo: row.logo,
      }
    : { ...defaultSettings, logo: null };
}
export const loadBrand = () => forOrg(readSettings);
export async function normalizeLogo(buffer: Buffer) {
  if (!buffer.length || buffer.length > 2 * 1024 * 1024)
    throw new AppError("Selecione um logo PNG ou JPEG de até 2 MB.");
  try {
    const image = sharp(buffer, { limitInputPixels: 16_000_000 });
    const metadata = await image.metadata();
    if (
      !["png", "jpeg"].includes(metadata.format || "") ||
      (metadata.pages || 1) > 1
    )
      throw Error("format");
    return await image
      .rotate()
      .resize({
        width: 600,
        height: 600,
        fit: "inside",
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();
  } catch {
    throw new AppError(
      "Não foi possível ler o logo. Use PNG ou JPEG com até 16 milhões de pixels.",
    );
  }
}
