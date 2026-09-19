import forge from "node-forge";
export function signingCertificate(
  options: {
    serialCpf?: string;
    sanCpf?: string | null;
    sanType?: number;
    corporate?: boolean;
  } = {},
) {
  const rootKeys = forge.pki.rsa.generateKeyPair(2048),
    keys = forge.pki.rsa.generateKeyPair(2048);
  const root = forge.pki.createCertificate(),
    leaf = forge.pki.createCertificate();
  const date = new Date();
  date.setDate(date.getDate() - 1);
  const until = new Date();
  until.setFullYear(until.getFullYear() + 1);
  root.publicKey = rootKeys.publicKey;
  root.serialNumber = "01";
  root.validity = { notBefore: date, notAfter: until };
  root.setSubject([
    { name: "commonName", value: "TEST ONLY - NOT ICP BRASIL" },
  ]);
  root.setIssuer(root.subject.attributes);
  root.setExtensions([
    { name: "basicConstraints", cA: true },
    { name: "keyUsage", keyCertSign: true, cRLSign: true },
  ]);
  root.sign(rootKeys.privateKey, forge.md.sha256.create());
  leaf.publicKey = keys.publicKey;
  leaf.serialNumber = "02";
  leaf.validity = { notBefore: date, notAfter: until };
  leaf.setSubject([
    { name: "commonName", value: "Veterinaria Ficticia TESTE" },
    ...(options.serialCpf
      ? [{ type: "2.5.4.5", value: options.serialCpf }]
      : []),
  ]);
  leaf.setIssuer(root.subject.attributes);
  const A = forge.asn1;
  const san = A.create(A.Class.UNIVERSAL, A.Type.SEQUENCE, true, [
    A.create(A.Class.CONTEXT_SPECIFIC, 0, true, [
      A.create(
        A.Class.UNIVERSAL,
        A.Type.OID,
        false,
        A.oidToDer(
          options.corporate ? "2.16.76.1.3.3" : "2.16.76.1.3.1",
        ).getBytes(),
      ),
      A.create(A.Class.CONTEXT_SPECIFIC, 0, true, [
        A.create(
          A.Class.UNIVERSAL,
          options.sanType ?? A.Type.UTF8,
          false,
          "01011990" + (options.sanCpf ?? "11144477735"),
        ),
      ]),
    ]),
  ]);
  leaf.setExtensions([
    { name: "basicConstraints", cA: false },
    { name: "keyUsage", digitalSignature: true, nonRepudiation: true },
    ...(options.sanCpf === null
      ? []
      : [{ id: "2.5.29.17", value: A.toDer(san).getBytes() }]),
  ]);
  leaf.sign(rootKeys.privateKey, forge.md.sha256.create());
  const der = (c: forge.pki.Certificate) =>
    Buffer.from(A.toDer(forge.pki.certificateToAsn1(c)).getBytes(), "binary");
  const pfx = (legacy = false) =>
    new Uint8Array(
      Buffer.from(
        A.toDer(
          forge.pkcs12.toPkcs12Asn1(keys.privateKey, [leaf, root], "test-pin", {
            algorithm: legacy ? "3des" : "aes256",
          }),
        ).getBytes(),
        "binary",
      ),
    );
  return { root: der(root), leaf: der(leaf), pfx };
}
