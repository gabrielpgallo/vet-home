import { z } from "zod";
import { AI_TEXT_LIMIT } from "./anamnesis-ai";
import type { RxItem } from "./domain";
export const prescriptionFields = [
  ["name", "Medicamento"],
  ["concentration", "Concentração / apresentação"],
  ["dose", "Dose"],
  ["route", "Via"],
  ["frequency", "Frequência"],
  ["duration", "Duração"],
  ["quantity", "Quantidade a dispensar"],
  ["instructions", "Instruções do item"],
] as const satisfies readonly (readonly [keyof RxItem, string])[];
const field = z.string().trim().max(200);
// Suggestions may be incomplete; the ordinary prescription schema remains strict on save.
export const prescriptionSuggestionSchema = z
  .object({
    transcription: z.string().max(AI_TEXT_LIMIT),
    items: z
      .array(
        z
          .object({
            name: field,
            concentration: field,
            dose: field,
            route: field,
            frequency: field,
            duration: field,
            quantity: field,
            instructions: z.string().trim().max(2000),
          })
          .strict()
          .refine((item) => Object.values(item).some(Boolean)),
      )
      .min(1)
      .max(30),
    instructions: z.string().trim().max(5000),
    warnings: z.array(z.string().trim().min(1).max(1000)).max(10),
  })
  .strict();
export type PrescriptionSuggestion = z.infer<
  typeof prescriptionSuggestionSchema
>;
export function prescriptionMissingFields(items: RxItem[]) {
  return items.flatMap((item, index) =>
    prescriptionFields
      .filter(([key]) => key !== "instructions" && !item[key].trim())
      .map(([, label]) => `Item ${index + 1}: ${label}`),
  );
}
// Values are extracted verbatim, never filled with inferred drug names, dosages or conversions.
export function checkPrescriptionSource(
  result: PrescriptionSuggestion,
  text: string,
  hasAudio: boolean,
) {
  if (hasAudio ? !result.transcription.trim() : !!result.transcription)
    throw Error("invalid transcription");
  const normalize = (value: string) =>
    value
      .normalize("NFKC")
      .toLocaleLowerCase("pt-BR")
      .replace(/\s+/g, " ")
      .trim();
  const sources = [normalize(text), normalize(result.transcription)];
  for (const value of [
    ...result.items.flatMap((item) => Object.values(item)),
    result.instructions,
  ])
    if (value && !sources.some((source) => source.includes(normalize(value))))
      throw Error("unsupported prescription field");
  return result;
}
