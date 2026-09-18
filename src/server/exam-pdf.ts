import { documentBrand } from "./document-brand";
import type { PracticeBrand } from "./settings";
import PDFDocument from "pdfkit";
import { dateLabel } from "@/lib/domain";
export interface ExamRequestDocument {
  id: string;
  name: string;
  mode: string;
  partner: string;
  notes: string;
  occurredOn: string;
  patient: string;
  species: string;
  breed: string;
  sex: string;
  birthDate: string | null;
  tutor: string;
  phone: string;
  address: string;
  consultationDate: string | null;
}
export async function createExamRequestPdf(
  exam: ExamRequestDocument,
  brand: PracticeBrand,
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 100, bottom: 105, left: 48, right: 48 },
    bufferPages: true,
    info: {
      Title: `Solicitação de exame - ${exam.patient}`,
      Author: brand.companyName,
    },
  });
  const chunks: Buffer[] = [];
  const output = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (b: Buffer) => chunks.push(b));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const value = (label: string, text: string) => {
    doc
      .font("Helvetica")
      .fontSize(11)
      .fillColor("#24334b")
      .text(`${label}: ${text || "Não informado"}`, { lineGap: 4 });
  };
  const section = (title: string) => {
    if (doc.y > doc.page.height - 145) doc.addPage();
    doc.moveDown(0.8);
    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .fillColor("#245bdb")
      .text(title, { lineGap: 5 });
  };
  doc
    .font("Helvetica-Bold")
    .fontSize(23)
    .fillColor("#172640")
    .text("Solicitação de exame");
  doc.moveDown(0.6);
  value("Data da solicitação", dateLabel(exam.occurredOn));
  if (exam.consultationDate)
    value("Consulta de origem", dateLabel(exam.consultationDate));
  section("Paciente");
  value("Nome", exam.patient);
  value("Espécie / raça", `${exam.species} / ${exam.breed || "Não informada"}`);
  value("Sexo", exam.sex);
  if (exam.birthDate) value("Nascimento", dateLabel(exam.birthDate));
  section("Tutor");
  value("Nome", exam.tutor);
  if (exam.phone) value("Telefone", exam.phone);
  value("Endereço", exam.address);
  section("Exame solicitado");
  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .fillColor("#172640")
    .text(exam.name, { lineGap: 5 });
  doc.moveDown(0.4);
  value("Realização", exam.mode);
  if (exam.partner) value("Laboratório / profissional", exam.partner);
  if (exam.notes) {
    section("Observações e orientações");
    doc
      .font("Helvetica")
      .fontSize(11)
      .fillColor("#24334b")
      .text(exam.notes, { lineGap: 5 });
  }
  documentBrand(doc, brand, `Pedido ${exam.id}`);
  doc.end();
  return output;
}
