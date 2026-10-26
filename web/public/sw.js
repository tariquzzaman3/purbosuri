// A deliberately empty service worker: it lets browsers offer "install", and it caches
// nothing, so people always get the latest version of the app.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
