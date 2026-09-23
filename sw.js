/* Blake Campo · service worker (v36, 22-sep-2026)
   - La app (index.html) se pide SIEMPRE primero a internet: así cada versión
     nueva que se sube a GitHub llega sola. Si no hay señal, o tarda más de
     6 s, se abre la copia guardada en el teléfono.
   - Iconos, manifiesto y tipografías: se sirven de la copia guardada.
   - Las llamadas al conector de Google (script.google.com) NO se tocan. */
const CACHE = "blake-campo-v36";
const APP = "./index.html";
const PRECARGA = ["./", APP, "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // Uno por uno: si falta un archivo no se cae toda la instalación.
    await Promise.all(PRECARGA.map(u =>
      fetch(u, { cache: "reload" }).then(r => { if (r.ok) return c.put(u === "./" ? APP : u, r); }).catch(() => {})
    ));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) {
      if (k.startsWith("blake-campo-") && k !== CACHE) await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

function esApp(req, url) {
  return req.mode === "navigate" ||
    (url.origin === self.location.origin && /\/(index\.html)?$/.test(url.pathname));
}

async function appRedPrimero(req) {
  const c = await caches.open(CACHE);
  const red = fetch(req, { cache: "no-store" }).then(r => {
    if (r && r.ok) c.put(APP, r.clone());
    return r;
  });
  const espera = new Promise(res => setTimeout(() => res(null), 6000));
  try {
    const r = await Promise.race([red, espera]);
    if (r && r.ok) return r;
  } catch (e) { /* sin señal */ }
  const guardada = await c.match(APP);
  if (guardada) { red.catch(() => {}); return guardada; }   // la red sigue y actualiza la copia
  return red;                                              // primera vez sin copia: esperar a la red
}

async function copiaPrimero(req) {
  const c = await caches.open(CACHE);
  const guardada = await c.match(req, { ignoreSearch: true });
  const red = fetch(req).then(r => {
    if (r && (r.ok || r.type === "opaque")) c.put(req, r.clone());
    return r;
  }).catch(() => null);
  return guardada || (await red) || new Response("", { status: 504 });
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (esApp(req, url)) { e.respondWith(appRedPrimero(req)); return; }
  if (url.origin === self.location.origin ||
      url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(copiaPrimero(req));
  }
  // Todo lo demás (conector de Google) pasa directo.
});
