import PDFDocument from "pdfkit";
import { dateKey, dateLabel } from "@/lib/domain";
import type { PracticeBrand } from "./settings";
import { veterinarianDisplayName } from "@/lib/settings";

export interface ClinicalPatient {
  patient: string;
  species: string;
  breed: string;
  sex: string;
  birthDate: string | null;
  weight?: string | null;
  tutor: string;
  phone: string;
  address: string;
  document?: string;
}

export function patientAge(birthDate: string | null, on: string): string {
  if (!birthDate) return "";
  const birth = birthDate.slice(0, 10);
  const today = on.length === 10 ? on : dateKey(on);
  if (birth > today) return "";
  const [by, bm, bd] = birth.split("-").map(Number);
  const [y, m, d] = today.split("-").map(Number);
  const months = Math.max(0, (y - by) * 12 + m - bm - (d < bd ? 1 : 0));
  const years = Math.floor(months / 12),
    remaining = months % 12;
  return (
    [
      years ? `${years} ${years === 1 ? "ano" : "anos"}` : "",
      remaining ? `${remaining} ${remaining === 1 ? "mês" : "meses"}` : "",
    ]
      .filter(Boolean)
      .join(" e ") || "Menos de 1 mês"
  );
}

const ink = "#203047",
  muted = "#66758a",
  blue = "#245bdb",
  rule = "#dfe6ef";
const left = 48,
  width = 499.28,
  gap = 20,
  colWidth = (width - gap) / 2;
type Line = {
  text: string;
  size?: number;
  bold?: boolean;
  color?: string;
  gap?: number;
};

