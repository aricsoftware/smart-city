// ══════════════════════════════════════════
// DIGITAL TWIN — Three.js WebGL Viewer
// (no ES modules — uses global THREE)
// ══════════════════════════════════════════
(function() {
    'use strict';
    console.log('[DT] IIFE started');

    var dtSection = document.getElementById('dt-section');
    var dtCanvas  = document.getElementById('dt-canvas');
    var dtTitle   = document.getElementById('dt-title');
    var dtInfo    = document.getElementById('dt-info');
    var dtClose   = document.getElementById('dt-close');
    console.log('[DT] elements:', { section: !!dtSection, canvas: !!dtCanvas, title: !!dtTitle, close: !!dtClose });

    var dtScene, dtCamera, dtRenderer, dtAnimId;

    // ── Simple Orbit Controller (replaces OrbitControls) ──
    var orbit = { theta: 0.8, phi: 0.6, radius: 7, target: {x:0,y:0.5,z:0}, autoRotate: false, dragging: false, lastX: 0, lastY: 0 };

    function updateCameraFromOrbit() {
        var sp = Math.sin(orbit.phi);
        dtCamera.position.set(
            orbit.target.x + orbit.radius * sp * Math.sin(orbit.theta),
            orbit.target.y + orbit.radius * Math.cos(orbit.phi),
            orbit.target.z + orbit.radius * sp * Math.cos(orbit.theta)
        );
        dtCamera.lookAt(orbit.target.x, orbit.target.y, orbit.target.z);
    }

    function onPointerDown(e) { orbit.dragging = true; orbit.lastX = e.clientX; orbit.lastY = e.clientY; orbit.autoRotate = false; }
    function onPointerUp()    { orbit.dragging = false; }
    function onPointerMove(e) {
        if (!orbit.dragging) return;
        var dx = e.clientX - orbit.lastX, dy = e.clientY - orbit.lastY;
        orbit.theta -= dx * 0.008;
        orbit.phi = Math.max(0.15, Math.min(Math.PI - 0.15, orbit.phi + dy * 0.008));
        orbit.lastX = e.clientX; orbit.lastY = e.clientY;
    }
    function onWheel(e) {
        e.preventDefault();
        orbit.radius = Math.max(2, Math.min(15, orbit.radius + e.deltaY * 0.01));
    }
    // Touch support
    function onTouchStart(e) {
        if (e.touches.length === 1) {
            orbit.dragging = true;
            orbit.lastX = e.touches[0].clientX;
            orbit.lastY = e.touches[0].clientY;
            orbit.autoRotate = false;
            orbit.lastPinchDist = null;
        } else if (e.touches.length === 2) {
            orbit.dragging = false;
            orbit.autoRotate = true;
            var dx = e.touches[0].clientX - e.touches[1].clientX;
            var dy = e.touches[0].clientY - e.touches[1].clientY;
            orbit.lastPinchDist = Math.sqrt(dx * dx + dy * dy);
        }
    }
    function onTouchEnd()    { if (orbit.lastPinchDist !== null) orbit.autoRotate = true; orbit.dragging = false; orbit.lastPinchDist = null; }
    function onTouchMove(e)  {
        if (e.touches.length === 2) {
            e.preventDefault();
            var dx = e.touches[0].clientX - e.touches[1].clientX;
            var dy = e.touches[0].clientY - e.touches[1].clientY;
            var dist = Math.sqrt(dx * dx + dy * dy);
            if (orbit.lastPinchDist !== null) {
                var delta = orbit.lastPinchDist - dist; // positive = fingers together = zoom out
                orbit.radius = Math.max(2, Math.min(15, orbit.radius + delta * 0.04));
            }
            orbit.lastPinchDist = dist;
            return;
        }
        if (!orbit.dragging || e.touches.length !== 1) return;
        e.preventDefault();
        var ddx = e.touches[0].clientX - orbit.lastX, ddy = e.touches[0].clientY - orbit.lastY;
        orbit.theta -= ddx * 0.008;
        orbit.phi = Math.max(0.15, Math.min(Math.PI - 0.15, orbit.phi + ddy * 0.008));
        orbit.lastX = e.touches[0].clientX;
        orbit.lastY = e.touches[0].clientY;
    }

    dtCanvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointermove', onPointerMove);
    dtCanvas.addEventListener('wheel', onWheel, { passive: false });
    dtCanvas.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd);
    dtCanvas.addEventListener('touchmove', onTouchMove, { passive: false });

    function initTwin() {
        dtScene = new THREE.Scene();
        dtScene.fog = new THREE.FogExp2(0x0B0F19, 0.035);
        dtRenderer = new THREE.WebGLRenderer({ canvas: dtCanvas, antialias: true, alpha: true });
        dtRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        dtRenderer.setClearColor(0x0B0F19, 1);
        dtRenderer.shadowMap.enabled = true;
        dtRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
        dtRenderer.toneMapping = THREE.ACESFilmicToneMapping;
        dtRenderer.toneMappingExposure = 1.1;

        var w = dtCanvas.clientWidth || dtCanvas.parentElement.clientWidth || 400;
        var h = dtCanvas.clientHeight || 340;
        dtRenderer.setSize(w, h, false);

        dtCamera = new THREE.PerspectiveCamera(35, w / h, 0.1, 100);
        updateCameraFromOrbit();

        // Key light (sun)
        var key = new THREE.DirectionalLight(0xffeedd, 1.2);
        key.position.set(6, 10, 6); key.castShadow = true;
        key.shadow.mapSize.width = 1024; key.shadow.mapSize.height = 1024;
        key.shadow.camera.near = 0.5; key.shadow.camera.far = 30;
        key.shadow.camera.left = -6; key.shadow.camera.right = 6;
        key.shadow.camera.top = 6; key.shadow.camera.bottom = -6;
        key.shadow.bias = -0.001;
        dtScene.add(key);
        // Fill light
        var fill = new THREE.DirectionalLight(0x8899cc, 0.5);
        fill.position.set(-4, 4, -3); dtScene.add(fill);
        // Rim / back light
        var rim = new THREE.DirectionalLight(0x4488ff, 0.4);
        rim.position.set(-2, 3, -6); dtScene.add(rim);
        // Ambient
        dtScene.add(new THREE.AmbientLight(0x334466, 0.5));
        // Hemisphere light for sky/ground color bleeding
        dtScene.add(new THREE.HemisphereLight(0x446688, 0x223344, 0.3));

        // Ground plane (receives shadow)
        var groundGeo = new THREE.PlaneGeometry(12, 12);
        var groundMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.95, metalness: 0.0 });
        var ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
        dtScene.add(ground);
        // Grid overlay
        dtScene.add(new THREE.GridHelper(12, 24, 0x374151, 0x1F2937));
    }

    function resizeTwin() {
        if (!dtRenderer) return;
        var w = dtCanvas.clientWidth || dtCanvas.parentElement.clientWidth || 400;
        var h = dtCanvas.clientHeight || 340;
        dtRenderer.setSize(w, h, false);
        if (dtCamera) { dtCamera.aspect = w / h; dtCamera.updateProjectionMatrix(); }
    }

    function animateTwin() {
        dtAnimId = requestAnimationFrame(animateTwin);
        if (orbit.autoRotate) orbit.theta += 0.005;
        updateCameraFromOrbit();
        dtRenderer.render(dtScene, dtCamera);
    }

    function clearScene() {
        cancelAnimationFrame(dtAnimId);
        var keep = [];
        dtScene.traverse(function(o) { if ((o.isLight || o.isGridHelper || o.isHemisphereLight || (o.isMesh && o.geometry && o.geometry.type === 'PlaneGeometry')) && !o.userData.isDecal) keep.push(o); });
        while (dtScene.children.length) dtScene.remove(dtScene.children[0]);
        keep.forEach(function(o) { dtScene.add(o); });
        dtScene.add(new THREE.GridHelper(12, 24, 0x374151, 0x1F2937));
    }

    // ── Materials (CAD-quality PBR) ──
    function mat(color, r, m) { var o = new THREE.MeshStandardMaterial({ color: color, roughness: r !== undefined ? r : 0.4, metalness: m !== undefined ? m : 0.15 }); return o; }
    function glossMat(color) { return new THREE.MeshStandardMaterial({ color: color, roughness: 0.12, metalness: 0.7 }); }
    function chromeMat() { return new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.05, metalness: 0.95 }); }
    function glassMat() { return new THREE.MeshStandardMaterial({ color: 0x88ccff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.35, side: THREE.DoubleSide }); }
    function rubberMat() { return new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.92, metalness: 0.0 }); }
    function emitMat(color, i) { return new THREE.MeshStandardMaterial({ color: color, emissive: color, emissiveIntensity: i||1.5, roughness: 0.2 }); }
    function tailMat() { return new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff1111, emissiveIntensity: 0.6, roughness: 0.3 }); }

    function addShadow(mesh) { mesh.castShadow = true; mesh.receiveShadow = true; return mesh; }
    function pm(obj, props) { if (props.position) obj.position.copy(props.position); if (props.rotation) obj.rotation.copy(props.rotation); return obj; }

    // ── Detailed Wheel Assembly ──
    function buildWheel(radius, width) {
        var r = radius || 0.22, w = width || 0.15;
        var g = new THREE.Group();
        // Tire
        var tire = addShadow(new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.38, 16, 32), rubberMat()));
        g.add(tire);
        // Rim
        var rimMesh = addShadow(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.65, r * 0.65, w * 0.6, 24), chromeMat()));
        rimMesh.rotation.x = Math.PI / 2;
        g.add(rimMesh);
        // Hub cap
        var hub = addShadow(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.2, r * 0.2, w * 0.7, 12), chromeMat()));
        hub.rotation.x = Math.PI / 2;
        g.add(hub);
        // Spokes (5)
        for (var s = 0; s < 5; s++) {
            var spoke = addShadow(new THREE.Mesh(new THREE.BoxGeometry(r * 0.12, r * 0.9, w * 0.3), chromeMat()));
            spoke.rotation.z = (s / 5) * Math.PI * 2;
            g.add(spoke);
        }
        // Brake disc visible behind spokes
        var disc = addShadow(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, w * 0.15, 24), mat(0x555555, 0.6, 0.5)));
        disc.rotation.x = Math.PI / 2;
        disc.position.z = -w * 0.15;
        g.add(disc);
        return g;
    }

    // ── Detailed Headlight ──
    function buildHeadlight(r) {
        var g = new THREE.Group();
        // Housing
        var housing = addShadow(new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.1, r * 0.5, 16), mat(0x222222, 0.3, 0.5)));
        housing.rotation.z = Math.PI / 2;
        g.add(housing);
        // Lens
        var lens = new THREE.Mesh(new THREE.SphereGeometry(r * 0.9, 16, 16, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0xffffee, emissive: 0xffffcc, emissiveIntensity: 0.8, roughness: 0.1, transparent: true, opacity: 0.7 }));
        lens.rotation.y = -Math.PI / 2;
        g.add(lens);
        return g;
    }

    // ── Side Mirror ──
    function buildMirror(color) {
        var g = new THREE.Group();
        // Arm
        g.add(addShadow(pm(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.2), mat(color || 0x222222, 0.4, 0.15)), { position: new THREE.Vector3(0, 0, 0.1) })));
        // Mirror housing
        g.add(addShadow(pm(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.06), mat(color || 0x222222, 0.3, 0.2)), { position: new THREE.Vector3(0, 0, 0.22) })));
        // Reflective surface
        g.add(pm(new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.07), new THREE.MeshStandardMaterial({ color: 0xaabbcc, roughness: 0.0, metalness: 1.0 })), { position: new THREE.Vector3(-0.062, 0, 0.22) }));
        return g;
    }

    // ══════════════════════════════════════════
    // BUILD: POLICE CAR (CAD Detail)
    // ══════════════════════════════════════════
    function buildPoliceCar() {
        var g = new THREE.Group();
        var bodyColor = 0x0a2463, accentColor = 0x1e40af;

        // ── Chassis / underbody ──
        g.add(addShadow(pm(new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.1, 1.1), mat(0x111111, 0.8, 0.1)), { position: new THREE.Vector3(0, 0.12, 0) })));
        // Exhaust pipes
        g.add(addShadow(pm(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.3, 8), chromeMat()), { position: new THREE.Vector3(-1.2, 0.12, 0.35), rotation: new THREE.Euler(0, 0, Math.PI / 2) })));
        g.add(addShadow(pm(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.3, 8), chromeMat()), { position: new THREE.Vector3(-1.2, 0.12, -0.35), rotation: new THREE.Euler(0, 0, Math.PI / 2) })));

        // ── Lower body (main) ──
        var bodyShape = new THREE.Shape();
        bodyShape.moveTo(-1.2, 0); bodyShape.lineTo(1.15, 0); bodyShape.quadraticCurveTo(1.3, 0, 1.3, 0.15);
        bodyShape.lineTo(1.3, 0.45); bodyShape.quadraticCurveTo(1.3, 0.55, 1.2, 0.55);
        bodyShape.lineTo(-1.15, 0.55); bodyShape.quadraticCurveTo(-1.3, 0.55, -1.3, 0.45);
        bodyShape.lineTo(-1.3, 0.15); bodyShape.quadraticCurveTo(-1.3, 0, -1.2, 0);
        var bodyExt = { depth: 1.08, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 3 };
        var bodyMesh = addShadow(new THREE.Mesh(new THREE.ExtrudeGeometry(bodyShape, bodyExt), glossMat(bodyColor)));
        bodyMesh.position.set(0, 0.18, -0.54); bodyMesh.rotation.x = 0;
        g.add(bodyMesh);

        // ── Cabin (swept-back windshield shape) ──
        var cabinShape = new THREE.Shape();
        cabinShape.moveTo(-0.55, 0); cabinShape.lineTo(0.4, 0);
        cabinShape.lineTo(0.55, 0.35); cabinShape.quadraticCurveTo(0.55, 0.42, 0.48, 0.42);
        cabinShape.lineTo(-0.5, 0.42); cabinShape.quadraticCurveTo(-0.58, 0.42, -0.58, 0.35);
        cabinShape.lineTo(-0.55, 0);
        var cabExt = { depth: 0.96, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2 };
        var cabMesh = addShadow(new THREE.Mesh(new THREE.ExtrudeGeometry(cabinShape, cabExt), glossMat(bodyColor)));
        cabMesh.position.set(-0.08, 0.73, -0.48);
        g.add(cabMesh);

        // ── Windows (glass panels) ──
        // Windshield (angled)
        var wsGeo = new THREE.PlaneGeometry(0.9, 0.4);
        var ws = new THREE.Mesh(wsGeo, glassMat());
        ws.position.set(0.5, 1.0, 0); ws.rotation.y = -0.25;
        g.add(ws);
        // Rear window
        var rw = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.35), glassMat());
        rw.position.set(-0.65, 1.0, 0); rw.rotation.y = 0.3;
        g.add(rw);
        // Side windows (left)
        var sideWin = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.32), glassMat());
        sideWin.position.set(-0.08, 1.02, 0.5); sideWin.rotation.y = Math.PI / 2;
        g.add(sideWin);
        // Side windows (right)
        var sideWin2 = sideWin.clone(); sideWin2.position.z = -0.5; sideWin2.rotation.y = -Math.PI / 2;
        g.add(sideWin2);

        // ── Door lines (panel gaps) ──
        [-0.15, 0.25].forEach(function(x) {
            var doorLine = addShadow(new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.5, 1.1), mat(0x050505, 0.9, 0.0)));
            doorLine.position.set(x, 0.5, 0); g.add(doorLine);
        });
        // Door handles
        [-0.15, 0.25].forEach(function(x) {
            [0.46, -0.46].forEach(function(z) {
                var handle = addShadow(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.025), chromeMat()));
                handle.position.set(x + 0.08, 0.6, z); g.add(handle);
            });
        });

        // ── White body stripe (POLICE marking line) ──
        g.add(addShadow(pm(new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.06, 0.02), mat(0xffffff, 0.5, 0.0)), { position: new THREE.Vector3(0, 0.52, 0.555) })));
        g.add(addShadow(pm(new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.06, 0.02), mat(0xffffff, 0.5, 0.0)), { position: new THREE.Vector3(0, 0.52, -0.555) })));

        // ── Light Bar (detailed) ──
        var lbar = new THREE.Group();
        // Base
        lbar.add(addShadow(pm(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.28), mat(0x222222, 0.5, 0.3)), { position: new THREE.Vector3(0, 0, 0) })));
        // Clear housing
        lbar.add(pm(new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.1, 0.26), new THREE.MeshStandardMaterial({ color: 0xaabbcc, roughness: 0.05, transparent: true, opacity: 0.25 })), { position: new THREE.Vector3(0, 0.07, 0) }));
        // Red LEDs (left side)
        for (var lr = 0; lr < 4; lr++) {
            lbar.add(pm(new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), emitMat(0xff0000, 2.0)), { position: new THREE.Vector3(0.15 + lr * 0.08, 0.07, 0.06) }));
            lbar.add(pm(new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), emitMat(0xff0000, 2.0)), { position: new THREE.Vector3(0.15 + lr * 0.08, 0.07, -0.06) }));
        }
        // Blue LEDs (right side)
        for (var lb = 0; lb < 4; lb++) {
            lbar.add(pm(new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), emitMat(0x0044ff, 2.0)), { position: new THREE.Vector3(-0.15 - lb * 0.08, 0.07, 0.06) }));
            lbar.add(pm(new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), emitMat(0x0044ff, 2.0)), { position: new THREE.Vector3(-0.15 - lb * 0.08, 0.07, -0.06) }));
        }
        // White center LED
        lbar.add(pm(new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), emitMat(0xffffff, 1.5)), { position: new THREE.Vector3(0, 0.07, 0) }));
        lbar.position.set(-0.05, 1.17, 0);
        g.add(lbar);

        // ── Push Bar (front bull bar) ──
        var pushBar = new THREE.Group();
        pushBar.add(addShadow(pm(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 8), chromeMat()), { position: new THREE.Vector3(0, 0.25, 0.22), rotation: new THREE.Euler(0, 0, 0) })));
        pushBar.add(addShadow(pm(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 8), chromeMat()), { position: new THREE.Vector3(0, 0.25, -0.22), rotation: new THREE.Euler(0, 0, 0) })));
        pushBar.add(addShadow(pm(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 8), chromeMat()), { position: new THREE.Vector3(0, 0.5, 0), rotation: new THREE.Euler(Math.PI / 2, 0, 0) })));
        pushBar.add(addShadow(pm(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 8), chromeMat()), { position: new THREE.Vector3(0, 0.3, 0), rotation: new THREE.Euler(Math.PI / 2, 0, 0) })));
        pushBar.position.set(1.35, 0.0, 0);
        g.add(pushBar);

        // ── Headlights ──
        var hl1 = buildHeadlight(0.08); hl1.position.set(1.32, 0.45, 0.35); g.add(hl1);
        var hl2 = buildHeadlight(0.08); hl2.position.set(1.32, 0.45, -0.35); g.add(hl2);

        // ── Taillights ──
        g.add(addShadow(pm(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.15), tailMat()), { position: new THREE.Vector3(-1.32, 0.45, 0.38) })));
        g.add(addShadow(pm(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.15), tailMat()), { position: new THREE.Vector3(-1.32, 0.45, -0.38) })));

        // ── Front & rear bumpers ──
        g.add(addShadow(pm(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.15, 1.12), mat(0x222222, 0.6, 0.3)), { position: new THREE.Vector3(1.3, 0.25, 0) })));
        g.add(addShadow(pm(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.15, 1.12), mat(0x222222, 0.6, 0.3)), { position: new THREE.Vector3(-1.32, 0.25, 0) })));

        // ── License plates ──
        g.add(addShadow(pm(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.065, 0.15), mat(0xeeeeee, 0.6, 0.0)), { position: new THREE.Vector3(1.35, 0.28, 0) })));
        g.add(addShadow(pm(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.065, 0.15), mat(0xeeeeee, 0.6, 0.0)), { position: new THREE.Vector3(-1.35, 0.28, 0) })));

        // ── Side Mirrors ──
        var mirL = buildMirror(bodyColor); mirL.position.set(0.3, 0.85, 0.55); g.add(mirL);
        var mirR = buildMirror(bodyColor); mirR.position.set(0.3, 0.85, -0.55); mirR.scale.z = -1; g.add(mirR);

        // ── Spotlight (driver side) ──
        g.add(addShadow(pm(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.1, 12), mat(0x222222, 0.3, 0.5)), { position: new THREE.Vector3(0.15, 1.2, 0.52), rotation: new THREE.Euler(0, 0, Math.PI / 2) })));

        // ── Antenna ──
        g.add(addShadow(pm(new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.4, 6), mat(0x111111, 0.7, 0.3)), { position: new THREE.Vector3(-0.4, 1.38, 0) })));

        // ── Wheels ──
        var positions = [[0.75, 0.22, 0.56], [0.75, 0.22, -0.56], [-0.75, 0.22, 0.56], [-0.75, 0.22, -0.56]];
        positions.forEach(function(p) {
            var wheel = buildWheel(0.22, 0.15);
            wheel.position.set(p[0], p[1], p[2]);
            if (p[2] < 0) wheel.rotation.y = Math.PI;
            g.add(wheel);
        });

        // ── Wheel well arches ──
        positions.forEach(function(p) {
            var arch = addShadow(new THREE.Mesh(
                new THREE.TorusGeometry(0.28, 0.025, 8, 16, Math.PI),
                glossMat(bodyColor)
            ));
            arch.position.set(p[0], 0.22, p[2]);
            arch.rotation.set(0, p[2] > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
            g.add(arch);
        });

        return g;
    }

    // ══════════════════════════════════════════
    // BUILD: AMBULANCE (CAD Detail)
    // ══════════════════════════════════════════
    function buildAmbulance() {
        var g = new THREE.Group();

        // ── Chassis ──
        g.add(addShadow(pm(new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.1, 1.2), mat(0x111111, 0.8, 0.1)), { position: new THREE.Vector3(0, 0.15, 0) })));

        // ── Cab section ──
        var cabShape = new THREE.Shape();
        cabShape.moveTo(0, 0); cabShape.lineTo(0.85, 0);
        cabShape.quadraticCurveTo(0.95, 0, 0.95, 0.1); cabShape.lineTo(0.95, 0.55);
        cabShape.quadraticCurveTo(0.95, 0.65, 0.85, 0.65); cabShape.lineTo(0, 0.65); cabShape.lineTo(0, 0);
        var cabExt = { depth: 1.08, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2 };
        var cabMesh = addShadow(new THREE.Mesh(new THREE.ExtrudeGeometry(cabShape, cabExt), glossMat(0xf5f5f5)));
        cabMesh.position.set(0.48, 0.2, -0.54); g.add(cabMesh);

        // Cab windshield
        g.add(pm(new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.45), glassMat()), { position: new THREE.Vector3(1.44, 0.6, 0), rotation: new THREE.Euler(0, Math.PI / 2 - 0.08, 0) }));
        // Cab side windows
        g.add(pm(new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.35), glassMat()), { position: new THREE.Vector3(0.8, 0.65, 0.55), rotation: new THREE.Euler(0, Math.PI / 2, 0) }));
        g.add(pm(new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.35), glassMat()), { position: new THREE.Vector3(0.8, 0.65, -0.55), rotation: new THREE.Euler(0, -Math.PI / 2, 0) }));

        // ── Patient compartment (box body) ──
        var boxShape = new THREE.Shape();
        boxShape.moveTo(0, 0); boxShape.lineTo(1.5, 0); boxShape.lineTo(1.5, 1.0);
        boxShape.quadraticCurveTo(1.5, 1.08, 1.42, 1.08); boxShape.lineTo(0.08, 1.08);
        boxShape.quadraticCurveTo(0, 1.08, 0, 1.0); boxShape.lineTo(0, 0);
        var boxExt = { depth: 1.16, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2 };
        var boxMesh = addShadow(new THREE.Mesh(new THREE.ExtrudeGeometry(boxShape, boxExt), glossMat(0xf5f5f5)));
        boxMesh.position.set(-1.05, 0.2, -0.58); g.add(boxMesh);

        // ── Red stripe band (Chevron "Star of Life" stripe) ──
        g.add(addShadow(pm(new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.12, 0.02), mat(0xcc0000, 0.4, 0.1)), { position: new THREE.Vector3(-0.3, 0.65, 0.59) })));
        g.add(addShadow(pm(new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.12, 0.02), mat(0xcc0000, 0.4, 0.1)), { position: new THREE.Vector3(-0.3, 0.65, -0.59) })));
        g.add(addShadow(pm(new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.12, 1.2), mat(0xcc0000, 0.4, 0.1)), { position: new THREE.Vector3(-0.3, 0.38, 0) })));

        // ── Star of Life / Red Cross (rear) ──
        g.add(addShadow(pm(new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.35, 0.07), mat(0xdd0000, 0.3, 0.1)), { position: new THREE.Vector3(-1.07, 0.8, 0) })));
        g.add(addShadow(pm(new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.07, 0.35), mat(0xdd0000, 0.3, 0.1)), { position: new THREE.Vector3(-1.07, 0.8, 0) })));

        // ── Rear doors (with window) ──
        g.add(addShadow(pm(new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.85, 0.01), mat(0x333333, 0.8, 0.0)), { position: new THREE.Vector3(-1.06, 0.65, 0) })));
        g.add(pm(new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.25), glassMat()), { position: new THREE.Vector3(-1.07, 0.95, 0.2), rotation: new THREE.Euler(0, Math.PI / 2, 0) }));
        g.add(pm(new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.25), glassMat()), { position: new THREE.Vector3(-1.07, 0.95, -0.2), rotation: new THREE.Euler(0, -Math.PI / 2, 0) }));
        // Door handles
        g.add(addShadow(pm(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.015, 0.04), chromeMat()), { position: new THREE.Vector3(-1.08, 0.6, 0.12) })));
        g.add(addShadow(pm(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.015, 0.04), chromeMat()), { position: new THREE.Vector3(-1.08, 0.6, -0.12) })));

        // ── Roof light bar ──
        var roofBar = new THREE.Group();
        roofBar.add(addShadow(pm(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.22), mat(0x333333, 0.5, 0.3)), { position: new THREE.Vector3(0, 0, 0) })));
        roofBar.add(pm(new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.08, 0.2), new THREE.MeshStandardMaterial({ color: 0xaabbcc, roughness: 0.05, transparent: true, opacity: 0.2 })), { position: new THREE.Vector3(0, 0.05, 0) }));
        for (var rl = 0; rl < 3; rl++) {
            roofBar.add(pm(new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), emitMat(0xff0000, 2.0)), { position: new THREE.Vector3(0.1 + rl * 0.08, 0.05, 0.05) }));
            roofBar.add(pm(new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), emitMat(0xffffff, 1.8)), { position: new THREE.Vector3(0.1 + rl * 0.08, 0.05, -0.05) }));
            roofBar.add(pm(new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), emitMat(0xff0000, 2.0)), { position: new THREE.Vector3(-0.1 - rl * 0.08, 0.05, 0.05) }));
            roofBar.add(pm(new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), emitMat(0xffffff, 1.8)), { position: new THREE.Vector3(-0.1 - rl * 0.08, 0.05, -0.05) }));
        }
        roofBar.position.set(0.8, 0.88, 0); g.add(roofBar);

        // ── Headlights / Taillights ──
        var hlA1 = buildHeadlight(0.07); hlA1.position.set(1.44, 0.38, 0.38); g.add(hlA1);
        var hlA2 = buildHeadlight(0.07); hlA2.position.set(1.44, 0.38, -0.38); g.add(hlA2);
        g.add(addShadow(pm(new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.08, 0.12), tailMat()), { position: new THREE.Vector3(-1.07, 0.35, 0.42) })));
        g.add(addShadow(pm(new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.08, 0.12), tailMat()), { position: new THREE.Vector3(-1.07, 0.35, -0.42) })));

        // ── Bumpers ──
        g.add(addShadow(pm(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 1.22), chromeMat()), { position: new THREE.Vector3(1.44, 0.24, 0) })));
        g.add(addShadow(pm(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 1.22), mat(0x333333, 0.5, 0.3)), { position: new THREE.Vector3(-1.08, 0.24, 0) })));

        // ── Side Mirrors ──
        var ml = buildMirror(0xf5f5f5); ml.position.set(0.95, 0.78, 0.58); g.add(ml);
        var mr = buildMirror(0xf5f5f5); mr.position.set(0.95, 0.78, -0.58); mr.scale.z = -1; g.add(mr);

        // ── Step rails (side grab handles) ──
        g.add(addShadow(pm(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.35, 6), chromeMat()), { position: new THREE.Vector3(-0.8, 0.5, 0.6) })));
        g.add(addShadow(pm(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.35, 6), chromeMat()), { position: new THREE.Vector3(-0.8, 0.5, -0.6) })));

        // ── Wheels ──
        [[0.85, 0.22, 0.6], [0.85, 0.22, -0.6], [-0.7, 0.22, 0.6], [-0.7, 0.22, -0.6]].forEach(function(p) {
            var wheel = buildWheel(0.22, 0.16); wheel.position.set(p[0], p[1], p[2]);
            if (p[2] < 0) wheel.rotation.y = Math.PI; g.add(wheel);
        });

        return g;
    }

    // ══════════════════════════════════════════
    // BUILD: SCHOOL BUS (CAD Detail)
    // ══════════════════════════════════════════
    function buildSchoolBus() {
        var g = new THREE.Group();
        var busYellow = 0xf0a500, busDark = 0xb47800;

        // ── Chassis/frame ──
        g.add(addShadow(pm(new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.1, 1.12), mat(0x111111, 0.8, 0.1)), { position: new THREE.Vector3(0, 0.14, 0) })));

        // ── Main body ──
        var busShape = new THREE.Shape();
        busShape.moveTo(-1.55, 0); busShape.lineTo(1.5, 0);
        busShape.quadraticCurveTo(1.6, 0, 1.6, 0.1); busShape.lineTo(1.6, 0.75);
        busShape.quadraticCurveTo(1.6, 0.85, 1.5, 0.85); busShape.lineTo(-1.5, 0.85);
        busShape.quadraticCurveTo(-1.6, 0.85, -1.6, 0.75); busShape.lineTo(-1.6, 0.1);
        busShape.quadraticCurveTo(-1.6, 0, -1.55, 0);
        var busExt = { depth: 1.1, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2 };
        var busMesh = addShadow(new THREE.Mesh(new THREE.ExtrudeGeometry(busShape, busExt), glossMat(busYellow)));
        busMesh.position.set(0, 0.2, -0.55); g.add(busMesh);

        // ── Black stripe (regulation bumper trim) ──
        g.add(addShadow(pm(new THREE.Mesh(new THREE.BoxGeometry(3.22, 0.1, 0.02), mat(0x111111, 0.8, 0.0)), { position: new THREE.Vector3(0, 0.32, 0.56) })));
        g.add(addShadow(pm(new THREE.Mesh(new THREE.BoxGeometry(3.22, 0.1, 0.02), mat(0x111111, 0.8, 0.0)), { position: new THREE.Vector3(0, 0.32, -0.56) })));

        // ── Roof (slightly darker) ──
        g.add(addShadow(pm(new THREE.Mesh(new THREE.BoxGeometry(3.18, 0.04, 1.08), glossMat(busDark)), { position: new THREE.Vector3(0, 1.07, 0) })));

        // ── Roof warning lights ──
        g.add(pm(new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 10), emitMat(0xff0000, 1.5)), { position: new THREE.Vector3(1.3, 1.12, 0.25) }));
        g.add(pm(new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 10), emitMat(0xff0000, 1.5)), { position: new THREE.Vector3(1.3, 1.12, -0.25) }));
        g.add(pm(new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 10), emitMat(0xffaa00, 1.5)), { position: new THREE.Vector3(1.4, 1.12, 0.15) }));
        g.add(pm(new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 10), emitMat(0xffaa00, 1.5)), { position: new THREE.Vector3(1.4, 1.12, -0.15) }));

        // ── Windshield (wrap-around) ──
        g.add(pm(new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.55), glassMat()), { position: new THREE.Vector3(1.61, 0.78, 0), rotation: new THREE.Euler(0, Math.PI / 2, 0) }));

        // ── Windows (both sides) ──
        for (var wi = -4; wi <= 3; wi++) {
            // Left side
            var winL = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.3), glassMat());
            winL.position.set(wi * 0.36, 0.82, 0.56); winL.rotation.y = Math.PI / 2; g.add(winL);
            // Right side
            var winR = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.3), glassMat());
            winR.position.set(wi * 0.36, 0.82, -0.56); winR.rotation.y = -Math.PI / 2; g.add(winR);
        }

        // ── Rear window ──
        g.add(pm(new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.35), glassMat()), { position: new THREE.Vector3(-1.61, 0.82, 0), rotation: new THREE.Euler(0, Math.PI / 2, 0) }));

        // ── Stop sign arm (folded, left side) ──
        var stopArm = new THREE.Group();
        stopArm.add(addShadow(pm(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.25), mat(0x333333, 0.6, 0.2)), { position: new THREE.Vector3(0, 0, 0.12) })));
        // Octagonal stop sign
        var octShape = new THREE.Shape();
        var octR = 0.09;
        for (var oi = 0; oi < 8; oi++) {
            var ox = octR * Math.cos(oi * Math.PI / 4 + Math.PI / 8);
            var oy = octR * Math.sin(oi * Math.PI / 4 + Math.PI / 8);
            if (oi === 0) octShape.moveTo(ox, oy); else octShape.lineTo(ox, oy);
        }
        octShape.closePath();
        var octGeo = new THREE.ShapeGeometry(octShape);
        stopArm.add(pm(new THREE.Mesh(octGeo, mat(0xcc0000, 0.4, 0.1)), { position: new THREE.Vector3(-0.01, 0, 0.26) }));
        stopArm.position.set(0.6, 0.75, 0.58);
        g.add(stopArm);

        // ── Entrance door (right front) ──
        g.add(addShadow(pm(new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.65, 0.38), mat(0x222222, 0.8, 0.0)), { position: new THREE.Vector3(1.1, 0.55, -0.38) })));
        g.add(pm(new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.4), glassMat()), { position: new THREE.Vector3(1.1, 0.7, -0.38), rotation: new THREE.Euler(0, Math.PI / 2, 0) }));

        // ── Headlights ──
        var hlB1 = buildHeadlight(0.065); hlB1.position.set(1.6, 0.4, 0.38); g.add(hlB1);
        var hlB2 = buildHeadlight(0.065); hlB2.position.set(1.6, 0.4, -0.38); g.add(hlB2);
        // Turn signals
        g.add(pm(new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), emitMat(0xffaa00, 0.8)), { position: new THREE.Vector3(1.6, 0.32, 0.45) }));
        g.add(pm(new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), emitMat(0xffaa00, 0.8)), { position: new THREE.Vector3(1.6, 0.32, -0.45) }));

        // ── Taillights ──
        g.add(addShadow(pm(new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.1, 0.15), tailMat()), { position: new THREE.Vector3(-1.61, 0.38, 0.38) })));
        g.add(addShadow(pm(new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.1, 0.15), tailMat()), { position: new THREE.Vector3(-1.61, 0.38, -0.38) })));

        // ── Bumpers ──
        g.add(addShadow(pm(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 1.14), chromeMat()), { position: new THREE.Vector3(1.62, 0.22, 0) })));
        g.add(addShadow(pm(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 1.14), mat(0x333333, 0.6, 0.2)), { position: new THREE.Vector3(-1.62, 0.22, 0) })));

        // ── Side mirrors ──
        var smL = buildMirror(busYellow); smL.position.set(1.35, 0.9, 0.58); g.add(smL);
        var smR = buildMirror(busYellow); smR.position.set(1.35, 0.9, -0.58); smR.scale.z = -1; g.add(smR);

        // ── Wheels (6: dual rear) ──
        [[1.0, 0.22, 0.58], [1.0, 0.22, -0.58], [-0.9, 0.22, 0.58], [-0.9, 0.22, -0.58], [-1.1, 0.22, 0.58], [-1.1, 0.22, -0.58]].forEach(function(p) {
            var wheel = buildWheel(0.22, 0.14); wheel.position.set(p[0], p[1], p[2]);
            if (p[2] < 0) wheel.rotation.y = Math.PI; g.add(wheel);
        });

        return g;
    }

    // ══════════════════════════════════════════
    // BUILD: TRAFFIC LIGHT (CAD Detail)
    // ══════════════════════════════════════════
    function buildTrafficLight(activeColor) {
        var g = new THREE.Group();

        // ── Concrete base ──
        g.add(addShadow(pm(new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.12, 0.65), mat(0x666666, 0.9, 0.0)), { position: new THREE.Vector3(0, 0.06, 0) })));

        // ── Main pole (tapered) ──
        var pole = addShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 3.2, 16), mat(0x555555, 0.5, 0.4)));
        pole.position.y = 1.72; g.add(pole);

        // ── Cross arm (mast arm) ──
        var arm = addShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 1.8, 12), mat(0x555555, 0.5, 0.4)));
        arm.rotation.z = Math.PI / 2; arm.position.set(0.9, 3.2, 0); g.add(arm);

        // ── Signal housing (main — on arm) ──
        function buildSignalHead(x, y, z, activeCol) {
            var h = new THREE.Group();
            // Back plate
            h.add(addShadow(pm(new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.95, 0.2), mat(0x1a1a1a, 0.6, 0.3)), { position: new THREE.Vector3(0, 0, -0.05) })));
            // Front housing
            h.add(addShadow(pm(new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.92, 0.08), mat(0x222222, 0.5, 0.2)), { position: new THREE.Vector3(0, 0, 0.09) })));
            // Visors for each light
            [{cy: 0.28}, {cy: 0}, {cy: -0.28}].forEach(function(v) {
                var visorShape = new THREE.Shape();
                visorShape.moveTo(-0.11, -0.04); visorShape.lineTo(0.11, -0.04);
                visorShape.lineTo(0.08, 0.06); visorShape.lineTo(-0.08, 0.06);
                var visorGeo = new THREE.ExtrudeGeometry(visorShape, { depth: 0.12, bevelEnabled: false });
                var visorMesh = addShadow(new THREE.Mesh(visorGeo, mat(0x1a1a1a, 0.7, 0.2)));
                visorMesh.position.set(0, v.cy + 0.04, 0.08); visorMesh.rotation.x = -Math.PI / 2;
                h.add(visorMesh);
            });
            // Light lenses
            var lights = [
                { c: 0xef4444, name: 'red',    cy: 0.28 },
                { c: 0xfbbf24, name: 'yellow', cy: 0 },
                { c: 0x10b981, name: 'green',  cy: -0.28 }
            ];
            lights.forEach(function(l) {
                var on = l.name === activeCol;
                // Outer ring
                h.add(addShadow(pm(new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.012, 8, 24), mat(0x333333, 0.5, 0.3)), { position: new THREE.Vector3(0, l.cy, 0.14) })));
                // Lens
                var lensMat = new THREE.MeshStandardMaterial({
                    color: on ? l.c : 0x222222,
                    emissive: on ? l.c : 0x000000,
                    emissiveIntensity: on ? 2.0 : 0,
                    roughness: on ? 0.15 : 0.6,
                    metalness: 0.1,
                    transparent: !on,
                    opacity: on ? 1.0 : 0.4
                });
                var lens = new THREE.Mesh(new THREE.CircleGeometry(0.08, 24), lensMat);
                lens.position.set(0, l.cy, 0.145); h.add(lens);
                // Glow effect for active light
                if (on) {
                    var glow = new THREE.Mesh(new THREE.CircleGeometry(0.12, 24), new THREE.MeshBasicMaterial({ color: l.c, transparent: true, opacity: 0.15 }));
                    glow.position.set(0, l.cy, 0.15); h.add(glow);
                }
            });
            h.position.set(x, y, z);
            return h;
        }

        // Main signal head (end of arm)
        g.add(buildSignalHead(1.8, 2.85, 0, activeColor));
        // Secondary signal head (on pole)
        var secondary = buildSignalHead(0, 2.85, 0, activeColor);
        secondary.scale.set(0.8, 0.8, 0.8);
        g.add(secondary);

        // ── Pedestrian signal (on pole, lower) ──
        var pedBox = new THREE.Group();
        pedBox.add(addShadow(pm(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.1), mat(0x1a1a1a, 0.6, 0.3)), { position: new THREE.Vector3(0, 0, 0) })));
        // Walk symbol (white)
        pedBox.add(pm(new THREE.Mesh(new THREE.CircleGeometry(0.06, 16), emitMat(0xffffff, 0.8)), { position: new THREE.Vector3(0, 0.05, 0.055) }));
        // Don't walk (orange, dim)
        pedBox.add(pm(new THREE.Mesh(new THREE.CircleGeometry(0.06, 16), new THREE.MeshStandardMaterial({ color: 0x332200, emissive: 0xff6600, emissiveIntensity: 0.15, roughness: 0.4 })), { position: new THREE.Vector3(0, -0.07, 0.055) }));
        pedBox.position.set(0.15, 2.0, 0.1);
        g.add(pedBox);

        // ── Street sign plate (on pole) ──
        g.add(addShadow(pm(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.15, 0.55), mat(0x115533, 0.5, 0.1)), { position: new THREE.Vector3(0, 3.5, 0) })));

        // Scale to fit viewer
        g.scale.set(0.6, 0.6, 0.6);
        g.position.y = -0.2;
        return g;
    }

    // ── GLTF model file mapping ──
    var glbFiles = { police: 'models/police-car.glb', ambulance: 'models/ambulance.glb', bus: 'models/school-bus.glb', traffic: 'models/traffic-light.glb' };
    var glbLoader = new THREE.GLTFLoader();
    var dracoLoader = new THREE.DRACOLoader();
    dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/libs/draco/');
    glbLoader.setDRACOLoader(dracoLoader);

    function addGLTFModel(gltf, targetSize) {
        var model = gltf.scene;
        // Enable shadows on all meshes
        model.traverse(function(child) { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } });
        // Auto-center and scale to fit
        var box = new THREE.Box3().setFromObject(model);
        var center = box.getCenter(new THREE.Vector3());
        var size = box.getSize(new THREE.Vector3());
        var maxDim = Math.max(size.x, size.y, size.z);
        var scale = (targetSize || 3) / maxDim;
        model.scale.setScalar(scale);
        // Re-center after scale
        box.setFromObject(model);
        center = box.getCenter(new THREE.Vector3());
        model.position.sub(center);
        model.position.y += box.getSize(new THREE.Vector3()).y / 2;
        return model;
    }

    // ── APD Atlanta Police Livery ──
    // Applies Atlanta Police Department charcoal + gold chevron livery to a loaded GLTF police car model.
    function applyAPDLivery(model) {
        // Recolor all non-wheel, non-glass meshes to APD charcoal
        var bodyMat = new THREE.MeshStandardMaterial({ color: 0x2B2D42, metalness: 0.40, roughness: 0.50 });
        model.traverse(function(child) {
            if (!child.isMesh) return;
            var n = (child.name || '').toLowerCase();
            if (n.includes('wheel') || n.includes('tire') || n.includes('tyre') || n.includes('rim')) return;
            if (n.includes('glass') || n.includes('window') || n.includes('windshield')) return;
            child.material = bodyMat.clone();
        });

    }

    // ── Atlanta Public Schools Bus Livery (PBR + Clearcoat) ──
    // Normal maps from Thomas Saf-T-Liner model package
    var _busTexCache = null;
    function loadBusTextures(callback) {
        if (_busTexCache) { callback(_busTexCache); return; }
        var tl = new THREE.TextureLoader();
        var cache = {};
        var remaining = 3;
        function tick() { if (--remaining === 0) { _busTexCache = cache; callback(cache); } }
        function loadMap(key, url) {
            tl.load(url, function(t) {
                t.wrapS = t.wrapT = THREE.RepeatWrapping;
                cache[key] = t;
                tick();
            }, undefined, function() { tick(); }); // graceful fallback on error
        }
        loadMap('body1Normal',    'models/bus-body1-normal.jpg');
        loadMap('body2Normal',    'models/bus-body2-normal.jpg');
        loadMap('interiorNormal', 'models/bus-interior-normal.jpg');
    }

    function applyBusLivery(model, textures) {
        textures = textures || {};
        // Correct orientation: 3ds Max Z-up OBJ export needs -90° X rotation
        model.rotation.x = -Math.PI / 2;
        // Re-center after rotation so the bus sits on the ground plane
        model.updateMatrixWorld(true);
        var box = new THREE.Box3().setFromObject(model);
        var center = box.getCenter(new THREE.Vector3());
        model.position.sub(center);
        model.position.y += box.getSize(new THREE.Vector3()).y / 2;
        // Apply per-material PBR with matching normal maps
        model.traverse(function(child) {
            if (!child.isMesh) return;
            var n = (child.material && child.material.name || '').toLowerCase();
            var normalMap = null;
            var color = 0xFFD700;
            if (n.includes('body_1') || n === 'body_1') {
                normalMap = textures.body1Normal || null;
            } else if (n.includes('body_2') || n === 'body_2') {
                normalMap = textures.body2Normal || null;
            } else if (n.includes('interior')) {
                normalMap = textures.interiorNormal || null;
                color = 0x1a1a1a;
            }
            var mat = new THREE.MeshPhysicalMaterial({
                color: color,
                metalness: 0.05,
                roughness: 0.38,
                clearcoat: 0.85,
                clearcoatRoughness: 0.12
            });
            if (normalMap) {
                mat.normalMap = normalMap;
                mat.normalScale.set(0.55, 0.55);
            }
            child.material = mat;
        });
    }

    // ── Register Three.js builders into DT namespace ──
    // Called once — makes the class build() / applyLivery() methods functional.
    DT._build = function(type) {
        switch (type) {
            case 'police':    return buildPoliceCar();
            case 'ambulance': return buildAmbulance();
            case 'bus':       return buildSchoolBus();
            default:          return new THREE.Group();
        }
    };
    DT._applyLivery     = function(type, model) { if (type === 'police') applyAPDLivery(model); };
    DT._addGLTFModel    = addGLTFModel;
    DT._loadBusTextures = loadBusTextures;
    DT._applyBusLivery  = applyBusLivery;

    // ── Open / Close ──
    // vehicleId : key into vehicles{} (a Vehicle class instance), or null
    // type      : 'traffic' when vehicleId is null
    // label     : display name for non-vehicle entities
    // extra     : active color for traffic lights
    function openDigitalTwin(vehicleId, type, label, extra) {
        var entity = (vehicleId && vehicles[vehicleId]) ? vehicles[vehicleId] : null;
        var resolvedType  = entity ? entity.type  : (type  || '');
        var resolvedLabel = entity ? entity.label : (label || '');

        dtSection.classList.add('active');
        void dtSection.offsetHeight;
        if (!dtScene) { initTwin(); }
        clearScene();

        orbit.theta = 0.8; orbit.phi = 0.6; orbit.radius = 7; orbit.autoRotate = true;
        if (resolvedType === 'bus') { orbit.radius = 2.33; }
        dtTitle.textContent = '\uD83D\uDD0D Digital Twin \u2014 ' + resolvedLabel;

        if (entity) {
            dtInfo.innerHTML = entity.renderInfoHTML();
        } else {
            var bc = '#10B981', bt = 'SIGNAL', st = (extra || 'red').toUpperCase();
            dtInfo.innerHTML =
                '<span><span class="dt-badge" style="background:' + bc + '22;color:' + bc + ';border:1px solid ' + bc + '44;">' + bt + '</span></span>' +
                '<span><i class="fa-solid fa-circle" style="font-size:7px;color:' + bc + '"></i>\u00a0' + st + '</span>' +
                '<span style="margin-left:auto;color:#6B7280;"><i class="fa-solid fa-arrows-rotate"></i> Drag \u00b7 Scroll</span>';
        }

        resizeTwin();
        dtSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
        animateTwin();
        requestAnimationFrame(function() { resizeTwin(); });

        if (entity) {
            // Vehicle instance owns its own load + build + livery logic
            entity.addToScene(dtScene, glbLoader);
        } else if (resolvedType === 'traffic') {
            glbLoader.load(glbFiles['traffic'], function(gltf) {
                dtScene.add(addGLTFModel(gltf, 4));
            }, undefined, function(err) {
                console.warn('[DT] Traffic GLTF failed, using procedural fallback:', err);
                dtScene.add(buildTrafficLight(extra || 'red'));
            });
        }
    }

    function closeDigitalTwin() {
        dtSection.classList.remove('active');
        cancelAnimationFrame(dtAnimId);
        orbit.autoRotate = false;
    }

    dtClose.addEventListener('click', closeDigitalTwin);
    document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeDigitalTwin(); });
    window.addEventListener('resize', resizeTwin);

    // Expose globally
    window.openDigitalTwin = openDigitalTwin;

    // Digital twin is now triggered via popup links (data-dt-open attribute)
    // handled by global click delegation in app.js

})();
