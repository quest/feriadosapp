// Pieces shared by the app (index.html) and the static year pages: service worker, theme,
// sharing and toasts.

import { track } from './analytics.js';

const THEME_KEY = 'pref:theme';
const THEME_COLORS = { light: '#ffffff', dark: '#121214' };

const isLocalHost = (host) => host === 'localhost' || host === '127.0.0.1' || /^(192\.168|10)\./.test(host);

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (isLocalHost(location.hostname) && !new URLSearchParams(location.search).has('sw')) {
    // While developing, always serve the latest files: drop any worker and its caches.
    // Add ?sw=1 to the URL to test the offline mode locally.
    navigator.serviceWorker.getRegistrations().then((list) => list.forEach((r) => r.unregister())).catch(() => {});
    if (window.caches) caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
    return;
  }
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

/** 'light' (default), 'dark' or 'auto' (follows the system). */
export function readTheme() {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'dark' || value === 'auto' ? value : 'light';
  } catch {
    return 'light';
  }
}

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'dark' || theme === 'auto') root.dataset.theme = theme;
  else delete root.dataset.theme;
  const dark = theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.content = THEME_COLORS[dark ? 'dark' : 'light'];
  }
}

export function saveTheme(theme) {
  try {
    if (theme === 'light') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Not persisted; the theme still applies for this visit.
  }
  applyTheme(theme);
}

/** The app bar is transparent over the top gradient and gets a frosted background once scrolled. */
export function watchScroll() {
  const update = () => document.documentElement.classList.toggle('is-scrolled', window.scrollY > 8);
  window.addEventListener('scroll', update, { passive: true });
  update();
}

let toastTimer;
export function toast(message) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.append(el);
  }
  el.textContent = message;
  el.hidden = false;
  el.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('is-visible');
    toastTimer = setTimeout(() => { el.hidden = true; }, 250);
  }, 3200);
}

/** Native share sheet on phones; copies the link elsewhere. */
export async function shareLink({ title, text, url }) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      track('share', { method: 'native', content: title });
    } catch (err) {
      if (err?.name !== 'AbortError') toast('No se pudo compartir. Intenta de nuevo.');
    }
    return;
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    toast('Copiamos el enlace. Pégalo donde quieras.');
    track('share', { method: 'clipboard', content: title });
  } catch {
    toast(url);
  }
}
