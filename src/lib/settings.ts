import { z } from "zod";
export const defaultSettings = {
  companyName: "IR Saúde Animal",
  veterinarianName: "Isabelli Ricordi",
  veterinarianTitle: "Dra." as "Dra." | "Dr.",
  crmv: "CRMV-SP 53.181",
  sipeagro: "",
  phone: "",
  email: "",
  cnpj: "",
  veterinarianCpf: "",
  hasLogo: false,
  revision: 0,
};
export const settingsSchema = z
  .object({
    companyName: z.string().trim().min(1).max(150),
    veterinarianName: z.string().trim().min(1).max(120),
    veterinarianTitle: z.enum(["Dra.", "Dr."]).optional(),
    crmv: z.string().trim().min(1).max(60),
    sipeagro: z.string().trim().max(60).optional(),
    phone: z.string().trim().max(60).optional(),
    email: z.union([z.literal(""), z.email().max(150)]).optional(),
    cnpj: z.string().trim().max(30).optional(),
    veterinarianCpf: z.string().trim().max(20).optional(),
    revision: z.number().int().min(0),
  })
  .strict();
export type PracticeSettings = typeof defaultSettings;

export function veterinarianDisplayName(
  settings: Pick<PracticeSettings, "veterinarianName" | "veterinarianTitle">,
) {
  const name = settings.veterinarianName
    .trim()
    .replace(/^(?:dra?\.?\s+)+/i, "");
  return `${settings.veterinarianTitle} ${name}`;
}
