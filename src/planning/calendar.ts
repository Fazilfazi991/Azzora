import type { LocalDate, ProjectCalendar } from "./model";

export const defaultCalendar = (): ProjectCalendar => ({
  timezone: "Asia/Dubai",
  workingWeekdays: [1, 2, 3, 4, 5],
  workdayStart: "08:00",
  workdayEnd: "17:00",
  holidays: [],
  projectNonworkingDates: [],
});
export function validDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T12:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date;
}
export function dateOffset(date: LocalDate, days: number): LocalDate {
  if (!validDate(date) || !Number.isInteger(days)) throw Error("Invalid local date or offset.");
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function validateCalendar(calendar: ProjectCalendar): void {
  try { new Intl.DateTimeFormat("en", { timeZone: calendar.timezone }); }
  catch { throw Error("Choose a valid IANA project timezone."); }
  if (!Array.isArray(calendar.workingWeekdays) || !calendar.workingWeekdays.length ||
      new Set(calendar.workingWeekdays).size !== calendar.workingWeekdays.length ||
      calendar.workingWeekdays.some((day) => !Number.isInteger(day) || day < 1 || day > 7))
    throw Error("Calendar needs unique working weekdays from 1 to 7.");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(calendar.workdayStart) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(calendar.workdayEnd) ||
      calendar.workdayStart >= calendar.workdayEnd)
    throw Error("Calendar working hours are invalid.");
  for (const dates of [calendar.holidays, calendar.projectNonworkingDates]) {
    if (!Array.isArray(dates) || dates.some((date) => !validDate(date)) ||
        new Set(dates).size !== dates.length)
      throw Error("Calendar contains an invalid or duplicate nonworking date.");
  }
}
export function isWorkingDate(calendar: ProjectCalendar, date: LocalDate): boolean {
  if (!validDate(date)) return false;
  const weekday = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7 + 1;
  return calendar.workingWeekdays.includes(weekday) &&
    !calendar.holidays.includes(date) &&
    !calendar.projectNonworkingDates.includes(date);
}
export function nextWorkingDate(calendar: ProjectCalendar, date: LocalDate, direction: 1 | -1 = 1): LocalDate {
  let cursor = date;
  for (let i = 0; i < 36600; i++) {
    cursor = dateOffset(cursor, direction);
    if (isWorkingDate(calendar, cursor)) return cursor;
  }
  throw Error("Calendar has no reachable working date.");
}
export function workOffset(calendar: ProjectCalendar, date: LocalDate, count: number): LocalDate {
  if (!isWorkingDate(calendar, date) || !Number.isInteger(count))
    throw Error("Working-day offset requires a working anchor date and integer offset.");
  let cursor = date;
  for (let i = 0; i < Math.abs(count); i++) cursor = nextWorkingDate(calendar, cursor, count > 0 ? 1 : -1);
  return cursor;
}
export function onOrAfter(calendar: ProjectCalendar, date: LocalDate): LocalDate {
  if (!validDate(date)) throw Error("Invalid local date.");
  return isWorkingDate(calendar, date) ? date : nextWorkingDate(calendar, date);
}
export function onOrBefore(calendar: ProjectCalendar, date: LocalDate): LocalDate {
  if (!validDate(date)) throw Error("Invalid local date.");
  return isWorkingDate(calendar, date) ? date : nextWorkingDate(calendar, date, -1);
}
export function finishFromStart(calendar: ProjectCalendar, start: LocalDate, duration: number): LocalDate {
  if (!Number.isInteger(duration) || duration < 0) throw Error("Duration must be a nonnegative whole working day count.");
  return duration === 0 ? start : workOffset(calendar, start, duration - 1);
}
export function startFromFinish(calendar: ProjectCalendar, finish: LocalDate, duration: number): LocalDate {
  if (!Number.isInteger(duration) || duration < 0) throw Error("Duration must be a nonnegative whole working day count.");
  return duration === 0 ? finish : workOffset(calendar, finish, -(duration - 1));
}
export function inclusiveWorkingDuration(calendar: ProjectCalendar, start: LocalDate, finish: LocalDate): number | null {
  if (!isWorkingDate(calendar, start) || !isWorkingDate(calendar, finish) || finish < start) return null;
  let count = 1, cursor = start;
  while (cursor < finish) {
    cursor = nextWorkingDate(calendar, cursor);
    if (++count > 36600) throw Error("Task duration exceeds supported range.");
  }
  return cursor === finish ? count : null;
}
export function workingDistance(calendar: ProjectCalendar, from: LocalDate, to: LocalDate): number {
  if (!isWorkingDate(calendar, from) || !isWorkingDate(calendar, to)) throw Error("Working-day distance requires working dates.");
  if (from === to) return 0;
  let cursor = from, count = 0;
  const direction = from < to ? 1 : -1;
  while (cursor !== to) {
    cursor = nextWorkingDate(calendar, cursor, direction);
    count += direction;
    if (Math.abs(count) > 36600) throw Error("Working-day distance exceeds supported range.");
  }
  return count;
}
