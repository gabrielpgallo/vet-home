"use client";
import { Fragment, useEffect, useState } from "react";
import {
  auditEntities,
  auditOperations,
  auditFields,
  auditValue,
  type AuditEntry,
} from "@/lib/audit";
import type { Identity } from "@/lib/permissions";
const date = (v: string) =>
  new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
const actor = (v: string) =>
  v === "system"
    ? "Sistema"
    : v === "local-developer"
      ? "Desenvolvimento local"
      : v;
export function AuditLog({ identity }: { identity: Identity }) {
  const [query, setQuery] = useState("");
  const [revision, setRevision] = useState(0);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/audit?" + query, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "x-vet-user": identity.userId,
        "x-vet-clinic": identity.orgId,
      },
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw Error(data.error);
        return data;
      })
      .then((data) => {
        setEntries(data.entries);
        setNext(data.nextCursor);
        setBusy(false);
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(e.message);
          setBusy(false);
        }
      });
    return () => controller.abort();
  }, [query, revision, identity.orgId, identity.userId]);
  function load(value: string) {
    setBusy(true);
    setError("");
    setEntries([]);
    setNext(null);
    setQuery(value);
    setRevision((v) => v + 1);
  }
  return (
    <div className="stack">
      <p className="hint">
        Histórico somente para leitura, disponível a partir da ativação da
        auditoria. Datas e horários de Brasília. Alterações anteriores não
        possuem comparação de valores.
      </p>
      <form
        className="panel audit-filters"
        onSubmit={(e) => {
          e.preventDefault();
          const params = new URLSearchParams();
          new FormData(e.currentTarget).forEach((v, k) => {
            if (String(v).trim()) params.set(k, String(v));
          });
          load(params.toString());
        }}
      >
        <label>
          De
          <input type="date" name="from" />
        </label>
        <label>
          Até
          <input type="date" name="to" />
        </label>
        <label>
          Cadastro / registro
          <select name="entity">
            <option value="">Todos</option>
            {Object.entries(auditEntities).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          Operação
          <select name="operation">
            <option value="">Todas</option>
            {Object.entries(auditOperations).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          Responsável
          <input
            name="actor"
            placeholder="E-mail de quem alterou"
            maxLength={150}
          />
        </label>
        <button className="primary" disabled={busy}>
          Filtrar / atualizar
        </button>
      </form>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      <section className="panel table-scroll" aria-busy={busy}>
        <table>
          <thead>
            <tr>
              <th>Quando</th>
              <th>Responsável</th>
              <th>Registro</th>
              <th>Operação</th>
              <th>Alterações</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <AuditRow key={entry.id} entry={entry} identity={identity} />
            ))}
          </tbody>
        </table>
        {busy && <p role="status">Carregando histórico…</p>}
        {!busy && !error && !entries.length && (
          <p className="muted">
            Nenhuma alteração encontrada neste período e filtros.
          </p>
        )}
      </section>
      <div className="row wrap">
        {new URLSearchParams(query).has("cursor") && (
          <button
            disabled={busy}
            onClick={() => {
              const p = new URLSearchParams(query);
              p.delete("cursor");
              load(p.toString());
            }}
          >
            Voltar às mais recentes
          </button>
        )}
        {next && (
          <button
            disabled={busy}
            onClick={() => {
              const p = new URLSearchParams(query);
              p.set("cursor", next);
              load(p.toString());
            }}
          >
            Ver mais antigas
          </button>
        )}
      </div>
    </div>
  );
}
function AuditRow({
  entry,
  identity,
}: {
  entry: AuditEntry;
  identity: Identity;
}) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<AuditEntry | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (detail) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/audit?id=" + entry.id, {
        cache: "no-store",
        headers: {
          "x-vet-user": identity.userId,
          "x-vet-clinic": identity.orgId,
        },
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setDetail(d);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível abrir o registro.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Fragment>
      <tr>
        <td>{date(entry.created_at)}</td>
        <td>{actor(entry.actor)}</td>
        <td>
          <strong>{auditEntities[entry.entity_type]}</strong>
          <div>{entry.label}</div>
          <small className="muted">{entry.entity_id}</small>
        </td>
        <td>{auditOperations[entry.operation]}</td>
        <td>
          <button
            disabled={busy}
            aria-expanded={open}
            aria-controls={"audit-" + entry.id}
            onClick={toggle}
          >
            {open ? "Fechar detalhes" : "Ver detalhes"}
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={5}>
            <div id={"audit-" + entry.id} className="audit-detail">
              {busy && <p role="status">Carregando detalhes…</p>}
              {error && <p role="alert">{error}</p>}
              {detail && (
                <table>
                  <caption>
                    Campos{" "}
                    {entry.operation === "INSERT"
                      ? "cadastrados"
                      : entry.operation === "DELETE"
                        ? "excluídos"
                        : "alterados"}
                  </caption>
                  <thead>
                    <tr>
                      <th>Campo</th>
                      <th>Antes</th>
                      <th>Depois</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.changed_fields.map((field) => (
                      <tr key={field}>
                        <th scope="row">{auditFields[field] || field}</th>
                        <td>
                          <pre>
                            {auditValue(field, detail.before_data?.[field])}
                          </pre>
                        </td>
                        <td>
                          <pre>
                            {auditValue(field, detail.after_data?.[field])}
                          </pre>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}
