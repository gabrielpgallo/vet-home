import { loadBrand } from "@/server/settings";
import { NextResponse } from "next/server";
import { z } from "zod";
import { forOrg, AppError } from "@/server/db";
import { withAccess } from "@/server/access";
import { apiError } from "@/server/http";
import { createExamRequestPdf } from "@/server/exam-pdf";
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
    const exam = await forOrg(
      async (db) =>
        (
          await db.query(
            `SELECT e.*,to_char(e.occurred_on,'YYYY-MM-DD') AS request_date,to_char(p.birth_date,'YYYY-MM-DD') AS birth_date_text,p.name AS patient,p.species,p.breed,p.sex,p.birth_date,t.name AS tutor,t.phone,t.address,v.starts_at AS consultation_date FROM exams e JOIN patients p ON p.id=e.patient_id JOIN tutors t ON t.id=p.tutor_id LEFT JOIN consultations c ON c.id=e.consultation_id LEFT JOIN visits v ON v.id=c.visit_id WHERE e.id=$1 AND e.kind='order'`,
            [id],
          )
        ).rows[0],
    );
    if (!exam) throw new AppError("Solicitação de exame não encontrada.", 404);
    const pdf = await createExamRequestPdf(
      {
        ...exam,
        occurredOn: exam.request_date,
        birthDate: exam.birth_date_text || null,
        consultationDate: exam.consultation_date?.toISOString() || null,
      },
      await loadBrand(),
    );
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="solicitacao-exame-${id}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return apiError(e);
  }
}

export const GET = withAccess("clinical.read", handleGET);
