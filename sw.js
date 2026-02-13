// Service Worker con Soporte iOS Mejorado
// La Bajada Kite App
// Compatible con iOS Safari, Android Chrome, Desktop browsers

const CACHE_VERSION = 'v2-ios-compatible';
const CACHE_NAME = `labajada-cache-${CACHE_VERSION}`;

// Assets críticos para cachear (solo recursos propios)
const CRITICAL_ASSETS = [
    '/',
    '/index.html',
    '/app.js',
    '/notifications.js',
    '/notifications-integration.js',
    '/ux-improvements.js',
    '/data.js',
    '/icon-192.png',
    '/icon-512.png',
    '/badge-wind.png',
];

// ==========================================
// INSTALACIÓN
// ==========================================
self.addEventListener('install', (event) => {
    console.log('🔧 Service Worker: Instalando...', CACHE_VERSION);
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('📦 Precacheando assets críticos...');
                // No fallar si algún asset no se puede cachear (importante para iOS)
                return Promise.allSettled(
                    CRITICAL_ASSETS.map(url => 
                        cache.add(url).catch(err => {
                            console.warn(`⚠️ No se pudo cachear: ${url}`, err.message);
                        })
                    )
                );
            })
            .then(() => {
                console.log('✅ Assets críticos cacheados');
                return self.skipWaiting();
            })
            .catch(err => {
                console.error('❌ Error en instalación SW:', err);
            })
    );
});

// ==========================================
// ACTIVACIÓN
// ==========================================
self.addEventListener('activate', (event) => {
    console.log('✅ Service Worker: Activando...', CACHE_VERSION);
    
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cache => {
                        if (cache !== CACHE_NAME) {
                            console.log('🗑️ Eliminando caché viejo:', cache);
                            return caches.delete(cache);
                        }
                    })
                );
            })
            .then(() => {
                console.log('✅ Caché limpiado');
                return self.clients.claim();
            })
            .catch(err => {
                console.error('❌ Error en activación SW:', err);
            })
    );
});

// ==========================================
// ESTRATEGIA DE FETCH - COMPATIBLE iOS
// ==========================================
self.addEventListener('fetch', (event) => {
    // ========================================
    // FIX CRÍTICO: NO cachear POST requests
    // ========================================
    if (event.request.method !== 'GET') {
        return; // Solo cachear GET requests
    }
    
    const url = new URL(event.request.url);
    
    // ========================================
    // REGLA 1: NO interceptar APIs externas
    // ========================================
    // Dejar pasar llamadas a dominios externos sin interceptar
    if (url.origin !== self.location.origin) {
        return; // No interceptar, dejar que el navegador lo maneje
    }
    
    // ========================================
    // REGLA 2: NO interceptar Firebase/Google APIs
    // ========================================
    // Estas son críticas y no deben ser cacheadas
    if (url.pathname.startsWith('/api/') || 
        url.hostname.includes('firebase') || 
        url.hostname.includes('googleapis') ||
        url.hostname.includes('firebaseio') ||
        url.hostname.includes('google.com') ||
        url.hostname.includes('gstatic.com')) {
        return; // No interceptar
    }
    
    // ========================================
    // REGLA 3: NO interceptar llamadas Ecowitt
    // ========================================
    if (url.hostname.includes('ecowitt.net')) {
        return; // No interceptar datos de viento en tiempo real
    }
    
    // ========================================
    // ESTRATEGIA: Network First con fallback a Cache
    // ========================================
    // iOS Safari prefiere esta estrategia sobre Cache First
    // Intenta red primero, si falla usa cache
    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Si la respuesta es válida, cachearla para uso offline
                if (response && response.status === 200 && response.type === 'basic') {
                    const responseToCache = response.clone();
                    
                    caches.open(CACHE_NAME)
                        .then(cache => {
                            cache.put(event.request, responseToCache);
                        })
                        .catch(err => {
                            console.warn('⚠️ Error cacheando respuesta:', err.message);
                        });
                }
                
                return response;
            })
            .catch(() => {
                // Si falla la red, intentar con cache
                return caches.match(event.request)
                    .then(cachedResponse => {
                        if (cachedResponse) {
                            console.log('📦 Sirviendo desde cache:', event.request.url);
                            return cachedResponse;
                        }
                        
                        // Si tampoco hay en cache, devolver respuesta offline apropiada
                        // Para HTML, devolver página offline
                        if (event.request.destination === 'document') {
                            return caches.match('/index.html')
                                .then(offlinePage => {
                                    if (offlinePage) {
                                        return offlinePage;
                                    }
                                    return new Response(
                                        '<html><body><h1>Sin conexión</h1><p>Por favor, verifica tu conexión a internet.</p></body></html>',
                                        {
                                            status: 503,
                                            statusText: 'Service Unavailable',
                                            headers: { 'Content-Type': 'text/html' }
                                        }
                                    );
                                });
                        }
                        
                        // Para otros recursos, devolver error JSON
                        return new Response(
                            JSON.stringify({ 
                                error: 'Sin conexión', 
                                offline: true 
                            }), 
                            {
                                status: 503,
                                statusText: 'Service Unavailable',
                                headers: { 'Content-Type': 'application/json' }
                            }
                        );
                    });
            })
    );
});

