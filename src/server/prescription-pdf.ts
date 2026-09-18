import type { RxItem } from "@/lib/domain";
import { clinicalDocument, type ClinicalPatient } from "./clinical-document";
import type { PracticeBrand } from "./settings";

export interface PrescriptionDocument extends ClinicalPatient {
  id: string;
  createdAt: string;
  items: RxItem[];
  instructions: string;
}
export async function createPrescriptionPdf(
  rx: PrescriptionDocument,
  brand: PracticeBrand,
) {
  const pdf = clinicalDocument(rx, brand, {
    kind: "prescription",
    id: rx.id,
    date: rx.createdAt,
  });
  pdf.section("Prescrição");
  rx.items.forEach((item, index) =>
    pdf.block(
      [
        {
          text: `${item.name} · ${item.concentration}`,
          size: 11.5,
          bold: true,
        },
        {
          text: `Via: ${item.route} · Quantidade: ${item.quantity}`,
          size: 9,
          color: "#66758a",
        },
        {
          text: `Dose: ${item.dose} · Frequência: ${item.frequency} · Duração: ${item.duration}`,
          size: 10.5,
        },
        ...(item.instructions ? [{ text: item.instructions, size: 10.5 }] : []),
      ],
      index + 1,
    ),
  );
  if (rx.instructions) {
    pdf.section("Orientações ao tutor");
    pdf.block([{ text: rx.instructions, size: 10.5 }]);
  }
  return pdf.finish();
}
