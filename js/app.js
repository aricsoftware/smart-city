// ── Options Menu ──
function toggleOptionsMenu() {
    document.getElementById('options-panel').classList.toggle('hidden');
}
document.addEventListener('click', function(e) {
    var w = document.getElementById('options-menu-wrapper');
    if (w && !w.contains(e.target)) {
        document.getElementById('options-panel').classList.add('hidden');
    }
});

// ── Theme Toggle ──
function applyTheme(isDark) {
    var icon = document.getElementById('theme-icon');
    var btn  = document.getElementById('dark-mode-btn');
    if (isDark) {
        document.documentElement.removeAttribute('data-theme');
        if (icon) icon.className = 'fa-solid fa-moon text-atl-gold text-sm w-5 text-center';
        if (btn)  btn.setAttribute('aria-checked', 'true');
    } else {
        document.documentElement.setAttribute('data-theme', 'light');
        if (icon) icon.className = 'fa-solid fa-sun text-amber-400 text-sm w-5 text-center';
        if (btn)  btn.setAttribute('aria-checked', 'false');
    }
    try { localStorage.setItem('atl-theme', isDark ? 'dark' : 'light'); } catch(e) {}
}
function toggleTheme() {
    applyTheme(document.documentElement.getAttribute('data-theme') === 'light');
}
// Restore persisted theme on load
(function() {
    try { if (localStorage.getItem('atl-theme') === 'light') applyTheme(false); } catch(e) {}
})();

// ── Sidebar Toggle ──
function toggleSidebar() {
    const sb = document.getElementById('sidebar');
    const ov = document.getElementById('sidebar-overlay');
    const isOpen = sb.classList.contains('sidebar-open');
    if (isOpen) {
        sb.classList.remove('sidebar-open');
        sb.classList.add('sidebar-closed');
        ov.classList.add('hidden');
    } else {
        sb.classList.remove('sidebar-closed');
        sb.classList.add('sidebar-open');
        ov.classList.remove('hidden');
    }
}

// ── Clock ──
function updateClock() {
    const now = new Date();
    document.getElementById('live-clock').textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    document.getElementById('live-date').textContent = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}
updateClock();
setInterval(updateClock, 1000);

// ══════════════════════════════════════════
// MAP INITIALIZATION (Mapbox GL JS)
// ══════════════════════════════════════════
mapboxgl.accessToken = 'pk.eyJ1IjoiYXJpY3NvZnR3YXJlIiwiYSI6ImNtbnh4dzlvejA3aXIycXEydDVsOTVrOXUifQ.kRp7kLbV1HSY1wK3Bb7eqQ';
const ATL_CENTER = [-84.3880, 33.7490]; // [lng, lat] for Mapbox

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: ATL_CENTER,
    zoom: 12,
    pitch: 0,
    bearing: 0,
    antialias: true
});

map.addControl(new mapboxgl.NavigationControl(), 'top-right');

// ── Style presets ──
const mapStyles = {
    dark:      'mapbox://styles/mapbox/dark-v11',
    street:    'mapbox://styles/mapbox/streets-v12',
    satellite: 'mapbox://styles/mapbox/satellite-streets-v12'
};
let activeBaseLayer = 'dark';

function setMapStyle(style) {
    activeBaseLayer = style;
    map.setStyle(mapStyles[style]);
    // Re-add sources/layers after style load
    map.once('style.load', function() {
        addBoundaryLayer();
        addHeatmapLayer();
        addNeighborhoodZones();
        add3DBuildings();
        if (style === 'satellite') {
            add3DTerrain();
            enable3DTiles();
            map.easeTo({ pitch: 60, bearing: -30, duration: 1500 });
        } else {
            disable3DTiles();
            map.setTerrain(null);
            map.easeTo({ pitch: 0, bearing: 0, duration: 1000 });
        }
        syncLayerVisibility();
    });
    ['dark','street','satellite'].forEach(s => {
        const btn = document.getElementById('btn-' + s);
        if (s === style) {
            btn.className = 'px-2.5 py-1 rounded-md bg-atl-blue/20 text-atl-blue font-medium';
        } else {
            btn.className = 'px-2.5 py-1 rounded-md hover:bg-white/10 text-gray-400';
        }
    });
}

// ── Coordinate display ──
map.on('mousemove', function(e) {
    document.getElementById('coord-display').textContent =
        'Lat: ' + e.lngLat.lat.toFixed(4) + '   Lng: ' + e.lngLat.lng.toFixed(4);
});

// ── Atlanta City Limits Boundary ──
let boundaryData = null;
function addBoundaryLayer() {
    if (!boundaryData) return;
    if (map.getSource('atl-boundary')) return;
    map.addSource('atl-boundary', { type: 'geojson', data: boundaryData });
    map.addLayer({
        id: 'atl-boundary-fill',
        type: 'fill',
        source: 'atl-boundary',
        paint: { 'fill-color': '#3B82F6', 'fill-opacity': 0.04 }
    });
    map.addLayer({
        id: 'atl-boundary-line',
        type: 'line',
        source: 'atl-boundary',
        paint: { 'line-color': '#3B82F6', 'line-width': 2.5, 'line-opacity': 0.7, 'line-dasharray': [3, 2] }
    });
}
fetch('models/atlanta-boundary.geojson')
    .then(function(r) { return r.json(); })
    .then(function(data) { boundaryData = data; });

