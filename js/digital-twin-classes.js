'use strict';

var DT = {}; // Global Digital Twin namespace

// ══ DigitalTwinBase ══════════════════════════════════════════
class DigitalTwinBase {
    constructor(config) {
        this.id            = config.id            || '';
        this.label         = config.label         || '';
        this.type          = config.type          || '';
        // Observable state
        this.speed         = 0;                    // mph (0 = stationary / unknown)
        this.statusText    = config.statusText    || 'Idle';
        this.badgeText     = config.badgeText     || '';
        this.badgeColor    = config.badgeColor    || '#6B7280';
        // Asset / display
        this.iconEmoji     = config.iconEmoji     || '📍';
        this.glbFile       = config.glbFile       || null;
        this.glbTargetSize = config.glbTargetSize || 3;
        // Geospatial position (lat/lng)
        this.position      = { lat: 0, lng: 0 };
        // Three.js scene object — set after addToScene()
        this._scene3d      = null;
        // Simulated path — replaced by real telemetry later
        this._route         = config.route || [];
        this._routeIndex    = 0;
        this._routeProgress = 0;
    }

    // Returns a THREE.Group (procedural geometry). Delegates to DT registry.
    build() { return DT._build(this.type); }

    // Apply livery / materials to a loaded GLTF model. Delegates to DT registry.
    applyLivery(model) { DT._applyLivery(this.type, model); }

    // Load GLTF (with procedural fallback) and add to Three.js scene.
    addToScene(scene, glbLoader, doneCallback) {
        if (this.glbFile) {
            glbLoader.load(
                this.glbFile,
                (gltf) => {
                    const model = DT._addGLTFModel(gltf, this.glbTargetSize);
                    this.applyLivery(model);
                    this._scene3d = model;
                    scene.add(model);
                    if (doneCallback) doneCallback(model);
                },
                undefined,
                (err) => {
                    console.warn('[DT] GLTF load failed, procedural fallback:', err);
                    const model = this.build();
                    this._scene3d = model;
                    scene.add(model);
                    if (doneCallback) doneCallback(model);
                }
            );
        } else {
            const model = this.build();
            this._scene3d = model;
            scene.add(model);
            if (doneCallback) doneCallback(model);
        }
    }

    // Advance simulated route by one animation tick.
    // Always called even when speed = 0 so position tracking is continuous.
    // Returns { lat, lng } or null if no route is defined.
    tickSimulation(ticksPerSegment) {
        if (!this._route || this._route.length < 2) { this.speed = 0; return null; }
        this._routeProgress += 1 / ticksPerSegment;
        if (this._routeProgress >= 1) {
            this._routeProgress = 0;
            this._routeIndex = (this._routeIndex + 1) % this._route.length;
        }
        const from = this._route[this._routeIndex];
        const to   = this._route[(this._routeIndex + 1) % this._route.length];
        const lat  = from[0] + (to[0] - from[0]) * this._routeProgress;
        const lng  = from[1] + (to[1] - from[1]) * this._routeProgress;
        // Approximate speed: segment distance in miles / segment duration in hours
        const dlat = to[0] - from[0], dlng = to[1] - from[1];
        const segDistMi = Math.sqrt(dlat * dlat + dlng * dlng) * 69.0;
        const segTimeHr = (30000 / 1000) / 3600; // WAYPOINT_DURATION ms → hours
        this.speed    = Math.round(segDistMi / segTimeHr);
        this.position = { lat, lng };
        return { lat, lng };
    }

    // Returns the HTML string for the Digital Twin info bar.
    renderInfoHTML() {
        const bc = this.badgeColor;
        return '<span><span class="dt-badge" style="background:' + bc + '22;color:' + bc + ';border:1px solid ' + bc + '44;">' + this.badgeText + '</span></span>' +
               '<span><i class="fa-solid fa-circle" style="font-size:7px;color:' + bc + '"></i>\u00a0' + this.statusText + '</span>' +
               '<span><i class="fa-solid fa-gauge-high" style="font-size:9px"></i>\u00a0' + Math.round(this.speed) + ' mph</span>' +
               '<span style="margin-left:auto;color:#6B7280;"><i class="fa-solid fa-arrows-rotate"></i> Drag \u00b7 Scroll</span>';
    }
}

// ══ Vehicle ══════════════════════════════════════════════════
class Vehicle extends DigitalTwinBase {
    constructor(config) {
        super(config);
        this.mapMarker = null;  // mapboxgl.Marker — set by app.js
        this._markerEl = null;  // DOM element for the marker
    }

