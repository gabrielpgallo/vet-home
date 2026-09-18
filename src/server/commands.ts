import { getOrgId, requestIdentity } from "@/server/context";
import { randomUUID, createHash } from "node:crypto";
import type { PoolClient } from "pg";
import {
  commandSchema,
  applicationTotal,
  dateKey,
  type Command,
} from "@/lib/domain";
import { forOrg, AppError } from "./db";

async function row(db: PoolClient, table: string, id: string) {
  const r = await db.query(`SELECT * FROM ${table} WHERE id=$1`, [id]);
  if (!r.rows[0]) throw new AppError("Registro não encontrado.", 404);
  return r.rows[0];
}
async function event(
  db: PoolClient,
  patientId: string,
  consultationId: string | null,
  type: string,
  entityId: string | null,
  title: string,
  text = "",
  occurredAt?: string,
) {
  await db.query(
    "INSERT INTO timeline(id,organization_id,patient_id,consultation_id,type,entity_id,title,text,occurred_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9::timestamptz,now()))",
    [
      randomUUID(),
      getOrgId(),
      patientId,
      consultationId,
      type,
      entityId,
      title,
      text,
      occurredAt || null,
    ],
  );
}
async function consultation(db: PoolClient, id: string) {
  let c = await row(db, "consultations", id);
  await db.query("SELECT id FROM visits WHERE id=$1 FOR UPDATE", [c.visit_id]);
  c = await row(db, "consultations", id);
  const v = await row(db, "visits", c.visit_id);
  if (v.status === "cancelled")
    throw new AppError("Esta visita foi cancelada.");
  return c;
}
async function checkPatientConsultation(
  db: PoolClient,
  patientId: string,
  id: string | null,
) {
  await row(db, "patients", patientId);
  if (id) {
    const c = await row(db, "consultations", id);
    if (c.patient_id !== patientId)
      throw new AppError("A consulta não pertence a este paciente.");
  }
}

export async function runCommand(input: unknown, requestId: string) {
  const cmd = commandSchema.parse(input),
    hash = createHash("sha256").update(JSON.stringify(cmd)).digest("hex");
  return forOrg(async (db) => {
    // Serializes duplicate requests and commits their response with the mutation itself.
    const lock = await db.query(
      "INSERT INTO mutations(organization_id,id,request_hash) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id",
      [getOrgId(), requestId, hash],
    );
    if (!lock.rowCount) {
      const previous = (
        await db.query(
          "SELECT * FROM mutations WHERE organization_id=$1 AND id=$2",
          [getOrgId(), requestId],
        )
      ).rows[0];
      if (previous.request_hash !== hash)
        throw new AppError("Identificador de requisição já utilizado.", 409);
      return previous.response;
    }
    const result = await execute(db, cmd);
    await db.query(
      "INSERT INTO audit_log(organization_id,action,entity_id) VALUES($1,$2,$3)",
      [getOrgId(), cmd.type, result.id],
    );
    await db.query(
      "UPDATE mutations SET response=$3 WHERE organization_id=$1 AND id=$2",
      [getOrgId(), requestId, JSON.stringify(result)],
    );
    return result;
  });
}

