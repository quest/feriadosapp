// Generates the static year pages (/2013/ … /2027/), sitemap.xml, robots.txt, js/years.js and the
// year links in the footer of index.html, from api.boostr.cl.
// Usage: npm run pages
// Run it again whenever the API publishes or corrects holidays, then commit the result.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HolidayCalendar, bridges, fromApi, longWeekends } from '../js/lib/holidays.js';
import { MONTHS_SHORT, WEEKDAYS, capitalize, chileToday, dayOf, formatLong, formatRange, formatShort, formatShortRange, monthOf, weekday, yearOf } from '../js/lib/dates.js';
import { API_BASE, API_DOCS_URL, FIRST_YEAR, SITE_URL } from '../js/config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LAST_YEAR = yearOf(chileToday()) + 2;
// Cloudflare answers 429 after a burst of ~5 requests: go slowly and honor Retry-After.
const GAP_MS = 2500;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const listJoin = (items) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`);

async function fetchYear(year) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(`${API_BASE}/${year}.json`, { headers: { Accept: 'application/json', 'User-Agent': 'feriadosapp-pages' } });
    if (res.status === 429) {
      const wait = Number(res.headers.get('retry-after')) || 10;
      console.log(`  429 en ${year}, espero ${wait + 1} s`);
      await sleep((wait + 1) * 1000);
      continue;
    }
    if (!res.ok) throw new Error(`La API respondió ${res.status} para ${year}`);
    const body = await res.json();
    if (body?.status !== 'success' || !Array.isArray(body.data)) throw new Error(`Respuesta inesperada para ${year}`);
    return body.data.map(fromApi).filter(Boolean).sort((a, b) => (a.date < b.date ? -1 : 1));
  }
  throw new Error(`La API siguió respondiendo 429 para ${year}`);
}

function between(html, name) {
  const start = `<!-- ${name}:start -->`;
  const end = `<!-- ${name}:end -->`;
  const i = html.indexOf(start);
  const j = html.indexOf(end);
  if (i < 0 || j < 0) throw new Error(`index.html no tiene los marcadores ${name}`);
  return { before: html.slice(0, i + start.length), inner: html.slice(i + start.length, j), after: html.slice(j) };
}

function yearPage(year, holidays, cal, years, sprite) {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const runs = longWeekends(cal, from, to);
  const found = bridges(cal, from, to, 1);
  const inalienable = holidays.filter((h) => h.inalienable);
  const runByDate = new Map();
  for (const r of runs) for (const h of r.holidays) runByDate.set(h.date, r);
  const url = `${SITE_URL}/${year}/`;
  const title = `Feriados ${year} en Chile: calendario y fines de semana largos`;
  const description = `Los ${holidays.length} feriados de ${year} en Chile: ${plural(inalienable.length, 'irrenunciable', 'irrenunciables')}, ${plural(runs.length, 'fin de semana largo', 'fines de semana largos')} y los días que conviene pedir para alargarlos.`;
  const lead = `${plural(holidays.length, 'feriado', 'feriados')}, ${plural(inalienable.length, 'irrenunciable', 'irrenunciables')} y ${plural(runs.length, 'fin de semana largo', 'fines de semana largos')}.`;

  const dateCell = (iso) => `<div class="row-date"><span class="row-day">${dayOf(iso)}</span><span class="row-month">${MONTHS_SHORT[monthOf(iso)]}</span></div>`;
  const lenCell = (days) => `<div class="row-date row-len"><b>${days}</b><span>días</span></div>`;
  const row = (left, titleText, sub) => `<li class="row">${left}<div><p class="row-title">${esc(titleText)}</p><p class="row-sub">${esc(sub)}</p></div><span class="row-end"></span></li>`;

  const holidayRows = holidays.map((h) => row(
    dateCell(h.date),
    h.name,
    [capitalize(WEEKDAYS[weekday(h.date)]), h.inalienable ? 'irrenunciable' : '', runByDate.has(h.date) ? 'fin de semana largo' : ''].filter(Boolean).join(' · '),
  )).join('\n          ');
  const runRows = runs.map((r) => row(lenCell(r.days), capitalize(formatRange(r.start, r.end)), r.holidays.map((h) => h.name).join(' y '))).join('\n          ');
  const bridgeRows = found.map((b) => row(lenCell(b.days), `Pide el ${formatShort(b.take[0])}`, `${capitalize(formatShortRange(b.start, b.end))} · ${b.holidays.map((h) => h.name).join(' y ')}`)).join('\n          ');

  const yearLinks = [...years].reverse()
    .map((y) => `<a href="/${y}/"${y === year ? ' aria-current="page"' : ''}>${y}</a>`).join('');

  const faq = [
    {
      q: `¿Cuántos feriados hay en ${year} en Chile?`,
      a: `En ${year} hay ${holidays.length} feriados en Chile${runs.length ? ` y ${plural(runs.length, 'fin de semana largo', 'fines de semana largos')}` : ''}.`,
    },
    ...(inalienable.length ? [{
      q: `¿Cuáles son los feriados irrenunciables de ${year}?`,
      a: `${listJoin(inalienable.map((h) => `${h.name} (${formatLong(h.date)})`))}. En esos días los trabajadores del comercio tienen descanso obligatorio, así que la mayoría de las tiendas cierra.`,
    }] : []),
    ...(runs.length ? [{
      q: `¿Cuáles son los fines de semana largos de ${year}?`,
      a: `${capitalize(listJoin(runs.map((r) => `del ${formatRange(r.start, r.end)} (${r.days} días)`)))}.`,
    }] : []),
  ];
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Feriados Chile', item: `${SITE_URL}/` },
          { '@type': 'ListItem', position: 2, name: `Feriados ${year}`, item: url },
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
      },
    ],
  };

  return `<!doctype html>
