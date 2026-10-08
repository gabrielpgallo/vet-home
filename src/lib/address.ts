import { z } from "zod";
import { cepSchema, formatInput } from "./input-formats";
export const brazilianStates =
  "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(
    " ",
  );
export const addressFields = [
  ["street", "Rua / logradouro"],
  ["number", "Número"],
  ["complement", "Complemento"],
  ["neighborhood", "Bairro"],
  ["city", "Cidade"],
  ["state", "UF"],
] as const;
export type TutorAddress = {
  postalCode: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
};
export const emptyAddress = (): TutorAddress => ({
  postalCode: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
});
export function formatAddress(address: TutorAddress) {
  const locality = [address.city.trim(), address.state.trim()]
    .filter(Boolean)
    .join(" / ");
  return [
    [address.street.trim(), address.number.trim()].filter(Boolean).join(", "),
    address.complement.trim(),
    address.neighborhood.trim(),
    locality,
    address.postalCode ? `CEP ${formatInput("cep", address.postalCode)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
export const tutorAddressSchema = z
  .object({
    postalCode: cepSchema,
    street: z.string().trim().min(1, "Informe a rua ou logradouro.").max(180),
    number: z.string().trim().max(30),
    complement: z.string().trim().max(100),
    neighborhood: z.string().trim().max(100),
    city: z.string().trim().max(100),
    state: z
      .string()
      .trim()
      .toUpperCase()
      .refine(
        (v) => !v || brazilianStates.includes(v),
        "Informe uma UF válida.",
      ),
  })
  .strict()
  .refine(
    (v) => formatAddress(v).length <= 500,
    "O endereço completo deve ter até 500 caracteres.",
  );
export const postalAddressSchema = z
  .object({
    postalCode: z.string().regex(/^\d{8}$/),
    street: z.string().max(180),
    neighborhood: z.string().max(100),
    city: z.string().min(1).max(100),
    state: z.string().refine((v) => brazilianStates.includes(v)),
  })
  .strict();
export type PostalAddress = z.infer<typeof postalAddressSchema>;
export const normalizeCep = (value: string) =>
  value.trim().replace(/[\s-]/g, "");
// A delayed lookup must never undo edits made while it was in flight.
export function mergePostalAddress(
  current: TutorAddress,
  found: PostalAddress,
  started: TutorAddress,
): TutorAddress {
  if (normalizeCep(current.postalCode) !== found.postalCode) return current;
  const next = { ...current };
  for (const key of ["street", "neighborhood", "city", "state"] as const)
    if (current[key] === started[key]) next[key] = found[key];
  return next;
}
