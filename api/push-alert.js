// api/push-alert.js
// Cron serverless (cada 15 min) que evalúa viento y envía Web Push
//
// Condiciones sostenidas persistidas en Firestore:
//   ÉPICO:      10 min — E/ESE/SE, 17-25 kts (tracker global)
//   EXTREMAS:    3 min — >30 kts o rachas >=35 kts (tracker global)
//   OFFSHORE:    5 min — viento offshore >=12 kts (tracker global)
//   IDEALES:     5 min — >= minWind del suscriptor, <27 kts (tracker POR SUSCRIPTOR)
//
// El tracker "good" es por suscriptor porque cada uno tiene su minWind diferente.
// Los demás son globales porque no dependen de config individual.

import { initFirebase } from './_firebase.js';
import admin from 'firebase-admin';

const PUSH_COLLECTION = 'push_subscriptions';
const PUSH_LOG_COLLECTION = 'push_alert_log';
const TRACKER_COLLECTION = 'condition_tracker';

const SUSTAINED_MINUTES = {
    epic: 10,
    dangerous: 3,
    offshore: 5,
    good: 5,
};

const CONFIG = {
    dangerousSpeed: 30,
    dangerousGust: 35,
    epicMinWind: 17,
    epicMaxWind: 25,
    epicMinDeg: 68,
    epicMaxDeg: 146,
    offshoreStart: 292.5,
    offshoreEnd: 67.5,
    cooldownMinutes: 15,
};

// --- Ecowitt ---
async function getWindData() {
    const url = 'https://api.ecowitt.net/api/v3/device/real_time?application_key=515398061FDA504607F0329996375FC2&api_key=2b181909-3bd1-4a8f-8cf1-91cb95e75ff5&mac=C8:C9:A3:1C:0D:E5&call_back=all&temp_unitid=1&pressure_unitid=3&wind_speed_unitid=8&rainfall_unitid=12&solar_irradiance_unitid=14&capacity_unitid=25';
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        if (data.code !== 0 || !data.data) return null;
        const wind = data.data.wind || {};
        return {
            speed: parseFloat(wind.wind_speed?.value || 0),
            gust: parseFloat(wind.wind_gust?.value || 0),
            direction: parseInt(wind.wind_direction?.value || 0),
        };
    } catch (e) {
        console.error('Error Ecowitt:', e);
        return null;
    }
}

function degreesToCardinal(deg) {
    const d = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSO','SO','OSO','O','ONO','NO','NNO'];
    return d[Math.round(deg / 22.5) % 16];
}

// --- Evaluadores de condición ---
function isEpicNow(speed, dir) {
    return speed >= CONFIG.epicMinWind && speed < CONFIG.epicMaxWind &&
           dir >= CONFIG.epicMinDeg && dir <= CONFIG.epicMaxDeg;
}
function isDangerousNow(speed, gust) {
    return speed > CONFIG.dangerousSpeed || gust >= CONFIG.dangerousGust;
}
function isOffshoreNow(speed, dir) {
    return (dir >= CONFIG.offshoreStart || dir <= CONFIG.offshoreEnd) && speed >= 12;
}
function isGoodNow(speed, dir, minWind) {
    const offshore = dir >= CONFIG.offshoreStart || dir <= CONFIG.offshoreEnd;
    return speed >= minWind && speed <= 27 && !offshore;
}

// --- Tracker persistido en Firestore ---
async function updateTracker(db, docPath, conditionMet, requiredMinutes) {
    const now = Date.now();
    const docRef = db.doc(docPath);

    if (conditionMet) {
        const doc = await docRef.get();
        const existing = doc.exists ? doc.data() : null;

        if (existing && existing.startedAt) {
            await docRef.update({ lastSeen: now });
            const minutesActive = (now - existing.startedAt) / (1000 * 60);
            const sustained = minutesActive >= requiredMinutes;
            return { sustained, minutesActive: Math.round(minutesActive) };
        } else {
            await docRef.set({ startedAt: now, lastSeen: now });
            return { sustained: false, minutesActive: 0 };
        }
    } else {
        await docRef.set({ startedAt: null, lastSeen: now, brokenAt: now });
        return { sustained: false, minutesActive: 0 };
    }
}

