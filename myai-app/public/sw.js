// MyAI-RolePlay Service Worker
// Strategy: Network First with Cache Fallback for pages, Cache First for assets

const CACHE_NAME = 'myai-rp-v1';
const STATIC_ASSETS = [
    '/',
    '/manifest.json',
    '/pwa-icon-192.svg',
    '/pwa-icon-512.svg',
];

// Install: pre-cache shell
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
    );
    self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// Fetch: Network first for navigation, cache first for assets
self.addEventListener('fetch', (event) => {
    const { request } = event;

    // Skip non-GET and API calls
    if (request.method !== 'GET') return;
    if (request.url.includes('/api/') || request.url.includes('deepseek') || request.url.includes('openai')) return;

    // Navigation: network first
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                    return response;
                })
                .catch(() => caches.match(request))
        );
        return;
    }

    // Assets (JS, CSS, fonts, images): cache first
    event.respondWith(
        caches.match(request).then((cached) => {
            if (cached) return cached;
            return fetch(request).then((response) => {
                // Only cache successful same-origin responses
                if (response.ok && request.url.startsWith(self.location.origin)) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                }
                return response;
            });
        })
    );
});
