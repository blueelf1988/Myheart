// BrandCoach PWA Service Worker
const CACHE_NAME = 'brandcoach-v4';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './demo-mode.js',
  './manifest.json',
];

// 安装：缓存核心资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS).catch(() => {
        // 部分资源可能不存在，忽略错误
        return Promise.resolve();
      });
    })
  );
  self.skipWaiting();
});

// 激活：清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

// 拦截请求：缓存优先 + 网络更新
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 只缓存 GET 请求
  if (event.request.method !== 'GET') return;

  // API 请求走网络，不缓存
  if (url.pathname.startsWith('/scripts') ||
      url.pathname.startsWith('/srs') ||
      url.pathname.startsWith('/sessions') ||
      url.pathname.startsWith('/credits') ||
      url.pathname.startsWith('/me/') ||
      url.pathname.startsWith('/admin/') ||
      url.pathname.startsWith('/health') ||
      url.pathname.startsWith('/coaching/') ||
      url.pathname.startsWith('/subscriptions/') ||
      url.pathname.startsWith('/characters/') ||
      url.pathname.startsWith('/i18n/')) {
    return;
  }

  // 静态资源：缓存优先
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        // 有缓存就返回，同时后台更新
        fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, response.clone());
            });
          }
        }).catch(() => {});
        return cached;
      }
      // 没有缓存，从网络获取并缓存
      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200) return response;
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return response;
      }).catch(() => {
        // 离线时返回首页
        if (event.request.mode === 'navigate') {
          return caches.match('./');
        }
        return new Response('Offline', { status: 503 });
      });
    })
  );
});
