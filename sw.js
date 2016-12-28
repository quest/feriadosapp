var cacheName = 'feriados-dev-1';
var filesToCache = [
  '/',
  '/index.html',
  '/js/index.js',
  '/css/index.css',
  '/img/giftly.png',
  '/holidays.json'
];

self.addEventListener('install', function(e) {
  self.skipWaiting();
  // e.waitUntil(
  //   caches.open(cacheName).then(function(cache) {
  //     return cache.addAll(filesToCache).then(function() {
  //       return self.skipWaiting();
  //     });
  //   })
  // );
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keyList) {
      return Promise.all(keyList.map(function(key) {
        if (key !== cacheName) {
          return caches.delete(key);
        }
      }));
    })
  );
});

self.addEventListener('fetch', function(e) {
  e.respondWith(
    caches.match(e.request).then(function(response) {
      return response || fetch(e.request);
    })
  );
});

self.addEventListener('push', function(event) {
  console.log('Push message received', event);
  console.log(event.data);
  var title = 'Push message';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: 'The Message',
      icon: 'img/icon-200x200.png',
      tag: 'my-tag'
    }));
});