import PDFDocument from "pdfkit";
import { money, dateLabel } from "@/lib/domain";
import type { FinanceReport } from "@/lib/finance";
import type { PracticeBrand } from "./settings";
import { documentBrand } from "./document-brand";
export function financePdf(
  report: FinanceReport,
  brand: PracticeBrand,
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 100, bottom: 105, left: 48, right: 48 },
    bufferPages: true,
    info: {
      Title: "Relatório financeiro - " + report.periodLabel,
      Author: brand.companyName,
    },
  });
  const chunks: Buffer[] = [];
  const result = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (b) => chunks.push(b));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const width = doc.page.width - 96,
    bottom = doc.page.height - 105;
  const room = (height: number) => {
    if (doc.y + height > bottom) doc.addPage();
  };
  const paragraph = (text: string, size = 9) => {
    doc.font("Helvetica").fontSize(size).fillColor("#526078");
    room(doc.heightOfString(text, { width }) + 8);
    doc.text(text, 48, doc.y, { width, lineGap: 3 });
    doc.moveDown(0.6);
  };
  const heading = (text: string) => {
    room(65);
    doc.moveDown(0.7);
    doc
      .font("Helvetica-Bold")
      .fontSize(14)
      .fillColor("#172640")
      .text(text, 48, doc.y, { width });
    doc.moveDown(0.5);
  };
  function table(headers: string[], widths: number[], rows: string[][]) {
    const draw = (cells: string[], header = false) => {
      doc
        .font(header ? "Helvetica-Bold" : "Helvetica")
        .fontSize(header ? 8 : 8.5);
      const height =
        Math.max(
          ...cells.map((cell, i) =>
            doc.heightOfString(cell, { width: widths[i] - 12, lineGap: 2 }),
          ),
        ) + 14;
      if (doc.y + height > bottom) {
        doc.addPage();
        if (!header) draw(headers, true);
      }
      const y = doc.y;
      let x = 48;
      if (header) doc.rect(48, y, width, height).fill("#edf3ff");
      cells.forEach((cell, i) => {
        doc
          .font(header ? "Helvetica-Bold" : "Helvetica")
          .fontSize(header ? 8 : 8.5)
          .fillColor(header ? "#245bdb" : "#24334b")
          .text(cell, x + 6, y + 7, { width: widths[i] - 12, lineGap: 2 });
        x += widths[i];
      });
      doc
        .moveTo(48, y + height)
        .lineTo(48 + width, y + height)
        .strokeColor("#e0e6ef")
        .stroke();
      doc.x = 48;
      doc.y = y + height;
    };
    draw(headers, true);
    if (!rows.length) paragraph("Nenhum registro neste período.");
    else rows.forEach((row) => draw(row));
    doc.moveDown();
  }
  doc
    .font("Helvetica-Bold")
    .fontSize(23)
    .fillColor("#172640")
    .text("Relatório financeiro");
  doc.moveDown(0.4);
  paragraph(report.periodLabel, 11);
  paragraph(
    "Resultado pela data das visitas concluídas e pela competência das despesas. Recebimentos e saídas de caixa pela data do pagamento. Valores em reais (R$).",
  );
  heading("Resumo do período");
  table(
    ["Indicador", "Valor"],
    [350, width - 350],
    [
      ["Faturado", money(report.billedCents)],
      ["Recebido no período", money(report.receivedCents)],
      [
        "A receber das visitas do período, na data final",
        money(report.dueCents),
      ],
      ["Custo das aplicações", money(report.applicationCostsCents)],
      ["Despesas de competência", money(report.expensesCents)],
      ["Resultado estimado", money(report.resultCents)],
      ["Despesas pagas no período", money(report.paidExpensesCents)],
      ["Movimentação líquida de caixa", money(report.cashCents)],
    ],
  );
  paragraph(
    `${report.visits.length} visitas concluídas. ${report.pendingVisits} visitas agendadas ou em andamento não incluídas no faturamento. O resultado desconta custos históricos dos produtos aplicados e despesas de competência. Compras de produtos entram somente no caixa. A movimentação líquida não representa saldo bancário.`,
  );
  heading("Receitas por atendimento");
  paragraph(
    "Recebido e a receber consideram pagamentos até a data final do filtro. O resultado por visita desconta seus custos e despesas vinculadas no período; as despesas gerais são descontadas apenas no resumo.",
  );
  table(
    [
      "Data / tutor",
      "Faturado",
      "Custo aplicado",
      "Despesa vinculada",
      "Resultado",
      "A receber",
    ],
    [174, 65, 65, 65, 65, width - 434],
    report.visits.map((v) => [
      `${dateLabel(v.date)}\n${v.tutor}\n${v.patients.length > 250 ? v.patients.slice(0, 247) + "..." : v.patients}`,
      money(v.totalCents),
      money(v.costCents),
      money(v.expensesCents),
      money(v.resultCents),
      money(v.dueCents),
    ]),
  );
  heading("Recebimentos no período");
  paragraph(
    "Inclui pagamentos relativos a visitas de outros períodos e adiantamentos.",
  );
  table(
    ["Data", "Tutor", "Forma", "Recebido"],
    [76, 200, 120, width - 396],
    report.receipts.map((p) => [
      dateLabel(p.date),
      p.tutor,
      p.method,
      money(p.amountCents),
    ]),
  );
  heading("Despesas de competência");
  table(
    ["Competência", "Descrição / categoria", "Valor", "Pagamento"],
    [76, 230, 80, width - 386],
    report.expenses.map((e) => [
      dateLabel(e.occurredOn),
      `${e.description}\n${e.category}${e.category === "Compra de produtos" ? " (somente caixa)" : ""}${e.visitId ? "\nVinculada a uma visita" : ""}`,
      money(e.amountCents),
      e.paidOn ? dateLabel(e.paidOn) : "Em aberto",
    ]),
  );
  heading("Despesas pagas no período");
  paragraph(
    "Inclui pagamentos de despesas com competência em outros períodos.",
  );
  table(
    ["Pagamento", "Descrição / categoria", "Competência", "Pago"],
    [76, 230, 90, width - 396],
    report.paidExpenses.map((e) => [
      dateLabel(e.paidOn!),
      `${e.description}\n${e.category}`,
      dateLabel(e.occurredOn),
      money(e.amountCents),
    ]),
  );
  heading("Custos dos produtos aplicados");
  table(
    ["Visita / produto", "Quantidade", "Custo unitário", "Custo total"],
    [240, 85, 85, width - 410],
    report.visits.flatMap((v) =>
      v.applications.map((a) => [
        `${dateLabel(v.date)} · ${v.tutor}\n${a.productName}`,
        `${a.quantityMilli / 1000} ${a.unit}`,
        money(a.unitCostCents),
        money(a.costCents),
      ]),
    ),
  );
  paragraph(
    "Relatório gerencial baseado nos registros atuais do sistema. O CSV contém os identificadores das visitas e observações das despesas para conferência.",
  );
  documentBrand(
    doc,
    brand,
    `Financeiro ${report.range.start} a ${report.range.end}`,
    "Relatório gerencial. Valores em reais (R$).",
  );
  doc.end();
  return result;
}
