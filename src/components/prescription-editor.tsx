"use client";
import { useRef, useState } from "react";
import { Sparkles, PenLine, Undo2 } from "lucide-react";
import type { RxItem } from "@/lib/domain";
import type {
  Patient,
  Consultation,
  Bootstrap,
  Prescription,
} from "@/lib/types";
import {
  prescriptionFields,
  prescriptionMissingFields,
} from "@/lib/prescription-ai";
import { AsyncForm, type Mutate } from "./forms";
import { PrescriptionAI } from "./prescription-ai";
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
  original,
  consultation,
  data,
  mutate,
  onDone,
  onDirty,
}: {
  original?: Prescription;
  patient: Patient;
  consultation: Consultation;
  data: Bootstrap;
  mutate: Mutate;
  onDone: () => void;
  onDirty: () => void;
}) {
  const contextRef = useRef<HTMLParagraphElement>(null);
  const [reason, setReason] = useState("");
  const [validationError, setValidationError] = useState("");
  function returnToTop() {
    contextRef.current?.closest("dialog")?.scrollTo({ top: 0 });
  }
  const [items, setItems] = useState<RxItem[]>(
      original?.items.map((i) => ({ ...i })) || [emptyRx()],
    ),
    [notes, setNotes] = useState(original?.instructions || ""),
    [preview, setPreview] = useState(false);
  const [aiOpened, setAiOpened] = useState(false),
    [aiProcessing, setAiProcessing] = useState(false);
  const [mode, setMode] = useState<"manual" | "ai">("manual");
  const [undo, setUndo] = useState<{
    items: RxItem[];
    notes: string;
    applied: string;
  } | null>(null);
  const hasDraft =
    items.some((item) => Object.values(item).some((value) => value.trim())) ||
    !!notes.trim();
  function update(index: number, key: keyof RxItem, value: string) {
    setValidationError("");
    onDirty();
    setItems(
      items.map((item, i) => (i === index ? { ...item, [key]: value } : item)),
    );
  }
  return (
    <>
      <p ref={contextRef} className="document-context">
        <strong>{patient.name}</strong>
        <span>{data.tutors.find((t) => t.id === patient.tutorId)?.name}</span>
      </p>
      {original && (
        <p className="notice">
          Você está preparando uma nova versão desta receita. O original
          permanece no histórico, inclusive sua assinatura.
        </p>
      )}
      {!preview && (
        <nav className="ai-steps" aria-label="Forma de preencher a receita">
          <button
            type="button"
            aria-current={mode === "manual" ? "step" : undefined}
            disabled={aiProcessing}
            onClick={() => setMode("manual")}
          >
            <PenLine size={16} /> Editar receita
          </button>
          <button
            type="button"
            aria-current={mode === "ai" ? "step" : undefined}
            disabled={aiProcessing}
            onClick={() => {
              setAiOpened(true);
              setMode("ai");
            }}
          >
            <Sparkles size={16} /> Texto ou áudio com IA
          </button>
        </nav>
      )}
      <div hidden={mode !== "ai"}>
        {aiOpened && data.identity && (
          <PrescriptionAI
            id={consultation.id}
            revision={consultation.revision}
            identity={data.identity}
            configured={data.settings.hasGeminiKey}
            hasDraft={hasDraft}
            onDirty={onDirty}
            onProcessingChange={setAiProcessing}
            onApply={(result) => {
              const next = result.items.map((item) => ({ ...item }));
              setUndo({
                items: items.map((item) => ({ ...item })),
                notes,
                applied: JSON.stringify({
                  items: next,
                  notes: result.instructions,
                }),
              });
              setItems(next);
              setNotes(result.instructions);
              setMode("manual");
              setPreview(false);
              setValidationError("");
              returnToTop();
              onDirty();
            }}
          />
        )}
      </div>
      <div hidden={mode !== "manual"} className="stack">
        {undo && JSON.stringify({ items, notes }) === undo.applied && (
          <button
            type="button"
            onClick={() => {
              setItems(undo.items);
              setNotes(undo.notes);
              setUndo(null);
              setPreview(false);
            }}
          >
            <Undo2 size={16} /> Desfazer aplicação da IA
          </button>
        )}
        {preview ? (
          <AsyncForm
            submit={original ? "Salvar nova versão" : "Salvar rascunho"}
            onSubmit={async () => {
              await mutate(
                original
                  ? {
                      type: "prescription.replace",
                      id: original.id,
                      reason,
                      items,
                      instructions: notes,
                    }
                  : {
                      type: "prescription.create",
                      consultationId: consultation.id,
                      items,
                      instructions: notes,
                    },
              );
              onDone();
            }}
          >
            {original && (
              <label>
                Motivo da correção
                <textarea
                  required
                  minLength={3}
                  maxLength={2000}
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                <span className="hint">
                  O documento anterior será preservado. Esta nova versão
                  precisará de uma nova assinatura.
                </span>
              </label>
            )}
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
            className="stack prescription-fields"
            onSubmit={(e) => {
              e.preventDefault();
              const missing = prescriptionMissingFields(items);
              if (missing.length) {
                setValidationError(
                  `Complete os campos: ${missing.join("; ")}.`,
                );
                return;
              }
              setValidationError("");
              setPreview(true);
              returnToTop();
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
                      onClick={() => {
                        onDirty();
                        setItems(items.filter((_, n) => n !== i));
                      }}
                    >
                      Remover
                    </button>
                  )}
                </div>
                <div className="form-grid">
                  {prescriptionFields.map(([k, l]) => (
                    <label key={k}>
                      {l}
                      <input
                        value={item[k]}
                        onChange={(e) => update(i, k, e.target.value)}
                        required={k !== "instructions"}
                        maxLength={k === "instructions" ? 2000 : 200}
                        placeholder={
                          undo && !item[k]
                            ? "Não informado no relato"
                            : undefined
                        }
                      />
                    </label>
                  ))}
                </div>
              </section>
            ))}
            <div>
              <button
                type="button"
                disabled={items.length >= 30}
                onClick={() => {
                  onDirty();
                  setItems([...items, emptyRx()]);
                }}
              >
                + Adicionar medicamento
              </button>
            </div>
            <label>
              Orientações gerais
              <textarea
                value={notes}
                maxLength={5000}
                onChange={(e) => {
                  onDirty();
                  setNotes(e.target.value);
                }}
              />
            </label>
            {validationError && (
              <p className="error" role="alert">
                {validationError}
              </p>
            )}
            <div className="row between wrap">
              <span className="hint">
                Dose e posologia são definidas pela veterinária.
              </span>
              <button className="primary">Pré-visualizar receita</button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
