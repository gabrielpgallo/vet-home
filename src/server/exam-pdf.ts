import { dateLabel } from "@/lib/domain";
import { clinicalDocument, type ClinicalPatient } from "./clinical-document";
import type { PracticeBrand } from "./settings";

export interface ExamRequestDocument extends ClinicalPatient {
  id: string;
  name: string;
  mode: string;
  partner: string;
  notes: string;
  occurredOn: string;
  consultationDate: string | null;
}
export async function createExamRequestPdf(
  exam: ExamRequestDocument,
  brand: PracticeBrand,
): Promise<Buffer> {
  const pdf = clinicalDocument(exam, brand, {
    kind: "exam",
    id: exam.id,
    date: exam.occurredOn,
  });
  pdf.section("Exame solicitado");
  pdf.block(
    [
      { text: exam.name, size: 12, bold: true },
      { text: `Realização: ${exam.mode}`, size: 10.5 },
      ...(exam.partner
        ? [{ text: `Encaminhado para: ${exam.partner}`, size: 10.5 }]
        : []),
      ...(exam.consultationDate
        ? [
            {
              text: `Consulta de origem: ${dateLabel(exam.consultationDate)}`,
              size: 10,
              color: "#66758a",
            },
          ]
        : []),
    ],
    1,
  );
  if (exam.notes) {
    pdf.section("Indicação e observações");
    pdf.block([{ text: exam.notes, size: 10.5 }]);
  }
  return pdf.finish();
}
