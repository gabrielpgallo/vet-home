import { expenseSchema } from "./finance-schema";
import { z } from "zod";
export const ORG_ID = process.env.APP_ORG_ID || "ar-saude-animal";
export const units = ["mL", "dose", "unidade", "comprimido", "g"] as const;
export const paymentMethods = [
  "Pix",
  "Dinheiro",
  "Crédito",
  "Débito",
  "Link de pagamento",
] as const;
export const vitalFields = [
  ["weight", "Peso", "kg"],
  ["temperature", "Temperatura", "°C"],
  ["heartRate", "Freq. cardíaca", "bpm"],
  ["respiratoryRate", "Freq. respiratória", "irpm"],
  ["systolic", "Pressão sistólica", "mmHg"],
  ["diastolic", "Pressão diastólica", "mmHg"],
] as const;
export function parseFixed(value: string, decimals = 2): number {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(normalized))
    throw Error("Informe um número positivo, sem separador de milhares.");
  const [whole, fraction = ""] = normalized.split(".");
  if (fraction.length > decimals)
    throw Error(`Use no máximo ${decimals} casas decimais.`);
  const result =
    Number(whole) * 10 ** decimals + Number(fraction.padEnd(decimals, "0"));
  if (!Number.isSafeInteger(result) || result > 1_000_000_000)
    throw Error("Valor acima do limite permitido.");
  return result;
}
export function applicationTotal(
  quantityMilli: number,
  saleCents: number,
): number {
  if (
    !Number.isSafeInteger(quantityMilli) ||
    quantityMilli <= 0 ||
    !Number.isSafeInteger(saleCents) ||
    saleCents < 0
  )
    throw Error("Quantidade ou preço inválido.");
  const result = Number(
    (BigInt(quantityMilli) * BigInt(saleCents) + 500n) / 1000n,
  );
  if (result > 1_000_000_000) throw Error("Valor acima do limite permitido.");
  return result;
}
export const money = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    cents / 100,
  );
export const dateLabel = (value: string) =>
  new Date(
    value.length === 10 ? value + "T12:00:00-03:00" : value,
  ).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
export const dateKey = (value: Date | string = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
export const timeLabel = (value: string) =>
  new Date(value).toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });
const id = z.string().uuid(),
  short = z.string().trim().max(200),
  text = z.string().max(50000),
  cents = z.number().int().min(0).max(1_000_000_000);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v + "T12:00:00Z").toISOString().startsWith(v),
    "Data inválida",
  );
export const tutorSchema = z
  .object({
    name: short.min(1),
    phone: short,
    email: z.union([z.literal(""), z.email()]),
    address: z.string().trim().min(1).max(500),
  })
  .strict();
export const patientSchema = z
  .object({
    tutorId: id,
    name: short.min(1),
    species: z.enum(["Cão", "Gato", "Não informada"]),
    breed: short,
    sex: z.enum(["Macho", "Fêmea", "Não informado"]),
    birthDate: date.nullable(),
    notes: text,
  })
  .strict();
export const productSchema = z
  .object({
    name: short.min(1),
    unit: z.enum(units),
    costCents: cents,
    saleCents: cents,
  })
  .strict();
export const rxItemSchema = z
  .object({
    name: short.min(1),
    concentration: short.min(1),
    dose: short.min(1),
    route: short.min(1),
    frequency: short.min(1),
    duration: short.min(1),
    quantity: short.min(1),
    instructions: z.string().max(2000),
  })
  .strict();
export const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("expense.create"), data: expenseSchema }).strict(),
  z
    .object({
      type: z.literal("expense.update"),
      id,
      revision: z.number().int().min(0),
      data: expenseSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("expense.void"),
      id,
      revision: z.number().int().min(0),
    })
    .strict(),
  z
    .object({
      type: z.literal("tutor.create"),
      data: tutorSchema,
      patientNames: z.array(short.min(1)).max(20).default([]),
    })
    .strict(),
  z.object({ type: z.literal("tutor.update"), id, data: tutorSchema }).strict(),
  z.object({ type: z.literal("patient.create"), data: patientSchema }).strict(),
  z
    .object({ type: z.literal("patient.update"), id, data: patientSchema })
    .strict(),
  z.object({ type: z.literal("product.create"), data: productSchema }).strict(),
  z
    .object({ type: z.literal("product.update"), id, data: productSchema })
    .strict(),
  z
    .object({
      type: z.literal("visit.create"),
      tutorId: id,
      patientIds: z.array(id).min(1).max(20),
      date,
      time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      duration: z.number().int().min(15).max(480),
      address: z.string().trim().min(1).max(500),
      baseCents: cents,
      reason: z.string().max(2000),
    })
    .strict(),
  z.object({ type: z.literal("visit.cancel"), id }).strict(),
  z
    .object({
      type: z.literal("consultation.start"),
      visitId: id,
      patientId: id,
    })
    .strict(),
  z
    .object({
      type: z.literal("consultation.save"),
      id,
      revision: z.number().int().min(0),
      notes: text,
      vitals: z
        .object({
          weight: short.optional(),
          temperature: short.optional(),
          heartRate: short.optional(),
          respiratoryRate: short.optional(),
          systolic: short.optional(),
          diastolic: short.optional(),
        })
        .strict(),
      complete: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      type: z.literal("application.create"),
      consultationId: id,
      productId: id,
      quantityMilli: z.number().int().min(1).max(1_000_000_000),
      batch: short,
      route: short,
    })
    .strict(),
  z
    .object({
      type: z.literal("prescription.create"),
      consultationId: id,
      items: z.array(rxItemSchema).min(1).max(30),
      instructions: z.string().max(5000),
    })
    .strict(),
  z
    .object({
      type: z.literal("exam.order"),
      patientId: id,
      consultationId: id.nullable(),
      name: short.min(1),
      mode: z.enum([
        "Coleta pela veterinária",
        "Encaminhamento a outro profissional",
      ]),
      partner: short,
      notes: z.string().max(5000),
      date,
    })
    .strict(),
  z
    .object({ type: z.literal("exam.link"), examId: id, consultationId: id })
    .strict(),
  z
    .object({
      type: z.literal("note.create"),
      patientId: id,
      consultationId: id.nullable(),
      text: text.min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("payment.create"),
      visitId: id,
      amountCents: cents.min(1),
      method: z.enum(paymentMethods),
    })
    .strict(),
]);
export type Command = z.infer<typeof commandSchema>;
export type RxItem = z.infer<typeof rxItemSchema>;
export const uploadSchema = z
  .object({
    patientId: id,
    consultationId: id.nullable(),
    requestId: id.nullable(),
    name: short.min(1),
    notes: z.string().max(5000),
    date,
  })
  .strict();
