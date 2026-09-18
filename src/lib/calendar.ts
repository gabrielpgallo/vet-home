export type CalendarView = "day" | "week" | "month";
const parse = (day: string) => new Date(day + "T12:00:00Z");
const key = (date: Date) => date.toISOString().slice(0, 10);
export function addDays(day: string, amount: number) {
  const date = parse(day);
  date.setUTCDate(date.getUTCDate() + amount);
  return key(date);
}
export function weekStart(day: string) {
  return addDays(day, -((parse(day).getUTCDay() + 6) % 7));
}
export function shiftPeriod(day: string, view: CalendarView, amount: number) {
  if (view !== "month") return addDays(day, amount * (view === "week" ? 7 : 1));
  const date = parse(day),
    number = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + amount);
  const last = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(number, last));
  return key(date);
}
export function calendarPeriod(day: string, view: CalendarView) {
  const start =
    view === "month"
      ? day.slice(0, 7) + "-01"
      : view === "week"
        ? weekStart(day)
        : day;
  const end =
    view === "month"
      ? addDays(shiftPeriod(start, "month", 1), -1)
      : view === "week"
        ? addDays(start, 6)
        : day;
  const gridStart = view === "month" ? weekStart(start) : start;
  const gridEnd = view === "month" ? addDays(weekStart(end), 6) : end;
  const days: string[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);
  return { start, end, days };
}
