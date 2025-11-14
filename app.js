document.addEventListener('DOMContentLoaded', () => {
        
    // --- Registro del Service Worker (PWA) ---
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js') 
                .then(registration => {
                    console.log('Service Worker: Instalado y registrado con éxito', registration);
                })
                .catch(error => {
                    console.log('Error al registrar el Service Worker:', error);
                });
        });
    }

    // --- URLs de las Funciones Serverless (Proxy) ---
    const weatherApiUrl = 'api/data';
    //const verdictApiUrl = 'api/verdict'; // API GEMINI (Para Veredicto)
    const windyApiUrl = 'api/windy';    // API WINDY (Para Pronóstico)

    // --- ELEMENTOS DEL DOM (Datos Generales) ---
    const tempEl = document.getElementById('temp-data');
    const humidityEl = document.getElementById('humidity-data');
    const pressureEl = document.getElementById('pressure-data');
    const rainfallDailyEl = document.getElementById('rainfall-daily-data'); 
    const uviEl = document.getElementById('uvi-data'); 
    const errorEl = document.getElementById('error-message');
    const lastUpdatedEl = document.getElementById('last-updated');

    // --- ELEMENTOS DEL DOM (Viento Resaltado) ---
    const windHighlightCard = document.getElementById('wind-highlight-card');
    const highlightWindDirEl = document.getElementById('highlight-wind-dir-data');
    const highlightWindSpeedEl = document.getElementById('highlight-wind-speed-data');
    const highlightGustEl = document.getElementById('highlight-gust-data');
    const windArrowEl = document.getElementById('wind-arrow'); 
    const windSpeedSubCardEl = document.getElementById('wind-speed-sub-card'); 
    const windGustSubCardEl = document.getElementById('wind-gust-sub-card'); 
    
    // --- ELEMENTOS DEL DOM (Veredicto EN VIVO) ---
    const verdictCardEl = document.getElementById('verdict-card');
    const verdictDataEl = document.getElementById('verdict-data');
    const verdictDataLoaderEl = document.getElementById('verdict-data-loader');

    // --- ELEMENTOS DEL DOM (Veredicto PRONÓSTICO IA) ---
    const forecastVerdictCardEl = document.getElementById('forecast-verdict-card');
    const forecastVerdictLoaderEl = document.getElementById('forecast-verdict-loader');
    const forecastVerdictDataEl = document.getElementById('forecast-verdict-data');

    // --- MEJORA UX: IDs de todos los Skeletons y Contenidos ---
    const skeletonLoaderIds = [
        'verdict-data-loader',
        'highlight-wind-dir-data-loader', 'highlight-wind-speed-data-loader', 'highlight-gust-data-loader',
        'temp-data-loader', 'humidity-data-loader', 'pressure-data-loader', 
        'rainfall-daily-data-loader', 'uvi-data-loader'
    ];
    const dataContentIds = [
        'verdict-data',
        'highlight-wind-dir-data', 'highlight-wind-speed-data', 'highlight-gust-data',
        'temp-data', 'humidity-data', 'pressure-data',
        'rainfall-daily-data', 'uvi-data'
    ];

    // --- MEJORA UX: Variable para "Time Ago" ---
    let lastUpdateTime = null;

    // --- MEJORA UX: Función para mostrar/ocultar Skeletons ---
    function showSkeletons(isLoading) {
        // Manejar skeletons de datos principales
        skeletonLoaderIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = isLoading ? 'block' : 'none';
        });
        dataContentIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = isLoading ? 'none' : 'block';
        });

        if (isLoading) {
            if (lastUpdatedEl) lastUpdatedEl.textContent = 'Actualizando datos...';
        }
    }
    
    // --- MEJORA UX: Función para actualizar "Time Ago" ---
    function updateTimeAgo() {
        if (!lastUpdateTime) return;
        const now = new Date();
        const secondsAgo = Math.round((now - lastUpdateTime) / 1000);
        
        if (secondsAgo < 5) {
            lastUpdatedEl.textContent = "Actualizado ahora";
        } else if (secondsAgo < 60) {
            lastUpdatedEl.textContent = `Actualizado hace ${secondsAgo} seg.`;
        } else {
            lastUpdatedEl.textContent = `Actualizado: ${lastUpdateTime.toLocaleTimeString('es-AR')}`;
        }
    }


    // --- FUNCIÓN: CONVERTIR GRADOS A PUNTO CARDINAL ---
    function convertDegreesToCardinal(degrees) {
        if (degrees === null || isNaN(degrees)) return 'N/A';
        const val = Math.floor((degrees / 22.5) + 0.5);
        const arr = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"];
        return arr[val % 16];
    }
    
    // --- FUNCIÓN DE VEREDICTO (Lógica simple) ---
    // (Anteriormente 'getSpotVerdict_Fallback')
    function getSpotVerdict(speed, gust, degrees) {
        // Esta función devuelve [texto, [claseFondo, claseBorde]]
        // 1. Chequeo de Peligro (Offshore)
        if (degrees !== null) {
            if ((degrees > 292.5 || degrees <= 67.5)) {
                return ["¡PELIGRO! VIENTO OFFSHORE", ['bg-red-400', 'border-red-600']];
            }
        }
        // 2. Chequeo de Viento (basado en 'speed')
        if (speed === null) {
            return ["Calculando...", ['bg-gray-100', 'border-gray-300']];
        }
        // 3. Chequeo de Viento Navegable
        if (speed <= 14) {
            return ["FLOJO...", ['bg-blue-200', 'border-blue-400']];
        } else if (speed <= 18) {
            return ["¡IDEAL!", ['bg-green-300', 'border-green-500']];
        } else if (speed <= 22) {
            return ["¡MUY BUENO!", ['bg-yellow-300', 'border-yellow-500']];
        } else if (speed <= 27) {
            return ["¡FUERTE!", ['bg-orange-300', 'border-orange-500']];
        } else { // > 27
            if (speed > 33) {
                return ["¡DEMASIADO FUERTE!", ['bg-purple-400', 'border-purple-600']];
            } else {
                return ["¡MUY FUERTE!", ['bg-red-400', 'border-red-600']];
            }
        }
    }

    // --- CONSTANTES DE CLASES DE COLOR ---
    const allColorClasses = [
        'bg-gray-100', 'border-gray-300',
        'bg-blue-200', 'border-blue-400',
        'bg-green-300', 'border-green-500',
        'bg-yellow-300', 'border-yellow-500',
        'bg-orange-300', 'border-orange-500',
        'bg-red-400', 'border-red-600',
        'bg-purple-400', 'border-purple-600',
    ];

    // --- FUNCIÓN DE UTILIDAD: Para actualizar colores de tarjetas ---
    function updateCardColors(element, newClasses) {
        if (!element) return;
        element.classList.remove(...allColorClasses);
        element.classList.add(...newClasses);
    }

    // --- FUNCIÓN: Obtener clases de color para TARJETA PRINCIPAL (Neutral) ---
    function getMainCardColorClasses(speedInKnots) {
        return ['bg-gray-100', 'border-gray-300'];
    }

    // --- FUNCIÓN: Obtener clases de color para SUB-TARJETA (Lógica Windy) ---
    function getWindyColorClasses(speedInKnots) {
        if (speedInKnots !== null && !isNaN(speedInKnots)) {
            if (speedInKnots <= 10) {
                return ['bg-blue-200', 'border-blue-400']; // Azul
            } else if (speedInKnots <= 16) {
                return ['bg-green-300', 'border-green-500']; // Verde
            } else if (speedInKnots <= 21) {
                return ['bg-yellow-300', 'border-yellow-500']; // Amarillo
            } else if (speedInKnots <= 27) {
                return ['bg-orange-300', 'border-orange-500']; // Naranja
            } else if (speedInKnots <= 33) {
                return ['bg-red-400', 'border-red-600']; // Rojo
            } else {
                return ['bg-purple-400', 'border-purple-600']; // Púrpura
            }
        }
        return ['bg-gray-100', 'border-gray-300']; // Default (Gris)
    }
    
    // --- FUNCIÓN DE UTILIDAD: Fetch con Reintentos (Exponential Backoff) ---
    async function fetchWithBackoff(url, options, retries = 3, delay = 1000) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                if ((response.status >= 500 || response.status === 429) && retries > 0) {
                    await new Promise(res => setTimeout(res, delay));
                    return fetchWithBackoff(url, options, retries - 1, delay * 2);
                }
                let errorText = await response.text();
                try {
                    const errorJson = JSON.parse(errorText);
                    errorText = errorJson.error || errorText;
                } catch (e) {
                    // No era JSON, usar el texto plano
                }
                throw new Error(errorText);
            }
            return response.json();
        } catch (error) {
            if (retries > 0) {
                await new Promise(res => setTimeout(res, delay));
                return fetchWithBackoff(url, options, retries - 1, delay * 2);
            }
            throw error; // Lanzar el error final
        }
    }

    // --- NUEVAS Funciones de Ayuda (Procesar datos de Windy) ---
    function convertUVtoKnots(u, v) {
        // (m/s * 1.94384) = knots
        return Math.sqrt(u * u + v * v) * 1.94384;
    }
    function convertUVtoDegrees(u, v) {
        // Dirección meteorológica (de dónde viene el viento)
        let degrees = (Math.atan2(u, v) * (180 / Math.PI)) + 180;
        return (degrees + 360) % 360; // Asegurar 0-360
    }


    // --- NUEVA FUNCIÓN: OBTENER VEREDICTO DEL PRONÓSTICO (IA) ---
    async function fetchForecastVerdict() {
        forecastVerdictLoaderEl.style.display = 'block';
        forecastVerdictDataEl.style.display = 'none';

        try {
            // 1. Get forecast data from Windy API
            const windyPayload = {
                lat: -38.860571, // Coordenadas de Claromecó (de api/tides.js)
                lon: -60.079501,
                model: "gfs",
                parameters: ["wind", "temp"], // Pedimos viento y temp
                levels: ["surface"]
            };
            
            const windyData = await fetchWithBackoff(windyApiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(windyPayload)
            });

            if (!windyData || !windyData['wind_u-surface']) {
                throw new Error('Datos de pronóstico (Windy) no válidos.');
            }

            // 2. Procesar el dato del pronóstico (usamos 6hs a futuro, índice 2)
            const forecastIndex = 2; // Índice 2 = ~6 horas
            const u = windyData['wind_u-surface'][forecastIndex];
            const v = windyData['wind_v-surface'][forecastIndex];
            // Windy devuelve temp en Kelvin, la pasamos a Celsius
            const temp = windyData['temp-surface'][forecastIndex] - 273.15; 

            const speed = convertUVtoKnots(u, v);
            const direction = convertUVtoDegrees(u, v);
            const cardinal = convertDegreesToCardinal(direction);

            // 3. Obtener el color del veredicto primero (usando la lógica simple)
            const [fallbackText, verdictColors] = getSpotVerdict(speed, null, direction);
            updateCardColors(forecastVerdictCardEl, verdictColors); // Poner color a la tarjeta
            forecastVerdictDataEl.textContent = fallbackText; // Poner texto de fallback

            // 4. Llamar a Gemini (api/verdict.js) con estos datos del pronóstico
            const geminiResponse = await fetchWithBackoff(verdictApiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    speed: parseFloat(speed.toFixed(1)),
                    gust: null, // El pronóstico GFS de Windy no da racha (gust)
                    direction: parseFloat(direction.toFixed(1)),
                    cardinal: cardinal,
                    temp: parseFloat(temp.toFixed(1))
                })
            });

            if (geminiResponse.verdict) {
                forecastVerdictDataEl.textContent = geminiResponse.verdict; // Sobrescribir con IA
            }

        } catch (error) {
            console.error("Error al generar Veredicto (IA) del Pronóstico:", error);
            forecastVerdictDataEl.textContent = "Error al analizar pronóstico.";
            updateCardColors(forecastVerdictCardEl, ['bg-red-400', 'border-red-600']);
        } finally {
            forecastVerdictLoaderEl.style.display = 'none';
            forecastVerdictDataEl.style.display = 'block';
        }
    }
    
    // --- FUNCIÓN: OBTENER DATOS DEL CLIMA (ECOWITT) ---
    async function fetchWeatherData() {
        
        showSkeletons(true); // MEJORA UX: Mostrar skeletons
        errorEl.classList.add('hidden'); // Ocultar error antiguo

        let windSpeedValue = null; 
        let windGustValue = null; 
        let windDirDegrees = null;
        let tempValue = null;

        try {
            const json = await fetchWithBackoff(weatherApiUrl, {});

            if (json.code === 0 && json.data) {
                const data = json.data;
                
                // Extracción de datos
                const outdoor = data.outdoor || {};
                const wind = data.wind || {};
                const pressure = data.pressure || {};
                const rainfall = data.rainfall || {}; 
                const solarUVI = data.solar_and_uvi || {}; 
                
                const temp = outdoor.temperature;
                const humidity = outdoor.humidity;
                const pressureRel = pressure.relative;
                const rainfallDaily = rainfall.daily; 
                const uvi = solarUVI.uvi; 
                
                const windSpeed = wind.wind_speed;
                const windGust = wind.wind_gust;
                const windDir = wind.wind_direction;
                
                // ** LÓGICA DE VIENTO **
                windSpeedValue = (windSpeed && windSpeed.value !== null) ? parseFloat(windSpeed.value) : null;
                windGustValue = (windGust && windGust.value !== null) ? parseFloat(windGust.value) : null; 
                windDirDegrees = (windDir && windDir.value !== null) ? parseFloat(windDir.value) : null;
                tempValue = (temp && temp.value !== null) ? parseFloat(temp.value) : null;
                const windDirCardinal = windDirDegrees !== null ? convertDegreesToCardinal(windDirDegrees) : 'N/A';
                
                // --- (INICIO DE LÓGICA DE VEREDICTO SIMPLE) ---
                // (Se eliminó la llamada a Gemini de aquí)
                const [verdictText, verdictColors] = getSpotVerdict(windSpeedValue, windGustValue, windDirDegrees);
                
                // 1. Asignar el color de la tarjeta de veredicto
                updateCardColors(verdictCardEl, verdictColors);
                // 2. Asignar el texto de veredicto
                verdictDataEl.textContent = verdictText;
                
                // --- (FIN DE LÓGICA DE VEREDICTO SIMPLE) ---


                // MEJORA UX: Aplicar rotación Y COLOR (Red/Yellow/Green) a la flecha
                if (windArrowEl && windDirDegrees !== null) {
                    windArrowEl.style.transform = `rotate(${windDirDegrees}deg)`;
                    
                    // Lógica de color de flecha MEJORADA
                    if (windDirDegrees > 337.5 || windDirDegrees <= 22.5) { // N (Offshore)
                        windArrowEl.classList.remove('text-green-600', 'text-yellow-600', 'text-gray-900');
                        windArrowEl.classList.add('text-red-600');
                    } else if (windDirDegrees > 22.5 && windDirDegrees <= 67.5) { // NNE, NE (Offshore)
                        windArrowEl.classList.remove('text-green-600', 'text-yellow-600', 'text-gray-900');
                        windArrowEl.classList.add('text-red-600');
                    } else if (windDirDegrees > 67.5 && windDirDegrees <= 112.5) { // ENE, E (Cross)
                        windArrowEl.classList.remove('text-green-600', 'text-red-600', 'text-gray-900');
                        windArrowEl.classList.add('text-yellow-600');
                    } else if (windDirDegrees > 112.5 && windDirDegrees <= 247.5) { // ESE, SE, S, SO, OSO (Onshore)
                        windArrowEl.classList.remove('text-red-600', 'text-yellow-600', 'text-gray-900');
                        windArrowEl.classList.add('text-green-600');
                    } else if (windDirDegrees > 247.5 && windDirDegrees <= 292.5) { // O, ONO (Cross)
                        windArrowEl.classList.remove('text-green-600', 'text-red-600', 'text-gray-900');
                        windArrowEl.classList.add('text-yellow-600');
                    } else { // NO, NNO (Lógica Offshore modificada)
                        windArrowEl.classList.remove('text-green-600', 'text-yellow-600', 'text-gray-900');
                        windArrowEl.classList.add('text-red-600');
                    }

                } else if (windArrowEl) {
                    windArrowEl.classList.remove('text-red-600', 'text-green-600', 'text-yellow-600');
                    windArrowEl.classList.add('text-gray-900');
                }


                // Aplicar clase de color al card de viento PRINCIPAL (Neutral)
                updateCardColors(windHighlightCard, getMainCardColorClasses(windSpeedValue));

                // Aplicar clase de color a la SUB-TARJETA de velocidad (Lógica Windy)
                updateCardColors(windSpeedSubCardEl, getWindyColorClasses(windSpeedValue));
                
                // Aplicar clase de color a la SUB-TARJETA de ráfaga (Lógica Windy)
                updateCardColors(windGustSubCardEl, getWindyColorClasses(windGustValue));


                // Actualizar UI del card de viento
                highlightWindSpeedEl.textContent = windSpeed ? `${windSpeed.value} ${windSpeed.unit}` : 'N/A';
                highlightGustEl.textContent = windGust ? `${windGust.value} ${windGust.unit}` : 'N/A';
                highlightWindDirEl.textContent = windDirCardinal; 

                // Actualizar UI de datos generales
                tempEl.textContent = temp ? `${temp.value} ${temp.unit}` : 'N/A';
                humidityEl.textContent = humidity ? `${humidity.value} ${humidity.unit}` : 'N/A';
                pressureEl.textContent = pressureRel ? `${pressureRel.value} ${pressureRel.unit}` : 'N/A'; 
                rainfallDailyEl.textContent = rainfallDaily ? `${rainfallDaily.value} ${rainfallDaily.unit}` : 'N/A'; 
                uviEl.textContent = uvi ? uvi.value : 'N/A'; 
                
                showSkeletons(false); // MEJORA UX: Ocultar skeletons
                
                lastUpdateTime = new Date(); // MEJORA UX: Registrar tiempo
                updateTimeAgo(); // MEJORA UX: Actualizar "Time Ago"

                // (Llamada a Gemini ELIMINADA de aquí)

            } else {
                // Manejar errores de la API de Ecowitt que vienen en el JSON
                throw new Error(json.msg || 'Formato de datos incorrecto de la fuente.');
            }
        } catch (error) {
            console.error('Error al obtener datos del clima:', error);
            
            // MEJORA UX: Mostrar error en la tarjeta principal
            errorEl.textContent = `Error: No se pudieron cargar los datos. (${error.message})`;
            errorEl.classList.remove('hidden');
            
            // Ocultar Skeletons aunque haya error
            showSkeletons(false);
            
            // Resetear la UI a N/A
            tempEl.textContent = 'N/A';
            humidityEl.textContent = 'N/A';
            pressureEl.textContent = 'N/A';
            rainfallDailyEl.textContent = 'N/A';
            uviEl.textContent = 'N/A';

            highlightWindSpeedEl.textContent = 'N/A';
            highlightGustEl.textContent = 'N/A';
            highlightWindDirEl.textContent = 'N/A';
            
            // Resetear color de la tarjeta a gris (usando las funciones corregidas)
            updateCardColors(windHighlightCard, getMainCardColorClasses(null));
            
            // Resetear color de la SUB-TARJETA a gris (usando las funciones corregidas)
            updateCardColors(windSpeedSubCardEl, getWindyColorClasses(null));
            updateCardColors(windGustSubCardEl, getWindyColorClasses(null));

            // Resetear Veredicto (con error)
            verdictDataEl.textContent = 'Error en API (Ecowitt)';
            updateCardColors(verdictCardEl, ['bg-red-400', 'border-red-600']);
            verdictDataLoaderEl.style.display = 'none'; // Ocultar loader
            verdictDataEl.style.display = 'block'; // Mostrar error

            // Resetear flecha
            if (windArrowEl) {
                windArrowEl.classList.remove('text-red-600', 'text-green-600', 'text-yellow-600');
                windArrowEl.classList.add('text-gray-900');
                windArrowEl.style.transform = 'rotate(0deg)';
            }
            
            if (lastUpdatedEl) lastUpdatedEl.textContent = "Error en la actualización.";
        }
    }
    
    // --- INICIALIZACIÓN ---
    
    // Cargar datos del clima al iniciar
    fetchWeatherData();
    // Cargar el veredicto del pronóstico (IA)
    //fetchForecastVerdict();

    // Actualizar datos cada 30 segundos (30000ms)
    setInterval(fetchWeatherData, 30000);
    
    // MEJORA UX: Actualizar el "Time Ago" cada 5 segundos
    setInterval(updateTimeAgo, 5000);
});
