"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Building2, Sparkles, Stethoscope, Upload } from "lucide-react";
import type { PracticeSettings } from "@/lib/settings";
import {
  brandPalette,
  DEFAULT_PRIMARY_COLOR,
  HEX_COLOR,
} from "@/lib/brand-color";
import { MaskedInput } from "./masked-input";
import { parseInput } from "@/lib/input-formats";
import { AsyncForm } from "./forms";
import { can, isVeterinarian, type Identity } from "@/lib/permissions";
import type { ProfessionalProfile } from "@/lib/professional-profile";
import { ReauthenticateLink } from "./reauthenticate";
export function Settings({
  settings,
  professionalProfile,
  onSaved,
  guardRef,
  identity,
}: {
  settings: PracticeSettings;
  professionalProfile?: ProfessionalProfile | null;
  identity: Identity;
  onSaved: () => Promise<void>;
  guardRef: React.MutableRefObject<null | (() => boolean)>;
}) {
  const profile = professionalProfile || {
    veterinarianName: "",
    veterinarianTitle: "Dra." as const,
    crmv: "",
    sipeagro: "",
    veterinarianCpf: "",
    revision: 0,
  };
  const tabs = (
    [
      ["company", "Identidade da empresa", Building2],
      ["professional", "Meu perfil veterinário", Stethoscope],
      ["ai", "Inteligência artificial", Sparkles],
    ] as const
  ).filter(([id]) =>
    id === "professional"
      ? isVeterinarian(identity)
      : can(identity.role, "settings.write"),
  );
  const [companyName, setCompanyName] = useState(settings.companyName),
    [primaryColor, setPrimaryColor] = useState(
      settings.primaryColor || DEFAULT_PRIMARY_COLOR,
    ),
    [veterinarianName, setVeterinarianName] = useState(
      profile.veterinarianName,
    ),
    [crmv, setCrmv] = useState(profile.crmv),
    [veterinarianTitle, setVeterinarianTitle] = useState(
      profile.veterinarianTitle,
    ),
    [sipeagro, setSipeagro] = useState(profile.sipeagro || ""),
    [details, setDetails] = useState({
      phone: settings.phone || "",
      email: settings.email || "",
      cnpj: settings.cnpj || "",
      veterinarianCpf: profile.veterinarianCpf || "",
    }),
    [logo, setLogo] = useState<File | null>(null),
    [preview, setPreview] = useState(""),
    [remove, setRemove] = useState(false),
    [error, setError] = useState("");
  const [tab, setTab] = useState<"company" | "professional" | "ai">(
    can(identity.role, "settings.write") ? "company" : "professional",
  );
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [removeGeminiKey, setRemoveGeminiKey] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dirty =
    companyName !== settings.companyName ||
    primaryColor !== settings.primaryColor ||
    veterinarianName !== profile.veterinarianName ||
    veterinarianTitle !== profile.veterinarianTitle ||
    crmv !== profile.crmv ||
    sipeagro !== (profile.sipeagro || "") ||
    (Object.keys(details) as (keyof typeof details)[]).some(
      (key) =>
        details[key] !==
        ((key === "veterinarianCpf"
          ? profile.veterinarianCpf
          : settings[key]) || ""),
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
      key={tab}
      submit={
        tab === "company"
          ? "Salvar identidade da empresa"
          : tab === "professional"
            ? "Salvar meu perfil veterinário"
            : "Salvar configuração de IA"
      }
      onSubmit={async () => {
        if (tab === "professional") {
          const values = {
            veterinarianName: veterinarianName.trim(),
            veterinarianTitle,
            crmv: parseInput("crmv", crmv),
            sipeagro: parseInput("sipeagro", sipeagro),
            veterinarianCpf: parseInput("cpf", details.veterinarianCpf),
            revision: profile.revision,
          };
          const response = await fetch("/api/profile", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-vet-user": identity.userId,
              "x-vet-clinic": identity.orgId,
            },
            body: JSON.stringify(values),
          });
          const result = await response.json();
          if (!response.ok)
            throw Error(result.error || "Não foi possível salvar seu perfil.");
          await onSaved();
          setVeterinarianName(values.veterinarianName);
          setCrmv(values.crmv);
          setSipeagro(values.sipeagro);
          setDetails((current) => ({
            ...current,
            veterinarianCpf: values.veterinarianCpf,
          }));
          return;
        }
        if (tab === "company" && error) throw Error(error);
        if (tab === "company" && !HEX_COLOR.test(primaryColor))
          throw Error(
            "Informe uma cor hexadecimal com seis dígitos, como #245bdb.",
          );
        const body = new FormData();
        // The endpoint uses a complete snapshot and revision for concurrency.
        // Only merge drafts from the section being saved into that snapshot.
        const values = {
          companyName: settings.companyName,
          primaryColor: settings.primaryColor,
          veterinarianName: settings.veterinarianName,
          veterinarianTitle: settings.veterinarianTitle,
          crmv: settings.crmv,
          sipeagro: settings.sipeagro || "",
          phone: settings.phone || "",
          email: settings.email || "",
          cnpj: settings.cnpj || "",
          veterinarianCpf: settings.veterinarianCpf || "",
          ...(tab === "company"
            ? {
                companyName: companyName.trim(),
                primaryColor: primaryColor.toLowerCase(),
                phone: parseInput("phone", details.phone),
                email: details.email.trim(),
                cnpj: parseInput("cnpj", details.cnpj),
              }
            : {}),
        };
        for (const [key, value] of Object.entries(values)) body.set(key, value);
        body.set("revision", String(settings.revision));
        if (tab === "company") {
          body.set("removeLogo", String(remove));
          if (logo) body.set("logo", logo);
        }
        if (tab === "ai") {
          if (geminiApiKey) body.set("geminiApiKey", geminiApiKey);
          body.set("removeGeminiKey", String(removeGeminiKey));
        }
        const r = await fetch("/api/settings", {
          method: "POST",
          body,
          headers: {
            "x-vet-user": identity.userId,
            "x-vet-clinic": identity.orgId,
          },
        });
        const result = await r.json();
        if (r.status === 428) {
          setNeedsConfirmation(true);
          return;
        }
        if (!r.ok)
          throw Error(
            result.error || "Não foi possível salvar as configurações.",
          );
        await onSaved();
        setNeedsConfirmation(false);
        if (tab === "company") {
          setCompanyName(values.companyName);
          setPrimaryColor(values.primaryColor);
          setDetails((current) => ({
            ...current,
            phone: values.phone,
            email: values.email,
            cnpj: values.cnpj,
          }));
          setLogo(null);
          setPreview("");
          setRemove(false);
          if (fileRef.current) fileRef.current.value = "";
        } else {
          setGeminiApiKey("");
          setRemoveGeminiKey(false);
        }
      }}
    >
      <div className="settings-sections">
        <div
          className="settings-tabs"
          role="tablist"
          aria-label="Seções de configurações"
        >
          {tabs.map(([id, label, Icon], index) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`settings-tab-${id}`}
              aria-selected={tab === id}
              aria-controls={`settings-panel-${id}`}
              tabIndex={tab === id ? 0 : -1}
              onClick={() => {
                setTab(id);
                requestAnimationFrame(() =>
                  document.getElementById(`settings-tab-${id}`)?.focus(),
                );
              }}
              onKeyDown={(event) => {
                const ids = tabs.map(([id]) => id);
                const next =
                  event.key === "ArrowRight"
                    ? (index + 1) % ids.length
                    : event.key === "ArrowLeft"
                      ? (index + ids.length - 1) % ids.length
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? ids.length - 1
                          : null;
                if (next === null) return;
                event.preventDefault();
                setTab(ids[next]);
                requestAnimationFrame(() =>
                  document.getElementById(`settings-tab-${ids[next]}`)?.focus(),
                );
              }}
            >
              <Icon size={18} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
        {tab === "company" && (
          <section
            className="panel stack"
            role="tabpanel"
            id="settings-panel-company"
            aria-labelledby="settings-tab-company"
          >
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
                    {settings.hasLogo || logo
                      ? "Substituir logo"
                      : "Enviar logo"}
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
                {key === "email" ? (
                  <input
                    type="email"
                    value={details.email}
                    maxLength={limit}
                    onChange={(e) =>
                      setDetails({ ...details, email: e.target.value })
                    }
                  />
                ) : (
                  <MaskedInput
                    mask={key}
                    value={details[key]}
                    onValueChange={(value) =>
                      setDetails({ ...details, [key]: value })
                    }
                  />
                )}
              </label>
            ))}
            <p className="hint">
              Quando preenchidos, estes dados aparecem no cabeçalho das receitas
              e pedidos de exame.
            </p>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </section>
        )}
        {tab === "professional" && (
          <section
            className="panel stack"
            role="tabpanel"
            id="settings-panel-professional"
            aria-labelledby="settings-tab-professional"
          >
            <div>
              <h2>Meu perfil veterinário</h2>
              <p className="muted">
                Dados da sua conta nesta clínica. Serão registrados nas receitas
                que você emitir. Alterações aqui não modificam receitas
                anteriores.
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
              <MaskedInput
                mask="crmv"
                value={crmv}
                onValueChange={setCrmv}
                required
                maxLength={60}
                placeholder="CRMV-SP 53.181"
              />
            </label>
            <label>
              Registro MAPA / SIPEAGRO
              <MaskedInput
                mask="sipeagro"
                value={sipeagro}
                onValueChange={setSipeagro}
                maxLength={60}
                placeholder="Ex.: MV00000000000"
                aria-describedby="sipeagro-help"
              />
            </label>
            <p className="hint" id="sipeagro-help">
              Opcional. Quando preenchido, aparece nas receitas junto aos dados
              da veterinária responsável.
            </p>
            <p className="hint">
              Para assinar receitas, use o certificado pessoal e-CPF da
              profissional. O CPF abaixo deve corresponder ao do seu
              certificado.
            </p>
            <label>
              CPF do profissional (opcional)
              <MaskedInput
                mask="cpf"
                value={details.veterinarianCpf}
                maxLength={20}
                onValueChange={(value) =>
                  setDetails({ ...details, veterinarianCpf: value })
                }
              />
            </label>
          </section>
        )}
        {tab === "ai" && (
          <section
            className="panel stack"
            role="tabpanel"
            id="settings-panel-ai"
            aria-labelledby="settings-tab-ai"
          >
            <div>
              <h2>Inteligência artificial</h2>
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
              projeto Gemini. A quota gratuita permite uso do conteúdo pelo
              Google para melhoria dos modelos.{" "}
              <a
                href="https://ai.google.dev/gemini-api/terms"
                target="_blank"
                rel="noreferrer"
              >
                Termos do Gemini
              </a>
            </p>
            {needsConfirmation && (
              <ReauthenticateLink userId={identity.userId} />
            )}
          </section>
        )}
      </div>
    </AsyncForm>
  );
}
