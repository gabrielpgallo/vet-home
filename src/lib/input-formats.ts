import { z } from "zod";
export type InputMask =
  | "cpf"
  | "cnpj"
  | "document"
  | "phone"
  | "crmv"
  | "sipeagro"
  | "money";
const compact = (value: string) =>
  value
    .trim()
    .replace(/[.\s/()-]/g, "")
    .toUpperCase();
export function validCpf(value: string) {
  if (!/^\d{11}$/.test(value) || /^(\d)\1+$/.test(value)) return false;
  for (let size = 9; size <= 10; size++) {
    const remainder =
      [...value.slice(0, size)].reduce(
        (sum, digit, index) => sum + Number(digit) * (size + 1 - index),
        0,
      ) % 11;
    if (Number(value[size]) !== (remainder < 2 ? 0 : 11 - remainder))
      return false;
  }
  return true;
}
export function validCnpj(value: string) {
  if (!/^[A-Z0-9]{12}\d{2}$/.test(value) || /^(\d)\1+$/.test(value))
    return false;
  for (let size = 12; size <= 13; size++) {
    const sum = [...value.slice(0, size)].reduce(
      (sum, char, index) =>
        sum + (char.charCodeAt(0) - 48) * (((size - index - 1) % 8) + 2),
      0,
    );
    const remainder = sum % 11;
    if (Number(value[size]) !== (remainder < 2 ? 0 : 11 - remainder))
      return false;
  }
  return true;
}
export const cpfSchema = z
  .string()
  .trim()
  .max(30)
  .transform(compact)
  .refine((v) => !v || validCpf(v), "Informe um CPF válido, com 11 dígitos.");
export const cnpjSchema = z
  .string()
  .trim()
  .max(30)
  .transform(compact)
  .refine(
    (v) => !v || validCnpj(v),
    "Informe um CNPJ válido, com 14 caracteres.",
  );
export const documentSchema = z
  .string()
  .trim()
  .max(30)
  .transform(compact)
  .refine(
    (v) => !v || validCpf(v) || validCnpj(v),
    "Informe um CPF ou CNPJ válido.",
  );
export function normalizePhone(value: string) {
  const stripped = value.trim().replace(/[\s().-]/g, "");
  if (/^\+55\d{10,11}$/.test(stripped)) return stripped.slice(3);
  if (/^55\d{10,11}$/.test(stripped)) return stripped.slice(2);
  return stripped;
}
export const phoneSchema = z
  .string()
  .trim()
  .max(60)
  .transform(normalizePhone)
  .refine(
    (v) => !v || /^[1-9]\d(?:[2-5]\d{7}|9\d{8})$/.test(v),
    "Informe telefone brasileiro com DDD: 10 ou 11 dígitos.",
  );
const states =
  "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(
    " ",
  );
export function normalizeCrmv(value: string) {
  const upper = value.trim().toUpperCase().replace(/\s+/g, " ");
  const match = upper.match(
    /^(?:CRMV[\s/-]*)?([A-Z]{2})[\s/-]*([\d.]+)([\s/-]*(?:VP|VS|V|S))?$/,
  );
  if (!match) return upper;
  return `CRMV-${match[1]} ${match[2].replace(/\./g, "")}${match[3] ? "-" + match[3].replace(/[\s/-]/g, "") : ""}`;
}
export const crmvSchema = z
  .string()
  .trim()
  .max(60)
  .transform(normalizeCrmv)
  .refine((v) => {
    const match = v.match(/^CRMV-([A-Z]{2}) (\d{1,10})(?:-(?:VP|VS|V|S))?$/);
    return !!match && states.includes(match[1]) && Number(match[2]) > 0;
  }, "Informe a UF e o número do CRMV. Ex.: CRMV-SP 53181.");
export const sipeagroSchema = z
  .string()
  .trim()
  .max(60)
  .transform((v) => v.toUpperCase().replace(/\s+/g, ""))
  .refine(
    (v) => !v || /^(?:MV\d{11}|\d+(?:[/-](?:\d+|[A-Z]{2}))?)$/.test(v),
    "Confira o registro MAPA/SIPEAGRO. Ex.: MV00000000000.",
  );