<html lang="es-CL">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${url}">
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="icon" href="/icons/icon.svg" type="image/svg+xml">
  <link rel="icon" href="/favicon.ico" sizes="32x32">
  <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
  <meta name="theme-color" content="#ffffff">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="Feriados">
  <meta property="og:type" content="article">
  <meta property="og:locale" content="es_CL">
  <meta property="og:site_name" content="Feriados Chile">
  <meta property="og:title" content="${esc(`Feriados ${year} en Chile`)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${SITE_URL}/icons/og.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@feriadosapp_cl">
  <script>
    try { var t = localStorage.getItem('pref:theme'); if (t === 'dark' || t === 'auto') document.documentElement.dataset.theme = t; } catch (e) {}
  </script>
  <link rel="stylesheet" href="/css/app.css">
  <script type="module" src="/js/page.js"></script>
  <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
</head>
<body data-route="anio">
${sprite.trim()}
  <a class="skip" href="#contenido">Saltar al contenido</a>
  <header class="appbar">
    <a class="brand" href="/#inicio"><img src="/icons/icon.svg" width="28" height="28" alt=""><span>Feriados Chile</span></a>
    <div class="appbar-actions">
      <button class="btn-icon btn-icon--plain" type="button" data-action="share-page" data-text="${esc(`Los feriados de ${year} en Chile:`)}" aria-label="Compartir esta página"><svg class="i" aria-hidden="true"><use href="#i-share"></use></svg></button>
      <a class="btn-icon btn-icon--plain" href="/#mas" aria-label="Más opciones"><svg class="i" aria-hidden="true"><use href="#i-dots"></use></svg></a>
    </div>
  </header>

  <main class="page" id="contenido">
    <div class="section">
      <nav class="breadcrumbs" aria-label="Ruta"><a href="/">Feriados Chile</a> › ${year}</nav>
      <h1 class="page-title">Feriados ${year} en Chile</h1>
      <p class="lead">${esc(lead)}</p>
    </div>
    <div class="actions actions--start">
      <a class="btn btn--ink" href="/#calendario/${year}"><svg class="i" aria-hidden="true"><use href="#i-calendar"></use></svg>Abrir en la app</a>
      <a class="btn" href="/#inicio">¿Cuánto falta para el próximo?</a>
    </div>

    <section class="section" aria-labelledby="h-lista">
      <div class="section-head"><h2 id="h-lista">Todos los feriados</h2></div>
      <ul class="rows">
          ${holidayRows}
      </ul>
    </section>

    <section class="section" aria-labelledby="h-largos">
      <div class="section-head"><h2 id="h-largos">Fines de semana largos</h2></div>
      ${runs.length ? `<ul class="rows">
          ${runRows}
      </ul>` : `<p class="empty">En ${year} no hay fines de semana largos.</p>`}
    </section>

    ${found.length ? `<section class="section" aria-labelledby="h-puentes">
      <div class="section-head"><h2 id="h-puentes">Puentes</h2></div>
      <p class="section-note">Con un día de vacaciones juntas un feriado con el fin de semana.</p>
      <ul class="rows">
          ${bridgeRows}
      </ul>
    </section>` : ''}

    <section class="cta">
      <h2>Lleva los feriados en tu celular</h2>
      <p>Cuenta regresiva, planificador de vacaciones y días hábiles. Gratis y sin internet.</p>
      <a class="btn btn--ink" href="/#mas">Instalar la app</a>
    </section>

    <section class="section faq" aria-labelledby="h-faq">
      <div class="section-head"><h2 id="h-faq">Preguntas frecuentes</h2></div>
      ${faq.map((f) => `<div><h3>${esc(f.q)}</h3><p>${esc(f.a)}</p></div>`).join('\n      ')}
    </section>

    <section class="section" aria-labelledby="h-anios">
      <div class="section-head"><h2 id="h-anios">Otros años</h2></div>
      <div class="years">${yearLinks}</div>
    </section>
  </main>

  <footer class="site-footer">
    <p>Datos de la <a href="${API_DOCS_URL}" target="_blank" rel="noopener">API de feriados de Boostr</a> · Hecho por <a href="https://boostr.cl" target="_blank" rel="noopener">Boostr.cl</a> · <a href="https://boostr.cl/privacy_policy/feriadosapp" target="_blank" rel="noopener">Privacidad</a></p>
  </footer>

  <nav class="tabbar" aria-label="Secciones">
    <a href="/#inicio"><svg class="i" aria-hidden="true"><use href="#i-home"></use></svg><span>Inicio</span></a>
    <a href="/#calendario/${year}" aria-current="page"><svg class="i" aria-hidden="true"><use href="#i-calendar"></use></svg><span>Calendario</span></a>
    <a href="/#vacaciones/${year}"><svg class="i" aria-hidden="true"><use href="#i-sun"></use></svg><span>Vacaciones</span></a>
    <a href="/#habiles"><svg class="i" aria-hidden="true"><use href="#i-briefcase"></use></svg><span>Días hábiles</span></a>
  </nav>
