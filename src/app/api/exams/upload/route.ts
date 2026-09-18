import { getOrgId } from "@/server/context";
import { NextResponse } from "next/server";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { uploadSchema } from "@/lib/domain";
import { forOrg, AppError } from "@/server/db";
import { checkPatientConsultation, event } from "@/server/commands";
import { withAccess } from "@/server/access";
import { apiError } from "@/server/http";
export const runtime = "nodejs";
async function handlePOST(req: Request) {
  try {
    if (Number(req.headers.get("content-length") || 0) > 16 * 1024 * 1024)
      throw new AppError("O limite é de 15 MB por resultado.", 413);
    const form = await req.formData(),
      file = form.get("file");
    const requestId = z.string().uuid().parse(form.get("requestIdempotency"));
    const d = uploadSchema.parse(JSON.parse(String(form.get("data"))));
    if (!(file instanceof File) || !file.size || file.size > 15 * 1024 * 1024)
      throw new AppError("Selecione um PDF de até 15 MB.");
    const buffer = Buffer.from(await file.arrayBuffer());
    if (
      buffer.subarray(0, 5).toString() !== "%PDF-" ||
      !file.name.toLowerCase().endsWith(".pdf")
    )
      throw new AppError("O arquivo precisa ser um PDF válido.");
    const hash = createHash("sha256")
      .update(JSON.stringify(d))
      .update(buffer)
      .digest("hex");
    const result = await forOrg(async (db) => {
      const lock = await db.query(
        "INSERT INTO mutations(organization_id,id,request_hash) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id",
        [getOrgId(), requestId, hash],
      );
      if (!lock.rowCount) {
        const old = (
          await db.query(
            "SELECT * FROM mutations WHERE organization_id=$1 AND id=$2",
            [getOrgId(), requestId],
          )
        ).rows[0];
        if (old.request_hash !== hash)
          throw new AppError("Requisição já utilizada.", 409);
        return old.response;
      }
      await checkPatientConsultation(db, d.patientId, d.consultationId);
      if (d.requestId) {
        const order = (
          await db.query("SELECT * FROM exams WHERE id=$1 AND kind='order'", [
            d.requestId,
          ])
        ).rows[0];
        if (
          !order ||
          order.patient_id !== d.patientId ||
          order.consultation_id !== d.consultationId
        )
          throw new AppError(
            "O pedido deve pertencer ao mesmo paciente e consulta.",
          );
      }
      const attachmentId = randomUUID(),
        id = randomUUID();
      await db.query(
        "INSERT INTO attachments(id,organization_id,name,mime,data,size) VALUES($1,$2,$3,'application/pdf',$4,$5)",
        [
          attachmentId,
          getOrgId(),
          file.name.slice(0, 255),
          buffer,
          buffer.length,
        ],
      );
      await db.query(
        "INSERT INTO exams(id,organization_id,patient_id,consultation_id,request_id,kind,name,notes,attachment_id,occurred_on) VALUES($1,$2,$3,$4,$5,'result',$6,$7,$8,$9)",
        [
          id,
          getOrgId(),
          d.patientId,
          d.consultationId,
          d.requestId,
          d.name,
          d.notes,
          attachmentId,
          d.date,
        ],
      );
      await event(
        db,
        d.patientId,
        d.consultationId,
        "exam_result",
        id,
        "Resultado · " + d.name,
        d.notes,
        d.date + "T12:00:00-03:00",
      );
      const response = { id };
      await db.query(
        "UPDATE mutations SET response=$3 WHERE organization_id=$1 AND id=$2",
        [getOrgId(), requestId, JSON.stringify(response)],
      );
      await db.query(
        "INSERT INTO audit_log(organization_id,action,entity_id) VALUES($1,'exam.upload',$2)",
        [getOrgId(), id],
      );
      return response;
    });
    return NextResponse.json(result);
  } catch (e) {
    return apiError(e);
  }
}

export const POST = withAccess("clinical.write", handlePOST);
