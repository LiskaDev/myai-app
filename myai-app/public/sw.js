// MyAI-RolePlay Service Worker
// Strategy: Network First for everything, cache as fallback for offline
// 🔑 每次部署时更新此版本号，旧缓存会自动清除
const CACHE_VERSION = '__BUILD_TIME__';
const CACHE_NAME = `myai-rp-${CACHE_VERSION}`;

const STATIC_ASSETS = [
    '/',
    '/manifest.json',
    '/pwa-icon-192.svg',
    '/pwa-icon-512.svg',
];

// Install: pre-cache shell, skip waiting to activate immediately
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
    );
    self.skipWaiting();
});

// Activate: 🧹 删除所有旧版本缓存
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => {
                console.log('[SW] 清除旧缓存:', k);
                return caches.delete(k);
            }))
        )
    );
    self.clients.claim();
});

// Fetch: Network First for ALL requests (保证每次都拿最新代码)
self.addEventListener('fetch', (event) => {
    const { request } = event;

    // Skip non-GET and API calls
    if (request.method !== 'GET') return;
    if (request.url.includes('/api/') || request.url.includes('deepseek') || request.url.includes('openai') || request.url.includes('siliconflow')) return;

    // 🌐 Network First: 先尝试网络，失败才用缓存（离线模式）
    event.respondWith(
        fetch(request)
            .then((response) => {
                // 只缓存成功的、完整的同源响应
                if (response.ok && response.status === 200 && request.url.startsWith(self.location.origin)) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                }
                return response;
            })
            .catch(() => caches.match(request)) // 离线回退
    );
});
