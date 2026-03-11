const CACHE_NAME = 'cyberbus-v1';
const ASSETS = [ '/', '/index.html', '/css/styles.css', '/js/app.js', '/js/data.js' ];

self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});