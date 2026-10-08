// Own service worker for /labor/. The parent app's worker (scope /OMLP/) is cache-first:
// this more specific scope takes the folder out of it, so updates always come from the network.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