export const maskedSchemas = {
  cpf: cpfSchema,
  cnpj: cnpjSchema,
  document: documentSchema,
  phone: phoneSchema,
  crmv: crmvSchema,
  sipeagro: sipeagroSchema,
};
function pattern(value: string, separators: Record<number, string>) {
  return [...value]
    .map((char, index) => (separators[index] || "") + char)
    .join("");
}
export function formatInput(kind: InputMask, value: string): string {
  if (kind === "money") {
    const text = value.trim().replace(/^R\$\s*/i, "");
    if (/^\d{1,3}(?:\.\d{3})+(?:,\d{0,2})?$/.test(text))
      return text.replace(/\./g, "");
    if (/^\d+(?:[.,]\d*)?$/.test(text)) return text.replace(".", ",");
    return value;
  }
  if (kind === "crmv" || kind === "sipeagro") return value.toUpperCase();
  if (kind === "phone") {
    const raw = normalizePhone(value);
    if (!/^\d*$/.test(raw) || raw.length > 11) return value;
    if (!raw) return "";
    const number = raw.slice(2),
      split = number.length > 8 ? 5 : 4;
    return (
      "(" +
      raw.slice(0, 2) +
      (raw.length > 2
        ? ") " +
          number.slice(0, split) +
          (number.length > split ? "-" + number.slice(split) : "")
        : "")
    );
  }
  const raw = compact(value);
  if (!/^[A-Z0-9]*$/.test(raw)) return value;
  const cnpj =
    kind === "cnpj" ||
    (kind === "document" && (raw.length > 11 || /[A-Z]/.test(raw)));
  return cnpj
    ? pattern(raw, { 2: ".", 5: ".", 8: "/", 12: "-" })
    : pattern(raw, { 3: ".", 6: ".", 9: "-" });
}
export function maskError(kind: InputMask, value: string) {
  if (kind === "money")
    return value && !/^\d+(?:[,.]\d{1,2})?$/.test(value)
      ? "Use um valor positivo com até duas casas decimais."
      : "";
  const result = maskedSchemas[kind].safeParse(value);
  return result.success ? "" : result.error.issues[0].message;
}
export function formatOnBlur(kind: InputMask, value: string) {
  if (maskError(kind, value)) return value;
  if (kind === "money")
    return value
      ? Number(value.replace(",", ".")).toFixed(2).replace(".", ",")
      : "";
  return maskedSchemas[kind].parse(value);
}
// Keep cursor position when formatting and deleting punctuation in the middle.
export function maskedEdit(
  kind: InputMask,
  previous: string,
  value: string,
  caret: number,
  inputType?: string,
) {
  if (["money", "crmv", "sipeagro"].includes(kind))
    return { value: formatInput(kind, value), caret };
  const chars = (v: string) => v.replace(/[^A-Za-z0-9+]/g, "");
  let count = chars(value.slice(0, caret)).length;
  if (inputType?.startsWith("delete") && chars(value) === chars(previous)) {
    const raw = chars(value),
      index = inputType === "deleteContentBackward" ? count - 1 : count;
    if (index >= 0) {
      value = raw.slice(0, index) + raw.slice(index + 1);
      if (inputType === "deleteContentBackward") count--;
    }
  }
  const formatted = formatInput(kind, value);
  let position = 0,
    seen = 0;
  while (position < formatted.length && seen < count) {
    if (/[A-Za-z0-9+]/.test(formatted[position])) seen++;
    position++;
  }
  return { value: formatted, caret: position };
}

export function phoneMatches(phone: string, query: string) {
  const digits = query.replace(/[^0-9]/g, "");
  return (
    digits.length >= 2 &&
    /^[\d\s()+.-]+$/.test(query) &&
    normalizePhone(phone).includes(digits)
  );
}

export function parseInput(kind: Exclude<InputMask, "money">, value: string) {
  const result = maskedSchemas[kind].safeParse(value);
  if (!result.success) throw new Error(result.error.issues[0].message);
  return result.data;
}
