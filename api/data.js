// Esta función se ejecuta en el servidor de Vercel y actúa como proxy seguro.
// La URL de la API de Ecowitt fue verificada con la documentación provista.

const ECOWITT_API_URL = 'https://api.ecowitt.net/api/v3/device/real_time?application_key=515398061FDA504607F0329996375FC2&api_key=2b181909-3bd1-4a8f-8cf1-91cb95e75ff5&mac=C8:C9:A3:1C:0D:E5&call_back=all&temp_unitid=1&pressure_unitid=5&wind_speed_unitid=8&rainfall_unitid=12&solar_irradiance_unitid=14&capacity_unitid=25';

// Función handler para Vercel Serverless
module.exports = async (req, res) => {
    try {
        // Añadimos un User-Agent para simular un navegador y evitar posibles bloqueos
        const fetchOptions = {
            headers: {
                'User-Agent': 'LaBajada-Vercel-Proxy/1.0'
            }
        };

        // Hacemos la llamada a la API de Ecowitt desde el servidor de Vercel (sin restricciones CORS)
        const response = await fetch(ECOWITT_API_URL, fetchOptions);
        
        // Verificamos si la respuesta de Ecowitt fue exitosa (código 200-299)
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Error de la API de Ecowitt: ${response.status}`, errorText);
            
            // Devolvemos un error 502 (Bad Gateway) al cliente porque el proxy falló al obtener datos
            return res.status(502).json({ 
                code: -1, 
                msg: `Error del proxy al contactar Ecowitt: ${response.status} ${response.statusText}` 
            });
        }

        // Devolvemos el JSON de Ecowitt directamente al cliente (index.html)
        const data = await response.json();
        
        // Establecemos el encabezado CORS para que tu index.html pueda leerlo
        res.setHeader('Access-Control-Allow-Origin', '*'); 
        res.setHeader('Content-Type', 'application/json');
        
        return res.status(200).json(data);

    } catch (error) {
        // Manejo de errores de red o internos (DNS, conexión, timeouts, etc.)
        console.error('Error de red en la función serverless:', error);
        res.status(500).json({ 
            code: -2, 
            msg: `Error interno de conexión: ${error.message}` 
        });
    }
};
