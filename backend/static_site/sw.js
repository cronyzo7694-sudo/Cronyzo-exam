/* Cronyzo service worker — makes the site installable and usable offline.
 *
 * Rules of the road:
 *   • the app shell (index.html + the built, hash-named bundles) is cached, so
 *     a phone with no signal still opens Cronyzo and can run a saved test file;
 *   • /api/ is never cached — marks, orders and results must never be stale;
 *   • navigations are network-first, so a fresh deploy is picked up immediately
 *     and the cache is only a fallback;
 *   • 20261118082806 is replaced with the build stamp by scripts/publish_site.sh,
 *     so every deploy drops the previous cache.
 */

const VERSION = "cz-20261118082806";
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const SHELL_URLS = ["/", "/manifest.webmanifest", "/favicon.svg", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

function isAsset(url) {
  return (
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/brand/") ||
    url.pathname.startsWith("/hero/") ||
    /\.(png|jpg|jpeg|webp|svg|woff2?|ttf|css|js)$/.test(url.pathname)
  );
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const fresh = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 4000)),
    ]);
    if (fresh && fresh.ok) cache.put("/", fresh.clone());
    return fresh;
  } catch {
    const cached = (await cache.match(request)) || (await cache.match("/"));
    return cached || Response.error();
  }
}

async function cacheFirstAsset(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // let the network handle it
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/files/")) return; // never cache data
  if (url.pathname === "/sw.js") return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }
  if (isAsset(url)) {
    event.respondWith(cacheFirstAsset(request).catch(() => fetch(request)));
  }
});

// A newly installed worker should not keep a tab on old code for long.
self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});
