// --- Función Serverless para Vercel ---
// Nombre de archivo: /api/tides.js
//
// Esta función actúa como un proxy seguro para la API de Mareas de Stormglass.
// Oculta tu clave de Stormglass en el servidor.

// 1. Coordenadas de Claromecó (Puerto Tres Arroyos)
const LAT = '-38.860571';
const LNG = '-60.079501';

// 2. Parámetros que queremos de la API de Stormglass
const PARAMS = 'tide';

// 3. URL base de la API
const STORMGLASS_API_URL = `https://api.stormglass.io/v2/tide?lat=${LAT}&lng=${LNG}&params=${PARAMS}`;

// 4. Tu clave API (leída desde las Variables de Entorno de Vercel)
const STORMGLASS_API_KEY = process.env.STORMGLASS_API_KEY;

export default async function handler(req, res) {
    // 5. Solo aceptamos GET
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Método no permitido. Solo GET.' });
    }

    // 6. Verificamos que la clave esté configurada en Vercel
    if (!STORMGLASS_API_KEY) {
        console.error("STORMGLASS_API_KEY no está configurada en Vercel.");
        return res.status(500).json({ error: 'Autenticación de API de Mareas no configurada en el servidor.' });
    }

    try {
        // 7. Realizamos la llamada a la API de Stormglass, pasando la clave en los Headers.
        const response = await fetch(STORMGLASS_API_URL, {
            headers: {
                'Authorization': STORMGLASS_API_KEY
            }
        });

        // 8. MANEJO DE ERRORES MEJORADO
        if (!response.ok) {
            let errorMsg = `Error de la API de Mareas: ${response.status}`;
            
            // Leemos la respuesta como TEXTO (esto es seguro y solo lee una vez)
            const errorText = await response.text();
            
            // Intentar leer el error como JSON (que es lo que Stormglass envía)
            try {
                // Intentamos "parsear" el texto que ya leímos
                const errorData = JSON.parse(errorText); 
                console.error("Error de la API de Stormglass (JSON):", errorData);
                // Extraer el mensaje de error específico
                errorMsg = errorData.errors?.key || errorData.error || JSON.stringify(errorData.errors);
            } catch (e) {
                // Si el parseo falla, el error era solo texto plano
                console.error("Error de la API de Stormglass (no-JSON):", errorText);
                errorMsg = errorText; // Usamos el texto crudo
            }
            
            // Devolver un JSON de error, no causar un crash
            return res.status(response.status).json({ error: errorMsg });
        }

        // 9. Si todo está OK, parsear el JSON y devolverlo
        const data = await response.json();
        res.status(200).json(data);

    } catch (error) {
        console.error('Error en la función Serverless (api/tides.js):', error.message);
        res.status(500).json({ error: error.message });
    }
}