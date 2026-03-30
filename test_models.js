// Mock THREE.js minimally
var THREE = {
    Group: function() {
        this.children = [];
        this.position = {x:0,y:0,z:0,set:function(){}};
        this.rotation = {x:0,y:0,z:0,set:function(){}};
        this.scale = {x:1,y:1,z:1,set:function(){}};
    },
    Mesh: function(g,m) {
        this.geometry = g; this.material = m;
        this.position = {x:0,y:0,z:0,set:function(){}};
        this.rotation = {x:0,y:0,z:0,set:function(){}};
        this.scale = {x:1,y:1,z:1,set:function(){}};
    },
    Vector3: function(x,y,z) { this.x=x; this.y=y; this.z=z; },
    Euler: function(x,y,z) { this.x=x; this.y=y; this.z=z; },
    Shape: function() {
        this.moveTo = function(){return this;}.bind(this);
        this.lineTo = function(){return this;}.bind(this);
        this.quadraticCurveTo = function(){return this;}.bind(this);
        this.closePath = function(){return this;}.bind(this);
    },
    ShapeGeometry: function() { this.type = 'ShapeGeometry'; },
    ExtrudeGeometry: function() { this.type = 'ExtrudeGeometry'; },
    BoxGeometry: function() { this.type = 'BoxGeometry'; },
    CylinderGeometry: function() { this.type = 'CylinderGeometry'; },
    SphereGeometry: function() { this.type = 'SphereGeometry'; },
    PlaneGeometry: function() { this.type = 'PlaneGeometry'; },
    TorusGeometry: function() { this.type = 'TorusGeometry'; },
    CircleGeometry: function() { this.type = 'CircleGeometry'; },
    GridHelper: function() { this.isGridHelper = true; },
    MeshStandardMaterial: function(o) { this.color = o && o.color; },
    MeshBasicMaterial: function(o) { this.color = o && o.color; },
    DoubleSide: 2,
};
THREE.Group.prototype.add = function(c) { this.children.push(c); };
THREE.Group.prototype.clone = function() { return new THREE.Group(); };
THREE.Mesh.prototype.clone = function() { return new THREE.Mesh(this.geometry, this.material); };

// Extract and eval the model code
var fs = require('fs');
var html = fs.readFileSync('index.html', 'utf8');

var match = html.match(/<script>\s*\/\/ ══+\s*\/\/ DIGITAL TWIN([\s\S]*?)<\/script>/);
if (!match) { console.log("Could not find IIFE"); process.exit(1); }
var code = match[1];

var matStart = code.indexOf('// ── Materials (CAD-quality PBR)');
var wireStart = code.indexOf('// ── Open / Close');
if (matStart < 0 || wireStart < 0) { console.log("Could not find code sections"); process.exit(1); }

var funcCode = code.substring(matStart, wireStart);
console.log("Extracted " + funcCode.length + " chars of function code");

try {
    eval(funcCode);
    console.log("Function definitions: OK");
} catch(e) {
    console.log("Function definitions ERROR: " + e.message);
    process.exit(1);
}

// Test each builder
[
    ['buildPoliceCar', function() { return buildPoliceCar(); }],
    ['buildAmbulance', function() { return buildAmbulance(); }],
    ['buildSchoolBus', function() { return buildSchoolBus(); }],
    ['buildTrafficLight("red")', function() { return buildTrafficLight('red'); }],
    ['buildTrafficLight("green")', function() { return buildTrafficLight('green'); }],
].forEach(function(b) {
    try {
        var result = b[1]();
        console.log(b[0] + ": OK (" + result.children.length + " children)");
    } catch(e) {
        console.log(b[0] + ": RUNTIME ERROR -> " + e.message);
        console.log("  " + e.stack.split('\n').slice(0,5).join('\n  '));
    }
});
