// sw.js — service worker: cachea el "app shell" para que la app abra offline.
// Las llamadas a /api/* (IA) siempre van a red, nunca se cachean.
//
// Estrategia: RED PRIMERO, con reserva en caché (network-first). Antes este
// service worker era "caché primero" y nunca revisaba si había una versión más
// nueva del código — una vez instalado en un dispositivo, se quedaba pegado en esa
// versión para siempre, aunque se hicieran despliegues nuevos. Con red primero,
// cada vez que hay internet se trae siempre lo más reciente (y se actualiza la
// copia guardada de paso); la copia guardada solo se usa si no hay conexión.

const CACHE_VERSION = 'mis-finanzas-v2';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/db.js',
  './js/categories.js',
  './js/ai.js',
  './js/state.js',
  './js/router.js',
  './js/app.js',
  './js/screens/inicio.js',
  './js/screens/ingresos.js',
  './js/screens/reporte.js',
  './js/screens/conciliacion.js',
  './js/screens/ajustes.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return; // nunca cachear llamadas a IA

  event.respondWith(
    fetch(event.request).then((res) => {
      if (res && res.ok && url.origin === self.location.origin) {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
      }
      return res;
    }).catch(() => caches.match(event.request))
  );
});
