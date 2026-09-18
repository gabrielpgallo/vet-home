import { expect, it } from "vitest";
import { inflateSync } from "node:zlib";
import { defaultSettings, veterinarianDisplayName } from "../src/lib/settings";
import { patientAge } from "../src/server/clinical-document";
import { createPrescriptionPdf } from "../src/server/prescription-pdf";
import { createExamRequestPdf } from "../src/server/exam-pdf";

// Decode PDFKit's WinAnsi text streams without a platform-specific PDF executable.
function inspect(pdf: Buffer) {
  const raw = pdf.toString("latin1");
  // Use the declared byte length: a compressed stream may itself end in CR/LF.
  const streams = [
    ...raw.matchAll(
      /\/Length (\d+)\s+\/Filter \/FlateDecode\s+>>\s*stream\r?\n/g,
    ),
  ].map((match) => {
    const start = match.index! + match[0].length;
    return inflateSync(pdf.subarray(start, start + Number(match[1]))).toString(
      "latin1",
    );
  });
  const text = streams
    .map((stream) =>
      [...stream.matchAll(/\[([^\]]*)\]\s*TJ/g)]
        .map((line) =>
          [...line[1].matchAll(/<([\da-f]+)>/gi)]
            .map((chunk) => Buffer.from(chunk[1], "hex").toString("latin1"))
            .join(""),
        )
        .join("\n"),
    )
    .join("\n");
  return {
    text,
    compact: text.replace(/\s+/g, ""),
    pages: [...raw.matchAll(/\/Type \/Page\b/g)].length,
  };
}
const patient = {
  patient: "Luna",
  species: "Cão",
  breed: "Border Collie",
  sex: "Fêmea",
  birthDate: "2021-05-18",
  weight: "16,2",
  tutor: "Ana Oliveira",
  phone: "(16) 90000-0001",
  document: "000.000.000-00",
  address: "Rua de teste, 120",
};
const brand = {
  ...defaultSettings,
  logo: null,
  sipeagro: "00000/2026",
  phone: "(16) 90000-0000",
  email: "teste@example.com",
  cnpj: "00.000.000/0000-00",
  veterinarianCpf: "000.000.000-00",
};
const item = {
  name: "Medicamento demonstrativo",
  concentration: "100 mg",
  dose: "1 comprimido",
  route: "Oral",
  frequency: "A cada 12 horas",
  duration: "7 dias",
  quantity: "1 caixa",
  instructions: "Exemplo fictício, sem validade clínica.",
};
const rx = {
  ...patient,
  id: "00000000-0000-4000-8000-000000000001",
  createdAt: "2026-09-18T12:00:00Z",
  items: [item, item, item],
  instructions: "Orientações adicionais.",
};

it("usa o tratamento escolhido sem duplicar títulos já digitados no nome", async () => {
  expect(
    veterinarianDisplayName({
      veterinarianName: "Dra. Isabelli Ricordi",
      veterinarianTitle: "Dra.",
    }),
  ).toBe("Dra. Isabelli Ricordi");
  const female = inspect(await createPrescriptionPdf(rx, brand));
  expect(female.text).toContain("Dra. Isabelli Ricordi");
  expect(female.text).toContain("Médica veterinária");
  const male = inspect(
    await createPrescriptionPdf(rx, {
      ...brand,
      veterinarianTitle: "Dr.",
      veterinarianName: "Dr. João Teste",
    }),
  );
  expect(male.text).toContain("Dr. João Teste");
  expect(male.text).toContain("Médico veterinário");
  expect(male.text).not.toContain("Dr. Dr.");
});

it("calcula a idade na data do documento, inclusive antes do aniversário e em São Paulo", () => {
  expect(patientAge("2021-05-18", "2026-09-18")).toBe("5 anos e 4 meses");
  expect(patientAge("2021-05-18", "2026-05-17")).toBe("4 anos e 11 meses");
  expect(patientAge("2021-05-18", "2026-05-18T01:00:00Z")).toBe(
    "4 anos e 11 meses",
  );
  expect(patientAge("2026-09-18", "2026-09-18")).toBe("Menos de 1 mês");
  expect(patientAge(null, "2026-09-18")).toBe("");
  expect(patientAge("2026-10-01", "2026-09-18")).toBe("");
});
it("acomoda três itens em uma página, com identificação e registros profissionais", async () => {
  const result = inspect(await createPrescriptionPdf(rx, brand));
  expect(result.pages).toBe(1);
  for (const text of [
    "Luna",
    "Ana Oliveira",
    "16,2 kg",
    "5 anos e 4 meses",
    brand.sipeagro,
    brand.email,
    brand.cnpj,
    "Rascunho",
    "Orientações adicionais.",
  ])
    expect(result.text).toContain(text);
  expect(result.text.match(/Medicamento demonstrativo/g)).toHaveLength(3);
  expect(result.text).not.toContain("Espaço reservado");
});
it("preserva todos os itens e o final das orientações em documentos extensos", async () => {
  const result = inspect(
    await createPrescriptionPdf(
      {
        ...rx,
        items: Array.from({ length: 30 }, (_, i) => ({
          ...item,
          name: `Item ${i + 1}`,
          instructions: "Orientação longa. ".repeat(110) + `FIM-ITEM-${i + 1}`,
        })),
        instructions: "Acompanhamento. ".repeat(300) + "FIM-RECEITA",
      },
      brand,
    ),
  );
  expect(result.pages).toBeGreaterThan(1);
  for (let i = 1; i <= 30; i++)
    expect(result.compact).toContain(`FIM-ITEM-${i}`);
  expect(result.compact).toContain("FIM-RECEITA");
  expect(result.text.match(/Documento sem assinatura digital\./g)).toHaveLength(
    result.pages,
  );
  expect(result.text.match(/MAPA \/ SIPEAGRO/g)).toHaveLength(result.pages);
  for (let i = 1; i <= result.pages; i++)
    expect(result.compact).toContain(`${i}/${result.pages}`);
});
it("omite dados opcionais vazios e não imprime MAPA nos pedidos de exame", async () => {
  const empty = inspect(
    await createPrescriptionPdf(
      { ...rx, document: "", phone: "", birthDate: null, weight: null },
      { ...defaultSettings, logo: null },
    ),
  );
  for (const text of ["CPF", "CNPJ", "MAPA", "Peso:", "Idade:", "Tel.:"])
    expect(empty.text).not.toContain(text);
  const exam = inspect(
    await createExamRequestPdf(
      {
        ...patient,
        id: rx.id,
        name: "Ultrassonografia abdominal",
        mode: "Encaminhamento",
        partner: "Parceiro de teste",
        occurredOn: "2026-09-18",
        consultationDate: null,
        notes: "Observações. ".repeat(380) + "FIM-EXAME",
      },
      brand,
    ),
  );
  expect(exam.pages).toBeGreaterThan(1);
  expect(exam.compact).toContain("FIM-EXAME");
  expect(exam.text).not.toContain("MAPA");
  expect(exam.text).not.toContain("Consulta de origem");
  expect(exam.text.match(/Documento sem assinatura digital\./g)).toHaveLength(
    exam.pages,
  );
});
