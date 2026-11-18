/* Emberwing offline cache. This file lives at emberwing/sw.js, so every
   relative URL below resolves inside emberwing/ (not the site root). */
const CACHE = "emberwing-v4"; // new name so emberwing-pixel-* and older emberwing caches are dropped
const CORE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/sprites.js",
  "./assets/sprites.png",
  "./assets/bg-far.png",
  "./assets/bg-hills.png",
  "./fonts/PressStart2P-Regular.ttf"
];
// shared icons live one folder up; cache them if they're there, but never fail install over them
const EXTRA = [
  "../icons/favicon-32.png",
  "../icons/favicon.ico",
  "../icons/apple-touch-icon.png",
  "../icons/icon-192.png",
  "../icons/icon-512.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // cache: "reload" skips the browser HTTP cache so a new version always gets fresh files
      return c.addAll(CORE.map(function (u) { return new Request(u, { cache: "reload" }); })).then(function () {
        return Promise.all(EXTRA.map(function (u) { return c.add(u).catch(function () {}); }));
      });
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k.indexOf("emberwing-") === 0 && k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (req.mode === "navigate") {
    // fresh page when online, cached page when offline
    e.respondWith(
      fetch(req).then(function (res) {
        const copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put("./index.html", copy); });
        return res;
      }).catch(function () {
        return caches.match("./index.html", { ignoreSearch: true });
      })
    );
    return;
  }
  // assets: cache first, then network (and remember it)
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (hit) {
      return hit || fetch(req).then(function (res) {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
        return res;
      });
    })
  );
});
