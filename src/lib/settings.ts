import { z } from "zod";
export const defaultSettings = {
  companyName: "IR Saúde Animal",
  veterinarianName: "Isabelli Ricordi",
  crmv: "CRMV-SP 53.181",
  hasLogo: false,
  revision: 0,
};
export const settingsSchema = z
  .object({
    companyName: z.string().trim().min(1).max(150),
    veterinarianName: z.string().trim().min(1).max(120),
    crmv: z.string().trim().min(1).max(60),
    revision: z.number().int().min(0),
  })
  .strict();
export type PracticeSettings = typeof defaultSettings;
