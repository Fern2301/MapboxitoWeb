const firebaseConfig = {
    apiKey: "AIzaSyCD8Sg4hUzv4rLCnnxEyNZ2WTeOh_Hw5hU",
    authDomain: "mapbox-tracker.firebaseapp.com",
    projectId: "mapbox-tracker",
    storageBucket: "mapbox-tracker.firebasestorage.app",
    messagingSenderId: "1058456217783",
    appId: "1:1058456217783:web:1db63f98e0022df3f30532",
    measurementId: "G-VWKK5D46SX"
};

mapboxgl.accessToken = 'pk.eyJ1IjoibG92ZXN0ZWluIiwiYSI6ImNtZzA5Y2x0ODBiMWMybW9qY2E3ZWZpNG4ifQ.aFusWwvnRW8XxzgtGFtMUw';

let map;
let marker;
let geofences = [];
let geofenceLayers = [];
let geofenceSources = [];
let currentGeofence = null;
const DEVICE_ID = "Fernandito";
let lastLocation = null;
let geofencesInterval = null;

// Función para extraer el color RGB de un color ARGB
function getRgbColor(argbColor) {
    if (!argbColor || !argbColor.startsWith('#')) {
        return argbColor || '#FF0000'; // Color rojo por defecto
    }
    
    // Si el color ya es RGB (6 caracteres), devolverlo tal cual
    if (argbColor.length === 7) {
        return argbColor;
    }
    
    // Si es ARGB (8 o 9 caracteres con #), extraer RGB
    if (argbColor.length === 9) {
        // Formato #AARRGGBB -> extraer #RRGGBB
        return `#${argbColor.substring(3, 9)}`;
    } else if (argbColor.length === 8) {
        // Formato #RRGGBBAA -> extraer #RRGGBB
        return `#${argbColor.substring(1, 7)}`;
    }
    
    return '#FF0000'; // Color rojo por defecto si el formato no es reconocido
}

// Función para extraer la opacidad de un color ARGB
function getOpacityFromArgb(argbColor) {
    if (!argbColor || !argbColor.startsWith('#')) {
        return 0.5; // Opacidad media por defecto
    }
    
    // Si el color ya es RGB (6 caracteres), opacidad completa
    if (argbColor.length === 7) {
        return 1.0;
    }
    
    let alphaHex = '';
    
    if (argbColor.length === 9) {
        // Formato #AARRGGBB -> alpha está en las posiciones 1-2
        alphaHex = argbColor.substring(1, 3);
    } else if (argbColor.length === 8) {
        // Formato #RRGGBBAA -> alpha está en las posiciones 7-8
        alphaHex = argbColor.substring(6, 8);
    } else {
        return 0.5;
    }
    
    try {
        // Convertir hex a decimal (0-255) y luego a fracción (0.0-1.0)
        const alphaInt = parseInt(alphaHex, 16);
        return alphaInt / 255;
    } catch (error) {
        return 0.5; // Opacidad media por defecto si hay error
    }
}

function init() {    
    initializeFirebase();
    setupEventListeners();
}

function updateStatus(message, type = '') {
    const statusElement = document.getElementById('status');
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.className = type;
    }
    console.log('Status:', message);
}

function setupEventListeners() {
    // Solo el botón para centrar el mapa
    document.getElementById('btnCenterMap').addEventListener('click', centerMapOnLocation);
}

function initializeFirebase() {
    try {
        firebase.initializeApp(firebaseConfig);        
        initializeMap();
    } catch (error) {
        console.error('Error Firebase:', error);
        updateStatus('Error conectando a Firebase', 'error');
    }
}

function initializeMap() {
    map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [-68.1193, -16.4897],
        zoom: 12
    });

    map.addControl(new mapboxgl.NavigationControl());
    
    map.on('load', () => {        
        const mapLoading = document.getElementById('mapLoading');
        if (mapLoading) {
            mapLoading.style.display = 'none';
        }        
        console.log('Mapa cargado correctamente');
        loadGeofencesFromFirebase();
        startListening();
    });

    map.on('error', (e) => {
        console.error('Error del mapa:', e);
        updateStatus('Error cargando el mapa', 'error');
    });
}

