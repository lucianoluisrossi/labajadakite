// Función Serverless para enviar Web Push notifications
// Se ejecuta via cron de Vercel cada 15 minutos
//
// TODAS las alertas requieren condición SOSTENIDA para evitar falsos positivos.
// Como el cron corre cada 15 min, usamos Firestore para persistir timestamps
// de cuando empezó cada condición. Si entre dos ejecuciones la condición se
// mantiene y el tiempo supera el umbral, se confirma como sostenida.
//
// Tiempos sostenidos:
//   ÉPICO:      10 min
//   IDEALES:     5 min
//   EXTREMAS:    3 min
//   OFFSHORE:    5 min

import { initFirebase } from './_firebase.js';
import admin from 'firebase-admin';

const PUSH_COLLECTION = 'push_subscriptions';
const PUSH_LOG_COLLECTION = 'push_alert_log';
const CONDITION_TRACKER_COLLECTION = 'condition_tracker';

// Tiempos sostenidos en minutos
const SUSTAINED_MINUTES = {
    epic: 10,
    good: 5,
    dangerous: 3,
    offshore: 5,
};

const GLOBAL_CONFIG = {
    dangerousSpeed: 30,
    dangerousGust: 35,
    epicMinWind: 17,
    epicMaxWind: 25,
    epicMinDeg: 68,
    epicMaxDeg: 146,
    offshoreStart: 292.5,
    offshoreEnd: 67.5,
    cooldownMinutes: 120,
};

// --- Obtener datos de viento de Ecowitt ---
async function getWindData() {
    const FULL_API_URL = 'https://api.ecowitt.net/api/v3/device/real_time?application_key=515398061FDA504607F0329996375FC2&api_key=2b181909-3bd1-4a8f-8cf1-91cb95e75ff5&mac=C8:C9:A3:1C:0D:E5&call_back=all&temp_unitid=1&pressure_unitid=3&wind_speed_unitid=8&rainfall_unitid=12&solar_irradiance_unitid=14&capacity_unitid=25';

    try {
        const response = await fetch(FULL_API_URL);
        if (!response.ok) return null;
        
        const data = await response.json();
        if (data.code !== 0 || !data.data) return null;

        const wind = data.data.wind || {};
        const outdoor = data.data.outdoor || {};

        return {
            speed: parseFloat(wind.wind_speed?.value || 0),
            gust: parseFloat(wind.wind_gust?.value || 0),
            direction: parseInt(wind.wind_direction?.value || 0),
            temp: parseFloat(outdoor.temperature?.value || 0),
        };
    } catch (error) {
        console.error('Error obteniendo datos de viento:', error);
        return null;
    }
}

function degreesToCardinal(degrees) {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
    const index = Math.round(degrees / 22.5) % 16;
    return directions[index];
}

// --- Evaluadores de condición (idénticos a notifications.js) ---
function isEpicNow(speed, direction) {
    return speed >= GLOBAL_CONFIG.epicMinWind &&
           speed < GLOBAL_CONFIG.epicMaxWind &&
           direction >= GLOBAL_CONFIG.epicMinDeg &&
           direction <= GLOBAL_CONFIG.epicMaxDeg;
}

function isDangerousNow(speed, gust) {
    return speed > GLOBAL_CONFIG.dangerousSpeed || gust >= GLOBAL_CONFIG.dangerousGust;
}

function isOffshoreNow(speed, direction) {
    const offshore = direction >= GLOBAL_CONFIG.offshoreStart || direction <= GLOBAL_CONFIG.offshoreEnd;
    return offshore && speed >= 12; // umbral mínimo genérico para offshore
}

function isGoodNow(speed, direction, minWind) {
    const offshore = direction >= GLOBAL_CONFIG.offshoreStart || direction <= GLOBAL_CONFIG.offshoreEnd;
    return speed >= minWind && speed <= 27 && !offshore;
}

// --- Tracker persistido en Firestore ---
// Cada condición tiene un doc en condition_tracker/{type}
// con { startedAt: timestamp, lastSeen: timestamp }
// Si condición sigue activa → actualizar lastSeen
// Si condición dejó de cumplirse → borrar startedAt
// Sostenida = (now - startedAt) >= umbral

