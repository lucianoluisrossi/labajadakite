// app.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInAnonymously, signInWithPopup, signOut, onAuthStateChanged, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, limit, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- CONFIGURACIÓN DE FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyDitwwF3Z5F9KCm9mP0LsXWDuflGtXCFcw",
  authDomain: "labajadakite.firebaseapp.com",
  projectId: "labajadakite",
  storageBucket: "labajadakite.firebasestorage.app", 
  messagingSenderId: "982938582037",
  appId: "1:982938582037:web:7141082f9ca601e9aa221c",
  measurementId: "G-R926P5WBWW"
};

// Variables globales
let db;
let auth; 
let messagesCollection;
let galleryCollection;
let currentUser = null;
const googleProvider = new GoogleAuthProvider();

try {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    
    messagesCollection = collection(db, "kiter_board");
    galleryCollection = collection(db, "daily_gallery_meta"); 

    console.log("✅ Firebase inicializado.");

    // --- FUNCIONES DE LOGIN/LOGOUT ---
    async function loginWithGoogle() {
        try {
            const result = await signInWithPopup(auth, googleProvider);
            console.log("✅ Login exitoso:", result.user.displayName);
        } catch (error) {
            console.error("❌ Error en login:", error);
            if (error.code === 'auth/popup-blocked') {
                alert('El navegador bloqueó la ventana emergente. Por favor, permite las ventanas emergentes para esta página.');
            } else if (error.code === 'auth/cancelled-popup-request') {
                // Usuario cerró el popup, no hacer nada
            } else {
                alert('Error al iniciar sesión: ' + error.message);
            }
        }
    }

    async function logout() {
        try {
            await signOut(auth);
            console.log("✅ Sesión cerrada");
        } catch (error) {
            console.error("❌ Error al cerrar sesión:", error);
        }
    }

    // Exponer funciones globalmente para uso en eventos
    window.loginWithGoogle = loginWithGoogle;
    window.logout = logout;

    document.addEventListener('DOMContentLoaded', () => {
    
    // --- FUNCIÓN PARA ACTUALIZAR UI DE AUTH ---
    function updateAuthUI(user) {
        const authLogin = document.getElementById('auth-login');
        const authUser = document.getElementById('auth-user');
        const userPhoto = document.getElementById('user-photo');
        const userName = document.getElementById('user-name');
        const messageForm = document.getElementById('kiter-board-form');
        const loginPromptMessages = document.getElementById('login-prompt-messages');
        const galleryUploadContainer = document.getElementById('gallery-upload-container');
        const loginPromptGallery = document.getElementById('login-prompt-gallery');

        if (user) {
            // Usuario logueado
            if (authLogin) authLogin.classList.add('hidden');
            if (authUser) authUser.classList.remove('hidden');
            if (userPhoto) userPhoto.src = user.photoURL || 'https://via.placeholder.com/40';
            if (userName) userName.textContent = user.displayName || 'Kiter';
            if (messageForm) messageForm.classList.remove('hidden');
            if (loginPromptMessages) loginPromptMessages.classList.add('hidden');
            if (galleryUploadContainer) galleryUploadContainer.classList.remove('hidden');
            if (loginPromptGallery) loginPromptGallery.classList.add('hidden');
            console.log("✅ Usuario logueado:", user.displayName);
        } else {
            // Usuario no logueado
            if (authLogin) authLogin.classList.remove('hidden');
            if (authUser) authUser.classList.add('hidden');
            if (messageForm) messageForm.classList.add('hidden');
            if (loginPromptMessages) loginPromptMessages.classList.remove('hidden');
            if (galleryUploadContainer) galleryUploadContainer.classList.add('hidden');
            if (loginPromptGallery) loginPromptGallery.classList.remove('hidden');
            console.log("ℹ️ Usuario no logueado");
        }
    }

    // --- LISTENER DE ESTADO DE AUTENTICACIÓN (dentro de DOMContentLoaded) ---
    onAuthStateChanged(auth, (user) => {
        currentUser = user;
        updateAuthUI(user);
    });
    console.log("🚀 App iniciada.");

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js').catch(console.error);
        });
    }

    // --- ELEMENTOS DE NAVEGACIÓN ---
    const viewDashboard = document.getElementById('view-dashboard');
    const viewCommunity = document.getElementById('view-community');
    const navHomeBtn = document.getElementById('nav-home');
    const btnPizarraMenu = document.getElementById('btn-pizarra-menu');
    const backToHomeBtn = document.getElementById('back-to-home');
    const fabCommunity = document.getElementById('fab-community');
    const newMessageToast = document.getElementById('new-message-toast');
    const newPhotoToast = document.getElementById('new-photo-toast');
    const menuButton = document.getElementById('menu-button');
    const menuCloseButton = document.getElementById('menu-close-button');
    const mobileMenu = document.getElementById('mobile-menu');
    const menuBackdrop = document.getElementById('menu-backdrop');

    // --- LÓGICA DE INSTALACIÓN PWA ---
    let deferredPrompt;
    window.addEventListener('beforeinstallprompt', (e) => {
        // Prevenir que Chrome 76+ muestre el prompt automáticamente
        e.preventDefault();
        // Guardar el evento para dispararlo más tarde
        deferredPrompt = e;
        
        // Opcional: Mostrar un botón o mensaje propio de "Instalar App"
        console.log("PWA lista para ser instalada");
        
        // Intentar disparar el prompt automáticamente después de 3 segundos de navegación
        setTimeout(() => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                deferredPrompt.userChoice.then((choiceResult) => {
                    if (choiceResult.outcome === 'accepted') {
                        console.log('Usuario aceptó la instalación');
                    }
                    deferredPrompt = null;
                });
            }
        }, 3000);
    });

    window.addEventListener('appinstalled', (e) => {
        console.log('PWA instalada correctamente');
    });

    function switchView(viewName) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        if (viewName === 'dashboard') {
            viewDashboard.classList.remove('hidden');
            viewCommunity.classList.add('hidden');
            if(fabCommunity) fabCommunity.classList.remove('hidden');
        } else {
            viewDashboard.classList.add('hidden');
            viewCommunity.classList.remove('hidden');
            if(fabCommunity) fabCommunity.classList.add('hidden');
            markMessagesAsRead();
        }
        if (mobileMenu && !mobileMenu.classList.contains('-translate-x-full')) {
            toggleMenu();
        }
    }

    function toggleMenu() {
        if (mobileMenu.classList.contains('-translate-x-full')) {
            mobileMenu.classList.remove('-translate-x-full'); 
            menuBackdrop.classList.remove('hidden'); 
        } else {
            mobileMenu.classList.add('-translate-x-full'); 
            menuBackdrop.classList.add('hidden'); 
        }
    }

    if (navHomeBtn) navHomeBtn.addEventListener('click', () => switchView('dashboard'));
    if (backToHomeBtn) backToHomeBtn.addEventListener('click', () => switchView('dashboard'));
    if (btnPizarraMenu) btnPizarraMenu.addEventListener('click', () => switchView('community'));
    if (fabCommunity) fabCommunity.addEventListener('click', () => switchView('community'));
    if (newMessageToast) newMessageToast.addEventListener('click', () => switchView('community'));
    if (newPhotoToast) {
        newPhotoToast.addEventListener('click', () => {
            switchView('community');
            // Abrir la galería automáticamente
            const gallerySection = document.getElementById('gallery-section');
            if (gallerySection) gallerySection.setAttribute('open', '');
            markPhotosAsRead();
        });
    }
    if (menuButton) menuButton.addEventListener('click', toggleMenu);
    if (menuCloseButton) menuCloseButton.addEventListener('click', toggleMenu);
    if (menuBackdrop) menuBackdrop.addEventListener('click', toggleMenu);
    
    // Marcar fotos como leídas cuando se abre la galería
    const gallerySection = document.getElementById('gallery-section');
    if (gallerySection) {
        gallerySection.addEventListener('toggle', () => {
            if (gallerySection.hasAttribute('open')) {
                markPhotosAsRead();
            }
        });
    }

    // --- COMPRESIÓN ---
    async function compressImageToBase64(file) {
        return new Promise((resolve, reject) => {
            const MAX_WIDTH = 600; 
            const QUALITY = 0.6;   
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    let width = img.width;
                    let height = img.height;
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    const dataUrl = canvas.toDataURL('image/jpeg', QUALITY);
                    resolve(dataUrl);
                };
                img.onerror = (err) => reject(err);
            };
            reader.onerror = (err) => reject(err);
        });
    }

    // --- GALERÍA ---
    const galleryUploadInput = document.getElementById('gallery-upload-input');
    const galleryGrid = document.getElementById('gallery-grid');
    const imageModal = document.getElementById('image-modal');
    const modalImg = document.getElementById('modal-img');

    const handleGalleryUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        // Verificar que el usuario esté logueado
        if (!currentUser) {
            alert('Debes iniciar sesion para subir fotos');
            e.target.value = '';
            return;
        }
        
        if (!file.type.startsWith('image/')) { alert("Solo imágenes."); return; }

        const inputElement = e.target;
        const labelElement = inputElement.parentElement;
        const spans = labelElement.querySelectorAll('span');
        const originalTexts = []; 
        spans.forEach(s => originalTexts.push(s.textContent));

        spans.forEach(s => s.textContent = "Subiendo...");
        labelElement.classList.add('opacity-50', 'cursor-wait');
        inputElement.disabled = true; 
        
        try {
            const base64String = await compressImageToBase64(file);
            await addDoc(galleryCollection, {
                url: base64String,
                timestamp: serverTimestamp(),
                userId: currentUser.uid,
                userName: currentUser.displayName || 'Kiter'
            });
        } catch (error) {
            console.error("Error subiendo:", error);
            alert("No se pudo subir.");
        } finally {
            spans.forEach((s, index) => s.textContent = originalTexts[index]);
            labelElement.classList.remove('opacity-50', 'cursor-wait');
            inputElement.disabled = false;
            inputElement.value = ''; 
        }
    };

    if (galleryUploadInput && db) {
        galleryUploadInput.addEventListener('change', handleGalleryUpload);
    }

    if (galleryGrid && db) {
        const q = query(galleryCollection, orderBy("timestamp", "desc"), limit(20));
        onSnapshot(q, (snapshot) => {
            galleryGrid.innerHTML = ''; 
            const now = Date.now();
            const oneDay = 24 * 60 * 60 * 1000;
            let hasImages = false;
            const lastPhotoReadTime = parseInt(localStorage.getItem('lastPhotoReadTime') || '0');
            let newestPhotoTime = 0;

            snapshot.forEach((doc) => {
                const data = doc.data();
                if (data.timestamp && data.url) {
                    const imgDate = data.timestamp.toDate();
                    const imgTime = imgDate.getTime();
                    if (imgTime > newestPhotoTime) newestPhotoTime = imgTime;

                    if (now - imgTime < oneDay) {
                        hasImages = true;
                        const imgContainer = document.createElement('div');
                        imgContainer.className = "relative aspect-square cursor-pointer overflow-hidden rounded-lg shadow-md bg-gray-100 hover:opacity-90 transition-opacity";
                        imgContainer.innerHTML = `<img src="${data.url}" class="w-full h-full object-cover" loading="lazy" alt="Foto"><div class="absolute bottom-0 right-0 bg-black bg-opacity-50 text-white text-[10px] px-2 py-1 rounded-tl-lg">${timeAgo(imgDate)}</div>`;
                        imgContainer.addEventListener('click', () => {
                            modalImg.src = data.url;
                            imageModal.classList.remove('hidden');
                        });
                        galleryGrid.appendChild(imgContainer);
                    }
                }
            });
            if (!hasImages) galleryGrid.innerHTML = '<div class="col-span-full text-center text-gray-400 py-4 text-sm">Sin fotos hoy.</div>';
            
            // Notificación de nueva foto
            if (hasImages && newestPhotoTime > lastPhotoReadTime && lastPhotoReadTime > 0) {
                // Solo mostrar si NO estamos viendo la galería abierta
                const gallerySection = document.getElementById('gallery-section');
                const isGalleryOpen = gallerySection && gallerySection.hasAttribute('open');
                if (!isGalleryOpen) {
                    if (newPhotoToast) newPhotoToast.classList.remove('hidden');
                } else {
                    markPhotosAsRead();
                }
            } else if (lastPhotoReadTime === 0 && newestPhotoTime > 0) {
                // Primera vez que carga, inicializar el tiempo
                localStorage.setItem('lastPhotoReadTime', now);
            }
        });
    }

    // --- PIZARRA ---
    const messageForm = document.getElementById('kiter-board-form');
    const messagesContainer = document.getElementById('messages-container');
    const textInput = document.getElementById('message-text');

    // --- BOTONES DE LOGIN/LOGOUT ---
    const btnGoogleLogin = document.getElementById('btn-google-login');
    const btnLogout = document.getElementById('btn-logout');
    
    if (btnGoogleLogin) {
        btnGoogleLogin.addEventListener('click', () => {
            window.loginWithGoogle();
        });
    }
    
    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            window.logout();
        });
    }

    function timeAgo(date) {
        const seconds = Math.floor((new Date() - date) / 1000);
        let interval = seconds / 3600;
        if (interval > 1) return "hace " + Math.floor(interval) + "h";
        interval = seconds / 60;
        if (interval > 1) return "hace " + Math.floor(interval) + "m";
        return "hace un momento";
    }

    function markMessagesAsRead() {
        const now = Date.now();
        localStorage.setItem('lastReadTime', now);
        const badge = document.getElementById('notification-badge');
        if (badge) badge.classList.add('hidden');
        if (newMessageToast) newMessageToast.classList.add('hidden');
    }

    function markPhotosAsRead() {
        const now = Date.now();
        localStorage.setItem('lastPhotoReadTime', now);
        if (newPhotoToast) newPhotoToast.classList.add('hidden');
    }

    if (messageForm && db) {
        messageForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            // Verificar que el usuario esté logueado
            if (!currentUser) {
                alert('Debes iniciar sesion para enviar mensajes');
                return;
            }
            
            const author = currentUser.displayName || 'Kiter';
            const text = textInput.value.trim();
            
            if (text) {
                const btn = messageForm.querySelector('button');
                const originalText = btn.innerText;
                btn.innerText = '...';
                btn.disabled = true;
                try {
                    await addDoc(messagesCollection, { 
                        author: author, 
                        text: text, 
                        timestamp: serverTimestamp(),
                        userId: currentUser.uid,
                        userPhoto: currentUser.photoURL || null
                    });
                    textInput.value = ''; 
                    markMessagesAsRead();
                } catch (e) { 
                    console.error(e);
                    alert("Error: " + e.message);
                } finally {
                    btn.innerText = originalText;
                    btn.disabled = false;
                }
            }
        });
    }

    if (messagesContainer && db) {
        const q = query(messagesCollection, orderBy("timestamp", "desc"), limit(50));
        onSnapshot(q, (snapshot) => {
            messagesContainer.innerHTML = ''; 
            const now = Date.now();
            const oneDay = 24 * 60 * 60 * 1000;
            let hasMessages = false;
            const lastReadTime = parseInt(localStorage.getItem('lastReadTime') || '0');
            let newestMessageTime = 0;

            snapshot.forEach((doc) => {
                const data = doc.data();
                if (data.timestamp) {
                    const msgDate = data.timestamp.toDate();
                    const msgTime = msgDate.getTime();
                    if (msgTime > newestMessageTime) newestMessageTime = msgTime;

                    if (now - msgTime < oneDay) {
                        hasMessages = true;
                        const div = document.createElement('div');
                        div.className = "bg-gray-50 p-3 rounded border border-gray-100 text-sm mb-2";
                        div.innerHTML = `<div class="flex justify-between items-baseline mb-1"><span class="font-bold text-blue-900">${data.author}</span><span class="text-xs text-gray-400">${timeAgo(msgDate)}</span></div><p class="text-gray-700 break-words">${data.text}</p>`;
                        messagesContainer.appendChild(div);
                    }
                }
            });
            if (!hasMessages) messagesContainer.innerHTML = '<p class="text-center text-gray-400 text-xs py-2">No hay mensajes recientes.</p>';
            else {
                if (newestMessageTime > lastReadTime && lastReadTime > 0) {
                    if (viewCommunity.classList.contains('hidden')) {
                        if(newMessageToast) newMessageToast.classList.remove('hidden');
                        const badge = document.getElementById('notification-badge');
                        if(badge) badge.classList.remove('hidden');
                    } else { markMessagesAsRead(); }
                } else if (lastReadTime === 0 && newestMessageTime > 0) {
                    localStorage.setItem('lastReadTime', now);
                }
            }
        });
    }

    // --- API CLIMA ---
    const weatherApiUrl = 'api/data';
    const tempEl = document.getElementById('temp-data');
    const humidityEl = document.getElementById('humidity-data');
    const pressureEl = document.getElementById('pressure-data');
    const rainfallDailyEl = document.getElementById('rainfall-daily-data'); 
    const uviEl = document.getElementById('uvi-data'); 
    const errorEl = document.getElementById('error-message');
    const lastUpdatedEl = document.getElementById('last-updated');

    const windHighlightCard = document.getElementById('wind-highlight-card');
    const unifiedWindDataCardEl = document.getElementById('unified-wind-data-card');
    const highlightWindDirEl = document.getElementById('highlight-wind-dir-data');
    const highlightWindSpeedEl = document.getElementById('highlight-wind-speed-data');
    const highlightGustEl = document.getElementById('highlight-gust-data');
    const windArrowEl = document.getElementById('wind-arrow'); 
    const gustInfoContainer = document.getElementById('gust-info-container');
    const verdictCardEl = document.getElementById('verdict-card');
    const verdictDataEl = document.getElementById('verdict-data');
    const stabilityCardEl = document.getElementById('stability-card');
    const stabilityDataEl = document.getElementById('stability-data');

    const skeletonLoaderIds = ['verdict-data-loader','highlight-wind-dir-data-loader', 'highlight-wind-speed-data-loader', 'highlight-gust-data-loader','temp-data-loader', 'humidity-data-loader', 'pressure-data-loader', 'rainfall-daily-data-loader', 'uvi-data-loader','stability-data-loader'];
    const dataContentIds = ['verdict-data','highlight-wind-dir-data', 'highlight-wind-speed-data', 'highlight-gust-data','temp-data', 'humidity-data', 'pressure-data','rainfall-daily-data', 'uvi-data','stability-data'];

    let lastUpdateTime = null;

    function showSkeletons(isLoading) {
        skeletonLoaderIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = isLoading ? 'block' : 'none';
        });
        dataContentIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = isLoading ? 'none' : 'block';
        });
        if (isLoading && lastUpdatedEl) lastUpdatedEl.textContent = 'Actualizando...';
    }
    
    function updateTimeAgo() {
        if (!lastUpdateTime) return;
        const now = new Date();
        const secondsAgo = Math.round((now - lastUpdateTime) / 1000);
        if (secondsAgo < 5) lastUpdatedEl.textContent = "Actualizado ahora";
        else if (secondsAgo < 60) lastUpdatedEl.textContent = `Actualizado hace ${secondsAgo} seg.`;
        else lastUpdatedEl.textContent = `Actualizado: ${lastUpdateTime.toLocaleTimeString('es-AR')}`;
    }

    function convertDegreesToCardinal(degrees) {
        if (degrees === null || isNaN(degrees)) return 'N/A';
        const val = Math.floor((degrees / 22.5) + 0.5);
        const arr = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"];
        return arr[val % 16];
    }

    function calculateGustFactor(speed, gust) {
        if (speed === null || gust === null || speed <= 0) return { factor: null, text: 'N/A', color: ['bg-gray-100', 'border-gray-300'] };
        const MIN_KITE_WIND = 12; 
        if (speed < MIN_KITE_WIND) return { factor: null, text: 'No Aplica', color: ['bg-gray-100', 'border-gray-300'] };
        if (gust <= speed) return { factor: 0, text: 'Ultra Estable', color: ['bg-green-400', 'border-green-600'] };
        const factor = (1 - (speed / gust)) * 100; 
        if (factor <= 15) return { factor, text: 'Estable', color: ['bg-green-300', 'border-green-500'] }; 
        else if (factor <= 30) return { factor, text: 'Racheado', color: ['bg-yellow-300', 'border-yellow-500'] }; 
        else return { factor, text: 'Muy Racheado', color: ['bg-red-400', 'border-red-600'] }; 
    }
    
    function getSpotVerdict(speed, gust, degrees) {
        if (degrees !== null && (degrees > 292.5 || degrees <= 67.5)) return ["VIENTO OFFSHORE!", ['bg-red-400', 'border-red-600']];
        if (speed === null) return ["Calculando...", ['bg-gray-100', 'border-gray-300']];
        if (speed <= 14) return ["FLOJO...", ['bg-blue-200', 'border-blue-400']];
        else if (speed <= 16) return ["ACEPTABLE", ['bg-cyan-300', 'border-cyan-500']];
        else if (speed <= 19) return ["¡IDEAL!", ['bg-green-300', 'border-green-500']];
        else if (speed <= 22) return ["¡MUY BUENO!", ['bg-yellow-300', 'border-yellow-500']];
        else if (speed <= 27) return ["¡FUERTE!", ['bg-orange-300', 'border-orange-500']];
        else if (speed > 33) return ["¡DEMASIADO FUERTE!", ['bg-purple-400', 'border-purple-600']];
        else return ["¡MUY FUERTE!", ['bg-red-400', 'border-red-600']];
    }

    const allColorClasses = [
        'bg-gray-100', 'border-gray-300', 'bg-blue-200', 'border-blue-400', 'bg-green-300', 'border-green-500',
        'bg-yellow-300', 'border-yellow-500', 'bg-orange-300', 'border-orange-500', 'bg-red-400', 'border-red-600','bg-cyan-300', 'border-cyan-500',
        'bg-purple-400', 'border-purple-600', 'text-red-600', 'text-green-600', 'text-yellow-600', 'text-gray-900',
        'bg-green-400', 'border-green-600', 'bg-gray-50', 'bg-white/30', 'bg-cyan-300', 'border-cyan-500'
    ];

    function updateCardColors(element, newClasses) {
        if (!element) return;
        element.classList.remove(...allColorClasses);
        element.classList.add(...newClasses);
    }

    // --- ESTA ES LA FUNCIÓN QUE FALTABA ---
        
        function getUnifiedWindColorClasses(speedInKnots, degrees) {
        // 1. SEGURIDAD PRIMERO: Si es Offshore, tarjeta ROJA. (desactivado)
        /*if (degrees !== null) {
             if ((degrees > 292.5 || degrees <= 67.5)) { 
                return ['bg-red-400', 'border-red-600'];
            }
        }*/
    
        // 2. Escala Kitera (Igualada a Veredicto)
        if (speedInKnots !== null && !isNaN(speedInKnots)) {
            if (speedInKnots <= 14) return ['bg-blue-200', 'border-blue-400'];       // Flojo
            else if (speedInKnots <= 16) return ['bg-cyan-300', 'border-cyan-500'];  // Aceptable
            else if (speedInKnots <= 19) return ['bg-green-300', 'border-green-500'];// Ideal
            else if (speedInKnots <= 22) return ['bg-yellow-300', 'border-yellow-500']; // Muy Bueno
            else if (speedInKnots <= 27) return ['bg-orange-300', 'border-orange-500']; // Fuerte
            else if (speedInKnots <= 33) return ['bg-red-400', 'border-red-600'];    // Muy Fuerte
            else return ['bg-purple-400', 'border-purple-600'];                      // Demasiado Fuerte
        }
        
        return ['bg-gray-100', 'border-gray-300']; 
    }
        


    function getWindyColorClasses(speedInKnots) {
        if (speedInKnots !== null && !isNaN(speedInKnots)) {
            if (speedInKnots <= 10) return ['bg-blue-200', 'border-blue-400']; 
            else if (speedInKnots <= 16) return ['bg-green-300', 'border-green-500']; 
            else if (speedInKnots <= 21) return ['bg-yellow-300', 'border-yellow-500']; 
            else if (speedInKnots <= 27) return ['bg-orange-300', 'border-orange-500']; 
            else if (speedInKnots <= 33) return ['bg-red-400', 'border-red-600']; 
            else return ['bg-purple-400', 'border-purple-600']; 
        }
        return ['bg-gray-100', 'border-gray-300']; 
    }
    
    function getMockWeatherData() {
        return {
            code: 0, msg: "success",
            data: {
                outdoor: { temperature: { value: "24.5", unit: "°C" }, humidity: { value: "55", unit: "%" } },
                wind: { wind_speed: { value: "19.5", unit: "kts" }, wind_gust: { value: "24.2", unit: "kts" }, wind_direction: { value: "95", unit: "deg" } },
                pressure: { relative: { value: "1015", unit: "hPa" } },
                rainfall: { daily: { value: "0.0", unit: "mm" } },
                solar_and_uvi: { uvi: { value: "7" } }
            }
        };
    }

    async function fetchWithBackoff(url, options, retries = 2, delay = 500) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) throw new Error("Network error");
            return response.json();
        } catch (error) {
            if (retries > 0) {
                await new Promise(res => setTimeout(res, delay));
                return fetchWithBackoff(url, options, retries - 1, delay * 2);
            }
            throw error;
        }
    }
    
    async function fetchWeatherData() {
        showSkeletons(true);
        errorEl.classList.add('hidden'); 
        let json;
        try {
            try {
                json = await fetchWithBackoff(weatherApiUrl, {});
            } catch (e) {
                console.warn("API real falló, usando MOCK.");
                json = getMockWeatherData();
            }

            if (json.code === 0 && json.data) {
                const data = json.data;
                const windSpeedValue = (data.wind?.wind_speed?.value) ? parseFloat(data.wind.wind_speed.value) : null;
                const windGustValue = (data.wind?.wind_gust?.value) ? parseFloat(data.wind.wind_gust.value) : null; 
                const windDirDegrees = (data.wind?.wind_direction?.value) ? parseFloat(data.wind.wind_direction.value) : null;
                
                const [verdictText, verdictColors] = getSpotVerdict(windSpeedValue, windGustValue, windDirDegrees);
                updateCardColors(verdictCardEl, verdictColors);
                verdictDataEl.textContent = verdictText;
                
                if (windArrowEl && windDirDegrees !== null) {
                    windArrowEl.style.transform = `rotate(${windDirDegrees}deg)`;
                    const isOffshore = (windDirDegrees > 292.5 || windDirDegrees <= 67.5);
                    const isCross = (windDirDegrees > 67.5 && windDirDegrees <= 112.5) || (windDirDegrees > 247.5 && windDirDegrees <= 292.5);
                    const isOnshore = !isOffshore && !isCross;

                    windArrowEl.classList.remove('text-red-600', 'text-green-600', 'text-yellow-600', 'text-gray-900');
                    if (isOffshore) windArrowEl.classList.add('text-red-600');
                    else if (isCross) windArrowEl.classList.add('text-yellow-600');
                    else windArrowEl.classList.add('text-green-600');
                }

                updateCardColors(windHighlightCard, ['bg-gray-100', 'border-gray-300']); 
                updateCardColors(unifiedWindDataCardEl, getUnifiedWindColorClasses(windSpeedValue, windDirDegrees));
                if (gustInfoContainer) updateCardColors(gustInfoContainer, getUnifiedWindColorClasses(windGustValue, windDirDegrees));

                highlightWindSpeedEl.innerHTML = (windSpeedValue !== null) 
                    ? `${windSpeedValue} <span class="text-xl font-bold align-baseline">kts</span>` 
                    : 'N/A';
                highlightGustEl.textContent = windGustValue ?? 'N/A';
                highlightWindDirEl.textContent = convertDegreesToCardinal(windDirDegrees); 

                if(tempEl) tempEl.textContent = data.outdoor?.temperature?.value ? `${data.outdoor.temperature.value} ${data.outdoor.temperature.unit}` : 'N/A';
                if(humidityEl) humidityEl.textContent = data.outdoor?.humidity?.value ? `${data.outdoor.humidity.value}%` : 'N/A';
                if(pressureEl) pressureEl.textContent = data.pressure?.relative?.value ? `${data.pressure.relative.value} hPa` : 'N/A'; 
                if(rainfallDailyEl) rainfallDailyEl.textContent = data.rainfall?.daily?.value ? `${data.rainfall.daily.value} mm` : 'N/A'; 
                if(uviEl) uviEl.textContent = data.solar_and_uvi?.uvi?.value ?? 'N/A'; 

                const stability = calculateGustFactor(windSpeedValue, windGustValue);
                if (stabilityCardEl) updateCardColors(stabilityCardEl, stability.color);
                if (stabilityDataEl) stabilityDataEl.textContent = stability.text;
                
                showSkeletons(false); 
                lastUpdateTime = new Date(); 
                updateTimeAgo(); 
            } else {
                throw new Error('Datos incorrectos');
            }
        } catch (error) {
            console.error(error);
            errorEl.classList.remove('hidden');
            showSkeletons(false);
            updateCardColors(verdictCardEl, ['bg-red-400', 'border-red-600']);
            verdictDataEl.textContent = 'Error API';
        }
    }
    
    fetchWeatherData();
    setInterval(fetchWeatherData, 30000);
    setInterval(updateTimeAgo, 5000);

    // --- SPONSOR CAROUSEL ---
    const sponsorTrack = document.getElementById('sponsor-track');
    const sponsorDots = document.querySelectorAll('.sponsor-dot');
    let currentSponsor = 0;
    const totalSponsors = document.querySelectorAll('.sponsor-slide').length;

    function goToSponsor(index) {
        currentSponsor = index;
        if (sponsorTrack) {
            sponsorTrack.style.transform = `translateX(-${index * 100}%)`;
        }
        sponsorDots.forEach((dot, i) => {
            dot.classList.toggle('bg-gray-400', i === index);
            dot.classList.toggle('bg-gray-300', i !== index);
        });
    }

    function nextSponsor() {
        goToSponsor((currentSponsor + 1) % totalSponsors);
    }

    // Click en indicadores
    sponsorDots.forEach(dot => {
        dot.addEventListener('click', () => {
            goToSponsor(parseInt(dot.dataset.index));
        });
    });

    // Auto-rotate cada 4 segundos
    if (totalSponsors > 1) {
        setInterval(nextSponsor, 4000);
    }

    // --- LAZY LOAD WINDGURU WIDGET ---
    // Cargar el widget solo cuando el usuario abre el desplegable
    const windguruContainer = document.getElementById('windguru-container');
    const windguruDetails = windguruContainer ? windguruContainer.closest('details') : null;
    let windguruLoaded = false;
    
    if (windguruDetails && windguruContainer) {
        windguruDetails.addEventListener('toggle', () => {
            if (windguruDetails.open && !windguruLoaded) {
                windguruLoaded = true;
                // Crear el widget con un ID único basado en timestamp
                const uid = 'wg_fwdg_1312667_29_' + Date.now();
                const arg = [
                    "s=1312667",
                    "m=29",
                    "uid=" + uid,
                    "wj=knots",
                    "tj=c",
                    "waj=m",
                    "tij=cm",
                    "odh=0",
                    "doh=24",
                    "fhours=240",
                    "hrsm=2",
                    "vt=forecasts",
                    "lng=es",
                    "ts=1",
                    "idbs=1",
                    "p=WINDSPD,GUST,MWINDSPD,SMER,TMPE,FLHGT,CDC,APCP1s,RATING"
                ];
                
                // Limpiar contenedor y agregar script placeholder
                windguruContainer.innerHTML = '<script id="' + uid + '"></script>';
                
                // Cargar el widget
                const script = document.createElement('script');
                script.src = 'https://www.windguru.cz/js/widget.php?' + arg.join('&');
                document.head.appendChild(script);
            }
        });
    }
});
} catch (e) {
    console.error("❌ Error inicializando Firebase:", e);
}