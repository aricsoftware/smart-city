'use strict';

// ══════════════════════════════════════════════════════════════
// MARTA Live Bus Tracking
// ══════════════════════════════════════════════════════════════
// Polls the MARTA real-time bus API (via the relay proxy) and
// renders actual bus positions on the Mapbox map.
//
// Depends on: mapboxgl, map (app.js), makeVehicleMarkerEl (app.js)
// Usage: MartaTracking.init({ relayUrl: 'http://localhost:3001' });
// ══════════════════════════════════════════════════════════════

var MartaTracking = (function () {

    var _relayUrl = 'http://localhost:3001';
    var _pollInterval = 15000;   // ms — MARTA updates ~every 30 s
    var _pollTimer = null;
    var _markers = {};           // vehicleId → { marker, el, data }
    var _trailSources = {};      // vehicleId → added to map
    var _trails = {};            // vehicleId → [[lng,lat], ...]
    var _trailMax = 60;
    var _active = false;
    var _statusEl = null;
    var _errorCount = 0;

    // Route → colour for marker ring colour variety
    var _routeColourCache = {};
    var _palette = [
        '#10B981','#3B82F6','#F59E0B','#8B5CF6',
        '#EF4444','#06B6D4','#84CC16','#F97316'
    ];
    function _routeColour(route) {
        if (!_routeColourCache[route]) {
            var idx = Object.keys(_routeColourCache).length % _palette.length;
            _routeColourCache[route] = _palette[idx];
        }
        return _routeColourCache[route];
    }

    // ── Public: init ──────────────────────────────────────────
    function init(options) {
        options = options || {};
        if (options.relayUrl) _relayUrl = options.relayUrl;
        if (options.pollInterval) _pollInterval = options.pollInterval;

        _createStatusUI();
        _setStatus('connecting');

        // Wait for the Mapbox map to be ready before first poll
        if (typeof map !== 'undefined' && map.loaded()) {
            _poll();
        } else if (typeof map !== 'undefined') {
            map.once('load', _poll);
        } else {
            // Fallback: try after a short delay
            setTimeout(_poll, 2000);
        }
    }

    // ── Stop ─────────────────────────────────────────────────
    function stop() {
        clearInterval(_pollTimer);
        _pollTimer = null;
        _active = false;
        _setStatus('stopped');
    }

    // ── Poll the relay proxy ──────────────────────────────────
    function _poll() {
        _active = true;
        _fetchBuses();

        clearInterval(_pollTimer);
        _pollTimer = setInterval(_fetchBuses, _pollInterval);
    }

    function _fetchBuses() {
        var url = _relayUrl + '/marta/buses';
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.timeout = 10000;

        xhr.onload = function () {
            if (xhr.status === 200) {
                _errorCount = 0;
                try {
                    var buses = JSON.parse(xhr.responseText);
                    _processBuses(buses);
                    _setStatus('live', buses.length);
                } catch (e) {
                    console.error('[MartaTracking] JSON parse error:', e);
                    _errorCount++;
                    _setStatus('error');
                }
            } else {
                console.warn('[MartaTracking] HTTP', xhr.status);
                _errorCount++;
                _setStatus('error');
            }
        };
        xhr.onerror = xhr.ontimeout = function () {
            _errorCount++;
            console.warn('[MartaTracking] Fetch failed (attempt ' + _errorCount + ')');
            _setStatus('error');
        };
        xhr.send();
    }

    // ── Process bus array from MARTA API ─────────────────────
    // MARTA fields: VEHICLE, ROUTE, DIRECTION, LATITUDE, LONGITUDE,
    //               MSGTIME, ADHERENCE, ADHERENCE_DESCRIPTION
    function _processBuses(buses) {
        if (!Array.isArray(buses)) return;

        var seen = {};

        buses.forEach(function (bus) {
            var id = 'marta-' + bus.VEHICLE;
            var lat = parseFloat(bus.LATITUDE);
            var lng = parseFloat(bus.LONGITUDE);
            if (!lat || !lng || isNaN(lat) || isNaN(lng)) return;

            seen[id] = true;

            if (_markers[id]) {
                _updateBus(id, lat, lng, bus);
            } else {
                _addBus(id, lat, lng, bus);
            }
        });

        // Remove markers for buses no longer in the feed
        Object.keys(_markers).forEach(function (id) {
            if (!seen[id]) {
                _removeBus(id);
            }
        });
    }

    // ── Add a new bus marker ──────────────────────────────────
    function _addBus(id, lat, lng, bus) {
        if (typeof mapboxgl === 'undefined' || typeof map === 'undefined') return;

        var colour = _routeColour(bus.ROUTE);
        var el = document.createElement('div');
        el.style.cssText =
            'background:' + colour + ';' +
            'width:28px;height:28px;border-radius:50%;' +
            'display:flex;align-items:center;justify-content:center;' +
            'border:2px solid ' + colour + 'CC;' +
            'box-shadow:0 0 10px ' + colour + '77;' +
            'font-size:14px;line-height:1;cursor:pointer;' +
            'transition:transform 0.3s;';
        el.textContent = '🚌';
        el.title = 'MARTA ' + bus.ROUTE + ' — Bus ' + bus.VEHICLE;

        var popup = new mapboxgl.Popup({ offset: 18, closeButton: true });
        popup.on('open', function () {
            var m = _markers[id];
            if (!m) return;
            var d = m.data;
            var adColour = d.ADHERENCE >= 0 ? '#10B981' : '#EF4444';
            var adLabel = d.ADHERENCE_DESCRIPTION || (d.ADHERENCE >= 0 ? 'On time' : 'Late');
            popup.setHTML(
                '<div style="font-family:Inter,system-ui,sans-serif;min-width:180px;">' +
                '<div style="font-weight:600;font-size:13px;margin-bottom:4px;">🚌 MARTA Route ' + _escapeHtml(d.ROUTE) + '</div>' +
                '<div style="color:#9CA3AF;font-size:11px;">Bus #' + _escapeHtml(d.VEHICLE) + ' · ' + _escapeHtml(d.DIRECTION) + '</div>' +
                '<div style="margin-top:6px;font-size:12px;">Adherence: <span style="color:' + adColour + ';">' + _escapeHtml(adLabel) + '</span></div>' +
                '<div style="font-size:11px;color:#6B7280;margin-top:2px;">Updated: ' + _escapeHtml(d.MSGTIME || '') + '</div>' +
                '</div>'
            );
        });

        var marker = new mapboxgl.Marker({ element: el })
            .setLngLat([lng, lat])
            .setPopup(popup)
            .addTo(map);

        _markers[id] = { marker: marker, el: el, data: bus };
        _initTrail(id, lat, lng, _routeColour(bus.ROUTE));
    }

    // ── Update existing bus marker ────────────────────────────
    function _updateBus(id, lat, lng, bus) {
        var m = _markers[id];
        if (!m) return;
        m.marker.setLngLat([lng, lat]);
        m.data = bus;
        _appendTrail(id, lat, lng);
    }

    // ── Remove a bus that dropped out of the feed ─────────────
    function _removeBus(id) {
        var m = _markers[id];
        if (!m) return;
        m.marker.remove();
        delete _markers[id];
        // Remove trail layer/source
        if (_trailSources[id]) {
            try {
                if (map.getLayer('marta-trail-' + id)) map.removeLayer('marta-trail-' + id);
                if (map.getSource('marta-trail-' + id)) map.removeSource('marta-trail-' + id);
            } catch (e) {}
            delete _trailSources[id];
        }
        delete _trails[id];
    }

    // ── Trail helpers ─────────────────────────────────────────
    function _initTrail(id, lat, lng, colour) {
        if (typeof map === 'undefined') return;
        var srcId = 'marta-trail-' + id;
        _trails[id] = [[lng, lat]];

        if (map.getSource(srcId)) return;  // already added
        map.addSource(srcId, {
            type: 'geojson',
            data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [[lng, lat]] } }
        });
        map.addLayer({
            id: 'marta-trail-' + id,
            type: 'line',
            source: srcId,
            paint: {
                'line-color': colour,
                'line-width': 1.5,
                'line-opacity': 0.5,
                'line-dasharray': [2, 3]
            }
        });
        _trailSources[id] = true;
    }

    function _appendTrail(id, lat, lng) {
        if (!_trails[id]) { _trails[id] = []; }
        _trails[id].push([lng, lat]);
        if (_trails[id].length > _trailMax) _trails[id].shift();

        if (!map) return;
        var src = map.getSource('marta-trail-' + id);
        if (src) {
            src.setData({
                type: 'Feature',
                geometry: { type: 'LineString', coordinates: _trails[id] }
            });
        }
    }

    // ── Status UI ─────────────────────────────────────────────
    function _createStatusUI() {
        var container = document.getElementById('map');
        if (!container) return;

        // Avoid duplicate
        var existing = document.getElementById('marta-tracking-status');
        if (existing) { _statusEl = existing; return; }

        _statusEl = document.createElement('div');
        _statusEl.id = 'marta-tracking-status';
        _statusEl.style.cssText =
            'position:absolute;bottom:36px;left:10px;z-index:5;' +
            'background:rgba(17,24,39,0.92);backdrop-filter:blur(8px);' +
            'padding:6px 12px;border-radius:8px;font-size:11px;color:#9CA3AF;' +
            'border:1px solid #374151;display:flex;align-items:center;gap:8px;' +
            'font-family:Inter,system-ui,sans-serif;pointer-events:none;';
        container.appendChild(_statusEl);
    }

    function _setStatus(state, count) {
        if (!_statusEl) return;
        var dot, label;
        if (state === 'live') {
            dot = '#10B981';
            label = 'MARTA Live · ' + (count || 0) + ' buses';
        } else if (state === 'connecting') {
            dot = '#F59E0B';
            label = 'MARTA · Connecting…';
        } else if (state === 'error') {
            dot = '#EF4444';
            label = 'MARTA · Relay unavailable';
        } else {
            dot = '#6B7280';
            label = 'MARTA · Stopped';
        }
        _statusEl.innerHTML =
            '<span style="width:7px;height:7px;border-radius:50%;background:' + dot + ';display:inline-block;"></span>' +
            '<span>' + label + '</span>';
    }

    // ── Utility ───────────────────────────────────────────────
    function _escapeHtml(str) {
        var d = document.createElement('div');
        d.appendChild(document.createTextNode(String(str)));
        return d.innerHTML;
    }

    // ── Public API ────────────────────────────────────────────
    return {
        init: init,
        stop: stop,
        isActive: function () { return _active; },
        getBusCount: function () { return Object.keys(_markers).length; }
    };

})();
