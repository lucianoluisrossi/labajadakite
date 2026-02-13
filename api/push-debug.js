// API de diagnóstico para verificar que todo está configurado
// Llamar: GET /api/push-debug

import { initFirebase } from './_firebase.js';

export default async function handler(req, res) {
    const checks = {
        timestamp: new Date().toISOString(),
        firebase: { ok: false, error: null },
        vapid: { ok: false, publicKey: null, privateKey: null },
        webpush: { ok: false, error: null },
        ecowitt: { ok: false, error: null },
        subscriptions: { ok: false, count: 0, error: null },
        cron_secret: { configured: false },
    };

    // 1. Check Firebase
    try {
        const db = initFirebase();
        if (db) {
            checks.firebase.ok = true;
            
            // Intentar leer colección push_subscriptions
            try {
                const snapshot = await db.collection('push_subscriptions').get();
                checks.subscriptions.ok = true;
                checks.subscriptions.count = snapshot.size;
                
                // Mostrar info básica de cada suscripción (sin datos sensibles)
                checks.subscriptions.docs = snapshot.docs.map(doc => ({
                    id: doc.id,
                    active: doc.data().active,
                    hasSubscription: !!doc.data().subscription,
                    hasEndpoint: !!doc.data().subscription?.endpoint,
                    config: doc.data().config || null,
                    subscribedAt: doc.data().subscribedAt?.toDate?.()?.toISOString() || null,
                }));
            } catch (error) {
                checks.subscriptions.error = error.message;
            }
        } else {
            checks.firebase.error = 'initFirebase() retornó null - ¿FIREBASE_SERVICE_ACCOUNT configurado?';
        }
    } catch (error) {
        checks.firebase.error = error.message;
    }

    // 2. Check VAPID keys
    const vapidPublic = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
    const vapidEmail = process.env.VAPID_EMAIL;

    checks.vapid.publicKey = vapidPublic ? `${vapidPublic.substring(0, 10)}... (${vapidPublic.length} chars)` : 'NO CONFIGURADA';
    checks.vapid.privateKey = vapidPrivate ? `****** (${vapidPrivate.length} chars)` : 'NO CONFIGURADA';
    checks.vapid.email = vapidEmail || 'NO CONFIGURADO (opcional)';
    checks.vapid.ok = !!(vapidPublic && vapidPrivate);

    // 3. Check web-push module
    try {
        const webpush = await import('web-push');
        checks.webpush.ok = true;
        checks.webpush.version = webpush.default ? 'loaded (default export)' : 'loaded';
    } catch (error) {
        checks.webpush.error = error.message;
    }

    // 4. Check Ecowitt
    try {
        const ECOWITT_URL = 'https://api.ecowitt.net/api/v3/device/real_time?application_key=515398061FDA504607F0329996375FC2&api_key=2b181909-3bd1-4a8f-8cf1-91cb95e75ff5&mac=C8:C9:A3:1C:0D:E5&call_back=all&temp_unitid=1&pressure_unitid=3&wind_speed_unitid=8&rainfall_unitid=12&solar_irradiance_unitid=14&capacity_unitid=25';
        
        const response = await fetch(ECOWITT_URL);
        const data = await response.json();
        
        if (data.code === 0 && data.data) {
            const wind = data.data.wind || {};
            checks.ecowitt.ok = true;
            checks.ecowitt.wind = {
                speed: wind.wind_speed?.value || 'N/A',
                gust: wind.wind_gust?.value || 'N/A',
                direction: wind.wind_direction?.value || 'N/A',
            };
        } else {
            checks.ecowitt.error = `code: ${data.code}, msg: ${data.msg || 'sin datos'}`;
        }
    } catch (error) {
        checks.ecowitt.error = error.message;
    }

    // 5. Check CRON_SECRET
    checks.cron_secret.configured = !!process.env.CRON_SECRET;

    // Resumen
    const allOk = checks.firebase.ok && checks.vapid.ok && checks.webpush.ok && checks.ecowitt.ok;
    
    return res.status(200).json({
        status: allOk ? '✅ TODO OK' : '⚠️ HAY PROBLEMAS',
        checks,
        env_vars_needed: {
            FIREBASE_SERVICE_ACCOUNT: checks.firebase.ok ? '✅' : '❌ Falta',
            VAPID_PUBLIC_KEY: checks.vapid.ok ? '✅' : '❌ Falta',
            VAPID_PRIVATE_KEY: checks.vapid.ok ? '✅' : '❌ Falta',
            VAPID_EMAIL: checks.vapid.email !== 'NO CONFIGURADO (opcional)' ? '✅' : '⚠️ Opcional',
            CRON_SECRET: checks.cron_secret.configured ? '✅' : '⚠️ Opcional',
        },
    });
}
