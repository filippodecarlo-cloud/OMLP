// Factory Flow Lab service worker: network first (always the latest version),
// cache as a fallback so the app also works offline in the classroom.
const CACHE = 'flow-lab-v3';
const SHELL = ['./', './index.html', './styles.css', './engine.js', './app.js', './manifest.json', './icon-192.png', './icon-512.png',
    'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/hammer.js/2.0.8/hammer.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/chartjs-plugin-zoom/2.0.1/chartjs-plugin-zoom.min.js'];

self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => null).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
    event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;
    event.respondWith(
        fetch(event.request).then(resp => {
            if (resp && resp.ok && (resp.type === 'basic' || resp.type === 'cors')) {
                const copy = resp.clone();
                caches.open(CACHE).then(c => c.put(event.request, copy));
            }
            return resp;
        }).catch(() => caches.match(event.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
    );
});
