// notifications.js
// Sistema de Notificaciones Push para La Bajada Kite App
// Todas las alertas requieren condición SOSTENIDA para evitar falsos positivos
//
// Tiempos sostenidos (lecturas cada 30seg):
//   ÉPICO:      10 min = 20 lecturas
//   IDEALES:     5 min = 10 lecturas
//   VIENTO SUBIÓ: 5 min = 10 lecturas
//   EXTREMAS:    3 min =  6 lecturas
//   OFFSHORE:    5 min = 10 lecturas

const VAPID_PUBLIC_KEY = 'BI1RtHhc98w4g4etDGUfArV2SQ3Jhi0PRVKk66mQvNbMHcU8JlDKp18FqyLxDKIlCFNgxGOXVUvqFi0lLB0qjDQ';

// Lecturas consecutivas requeridas (a 30seg cada una)
const SUSTAINED = {
    epic: 20,       // 10 min
    good: 10,       //  5 min
    windUp: 10,     //  5 min
    dangerous: 6,   //  3 min
    offshore: 10,   //  5 min
};

export class PushNotificationManager {
    constructor(firebaseApp = null) {
        this.isSupported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
        this.permission = this.isSupported ? Notification.permission : 'denied';
        this.pushSubscription = null;
        this.lastWindConditions = null;
        
        const savedMinWind = localStorage.getItem('notif_min_wind');
        
        this.config = {
            minNavigableWind: savedMinWind ? parseInt(savedMinWind) : 15,
            maxGoodWind: 27,
            dangerousWind: 35,       // rachas peligrosas
            dangerousSpeed: 30,      // velocidad sostenida peligrosa
            offshoreAngles: [315, 67.5],
            checkInterval: 5 * 60 * 1000,
        };
        
        console.log('⚙️ Configuración de notificaciones cargada:', {
            minNavigableWind: this.config.minNavigableWind
        });
        
        // Estado de notificaciones ya enviadas (anti-spam, reset cada 2h)
        this.sentNotifications = {
            goodConditions: false,
            windIncreased: false,
            dangerous: false,
            epicEast: false,
            offshore: false,
            lastReset: Date.now()
        };
        
        // Trackers de condición sostenida (contadores de lecturas consecutivas)
        this.trackers = {
            epic:      { count: 0, sustained: false },
            good:      { count: 0, sustained: false },
            windUp:    { count: 0, sustained: false },
            dangerous: { count: 0, sustained: false },
            offshore:  { count: 0, sustained: false },
        };
        
        // Resetear estado cada 2 horas
        setInterval(() => this.resetNotificationState(), 2 * 60 * 60 * 1000);

        this._checkExistingSubscription();
    }

    // --- Tracker genérico de condición sostenida ---
    _updateTracker(name, conditionMet) {
        const tracker = this.trackers[name];
        const required = SUSTAINED[name];
        
        if (conditionMet) {
            tracker.count++;
            if (tracker.count >= required && !tracker.sustained) {
                tracker.sustained = true;
                console.log(`✅ Condición "${name}" sostenida (${Math.round(required * 30 / 60)} min)`);
            }
        } else {
            if (tracker.count > 0) {
                console.log(`🔄 Condición "${name}" perdida tras ${tracker.count} lecturas`);
            }
            tracker.count = 0;
            tracker.sustained = false;
        }
    }

    // --- Evaluadores de condición ---
    _isEpicCondition(speed, direction) {
        return speed !== null && direction !== null &&
               speed >= 17 && speed < 25 &&
               direction >= 68 && direction <= 146;
    }

    _isGoodCondition(speed, direction) {
        return speed >= this.config.minNavigableWind &&
               speed < 27 &&
               !this.isOffshoreWind(direction);
    }

    _isDangerousCondition(speed, gust) {
        return speed > this.config.dangerousSpeed || gust >= this.config.dangerousWind;
    }

    _isOffshoreCondition(speed, direction) {
        return speed >= this.config.minNavigableWind && this.isOffshoreWind(direction);
    }

