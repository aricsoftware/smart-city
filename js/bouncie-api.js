'use strict';

// ══════════════════════════════════════════════════════════════
// Bouncie API Client — Browser-side WebSocket + REST helpers
// ══════════════════════════════════════════════════════════════
// Manages the WebSocket connection to the relay server and
// exposes a simple event-driven API for the dashboard.
//
// Depends on: nothing (standalone module)
// Consumed by: js/live-tracking.js
// ══════════════════════════════════════════════════════════════

var BouncieClient = (function () {

    // ── Configuration (defaults to local dev relay) ──
    var _config = {
        wsUrl: 'ws://localhost:3001/ws',
        relayUrl: 'http://localhost:3001',
        reconnectDelay: 3000,      // ms between reconnect attempts
        maxReconnectDelay: 30000,  // max backoff ceiling
        simulateInterval: 3000    // ms between simulated positions (test mode)
    };

    // ── State ──
    var _ws = null;
    var _reconnectTimer = null;
    var _reconnectAttempts = 0;
    var _connected = false;
    var _listeners = {};       // { eventType: [callback, ...] }
    var _simulateTimer = null;
    var _deviceMap = {};       // deviceId → vehicleId mapping

    // ── Event Emitter ──
    function on(eventType, callback) {
        if (!_listeners[eventType]) _listeners[eventType] = [];
        _listeners[eventType].push(callback);
    }

    function off(eventType, callback) {
        if (!_listeners[eventType]) return;
        _listeners[eventType] = _listeners[eventType].filter(function (cb) {
            return cb !== callback;
        });
    }

    function _emit(eventType, data) {
        var cbs = _listeners[eventType] || [];
        for (var i = 0; i < cbs.length; i++) {
            try { cbs[i](data); } catch (e) { console.error('[BouncieClient]', e); }
        }
        // Also emit on wildcard '*'
        var wcbs = _listeners['*'] || [];
        for (var j = 0; j < wcbs.length; j++) {
            try { wcbs[j](data); } catch (e) { console.error('[BouncieClient]', e); }
        }
    }

    // ── WebSocket Connection ──
    function connect(wsUrl) {
        if (wsUrl) _config.wsUrl = wsUrl;
        if (_ws) {
            try { _ws.close(); } catch (e) {}
        }
        _ws = new WebSocket(_config.wsUrl);

        _ws.onopen = function () {
            _connected = true;
            _reconnectAttempts = 0;
            console.log('[BouncieClient] WebSocket connected');
            _emit('connection', { status: 'connected' });
        };

        _ws.onmessage = function (event) {
            var data;
            try { data = JSON.parse(event.data); } catch (e) { return; }
            _emit(data.eventType || 'unknown', data);
        };

        _ws.onclose = function () {
            _connected = false;
            console.log('[BouncieClient] WebSocket disconnected');
            _emit('connection', { status: 'disconnected' });
            _scheduleReconnect();
        };

        _ws.onerror = function () {
            // onclose will fire after this
        };
    }

    function disconnect() {
        clearTimeout(_reconnectTimer);
        _reconnectTimer = null;
        if (_ws) {
            try { _ws.close(); } catch (e) {}
            _ws = null;
        }
        _connected = false;
    }

    function _scheduleReconnect() {
        if (_reconnectTimer) return;
        _reconnectAttempts++;
        var delay = Math.min(
            _config.reconnectDelay * Math.pow(1.5, _reconnectAttempts - 1),
            _config.maxReconnectDelay
        );
        console.log('[BouncieClient] Reconnecting in ' + Math.round(delay / 1000) + 's...');
        _reconnectTimer = setTimeout(function () {
            _reconnectTimer = null;
            connect();
        }, delay);
    }

    // ── Device → Vehicle ID Mapping ──
    function mapDevice(deviceId, vehicleId) {
        _deviceMap[deviceId] = vehicleId;
    }

    function getVehicleId(deviceId) {
        return _deviceMap[deviceId] || deviceId;
    }

    // ── Simulation Mode (test without real device) ──
    function startSimulation(routes) {
        if (_simulateTimer) return;
        // routes: { vehicleId: { route: [[lat,lng],...], type: 'police'|'ambulance'|'bus' } }
        var routeKeys = Object.keys(routes);
        var indices = {};
        var progress = {};
        routeKeys.forEach(function (id) {
            indices[id] = 0;
            progress[id] = 0;
        });

        _simulateTimer = setInterval(function () {
            routeKeys.forEach(function (id) {
                var r = routes[id];
                var route = r.route;
                if (!route || route.length < 2) return;

                progress[id] += 0.05 + Math.random() * 0.05;
                if (progress[id] >= 1) {
                    progress[id] = 0;
                    indices[id] = (indices[id] + 1) % route.length;
                }

                var from = route[indices[id]];
                var to = route[(indices[id] + 1) % route.length];
                var t = progress[id];
                var lat = from[0] + (to[0] - from[0]) * t;
                var lng = from[1] + (to[1] - from[1]) * t;

                // Compute simulated speed
                var dlat = to[0] - from[0];
                var dlng = to[1] - from[1];
                var segDist = Math.sqrt(dlat * dlat + dlng * dlng) * 69.0;
                var speed = Math.round(segDist / ((_config.simulateInterval / 1000) / 3600) * (0.03 + Math.random() * 0.02));
                speed = Math.min(speed, 65); // cap at 65 mph

                var heading = Math.atan2(dlng, dlat) * (180 / Math.PI);
                if (heading < 0) heading += 360;

                _emit('position', {
                    eventType: 'position',
                    source: 'simulation',
                    deviceId: id,
                    vehicleId: id,
                    timestamp: new Date().toISOString(),
                    lat: lat,
                    lng: lng,
                    speed: speed,
                    heading: Math.round(heading),
                    altitude: 0
                });
            });
        }, _config.simulateInterval);

        console.log('[BouncieClient] Simulation started for', routeKeys.length, 'vehicles');
        _emit('connection', { status: 'simulating' });
    }

    function stopSimulation() {
        if (_simulateTimer) {
            clearInterval(_simulateTimer);
            _simulateTimer = null;
            console.log('[BouncieClient] Simulation stopped');
        }
    }

    // ── Health Check ──
    function checkHealth(callback) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', _config.relayUrl + '/health', true);
        xhr.onload = function () {
            if (xhr.status === 200) {
                try { callback(null, JSON.parse(xhr.responseText)); } catch (e) { callback(e); }
            } else {
                callback(new Error('Health check failed: ' + xhr.status));
            }
        };
        xhr.onerror = function () { callback(new Error('Health check unreachable')); };
        xhr.send();
    }

    // ── Public API ──
    return {
        config: _config,
        connect: connect,
        disconnect: disconnect,
        on: on,
        off: off,
        mapDevice: mapDevice,
        getVehicleId: getVehicleId,
        startSimulation: startSimulation,
        stopSimulation: stopSimulation,
        checkHealth: checkHealth,
        isConnected: function () { return _connected; }
    };

})();
