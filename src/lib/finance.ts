import { applicationTotal, dateKey, dateLabel } from "./domain";
import { addDays, shiftPeriod } from "./calendar";
import { financeRangeSchema, type FinanceRange } from "./finance-schema";
import type { Bootstrap } from "./types";
export function financePreset(
  preset: "month" | "previous" | "year",
  today = dateKey(),
): FinanceRange {
  const month = today.slice(0, 7) + "-01";
  if (preset === "year")
    return {
      start: today.slice(0, 4) + "-01-01",
      end: today.slice(0, 4) + "-12-31",
    };
  const start = preset === "previous" ? shiftPeriod(month, "month", -1) : month;
  return { start, end: addDays(shiftPeriod(start, "month", 1), -1) };
}
export function buildFinance(data: Bootstrap, input: FinanceRange) {
  const range = financeRangeSchema.parse(input),
    inRange = (d: string) => d >= range.start && d <= range.end;
  const tutor = (visitId: string) =>
    data.tutors.find(
      (t) => t.id === data.visits.find((v) => v.id === visitId)?.tutorId,
    )?.name || "Tutor não encontrado";
  const expenses = data.expenses.filter(
    (e) => e.status === "active" && inRange(e.occurredOn),
  );
  const resultExpenses = expenses.filter(
    (e) => e.category !== "Compra de produtos",
  );
  const paidExpenses = data.expenses.filter(
    (e) => e.status === "active" && e.paidOn && inRange(e.paidOn),
  );
  const receipts = data.payments
    .filter((p) => inRange(dateKey(p.createdAt)))
    .map((p) => ({ ...p, date: dateKey(p.createdAt), tutor: tutor(p.visitId) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const visits = data.visits
    .filter((v) => v.status === "completed" && inRange(dateKey(v.startsAt)))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .map((v) => {
      const applications = data.applications.filter((a) =>
        data.consultations.some(
          (c) => c.id === a.consultationId && c.visitId === v.id,
        ),
      );
      const costCents = applications.reduce(
        (s, a) => s + applicationTotal(a.quantityMilli, a.unitCostCents),
        0,
      );
      const expensesCents = resultExpenses
        .filter((e) => e.visitId === v.id)
        .reduce((s, e) => s + e.amountCents, 0);
      const paidCents = data.payments
        .filter((p) => p.visitId === v.id && dateKey(p.createdAt) <= range.end)
        .reduce((s, p) => s + p.amountCents, 0);
      return {
        ...v,
        date: dateKey(v.startsAt),
        tutor: tutor(v.id),
        patients: data.visitPatients
          .filter((vp) => vp.visitId === v.id)
          .map((vp) => data.patients.find((p) => p.id === vp.patientId)?.name)
          .join(", "),
        costCents,
        expensesCents,
        paidCents,
        dueCents: Math.max(0, v.totalCents - paidCents),
        resultCents: v.totalCents - costCents - expensesCents,
        applications: applications.map((a) => ({
          ...a,
          costCents: applicationTotal(a.quantityMilli, a.unitCostCents),
        })),
      };
    });
  const billedCents = visits.reduce((s, v) => s + v.totalCents, 0),
    applicationCostsCents = visits.reduce((s, v) => s + v.costCents, 0),
    expensesCents = resultExpenses.reduce((s, e) => s + e.amountCents, 0),
    receivedCents = receipts.reduce((s, p) => s + p.amountCents, 0),
    paidExpensesCents = paidExpenses.reduce((s, e) => s + e.amountCents, 0);
  const days = (Date.parse(range.end) - Date.parse(range.start)) / 86400000 + 1;
  const buckets: {
    label: string;
    start: string;
    end: string;
    revenue: number;
    cost: number;
  }[] = [];
  for (let start = range.start; start <= range.end; ) {
    const next =
      days <= 92
        ? addDays(start, 7)
        : shiftPeriod(start.slice(0, 7) + "-01", "month", 1);
    const end = addDays(next, -1) < range.end ? addDays(next, -1) : range.end;
    const vs = visits.filter((v) => v.date >= start && v.date <= end);
    buckets.push({
      label:
        days <= 92
          ? `${start.slice(8)}/${start.slice(5, 7)}`
          : new Date(start + "T12:00:00Z").toLocaleDateString("pt-BR", {
              month: "short",
              timeZone: "UTC",
            }),
      start,
      end,
      revenue: vs.reduce((s, v) => s + v.totalCents, 0),
      cost:
        vs.reduce((s, v) => s + v.costCents, 0) +
        resultExpenses
          .filter((e) => e.occurredOn >= start && e.occurredOn <= end)
          .reduce((s, e) => s + e.amountCents, 0),
    });
    start = next;
  }
  return {
    range,
    visits,
    expenses,
    paidExpenses,
    receipts,
    buckets,
    billedCents,
    receivedCents,
    applicationCostsCents,
    expensesCents,
    costsCents: applicationCostsCents + expensesCents,
    paidExpensesCents,
    cashCents: receivedCents - paidExpensesCents,
    dueCents: visits.reduce((s, v) => s + v.dueCents, 0),
    resultCents: billedCents - applicationCostsCents - expensesCents,
    periodLabel: `${dateLabel(range.start)} a ${dateLabel(range.end)}`,
    pendingVisits: data.visits.filter(
      (v) => v.status === "scheduled" && inRange(dateKey(v.startsAt)),
    ).length,
  };
}
export type FinanceReport = ReturnType<typeof buildFinance>;
export function financeCsv(report: FinanceReport, companyName: string) {
  const rows: (string | number)[][] = [];
  const num = (cents: number) => cents / 100;
  rows.push(
    ["Relatório financeiro", companyName],
    ["Período", report.range.start, report.range.end],
    ["Resumo", "Valor (R$)"],
  );
  for (const [label, value] of [
    ["Faturado", report.billedCents],
    ["Recebido no período", report.receivedCents],
    ["A receber das visitas do período (até a data final)", report.dueCents],
    ["Custos das aplicações", report.applicationCostsCents],
    ["Despesas de competência", report.expensesCents],
    ["Resultado estimado", report.resultCents],
    ["Despesas pagas no período", report.paidExpensesCents],
    ["Movimentação de caixa", report.cashCents],
  ] as [string, number][])
    rows.push([label, num(value)]);
  rows.push(
    [],
    ["RECEITAS POR VISITA"],
    [
      "Data",
      "Tutor",
      "Pacientes",
      "Faturado (R$)",
      "Custo das aplicações (R$)",
      "Despesas vinculadas no período (R$)",
      "Resultado da visita (R$)",
      "Recebido até o fim do período (R$)",
      "A receber (R$)",
      "Visita ID",
    ],
  );
  for (const v of report.visits)
    rows.push([
      v.date,
      v.tutor,
      v.patients,
      num(v.totalCents),
      num(v.costCents),
      num(v.expensesCents),
      num(v.resultCents),
      num(v.paidCents),
      num(v.dueCents),
      v.id,
    ]);
  rows.push(
    [],
    ["RECEBIMENTOS NO PERÍODO"],
    ["Data", "Tutor", "Forma", "Valor recebido (R$)", "Visita ID"],
  );
  for (const p of report.receipts)
    rows.push([p.date, p.tutor, p.method, num(p.amountCents), p.visitId]);
  rows.push(
    [],
    ["DESPESAS DE COMPETÊNCIA"],
    [
      "Data",
      "Descrição",
      "Categoria",
      "Valor (R$)",
      "Pagamento",
      "Visita ID",
      "Entra no resultado",
      "Observações",
    ],
  );
  for (const e of report.expenses)
    rows.push([
      e.occurredOn,
      e.description,
      e.category,
      num(e.amountCents),
      e.paidOn || "Em aberto",
      e.visitId || "",
      e.category === "Compra de produtos" ? "Não (somente caixa)" : "Sim",
      e.notes,
    ]);
  rows.push(
    [],
    ["DESPESAS PAGAS NO PERÍODO"],
    [
      "Pagamento",
      "Descrição",
      "Categoria",
      "Valor pago (R$)",
      "Competência",
      "Visita ID",
    ],
  );
  for (const e of report.paidExpenses)
    rows.push([
      e.paidOn!,
      e.description,
      e.category,
      num(e.amountCents),
      e.occurredOn,
      e.visitId || "",
    ]);
  rows.push(
    [],
    ["CUSTOS DE APLICAÇÕES"],
    [
      "Data da visita",
      "Tutor",
      "Produto",
      "Quantidade",
      "Unidade",
      "Custo unitário (R$)",
      "Custo total (R$)",
      "Visita ID",
    ],
  );
  for (const v of report.visits)
    for (const a of v.applications)
      rows.push([
        v.date,
        v.tutor,
        a.productName,
        a.quantityMilli / 1000,
        a.unit,
        num(a.unitCostCents),
        num(a.costCents),
        v.id,
      ]);
  rows.push(
    [],
    [
      "Critério",
      "Faturamento: visitas concluídas pela data da visita. Recebimentos: data do pagamento. Resultado: faturado menos custos aplicados e despesas de competência. Compras de produtos entram somente no caixa. Não representa saldo bancário.",
    ],
  );
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((value) => {
            if (typeof value === "number")
              return '"' + String(value).replace(".", ",") + '"';
            const safe = /^[\s]*[=+@-]/.test(value) ? "'" + value : value;
            return '"' + safe.replaceAll('"', '""') + '"';
          })
          .join(";"),
      )
      .join("\r\n")
  );
}
