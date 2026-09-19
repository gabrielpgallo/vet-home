// This module is dynamically loaded only on the device. Never persist PFX/PIN.
import forge from "node-forge";
export interface LocalSigner {
  certificate: string;
  chain: string[];
  name: string;
  sign: (attributes: string) => Promise<string>;
}
const bytes = (value: string) => Uint8Array.from(value, (c) => c.charCodeAt(0));
export async function openLocalCertificate(
  pfx: Uint8Array,
  pin: string,
): Promise<LocalSigner> {
  if (!globalThis.crypto?.subtle)
    throw Error("Use HTTPS ou localhost em um navegador atualizado.");
  if (pfx.length > 2 * 1024 * 1024)
    throw Error("O certificado deve ter até 2 MB.");
  try {
    const container = forge.pkcs12.pkcs12FromAsn1(
      forge.asn1.fromDer(forge.util.createBuffer(new Uint8Array(pfx).buffer)),
      false,
      pin,
    );
    const bags = (type: string) =>
      container.getBags({ bagType: type })[type] || [];
    const keys = [
      ...bags(forge.pki.oids.pkcs8ShroudedKeyBag),
      ...bags(forge.pki.oids.keyBag),
    ]
      .map((b) => b.key)
      .filter(Boolean) as forge.pki.rsa.PrivateKey[];
    const certificates = bags(forge.pki.oids.certBag)
      .map((b) => b.cert)
      .filter(Boolean) as forge.pki.Certificate[];
    if (keys.length !== 1)
      throw Error("O arquivo precisa conter uma única chave privada RSA.");
    const key = keys[0];
    const certificate = certificates.find((c) => {
      const pub = c.publicKey as forge.pki.rsa.PublicKey;
      return (
        pub.n && pub.n.compareTo(key.n) === 0 && pub.e.compareTo(key.e) === 0
      );
    });
    if (!certificate)
      throw Error("Certificado RSA correspondente não encontrado.");
    const now = new Date();
    if (
      now < certificate.validity.notBefore ||
      now > certificate.validity.notAfter
    )
      throw Error("Certificado vencido ou ainda não válido.");
    const derKey = bytes(
      forge.asn1
        .toDer(forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(key)))
        .getBytes(),
    );
    let imported: CryptoKey;
    try {
      imported = await crypto.subtle.importKey(
        "pkcs8",
        derKey,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["sign"],
      );
    } finally {
      derKey.fill(0);
    }
    const encode = (c: forge.pki.Certificate) =>
      forge.util.encode64(
        forge.asn1.toDer(forge.pki.certificateToAsn1(c)).getBytes(),
      );
    return {
      certificate: encode(certificate),
      chain: certificates.filter((c) => c !== certificate).map(encode),
      name: String(
        certificate.subject.getField("CN")?.value || "Titular do certificado",
      ),
      sign: async (attributes) => {
        const signature = await crypto.subtle.sign(
          "RSASSA-PKCS1-v1_5",
          imported,
          bytes(atob(attributes)),
        );
        return btoa(String.fromCharCode(...new Uint8Array(signature)));
      },
    };
  } catch (e) {
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
