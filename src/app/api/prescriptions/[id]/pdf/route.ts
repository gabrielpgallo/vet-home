import { loadBrand } from "@/server/settings";
import { NextResponse } from "next/server";
import { z } from "zod";
import { forOrg, AppError } from "@/server/db";
import { withAccess } from "@/server/access";
import { apiError } from "@/server/http";
import { createPrescriptionPdf } from "@/server/prescription-pdf";
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
            `SELECT r.*, p.name AS patient,p.species,p.breed,p.sex,
          to_char(p.birth_date,'YYYY-MM-DD') AS birth_date_text,
          c.vitals->>'weight' AS weight,t.name AS tutor,t.phone,t.address,t.document
         FROM prescriptions r JOIN consultations c ON c.id=r.consultation_id
         JOIN patients p ON p.id=c.patient_id JOIN tutors t ON t.id=p.tutor_id WHERE r.id=$1`,
            [id],
          )
        ).rows[0],
    );
    if (!rx) throw new AppError("Receita não encontrada.", 404);
    const pdf = await createPrescriptionPdf(
      {
        ...rx,
        createdAt: rx.created_at.toISOString(),
        birthDate: rx.birth_date_text || null,
      },
      await loadBrand(),
    );
    return new NextResponse(new Uint8Array(pdf), {
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
