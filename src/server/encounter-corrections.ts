import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { applicationTotal, dateKey, type Command } from "@/lib/domain";
import { AppError } from "./db";
import { getOrgId } from "./context";
import {
  row,
  consultation,
  event,
  markCorrection,
  checkRevision,
} from "./encounter-records";
import {
  prescriptionAuthor,
  requireVeterinarian,
} from "./professional-profile";
import { documentPdf } from "./issued-documents";

export async function correctEncounter(
  db: PoolClient,
  cmd: Command,
): Promise<{ id: string; revision?: number } | null> {
  switch (cmd.type) {
    case "consultation.create": {
      const p = await row(db, "patients", cmd.patientId),
        t = await row(db, "tutors", p.tutor_id);
      const visitId = randomUUID(),
        id = randomUUID();
      await db.query(
        "INSERT INTO visits(id,organization_id,tutor_id,origin,status,starts_at,duration_minutes,address) VALUES($1,$2,$3,'direct','draft',NULL,60,$4)",
        [visitId, getOrgId(), t.id, t.address],
      );
      await db.query(
        "INSERT INTO visit_patients(organization_id,visit_id,patient_id) VALUES($1,$2,$3)",
        [getOrgId(), visitId, p.id],
      );
      await db.query(
        "INSERT INTO consultations(id,organization_id,visit_id,patient_id) VALUES($1,$2,$3,$4)",
        [id, getOrgId(), visitId, p.id],
      );
      await event(db, p.id, id, "consultation", id, "Consulta avulsa");
      return { id };
    }
    case "visit.correct": {
      await db.query("SELECT id FROM visits WHERE id=$1 FOR UPDATE", [cmd.id]);
      const v = await row(db, "visits", cmd.id);
      checkRevision(v.revision, cmd.revision);
      if (v.status === "cancelled") throw new AppError("Visita cancelada.");
      if (v.status === "completed" && !cmd.reason)
        throw new AppError("Informe o motivo da correção da cobrança.");
      if (v.status === "completed" && !cmd.performedOn)
        throw new AppError("Informe a data da cobrança.");
      if (
        cmd.performedOn &&
        cmd.performedOn > dateKey() &&
        v.status === "completed"
      )
        throw new AppError("A data da cobrança não pode estar no futuro.");
      if (v.origin === "direct") {
        const c = (
          await db.query(
            "SELECT to_char(occurred_on,'YYYY-MM-DD') AS day FROM consultations WHERE visit_id=$1",
            [v.id],
          )
        ).rows[0];
        if (cmd.performedOn !== c?.day)
          throw new AppError(
            "Altere a data no registro clínico do atendimento avulso.",
          );
      }
      await db.query(
        "UPDATE visits SET base_cents=$2,address=$3,performed_on=$4,revision=revision+1 WHERE id=$1",
        [v.id, cmd.baseCents, cmd.address, cmd.performedOn],
      );
      return { id: v.id, revision: v.revision + 1 };
    }
    case "application.correct":
    case "application.void": {
      const initial = await row(db, "applications", cmd.id);
      const c = await consultation(db, initial.consultation_id);
      const a = await row(db, "applications", cmd.id);
      checkRevision(a.revision, cmd.revision);
      if (a.status !== "active")
        throw new AppError("Aplicação já cancelada.", 409);
      if (cmd.type === "application.void") {
        await db.query(
          "UPDATE applications SET status='voided',revision=revision+1 WHERE id=$1",
          [a.id],
        );
      } else {
        const p = await row(db, "products", cmd.productId),
          same = p.id === a.product_id;
        await db.query(
          "UPDATE applications SET product_id=$2,product_name=$3,unit=$4,quantity_milli=$5,unit_cost_cents=$6,unit_sale_cents=$7,total_cents=$8,batch=$9,route=$10,revision=revision+1 WHERE id=$1",
          [
            a.id,
            p.id,
            same ? a.product_name : p.name,
            same ? a.unit : p.unit,
            cmd.quantityMilli,
            same ? a.unit_cost_cents : p.cost_cents,
            cmd.unitSaleCents,
            applicationTotal(cmd.quantityMilli, cmd.unitSaleCents),
            cmd.batch,
            cmd.route,
          ],
        );
        await db.query(
          "UPDATE timeline SET title=$2 WHERE type='application' AND entity_id=$1",
          [a.id, same ? a.product_name : p.name],
        );
      }
      await markCorrection(db, c.id);
      return { id: a.id, revision: a.revision + 1 };
    }
    case "payment.correct":
    case "payment.void": {
      const initial = await row(db, "payments", cmd.id);
      await db.query("SELECT id FROM visits WHERE id=$1 FOR UPDATE", [
        initial.visit_id,
      ]);
      const old = await row(db, "payments", cmd.id);
      if (old.status !== "active")
        throw new AppError(
          "Recebimento já corrigido ou cancelado. Recarregue a tela.",
          409,
        );
      if (cmd.type === "payment.correct" && cmd.paidOn > dateKey())
        throw new AppError("Data de recebimento no futuro.");
      await db.query("UPDATE payments SET status='voided' WHERE id=$1", [
        old.id,
      ]);
      if (cmd.type === "payment.void") return { id: old.id };
      const id = randomUUID();
      await db.query(
        "INSERT INTO payments(id,organization_id,visit_id,amount_cents,method,paid_on,replaces_id) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          id,
          getOrgId(),
          old.visit_id,
          cmd.amountCents,
          cmd.method,
          cmd.paidOn,
          old.id,
        ],
      );
      return { id };
    }
    case "prescription.replace":
    case "prescription.void": {
      requireVeterinarian();
      await db.query("SELECT id FROM prescriptions WHERE id=$1 FOR UPDATE", [
        cmd.id,
      ]);
      const old = await row(db, "prescriptions", cmd.id);
      if (old.record_status !== "active")
        throw new AppError(
          "Receita já substituída ou cancelada. Recarregue a tela.",
          409,
        );
      await documentPdf(db, "prescription", old.id);
      await db.query("UPDATE prescriptions SET record_status=$2 WHERE id=$1", [
        old.id,
        cmd.type === "prescription.void" ? "voided" : "replaced",
      ]);
      if (cmd.type === "prescription.void") return { id: old.id };
      const author = await prescriptionAuthor(db),
        id = randomUUID();
      const c = await row(db, "consultations", old.consultation_id);
      await db.query(
        "INSERT INTO prescriptions(id,organization_id,consultation_id,items,instructions,prescriber_id,prescriber,replaces_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          id,
          getOrgId(),
          c.id,
          JSON.stringify(cmd.items),
          cmd.instructions,
          author.id,
          JSON.stringify(author.snapshot),
          old.id,
        ],
      );
      await event(
        db,
        c.patient_id,
        c.id,
        "prescription",
        id,
        "Receita · revisão",
      );
      return { id };
    }
    case "exam.replace":
    case "exam.void": {
      await db.query("SELECT id FROM exams WHERE id=$1 FOR UPDATE", [cmd.id]);
      const old = await row(db, "exams", cmd.id);
      if (old.record_status !== "active")
        throw new AppError(
          "Exame já substituído ou cancelado. Recarregue a tela.",
          409,
        );
      if (old.kind === "order") await documentPdf(db, "exam", old.id);
      if (cmd.type === "exam.replace" && old.kind !== "order")
        throw new AppError(
          "Para corrigir um resultado, anexe sua nova versão.",
        );
      await db.query("UPDATE exams SET record_status=$2 WHERE id=$1", [
        old.id,
        cmd.type === "exam.void" ? "voided" : "replaced",
      ]);
      if (cmd.type === "exam.void") return { id: old.id };
      const id = randomUUID();
      await db.query(
        "INSERT INTO exams(id,organization_id,patient_id,consultation_id,kind,name,mode,partner,notes,occurred_on,replaces_id) VALUES($1,$2,$3,$4,'order',$5,$6,$7,$8,$9,$10)",
        [
          id,
          getOrgId(),
          old.patient_id,
          old.consultation_id,
          cmd.name,
          cmd.mode,
          cmd.partner,
          cmd.notes,
          cmd.date,
          old.id,
        ],
      );
      await event(
        db,
        old.patient_id,
        old.consultation_id,
        "exam_order",
        id,
        cmd.name,
        cmd.notes,
        cmd.date + "T12:00:00-03:00",
      );
      // Preserve secondary consultation links, while results remain linked to their original order.
      await db.query(
        "INSERT INTO exam_links(organization_id,exam_id,consultation_id) SELECT organization_id,$2,consultation_id FROM exam_links WHERE exam_id=$1",
        [old.id, id],
      );
      return { id };
    }
    default:
      return null;
  }
}
