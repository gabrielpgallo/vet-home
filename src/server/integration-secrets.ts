import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import { AppError } from "./db";

function encryptionKey() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32)
    throw new AppError(
      "A proteção das integrações não está configurada no servidor.",
      503,
    );
  return Buffer.from(
    hkdfSync(
      "sha256",
      secret,
      "vet-home-integrations-v1",
      "gemini-api-key",
      32,
    ),
  );
}
export function encryptIntegrationKey(value: string, org: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(`gemini:${org}`));
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}
export function decryptIntegrationKey(value: string, org: string) {
  try {
    const [version, iv, tag, ciphertext, extra] = value.split(".");
    if (version !== "v1" || extra || !iv || !tag || !ciphertext)
      throw Error("format");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(iv, "base64url"),
    );
    decipher.setAAD(Buffer.from(`gemini:${org}`));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new AppError(
      "Não foi possível abrir a chave Gemini. Cadastre a chave novamente em Configurações.",
      503,
    );
  }
}
