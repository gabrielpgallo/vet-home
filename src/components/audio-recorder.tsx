"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, Square, Trash2 } from "lucide-react";
import { createAudioRecording } from "@/lib/audio-recording";

export function AudioRecorder({
  disabled,
  onAudio,
  onActive,
}: {
  disabled: boolean;
  onAudio: (file: File) => void;
  onActive: (active: boolean) => void;
}) {
  const [state, setState] = useState<
    "idle" | "permission" | "recording" | "stopping"
  >("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const recording = useRef<ReturnType<typeof createAudioRecording> | null>(
    null,
  );
  useEffect(() => () => recording.current?.dispose(), []);
  useEffect(() => {
    if (state !== "recording") return;
    const started = Date.now();
    const timer = setInterval(
      () =>
        setSeconds(Math.min(300, Math.floor((Date.now() - started) / 1000))),
      500,
    );
    return () => clearInterval(timer);
  }, [state]);
  function begin() {
    setError("");
    setSeconds(0);
    setState("permission");
    onActive(true);
    recording.current = createAudioRecording({
      started: () => setState("recording"),
      complete: (file) => {
        setState("idle");
        onActive(false);
        onAudio(file);
      },
      error: (message) => {
        setError(message);
        setState("idle");
        onActive(false);
      },
    });
    void recording.current.start();
  }
  return (
    <div className="ai-recorder stack">
      <strong>Conte como foi a consulta</strong>
      <p className="hint">
        Grave até 5 minutos. Você pode ouvir antes de enviar para a IA.
      </p>
      <div className="row wrap">
        {state === "idle" ? (
          <button
            type="button"
            className="primary"
            disabled={disabled}
            onClick={begin}
          >
            <Mic size={18} /> Gravar relato
          </button>
        ) : (
          <>
            <span role="status">
              {state === "permission"
                ? "Aguardando microfone…"
                : `Gravando · ${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`}
            </span>
            {state === "recording" && (
              <button
                type="button"
                onClick={() => {
                  setState("stopping");
                  recording.current?.stop();
                }}
              >
                <Square size={16} /> Parar gravação
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                recording.current?.dispose();
                setState("idle");
                onActive(false);
              }}
            >
              <Trash2 size={16} /> Descartar
            </button>
          </>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