// Cargar geocercas desde Firebase
function loadGeofencesFromFirebase() {
    const db = firebase.firestore();
    
    db.collection('geocercas')
        .where('deviceId', '==', DEVICE_ID)
        .get()
        .then((snapshot) => {
            console.log('Geocercas recibidas:', snapshot.size);
            
            if (!snapshot.empty) {
                geofences = [];
                
                snapshot.forEach((doc) => {
                    try {
                        const data = doc.data();
                        const id = data.id || doc.id;
                        const name = data.name || 'Geocerca sin nombre';
                        const fillColor = data.fillColor || '#4000ff00';
                        const pointsData = data.points || [];
                        
                        const points = pointsData.map(point => ({
                            latitude: point.latitude || 0,
                            longitude: point.longitude || 0
                        }));
                        
                        if (points.length > 0) {
                            const geofence = {
                                id: id,
                                name: name,
                                points: points,
                                fillColor: fillColor
                            };
                            geofences.push(geofence);
                            console.log('Geocerca cargada:', name, 'con', points.length, 'puntos');
                        }
                    } catch (e) {
                        console.error('Error parseando geocerca:', e);
                    }
                });
                
                drawGeofencesOnMap();
                updateGeofenceCount();
                
                // Mostrar notificación de geocercas cargadas
                if (geofences.length > 0) {
                    Toastify({
                        text: `${geofences.length} geocercas cargadas`,
                        duration: 3000,
                        gravity: "top",
                        position: "right"
                    }).showToast();
                }
            } else {
                console.log('No hay geocercas guardadas en Firebase');
            }
        })
        .catch((error) => {
            console.error('Error cargando geocercas:', error);
        });
}

// Eliminar geocercas existentes del mapa
function removeExistingGeofences() {
    // Eliminar capas
    geofenceLayers.forEach(layerId => {
        if (map.getLayer(layerId)) {
            map.removeLayer(layerId);
            console.log('Capa eliminada:', layerId);
        }
    });
    
    // Eliminar fuentes
    geofenceSources.forEach(sourceId => {
        if (map.getSource(sourceId)) {
            map.removeSource(sourceId);
            console.log('Fuente eliminada:', sourceId);
        }
    });
    
    // Limpiar arrays
    geofenceLayers = [];
    geofenceSources = [];
}

// Dibujar geocercas en el mapa
function drawGeofencesOnMap() {
    // Verificar si el mapa está cargado
    if (!map || !map.isStyleLoaded()) {
        console.log('El mapa no está completamente cargado, esperando...');
        setTimeout(drawGeofencesOnMap, 100);
        return;
    }
    
    // Eliminar geocercas existentes
    removeExistingGeofences();
    
    console.log('Dibujando', geofences.length, 'geocercas...');
    
    geofences.forEach((geofence, index) => {
        try {
            // Crear array de coordenadas para el polígono
            const coordinates = geofence.points.map(point => [point.longitude, point.latitude]);
            
            // Asegurar que el polígono esté cerrado
            if (coordinates.length > 0 && coordinates.length >= 3) {
                coordinates.push(coordinates[0]);
            } else {
                console.warn(`Geocerca "${geofence.name}" no tiene suficientes puntos: ${coordinates.length}`);
                return;
            }
            
            // Extraer color RGB y opacidad del color ARGB
            const rgbColor = getRgbColor(geofence.fillColor);
            const opacity = getOpacityFromArgb(geofence.fillColor);
            
            const sourceId = `geofence-${geofence.id}-${Date.now()}`; // Añadir timestamp para IDs únicos
            const fillLayerId = `geofence-fill-${geofence.id}-${Date.now()}`;
            const borderLayerId = `geofence-border-${geofence.id}-${Date.now()}`;
            
            // Verificar si ya existe una fuente con este ID
            if (map.getSource(sourceId)) {
                console.log(`Fuente ${sourceId} ya existe, eliminando...`);
                map.removeSource(sourceId);
            }
            
            // Crear el GeoJSON feature
            const geojsonFeature = {
                'type': 'Feature',
                'geometry': {
                    'type': 'Polygon',
                    'coordinates': [coordinates]
                },
                'properties': {
                    'name': geofence.name,
                    'id': geofence.id
                }
            };
            
            // Añadir fuente GeoJSON
            map.addSource(sourceId, {
                'type': 'geojson',
                'data': geojsonFeature
            });
            
            // Añadir capa de relleno - VISIBLE DESDE EL INICIO
            map.addLayer({
                'id': fillLayerId,
                'type': 'fill',
                'source': sourceId,
                'layout': {},
                'paint': {
                    'fill-color': rgbColor,  // Solo color RGB
                    'fill-opacity': opacity  // Opacidad separada
                }
            });
            
            // Añadir capa de borde - VISIBLE DESDE EL INICIO
            map.addLayer({
                'id': borderLayerId,
                'type': 'line',
                'source': sourceId,
                'layout': {},
                'paint': {
                    'line-color': rgbColor,  // Solo color RGB para borde
                    'line-width': 2,
                    'line-opacity': 0.8  // Bordes más opacos
                }
            });
            
            // Guardar IDs de capas y fuentes
            geofenceSources.push(sourceId);
            geofenceLayers.push(fillLayerId, borderLayerId);
            
            console.log(`Geocerca "${geofence.name}" dibujada con ${coordinates.length - 1} puntos`);
            console.log(`Color: ${rgbColor}, Opacidad: ${opacity}`);
            
            // Añadir interacciones para esta geocerca
            addGeofenceInteraction(fillLayerId, geofence);
            
        } catch (error) {
            console.error(`Error dibujando geocerca "${geofence.name}":`, error);
            console.error('Detalles del error:', error.message);
        }
    });
    
    console.log('Total geocercas dibujadas:', geofences.length);
}

