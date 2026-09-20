import { afterEach, expect, it, vi } from "vitest";
import {
  generatePrescription,
  PRESCRIPTION_INSTRUCTIONS,
} from "../src/server/gemini";
import {
  prescriptionSuggestionSchema,
  prescriptionMissingFields,
  checkPrescriptionSource,
} from "../src/lib/prescription-ai";
import { rxItemSchema } from "../src/lib/domain";
const source =
  "Medicamento fictício TESTE, apresentação X, dose fictícia Y, via informada Z, frequência informada F, duração informada D, quantidade informada Q. Orientação informada O.";
const item = {
  name: "Medicamento fictício TESTE",
  concentration: "apresentação X",
  dose: "dose fictícia Y",
  route: "via informada Z",
  frequency: "frequência informada F",
  duration: "duração informada D",
  quantity: "quantidade informada Q",
  instructions: "",
};
const result = {
  transcription: "",
  items: [item],
  instructions: "Orientação informada O.",
  warnings: [],
};
const response = (value: unknown = result, finishReason = "STOP") =>
  new Response(
    JSON.stringify({
      candidates: [
        { finishReason, content: { parts: [{ text: JSON.stringify(value) }] } },
      ],
    }),
  );
afterEach(() => vi.unstubAllGlobals());
it("extracts only explicitly provided fields without default dosages", async () => {
  const partial = { ...result, items: [{ ...item, dose: "", quantity: "" }] };
  const fetcher = vi.fn().mockResolvedValue(response(partial));
  vi.stubGlobal("fetch", fetcher);
  expect(await generatePrescription("fake-test-key", { text: source })).toEqual(
    partial,
  );
  expect(prescriptionMissingFields(partial.items)).toEqual([
    "Item 1: Dose",
    "Item 1: Quantidade a dispensar",
  ]);
  expect(rxItemSchema.safeParse(partial.items[0]).success).toBe(false);
  const [url, options] = fetcher.mock.calls[0];
  const body = JSON.parse(options.body);
  expect(url).not.toContain("fake-test-key");
  expect(options.headers["x-goog-api-key"]).toBe("fake-test-key");
  expect(body.systemInstruction.parts[0].text).toBe(PRESCRIPTION_INSTRUCTIONS);
  expect(body.contents[0].parts[0].text).toContain(source);
  expect(body.tools).toBeUndefined();
});
it("rejects invented values, changed dosages, extra properties and incomplete output", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  for (const bad of [
    { ...result, items: [{ ...item, dose: "999 mg inventados" }] },
    { ...result, instructions: "Administrar outro tratamento" },
    { ...result, transcription: source },
    { ...result, items: [] },
    { ...result, items: [{ ...item, patientId: "other" }] },
  ]) {
    fetcher.mockResolvedValue(response(bad));
    await expect(
      generatePrescription("fake", { text: source }),
    ).rejects.toMatchObject({ status: 422 });
  }
  fetcher.mockResolvedValue(response(result, "MAX_TOKENS"));
  await expect(
    generatePrescription("fake", { text: source }),
  ).rejects.toMatchObject({ status: 422 });
  expect(
    prescriptionSuggestionSchema.safeParse({
      ...result,
      items: Array(31).fill(item),
    }).success,
  ).toBe(false);
});
it("requires a transcription for audio and checks extracted values against it", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(response({ ...result, transcription: source }));
  vi.stubGlobal("fetch", fetcher);
  const input = {
    text: "",
    audio: {
      bytes: Buffer.from("RIFF0000WAVEsynthetic"),
      mimeType: "audio/wav",
    },
  };
  expect((await generatePrescription("fake", input)).transcription).toBe(
    source,
  );
  expect(
    JSON.parse(fetcher.mock.calls[0][1].body).contents[0].parts[1].inlineData
      .mimeType,
  ).toBe("audio/wav");
  fetcher.mockResolvedValue(response());
  await expect(generatePrescription("fake", input)).rejects.toMatchObject({
    status: 422,
  });
});
it("preserves units and numbers without matching across separate input sources", () => {
  expect(() =>
    checkPrescriptionSource(
      { ...result, items: [{ ...item, dose: "0,5 mL" }] },
      source,
      false,
    ),
  ).toThrow();
  expect(() =>
    checkPrescriptionSource(
      {
        ...result,
        transcription: "nova dose",
        items: [{ ...item, dose: "Y nova" }],
      },
      source,
      true,
    ),
  ).toThrow();
});