async function execute(
  db: PoolClient,
  cmd: Command,
): Promise<{ id: string; revision?: number }> {
  switch (cmd.type) {
    case "expense.create":
    case "expense.update": {
      const d = cmd.data;
      if (d.paidOn && d.paidOn > dateKey())
        throw new AppError("A data de pagamento não pode estar no futuro.");
      if (d.visitId) await row(db, "visits", d.visitId);
      const id = cmd.type === "expense.update" ? cmd.id : randomUUID();
      if (cmd.type === "expense.update") {
        const r = await db.query(
          "UPDATE expenses SET description=$2,category=$3,amount_cents=$4,occurred_on=$5,paid_on=$6,visit_id=$7,notes=$8,revision=revision+1,updated_at=now() WHERE id=$1 AND revision=$9 AND status='active' RETURNING id",
          [
            id,
            d.description,
            d.category,
            d.amountCents,
            d.occurredOn,
            d.paidOn,
            d.visitId,
            d.notes,
            cmd.revision,
          ],
        );
        if (!r.rowCount)
          throw new AppError(
            "A despesa mudou em outra aba ou foi excluída. Recarregue os dados.",
            409,
          );
      } else
        await db.query(
          "INSERT INTO expenses(id,organization_id,description,category,amount_cents,occurred_on,paid_on,visit_id,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
          [
            id,
            getOrgId(),
            d.description,
            d.category,
            d.amountCents,
            d.occurredOn,
            d.paidOn,
            d.visitId,
            d.notes,
          ],
        );
      return { id };
    }
    case "expense.void": {
      const r = await db.query(
        "UPDATE expenses SET status='voided',revision=revision+1,updated_at=now() WHERE id=$1 AND revision=$2 AND status='active' RETURNING id",
        [cmd.id, cmd.revision],
      );
      if (!r.rowCount)
        throw new AppError(
          "A despesa mudou em outra aba ou já foi excluída.",
          409,
        );
      return { id: cmd.id };
    }

    case "tutor.create": {
      const id = randomUUID(),
        d = cmd.data;
      await db.query(
        "INSERT INTO tutors(id,organization_id,name,phone,email,address,document) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [id, getOrgId(), d.name, d.phone, d.email, d.address, d.document ?? ""],
      );
      for (const name of cmd.patientNames)
        await db.query(
          "INSERT INTO patients(id,organization_id,tutor_id,name) VALUES($1,$2,$3,$4)",
          [randomUUID(), getOrgId(), id, name],
        );
      return { id };
    }
    case "tutor.update": {
      await row(db, "tutors", cmd.id);
      const d = cmd.data;
      await db.query(
        "UPDATE tutors SET name=$2,phone=$3,email=$4,address=$5,document=COALESCE($6::text,document) WHERE id=$1",
        [cmd.id, d.name, d.phone, d.email, d.address, d.document ?? null],
      );
      return { id: cmd.id };
    }
    case "patient.create":
    case "patient.update": {
      const d = cmd.data;
      await row(db, "tutors", d.tutorId);
      if (d.birthDate && d.birthDate > new Date().toISOString().slice(0, 10))
        throw new AppError("Nascimento não pode estar no futuro.");
      const id = cmd.type === "patient.update" ? cmd.id : randomUUID();
      if (cmd.type === "patient.update") {
        const previous = await row(db, "patients", id);
        if (previous.tutor_id !== d.tutorId)
          throw new AppError("Troca de tutor ainda não está disponível.");
        await db.query(
          "UPDATE patients SET name=$2,species=$3,breed=$4,sex=$5,birth_date=$6,notes=CASE WHEN $8 THEN notes ELSE $7 END WHERE id=$1",
          [
            id,
            d.name,
            d.species,
            d.breed,
            d.sex,
            d.birthDate,
            d.notes,
            requestIdentity.getStore()?.role === "assistant",
          ],
        );
      } else
        await db.query(
          "INSERT INTO patients(id,organization_id,tutor_id,name,species,breed,sex,birth_date,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
          [
            id,
            getOrgId(),
            d.tutorId,
            d.name,
            d.species,
            d.breed,
            d.sex,
            d.birthDate,
            requestIdentity.getStore()?.role === "assistant" ? "" : d.notes,
          ],
        );
      return { id };
    }
    case "product.create":
    case "product.update": {
      const d = cmd.data,
        id = cmd.type === "product.update" ? cmd.id : randomUUID();
      if (cmd.type === "product.update") {
        await row(db, "products", id);
        await db.query(
          "UPDATE products SET name=$2,unit=$3,cost_cents=$4,sale_cents=$5 WHERE id=$1",
          [id, d.name, d.unit, d.costCents, d.saleCents],
        );
      } else
        await db.query(
          "INSERT INTO products(id,organization_id,name,unit,cost_cents,sale_cents) VALUES($1,$2,$3,$4,$5,$6)",
          [id, getOrgId(), d.name, d.unit, d.costCents, d.saleCents],
        );
      return { id };
    }
    case "visit.create": {
      await row(db, "tutors", cmd.tutorId);
      const ids = [...new Set(cmd.patientIds)];
      const ps = await db.query(
        "SELECT id FROM patients WHERE id=ANY($1::uuid[]) AND tutor_id=$2",
        [ids, cmd.tutorId],
      );
      if (ps.rowCount !== ids.length)
        throw new AppError("Selecione somente animais do tutor escolhido.");
      const id = randomUUID();
      await db.query(
        "INSERT INTO visits(id,organization_id,tutor_id,starts_at,duration_minutes,address,base_cents) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          id,
          getOrgId(),
          cmd.tutorId,
          cmd.date + "T" + cmd.time + ":00-03:00",
          cmd.duration,
          cmd.address,
          cmd.baseCents,
        ],
      );
      for (const patientId of ids)
        await db.query(
          "INSERT INTO visit_patients(organization_id,visit_id,patient_id,reason) VALUES($1,$2,$3,$4)",
          [getOrgId(), id, patientId, cmd.reason],
        );
      return { id };
    }
    case "visit.cancel": {
      await db.query("SELECT id FROM visits WHERE id=$1 FOR UPDATE", [cmd.id]);
      const v = await row(db, "visits", cmd.id);
      if (v.status === "completed")
        throw new AppError("Uma visita realizada não pode ser cancelada.");
      if (
        (
          await db.query(
            "SELECT 1 FROM consultations WHERE visit_id=$1 UNION ALL SELECT 1 FROM payments WHERE visit_id=$1",
            [cmd.id],
          )
        ).rowCount
      )
        throw new AppError(
          "Esta visita já tem atendimento ou pagamento. Preserve o histórico.",
        );
      await db.query("UPDATE visits SET status='cancelled' WHERE id=$1", [
        cmd.id,
      ]);
      return { id: cmd.id };
    }
    case "consultation.start": {
      await db.query("SELECT id FROM visits WHERE id=$1 FOR UPDATE", [
        cmd.visitId,
      ]);
      const v = await row(db, "visits", cmd.visitId);
      if (v.status === "cancelled") throw new AppError("Visita cancelada.");
      const existing = (
        await db.query(
          "SELECT id FROM consultations WHERE visit_id=$1 AND patient_id=$2",
          [cmd.visitId, cmd.patientId],
        )
      ).rows[0];
      if (existing) return { id: existing.id };
      const member = (
        await db.query(
          "SELECT reason FROM visit_patients WHERE visit_id=$1 AND patient_id=$2",
          [cmd.visitId, cmd.patientId],
        )
      ).rows[0];
      if (!member) throw new AppError("Paciente não vinculado à visita.");
      const id = randomUUID();
      await db.query(
        "INSERT INTO consultations(id,organization_id,visit_id,patient_id) VALUES($1,$2,$3,$4)",
        [id, getOrgId(), cmd.visitId, cmd.patientId],
      );
      await event(
        db,
        cmd.patientId,
        id,
        "consultation",
        id,
        member.reason || "Consulta",
      );
      return { id };
    }
    case "consultation.save": {
      const c = await consultation(db, cmd.id);
      if (cmd.complete && !cmd.notes.trim())
        throw new AppError("Preencha o registro clínico antes de concluir.");
      if (c.status === "completed")
        throw new AppError(
          "Atendimento concluído. Registre complementos como notas na timeline.",
          409,
        );
      for (const value of Object.values(cmd.vitals)) {
        if (value && !/^\d+(?:[.,]\d+)?$/.test(value))
          throw new AppError(
            "Medições devem conter somente números positivos.",
          );
      }
      const update = await db.query(
        "UPDATE consultations SET notes=$2,vitals=$3,status=$4,revision=revision+1,updated_at=now() WHERE id=$1 AND revision=$5 RETURNING revision",
        [
          cmd.id,
          cmd.notes,
          JSON.stringify(cmd.vitals),
          cmd.complete ? "completed" : "draft",
          cmd.revision,
        ],
      );
      if (!update.rowCount)
        throw new AppError(
          "Este atendimento mudou em outra aba. Recarregue antes de salvar para evitar sobrescrever dados.",
          409,
        );
      if (cmd.complete)
        await db.query(
          "UPDATE visits v SET status='completed' WHERE v.id=$1 AND NOT EXISTS(SELECT 1 FROM visit_patients vp LEFT JOIN consultations c ON c.visit_id=vp.visit_id AND c.patient_id=vp.patient_id WHERE vp.visit_id=v.id AND (c.status IS NULL OR c.status<>'completed'))",
          [c.visit_id],
        );
      return { id: cmd.id, revision: update.rows[0].revision };
    }
    case "application.create": {
      const c = await consultation(db, cmd.consultationId);
      if (c.status === "completed")
        throw new AppError(
          "Adicione aplicações antes de concluir o atendimento.",
        );
      await db.query("SELECT id FROM visits WHERE id=$1 FOR UPDATE", [
        c.visit_id,
      ]);
      const p = await row(db, "products", cmd.productId);
      const id = randomUUID(),
        total = applicationTotal(cmd.quantityMilli, p.sale_cents);
      await db.query(
        "INSERT INTO applications(id,organization_id,consultation_id,product_id,product_name,unit,quantity_milli,unit_cost_cents,unit_sale_cents,total_cents,batch,route) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
        [
          id,
          getOrgId(),
          c.id,
          p.id,
          p.name,
          p.unit,
          cmd.quantityMilli,
          p.cost_cents,
          p.sale_cents,
          total,
          cmd.batch,
          cmd.route,
        ],
      );
      await event(db, c.patient_id, c.id, "application", id, p.name);
      return { id };
    }
    case "prescription.create": {
      const c = await consultation(db, cmd.consultationId),
        id = randomUUID();
      await db.query(
        "INSERT INTO prescriptions(id,organization_id,consultation_id,items,instructions) VALUES($1,$2,$3,$4,$5)",
        [id, getOrgId(), c.id, JSON.stringify(cmd.items), cmd.instructions],
      );
      await event(
        db,
        c.patient_id,
        c.id,
        "prescription",
        id,
        "Receita · rascunho",
      );
      return { id };
    }
    case "exam.order": {
      await checkPatientConsultation(db, cmd.patientId, cmd.consultationId);
      const id = randomUUID();
      await db.query(
        "INSERT INTO exams(id,organization_id,patient_id,consultation_id,kind,name,mode,partner,notes,occurred_on) VALUES($1,$2,$3,$4,'order',$5,$6,$7,$8,$9)",
        [
          id,
          getOrgId(),
          cmd.patientId,
          cmd.consultationId,
          cmd.name,
          cmd.mode,
          cmd.partner,
          cmd.notes,
          cmd.date,
        ],
      );
      await event(
        db,
        cmd.patientId,
        cmd.consultationId,
        "exam_order",
        id,
        cmd.name,
        cmd.notes,
        cmd.date + "T12:00:00-03:00",
      );
      return { id };
    }
    case "exam.link": {
      const e = await row(db, "exams", cmd.examId),
        c = await row(db, "consultations", cmd.consultationId);
      if (e.patient_id !== c.patient_id)
        throw new AppError("O exame não pertence a este paciente.");
      await db.query(
        "INSERT INTO exam_links(organization_id,exam_id,consultation_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        [getOrgId(), e.id, c.id],
      );
      return { id: e.id };
    }
    case "note.create": {
      await checkPatientConsultation(db, cmd.patientId, cmd.consultationId);
      const id = randomUUID();
      await db.query(
        "INSERT INTO timeline(id,organization_id,patient_id,consultation_id,type,title,text) VALUES($1,$2,$3,$4,'note','Nota de acompanhamento',$5)",
        [id, getOrgId(), cmd.patientId, cmd.consultationId, cmd.text],
      );
      return { id };
    }
    case "payment.create": {
      await db.query("SELECT id FROM visits WHERE id=$1 FOR UPDATE", [
        cmd.visitId,
      ]);
      const v = await row(db, "visits", cmd.visitId);
      if (v.status === "cancelled") throw new AppError("Visita cancelada.");
      const sum = (
        await db.query(
          "SELECT COALESCE((SELECT sum(a.total_cents) FROM applications a JOIN consultations c ON c.id=a.consultation_id WHERE c.visit_id=$1),0)::integer AS applications,COALESCE((SELECT sum(amount_cents) FROM payments WHERE visit_id=$1),0)::integer AS received",
          [v.id],
        )
      ).rows[0];
      if (cmd.amountCents > v.base_cents + sum.applications - sum.received)
        throw new AppError("O valor recebido ultrapassa o saldo em aberto.");
      const id = randomUUID();
      await db.query(
        "INSERT INTO payments(id,organization_id,visit_id,amount_cents,method) VALUES($1,$2,$3,$4,$5)",
        [id, getOrgId(), v.id, cmd.amountCents, cmd.method],
      );
      return { id };
    }
  }
}
export { checkPatientConsultation, event };
