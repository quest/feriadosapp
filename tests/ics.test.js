import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIcs, slugify } from '../js/lib/ics.js';

const holidays = [
  { date: '2026-12-25', name: 'Navidad', type: 'Civil', inalienable: true, extra: 'Civil e Irrenunciable' },
  { date: '2026-10-31', name: 'Día de las Iglesias Evangélicas y Protestantes, con coma; y punto y coma', type: 'Civil', inalienable: false, extra: 'Civil' },
];

test('builds all-day events with a reminder', () => {
  const ics = buildIcs(holidays, { name: 'Feriados 2026', now: new Date('2026-11-13T19:00:00Z') });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.equal(ics.match(/BEGIN:VEVENT/g).length, 2);
  assert.equal(ics.match(/BEGIN:VALARM/g).length, 2);
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20261225\r\n'));
  assert.ok(ics.includes('DTEND;VALUE=DATE:20261226\r\n'));
  assert.ok(ics.includes('DTSTAMP:20261113T190000Z\r\n'));
  assert.ok(ics.includes('UID:20261225-navidad@feriadosapp.com\r\n'));
  assert.ok(!/(^|[^\r])\n/.test(ics), 'every line ends in CRLF');
});

test('escapes text and folds long lines at 75 octets', () => {
  const ics = buildIcs(holidays, { reminder: false });
  assert.ok(!ics.includes('VALARM'));
  for (const line of ics.split('\r\n')) {
    assert.ok(new TextEncoder().encode(line).length <= 75, line);
  }
  const unfolded = ics.replace(/\r\n /g, '');
  assert.ok(unfolded.includes('con coma\\; y punto y coma'));
  assert.ok(unfolded.includes('Protestantes\\, con coma'));
});

test('slugify drops accents and symbols', () => {
  assert.equal(slugify('Día de las Glorias del Ejército'), 'dia-de-las-glorias-del-ejercito');
});
