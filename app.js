const configuracionFirebase = {
    apiKey: "AIzaSyCD8Sg4hUzv4rLCnnxEyNZ2WTeOh_Hw5hU",
    authDomain: "mapbox-tracker.firebasestorage.app",
    projectId: "mapbox-tracker",
    storageBucket: "mapbox-tracker.firebasestorage.app",
    messagingSenderId: "1058456217783",
    appId: "1:1058456217783:web:1db63f98e0022df3f30532",
    measurementId: "G-VWKK5D46SX"
};

mapboxgl.accessToken = 'pk.eyJ1IjoibG92ZXN0ZWluIiwiYSI6ImNtZzA5Y2x0ODBiMWMybW9qY2E3ZWZpNG4ifQ.aFusWwvnRW8XxzgtGFtMUw';

let mapa;
let marcador;
let geocercas = [];
let capasGeocercas = [];
let fuentesGeocercas = [];
let geocercaActual = null;
const ID_DISPOSITIVO = "Fernandito";
let ultimaUbicacion = null;
let intervaloGeocercas = null;

function obtenerColorRGB(colorARGB) {
    if (!colorARGB || !colorARGB.startsWith('#')) {
        return colorARGB || '#FF0000';
    }    
    if (colorARGB.length === 7) {
        return colorARGB;
    }
    
    if (colorARGB.length === 9) {
        return `#${colorARGB.substring(3, 9)}`;
    } else if (colorARGB.length === 8) {
        return `#${colorARGB.substring(1, 7)}`;
    }
    
    return '#FF0000';
}

function obtenerOpacidadDeColor(colorARGB) {
    if (!colorARGB || !colorARGB.startsWith('#')) {
        return 0.5; 
    }
        
    if (colorARGB.length === 7) {
        return 1.0;
    }
    
    let alfaHex = '';
    
    if (colorARGB.length === 9) {
        alfaHex = colorARGB.substring(1, 3);
    } else if (colorARGB.length === 8) {        
        alfaHex = colorARGB.substring(6, 8);
    } else {
        return 0.5;
    }
    
    try {        
        const alfaInt = parseInt(alfaHex, 16);
        return alfaInt / 255;
    } catch (error) {
        return 0.5;
    }
}

function iniciar() {    
    inicializarFirebase();
    configurarEventos();
}

function cambiarEstado(mensaje, tipo = '') {
    const elementoEstado = document.getElementById('status');
    if (elementoEstado) {
        elementoEstado.textContent = mensaje;
        elementoEstado.className = tipo;
    }
    console.log('Estado:', mensaje);
}

function configurarEventos() {
    document.getElementById('btnCenterMap').addEventListener('click', centrarMapaEnUbicacion);
}

function inicializarFirebase() {
    try {
        firebase.initializeApp(configuracionFirebase);        
        inicializarMapa();
    } catch (error) {
        console.error('Error Firebase:', error);
        cambiarEstado('Error conectando a Firebase', 'error');
    }
}

function inicializarMapa() {
    mapa = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [-68.1193, -16.4897],
        zoom: 12
    });

    mapa.addControl(new mapboxgl.NavigationControl());
    
    mapa.on('load', () => {        
        const cargandoMapa = document.getElementById('mapLoading');
        if (cargandoMapa) {
            cargandoMapa.style.display = 'none';
        }
        console.log('Mapa cargado correctamente');
        cargarGeocercasDeFirebase();
        comenzarEscucha();
    });

    mapa.on('error', (e) => {
        console.error('Error del mapa:', e);
        cambiarEstado('Error cargando el mapa', 'error');
    });
}

