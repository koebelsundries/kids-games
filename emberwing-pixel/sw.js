/* The pixel preview moved to emberwing/. Clear the old caches, unregister, and reload. */
self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    self.clients.claim().then(function () {
      return caches.keys();
    }).then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k.indexOf("emberwing-pixel-") === 0) return caches.delete(k);
      }));
    }).then(function () {
      return self.clients.matchAll({ type: "window" });
    }).then(function (clients) {
      return Promise.all(clients.map(function (client) {
        return client.navigate(client.url);
      }));
    }).then(function () {
      return self.registration.unregister();
    })
  );
});
