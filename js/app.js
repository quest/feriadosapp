// Feriados Chile: single-page app with hash routes (#inicio, #calendario/2027, #vacaciones,
// #habiles, #mas). Views are rendered as HTML strings; every value that comes from the API goes
// through esc(). Design rule: red only means "holiday"; keep text short.

import {
  MONTHS, MONTHS_SHORT, WEEKDAYS, WEEKDAY_LETTERS, addDays, capitalize, chileToday, consecutiveRuns,
  dayOf, daysBetween, daysInMonth, eachDay, formatLong, formatNumeric, formatRange, formatShort,
  formatShortRange, isIsoDate, isWeekend, isoOf, monthOf, weekday, yearOf,
} from './lib/dates.js';
import {
  HolidayCalendar, addWorkdays, bridges, countWorkdays, longWeekends, planVacations,
} from './lib/holidays.js';
import { getYear, onHolidaysUpdated } from './lib/api.js';
import { buildIcs } from './lib/ics.js';
import { initAnalytics, track } from './analytics.js';
import { API_DOCS_URL, FIRST_YEAR, SITE_URL } from './config.js';
import { applyTheme, readTheme, registerServiceWorker, saveTheme, shareLink, toast } from './shell.js';
import { PAGE_YEARS } from './years.js';

const $view = document.getElementById('view');

