import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { z } from "zod";
import { forOrg, AppError } from "@/server/db";
import { requireLocalAccess } from "@/server/access";
import { apiError } from "@/server/http";
import type { RxItem } from "@/lib/domain";
export const runtime = "nodejs";
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await requireLocalAccess();
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
    const doc = new PDFDocument({
        size: "A4",
        margin: 48,
        info: { Title: "Rascunho de receita — " + rx.patient },
      }),
      chunks: Buffer[] = [];
    const output = new Promise<Buffer>((resolve, reject) => {
      doc.on("data", (b) => chunks.push(b));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
    });
    const banner = () => {
      doc
        .fontSize(10)
        .fillColor("#526078")
        .text("RASCUNHO — SEM ASSINATURA — NÃO EMITIDO");
      doc.moveDown();
    };
    banner();
    doc.on("pageAdded", banner);
    doc.fontSize(21).fillColor("#15305a").text("AR Saúde Animal");
    doc.moveDown();
    doc
      .fontSize(12)
      .fillColor("#172333")
      .text("Paciente: " + rx.patient)
      .text("Tutor: " + rx.tutor);
    doc.moveDown();
    (rx.items as RxItem[]).forEach((item, i) => {
      if (doc.y > 650) doc.addPage();
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
