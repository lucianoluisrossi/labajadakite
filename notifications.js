// notifications.js
// Gestión de suscripción Web Push para La Bajada Kite App
// Las alertas las envía el servidor via push-alert.js (cron cada 15 min)
// Este módulo solo maneja: suscripción, permisos, config y sincronización

const VAPID_PUBLIC_KEY = 'BI1RtHhc98w4g4etDGUfArV2SQ3Jhi0PRVKk66mQvNbMHcU8JlDKp18FqyLxDKIlCFNgxGOXVUvqFi0lLB0qjDQ';

export class PushNotificationManager {
    constructor(firebaseApp = null) {
        this.isSupported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
        this.permission = this.isSupported ? Notification.permission : 'denied';
        this.pushSubscription = null;
        
        const savedMinWind = localStorage.getItem('notif_min_wind');
        
        this.config = {
            minNavigableWind: savedMinWind ? parseInt(savedMinWind) : 15,
            maxGoodWind: 27,
        };
        
        console.log('⚙️ Configuración de notificaciones cargada:', {
            minNavigableWind: this.config.minNavigableWind
        });

        this._ready = this._checkExistingSubscription();
    }

    async _checkExistingSubscription() {
        if (!this.isSupported) return;
        
        try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();
            
            if (subscription) {
                this.pushSubscription = subscription;
                console.log('✅ Suscripción push existente encontrada');
            } else {
                console.log('ℹ️ Sin suscripción push activa');
            }
        } catch (error) {
            console.log('⚠️ Error verificando suscripción push:', error.message);
        }
    }

    checkSupport() {
        if (!this.isSupported) {
            console.warn('⚠️ Push notifications no soportadas en este navegador');
            return false;
        }
        return true;
    }

    async requestPermission() {
        if (!this.checkSupport()) return false;

        if (this.permission === 'granted' && this.pushSubscription) {
            console.log('✅ Permiso y suscripción push ya activos');
            return true;
        }

        if (this.permission === 'denied') {
            console.log('❌ Permiso de notificaciones denegado por el usuario');
            return false;
        }

        try {
            const permission = await Notification.requestPermission();
            this.permission = permission;
            
            if (permission !== 'granted') {
                console.log('❌ Usuario rechazó las notificaciones');
                return false;
            }

            console.log('✅ Permiso concedido, suscribiendo a Web Push...');
            
            const subscribed = await this._subscribeToPush();
            
            if (subscribed) {
                this._showTestNotification();
                return true;
            } else {
                console.warn('⚠️ Push subscription falló');
                return false;
            }
        } catch (error) {
            console.error('Error en requestPermission:', error);
            return false;
        }
    }

    async _subscribeToPush() {
        try {
            const registration = await navigator.serviceWorker.ready;
            const applicationServerKey = this._urlBase64ToUint8Array(VAPID_PUBLIC_KEY);

            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: applicationServerKey,
            });

            this.pushSubscription = subscription;
            console.log('✅ Suscripción Web Push creada');

            const saved = await this._saveSubscriptionToServer(subscription);
            
            if (saved) {
                localStorage.setItem('pushSubscribed', 'true');
                console.log('✅ Suscripción guardada en servidor');
            }

            return saved;
        } catch (error) {
            console.error('Error suscribiendo a Web Push:', error);
            return false;
        }
    }

    async _saveSubscriptionToServer(subscription) {
        try {
            console.log('📤 Enviando config al servidor:', JSON.stringify(this.config));
            const response = await fetch('/api/push-subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    subscription: subscription.toJSON(),
                    config: {
                        minNavigableWind: this.config.minNavigableWind,
                        maxGoodWind: this.config.maxGoodWind,
                    },
                }),
            });

            const data = await response.json();
            console.log('📥 Respuesta del servidor:', JSON.stringify(data));
            return data.ok === true;
        } catch (error) {
            console.error('Error guardando suscripción en servidor:', error);
            return false;
        }
    }

    async _removeSubscriptionFromServer() {
        if (!this.pushSubscription) return;

        try {
            await fetch('/api/push-subscribe', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    endpoint: this.pushSubscription.endpoint,
                }),
            });
        } catch (error) {
            console.error('Error eliminando suscripción del servidor:', error);
        }
    }

    async unsubscribe() {
        try {
            if (this.pushSubscription) {
                await this.pushSubscription.unsubscribe();
                await this._removeSubscriptionFromServer();
                this.pushSubscription = null;
                localStorage.removeItem('pushSubscribed');
                console.log('✅ Desuscripto de Web Push');
            }
            return true;
        } catch (error) {
            console.error('Error desuscribiendo:', error);
            return false;
        }
    }

    _urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding)
            .replace(/-/g, '+')
            .replace(/_/g, '/');

        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);

        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }

    _showTestNotification() {
        if (this.permission !== 'granted') return;
        
        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
            navigator.serviceWorker.ready.then(registration => {
                registration.showNotification('¡Push activadas! 🪁', {
                    body: 'Recibirás alertas de viento aunque la app esté cerrada',
                    icon: '/icon-192.png',
                    badge: '/badge-wind.png',
                    tag: 'test-notification',
                    requireInteraction: false,
                });
            });
        }
    }

    // Enviar notificación de prueba (botón manual)
    sendNotification(options) {
        if (this.permission !== 'granted') return;
        
        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
            navigator.serviceWorker.ready.then(registration => {
                registration.showNotification(options.title || 'La Bajada Kite', {
                    body: options.body || '',
                    icon: '/icon-192.png',
                    badge: '/badge-wind.png',
                    tag: options.tag || 'test',
                    vibrate: options.vibrate || [200, 100, 200],
                });
            });
        }
    }

    setConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        console.log('⚙️ Configuración actualizada:', this.config);
    }

    async syncConfigToServer() {
        console.log('🔄 syncConfigToServer: esperando _ready...');
        await this._ready;
        console.log('🔄 syncConfigToServer: pushSubscription =', this.pushSubscription ? 'EXISTS' : 'NULL');
        if (!this.pushSubscription) {
            console.warn('⚠️ syncConfigToServer: no hay suscripción, no se puede sincronizar');
            return;
        }
        
        try {
            await this._saveSubscriptionToServer(this.pushSubscription);
            console.log('✅ Config sincronizada con servidor');
        } catch (error) {
            console.error('Error sincronizando config:', error);
        }
    }

    getStatus() {
        return {
            supported: this.isSupported,
            permission: this.permission,
            enabled: this.permission === 'granted',
            pushSubscribed: !!this.pushSubscription,
            config: this.config,
        };
    }

    savePreferences() {
        localStorage.setItem('notificationConfig', JSON.stringify(this.config));
        localStorage.setItem('notif_min_wind', this.config.minNavigableWind.toString());
        localStorage.setItem('notificationsEnabled', this.permission === 'granted');
        this.syncConfigToServer();
    }

    loadPreferences() {
        const savedConfig = localStorage.getItem('notificationConfig');
        if (savedConfig) {
            try {
                this.config = { ...this.config, ...JSON.parse(savedConfig) };
            } catch (e) {
                console.error('Error cargando preferencias:', e);
            }
        }
    }
}
