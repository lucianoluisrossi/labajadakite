// Función Serverless para proxy de la API de Gemini (Vercel)
// Esto asegura que la clave API (GEMINI_API_KEY) se mantenga segura en el servidor.

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).send({ error: 'Método no permitido. Solo POST.' });
    }

    if (!GEMINI_API_KEY) {
        console.error("GEMINI_API_KEY no está configurada como variable de entorno en Vercel.");
        return res.status(403).json({ error: 'Fallo de autenticación: La clave de la API de Gemini no está configurada en el servidor (403).' });
    }

    try {
        // El cuerpo de la solicitud (payload) viene directamente del frontend.
        const payload = req.body;

        const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) {
            // Reenviar el error exacto de la API de Gemini al cliente
            console.error("Error de la API de Gemini:", data);
            return res.status(response.status).json(data);
        }

        // Reenviar la respuesta exitosa al cliente
        res.status(200).json(data);

    } catch (error) {
        console.error('Error Serverless al procesar la solicitud de Gemini:', error);
        res.status(500).json({ error: 'Error interno del servidor Serverless.' });
    }
}
