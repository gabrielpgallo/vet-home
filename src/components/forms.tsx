"use client";
import { useState, type FormEvent, type ReactNode, useRef } from "react";
import {
  applicationTotal,
  dateKey,
  dateLabel,
  money,
  parseFixed,
  paymentMethods,
  units,
  type Command,
  type RxItem,
} from "@/lib/domain";
import type {
  Bootstrap,
  Consultation,
  Exam,
  Patient,
  Product,
  Tutor,
  Visit,
} from "@/lib/types";
export type Mutate = (
  command: Command,
) => Promise<{ id: string; revision?: number; data: Bootstrap }>;
const str = (d: FormData, k: string) => String(d.get(k) || "");
export function Field({
  label,
  name,
  value = "",
  ...props
}: { label: string; name: string; value?: string | number } & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value"
>) {
  return (
    <label>
      {label}
      <input name={name} defaultValue={value} {...props} />
    </label>
  );
}
export function AsyncForm({
  children,
  onSubmit,
  submit = "Salvar",
  secondarySubmit,
}: {
  children: ReactNode;
  onSubmit: (data: FormData, action: "primary" | "secondary") => Promise<void>;
  submit?: string;
  secondarySubmit?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const d = new FormData(e.currentTarget);
    try {
      const submitter = (e.nativeEvent as SubmitEvent)
        .submitter as HTMLButtonElement | null;
      await onSubmit(
        d,
        submitter?.value === "secondary" ? "secondary" : "primary",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={send} className="form-stack">
      <fieldset disabled={busy}>{children}</fieldset>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        {secondarySubmit && (
          <button type="submit" name="action" value="secondary" disabled={busy}>
            {secondarySubmit}
          </button>
        )}
        <button
          type="submit"
          name="action"
          value="primary"
          className="primary"
          disabled={busy}
        >
          {busy ? "Salvando…" : submit}
        </button>
      </div>
    </form>
  );
}
export function TutorForm({
  tutor,
  mutate,
  onDone,
}: {
  tutor?: Tutor;
  mutate: Mutate;
  onDone: (id: string) => void;
}) {
  return (
    <AsyncForm
      onSubmit={async (d) => {
        const data = {
          name: str(d, "name"),
          phone: str(d, "phone"),
          email: str(d, "email"),
          address: str(d, "address"),
          document: str(d, "document"),
        };
        const r = await mutate(
          tutor
            ? { type: "tutor.update", id: tutor.id, data }
            : {
                type: "tutor.create",
                data,
                patientNames: str(d, "patients")
                  .split(",")
                  .map((x) => x.trim())
                  .filter(Boolean),
              },
        );
        onDone(r.id);
      }}
    >
      <div className="form-grid">
        <Field label="Nome do tutor" name="name" value={tutor?.name} required />
        <Field label="Telefone / WhatsApp" name="phone" value={tutor?.phone} />
        <Field label="E-mail" name="email" type="email" value={tutor?.email} />
        <Field
          label="CPF / CNPJ (opcional)"
          name="document"
          value={tutor?.document}
          maxLength={30}
        />
        <Field
          label="Endereço"
          name="address"
          value={tutor?.address}
          required
        />
        {!tutor && (
          <Field
            label="Nome dos animais (separados por vírgula)"
            name="patients"
            placeholder="Ex.: Thor, Mel"
          />
        )}
      </div>
      <p className="hint">
        Nome e endereço bastam para começar. Complete os demais dados quando
        precisar.
      </p>
    </AsyncForm>
  );
}
export function PatientForm({
  patient,
  data,
  mutate,
  onDone,
}: {
  patient?: Patient;
  data: Bootstrap;
  mutate: Mutate;
  onDone: () => void;
}) {
  return (
    <AsyncForm
      onSubmit={async (d) => {
        const values = {
          tutorId: patient?.tutorId || str(d, "tutor"),
          name: str(d, "name"),
          species: str(d, "species") as "Cão" | "Gato" | "Não informada",
          breed: str(d, "breed"),
          sex: str(d, "sex") as "Macho" | "Fêmea" | "Não informado",
          birthDate: str(d, "birthDate") || null,
          notes: str(d, "notes"),
        };
        await mutate(
          patient
            ? { type: "patient.update", id: patient.id, data: values }
            : { type: "patient.create", data: values },
        );
        onDone();
      }}
    >
      <div className="form-grid">
        <label>
          Tutor
          <select
            name="tutor"
            defaultValue={patient?.tutorId}
            disabled={!!patient}
            required
          >
            <option value="">Selecione</option>
            {data.tutors.map((t) => (
              <option value={t.id} key={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <Field
          label="Nome do paciente"
          name="name"
          value={patient?.name}
          required
        />
        <label>
          Espécie
          <select
            name="species"
            defaultValue={patient?.species || "Não informada"}
          >
            {["Não informada", "Cão", "Gato"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <Field label="Raça" name="breed" value={patient?.breed} />
        <label>
          Sexo
          <select name="sex" defaultValue={patient?.sex || "Não informado"}>
            {["Não informado", "Macho", "Fêmea"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <Field
          label="Nascimento"
          name="birthDate"
          type="date"
          max={dateKey()}
          value={patient?.birthDate?.slice(0, 10) || ""}
        />
      </div>
      <label hidden={data.identity?.role === "assistant"}>
        Observações e alertas
        <textarea
          name="notes"
          defaultValue={patient?.notes}
          placeholder="Alergias conhecidas, cuidados ou outras observações"
        />
      </label>
    </AsyncForm>
  );
}
export function ScheduleForm({
  data,
  day,
  tutorId,
  mutate,
  onDone,
  onNewTutor,
}: {
  data: Bootstrap;
  day: string;
  tutorId?: string;
  mutate: Mutate;
  onDone: (id: string) => void;
  onNewTutor: () => void;
}) {
  const [query, setQuery] = useState(
      tutorId ? data.tutors.find((t) => t.id === tutorId)?.name || "" : "",
    ),
    [selected, setSelected] = useState(tutorId || "");
  const tutor = data.tutors.find((t) => t.id === selected),
    patients = data.patients.filter((p) => p.tutorId === selected);
  return (
    <AsyncForm
      submit="Agendar visita"
      onSubmit={async (d) => {
        if (!tutor) throw Error("Selecione um tutor na busca.");
        const ids = d.getAll("patients").map(String);
        if (!ids.length) throw Error("Selecione pelo menos um animal.");
        const r = await mutate({
          type: "visit.create",
          tutorId: selected,
          patientIds: ids,
          date: str(d, "date"),
          time: str(d, "time"),
          duration: Number(d.get("duration")),
          address: str(d, "address"),
          baseCents: parseFixed(str(d, "base")),
          reason: str(d, "reason"),
        });
        onDone(r.id);
      }}
    >
      <label>
        Buscar tutor
        <input
          aria-label="Buscar tutor"
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected("");
          }}
          placeholder="Nome ou telefone"
          autoComplete="off"
        />
      </label>
      {!selected && (
        <div className="search-results">
          {data.tutors
            .filter((t) =>
              (t.name + " " + t.phone)
                .toLowerCase()
                .includes(query.toLowerCase()),
            )
            .slice(0, 8)
            .map((t) => (
              <button
                className="search-option"
                key={t.id}
                type="button"
                onClick={() => {
                  setSelected(t.id);
                  setQuery(t.name);
                }}
              >
                <strong>{t.name}</strong>
                <span>{t.phone}</span>
              </button>
            ))}
          <button type="button" className="link-button" onClick={onNewTutor}>
            + Cadastrar novo tutor
          </button>
        </div>
      )}
      {tutor && (
        <div className="selection" key={tutor.id}>
          <strong>{tutor.name}</strong>
          <Field
            label="Endereço desta visita"
            name="address"
            value={tutor.address}
            required
          />
          <h3>Animais desta visita</h3>
          {patients.map((p) => (
            <label className="check-row" key={p.id}>
              <input
                type="checkbox"
                name="patients"
                value={p.id}
                defaultChecked
              />
              {p.name}
              <span className="muted">{p.species}</span>
            </label>
          ))}
          {!patients.length && (
            <p className="hint">
              Cadastre um paciente para este tutor antes de agendar.
            </p>
          )}
        </div>
      )}
      <div className="form-grid">
        <Field label="Data" name="date" type="date" value={day} required />
        <Field
          label="Horário de início"
          name="time"
          type="time"
          value="09:00"
          required
        />
        <Field
          label="Duração (minutos)"
          name="duration"
          type="number"
          min="15"
          max="480"
          step="15"
          value="60"
          required
        />
        <Field
          label="Consulta e deslocamento (R$)"
          name="base"
          value="250,00"
          inputMode="decimal"
          required
        />
      </div>
      <label>
        Motivo da visita
        <textarea name="reason" placeholder="Queixa ou motivo do atendimento" />
      </label>
    </AsyncForm>
  );
}
export function ProductForm({
  product,
  mutate,
  onDone,
}: {
  product?: Product;
  mutate: Mutate;
  onDone: () => void;
}) {
  return (
    <AsyncForm
      onSubmit={async (d) => {
        const data = {
          name: str(d, "name"),
          unit: str(d, "unit") as Product["unit"],
          costCents: parseFixed(str(d, "cost")),
          saleCents: parseFixed(str(d, "sale")),
        };
        await mutate(
          product
            ? { type: "product.update", id: product.id, data }
            : { type: "product.create", data },
        );
        onDone();
      }}
    >
      <div className="form-grid">
        <Field
          label="Nome do produto"
          name="name"
          value={product?.name}
          required
        />
        <label>
          Unidade de aplicação
          <select name="unit" defaultValue={product?.unit || "mL"}>
            {units.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <Field
          label="Custo por unidade (R$)"
          name="cost"
          value={((product?.costCents || 0) / 100).toFixed(2).replace(".", ",")}
          inputMode="decimal"
          required
        />
        <Field
          label="Venda por unidade (R$)"
          name="sale"
          value={((product?.saleCents || 0) / 100).toFixed(2).replace(".", ",")}
          inputMode="decimal"
          required
        />
      </div>
      <p className="hint">
        Quantidade aplicada × preço de venda da unidade = valor da aplicação.
      </p>
    </AsyncForm>
  );
}
export function ApplicationForm({
  consultation,
  data,
  mutate,
  onDone,
}: {
  consultation: Consultation;
  data: Bootstrap;
  mutate: Mutate;
  onDone: () => void;
}) {
  const [id, setId] = useState(data.products[0]?.id || ""),
    [quantity, setQuantity] = useState("1");
  const p = data.products.find((p) => p.id === id);
  let total: number | null = null;
  try {
    if (p) total = applicationTotal(parseFixed(quantity, 3), p.saleCents);
  } catch {}
  return (
    <AsyncForm
      submit="Registrar aplicação"
      onSubmit={async (d) => {
        if (!p)
          throw Error("Cadastre um produto antes de registrar a aplicação.");
        await mutate({
          type: "application.create",
          consultationId: consultation.id,
          productId: p.id,
          quantityMilli: parseFixed(quantity, 3),
          batch: str(d, "batch"),
          route: str(d, "route"),
        });
        onDone();
      }}
    >
      <label>
        Produto
        <select value={id} onChange={(e) => setId(e.target.value)} required>
          <option value="">Selecione</option>
          {data.products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.unit}
            </option>
          ))}
        </select>
      </label>
      <div className="form-grid">
        <label>
          Quantidade aplicada
          <input
            name="quantity"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            inputMode="decimal"
            required
          />
        </label>
        <Field
          label="Unidade"
          name="unit"
          key={p?.unit}
          value={p?.unit}
          readOnly
        />
        <Field label="Lote" name="batch" />
        <Field label="Via de aplicação" name="route" />
      </div>
      {p && (
        <div className="calculation">
          <div>
            <span>Venda / {p.unit}</span>
            <span>{money(p.saleCents)}</span>
          </div>
          <div>
            <strong>Valor da aplicação</strong>
            <strong aria-live="polite">
              {total === null ? "—" : money(total)}
            </strong>
          </div>
        </div>
      )}
      <p className="hint">
        O servidor usa o preço atual do catálogo e guarda o valor aplicado no
        histórico. Alterações posteriores no produto não mudam essa cobrança.
      </p>
    </AsyncForm>
  );
}
export function PaymentForm({
  visit,
  mutate,
  onDone,
}: {
  visit: Visit;
  mutate: Mutate;
  onDone: () => void;
}) {
  const due = visit.totalCents - visit.receivedCents;
  return (
    <AsyncForm
      submit="Confirmar recebimento"
      onSubmit={async (d) => {
        await mutate({
          type: "payment.create",
          visitId: visit.id,
          amountCents: parseFixed(str(d, "amount")),
          method: str(d, "method") as (typeof paymentMethods)[number],
        });
        onDone();
      }}
    >
      <p>
        Saldo em aberto: <strong>{money(due)}</strong>
      </p>
      <Field
        label="Valor recebido (R$)"
        name="amount"
        value={(due / 100).toFixed(2).replace(".", ",")}
        inputMode="decimal"
        required
      />
      <label>
        Forma de pagamento
        <select name="method">
          {paymentMethods.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </label>
    </AsyncForm>
  );
}
export function ConsultationSelect({
  data,
  patientId,
  value,
  onChange,
  name = "consultation",
  required = false,
}: {
  data: Bootstrap;
  patientId: string;
  value: string;
  onChange: (v: string) => void;
  name?: string;
  required?: boolean;
}) {
  return (
    <label>
      Consulta vinculada
      <select
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      >
        <option value="">Sem vínculo com consulta</option>
        {data.consultations
          .filter((c) => c.patientId === patientId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((c) => (
            <option key={c.id} value={c.id}>
              {dateLabel(data.visits.find((v) => v.id === c.visitId)!.startsAt)}{" "}
              ·{" "}
              {data.visitPatients.find(
                (v) => v.visitId === c.visitId && v.patientId === patientId,
              )?.reason || "Consulta"}
            </option>
          ))}
      </select>
    </label>
  );
}
export function ExamForm({
  patientId,
  consultationId,
  request,
  data,
  mutate,
  onUploaded,
  onDone,
}: {
  patientId: string;
  consultationId?: string;
  request?: Exam;
  data: Bootstrap;
  mutate: Mutate;
  onUploaded: () => Promise<void>;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<"order" | "result" | "existing">(
      request ? "result" : "order",
    ),
    [consult, setConsult] = useState(
      request?.consultationId || consultationId || "",
    ),
    [requestId, setRequestId] = useState(request?.id || ""),
    [name, setName] = useState(request?.name || "");
  const uploadId = useRef(crypto.randomUUID());
  return (
    <AsyncForm
      secondarySubmit={mode === "order" ? "Salvar" : undefined}
      submit={
        mode === "order"
          ? "Salvar e gerar PDF"
          : mode === "result"
            ? "Anexar resultado"
            : "Vincular exame"
      }
      onSubmit={async (d, action) => {
        if (mode === "order") {
          const result = await mutate({
            type: "exam.order",
            patientId,
            consultationId: consult || null,
            name: str(d, "name"),
            mode: str(d, "mode") as
              | "Coleta pela veterinária"
              | "Encaminhamento a outro profissional",
            partner: str(d, "partner"),
            notes: str(d, "notes"),
            date: str(d, "date"),
          });
          if (action === "primary") {
            const download = document.createElement("a");
            download.href = `/api/exams/${result.id}/pdf`;
            download.download = `solicitacao-exame-${result.id}.pdf`;
            document.body.appendChild(download);
            download.click();
            download.remove();
          }
        } else if (mode === "existing") {
          if (!consult)
            throw Error("Selecione a consulta à qual deseja vincular o exame.");
          await mutate({
            type: "exam.link",
            examId: str(d, "existing"),
            consultationId: consult,
          });
        } else {
          const body = new FormData();
          body.set("requestIdempotency", uploadId.current);
          body.set("file", d.get("file") as File);
          body.set(
            "data",
            JSON.stringify({
              patientId,
              consultationId: consult || null,
              requestId: requestId || null,
              name: str(d, "name"),
              notes: str(d, "notes"),
              date: str(d, "date"),
            }),
          );
          const r = await fetch("/api/exams/upload", { method: "POST", body });
          const out = await r.json();
          if (!r.ok) throw Error(out.error || "Falha no upload.");
          await onUploaded();
        }
        onDone();
      }}
    >
      <div className="segments">
        {[
          ["order", "Solicitar"],
          ["result", "Anexar PDF"],
          ["existing", "Do histórico"],
        ].map(([v, l]) => (
          <button
            key={v}
            type="button"
            className={mode === v ? "selected" : ""}
            onClick={() => setMode(v as typeof mode)}
          >
            {l}
          </button>
        ))}
      </div>
      {mode === "result" && (
        <label>
          Pedido vinculado
          <select
            value={requestId}
            onChange={(e) => {
              setRequestId(e.target.value);
              const p = data.exams.find((x) => x.id === e.target.value);
              if (p) {
                setConsult(p.consultationId || "");
                setName(p.name);
              }
            }}
          >
            <option value="">Resultado sem pedido cadastrado</option>
            {data.exams
              .filter((x) => x.patientId === patientId && x.kind === "order")
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name} · {dateLabel(x.occurredOn)}
                </option>
              ))}
          </select>
        </label>
      )}
      {mode === "existing" ? (
        <label>
          Exame já presente na timeline
          <select name="existing" required>
            <option value="">Selecione</option>
            {data.exams
              .filter((x) => x.patientId === patientId)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.kind === "result" ? "Resultado" : "Pedido"} · {x.name} ·{" "}
                  {dateLabel(x.occurredOn)}
                </option>
              ))}
          </select>
        </label>
      ) : (
        <>
          <label>
            Nome do exame
            <input
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <Field
            label={mode === "order" ? "Data do pedido" : "Data do resultado"}
            name="date"
            type="date"
            value={dateKey()}
            required
          />
        </>
      )}
      <ConsultationSelect
        data={data}
        patientId={patientId}
        value={consult}
        onChange={setConsult}
        required={mode === "existing"}
      />
      {mode === "order" && (
        <>
          <label>
            Realização
            <select name="mode">
              <option>Coleta pela veterinária</option>
              <option>Encaminhamento a outro profissional</option>
            </select>
          </label>
          <Field label="Laboratório ou profissional" name="partner" />
        </>
      )}
      {mode === "result" && (
        <label>
          Resultado em PDF (até 15 MB)
          <input
            name="file"
            type="file"
            accept="application/pdf,.pdf"
            onChange={() => {
              uploadId.current = crypto.randomUUID();
            }}
            required
          />
        </label>
      )}
      {mode !== "existing" && (
        <label>
          Observações
          <textarea name="notes" />
        </label>
      )}
      {mode === "existing" && (
        <p className="hint">
          O vínculo preserva o evento original, sem duplicar o exame na
          timeline.
        </p>
      )}
    </AsyncForm>
  );
}
const emptyRx = (): RxItem => ({
  name: "",
  concentration: "",
  dose: "",
  route: "",
  frequency: "",
  duration: "",
  quantity: "",
  instructions: "",
});
export function PrescriptionEditor({
  patient,
  consultation,
  data,
  mutate,
  onDone,
  onBack,
}: {
  patient: Patient;
  consultation: Consultation;
  data: Bootstrap;
  mutate: Mutate;
  onDone: () => void;
  onBack: () => void;
}) {
  const [items, setItems] = useState<RxItem[]>([emptyRx()]),
    [notes, setNotes] = useState(""),
    [preview, setPreview] = useState(false);
  function update(index: number, key: keyof RxItem, value: string) {
    setItems(
      items.map((item, i) => (i === index ? { ...item, [key]: value } : item)),
    );
  }
  return (
    <>
      <button className="link-button" onClick={onBack}>
        ← Voltar ao atendimento
      </button>
      <div className="page-heading">
        <div className="eyebrow">Documento da consulta</div>
        <h1>{preview ? "Revisar receita" : "Nova receita"}</h1>
        <p className="muted">
          {patient.name} ·{" "}
          {data.tutors.find((t) => t.id === patient.tutorId)?.name}
        </p>
      </div>
      {preview ? (
        <AsyncForm
          submit="Salvar rascunho"
          onSubmit={async () => {
            await mutate({
              type: "prescription.create",
              consultationId: consultation.id,
              items,
              instructions: notes,
            });
            onDone();
          }}
        >
          <section className="panel paper">
            <span className="badge">Rascunho · sem assinatura</span>
            <h2>Prescrição</h2>
            {items.map((item, i) => (
              <section className="rx-item" key={i}>
                <h3>
                  {i + 1}. {item.name} · {item.concentration}
                </h3>
                <p>
                  Dose: {item.dose} · Via: {item.route}
                </p>
                <p>
                  {item.frequency} · {item.duration}
                </p>
                <p>Quantidade: {item.quantity}</p>
                <p>{item.instructions}</p>
              </section>
            ))}
            <p>{notes}</p>
          </section>
          <button type="button" onClick={() => setPreview(false)}>
            Voltar à edição
          </button>
        </AsyncForm>
      ) : (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            setPreview(true);
          }}
        >
          {items.map((item, i) => (
            <section className="panel" key={i}>
              <div className="row between">
                <h2>Item {i + 1}</h2>
                {items.length > 1 && (
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => setItems(items.filter((_, n) => n !== i))}
                  >
                    Remover
                  </button>
                )}
              </div>
              <div className="form-grid">
                {(
                  [
                    ["name", "Medicamento"],
                    ["concentration", "Concentração / apresentação"],
                    ["dose", "Dose"],
                    ["route", "Via"],
                    ["frequency", "Frequência"],
                    ["duration", "Duração"],
                    ["quantity", "Quantidade a dispensar"],
                    ["instructions", "Instruções do item"],
                  ] as [keyof RxItem, string][]
                ).map(([k, l]) => (
                  <label key={k}>
                    {l}
                    <input
                      value={item[k]}
                      onChange={(e) => update(i, k, e.target.value)}
                      required={k !== "instructions"}
                    />
                  </label>
                ))}
              </div>
            </section>
          ))}
          <div>
            <button
              type="button"
              onClick={() => setItems([...items, emptyRx()])}
            >
              + Adicionar medicamento
            </button>
          </div>
          <label>
            Orientações gerais
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <div className="row between">
            <span className="hint">
              Dose e posologia são definidas pela veterinária.
            </span>
            <button className="primary">Pré-visualizar receita</button>
          </div>
        </form>
      )}
    </>
  );
}
