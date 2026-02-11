// Función para enviar alertas de viento a suscriptores de Telegram
// Llamar desde un cron job cada 30 minutos
// Vercel Serverless Function

import { getSubscribers } from './_firebase.js';

const TELEGRAM_API = 'https://api.telegram.org/bot';

// Configuración de alertas
const WIND_THRESHOLD = 12; // Nudos mínimos para alertar
const GOOD_DIRECTIONS = ['N', 'NE', 'NO', 'NNE', 'NNO']; // Direcciones favorables

async function sendTelegramMessage(chatId, text) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return false;
    
    const url = `${TELEGRAM_API}${token}/sendMessage`;
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: text,
                parse_mode: 'HTML',
                disable_web_page_preview: true
            })
        });
        return response.ok;
    } catch (error) {
        console.error('Error enviando mensaje a', chatId, ':', error);
        return false;
    }
}

async function getWindData() {
    const ECOWITT_URL = 'https://api.ecowitt.net/api/v3/device/real_time';
    const FULL_API_URL = `${ECOWITT_URL}?application_key=515398061FDA504607F0329996375FC2&api_key=2b181909-3bd1-4a8f-8cf1-91cb95e75ff5&mac=C8:C9:A3:1C:0D:E5&call_back=all&temp_unitid=1&pressure_unitid=3&wind_speed_unitid=8&rainfall_unitid=12&solar_irradiance_unitid=14&capacity_unitid=25`;

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
            temp: parseFloat(outdoor.temperature?.value || 0)
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

function shouldAlert(windData) {
    if (!windData) return false;
    
    const cardinal = degreesToCardinal(windData.direction);
    const hasGoodWind = windData.speed >= WIND_THRESHOLD;
    const hasGoodDirection = GOOD_DIRECTIONS.includes(cardinal);
    
    return hasGoodWind && hasGoodDirection;
}

export default async function handler(req, res) {
    // Verificar API key para seguridad (opcional)
    const apiKey = req.headers['x-api-key'] || req.query.key;
    const expectedKey = process.env.ALERT_API_KEY;
    
    // Si hay una key configurada, verificarla
    if (expectedKey && apiKey !== expectedKey) {
        return res.status(401).json({ error: 'No autorizado' });
    }

    try {
        // Obtener datos de viento
        const windData = await getWindData();
        
        if (!windData) {
            return res.status(500).json({ 
                ok: false, 
                error: 'No se pudieron obtener datos de viento' 
            });
        }

        const cardinal = degreesToCardinal(windData.direction);
        const shouldSendAlert = shouldAlert(windData);

        // Obtener suscriptores de Firebase
        const subscribers = await getSubscribers();

        // Info de estado actual
        const status = {
            ok: true,
            wind: {
                speed: windData.speed.toFixed(1),
                gust: windData.gust.toFixed(1),
                direction: cardinal,
                degrees: windData.direction,
                temperature: windData.temp.toFixed(1)
            },
            alert: {
                triggered: shouldSendAlert,
                threshold: WIND_THRESHOLD,
                good_directions: GOOD_DIRECTIONS
            },
            subscribers: {
                total: subscribers.length,
                sent: 0,
                failed: 0
            }
        };

        // Si las condiciones son buenas y hay suscriptores, enviar alerta
        if (shouldSendAlert && subscribers.length > 0) {
            const alertMessage = `🪁 <b>¡ALERTA DE VIENTO!</b>

¡Hay buenas condiciones en La Bajada!

💨 Viento: <b>${windData.speed.toFixed(1)} nudos</b>
🧭 Dirección: <b>${cardinal}</b>
💥 Ráfagas: <b>${windData.gust.toFixed(1)} nudos</b>
🌡️ Temperatura: <b>${windData.temp.toFixed(1)}°C</b>

🔥 ¡A preparar el equipo!

🔗 <a href="https://labajada.vercel.app">Ver cámara en vivo</a>`;

            // Enviar a todos los suscriptores
            const results = await Promise.allSettled(
                subscribers.map(sub => sendTelegramMessage(sub.chatId, alertMessage))
            );

            status.subscribers.sent = results.filter(r => r.status === 'fulfilled' && r.value).length;
            status.subscribers.failed = results.length - status.subscribers.sent;
        }

        return res.status(200).json(status);

    } catch (error) {
        console.error('Error en alerta:', error);
        return res.status(500).json({ 
            ok: false, 
            error: error.message 
        });
    }
}
