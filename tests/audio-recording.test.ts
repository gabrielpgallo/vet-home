import { afterEach, expect, it, vi } from "vitest";
import { createAudioRecording } from "../src/lib/audio-recording";
import { AI_AUDIO_LIMIT } from "../src/lib/anamnesis-ai";

const stopTrack = vi.fn();
const stream = { getTracks: () => [{ stop: stopTrack }] };
let current: FakeRecorder;
class FakeRecorder {
  static isTypeSupported = () => true;
  state = "inactive";
  mimeType = "audio/webm;codecs=opus";
  ondataavailable?: (event: { data: Blob }) => void;
  onstop?: () => void;
  onerror?: () => void;
  constructor() {
    // Expose the fake browser recorder so tests can dispatch device events.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    current = this;
  }
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    queueMicrotask(() => {
      this.ondataavailable?.({ data: new Blob(["recorded sound"]) });
      this.onstop?.();
    });
  }
}
function setup(getUserMedia = vi.fn().mockResolvedValue(stream)) {
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  const callbacks = { started: vi.fn(), complete: vi.fn(), error: vi.fn() };
  return { recording: createAudioRecording(callbacks), callbacks };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.useRealTimers();
});
it("stops the microphone and delivers the final audio chunk for preview", async () => {
  const { recording, callbacks } = setup();
  await recording.start();
  expect(callbacks.started).toHaveBeenCalledOnce();
  recording.stop();
  await Promise.resolve();
  expect(stopTrack).toHaveBeenCalled();
  const file = callbacks.complete.mock.calls[0][0] as File;
  expect(file.name).toBe("relato.webm");
  expect(await file.text()).toBe("recorded sound");
});
it("releases a late permission grant after the panel has closed", async () => {
  let grant!: (value: unknown) => void;
  const { recording, callbacks } = setup(
    vi.fn(
      () =>
        new Promise((resolve) => {
          grant = resolve;
        }),
    ),
  );
  const pending = recording.start();
  recording.dispose();
  grant(stream);
  await pending;
  expect(stopTrack).toHaveBeenCalled();
  expect(callbacks.started).not.toHaveBeenCalled();
  expect(callbacks.complete).not.toHaveBeenCalled();
});
it("discards audio on close instead of invoking UI callbacks", async () => {
  const { recording, callbacks } = setup();
  await recording.start();
  recording.dispose();
  await Promise.resolve();
  expect(stopTrack).toHaveBeenCalled();
  expect(callbacks.complete).not.toHaveBeenCalled();
});
it("reports permission denial without exposing native error details", async () => {
  const { recording, callbacks } = setup(
    vi
      .fn()
      .mockRejectedValue(new DOMException("private detail", "NotAllowedError")),
  );
  await recording.start();
  expect(callbacks.error).toHaveBeenCalledWith(
    "Permita o acesso ao microfone no navegador para gravar.",
  );
});
it("rejects oversize audio and releases the microphone", async () => {
  const { recording, callbacks } = setup();
  await recording.start();
  current.ondataavailable?.({
    data: new Blob([new Uint8Array(AI_AUDIO_LIMIT + 1)]),
  });
  await Promise.resolve();
  expect(callbacks.error).toHaveBeenCalledOnce();
  expect(callbacks.complete).not.toHaveBeenCalled();
  expect(stopTrack).toHaveBeenCalled();
});
it("automatically finishes after five minutes", async () => {
  vi.useFakeTimers();
  const { recording, callbacks } = setup();
  await recording.start();
  await vi.advanceTimersByTimeAsync(300000);
  expect(callbacks.complete).toHaveBeenCalledOnce();
  expect(stopTrack).toHaveBeenCalled();
});
