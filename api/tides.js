// Función Serverless para proxy de la API de Stormglass (Vercel)
// Esto evita problemas de CORS y oculta la clave API.
// Llama a /api/tides

// NOTA: Endpoint cambiado a /tide/extremes para obtener Pleamar y Bajamar

// 1. Coordenadas y parámetros para la API de Stormglass
const lat = -38.860571;
const lng = -60.079501;
// 'extremes' nos da 'high' (pleamar) y 'low' (bajamar)
const params = 'extremes'; 

// 2. Leer la clave API desde las Variables de Entorno de Vercel
const STORMGLASS_API_KEY = process.env.STORMGLASS_API_KEY;
const STORMGLASS_URL = 'https://api.stormglass.io/v2/tide';

// 3. Configurar el inicio y fin del día (en UTC) para obtener las mareas de hoy
const now = new Date();
const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString();
const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();

// 4. Construir la URL final de la API
// Endpoint: /tide/extremes
const FULL_API_URL = `${STORMGLASS_URL}/extremes?lat=${lat}&lng=${lng}&start=${start}&end=${end}`;


export default async function handler(req, res) {
    // Solo aceptamos GET
    if (req.method !== 'GET') {
        return res.status(405).send({ error: 'Método no permitido. Solo GET.' });
    }

    // Verificar que la clave API esté configurada en Vercel
    if (!STORMGLASS_API_KEY) {
        console.error("STORMGLASS_API_KEY no está configurada como variable de entorno en Vercel.");
        return res.status(500).json({ error: 'Autenticación de API de Mareas no configurada en el servidor.' });
    }

    let responseText = ''; // Variable para almacenar la respuesta de texto

    try {
        const response = await fetch(FULL_API_URL, {
            headers: {
                // Autenticación de Stormglass
                'Authorization': STORMGLASS_API_KEY
            }
        });

        // Leemos la respuesta como TEXTO primero, para evitar el error "Body has already been read"
        responseText = await response.text();

        // Si la respuesta no es 200 OK, devolvemos el error
        if (!response.ok) {
            // Stormglass a veces devuelve errores en JSON, a veces no.
            // Intentamos parsear el texto por si es un error JSON.
            try {
                const errorJson = JSON.parse(responseText);
                console.error('Error (JSON) de la API de Stormglass:', errorJson);
                return res.status(response.status).json({ 
                    error: 'Fallo al obtener datos de Stormglass (API)', 
                    details: errorJson.errors || 'Error desconocido' 
                });
            } catch (e) {
                // Si no es JSON (ej: un 404 o 500 HTML), devolvemos el texto del error.
                console.error(`Error (no-JSON) de la API de Stormglass: ${response.status}`, responseText);
                return res.status(response.status).json({ 
                    error: `Error de la API de Stormglass (no-JSON): ${responseText}` 
                });
            }
        }

        // Si la respuesta es 200 OK, intentamos parsear el JSON
        const data = JSON.parse(responseText);
        
        // Devolvemos los datos exitosos (ej: data.data.extremes)
        res.status(200).json(data);

    } catch (error) {
        // Error general de la función serverless (ej: fetch falló)
        console.error('Error Serverless al procesar la solicitud de Stormglass:', error);
        res.status(500).json({ 
            error: 'Error interno del servidor Serverless (Tides).',
            details: error.message
        });
    }
}
