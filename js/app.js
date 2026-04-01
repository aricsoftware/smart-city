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
// MAP INITIALIZATION
// ══════════════════════════════════════════
const ATL_CENTER = [33.7490, -84.3880];
const map = L.map('map', { zoomControl: true, attributionControl: false }).setView(ATL_CENTER, 13);

// ── Tile Layers ──
const tileLayers = {
    dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19
    }),
    street: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19
    }),
    satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19
    })
};
tileLayers.dark.addTo(map);
let activeBaseLayer = 'dark';

function setMapStyle(style) {
    map.removeLayer(tileLayers[activeBaseLayer]);
    tileLayers[style].addTo(map);
    activeBaseLayer = style;
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
        'Lat: ' + e.latlng.lat.toFixed(4) + '   Lng: ' + e.latlng.lng.toFixed(4);
});

// ── Attribution ──
L.control.attribution({ prefix: false, position: 'bottomright' })
    .addAttribution('© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors')
    .addTo(map);

// ── Atlanta City Limits Boundary ──
fetch('models/atlanta-boundary.geojson')
    .then(function(r) { return r.json(); })
    .then(function(data) {
        L.geoJSON(data, {
            style: {
                color: '#3B82F6',
                weight: 2.5,
                opacity: 0.7,
                fillColor: '#3B82F6',
                fillOpacity: 0.04,
                dashArray: '8, 6'
            },
            onEachFeature: function(feature, layer) {
                layer.bindTooltip('City of Atlanta', {
                    sticky: true,
                    className: 'city-boundary-tooltip',
                    opacity: 0.85
                });
            }
        }).addTo(map);
    });

