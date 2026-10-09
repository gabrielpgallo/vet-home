// This module is dynamically loaded only on the device. Never persist PFX/PIN.
import { P12Signer } from "@libpdf/core";
import { fromBER } from "asn1js";
import { Certificate } from "pkijs";
export interface LocalSigner {
  certificate: string;
  chain: string[];
  name: string;
  sign: (attributes: string) => Promise<string>;
}
const bytes = (value: string) => Uint8Array.from(value, (c) => c.charCodeAt(0));
const base64 = (value: Uint8Array) =>
  btoa(Array.from(value, (byte) => String.fromCharCode(byte)).join(""));
export async function openLocalCertificate(
  pfx: Uint8Array,
  pin: string,
): Promise<LocalSigner> {
  if (!globalThis.crypto?.subtle)
    throw Error("Use HTTPS ou localhost em um navegador atualizado.");
  if (pfx.length > 2 * 1024 * 1024)
    throw Error("O certificado deve ter até 2 MB.");
  try {
    if (fromBER(new Uint8Array(pfx).buffer).offset !== pfx.length)
      throw Error("Invalid PFX encoding");
    // No AIA downloads: certificate, private key and PIN stay on the device.
    // The pinned pnpm patch rejects multiple keys and imports RSA as non-extractable.
    const signer = await P12Signer.create(pfx, pin, { buildChain: false });
    if (signer.keyType !== "RSA")
      throw Error("O arquivo precisa conter uma única chave privada RSA.");
    const certificates = [signer.certificate, ...signer.certificateChain];
    // PFX certificate order is not guaranteed. Prove which public key matches
    // instead of assuming the first bag belongs to the private key.
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const proof = await signer.sign(challenge, "SHA-256");
    let selected: { der: Uint8Array; parsed: Certificate } | undefined;
    for (const der of certificates) {
      const parsed = Certificate.fromBER(new Uint8Array(der).buffer);
      if (
        parsed.subjectPublicKeyInfo.algorithm.algorithmId !==
        "1.2.840.113549.1.1.1"
      )
        continue;
      const publicKey = await crypto.subtle.importKey(
        "spki",
        parsed.subjectPublicKeyInfo.toSchema().toBER(false),
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"],
      );
      if (
        await crypto.subtle.verify(
          "RSASSA-PKCS1-v1_5",
          publicKey,
          new Uint8Array(proof),
          challenge,
        )
      ) {
        selected = { der, parsed };
        break;
      }
    }
    if (!selected)
      throw Error("Certificado RSA correspondente não encontrado.");
    const now = new Date();
    if (
      now < selected.parsed.notBefore.value ||
      now > selected.parsed.notAfter.value
    )
      throw Error("Certificado vencido ou ainda não válido.");
    return {
      certificate: base64(selected.der),
      chain: certificates.filter((c) => c !== selected.der).map(base64),
      name: String(
        selected.parsed.subject.typesAndValues.find((v) => v.type === "2.5.4.3")
          ?.value.valueBlock.value || "Titular do certificado",
      ),
      sign: async (attributes) =>
        base64(await signer.sign(bytes(atob(attributes)), "SHA-256")),
    };
  } catch (e) {
    if (e instanceof Error && /Multiple private keys/.test(e.message))
      throw Error("O arquivo precisa conter uma única chave privada RSA.");
    if (
      e instanceof Error &&
      /Certificado vencido|chave privada RSA|correspondente/.test(e.message)
    )
      throw e;
    throw Error(
      "Não foi possível abrir o certificado. Confira o PIN e use um arquivo A1 RSA .pfx ou .p12 válido.",
    );
  }
}
