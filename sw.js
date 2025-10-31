// Service Worker Mínimo Requerido para PWA Instalable

self.addEventListener('install', (event) => {
    console.log('Service Worker: Instalado');
    // Forzar activación inmediata para que el sitio se instale más rápido
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('Service Worker: Activado');
    // Asegurar que el Service Worker se apodere de la página actual
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
    // Este Service Worker no hace caché, simplemente permite que las peticiones vayan a la red.
    // Esto es necesario para que las peticiones a la API funcionen correctamente.
    event.respondWith(fetch(event.request));
});