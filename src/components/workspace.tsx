"use client";
import { ReauthenticateLink } from "./reauthenticate";
import { Iam, MyAccount } from "./iam";
import { can, type Permission } from "@/lib/permissions";
import Image from "next/image";
import { Settings } from "./settings";
import { AnamnesisAI } from "./anamnesis-ai";
import { defaultSettings } from "@/lib/settings";
import { brandThemeStyle } from "@/lib/brand-color";
import { Finance } from "./finance";
import { Agenda } from "./agenda";
import type { CalendarView } from "@/lib/calendar";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTheme } from "next-themes";
import {
  CalendarDays,
  PawPrint,
  Users,
  Package,
  ClipboardList,
  Plus,
  ArrowLeft,
  MapPin,
  Clock,
  ChevronRight,
  X,
  Stethoscope,
  SunMoon,
  Search,
  Settings2,
  Wallet,
} from "lucide-react";
import {
  dateKey,
  dateLabel,
  timeLabel,
  money,
  vitalFields,
  historicalVitalFields,
  type Command,
} from "@/lib/domain";
import type { Bootstrap, Consultation, TimelineEvent } from "@/lib/types";
import {
  ApplicationForm,
  AsyncForm,
  ExamForm,
  PatientForm,
  PaymentForm,
  PrescriptionEditor,
  ProductForm,
  ScheduleForm,
  TutorForm,
  type Mutate,
} from "./forms";

type Page =
  | "agenda"
  | "patients"
  | "tutors"
  | "products"
  | "pending"
  | "visit"
  | "patient"
  | "consultation"
  | "prescription"
  | "settings"
  | "finance"
  | "iam"
  | "account";
