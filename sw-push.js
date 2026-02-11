// Service Worker con Soporte para Push Notifications
// La Bajada Kite App

const CACHE_VERSION = 'v1';
const CACHE_NAME = `labajada-cache-${CACHE_VERSION}`;

// Instalación del Service Worker
self.addEventListener('install', (event) => {
    console.log('🔧 Service Worker: Instalando...');
    self.skipWaiting(); // Activar inmediatamente
});

// Activación del Service Worker
self.addEventListener('activate', (event) => {
    console.log('✅ Service Worker: Activado');
    event.waitUntil(
        // Limpiar cachés viejos si existen
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        console.log('🗑️ Eliminando caché viejo:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Manejo de peticiones (fetch)
self.addEventListener('fetch', (event) => {
    event.respondWith(
        fetch(event.request).catch(() => {
            // Si falla la red, intentar servir desde caché
            return caches.match(event.request);
        })
    );
});

// ==========================================
// NOTIFICACIONES PUSH
// ==========================================

// Escuchar eventos de push desde Firebase Cloud Messaging (FCM)
self.addEventListener('push', (event) => {
    console.log('📬 Push recibido:', event);
    
    let notificationData = {
        title: 'La Bajada Kite',
        body: 'Nueva actualización disponible',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'labajada-notification',
        requireInteraction: false,
        data: {
            url: '/'
        }
    };

    // Si el push viene con datos
    if (event.data) {
        try {
            const data = event.data.json();
            notificationData = {
                title: data.title || notificationData.title,
                body: data.body || notificationData.body,
                icon: data.icon || notificationData.icon,
                badge: data.badge || notificationData.badge,
                tag: data.tag || notificationData.tag,
                requireInteraction: data.requireInteraction || false,
                data: data.data || notificationData.data,
                image: data.image || undefined,
                vibrate: data.vibrate || [200, 100, 200],
                actions: data.actions || []
            };
        } catch (e) {
            console.error('Error parseando push data:', e);
        }
    }

    event.waitUntil(
        self.registration.showNotification(notificationData.title, {
            body: notificationData.body,
            icon: notificationData.icon,
            badge: notificationData.badge,
            tag: notificationData.tag,
            requireInteraction: notificationData.requireInteraction,
            data: notificationData.data,
            image: notificationData.image,
            vibrate: notificationData.vibrate,
            actions: notificationData.actions
        })
    );
});

// Manejo de clicks en notificaciones
self.addEventListener('notificationclick', (event) => {
    console.log('🖱️ Notificación clickeada:', event.notification.tag);
    
    event.notification.close();

    const urlToOpen = event.notification.data?.url || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(windowClients => {
                // Si hay una ventana ya abierta, enfocarla
                for (let client of windowClients) {
                    if (client.url.includes(self.location.origin) && 'focus' in client) {
                        return client.focus().then(client => {
                            if (urlToOpen !== '/') {
                                return client.navigate(urlToOpen);
                            }
                            return client;
                        });
                    }
                }
                // Si no hay ventana abierta, abrir una nueva
                if (clients.openWindow) {
                    return clients.openWindow(urlToOpen);
                }
            })
    );
});

// Manejo de cierre de notificaciones
self.addEventListener('notificationclose', (event) => {
    console.log('❌ Notificación cerrada:', event.notification.tag);
});

console.log('✅ Service Worker con Push Notifications cargado');
