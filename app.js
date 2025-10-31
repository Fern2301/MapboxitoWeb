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

function init() {    
    initializeFirebase();
}

function updateStatus(message, type = '') {
    const statusElement = document.getElementById('status');
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.className = type;
    }
    console.log('Status:', message);
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
        startListening();
    });

    map.on('error', (e) => {
        console.error('Error del mapa:', e);
        updateStatus('Error cargando el mapa', 'error');
    });
}

function startListening() {
    const db = firebase.firestore();
    
    db.collection('ubicacion')
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
    
    updateLastUpdateTime();
    setInterval(updateLastUpdateTime, 1000);
}

function updateUserLocation(userData) {
    console.log('Actualizando ubicacion:', userData);
    
    const { lat, lng, time, deviceId, isOnline } = userData;
    
    if (document.getElementById('deviceId')) {
        document.getElementById('deviceId').textContent = deviceId || 'No disponible';
        document.getElementById('lat').textContent = lat ? lat.toFixed(6) : 'No disponible';
        document.getElementById('lng').textContent = lng ? lng.toFixed(6) : 'No disponible';                
        document.getElementById('time').textContent = time || 'No disponible';
        document.getElementById('onlineStatus').textContent = isOnline ? 'En línea' : 'Desconectado';
    }
    
    if (!lat || !lng || typeof lat !== 'number' || typeof lng !== 'number') {
        console.log('Coordenadas inválidas:', lat, lng);
        updateStatus('Coordenadas inválidas recibidas', 'error');
        return;
    }
    
    const newLocation = [lng, lat];
    
    if (!marker) {
        createMarker(newLocation, userData);
    } else {
        updateMarker(newLocation, userData);
    }
    
    updateStatus(`Dispositivo ${deviceId ? deviceId.substring(0, 8) + '...' : 'desconocido'} - En línea`, 'connected');
}

function createMarker(location, userData) {
    const { lat, lng, time, deviceId } = userData;
    const el = document.createElement('div');
    el.className = 'custom-marker';
    el.style.backgroundImage = 'url("mar.png")';
    el.style.width = '40px';
    el.style.height = '40px';
    el.style.backgroundSize = 'cover';
    el.style.backgroundRepeat = 'no-repeat';
    el.style.backgroundPosition = 'center';
    el.style.borderRadius = '50%';
    el.style.border = '3px solid white';
    el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
    el.style.cursor = 'pointer';

    marker = new mapboxgl.Marker(el)
        .setLngLat(location)
        .setPopup(new mapboxgl.Popup({ offset: 25 })
            .setHTML(`
                <div>
                    <h3>Dispositivo</h3>
                    <p><strong>ID:</strong> ${deviceId || 'N/A'}</p>
                    <p><strong>Latitud:</strong> ${lat.toFixed(6)}</p>
                    <p><strong>Longitud:</strong> ${lng.toFixed(6)}</p>
                    <p><strong>Hora:</strong> ${time || 'No disponible'}</p>                
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
            <div>
                <h3>Dispositivo</h3>
                <p><strong>ID:</strong> ${deviceId || 'N/A'}</p>
                <p><strong>Latitud:</strong> ${lat.toFixed(6)}</p>
                <p><strong>Longitud:</strong> ${lng.toFixed(6)}</p>
                <p><strong>Hora:</strong> ${time || 'No disponible'}</p>                
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
        lastUpdateElement.textContent = `Última verificación: ${timeString}`;
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}