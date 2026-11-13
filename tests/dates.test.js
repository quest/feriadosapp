import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays, chileToday, consecutiveRuns, daysBetween, eachDay, formatLong, formatNumeric, formatRange,
  formatShortRange, isIsoDate, weekday,
} from '../js/lib/dates.js';

test('weekday matches Date for every day of 2025-2028', () => {
  for (const iso of eachDay('2025-01-01', '2028-12-31')) {
    const [y, m, d] = iso.split('-').map(Number);
    assert.equal(weekday(iso), new Date(Date.UTC(y, m - 1, d)).getUTCDay(), iso);
  }
});

test('addDays and daysBetween cross months, years and DST changes', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-03-01', -1), '2028-02-29');
  assert.equal(addDays('2026-04-04', 1), '2026-04-05'); // Chile leaves DST that night
  assert.equal(daysBetween('2026-11-13', '2026-12-25'), 42);
});

test('isIsoDate rejects impossible dates', () => {
  assert.ok(isIsoDate('2028-02-29'));
  assert.ok(!isIsoDate('2026-02-29'));
  assert.ok(!isIsoDate('2026-13-01'));
  assert.ok(!isIsoDate('25-12-2026'));
  assert.ok(!isIsoDate(undefined));
});

test('chileToday uses Santiago time, not UTC', () => {
  // 02:30 UTC on the 14th is 23:30 on the 13th in Chile (UTC-3 in November).
  assert.equal(chileToday(new Date('2026-11-14T02:30:00Z')), '2026-11-13');
  assert.equal(chileToday(new Date('2026-11-14T03:30:00Z')), '2026-11-14');
  // Winter time (UTC-4).
  assert.equal(chileToday(new Date('2026-07-16T03:30:00Z')), '2026-07-15');
});

test('formatting in Spanish', () => {
  assert.equal(formatLong('2026-12-25'), 'viernes 25 de diciembre');
  assert.equal(formatLong('2026-12-25', { withYear: true }), 'viernes 25 de diciembre de 2026');
  assert.equal(formatNumeric('2026-12-25'), '25-12-2026');
  assert.equal(formatRange('2026-09-12', '2026-09-20'), 'sábado 12 al domingo 20 de septiembre');
  assert.equal(formatRange('2026-12-25', '2027-01-03'), 'viernes 25 de diciembre de 2026 al domingo 3 de enero de 2027');
  assert.equal(formatShortRange('2026-04-03', '2026-04-05'), 'vie 3 – dom 5 abr');
});

test('consecutiveRuns groups adjacent dates', () => {
  assert.deepEqual(consecutiveRuns(['2026-09-17', '2026-09-14', '2026-09-15', '2026-09-21']), [
    ['2026-09-14', '2026-09-15'], ['2026-09-17', '2026-09-17'], ['2026-09-21', '2026-09-21'],
  ]);
});
