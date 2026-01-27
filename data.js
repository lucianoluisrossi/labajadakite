// Función handler para Vercel Serverless
module.exports = async (req, res) => {
    
    // 1. MEJORA DE SEGURIDAD: Leer las claves desde las Variables de Entorno
    // Estas variables se configuran en el panel de Vercel.
    const APP_KEY = process.env.ECOWITT_APP_KEY;
    const API_KEY = process.env.ECOWITT_API_KEY;
    const MAC = process.env.ECOWITT_MAC;

    // Validar que las variables de entorno estén cargadas
    if (!APP_KEY || !API_KEY || !MAC) {
        console.error("Error: Faltan variables de entorno de Ecowitt.");
        return res.status(500).json({ 
            code: -3, 
            msg: "Error de configuración del servidor: Faltan claves de API." 
        });
    }

    // Construir la URL de forma segura
    const ECOWITT_API_URL = `https://api.ecowitt.net/api/v3/device/real_time?application_key=${APP_KEY}&api_key=${API_KEY}&mac=${MAC}&call_back=all&temp_unitid=1&pressure_unitid=5&wind_speed_unitid=8&rainfall_unitid=12&solar_irradiance_unitid=14&capacity_unitid=25`;

    try {
        const fetchOptions = {
            headers: {
                'User-Agent': 'LaBajada-Vercel-Proxy/1.0'
            }
        };

        const response = await fetch(ECOWITT_API_URL, fetchOptions);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Error de la API de Ecowitt: ${response.status}`, errorText);
            
            return res.status(502).json({ 
                code: -1, 
                msg: `Error del proxy al contactar Ecowitt: ${response.status} ${response.statusText}` 
            });
        }

        const data = await response.json();
        
        // 2. MEJORA DE EFICIENCIA: CACHING
        // s-maxage=30: Vercel cachea esta respuesta por 30 segundos en el Edge.
        // stale-while-revalidate=59: Si una petición llega después de los 30s,
        // Vercel entrega la data "vieja" (stale) al instante, y 
        // en segundo plano busca la nueva. El usuario NUNCA espera.
        res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=59');

        // Vercel maneja el CORS por nosotros cuando la petición viene del mismo proyecto.
        // No necesitamos 'Access-Control-Allow-Origin' explícito.
        res.setHeader('Content-Type', 'application/json');
        
        return res.status(200).json(data);

    } catch (error) {
        console.error('Error de red en la función serverless:', error);
        res.status(500).json({ 
            code: -2, 
            msg: `Error interno de conexión: ${error.message}` 
        });
    }
};