// ── 3D Buildings ──
function add3DBuildings() {
    if (map.getLayer('3d-buildings')) return;
    var layers = map.getStyle().layers;
    var labelLayer;
    for (var i = 0; i < layers.length; i++) {
        if (layers[i].type === 'symbol' && layers[i].layout && layers[i].layout['text-field']) {
            labelLayer = layers[i].id;
            break;
        }
    }
    map.addLayer({
        id: '3d-buildings',
        source: 'composite',
        'source-layer': 'building',
        filter: ['==', 'extrude', 'true'],
        type: 'fill-extrusion',
        minzoom: 14,
        paint: {
            'fill-extrusion-color': [
                'interpolate', ['linear'], ['get', 'height'],
                0,   '#1a2332',
                30,  '#1e2d42',
                80,  '#243852',
                200, '#2a4565'
            ],
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-base': ['get', 'min_height'],
            'fill-extrusion-opacity': 0.92,
            'fill-extrusion-vertical-gradient': true,
            'fill-extrusion-ambient-occlusion-intensity': 0.75,
            'fill-extrusion-ambient-occlusion-radius': 5,
            'fill-extrusion-flood-light-color': '#1a3a5c',
            'fill-extrusion-flood-light-intensity': 0.3
        }
    }, labelLayer);
}

// ── 3D Terrain ──
function add3DTerrain() {
    if (!map.getSource('mapbox-dem')) {
        map.addSource('mapbox-dem', {
            type: 'raster-dem',
            url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
            tileSize: 512,
            maxzoom: 14
        });
    }
    map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });
}

// ── Google Photorealistic 3D Tiles (deck.gl overlay) ──
const GOOGLE_MAPS_API_KEY = 'AIzaSyBU4fYA0HpRIyabUsmSZiLO1mj-6Is-HUE';
var deckOverlay = null;

function enable3DTiles() {
    if (!deckOverlay) {
        deckOverlay = new deck.MapboxOverlay({
            interleaved: false,
            layers: [
                new deck.Tile3DLayer({
                    id: 'google-3d-tiles',
                    data: 'https://tile.googleapis.com/v1/3dtiles/root.json',
                    loadOptions: {
                        fetch: { headers: { 'X-GOOG-API-KEY': GOOGLE_MAPS_API_KEY } }
                    },
                    onTilesetLoad: function(tileset) {
                        console.log('[3D Tiles] Tileset loaded successfully');
                    },
                    onTileError: function(tile, url, message) {
                        console.error('[3D Tiles] Tile error:', url, message);
                    }
                })
            ]
        });
        map.addControl(deckOverlay);
    } else {
        deckOverlay.setProps({
            layers: [
                new deck.Tile3DLayer({
                    id: 'google-3d-tiles',
                    data: 'https://tile.googleapis.com/v1/3dtiles/root.json',
                    loadOptions: {
                        fetch: { headers: { 'X-GOOG-API-KEY': GOOGLE_MAPS_API_KEY } }
                    }
                })
            ]
        });
    }
    // Hide Mapbox extrusion buildings — the 3D tiles replace them
    if (map.getLayer('3d-buildings')) {
        map.setLayoutProperty('3d-buildings', 'visibility', 'none');
    }
}

function disable3DTiles() {
    if (deckOverlay) {
        map.removeControl(deckOverlay);
        deckOverlay = null;
    }
    if (map.getLayer('3d-buildings')) {
        map.setLayoutProperty('3d-buildings', 'visibility', 'visible');
    }
}

// ══════════════════════════════════════════
// VEHICLE ICONS (Mapbox markers use HTML elements)
// ══════════════════════════════════════════
function makeVehicleMarkerEl(emoji, color, shadowColor) {
    var el = document.createElement('div');
    el.style.cssText = 'background:' + color + ';width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid ' + shadowColor + ';box-shadow:0 0 12px ' + color + '66;font-size:17px;line-height:1;cursor:pointer;';
    el.textContent = emoji;
    return el;
}

const iconConfigs = {
    police:      { emoji: '🚔', color: '#2563EB', shadow: '#60A5FA' },
    ambulance:   { emoji: '🚑', color: '#DC2626', shadow: '#F87171' },
    bus:         { emoji: '🚌', color: '#D97706', shadow: '#FBBF24' },
    citybus:     { emoji: '🚍', color: '#0891B2', shadow: '#22D3EE' },
    firetruck:   { emoji: '🚒', color: '#E11D48', shadow: '#FB7185' },
    laddertruck: { emoji: '🚒', color: '#BE123C', shadow: '#FDA4AF' },
    garbagetruck: { emoji: '🗑️', color: '#16A34A', shadow: '#4ADE80' }
};

// ── Traffic light marker element ──
function makeTrafficLightEl(color) {
    var c = { red: '#EF4444', yellow: '#FBBF24', green: '#10B981' }[color];
    var el = document.createElement('div');
    el.style.cssText = 'width:14px;height:14px;border-radius:50%;background:' + c + ';border:2px solid #1F2937;box-shadow:0 0 8px ' + c + '88;';
    return el;
}