// Añadir interacción a una geocerca específica
function addGeofenceInteraction(layerId, geofence) {
    // Esperar un momento para asegurar que la capa esté cargada
    setTimeout(() => {
        if (!map.getLayer(layerId)) {
            console.log(`Capa ${layerId} no encontrada para eventos`);
            return;
        }
        
        // Cambiar cursor al pasar sobre la geocerca
        map.on('mouseenter', layerId, () => {
            map.getCanvas().style.cursor = 'pointer';
            // Cambiar opacidad al pasar el mouse
            map.setPaintProperty(layerId, 'fill-opacity', 0.7);
        });
        
        map.on('mouseleave', layerId, () => {
            map.getCanvas().style.cursor = '';
            // Restaurar opacidad
            const originalOpacity = getOpacityFromArgb(geofence.fillColor);
            map.setPaintProperty(layerId, 'fill-opacity', originalOpacity);
        });
        
        // Mostrar popup al hacer clic
        map.on('click', layerId, (e) => {
            const coordinates = e.lngLat;
            
            new mapboxgl.Popup()
                .setLngLat(coordinates)
                .setHTML(`
                    <div style="padding: 10px; max-width: 250px;">
                        <h3 style="margin: 0 0 10px 0; color: #333; font-size: 16px;">${geofence.name}</h3>
                        <p style="margin: 5px 0; font-size: 14px;"><strong>ID:</strong> ${geofence.id}</p>
                        <p style="margin: 5px 0; font-size: 14px;"><strong>Puntos:</strong> ${geofence.points.length}</p>
                        <p style="margin: 5px 0; font-size: 14px;">
                            <strong>Color:</strong> 
                            <span style="display: inline-block; width: 20px; height: 20px; background-color: ${getRgbColor(geofence.fillColor)}; margin-left: 8px; border: 1px solid #ccc; border-radius: 3px; vertical-align: middle;"></span>
                        </p>
                    </div>
                `)
                .addTo(map);
        });
    }, 200);
}

// Verificar si un punto está dentro de una geocerca
function checkPointInGeofence(point, geofence) {
    const x = point.lng;
    const y = point.lat;
    
    const polygon = geofence.points.map(p => [p.longitude, p.latitude]);
    let inside = false;
    
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i][0], yi = polygon[i][1];
        const xj = polygon[j][0], yj = polygon[j][1];
        
        const intersect = ((yi > y) !== (yj > y)) &&
            (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        
        if (intersect) inside = !inside;
    }
    
    return inside;
}

