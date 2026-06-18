/* Onesign Odysseus service worker — push + install only (no offline caching,
 * since the app is server-rendered). Kept deliberately small. */

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

// A fetch handler (even a no-op passthrough) keeps the SW eligible for install
// on older engines. We don't call respondWith, so the browser fetches normally.
self.addEventListener('fetch', () => {});

self.addEventListener('push', (event) => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch {
        data = { title: 'Onesign Odysseus', body: event.data ? event.data.text() : '' };
    }

    const title = data.title || 'Onesign Odysseus';
    const options = {
        body: data.body || '',
        icon: '/api/icon?size=192',
        badge: '/api/icon?size=192',
        tag: data.tag || undefined,
        renotify: Boolean(data.tag),
        data: { url: data.url || '/' },
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = (event.notification.data && event.notification.data.url) || '/';
    event.waitUntil(
        self.clients
            .matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                for (const client of clientList) {
                    if ('focus' in client) {
                        if ('navigate' in client) {
                            client.navigate(url).catch(() => {});
                        }
                        return client.focus();
                    }
                }
                return self.clients.openWindow(url);
            })
    );
});
