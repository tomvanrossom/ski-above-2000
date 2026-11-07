const CACHE = "ski-above-2000-v1";
const SHELL = [
  "./", "index.html", "area.html", "compare.html", "shared.css", "favicon.svg", "manifest.webmanifest",
  "i18n.js", "common.js", "favourites.js", "price.js", "url-state.js", "compare-targets.js", "paging.js", "summary.js",
  "best-value.js", "compare.js", "area-chart.js", "area-map.js", "area.js", "data/areas.json", "data/meta.json",
];
// Versioned or immutable third-party files; map tiles and roses are left to the browser's HTTP cache.
const CACHE_FIRST_HOSTS = ["cdnjs.cloudflare.com", "fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (e) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw e;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === "opaque") cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin) event.respondWith(networkFirst(event.request));
  else if (CACHE_FIRST_HOSTS.includes(url.hostname)) event.respondWith(cacheFirst(event.request));
});