    _popupHTML() {
        const bc = this.badgeColor;
        return '<strong>' + this.iconEmoji + ' ' + this.label + '</strong>' +
               '<br><span style="display:inline-block;padding:1px 6px;border-radius:4px;font-size:11px;background:' + bc + '22;color:' + bc + ';border:1px solid ' + bc + '44;">' + this.badgeText + '</span>' +
               '<br>Status: ' + this.statusText +
               '<br>Speed: ' + Math.round(this.speed || 0) + ' mph';
    }

    updateMapPosition(lat, lng) {
        if (this.mapMarker) this.mapMarker.setLngLat([lng, lat]);
    }

    // Advance simulation and update the Mapbox marker in one call.
    tick(ticksPerSegment) {
        const pos = this.tickSimulation(ticksPerSegment);
        if (pos) this.updateMapPosition(pos.lat, pos.lng);
        return pos;
    }
}

// ══ PoliceCar ════════════════════════════════════════════════
class PoliceCar extends Vehicle {
    constructor(config) {
        config.type          = 'police';
        config.badgeText     = config.badgeText   || 'APD';
        config.badgeColor    = config.badgeColor  || '#2563EB';
        config.statusText    = config.statusText  || 'Patrolling';
        config.iconEmoji     = '🚔';
        config.glbFile       = 'models/police-car.glb';
        config.glbTargetSize = 3;
        super(config);
    }
}

// ══ Ambulance ════════════════════════════════════════════════
class Ambulance extends Vehicle {
    constructor(config) {
        config.type          = 'ambulance';
        config.badgeText     = config.badgeText   || 'EMS';
        config.badgeColor    = config.badgeColor  || '#DC2626';
        config.statusText    = config.statusText  || 'En Route';
        config.iconEmoji     = '🚑';
        config.glbFile       = 'models/ambulance_optimized.glb';
        config.glbTargetSize = 3;
        super(config);
    }
}

// ══ SchoolBus ════════════════════════════════════════════════
class SchoolBus extends Vehicle {
    constructor(config) {
        config.type          = 'bus';
        config.badgeText     = config.badgeText   || 'SCHOOL BUS';
        config.badgeColor    = config.badgeColor  || '#D97706';
        config.statusText    = config.statusText  || 'Active Route';
        config.iconEmoji     = '🚌';
        config.glbFile       = 'models/school-bus.glb';
        config.glbTargetSize = 3;
        super(config);
    }

    // Override addToScene: bus livery requires async PBR texture loading.
    addToScene(scene, glbLoader, doneCallback) {
        if (this.glbFile) {
            glbLoader.load(
                this.glbFile,
                (gltf) => {
                    const model = DT._addGLTFModel(gltf, this.glbTargetSize);
                    DT._loadBusTextures((textures) => {
                        DT._applyBusLivery(model, textures);
                        this._scene3d = model;
                        scene.add(model);
                        if (doneCallback) doneCallback(model);
                    });
                },
                undefined,
                (err) => {
                    console.warn('[DT] Bus GLTF failed, procedural fallback:', err);
                    const model = this.build();
                    this._scene3d = model;
                    scene.add(model);
                    if (doneCallback) doneCallback(model);
                }
            );
        } else {
            const model = this.build();
            this._scene3d = model;
            scene.add(model);
            if (doneCallback) doneCallback(model);
        }
    }
}

// ══ CityBus ══════════════════════════════════════════════════
class CityBus extends Vehicle {
    constructor(config) {
        config.type          = 'citybus';
        config.badgeText     = config.badgeText   || 'MARTA';
        config.badgeColor    = config.badgeColor  || '#0891B2';
        config.statusText    = config.statusText  || 'In Service';
        config.iconEmoji     = '🚍';
        config.glbFile       = 'models/city-bus.glb';
        config.glbTargetSize = 3;
        super(config);
    }

    // Override: correct Z-up OBJ export orientation so wheels sit on the ground.
    addToScene(scene, glbLoader, doneCallback) {
        if (this.glbFile) {
            glbLoader.load(
                this.glbFile,
                (gltf) => {
                    const model = DT._addGLTFModel(gltf, this.glbTargetSize);
                    // 3ds Max Z-up → Y-up correction
                    model.rotation.x = -Math.PI / 2;
                    model.updateMatrixWorld(true);
                    var box = new THREE.Box3().setFromObject(model);
                    var center = box.getCenter(new THREE.Vector3());
                    model.position.sub(center);
                    model.position.y += box.getSize(new THREE.Vector3()).y / 2;
                    this._scene3d = model;
                    scene.add(model);
                    if (doneCallback) doneCallback(model);
                },
                undefined,
                (err) => {
                    console.warn('[DT] City bus GLTF failed, procedural fallback:', err);
                    const model = this.build();
                    this._scene3d = model;
                    scene.add(model);
                    if (doneCallback) doneCallback(model);
                }
            );
        } else {
            const model = this.build();
            this._scene3d = model;
            scene.add(model);
            if (doneCallback) doneCallback(model);
        }
    }
}