// ══════════════════════════════════════════
// VEHICLE ROUTES (closed loops around Atlanta)
// ══════════════════════════════════════════
const vehicleRoutes = {
    police1: {
        type: 'police', label: 'APD Unit 1 — Downtown',
        route: [
            [33.7489, -84.3906], [33.7500, -84.3852], [33.7540, -84.3850],
            [33.7578, -84.3873], [33.7585, -84.3928], [33.7548, -84.3948],
            [33.7510, -84.3944], [33.7489, -84.3906]
        ]
    },
    police2: {
        type: 'police', label: 'APD Unit 2 — Midtown',
        route: [
            [33.7815, -84.3835], [33.7842, -84.3770], [33.7870, -84.3740],
            [33.7900, -84.3800], [33.7885, -84.3860], [33.7855, -84.3880],
            [33.7830, -84.3870], [33.7815, -84.3835]
        ]
    },
    police3: {
        type: 'police', label: 'APD Unit 3 — Buckhead',
        route: [
            [33.8380, -84.3800], [33.8400, -84.3740], [33.8430, -84.3700],
            [33.8460, -84.3750], [33.8440, -84.3820], [33.8405, -84.3840],
            [33.8380, -84.3800]
        ]
    },
    ambulance1: {
        type: 'ambulance', label: 'EMS 7 — Grady Hospital',
        route: [
            [33.7569, -84.3850], [33.7530, -84.3820], [33.7510, -84.3760],
            [33.7555, -84.3720], [33.7600, -84.3750], [33.7610, -84.3810],
            [33.7590, -84.3850], [33.7569, -84.3850]
        ]
    },
    ambulance2: {
        type: 'ambulance', label: 'EMS 12 — Emory Area',
        route: [
            [33.7935, -84.3250], [33.7900, -84.3310], [33.7860, -84.3350],
            [33.7850, -84.3280], [33.7880, -84.3220], [33.7920, -84.3200],
            [33.7935, -84.3250]
        ]
    },
    bus1: {
        type: 'bus', label: 'School Bus 14 — West Atlanta',
        route: [
            [33.7600, -84.4200], [33.7570, -84.4120], [33.7550, -84.4050],
            [33.7600, -84.4000], [33.7650, -84.4050], [33.7660, -84.4140],
            [33.7630, -84.4200], [33.7600, -84.4200]
        ]
    },
    bus2: {
        type: 'bus', label: 'School Bus 9 — East Atlanta',
        route: [
            [33.7400, -84.3490], [33.7360, -84.3440], [33.7380, -84.3370],
            [33.7430, -84.3380], [33.7470, -84.3420], [33.7450, -84.3480],
            [33.7400, -84.3490]
        ]
    },
    bus3: {
        type: 'bus', label: 'School Bus 22 — Decatur',
        route: [
            [33.7750, -84.2960], [33.7720, -84.2900], [33.7700, -84.2830],
            [33.7730, -84.2800], [33.7770, -84.2850], [33.7780, -84.2920],
            [33.7750, -84.2960]
        ]
    },
    citybus1: {
        type: 'citybus', label: 'MARTA Route 1 — Peachtree',
        route: [
            [33.7490, -84.3880], [33.7550, -84.3870], [33.7620, -84.3855],
            [33.7710, -84.3855], [33.7815, -84.3835], [33.7870, -84.3840],
            [33.7930, -84.3815], [33.7870, -84.3840], [33.7815, -84.3835],
            [33.7710, -84.3855], [33.7620, -84.3855], [33.7550, -84.3870],
            [33.7490, -84.3880]
        ]
    },
    citybus2: {
        type: 'citybus', label: 'MARTA Route 36 — MLK Jr Dr',
        route: [
            [33.7560, -84.3950], [33.7540, -84.4020], [33.7510, -84.4100],
            [33.7490, -84.4180], [33.7470, -84.4260], [33.7490, -84.4180],
            [33.7510, -84.4100], [33.7540, -84.4020], [33.7560, -84.3950]
        ]
    },
    citybus3: {
        type: 'citybus', label: 'MARTA Route 12 — Howell Mill',
        route: [
            [33.7810, -84.4100], [33.7850, -84.4060], [33.7900, -84.4020],
            [33.7950, -84.3980], [33.8000, -84.3950], [33.7950, -84.3980],
            [33.7900, -84.4020], [33.7850, -84.4060], [33.7810, -84.4100]
        ]
    },
    citybus4: {
        type: 'citybus', label: 'MARTA Route 21 — Memorial Dr',
        route: [
            [33.7460, -84.3810], [33.7440, -84.3730], [33.7420, -84.3650],
            [33.7400, -84.3560], [33.7380, -84.3480], [33.7400, -84.3560],
            [33.7420, -84.3650], [33.7440, -84.3730], [33.7460, -84.3810]
        ]
    },
    citybus5: {
        type: 'citybus', label: 'MARTA Route 49 — Cascade Rd',
        route: [
            [33.7490, -84.3950], [33.7440, -84.4030], [33.7390, -84.4110],
            [33.7340, -84.4190], [33.7290, -84.4270], [33.7340, -84.4190],
            [33.7390, -84.4110], [33.7440, -84.4030], [33.7490, -84.3950]
        ]
    },
    firetruck1: {
        type: 'firetruck', label: 'AFD Engine 1 — Downtown',
        route: [
            [33.7530, -84.3920], [33.7560, -84.3870], [33.7590, -84.3830],
            [33.7560, -84.3790], [33.7520, -84.3830], [33.7500, -84.3880],
            [33.7530, -84.3920]
        ]
    },
    firetruck2: {
        type: 'firetruck', label: 'AFD Engine 7 — West End',
        route: [
            [33.7380, -84.4120], [33.7410, -84.4070], [33.7440, -84.4030],
            [33.7420, -84.3980], [33.7390, -84.4010], [33.7360, -84.4070],
            [33.7380, -84.4120]
        ]
    },
    laddertruck1: {
        type: 'laddertruck', label: 'AFD Ladder 4 — Midtown',
        route: [
            [33.7820, -84.3870], [33.7860, -84.3830], [33.7890, -84.3790],
            [33.7870, -84.3750], [33.7840, -84.3780], [33.7810, -84.3830],
            [33.7820, -84.3870]
        ]
    },
    laddertruck2: {
        type: 'laddertruck', label: 'AFD Ladder 16 — East Atlanta',
        route: [
            [33.7420, -84.3500], [33.7450, -84.3450], [33.7480, -84.3410],
            [33.7460, -84.3370], [33.7430, -84.3400], [33.7400, -84.3450],
            [33.7420, -84.3500]
        ]
    },
    garbagetruck1: {
        type: 'garbagetruck', label: 'Sanitation 3 — Westside',
        route: [
            [33.7620, -84.4150], [33.7590, -84.4090], [33.7560, -84.4030],
            [33.7530, -84.3970], [33.7560, -84.3930], [33.7600, -84.3980],
            [33.7640, -84.4050], [33.7660, -84.4120], [33.7620, -84.4150]
        ]
    },
    garbagetruck2: {
        type: 'garbagetruck', label: 'Sanitation 8 — Old Fourth Ward',
        route: [
            [33.7650, -84.3680], [33.7620, -84.3620], [33.7590, -84.3560],
            [33.7620, -84.3520], [33.7660, -84.3570], [33.7690, -84.3630],
            [33.7670, -84.3680], [33.7650, -84.3680]
        ]
    },
    garbagetruck3: {
        type: 'garbagetruck', label: 'Sanitation 11 — Grant Park',
        route: [
            [33.7330, -84.3710], [33.7360, -84.3660], [33.7390, -84.3620],
            [33.7370, -84.3570], [33.7340, -84.3600], [33.7310, -84.3660],
            [33.7330, -84.3710]
        ]
    }
};

