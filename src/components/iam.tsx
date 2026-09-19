"use client";
import { useCallback, useEffect, useState } from "react";
import { roles, roleLabels, type Role, type Identity } from "@/lib/permissions";
import { authClient } from "@/lib/auth-client";
import { ReauthenticateLink } from "./reauthenticate";
type Member = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: "active" | "suspended";
  revision: number;
  is_veterinarian: boolean;
};
type Invite = {
  id: string;
  email: string;
  role: Role;
  status: string;
  expires_at: string;
};
type Audit = {
  id: string;
  actor: string;
  action: string;
  entity_id: string;
  created_at: string;
};
type Session = {
  id: string;
  createdAt: string;
  expiresAt: string;
  userAgent: string;
  current: boolean;
};
const date = (s: string) => new Date(s).toLocaleString("pt-BR");
export function Iam({
  identity,
  onChanged,
}: {
  identity: Identity;
  onChanged?: () => Promise<unknown>;
}) {
  const [data, setData] = useState<{
      members: Member[];
      invitations: Invite[];
      audit: Audit[];
      security: Audit[];
    } | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const refresh = useCallback(async () => {
    const r = await fetch("/api/iam", { cache: "no-store" }),
      d = await r.json();
    if (!r.ok) throw Error(d.error);
    setData(d);
  }, []);
  useEffect(() => {
    // refresh updates state only after the network response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh().catch((e) => setError(e.message));
  }, [refresh]);
  async function act(command: unknown) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/iam", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-vet-user": identity.userId,
          "x-vet-clinic": identity.orgId,
        },
        body: JSON.stringify(command),
      });
      const d = await r.json();
      if (r.status === 428) {
        setNeedsConfirmation(true);
        return false;
      }
      if (!r.ok) throw Error(d.error);
      await refresh();
      await onChanged?.();
      setNeedsConfirmation(false);
      setNotice("Acesso atualizado.");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="stack">
      {needsConfirmation && <ReauthenticateLink userId={identity.userId} />}
      {identity.local && (
        <div className="notice">
          Modo de desenvolvimento local: as permissões desta sessão são de
          administradora. O login Google ainda não está ativo.
        </div>
      )}
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <section className="panel">
        <h2>Convidar pessoa</h2>
        <p className="muted">
          O convite vale por 7 dias e só pode ser aceito pela conta Google com o
          e-mail informado.
        </p>
        <form
          className="iam-invite"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget,
              f = new FormData(form);
            if (
              await act({
                type: "invite",
                email: f.get("email"),
                role: f.get("role"),
              })
            ) {
              form.reset();
              setNotice(
                "Convite criado. Compartilhe o endereço de acesso com a pessoa; nenhum e-mail foi enviado automaticamente.",
              );
            }
          }}
        >
          <label>
            E-mail Google
            <input
              name="email"
              type="email"
              required
              maxLength={254}
              placeholder="nome@gmail.com"
            />
          </label>
          <label>
            Perfil
            <select name="role" defaultValue="assistant">
              {roles.map((r) => (
                <option key={r} value={r}>
                  {roleLabels[r]}
                </option>
              ))}
            </select>
          </label>
          <button className="primary" disabled={busy}>
            Criar convite
          </button>
        </form>
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(location.origin + "/login");
              setNotice(
                "Endereço de acesso copiado. Envie-o à pessoa convidada.",
              );
            } catch {
              setNotice("Endereço de acesso: " + location.origin + "/login");
            }
          }}
        >
          Copiar endereço de acesso
        </button>
      </section>
      <section className="panel">
        <h2>Usuários da clínica</h2>
        <p className="hint">
          Alterações de perfil e suspensão passam a valer nas próximas
          requisições. Encerrar sessões desconecta a conta em todos os
          dispositivos e clínicas.
        </p>
        <div className="stack">
          {data?.members.map((m) => (
            <MemberRow
              key={m.id + ":" + m.revision}
              member={m}
              busy={busy}
              act={act}
            />
          ))}
          {data && !data.members.length && (
            <p className="muted">Nenhuma pessoa aceitou o convite ainda.</p>
          )}
        </div>
      </section>
      <section className="panel table-scroll">
        <h2>Convites</h2>
        <table>
          <thead>
            <tr>
              <th>E-mail</th>
              <th>Perfil</th>
              <th>Status</th>
              <th>Validade</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            {data?.invitations.map((i) => (
              <tr key={i.id}>
                <td>{i.email}</td>
                <td>{roleLabels[i.role]}</td>
                <td>
                  {i.status === "accepted"
                    ? "Aceito"
                    : i.status === "revoked"
                      ? "Revogado"
                      : new Date(i.expires_at) < new Date()
                        ? "Expirado"
                        : "Pendente"}
                </td>
                <td>{date(i.expires_at)}</td>
                <td>
                  {i.status === "pending" && (
                    <button
                      disabled={busy}
                      onClick={() => act({ type: "revokeInvite", id: i.id })}
                    >
                      Revogar convite
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="panel">
        <h2>Permissões por perfil</h2>
        <div className="iam-roles">
          <div>
            <h3>Administradora</h3>
            <p>
              Acesso completo, incluindo financeiro, produtos, configurações e
              gestão de usuários. Para emitir receitas, também precisa da
              habilitação veterinária e do cadastro profissional.
            </p>
          </div>
          <div>
            <h3>Veterinária</h3>
            <p>
              Agenda, cadastros, prontuários, exames, receitas e recebimentos.
              Sem relatórios financeiros ou gestão de usuários. Para emitir
              receitas, também precisa da habilitação veterinária e do cadastro
              profissional.
            </p>
          </div>
          <div>
            <h3>Assistente</h3>
            <p>
              Agenda, cadastros e recebimentos. Sem conteúdo clínico, relatórios
              financeiros ou gestão de usuários. Para emitir receitas, também
              precisa da habilitação veterinária e do cadastro profissional.
            </p>
          </div>
        </div>
      </section>
      <section className="panel table-scroll">
        <h2>Atividade recente</h2>
        <p className="hint">Últimas 50 ações registradas nesta clínica.</p>
        <table>
          <thead>
            <tr>
              <th>Quando</th>
              <th>Responsável</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            {[
              ...(data?.audit || []).map((a) => ({
                ...a,
                id: `audit-${a.id}`,
              })),
              ...(data?.security || []).map((a) => ({
                ...a,
                id: `security-${a.id}`,
              })),
            ]
              .sort(
                (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
              )
              .slice(0, 50)
              .map((a) => (
                <tr key={a.id}>
                  <td>{date(a.created_at)}</td>
                  <td>
                    {a.actor === "local-developer"
                      ? "Desenvolvimento local"
                      : a.actor === "system"
                        ? "Sistema / registro anterior"
                        : a.actor}
                  </td>
                  <td>{a.action}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
function MemberRow({
  member: m,
  busy,
  act,
}: {
  member: Member;
  busy: boolean;
  act: (c: unknown) => Promise<boolean>;
}) {
  const [veterinarian, setVeterinarian] = useState(m.is_veterinarian);
  const [role, setRole] = useState(m.role),
    [status, setStatus] = useState(m.status);
  return (
    <div className="iam-member">
      <div>
        <strong>{m.name}</strong>
        <p className="muted">{m.email}</p>
      </div>
      <label>
        Perfil de {m.name}
        <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {roles.map((r) => (
            <option key={r} value={r}>
              {roleLabels[r]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Status de {m.name}
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as Member["status"])}
        >
          <option value="active">Ativo</option>
          <option value="suspended">Suspenso</option>
        </select>
      </label>
      {role === "admin" && (
        <label className="check-row">
          <input
            type="checkbox"
            checked={veterinarian}
            disabled={busy}
            onChange={(e) => setVeterinarian(e.target.checked)}
          />
          Também atua como veterinário
        </label>
      )}
      <button
        disabled={
          busy ||
          (role === m.role &&
            status === m.status &&
            veterinarian === m.is_veterinarian)
        }
        onClick={() =>
          act({
            type: "membership",
            id: m.id,
            revision: m.revision,
            isVeterinarian: veterinarian,
            role,
            status,
          })
        }
      >
        Salvar acesso
      </button>
      <button
        disabled={busy}
        onClick={() => {
          if (
            confirm(
              "Exigir novo login desta pessoa para acessar esta clínica? O acesso às outras clínicas será preservado.",
            )
          )
            void act({ type: "revokeUserSessions", id: m.id });
        }}
      >
        Revogar sessões nesta clínica
      </button>
    </div>
  );
}
export function MyAccount({ identity }: { identity: Identity }) {
  const [security, setSecurity] = useState<
    { id: string; action: string; created_at: string }[]
  >([]);
  const [sessions, setSessions] = useState<Session[]>([]),
    [error, setError] = useState("");
  const refresh = useCallback(async () => {
    const r = await fetch("/api/sessions"),
      d = await r.json();
    if (!r.ok) throw Error(d.error);
    setSessions(d);
    const response = await fetch("/api/security-events", { cache: "no-store" });
    if (response.ok) setSecurity(await response.json());
  }, []);
  useEffect(() => {
    // refresh updates state only after the network response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh().catch((e) => setError(e.message));
  }, [refresh]);
  return (
    <div className="stack">
      <section className="panel">
        <h2>{identity.name}</h2>
        <p>{identity.email}</p>
        <p>Perfil: {roleLabels[identity.role]}</p>
        {identity.local ? (
          <p className="notice">
            Sessão de desenvolvimento local, sem identidade Google.
          </p>
        ) : (
          <div className="row wrap">
            <a className="button-link" href="/access">
              Minhas clínicas e convites
            </a>
            <button
              onClick={async () => {
                await authClient.signOut();
                // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Full reload discards data and route caches after identity changes.
                window.location.assign("/login");
              }}
            >
              Sair
            </button>
          </div>
        )}
      </section>
      <section className="panel">
        <h2>Minhas sessões</h2>
        <p className="hint">
          Sessões comuns: até 12 horas, com 2 horas de inatividade. Dispositivos
          compartilhados: até 4 horas, com 30 minutos de inatividade. A
          inatividade considera requisições ao servidor.
        </p>
        {error && <p role="alert">{error}</p>}
        {sessions.map((s) => (
          <div className="iam-access" key={s.id}>
            <strong>
              {s.current ? "Este dispositivo" : "Outro dispositivo"}
            </strong>
            <p className="muted iam-agent">
              {s.userAgent || "Navegador não informado"}
            </p>
            <p className="hint">
              Iniciada em {date(s.createdAt)} · expira em {date(s.expiresAt)}
            </p>
            {!s.current && (
              <button
                onClick={async () => {
                  try {
                    const r = await fetch("/api/sessions", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ id: s.id }),
                    });
                    if (!r.ok)
                      throw Error("Não foi possível encerrar a sessão.");
                    await refresh();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Falha.");
                  }
                }}
              >
                Encerrar sessão
              </button>
            )}
          </div>
        ))}
        <h3>Atividade de segurança da minha conta</h3>
        <ul>
          {security.map((event) => (
            <li key={event.id}>
              {date(event.created_at)} · {event.action}
            </li>
          ))}
        </ul>
        {!sessions.length && (
          <p className="muted">Nenhuma sessão Google ativa neste ambiente.</p>
        )}
      </section>
    </div>
  );
}
