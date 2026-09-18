import "./env";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { runCommand } from "../src/server/commands";
import { dateKey, ORG_ID, type Command } from "../src/lib/domain";
import { pool } from "../src/server/db";
if (
  process.env.VERCEL ||
  !["127.0.0.1", "localhost"].includes(
    new URL(process.env.ADMIN_DATABASE_URL!).hostname,
  )
)
  throw new Error("Dados de demonstração só podem ser criados no banco local.");
const admin = new Pool({ connectionString: process.env.ADMIN_DATABASE_URL });
await admin.query(
  "INSERT INTO organizations(id,name) VALUES($1,$2) ON CONFLICT DO NOTHING",
  [ORG_ID, "IR Saúde Animal"],
);
const existing = await admin.query(
  "SELECT 1 FROM tutors WHERE organization_id=$1 LIMIT 1",
  [ORG_ID],
);
if (existing.rowCount) {
  console.log("Seed skipped: workspace already contains tutors.");
} else {
  const send = (c: Command) => runCommand(c, randomUUID());
  const first = await send({
    type: "tutor.create",
    data: {
      name: "Mariana Costa (exemplo)",
      phone: "(11) 99999-0101",
      email: "",
      address: "Rua das Acácias, 128 · Jardim Paulista",
    },
    patientNames: ["Thor", "Mel"],
  });
  const ps = (
    await admin.query(
      "SELECT id,name FROM patients WHERE tutor_id=$1 ORDER BY name",
      [first.id],
    )
  ).rows;
  for (const p of ps)
    await send({
      type: "patient.update",
      id: p.id,
      data: {
        tutorId: first.id,
        name: p.name,
        species: p.name === "Mel" ? "Gato" : "Cão",
        breed: p.name === "Mel" ? "Sem raça definida" : "Labrador",
        sex: p.name === "Mel" ? "Fêmea" : "Macho",
        birthDate: p.name === "Mel" ? "2023-01-15" : "2020-03-12",
        notes: "",
      },
    });
  await send({
    type: "visit.create",
    tutorId: first.id,
    patientIds: ps.map((p) => p.id),
    date: dateKey(),
    time: "09:00",
    duration: 90,
    address: "Rua das Acácias, 128 · Jardim Paulista",
    baseCents: 42000,
    reason: "Avaliação clínica e acompanhamento",
  });
  const previous = new Date();
  previous.setDate(previous.getDate() - 30);
  const historic = await send({
    type: "visit.create",
    tutorId: first.id,
    patientIds: [ps.find((p) => p.name === "Thor").id],
    date: dateKey(previous),
    time: "10:00",
    duration: 60,
    address: "Rua das Acácias, 128 · Jardim Paulista",
    baseCents: 25000,
    reason: "Consulta de rotina",
  });
  const c = await send({
    type: "consultation.start",
    visitId: historic.id,
    patientId: ps.find((p) => p.name === "Thor").id,
  });
  await send({
    type: "consultation.save",
    id: c.id,
    revision: 0,
    notes:
      "Registro fictício para demonstrar o histórico: tutor relata apetite e disposição habituais. Avaliação geral realizada.",
    vitals: {
      weight: "28,4",
      temperature: "38,4",
      heartRate: "92",
      respiratoryRate: "24",
    },
    complete: true,
  });
  await admin.query(
    "UPDATE consultations SET created_at=$2,updated_at=$2 WHERE id=$1",
    [c.id, previous],
  );
  await admin.query(
    "UPDATE timeline SET occurred_at=$2 WHERE consultation_id=$1",
    [c.id, previous],
  );
  await send({
    type: "payment.create",
    visitId: historic.id,
    amountCents: 25000,
    method: "Pix",
  });
  for (const [name, pet, address, time] of [
    [
      "Rafael Lima (exemplo)",
      "Luna",
      "Rua dos Ipês, 45 · Vila Mariana",
      "13:30",
    ],
    ["Beatriz Santos (exemplo)", "Bento", "Rua do Sol, 302 · Moema", "16:00"],
  ]) {
    const t = await send({
      type: "tutor.create",
      data: { name, phone: "", email: "", address },
      patientNames: [pet],
    });
    const p = (
      await admin.query("SELECT id FROM patients WHERE tutor_id=$1", [t.id])
    ).rows[0];
    await send({
      type: "visit.create",
      tutorId: t.id,
      patientIds: [p.id],
      date: dateKey(),
      time,
      duration: 60,
      address,
      baseCents: 25000,
      reason: "Consulta de acompanhamento",
    });
  }
  for (const p of [
    {
      name: "Medicamento demonstrativo A",
      unit: "mL" as const,
      costCents: 400,
      saleCents: 1200,
    },
    {
      name: "Vacina demonstrativa B",
      unit: "dose" as const,
      costCents: 3500,
      saleCents: 8500,
    },
    {
      name: "Insumo demonstrativo C",
      unit: "unidade" as const,
      costCents: 300,
      saleCents: 800,
    },
  ])
    await send({ type: "product.create", data: p });
  console.log("Example workspace created. No real patient data.");
}
await admin.end();
await pool.end();
