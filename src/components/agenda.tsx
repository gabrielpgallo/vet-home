"use client";
import { MapPin, ChevronRight } from "lucide-react";
import { dateKey, dateLabel, timeLabel, money } from "@/lib/domain";
import { calendarPeriod, shiftPeriod, type CalendarView } from "@/lib/calendar";
import type { Bootstrap, Visit } from "@/lib/types";
const weekdays = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const status = {
  scheduled: "Agendada",
  completed: "Concluída",
  cancelled: "Cancelada",
};
export function Agenda({
  data,
  day,
  view,
  onDay,
  onView,
  onVisit,
}: {
  data: Bootstrap;
  day: string;
  view: CalendarView;
  onDay: (day: string) => void;
  onView: (view: CalendarView) => void;
  onVisit: (id: string) => void;
}) {
  const period = calendarPeriod(day, view),
    today = dateKey();
  const visits = data.visits.filter((v) => {
    const d = dateKey(v.startsAt);
    return d >= period.start && d <= period.end && v.status !== "cancelled";
  });
  const visitsFor = (d: string) =>
    data.visits
      .filter((v) => dateKey(v.startsAt) === d)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const tutor = (v: Visit) =>
    data.tutors.find((t) => t.id === v.tutorId)?.name || "";
  const patients = (v: Visit) =>
    data.visitPatients
      .filter((p) => p.visitId === v.id)
      .map((p) => data.patients.find((a) => a.id === p.patientId)?.name)
      .join(" · ");
  const title =
    view === "month"
      ? new Date(day + "T12:00:00Z").toLocaleDateString("pt-BR", {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        })
      : view === "week"
        ? `${dateLabel(period.start)} — ${dateLabel(period.end)}`
        : dateLabel(day);
  const periodName =
    view === "day" ? "do dia" : view === "week" ? "da semana" : "do mês";
  function openDay(d: string) {
    onDay(d);
    onView("day");
  }
  function event(v: Visit) {
    return (
      <button
        key={v.id}
        className={`calendar-event ${v.status}`}
        onClick={() => onVisit(v.id)}
        title={`${timeLabel(v.startsAt)} · ${tutor(v)} · ${patients(v)} · ${status[v.status]}`}
      >
        <strong>
          {timeLabel(v.startsAt)} <span>{v.durationMinutes} min</span>
        </strong>
        <span>{tutor(v)}</span>
        <small>{patients(v)}</small>
        {v.status !== "scheduled" && <small>{status[v.status]}</small>}
      </button>
    );
  }
  return (
    <>
      <div className="toolbar agenda-toolbar">
        <div className="row">
          <button
            aria-label={
              view === "day"
                ? "Dia anterior"
                : view === "week"
                  ? "Semana anterior"
                  : "Mês anterior"
            }
            onClick={() => onDay(shiftPeriod(day, view, -1))}
          >
            ←
          </button>
          <input
            aria-label="Data da agenda"
            type="date"
            value={day}
            onChange={(e) => {
              if (e.target.value) onDay(e.target.value);
            }}
          />
          <button
            aria-label={
              view === "day"
                ? "Próximo dia"
                : view === "week"
                  ? "Próxima semana"
                  : "Próximo mês"
            }
            onClick={() => onDay(shiftPeriod(day, view, 1))}
          >
            →
          </button>
          <button onClick={() => onDay(today)}>Hoje</button>
        </div>
        <div
          className="segments calendar-views"
          role="group"
          aria-label="Visão da agenda"
        >
          {(
            [
              ["day", "Dia"],
              ["week", "Semana"],
              ["month", "Mês"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              className={key === view ? "selected" : ""}
              aria-pressed={key === view}
              onClick={() => onView(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="stats">
        <div className="stat">
          <span>Visitas {periodName}</span>
          <strong>{visits.length}</strong>
        </div>
        <div className="stat">
          <span>Pacientes previstos</span>
          <strong>
            {
              data.visitPatients.filter((p) =>
                visits.some((v) => v.id === p.visitId),
              ).length
            }
          </strong>
        </div>
        <div className="stat">
          <span>
            A receber{" "}
            {view === "day"
              ? "no dia"
              : view === "week"
                ? "na semana"
                : "no mês"}
          </span>
          <strong>
            {money(
              visits.reduce(
                (sum, v) => sum + v.totalCents - v.receivedCents,
                0,
              ),
            )}
          </strong>
        </div>
      </div>
      <section className={`panel agenda-panel ${view}`}>
        <div className="section-heading">
          <h2 className="calendar-title">{title}</h2>
          <span className="hint">Horário de Brasília</span>
        </div>
        {view === "day" ? (
          <div className="visit-list">
            {visitsFor(day).map((v) => (
              <button
                className="visit-card"
                key={v.id}
                onClick={() => onVisit(v.id)}
              >
                <div className="visit-time">
                  <strong>{timeLabel(v.startsAt)}</strong>
                  <span>{v.durationMinutes} min</span>
                </div>
                <div className="visit-copy">
                  <div className="row">
                    <h3>{tutor(v)}</h3>
                    <span className="badge">{status[v.status]}</span>
                  </div>
                  <p>{patients(v)}</p>
                  <span className="muted">
                    <MapPin size={14} />
                    {v.address}
                  </span>
                </div>
                <ChevronRight size={20} />
              </button>
            ))}
            {!visitsFor(day).length && (
              <p className="empty muted">
                Seu dia está livre. Agende a primeira visita.
              </p>
            )}
          </div>
        ) : (
          <>
            {view === "month" && (
              <div className="calendar-weekdays">
                {weekdays.map((w) => (
                  <span key={w}>{w}</span>
                ))}
              </div>
            )}
            <div className={view === "week" ? "week-grid" : "month-grid"}>
              {period.days.map((d, index) => {
                const list = visitsFor(d);
                return (
                  <section
                    key={d}
                    className={`calendar-day ${d === today ? "today" : ""} ${d === day ? "selected-day" : ""} ${view === "month" && d.slice(0, 7) !== day.slice(0, 7) ? "outside-month" : ""}`}
                    aria-label={dateLabel(d)}
                  >
                    <button
                      className="calendar-day-heading"
                      aria-label={`Ver dia ${dateLabel(d)}`}
                      aria-current={d === today ? "date" : undefined}
                      onClick={() => openDay(d)}
                    >
                      {view === "week" && <span>{weekdays[index]}</span>}
                      <strong>{Number(d.slice(-2))}</strong>
                      {d === today && view === "week" && <small>Hoje</small>}
                    </button>
                    <div className="calendar-events">
                      {list.map(event)}
                      {view === "week" && !list.length && (
                        <span className="hint calendar-free">Sem visitas</span>
                      )}
                    </div>
                    {view === "month" && list.length > 0 && (
                      <button
                        className="mobile-day-count"
                        onClick={() => openDay(d)}
                        aria-label={`${list.length} visitas em ${dateLabel(d)}`}
                      >
                        {list.length} {list.length === 1 ? "visita" : "visitas"}
                      </button>
                    )}
                  </section>
                );
              })}
            </div>
            <p className="hint calendar-help">
              Clique em uma visita para abrir o atendimento ou no dia para ver
              sua agenda completa.
            </p>
          </>
        )}
      </section>
    </>
  );
}
