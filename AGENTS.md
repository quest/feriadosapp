# Reglas del proyecto — www.feriadosapp.com

PWA estática con los feriados de Chile: cuenta regresiva al próximo feriado, calendario, fines de
semana largos, puentes, planificador de vacaciones, calculadora de días hábiles y descarga a calendario
(.ics). Se instala en cualquier celular y funciona sin internet. Datos: API de feriados de Boostr.
Reemplazó (13-11-2026) a la landing de las apps nativas de Play Store y App Store, que ya no funcionan.

Respuestas, commits y textos de la interfaz en español de Chile; código y comentarios en inglés.
HTML, CSS y JS sin framework ni paso de compilación (módulos ES nativos).

## ⚠️ Los servicios de eClass no aplican (regla del usuario, 13-11-2026)

Es un proyecto de Boostr, no de eClass: kb.eclass.com, apidocs.eclass.com, el SSO ni otros servicios de
eClass aplican. Si un hook pide documentar en la KB, se cierra con
`eclass-obligacion done kb "<motivo>"`.

## ⚠️ Publicar = push a `gh-pages`

- El sitio vive en **GitHub Pages, rama `gh-pages`** (`git@github.com:quest/feriadosapp.git`), con
  dominio `www.feriadosapp.com` (archivo `CNAME`). Un push a `gh-pages` publica: **solo con pedido
  explícito del usuario**.
- La rama `master` tiene el sitio viejo (2016–2019) y no se publica.
- `.nojekyll` evita que GitHub Pages procese el sitio con Jekyll.

## Dónde vive cada cosa

- `index.html`: la app (rutas por hash: `#inicio`, `#calendario/2027`, `#vacaciones/2027`, `#habiles`,
  `#mas`). Tiene el sprite de íconos SVG entre `<!-- shared:sprite:… -->` (lo copia el generador) y los
  enlaces por año del pie entre `<!-- generated:years:… -->` (los escribe el generador).
- `js/app.js`: vistas, rutas y acciones de la app. `js/shell.js`: service worker, tema, compartir,
  avisos. `js/page.js`: entrada de las páginas por año. `js/analytics.js`: GA4. `js/config.js`: ID de
  GA4, URLs y primer año.
- `js/lib/`: lógica pura, compartida por el navegador y Node: `dates.js` (fechas), `holidays.js`
  (fines largos, puentes, planificador, días hábiles), `ics.js` (exportar), `api.js` (pedir y guardar).
- `2013/` … `2027/`, `sitemap.xml`, `robots.txt`, `js/years.js`: **generados** por
  `scripts/generate-pages.mjs`. No se editan a mano.
- `icons/`: `icon.svg` e `icon-maskable.svg` son la fuente; los PNG y `og.png` los genera
  `scripts/generate-icons.mjs`.
- `sw.js`, `manifest.webmanifest`: PWA.
- `tests/`: pruebas con `node --test` (datos de prueba de 2026 y 2027 en `tests/fixtures/`).
- `api/`: JSON estáticos viejos (2016–2020) de cuando el sitio tenía su propia API. Se dejaron por si
  alguien todavía los consume; el service worker no los toca.
- `screenshots/`: capturas de revisión, ignoradas por git.

## Diseño (decisión del usuario, 13-11-2026)

