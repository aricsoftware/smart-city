'use strict';

// ══════════════════════════════════════════════════════════════
// Bouncie Webhook → WebSocket Relay Server
// ══════════════════════════════════════════════════════════════
// Receives Bouncie webhook events via HTTP POST and broadcasts
// them to all connected dashboard clients over WebSocket.
// Also proxies the MARTA real-time bus API to avoid CORS.
//
// Usage:
//   BOUNCIE_WEBHOOK_SECRET=your_secret node server/relay.js
//
// Environment variables:
//   PORT                  — HTTP + WS port (default 3001)
//   BOUNCIE_WEBHOOK_SECRET — shared secret to validate webhooks
// ══════════════════════════════════════════════════════════════

const http = require('http');
const https = require('https');
const crypto = require('crypto');

// ── MARTA real-time bus API (public, no auth required) ───────
const MARTA_BUS_URL = 'https://developer.itsmarta.com/BRDRestService/RestBusQuerierService/GetAllBus';

function fetchMartaBuses(callback) {
    https.get(MARTA_BUS_URL, { headers: { 'Accept': 'application/json' } }, (resp) => {
        let raw = '';
        resp.on('data', (chunk) => { raw += chunk; });
        resp.on('end', () => {
            try {
                const buses = JSON.parse(raw);
                callback(null, buses);
            } catch (e) {
                callback(e, null);
            }
        });
    }).on('error', (e) => callback(e, null));
}

const PORT = parseInt(process.env.PORT, 10) || 3001;
const WEBHOOK_SECRET = process.env.BOUNCIE_WEBHOOK_SECRET || '';

// ── WebSocket (minimal RFC 6455 implementation — no deps) ────
const WS_MAGIC = '258EAFA5-E914-47DA-95CA-5AB5DC525DA1';
const wsClients = new Set();

function wsAccept(req, socket) {
    const key = req.headers['sec-websocket-key'];
    if (!key) { socket.destroy(); return; }
    const accept = crypto.createHash('sha1')
        .update(key + WS_MAGIC).digest('base64');
    socket.write(
        'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n'
    );
    wsClients.add(socket);
    console.log('[WS] Client connected (' + wsClients.size + ' total)');
    socket.on('close', () => { wsClients.delete(socket); });
    socket.on('error', () => { wsClients.delete(socket); });
    // Handle incoming frames (ping/pong, close)
    socket.on('data', (buf) => {
        if (buf.length < 2) return;
        const opcode = buf[0] & 0x0f;
        if (opcode === 0x8) { // close
            wsClients.delete(socket);
            socket.end();
        } else if (opcode === 0x9) { // ping → pong
            const pong = Buffer.from(buf);
            pong[0] = (pong[0] & 0xf0) | 0xa;
            socket.write(pong);
        }
    });
}

function wsBroadcast(jsonStr) {
    const payload = Buffer.from(jsonStr, 'utf8');
    const header = Buffer.alloc(payload.length < 126 ? 2 : 4);
    header[0] = 0x81; // FIN + text
    if (payload.length < 126) {
        header[1] = payload.length;
    } else {
        header[1] = 126;
        header.writeUInt16BE(payload.length, 2);
    }
    const frame = Buffer.concat([header, payload]);
    for (const s of wsClients) {
        try { s.write(frame); } catch (e) { wsClients.delete(s); }
    }
}

// ── Webhook signature validation ─────────────────────────────
function validateSignature(body, signature) {
    if (!WEBHOOK_SECRET) return true; // skip if no secret configured
    if (!signature) return false;
    const provided = String(signature).trim().replace(/^sha256=/i, '');
    const expected = crypto.createHmac('sha256', WEBHOOK_SECRET)
        .update(body).digest('hex');
    if (provided.length !== expected.length) return false;
    return crypto.timingSafeEqual(
        Buffer.from(provided, 'hex'),
        Buffer.from(expected, 'hex')
    );
}

// ── HTTP Server ──────────────────────────────────────────────
const server = http.createServer((req, res) => {
    // CORS headers for dashboard
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Bouncie-Signature');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // Health check
    if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'ok',
            clients: wsClients.size,
            uptime: process.uptime()
        }));
        return;
    }

    // Bouncie webhook endpoint
    if (req.method === 'POST' && req.url === '/webhook/bouncie') {
        let body = '';
        let bodySize = 0;
        const MAX_BODY = 1024 * 512; // 512 KB limit

        req.on('data', (chunk) => {
            bodySize += chunk.length;
            if (bodySize > MAX_BODY) {
                res.writeHead(413);
                res.end('Payload too large');
                req.destroy();
                return;
            }
            body += chunk;
        });

        req.on('end', () => {
            // Validate signature
            const sig = req.headers['x-bouncie-signature'] || '';
            if (WEBHOOK_SECRET && !validateSignature(body, sig)) {
                console.warn('[Webhook] Invalid signature — rejecting');
                res.writeHead(401);
                res.end('Invalid signature');
                return;
            }

            let data;
            try {
                data = JSON.parse(body);
            } catch (e) {
                res.writeHead(400);
                res.end('Invalid JSON');
                return;
            }

            // Normalize Bouncie event(s) into standard telemetry messages
            const telemetryEvents = normalizeBouncieEvents(data);
            telemetryEvents.forEach((telemetry) => {
                const msg = JSON.stringify(telemetry);
                wsBroadcast(msg);
                console.log('[Webhook] Broadcast to', wsClients.size, 'clients:', telemetry.eventType);
            });

            if (telemetryEvents.length === 0) {
                console.warn('[Webhook] No recognized telemetry in payload');
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ received: true, events: telemetryEvents.length }));
        });
        return;
    }

    // Simulated telemetry endpoint (for testing without a real Bouncie device)
    if (req.method === 'POST' && req.url === '/simulate') {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const msg = JSON.stringify(data);
                wsBroadcast(msg);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ broadcast: true, clients: wsClients.size }));
            } catch (e) {
                res.writeHead(400);
                res.end('Invalid JSON');
            }
        });
        return;
    }

    // MARTA real-time bus proxy — avoids browser CORS restrictions
    if (req.method === 'GET' && req.url === '/marta/buses') {
        fetchMartaBuses((err, buses) => {
            if (err) {
                console.error('[MARTA] Fetch error:', err.message);
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'MARTA API unavailable', detail: err.message }));
                return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(buses));
        });
        return;
    }

    res.writeHead(404);
    res.end('Not found');
});

