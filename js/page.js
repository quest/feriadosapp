// Entry point of the static year pages (/2026/ …): analytics, offline support and the share button.

import { initAnalytics } from './analytics.js';
import { registerServiceWorker, shareLink } from './shell.js';

initAnalytics();
registerServiceWorker();

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action="share-page"]');
  if (!button) return;
  shareLink({ title: document.title, text: button.dataset.text || document.title, url: location.href.split('#')[0] });
});