// Verificar todas las geocercas
function checkGeofences(location) {
    for (const geofence of geofences) {
        if (checkPointInGeofence(location, geofence)) {
            return geofence;
        }
    }
    return null;
}

// Actualizar estado de geocerca en la UI
function updateGeofenceStatus(geofenceFound, location) {
    const geofenceStatusElement = document.getElementById('geofenceStatus');
    const currentGeofenceElement = document.getElementById('currentGeofence');
    
    if (geofenceFound) {
        if (currentGeofence !== geofenceFound) {
            geofenceStatusElement.textContent = `DENTRO: ${geofenceFound.name}`;
            geofenceStatusElement.className = 'inside';
            currentGeofenceElement.textContent = geofenceFound.name;
            currentGeofence = geofenceFound;
            
            // Notificación Toast
            Toastify({
                text: `Entró en: ${geofenceFound.name}`,
                duration: 5000,
                gravity: "top",
                position: "right",
                style: {
                    background: "linear-gradient(to right, #00b09b, #96c93d)",
                }
            }).showToast();
        }
    } else {
        if (currentGeofence !== null) {
            geofenceStatusElement.textContent = `Salió de: ${currentGeofence.name}`;
            geofenceStatusElement.className = 'exited';
            currentGeofenceElement.textContent = 'ninguna';
            
            // Notificación Toast
            Toastify({
                text: `Salió de: ${currentGeofence.name}`,
                duration: 5000,
                gravity: "top",
                position: "right",
                style: {
                    background: "linear-gradient(to right, #ff5f6d, #ffc371)",
                }
            }).showToast();
            
            currentGeofence = null;
        } else {
            geofenceStatusElement.textContent = 'Fuera de geocercas';
            geofenceStatusElement.className = 'outside';
            currentGeofenceElement.textContent = 'ninguna';
        }
    }
}

function startListening() {
    const db = firebase.firestore();
    
    // Escuchar ubicaciones
    db.collection('ubicacion')
        .where('deviceId', '==', DEVICE_ID)
        .onSnapshot((snapshot) => {
            console.log('Datos recibidos:', snapshot.size, 'documentos');
            
            if (snapshot.empty) {
                updateStatus('No hay dispositivos conectados', 'waiting');
                return;
            }
            
            let latestDoc = null;
            let latestTime = 0;
            
            snapshot.forEach((doc) => {
                const data = doc.data();
                const updateTime = data.lastUpdate ? data.lastUpdate.toMillis() : 0;
                
                if (updateTime > latestTime) {
                    latestTime = updateTime;
                    latestDoc = data;
                }
            });
            
            if (latestDoc) {
                updateUserLocation(latestDoc);
            } else {
                updateStatus('No se pudo procesar los datos', 'error');
            }
            
        }, (error) => {
            console.error('Error Firestore:', error);
            updateStatus('Error de conexión con Firestore', 'error');
        });
    
    // Iniciar intervalo para actualizar geocercas cada 5 segundos
    startGeofencesInterval();
    
    updateLastUpdateTime();
    setInterval(updateLastUpdateTime, 1000);
}

// Iniciar intervalo para actualizar geocercas
function startGeofencesInterval() {
    // Limpiar intervalo anterior si existe
    if (geofencesInterval) {
        clearInterval(geofencesInterval);
    }
    
    // Establecer nuevo intervalo de 5 segundos
    geofencesInterval = setInterval(() => {
        console.log('Actualizando geocercas...');
        loadGeofencesFromFirebase();
    }, 5000); // 5000 ms = 5 segundos
}

