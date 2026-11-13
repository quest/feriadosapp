import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  HolidayCalendar, addWorkdays, bridges, countWorkdays, fromApi, longWeekends, planVacations,
} from '../js/lib/holidays.js';

const load = (year) => JSON.parse(readFileSync(new URL(`./fixtures/holidays-${year}.json`, import.meta.url))).data.map(fromApi);
const h2026 = load(2026);
const h2027 = load(2027);
const cal = new HolidayCalendar([...h2026, ...h2027]);

test('fromApi keeps valid items and drops broken ones', () => {
  assert.equal(h2026.length, 16);
  assert.deepEqual(fromApi({ date: '2026-12-25', title: ' Navidad ', type: 'Civil', inalienable: true, extra: 'Civil e Irrenunciable' }), {
    date: '2026-12-25', name: 'Navidad', type: 'Civil', inalienable: true, extra: 'Civil e Irrenunciable',
  });
  assert.equal(fromApi({ date: '2026-02-30', title: 'X' }), null);
  assert.equal(fromApi({ date: '2026-12-25', title: '' }), null);
  assert.equal(fromApi(null), null);
  assert.equal(fromApi({ date: '2021-01-01', title: 'Todos los Días Domingos', type: 'Civil', inalienable: false }), null);
});

test('calendar dedupes, sorts and answers day questions', () => {
  const c = new HolidayCalendar([h2026[5], h2026[0], h2026[0]]);
  assert.deepEqual(c.list.map((h) => h.date), ['2026-01-01', '2026-06-21']);
  assert.ok(cal.isHoliday('2026-12-25'));
  assert.ok(cal.isDayOff('2026-11-14')); // Saturday
  assert.ok(cal.isWorkday('2026-11-13')); // Friday
  assert.ok(!new HolidayCalendar([], { saturdayIsWorkday: true }).isDayOff('2026-11-14'));
});

test('long weekends of 2026', () => {
  const runs = longWeekends(cal, '2026-01-01', '2026-12-31');
  assert.deepEqual(runs.map((r) => [r.start, r.end, r.days]), [
    ['2026-04-03', '2026-04-05', 3],
    ['2026-05-01', '2026-05-03', 3],
    ['2026-06-27', '2026-06-29', 3],
    ['2026-09-18', '2026-09-20', 3],
    ['2026-10-10', '2026-10-12', 3],
    ['2026-12-25', '2026-12-27', 3],
  ]);
  assert.deepEqual(runs[0].holidays.map((h) => h.name), ['Viernes Santo', 'Sábado Santo']);
});

test('long weekends of 2027 include the extra Fiestas Patrias holiday', () => {
  const runs = longWeekends(cal, '2027-01-01', '2027-12-31');
  const fiestas = runs.find((r) => r.start === '2027-09-17');
  assert.equal(fiestas.days, 3);
  assert.ok(runs.find((r) => r.start === '2027-01-01' && r.days === 3)); // Fri Jan 1
});

test('one-day bridges of 2026', () => {
  const found = bridges(cal, '2026-01-01', '2026-12-31', 1);
  assert.deepEqual(found.map((b) => [b.take.join(','), b.start, b.end, b.days]), [
    ['2026-01-02', '2026-01-01', '2026-01-04', 4],
    ['2026-05-22', '2026-05-21', '2026-05-24', 4],
    ['2026-07-17', '2026-07-16', '2026-07-19', 4],
    ['2026-12-07', '2026-12-05', '2026-12-08', 4],
  ]);
});

test('planner: one day turns into four days off', () => {
  const plans = planVacations(cal, '2026-01-01', '2026-12-31', 1);
  assert.equal(plans.length, 5);
  assert.deepEqual([plans[0].start, plans[0].end, plans[0].days, plans[0].used], ['2026-01-01', '2026-01-04', 4, 1]);
  for (const p of plans) {
    assert.equal(p.used, 1);
    assert.equal(p.take.length, 1);
    assert.ok(p.holidays.length > 0);
  }
});

test('planner: four days across New Year give ten days off', () => {
  const plans = planVacations(cal, '2026-11-13', '2027-11-12', 4);
  assert.deepEqual([plans[0].start, plans[0].end, plans[0].days, plans[0].used], ['2026-12-25', '2027-01-03', 10, 4]);
  assert.deepEqual(plans[0].take, ['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31']);
  // Windows never overlap.
  for (let i = 0; i < plans.length; i++) {
    for (let j = i + 1; j < plans.length; j++) {
      assert.ok(plans[i].end < plans[j].start || plans[j].end < plans[i].start);
    }
  }
});

test('planner ignores an empty budget or range', () => {
  assert.deepEqual(planVacations(cal, '2026-01-01', '2026-12-31', 0), []);
  assert.deepEqual(planVacations(cal, '2026-12-31', '2026-01-01', 3), []);
});

test('workdays in December 2026', () => {
  const r = countWorkdays(cal, '2026-12-01', '2026-12-31');
  assert.equal(r.calendarDays, 31);
  assert.equal(r.restDays, 8);
  assert.equal(r.holidayDays, 2);
  assert.equal(r.workdays, 21);
  assert.deepEqual(countWorkdays(cal, '2026-12-31', '2026-12-01'), r); // reversed input
});

test('workdays with Saturday as a workday', () => {
  const sat = new HolidayCalendar(cal.list, { saturdayIsWorkday: true });
  const r = countWorkdays(sat, '2026-12-01', '2026-12-31');
  assert.equal(r.restDays, 4);
  assert.equal(r.workdays, 25);
});

test('adding workdays skips weekends and holidays', () => {
  assert.equal(addWorkdays(cal, '2026-12-04', 2), '2026-12-09'); // Mon 7, (Tue 8 holiday), Wed 9
  assert.equal(addWorkdays(cal, '2026-12-24', 1), '2026-12-28'); // Fri 25 holiday, weekend
  assert.equal(addWorkdays(cal, '2026-12-28', -1), '2026-12-24');
  assert.equal(addWorkdays(cal, '2026-12-28', 0), '2026-12-28');
});