// ── Traffic Light Positions ──
const trafficLightPositions = [
    { pos: [33.7710, -84.3855], name: 'Peachtree & North Ave' },
    { pos: [33.7815, -84.3835], name: 'Peachtree & 10th St' },
    { pos: [33.7870, -84.3840], name: 'Peachtree & 14th St' },
    { pos: [33.7570, -84.3945], name: 'Marietta & Spring St' },
    { pos: [33.7495, -84.4040], name: 'MLK & Northside Dr' },
    { pos: [33.7555, -84.3760], name: 'Auburn & Piedmont Ave' },
    { pos: [33.7740, -84.3650], name: 'Ponce de Leon & Monroe' },
    { pos: [33.7530, -84.3490], name: 'DeKalb & Moreland' },
    { pos: [33.7460, -84.3810], name: 'Memorial & Capitol Ave' },
    { pos: [33.7660, -84.3880], name: 'North Ave & W Peachtree' }
];

// ══════════════════════════════════════════
// MARKERS & LAYERS
// ══════════════════════════════════════════
const vehicleMarkers = [];
const trafficMarkers = [];

// Track whether we should render the simulated/static fleet markers.
var trackingMode = 'simulation';

// ── Build Vehicle Instances ──
const vehicles = {};
const _vehicleClassMap = { police: DT.PoliceCar, ambulance: DT.Ambulance, bus: DT.SchoolBus, citybus: DT.CityBus, firetruck: DT.FireTruckApparatus, laddertruck: DT.LadderFireTruck, garbagetruck: DT.GarbageTruck };
Object.keys(vehicleRoutes).forEach(id => {
    const vd  = vehicleRoutes[id];
    const Cls = _vehicleClassMap[vd.type];
    const instance = new Cls({ id: id, label: vd.label, route: vd.route });
    // Create Mapbox marker
    const ic = iconConfigs[vd.type];
    const el = makeVehicleMarkerEl(ic.emoji, ic.color, ic.shadow);
    const startPos = vd.route[0];
    const popup = new mapboxgl.Popup({ offset: 20, closeButton: true });
    popup.on('open', () => {
        popup.setHTML(instance._popupHTML());
        window.openDigitalTwin(id);
    });
    const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([startPos[1], startPos[0]])
        .setPopup(popup);
    instance.mapMarker = marker;
    instance._markerEl = el;
    vehicleMarkers.push(marker);
    vehicles[id] = instance;
});

// ── Build Traffic Light Markers ──
const trafficLights = [];
const tlColors = ['red', 'yellow', 'green'];
trafficLightPositions.forEach(tl => {
    const startColor = tlColors[Math.floor(Math.random() * 3)];
    const el = makeTrafficLightEl(startColor);
    const popup = new mapboxgl.Popup({ offset: 10 });
    const tlRef = { marker: null, el, name: tl.name, color: startColor, popup };
    popup.on('open', () => {
        var c = { red: '#EF4444', yellow: '#FBBF24', green: '#10B981' }[tlRef.color];
        popup.setHTML(
            '<strong>🚦 ' + tlRef.name + '</strong><br>Status: <span style="color:' + c + '">' + tlRef.color.toUpperCase() + '</span>'
        );
        window.openDigitalTwin(null, 'traffic', '🚦 ' + tlRef.name, tlRef.color);
    });
    const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([tl.pos[1], tl.pos[0]])
        .setPopup(popup);
    tlRef.marker = marker;
    trafficMarkers.push(marker);
    trafficLights.push(tlRef);
});

