// Offline support: app shell and content are cached; requests go network-first so updates arrive
// as soon as there is a connection, with the cache as fallback. GitHub API calls are never cached.
const CACHE = 'leng-v1';
const SHELL = ['./', 'index.html', 'css/app.css', 'manifest.webmanifest', 'icons/icon.svg',
  'js/app.js', 'js/model.js', 'js/fsrs.js', 'js/srs.js', 'js/session.js', 'js/metrics.js', 'js/plan.js', 'js/assess.js', 'js/sync.js',
  'js/store.js', 'js/content.js', 'js/speech.js', 'js/ui.js',
  'js/views/today.js', 'js/views/session.js', 'js/views/dashboard.js', 'js/views/languages.js', 'js/views/assess.js', 'js/views/plan.js', 'js/views/library.js', 'js/views/settings.js',
  'content/core.tsv', 'content/grammar.json', 'content/rosetta.json', 'content/resources.json', 'content/assess.json', 'content/texts.json'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.hostname === 'api.github.com') return;
  const cacheable = url.origin === location.origin || url.hostname === 'cdn.jsdelivr.net';
  if (!cacheable) return;
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: url.origin === location.origin }).then((r) => r || caches.match('index.html'))),
  );
});
