// Holidays from api.boostr.cl, cached in localStorage so the app opens instantly and works offline.
//
// Rules (see AGENTS.md, "API de feriados"):
// - A stored year is served right away. If it is older than FRESH_MS it is refreshed in the background
//   and listeners get the new list only when it changed.
// - Cloudflare answers 429 after a burst of ~5 requests, so requests are throttled to MAX_PER_WINDOW
//   every WINDOW_MS. That 429 carries no CORS headers: the browser sees it as a network error.
// - Bad answers are never stored (Cloudflare may cache an error body with status 200).

import { API_BASE } from '../config.js';
import { fromApi } from './holidays.js';

const STORAGE_PREFIX = 'feriados:v1:';
const FRESH_MS = 12 * 60 * 60 * 1000;
const WINDOW_MS = 10000;
const MAX_PER_WINDOW = 4;
const RETRY_DELAY_MS = 4000;

const memory = new Map();
const inFlight = new Map();
const listeners = new Set();
const sentAt = [];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class HolidaysApiError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}

function readStored(year) {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_PREFIX + year) ?? 'null');
    return value && Array.isArray(value.holidays) && typeof value.savedAt === 'number' ? value : null;
  } catch {
    return null;
  }
}

function writeStored(year, holidays) {
  try {
    localStorage.setItem(STORAGE_PREFIX + year, JSON.stringify({ savedAt: Date.now(), holidays }));
  } catch {
    // Private mode or full storage: the app still works with the in-memory copy.
  }
}

async function throttle() {
  for (;;) {
    const now = Date.now();
    while (sentAt.length && now - sentAt[0] > WINDOW_MS) sentAt.shift();
    if (sentAt.length < MAX_PER_WINDOW) {
      sentAt.push(now);
      return;
    }
    await sleep(WINDOW_MS - (now - sentAt[0]) + 50);
  }
}

async function download(year) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    await throttle();
    try {
      const res = await fetch(`${API_BASE}/${year}.json`, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new HolidaysApiError('http', `La API respondió con el código ${res.status}.`);
      const body = await res.json().catch(() => null);
      if (body?.status !== 'success' || !Array.isArray(body.data)) {
        throw new HolidaysApiError('format', 'La API respondió algo inesperado.');
      }
      return body.data
        .map(fromApi)
        .filter(Boolean)
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    } catch (err) {
      lastError = err;
      const retryable = !(err instanceof HolidaysApiError && err.kind === 'format') && navigator.onLine !== false;
      if (attempt === 0 && retryable) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      break;
    }
  }
  throw lastError;
}

function refresh(year) {
  if (inFlight.has(year)) return inFlight.get(year);
  const request = download(year)
    .then((holidays) => {
      const before = memory.get(year);
      memory.set(year, holidays);
      writeStored(year, holidays);
      if (before && JSON.stringify(before) !== JSON.stringify(holidays)) {
        for (const fn of listeners) fn(year, holidays);
      }
      return holidays;
    })
    .finally(() => inFlight.delete(year));
  request.catch(() => {}); // background refreshes fail silently; awaiting callers still get the error
  inFlight.set(year, request);
  return request;
}

/** Holidays of `year`, sorted by date. An empty list means the API has nothing for that year yet. */
export async function getYear(year) {
  if (memory.has(year)) return memory.get(year);
  const stored = readStored(year);
  if (stored) {
    memory.set(year, stored.holidays);
    if (Date.now() - stored.savedAt > FRESH_MS) refresh(year);
    return stored.holidays;
  }
  return refresh(year);
}

/** Calls `fn(year, holidays)` when a background refresh brings a different list. */
export function onHolidaysUpdated(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