// ── Heatmap (simulated crime/incident density) ──
const heatFeatures = [];
function addHeatPoints(centerLat, centerLng, count, spread, minIntensity) {
    for (var i = 0; i < count; i++) {
        heatFeatures.push({
            type: 'Feature',
            properties: { intensity: Math.random() * (1 - minIntensity) + minIntensity },
            geometry: {
                type: 'Point',
                coordinates: [
                    centerLng + (Math.random() - 0.5) * spread,
                    centerLat + (Math.random() - 0.5) * spread
                ]
            }
        });
    }
}
addHeatPoints(33.749, -84.388, 120, 0.04, 0.3);
addHeatPoints(33.768, -84.430, 40, 0.02, 0.5);
addHeatPoints(33.740, -84.348, 30, 0.02, 0.3);

const heatGeoJSON = { type: 'FeatureCollection', features: heatFeatures };

function addHeatmapLayer() {
    if (map.getSource('heat-source')) return;
    map.addSource('heat-source', { type: 'geojson', data: heatGeoJSON });
    map.addLayer({
        id: 'heat-layer',
        type: 'heatmap',
        source: 'heat-source',
        paint: {
            'heatmap-weight': ['get', 'intensity'],
            'heatmap-intensity': 1.2,
            'heatmap-radius': 25,
            'heatmap-opacity': 0.7,
            'heatmap-color': [
                'interpolate', ['linear'], ['heatmap-density'],
                0, 'rgba(0,0,0,0)',
                0.2, '#0077C8',
                0.4, '#00B4D8',
                0.6, '#FFD60A',
                0.8, '#FF6B35',
                1.0, '#EF4444'
            ]
        }
    });
    // Start hidden (checkbox unchecked by default)
    map.setLayoutProperty('heat-layer', 'visibility', 'none');
}

// ── Neighborhood Zones ──
const neighborhoods = [
    { name: 'Downtown', color: '#3B82F6', coords: [[-84.398,33.743],[-84.378,33.743],[-84.378,33.760],[-84.398,33.760],[-84.398,33.743]] },
    { name: 'Midtown', color: '#8B5CF6', coords: [[-84.395,33.775],[-84.375,33.775],[-84.375,33.795],[-84.395,33.795],[-84.395,33.775]] },
    { name: 'Buckhead', color: '#10B981', coords: [[-84.390,33.835],[-84.365,33.835],[-84.365,33.855],[-84.390,33.855],[-84.390,33.835]] },
    { name: 'Old Fourth Ward', color: '#F59E0B', coords: [[-84.378,33.758],[-84.360,33.758],[-84.360,33.770],[-84.378,33.770],[-84.378,33.758]] },
    { name: 'West End', color: '#EF4444', coords: [[-84.420,33.730],[-84.400,33.730],[-84.400,33.748],[-84.420,33.748],[-84.420,33.730]] },
    { name: 'East Atlanta', color: '#EC4899', coords: [[-84.360,33.730],[-84.340,33.730],[-84.340,33.748],[-84.360,33.748],[-84.360,33.730]] }
];

function addNeighborhoodZones() {
    neighborhoods.forEach(function(n, i) {
        var srcId = 'zone-' + i;
        if (map.getSource(srcId)) return;
        map.addSource(srcId, {
            type: 'geojson',
            data: {
                type: 'Feature',
                properties: { name: n.name },
                geometry: { type: 'Polygon', coordinates: [n.coords] }
            }
        });
        map.addLayer({
            id: 'zone-fill-' + i,
            type: 'fill',
            source: srcId,
            paint: { 'fill-color': n.color, 'fill-opacity': 0.12 },
            layout: { visibility: 'none' }
        });
        map.addLayer({
            id: 'zone-line-' + i,
            type: 'line',
            source: srcId,
            paint: { 'line-color': n.color, 'line-width': 2, 'line-dasharray': [3, 2] },
            layout: { visibility: 'none' }
        });
    });
}

// ── GIS Legend (HTML overlay instead of L.control) ──
function createLegend() {
    var legendDiv = document.createElement('div');
    legendDiv.className = 'gis-legend';
    legendDiv.style.cssText = 'position:absolute;bottom:40px;left:10px;z-index:2;';
    legendDiv.innerHTML =
        '<h4>🗺️ Map Legend</h4>' +
        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;"><span style="font-size:15px;">🚔</span> Police Unit</div>' +
        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;"><span style="font-size:15px;">🚑</span> Ambulance / EMS</div>' +
        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;"><span style="font-size:15px;">🚌</span> School Bus</div>' +
        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;"><span style="font-size:15px;">🚍</span> City Bus (MARTA)</div>' +
        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;"><span style="font-size:15px;">🚒</span> Fire Truck (Pumper)</div>' +
        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;"><span style="font-size:15px;">🚒</span> Ladder Truck</div>' +
        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;"><span style="font-size:15px;">🗑️</span> Garbage Truck</div>' +
        '<div style="display:flex;align-items:center;gap:6px;"><span style="font-size:15px;">🚦</span> Traffic Signal</div>';
    document.getElementById('map').appendChild(legendDiv);
}

