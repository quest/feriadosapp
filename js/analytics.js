// Google Analytics 4. Page views of the hash routes come from GA4's enhanced measurement
// ("page changes based on browser history events"), so the app only sends custom events.

import { GA_MEASUREMENT_ID, PRODUCTION_HOSTS } from './config.js';

let enabled = false;

export function initAnalytics() {
  if (enabled || !GA_MEASUREMENT_ID || !PRODUCTION_HOSTS.includes(location.hostname)) return;
  enabled = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    // gtag.js expects the arguments object itself.
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', GA_MEASUREMENT_ID);
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`;
  document.head.append(script);
}

export function track(name, params = {}) {
  if (enabled) window.gtag('event', name, params);
}
