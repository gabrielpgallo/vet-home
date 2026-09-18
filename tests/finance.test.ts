import { describe, it, expect } from "vitest";
import { buildFinance, financeCsv, financePreset } from "../src/lib/finance";
import { financeRangeSchema } from "../src/lib/finance-schema";
import type { Bootstrap, Expense, Visit } from "../src/lib/types";
import { defaultSettings } from "../src/lib/settings";
const visit = (
  id: string,
  day: string,
  totalCents: number,
  status: Visit["status"] = "completed",
): Visit => ({
  id,
  tutorId: "t",
  startsAt: day + "T12:00:00-03:00",
  durationMinutes: 60,
  address: "Rua A",
  baseCents: totalCents,
  status,
  totalCents,
  receivedCents: 0,
});
const expense = (
  id: string,
  amountCents: number,
  occurredOn: string,
  paidOn: string | null,
  category: Expense["category"] = "Laboratório",
  visitId: string | null = null,
): Expense => ({
  id,
  amountCents,
  occurredOn,
  paidOn,
  category,
  visitId,
  description: id,
  notes: "",
  revision: 0,
  status: "active",
  createdAt: occurredOn,
});
function fixture(): Bootstrap {
  return {
    settings: defaultSettings,
    tutors: [
      {
        id: "t",
        name: '=HYPERLINK("bad")',
        phone: "",
        email: "",
        address: "Rua A",
      },
    ],
    patients: [],
    visitPatients: [],
    visits: [
      visit("sep", "2026-09-10", 10000),
      visit("aug", "2026-08-01", 20000),
      visit("scheduled", "2026-09-12", 30000, "scheduled"),
      visit("cancelled", "2026-09-13", 40000, "cancelled"),
    ],
    consultations: [
      {
        id: "c",
        visitId: "sep",
        patientId: "p",
        status: "completed",
        notes: "",
        vitals: {},
        revision: 0,
        createdAt: "",
        updatedAt: "",
      },
    ],
    products: [
      {
        id: "product",
        name: "Preço novo",
        unit: "mL",
        costCents: 9900,
        saleCents: 9999,
        active: true,
      },
    ],
    applications: [
      {
        id: "a",
        consultationId: "c",
        productId: "product",
        productName: "Histórico",
        unit: "mL",
        quantityMilli: 1500,
        unitCostCents: 2000,
        unitSaleCents: 3000,
        totalCents: 4500,
        batch: "",
        route: "",
        createdAt: "2026-09-10",
      },
    ],
    prescriptions: [],
    exams: [],
    examLinks: [],
    timeline: [],
    payments: [
      {
        id: "p1",
        visitId: "sep",
        amountCents: 4000,
        method: "Pix",
        createdAt: "2026-09-10T12:00:00-03:00",
      },
      {
        id: "p2",
        visitId: "sep",
        amountCents: 6000,
        method: "Pix",
        createdAt: "2026-10-10T12:00:00-03:00",
      },
      {
        id: "p3",
        visitId: "aug",
        amountCents: 6000,
        method: "Dinheiro",
        createdAt: "2026-09-11T12:00:00-03:00",
      },
    ],
    expenses: [
      expense("linked", 2000, "2026-09-10", null, "Laboratório", "sep"),
      expense("general", 1000, "2026-09-10", "2026-10-10"),
      expense(
        "purchase",
        8000,
        "2026-09-10",
        "2026-09-10",
        "Compra de produtos",
      ),
      expense("past", 500, "2026-08-01", "2026-09-10"),
      {
        ...expense("void", 99999, "2026-09-01", "2026-09-01"),
        status: "voided",
      },
    ],
  };
}
const range = { start: "2026-09-01", end: "2026-09-30" };
describe("financeiro por período", () => {
  it("separa resultado por competência e fluxo de caixa", () => {
    const r = buildFinance(fixture(), range);
    expect(r.billedCents).toBe(10000);
    expect(r.receivedCents).toBe(10000);
    expect(r.applicationCostsCents).toBe(3000);
    expect(r.expensesCents).toBe(3000);
    expect(r.resultCents).toBe(4000);
    expect(r.paidExpensesCents).toBe(8500);
    expect(r.cashCents).toBe(1500);
    expect(r.dueCents).toBe(6000);
    expect(r.visits[0].resultCents).toBe(5000);
  });
  it("usa preço histórico, ignora agendamentos e não desconta compras duas vezes", () => {
    const data = fixture(),
      r = buildFinance(data, range);
    expect(r.visits).toHaveLength(1);
    expect(r.pendingVisits).toBe(1);
    expect(r.buckets.reduce((s, b) => s + b.revenue, 0)).toBe(r.billedCents);
    expect(r.buckets.reduce((s, b) => s + b.cost, 0)).toBe(r.costsCents);
    expect(r.expenses).toHaveLength(3);
    expect(r.receipts).toHaveLength(2);
  });
  it("usa a data de Brasília para recebimentos na virada do mês", () => {
    const data = fixture();
    data.payments = [
      {
        id: "midnight",
        visitId: "sep",
        amountCents: 1000,
        method: "Pix",
        createdAt: "2026-10-01T01:30:00Z",
      },
    ];
    expect(buildFinance(data, range).receivedCents).toBe(1000);
  });
  it("gera resultado negativo e período vazio sem inventar receitas", () => {
    const data = fixture();
    data.visits = [];
    data.payments = [];
    const r = buildFinance(data, range);
    expect(r.resultCents).toBe(-3000);
    expect(r.cashCents).toBe(-8500);
    expect(
      buildFinance(data, { start: "2025-01-01", end: "2025-01-31" })
        .resultCents,
    ).toBe(0);
  });
  it("valida limites e suporta ano bissexto", () => {
    expect(
      financeRangeSchema.safeParse({ start: "2026-02-30", end: "2026-03-01" })
        .success,
    ).toBe(false);
    expect(
      financeRangeSchema.safeParse({ start: "2026-10-01", end: "2026-09-01" })
        .success,
    ).toBe(false);
    expect(
      financeRangeSchema.safeParse({ start: "2025-01-01", end: "2026-12-31" })
        .success,
    ).toBe(false);
    expect(financePreset("previous", "2024-03-31")).toEqual({
      start: "2024-02-01",
      end: "2024-02-29",
    });
    expect(
      financeRangeSchema.safeParse(financePreset("year", "2024-06-01")).success,
    ).toBe(true);
  });
  it("exporta totais equivalentes e neutraliza fórmulas de texto no CSV", () => {
    const csv = financeCsv(buildFinance(fixture(), range), "IR Saúde Animal");
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"Resultado estimado";"40"');
    expect(csv).toContain("'=" + "HYPERLINK");
    expect(csv).toContain('"Compra de produtos"');
    expect(csv).toContain('"Não (somente caixa)"');
  });
});