function cargarGeocercasDeFirebase() {
    const baseDatos = firebase.firestore();
    
    baseDatos.collection('geocercas')
        .where('deviceId', '==', ID_DISPOSITIVO)
        .get()
        .then((snapshot) => {
            console.log('Geocercas recibidas:', snapshot.size);
            
            if (!snapshot.empty) {
                geocercas = [];
                
                snapshot.forEach((doc) => {
                    try {
                        const datos = doc.data();
                        const id = datos.id || doc.id;
                        const nombre = datos.name || 'Geocerca sin nombre';
                        const colorRelleno = datos.fillColor || '#4000ff00';
                        const puntosDatos = datos.points || [];
                        
                        const puntos = puntosDatos.map(punto => ({
                            latitude: punto.latitude || 0,
                            longitude: punto.longitude || 0
                        }));
                        
                        if (puntos.length > 0) {
                            const geocerca = {
                                id: id,
                                nombre: nombre,
                                puntos: puntos,
                                colorRelleno: colorRelleno
                            };
                            geocercas.push(geocerca);
                            console.log('Geocerca cargada:', nombre, 'con', puntos.length, 'puntos');
                        }
                    } catch (e) {
                        console.error('Error parseando geocerca:', e);
                    }
                });
                
                dibujarGeocercasEnMapa();
                actualizarContadorGeocercas();
                
                if (geocercas.length > 0) {
                    Toastify({
                        text: `${geocercas.length} geocercas cargadas`,
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

function eliminarGeocercasExistentes() {
    capasGeocercas.forEach(idCapa => {
        if (mapa.getLayer(idCapa)) {
            mapa.removeLayer(idCapa);
            console.log('Capa eliminada:', idCapa);
        }
    });
        
    fuentesGeocercas.forEach(idFuente => {
        if (mapa.getSource(idFuente)) {
            mapa.removeSource(idFuente);
            console.log('Fuente eliminada:', idFuente);
        }
    });
    
    capasGeocercas = [];
    fuentesGeocercas = [];
}

function dibujarGeocercasEnMapa() {
    if (!mapa || !mapa.isStyleLoaded()) {
        console.log('El mapa no está completamente cargado, esperando...');
        setTimeout(dibujarGeocercasEnMapa, 100);
        return;
    }
    eliminarGeocercasExistentes();
    
    console.log('Dibujando', geocercas.length, 'geocercas...');
    
    geocercas.forEach((geocerca, indice) => {
        try {
            const coordenadas = geocerca.puntos.map(punto => [punto.longitude, punto.latitude]);
            
            if (coordenadas.length > 0 && coordenadas.length >= 3) {
                coordenadas.push(coordenadas[0]);
            } else {
                console.warn(`Geocerca "${geocerca.nombre}" no tiene suficientes puntos: ${coordenadas.length}`);
                return;
            }
            
            const colorRGB = obtenerColorRGB(geocerca.colorRelleno);
            const opacidad = obtenerOpacidadDeColor(geocerca.colorRelleno);
            
            const idFuente = `geofence-${geocerca.id}-${Date.now()}`;
            const idCapaRelleno = `geofence-fill-${geocerca.id}-${Date.now()}`;
            const idCapaBorde = `geofence-border-${geocerca.id}-${Date.now()}`;
                        
            if (mapa.getSource(idFuente)) {
                console.log(`Fuente ${idFuente} ya existe, eliminando...`);
                mapa.removeSource(idFuente);
            }
            
            const caracteristicaGeoJSON = {
                'type': 'Feature',
                'geometry': {
                    'type': 'Polygon',
                    'coordinates': [coordenadas]
                },
                'properties': {
                    'nombre': geocerca.nombre,
                    'id': geocerca.id
                }
            };
            
            mapa.addSource(idFuente, {
                'type': 'geojson',
                'data': caracteristicaGeoJSON
            });
            
            mapa.addLayer({
                'id': idCapaRelleno,
                'type': 'fill',
                'source': idFuente,
                'layout': {},
                'paint': {
                    'fill-color': colorRGB,
                    'fill-opacity': opacidad
                }
            });
            
            mapa.addLayer({
                'id': idCapaBorde,
                'type': 'line',
                'source': idFuente,
                'layout': {},
                'paint': {
                    'line-color': colorRGB,
                    'line-width': 2,
                    'line-opacity': 0.8
                }
            });
            
            fuentesGeocercas.push(idFuente);
            capasGeocercas.push(idCapaRelleno, idCapaBorde);
            
            console.log(`Geocerca "${geocerca.nombre}" dibujada con ${coordenadas.length - 1} puntos`);
            console.log(`Color: ${colorRGB}, Opacidad: ${opacidad}`);
            
            agregarInteraccionGeocerca(idCapaRelleno, geocerca);
            
        } catch (error) {
            console.error(`Error dibujando geocerca "${geocerca.nombre}":`, error);
            console.error('Detalles del error:', error.message);
        }
    });
    
    console.log('Total geocercas dibujadas:', geocercas.length);
}

function agregarInteraccionGeocerca(idCapa, geocerca) {
    setTimeout(() => {
        if (!mapa.getLayer(idCapa)) {
            console.log(`Capa ${idCapa} no encontrada para eventos`);
            return;
        }
        
        mapa.on('mouseenter', idCapa, () => {
            mapa.getCanvas().style.cursor = 'pointer';
            mapa.setPaintProperty(idCapa, 'fill-opacity', 0.7);
        });
        
        mapa.on('mouseleave', idCapa, () => {
            mapa.getCanvas().style.cursor = '';
            const opacidadOriginal = obtenerOpacidadDeColor(geocerca.colorRelleno);
            mapa.setPaintProperty(idCapa, 'fill-opacity', opacidadOriginal);
        });
        
        mapa.on('click', idCapa, (e) => {
            const coordenadas = e.lngLat;
            
            new mapboxgl.Popup()
                .setLngLat(coordenadas)
                .setHTML(`
                    <div style="padding: 10px; max-width: 250px;">
                        <h3 style="margin: 0 0 10px 0; color: #333; font-size: 16px;">${geocerca.nombre}</h3>
                        <p style="margin: 5px 0; font-size: 14px;"><strong>ID:</strong> ${geocerca.id}</p>
                        <p style="margin: 5px 0; font-size: 14px;"><strong>Puntos:</strong> ${geocerca.puntos.length}</p>                        
                    </div>
                `)
                .addTo(mapa);
        });
    }, 200);
}

function verificarPuntoEnGeocerca(punto, geocerca) {
    const x = punto.lng;
    const y = punto.lat;
    
    const poligono = geocerca.puntos.map(p => [p.longitude, p.latitude]);
    let dentro = false;
    
    for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
        const xi = poligono[i][0], yi = poligono[i][1];
        const xj = poligono[j][0], yj = poligono[j][1];
        
        const intersecta = ((yi > y) !== (yj > y)) &&
            (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        
        if (intersecta) dentro = !dentro;
    }
    
    return dentro;
}

function verificarGeocercas(ubicacion) {
    for (const geocerca of geocercas) {
        if (verificarPuntoEnGeocerca(ubicacion, geocerca)) {
            return geocerca;
        }
    }
    return null;
}

function actualizarEstadoGeocerca(geocercaEncontrada, ubicacion) {
    const elementoEstadoGeocerca = document.getElementById('geofenceStatus');
    const elementoGeocercaActual = document.getElementById('currentGeofence');
    
    if (geocercaEncontrada) {
        if (geocercaActual !== geocercaEncontrada) {
            elementoEstadoGeocerca.textContent = `DENTRO: ${geocercaEncontrada.nombre}`;
            elementoEstadoGeocerca.className = 'inside';
            elementoGeocercaActual.textContent = geocercaEncontrada.nombre;
            geocercaActual = geocercaEncontrada;
            
            Toastify({
                text: `Entró en: ${geocercaEncontrada.nombre}`,
                duration: 5000,
                gravity: "top",
                position: "right",
                style: {
                    background: "linear-gradient(to right, #00b09b, #96c93d)",
                }
            }).showToast();
        }
    } else {
        if (geocercaActual !== null) {
            elementoEstadoGeocerca.textContent = `Salió de: ${geocercaActual.nombre}`;
            elementoEstadoGeocerca.className = 'exited';
            elementoGeocercaActual.textContent = 'ninguna';
            
            Toastify({
                text: `Salió de: ${geocercaActual.nombre}`,
                duration: 5000,
                gravity: "top",
                position: "right",
                style: {
                    background: "linear-gradient(to right, #ff5f6d, #ffc371)",
                }
            }).showToast();
            
            geocercaActual = null;
        } else {
            elementoEstadoGeocerca.textContent = 'Fuera de geocercas';
            elementoEstadoGeocerca.className = 'outside';
            elementoGeocercaActual.textContent = 'ninguna';
        }
    }
}

function comenzarEscucha() {
    const baseDatos = firebase.firestore();
    
    baseDatos.collection('ubicacion')
        .where('deviceId', '==', ID_DISPOSITIVO)
        .onSnapshot((snapshot) => {
            console.log('Datos recibidos:', snapshot.size, 'documentos');
            
            if (snapshot.empty) {
                cambiarEstado('No hay dispositivos conectados', 'waiting');
                return;
            }
            
            let documentoReciente = null;
            let tiempoReciente = 0;
            
            snapshot.forEach((doc) => {
                const datos = doc.data();
                const tiempoActualizacion = datos.lastUpdate ? datos.lastUpdate.toMillis() : 0;
                
                if (tiempoActualizacion > tiempoReciente) {
                    tiempoReciente = tiempoActualizacion;
                    documentoReciente = datos;
                }
            });
            
            if (documentoReciente) {
                actualizarUbicacionUsuario(documentoReciente);
            } else {
                cambiarEstado('No se pudo procesar los datos', 'error');
            }
            
        }, (error) => {
            console.error('Error Firestore:', error);
            cambiarEstado('Error de conexión con Firestore', 'error');
        });
    
    comenzarIntervaloGeocercas();
    
    actualizarUltimaActualizacion();
    setInterval(actualizarUltimaActualizacion, 1000);
}

function comenzarIntervaloGeocercas() {
    if (intervaloGeocercas) {
        clearInterval(intervaloGeocercas);
    }
    
    intervaloGeocercas = setInterval(() => {
        console.log('Actualizando geocercas...');
        cargarGeocercasDeFirebase();
    }, 5000);
}

function actualizarUbicacionUsuario(datosUsuario) {
    console.log('Actualizando ubicación:', datosUsuario);
    
    const { lat, lng, time, deviceId, isOnline, currentGeofence: geocercaBase } = datosUsuario;
    ultimaUbicacion = { lat, lng };
    
    if (document.getElementById('deviceId')) {
        document.getElementById('deviceId').textContent = deviceId || 'No disponible';
        document.getElementById('lat').textContent = lat ? lat.toFixed(6) : 'No disponible';
        document.getElementById('lng').textContent = lng ? lng.toFixed(6) : 'No disponible';                
        document.getElementById('time').textContent = time || 'No disponible';
        document.getElementById('onlineStatus').textContent = isOnline ? 'En línea' : 'Desconectado';
        document.getElementById('onlineStatus').className = isOnline ? 'online' : 'offline';
        document.getElementById('currentGeofence').textContent = geocercaBase || 'ninguna';
    }
    
    if (!lat || !lng || typeof lat !== 'number' || typeof lng !== 'number') {
        console.log('Coordenadas inválidas:', lat, lng);
        cambiarEstado('Coordenadas inválidas recibidas', 'error');
        return;
    }
    
    const nuevaUbicacion = [lng, lat];
    
    const geocercaEncontrada = verificarGeocercas({ lat, lng });
    actualizarEstadoGeocerca(geocercaEncontrada, { lat, lng });
    
    if (!marcador) {
        crearMarcador(nuevaUbicacion, datosUsuario);
    } else {
        actualizarMarcador(nuevaUbicacion, datosUsuario);
    }
    
    cambiarEstado(`Dispositivo ${deviceId ? deviceId : 'desconocido'} - En línea`, 'connected');
}

function crearMarcador(ubicacion, datosUsuario) {
    const { lat, lng, time, deviceId } = datosUsuario;
    const elemento = document.createElement('div');
    elemento.className = 'custom-marker';
    
    elemento.innerHTML = `
        <div class="marker-pulse"></div>
        <div class="marker-icon"></div>
    `;

    marcador = new mapboxgl.Marker(elemento)
        .setLngLat(ubicacion)
        .setPopup(new mapboxgl.Popup({ offset: 25 })
            .setHTML(`
                <div class="popup-content">
                    <h3>Dispositivo: ${deviceId || 'N/A'}</h3>
                    <p><strong>Latitud:</strong> ${lat.toFixed(6)}</p>
                    <p><strong>Longitud:</strong> ${lng.toFixed(6)}</p>
                    <p><strong>Hora:</strong> ${time || 'No disponible'}</p>
                    <p><strong>Geocerca actual:</strong> ${geocercaActual ? geocercaActual.nombre : 'ninguna'}</p>
                </div>
            `))
        .addTo(mapa);

    mapa.flyTo({
        center: ubicacion,
        zoom: 16,
        essential: true
    });
    
    console.log('Marcador personalizado creado en:', ubicacion);
}

function actualizarMarcador(ubicacion, datosUsuario) {
    const { lat, lng, time, deviceId } = datosUsuario;
    
    if (marcador) {
        marcador.setLngLat(ubicacion);
        
        marcador.getPopup().setHTML(`
            <div class="popup-content">
                <h3>Dispositivo: ${deviceId || 'N/A'}</h3>
                <p><strong>Latitud:</strong> ${lat.toFixed(6)}</p>
                <p><strong>Longitud:</strong> ${lng.toFixed(6)}</p>
                <p><strong>Hora:</strong> ${time || 'No disponible'}</p>
                <p><strong>Geocerca actual:</strong> ${geocercaActual ? geocercaActual.nombre : 'ninguna'}</p>
            </div>
        `);
        
        console.log('Marcador actualizado en:', ubicacion);
    }
}

function actualizarUltimaActualizacion() {
    const ahora = new Date();
    const cadenaTiempo = ahora.toLocaleTimeString('es-ES');
    const elementoUltimaActualizacion = document.getElementById('lastUpdate');
    if (elementoUltimaActualizacion) {
        elementoUltimaActualizacion.textContent = `Última actualización: ${cadenaTiempo}`;
    }
}

function actualizarContadorGeocercas() {
    const elementoContador = document.getElementById('geofenceCount');
    if (elementoContador) {
        elementoContador.textContent = geocercas.length;
    }
}

function centrarMapaEnUbicacion() {
    if (ultimaUbicacion) {
        mapa.flyTo({
            center: [ultimaUbicacion.lng, ultimaUbicacion.lat],
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

const scriptToastify = document.createElement('script');
scriptToastify.src = 'https://cdn.jsdelivr.net/npm/toastify-js';
document.head.appendChild(scriptToastify);

const cssToastify = document.createElement('link');
cssToastify.rel = 'stylesheet';
cssToastify.href = 'https://cdn.jsdelivr.net/npm/toastify-js/src/toastify.min.css';
document.head.appendChild(cssToastify);

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
} else {
    iniciar();
}