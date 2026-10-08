import { unstable_cache } from "next/cache";
import { postalAddressSchema } from "@/lib/address";
import { AppError } from "./db";

export const POSTAL_CODE_REVALIDATE_SECONDS = 86400;

export async function queryViaCep(cep: string) {
  if (!/^\d{8}$/.test(cep)) throw new AppError("Informe um CEP com 8 dígitos.");
  let response: Response;
  try {
    response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      headers: { Accept: "application/json" },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error("provider unavailable");
  } catch {
    throw new AppError(
      "Não foi possível consultar o CEP agora. Preencha o endereço manualmente ou tente novamente.",
      503,
    );
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new AppError(
      "O serviço de CEP retornou uma resposta inválida. Preencha o endereço manualmente.",
      502,
    );
  }
  if (data?.erro === true || data?.erro === "true")
    throw new AppError(
      "CEP não encontrado. Confira os números ou preencha o endereço manualmente.",
      404,
    );
  const result = postalAddressSchema.safeParse({
    postalCode: typeof data?.cep === "string" ? data.cep.replace("-", "") : "",
    street: data?.logradouro,
    neighborhood: data?.bairro,
    city: data?.localidade,
    state: data?.uf,
  });
  if (!result.success || result.data.postalCode !== cep)
    throw new AppError(
      "Não foi possível confirmar o endereço deste CEP. Você pode preencher os campos manualmente.",
      502,
    );
  // ViaCEP's complemento describes a postal range, not the resident's apartment.
  return result.data;
}

// Cache only validated successful results. HTTP 200 with { erro: true }, provider
// failures and malformed responses throw before they can enter the data cache.
// This project does not enable Cache Components; Next Data Cache is managed by
// Vercel across function instances. No process-level Map or cleanup timer is used.
const cachedPostalCode = unstable_cache(
  queryViaCep,
  ["vet-home:postal-code:v1"],
  {
    revalidate: POSTAL_CODE_REVALIDATE_SECONDS,
    tags: ["postal-codes"],
  },
);
export async function findPostalCode(cep: string, signal?: AbortSignal) {
  if (!/^\d{8}$/.test(cep)) throw new AppError("Informe um CEP com 8 dígitos.");
  signal?.throwIfAborted();
  const result = await cachedPostalCode(cep);
  signal?.throwIfAborted();
  return result;
}