type Modal = {
  kind:
    | "tutor"
    | "patient"
    | "product"
    | "schedule"
    | "application"
    | "payment"
    | "exam"
    | "note";
  id?: string;
  patientId?: string;
  consultationId?: string;
  requestId?: string;
  thenSchedule?: boolean;
};
const nav = [
  ["agenda", "Agenda", CalendarDays],
  ["patients", "Pacientes", PawPrint],
  ["tutors", "Tutores", Users],
  ["products", "Produtos", Package],
  ["pending", "Pendências", ClipboardList],
  ["finance", "Financeiro", Wallet],
  ["settings", "Configurações", Settings2],
  ["iam", "Usuários e acessos", Users],
] as const;
const statusLabel = {
  scheduled: "Agendada",
  completed: "Concluída",
  cancelled: "Cancelada",
  draft: "Em atendimento",
};
export default function Workspace() {
  const [data, setData] = useState<Bootstrap | null>(null),
    [failure, setFailure] = useState(""),
    [page, setPage] = useState<Page>("agenda"),
    [selected, setSelected] = useState(""),
    [modal, setModal] = useState<Modal | null>(null),
    [day, setDay] = useState(dateKey()),
    [agendaView, setAgendaView] = useState<CalendarView>("day"),
    [query, setQuery] = useState(""),
    [toast, setToast] = useState("");
  const allowed = (permission: Permission) =>
    !!data?.identity && can(data.identity.role, permission);
  const clinical = allowed("clinical.read");
  const brand = data?.settings || defaultSettings;
  useEffect(() => {
    document.title = brand.companyName;
  }, [brand.companyName]);
  const { theme, setTheme } = useTheme();
  const pending = useRef(new Map<string, string>()),
    guardRef = useRef<null | (() => boolean)>(null);
  const refresh = useCallback(async () => {
    const r = await fetch("/api/data", { cache: "no-store" });
    const body = await r.json();
    // Preserve open drafts when authentication expires; reconnect in a separate tab.
    if (!r.ok) throw Error(body.error || "Não foi possível carregar os dados.");
    setData(body);
    setFailure("");
    return body as Bootstrap;
  }, []);
  // The state updates in refresh occur after the network response.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh().catch((e) => setFailure(e.message));
  }, [refresh]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  const mutate: Mutate = async (command: Command) => {
    const key = JSON.stringify(command),
      id = pending.current.get(key) || crypto.randomUUID();
    pending.current.set(key, id);
    const r = await fetch("/api/commands", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(data?.identity
          ? {
              "x-vet-user": data.identity.userId,
              "x-vet-clinic": data.identity.orgId,
            }
          : {}),
      },
      body: JSON.stringify({ id, command }),
    });
    const result = await r.json();
    if (!r.ok) {
      pending.current.delete(key);
      throw Error(result.error || "Não foi possível salvar.");
    }
    const fresh = await refresh();
    pending.current.delete(key);
    setToast("Salvo com sucesso");
    return { ...result, data: fresh };
  };
  function go(next: Page, id = "") {
    if (["consultation", "prescription"].includes(next) && !clinical) return;
    if (guardRef.current && !guardRef.current()) return;
    guardRef.current = null;
    setPage(next);
    setSelected(id);
    setQuery("");
    window.scrollTo(0, 0);
  }
  async function start(visitId: string, patientId: string) {
    try {
      const r = await mutate({
        type: "consultation.start",
        visitId,
        patientId,
      });
      go("consultation", r.id);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Falha ao abrir atendimento.");
    }
  }
  const close = () => setModal(null);
  const patient = data?.patients.find((p) => p.id === selected),
    visit = data?.visits.find((v) => v.id === selected),
    consult = data?.consultations.find((c) => c.id === selected);
  const filtered = (text: string) =>
    text.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR"));
  const tutorName = (id: string) =>
    data?.tutors.find((t) => t.id === id)?.name || "";
  function heading(title: string, subtitle: string, action?: ReactNode) {
    return (
      <div className="page-heading">
        <div>
          <div className="eyebrow">{brand.companyName}</div>
          <h1>{title}</h1>
          <p className="muted">{subtitle}</p>
        </div>
        {action}
      </div>
    );
  }
  const search = (
    <label className="search-bar">
      <Search size={18} />
      <input
        aria-label="Buscar registros"
        placeholder="Buscar por nome…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
    </label>
  );
  const add = (label: string, onClick: () => void) => (
    <button className="primary" onClick={onClick}>
      <Plus size={18} />
      {label}
    </button>
  );
  return (
    <div
      className="app-shell clinic-theme"
      style={brandThemeStyle(brand.primaryColor)}
    >
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            go("agenda");
          }}
        >
          {brand.hasLogo ? (
            <Image
              className="brand-logo"
              src={`/api/settings/logo?v=${brand.revision}`}
              alt={`Logo de ${brand.companyName}`}
              width={48}
              height={48}
              unoptimized
            />
          ) : (
            <span className="brand-icon">
              <PawPrint size={25} />
            </span>
          )}
          <span className="brand-name">{brand.companyName}</span>
        </a>
        <div className="nav-caption">SEU CONSULTÓRIO, ONDE ESTIVER</div>
        <nav aria-label="Menu principal">
          {nav
            .filter(([key]) =>
              key === "finance"
                ? allowed("finance.read")
                : key === "settings"
                  ? allowed("settings.write")
                  : key === "iam"
                    ? allowed("iam.manage")
                    : key === "products"
                      ? allowed("products.write")
                      : key === "pending"
                        ? clinical
                        : true,
            )
            .map(([key, label, Icon]) => (
              <button
                key={key}
                className={
                  page === key ||
                  (key === "patients" &&
                    ["patient", "consultation", "prescription"].includes(
                      page,
                    )) ||
                  (key === "agenda" && page === "visit")
                    ? "nav-item active"
                    : "nav-item"
                }
                onClick={() => go(key)}
              >
                <Icon size={20} />
                <span>{label}</span>
              </button>
            ))}
        </nav>
        <div className="sidebar-footer">
          <button onClick={() => go("account")}>Minha conta</button>
          <label className="theme-control">
            <SunMoon size={18} />
            <select
              aria-label="Tema"
              value={theme || "system"}
              onChange={(e) => setTheme(e.target.value)}
            >
              <option value="system">Tema do sistema</option>
              <option value="light">Tema claro</option>
              <option value="dark">Tema escuro</option>
            </select>
          </label>
          <span className="local-label">
            <i />{" "}
            {data?.identity?.local
              ? "Desenvolvimento local"
              : "Acesso autenticado"}
          </span>
        </div>
      </aside>
      <main className="main-content">
        {!data ? (
          <div className="panel empty">
            <Stethoscope size={32} />
            <h1>
              {failure ? "Não foi possível abrir" : "Abrindo seu consultório…"}
            </h1>
            {failure && (
              <>
                <p>{failure}</p>
                <a href="/login">Entrar novamente</a>
                <button
                  onClick={() => refresh().catch((e) => setFailure(e.message))}
                >
                  Tentar novamente
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            {data.identity && !data.identity.local && (
              <details className="session-help">
                <summary>Problemas com sua sessão?</summary>
                <ReauthenticateLink userId={data.identity.userId} />
                <a href="/access" target="_blank" rel="noopener noreferrer">
                  Ver clínicas e convites em outra aba
                </a>
              </details>
            )}
            {page === "agenda" && (
              <>
                {heading(
                  "Sua agenda",
                  "Visitas domiciliares, com tempo para cada paciente.",
                  add("Agendar visita", () => setModal({ kind: "schedule" })),
                )}
                <Agenda
                  data={data}
                  day={day}
                  view={agendaView}
                  onDay={setDay}
                  onView={setAgendaView}
                  onVisit={(id) => go("visit", id)}
                />
              </>
            )}
            {page === "visit" && visit && (
              <>
                <Back onClick={() => go("agenda")} />
                {heading(
                  tutorName(visit.tutorId),
                  `${dateLabel(visit.startsAt)} às ${timeLabel(visit.startsAt)} · ${visit.durationMinutes} minutos`,
                )}
                <div className="detail-grid">
                  <section className="stack">
                    <div className="panel">
                      <div className="row between">
                        <h2>Esta visita</h2>
                        <span className="badge">
                          {statusLabel[visit.status]}
                        </span>
                      </div>
                      <p className="icon-line">
                        <MapPin size={18} />
                        {visit.address}
                      </p>
                      <p className="hint">
                        Consulta e deslocamento incluídos no valor base da
                        visita.
                      </p>
                    </div>
                    <div className="panel">
                      <h2>Atendimentos por paciente</h2>
                      {data.visitPatients
                        .filter((x) => x.visitId === visit.id)
                        .map((vp) => {
                          const p = data.patients.find(
                            (p) => p.id === vp.patientId,
                          )!;
                          const c = data.consultations.find(
                            (c) =>
                              c.visitId === visit.id && c.patientId === p.id,
                          );
                          return (
                            <div className="record-row" key={p.id}>
                              <div>
                                <button
                                  className="text-link"
                                  onClick={() => go("patient", p.id)}
                                >
                                  {p.name}
                                </button>
                                <p>
                                  {vp.reason || "Consulta domiciliar"} ·{" "}
                                  {p.species}
                                </p>
                                {c && (
                                  <span className="badge">
                                    {statusLabel[c.status]}
                                  </span>
                                )}
                              </div>
                              <button
                                disabled={
                                  visit.status === "cancelled" || !clinical
                                }
                                onClick={() =>
                                  c
                                    ? go("consultation", c.id)
                                    : start(visit.id, p.id)
                                }
                              >
                                {c
                                  ? "Abrir atendimento"
                                  : "Iniciar atendimento"}
                                <ChevronRight size={16} />
                              </button>
                            </div>
                          );
                        })}
                    </div>
                  </section>
                  <section className="panel bill">
                    <h2>Cobrança da visita</h2>
                    <div className="bill-line">
                      <span>Consulta e deslocamento</span>
                      <strong>{money(visit.baseCents)}</strong>
                    </div>
                    {data.applications
                      .filter((a) =>
                        data.consultations.some(
                          (c) =>
                            c.id === a.consultationId && c.visitId === visit.id,
                        ),
                      )
                      .map((a) => (
                        <div className="bill-line" key={a.id}>
                          <span>
                            {a.productName}
                            <small>
                              {a.quantityMilli / 1000} {a.unit} ·{" "}
                              {
                                data.patients.find(
                                  (p) =>
                                    p.id ===
                                    data.consultations.find(
                                      (c) => c.id === a.consultationId,
                                    )?.patientId,
                                )?.name
                              }
                            </small>
                          </span>
                          <span>{money(a.totalCents)}</span>
                        </div>
                      ))}
                    <div className="bill-line total">
                      <span>Total</span>
                      <strong>{money(visit.totalCents)}</strong>
                    </div>
                    <div className="bill-line">
                      <span>Recebido</span>
                      <span>{money(visit.receivedCents)}</span>
                    </div>
                    <div className="bill-line">
                      <span>Em aberto</span>
                      <strong>
                        {money(visit.totalCents - visit.receivedCents)}
                      </strong>
                    </div>
                    {data.payments
                      .filter((p) => p.visitId === visit.id)
                      .map((p) => (
                        <p className="hint" key={p.id}>
                          {dateLabel(p.createdAt)} · {p.method} ·{" "}
                          {money(p.amountCents)}
                        </p>
                      ))}
                    <button
                      className="primary full"
                      disabled={
                        visit.status === "cancelled" ||
                        visit.totalCents <= visit.receivedCents
                      }
                      onClick={() =>
                        setModal({ kind: "payment", id: visit.id })
                      }
                    >
                      Registrar recebimento
                    </button>
                    {visit.status === "scheduled" &&
                      !data.consultations.some(
                        (c) => c.visitId === visit.id,
                      ) && (
                        <button
                          className="link-button full"
                          onClick={async () => {
                            if (confirm("Cancelar esta visita?"))
                              try {
                                await mutate({
                                  type: "visit.cancel",
                                  id: visit.id,
                                });
                              } catch (e) {
                                setToast((e as Error).message);
                              }
                          }}
                        >
                          Cancelar visita
                        </button>
                      )}
                  </section>
                </div>
              </>
            )}
            {page === "patients" && (
              <>
                {heading(
                  "Pacientes",
                  "Cada animal tem seu próprio histórico.",
                  add("Novo paciente", () => setModal({ kind: "patient" })),
                )}
                {search}
                <div className="card-grid">
                  {data.patients
                    .filter((p) =>
                      filtered(p.name + " " + tutorName(p.tutorId)),
                    )
                    .map((p) => (
                      <button
                        className="patient-card panel"
                        key={p.id}
                        onClick={() => go("patient", p.id)}
                      >
                        <span className="avatar">
                          <PawPrint />
                        </span>
                        <h2>{p.name}</h2>
                        <p>
                          {p.species}
                          {p.breed && ` · ${p.breed}`}
                        </p>
                        <span className="muted">{tutorName(p.tutorId)}</span>
                        <span className="card-link">
                          Ver histórico <ChevronRight size={16} />
                        </span>
                      </button>
                    ))}
                </div>
              </>
            )}
            {page === "patient" && patient && (
              <>
                <Back onClick={() => go("patients")} />
                {heading(
                  patient.name,
                  `${patient.species} · ${patient.breed || "Raça não informada"} · ${tutorName(patient.tutorId)}`,
                  <button
                    onClick={() =>
                      setModal({ kind: "patient", id: patient.id })
                    }
                  >
                    Editar cadastro
                  </button>,
                )}
                {patient.notes && <div className="notice">{patient.notes}</div>}
                <div className="detail-grid">
                  <section className="panel">
                    <div className="section-heading">
                      <h2>
                        {clinical
                          ? "Timeline do paciente"
                          : "Histórico clínico restrito"}
                      </h2>
                      <div className="row wrap" hidden={!clinical}>
                        <button
                          onClick={() =>
                            setModal({ kind: "exam", patientId: patient.id })
                          }
                        >
                          + Exame
                        </button>
                        <button
                          onClick={() =>
                            setModal({ kind: "note", patientId: patient.id })
                          }
                        >
                          + Nota
                        </button>
                      </div>
                    </div>
                    <Timeline
                      data={data}
                      patientId={patient.id}
                      openConsult={(id) => go("consultation", id)}
                      openExam={(id) =>
                        setModal({
                          kind: "exam",
                          patientId: patient.id,
                          requestId: id,
                        })
                      }
                    />
                  </section>
                  <div className="stack">
                    <section className="panel">
                      <h2>Últimas medições</h2>
                      <Measurements
                        consultation={
                          data.consultations
                            .filter(
                              (c) =>
                                c.patientId === patient.id &&
                                Object.values(c.vitals).some(Boolean),
                            )
                            .sort((a, b) =>
                              b.updatedAt.localeCompare(a.updatedAt),
                            )[0]
                        }
                      />
                    </section>
                    <section className="panel">
                      <h2>Próximas visitas</h2>
                      {data.visits
                        .filter(
                          (v) =>
                            v.status === "scheduled" &&
                            data.visitPatients.some(
                              (vp) =>
                                vp.visitId === v.id &&
                                vp.patientId === patient.id,
                            ),
                        )
                        .map((v) => (
                          <button
                            className="record-link"
                            key={v.id}
                            onClick={() => go("visit", v.id)}
                          >
                            {dateLabel(v.startsAt)} · {timeLabel(v.startsAt)}
                            <ChevronRight size={16} />
                          </button>
                        ))}
                      <button
                        className="full"
                        onClick={() =>
                          setModal({ kind: "schedule", id: patient.tutorId })
                        }
                      >
                        Agendar visita
                      </button>
                    </section>
                  </div>
                </div>
              </>
            )}
            {page === "consultation" && consult && clinical && (
              <Encounter
                key={consult.id}
                consultation={consult}
                data={data}
                mutate={mutate}
                guardRef={guardRef}
                back={() => go("visit", consult.visitId)}
                onAction={(kind) =>
                  setModal({
                    kind,
                    patientId: consult.patientId,
                    consultationId: consult.id,
                    id: consult.id,
                  })
                }
                prescription={() => go("prescription", consult.id)}
                openConsult={(id) => go("consultation", id)}
              />
            )}
            {page === "prescription" && consult && (
              <PrescriptionEditor
                patient={data.patients.find((p) => p.id === consult.patientId)!}
                consultation={consult}
                data={data}
                mutate={mutate}
                onDone={() => go("consultation", consult.id)}
                onBack={() => {
                  if (
                    confirm(
                      "Voltar ao atendimento? Os itens desta receita ainda não salva serão descartados.",
                    )
                  )
                    go("consultation", consult.id);
                }}
              />
            )}
            {page === "tutors" && (
              <>
                {heading(
                  "Tutores",
                  "Um cadastro, todos os animais da família.",
                  add("Novo tutor", () => setModal({ kind: "tutor" })),
                )}
                {search}
                <div className="panel">
                  {data.tutors
                    .filter((t) => filtered(t.name + " " + t.phone))
                    .map((t) => (
                      <div className="record-row" key={t.id}>
                        <div>
                          <h3>{t.name}</h3>
                          <p>{t.phone || "Telefone não informado"}</p>
                          <span className="muted">{t.address}</span>
                          <div className="row wrap">
                            {data.patients
                              .filter((p) => p.tutorId === t.id)
                              .map((p) => (
                                <button
                                  className="text-link"
                                  key={p.id}
                                  onClick={() => go("patient", p.id)}
                                >
                                  {p.name}
                                </button>
                              ))}
                          </div>
                        </div>
                        <div className="row wrap">
                          <button
                            onClick={() =>
                              setModal({ kind: "tutor", id: t.id })
                            }
                          >
                            Editar
                          </button>
                          <button
                            onClick={() =>
                              setModal({ kind: "schedule", id: t.id })
                            }
                          >
                            Agendar
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </>
            )}
            {page === "products" && (
              <>
                {heading(
                  "Produtos",
                  "Valores por unidade para calcular cada aplicação.",
                  add("Cadastrar produto", () => setModal({ kind: "product" })),
                )}
                {search}
                <div className="panel table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Produto</th>
                        <th>Unidade</th>
                        <th>Custo</th>
                        <th>Venda</th>
                        <th>
                          <span className="sr-only">Ações</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.products
                        .filter((p) => filtered(p.name))
                        .map((p) => (
                          <tr key={p.id}>
                            <td>
                              <strong>{p.name}</strong>
                            </td>
                            <td>{p.unit}</td>
                            <td>{money(p.costCents)}</td>
                            <td>{money(p.saleCents)}</td>
                            <td>
                              <button
                                onClick={() =>
                                  setModal({ kind: "product", id: p.id })
                                }
                              >
                                Editar
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <p className="hint">
                  Este catálogo calcula aplicações. Controle de estoque e lotes
                  em estoque virão em outra etapa.
                </p>
              </>
            )}
            {page === "iam" && data.identity && allowed("iam.manage") && (
              <>
                {heading(
                  "Usuários e acessos",
                  "Gerencie quem pode acessar esta clínica.",
                )}
                <Iam identity={data.identity} />
              </>
            )}
            {page === "account" && data.identity && (
              <>
                {heading(
                  "Minha conta",
                  "Gerencie seu acesso e seus dispositivos.",
                )}
                <MyAccount identity={data.identity} />
              </>
            )}
            {page === "finance" && allowed("finance.read") && (
              <>
                {heading(
                  "Financeiro",
                  "Acompanhe receitas, custos e despesas do seu atendimento.",
                )}
                <Finance
                  data={data}
                  mutate={mutate}
                  openVisit={(id) => go("visit", id)}
                />
              </>
            )}
            {page === "settings" && allowed("settings.write") && (
              <>
                {heading(
                  "Configurações",
                  "Identidade da empresa e dados da veterinária.",
                )}
                <Settings
                  key={brand.revision}
                  identity={data.identity!}
                  settings={brand}
                  guardRef={guardRef}
                  onSaved={async () => {
                    await refresh();
                    setToast("Configurações salvas");
                  }}
                />
              </>
            )}
            {page === "pending" && (
              <>
                {heading("Pendências", "Retome o que precisa da sua atenção.")}
                <div className="stack">
                  <section className="panel">
                    <h2>Atendimentos em andamento</h2>
                    {data.consultations
                      .filter((c) => c.status === "draft")
                      .map((c) => (
                        <button
                          className="record-link"
                          key={c.id}
                          onClick={() => go("consultation", c.id)}
                        >
                          <span>
                            {
                              data.patients.find((p) => p.id === c.patientId)
                                ?.name
                            }{" "}
                            · {dateLabel(c.createdAt)}
                          </span>
                          <ChevronRight size={18} />
                        </button>
                      ))}
                    {!data.consultations.some((c) => c.status === "draft") && (
                      <Empty text="Nenhum atendimento em andamento." />
                    )}
                  </section>
                  <section className="panel">
                    <h2>Exames aguardando resultado</h2>
                    {data.exams
                      .filter(
                        (e) =>
                          e.kind === "order" &&
                          !data.exams.some((r) => r.requestId === e.id),
                      )
                      .map((e) => (
                        <div className="record-row" key={e.id}>
                          <div>
                            <h3>{e.name}</h3>
                            <p>
                              {
                                data.patients.find((p) => p.id === e.patientId)
                                  ?.name
                              }{" "}
                              · {dateLabel(e.occurredOn)}
                            </p>
                          </div>
                          <div className="row wrap">
                            <a
                              className="button-link"
                              href={`/api/exams/${e.id}/pdf`}
                            >
                              Baixar solicitação PDF
                            </a>
                            <button
                              onClick={() =>
                                setModal({
                                  kind: "exam",
                                  patientId: e.patientId,
                                  requestId: e.id,
                                })
                              }
                            >
                              Anexar resultado
                            </button>
                          </div>
                        </div>
                      ))}
                  </section>
                  <section className="panel">
                    <h2>Valores a receber</h2>
                    {data.visits
                      .filter(
                        (v) =>
                          v.status !== "cancelled" &&
                          v.totalCents > v.receivedCents,
                      )
                      .map((v) => (
                        <button
                          className="record-link"
                          key={v.id}
                          onClick={() => go("visit", v.id)}
                        >
                          <span>
                            {tutorName(v.tutorId)}
                            <small>
                              {dateLabel(v.startsAt)}
                              {v.status === "scheduled"
                                ? " · visita agendada"
                                : ""}
                            </small>
                          </span>
                          <strong>
                            {money(v.totalCents - v.receivedCents)}
                          </strong>
                        </button>
                      ))}
                  </section>
                </div>
              </>
            )}
          </>
        )}
        <footer className="page-footer">
          {brand.companyName} · Primeira versão local · Os cadastros iniciais
          marcados como exemplo são fictícios.
        </footer>
      </main>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
      {data && modal && (
        <Dialog
          title={
            {
              tutor: modal.id ? "Editar tutor" : "Novo tutor",
              patient: modal.id ? "Editar paciente" : "Novo paciente",
              product: modal.id ? "Editar produto" : "Novo produto",
              schedule: "Agendar visita",
              application: "Registrar aplicação",
              payment: "Registrar recebimento",
              exam: "Exames",
              note: "Nota de acompanhamento",
            }[modal.kind]
          }
          onClose={close}
        >
          {modal.kind === "tutor" && (
            <TutorForm
              tutor={data.tutors.find((t) => t.id === modal.id)}
              mutate={mutate}
              onDone={(id) =>
                modal.thenSchedule
                  ? setModal({ kind: "schedule", id })
                  : close()
              }
            />
          )}
          {modal.kind === "patient" && (
            <PatientForm
              patient={data.patients.find((p) => p.id === modal.id)}
              data={data}
              mutate={mutate}
              onDone={close}
            />
          )}
          {modal.kind === "product" && (
            <ProductForm
              product={data.products.find((p) => p.id === modal.id)}
              mutate={mutate}
              onDone={close}
            />
          )}
          {modal.kind === "schedule" && (
            <ScheduleForm
              key={modal.id || "new"}
              data={data}
              day={day}
              tutorId={modal.id}
              mutate={mutate}
              onDone={(id) => {
                close();
                go("visit", id);
              }}
              onNewTutor={() => setModal({ kind: "tutor", thenSchedule: true })}
            />
          )}
          {modal.kind === "application" && (
            <ApplicationForm
              consultation={
                data.consultations.find((c) => c.id === modal.consultationId)!
              }
              data={data}
              mutate={mutate}
              onDone={close}
            />
          )}
          {modal.kind === "payment" && (
            <PaymentForm
              visit={data.visits.find((v) => v.id === modal.id)!}
              mutate={mutate}
              onDone={close}
            />
          )}
          {modal.kind === "exam" && (
            <ExamForm
              patientId={modal.patientId!}
              consultationId={modal.consultationId}
              request={data.exams.find((e) => e.id === modal.requestId)}
              data={data}
              mutate={mutate}
              onUploaded={async () => {
                await refresh();
                setToast("Resultado anexado");
              }}
              onDone={close}
            />
          )}
          {modal.kind === "note" && (
            <AsyncForm
              onSubmit={async (d) => {
                await mutate({
                  type: "note.create",
                  patientId: modal.patientId!,
                  consultationId: modal.consultationId || null,
                  text: String(d.get("note")),
                });
                close();
              }}
            >
              <label>
                Registro na timeline
                <textarea name="note" required rows={8} />
              </label>
            </AsyncForm>
          )}
        </Dialog>
      )}
    </div>
  );
}
function Back({ onClick }: { onClick: () => void }) {
  return (
    <button className="link-button back" onClick={onClick}>
      <ArrowLeft size={16} />
      Voltar
    </button>
  );
}
function Empty({ text }: { text: string }) {
  return <p className="empty muted">{text}</p>;
}
function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog ref={ref} onCancel={onClose} aria-labelledby="dialog-title">
      <div className="dialog-head">
        <h2 id="dialog-title">{title}</h2>
        <button aria-label="Fechar" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      <div className="dialog-body">{children}</div>
    </dialog>
  );
}
function Measurements({ consultation: c }: { consultation?: Consultation }) {
  return c ? (
    <>
      <p className="hint">{dateLabel(c.updatedAt)}</p>
      <dl className="measurement-list">
        {historicalVitalFields
          .filter(([k]) => c.vitals[k])
          .map(([k, label, unit]) => (
            <div key={k}>
              <dt>{label}</dt>
              <dd>
                {c.vitals[k]} {unit}
              </dd>
            </div>
          ))}
      </dl>
    </>
  ) : (
    <Empty text="As medições registradas aparecerão aqui." />
  );
}
function Timeline({
  data,
  patientId,
  openConsult,
  openExam,
}: {
  data: Bootstrap;
  patientId: string;
  openConsult: (id: string) => void;
  openExam?: (id: string) => void;
}) {
  const [filter, setFilter] = useState("all");
  const events = data.timeline
    .filter(
      (e) =>
        e.patientId === patientId &&
        (filter === "all" ||
          e.type === filter ||
          (filter === "exams" && e.type.startsWith("exam_"))),
    )
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  return (
    <>
      <div className="timeline-filters">
        <select
          aria-label="Filtrar histórico"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">Todos os eventos</option>
          <option value="consultation">Consultas</option>
          <option value="exams">Exames</option>
          <option value="application">Aplicações</option>
          <option value="prescription">Receitas</option>
          <option value="note">Notas</option>
        </select>
      </div>
      <div className="timeline">
        {events.map((e) => (
          <TimelinePost
            key={e.id}
            event={e}
            data={data}
            openConsult={openConsult}
            openExam={openExam}
          />
        ))}
        {!events.length && (
          <Empty text="Ainda não há eventos neste histórico." />
        )}
      </div>
    </>
  );
}
function TimelinePost({
  event: e,
  data,
  openConsult,
  openExam,
}: {
  event: TimelineEvent;
  data: Bootstrap;
  openConsult: (id: string) => void;
  openExam?: (id: string) => void;
}) {
  const c = data.consultations.find((c) => c.id === e.consultationId),
    exam = data.exams.find((x) => x.id === e.entityId),
    app = data.applications.find((x) => x.id === e.entityId),
    rx = data.prescriptions.find((x) => x.id === e.entityId);
  return (
    <article className="timeline-post">
      <span className="timeline-dot" />
      <div className="row between">
        <span className="event-type">
          {
            {
              consultation: "Consulta",
              application: "Aplicação",
              prescription: "Receita",
              exam_order: "Pedido de exame",
              exam_result: "Resultado",
              note: "Nota",
            }[e.type]
          }
        </span>
        <time>{dateLabel(exam?.occurredOn || e.occurredAt)}</time>
      </div>
      <h3>{e.title}</h3>
      {e.type === "consultation" && c && (
        <>
          <p className="preserve-text">
            {c.notes || "Atendimento iniciado. Registro clínico em elaboração."}
          </p>
          <Measurements consultation={c} />
        </>
      )}
      {e.text && <p className="preserve-text">{e.text}</p>}
      {app && (
        <p>
          {app.quantityMilli / 1000} {app.unit} · {money(app.totalCents)}
          {app.route && ` · ${app.route}`}
          {app.batch && ` · Lote ${app.batch}`}
        </p>
      )}
      {rx && (
        <>
          <p>{rx.items.map((i) => i.name).join(" · ")}</p>
          <a
            className="text-link"
            href={`/api/prescriptions/${rx.id}/pdf`}
            target="_blank"
            rel="noreferrer"
          >
            Baixar PDF · rascunho sem assinatura
          </a>
        </>
      )}
      {exam && (
        <>
          <p className="hint">
            {exam.mode} {exam.partner}
          </p>
          {exam.kind === "order" && (
            <a className="button-link" href={`/api/exams/${exam.id}/pdf`}>
              Baixar solicitação PDF
            </a>
          )}
          {exam.attachmentId && (
            <a
              className="text-link"
              href={`/api/attachments/${exam.attachmentId}`}
              target="_blank"
              rel="noreferrer"
            >
              Baixar resultado PDF
            </a>
          )}
          {exam.kind === "order" &&
            openExam &&
            !data.exams.some((x) => x.requestId === exam.id) && (
              <button onClick={() => openExam(exam.id)}>
                Anexar resultado
              </button>
            )}
          {exam.requestId && (
            <p className="hint">
              Vinculado ao pedido:{" "}
              {data.exams.find((x) => x.id === exam.requestId)?.name}
            </p>
          )}
          {data.examLinks
            .filter(
              (l) =>
                l.examId === exam.id && l.consultationId !== e.consultationId,
            )
            .map((l) => (
              <button
                className="text-link"
                key={l.consultationId}
                onClick={() => openConsult(l.consultationId)}
              >
                Consulta vinculada ·{" "}
                {dateLabel(
                  data.consultations.find((c) => c.id === l.consultationId)!
                    .createdAt,
                )}
              </button>
            ))}
        </>
      )}
      {c && (
        <button className="event-relation" onClick={() => openConsult(c.id)}>
          ↳ Consulta de{" "}
          {dateLabel(data.visits.find((v) => v.id === c.visitId)!.startsAt)} ·{" "}
          {statusLabel[c.status]}
        </button>
      )}
    </article>
  );
}
function Encounter({
  consultation: c,
  data,
  mutate,
  guardRef,
  back,
  onAction,
  prescription,
  openConsult,
}: {
  consultation: Consultation;
  data: Bootstrap;
  mutate: Mutate;
  guardRef: React.MutableRefObject<null | (() => boolean)>;
  back: () => void;
  onAction: (kind: "application" | "exam" | "note") => void;
  prescription: () => void;
  openConsult: (id: string) => void;
}) {
  const [notes, setNotes] = useState(c.notes),
    [vitals, setVitals] = useState(c.vitals),
    [history, setHistory] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [saved, setSaved] = useState(
    JSON.stringify({ notes: c.notes, vitals: c.vitals }),
  );
  const dirty = JSON.stringify({ notes, vitals }) !== saved;
  const patient = data.patients.find((p) => p.id === c.patientId)!;
  useEffect(() => {
    guardRef.current = () =>
      !dirty ||
      confirm(
        "Há alterações não salvas no atendimento. Deseja sair e descartá-las?",
      );
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
  async function save(complete = false) {
    if (
      complete &&
      !confirm(
        "Concluir este atendimento? O registro clínico será preservado; complementos poderão ser adicionados como notas.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await mutate({
        type: "consultation.save",
        id: c.id,
        revision: c.revision,
        notes,
        vitals,
        complete,
      });
      setSaved(JSON.stringify({ notes, vitals }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Back onClick={back} />
      <div className="page-heading">
        <div>
          <div className="eyebrow">Atendimento domiciliar</div>
          <h1>{patient.name}</h1>
          <p className="muted">
            {patient.species} ·{" "}
            {data.tutors.find((t) => t.id === patient.tutorId)?.name} ·{" "}
            {dateLabel(data.visits.find((v) => v.id === c.visitId)!.startsAt)}
          </p>
        </div>
        <button onClick={() => setHistory(!history)}>
          <Clock size={18} />
          {history ? "Fechar histórico" : "Ver histórico"}
        </button>
      </div>
      {patient.notes && <div className="notice">{patient.notes}</div>}
      <div
        className={history ? "encounter-grid with-history" : "encounter-grid"}
      >
        <section className="stack">
          <div className="panel">
            <div className="section-heading">
              <h2>Registro clínico</h2>
              <span className="badge">{statusLabel[c.status]}</span>
            </div>
            <fieldset disabled={busy || c.status === "completed"}>
              <label>
                Anamnese, exame físico e conduta
                <textarea
                  className="clinical-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Escreva livremente ou cole a anamnese que preparou. Registre a queixa, o exame físico, suas hipóteses e a conduta."
                />
              </label>
              <AnamnesisAI
                id={c.id}
                revision={c.revision}
                notes={notes}
                configured={data.settings.hasGeminiKey}
                disabled={busy || c.status === "completed"}
                onApply={setNotes}
              />
              <h3 className="spaced">Medições</h3>
              <div className="vitals-grid">
                {vitalFields.map(([key, label, unit]) => (
                  <label key={key}>
                    {label}
                    <div className="input-unit">
                      <input
                        aria-label={label}
                        inputMode="decimal"
                        value={vitals[key] || ""}
                        onChange={(e) =>
                          setVitals({ ...vitals, [key]: e.target.value })
                        }
                      />
                      <span>{unit}</span>
                    </div>
                  </label>
                ))}
              </div>
            </fieldset>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="save-bar">
              <span className="hint" role="status">
                {busy
                  ? "Salvando…"
                  : dirty
                    ? "Alterações ainda não salvas"
                    : `Salvo · ${timeLabel(c.updatedAt)}`}
              </span>
              {c.status === "draft" && (
                <div className="row wrap">
                  <button disabled={busy} onClick={() => save()}>
                    Salvar atendimento
                  </button>
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => save(true)}
                  >
                    Concluir atendimento
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="panel">
            <h2>Procedimentos e documentos</h2>
            <div className="action-grid">
              <button
                disabled={c.status === "completed"}
                onClick={() => onAction("application")}
              >
                <Package size={21} />
                <strong>Aplicação</strong>
                <span>Produto e quantidade</span>
              </button>
              <button onClick={prescription}>
                <ClipboardList size={21} />
                <strong>Receita</strong>
                <span>Itens e orientações</span>
              </button>
              <button onClick={() => onAction("exam")}>
                <Stethoscope size={21} />
                <strong>Exames</strong>
                <span>Solicitar, anexar ou vincular</span>
              </button>
              <button onClick={() => onAction("note")}>
                <Plus size={21} />
                <strong>Nota</strong>
                <span>Complemento do atendimento</span>
              </button>
            </div>
            {data.applications
              .filter((a) => a.consultationId === c.id)
              .map((a) => (
                <div className="record-row" key={a.id}>
                  <span>
                    {a.productName} · {a.quantityMilli / 1000} {a.unit}
                  </span>
                  <strong>{money(a.totalCents)}</strong>
                </div>
              ))}
            {data.prescriptions
              .filter((p) => p.consultationId === c.id)
              .map((p) => (
                <a
                  className="record-link"
                  key={p.id}
                  href={`/api/prescriptions/${p.id}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span>Receita · {p.items.map((i) => i.name).join(", ")}</span>
                  <span>PDF rascunho ↗</span>
                </a>
              ))}
            {data.exams
              .filter(
                (e) =>
                  e.consultationId === c.id ||
                  data.examLinks.some(
                    (l) => l.examId === e.id && l.consultationId === c.id,
                  ),
              )
              .map((e) => (
                <div className="record-row" key={e.id}>
                  <span>
                    {e.kind === "order" ? "Pedido" : "Resultado"} · {e.name}
                  </span>
                  {e.kind === "order" && (
                    <a className="button-link" href={`/api/exams/${e.id}/pdf`}>
                      Baixar solicitação PDF
                    </a>
                  )}
                  {e.attachmentId ? (
                    <a
                      className="text-link"
                      href={`/api/attachments/${e.attachmentId}`}
                    >
                      Baixar PDF
                    </a>
                  ) : (
                    <span className="badge">
                      {data.exams.some((r) => r.requestId === e.id)
                        ? "Resultado recebido"
                        : "Aguardando resultado"}
                    </span>
                  )}
                </div>
              ))}
          </div>
        </section>
        {history && (
          <aside className="panel history-panel">
            <h2>Histórico de {patient.name}</h2>
            <Timeline
              data={data}
              patientId={patient.id}
              openConsult={openConsult}
            />
          </aside>
        )}
      </div>
    </>
  );
}
