// API Serverless para gestionar suscripciones Web Push
// POST: guardar suscripción | DELETE: eliminar suscripción

import { initFirebase } from './_firebase.js';
import admin from 'firebase-admin';

const PUSH_COLLECTION = 'push_subscriptions';

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const db = initFirebase();
    if (!db) {
        return res.status(500).json({ error: 'Firebase no configurado' });
    }

    // POST: Guardar suscripción
    if (req.method === 'POST') {
        try {
            const { subscription, config } = req.body;

            if (!subscription || !subscription.endpoint) {
                return res.status(400).json({ error: 'Suscripción inválida' });
            }

            // Usar hash del endpoint como ID del documento (determinístico)
            const crypto = await import('crypto');
            const docId = crypto.createHash('sha256')
                .update(subscription.endpoint)
                .digest('hex')
                .substring(0, 20);

            await db.collection(PUSH_COLLECTION).doc(docId).set({
                subscription: subscription,
                config: {
                    minNavigableWind: config?.minNavigableWind || 15,
                    maxGoodWind: config?.maxGoodWind || 27,
                },
                active: true,
                subscribedAt: admin.firestore.FieldValue.serverTimestamp(),
                lastActivity: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });

            console.log('✅ Suscripción push guardada:', docId);
            return res.status(200).json({ ok: true, id: docId });

        } catch (error) {
            console.error('Error guardando suscripción:', error);
            return res.status(500).json({ error: error.message });
        }
    }

    // DELETE: Eliminar suscripción
    if (req.method === 'DELETE') {
        try {
            const { endpoint } = req.body;

            if (!endpoint) {
                return res.status(400).json({ error: 'Endpoint requerido' });
            }

            const crypto = await import('crypto');
            const docId = crypto.createHash('sha256')
                .update(endpoint)
                .digest('hex')
                .substring(0, 20);

            await db.collection(PUSH_COLLECTION).doc(docId).set({
                active: false,
                unsubscribedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });

            console.log('✅ Suscripción push eliminada:', docId);
            return res.status(200).json({ ok: true });

        } catch (error) {
            console.error('Error eliminando suscripción:', error);
            return res.status(500).json({ error: error.message });
        }
    }

    return res.status(405).json({ error: 'Método no permitido' });
}