function updateUserLocation(userData) {
    console.log('Actualizando ubicación:', userData);
    
    const { lat, lng, time, deviceId, isOnline, currentGeofence: dbGeofence } = userData;
    lastLocation = { lat, lng };
    
    // Actualizar UI
    if (document.getElementById('deviceId')) {
        document.getElementById('deviceId').textContent = deviceId || 'No disponible';
        document.getElementById('lat').textContent = lat ? lat.toFixed(6) : 'No disponible';
        document.getElementById('lng').textContent = lng ? lng.toFixed(6) : 'No disponible';                
        document.getElementById('time').textContent = time || 'No disponible';
        document.getElementById('onlineStatus').textContent = isOnline ? 'En línea' : 'Desconectado';
        document.getElementById('onlineStatus').className = isOnline ? 'online' : 'offline';
        document.getElementById('currentGeofence').textContent = dbGeofence || 'ninguna';
    }
    
    if (!lat || !lng || typeof lat !== 'number' || typeof lng !== 'number') {
        console.log('Coordenadas inválidas:', lat, lng);
        updateStatus('Coordenadas inválidas recibidas', 'error');
        return;
    }
    
    const newLocation = [lng, lat];
    
    // Verificar geocercas
    const geofenceFound = checkGeofences({ lat, lng });
    updateGeofenceStatus(geofenceFound, { lat, lng });
    
    if (!marker) {
        createMarker(newLocation, userData);
    } else {
        updateMarker(newLocation, userData);
    }
    
    updateStatus(`Dispositivo ${deviceId ? deviceId : 'desconocido'} - En línea`, 'connected');
}

function createMarker(location, userData) {
    const { lat, lng, time, deviceId } = userData;
    const el = document.createElement('div');
    el.className = 'custom-marker';
    
    // Crear marcador personalizado
    el.innerHTML = `
        <div class="marker-pulse"></div>
        <div class="marker-icon"></div>
    `;

    marker = new mapboxgl.Marker(el)
        .setLngLat(location)
        .setPopup(new mapboxgl.Popup({ offset: 25 })
            .setHTML(`
                <div class="popup-content">
                    <h3>Dispositivo: ${deviceId || 'N/A'}</h3>
                    <p><strong>Latitud:</strong> ${lat.toFixed(6)}</p>
                    <p><strong>Longitud:</strong> ${lng.toFixed(6)}</p>
                    <p><strong>Hora:</strong> ${time || 'No disponible'}</p>
                    <p><strong>Geocerca actual:</strong> ${currentGeofence ? currentGeofence.name : 'ninguna'}</p>
                </div>
            `))
        .addTo(map);

    map.flyTo({
        center: location,
        zoom: 16,
        essential: true
    });
    
    console.log('Marcador personalizado creado en:', location);
}

function updateMarker(location, userData) {
    const { lat, lng, time, deviceId } = userData;
    
    if (marker) {
        marker.setLngLat(location);
        
        marker.getPopup().setHTML(`
            <div class="popup-content">
                <h3>Dispositivo: ${deviceId || 'N/A'}</h3>
                <p><strong>Latitud:</strong> ${lat.toFixed(6)}</p>
                <p><strong>Longitud:</strong> ${lng.toFixed(6)}</p>
                <p><strong>Hora:</strong> ${time || 'No disponible'}</p>
                <p><strong>Geocerca actual:</strong> ${currentGeofence ? currentGeofence.name : 'ninguna'}</p>
            </div>
        `);
        
        console.log('Marcador actualizado en:', location);
    }
}

function updateLastUpdateTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('es-ES');
    const lastUpdateElement = document.getElementById('lastUpdate');
    if (lastUpdateElement) {
        lastUpdateElement.textContent = `Última actualización: ${timeString}`;
    }
}

function updateGeofenceCount() {
    const countElement = document.getElementById('geofenceCount');
    if (countElement) {
        countElement.textContent = geofences.length;
    }
}

function centerMapOnLocation() {
    if (lastLocation) {
        map.flyTo({
            center: [lastLocation.lng, lastLocation.lat],
            zoom: 17,
            essential: true
        });
    } else {
        Toastify({
            text: "No hay ubicación disponible",
            duration: 3000,
            gravity: "top",
            position: "right",
            style: {
                background: "linear-gradient(to right, #ff5f6d, #ffc371)",
            }
        }).showToast();
    }
}

// Agregar librería Toastify para notificaciones
const toastifyScript = document.createElement('script');
toastifyScript.src = 'https://cdn.jsdelivr.net/npm/toastify-js';
document.head.appendChild(toastifyScript);

const toastifyCSS = document.createElement('link');
toastifyCSS.rel = 'stylesheet';
toastifyCSS.href = 'https://cdn.jsdelivr.net/npm/toastify-js/src/toastify.min.css';
document.head.appendChild(toastifyCSS);

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}