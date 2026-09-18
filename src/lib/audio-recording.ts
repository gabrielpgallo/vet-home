import { AI_AUDIO_LIMIT } from "./anamnesis-ai";

export const RECORDING_SECONDS = 300;

/** Owns the microphone, including permission requests that resolve after disposal. */
export function createAudioRecording(callbacks: {
  started: () => void;
  complete: (file: File) => void;
  error: (message: string) => void;
}) {
  let disposed = false;
  let recorder: MediaRecorder | undefined;
  let stream: MediaStream | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let size = 0;
  const chunks: Blob[] = [];
  function release() {
    clearTimeout(timer);
    stream?.getTracks().forEach((track) => track.stop());
  }
  function dispose() {
    disposed = true;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    release();
  }
  function fail(message: string) {
    if (disposed) return;
    dispose();
    callbacks.error(message);
  }
  async function start() {
    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      ) {
        fail(
          "Este navegador não permite gravar aqui. Use HTTPS ou localhost, ou anexe um áudio.",
        );
        return;
      }
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (disposed) {
        release();
        return;
      }
      const mimeType = [
        "audio/webm;codecs=opus",
        "audio/ogg;codecs=opus",
        "audio/mp4",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      if (!mimeType) {
        fail(
          "Formato de gravação não suportado. Anexe um áudio neste navegador.",
        );
        return;
      }
      recorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 64000,
      });
      recorder.ondataavailable = (event) => {
        if (disposed) return;
        size += event.data.size;
        if (size > AI_AUDIO_LIMIT) {
          fail("A gravação ultrapassou 3 MB. Grave um relato mais curto.");
          return;
        }
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = () =>
        fail(
          "A gravação foi interrompida. Verifique o microfone e tente novamente.",
        );
      recorder.onstop = () => {
        release();
        if (disposed) return;
        if (!size) {
          fail("Não foi possível capturar áudio. Tente gravar novamente.");
          return;
        }
        disposed = true;
        const type = recorder!.mimeType || mimeType;
        const extension = type.includes("mp4")
          ? "m4a"
          : type.includes("ogg")
            ? "ogg"
            : "webm";
        callbacks.complete(new File(chunks, `relato.${extension}`, { type }));
      };
      recorder.start(1000);
      timer = setTimeout(stop, RECORDING_SECONDS * 1000);
      callbacks.started();
    } catch (error) {
      fail(
        error instanceof Error && error.name === "NotAllowedError"
          ? "Permita o acesso ao microfone no navegador para gravar."
          : "Não foi possível acessar o microfone. Verifique se está conectado e disponível.",
      );
    }
  }
  function stop() {
    if (recorder && recorder.state !== "inactive") recorder.stop();
    release();
  }
  return { start, stop, dispose };
}