// ══════════════════════════════════════════
// VEHICLE ICONS
// ══════════════════════════════════════════
function makeVehicleIcon(emoji, color, shadowColor) {
    return L.divIcon({
        className: '',
        html: `<div style="
            background:${color};
            width:34px;height:34px;border-radius:50%;
            display:flex;align-items:center;justify-content:center;
            border:2px solid ${shadowColor};
            box-shadow:0 0 12px ${color}66;
            font-size:17px;line-height:1;
            transition: transform 0.4s linear;
        ">${emoji}</div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17]
    });
}

const icons = {
    police:    makeVehicleIcon('🚔', '#2563EB', '#60A5FA'),
    ambulance: makeVehicleIcon('🚑', '#DC2626', '#F87171'),
    bus:       makeVehicleIcon('🚌', '#D97706', '#FBBF24'),
};

// ── Traffic light icon ──
function trafficLightIcon(color) {
    const c = { red: '#EF4444', yellow: '#FBBF24', green: '#10B981' }[color];
    return L.divIcon({
        className: '',
        html: `<div style="
            width:14px;height:14px;border-radius:50%;
            background:${c};
            border:2px solid #1F2937;
            box-shadow:0 0 8px ${c}88;
        "></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7]
    });
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
// LAYER GROUPS
// ══════════════════════════════════════════
const vehicleLayerGroup = L.layerGroup().addTo(map);
const trafficLayerGroup = L.layerGroup().addTo(map);
const heatmapLayer = L.layerGroup();
const zonesLayer = L.layerGroup();

// ── Build Vehicle Instances ──
// Each entry is a typed class instance (PoliceCar / Ambulance / SchoolBus).
// The class handles route tracking, speed computation, and 3-D rendering.
const vehicles = {};
const _vehicleClassMap = { police: DT.PoliceCar, ambulance: DT.Ambulance, bus: DT.SchoolBus };
Object.keys(vehicleRoutes).forEach(id => {
    const vd  = vehicleRoutes[id];
    const Cls = _vehicleClassMap[vd.type];
    const instance = new Cls({ id: id, label: vd.label, route: vd.route });
    instance.buildMapMarker(icons[vd.type], vehicleLayerGroup);
    vehicles[id] = instance;
});

// ── Build Traffic Light Markers ──
const trafficLights = [];
const tlColors = ['red', 'yellow', 'green'];
trafficLightPositions.forEach(tl => {
    const startColor = tlColors[Math.floor(Math.random() * 3)];
    const marker = L.marker(tl.pos, { icon: trafficLightIcon(startColor) })
        .bindPopup(`<strong>🚦 ${tl.name}</strong><br>Status: <span style="color:${startColor === 'red' ? '#EF4444' : startColor === 'yellow' ? '#FBBF24' : '#10B981'}">${startColor.toUpperCase()}</span>`);
    trafficLayerGroup.addLayer(marker);
    trafficLights.push({ marker, name: tl.name, color: startColor });
});

// ── Heatmap (simulated crime/incident density) ──
const heatData = [];
// Concentrated around downtown
for (let i = 0; i < 120; i++) {
    heatData.push([
        33.749 + (Math.random() - 0.5) * 0.04,
        -84.388 + (Math.random() - 0.5) * 0.04,
        Math.random() * 0.7 + 0.3
    ]);
}
// Cluster near Bankhead
for (let i = 0; i < 40; i++) {
    heatData.push([
        33.768 + (Math.random() - 0.5) * 0.02,
        -84.430 + (Math.random() - 0.5) * 0.02,
        Math.random() * 0.5 + 0.5
    ]);
}
// Cluster near East Atlanta
for (let i = 0; i < 30; i++) {
    heatData.push([
        33.740 + (Math.random() - 0.5) * 0.02,
        -84.348 + (Math.random() - 0.5) * 0.02,
        Math.random() * 0.5 + 0.3
    ]);
}
const heat = L.heatLayer(heatData, {
    radius: 25, blur: 20, maxZoom: 16,
    gradient: { 0.2: '#0077C8', 0.4: '#00B4D8', 0.6: '#FFD60A', 0.8: '#FF6B35', 1.0: '#EF4444' }
});
heatmapLayer.addLayer(heat);

// ── Neighborhood Zones (simplified GeoJSON) ──
const neighborhoods = [
    { name: 'Downtown', color: '#3B82F6', coords: [[33.743,-84.398],[33.743,-84.378],[33.760,-84.378],[33.760,-84.398]] },
    { name: 'Midtown', color: '#8B5CF6', coords: [[33.775,-84.395],[33.775,-84.375],[33.795,-84.375],[33.795,-84.395]] },
    { name: 'Buckhead', color: '#10B981', coords: [[33.835,-84.390],[33.835,-84.365],[33.855,-84.365],[33.855,-84.390]] },
    { name: 'Old Fourth Ward', color: '#F59E0B', coords: [[33.758,-84.378],[33.758,-84.360],[33.770,-84.360],[33.770,-84.378]] },
    { name: 'West End', color: '#EF4444', coords: [[33.730,-84.420],[33.730,-84.400],[33.748,-84.400],[33.748,-84.420]] },
    { name: 'East Atlanta', color: '#EC4899', coords: [[33.730,-84.360],[33.730,-84.340],[33.748,-84.340],[33.748,-84.360]] },
];
neighborhoods.forEach(n => {
    const polygon = L.polygon(n.coords, {
        color: n.color, weight: 2, fillOpacity: 0.12, dashArray: '6 4'
    }).bindPopup(`<strong>${n.name}</strong><br>Neighborhood Planning Unit`);
    zonesLayer.addLayer(polygon);
});

// ── GIS Legend ──
const legend = L.control({ position: 'bottomleft' });
legend.onAdd = function () {
    const div = L.DomUtil.create('div', 'gis-legend');
    div.innerHTML = `
        <h4>🗺️ Map Legend</h4>
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
            <span style="font-size:15px;">🚔</span> Police Unit
        </div>
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
            <span style="font-size:15px;">🚑</span> Ambulance / EMS
        </div>
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
            <span style="font-size:15px;">🚌</span> School Bus
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
            <span style="font-size:15px;">🚦</span> Traffic Signal
        </div>`;
    return div;
};
legend.addTo(map);

// ══════════════════════════════════════════
// VEHICLE ANIMATION ENGINE
// ══════════════════════════════════════════
const WAYPOINT_DURATION = 30000; // 30 seconds per segment
const TICK_INTERVAL = 400;       // Update position every 400ms
const TICKS_PER_SEGMENT = WAYPOINT_DURATION / TICK_INTERVAL;

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function animateVehicles() {
    // Delegates to each Vehicle instance — handles position, speed, and map update.
    Object.keys(vehicles).forEach(id => vehicles[id].tick(TICKS_PER_SEGMENT));
}

setInterval(animateVehicles, TICK_INTERVAL);

// ── Traffic Light Cycling ──
setInterval(() => {
    trafficLights.forEach(tl => {
        const nextIndex = (tlColors.indexOf(tl.color) + 1) % 3;
        tl.color = tlColors[nextIndex];
        tl.marker.setIcon(trafficLightIcon(tl.color));
    });
}, 8000);

// ── Layer Toggle Checkboxes ──
document.getElementById('layer-vehicles').addEventListener('change', function () {
    this.checked ? map.addLayer(vehicleLayerGroup) : map.removeLayer(vehicleLayerGroup);
});
document.getElementById('layer-traffic').addEventListener('change', function () {
    this.checked ? map.addLayer(trafficLayerGroup) : map.removeLayer(trafficLayerGroup);
});
document.getElementById('layer-heatmap').addEventListener('change', function () {
    this.checked ? map.addLayer(heatmapLayer) : map.removeLayer(heatmapLayer);
    updateGISCount();
});
document.getElementById('layer-zones').addEventListener('change', function () {
    this.checked ? map.addLayer(zonesLayer) : map.removeLayer(zonesLayer);
    updateGISCount();
});

function updateGISCount() {
    let count = 2; // vehicles + traffic always active
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
L.control.scale({ position: 'bottomright', imperial: true, metric: true }).addTo(map);