// Handle WebSocket upgrade
server.on('upgrade', (req, socket, head) => {
    if (req.url === '/ws') {
        wsAccept(req, socket);
    } else {
        socket.destroy();
    }
});

// ── Bouncie Event Normalization ──────────────────────────────
function normalizeBouncieEvents(raw) {
    const payload = (raw && typeof raw === 'object' && raw.data) ? raw.data : raw;
    const candidates = Array.isArray(payload) ? payload : [payload];
    const out = [];

    candidates.forEach((item) => {
        const evt = normalizeBouncieEvent(item, raw);
        if (evt) out.push(evt);
    });

    return out;
}

function normalizeBouncieEvent(item, envelope) {
    if (!item || typeof item !== 'object') return null;

    const eventType = item.eventType || item.type || item.event ||
        (envelope && (envelope.eventType || envelope.type || envelope.event)) || 'unknown';

    const gps = item.gps || item.location || item.position || {};
    const lat = parseFloat(item.lat || item.latitude || gps.lat || gps.latitude || 0);
    const lng = parseFloat(item.lng || item.lon || item.longitude || gps.lng || gps.lon || gps.longitude || 0);
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);

    const deviceObj = item.device || {};
    const vehicleObj = item.vehicle || {};
    const deviceId = item.imei || item.deviceId || deviceObj.imei || deviceObj.id || item.transactionId || 'unknown';
    const vehicleId = item.vin || item.nickName || item.nickname || vehicleObj.vin || vehicleObj.name || null;
    const timestamp = item.timestamp || item.eventTime || item.createdAt || new Date().toISOString();

    // Position updates may come as tripData/tripUpdate, or without an explicit event type.
    if (eventType === 'tripData' || eventType === 'tripUpdate' || eventType === 'position' || hasCoords) {
        if (!hasCoords) return null;
        return {
            eventType: 'position',
            source: 'bouncie',
            deviceId: deviceId,
            vehicleId: vehicleId,
            timestamp: timestamp,
            lat: lat,
            lng: lng,
            speed: parseFloat(item.speed || gps.speed || 0),
            heading: parseFloat(item.heading || gps.heading || 0),
            altitude: parseFloat(gps.altitude || gps.alt || 0)
        };
    }

    if (eventType === 'tripStart') {
        return {
            eventType: 'tripStart',
            source: 'bouncie',
            deviceId: deviceId,
            vehicleId: vehicleId,
            timestamp: timestamp
        };
    }

    if (eventType === 'tripEnd') {
        const stats = item.stats || {};
        return {
            eventType: 'tripEnd',
            source: 'bouncie',
            deviceId: deviceId,
            vehicleId: vehicleId,
            timestamp: timestamp,
            distance: stats.distance || 0,
            avgSpeed: stats.avgSpeed || 0,
            maxSpeed: stats.maxSpeed || 0,
            hardBrakes: stats.hardBrakes || 0,
            hardAccels: stats.hardAccels || 0
        };
    }

    if (eventType === 'tripMetrics' || eventType === 'metrics') {
        return {
            eventType: 'metrics',
            source: 'bouncie',
            deviceId: deviceId,
            vehicleId: vehicleId,
            timestamp: timestamp,
            rpm: item.rpm || null,
            fuelLevel: item.fuelLevel || null,
            coolantTemp: item.coolantTemp || null,
            batteryVoltage: item.batteryVoltage || null,
            dtcCodes: item.dtcCodes || []
        };
    }

    return null;
}

// ── Start ────────────────────────────────────────────────────
server.listen(PORT, () => {
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║  Bouncie → WebSocket Relay Server           ║');
    console.log('╠══════════════════════════════════════════════╣');
    console.log('║  HTTP       : http://localhost:' + PORT + '          ║');
    console.log('║  WebSocket  : ws://localhost:' + PORT + '/ws        ║');
    console.log('║  Webhook    : POST /webhook/bouncie          ║');
    console.log('║  Simulate   : POST /simulate                 ║');
    console.log('║  Health     : GET  /health                   ║');
    console.log('╚══════════════════════════════════════════════╝');
    if (!WEBHOOK_SECRET) {
        console.warn('[WARN] No BOUNCIE_WEBHOOK_SECRET set — signature validation disabled');
    }
});
