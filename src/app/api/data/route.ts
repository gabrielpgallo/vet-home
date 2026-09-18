import { requestIdentity } from "@/server/context";
import { can } from "@/lib/permissions";
import { NextResponse } from "next/server";
import { loadData } from "@/server/data";
import { withAccess } from "@/server/access";
import { apiError } from "@/server/http";
export const dynamic = "force-dynamic";
async function handleGET() {
  try {
    const data = await loadData(),
      actor = requestIdentity.getStore()!;
    if (!can(actor.role, "finance.read")) {
      data.expenses = [];
      data.products = data.products.map((p) => ({ ...p, costCents: 0 }));
      data.applications = data.applications.map((a) => ({
        ...a,
        unitCostCents: 0,
      }));
    }
    if (!can(actor.role, "clinical.read")) {
      data.patients = data.patients.map((p) => ({ ...p, notes: "" }));
      data.consultations = data.consultations.map((c) => ({
        ...c,
        notes: "",
        vitals: {},
      }));
      data.applications = data.applications.map((a) => ({
        ...a,
        batch: "",
        route: "",
      }));
      data.prescriptions = [];
      data.exams = [];
      data.examLinks = [];
      data.timeline = [];
    }
    return NextResponse.json(
      { ...data, identity: actor },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (e) {
    return apiError(e);
  }
}

export const GET = withAccess(null, handleGET);
