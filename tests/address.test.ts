import { afterEach, expect, it, vi } from "vitest";
import {
  emptyAddress,
  formatAddress,
  mergePostalAddress,
  tutorAddressSchema,
} from "../src/lib/address";
import {
  cepSchema,
  formatInput,
  maskError,
  maskedEdit,
} from "../src/lib/input-formats";
import { auditValue } from "../src/lib/audit";
const cache = vi.hoisted(() =>
  vi.fn((fn: (...args: unknown[]) => unknown) => fn),
);
vi.mock("next/cache", () => ({ unstable_cache: cache }));
import {
  findPostalCode,
  queryViaCep,
  POSTAL_CODE_REVALIDATE_SECONDS,
} from "../src/server/postal-code";
const via = {
  cep: "01001-000",
  logradouro: "Praça da Sé",
  bairro: "Sé",
  localidade: "São Paulo",
  uf: "SP",
  complemento: "lado ímpar",
};
const found = {
  postalCode: "01001000",
  street: via.logradouro,
  neighborhood: via.bairro,
  city: via.localidade,
  state: via.uf,
};
afterEach(() => vi.unstubAllGlobals());
it("formats, validates and normalizes CEP without losing leading zeroes", () => {
  expect(cepSchema.parse("01001-000")).toBe("01001000");
  expect(cepSchema.parse("")).toBe("");
  expect(formatInput("cep", "01001000")).toBe("01001-000");
  expect(formatInput("cep", "010010")).toBe("01001-0");
  for (const bad of ["0100100", "010010000", "01001-A00"])
    expect(maskError("cep", bad)).not.toBe("");
  expect(
    maskedEdit("cep", "01001-0", "010010", 5, "deleteContentBackward"),
  ).toEqual({ value: "01000", caret: 4 });
});
it("formats canonical addresses, validates the API independently and renders readable audit details", () => {
  const address = tutorAddressSchema.parse({
    ...emptyAddress(),
    ...found,
    postalCode: "01001-000",
    number: " 120 ",
    complement: "apto 2",
    state: "sp",
  });
  expect(formatAddress(address)).toBe(
    "Praça da Sé, 120 · apto 2 · Sé · São Paulo / SP · CEP 01001-000",
  );
  expect(
    tutorAddressSchema.safeParse({ ...address, state: "XX" }).success,
  ).toBe(false);
  expect(
    tutorAddressSchema.safeParse({ ...address, postalCode: "123" }).success,
  ).toBe(false);
  expect(tutorAddressSchema.safeParse({ ...address, street: "" }).success).toBe(
    false,
  );
  expect(auditValue("address_details", address)).toContain(
    "CEP: 01001-000\nRua / logradouro: Praça da Sé\nNúmero: 120",
  );
});
it("preserves number, complement and edits made during a request; ignores a result for an older CEP", () => {
  const started = {
    ...emptyAddress(),
    postalCode: "01001000",
    number: "123",
    complement: "casa B",
  };
  expect(mergePostalAddress(started, found, started)).toMatchObject({
    ...found,
    number: "123",
    complement: "casa B",
  });
  expect(
    mergePostalAddress({ ...started, street: "Rua corrigida" }, found, started)
      .street,
  ).toBe("Rua corrigida");
  const current = { ...started, postalCode: "22041001" };
  expect(mergePostalAddress(current, found, started)).toBe(current);
});
it("looks up only the CEP, caches validated results by CEP and excludes residential complement", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json(via));
  vi.stubGlobal("fetch", fetcher);
  expect(await findPostalCode("01001000")).toEqual(found);
  const [url, options] = fetcher.mock.calls[0];
  expect(url).toBe("https://viacep.com.br/ws/01001000/json/");
  expect(options).toMatchObject({
    cache: "no-store",
    redirect: "error",
    headers: { Accept: "application/json" },
  });
  expect(options.signal).toBeInstanceOf(AbortSignal);
  expect(cache).toHaveBeenCalledWith(queryViaCep, ["vet-home:postal-code:v1"], {
    revalidate: POSTAL_CODE_REVALIDATE_SECONDS,
    tags: ["postal-codes"],
  });
  expect(POSTAL_CODE_REVALIDATE_SECONDS).toBe(86400);
  fetcher.mockClear();
  await expect(findPostalCode("../bad")).rejects.toMatchObject({ status: 400 });
  expect(fetcher).not.toHaveBeenCalled();
});
it("rejects missing CEP, malformed, mismatched, timeout and provider errors before caching", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  for (const data of [{ erro: true }, { erro: "true" }]) {
    fetcher.mockResolvedValue(Response.json(data));
    await expect(queryViaCep("99999999")).rejects.toMatchObject({
      status: 404,
    });
  }
  for (const data of [{ ...via, cep: "99999-999" }, { ...via, uf: "XX" }, {}]) {
    fetcher.mockResolvedValue(Response.json(data));
    await expect(queryViaCep("01001000")).rejects.toMatchObject({
      status: 502,
    });
  }
  fetcher.mockResolvedValue(new Response("bad json"));
  await expect(queryViaCep("01001000")).rejects.toMatchObject({ status: 502 });
  fetcher.mockResolvedValue(new Response("outage", { status: 503 }));
  await expect(queryViaCep("01001000")).rejects.toMatchObject({ status: 503 });
  fetcher.mockRejectedValue(new DOMException("Timeout", "TimeoutError"));
  await expect(queryViaCep("01001000")).rejects.toMatchObject({ status: 503 });
});
it("accepts general municipality CEPs without inventing street or neighborhood", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(Response.json({ ...via, logradouro: "", bairro: "" })),
  );
  expect(await queryViaCep("01001000")).toMatchObject({
    street: "",
    neighborhood: "",
    city: "São Paulo",
  });
});
