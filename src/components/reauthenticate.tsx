"use client";
import { useEffect, useState } from "react";
import { ShieldCheck, ArrowUpRight } from "lucide-react";
import { authClient } from "@/lib/auth-client";

export function ReauthenticateLink({ userId }: { userId: string }) {
  return (
    <aside className="reauth-card" aria-label="Confirmação de segurança">
      <ShieldCheck className="reauth-card-icon" size={20} aria-hidden="true" />
      <div className="reauth-card-copy" role="status">
        <strong>Confirme sua conta para salvar</strong>
        <p>
          Suas alterações estão preservadas. Confirme em outra aba e volte para
          salvar.
        </p>
      </div>
      <a
        className="reauth-card-action"
        href={`/confirmar-acesso?user=${encodeURIComponent(userId)}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        Confirmar com Google
        <ArrowUpRight size={16} aria-hidden="true" />
      </a>
    </aside>
  );
}

export function Reauthenticate({
  userId,
  done,
  failed,
}: {
  userId: string;
  done: boolean;
  failed: boolean;
}) {
  const [error, setError] = useState(
    failed ? "A confirmação não foi concluída. Tente novamente." : "",
  );
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!done) return;
    const controller = new AbortController();
    fetch(`/api/reauth?user=${encodeURIComponent(userId)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw Error(body.error);
        setConfirmed(true);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [done, userId]);
  async function confirm() {
    setBusy(true);
    setError("");
    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: `/confirmar-acesso?done=1&user=${encodeURIComponent(userId)}`,
        errorCallbackURL: `/confirmar-acesso?error=1&user=${encodeURIComponent(userId)}`,
      });
      if (result.error) throw Error("Não foi possível confirmar sua conta.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na confirmação.");
      setBusy(false);
    }
  }
  return (
    <main className="login-shell">
      <section className="panel login-card">
        <h1>{confirmed ? "Conta confirmada" : "Confirme sua identidade"}</h1>
        <p>
          {confirmed
            ? "Volte à aba anterior e tente salvar novamente. Nenhuma alteração foi aplicada automaticamente."
            : "Selecione a mesma conta Google usada na aplicação. Seus dados continuam na aba anterior."}
        </p>
        {!confirmed && (
          <button
            className="primary"
            disabled={busy || !userId}
            onClick={confirm}
          >
            {busy ? "Conectando…" : "Confirmar com Google"}
          </button>
        )}
        {error && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
