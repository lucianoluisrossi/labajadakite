// --- API Serverless para el Veredicto de Gemini ---
// ESTA VERSIÓN ESTÁ ACTUALIZADA PARA ANALIZAR UN PRONÓSTICO (no datos en vivo)

// Importar la SDK de Google (requerida para Vercel)
import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
    // 1. Verificar que sea un método POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido. Usar POST.' });
    }

    // 2. Obtener la clave API de Gemini desde las variables de entorno de Vercel
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'Clave API de Gemini (GEMINI_API_KEY) no configurada en Vercel.' });
    }

    // 3. Obtener los datos del clima enviados desde el index.html
    // (Estos son datos del PRONÓSTICO de Windy)
    const { speed, gust, direction, cardinal, temp } = req.body;

    // --- 4. Construir el Prompt para Gemini (MODIFICADO) ---

    // El rol del modelo: un kiter experto analizando el futuro
    const systemPrompt = `
        Eres "KiteBot", un experto local de kitesurf en el spot "La Bajada" de Claromecó, Argentina.
        Tu trabajo es analizar un PRONÓSTICO (datos para las próximas horas) y dar un veredicto MUY corto (máximo 8 palabras) 
        sobre qué esperar.
        
        REGLAS:
        - USA JERGA LOCAL: "se pone bueno", "va a estar arrachado", "ideal para 9m", "pasado", "para foilear", "se plancha".
        - PRIORIZA LA SEGURIDAD: Si la dirección del pronóstico es offshore (N, NNE, NE, NO, NNO) es SIEMPRE "¡PELIGRO! PRONO OFFSHORE".
        - SÉ CONCISO: Responde solo el veredicto, sin saludos.
        - ANALIZA EL PRONÓSTICO: El pronóstico (GFS) no siempre incluye rachas (gust), así que céntrate en el promedio (speed).
        - RECOMIENDA: Si el viento es navegable (15-25 nudos), sugiere un tamaño de kite (ej: "Ideal para 9m/10m").
    `;

    // El prompt del usuario (los datos)
    const userQuery = `
        Datos del PRONÓSTICO (para aprox. 6 horas a futuro):
        - Velocidad Promedio: ${speed !== null ? speed + ' nudos' : 'N/A'}
        - Dirección: ${direction !== null ? direction + '°' : 'N/A'} (${cardinal})
        - Temperatura: ${temp !== null ? temp + '°C' : 'N/A'}
        - (Nota: Racha (Gust) no está disponible en este pronóstico)

        Veredicto? (Máx 8 palabras)
    `;

    try {
        // --- 5. Llamar a la API de Gemini ---
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash-preview-09-2025", // Usamos el modelo Flash
            systemInstruction: {
                parts: [{ text: systemPrompt }],
                role: "model"
            }
        });

        const result = await model.generateContent(userQuery);
        const response = await result.response;
        const text = response.text().trim();

        // 6. Devolver el veredicto al index.html
        res.status(200).json({ verdict: text });

    } catch (error) {
        console.error("Error llamando a la API de Gemini:", error);
        res.status(500).json({ error: 'Error al generar el veredicto de la IA.' });
    }
}