// ══ FireTruckApparatus (Pumper) ═══════════════════════════════
class FireTruckApparatus extends Vehicle {
    constructor(config) {
        config.type          = 'firetruck';
        config.badgeText     = config.badgeText   || 'AFD';
        config.badgeColor    = config.badgeColor  || '#E11D48';
        config.statusText    = config.statusText  || 'On Call';
        config.iconEmoji     = '🚒';
        config.glbFile       = 'models/fire_truck_apparatus.glb';
        config.glbTargetSize = 3;
        super(config);
    }

    // Override: correct Z-up OBJ export orientation.
    addToScene(scene, glbLoader, doneCallback) {
        if (this.glbFile) {
            glbLoader.load(
                this.glbFile,
                (gltf) => {
                    const model = DT._addGLTFModel(gltf, this.glbTargetSize);
                    model.rotation.x = -Math.PI / 2;
                    model.updateMatrixWorld(true);
                    var box = new THREE.Box3().setFromObject(model);
                    var center = box.getCenter(new THREE.Vector3());
                    model.position.sub(center);
                    model.position.y += box.getSize(new THREE.Vector3()).y / 2;
                    this._scene3d = model;
                    scene.add(model);
                    if (doneCallback) doneCallback(model);
                },
                undefined,
                (err) => {
                    console.warn('[DT] Fire Truck Apparatus GLTF failed, procedural fallback:', err);
                    const model = this.build();
                    this._scene3d = model;
                    scene.add(model);
                    if (doneCallback) doneCallback(model);
                }
            );
        } else {
            const model = this.build();
            this._scene3d = model;
            scene.add(model);
            if (doneCallback) doneCallback(model);
        }
    }
}

// ══ LadderFireTruck (Seagrave) ═══════════════════════════════
class LadderFireTruck extends Vehicle {
    constructor(config) {
        config.type          = 'laddertruck';
        config.badgeText     = config.badgeText   || 'AFD LADDER';
        config.badgeColor    = config.badgeColor  || '#BE123C';
        config.statusText    = config.statusText  || 'On Call';
        config.iconEmoji     = '🚒';
        config.glbFile       = 'models/seagrave_ladder_fire_truck.glb';
        config.glbTargetSize = 3;
        super(config);
    }

    // Override: correct Z-up OBJ export orientation.
    addToScene(scene, glbLoader, doneCallback) {
        if (this.glbFile) {
            glbLoader.load(
                this.glbFile,
                (gltf) => {
                    const model = DT._addGLTFModel(gltf, this.glbTargetSize);
                    model.rotation.x = -Math.PI / 2;
                    model.updateMatrixWorld(true);
                    var box = new THREE.Box3().setFromObject(model);
                    var center = box.getCenter(new THREE.Vector3());
                    model.position.sub(center);
                    model.position.y += box.getSize(new THREE.Vector3()).y / 2;
                    this._scene3d = model;
                    scene.add(model);
                    if (doneCallback) doneCallback(model);
                },
                undefined,
                (err) => {
                    console.warn('[DT] Ladder Fire Truck GLTF failed, procedural fallback:', err);
                    const model = this.build();
                    this._scene3d = model;
                    scene.add(model);
                    if (doneCallback) doneCallback(model);
                }
            );
        } else {
            const model = this.build();
            this._scene3d = model;
            scene.add(model);
            if (doneCallback) doneCallback(model);
        }
    }
}

// Register classes on DT namespace
DT.DigitalTwinBase      = DigitalTwinBase;
DT.Vehicle              = Vehicle;
DT.PoliceCar            = PoliceCar;
DT.Ambulance            = Ambulance;
DT.SchoolBus            = SchoolBus;
DT.CityBus              = CityBus;
DT.FireTruckApparatus   = FireTruckApparatus;
DT.LadderFireTruck      = LadderFireTruck;

// Stubs — replaced by the Three.js IIFE once it initialises
DT._build           = function(type)         { return null; };
DT._applyLivery     = function(type, model)  {};
DT._addGLTFModel    = function(gltf, sz)     { return gltf.scene; };
DT._loadBusTextures = function(cb)           { cb({}); };
DT._applyBusLivery  = function(model, tex)   {};