async function getTrackerState(db) {
    const state = {};
    try {
        const snapshot = await db.collection(CONDITION_TRACKER_COLLECTION).get();
        snapshot.docs.forEach(doc => {
            state[doc.id] = doc.data();
        });
    } catch (e) {
        console.log('Sin tracker previo:', e.message);
    }
    return state;
}

async function updateTracker(db, type, conditionMet) {
    const now = Date.now();
    const docRef = db.collection(CONDITION_TRACKER_COLLECTION).doc(type);

    if (conditionMet) {
        const doc = await docRef.get();
        const existing = doc.exists ? doc.data() : null;

        if (existing && existing.startedAt) {
            // Condición ya estaba activa, actualizar lastSeen
            await docRef.update({ lastSeen: now });
            const minutesActive = (now - existing.startedAt) / (1000 * 60);
            const sustained = minutesActive >= (SUSTAINED_MINUTES[type] || 5);
            return { sustained, minutesActive: Math.round(minutesActive), startedAt: existing.startedAt };
        } else {
            // Primera vez que se detecta esta condición
            await docRef.set({ startedAt: now, lastSeen: now });
            return { sustained: false, minutesActive: 0, startedAt: now };
        }
    } else {
        // Condición no se cumple, resetear
        await docRef.set({ startedAt: null, lastSeen: now, brokenAt: now });
        return { sustained: false, minutesActive: 0, startedAt: null };
    }
}

// --- Evaluar qué alerta enviar (la de mayor prioridad) ---
function pickAlert(windData, subscriberConfig, trackerResults) {
    const { speed, gust, direction } = windData;
    const cardinal = degreesToCardinal(direction);

    // 1. ÉPICO sostenido
    if (trackerResults.epic.sustained) {
        return {
            type: 'epic',
            title: '👑 ¡ÉPICO!',
            body: `${speed.toFixed(0)} kts del ${cardinal} — Sostenido ${trackerResults.epic.minutesActive}+ min`,
            priority: 1,
        };
    }

    // 2. PELIGROSO sostenido
    if (trackerResults.dangerous.sustained) {
        return {
            type: 'dangerous',
            title: '⚠️ Condiciones extremas',
            body: `${speed.toFixed(0)} kts, rachas ${gust.toFixed(0)} kts — Sostenido 3+ min`,
            priority: 2,
        };
    }

    // 3. OFFSHORE sostenido
    if (trackerResults.offshore.sustained) {
        return {
            type: 'offshore',
            title: '🚨 Viento Offshore',
            body: `${speed.toFixed(0)} kts del ${cardinal} — ¡No navegar!`,
            priority: 3,
        };
    }

    // 4. CONDICIONES IDEALES sostenidas
    if (trackerResults.good.sustained) {
        return {
            type: 'good',
            title: '🪁 ¡Hay viento!',
            body: `${speed.toFixed(0)} kts del ${cardinal} — Sostenido 5+ min`,
            priority: 4,
        };
    }

    return null;
}

// --- Enviar Web Push ---
async function sendWebPush(subscription, payload) {
    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const vapidEmail = process.env.VAPID_EMAIL || 'mailto:labajadakite@gmail.com';

    if (!vapidPublicKey || !vapidPrivateKey) {
        console.error('VAPID keys no configuradas');
        return false;
    }

    try {
        const webpush = await import('web-push');
        
        webpush.default.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);
        await webpush.default.sendNotification(subscription, JSON.stringify(payload));
        return true;
    } catch (error) {
        if (error.statusCode === 410 || error.statusCode === 404) {
            return 'expired';
        }
        console.error('Error enviando push:', error.message);
        return false;
    }
}

