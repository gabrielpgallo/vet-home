import { X509Certificate, verify, createHash } from "node:crypto";
import { PDF, type Signer } from "@libpdf/core";
import * as asn1 from "asn1js";
import {
  Certificate,
  CertificateChainValidationEngine,
  ContentInfo,
  SignedData,
} from "pkijs";
import forge from "node-forge";
import { icpRoots } from "./icp-roots";
import { AppError } from "../db";
const parse = (b: Uint8Array) =>
  new Certificate({ schema: asn1.fromBER(new Uint8Array(b).buffer).result });
export const sha256 = (data: Uint8Array) =>
  createHash("sha256").update(data).digest("hex");
export function certificateCpf(der: Uint8Array) {
  const c = forge.pki.certificateFromAsn1(
    forge.asn1.fromDer(forge.util.createBuffer(new Uint8Array(der).buffer)),
  );
  // DOC-ICP-04 / Resolution 211: modern certificates put CPF in the
  // subject serialNumber (2.5.4.5), not the certificate's hexadecimal serial.
  const candidates = new Set<string>();
  for (const attribute of c.subject.attributes) {
    if (attribute.type !== "2.5.4.5") continue;
    const value = String(attribute.value).trim();
    if (
      /^\d{14}$/.test(value) ||
      /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(value)
    )
      return "";
    if (/^\d{11}$/.test(value) || /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(value))
      candidates.add(value.replace(/\D/g, ""));
  }
  const extension = c.extensions.find((e) => e.id === "2.5.29.17");
  if (extension) {
    const san = forge.asn1.fromDer(extension.value as string);
    if (Array.isArray(san.value))
      for (const name of san.value) {
        if (
          name.tagClass !== forge.asn1.Class.CONTEXT_SPECIFIC ||
          name.type !== 0 ||
          !Array.isArray(name.value)
        )
          continue;
        const [oid, wrapped] = name.value;
        if (
          !oid ||
          oid.type !== forge.asn1.Type.OID ||
          typeof oid.value !== "string"
        )
          continue;
        const identifier = forge.asn1.derToOid(oid.value);
        // A company's CNPJ / representative's CPF is not a personal e-CPF.
        if (identifier === "2.16.76.1.3.3") return "";
        if (
          identifier !== "2.16.76.1.3.1" ||
          !wrapped ||
          !Array.isArray(wrapped.value)
        )
          continue;
        const node = wrapped.value[0];
        if (
          !node ||
          node.tagClass !== forge.asn1.Class.UNIVERSAL ||
          ![
            forge.asn1.Type.OCTETSTRING,
            forge.asn1.Type.PRINTABLESTRING,
            forge.asn1.Type.UTF8,
          ].includes(node.type)
        )
          continue;
        const value = node.value;
        if (typeof value === "string" && /^\d{19}/.test(value))
          candidates.add(value.slice(8, 19));
      }
  }
  if (candidates.size > 1)
    throw new AppError(
      "O certificado contém campos de CPF conflitantes. Confira o certificado com a emissora.",
    );
  return [...candidates][0] || "";
}
export async function checkCertificate(
  certificate: Buffer,
  chain: Buffer[],
  cpf: string,
  roots = icpRoots,
) {
  const x = new X509Certificate(certificate);
  const bits = x.publicKey.asymmetricKeyDetails?.modulusLength || 0;
  if (
    x.ca ||
    x.publicKey.asymmetricKeyType !== "rsa" ||
    bits < 2048 ||
    bits > 4096
  )
    throw new AppError(
      "Use um certificado pessoal A1 RSA de 2048 a 4096 bits.",
    );
  const normalized = cpf.replace(/\D/g, "");
  if (!/^\d{11}$/.test(normalized))
    throw new AppError(
      "Cadastre o CPF da veterinária nas Configurações antes de assinar.",
    );
  const holderCpf = certificateCpf(certificate);
  if (!holderCpf)
    throw new AppError(
      "Não foi possível identificar o CPF do titular neste certificado. Selecione o e-CPF pessoal da veterinária; certificados de empresa não são aceitos.",
    );
  if (holderCpf !== normalized)
    throw new AppError(
      "O CPF do certificado não corresponde ao da veterinária nas Configurações.",
    );
  const leaf = parse(certificate);
  const usage = leaf.extensions?.find((e) => e.extnID === "2.5.29.15")
    ?.parsedValue as asn1.BitString | undefined;
  if (!usage || !(usage.valueBlock.valueHexView[0] & 0xc0))
    throw new AppError("Certificado sem permissão para assinatura digital.");
  const engine = new CertificateChainValidationEngine({
    trustedCerts: roots.map((b) => parse(Buffer.from(b, "base64"))),
    certs: [...chain.map(parse), leaf],
    checkDate: new Date(),
  });
  // Chain/date verification only. OCSP/CRL and trusted time are not claimed.
  if (!(await engine.verify({ passedWhenNotRevValues: true })).result)
    throw new AppError(
      "Cadeia ICP-Brasil incompleta, não suportada ou certificado fora da validade. Exporte o PFX incluindo a cadeia de certificados.",
    );
  return {
    name:
      leaf.subject.typesAndValues.find((v) => v.type === "2.5.4.3")?.value
        .valueBlock.value || "Titular",
    fingerprint: x.fingerprint256,
    size: bits / 8,
  };
}
export async function preparePdf(
  pdf: Uint8Array,
  certificate: Buffer,
  chain: Buffer[],
  size: number,
) {
  let attributes = Buffer.alloc(0);
  const signer: Signer = {
    certificate,
    certificateChain: chain,
    keyType: "RSA",
    signatureAlgorithm: "RSASSA-PKCS1-v1_5",
    sign: async (data) => {
      attributes = Buffer.from(data);
      return new Uint8Array(size);
    },
  };
  const result = await (
    await PDF.load(pdf)
  ).sign({
    signer,
    level: "B-B",
    digestAlgorithm: "SHA-256",
    fieldName: "AssinaturaVeterinaria",
    reason: "Prescrição veterinária",
    estimatedSize: 24576,
  });
  if (!attributes.length) throw new Error("Missing signing attributes");
  return { pdf: Buffer.from(result.bytes), attributes };
}
export async function completePdf(
  prepared: Buffer,
  attributes: Buffer,
  certificate: Buffer,
  signature: Buffer,
) {
  if (
    !verify(
      "sha256",
      attributes,
      new X509Certificate(certificate).publicKey,
      signature,
    )
  )
    throw new AppError(
      "Assinatura não corresponde ao documento e ao certificado.",
    );
  const match = prepared
    .toString("latin1")
    .match(/\/ByteRange\s*\[\s*0\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/);
  if (!match) throw Error("Missing ByteRange");
  const start = Number(match[1]),
    end = Number(match[2]);
  if (
    end + Number(match[3]) !== prepared.length ||
    prepared[start] !== 60 ||
    prepared[end - 1] !== 62
  )
    throw Error("Invalid ByteRange");
  const content = new ContentInfo({
    schema: asn1.fromBER(
      Buffer.from(prepared.subarray(start + 1, end - 1).toString(), "hex"),
    ).result,
  });
  const cms = new SignedData({ schema: content.content });
  if (cms.signerInfos.length !== 1) throw Error("Unexpected signers");
  cms.signerInfos[0].signature = new asn1.OctetString({
    valueHex: new Uint8Array(signature).buffer,
  });
  const signedBytes = Buffer.concat([
    prepared.subarray(0, start),
    prepared.subarray(end),
  ]);
  if (
    !(await cms.verify({
      signer: 0,
      data: new Uint8Array(signedBytes).buffer,
      checkChain: false,
    }))
  )
    throw new AppError("Falha ao conferir a integridade da assinatura.");
  content.content = cms.toSchema(true);
  const hex = Buffer.from(content.toSchema().toBER(false)).toString("hex");
  if (hex.length > end - start - 2)
    throw Error("Signature exceeds placeholder");
  const final = Buffer.from(prepared);
  final.write(hex.padEnd(end - start - 2, "0"), start + 1, "ascii");
  return final;
}
