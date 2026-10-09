"use client";
import { useRef, useState } from "react";
import { PenLine } from "lucide-react";
import {
  applicationTotal,
  dateKey,
  dateLabel,
  money,
  parseFixed,
  paymentMethods,
  type Command,
} from "@/lib/domain";
import type { Bootstrap } from "@/lib/types";
import { can } from "@/lib/permissions";
import { Dialog } from "./dialog";
import { MaskedInput } from "./masked-input";
import { AsyncForm, Field, PaymentForm, type Mutate } from "./forms";

export function CorrectionReason() {
  return (
    <label>
      Motivo da correção
      <textarea
        name="reason"
        required
        minLength={3}
        maxLength={2000}
        rows={2}
        placeholder="Descreva o que precisa ser corrigido."
      />
      <span className="hint">
        A alteração e os valores anteriores ficam registrados na auditoria.
      </span>
    </label>
  );
}
export function RecordCorrection({
  kind,
  id,
  data,
  mutate,
}: {
  kind: "visit" | "application" | "payment";
  id: string;
  data: Bootstrap;
  mutate: Mutate;
}) {
  const [open, setOpen] = useState(false),
    dirty = useRef(false);
  const allowed =
    !!data.identity &&
    can(
      data.identity.role,
      kind === "visit" || kind === "payment"
        ? "payments.write"
        : "clinical.write",
    );
  if (!allowed) return null;
  const title =
    kind === "visit"
      ? data.visits.find((x) => x.id === id)?.status === "completed"
        ? "Corrigir cobrança"
        : "Editar cobrança"
      : kind === "application"
        ? "Corrigir aplicação"
        : "Corrigir recebimento";
  return (
    <>
      <button className="compact-action" onClick={() => setOpen(true)}>
        <PenLine size={15} />
        {title}
      </button>
      {open && (
        <Dialog
          title={title}
          drawer
          dirtyRef={dirty}
          onClose={() => setOpen(false)}
        >
          <CorrectionEditor
            kind={kind}
            id={id}
            data={data}
            mutate={mutate}
            done={() => setOpen(false)}
          />
        </Dialog>
      )}
    </>
  );
}
function CorrectionEditor({
  kind,
  id,
  data,
  mutate,
  done,
}: {
  kind: "visit" | "application" | "payment";
  id: string;
  data: Bootstrap;
  mutate: Mutate;
  done: () => void;
}) {
  const a = data.applications.find((x) => x.id === id),
    p = data.payments.find((x) => x.id === id),
    v = data.visits.find((x) => x.id === (kind === "visit" ? id : p?.visitId));
  const [action, setAction] = useState("correct"),
    [product, setProduct] = useState(a?.productId || ""),
    [quantity, setQuantity] = useState(
      String((a?.quantityMilli || 1000) / 1000),
    ),
    [price, setPrice] = useState(
      ((a?.unitSaleCents || 0) / 100).toFixed(2).replace(".", ","),
    );
  const chosen = data.products.find((x) => x.id === product);
  let total: number | null = null;
  try {
    total = applicationTotal(parseFixed(quantity, 3), parseFixed(price));
  } catch {}
  const str = (d: FormData, k: string) => String(d.get(k) || "");
  return (
    <AsyncForm
      submit={
        action === "void"
          ? "Confirmar cancelamento"
          : kind === "visit" && v?.status !== "completed"
            ? "Salvar cobrança"
            : "Salvar correção"
      }
      onSubmit={async (d) => {
        const reason = str(d, "reason");
        let cmd: Command;
        if (kind === "visit" && v)
          cmd = {
            type: "visit.correct",
            id,
            revision: v.revision || 0,
            reason: reason || undefined,
            baseCents: parseFixed(str(d, "base")),
            address: str(d, "address"),
            performedOn:
              v.origin === "direct"
                ? v.performedOn || null
                : str(d, "date") || null,
          };
        else if (kind === "application" && a)
          cmd =
            action === "void"
              ? {
                  type: "application.void",
                  id,
                  revision: a.revision || 0,
                  reason,
                }
              : {
                  type: "application.correct",
                  id,
                  revision: a.revision || 0,
                  reason,
                  productId: product,
                  quantityMilli: parseFixed(quantity, 3),
                  unitSaleCents: parseFixed(price),
                  batch: str(d, "batch"),
                  route: str(d, "route"),
                };
        else if (kind === "payment" && p)
          cmd =
            action === "void"
              ? { type: "payment.void", id, reason }
              : {
                  type: "payment.correct",
                  id,
                  reason,
                  amountCents: parseFixed(str(d, "amount")),
                  method: str(d, "method") as (typeof paymentMethods)[number],
                  paidOn: str(d, "date"),
                };
        else throw Error("Registro não encontrado.");
        await mutate(cmd);
        done();
      }}
    >
      {kind !== "visit" && (
        <label>
          Ação
          <select value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="correct">Corrigir informações</option>
            <option value="void">Cancelar registro incorreto</option>
          </select>
        </label>
      )}
      {action === "void" ? (
        <p className="notice">
          O registro original será preservado e deixará de compor os totais.
        </p>
      ) : (
        <>
          {kind === "visit" && v && (
            <>
              <p className="hint">
                O valor base é compartilhado pelos pacientes desta visita.
                Alterar a competência não move o agendamento.
              </p>
              <Field
                label="Consulta e deslocamento (R$)"
                name="base"
                mask="money"
                value={(v.baseCents / 100).toFixed(2).replace(".", ",")}
                required
              />
              <Field
                label="Data de competência"
                name="date"
                type="date"
                value={v.performedOn || ""}
                required={v.status === "completed"}
                disabled={v.origin === "direct"}
              />
              {v.origin === "direct" && (
                <p className="hint">
                  A data acompanha o registro clínico deste atendimento avulso.
                </p>
              )}
              <Field
                label="Endereço do atendimento"
                name="address"
                value={v.address}
                required
              />
            </>
          )}
          {kind === "application" && a && (
            <>
              <label>
                Produto
                <select
                  value={product}
                  onChange={(e) => {
                    setProduct(e.target.value);
                    const selected = data.products.find(
                      (x) => x.id === e.target.value,
                    );
                    setPrice(
                      ((selected?.saleCents || 0) / 100)
                        .toFixed(2)
                        .replace(".", ","),
                    );
                  }}
                >
                  {data.products.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name} · {x.unit}
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-grid">
                <label>
                  Quantidade aplicada
                  <input
                    inputMode="decimal"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Venda por unidade (R$)
                  <MaskedInput
                    mask="money"
                    value={price}
                    onValueChange={setPrice}
                    required
                  />
                </label>
                <Field label="Lote" name="batch" value={a.batch} />
                <Field label="Via de aplicação" name="route" value={a.route} />
              </div>
              <div className="calculation row between">
                <span>
                  {quantity} {chosen?.unit}
                </span>
                <strong>{total === null ? "—" : money(total)}</strong>
              </div>
            </>
          )}
          {kind === "payment" && p && (
            <>
              <Field
                label="Valor recebido (R$)"
                name="amount"
                mask="money"
                value={(p.amountCents / 100).toFixed(2).replace(".", ",")}
                required
              />
              <Field
                label="Data do recebimento"
                name="date"
                type="date"
                value={p.paidOn || dateKey(p.createdAt)}
                max={dateKey()}
                required
              />
              <label>
                Forma de pagamento
                <select name="method" defaultValue={p.method}>
                  {paymentMethods.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
            </>
          )}
        </>
      )}
      {kind === "payment" && (
        <p className="hint">
          Esta ação corrige o registro no sistema. Não realiza estorno no banco
          ou na operadora do cartão.
        </p>
      )}
      {(kind !== "visit" || v?.status === "completed") && <CorrectionReason />}
    </AsyncForm>
  );
}
export function VoidDocument({
  kind,
  id,
  mutate,
}: {
  kind: "prescription" | "exam";
  id: string;
  mutate: Mutate;
}) {
  const [open, setOpen] = useState(false),
    dirty = useRef(false);
  return (
    <>
      <button className="compact-action" onClick={() => setOpen(true)}>
        Cancelar documento
      </button>
      {open && (
        <Dialog
          title="Cancelar documento"
          dirtyRef={dirty}
          onClose={() => setOpen(false)}
        >
          <AsyncForm
            submit="Confirmar cancelamento"
            onSubmit={async (d) => {
              await mutate({
                type:
                  kind === "prescription" ? "prescription.void" : "exam.void",
                id,
                reason: String(d.get("reason") || ""),
              });
              setOpen(false);
            }}
          >
            <p>
              O original continuará disponível no histórico, identificado como
              cancelado. O PDF já enviado ao tutor não é recolhido
              automaticamente.
            </p>
            <CorrectionReason />
          </AsyncForm>
        </Dialog>
      )}
    </>
  );
}
export function EncounterBilling({
  visitId,
  data,
  mutate,
}: {
  visitId: string;
  data: Bootstrap;
  mutate: Mutate;
}) {
  const v = data.visits.find((x) => x.id === visitId)!,
    [pay, setPay] = useState(false),
    dirty = useRef(false);
  const applications = data.applications.filter(
    (a) =>
      a.status !== "voided" &&
      data.consultations.some(
        (c) => c.id === a.consultationId && c.visitId === v.id,
      ),
  );
  const due = v.totalCents - v.receivedCents;
  const payments = data.payments.filter((p) => p.visitId === v.id);
  return (
    <section className="panel bill">
      <div className="section-heading">
        <h2>
          {v.origin === "direct"
            ? "Cobrança do atendimento"
            : "Cobrança da visita"}
        </h2>
        <RecordCorrection kind="visit" id={v.id} data={data} mutate={mutate} />
      </div>
      <p className="hint">
        Competência: {dateLabel(v.performedOn || v.startsAt)}
      </p>
      <div className="bill-line">
        <span>Consulta e deslocamento</span>
        <strong>{money(v.baseCents)}</strong>
      </div>
      {applications.map((a) => (
        <div className="bill-line" key={a.id}>
          <span>
            {a.productName}
            <small>
              {a.quantityMilli / 1000} {a.unit}
            </small>
          </span>
          <span>{money(a.totalCents)}</span>
        </div>
      ))}
      <div className="bill-line total">
        <span>Total</span>
        <strong>{money(v.totalCents)}</strong>
      </div>
      <div className="bill-line">
        <span>Recebido</span>
        <span>{money(v.receivedCents)}</span>
      </div>
      <div className="bill-line">
        <span>{due < 0 ? "Recebido a maior" : "Em aberto"}</span>
        <strong>{money(Math.abs(due))}</strong>
      </div>
      {due < 0 && (
        <p className="notice">
          Confira se é preciso corrigir um recebimento ou combinar a devolução
          de {money(-due)} com o tutor.
        </p>
      )}
      {payments
        .filter((p) => p.status !== "voided")
        .map((p) => (
          <div className="record-row" key={p.id}>
            <span>
              {dateLabel(p.paidOn || p.createdAt)} · {p.method} ·{" "}
              {money(p.amountCents)}
            </span>
            <RecordCorrection
              kind="payment"
              id={p.id}
              data={data}
              mutate={mutate}
            />
          </div>
        ))}
      {payments.some((p) => p.status === "voided") && (
        <details className="record-archive">
          <summary>Recebimentos corrigidos ou cancelados</summary>
          {payments
            .filter((p) => p.status === "voided")
            .map((p) => (
              <p key={p.id} className="hint">
                {dateLabel(p.paidOn || p.createdAt)} · {p.method} ·{" "}
                {money(p.amountCents)} ·{" "}
                {payments.some((x) => x.replacesId === p.id)
                  ? "Substituído"
                  : "Cancelado"}
              </p>
            ))}
        </details>
      )}
      {data.identity && can(data.identity.role, "payments.write") && (
        <button
          className="primary full"
          disabled={v.status === "cancelled" || due <= 0}
          onClick={() => setPay(true)}
        >
          Registrar recebimento
        </button>
      )}
      {pay && (
        <Dialog
          title="Registrar recebimento"
          dirtyRef={dirty}
          onClose={() => setPay(false)}
        >
          <PaymentForm visit={v} mutate={mutate} onDone={() => setPay(false)} />
        </Dialog>
      )}
    </section>
  );
}
