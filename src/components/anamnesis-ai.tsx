"use client";
import { useEffect, useRef, useState } from "react";
import { AudioRecorder } from "./audio-recorder";
import { Sparkles, AudioLines, Undo2 } from "lucide-react";
import {
  AI_AUDIO_LIMIT,
  AI_TEXT_LIMIT,
  aiResultSchema,
  formatAnamnesis,
  type AiAnamnesisResult,
} from "@/lib/anamnesis-ai";

export function AnamnesisAI({
  id,
  revision,
  notes,
  configured,
  disabled,
  onApply,
}: {
  id: string;
  revision: number;
  notes: string;
  configured: boolean;
  disabled: boolean;
  onApply: (text: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState<"source" | "review">("source");
  const [recording, setRecording] = useState(false);
  const [open, setOpen] = useState(false),
    [source, setSource] = useState(""),
    [original, setOriginal] = useState("");
  const [audio, setAudio] = useState<File | null>(null),
    [audioUrl, setAudioUrl] = useState("");
  const [result, setResult] = useState<AiAnamnesisResult | null>(null),
    [suggestion, setSuggestion] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [undo, setUndo] = useState<{
    original: string;
    applied: string;
  } | null>(null);
  const controller = useRef<AbortController | null>(null),
    sequence = useRef(0);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!open || disabled) return;
    const element = dialog.current;
    element?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      document.body.style.overflow = previous;
    };
  }, [open, disabled]);
  useEffect(() => {
    if (disabled) controller.current?.abort();
  }, [disabled]);
  useEffect(() => {
    if (!audio) return;
    const url = URL.createObjectURL(audio);
    // Object URL is only local playback; the file is sent on explicit generation.
    setAudioUrl(url); // eslint-disable-line react-hooks/set-state-in-effect
    return () => URL.revokeObjectURL(url);
  }, [audio]);
  function start() {
    setStep("source");
    setRecording(false);
    setSource(notes);
    setOriginal(notes);
    setAudio(null);
    setResult(null);
    setSuggestion("");
    setError("");
    setOpen(true);
  }
  function cancel() {
    sequence.current++;
    controller.current?.abort();
    setBusy(false);
    setOpen(false);
    setAudio(null);
  }
  async function generate() {
    if (busy || recording) return;
    if (source.length > AI_TEXT_LIMIT) {
      setError("Envie até 20 mil caracteres por vez.");
      return;
    }
    if (!source.trim() && !audio) {
      setError("Escreva suas anotações ou selecione um áudio.");
      return;
    }
    const current = ++sequence.current;
    controller.current = new AbortController();
    setBusy(true);
    setError("");
    setResult(null);
    const form = new FormData();
    form.set("text", source);
    form.set("revision", String(revision));
    if (audio) form.set("audio", audio);
    try {
      const response = await fetch(`/api/consultations/${id}/anamnesis`, {
        method: "POST",
        body: form,
        signal: controller.current.signal,
      });
      const body = await response.json();
      if (!response.ok)
        throw Error(body.error || "Não foi possível gerar a sugestão.");
      const parsed = aiResultSchema.parse(body);
      if (current !== sequence.current) return;
      setStep("review");
      setResult(parsed);
      setSuggestion(formatAnamnesis(parsed));
    } catch (err) {
      if (
        current === sequence.current &&
        !(err instanceof Error && err.name === "AbortError")
      )
        setError(
          err instanceof Error
            ? err.message
            : "Não foi possível gerar a sugestão.",
        );
    } finally {
      if (current === sequence.current) setBusy(false);
    }
  }
  const changed = notes !== original;
  return (
    <div className="anamnesis-ai">
      <div className="row wrap">
        <button
          type="button"
          disabled={disabled || open}
          onClick={start}
          title="Organizar anamnese com inteligência artificial"
        >
          <Sparkles size={17} /> Estruturar com IA
        </button>
        {undo && notes === undo.applied && (
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => {
              onApply(undo.original);
              setUndo(null);
            }}
          >
            <Undo2 size={16} /> Desfazer IA
          </button>
        )}
      </div>
      {open && !disabled && (
        <dialog
          ref={dialog}
          className="ai-drawer"
          aria-labelledby="ai-drawer-title"
          onCancel={(event) => {
            event.preventDefault();
            cancel();
          }}
        >
          <div className="ai-review stack">
            <div className="section-heading">
              <h3 id="ai-drawer-title">
                <Sparkles size={17} /> Assistente de anamnese
              </h3>
              <button type="button" onClick={cancel}>
                {busy ? "Cancelar geração" : "Fechar"}
              </button>
            </div>
            {!configured ? (
              <p className="notice">
                Peça à administração para cadastrar a chave Gemini em
                Configurações → Inteligência artificial.
              </p>
            ) : (
              <>
                <p className="hint">
                  O conteúdo abaixo será enviado ao Gemini. A IA organiza o
                  relato, mas pode cometer erros. Confira a sugestão antes de
                  aplicar; nenhum dado será salvo automaticamente.
                </p>
                <nav className="ai-steps" aria-label="Etapas da anamnese">
                  <button
                    type="button"
                    aria-current={step === "source" ? "step" : undefined}
                    onClick={() => setStep("source")}
                  >
                    1 · Relato
                  </button>
                  <button
                    type="button"
                    disabled={!result || recording || busy}
                    aria-current={step === "review" ? "step" : undefined}
                    onClick={() => setStep("review")}
                  >
                    2 · Revisão
                  </button>
                </nav>
                <div className="stack" hidden={step !== "source"}>
                  <AudioRecorder
                    disabled={busy}
                    onActive={setRecording}
                    onAudio={(file) => {
                      setAudio(file);
                      setResult(null);
                      setError("");
                    }}
                  />
                  <label>
                    Anotações para organizar
                    <textarea
                      value={source}
                      disabled={busy}
                      maxLength={AI_TEXT_LIMIT}
                      rows={5}
                      onChange={(e) => {
                        setSource(e.target.value);
                        setResult(null);
                      }}
                      placeholder="Escreva livremente ou envie um áudio abaixo."
                    />
                  </label>
                  <label className="ai-audio-label">
                    <span>
                      <AudioLines size={17} /> Ou anexar um áudio (até 3 MB)
                    </span>
                    <input
                      type="file"
                      disabled={busy || recording}
                      accept="audio/mpeg,audio/mp3,audio/mp4,audio/x-m4a,audio/m4a,audio/wav,audio/x-wav,audio/ogg,audio/flac,audio/webm,.mp3,.m4a,.wav,.ogg,.opus,.flac,.webm"
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        if (
                          file &&
                          (!file.size || file.size > AI_AUDIO_LIMIT)
                        ) {
                          setError("Selecione um áudio de até 3 MB.");
                          e.target.value = "";
                          setAudio(null);
                          return;
                        }
                        setAudio(file);
                        setResult(null);
                        setError("");
                      }}
                    />
                  </label>
                  {audio && (
                    <div className="stack">
                      <span className="hint">
                        {audio.name} · {(audio.size / 1024 / 1024).toFixed(1)}{" "}
                        MB
                      </span>
                      <button
                        type="button"
                        disabled={busy || recording}
                        onClick={() => {
                          setAudio(null);
                          setResult(null);
                        }}
                      >
                        Remover áudio
                      </button>
                      <audio
                        controls
                        src={audioUrl}
                        aria-label="Ouvir áudio selecionado"
                      />
                    </div>
                  )}
                  <p className="hint">
                    MP3, M4A, WAV, OGG/Opus, FLAC ou WebM. O áudio não é
                    armazenado no prontuário.
                  </p>
                  <button
                    type="button"
                    className="primary"
                    disabled={busy || recording || (!source.trim() && !audio)}
                    onClick={generate}
                  >
                    <Sparkles size={17} />
                    {busy
                      ? "Gemini está organizando…"
                      : audio
                        ? "Transcrever e estruturar"
                        : "Gerar sugestão"}
                  </button>
                  <div role="status" className="hint">
                    {busy
                      ? "Você pode cancelar; o texto original será preservado."
                      : ""}
                  </div>
                </div>
                {error && (
                  <p className="error" role="alert">
                    {error}
                  </p>
                )}
                {result && step === "review" && (
                  <>
                    {result.transcription && (
                      <details>
                        <summary>Conferir transcrição do áudio</summary>
                        <p className="ai-source-text">{result.transcription}</p>
                      </details>
                    )}
                    {!!result.warnings.length && (
                      <div className="notice">
                        <strong>Pontos para conferir</strong>
                        <ul>
                          {result.warnings.map((warning, i) => (
                            <li key={i}>{warning}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <label>
                      Sugestão · revise e edite antes de aplicar
                      <textarea
                        className="clinical-notes"
                        value={suggestion}
                        maxLength={50000}
                        onChange={(e) => setSuggestion(e.target.value)}
                      />
                    </label>
                    {changed && (
                      <p className="notice">
                        O texto do atendimento mudou desde que você abriu a IA.
                        Feche e abra novamente para usar a versão atual.
                      </p>
                    )}
                    <div className="row wrap">
                      <button
                        type="button"
                        className="primary"
                        disabled={changed || !suggestion.trim()}
                        onClick={() => {
                          if (notes !== original) return;
                          setUndo({ original: notes, applied: suggestion });
                          onApply(suggestion);
                          setOpen(false);
                          setAudio(null);
                        }}
                      >
                        Aplicar ao campo
                      </button>
                      <button type="button" onClick={cancel}>
                        Descartar sugestão
                      </button>
                    </div>
                    <p className="hint">
                      Depois de aplicar, use “Salvar atendimento” para registrar
                      a anamnese.
                    </p>
                  </>
                )}
              </>
            )}
          </div>
        </dialog>
      )}
    </div>
  );
}
