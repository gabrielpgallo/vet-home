import {
  cpfSchema,
  crmvSchema,
  sipeagroSchema,
  phoneSchema,
  cnpjSchema,
} from "./input-formats";
import { z } from "zod";
import { DEFAULT_PRIMARY_COLOR, HEX_COLOR } from "./brand-color";
export const defaultSettings = {
  companyName: "IR Saúde Animal",
  primaryColor: DEFAULT_PRIMARY_COLOR,
  veterinarianName: "Isabelli Ricordi",
  veterinarianTitle: "Dra." as "Dra." | "Dr.",
  crmv: "CRMV-SP 53.181",
  sipeagro: "",
  phone: "",
  email: "",
  cnpj: "",
  veterinarianCpf: "",
  hasLogo: false,
  hasGeminiKey: false,
  revision: 0,
};
export const settingsSchema = z
  .object({
    companyName: z.string().trim().min(1).max(150),
    primaryColor: z
      .string()
      .trim()
      .regex(HEX_COLOR)
      .transform((value) => value.toLowerCase())
      .optional(),
    veterinarianName: z.string().trim().min(1).max(120),
    veterinarianTitle: z.enum(["Dra.", "Dr."]).optional(),
    crmv: crmvSchema,
    sipeagro: sipeagroSchema.optional(),
    phone: phoneSchema.optional(),
    email: z.union([z.literal(""), z.email().max(150)]).optional(),
    cnpj: cnpjSchema.optional(),
    veterinarianCpf: cpfSchema.optional(),
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
