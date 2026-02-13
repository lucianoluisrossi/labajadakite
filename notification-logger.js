// notification-logger.js
// Sistema de logging mejorado para notificaciones push

import { getFirestore, collection, addDoc, serverTimestamp, query, where, getDocs, orderBy, limit, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

/**
 * Clase para manejar el logging de notificaciones en Firestore
 */
export class NotificationLogger {
    constructor(firebaseApp) {
        this.db = getFirestore(firebaseApp);
        this.collectionName = 'notification_log';
    }

    /**
     * Convierte grados a dirección cardinal
     */
    degreesToCardinal(degrees) {
        if (degrees === null || degrees === undefined) return 'N/A';
        
        const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 
                          'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
        const index = Math.round(degrees / 22.5) % 16;
        return directions[index];
    }

    /**
     * Determina si el viento es offshore (peligroso)
     */
    isOffshore(degrees) {
        if (degrees === null) return false;
        return degrees > 292.5 || degrees <= 67.5;
    }

    /**
     * Determina si es condición épica (E, ESE, SE con >17 kts)
     */
    isEpicCondition(windSpeed, direction) {
        if (!windSpeed || !direction) return false;
        return windSpeed > 17 && direction >= 68 && direction <= 146;
    }

    /**
     * Registra una notificación enviada en Firestore
     * 
     * @param {Object} params - Parámetros de la notificación
     * @param {number} params.windSpeed - Velocidad del viento (kts)
     * @param {number} params.windGust - Rachas (kts)
     * @param {number} params.direction - Dirección en grados
     * @param {string} params.notificationType - Tipo: 'good-conditions', 'epic-east', 'dangerous', 'wind-increased'
     * @param {string} params.notificationTitle - Título de la notificación
     * @param {string} params.notificationBody - Cuerpo de la notificación
     * @param {Array<string>} params.userIds - IDs de usuarios que recibieron
     * @param {Array<Object>} params.usersConfig - Configuraciones de usuarios (opcional)
     * @param {string} params.source - Fuente de datos (default: 'weather-station')
     */
    async logNotification(params) {
        try {
            const {
                windSpeed,
                windGust = null,
                direction,
                notificationType,
                notificationTitle,
                notificationBody,
                userIds = [],
                usersConfig = [],
                source = 'weather-station'
            } = params;

            // Validación básica
            if (!windSpeed || !direction || !notificationType) {
                console.error('❌ Error: Faltan parámetros requeridos para log');
                return null;
            }

            const cardinal = this.degreesToCardinal(direction);
            const isOffshore = this.isOffshore(direction);
            const isEpic = this.isEpicCondition(windSpeed, direction);

            // Estructura mejorada del log
            const logEntry = {
                // Timestamp
                timestamp: serverTimestamp(),
                
                // Datos del viento
                windSpeed: windSpeed,
                windGust: windGust,
                direction: direction,
                cardinal: cardinal,
                isOffshore: isOffshore,
                isEpic: isEpic,
                
                // Tipo de notificación
                notificationType: notificationType,
                notificationTitle: notificationTitle,
                notificationBody: notificationBody,
                
                // Usuarios
                sentTo: userIds.length,
                userIds: userIds,
                
                // Configuraciones (si se proporcionan)
                ...(usersConfig.length > 0 && { usersConfig: usersConfig }),
                
                // Metadatos
                source: source,
                appVersion: '2.0.0',
                environment: 'production'
            };

            // Guardar en Firestore
            const docRef = await addDoc(collection(this.db, this.collectionName), logEntry);
            
            console.log('✅ Notificación registrada:', {
                id: docRef.id,
                type: notificationType,
                users: userIds.length,
                wind: `${windSpeed} kts ${cardinal}`
            });

            return docRef.id;
            
        } catch (error) {
            console.error('❌ Error al registrar notificación:', error);
            return null;
        }
    }

    /**
     * Obtiene estadísticas de notificaciones
     */
    async getStats(days = 7) {
        try {
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);

            const q = query(
                collection(this.db, this.collectionName),
                where('timestamp', '>=', startDate),
                orderBy('timestamp', 'desc')
            );

            const snapshot = await getDocs(q);
            const notifications = [];
            
            snapshot.forEach((doc) => {
                notifications.push({ id: doc.id, ...doc.data() });
            });

            // Calcular estadísticas
            const stats = {
                total: notifications.length,
                uniqueUsers: new Set(notifications.flatMap(n => n.userIds || [])).size,
                avgSpeed: notifications.reduce((sum, n) => sum + (n.windSpeed || 0), 0) / notifications.length || 0,
                
                byType: notifications.reduce((acc, n) => {
                    acc[n.notificationType] = (acc[n.notificationType] || 0) + 1;
                    return acc;
                }, {}),
                
                byCardinal: notifications.reduce((acc, n) => {
                    acc[n.cardinal] = (acc[n.cardinal] || 0) + 1;
                    return acc;
                }, {}),
                
                epicCount: notifications.filter(n => n.isEpic).length,
                offshoreCount: notifications.filter(n => n.isOffshore).length
            };

            return stats;
            
        } catch (error) {
            console.error('❌ Error al obtener estadísticas:', error);
            return null;
        }
    }

    /**
     * Obtiene notificaciones de un usuario específico
     */
    async getUserNotifications(userId, limitCount = 50) {
        try {
            const q = query(
                collection(this.db, this.collectionName),
                where('userIds', 'array-contains', userId),
                orderBy('timestamp', 'desc'),
                limit(limitCount)
            );

            const snapshot = await getDocs(q);
            const notifications = [];
            
            snapshot.forEach((doc) => {
                notifications.push({ id: doc.id, ...doc.data() });
            });

            return notifications;
            
        } catch (error) {
            console.error('❌ Error al obtener notificaciones del usuario:', error);
            return [];
        }
    }

    /**
     * Limpia logs antiguos (más de X días)
     */
    async cleanOldLogs(days = 90) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);

            const q = query(
                collection(this.db, this.collectionName),
                where('timestamp', '<', cutoffDate)
            );

            const snapshot = await getDocs(q);
            let deleted = 0;

            // Borrar en batch
            const batch = writeBatch(this.db);
            snapshot.forEach((doc) => {
                batch.delete(doc.ref);
                deleted++;
            });

            if (deleted > 0) {
                await batch.commit();
                console.log(`🗑️ Eliminados ${deleted} logs antiguos (>${days} días)`);
            }

            return deleted;
            
        } catch (error) {
            console.error('❌ Error al limpiar logs antiguos:', error);
            return 0;
        }
    }
}

// Exportar tipos para TypeScript (opcional)
export const NotificationTypes = {
    GOOD_CONDITIONS: 'good-conditions',
    EPIC_EAST: 'epic-east',
    DANGEROUS: 'dangerous',
    WIND_INCREASED: 'wind-increased',
    OFFSHORE_WARNING: 'offshore-warning'
};
