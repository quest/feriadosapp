// Holiday rules: long weekends, bridges, vacation planner and workday counts.
// Pure functions shared by the browser app and the Node page generator.

import { addDays, daysBetween, eachDay, fromDayNumber, isIsoDate, toDayNumber, weekday } from './dates.js';

/**
 * @typedef {{ date: string, name: string, type: string, inalienable: boolean, extra: string }} Holiday
 * @typedef {{ start: string, end: string, days: number, holidays: Holiday[] }} DayOffRun
 */

// 2013-2021 carry a pseudo-holiday "Todos los Días Domingos" dated January 1st (Ley 2.977 makes every
// Sunday a holiday). It is not a dated holiday and Sundays are already days off, so it is dropped.
const NOT_A_DATED_HOLIDAY = /^todos los d[ií]as domingos?$/i;

/** Converts an item of api.boostr.cl/holidays into a Holiday, or null when it is malformed. */
export function fromApi(item) {
  if (!item || !isIsoDate(item.date) || typeof item.title !== 'string' || !item.title.trim()) return null;
  if (NOT_A_DATED_HOLIDAY.test(item.title.trim())) return null;
  const type = typeof item.type === 'string' ? item.type : '';
  const inalienable = item.inalienable === true;
  return {
    date: item.date,
    name: item.title.trim(),
    type,
    inalienable,
    extra: typeof item.extra === 'string' && item.extra ? item.extra : `${type}${inalienable ? ' e Irrenunciable' : ''}`,
  };
}

const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