// ── Sync layer visibility with checkboxes ──
function syncLayerVisibility() {
    var showHeat = document.getElementById('layer-heatmap').checked;
    var showZones = document.getElementById('layer-zones').checked;
    if (map.getLayer('heat-layer')) {
        map.setLayoutProperty('heat-layer', 'visibility', showHeat ? 'visible' : 'none');
    }
    neighborhoods.forEach(function(n, i) {
        if (map.getLayer('zone-fill-' + i)) {
            map.setLayoutProperty('zone-fill-' + i, 'visibility', showZones ? 'visible' : 'none');
            map.setLayoutProperty('zone-line-' + i, 'visibility', showZones ? 'visible' : 'none');
        }
    });
}

// ── Add all markers to map ──
function addAllMarkers() {
    vehicleMarkers.forEach(function(m) { m.addTo(map); });
    trafficMarkers.forEach(function(m) { m.addTo(map); });
}

function _isVehicleLayerEnabled() {
    var cb = document.getElementById('layer-vehicles');
    return !cb || cb.checked;
}

function setSimulatedVehicleMarkersVisible(visible) {
    Object.keys(vehicles).forEach(function (id) {
        var marker = vehicles[id] && vehicles[id].mapMarker;
        if (!marker) return;
        if (visible && _isVehicleLayerEnabled()) {
            marker.addTo(map);
        } else {
            marker.remove();
        }
    });
}

// Called by LiveTracking when mode changes.
window.setTrackingModeUI = function (mode) {
    trackingMode = mode || 'simulation';
    setSimulatedVehicleMarkersVisible(trackingMode !== 'live');
    var modeSel = document.getElementById('tracking-mode');
    var modeHint = document.getElementById('tracking-mode-hint');
    if (modeSel && modeSel.value !== trackingMode) {
        modeSel.value = trackingMode;
    }
    if (modeHint) {
        if (trackingMode === 'live') {
            modeHint.textContent = 'Showing detected Bouncie vehicles only.';
        } else if (trackingMode === 'hybrid') {
            modeHint.textContent = 'Showing simulated and detected vehicles.';
        } else {
            modeHint.textContent = 'Showing simulated fleet.';
        }
    }
};

function getTrackingRelayWsUrl() {
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
        return 'ws://localhost:3001/ws';
    }
    return 'wss://smart-city-relay.onrender.com/ws';
}

function initTrackingModeSwitch() {
    var modeSel = document.getElementById('tracking-mode');
    if (!modeSel) return;

    modeSel.addEventListener('change', function () {
        var nextMode = this.value;
        if (typeof LiveTracking === 'undefined') return;
        LiveTracking.setMode(nextMode, getTrackingRelayWsUrl());
        window.setTrackingModeUI(nextMode);
    });
}

// ── Initialize everything once the map style loads ──
map.on('load', function() {
    addBoundaryLayer();
    addHeatmapLayer();
    addNeighborhoodZones();
    add3DBuildings();
    addAllMarkers();
    createLegend();
});

// ══════════════════════════════════════════
// VEHICLE ANIMATION ENGINE
// ══════════════════════════════════════════
const WAYPOINT_DURATION = 30000;
const TICK_INTERVAL = 400;
const TICKS_PER_SEGMENT = WAYPOINT_DURATION / TICK_INTERVAL;

function animateVehicles() {
    Object.keys(vehicles).forEach(id => vehicles[id].tick(TICKS_PER_SEGMENT));
}

setInterval(animateVehicles, TICK_INTERVAL);

// ── Traffic Light Cycling ──
setInterval(() => {
    trafficLights.forEach(tl => {
        const nextIndex = (tlColors.indexOf(tl.color) + 1) % 3;
        tl.color = tlColors[nextIndex];
        var c = { red: '#EF4444', yellow: '#FBBF24', green: '#10B981' }[tl.color];
        tl.el.style.background = c;
        tl.el.style.boxShadow = '0 0 8px ' + c + '88';
        // Popup HTML is refreshed on open via the 'open' event handler
    });
}, 8000);

// ── Layer Toggle Checkboxes ──
document.getElementById('layer-vehicles').addEventListener('change', function () {
    setSimulatedVehicleMarkersVisible(this.checked && trackingMode !== 'live');
    if (typeof LiveTracking !== 'undefined' && LiveTracking.setLiveMarkersVisible) {
        LiveTracking.setLiveMarkersVisible(this.checked);
    }
});
document.getElementById('layer-traffic').addEventListener('change', function () {
    trafficMarkers.forEach(m => { this.checked ? m.addTo(map) : m.remove(); });
});
document.getElementById('layer-heatmap').addEventListener('change', function () {
    if (map.getLayer('heat-layer')) {
        map.setLayoutProperty('heat-layer', 'visibility', this.checked ? 'visible' : 'none');
    }
    updateGISCount();
});
document.getElementById('layer-zones').addEventListener('change', function () {
    var vis = this.checked ? 'visible' : 'none';
    neighborhoods.forEach(function(n, i) {
        if (map.getLayer('zone-fill-' + i)) {
            map.setLayoutProperty('zone-fill-' + i, 'visibility', vis);
            map.setLayoutProperty('zone-line-' + i, 'visibility', vis);
        }
    });
    updateGISCount();
});

