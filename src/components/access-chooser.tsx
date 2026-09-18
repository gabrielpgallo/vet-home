"use client";
import { useEffect, useState } from "react";
import { roleLabels, type Role } from "@/lib/permissions";
import { authClient } from "@/lib/auth-client";
type AccessData = {
  email: string;
  memberships: { id: string; name: string; role: Role }[];
  invitations: { id: string; name: string; role: Role }[];
};
export function AccessChooser() {
  const [data, setData] = useState<AccessData | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch("/api/access")
      .then(async (r) => {
        if (r.status === 401) {
          window.location.replace("/login");
          return;
        }
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        setData(d);
      })
      .catch((e) => setError(e.message));
  }, []);
  async function choose(type: "accept" | "select", id: string) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, id }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Full reload discards data and route caches after identity changes.
      window.location.assign("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao acessar.");
      setBusy(false);
    }
  }
  return (
    <main className="login-shell">
      <section className="panel login-card">
        <p className="eyebrow">ACESSO À CLÍNICA</p>
        <h1>Bem-vinda</h1>
        <p className="muted">{data?.email || "Carregando seus acessos…"}</p>
        {error && <p role="alert">{error}</p>}
        {data?.memberships.map((m) => (
          <div className="iam-access" key={m.id}>
            <strong>{m.name}</strong>
            <p>{roleLabels[m.role]}</p>
            <button
              disabled={busy}
              className="primary"
              onClick={() => choose("select", m.id)}
            >
              Acessar clínica
            </button>
          </div>
        ))}
        {data?.invitations.map((i) => (
          <div className="iam-access" key={i.id}>
            <strong>Convite · {i.name}</strong>
            <p>Perfil: {roleLabels[i.role]}</p>
            <button
              disabled={busy}
              className="primary"
              onClick={() => choose("accept", i.id)}
            >
              Aceitar convite
            </button>
          </div>
        ))}
        {data && !data.memberships.length && !data.invitations.length && (
          <p className="notice">
            Nenhum acesso ativo ou convite disponível. Peça à administradora que
            confira seu e-mail e suas permissões.
          </p>
        )}
        <button
          onClick={async () => {
            await authClient.signOut();
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Full reload discards data and route caches after identity changes.
            window.location.assign("/login");
          }}
        >
          Sair / usar outra conta
        </button>
      </section>
    </main>
  );
}
