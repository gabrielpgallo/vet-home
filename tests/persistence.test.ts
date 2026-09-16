import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import "../scripts/env";
const org = "test-" + randomUUID();
process.env.APP_ORG_ID = org;
const { runCommand } = await import("../src/server/commands");
const { forOrg, pool } = await import("../src/server/db");
const admin = new Pool({ connectionString: process.env.ADMIN_DATABASE_URL });
const execute = (cmd: unknown, id = randomUUID()) => runCommand(cmd, id);
let tutor: string,
  patient: string,
  otherPatient: string,
  visit: string,
  consult: string,
  product: string;
beforeAll(async () => {
  await admin.query("INSERT INTO organizations(id,name) VALUES($1,$2)", [
    org,
    "Integration tests",
  ]);
  tutor = (
    await execute({
      type: "tutor.create",
      data: { name: "Teste", phone: "", email: "", address: "Rua A" },
      patientNames: [],
    })
  ).id;
  const patientData = {
    tutorId: tutor,
    name: "Paciente A",
    species: "Cão",
    breed: "",
    sex: "Não informado",
    birthDate: null,
    notes: "",
  };
  patient = (await execute({ type: "patient.create", data: patientData })).id;
  otherPatient = (
    await execute({
      type: "patient.create",
      data: { ...patientData, name: "Paciente B" },
    })
  ).id;
  visit = (
    await execute({
      type: "visit.create",
      tutorId: tutor,
      patientIds: [patient, otherPatient],
      date: "2026-09-16",
      time: "09:00",
      duration: 60,
      address: "Rua A",
      baseCents: 25000,
      reason: "Teste",
    })
  ).id;
  consult = (
    await execute({
      type: "consultation.start",
      visitId: visit,
      patientId: patient,
    })
  ).id;
  product = (
    await execute({
      type: "product.create",
      data: {
        name: "Produto teste",
        unit: "mL",
        costCents: 400,
        saleCents: 1200,
      },
    })
  ).id;
});
afterAll(async () => {
  for (const table of [
    "audit_log",
    "mutations",
    "timeline",
    "exam_links",
    "exams",
    "attachments",
    "payments",
    "prescriptions",
    "applications",
    "consultations",
    "visit_patients",
    "visits",
    "products",
    "patients",
    "tutors",
  ])
    await admin.query(`DELETE FROM ${table} WHERE organization_id=$1`, [org]);
  await admin.query("DELETE FROM organizations WHERE id=$1", [org]);
  await admin.end();
  await pool.end();
});
describe.sequential("persistência e regras do atendimento", () => {
  it("isola registros por organização e não retorna dados sem contexto", async () => {
    const scoped = await forOrg((db) => db.query("SELECT id FROM tutors"));
    expect(scoped.rows.map((r) => r.id)).toEqual([tutor]);
    expect((await pool.query("SELECT id FROM tutors")).rows).toEqual([]);
    expect(
      (
        await forOrg(
          (db) => db.query("SELECT id FROM tutors"),
          "outra-organizacao",
        )
      ).rows,
    ).toEqual([]);
    const role = (
      await pool.query(
        "SELECT rolbypassrls,rolsuper FROM pg_roles WHERE rolname=current_user",
      )
    ).rows[0];
    expect(role).toEqual({ rolbypassrls: false, rolsuper: false });
  });
  it("aplica uma única vez em requisições simultâneas e preserva o preço", async () => {
    const cmd = {
        type: "application.create",
        consultationId: consult,
        productId: product,
        quantityMilli: 2500,
        batch: "L1",
        route: "Registro de teste",
      },
      id = randomUUID();
    const [a, b] = await Promise.all([execute(cmd, id), execute(cmd, id)]);
    expect(a.id).toBe(b.id);
    await execute({
      type: "product.update",
      id: product,
      data: {
        name: "Produto atualizado",
        unit: "mL",
        costCents: 500,
        saleCents: 1900,
      },
    });
    const apps = await forOrg((db) =>
      db.query(
        "SELECT product_name,total_cents,unit_sale_cents FROM applications WHERE consultation_id=$1",
        [consult],
      ),
    );
    expect(apps.rows).toEqual([
      {
        product_name: "Produto teste",
        total_cents: 3000,
        unit_sale_cents: 1200,
      },
    ]);
    await expect(execute({ ...cmd, quantityMilli: 1000 }, id)).rejects.toThrow(
      "Identificador",
    );
  });
  it("bloqueia sobrescrita de texto em duas abas", async () => {
    await execute({
      type: "consultation.save",
      id: consult,
      revision: 0,
      notes: "Registro original",
      vitals: { weight: "12,5" },
      complete: false,
    });
    await expect(
      execute({
        type: "consultation.save",
        id: consult,
        revision: 0,
        notes: "Registro antigo",
        vitals: {},
        complete: false,
      }),
    ).rejects.toThrow("outra aba");
    const row = await forOrg(
      async (db) =>
        (
          await db.query(
            "SELECT notes,revision FROM consultations WHERE id=$1",
            [consult],
          )
        ).rows[0],
    );
    expect(row).toEqual({ notes: "Registro original", revision: 1 });
  });
  it("vincula exames sem duplicar eventos e rejeita paciente errado", async () => {
    const exam = (
      await execute({
        type: "exam.order",
        patientId: patient,
        consultationId: null,
        name: "Hemograma",
        mode: "Coleta pela veterinária",
        partner: "Laboratório teste",
        notes: "",
        date: "2026-09-15",
      })
    ).id;
    await execute({ type: "exam.link", examId: exam, consultationId: consult });
    await execute({ type: "exam.link", examId: exam, consultationId: consult });
    const other = (
      await execute({
        type: "consultation.start",
        visitId: visit,
        patientId: otherPatient,
      })
    ).id;
    await expect(
      execute({ type: "exam.link", examId: exam, consultationId: other }),
    ).rejects.toThrow("não pertence");
    expect(
      (
        await forOrg((db) =>
          db.query("SELECT id FROM timeline WHERE entity_id=$1", [exam]),
        )
      ).rowCount,
    ).toBe(1);
    expect(
      (
        await forOrg((db) =>
          db.query("SELECT exam_id FROM exam_links WHERE exam_id=$1", [exam]),
        )
      ).rowCount,
    ).toBe(1);
  });
  it("serializa pagamentos concorrentes para não ultrapassar o saldo", async () => {
    const results = await Promise.allSettled([
      execute({
        type: "payment.create",
        visitId: visit,
        amountCents: 20000,
        method: "Pix",
      }),
      execute({
        type: "payment.create",
        visitId: visit,
        amountCents: 20000,
        method: "Dinheiro",
      }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await execute({
      type: "payment.create",
      visitId: visit,
      amountCents: 8000,
      method: "Débito",
    });
    await expect(
      execute({
        type: "payment.create",
        visitId: visit,
        amountCents: 1,
        method: "Pix",
      }),
    ).rejects.toThrow("saldo");
  });
  it("preserva atendimento concluído e exige terminar todos os animais da visita", async () => {
    await execute({
      type: "consultation.save",
      id: consult,
      revision: 1,
      notes: "Consulta concluída",
      vitals: { weight: "12,5" },
      complete: true,
    });
    await expect(
      execute({
        type: "application.create",
        consultationId: consult,
        productId: product,
        quantityMilli: 1000,
        batch: "",
        route: "",
      }),
    ).rejects.toThrow("antes de concluir");
    await expect(
      execute({
        type: "consultation.save",
        id: consult,
        revision: 2,
        notes: "Mudança",
        vitals: {},
        complete: false,
      }),
    ).rejects.toThrow("concluído");
    const status = await forOrg(
      async (db) =>
        (await db.query("SELECT status FROM visits WHERE id=$1", [visit]))
          .rows[0].status,
    );
    expect(status).toBe("scheduled");
  });
});
