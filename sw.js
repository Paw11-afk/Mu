// HFAM service worker: receives the PC's encrypted pushes, shows them as iOS notifications,
// keeps the history on the phone, and caches the app so it opens offline.
importScripts("db.js");

const CACHE = "hfam-v1";
const SHELL = ["./", "index.html", "db.js", "app-config.js", "manifest.webmanifest",
               "icons/icon-192.png", "icons/apple-touch-icon.png"];

// Offline caching is best-effort: one file failing to cache must never stop the service worker
// (and with it every push notification) from installing.
self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    try {
      const c = await caches.open(CACHE);
      await Promise.allSettled(SHELL.map((u) => c.add(u)));
    } catch (_) {}
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

// Network first (so an updated app reaches the phone), cache as the offline fallback.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(fetch(e.request).then((r) => {
    const copy = r.clone();
    caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
    return r;
  }).catch(() => caches.match(e.request).then((r) => r || caches.match("index.html"))));
});

const PREFIX = { CRITICAL: "CRITICAL · ", WARNING: "Warning · ", RESOLVED: "Resolved · " };

// One path for every alert: store it, badge it, show it, tell open windows.
async function handleAlert(m) {
  const lvl = m.lvl || "INFO";
  const title = (PREFIX[lvl] || "") + (m.t || "HFAM alert");
  const short = String(m.b || "").split("\n").filter(Boolean).slice(0, 4).join("\n").slice(0, 240);
  try { await HFAMDB.add({ lvl, t: m.t || "", b: m.b || "", k: m.k || "", ts: m.ts || Date.now() / 1000, read: false }); } catch (_) {}
  try { if (self.navigator.setAppBadge) await self.navigator.setAppBadge(await HFAMDB.unread()); } catch (_) {}
  try {
    // iOS requires every push to show a notification, or it withdraws the permission.
    await self.registration.showNotification(title, {
      body: short,
      tag: m.k || "hfam-" + Date.now(),          // a repeat or RESOLVED of the same condition replaces it
      renotify: lvl === "CRITICAL",
      icon: "icons/icon-192.png",
      badge: "icons/icon-192.png",
      data: { ts: m.ts },
    });
  } finally {
    for (const c of await self.clients.matchAll({ type: "window" })) c.postMessage({ type: "alert" });
  }
}

self.addEventListener("push", (event) => {
  let m = {};
  try { m = event.data ? event.data.json() : {}; } catch (_) { m = { t: "HFAM", b: event.data ? event.data.text() : "" }; }
  event.waitUntil(handleAlert(m));
});

// The app's "Test notification" button runs the exact same path as a real push.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "local-test") {
    event.waitUntil(handleAlert({ lvl: "INFO", t: "HFAM test (on this phone)", k: "local-test",
                                  b: "Notifications and history work on this device.", ts: Date.now() / 1000 }));
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (wins.length) return wins[0].focus();
    return self.clients.openWindow("./");
  })());
});
