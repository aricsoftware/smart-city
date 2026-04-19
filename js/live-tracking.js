'use strict';

// ══════════════════════════════════════════════════════════════
// Live Vehicle Tracking — Bridge between BouncieClient and the
// existing vehicle/map system in app.js
// ══════════════════════════════════════════════════════════════
// Depends on: BouncieClient (js/bouncie-api.js), DT namespace,
//             vehicles{}, map, vehicleMarkers[] from app.js
// ══════════════════════════════════════════════════════════════

var LiveTracking = (function () {

    var _mode = 'simulation';  // 'simulation' | 'live' | 'hybrid'
    var _active = false;
    var _statusEl = null;
    var _liveVehicles = {};    // deviceId → { marker, trail, lastPos, ... }
    var _trailMaxPoints = 100; // max breadcrumb positions per vehicle
    var _originalAnimateInterval = null; // store ref to pause simulated animation

    // ── Initialize ──
    function init(options) {
        options = options || {};
        _mode = options.mode || 'simulation';

        // Create status indicator in the DOM
        _createStatusUI();

        // Listen for telemetry events from BouncieClient
        BouncieClient.on('position', _handlePosition);
        BouncieClient.on('tripStart', _handleTripStart);
        BouncieClient.on('tripEnd', _handleTripEnd);
        BouncieClient.on('metrics', _handleMetrics);
        BouncieClient.on('connection', _handleConnection);

        if (_mode === 'live') {
            _connectRelay(options.wsUrl);
        } else if (_mode === 'hybrid') {
            _connectRelay(options.wsUrl);
            _startSimulation();
        }
        // 'simulation' mode is passive — the existing animation engine
        // in app.js handles vehicle movement. We just show the status UI
        // and stand ready to switch to 'live' or 'hybrid' mode.

        _active = true;
        console.log('[LiveTracking] Initialized in ' + _mode + ' mode');
    }

    // ── Mode Switching ──
    function setMode(mode, wsUrl) {
        if (mode === _mode) return;
        var prev = _mode;
        _mode = mode;

        if (prev === 'hybrid') {
            BouncieClient.stopSimulation();
        }
        if (prev === 'live' || prev === 'hybrid') {
            BouncieClient.disconnect();
        }

        if (mode === 'live') {
            _connectRelay(wsUrl);
        } else if (mode === 'hybrid') {
            _connectRelay(wsUrl);
            _startSimulation();
        }
        // 'simulation' mode: existing animation engine handles movement

        _updateStatusUI();
        console.log('[LiveTracking] Mode changed: ' + prev + ' → ' + mode);
    }

    // ── Connect to Relay Server ──
    function _connectRelay(wsUrl) {
        BouncieClient.connect(wsUrl || BouncieClient.config.wsUrl);
    }

    // ── Start Simulated Tracking ──
    function _startSimulation() {
        // Build route data from existing vehicleRoutes in app.js
        if (typeof vehicleRoutes === 'undefined') {
            console.warn('[LiveTracking] vehicleRoutes not found — cannot simulate');
            return;
        }
        var routes = {};
        Object.keys(vehicleRoutes).forEach(function (id) {
            routes[id] = {
                route: vehicleRoutes[id].route,
                type: vehicleRoutes[id].type
            };
        });
        BouncieClient.startSimulation(routes);
    }

    // ── Position Update Handler ──
    function _handlePosition(data) {
        var vehicleId = data.vehicleId || BouncieClient.getVehicleId(data.deviceId);

        // If this vehicle is already managed by the app.js animation engine,
        // only accept updates from real live sources (not our own simulation).
        if (typeof vehicles !== 'undefined' && vehicles[vehicleId]) {
            if (data.source === 'simulation') return; // don't fight the animation engine
            // Real Bouncie data — take over the vehicle position
            var v = vehicles[vehicleId];
            v.position.lat = data.lat;
            v.position.lng = data.lng;
            v.speed = data.speed || 0;
            if (v.mapMarker) {
                v.mapMarker.setLngLat([data.lng, data.lat]);
            }
            _recordTrail(vehicleId, data);
            return;
        }

        // Otherwise it's a new live device — create a dynamic marker
        if (!_liveVehicles[vehicleId]) {
            _addLiveVehicle(vehicleId, data);
        } else {
            _updateLiveVehicle(vehicleId, data);
        }
    }

    // ── Add a new live vehicle (from a real Bouncie device) ──
    function _addLiveVehicle(vehicleId, data) {
        if (typeof mapboxgl === 'undefined' || typeof map === 'undefined') return;

        var el = document.createElement('div');
        el.style.cssText = 'background:#10B981;width:34px;height:34px;border-radius:50%;' +
            'display:flex;align-items:center;justify-content:center;border:2px solid #34D399;' +
            'box-shadow:0 0 12px #10B98166;font-size:17px;line-height:1;cursor:pointer;';
        el.textContent = '📡';

        var popup = new mapboxgl.Popup({ offset: 20, closeButton: true });
        popup.on('open', function () {
            var lv = _liveVehicles[vehicleId];
            if (!lv) return;
            popup.setHTML(
                '<strong>📡 Live: ' + _escapeHtml(vehicleId) + '</strong>' +
                '<br>Speed: ' + Math.round(lv.speed || 0) + ' mph' +
                '<br>Heading: ' + Math.round(lv.heading || 0) + '°' +
                '<br><span style="color:#6B7280;font-size:11px;">' +
                'Last update: ' + new Date(lv.lastUpdate).toLocaleTimeString() + '</span>'
            );
        });

        var marker = new mapboxgl.Marker({ element: el })
            .setLngLat([data.lng, data.lat])
            .setPopup(popup)
            .addTo(map);

        _liveVehicles[vehicleId] = {
            marker: marker,
            el: el,
            speed: data.speed || 0,
            heading: data.heading || 0,
            lastUpdate: data.timestamp || new Date().toISOString(),
            trail: [{ lat: data.lat, lng: data.lng, t: Date.now() }]
        };

        // Add trail line source
        _addTrailSource(vehicleId, data);

        console.log('[LiveTracking] New live vehicle: ' + vehicleId);
    }

    // ── Update existing live vehicle ──
    function _updateLiveVehicle(vehicleId, data) {
        var lv = _liveVehicles[vehicleId];
        if (!lv) return;
        lv.marker.setLngLat([data.lng, data.lat]);
        lv.speed = data.speed || 0;
        lv.heading = data.heading || 0;
        lv.lastUpdate = data.timestamp || new Date().toISOString();
        _recordTrail(vehicleId, data);
    }

    // ── Trail / Breadcrumb Tracking ──
    function _recordTrail(vehicleId, data) {
        var lv = _liveVehicles[vehicleId];
        if (!lv) {
            // Create trail record for simulated vehicles too
            _liveVehicles[vehicleId] = {
                marker: null,
                trail: [],
                speed: data.speed,
                heading: data.heading,
                lastUpdate: data.timestamp
            };
            lv = _liveVehicles[vehicleId];
        }
        lv.trail.push({ lat: data.lat, lng: data.lng, t: Date.now() });
        if (lv.trail.length > _trailMaxPoints) {
            lv.trail.shift();
        }
        _updateTrailLine(vehicleId);
    }

    function _addTrailSource(vehicleId, data) {
        if (typeof map === 'undefined') return;
        var srcId = 'trail-' + vehicleId;
        if (map.getSource(srcId)) return;
        map.addSource(srcId, {
            type: 'geojson',
            data: {
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: [[data.lng, data.lat]]
                }
            }
        });
        map.addLayer({
            id: 'trail-line-' + vehicleId,
            type: 'line',
            source: srcId,
            paint: {
                'line-color': '#10B981',
                'line-width': 2,
                'line-opacity': 0.6,
                'line-dasharray': [2, 2]
            }
        });
    }

    function _updateTrailLine(vehicleId) {
        if (typeof map === 'undefined') return;
        var srcId = 'trail-' + vehicleId;
        var src = map.getSource(srcId);
        if (!src) return;
        var lv = _liveVehicles[vehicleId];
        var coords = lv.trail.map(function (p) { return [p.lng, p.lat]; });
        src.setData({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: coords }
        });
    }

    // ── Trip Lifecycle ──
    function _handleTripStart(data) {
        var vehicleId = data.vehicleId || BouncieClient.getVehicleId(data.deviceId);
        console.log('[LiveTracking] Trip started: ' + vehicleId);
        // Add alert to feed if available
        if (typeof addAlert === 'function') {
            addAlert({
                icon: '📡',
                color: 'green',
                msg: 'Live trip started — ' + _escapeHtml(vehicleId)
            });
        }
    }

    function _handleTripEnd(data) {
        var vehicleId = data.vehicleId || BouncieClient.getVehicleId(data.deviceId);
        console.log('[LiveTracking] Trip ended: ' + vehicleId);
        if (typeof addAlert === 'function') {
            var stats = '';
            if (data.distance) stats += ' · ' + data.distance.toFixed(1) + ' mi';
            if (data.avgSpeed) stats += ' · Avg ' + Math.round(data.avgSpeed) + ' mph';
            addAlert({
                icon: '📡',
                color: 'teal',
                msg: 'Live trip ended — ' + _escapeHtml(vehicleId) + stats
            });
        }
    }

    // ── Vehicle Metrics (OBD data) ──
    function _handleMetrics(data) {
        var vehicleId = data.vehicleId || BouncieClient.getVehicleId(data.deviceId);
        var lv = _liveVehicles[vehicleId];
        if (!lv) return;
        lv.rpm = data.rpm;
        lv.fuelLevel = data.fuelLevel;
        lv.coolantTemp = data.coolantTemp;
        lv.batteryVoltage = data.batteryVoltage;
        lv.dtcCodes = data.dtcCodes;
    }

    // ── Connection Status UI ──
    function _handleConnection(data) {
        _updateStatusUI(data.status);
    }

    function _createStatusUI() {
        var container = document.getElementById('map');
        if (!container) return;
        _statusEl = document.createElement('div');
        _statusEl.id = 'live-tracking-status';
        _statusEl.style.cssText = 'position:absolute;top:10px;left:50%;transform:translateX(-50%);' +
            'z-index:5;background:rgba(17,24,39,0.92);backdrop-filter:blur(8px);' +
            'padding:6px 14px;border-radius:8px;font-size:12px;color:#9CA3AF;' +
            'border:1px solid #374151;display:flex;align-items:center;gap:8px;' +
            'font-family:Inter,system-ui,sans-serif;';
        _updateStatusUI();
        container.appendChild(_statusEl);
    }

    function _updateStatusUI(status) {
        if (!_statusEl) return;
        var modeLabel = {
            simulation: 'Simulation',
            live: 'Live (Bouncie)',
            hybrid: 'Hybrid'
        }[_mode] || _mode;

        var dotColor = '#6B7280';
        var statusText = 'Idle';
        if (status === 'connected' || BouncieClient.isConnected()) {
            dotColor = '#10B981';
            statusText = 'Connected';
        } else if (status === 'disconnected') {
            dotColor = '#EF4444';
            statusText = 'Disconnected';
        } else if (status === 'simulating' || _mode === 'simulation') {
            dotColor = '#F59E0B';
            statusText = 'Simulating';
        }

        _statusEl.innerHTML =
            '<span style="width:8px;height:8px;border-radius:50%;background:' + dotColor + ';display:inline-block;"></span>' +
            '<span>' + modeLabel + '</span>' +
            '<span style="color:#4B5563;">·</span>' +
            '<span style="color:' + dotColor + ';">' + statusText + '</span>';
    }

    // ── Get live data for a vehicle ──
    function getVehicleData(vehicleId) {
        return _liveVehicles[vehicleId] || null;
    }

    function getTrail(vehicleId) {
        var lv = _liveVehicles[vehicleId];
        return lv ? lv.trail : [];
    }

    // ── Utility ──
    function _escapeHtml(str) {
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    // ── Public API ──
    return {
        init: init,
        setMode: setMode,
        getVehicleData: getVehicleData,
        getTrail: getTrail,
        isActive: function () { return _active; },
        getMode: function () { return _mode; }
    };

})();
