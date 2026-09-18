import { loadBrand } from "@/server/settings";
import { documentBrand } from "@/server/document-brand";
import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { z } from "zod";
import { forOrg, AppError } from "@/server/db";
import { withAccess } from "@/server/access";
import { apiError } from "@/server/http";
import type { RxItem } from "@/lib/domain";
export const runtime = "nodejs";
async function handleGET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const id = z
      .string()
      .uuid()
      .parse((await ctx.params).id);
    const rx = await forOrg(
      async (db) =>
        (
          await db.query(
            "SELECT r.*,p.name AS patient,t.name AS tutor FROM prescriptions r JOIN consultations c ON c.id=r.consultation_id JOIN patients p ON p.id=c.patient_id JOIN tutors t ON t.id=p.tutor_id WHERE r.id=$1",
            [id],
          )
        ).rows[0],
    );
    if (!rx) throw new AppError("Receita não encontrada.", 404);
    const brand = await loadBrand();
    const doc = new PDFDocument({
        size: "A4",
        margins: { top: 100, bottom: 105, left: 48, right: 48 },
        bufferPages: true,
        info: {
          Title: "Rascunho de receita — " + rx.patient,
          Author: brand.companyName,
        },
      }),
      chunks: Buffer[] = [];
    const output = new Promise<Buffer>((resolve, reject) => {
      doc.on("data", (b) => chunks.push(b));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
    });
    doc
      .font("Helvetica-Bold")
      .fontSize(22)
      .fillColor("#172640")
      .text("Receita veterinária");
    doc.moveDown(0.5);
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#69768b")
      .text("RASCUNHO - SEM ASSINATURA - NÃO EMITIDO");
    doc.moveDown();
    doc
      .fontSize(12)
      .fillColor("#172333")
      .text("Paciente: " + rx.patient)
      .text("Tutor: " + rx.tutor);
    doc.moveDown();
    (rx.items as RxItem[]).forEach((item, i) => {
      if (doc.y > 610) doc.addPage();
      doc.fontSize(13).text(`${i + 1}. ${item.name} — ${item.concentration}`);
      doc
        .fontSize(11)
        .text("Dose: " + item.dose + " | Via: " + item.route)
        .text("Frequência: " + item.frequency + " | Duração: " + item.duration)
        .text("Quantidade: " + item.quantity);
      if (item.instructions) doc.text(item.instructions);
      doc.moveDown();
    });
    if (rx.instructions)
      doc.fontSize(11).text("Orientações: " + rx.instructions);
    documentBrand(doc, brand, `Receita ${id} - Rascunho`, undefined, {
      showSipeagro: true,
    });
    doc.end();
    return new NextResponse(new Uint8Array(await output), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="receita-rascunho.pdf"',
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return apiError(e);
  }
}

export const GET = withAccess("clinical.read", handleGET);
