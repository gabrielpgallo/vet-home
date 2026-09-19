"use client";
import { MaskedInput } from "./masked-input";
import { useEffect, useRef, useState } from "react";
import { Plus, Download, ArrowUpRight, Wallet } from "lucide-react";
import { AsyncForm } from "./forms";
import type { Mutate } from "./forms";
import type { Bootstrap, Expense } from "@/lib/types";
import { buildFinance, financePreset, type FinanceReport } from "@/lib/finance";
import {
  expenseCategories,
  financeRangeSchema,
  type FinanceRange,
} from "@/lib/finance-schema";
import { dateKey, dateLabel, money, parseFixed } from "@/lib/domain";
export function Finance({
  data,
  mutate,
  openVisit,
}: {
  data: Bootstrap;
  mutate: Mutate;
  openVisit: (id: string) => void;
}) {
  const [range, setRange] = useState<FinanceRange>(() =>
      financePreset("month"),
    ),
    [preset, setPreset] = useState("month"),
    [editing, setEditing] = useState<Expense | null | undefined>(undefined),
    [error, setError] = useState("");
  const parsed = financeRangeSchema.safeParse(range);
  const report = parsed.success ? buildFinance(data, parsed.data) : null;
  const exportUrl = (format: string) =>
    `/api/finance/report?start=${range.start}&end=${range.end}&format=${format}`;
  const visitLabel = (id: string | null) => {
    const v = data.visits.find((v) => v.id === id);
    return v
      ? `${dateLabel(v.startsAt)} · ${data.tutors.find((t) => t.id === v.tutorId)?.name}`
      : "";
  };
  return (
    <>
      <div className="finance-toolbar">
        <div className="finance-filters">
          <label>
            Período
            <select
              value={preset}
              onChange={(e) => {
                setPreset(e.target.value);
                if (e.target.value !== "custom")
                  setRange(
                    financePreset(
                      e.target.value as "month" | "previous" | "year",
                    ),
                  );
              }}
            >
              <option value="month">Este mês</option>
              <option value="previous">Mês anterior</option>
              <option value="year">Este ano</option>
              <option value="custom">Personalizado</option>
            </select>
          </label>
          <label>
            De
            <input
              type="date"
              value={range.start}
              onChange={(e) => {
                setRange({ ...range, start: e.target.value });
                setPreset("custom");
              }}
            />
          </label>
          <label>
            Até
            <input
              type="date"
              value={range.end}
              onChange={(e) => {
                setRange({ ...range, end: e.target.value });
                setPreset("custom");
              }}
            />
          </label>
        </div>
        <div className="row wrap">
          <button className="primary" onClick={() => setEditing(null)}>
            <Plus size={17} />
            Nova despesa
          </button>
          {report && (
            <>
              <a className="button-link" href={exportUrl("pdf")}>
                <Download size={16} />
                Relatório PDF
              </a>
              <a className="button-link" href={exportUrl("csv")}>
                Exportar CSV
              </a>
            </>
          )}
        </div>
      </div>
      {!parsed.success && (
        <p className="error" role="alert">
          Informe um período válido, com início anterior ao fim e no máximo 366
          dias.
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {report && (
        <>
          <div className="stats finance-stats">
            <Summary
              label="Faturado"
              value={report.billedCents}
              detail={`${report.visits.length} visitas concluídas no período`}
            />
            <Summary
              label="Recebido"
              value={report.receivedCents}
              detail="Pagamentos que entraram no período"
            />
            <Summary
              label="A receber"
              value={report.dueCents}
              detail="Visitas do período, saldo na data final"
            />
            <Summary
              label="Resultado estimado"
              value={report.resultCents}
              detail="Faturado menos custos e despesas"
            />
          </div>
          <div className="finance-overview">
            <section className="panel">
              <div className="section-heading">
                <h2>Receitas e custos</h2>
                <span className="hint">Evolução no período</span>
              </div>
              <FinanceChart report={report} />
            </section>
            <section className="panel">
              <h2>Como chegamos ao resultado</h2>
              <Amount label="Faturado" value={report.billedCents} />
              <Amount
                label="Custo das aplicações"
                value={-report.applicationCostsCents}
              />
              <Amount
                label="Despesas de competência"
                value={-report.expensesCents}
              />
              <Amount
                label="Resultado estimado"
                value={report.resultCents}
                strong
              />
              <p className="hint">
                O custo das aplicações usa o valor registrado na época do
                atendimento. As demais despesas entram pela data de competência,
                pagas ou não.
              </p>
            </section>
          </div>
          <section className="panel finance-cash">
            <div>
              <h2>
                <Wallet size={18} /> Movimentação de caixa
              </h2>
              <p className="hint">
                Entradas e saídas registradas no período. Não representa o saldo
                da conta bancária.
              </p>
            </div>
            <Amount label="Recebimentos" value={report.receivedCents} />
            <Amount label="Despesas pagas" value={-report.paidExpensesCents} />
            <Amount
              label="Movimentação líquida"
              value={report.cashCents}
              strong
            />
          </section>
          <section className="panel finance-section">
            <div className="section-heading">
              <h2>Receitas por atendimento</h2>
              <span className="badge">{report.visits.length} visitas</span>
            </div>
            <p className="hint">
              Visitas concluídas pela data da visita. Recebido e a receber
              consideram pagamentos até {dateLabel(range.end)}.{" "}
              {report.pendingVisits > 0 &&
                `${report.pendingVisits} visita(s) agendada(s) ou em andamento não entram no faturamento.`}
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Visita / tutor</th>
                    <th>Faturado</th>
                    <th>Custo aplicado</th>
                    <th>Despesas vinculadas</th>
                    <th>Resultado da visita</th>
                    <th>Recebido</th>
                    <th>A receber</th>
                  </tr>
                </thead>
                <tbody>
                  {report.visits.map((v) => (
                    <tr key={v.id}>
                      <td>
                        <button
                          className="text-link"
                          onClick={() => openVisit(v.id)}
                        >
                          {v.tutor}
                          <ArrowUpRight size={14} />
                        </button>
                        <small className="table-detail">
                          {dateLabel(v.startsAt)} · {v.patients}
                        </small>
                      </td>
                      <td>{money(v.totalCents)}</td>
                      <td>{money(v.costCents)}</td>
                      <td>{money(v.expensesCents)}</td>
                      <td className={v.resultCents < 0 ? "negative" : ""}>
                        {money(v.resultCents)}
                      </td>
                      <td>{money(v.paidCents)}</td>
                      <td>{money(v.dueCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!report.visits.length && (
              <p className="empty muted">
                Nenhuma visita concluída neste período.
              </p>
            )}
            <p className="hint">
              O resultado por visita desconta apenas suas despesas vinculadas
              neste período. Despesas gerais também são descontadas do resultado
              total.
            </p>
          </section>
          <section className="panel finance-section">
            <div className="section-heading">
              <h2>Despesas</h2>
              <button onClick={() => setEditing(null)}>
                <Plus size={16} />
                Nova despesa
              </button>
            </div>
            <p className="hint">
              Despesas pela data de competência. Compras de produtos entram
              somente no caixa; o custo do produto utilizado já é calculado nas
              aplicações.
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Descrição</th>
                    <th>Competência</th>
                    <th>Categoria</th>
                    <th>Valor</th>
                    <th>Pagamento</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {report.expenses.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <strong>{e.description}</strong>
                        {e.visitId && (
                          <small className="table-detail">
                            {visitLabel(e.visitId)}
                          </small>
                        )}
                        {e.notes && (
                          <small className="table-detail expense-note">
                            {e.notes}
                          </small>
                        )}
                      </td>
                      <td>{dateLabel(e.occurredOn)}</td>
                      <td>
                        {e.category}
                        {e.category === "Compra de produtos" && (
                          <small className="table-detail">Somente caixa</small>
                        )}
                      </td>
                      <td>{money(e.amountCents)}</td>
                      <td>
                        {e.paidOn ? (
                          dateLabel(e.paidOn)
                        ) : (
                          <span className="badge">Em aberto</span>
                        )}
                      </td>
                      <td>
                        <div className="row">
                          <button onClick={() => setEditing(e)}>Editar</button>
                          <button
                            onClick={async () => {
                              if (
                                !confirm(
                                  `Excluir a despesa “${e.description}”?`,
                                )
                              )
                                return;
                              setError("");
                              try {
                                await mutate({
                                  type: "expense.void",
                                  id: e.id,
                                  revision: e.revision,
                                });
                              } catch (err) {
                                setError((err as Error).message);
                              }
                            }}
                          >
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!report.expenses.length && (
              <p className="empty muted">
                Nenhuma despesa cadastrada no período.
              </p>
            )}
          </section>
          <section className="panel finance-section">
            <h2>Recebimentos no período</h2>
            <p className="hint">
              Inclui pagamentos de visitas de outros períodos e adiantamentos.
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Tutor</th>
                    <th>Forma</th>
                    <th>Recebido</th>
                  </tr>
                </thead>
                <tbody>
                  {report.receipts.map((p) => (
                    <tr key={p.id}>
                      <td>{dateLabel(p.date)}</td>
                      <td>
                        <button
                          className="text-link"
                          onClick={() => openVisit(p.visitId)}
                        >
                          {p.tutor}
                        </button>
                      </td>
                      <td>{p.method}</td>
                      <td>{money(p.amountCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!report.receipts.length && (
              <p className="empty muted">Nenhum recebimento no período.</p>
            )}
          </section>
          <section className="panel finance-section">
            <h2>Despesas pagas no período</h2>
            <p className="hint">
              Conferência das saídas de caixa, inclusive despesas de outros
              períodos e compras de produtos.
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Pagamento</th>
                    <th>Descrição</th>
                    <th>Competência</th>
                    <th>Pago</th>
                  </tr>
                </thead>
                <tbody>
                  {report.paidExpenses.map((e) => (
                    <tr key={e.id}>
                      <td>{dateLabel(e.paidOn!)}</td>
                      <td>{e.description}</td>
                      <td>{dateLabel(e.occurredOn)}</td>
                      <td>{money(e.amountCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!report.paidExpenses.length && (
              <p className="empty muted">
                Nenhum pagamento de despesa no período.
              </p>
            )}
          </section>
        </>
      )}
      {editing !== undefined && (
        <ExpenseDialog
          expense={editing}
          data={data}
          mutate={mutate}
          onClose={() => setEditing(undefined)}
        />
      )}
    </>
  );
}
function Summary({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong className={value < 0 ? "negative" : ""}>{money(value)}</strong>
      <small className="hint">{detail}</small>
    </div>
  );
}
function Amount({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div className={`bill-line ${strong ? "total" : ""}`}>
      <span>{label}</span>
      <strong className={value < 0 ? "negative" : ""}>{money(value)}</strong>
    </div>
  );
}
function FinanceChart({ report }: { report: FinanceReport }) {
  const max = Math.max(
    1,
    ...report.buckets.flatMap((b) => [b.revenue, b.cost]),
  );
  if (!report.buckets.some((b) => b.revenue || b.cost))
    return (
      <p className="empty muted">Os registros do período aparecerão aqui.</p>
    );
  return (
    <>
      <div className="chart-legend">
        <span>
          <i />
          Faturado
        </span>
        <span>
          <i className="cost" />
          Custos e despesas
        </span>
      </div>
      <div
        className="finance-chart"
        role="img"
        aria-label="Comparação entre faturamento e custos por período"
      >
        {report.buckets.map((b) => (
          <div
            className="chart-column"
            key={b.start}
            title={`${dateLabel(b.start)} a ${dateLabel(b.end)}: faturado ${money(b.revenue)}, custos ${money(b.cost)}`}
          >
            <div className="chart-bars">
              <div
                className="revenue-bar"
                style={{ height: `${(b.revenue / max) * 100}%` }}
              />
              <div
                className="cost-bar"
                style={{ height: `${(b.cost / max) * 100}%` }}
              />
            </div>
            <span>{b.label}</span>
          </div>
        ))}
      </div>
      <details className="chart-values">
        <summary>Ver valores do gráfico</summary>
        {report.buckets.map((b) => (
          <p className="hint" key={b.start}>
            {dateLabel(b.start)} a {dateLabel(b.end)}: faturado{" "}
            {money(b.revenue)} · custos {money(b.cost)}
          </p>
        ))}
      </details>
    </>
  );
}
function ExpenseDialog({
  expense,
  data,
  mutate,
  onClose,
}: {
  expense: Expense | null;
  data: Bootstrap;
  mutate: Mutate;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  const [category, setCategory] = useState<Expense["category"]>(
      expense?.category || "Outras despesas",
    ),
    [visitId, setVisitId] = useState(expense?.visitId || ""),
    [occurred, setOccurred] = useState(expense?.occurredOn || dateKey()),
    [paid, setPaid] = useState(expense ? !!expense.paidOn : true);
  return (
    <dialog ref={ref} onCancel={onClose} aria-labelledby="expense-title">
      <div className="dialog-head">
        <h2 id="expense-title">
          {expense ? "Editar despesa" : "Nova despesa"}
        </h2>
        <button aria-label="Fechar despesa" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="dialog-body">
        <AsyncForm
          submit="Salvar despesa"
          onSubmit={async (form) => {
            const values = {
              description: String(form.get("description") || ""),
              category,
              amountCents: parseFixed(String(form.get("amount") || "")),
              occurredOn: occurred,
              paidOn: paid ? String(form.get("paidOn")) : null,
              visitId: visitId || null,
              notes: String(form.get("notes") || ""),
            };
            await mutate(
              expense
                ? {
                    type: "expense.update",
                    id: expense.id,
                    revision: expense.revision,
                    data: values,
                  }
                : { type: "expense.create", data: values },
            );
            onClose();
          }}
        >
          <label>
            Descrição
            <input
              name="description"
              defaultValue={expense?.description}
              maxLength={240}
              required
              placeholder="Ex.: laboratório do exame do Thor"
            />
          </label>
          <div className="form-grid">
            <label>
              Categoria
              <select
                value={category}
                onChange={(e) =>
                  setCategory(e.target.value as Expense["category"])
                }
              >
                {expenseCategories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              Valor (R$)
              <MaskedInput
                mask="money"
                name="amount"
                defaultValue={
                  expense
                    ? (expense.amountCents / 100).toFixed(2).replace(".", ",")
                    : ""
                }
                inputMode="decimal"
                required
              />
            </label>
          </div>
          <label>
            Vincular a uma visita (opcional)
            <select
              value={visitId}
              onChange={(e) => {
                setVisitId(e.target.value);
                if (!expense) {
                  const v = data.visits.find((v) => v.id === e.target.value);
                  if (v) setOccurred(dateKey(v.startsAt));
                }
              }}
            >
              <option value="">Despesa geral</option>
              {[...data.visits]
                .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    {dateLabel(v.startsAt)} ·{" "}
                    {data.tutors.find((t) => t.id === v.tutorId)?.name}
                    {v.status === "cancelled" ? " · cancelada" : ""}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Data de competência
            <input
              type="date"
              value={occurred}
              onChange={(e) => setOccurred(e.target.value)}
              required
            />
          </label>
          <p className="hint">
            Quando esse gasto pertence ao resultado. Ao selecionar uma visita,
            sugerimos a data do atendimento.
          </p>
          <label className="check-row">
            <input
              type="checkbox"
              checked={paid}
              onChange={(e) => setPaid(e.target.checked)}
            />
            Despesa já paga
          </label>
          {paid && (
            <label>
              Data do pagamento
              <input
                name="paidOn"
                type="date"
                max={dateKey()}
                defaultValue={expense?.paidOn || dateKey()}
                required
              />
            </label>
          )}
          {category === "Compra de produtos" && (
            <p className="notice">
              Esta compra entra nas saídas de caixa quando paga. O resultado
              considera o custo dos produtos nas aplicações, evitando desconto
              em duplicidade.
            </p>
          )}
          <label>
            Observações
            <textarea
              name="notes"
              defaultValue={expense?.notes}
              maxLength={3000}
            />
          </label>
        </AsyncForm>
      </div>
    </dialog>
  );
}
