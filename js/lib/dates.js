// Civil dates in Chile, handled as ISO strings 'YYYY-MM-DD'.
// Arithmetic runs on UTC day numbers, so daylight saving changes never shift a day.
// Shared by the browser app and the Node page generator: no DOM access here.

const MS_PER_DAY = 86400000;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const WEEKDAYS_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
export const WEEKDAY_LETTERS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
export const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
export const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function isIsoDate(value) {
  const m = ISO_RE.exec(typeof value === 'string' ? value : '');
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

export function toDayNumber(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

export function fromDayNumber(n) {
  return new Date(n * MS_PER_DAY).toISOString().slice(0, 10);
}

export const addDays = (iso, n) => fromDayNumber(toDayNumber(iso) + n);
export const daysBetween = (from, to) => toDayNumber(to) - toDayNumber(from);
// 1970-01-01 (day 0) was a Thursday.
export const weekday = (iso) => (((toDayNumber(iso) + 4) % 7) + 7) % 7;
export const yearOf = (iso) => Number(iso.slice(0, 4));
export const monthOf = (iso) => Number(iso.slice(5, 7)) - 1;
export const dayOf = (iso) => Number(iso.slice(8, 10));
export const pad2 = (n) => String(n).padStart(2, '0');
export const isoOf = (year, monthIndex, day) => `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
export const daysInMonth = (year, monthIndex) => new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

export function isWeekend(iso) {
  const d = weekday(iso);
  return d === 0 || d === 6;
}

/** Every date from `from` to `to`, both included. */
export function eachDay(from, to) {
  const out = [];
  for (let n = toDayNumber(from), end = toDayNumber(to); n <= end; n++) out.push(fromDayNumber(n));
  return out;
}

/** Today's civil date in Chile (America/Santiago), whatever the device time zone is. */
export function chileToday(now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now);
    const get = (type) => parts.find((p) => p.type === type)?.value;
    const iso = `${get('year')}-${get('month')}-${get('day')}`;
    if (isIsoDate(iso)) return iso;
  } catch {
    // Old engines without time zone data fall back to the device date.
  }
  return isoOf(now.getFullYear(), now.getMonth(), now.getDate());
}

export const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** 'jueves 25 de diciembre' (optionally '… de 2026'). */
export function formatLong(iso, { withWeekday = true, withYear = false } = {}) {
  let text = `${dayOf(iso)} de ${MONTHS[monthOf(iso)]}`;
  if (withWeekday) text = `${WEEKDAYS[weekday(iso)]} ${text}`;
  if (withYear) text += ` de ${yearOf(iso)}`;
  return text;
}

/** 'jue 25 dic'. */
export const formatShort = (iso) => `${WEEKDAYS_SHORT[weekday(iso)]} ${dayOf(iso)} ${MONTHS_SHORT[monthOf(iso)]}`;

/** '25-12-2026' (the numeric format used across our apps). */
export const formatNumeric = (iso) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;

/** 'sábado 12 al domingo 20 de septiembre'. */
export function formatRange(from, to, { withYear = false } = {}) {
  if (from === to) return formatLong(from, { withYear });
  const crossYear = yearOf(from) !== yearOf(to);
  const sameMonth = !crossYear && monthOf(from) === monthOf(to);
  const start = sameMonth
    ? `${WEEKDAYS[weekday(from)]} ${dayOf(from)}`
    : formatLong(from, { withYear: crossYear });
  return `${start} al ${formatLong(to, { withYear: crossYear || withYear })}`;
}

/** 'sáb 12 – dom 20 sep'. */
export function formatShortRange(from, to) {
  if (from === to) return formatShort(from);
  const sameMonth = yearOf(from) === yearOf(to) && monthOf(from) === monthOf(to);
  const start = sameMonth ? `${WEEKDAYS_SHORT[weekday(from)]} ${dayOf(from)}` : formatShort(from);
  return `${start} – ${formatShort(to)}`;
}

/** Groups dates into runs of consecutive days: [['2026-09-14', '2026-09-17'], …]. */
export function consecutiveRuns(dates) {
  const sorted = [...dates].sort();
  const runs = [];
  for (const iso of sorted) {
    const last = runs[runs.length - 1];
    if (last && daysBetween(last[1], iso) === 1) last[1] = iso;
    else runs.push([iso, iso]);
  }
  return runs;
}