</body>
</html>
`;
}

async function main() {
  const indexPath = path.join(ROOT, 'index.html');
  const index = await readFile(indexPath, 'utf8');
  const sprite = between(index, 'shared:sprite').inner;

  const data = new Map();
  for (let year = FIRST_YEAR; year <= LAST_YEAR; year++) {
    if (data.size) await sleep(GAP_MS);
    const holidays = await fetchYear(year);
    console.log(`${year}: ${holidays.length} feriados`);
    if (holidays.length) data.set(year, holidays);
  }
  if (!data.size) throw new Error('La API no devolvió feriados: no se generó nada.');

  const years = [...data.keys()];
  const cal = new HolidayCalendar([...data.values()].flat());
  for (const year of years) {
    const dir = path.join(ROOT, String(year));
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'index.html'), yearPage(year, data.get(year), cal, years, sprite));
  }

  await writeFile(path.join(ROOT, 'js', 'years.js'),
    `// Generated by scripts/generate-pages.mjs: years that have a static page (/2026/ …). Do not edit.\nexport const PAGE_YEARS = [${years.join(', ')}];\n`);

  const links = between(index, 'generated:years');
  const footerLinks = [...years].reverse().map((y) => `<a href="/${y}/">${y}</a>`).join(' ');
  await writeFile(indexPath, `${links.before}\n      ${footerLinks}\n${links.after}`);

  const urls = [`${SITE_URL}/`, ...[...years].reverse().map((y) => `${SITE_URL}/${y}/`)];
  await writeFile(path.join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}
</urlset>
`);
  await writeFile(path.join(ROOT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);

  console.log(`Listo: ${years.length} páginas (${years[0]}–${years[years.length - 1]}), sitemap.xml, robots.txt, js/years.js e index.html.`);
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
