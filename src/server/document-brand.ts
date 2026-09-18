import type { PracticeBrand } from "./settings";
export function documentBrand(
  doc: PDFKit.PDFDocument,
  brand: PracticeBrand,
  reference: string,
  footerNote = "Documento sem assinatura digital.",
  options: { showSipeagro?: boolean } = {},
) {
  const sipeagro = options.showSipeagro ? brand.sipeagro?.trim() : "";
  const extraFooterHeight = sipeagro ? 13 : 0;
  const pages = doc.bufferedPageRange();
  for (let i = pages.start; i < pages.start + pages.count; i++) {
    doc.switchToPage(i);
    doc.save();
    const left = brand.logo ? 112 : 48,
      width = doc.page.width - left - 48;
    if (brand.logo)
      doc.image(brand.logo, 48, 28, {
        fit: [50, 50],
        align: "center",
        valign: "center",
      });
    doc.font("Helvetica-Bold").fontSize(14).fillColor("#245bdb");
    const fontSize = Math.min(
      14,
      (14 * width) / doc.widthOfString(brand.companyName),
    );
    doc
      .fontSize(fontSize)
      .text(brand.companyName, left, 39, { lineBreak: false });
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#69768b")
      .text("ATENDIMENTO VETERINÁRIO DOMICILIAR", left, 61, {
        lineBreak: false,
      });
    doc
      .moveTo(48, 81)
      .lineTo(doc.page.width - 48, 81)
      .strokeColor("#dce4f0")
      .stroke();
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#24334b");
    const nameSize = Math.min(
      9,
      (9 * (doc.page.width - 96)) / doc.widthOfString(brand.veterinarianName),
    );
    doc
      .fontSize(nameSize)
      .text(
        brand.veterinarianName,
        48,
        doc.page.height - 79 - extraFooterHeight,
        {
          lineBreak: false,
        },
      );
    doc
      .font("Helvetica")
      .fontSize(8)
      .text(brand.crmv, 48, doc.page.height - 64 - extraFooterHeight, {
        lineBreak: false,
      });
    if (sipeagro) {
      const label = `Registro MAPA / SIPEAGRO: ${sipeagro}`;
      doc.fontSize(
        Math.min(8, (8 * (doc.page.width - 96)) / doc.widthOfString(label)),
      );
      doc.text(label, 48, doc.page.height - 64, { lineBreak: false });
    }
    doc
      .fontSize(8)
      .fillColor("#69768b")
      .text(footerNote, 48, doc.page.height - 48, {
        lineBreak: false,
      });
    doc
      .fontSize(7)
      .text(
        `${reference} | Página ${i + 1} de ${pages.count}`,
        48,
        doc.page.height - 32,
        { lineBreak: false },
      );
    doc.restore();
  }
}
