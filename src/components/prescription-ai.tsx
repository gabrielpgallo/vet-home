"use client";
import { useEffect, useRef, useState } from "react";
import { AudioLines, Sparkles } from "lucide-react";
import type { Identity } from "@/lib/permissions";
import { AI_AUDIO_LIMIT, AI_TEXT_LIMIT } from "@/lib/anamnesis-ai";
import {
  prescriptionSuggestionSchema,
  prescriptionFields,
  prescriptionMissingFields,
  type PrescriptionSuggestion,
} from "@/lib/prescription-ai";
import { AudioRecorder } from "./audio-recorder";
export function PrescriptionAI({
  id,
  revision,
  identity,
  configured,
  hasDraft,
  onApply,
  onDirty,
  onProcessingChange,
}: {
  id: string;
  revision: number;
  identity: Identity;
  configured: boolean;
  hasDraft: boolean;
  onApply: (result: PrescriptionSuggestion) => void;
  onDirty: () => void;
  onProcessingChange: (busy: boolean) => void;
}) {
  const [source, setSource] = useState(""),
    [audio, setAudio] = useState<File | null>(null),
    [audioUrl, setAudioUrl] = useState("");
  const [recording, setRecording] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [result, setResult] = useState<PrescriptionSuggestion | null>(null),
    [step, setStep] = useState<"source" | "review">("source");
  const containerRef = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null),
    sequence = useRef(0);
  useEffect(
    () => () => {
      sequence.current++;
      controller.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (!audio) return;
    const url = URL.createObjectURL(audio);
    // Local playback only; the audio is sent only on explicit generation.
    setAudioUrl(url); // eslint-disable-line react-hooks/set-state-in-effect
    return () => URL.revokeObjectURL(url);
  }, [audio]);
  function changed() {
    setResult(null);
    setError("");
    onDirty();
  }
  async function generate() {
    if (busy || recording || (!source.trim() && !audio)) return;
    const current = ++sequence.current;
    controller.current = new AbortController();
    setBusy(true);
    onProcessingChange(true);
    setError("");
    setResult(null);
    const form = new FormData();
    form.set("text", source);
    form.set("revision", String(revision));
    if (audio) form.set("audio", audio);
    try {
      const response = await fetch(
        `/api/consultations/${id}/prescription-suggestion`,
        {
          method: "POST",
          body: form,
          signal: controller.current.signal,
          headers: {
            "x-vet-user": identity.userId,
            "x-vet-clinic": identity.orgId,
          },
        },
      );
      const body = await response.json();
      if (!response.ok)
        throw Error(body.error || "Não foi possível organizar a receita.");
      const parsed = prescriptionSuggestionSchema.safeParse(body);
      if (!parsed.success)
        throw Error(
          "A sugestão veio incompleta. Tente novamente com um relato menor.",
        );
      if (current !== sequence.current) return;
      setResult(parsed.data);
      setStep("review");
      containerRef.current?.closest("dialog")?.scrollTo({ top: 0 });
    } catch (error) {
      if (
        current === sequence.current &&
        !(error instanceof Error && error.name === "AbortError")
      )
        setError(
          error instanceof Error
            ? error.message
            : "Não foi possível gerar a sugestão.",
        );
    } finally {
      if (current === sequence.current) {
        setBusy(false);
        onProcessingChange(false);
      }
    }
  }
  if (!configured)
    return (
      <p className="notice">
        Peça à administração para cadastrar a chave Gemini em Configurações →
        Inteligência artificial. Você pode preencher a receita manualmente.
      </p>
    );
  const missing = result ? prescriptionMissingFields(result.items) : [];
  return (
    <div ref={containerRef} className="stack prescription-ai">
      <p className="hint">
        Informe os medicamentos e a posologia que você definiu. A IA organiza
        seu relato; não calcula doses nem completa dados ausentes. Texto e áudio
        serão enviados ao Gemini somente ao gerar a sugestão.
      </p>
      <nav className="ai-steps" aria-label="Etapas da sugestão de receita">
        <button
          type="button"
          aria-current={step === "source" ? "step" : undefined}
          onClick={() => setStep("source")}
        >
          1 · Texto ou áudio
        </button>
        <button
          type="button"
          disabled={!result || busy || recording}
          aria-current={step === "review" ? "step" : undefined}
          onClick={() => setStep("review")}
        >
          2 · Revisar sugestão
        </button>
      </nav>
      <div className="stack" hidden={step !== "source"}>
        <AudioRecorder
          title="Dite a receita"
          buttonLabel="Gravar prescrição"
          disabled={busy}
          onActive={(active) => {
            setRecording(active);
            onProcessingChange(active);
            if (active) onDirty();
          }}
          onAudio={(file) => {
            setAudio(file);
            changed();
          }}
        />
        <label>
          Informações da receita
          <textarea
            value={source}
            rows={6}
            maxLength={AI_TEXT_LIMIT}
            disabled={busy}
            onChange={(e) => {
              setSource(e.target.value);
              changed();
            }}
            placeholder="Informe nome do medicamento, apresentação, dose, via, frequência, duração e quantidade a dispensar. Pode escrever livremente ou gravar um áudio."
          />
        </label>
        <label className="ai-audio-label">
          <span>
            <AudioLines size={17} aria-hidden="true" /> Ou anexar um áudio (até
            3 MB)
          </span>
          <input
            type="file"
            disabled={busy || recording}
            accept="audio/*,.mp3,.m4a,.wav,.ogg,.opus,.flac,.webm"
            onChange={(e) => {
              const file = e.target.files?.[0] || null;
              if (file && (!file.size || file.size > AI_AUDIO_LIMIT)) {
                setError("Selecione um áudio de até 3 MB.");
                e.target.value = "";
                return;
              }
              setAudio(file);
              changed();
              e.target.value = "";
            }}
          />
        </label>
        {audio && (
          <div className="stack">
            <span className="hint">{audio.name}</span>
            <audio
              controls
              src={audioUrl}
              aria-label="Ouvir prescrição gravada"
            />
            <button
              type="button"
              disabled={busy || recording}
              onClick={() => {
                setAudio(null);
                changed();
              }}
            >
              Remover áudio
            </button>
          </div>
        )}
        <p className="hint">
          O áudio e a transcrição não são salvos na receita. Confira os nomes,
          números e unidades antes de aplicar.
        </p>
        <div className="row wrap">
          <button
            type="button"
            className="primary"
            disabled={busy || recording || (!source.trim() && !audio)}
            onClick={generate}
          >
            <Sparkles size={17} aria-hidden="true" />
            {busy
              ? "Organizando receita…"
              : audio
                ? "Transcrever e organizar"
                : "Organizar receita"}
          </button>
          {busy && (
            <button
              type="button"
              onClick={() => {
                sequence.current++;
                controller.current?.abort();
                setBusy(false);
                onProcessingChange(false);
              }}
            >
              Cancelar geração
            </button>
          )}
        </div>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <span role="status" className="hint">
        {busy
          ? "Gerando uma sugestão para sua revisão. Nenhuma receita será salva automaticamente."
          : ""}
      </span>
      {result && step === "review" && (
        <>
          {result.transcription && (
            <details>
              <summary>Conferir transcrição</summary>
              <p className="ai-source-text">{result.transcription}</p>
            </details>
          )}
          {!!result.warnings.length && (
            <div className="notice">
              <strong>Pontos para conferir</strong>
              <ul>
                {result.warnings.map((text, i) => (
                  <li key={i}>{text}</li>
                ))}
              </ul>
            </div>
          )}
          {!!missing.length && (
            <div className="notice">
              <strong>Complete no formulário antes de salvar</strong>
              <ul>
                {missing.map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
            </div>
          )}
          {result.items.map((item, index) => (
            <section className="rx-suggestion" key={index}>
              <h3>
                {index + 1}. {item.name || "Medicamento não informado"}
              </h3>
              <dl>
                {prescriptionFields
                  .filter(([key]) => key !== "name")
                  .map(([key, label]) => (
                    <div key={key}>
                      <dt>{label}</dt>
                      <dd>
                        {item[key] || (
                          <span className="muted">Não informado</span>
                        )}
                      </dd>
                    </div>
                  ))}
              </dl>
            </section>
          ))}
          {result.instructions && (
            <div>
              <h3>Orientações gerais</h3>
              <p className="preserve-text">{result.instructions}</p>
            </div>
          )}
          <p className="hint">
            Ao aplicar, você volta ao formulário para editar e revisar a
            receita.{" "}
            {hasDraft
              ? "Os itens e orientações atuais serão substituídos; você poderá desfazer a aplicação."
              : "Nada será salvo ou assinado nesta etapa."}
          </p>
          <button
            type="button"
            className="primary"
            onClick={() => onApply(result)}
          >
            {hasDraft
              ? "Substituir itens pela sugestão"
              : "Aplicar ao formulário"}
          </button>
        </>
      )}
    </div>
  );
}