    _isWindUpCondition(speed) {
        return this.lastWindConditions &&
               this.lastWindConditions.speed < this.config.minNavigableWind &&
               speed >= this.config.minNavigableWind;
    }

    isOffshoreWind(degrees) {
        return degrees >= this.config.offshoreAngles[0] || degrees <= this.config.offshoreAngles[1];
    }

    // Verificar suscripción push existente al cargar
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
                this.showTestNotification();
                return true;
            } else {
                console.warn('⚠️ Push subscription falló, usando notificaciones locales');
                this.showTestNotification();
                return true;
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

    showTestNotification() {
        if (this.permission !== 'granted') return;
        
        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
            navigator.serviceWorker.ready.then(registration => {
                registration.showNotification('¡Notificaciones activadas! 🪁', {
                    body: this.pushSubscription 
                        ? 'Recibirás alertas aunque la app esté cerrada' 
                        : 'Te avisaremos cuando haya buenas condiciones',
                    icon: '/icon-192.png',
                    badge: '/icon-192.png',
                    tag: 'test-notification',
                    requireInteraction: false,
                });
            });
        } else {
            new Notification('¡Notificaciones activadas! 🪁', {
                body: 'Te avisaremos cuando haya buenas condiciones de viento',
                icon: '/icon-192.png',
                badge: '/icon-192.png',
                tag: 'test-notification',
            });
        }
    }

    // ==========================================
    // ANÁLISIS DE CONDICIONES (llamado cada 30seg)
    // ==========================================
    analyzeWindConditions(windData) {
        if (this.permission !== 'granted') return;
        
        const { speed, gust, direction, cardinal } = windData;
        
        if (speed === null || direction === null) return;

        // Actualizar TODOS los trackers
        this._updateTracker('epic',      this._isEpicCondition(speed, direction));
        this._updateTracker('good',      this._isGoodCondition(speed, direction));
        this._updateTracker('dangerous', this._isDangerousCondition(speed, gust));
        this._updateTracker('offshore',  this._isOffshoreCondition(speed, direction));
        // windUp se evalúa diferente: necesita que la lectura ANTERIOR fuera baja
        const windUpNow = speed >= this.config.minNavigableWind;
        const wasBelowBefore = this.lastWindConditions && this.lastWindConditions.speed < this.config.minNavigableWind;
        // Si ya estamos trackeando windUp, seguir mientras se mantenga navegable
        // Si no, empezar solo cuando se detecta el cruce de umbral
        if (this.trackers.windUp.count > 0) {
            this._updateTracker('windUp', windUpNow);
        } else {
            this._updateTracker('windUp', wasBelowBefore && windUpNow);
        }

        const isDangerous = this.trackers.dangerous.sustained;

        // 1. ÉPICO sostenido (10 min)
        if (this.trackers.epic.sustained && !this.sentNotifications.epicEast && !isDangerous) {
            this.sendLocalNotification({
                title: '👑 ¡ÉPICO!',
                body: `${speed} kts ${cardinal} — Sostenido 10+ min`,
                tag: 'epic-east',
                requireInteraction: true,
                vibrate: [200, 100, 200, 100, 200],
            });
            this.sentNotifications.epicEast = true;
        }

        // 2. PELIGROSO sostenido (3 min)
        if (isDangerous && !this.sentNotifications.dangerous) {
            let message = speed > this.config.dangerousSpeed ? `Viento ${speed} kts` : `Rachas de ${gust} kts`;
            if (speed > this.config.dangerousSpeed && gust >= this.config.dangerousWind) {
                message = `Viento ${speed} kts, Rachas ${gust} kts`;
            }
            this.sendLocalNotification({
                title: '⚠️ Condiciones extremas',
                body: `${message} — Sostenido 3+ min`,
                tag: 'dangerous-conditions',
                vibrate: [300, 100, 300],
            });
            this.sentNotifications.dangerous = true;
        }

        // 3. OFFSHORE sostenido (5 min)
        if (this.trackers.offshore.sustained && !this.sentNotifications.offshore && !isDangerous) {
            this.sendLocalNotification({
                title: '🚨 Viento Offshore',
                body: `${speed} kts ${cardinal} — ¡No navegar!`,
                tag: 'offshore-conditions',
                vibrate: [300, 100, 300],
            });
            this.sentNotifications.offshore = true;
        }

        // 4. CONDICIONES IDEALES sostenidas (5 min)
        if (this.trackers.good.sustained && !this.sentNotifications.goodConditions && !isDangerous && !this.trackers.epic.sustained) {
            this.sendLocalNotification({
                title: '🪁 ¡Condiciones ideales!',
                body: `${speed} kts ${cardinal} — Sostenido 5+ min`,
                tag: 'good-conditions',
            });
            this.sentNotifications.goodConditions = true;
        }

        // 5. VIENTO SUBIÓ sostenido (5 min)
        if (this.trackers.windUp.sustained && !this.sentNotifications.windIncreased) {
            this.sendLocalNotification({
                title: '📈 El viento subió',
                body: `Ahora ${speed} kts ${cardinal} — Sostenido 5+ min`,
                tag: 'wind-increased',
            });
            this.sentNotifications.windIncreased = true;
        }

        // Guardar lectura actual para comparar en la siguiente
        this.lastWindConditions = { speed, gust, direction, cardinal };
    }

    // ==========================================
    // ENVÍO DE NOTIFICACIONES LOCALES
    // ==========================================
    sendLocalNotification(options) {
        if (this.permission !== 'granted') return;

        const defaults = {
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            vibrate: [200, 100, 200],
            data: { url: '/' },
        };

        const notifOptions = { ...defaults, ...options };

        try {
            if (navigator.serviceWorker && navigator.serviceWorker.controller) {
                navigator.serviceWorker.ready.then(registration => {
                    registration.showNotification(notifOptions.title, notifOptions);
                });
            } else {
                new Notification(notifOptions.title, notifOptions);
            }
            console.log('📬 Notificación local enviada:', notifOptions.title);
        } catch (error) {
            console.error('Error enviando notificación local:', error);
        }
    }

    // Alias para compatibilidad
    sendNotification(options) {
        this.sendLocalNotification(options);
    }

    resetNotificationState() {
        const now = Date.now();
        const timeSinceLastReset = now - this.sentNotifications.lastReset;
        
        if (timeSinceLastReset >= 2 * 60 * 60 * 1000) {
            console.log('🔄 Reseteando estado de notificaciones');
            this.sentNotifications = {
                goodConditions: false,
                windIncreased: false,
                dangerous: false,
                epicEast: false,
                offshore: false,
                lastReset: now,
            };
        }
    }

    setConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        console.log('⚙️ Configuración actualizada:', this.config);
    }

    async syncConfigToServer() {
        if (!this.pushSubscription) return;
        
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
            lastWindConditions: this.lastWindConditions,
            sentNotifications: this.sentNotifications,
            trackers: {
                epic:      { count: this.trackers.epic.count, sustained: this.trackers.epic.sustained, required: SUSTAINED.epic },
                good:      { count: this.trackers.good.count, sustained: this.trackers.good.sustained, required: SUSTAINED.good },
                dangerous: { count: this.trackers.dangerous.count, sustained: this.trackers.dangerous.sustained, required: SUSTAINED.dangerous },
                offshore:  { count: this.trackers.offshore.count, sustained: this.trackers.offshore.sustained, required: SUSTAINED.offshore },
                windUp:    { count: this.trackers.windUp.count, sustained: this.trackers.windUp.sustained, required: SUSTAINED.windUp },
            },
        };
    }

    savePreferences() {
        localStorage.setItem('notificationConfig', JSON.stringify(this.config));
        localStorage.setItem('notificationsEnabled', this.permission === 'granted');
        this.syncConfigToServer();
    }

    loadPreferences() {
        const savedConfig = localStorage.getItem('notificationConfig');
        if (savedConfig) {
            try {
                this.config = { ...this.config, ...JSON.parse(savedConfig) };
                console.log('✅ Preferencias de notificaciones cargadas');
            } catch (e) {
                console.error('Error cargando preferencias:', e);
            }
        }
    }
}