El primer diseño (verde azulado, fondo crema, mucho texto, una columna de 720 px) se descartó: se
parecía a **Lukas** (`Others/finanzas`, verde #0c7a63) y el usuario lo encontró oscuro, recargado y
chico en el computador. Pidió algo "hermoso, limpio, útil y fácil de leer". Reglas actuales:

- **Fondo blanco, texto casi negro y un solo acento: rojo `#d93025` = feriado** (los "días rojos" del
  calendario). El rojo no se usa para botones ni enlaces; los botones principales son negros
  (`--ink`). No volver al verde azulado ni a un estilo parecido a Lukas.
- **Poco texto:** sin párrafos de explicación, sin tipos ("Civil") ni etiquetas repetidas; un dato por
  línea. Las tiras de días (`strip`) solo van en el planificador.
- **Aire:** secciones separadas por espacio, filas con líneas finas, tarjetas grises suaves sin borde.
- **Tema claro por defecto**, también si el sistema está en oscuro. Oscuro y Automático son opciones
  en Más (`pref:theme`).
- **Computador (≥ 960 px):** ancho hasta 1160 px, navegación en la barra superior, dos columnas en
  Inicio, Vacaciones y Días hábiles, y el calendario anual en 4 columnas (vista por defecto ahí).
- Celular: 4 pestañas abajo (Inicio, Calendario, Vacaciones, Días hábiles); "Más" y "Compartir" van
  arriba a la derecha.
- Ícono: hoja de calendario blanca sobre rojo (`icons/icon.svg`).

## API de feriados (api.boostr.cl)

- `GET https://api.boostr.cl/holidays/{año}.json` → `{ status: "success", data: [{ date, title, type,
  inalienable, extra }] }`. Hay datos de 2013 a 2027 (13-11-2026). Un año sin datos responde
  `data: []`; la app lo muestra como "aún no publicados". Código de la API: `Others/api-boostr-cl`.
- **Rate limit de Cloudflare:** tras ~5 consultas seguidas responde 429, y ese 429 llega sin CORS (el
  navegador lo ve como error de red). Por eso `js/lib/api.js` limita a 4 consultas cada 10 s, reintenta
  una vez a los 4 s y guarda cada año en `localStorage` (`feriados:v1:<año>`): lo muestra al instante y lo
  refresca en segundo plano si tiene más de 12 h. El generador espera 2,5 s entre años.
- **Nunca se guarda una respuesta inválida** (Cloudflare puede cachear un error con HTTP 200): solo se
  acepta `status: "success"` con `data` arreglo, y cada ítem pasa por `fromApi`.
- **"Todos los Días Domingos"** (2013–2021, fecha 1 de enero) no es un feriado con fecha: `fromApi` lo
  descarta (los domingos ya son días libres). Pendiente en la API decidir si se saca del dataset.

## Reglas de negocio

- **"Hoy"** es la fecha civil de Chile (`chileToday()`, America/Santiago), no la del dispositivo. Las
  fechas se manejan como texto `AAAA-MM-DD` y la aritmética en días UTC (sin errores por horario de
  verano). En pantalla: texto largo ("viernes 25 de diciembre") o `DD-MM-AAAA`.
- **Fin de semana largo:** 3 o más días libres seguidos (sábados, domingos y feriados) con al menos un
  feriado.
- **Puente:** 1 o 2 días hábiles entre dos tramos libres, con un feriado en alguno de ellos.
- **Planificador:** para N días de vacaciones (1 a 30) recorre todas las ventanas que no pueden crecer sin
  gastar otro día, y las ordena por días libres seguidos (luego menos días pedidos, luego la más
  próxima). Muestra 5 que no se traslapan; primero las que tienen feriado. Periodos: próximos 12 meses,
  lo que queda del año, el año siguiente completo.
- **Días hábiles:** "entre dos fechas" cuenta ambas fechas incluidas; "calcular un plazo" empieza a contar
  el día siguiente a la fecha de inicio. Opción de contar el sábado como hábil. Un año sin feriados
  publicados solo descuenta fines de semana y se avisa.
- **.ics:** eventos de día completo con aviso a las 18:00 del día anterior (`TRIGGER:-PT6H`). Google
  Calendar ignora el aviso al importar; Apple Calendar lo respeta.

## PWA y caché

- `sw.js`: el shell (lista `SHELL`) se precarga y luego se sirve "stale-while-revalidate"; las páginas,
  "network first" con respaldo; la API, "network first" con la última respuesta buena.
- **Subir `VERSION` en `sw.js` en cada publicación que cambie archivos del shell.** Si no, los
  celulares ven la versión anterior en la primera carga. Si se agrega un JS o CSS nuevo, sumarlo a
  `SHELL`.
- Instalación: Android/Chrome usa `beforeinstallprompt` (botón "Instalar"); iPhone muestra los pasos
  (Compartir → Agregar a inicio).

## Analítica (GA4)

- ID `G-CEGYKJKVH5` (entregado por el usuario el 13-11-2026) en `GA_MEASUREMENT_ID` de
  `js/config.js`; vacío = sin analítica. Solo carga en `www.feriadosapp.com` y `feriadosapp.com`.
- Las vistas de cada ruta las mide la "medición mejorada" de GA4 (cambios de historial). La app manda
  eventos: `share`, `download_ics`, `install_prompt`, `app_installed`, `plan_vacations`,
  `workdays_between`, `workdays_deadline`.
- `start_url` del manifest es `/?utm_source=pwa`: las aperturas desde la app instalada salen como fuente
  `pwa`.

## Comandos

- `npm run serve`: sirve el sitio en http://localhost:8080 (Python). En `localhost` y en la red local
  el service worker **se desactiva** (siempre se ve lo último); para probar el modo sin internet en
  local, abrir con `?sw=1`.
- `npm test`: pruebas de `js/lib` (Node 20 o superior).
- `npm run pages`: vuelve a generar las páginas por año, el sitemap, `robots.txt`, `js/years.js` y el pie
  de `index.html` desde la API (unos 45 s). Correrlo cuando la API publique o corrija feriados, y
  cuando se cambie el diseño de esas páginas.
- `npm run icons`: vuelve a generar los PNG y `og.png` con Chrome headless (`CHROME_PATH` para otro
  navegador).

## Decisiones del usuario

- 13-11-2026: convertir el sitio en una PWA basada en la API de feriados de Boostr, con todo el
  alcance propuesto (inicio con cuenta regresiva, calendario, fines largos y puentes, planificador,
  días hábiles, .ics, compartir, modo oscuro, instalable y sin internet).
- 13-11-2026: analítica con GA4.
- 13-11-2026: mantener la sección "¿Eres desarrollador?" con el enlace a la documentación de la API.
- 13-11-2026: generar las páginas fijas por año para buscadores.
- 13-11-2026: rediseño claro y limpio, distinto de Lukas, y que aproveche el ancho del computador (ver
  "Diseño").

## Pendientes

- Fase 2 (requiere cambios en la API de Boostr): notificaciones push ("mañana es feriado"), calendario
  .ics suscribible que se actualice solo, y feriados regionales (7 de junio en Arica, 20 de agosto en
  Chillán), que hoy no vienen en el dataset.