function updateGISCount() {
    let count = 2;
    if (document.getElementById('layer-heatmap').checked) count++;
    if (document.getElementById('layer-zones').checked) count++;
    document.getElementById('gis-layers-count').textContent = count;
}

// ══════════════════════════════════════════
// CHARTS
// ══════════════════════════════════════════
const chartDefaults = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
        x: { grid: { color: '#1F293744' }, ticks: { color: '#6B7280', font: { size: 10 } } },
        y: { grid: { color: '#1F293744' }, ticks: { color: '#6B7280', font: { size: 10 } } }
    }
};

// Traffic Flow Chart
const trafficCtx = document.getElementById('chart-traffic').getContext('2d');
const trafficLabels = Array.from({ length: 24 }, (_, i) => `${i}:00`);
const trafficData = [20,15,10,8,10,18,45,72,85,78,65,60,55,58,62,68,80,88,82,70,55,42,35,25];
const trafficChart = new Chart(trafficCtx, {
    type: 'line',
    data: {
        labels: trafficLabels,
        datasets: [{
            label: 'Congestion %',
            data: trafficData,
            borderColor: '#F59E0B',
            backgroundColor: 'rgba(245,158,11,.08)',
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            borderWidth: 2
        }]
    },
    options: { ...chartDefaults }
});

// Energy Chart
const energyCtx = document.getElementById('chart-energy').getContext('2d');
const energyChart = new Chart(energyCtx, {
    type: 'bar',
    data: {
        labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        datasets: [
            {
                label: 'Grid (MW)',
                data: [420, 445, 460, 438, 470, 390, 355],
                backgroundColor: '#0077C8',
                borderRadius: 4
            },
            {
                label: 'Solar (MW)',
                data: [85, 92, 78, 95, 88, 102, 98],
                backgroundColor: '#10B981',
                borderRadius: 4
            }
        ]
    },
    options: {
        ...chartDefaults,
        plugins: {
            legend: {
                display: true,
                position: 'top',
                labels: { color: '#9CA3AF', font: { size: 10 }, boxWidth: 12, padding: 12 }
            }
        }
    }
});

