"use client";
import Link from "next/link";
import { useState } from "react";
import { PawPrint, ShieldCheck } from "lucide-react";
import { authClient } from "@/lib/auth-client";
export function Login({
  ready,
  local,
  callbackError,
}: {
  ready: boolean;
  local: boolean;
  callbackError: boolean;
}) {
  const [error, setError] = useState(""),
    [shared, setShared] = useState(false),
    [busy, setBusy] = useState(false);
  async function login() {
    setError("");
    setBusy(true);
    try {
      document.cookie = `vet-shared-device=${shared}; Path=/; SameSite=Lax; Max-Age=43200${location.protocol === "https:" ? "; Secure" : ""}`;
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: "/access",
        errorCallbackURL: "/login?error=google",
      });
      if (result.error)
        throw Error(
          "Não foi possível entrar. Confira se seu e-mail possui um convite ativo.",
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao entrar.");
      setBusy(false);
    }
  }
  return (
    <main className="login-shell">
      <section className="panel login-card">
        <span className="brand-icon">
          <PawPrint size={32} />
        </span>
        <p className="eyebrow">IR SAÚDE ANIMAL</p>
        <h1>Seu consultório, conectado.</h1>
        <p className="muted">
          Entre com a conta Google que recebeu acesso à clínica.
        </p>
        <label>
          <input
            type="checkbox"
            checked={shared}
            onChange={(e) => setShared(e.target.checked)}
          />{" "}
          Estou em um dispositivo compartilhado
        </label>
        <p className="hint">
          {shared
            ? "Sessão de até 4 horas; expira após 30 minutos sem atividade no servidor."
            : "Sessão de até 12 horas; expira após 2 horas sem atividade no servidor."}
        </p>
        <button
          className="primary full"
          disabled={!ready || local || busy}
          onClick={login}
        >
          {busy ? "Conectando…" : "Entrar com Google"}
        </button>
        {!ready && (
          <p className="notice">
            O login Google está aguardando configuração. O responsável pelo
            sistema precisa ativar a integração.
          </p>
        )}
        {local && (
          <p className="notice">
            Ambiente de desenvolvimento local.{" "}
            <Link href="/">Voltar ao aplicativo</Link>
          </p>
        )}
        <LoginError error={error} callbackError={callbackError} />
        <p className="hint">
          <ShieldCheck size={16} /> Acesso exclusivo para pessoas convidadas.
          Usamos apenas sua identidade Google; não acessamos seu Gmail.
        </p>
      </section>
    </main>
  );
}
function LoginError({
  error,
  callbackError,
}: {
  error: string;
  callbackError: boolean;
}) {
  return error || callbackError ? (
    <p role="alert" className="notice">
      {error ||
        "Não foi possível concluir o login. Tente novamente com a conta convidada. Se o erro continuar, entre em contato com o responsável pelo sistema."}
    </p>
  ) : null;
}