// --- Handler principal ---
export default async function handler(req, res) {
    const authHeader = req.headers['authorization'];
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return res.status(401).json({ error: 'No autorizado' });
    }

    try {
        // 1. Obtener datos de viento
        const windData = await getWindData();
        if (!windData) {
            return res.status(500).json({ ok: false, error: 'Sin datos de viento' });
        }

        const cardinal = degreesToCardinal(windData.direction);
        console.log(`🌬️ Viento: ${windData.speed.toFixed(1)} kts ${cardinal}, rachas ${windData.gust.toFixed(1)} kts`);

        // 2. Firebase
        const db = initFirebase();
        if (!db) {
            return res.status(500).json({ ok: false, error: 'Firebase no disponible' });
        }

        // 3. Actualizar TODOS los trackers de condición
        const trackerResults = {
            epic:      await updateTracker(db, 'epic',      isEpicNow(windData.speed, windData.direction)),
            dangerous: await updateTracker(db, 'dangerous', isDangerousNow(windData.speed, windData.gust)),
            offshore:  await updateTracker(db, 'offshore',  isOffshoreNow(windData.speed, windData.direction)),
            good:      await updateTracker(db, 'good',      isGoodNow(windData.speed, windData.direction, 15)),
        };

        console.log('📊 Trackers:', JSON.stringify(trackerResults, null, 2));

        // 4. Obtener suscriptores activos
        const snapshot = await db.collection(PUSH_COLLECTION)
            .where('active', '==', true)
            .get();

        if (snapshot.empty) {
            return res.status(200).json({ 
                ok: true, wind: windData, trackers: trackerResults,
                subscribers: 0, sent: 0, message: 'Sin suscriptores activos' 
            });
        }

        // 5. Verificar cooldown (no repetir mismo tipo en 2h)
        const cooldownMs = GLOBAL_CONFIG.cooldownMinutes * 60 * 1000;
        const cooldownTime = new Date(Date.now() - cooldownMs);
        
        let lastAlertType = null;
        try {
            const logSnapshot = await db.collection(PUSH_LOG_COLLECTION)
                .orderBy('timestamp', 'desc')
                .limit(1)
                .get();
            
            if (!logSnapshot.empty) {
                const lastLog = logSnapshot.docs[0].data();
                const lastTime = lastLog.timestamp?.toDate?.() || new Date(0);
                if (lastTime > cooldownTime) {
                    lastAlertType = lastLog.alertType;
                }
            }
        } catch (e) {
            console.log('Sin logs previos:', e.message);
        }

        // 6. Evaluar y enviar
        let sent = 0;
        let skipped = 0;
        let expired = 0;
        let alertType = null;

        await Promise.allSettled(
            snapshot.docs.map(async (doc) => {
                const data = doc.data();
                const alert = pickAlert(windData, data.config, trackerResults);

                if (!alert) { skipped++; return; }
                if (lastAlertType === alert.type) { skipped++; return; }

                alertType = alert.type;

                const payload = {
                    title: alert.title,
                    body: alert.body,
                    icon: '/icon-192.png',
                    badge: '/icon-192.png',
                    tag: `wind-alert-${alert.type}`,
                    vibrate: alert.priority <= 2 ? [300, 100, 300, 100, 300] : [200, 100, 200],
                    requireInteraction: alert.priority <= 2,
                    data: { url: '/?from_notification=true' },
                };

                const result = await sendWebPush(data.subscription, payload);

                if (result === 'expired') {
                    await db.collection(PUSH_COLLECTION).doc(doc.id).update({ active: false });
                    expired++;
                } else if (result) {
                    sent++;
                } 
            })
        );

        // 7. Loguear
        if (sent > 0 && alertType) {
            try {
                await db.collection(PUSH_LOG_COLLECTION).add({
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    alertType,
                    windSpeed: windData.speed,
                    windGust: windData.gust,
                    windDirection: windData.direction,
                    cardinal,
                    trackers: trackerResults,
                    subscribersSent: sent,
                    subscribersSkipped: skipped,
                    subscribersExpired: expired,
                });
            } catch (e) {
                console.error('Error guardando log:', e.message);
            }
        }

        return res.status(200).json({
            ok: true,
            wind: { speed: windData.speed.toFixed(1), gust: windData.gust.toFixed(1), direction: cardinal, degrees: windData.direction },
            trackers: trackerResults,
            alert: alertType ? { type: alertType } : null,
            subscribers: { total: snapshot.size, sent, skipped, expired },
            cooldown: lastAlertType ? { lastType: lastAlertType } : null,
        });

    } catch (error) {
        console.error('Error en push-alert:', error);
        return res.status(500).json({ ok: false, error: error.message });
    }
}