// --- Enviar Web Push ---
async function sendWebPush(subscription, payload) {
    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const vapidEmail = process.env.VAPID_EMAIL || 'mailto:labajadakite@gmail.com';

    if (!vapidPublicKey || !vapidPrivateKey) return false;

    try {
        const webpush = await import('web-push');
        webpush.default.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);
        await webpush.default.sendNotification(subscription, JSON.stringify(payload));
        return true;
    } catch (error) {
        if (error.statusCode === 410 || error.statusCode === 404) return 'expired';
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
        // 1. Datos de viento
        const wind = await getWindData();
        if (!wind) return res.status(500).json({ ok: false, error: 'Sin datos de viento' });

        const cardinal = degreesToCardinal(wind.direction);
        console.log(`🌬️ ${wind.speed.toFixed(1)} kts ${cardinal}, rachas ${wind.gust.toFixed(1)}`);

        // 2. Firebase
        const db = initFirebase();
        if (!db) return res.status(500).json({ ok: false, error: 'Firebase no disponible' });

        // 3. Trackers GLOBALES (no dependen de config individual)
        const globalTrackers = {
            epic:      await updateTracker(db, `${TRACKER_COLLECTION}/epic`,      isEpicNow(wind.speed, wind.direction),     SUSTAINED_MINUTES.epic),
            dangerous: await updateTracker(db, `${TRACKER_COLLECTION}/dangerous`, isDangerousNow(wind.speed, wind.gust),     SUSTAINED_MINUTES.dangerous),
            offshore:  await updateTracker(db, `${TRACKER_COLLECTION}/offshore`,  isOffshoreNow(wind.speed, wind.direction), SUSTAINED_MINUTES.offshore),
        };

        console.log('📊 Trackers globales:', JSON.stringify(globalTrackers));

        // 4. Suscriptores activos
        const snapshot = await db.collection(PUSH_COLLECTION).where('active', '==', true).get();

        if (snapshot.empty) {
            return res.status(200).json({ ok: true, wind, trackers: globalTrackers, subscribers: 0, sent: 0 });
        }

        // 5. Cooldown: no repetir mismo tipo en 2h
        const cooldownMs = CONFIG.cooldownMinutes * 60 * 1000;
        const cooldownTime = new Date(Date.now() - cooldownMs);
        let recentAlertTypes = new Set();
        
        try {
            const logSnapshot = await db.collection(PUSH_LOG_COLLECTION)
                .orderBy('timestamp', 'desc')
                .limit(5)
                .get();
            
            logSnapshot.docs.forEach(doc => {
                const data = doc.data();
                const logTime = data.timestamp?.toDate?.() || new Date(0);
                if (logTime > cooldownTime) {
                    recentAlertTypes.add(data.alertType);
                }
            });
        } catch (e) {
            console.log('Sin logs previos:', e.message);
        }

        console.log('🕐 Cooldown activo para:', [...recentAlertTypes]);

        // 6. Evaluar y enviar POR SUSCRIPTOR
        let sent = 0, skipped = 0, expired = 0;
        let alertTypesSent = new Set();
        let subscriberDebug = [];

        await Promise.allSettled(
            snapshot.docs.map(async (subDoc) => {
                const subData = subDoc.data();
                const subMinWind = subData.config?.minNavigableWind || 15;
                const subId = subDoc.id;

                // Tracker "good" POR SUSCRIPTOR (cada uno tiene su minWind)
                const goodCondition = isGoodNow(wind.speed, wind.direction, subMinWind);
                const goodTracker = await updateTracker(
                    db,
                    `${TRACKER_COLLECTION}/good_${subId}`,
                    goodCondition,
                    SUSTAINED_MINUTES.good
                );

                subscriberDebug.push({
                    id: subId,
                    minWind: subMinWind,
                    goodCondition,
                    goodTracker,
                    windSpeed: wind.speed,
                    windDir: wind.direction,
                    isOffshore: wind.direction >= CONFIG.offshoreStart || wind.direction <= CONFIG.offshoreEnd,
                });

                // Elegir alerta (prioridad: epic > dangerous > offshore > good)
                let alert = null;

                if (globalTrackers.epic.sustained) {
                    alert = {
                        type: 'epic',
                        title: '👑 ¡ÉPICO!',
                        body: `${wind.speed.toFixed(0)} kts del ${cardinal} — Sostenido ${globalTrackers.epic.minutesActive}+ min`,
                        priority: 1,
                    };
                } else if (globalTrackers.dangerous.sustained) {
                    alert = {
                        type: 'dangerous',
                        title: '⚠️ ¡Condiciones extremas!',
                        body: `${wind.speed.toFixed(0)} kts, rachas ${wind.gust.toFixed(0)} kts`,
                        priority: 2,
                    };
                } else if (globalTrackers.offshore.sustained) {
                    alert = {
                        type: 'offshore',
                        title: '🚨 Viento Offshore',
                        body: `${wind.speed.toFixed(0)} kts del ${cardinal} — ¡No navegar!`,
                        priority: 3,
                    };
                } else if (goodTracker.sustained) {
                    alert = {
                        type: 'good',
                        title: '🪁 ¡Está soplando en Claromecó!',
                        body: `${wind.speed.toFixed(0)} kts del ${cardinal} — Sostenido ${goodTracker.minutesActive}+ min`,
                        priority: 4,
                    };
                }

                if (!alert) { skipped++; return; }

                // Cooldown por tipo
                if (recentAlertTypes.has(alert.type)) {
                    skipped++;
                    console.log(`⏭️ Skip ${subId}: cooldown activo para "${alert.type}"`);
                    return;
                }

                // Enviar push
                const payload = {
                    title: alert.title,
                    body: alert.body,
                    icon: '/icon-192.png',
                    badge: '/badge-wind.png',
                    tag: `wind-alert-${alert.type}`,
                    vibrate: alert.priority <= 2 ? [300, 100, 300, 100, 300] : [200, 100, 200],
                    requireInteraction: alert.priority <= 2,
                    data: { url: '/?from_notification=true' },
                };

                const result = await sendWebPush(subData.subscription, payload);

                if (result === 'expired') {
                    await db.collection(PUSH_COLLECTION).doc(subId).update({ active: false });
                    expired++;
                } else if (result) {
                    sent++;
                    alertTypesSent.add(alert.type);
                }
            })
        );

        // 7. Loguear alertas enviadas
        if (sent > 0) {
            for (const type of alertTypesSent) {
                try {
                    const logData = {
                        timestamp: admin.firestore.FieldValue.serverTimestamp(),
                        alertType: type,
                        windSpeed: wind.speed,
                        windGust: wind.gust,
                        windDirection: wind.direction,
                        cardinal,
                        subscribersSent: sent,
                        subscribersSkipped: skipped,
                        subscribersExpired: expired,
                        createdAt: new Date().toISOString(),
                    };
                    const logRef = await db.collection(PUSH_LOG_COLLECTION).add(logData);
                    console.log('📝 Log guardado:', logRef.id, type);
                } catch (e) {
                    console.error('❌ Error guardando log:', e.message, e.stack);
                    // Fallback: intentar sin serverTimestamp
                    try {
                        await db.collection(PUSH_LOG_COLLECTION).add({
                            timestamp: new Date(),
                            alertType: type,
                            windSpeed: wind.speed,
                            createdAt: new Date().toISOString(),
                        });
                        console.log('📝 Log guardado (fallback)');
                    } catch (e2) {
                        console.error('❌ Fallback también falló:', e2.message);
                    }
                }
            }
        }

        return res.status(200).json({
            ok: true,
            wind: { speed: wind.speed.toFixed(1), gust: wind.gust.toFixed(1), direction: cardinal, degrees: wind.direction },
            trackers: globalTrackers,
            alert: alertTypesSent.size > 0 ? { types: [...alertTypesSent] } : null,
            subscribers: { total: snapshot.size, sent, skipped, expired, debug: subscriberDebug },
            cooldown: { recentTypes: [...recentAlertTypes] },
        });

    } catch (error) {
        console.error('Error en push-alert:', error);
        return res.status(500).json({ ok: false, error: error.message });
    }
}
