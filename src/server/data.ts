import { readProfessionalProfile } from "./professional-profile";
import { readSettings } from "./settings";
import { forOrg } from "./db";
import type { Bootstrap } from "@/lib/types";
const camelRows = (rows: Record<string, unknown>[]) =>
  rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()),
        value,
      ]),
    ),
  );
export async function loadData(): Promise<Bootstrap> {
  return forOrg(async (db) => {
    const tables = {
      payments: "payments",
      tutors: "tutors",
      patients: "patients",
      visitPatients: "visit_patients",
      consultations: "consultations",
      products: "products",
      applications: "applications",
      prescriptions: "prescriptions",
      exams: "exams",
      examLinks: "exam_links",
      timeline: "timeline",
    };
    const { logo, ...settings } = await readSettings(db);
    void logo;
    const result: Record<string, unknown> = {
      settings,
      professionalProfile: await readProfessionalProfile(db),
    };
    for (const [key, table] of Object.entries(tables))
      result[key] = camelRows((await db.query(`SELECT * FROM ${table}`)).rows);
    result.prescriptions = camelRows(
      (
        await db.query(
          `SELECT r.*,s.signed_at FROM prescriptions r LEFT JOIN prescription_signatures s ON s.prescription_id=r.id`,
        )
      ).rows,
    );
    result.expenses = camelRows(
      (
        await db.query(
          "SELECT e.*,to_char(occurred_on,'YYYY-MM-DD') AS occurred_on,to_char(paid_on,'YYYY-MM-DD') AS paid_on FROM expenses e WHERE e.status='active' ORDER BY e.occurred_on DESC,e.created_at DESC",
        )
      ).rows,
    );
    result.visits = camelRows(
      (
        await db.query(
          `SELECT v.*, (v.base_cents+COALESCE((SELECT sum(a.total_cents) FROM applications a JOIN consultations c ON c.id=a.consultation_id WHERE c.visit_id=v.id),0))::integer AS total_cents,COALESCE((SELECT sum(p.amount_cents) FROM payments p WHERE p.visit_id=v.id),0)::integer AS received_cents FROM visits v ORDER BY starts_at`,
        )
      ).rows,
    );
    return JSON.parse(JSON.stringify(result)) as Bootstrap;
  });
}