// Crime/Incident Doughnut
const crimeCtx = document.getElementById('chart-crime').getContext('2d');
const crimeChart = new Chart(crimeCtx, {
    type: 'doughnut',
    data: {
        labels: ['Traffic', 'Theft', 'Assault', 'Vandalism', 'Medical', 'Fire', 'Other'],
        datasets: [{
            data: [35, 18, 12, 10, 15, 5, 5],
            backgroundColor: ['#F59E0B', '#EF4444', '#DC2626', '#8B5CF6', '#3B82F6', '#FF6B35', '#6B7280'],
            borderColor: '#1F2937',
            borderWidth: 2
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
            legend: {
                position: 'right',
                labels: { color: '#9CA3AF', font: { size: 10 }, boxWidth: 10, padding: 8 }
            }
        }
    }
});

// ══════════════════════════════════════════
// LIVE ALERT FEED
// ══════════════════════════════════════════
const alertTemplates = [
    { icon: '🚔', color: 'blue',   msg: 'APD responding to disturbance — Peachtree St NW' },
    { icon: '🚑', color: 'red',    msg: 'EMS dispatched — medical emergency, Ponce de Leon' },
    { icon: '🚦', color: 'amber',  msg: 'Signal malfunction reported — North Ave & Spring' },
    { icon: '🔧', color: 'gray',   msg: 'Water main repair underway — Edgewood Ave' },
    { icon: '🌡️', color: 'teal',   msg: 'AQI sensor spike detected — Zone 3 (Industrial)' },
    { icon: '🚌', color: 'amber',  msg: 'School bus route 14 delayed — 8 minutes behind' },
    { icon: '⚡', color: 'cyan',   msg: 'Power fluctuation — Grid Sector 7 (Midtown)' },
    { icon: '🔥', color: 'red',    msg: 'AFD responding to structure fire — Capitol Ave' },
    { icon: '🚧', color: 'amber',  msg: 'Road closure — Marietta St at Centennial Olympic' },
    { icon: '📢', color: 'blue',   msg: 'Noise complaint investigation — Buckhead Village' },
    { icon: '💧', color: 'sky',    msg: 'Hydrant leak reported — MLK Jr Dr & Northside' },
    { icon: '🏗️', color: 'gray',   msg: 'Construction zone update — BeltLine Westside Trail' },
    { icon: '🚔', color: 'blue',   msg: 'Traffic stop — I-75/85 connector NB at Williams' },
    { icon: '🚑', color: 'red',    msg: 'EMS en route — cardiac event, Atlantic Station' },
    { icon: '🌳', color: 'green',  msg: 'Fallen tree blocking lane — Moreland Ave' },
];

const colorMap = {
    blue: 'bg-blue-500/10 border-blue-500/30 text-blue-300',
    red: 'bg-red-500/10 border-red-500/30 text-red-300',
    amber: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
    gray: 'bg-gray-500/10 border-gray-500/30 text-gray-300',
    teal: 'bg-teal-500/10 border-teal-500/30 text-teal-300',
    cyan: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300',
    sky: 'bg-sky-500/10 border-sky-500/30 text-sky-300',
    green: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
};

function addAlert(alert) {
    const feed = document.getElementById('alert-feed');
    const el = document.createElement('div');
    const now = new Date();
    const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    el.className = `flex items-start gap-2.5 p-2.5 rounded-lg border text-xs ${colorMap[alert.color] || colorMap.gray}`;
    el.innerHTML = `
        <span class="text-base mt-0.5">${alert.icon}</span>
        <div class="flex-1 min-w-0">
            <p class="leading-snug">${alert.msg}</p>
            <p class="text-[10px] opacity-50 mt-0.5">${time}</p>
        </div>`;
    feed.insertBefore(el, feed.firstChild);
    while (feed.children.length > 20) feed.removeChild(feed.lastChild);
    const count = Math.min(feed.children.length, 20);
    document.getElementById('alert-count').textContent = count + ' Active';
}

// Seed initial alerts
for (let i = 0; i < 6; i++) {
    addAlert(alertTemplates[i]);
}

// Add new alert every 15 seconds
setInterval(() => {
    const alert = alertTemplates[Math.floor(Math.random() * alertTemplates.length)];
    addAlert(alert);
}, 15000);

// ══════════════════════════════════════════
// SIMULATED DATA UPDATES
// ══════════════════════════════════════════
function randomDelta(val, min, max, step) {
    const delta = (Math.random() - 0.5) * 2 * step;
    return Math.max(min, Math.min(max, val + delta));
}

let simIncidents = 12, simTraffic = 78, simAQI = 42, sim311 = 284;
let simReservoir = 87, simLeaks = 3, simWaste = 64;
let simEMSCalls = 18, simDispatches = 347;

setInterval(() => {
    simIncidents = Math.round(randomDelta(simIncidents, 3, 25, 2));
    simTraffic   = Math.round(randomDelta(simTraffic, 40, 98, 3));
    simAQI       = Math.round(randomDelta(simAQI, 15, 120, 4));
    sim311       = Math.round(randomDelta(sim311, 200, 400, 8));
    simReservoir = Math.round(randomDelta(simReservoir, 60, 98, 1));
    simLeaks     = Math.max(0, Math.round(randomDelta(simLeaks, 0, 8, 1)));
    simWaste     = Math.min(100, Math.round(randomDelta(simWaste, 20, 100, 3)));
    simEMSCalls  = Math.round(randomDelta(simEMSCalls, 5, 35, 2));
    simDispatches += Math.floor(Math.random() * 3);

    document.getElementById('kpi-incidents').textContent = simIncidents;
    document.getElementById('kpi-traffic').textContent = simTraffic;
    document.getElementById('kpi-aqi').textContent = simAQI;
    document.getElementById('kpi-311').textContent = sim311;
    document.getElementById('water-reservoir').textContent = simReservoir + '%';
    document.getElementById('water-bar').style.width = simReservoir + '%';
    document.getElementById('water-leaks').textContent = simLeaks;
    document.getElementById('waste-progress').textContent = simWaste + '%';
    document.getElementById('waste-bar').style.width = simWaste + '%';
    document.getElementById('ems-calls').textContent = simEMSCalls;
    document.getElementById('ems-dispatches').textContent = simDispatches;

    // AQI color
    const aqiEl = document.getElementById('kpi-aqi');
    const aqiParent = aqiEl.closest('.bg-atl-card');
    if (simAQI <= 50) {
        aqiParent.querySelector('.text-xs:last-child').innerHTML = '<i class="fa-solid fa-check mr-1"></i>Good — Healthy';
        aqiParent.querySelector('.text-xs:last-child').className = 'text-xs text-emerald-400 mt-1';
    } else if (simAQI <= 100) {
        aqiParent.querySelector('.text-xs:last-child').innerHTML = '<i class="fa-solid fa-exclamation mr-1"></i>Moderate';
        aqiParent.querySelector('.text-xs:last-child').className = 'text-xs text-amber-400 mt-1';
    } else {
        aqiParent.querySelector('.text-xs:last-child').innerHTML = '<i class="fa-solid fa-triangle-exclamation mr-1"></i>Unhealthy';
        aqiParent.querySelector('.text-xs:last-child').className = 'text-xs text-red-400 mt-1';
    }

    // Environmental sensors
    document.getElementById('env-temp').textContent = Math.round(randomDelta(parseInt(document.getElementById('env-temp').textContent), 45, 95, 1)) + '°F';
    document.getElementById('env-humidity').textContent = Math.round(randomDelta(parseInt(document.getElementById('env-humidity').textContent), 30, 85, 2)) + '%';
    document.getElementById('env-wind').textContent = Math.round(randomDelta(parseInt(document.getElementById('env-wind').textContent), 0, 25, 1)) + ' mph';
    document.getElementById('env-noise').textContent = Math.round(randomDelta(parseInt(document.getElementById('env-noise').textContent), 40, 85, 2)) + ' dB';

}, 10000);

// ══════════════════════════════════════════
// SCALE BAR
// ══════════════════════════════════════════
map.addControl(new mapboxgl.ScaleControl({ maxWidth: 150, unit: 'imperial' }), 'bottom-right');

// ══════════════════════════════════════════
// LIVE VEHICLE TRACKING INTEGRATION
// ══════════════════════════════════════════
// Initialize after map is loaded so trails and markers work.
// Default to 'simulation' mode — switch to 'live' or 'hybrid'
// when a real Bouncie device is connected via the relay server.
map.on('load', function () {
    initTrackingModeSwitch();
    if (typeof LiveTracking !== 'undefined') {
        LiveTracking.init({ mode: 'simulation' });
    }
});