/** Clinical print template; finance keeps its separate layout. */
export function clinicalDocument(
  patient: ClinicalPatient,
  brand: PracticeBrand,
  meta: { kind: "prescription" | "exam"; id: string; date: string },
) {
  const prescription = meta.kind === "prescription";
  const title = prescription ? "Receita veterinária" : "Solicitação de exame";
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 48, bottom: 140, left, right: left },
    bufferPages: true,
    info: { Title: `${title} - ${patient.patient}`, Author: brand.companyName },
  });
  const chunks: Buffer[] = [];
  const output = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  let activeStyle: Line = { text: "" };
  function style(line: Line) {
    activeStyle = line;
    doc
      .font(line.bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(line.size ?? 10)
      .fillColor(line.color ?? ink);
  }
  function measure(lines: Line[], w: number) {
    return lines.reduce((height, line) => {
      style(line);
      return (
        height +
        doc.heightOfString(line.text, { width: w, lineGap: 3 }) +
        (line.gap ?? 4)
      );
    }, 0);
  }
  function linesAt(lines: Line[], x: number, y: number, w: number) {
    for (const line of lines) {
      style(line);
      doc.text(line.text, x, y, { width: w, lineGap: 3 });
      y = doc.y + (line.gap ?? 4);
    }
    return y;
  }
  function separator(y: number) {
    doc
      .moveTo(left, y)
      .lineTo(left + width, y)
      .lineWidth(0.6)
      .strokeColor(rule)
      .stroke();
  }
  const contacts: Line[] = [
    brand.phone,
    brand.email,
    brand.cnpj && `CNPJ: ${brand.cnpj}`,
  ]
    .filter(Boolean)
    .map((text) => ({ text, size: 8.5, color: muted, gap: 2 }));
  const brandLines: Line[] = [
    { text: brand.companyName, size: 16, bold: true, color: blue, gap: 5 },
    { text: "Medicina veterinária em domicílio", size: 9, color: muted },
  ];
  const brandX = left + (brand.logo ? 50 : 0);
  const brandWidth = contacts.length
    ? 295 - (brandX - left)
    : width - (brandX - left);
  const headerBottom =
    38 +
    Math.max(42, measure(brandLines, brandWidth), measure(contacts, 180)) +
    14;
  const age = patientAge(patient.birthDate, meta.date);
  const patientLines: Line[] = [
    { text: `Paciente  ·  ${patient.patient}`, bold: true, size: 11 },
    {
      text: [patient.species, patient.breed, patient.sex]
        .filter(Boolean)
        .join(" · "),
      size: 9.5,
      color: muted,
    },
    {
      text: [
        age && `Idade: ${age}`,
        patient.weight && `Peso: ${patient.weight} kg`,
      ]
        .filter(Boolean)
        .join("   ·   "),
      size: 9.5,
    },
  ].filter((line) => line.text);
  const tutorLines: Line[] = [
    { text: `Tutor  ·  ${patient.tutor}`, bold: true, size: 11 },
    {
      text: [
        patient.document && `CPF/CNPJ: ${patient.document}`,
        patient.phone && `Tel.: ${patient.phone}`,
      ]
        .filter(Boolean)
        .join("   ·   "),
      size: 9.5,
      color: muted,
    },
    { text: patient.address, size: 9.5, color: muted },
  ].filter((line) => line.text);
  const titleY = headerBottom + 17;
  const identityY = titleY + 63;
  const bodyStart =
    identityY +
    Math.max(measure(patientLines, colWidth), measure(tutorLines, colWidth)) +
    21;
  const records: Line[] = [
    { text: veterinarianDisplayName(brand), size: 11, bold: true, gap: 5 },
    {
      text: `${brand.veterinarianTitle === "Dr." ? "Médico veterinário" : "Médica veterinária"} · ${brand.crmv}`,
      size: 9,
      color: muted,
      gap: 3,
    },
    ...(prescription && brand.sipeagro
      ? [
          {
            text: `MAPA / SIPEAGRO: ${brand.sipeagro}`,
            size: 9,
            color: muted,
            gap: 3,
          },
        ]
      : []),
    ...(brand.veterinarianCpf
      ? [
          {
            text: `CPF: ${brand.veterinarianCpf}`,
            size: 9,
            color: muted,
            gap: 3,
          },
        ]
      : []),
  ];
  // Reserve a completely blank 180 x 72 pt area at the right for external signing.
  const footerHeight = Math.max(72, measure(records, 295)) + 53;
  const bodyEnd = doc.page.height - footerHeight - 16;
  doc.page.margins.bottom = doc.page.height - bodyEnd;
  doc.page.margins.top = bodyStart;
  function header() {
    if (brand.logo)
      doc.image(brand.logo, left, 38, {
        fit: [38, 42],
        align: "center",
        valign: "center",
      });
    linesAt(brandLines, brandX, 38, brandWidth);
    linesAt(contacts, left + width - 180, 38, 180);
    separator(headerBottom);
    linesAt(
      [
        {
          text: prescription
            ? "CUIDADO QUE ACOMPANHA"
            : "CONTINUIDADE DO CUIDADO",
          size: 8,
          color: blue,
        },
      ],
      left,
      titleY,
      width,
    );
    linesAt([{ text: title, size: 21, bold: true }], left, titleY + 17, 320);
    linesAt(
      [
        {
          text: prescription ? "Data da receita" : "Data da solicitação",
          size: 8,
          color: muted,
        },
        { text: dateLabel(meta.date), size: 9 },
      ],
      left + 350,
      titleY + 17,
      149,
    );
    linesAt(patientLines, left, identityY, colWidth);
    linesAt(tutorLines, left + colWidth + gap, identityY, colWidth);
    separator(bodyStart - 13);
    doc.x = left;
    doc.y = bodyStart;
  }
  header();
  doc.on("pageAdded", () => {
    const previousStyle = activeStyle;
    doc.page.margins.top = bodyStart;
    doc.page.margins.bottom = doc.page.height - bodyEnd;
    header();
    style(previousStyle);
  });
  function ensure(height: number) {
    if (doc.y + height > bodyEnd && doc.y > bodyStart + 1) doc.addPage();
  }
  let pendingSection = "";
  function section(text: string) {
    pendingSection = text;
  }
  function block(lines: Line[], number?: number) {
    const x = left + (number ? 27 : 0),
      w = width - (x - left);
    const sectionLine = {
      text: pendingSection,
      size: 10,
      bold: true,
      color: blue,
      gap: 7,
    };
    const sectionHeight = pendingSection ? measure([sectionLine], width) : 0;
    const height = measure(lines, w) + 12 + sectionHeight;
    // Keep usual items together; very long instructions can span pages.
    ensure(
      height <= bodyEnd - bodyStart
        ? height
        : measure(lines.slice(0, 2), w) + 32 + sectionHeight,
    );
    if (pendingSection) {
      doc.y = linesAt([sectionLine], left, doc.y, width);
      pendingSection = "";
    }
    const y = doc.y;
    if (number)
      linesAt(
        [{ text: String(number).padStart(2, "0"), size: 9, color: muted }],
        left,
        y + 2,
        22,
      );
    doc.y = y;
    for (const line of lines) {
      style(line);
      doc.text(line.text, x, doc.y, { width: w, lineGap: 3 });
      doc.y += line.gap ?? 4;
    }
    if (doc.y + 12 <= bodyEnd) {
      separator(doc.y + 3);
      doc.y += 15;
    }
    doc.x = left;
  }
  async function finish() {
    const pages = doc.bufferedPageRange();
    for (let page = pages.start; page < pages.start + pages.count; page++) {
      doc.switchToPage(page);
      const bottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      const y = doc.page.height - footerHeight;
      separator(y);
      const recordsEnd = linesAt(records, left, y + 13, 295);
      const noteY = Math.min(recordsEnd + 8, doc.page.height - 37);
      const label = prescription ? "Receita" : "Pedido";
      linesAt(
        [
          {
            text: prescription
              ? "Rascunho · Documento sem assinatura digital."
              : "Documento sem assinatura digital.",
            size: 8,
            color: muted,
          },
        ],
        left,
        noteY,
        width,
      );
      linesAt(
        [
          {
            text: `${label} ${meta.id}  ·  ${page + 1} / ${pages.count}`,
            size: 7.5,
            color: muted,
          },
        ],
        left,
        noteY + 13,
        width,
      );
      doc.page.margins.bottom = bottom;
    }
    doc.end();
    return output;
  }
  return { section, block, finish };
}