export class HolidayCalendar {
  /**
   * @param {Holiday[]} holidays
   * @param {{ saturdayIsWorkday?: boolean }} [options]
   */
  constructor(holidays = [], { saturdayIsWorkday = false } = {}) {
    const seen = new Set();
    /** @type {Holiday[]} */
    this.list = holidays
      .filter((h) => {
        const key = `${h.date}|${h.name}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort(byDate);
    /** @type {Map<string, Holiday[]>} */
    this.byDate = new Map();
    for (const h of this.list) {
      const same = this.byDate.get(h.date);
      if (same) same.push(h);
      else this.byDate.set(h.date, [h]);
    }
    this.saturdayIsWorkday = saturdayIsWorkday;
  }

  holidaysOn(iso) {
    return this.byDate.get(iso) ?? [];
  }

  isHoliday(iso) {
    return this.byDate.has(iso);
  }

  /** Weekend day under the current options (Saturday may count as a workday). */
  isRestWeekday(iso) {
    const d = weekday(iso);
    return d === 0 || (d === 6 && !this.saturdayIsWorkday);
  }

  isDayOff(iso) {
    return this.isRestWeekday(iso) || this.isHoliday(iso);
  }

  isWorkday(iso) {
    return !this.isDayOff(iso);
  }

  /** Holidays with from <= date <= to. */
  between(from, to) {
    return this.list.filter((h) => h.date >= from && h.date <= to);
  }
}

/** Runs of consecutive days off that touch [from, to], scanning a margin so runs at the edges are complete. */
function dayOffRuns(cal, from, to, margin = 10) {
  const runs = [];
  let run = null;
  for (const day of eachDay(addDays(from, -margin), addDays(to, margin))) {
    if (cal.isDayOff(day)) {
      if (run) run.end = day;
      else run = { start: day, end: day };
    } else if (run) {
      runs.push(run);
      run = null;
    }
  }
  if (run) runs.push(run);
  return runs.map((r) => ({ ...r, days: daysBetween(r.start, r.end) + 1, holidays: cal.between(r.start, r.end) }));
}

/**
 * Long weekends: 3 or more consecutive days off that include a holiday dated within [from, to].
 * @returns {DayOffRun[]}
 */
export function longWeekends(cal, from, to) {
  return dayOffRuns(cal, from, to).filter(
    (r) => r.days >= 3 && r.holidays.some((h) => h.date >= from && h.date <= to),
  );
}

/**
 * Bridges: up to `maxTake` workdays sitting between two runs of days off, where one of the runs has a
 * holiday. Taking those days joins both runs into one break.
 * @returns {(DayOffRun & { take: string[] })[]}
 */
export function bridges(cal, from, to, maxTake = 1) {
  const runs = dayOffRuns(cal, from, to, 14);
  const out = [];
  for (let i = 0; i + 1 < runs.length; i++) {
    const a = runs[i];
    const b = runs[i + 1];
    const gap = daysBetween(a.end, b.start) - 1;
    if (gap < 1 || gap > maxTake) continue;
    if (!a.holidays.length && !b.holidays.length) continue;
    const holidays = [...a.holidays, ...b.holidays];
    if (!holidays.some((h) => h.date >= from && h.date <= to)) continue;
    out.push({
      start: a.start,
      end: b.end,
      days: daysBetween(a.start, b.end) + 1,
      holidays,
      take: eachDay(addDays(a.end, 1), addDays(b.start, -1)),
    });
  }
  return out;
}

/**
 * Best ways to spend `budget` vacation days within [from, to].
 * Enumerates every window that cannot grow without spending another day, ranks by consecutive days off
 * (then fewer days spent, then earlier), and returns up to `limit` windows that do not overlap.
 * Windows with a holiday come first; plain weeks only fill the list when nothing else fits.
 * @returns {(DayOffRun & { used: number, take: string[] })[]}
 */
export function planVacations(cal, from, to, budget, limit = 5) {
  if (!(budget >= 1) || to < from) return [];
  const days = eachDay(from, to);
  const off = days.map((d) => cal.isDayOff(d));
  const n = days.length;
  const candidates = [];
  let end = 0; // window is [start, end)
  let used = 0;
  for (let start = 0; start < n; start++) {
    if (end < start) {
      end = start;
      used = 0;
    }
    while (end < n && used + (off[end] ? 0 : 1) <= budget) {
      if (!off[end]) used++;
      end++;
    }
    const leftMaximal = start === 0 || !off[start - 1];
    if (end > start && used > 0 && leftMaximal) candidates.push({ s: start, e: end - 1, used });
    if (end > start && !off[start]) used--;
  }

  const ranked = candidates
    .map((c) => {
      const start = days[c.s];
      const finish = days[c.e];
      const holidays = cal.between(start, finish);
      return {
        start,
        end: finish,
        days: c.e - c.s + 1,
        used: c.used,
        holidays,
        take: days.slice(c.s, c.e + 1).filter((_, i) => !off[c.s + i]),
      };
    })
    .sort((a, b) => (b.holidays.length > 0) - (a.holidays.length > 0)
      || b.days - a.days
      || a.used - b.used
      || (a.start < b.start ? -1 : 1));

  const chosen = [];
  for (const w of ranked) {
    if (chosen.length >= limit) break;
    const overlaps = chosen.some((c) => !(w.end < c.start || w.start > c.end));
    if (!overlaps) chosen.push(w);
  }
  return chosen;
}

/** Counts the days in [from, to], both included. Holidays on a weekend count as weekend. */
export function countWorkdays(cal, from, to) {
  if (to < from) [from, to] = [to, from];
  let workdays = 0;
  let restDays = 0;
  let holidayDays = 0;
  for (let n = toDayNumber(from), last = toDayNumber(to); n <= last; n++) {
    const iso = fromDayNumber(n);
    if (cal.isRestWeekday(iso)) restDays++;
    else if (cal.isHoliday(iso)) holidayDays++;
    else workdays++;
  }
  return {
    from,
    to,
    calendarDays: daysBetween(from, to) + 1,
    workdays,
    restDays,
    holidayDays,
    holidays: cal.between(from, to),
  };
}

/**
 * Date reached after counting `count` workdays. Counting starts the day after `from`,
 * the usual rule for deadlines. A negative count walks backwards.
 */
export function addWorkdays(cal, from, count) {
  let day = from;
  let left = Math.trunc(count);
  const step = left < 0 ? -1 : 1;
  while (left !== 0) {
    day = addDays(day, step);
    if (cal.isWorkday(day)) left -= step;
  }
  return day;
}