// ==========================================
// NOTIFICACIONES PUSH
// (Solo funcionan en Android/Desktop, NO en iOS Safari)
// ==========================================

// Verificar si las Push Notifications están soportadas
const isPushSupported = 'PushManager' in self;

if (isPushSupported) {
    console.log('✅ Push Notifications soportadas');
    
    // ========================================
    // RECIBIR NOTIFICACIÓN PUSH
    // ========================================
    self.addEventListener('push', (event) => {
        console.log('📬 Push recibido:', event);
        
        let notificationData = {
            title: 'La Bajada Kite',
            body: 'Nueva actualización disponible',
            icon: '/icon-192.png',
            badge: '/badge-wind.png',
            tag: 'labajada-notification',
            requireInteraction: false,
            data: {
                url: '/'
            }
        };

        // Parsear datos del push si existen
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

    // ========================================
    // CLICK EN NOTIFICACIÓN
    // ========================================
    self.addEventListener('notificationclick', (event) => {
        console.log('🖱️ Notificación clickeada:', event.notification.tag);
        
        event.notification.close();

        const urlToOpen = event.notification.data?.url || '/?from_notification=true';

        event.waitUntil(
            clients.matchAll({ type: 'window', includeUncontrolled: true })
                .then(windowClients => {
                    // Buscar si ya hay una ventana abierta de la app
                    for (let client of windowClients) {
                        if (client.url.includes(self.location.origin) && 'focus' in client) {
                            return client.focus().then(() => {
                                // Intentar navegar si es posible
                                if ('navigate' in client) {
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
                .catch(err => {
                    console.error('Error manejando click de notificación:', err);
                })
        );
    });

    // ========================================
    // CERRAR NOTIFICACIÓN
    // ========================================
    self.addEventListener('notificationclose', (event) => {
        console.log('❌ Notificación cerrada:', event.notification.tag);
    });
} else {
    console.log('📱 Push Notifications NO soportadas (probablemente iOS Safari)');
}

// ==========================================
// MANEJO DE MENSAJES DEL CLIENTE
// ==========================================
self.addEventListener('message', (event) => {
    console.log('📨 Mensaje recibido del cliente:', event.data);
    
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'CLAIM_CLIENTS') {
        self.clients.claim();
    }
    
    if (event.data && event.data.type === 'GET_VERSION') {
        event.ports[0].postMessage({ version: CACHE_VERSION });
    }
});

// ==========================================
// LOG INICIAL
// ==========================================
console.log('✅ Service Worker cargado:', CACHE_VERSION);
console.log('📦 Cache:', CACHE_NAME);
console.log('🔔 Push support:', isPushSupported);
console.log('🌐 Scope:', self.registration.scope);
