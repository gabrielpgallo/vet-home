import { cpfSchema, crmvSchema, sipeagroSchema } from "./input-formats";
import { z } from "zod";
export const professionalFields = z
  .object({
    veterinarianName: z.string().trim().min(1).max(120),
    veterinarianTitle: z.enum(["Dra.", "Dr."]),
    crmv: crmvSchema,
    sipeagro: sipeagroSchema,
    veterinarianCpf: cpfSchema,
  })
  .strict();
export const professionalSchema = professionalFields.extend({
  revision: z.number().int().nonnegative(),
});
export type ProfessionalProfile = z.infer<typeof professionalSchema>;
