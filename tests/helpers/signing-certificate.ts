import { generateKeyPairSync, webcrypto } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as A from "asn1js";
import {
  AttributeTypeAndValue,
  AuthenticatedSafe,
  BasicConstraints,
  CertBag,
  Certificate,
  ContentInfo,
  Extension,
  PFX,
  PrivateKeyInfo,
  PublicKeyInfo,
  RelativeDistinguishedNames,
  SafeBag,
  SafeContents,
  Time,
} from "pkijs";

const pem = (kind: string, der: Uint8Array) =>
  `-----BEGIN ${kind}-----\n${Buffer.from(der)
    .toString("base64")
    .match(/.{1,64}/g)!
    .join("\n")}\n-----END ${kind}-----\n`;
export async function signingCertificate(
  options: {
    serialCpf?: string;
    sanCpf?: string | null;
    sanType?: "octet" | "printable" | "utf8";
    corporate?: boolean;
    expired?: boolean;
  } = {},
) {
  const rootKeys = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const date = new Date(Date.now() - 86400000);
  const until = new Date(
    Date.now() + (options.expired ? -3600000 : 365 * 86400000),
  );
  const subject = (name: string, serial?: string) =>
    new RelativeDistinguishedNames({
      typesAndValues: [
        new AttributeTypeAndValue({
          type: "2.5.4.3",
          value: new A.Utf8String({ value: name }),
        }),
        ...(serial
          ? [
              new AttributeTypeAndValue({
                type: "2.5.4.5",
                value: new A.PrintableString({ value: serial }),
              }),
            ]
          : []),
      ],
    });
  const rootSubject = subject("TEST ONLY - NOT ICP BRASIL");
  const extensions = (ca: boolean) => [
    new Extension({
      extnID: "2.5.29.19",
      critical: true,
      extnValue: new BasicConstraints({ cA: ca }).toSchema().toBER(false),
    }),
    new Extension({
      extnID: "2.5.29.15",
      critical: true,
      extnValue: new A.BitString({
        valueHex: Uint8Array.of(ca ? 0x06 : 0xc0).buffer,
      }).toBER(false),
    }),
  ];
  const common = {
    version: 2,
    issuer: rootSubject,
    notBefore: new Time({ type: 0, value: date }),
    notAfter: new Time({ type: 0, value: until }),
  };
  const root = new Certificate({
    ...common,
    serialNumber: new A.Integer({ value: 1 }),
    subject: rootSubject,
    subjectPublicKeyInfo: PublicKeyInfo.fromBER(
      rootKeys.publicKey.export({ type: "spki", format: "der" }),
    ),
    extensions: extensions(true),
  });
  const text = "01011990" + (options.sanCpf ?? "11144477735");
  const sanValue =
    options.sanType === "octet"
      ? new A.OctetString({ valueHex: new TextEncoder().encode(text).buffer })
      : options.sanType === "printable"
        ? new A.PrintableString({ value: text })
        : new A.Utf8String({ value: text });
  const san = new A.Sequence({
    value: [
      new A.Constructed({
        idBlock: { tagClass: 3, tagNumber: 0 },
        value: [
          new A.ObjectIdentifier({
            value: options.corporate ? "2.16.76.1.3.3" : "2.16.76.1.3.1",
          }),
          new A.Constructed({
            idBlock: { tagClass: 3, tagNumber: 0 },
            value: [sanValue],
          }),
        ],
      }),
    ],
  });
  const leaf = new Certificate({
    ...common,
    serialNumber: new A.Integer({ value: 2 }),
    subject: subject("Veterinaria Ficticia TESTE", options.serialCpf),
    subjectPublicKeyInfo: PublicKeyInfo.fromBER(
      keys.publicKey.export({ type: "spki", format: "der" }),
    ),
    extensions: [
      ...extensions(false),
      ...(options.sanCpf === null
        ? []
        : [
            new Extension({ extnID: "2.5.29.17", extnValue: san.toBER(false) }),
          ]),
    ],
  });
  const rootKey = await webcrypto.subtle.importKey(
    "pkcs8",
    rootKeys.privateKey.export({ type: "pkcs8", format: "der" }),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  await root.sign(rootKey, "SHA-256");
  await leaf.sign(rootKey, "SHA-256");
  const der = (c: Certificate) => Buffer.from(c.toSchema(true).toBER(false));
  const pfx = (legacy = false) => {
    // Disposable fictitious keys only. OpenSSL gives independent interoperability fixtures.
    const directory = mkdtempSync(join(tmpdir(), "vet-test-pfx-"));
    try {
      writeFileSync(
        join(directory, "key.pem"),
        keys.privateKey.export({ type: "pkcs8", format: "pem" }),
        { mode: 0o600 },
      );
      writeFileSync(join(directory, "leaf.pem"), pem("CERTIFICATE", der(leaf)));
      writeFileSync(join(directory, "root.pem"), pem("CERTIFICATE", der(root)));
      return new Uint8Array(
        execFileSync("openssl", [
          "pkcs12",
          "-export",
          "-inkey",
          join(directory, "key.pem"),
          "-in",
          join(directory, "leaf.pem"),
          "-certfile",
          join(directory, "root.pem"),
          "-passout",
          "pass:test-pin",
          "-keypbe",
          legacy ? "PBE-SHA1-3DES" : "AES-256-CBC",
          "-certpbe",
          legacy ? "PBE-SHA1-3DES" : "AES-256-CBC",
          "-macalg",
          legacy ? "sha1" : "sha256",
        ]),
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  };
  const customPfx = async (
    settings: {
      rootFirst?: boolean;
      extraKey?: boolean;
      mismatch?: boolean;
    } = {},
  ) => {
    const keyBag = () =>
      new SafeBag({
        bagId: "1.2.840.113549.1.12.10.1.1",
        bagValue: PrivateKeyInfo.fromBER(
          keys.privateKey.export({ type: "pkcs8", format: "der" }),
        ),
      });
    const certs = settings.mismatch
      ? [root]
      : settings.rootFirst
        ? [root, leaf]
        : [leaf, root];
    const safeContents = new SafeContents({
      safeBags: [
        keyBag(),
        ...(settings.extraKey ? [keyBag()] : []),
        ...certs.map(
          (c) =>
            new SafeBag({
              bagId: "1.2.840.113549.1.12.10.1.3",
              bagValue: new CertBag({ parsedValue: c }),
            }),
        ),
      ],
    });
    const bundle = new PFX({
      parsedValue: {
        integrityMode: 0,
        authenticatedSafe: new AuthenticatedSafe({
          safeContents: [
            new ContentInfo({
              contentType: ContentInfo.DATA,
              content: new A.OctetString({
                valueHex: safeContents.toSchema().toBER(false),
              }),
            }),
          ],
        }),
      },
    });
    await bundle.makeInternalValues({
      iterations: 2048,
      pbkdf2HashAlgorithm: { name: "SHA-256" },
      hmacHashAlgorithm: "SHA-256",
      password: new TextEncoder().encode("test-pin").buffer,
    });
    return new Uint8Array(bundle.toSchema().toBER(false));
  };
  return { root: der(root), leaf: der(leaf), pfx, customPfx };
}
