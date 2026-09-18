"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Building2, Upload } from "lucide-react";
import type { PracticeSettings } from "@/lib/settings";
import {
  brandPalette,
  DEFAULT_PRIMARY_COLOR,
  HEX_COLOR,
} from "@/lib/brand-color";
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
    [primaryColor, setPrimaryColor] = useState(
      settings.primaryColor || DEFAULT_PRIMARY_COLOR,
    ),
    [veterinarianName, setVeterinarianName] = useState(
      settings.veterinarianName,
    ),
    [crmv, setCrmv] = useState(settings.crmv),
    [veterinarianTitle, setVeterinarianTitle] = useState(
      settings.veterinarianTitle,
    ),
    [sipeagro, setSipeagro] = useState(settings.sipeagro || ""),
    [details, setDetails] = useState({
      phone: settings.phone || "",
      email: settings.email || "",
      cnpj: settings.cnpj || "",
      veterinarianCpf: settings.veterinarianCpf || "",
    }),
    [logo, setLogo] = useState<File | null>(null),
    [preview, setPreview] = useState(""),
    [remove, setRemove] = useState(false),
    [error, setError] = useState("");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [removeGeminiKey, setRemoveGeminiKey] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dirty =
    companyName !== settings.companyName ||
    primaryColor !== settings.primaryColor ||
    veterinarianName !== settings.veterinarianName ||
    veterinarianTitle !== settings.veterinarianTitle ||
    crmv !== settings.crmv ||
    sipeagro !== (settings.sipeagro || "") ||
    (Object.keys(details) as (keyof typeof details)[]).some(
      (key) => details[key] !== (settings[key] || ""),
    ) ||
    !!logo ||
    !!geminiApiKey ||
    removeGeminiKey ||
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
        if (!HEX_COLOR.test(primaryColor))
          throw Error(
            "Informe uma cor hexadecimal com seis dígitos, como #245bdb.",
          );
        const body = new FormData();
        body.set("companyName", companyName);
        body.set("primaryColor", primaryColor);
        body.set("veterinarianName", veterinarianName);
        body.set("veterinarianTitle", veterinarianTitle);
        body.set("crmv", crmv);
        body.set("sipeagro", sipeagro);
        for (const [key, value] of Object.entries(details))
          body.set(key, value);
        body.set("revision", String(settings.revision));
        body.set("removeLogo", String(remove));
        if (geminiApiKey) body.set("geminiApiKey", geminiApiKey);
        body.set("removeGeminiKey", String(removeGeminiKey));
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
          <div className="primary-color-editor stack">
            <label htmlFor="primary-color-hex">Cor primária</label>
            <div className="primary-color-controls">
              <input
                type="color"
                aria-label="Selecionar cor primária"
                value={
                  HEX_COLOR.test(primaryColor)
                    ? primaryColor
                    : DEFAULT_PRIMARY_COLOR
                }
                onChange={(e) => setPrimaryColor(e.target.value)}
              />
              <input
                id="primary-color-hex"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                placeholder="#245bdb"
                maxLength={7}
                pattern="#[0-9a-fA-F]{6}"
                required
                spellCheck={false}
                autoComplete="off"
                aria-describedby="primary-color-help"
              />
              <button
                type="button"
                onClick={() => setPrimaryColor(DEFAULT_PRIMARY_COLOR)}
              >
                Restaurar padrão
              </button>
            </div>
            <p className="hint" id="primary-color-help">
              Escolha a cor do logo ou informe seu código. Será aplicada ao
              sistema e aos PDFs ao salvar. Os tons de texto se adaptam para
              manter a leitura.
            </p>
            <div
              className="primary-color-previews"
              aria-label="Prévia da cor nos temas claro e escuro"
            >
              {(["light", "dark"] as const).map((mode) => {
                const palette = brandPalette(primaryColor, mode);
                return (
                  <div
                    className="primary-color-preview"
                    key={mode}
                    style={{
                      background: palette.surface,
                      color: mode === "light" ? "#172640" : "#e8eef9",
                    }}
                  >
                    <strong>
                      {mode === "light" ? "Tema claro" : "Tema escuro"}
                    </strong>
                    <span
                      className="primary-color-preview-selection"
                      style={{
                        color: palette.primary,
                        background: palette.accent,
                      }}
                    >
                      Agenda
                    </span>
                    <span
                      className="primary-color-preview-button"
                      style={{
                        background: palette.fill,
                        color: palette.onPrimary,
                      }}
                    >
                      Agendar visita
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
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
          {(
            [
              ["phone", "Telefone / WhatsApp", 60],
              ["email", "E-mail", 150],
              ["cnpj", "CNPJ", 30],
            ] as const
          ).map(([key, label, limit]) => (
            <label key={key}>
              {label} (opcional)
              <input
                type={key === "email" ? "email" : "text"}
                value={details[key]}
                maxLength={limit}
                onChange={(e) =>
                  setDetails({ ...details, [key]: e.target.value })
                }
              />
            </label>
          ))}
          <p className="hint">
            Quando preenchidos, estes dados aparecem no cabeçalho das receitas e
            pedidos de exame.
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </section>
        <section className="panel stack">
          <div>
            <h2>Profissional responsável</h2>
            <p className="muted">
              Dados usados nas receitas e solicitações de exame.
            </p>
          </div>
          <label>
            Tratamento
            <select
              value={veterinarianTitle}
              onChange={(e) =>
                setVeterinarianTitle(e.target.value as "Dra." | "Dr.")
              }
            >
              <option value="Dra.">Dra. — Médica veterinária</option>
              <option value="Dr.">Dr. — Médico veterinário</option>
            </select>
          </label>
          <label>
            Nome do profissional
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
          <label>
            CPF do profissional (opcional)
            <input
              value={details.veterinarianCpf}
              maxLength={20}
              onChange={(e) =>
                setDetails({ ...details, veterinarianCpf: e.target.value })
              }
            />
          </label>
        </section>
        <section className="panel stack">
          <div>
            <h2>IA para anamnese · Gemini</h2>
            <p className="muted">
              Organiza suas anotações e transcreve áudios. A sugestão só
              substitui o texto depois da sua revisão.
            </p>
          </div>
          <p className="hint" role="status">
            {removeGeminiKey
              ? "A chave será removida ao salvar."
              : settings.hasGeminiKey
                ? "Chave cadastrada. Deixe o campo vazio para mantê-la."
                : "Cadastre uma chave para habilitar a IA nesta clínica."}
          </p>
          <label>
            {settings.hasGeminiKey
              ? "Substituir chave de API"
              : "Chave de API do Gemini"}
            <input
              type="password"
              name="geminiApiKey"
              autoComplete="new-password"
              value={geminiApiKey}
              maxLength={200}
              onChange={(e) => {
                setGeminiApiKey(e.target.value);
                setRemoveGeminiKey(false);
              }}
              placeholder="Cole a chave do Google AI Studio"
            />
          </label>
          {settings.hasGeminiKey && (
            <button
              type="button"
              onClick={() => {
                setGeminiApiKey("");
                setRemoveGeminiKey(!removeGeminiKey);
              }}
            >
              {removeGeminiKey
                ? "Manter chave atual"
                : "Remover chave ao salvar"}
            </button>
          )}
          <p className="hint">
            A chave é salva criptografada e não volta ao navegador. Apenas o
            texto e o áudio selecionados serão enviados ao Google quando você
            solicitar uma geração.
          </p>
          <p className="hint">
            Para dados reais, confira as regras de uso e privacidade do seu
            projeto Gemini. A quota gratuita permite uso do conteúdo pelo Google
            para melhoria dos modelos.{" "}
            <a
              href="https://ai.google.dev/gemini-api/terms"
              target="_blank"
              rel="noreferrer"
            >
              Termos do Gemini
            </a>
          </p>
        </section>
      </div>
    </AsyncForm>
  );
}
