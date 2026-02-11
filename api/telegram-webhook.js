// Webhook para el Bot de Telegram - La Bajada Kitesurf
// Vercel Serverless Function
// Comandos: /start, /viento, /info, /stop

import { addSubscriber, removeSubscriber, updateSubscriberActivity } from './_firebase.js';

const TELEGRAM_API = 'https://api.telegram.org/bot';

async function sendTelegramMessage(chatId, text) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
        console.error('TELEGRAM_BOT_TOKEN no configurado');
        return false;
    }
    
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
        
        if (!response.ok) {
            const error = await response.text();
            console.error('Error de Telegram API:', error);
        }
        
        return response.ok;
    } catch (error) {
        console.error('Error enviando mensaje:', error);
        return false;
    }
}

export default async function handler(req, res) {
    // GET request - verificar que el webhook está activo
    if (req.method === 'GET') {
        return res.status(200).json({ ok: true, message: 'Webhook activo - La Bajada Wind Bot' });
    }
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    try {
        const update = req.body;
        
        // Verificar si es un mensaje
        if (!update.message) {
            return res.status(200).json({ ok: true });
        }

        const chatId = update.message.chat.id;
        const text = (update.message.text || '').trim();
        const firstName = update.message.from?.first_name || 'Kitero';
        const username = update.message.from?.username || null;

        // Comando /start - Suscribir usuario
        if (text === '/start') {
            // Guardar suscriptor en Firebase
            const saved = await addSubscriber(chatId, { firstName, username });
            
            const welcomeMessage = `<b>¡Hola ${firstName}!</b>

Bienvenido al bot de alertas de viento de <b>La Bajada - Claromecó</b>.

${saved ? '✅ <b>¡Estás suscripto!</b> Recibirás alertas cuando haya buen viento.' : ''}

<b>Condiciones para alertas:</b>
• Viento mayor a 12 nudos
• Dirección favorable (N, NE, NO)

<b>Comandos disponibles:</b>
/viento - Ver condiciones actuales
/info - Información del spot
/stop - Cancelar suscripción

¡Buenas sesiones!`;

            await sendTelegramMessage(chatId, welcomeMessage);
            return res.status(200).json({ ok: true, action: 'subscribed' });
        }

        // Comando /stop - Desuscribir usuario
        if (text === '/stop') {
            await removeSubscriber(chatId);
            
            const goodbyeMessage = `👋 <b>¡Hasta pronto ${firstName}!</b>

Has cancelado las alertas de viento.

Podés volver a suscribirte cuando quieras con /start

🔗 <a href="https://labajada.vercel.app">Visitá la app</a>`;

            await sendTelegramMessage(chatId, goodbyeMessage);
            return res.status(200).json({ ok: true, action: 'unsubscribed' });
        }

        // Comando /viento - Mostrar condiciones actuales
        if (text === '/viento') {
            await updateSubscriberActivity(chatId);
            
            try {
                const windData = await getWindData();
                if (windData) {
                    const cardinal = degreesToCardinal(windData.direction);
                    const message = `<b>Condiciones actuales en La Bajada</b>

💨 Viento: <b>${windData.speed} nudos</b>
🧭 Dirección: <b>${cardinal} (${windData.direction}°)</b>
💥 Ráfagas: <b>${windData.gust} nudos</b>
🌡️ Temperatura: <b>${windData.temp}°C</b>

${getWindEmoji(windData.speed)} ${getWindVerdict(windData.speed)}

🔗 <a href="https://labajada.vercel.app">Ver cámara en vivo</a>`;

                    await sendTelegramMessage(chatId, message);
                } else {
                    await sendTelegramMessage(chatId, '⚠️ No se pudieron obtener los datos de viento. Intentá de nuevo en unos minutos.');
                }
            } catch (error) {
                console.error('Error en /viento:', error);
                await sendTelegramMessage(chatId, '⚠️ Error al obtener datos. Intentá de nuevo.');
            }
            return res.status(200).json({ ok: true });
        }

        // Comando /info - Información del spot
        if (text === '/info') {
            await updateSubscriberActivity(chatId);
            
            const infoMessage = `📍 <b>La Bajada - Claromecó</b>

Spot de kitesurf en la costa atlántica argentina.

<b>Mejores condiciones:</b>
• Viento del Norte (N, NE, NO)
• 15-25 nudos ideal
• Marea baja a media

<b>Escuelas en el spot:</b>
• Kite School Claromecó
• Wind Riders

🔗 <a href="https://labajada.vercel.app">Abrir la app completa</a>`;

            await sendTelegramMessage(chatId, infoMessage);
            return res.status(200).json({ ok: true });
        }

        // Mensaje no reconocido
        await sendTelegramMessage(chatId, `No entendí ese comando.

<b>Comandos disponibles:</b>
/viento - Ver condiciones actuales
/info - Información del spot
/stop - Cancelar alertas`);
        
        return res.status(200).json({ ok: true });

    } catch (error) {
        console.error('Error en webhook:', error);
        return res.status(200).json({ ok: false, error: error.message });
    }
}

// Función para obtener datos de viento de Ecowitt
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
            speed: parseFloat(wind.wind_speed?.value || 0).toFixed(1),
            gust: parseFloat(wind.wind_gust?.value || 0).toFixed(1),
            direction: parseInt(wind.wind_direction?.value || 0),
            temp: parseFloat(outdoor.temperature?.value || 0).toFixed(1)
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

function getWindEmoji(speed) {
    if (speed >= 20) return '🔥';
    if (speed >= 15) return '💪';
    if (speed >= 12) return '👍';
    if (speed >= 8) return '😐';
    return '😴';
}

function getWindVerdict(speed) {
    if (speed >= 20) return '¡Condiciones épicas!';
    if (speed >= 15) return '¡Muy bueno para kitear!';
    if (speed >= 12) return 'Bueno para kite grande';
    if (speed >= 8) return 'Viento flojo';
    return 'Sin viento para kite';
}
