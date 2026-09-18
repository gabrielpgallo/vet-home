import { z } from "zod";
export const expenseCategories = [
  "Combustível",
  "Estacionamento / pedágio",
  "Laboratório",
  "Taxas de pagamento",
  "Materiais e serviços",
  "Compra de produtos",
  "Outras despesas",
] as const;
export const financialDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + "T12:00:00Z");
    return !Number.isNaN(d.valueOf()) && d.toISOString().startsWith(v);
  }, "Data inválida");
export const expenseSchema = z
  .object({
    description: z.string().trim().min(1).max(240),
    category: z.enum(expenseCategories),
    amountCents: z.number().int().min(1).max(1_000_000_000),
    occurredOn: financialDate,
    paidOn: financialDate.nullable(),
    visitId: z.string().uuid().nullable(),
    notes: z.string().max(3000),
  })
  .strict();
export const financeRangeSchema = z
  .object({ start: financialDate, end: financialDate })
  .strict()
  .refine(
    (v) => v.start <= v.end,
    "O início deve ser anterior ou igual ao fim.",
  )
  .refine(
    (v) => (Date.parse(v.end) - Date.parse(v.start)) / 86400000 <= 365,
    "Selecione um período de até 366 dias.",
  );
export type FinanceRange = z.infer<typeof financeRangeSchema>;
