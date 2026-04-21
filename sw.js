/* Crypto Radar — Service Worker */
const CACHE = 'crypto-radar-v1';
const SHELL = ['/', '/index.html', '/engine.js', '/events-db.js', '/geo-intel.js',
               '/pulse.js', '/predict.js', '/portfolio.js', '/onchain.js', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Network-first for API calls, cache-first for app shell
  const url = new URL(e.request.url);
  const isAPI = ['api.', 'fapi.', 'fred.', 'tradier', 'coingecko', 'polymarket',
                 'kalshi', 'augmento', 'lunarcrush', 'blockchain.info', 'rss.app',
                 'messari', 'cryptopanic', 'alternative.me', 'binance']
                .some(h => url.hostname.includes(h));
  if (isAPI) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
  } else {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
        if (res.ok && e.request.method === 'GET') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }))
    );
  }
});
