// iCalendar (.ics) export of holidays as all-day events, with an optional reminder the evening before.

import { addDays } from './dates.js';

const CRLF = '\r\n';
const encoder = new TextEncoder();

function escapeText(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/([,;])/g, '\\$1');
}

/** Folds a content line at 75 octets, as RFC 5545 requires. */
function fold(line) {
  if (encoder.encode(line).length <= 75) return line;
  let out = '';
  let chunk = '';
  let size = 0;
  let limit = 75;
  for (const ch of line) {
    const bytes = encoder.encode(ch).length;
    if (size + bytes > limit) {
      out += chunk + CRLF + ' ';
      chunk = '';
      size = 0;
      limit = 74; // continuation lines start with a space
    }
    chunk += ch;
    size += bytes;
  }
  return out + chunk;
}

export function slugify(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * @param {import('./holidays.js').Holiday[]} holidays
 * @param {{ name?: string, reminder?: boolean, now?: Date }} [options]
 */
export function buildIcs(holidays, { name = 'Feriados Chile', reminder = true, now = new Date() } = {}) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Boostr//Feriados Chile//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(name)}`,
    'X-WR-TIMEZONE:America/Santiago',
  ];
  for (const h of holidays) {
    const start = h.date.replace(/-/g, '');
    const end = addDays(h.date, 1).replace(/-/g, '');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${start}-${slugify(h.name)}@feriadosapp.com`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${end}`,
      `SUMMARY:${escapeText(`Feriado: ${h.name}`)}`,
      `DESCRIPTION:${escapeText(`${h.extra}. Más en https://www.feriadosapp.com`)}`,
      'TRANSP:TRANSPARENT',
      'CATEGORIES:Feriado',
    );
    if (reminder) {
      // Relative to midnight of the holiday: 18:00 the day before.
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(`Mañana es feriado: ${h.name}`)}`, 'TRIGGER:-PT6H', 'END:VALARM');
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join(CRLF) + CRLF;
}
