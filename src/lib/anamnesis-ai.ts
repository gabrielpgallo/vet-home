import { z } from "zod";

export const AI_TEXT_LIMIT = 20000;
export const AI_AUDIO_LIMIT = 3 * 1024 * 1024;
export const GEMINI_MODEL = "gemini-3.6-flash";
export const anamnesisHeadings = [
  "Queixa principal",
  "Histórico e evolução",
  "Antecedentes e manejo",
  "Exame físico",
  "Avaliação relatada",
  "Conduta relatada",
  "Orientações e acompanhamento",
] as const;
export const aiResultSchema = z
  .object({
    transcription: z.string().max(AI_TEXT_LIMIT),
    sections: z
      .array(
        z
          .object({
            title: z.enum(anamnesisHeadings),
            content: z.string().trim().min(1).max(6000),
          })
          .strict(),
      )
      .min(1)
      .max(7),
    warnings: z.array(z.string().max(1000)).max(10),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.sections.map((s) => s.title)).size ===
      value.sections.length,
  );
export type AiAnamnesisResult = z.infer<typeof aiResultSchema>;
export function formatAnamnesis(result: AiAnamnesisResult) {
  return result.sections
    .map((section) => `${section.title.toUpperCase()}\n${section.content}`)
    .join("\n\n");
}
