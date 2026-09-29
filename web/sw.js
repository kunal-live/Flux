// Flux service worker. Goal: work offline (this is a LAN tool that may have no
// internet) without ever serving stale application code after an update. So:
// navigations and same-origin GETs are network-first with a cache fallback; the
// control/data planes (/ws, /api/) are never touched.
const CACHE = "flux-v1";
const CORE = [
  "/", "/index.html", "/styles.css", "/manifest.webmanifest", "/icon.svg",
  "/src/app.js", "/src/protocol.js", "/src/signaling.js", "/src/discovery.js",
  "/src/session.js", "/src/transfer.js", "/src/transport.js", "/src/webrtc.js",
  "/src/relay.js", "/src/writer.js", "/src/hashing.js", "/src/resume.js",
  "/src/qr.js", "/src/ui.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.allSettled(CORE.map((u) => c.add(u)));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname === "/ws" || url.pathname.startsWith("/api/")) return;

  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res && res.ok) {
        const c = await caches.open(CACHE);
        c.put(req, res.clone()).catch(() => {});
      }
      return res;
    } catch {
      const cached = await caches.match(req);
      if (cached) return cached;
      if (req.mode === "navigate") {
        const shell = await caches.match("/index.html");
        if (shell) return shell;
      }
      throw new Error("offline and not cached");
    }
  })());
});
