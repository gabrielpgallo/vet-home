import { describe, it, expect } from "vitest";
import { calendarPeriod, shiftPeriod } from "../src/lib/calendar";
describe("períodos da agenda", () => {
  it("usa segunda a domingo mesmo na virada do ano", () => {
    const p = calendarPeriod("2027-01-01", "week");
    expect(p.start).toBe("2026-12-28");
    expect(p.end).toBe("2027-01-03");
    expect(p.days).toHaveLength(7);
  });
  it("preenche o mês com semanas completas sem incluir dias extras nos totais", () => {
    const p = calendarPeriod("2026-09-16", "month");
    expect(p.start).toBe("2026-09-01");
    expect(p.end).toBe("2026-09-30");
    expect(p.days[0]).toBe("2026-08-31");
    expect(p.days.at(-1)).toBe("2026-10-04");
    expect(p.days).toHaveLength(35);
  });
  it("respeita meses curtos e anos bissextos ao navegar", () => {
    expect(shiftPeriod("2026-01-31", "month", 1)).toBe("2026-02-28");
    expect(shiftPeriod("2024-01-31", "month", 1)).toBe("2024-02-29");
    expect(shiftPeriod("2026-12-16", "month", 1)).toBe("2027-01-16");
    expect(shiftPeriod("2026-03-31", "month", -1)).toBe("2026-02-28");
  });
  it("navega por sete dias na visão semanal e um dia na diária", () => {
    expect(shiftPeriod("2026-09-16", "week", 1)).toBe("2026-09-23");
    expect(shiftPeriod("2026-09-30", "day", 1)).toBe("2026-10-01");
    expect(calendarPeriod("2026-09-16", "day").days).toEqual(["2026-09-16"]);
  });
});
