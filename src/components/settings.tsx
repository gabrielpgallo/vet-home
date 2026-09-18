"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Building2, Upload } from "lucide-react";
import type { PracticeSettings } from "@/lib/settings";
import { AsyncForm } from "./forms";
export function Settings({
  settings,
  onSaved,
  guardRef,
}: {
  settings: PracticeSettings;
  onSaved: () => Promise<void>;
  guardRef: React.MutableRefObject<null | (() => boolean)>;
}) {
  const [companyName, setCompanyName] = useState(settings.companyName),
    [veterinarianName, setVeterinarianName] = useState(
      settings.veterinarianName,
    ),
    [crmv, setCrmv] = useState(settings.crmv),
    [sipeagro, setSipeagro] = useState(settings.sipeagro || ""),
    [logo, setLogo] = useState<File | null>(null),
    [preview, setPreview] = useState(""),
    [remove, setRemove] = useState(false),
    [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const dirty =
    companyName !== settings.companyName ||
    veterinarianName !== settings.veterinarianName ||
    crmv !== settings.crmv ||
    sipeagro !== (settings.sipeagro || "") ||
    !!logo ||
    remove;
  useEffect(() => {
    guardRef.current = () =>
      !dirty ||
      confirm("Há configurações não salvas. Deseja descartá-las e sair?");
    const before = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => {
      guardRef.current = null;
      window.removeEventListener("beforeunload", before);
    };
  }, [dirty, guardRef]);
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);
  const image = logo
    ? preview
    : settings.hasLogo && !remove
      ? `/api/settings/logo?v=${settings.revision}`
      : "";
  return (
    <AsyncForm
      submit="Salvar configurações"
      onSubmit={async () => {
        if (error) throw Error(error);
        const body = new FormData();
        body.set("companyName", companyName);
        body.set("veterinarianName", veterinarianName);
        body.set("crmv", crmv);
        body.set("sipeagro", sipeagro);
        body.set("revision", String(settings.revision));
        body.set("removeLogo", String(remove));
        if (logo) body.set("logo", logo);
        const r = await fetch("/api/settings", { method: "POST", body });
        const result = await r.json();
        if (!r.ok)
          throw Error(
            result.error || "Não foi possível salvar as configurações.",
          );
        await onSaved();
      }}
    >
      <div className="settings-grid">
        <section className="panel stack">
          <div>
            <h2>Identidade da empresa</h2>
            <p className="muted">
              O nome e o logo aparecem na aplicação e nos documentos.
            </p>
          </div>
          <label>
            Nome da empresa
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
              maxLength={150}
            />
          </label>
          <div className="logo-editor">
            <div className="logo-preview">
              {image ? (
                <Image
                  src={image}
                  alt="Pré-visualização do logo"
                  width={160}
                  height={120}
                  unoptimized
                />
              ) : (
                <Building2 size={42} />
              )}
            </div>
            <div className="stack">
              <label className="logo-upload">
                <span>
                  <Upload size={16} />{" "}
                  {settings.hasLogo || logo ? "Substituir logo" : "Enviar logo"}
                </span>
                <input
                  ref={fileRef}
                  aria-label="Arquivo do logo"
                  type="file"
                  accept="image/png,image/jpeg,.png,.jpg,.jpeg"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (
                      file.size > 2 * 1024 * 1024 ||
                      !["image/png", "image/jpeg"].includes(file.type)
                    ) {
                      setError("Use um arquivo PNG ou JPEG de até 2 MB.");
                      e.target.value = "";
                      return;
                    }
                    setError("");
                    setLogo(file);
                    setPreview(URL.createObjectURL(file));
                    setRemove(false);
                  }}
                />
              </label>
              <p className="hint">
                PNG ou JPEG, até 2 MB. A proporção da imagem será preservada.
              </p>
              {(image || logo) && (
                <button
                  type="button"
                  onClick={() => {
                    setLogo(null);
                    setRemove(true);
                    setError("");
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                >
                  Remover logo
                </button>
              )}
              {remove && (
                <p className="hint">O logo será removido ao salvar.</p>
              )}
            </div>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </section>
        <section className="panel stack">
          <div>
            <h2>Veterinária responsável</h2>
            <p className="muted">
              Dados usados nas receitas e solicitações de exame.
            </p>
          </div>
          <label>
            Nome da veterinária
            <input
              value={veterinarianName}
              onChange={(e) => setVeterinarianName(e.target.value)}
              required
              maxLength={120}
            />
          </label>
          <label>
            CRMV
            <input
              value={crmv}
              onChange={(e) => setCrmv(e.target.value)}
              required
              maxLength={60}
              placeholder="CRMV-SP 53.181"
            />
          </label>
          <label>
            Registro MAPA / SIPEAGRO
            <input
              value={sipeagro}
              onChange={(e) => setSipeagro(e.target.value)}
              maxLength={60}
              placeholder="Número do cadastro no MAPA/SIPEAGRO"
              aria-describedby="sipeagro-help"
            />
          </label>
          <p className="hint" id="sipeagro-help">
            Opcional. Quando preenchido, aparece nas receitas junto aos dados da
            veterinária responsável.
          </p>
          <p className="hint">
            Os dados profissionais identificam a responsável. A assinatura
            digital ainda não está integrada.
          </p>
        </section>
      </div>
    </AsyncForm>
  );
}
