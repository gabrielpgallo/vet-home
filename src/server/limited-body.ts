import { AppError } from "./db";

export async function limitedBody(req: Request, limit: number) {
  if (Number(req.headers.get("content-length") || 0) > limit)
    throw new AppError("O conteúdo enviado excede o limite permitido.", 413);
  const reader = req.body?.getReader();
  if (!reader) throw new AppError("Envie o conteúdo para processar.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new AppError(
          "O conteúdo enviado excede o limite permitido.",
          413,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
