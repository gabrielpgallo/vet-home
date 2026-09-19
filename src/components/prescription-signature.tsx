"use client";
import { useEffect, useRef, useState } from "react";
import { Download, ExternalLink, PenLine } from "lucide-react";
import { isVeterinarian, type Identity } from "@/lib/permissions";
import type { LocalSigner } from "@/lib/local-signature";
export function PrescriptionSignature({
  id,
  signedAt,
  prescriberId,
  identity,
}: {
  id: string;
  signedAt?: string | null;
  prescriberId?: string | null;
  identity?: Identity;
}) {
  const [open, setOpen] = useState(false),
    [locallySigned, setSigned] = useState(false);
  const signed = Boolean(signedAt) || locallySigned;
  return (
    <div className="prescription-signature">
      <div className="prescription-signature-actions">
        {!signed &&
          identity &&
          isVeterinarian(identity) &&
          prescriberId === identity.userId && (
            <button
              type="button"
              className="prescription-signature-sign"
              onClick={() => setOpen(true)}
            >
              <PenLine size={16} aria-hidden="true" />
              Assinar receita
            </button>
          )}
        <a
          className="prescription-signature-download"
          href={`/api/prescriptions/${id}/pdf`}
          target="_blank"
          rel="noreferrer"
          aria-label={signed ? "Baixar PDF assinado" : "Baixar PDF em rascunho"}
        >
          <Download size={16} aria-hidden="true" />
          {signed ? "Baixar PDF assinado" : "Baixar rascunho"}
        </a>
        {signed && (
          <a
            className="prescription-signature-download"
            href="https://validar.iti.gov.br/"
            target="_blank"
            rel="noreferrer"
          >
            Validar no ITI
            <ExternalLink size={14} aria-hidden="true" />
          </a>
        )}
      </div>
      {signed && (
        <small className="prescription-signature-note">
          Assinatura incorporada ao PDF. Validação de revogação pendente no ITI.
        </small>
      )}
      {open && identity && (
        <SigningDialog
          id={id}
          identity={identity}
          close={() => setOpen(false)}
          done={() => {
            setSigned(true);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}
function SigningDialog({
  id,
  identity,
  close,
  done,
}: {
  id: string;
  identity: Identity;
  close: () => void;
  done: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    signer = useRef<LocalSigner | null>(null),
    alive = useRef(true);
  const [prepared, setPrepared] = useState<{
    attemptId: string;
    attributes: string;
    signerName: string;
    url: string;
  } | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const objectUrl = useRef<string | null>(null);
  useEffect(() => {
    alive.current = true;
    dialog.current?.showModal();
    return () => {
      alive.current = false;
      signer.current = null;
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  }, []);
  const headers = {
    "Content-Type": "application/json",
    "x-vet-user": identity.userId,
    "x-vet-clinic": identity.orgId,
  };
  async function openCertificate(form: HTMLFormElement) {
    setBusy(true);
    setError("");
    const file = (form.elements.namedItem("certificate") as HTMLInputElement)
      .files?.[0];
    let pin = (form.elements.namedItem("pin") as HTMLInputElement).value;
    form.reset();
    let bytes: Uint8Array | undefined;
    try {
      if (!file || file.size > 2 * 1024 * 1024)
        throw Error("Selecione um arquivo .pfx ou .p12 de até 2 MB.");
      const { openLocalCertificate } = await import("@/lib/local-signature");
      bytes = new Uint8Array(await file.arrayBuffer());
      const local = await openLocalCertificate(bytes, pin);
      pin = "";
      bytes.fill(0);
      if (!alive.current) return;
      signer.current = local;
      const response = await fetch(`/api/prescriptions/${id}/signature`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          certificate: local.certificate,
          chain: local.chain,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      if (!alive.current) return;
      const pdf = Uint8Array.from(atob(data.pdf), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(
        new Blob([pdf], { type: "application/pdf" }),
      );
      objectUrl.current = url;
      setPrepared({ ...data, url });
    } catch (e) {
      signer.current = null;
      if (alive.current)
        setError(
          e instanceof Error
            ? e.message
            : "Não foi possível preparar a assinatura.",
        );
    } finally {
      pin = "";
      bytes?.fill(0);
      if (alive.current) setBusy(false);
    }
  }
  async function sign() {
    if (!prepared || !signer.current) return;
    setBusy(true);
    setError("");
    try {
      const signature = await signer.current.sign(prepared.attributes);
      if (!alive.current) return;
      const response = await fetch(`/api/prescriptions/${id}/signature`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ attemptId: prepared.attemptId, signature }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      signer.current = null;
      if (alive.current) done();
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error
            ? e.message
            : "Não foi possível salvar. Tente confirmar novamente.",
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      aria-labelledby="signing-title"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else close();
      }}
    >
      <div className="dialog-head">
        <h2 id="signing-title">Assinar receita</h2>
        <button
          type="button"
          disabled={busy}
          onClick={close}
          aria-label="Fechar assinatura"
        >
          Fechar
        </button>
      </div>
      <div className="dialog-body stack">
        <p>
          Seu arquivo e PIN são usados somente neste dispositivo. Não são
          enviados nem salvos no servidor.
        </p>
        {error && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}
        {!prepared ? (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void openCertificate(e.currentTarget);
            }}
          >
            <label>
              Certificado pessoal A1 (.pfx ou .p12)
              <input
                type="file"
                name="certificate"
                accept=".pfx,.p12"
                required
                disabled={busy}
              />
            </label>
            <label>
              PIN / senha do certificado
              <input
                type="password"
                name="pin"
                autoComplete="off"
                required
                disabled={busy}
              />
            </label>
            <p className="hint">
              O CPF do certificado deve ser o do profissional que emitiu esta
              receita.
            </p>
            <button className="primary" disabled={busy}>
              {busy ? "Abrindo certificado…" : "Preparar e revisar receita"}
            </button>
          </form>
        ) : (
          <>
            <p>
              <strong>Titular: {prepared.signerName}</strong>
            </p>
            <a
              className="button-link"
              href={prepared.url}
              target="_blank"
              rel="noreferrer"
            >
              Abrir PDF para conferir antes de assinar ↗
            </a>
            <p>
              Ao confirmar, você assina esta versão da receita. O PDF assinado
              será preservado; correções exigem uma nova receita.
            </p>
            <p className="hint">
              Após assinar, confira o documento no VALIDAR do ITI. Esta etapa
              não consulta revogação e não inclui carimbo de tempo.
            </p>
            <button className="primary" disabled={busy} onClick={sign}>
              {busy ? "Assinando e salvando…" : "Conferi a receita — assinar"}
            </button>
          </>
        )}
      </div>
    </dialog>
  );
}
