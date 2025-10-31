// Función Serverless para proxy de la API de Ecowitt (Vercel)
// Esto evita problemas de CORS y permite que el frontend llame a /api/data de forma segura.

// NOTA: La clave de la aplicación y la MAC se dejan aquí ya que son públicas.

const ECOWITT_URL = 'https://api.ecowitt.net/api/v3/device/real_time';

// URL de la API de Ecowitt con la unidad de Presión cambiada a HPA (pressure_unitid=3)
const FULL_API_URL = `${ECOWITT_URL}?application_key=515398061FDA504607F0329996375FC2&api_key=2b181909-3bd1-4a8f-8cf1-91cb95e75ff5&mac=C8:C9:A3:1C:0D:E5&call_back=all&temp_unitid=1&pressure_unitid=3&wind_speed_unitid=8&rainfall_unitid=12&solar_irradiance_unitid=14&capacity_unitid=25`;

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).send({ error: 'Método no permitido. Solo GET.' });
    }

    try {
        const response = await fetch(FULL_API_URL, {
            // Es una buena práctica agregar un User-Agent
            headers: { 'User-Agent': 'LaBajada-Dashboard-Vercel-Function' }
        });
        
        // Si la respuesta de Ecowitt no es 200, devolvemos el error.
        if (!response.ok) {
            console.error(`Error de la API de Ecowitt: ${response.status}`);
            return res.status(response.status).json({ error: `Fallo al obtener datos de Ecowitt: ${response.statusText}` });
        }

        const data = await response.json();
        
        // Devolvemos la respuesta exitosa al frontend
        res.status(200).json(data);

    } catch (error) {
        console.error('Error Serverless al procesar la solicitud de Ecowitt:', error);
        res.status(500).json({ error: 'Error interno del servidor Serverless al contactar la fuente de datos.' });
    }
}