// ---------- helpers ----------

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);
const icon = (name) => `<svg class="i" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
const num = (n) => n.toLocaleString('es-CL');
const plural = (n, one, many) => `${num(n)} ${n === 1 ? one : many}`;
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const clampInt = (value, min, max, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
};
const isDesktop = () => window.matchMedia('(min-width: 960px)').matches;

const prefs = {
  get(key, fallback) {
    try {
      return localStorage.getItem(`pref:${key}`) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`pref:${key}`, value);
    } catch {
      // Preferences are a convenience; ignore storage errors.
    }
  },
};

// ---------- state ----------

const state = {
  today: chileToday(),
  years: new Map(), // year -> Holiday[]
  failed: new Map(), // year -> Error
  calendarView: prefs.get('calendarView', isDesktop() ? 'year' : 'list') === 'year' ? 'year' : 'list',
  selectedDate: null,
  budget: clampInt(prefs.get('budget', '5'), 1, 30, 5),
  period: 'next12',
  wd: { mode: 'between', from: null, to: null, start: null, count: 10, saturday: false },
};

const currentYear = () => yearOf(state.today);
const maxYear = () => currentYear() + 2;
const clampYear = (y) => Math.min(Math.max(y, FIRST_YEAR), maxYear());
const hasYear = (y) => state.years.has(y);
const yearList = (y) => state.years.get(y) ?? [];
const calendar = (options) => new HolidayCalendar([...state.years.values()].flat(), options);

async function ensureYears(years) {
  const missing = [...new Set(years)].filter((y) => y >= FIRST_YEAR && y <= maxYear() && !hasYear(y));
  await Promise.all(missing.map(async (y) => {
    try {
      state.years.set(y, await getYear(y));
      state.failed.delete(y);
    } catch (err) {
      state.failed.set(y, err);
    }
  }));
}

/** Holidays grouped by date (two holidays can share a day). */
function groupByDate(list) {
  const out = [];
  for (const h of list) {
    const last = out[out.length - 1];
    if (last && last.date === h.date) last.holidays.push(h);
    else out.push({ date: h.date, holidays: [h] });
  }
  return out;
}
const groupName = (g) => g.holidays.map((h) => h.name).join(' y ');
const groupInalienable = (g) => g.holidays.some((h) => h.inalienable);

function runsByHolidayDate(runs) {
  const map = new Map();
  for (const r of runs) for (const h of r.holidays) map.set(h.date, r);
  return map;
}

function countdownText(iso) {
  const n = daysBetween(state.today, iso);
  if (n === 0) return 'hoy';
  if (n === 1) return 'mañana';
  if (n > 1) return plural(n, 'día', 'días');
  return '';
}

// ---------- install (PWA) ----------

let installPrompt = null;
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault(); // we show our own button instead of the mini-infobar
  installPrompt = event;
  refreshInstallUi();
});
window.addEventListener('appinstalled', () => {
  installPrompt = null;
  track('app_installed');
  refreshInstallUi();
});

const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function installMode() {
  if (isStandalone()) return 'installed';
  if (installPrompt) return 'prompt';
  if (isIos()) return 'ios';
  return 'manual';
}

function refreshInstallUi() {
  const route = parseRoute().name;
  if (route === 'inicio' || route === 'mas') render({ keepScroll: true });
}

// ---------- shared view pieces ----------

function skeleton() {
  return `<div class="skeleton" aria-busy="true" aria-label="Cargando feriados">
    <div class="sk sk-hero"></div><div class="sk sk-line"></div><div class="sk sk-card"></div><div class="sk sk-card"></div>
  </div>`;
}

function errorCard(year) {
  const offline = navigator.onLine === false;
  return `<section class="notice" role="alert">
    <h2>No pudimos cargar los feriados de ${year}</h2>
    <p class="muted">${offline ? 'Estás sin conexión. Conéctate y vuelve a intentarlo.' : 'Espera unos segundos y vuelve a intentarlo.'}</p>
    <button class="btn btn--ink" type="button" data-action="retry">Reintentar</button>
  </section>`;
}

function emptyYear(year) {
  return `<section class="notice">
    <h2>Aún no hay feriados publicados para ${year}</h2>
    <a class="btn" href="#calendario/${currentYear()}">Ver ${currentYear()}</a>
  </section>`;
}

const emptyNote = (text) => `<p class="empty">${esc(text)}</p>`;

function yearLink(route, y, dir) {
  return y >= FIRST_YEAR && y <= maxYear()
    ? `<a class="btn-icon" href="#${route}/${y}" aria-label="Ver ${y}">${icon(`chevron-${dir}`)}</a>`
    : `<span class="btn-icon is-disabled" aria-hidden="true">${icon(`chevron-${dir}`)}</span>`;
}

function yearPicker(route, year) {
  return `<div class="yearpick" role="group" aria-label="Año">${yearLink(route, year - 1, 'left')}<span>${year}</span>${yearLink(route, year + 1, 'right')}</div>`;
}

/** Day squares: holidays in red, vacation days in ink, other days off in gray. */
function strip(start, end, cal, take = []) {
  const takeSet = new Set(take);
  const days = eachDay(start, end).map((d) => {
    const cls = cal.isHoliday(d) ? 'h' : takeSet.has(d) ? 't' : '';
    return `<i class="${cls}">${WEEKDAY_LETTERS[weekday(d)]}</i>`;
  });
  return `<div class="strip" aria-hidden="true">${days.join('')}</div>`;
}

function holidayRow(g, { runsByDate, showLong = true } = {}) {
  const past = g.date < state.today;
  const run = runsByDate?.get(g.date);
  const sub = [
    capitalize(WEEKDAYS[weekday(g.date)]),
    groupInalienable(g) ? 'irrenunciable' : '',
    showLong && run ? 'fin de semana largo' : '',
  ].filter(Boolean).join(' · ');
  return `<li class="row${past ? ' is-past' : ''}${g.isNext ? ' is-next' : ''}">
    <div class="row-date"><span class="row-day">${dayOf(g.date)}</span><span class="row-month">${MONTHS_SHORT[monthOf(g.date)]}</span></div>
    <div><p class="row-title">${esc(groupName(g))}</p><p class="row-sub">${esc(sub)}</p></div>
    <span class="row-end">${past ? '' : countdownText(g.date)}</span>
  </li>`;
}

function longWeekendRow(r, { showYear = false } = {}) {
  const now = r.start <= state.today && state.today <= r.end;
  const past = r.end < state.today;
  const withYear = showYear && yearOf(r.end) !== currentYear();
  return `<li class="row${past ? ' is-past' : ''}">
    <div class="row-date row-len"><b>${r.days}</b><span>días</span></div>
    <div>
      <p class="row-title">${esc(capitalize(formatRange(r.start, r.end, { withYear })))}</p>
      <p class="row-sub">${esc(r.holidays.map((h) => h.name).join(' y '))}</p>
    </div>
    <span class="row-end">${now ? 'ahora' : past ? '' : countdownText(r.start)}</span>
  </li>`;
}

function bridgeRow(b) {
  const past = b.end < state.today;
  const ask = b.take.length === 1 ? `Pide el ${formatShort(b.take[0])}` : `Pide ${formatShortRange(b.take[0], b.take[b.take.length - 1])}`;
  return `<li class="row${past ? ' is-past' : ''}">
    <div class="row-date row-len"><b>${b.days}</b><span>días</span></div>
    <div>
      <p class="row-title">${esc(ask)}</p>
      <p class="row-sub">${esc(capitalize(formatShortRange(b.start, b.end)))} · ${esc(b.holidays.map((h) => h.name).join(' y '))}</p>
    </div>
    <span class="row-end"></span>
  </li>`;
}

function sheet(iso) {
  return `<div class="sheet" aria-hidden="true">
    <div class="sheet-month">${MONTHS[monthOf(iso)]}</div>
    <div class="sheet-day">${dayOf(iso)}</div>
    <div class="sheet-weekday">${WEEKDAYS[weekday(iso)]}</div>
  </div>`;
}

// ---------- view: inicio ----------

function nextCard(cal, g, { today = false, following = null } = {}) {
  const n = daysBetween(state.today, g.date);
  const run = longWeekends(cal, g.date, g.date)[0];
  const pills = [
    run ? `<span class="pill">${run.days} días libres</span>` : '',
    groupInalienable(g) ? '<span class="pill">Irrenunciable</span>' : '',
  ].join('');
  let count;
  if (today) {
    count = following
      ? `<p class="next-count">Después viene ${esc(groupName(following))}, en ${countdownText(following.date)}</p>`
      : '';
  } else if (n === 1) {
    count = '<p class="next-count"><strong>Es mañana</strong></p>';
  } else {
    count = `<p class="next-count">Faltan <strong>${plural(n, 'día', 'días')}</strong></p>`;
  }
  const date = capitalize(formatLong(g.date, { withYear: yearOf(g.date) !== currentYear() }));
  return `<section class="next" aria-labelledby="next-title">
    <p class="next-eyebrow">${today ? '¡Hoy es feriado!' : 'Próximo feriado'}</p>
    ${sheet(g.date)}
    <h1 class="next-name" id="next-title">${esc(groupName(g))}<span class="sr-only">, ${esc(date)}</span></h1>
    ${count}
    ${pills ? `<div class="next-pills">${pills}</div>` : ''}
    <div class="next-actions">
      ${today ? '' : `<button class="btn btn--ink" type="button" data-action="ics-day" data-date="${g.date}">${icon('calendar-plus')}Agendar</button>`}
      <button class="btn-icon" type="button" data-action="${today ? 'share-today' : 'share-next'}" data-date="${g.date}" aria-label="Compartir">${icon('share')}</button>
    </div>
  </section>`;
}

function emptyNext() {
  return `<section class="next">
    <p class="next-eyebrow">Próximo feriado</p>
    <h1 class="next-name">Aún no hay más feriados publicados</h1>
  </section>`;
}

function installRow() {
  const mode = installMode();
  if ((mode !== 'prompt' && mode !== 'ios') || prefs.get('installDismissed', '') === '1') return '';
  return `<aside class="install" aria-label="Instalar la app">
    <img src="/icons/icon-192.png" alt="" width="44" height="44">
    <div><p class="install-title">Instala Feriados</p><p class="install-sub">Úsala como app, sin internet.</p></div>
    <button class="btn btn--ink btn--sm" type="button" data-action="${mode === 'prompt' ? 'install' : 'ios-help'}">${mode === 'prompt' ? 'Instalar' : 'Cómo'}</button>
    <button class="btn-icon btn-icon--plain" type="button" data-action="dismiss-install" aria-label="No mostrar más">${icon('x')}</button>
  </aside>`;
}

function viewHome() {
  const y = currentYear();
  if (!hasYear(y)) return errorCard(y);
  const cal = calendar();
  const today = state.today;
  const todays = cal.holidaysOn(today);
  const future = groupByDate(cal.list.filter((h) => h.date > today));
  const hero = todays.length
    ? nextCard(cal, { date: today, holidays: todays }, { today: true, following: future[0] })
    : future.length ? nextCard(cal, future[0]) : emptyNext();
  const runs = longWeekends(cal, addDays(today, -7), addDays(today, 400)).filter((r) => r.end >= today).slice(0, 3);
  const upcoming = future.slice(todays.length ? 0 : 1).slice(0, 5);
  const offline = navigator.onLine === false ? '<p class="note">Sin conexión: estás viendo los feriados guardados.</p>' : '';
  return `<div class="home">
    <div class="home-main">${offline}${hero}${installRow()}</div>
    <div class="home-side">
      <section class="section" aria-labelledby="h-next">
        <div class="section-head"><h2 id="h-next">Próximos feriados</h2><a href="#calendario">Ver todos</a></div>
        ${upcoming.length ? `<ul class="rows">${upcoming.map((g) => holidayRow(g, { showLong: false })).join('')}</ul>` : emptyNote('No hay más feriados publicados por ahora.')}
      </section>
      <section class="section" aria-labelledby="h-lw">
        <div class="section-head"><h2 id="h-lw">Fines de semana largos</h2><a href="#vacaciones">Ver todos</a></div>
        ${runs.length ? `<ul class="rows">${runs.map((r) => longWeekendRow(r, { showYear: true })).join('')}</ul>` : emptyNote('No hay fines de semana largos en los próximos meses.')}
      </section>
    </div>
  </div>`;
}

// ---------- view: calendario ----------

function monthList(groups, runsByDate) {
  const byMonth = new Map();
  for (const g of groups) {
    const m = monthOf(g.date);
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m).push(g);
  }
  return `<div class="months-list">${[...byMonth].map(([m, gs]) => `<section class="month">
    <h2>${MONTHS[m]}</h2>
    <ul class="rows">${gs.map((g) => holidayRow(g, { runsByDate })).join('')}</ul>
  </section>`).join('')}</div>`;
}

function dayDetail(iso, cal, runs) {
  if (!iso) return '<p class="muted">Toca un feriado para ver el detalle.</p>';
  const g = { date: iso, holidays: cal.holidaysOn(iso) };
  const run = runs.find((r) => r.start <= iso && iso <= r.end);
  const n = daysBetween(state.today, iso);
  const when = n > 1 ? `en ${num(n)} días` : n === 1 ? 'mañana' : n === 0 ? 'hoy' : '';
  const sub = [capitalize(WEEKDAYS[weekday(iso)]), groupInalienable(g) ? 'irrenunciable' : '', run ? `${run.days} días libres` : '', when]
    .filter(Boolean).join(' · ');
  return `<div class="row-date"><span class="row-day">${dayOf(iso)}</span><span class="row-month">${MONTHS_SHORT[monthOf(iso)]}</span></div>
    <div><p class="row-title">${esc(groupName(g))}</p><p class="row-sub">${esc(sub)}</p></div>`;
}

function yearGrid(year, cal, runs, nextDate) {
  const longDays = new Set(runs.flatMap((r) => eachDay(r.start, r.end)));
  const months = MONTHS.map((name, m) => {
    const cells = [];
    const lead = (weekday(isoOf(year, m, 1)) + 6) % 7; // weeks start on Monday
    for (let i = 0; i < lead; i++) cells.push('<span></span>');
    for (let d = 1; d <= daysInMonth(year, m); d++) {
      const iso = isoOf(year, m, d);
      const cls = ['d'];
      if (isWeekend(iso)) cls.push('is-weekend');
      if (longDays.has(iso)) cls.push('is-long');
      if (iso === state.today) cls.push('is-today');
      const hs = cal.holidaysOn(iso);
      if (hs.length) {
        cls.push('is-holiday');
        if (iso === state.selectedDate) cls.push('is-selected');
        const label = `${formatLong(iso)}: ${hs.map((h) => h.name).join(' y ')}`;
        cells.push(`<button type="button" class="${cls.join(' ')}" data-action="select-day" data-date="${iso}" aria-label="${esc(label)}">${d}</button>`);
      } else {
        cells.push(`<span class="${cls.join(' ')}">${d}</span>`);
      }
    }
    return `<section class="mm" aria-label="${capitalize(name)}">
      <h3>${capitalize(name)}</h3>
      <div class="mm-grid"><b>L</b><b>M</b><b>M</b><b>J</b><b>V</b><b>S</b><b>D</b>${cells.join('')}</div>
    </section>`;
  });
  const inYear = (iso) => iso && yearOf(iso) === year;
  if (!inYear(state.selectedDate) || !cal.isHoliday(state.selectedDate)) {
    state.selectedDate = inYear(nextDate) ? nextDate : cal.between(`${year}-01-01`, `${year}-12-31`)[0]?.date ?? null;
  }
  return `<div class="months">${months.join('')}</div>
    <p class="legend" aria-hidden="true"><span><i class="h"></i>Feriado</span><span><i class="l"></i>Fin de semana largo</span><span><i class="today"></i>Hoy</span></p>
    <div class="day-detail" id="day-detail" aria-live="polite">${dayDetail(state.selectedDate, cal, runs)}</div>`;
}

function viewCalendar(arg) {
  const year = routeYear(arg);
  const nav = `<div class="yearnav">${yearLink('calendario', year - 1, 'left')}<h1 class="yearnav-title"><span>Feriados</span><b>${year}</b></h1>${yearLink('calendario', year + 1, 'right')}</div>`;
  if (!hasYear(year)) return nav + errorCard(year);
  const list = yearList(year);
  if (!list.length) return nav + emptyYear(year);
  const cal = calendar();
  const runs = longWeekends(cal, `${year}-01-01`, `${year}-12-31`);
  const groups = groupByDate(list);
  const nextDate = groups.find((g) => g.date >= state.today)?.date;
  for (const g of groups) g.isNext = g.date === nextDate;
  const summary = `${plural(list.length, 'feriado', 'feriados')} · ${plural(runs.length, 'fin de semana largo', 'fines de semana largos')}`;
  const isYear = state.calendarView === 'year';
  return `<div class="cal-head">
      <p class="summary">${summary}</p>
      ${nav}
      <div class="seg" role="group" aria-label="Vista">
        <button type="button" data-action="calendar-view" data-view="list" aria-pressed="${!isYear}">Lista</button>
        <button type="button" data-action="calendar-view" data-view="year" aria-pressed="${isYear}">Año</button>
      </div>
    </div>
    ${isYear ? yearGrid(year, cal, runs, nextDate) : monthList(groups, runsByHolidayDate(runs))}
    <div class="actions">
      <button class="btn" type="button" data-action="ics-year" data-year="${year}">${icon('calendar-plus')}Agregar ${year} a mi calendario</button>
      <button class="btn-icon" type="button" data-action="share-year" data-year="${year}" aria-label="Compartir">${icon('share')}</button>
    </div>`;
}

// ---------- view: vacaciones ----------

function periodOptions() {
  const y = currentYear();
  const options = [{ value: 'next12', label: 'En los próximos 12 meses' }, { value: `y${y}`, label: `En lo que queda de ${y}` }];
  if (yearList(y + 1).length) options.push({ value: `y${y + 1}`, label: `En todo ${y + 1}` });
  return options;
}

function periodRange(period) {
  const y = currentYear();
  if (period === `y${y}`) return [state.today, `${y}-12-31`];
  if (period === `y${y + 1}`) return [`${y + 1}-01-01`, `${y + 1}-12-31`];
  return [state.today, addDays(state.today, 364)];
}

function plannerResults() {
  const [from, to] = periodRange(state.period);
  const cal = calendar();
  const plans = planVacations(cal, from, to, state.budget, 3);
  if (!plans.length) return `<li>${emptyNote('No encontramos fechas en este periodo.')}</li>`;
  return plans.map((p) => {
    const ratio = (p.days / p.used).toLocaleString('es-CL', { maximumFractionDigits: 1 });
    const year = yearOf(p.start) === yearOf(p.end) && yearOf(p.end) !== currentYear() ? ` ${yearOf(p.end)}` : '';
    const take = consecutiveRuns(p.take).map(([a, b]) => (a === b ? formatShort(a) : formatShortRange(a, b))).join(', ');
    return `<li class="plan">
      <div class="plan-top"><p class="plan-days"><b>${p.days}</b>días libres</p><span class="plan-ratio">rinde ×${ratio}</span></div>
      <p class="plan-range">${esc(capitalize(formatShortRange(p.start, p.end)))}${year}${p.holidays.length ? ` · ${esc(p.holidays.map((h) => h.name).join(' y '))}` : ''}</p>
      ${strip(p.start, p.end, cal, p.take)}
      <p class="plan-take"><span>Pides</span> ${esc(take)}</p>
    </li>`;
  }).join('');
}

function plannerSection() {
  const options = periodOptions();
  if (!options.some((o) => o.value === state.period)) state.period = 'next12';
  return `<section class="planner" aria-labelledby="h-plan">
    <h2 class="planner-q" id="h-plan">¿Cuántos días de vacaciones tienes?</h2>
    <div class="budget" role="group" aria-label="Días de vacaciones">
      <button type="button" data-action="budget" data-step="-1" aria-label="Un día menos">${icon('minus')}</button>
      <output id="budget" aria-live="polite">${state.budget}</output>
      <button type="button" data-action="budget" data-step="1" aria-label="Un día más">${icon('plus')}</button>
    </div>
    <p class="budget-unit">días hábiles</p>
    <label class="period"><span class="sr-only">Periodo</span>
      <select id="period">${options.map((o) => `<option value="${o.value}"${o.value === state.period ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select>
    </label>
    <ol class="plans" id="plans">${plannerResults()}</ol>
    <p class="legend" aria-hidden="true"><span><i class="h"></i>Feriado</span><span><i class="t"></i>Vacaciones</span><span><i></i>Fin de semana</span></p>
  </section>`;
}

function updatePlanner() {
  const out = document.getElementById('budget');
  const list = document.getElementById('plans');
  if (out) out.textContent = String(state.budget);
  if (list) list.innerHTML = plannerResults();
}

function longWeekendsSection(year) {
  const head = (title, id) => `<div class="section-head"><h2 id="${id}">${title}</h2>${yearPicker('vacaciones', year)}</div>`;
  if (!hasYear(year)) return `<section class="section">${head('Fines de semana largos', 'h-lw')}${errorCard(year)}</section>`;
  if (!yearList(year).length) return `<section class="section">${head('Fines de semana largos', 'h-lw')}${emptyYear(year)}</section>`;
  const cal = calendar();
  const runs = longWeekends(cal, `${year}-01-01`, `${year}-12-31`);
  const found = bridges(cal, `${year}-01-01`, `${year}-12-31`, 2);
  return `<section class="section" aria-labelledby="h-lw">
      ${head('Fines de semana largos', 'h-lw')}
      ${runs.length ? `<ul class="rows">${runs.map((r) => longWeekendRow(r)).join('')}</ul>` : emptyNote('Este año no hay fines de semana largos.')}
    </section>
    <section class="section" aria-labelledby="h-br">
      <div class="section-head"><h2 id="h-br">Puentes ${year}</h2></div>
      <p class="section-note">Pide 1 o 2 días y junta varios días libres.</p>
      ${found.length ? `<ul class="rows">${found.map((b) => bridgeRow(b)).join('')}</ul>` : emptyNote('Este año no hay puentes.')}
    </section>`;
}

function viewVacations(arg) {
  const y = currentYear();
  if (!hasYear(y)) return errorCard(y);
  return `<h1 class="page-title">Vacaciones</h1>
    <div class="split">
      <div>${plannerSection()}</div>
      <div class="split-side">${longWeekendsSection(routeYear(arg))}</div>
    </div>`;
}

// ---------- view: días hábiles ----------

function viewWorkdays() {
  const wd = state.wd;
  wd.from ??= state.today;
  wd.to ??= addDays(state.today, 30);
  wd.start ??= state.today;
  const limits = `min="${FIRST_YEAR}-01-01" max="${maxYear()}-12-31"`;
  const fields = wd.mode === 'between'
    ? `<label class="field"><span class="label">Desde</span><input type="date" name="from" value="${wd.from}" ${limits} required></label>
       <label class="field"><span class="label">Hasta</span><input type="date" name="to" value="${wd.to}" ${limits} required></label>`
    : `<label class="field"><span class="label">Desde</span><input type="date" name="start" value="${wd.start}" ${limits} required></label>
       <label class="field"><span class="label">Días hábiles</span><input type="number" name="count" value="${wd.count}" min="1" max="999" inputmode="numeric" required></label>`;
  return `<h1 class="page-title">Días hábiles</h1>
    <div class="split">
      <div class="section">
        <form class="form" id="wd-form" novalidate>
          <div class="seg" role="group" aria-label="Tipo de cálculo">
            <button type="button" data-action="wd-mode" data-mode="between" aria-pressed="${wd.mode === 'between'}">Entre fechas</button>
            <button type="button" data-action="wd-mode" data-mode="add" aria-pressed="${wd.mode === 'add'}">Plazo</button>
          </div>
          <div class="form-row">${fields}</div>
          <label class="check"><input type="checkbox" name="saturday"${wd.saturday ? ' checked' : ''}> Contar sábados como hábiles</label>
        </form>
      </div>
      <div id="wd-result" aria-live="polite"></div>
    </div>`;
}

function dataWarnings(years) {
  const notes = [];
  for (const y of years) {
    if (state.failed.has(y)) notes.push(`No pudimos cargar los feriados de ${y}; ese año solo se descuentan fines de semana.`);
    else if (y > maxYear() || !yearList(y).length) notes.push(`Aún no hay feriados publicados para ${y}; ese año solo se descuentan fines de semana.`);
  }
  return notes.map((n) => `<p class="note">${esc(n)}</p>`).join('');
}

function holidayRowsFor(list, cal) {
  if (!list.length) return '';
  const shown = list.slice(0, 20);
  const rows = shown.map((h) => {
    const sub = cal.isRestWeekday(h.date) ? `${capitalize(WEEKDAYS[weekday(h.date)])} · no se descuenta` : capitalize(WEEKDAYS[weekday(h.date)]);
    return `<li class="row">
      <div class="row-date"><span class="row-day">${dayOf(h.date)}</span><span class="row-month">${MONTHS_SHORT[monthOf(h.date)]}</span></div>
      <div><p class="row-title">${esc(h.name)}</p><p class="row-sub">${esc(sub)}</p></div><span class="row-end"></span>
    </li>`;
  }).join('');
  const more = list.length > shown.length ? `<p class="muted">y ${plural(list.length - shown.length, 'feriado más', 'feriados más')}</p>` : '';
  return `<ul class="rows">${rows}</ul>${more}`;
}

let workdaysSeq = 0;
async function updateWorkdays() {
  const box = document.getElementById('wd-result');
  if (!box) return;
  const seq = ++workdaysSeq;
  const wd = state.wd;
  const cal = () => calendar({ saturdayIsWorkday: wd.saturday });
  const minDate = `${FIRST_YEAR}-01-01`;
  const maxDate = `${maxYear()}-12-31`;
  const outOfRange = (iso) => iso < minDate || iso > maxDate;
  const message = (text) => `<p class="note">${esc(text)}</p>`;

  if (wd.mode === 'between') {
    if (!isIsoDate(wd.from) || !isIsoDate(wd.to)) {
      box.innerHTML = message('Elige las dos fechas.');
      return;
    }
    const [from, to] = wd.from <= wd.to ? [wd.from, wd.to] : [wd.to, wd.from];
    if (outOfRange(from) || outOfRange(to)) {
      box.innerHTML = message(`Usa fechas entre ${FIRST_YEAR} y ${maxYear()}.`);
      return;
    }
    const years = range(yearOf(from), yearOf(to));
    await ensureYears(years);
    if (seq !== workdaysSeq) return;
    const c = cal();
    const r = countWorkdays(c, from, to);
    box.innerHTML = `<section class="result">
      <p class="result-label">Días hábiles</p>
      <p class="result-big">${num(r.workdays)}</p>
      <p class="result-sub">Del ${esc(formatNumeric(from))} al ${esc(formatNumeric(to))}, ambos incluidos</p>
      <dl class="stats">
        <div><dt>Corridos</dt><dd>${num(r.calendarDays)}</dd></div>
        <div><dt>${wd.saturday ? 'Domingos' : 'Fines de semana'}</dt><dd>${num(r.restDays)}</dd></div>
        <div><dt>Feriados</dt><dd>${num(r.holidayDays)}</dd></div>
      </dl>
      ${holidayRowsFor(r.holidays, c)}
      ${dataWarnings(years)}
    </section>`;
    track('workdays_between');
    return;
  }

  const count = clampInt(wd.count, 1, 999, NaN);
  if (!isIsoDate(wd.start) || !Number.isFinite(count)) {
    box.innerHTML = message('Elige la fecha y cuántos días hábiles sumar (de 1 a 999).');
    return;
  }
  if (outOfRange(wd.start)) {
    box.innerHTML = message(`Usa una fecha entre ${FIRST_YEAR} y ${maxYear()}.`);
    return;
  }
  // The end year is unknown until we count, so load years until the result stays put.
  let years = [yearOf(wd.start), yearOf(wd.start) + 1];
  let end = wd.start;
  for (let i = 0; i < 6; i++) {
    await ensureYears(years);
    if (seq !== workdaysSeq) return;
    end = addWorkdays(cal(), wd.start, count);
    const needed = range(yearOf(wd.start), yearOf(end));
    const settled = needed.every((y) => hasYear(y) || state.failed.has(y) || y > maxYear());
    years = needed;
    if (settled) break;
  }
  const c = cal();
  const skipped = c.between(addDays(wd.start, 1), end).filter((h) => !c.isRestWeekday(h.date));
  box.innerHTML = `<section class="result">
    <p class="result-label">El plazo de ${plural(count, 'día hábil', 'días hábiles')} vence el</p>
    <p class="result-big result-big--date">${esc(capitalize(formatLong(end, { withYear: true })))}</p>
    <p class="result-sub">${plural(daysBetween(wd.start, end), 'día corrido', 'días corridos')} · se cuenta desde el día siguiente</p>
    ${holidayRowsFor(skipped, c)}
    ${dataWarnings(years)}
  </section>`;
  track('workdays_deadline');
}

function readWorkdaysForm(form) {
  const data = new FormData(form);
  const wd = state.wd;
  if (wd.mode === 'between') {
    wd.from = data.get('from') || null;
    wd.to = data.get('to') || null;
  } else {
    wd.start = data.get('start') || null;
    wd.count = data.get('count');
  }
  wd.saturday = data.get('saturday') === 'on';
}

// ---------- view: más ----------

function installGroup() {
  const mode = installMode();
  if (mode === 'installed') return '<h2>App instalada</h2><p>Ya la estás usando como app. Funciona sin internet.</p>';
  if (mode === 'prompt') {
    return `<h2>Instala la app</h2><p>Queda en tu pantalla de inicio y funciona sin internet.</p>
      <button class="btn btn--ink" type="button" data-action="install">${icon('install')}Instalar Feriados</button>`;
  }
  if (mode === 'ios') return `<h2>Instala la app</h2>${iosSteps()}`;
  return `<h2>Instala la app</h2>
    <ul class="steps">
      <li><strong>Android:</strong> en Chrome, menú ⋮ → <strong>Instalar app</strong>.</li>
      <li><strong>iPhone:</strong> en Safari, ${icon('share')} → <strong>Agregar a inicio</strong>.</li>
      <li><strong>Computador:</strong> ícono de instalar en la barra de direcciones.</li>
    </ul>`;
}

function iosSteps() {
  return `<ol class="steps">
    <li>Abre www.feriadosapp.com en <strong>Safari</strong>.</li>
    <li>Toca ${icon('share')} <strong>Compartir</strong>.</li>
    <li>Elige ${icon('plus-square')} <strong>Agregar a inicio</strong>.</li>
  </ol>`;
}

function viewMore() {
  const theme = readTheme();
  const themeButton = (value, label) => `<button type="button" data-action="theme" data-theme="${value}" aria-pressed="${theme === value}">${label}</button>`;
  return `<h1 class="page-title">Más</h1>
    <div class="more">
      <section class="group">${installGroup()}</section>
      <section class="group">
        <h2>Apariencia</h2>
        <div class="seg" role="group" aria-label="Tema">${themeButton('light', 'Claro')}${themeButton('dark', 'Oscuro')}${themeButton('auto', 'Automático')}</div>
      </section>
      <section class="group group--wide">
        <h2>Feriados por año</h2>
        <div class="years">${[...PAGE_YEARS].reverse().map((y) => `<a href="/${y}/">${y}</a>`).join('')}</div>
      </section>
      <section class="group" id="api">
        <h2>¿Eres desarrollador?</h2>
        <p>Usa gratis la API de feriados de Boostr, la misma de esta app.</p>
        <pre><code>GET https://api.boostr.cl/holidays/2027.json</code></pre>
        <a class="btn" href="${API_DOCS_URL}" target="_blank" rel="noopener">${icon('external')}Ver documentación</a>
      </section>
      <section class="group">
        <h2>Acerca de</h2>
        <p>Gratis y sin internet después de la primera visita. Datos de la API de feriados de Boostr.</p>
        <p class="links">Hecho con ❤️ por <a href="https://boostr.cl" target="_blank" rel="noopener">Boostr.cl</a> · <a href="https://boostr.cl/privacy_policy/feriadosapp" target="_blank" rel="noopener">Privacidad</a> · <a href="https://twitter.com/feriadosapp_cl" target="_blank" rel="noopener">X</a></p>
      </section>
    </div>`;
}

// ---------- router ----------

function routeYear(arg) {
  const y = Number.parseInt(arg, 10);
  return Number.isFinite(y) ? clampYear(y) : currentYear();
}

const routes = {
  inicio: {
    title: () => 'Feriados Chile: ¿cuánto falta para el próximo feriado?',
    years: () => [currentYear(), currentYear() + 1],
    view: viewHome,
  },
  calendario: {
    title: (arg) => `Feriados ${routeYear(arg)} · Feriados Chile`,
    years: (arg) => [routeYear(arg)],
    view: viewCalendar,
  },
  vacaciones: {
    title: () => 'Vacaciones y fines de semana largos · Feriados Chile',
    years: (arg) => [currentYear(), currentYear() + 1, routeYear(arg)],
    view: viewVacations,
  },
  habiles: {
    title: () => 'Calculadora de días hábiles · Feriados Chile',
    years: () => [currentYear(), currentYear() + 1],
    view: viewWorkdays,
  },
  mas: {
    title: () => 'Más · Feriados Chile',
    years: () => [],
    view: viewMore,
  },
};

function parseRoute() {
  const [name = '', arg = ''] = decodeURIComponent(location.hash.replace(/^#\/?/, '')).split('/');
  return routes[name] ? { name, arg } : { name: 'inicio', arg: '' };
}

let renderSeq = 0;
let shownRoute = '';

async function render({ keepScroll = false } = {}) {
  const seq = ++renderSeq;
  const { name, arg } = parseRoute();
  const route = routes[name];
  document.body.dataset.route = name;
  for (const link of document.querySelectorAll('[data-route]')) {
    if (link.dataset.route === name) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  const needed = route.years(arg);
  if (needed.some((y) => y >= FIRST_YEAR && y <= maxYear() && !hasYear(y))) {
    // Same section (e.g. another year): keep the current content dimmed instead of a skeleton.
    if (shownRoute !== name) $view.innerHTML = skeleton();
    else $view.classList.add('is-loading');
    await ensureYears(needed);
    if (seq !== renderSeq) return;
  }
  $view.classList.remove('is-loading');
  $view.innerHTML = route.view(arg);
  document.title = route.title(arg);
  if (!keepScroll && shownRoute !== name) window.scrollTo(0, 0);
  shownRoute = name;
  if (name === 'habiles') updateWorkdays();
}

// ---------- actions ----------

function downloadIcs(holidays, filename, name) {
  const blob = new Blob([buildIcs(holidays, { name })], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  toast('Ábrelo para agregarlo a tu calendario. Trae un aviso el día antes.');
  track('download_ics', { file: filename });
}

const actions = {
  retry() {
    state.failed.clear();
    render();
  },
  'ics-day'(el) {
    const holidays = calendar().holidaysOn(el.dataset.date);
    if (holidays.length) downloadIcs(holidays, `feriado-${el.dataset.date}.ics`, 'Feriados Chile');
  },
  'ics-year'(el) {
    const year = Number(el.dataset.year);
    downloadIcs(yearList(year), `feriados-chile-${year}.ics`, `Feriados Chile ${year}`);
  },
  'share-next'(el) {
    const g = { date: el.dataset.date, holidays: calendar().holidaysOn(el.dataset.date) };
    const n = daysBetween(state.today, g.date);
    const text = n === 1
      ? `¡Mañana es feriado! ${groupName(g)}.`
      : `Faltan ${n} días para ${groupName(g)} (${formatLong(g.date)}).`;
    shareLink({ title: 'Feriados Chile', text, url: `${SITE_URL}/` });
  },
  'share-today'() {
    const g = { date: state.today, holidays: calendar().holidaysOn(state.today) };
    shareLink({ title: 'Feriados Chile', text: `Hoy es feriado: ${groupName(g)}.`, url: `${SITE_URL}/` });
  },
  'share-year'(el) {
    const year = Number(el.dataset.year);
    const url = PAGE_YEARS.includes(year) ? `${SITE_URL}/${year}/` : `${SITE_URL}/#calendario/${year}`;
    shareLink({ title: `Feriados ${year} en Chile`, text: `Los feriados de ${year} en Chile:`, url });
  },
  'share-app'() {
    shareLink({ title: 'Feriados Chile', text: '¿Cuánto falta para el próximo feriado?', url: `${SITE_URL}/` });
  },
  'calendar-view'(el) {
    state.calendarView = el.dataset.view === 'year' ? 'year' : 'list';
    prefs.set('calendarView', state.calendarView);
    render({ keepScroll: true });
  },
  'select-day'(el) {
    state.selectedDate = el.dataset.date;
    for (const cell of document.querySelectorAll('.mm-grid .is-selected')) cell.classList.remove('is-selected');
    el.classList.add('is-selected');
    const year = yearOf(state.selectedDate);
    const cal = calendar();
    const runs = longWeekends(cal, `${year}-01-01`, `${year}-12-31`);
    const box = document.getElementById('day-detail');
    if (box) box.innerHTML = dayDetail(state.selectedDate, cal, runs);
  },
  budget(el) {
    state.budget = clampInt(state.budget + Number(el.dataset.step), 1, 30, state.budget);
    prefs.set('budget', String(state.budget));
    updatePlanner();
    track('plan_vacations', { days: state.budget });
  },
  'wd-mode'(el) {
    state.wd.mode = el.dataset.mode === 'add' ? 'add' : 'between';
    render({ keepScroll: true });
  },
  async install() {
    if (!installPrompt) return;
    const prompt = installPrompt;
    installPrompt = null;
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    track('install_prompt', { outcome });
    refreshInstallUi();
  },
  'ios-help'() {
    const dialog = document.getElementById('ios-dialog');
    if (dialog?.showModal) dialog.showModal();
    else location.hash = '#mas';
  },
  'close-dialog'(el) {
    el.closest('dialog')?.close();
  },
  'dismiss-install'(el) {
    prefs.set('installDismissed', '1');
    el.closest('.install')?.remove();
  },
  theme(el) {
    saveTheme(el.dataset.theme);
    for (const b of document.querySelectorAll('[data-action="theme"]')) b.setAttribute('aria-pressed', String(b === el));
  },
};

document.addEventListener('click', (event) => {
  const el = event.target.closest('[data-action]');
  if (!el || !actions[el.dataset.action]) return;
  actions[el.dataset.action](el, event);
});

$view.addEventListener('change', (event) => {
  if (event.target.id === 'period') {
    state.period = event.target.value;
    updatePlanner();
  }
});

$view.addEventListener('input', (event) => {
  const form = event.target.form;
  if (form?.id !== 'wd-form') return;
  readWorkdaysForm(form);
  updateWorkdays();
});
$view.addEventListener('submit', (event) => event.preventDefault());

// ---------- start ----------

function refreshToday() {
  const today = chileToday();
  if (today === state.today) return;
  state.today = today;
  if (parseRoute().name !== 'habiles') render({ keepScroll: true });
}

onHolidaysUpdated((year, holidays) => {
  state.years.set(year, holidays);
  if (parseRoute().name === 'habiles') updateWorkdays();
  else render({ keepScroll: true });
});

window.addEventListener('hashchange', () => render());
window.addEventListener('online', () => parseRoute().name === 'inicio' && render({ keepScroll: true }));
window.addEventListener('offline', () => parseRoute().name === 'inicio' && render({ keepScroll: true }));
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && refreshToday());
setInterval(refreshToday, 60000);

applyTheme(readTheme());
initAnalytics();
registerServiceWorker();
render();
