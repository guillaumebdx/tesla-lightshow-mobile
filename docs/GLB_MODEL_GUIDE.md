# Tesla Model 3 — GLB 3D Model Documentation

> Complete guide for reusing the `tesla_20260303_geo.glb` model in a Three.js web project (e.g. landing page hero banner).

---

## 1. File

- **Path:** `assets/models/tesla_20260303_geo.glb`
- **Format:** glTF Binary (.glb)
- **Loader:** `GLTFLoader` from `three/examples/jsm/loaders/GLTFLoader`

```js
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

const loader = new GLTFLoader();
loader.load('/tesla_20260303_geo.glb', (gltf) => {
  const model = gltf.scene;
  scene.add(model);
});
```

---

## 2. Model Structure — Mesh Names

The GLB contains named meshes. Some Blender export names are non-standard and must be remapped.

### Node Name Remapping

| Blender node name         | Clean name             |
|--------------------------|------------------------|
| `blink_front_left002`    | `blink_front_left`     |
| `blink_front_left.002`   | `blink_front_left`     |
| `blin_back_right`        | `blink_back_right`     |
| `plaque`                 | `license_plate`        |
| `stop_light`             | `brake_lights`         |
| `anti_fog_back_left`     | `rear_fog`             |
| `anti_fog_back_right`    | `rear_fog`             |
| `side_clignoant_left`    | `side_repeater_left`   |
| `side_clignotant_right`  | `side_repeater_right`  |

### Part Name Resolution

Meshes are sometimes nested inside parent objects. To find a part name, walk up the hierarchy:

```js
const nodeNameMap = {
  'blink_front_left002': 'blink_front_left',
  'blink_front_left.002': 'blink_front_left',
  'blin_back_right': 'blink_back_right',
  'plaque': 'license_plate',
  'stop_light': 'brake_lights',
  'anti_fog_back_left': 'rear_fog',
  'anti_fog_back_right': 'rear_fog',
  'side_clignoant_left': 'side_repeater_left',
  'side_clignotant_right': 'side_repeater_right',
};

function getPartName(mesh) {
  let node = mesh;
  while (node) {
    const mapped = nodeNameMap[node.name] || node.name;
    if (KNOWN_PARTS.includes(mapped)) return mapped;
    node = node.parent;
  }
  return null;
}
```

---

## 3. All Interactive Parts

### Lights (emissive toggle)

| Part name              | Type           | Lit color   |
|------------------------|----------------|-------------|
| `light_left_front`     | Headlight      | `#ffffff`   |
| `light_right_front`    | Headlight      | `#ffffff`   |
| `light_left_back`      | Taillight      | `#ff0000`   |
| `light_right_back`     | Taillight      | `#ff0000`   |
| `brake_lights`         | Brake/stop     | `#ff0000`   |
| `rear_fog`             | Rear fog light | `#ff0000`   |
| `license_plate`        | Plate light    | `#ffffff`   |

### Blinkers / Turn signals (amber emissive toggle)

| Part name              | Type              | Lit color   |
|------------------------|-------------------|-------------|
| `blink_front_left`     | Front left turn   | `#ffaa00`   |
| `blink_front_right`    | Front right turn  | `#ffaa00`   |
| `blink_back_left`      | Rear left turn    | `#ffaa00`   |
| `blink_back_right`     | Rear right turn   | `#ffaa00`   |
| `side_repeater_left`   | Side marker left  | `#ffaa00`   |
| `side_repeater_right`  | Side marker right | `#ffaa00`   |

### Windows (animated slide)

| Part name              | Type              |
|------------------------|-------------------|
| `window_left_front`    | Front left window |
| `window_right_front`   | Front right window|
| `window_left_back`     | Rear left window  |
| `window_right_back`    | Rear right window |

### Cosmetic windows (not animated, just material)

| Part name              | Type              |
|------------------------|-------------------|
| `windshield_front`     | Windshield        |
| `windshield_back`      | Rear windshield   |

### Closures (mechanical animation)

| Part name    | Type           |
|-------------|----------------|
| `retro_left` | Left mirror   |
| `retro_right`| Right mirror  |
| `trunk`      | Trunk lid     |
| `flap`       | Charge port   |

---

## 4. Materials

### Body

```js
new THREE.MeshStandardMaterial({
  color: 0x222222,
  metalness: 0.7,
  roughness: 0.2,
});
```

### Windows (glass)

```js
new THREE.MeshStandardMaterial({
  color: 0x445566,
  metalness: 0.7,
  roughness: 0.1,
  opacity: 0.75,
  transparent: true,
});
```

### Lights OFF (dark, idle state)

```js
// Headlights off
new THREE.MeshStandardMaterial({
  color: 0x333333,
  metalness: 0.5,
  roughness: 0.15,
  emissive: 0x000000,
  emissiveIntensity: 0,
});

// Taillights off
new THREE.MeshStandardMaterial({
  color: 0x331111,
  metalness: 0.5,
  roughness: 0.15,
  emissive: 0x000000,
  emissiveIntensity: 0,
});

// Blinkers off
new THREE.MeshBasicMaterial({
  color: 0x332200,
});
```

### Lights ON (bright emissive)

```js
// Headlights on (white)
new THREE.MeshStandardMaterial({
  color: 0xffffff,
  metalness: 0.2,
  roughness: 0.05,
  emissive: 0xffffff,
  emissiveIntensity: 1.5,
});

// Taillights on (red)
new THREE.MeshStandardMaterial({
  color: 0xff0000,
  metalness: 0.2,
  roughness: 0.05,
  emissive: 0xff0000,
  emissiveIntensity: 1.5,
});

// Blinkers on (amber)
new THREE.MeshStandardMaterial({
  color: 0xffaa00,
  metalness: 0.2,
  roughness: 0.05,
  emissive: 0xffaa00,
  emissiveIntensity: 1.5,
});
```

---

## 5. Toggling Lights (Blink Effect)

Swap the mesh material between OFF and ON states. For blinking, alternate at a set frequency:

```js
// Build a lookup: partName → mesh
const partMeshes = {};
model.traverse((child) => {
  if (child.isMesh) {
    const name = getPartName(child);
    if (name) partMeshes[name] = child;
  }
});

// In your animation loop:
function animate() {
  requestAnimationFrame(animate);
  const time = performance.now() / 1000;

  // Example: blink all front lights at ~6 Hz
  const on = Math.sin(time * 12) > 0;

  if (partMeshes['light_left_front']) {
    partMeshes['light_left_front'].material = on ? headlightOnMat : headlightOffMat;
  }

  renderer.render(scene, camera);
}
```

### Smooth intensity blinking (advanced)

Instead of hard swap, interpolate between OFF and ON colors/emissive per frame:

```js
const intensity = (Math.sin(time * 12) + 1) / 2; // 0..1

// Clone the ON material once per mesh
if (!mesh.userData._dynamicMat) {
  mesh.userData._dynamicMat = litMaterial.clone();
}
const mat = mesh.userData._dynamicMat;

// Interpolate color
mat.color.r = offColor.r + (onColor.r - offColor.r) * intensity;
mat.color.g = offColor.g + (onColor.g - offColor.g) * intensity;
mat.color.b = offColor.b + (onColor.b - offColor.b) * intensity;

// Interpolate emissive
mat.emissive.r = onEmissive.r * intensity;
mat.emissive.g = onEmissive.g * intensity;
mat.emissive.b = onEmissive.b * intensity;
mat.emissiveIntensity = 1.5 * intensity;

mesh.material = mat;
```

---

## 6. SpotLights for Realism

Adding SpotLights at each light mesh position projects light onto the ground and nearby surfaces, greatly enhancing realism.

```js
const lightDefs = {
  light_left_front:    { color: 0xffffff, dir: [0, -0.3, 1] },
  light_right_front:   { color: 0xffffff, dir: [0, -0.3, 1] },
  light_left_back:     { color: 0xff2200, dir: [0, -0.3, -1] },
  light_right_back:    { color: 0xff2200, dir: [0, -0.3, -1] },
  blink_front_left:    { color: 0xffaa00, dir: [-0.5, -0.3, 1] },
  blink_front_right:   { color: 0xffaa00, dir: [0.5, -0.3, 1] },
  blink_back_left:     { color: 0xffaa00, dir: [-0.5, -0.3, -1] },
  blink_back_right:    { color: 0xffaa00, dir: [0.5, -0.3, -1] },
  license_plate:       { color: 0xffffff, dir: [0, -1, -0.3] },
  brake_lights:        { color: 0xff2200, dir: [0, -0.3, -1] },
  rear_fog:            { color: 0xff2200, dir: [0, -0.3, -1] },
  side_repeater_left:  { color: 0xffaa00, dir: [-1, -0.3, 0] },
  side_repeater_right: { color: 0xffaa00, dir: [1, -0.3, 0] },
};

// For each light mesh found in the model:
Object.entries(lightDefs).forEach(([partName, def]) => {
  const mesh = partMeshes[partName];
  if (!mesh) return;

  mesh.geometry.computeBoundingBox();
  const center = new THREE.Vector3();
  mesh.geometry.boundingBox.getCenter(center);
  mesh.localToWorld(center);

  const spot = new THREE.SpotLight(def.color, 0, 15, Math.PI / 6, 0.5, 2);
  spot.position.copy(center);
  const target = center.clone().add(new THREE.Vector3(...def.dir));
  spot.target.position.copy(target);
  scene.add(spot);
  scene.add(spot.target);

  // Store reference — set spot.intensity in animation loop when light is ON
});
```

In your animation loop, set `spot.intensity = 5` when the light is ON, `0` when OFF.

---

## 7. Centering & Scaling the Model

The raw model is not centered at origin. Always auto-center and scale:

```js
const box = new THREE.Box3().setFromObject(model);
const center = box.getCenter(new THREE.Vector3());
const size = box.getSize(new THREE.Vector3());
const maxDim = Math.max(size.x, size.y, size.z);
const scale = 4.5 / maxDim; // adjust 4.5 to fit your scene

model.scale.setScalar(scale);
model.position.sub(center.multiplyScalar(scale));
model.position.y = -size.y * scale / 2; // sit on ground plane
```

---

## 8. Scene Lighting (Studio Setup)

For a good-looking render matching the app:

```js
scene.add(new THREE.AmbientLight(0xffffff, 0.9));
scene.add(new THREE.HemisphereLight(0xffffff, 0x444466, 0.7));

// Key light (main shadow)
const key = new THREE.DirectionalLight(0xffffff, 1.0);
key.position.set(4, 8, 5);
scene.add(key);

// Fill left
const fill = new THREE.DirectionalLight(0xeeeeff, 0.7);
fill.position.set(-4, 6, 4);
scene.add(fill);

// Back light (rim)
const back = new THREE.DirectionalLight(0xccccff, 0.6);
back.position.set(0, 5, -6);
scene.add(back);

// Side fills
scene.add(new THREE.PointLight(0xffffff, 0.5, 20).position.set(-6, 2, 0));
scene.add(new THREE.PointLight(0xffffff, 0.5, 20).position.set(6, 2, 0));

// Bottom fill (reduces harsh underside shadows)
const bottom = new THREE.PointLight(0xddddef, 0.4, 15);
bottom.position.set(0, -3, 0);
scene.add(bottom);

// Front & back low fills
const front = new THREE.DirectionalLight(0xffffff, 0.5);
front.position.set(0, 3, 8);
scene.add(front);
const backLow = new THREE.DirectionalLight(0xddddff, 0.4);
backLow.position.set(0, 2, -8);
scene.add(backLow);
```

---

## 9. Renderer Settings

```js
renderer.setClearColor(0x0a0a1a, 1); // dark background
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.shadowMap.enabled = true; // optional, for ground shadows
```

---

## 10. Auto-Rotate (Hero Banner)

Simple slow rotation for a landing page:

```js
function animate() {
  requestAnimationFrame(animate);
  model.rotation.y += 0.005; // ~0.3 RPM
  renderer.render(scene, camera);
}
```

Good camera position for a hero shot:

```js
camera.position.set(-1.8, 1.2, 2.5); // 3/4 front-left angle
camera.lookAt(0, 0, 0);
```

---

## 11. Chaotic Light Show Demo Animation

Random blinking across all lights (used in the app's home screen):

```js
const LIGHT_PARTS = [
  'light_left_front', 'light_right_front',
  'light_left_back', 'light_right_back',
  'blink_front_left', 'blink_front_right',
  'blink_back_left', 'blink_back_right',
  'license_plate', 'brake_lights', 'rear_fog',
  'side_repeater_left', 'side_repeater_right',
];

// Random phase/speed per light
const phases = LIGHT_PARTS.map(() => Math.random() * Math.PI * 2);
const speeds = LIGHT_PARTS.map(() => 8 + Math.random() * 12);

function animate() {
  requestAnimationFrame(animate);
  const t = performance.now() / 1000;

  LIGHT_PARTS.forEach((part, i) => {
    const mesh = partMeshes[part];
    if (!mesh) return;
    const on = Math.sin(t * speeds[i] + phases[i]) > 0;
    mesh.material = on ? getOnMaterial(part) : getOffMaterial(part);
  });

  renderer.render(scene, camera);
}
```

---

## 12. Window Dance Animation (Z-axis Slide)

Windows slide down along their local Z axis:

```js
// Setup (once after model load)
const windowData = {};
['window_left_front', 'window_right_front', 'window_left_back', 'window_right_back'].forEach((p) => {
  const mesh = partMeshes[p];
  if (!mesh) return;
  mesh.geometry.computeBoundingBox();
  const travelZ = mesh.geometry.boundingBox.max.z - mesh.geometry.boundingBox.min.z;
  windowData[p] = { mesh, initMatrix: mesh.matrix.clone(), travelZ };
  mesh.matrixAutoUpdate = false;
});

// In animation loop:
// progress = 0 (closed) to 1 (fully open)
const slideDown = new THREE.Matrix4().makeTranslation(0, 0, -wd.travelZ * progress);
wd.mesh.matrix.copy(wd.initMatrix.clone().multiply(slideDown));
```

For an oscillating "dance" effect:

```js
const DANCE_CYCLE_MS = 3500;
const REST_OPEN = 0.7; // how far down it rests when "dancing"
const phase = (time * 1000 / DANCE_CYCLE_MS) * Math.PI * 2 + offset;
const wave = (REST_OPEN - 0.3) * (0.5 - 0.5 * Math.cos(phase));
const progress = REST_OPEN - wave;
```

---

## 13. Trunk Animation (Y-axis Pivot)

The trunk rotates around a pivot point at its hinge:

```js
// Setup
const mesh = partMeshes['trunk'];
mesh.geometry.computeBoundingBox();
const bb = mesh.geometry.boundingBox;
const pivotLocal = new THREE.Vector3(bb.min.x, (bb.min.y + bb.max.y) / 2, bb.max.z);
mesh.matrixAutoUpdate = false;
const initMatrix = mesh.matrix.clone();

// In animation loop:
const OPEN_ANGLE = -Math.PI / 4; // ~45 degrees
const yAxis = new THREE.Vector3(0, 1, 0);

const toOrigin = new THREE.Matrix4().makeTranslation(-pivotLocal.x, -pivotLocal.y, -pivotLocal.z);
const rot = new THREE.Matrix4().makeRotationAxis(yAxis, OPEN_ANGLE * progress);
const fromOrigin = new THREE.Matrix4().makeTranslation(pivotLocal.x, pivotLocal.y, pivotLocal.z);

mesh.matrix.copy(initMatrix.clone().multiply(fromOrigin).multiply(rot).multiply(toOrigin));
```

---

## 14. Retro Mirror Fold (Local Rotation)

Mirrors fold inward around their geometry center:

```js
const FOLD_ANGLE = Math.PI / 3; // 60 degrees
const SLIDE = 0.15; // small inward slide

// Fold direction: +1 for left mirror (folds right), -1 for right mirror
const foldDir = partName === 'retro_left' ? 1 : -1;

// progress = 0 (open) to 1 (fully folded)
const toOrigin = new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z);
const rot = new THREE.Matrix4().makeRotationY(FOLD_ANGLE * progress * foldDir);
const slide = new THREE.Matrix4().makeTranslation(SLIDE * progress * foldDir, 0, 0);
const fromOrigin = new THREE.Matrix4().makeTranslation(center.x, center.y, center.z);

mesh.matrix.copy(initMatrix.clone().multiply(fromOrigin).multiply(slide).multiply(rot).multiply(toOrigin));
```

---

## 15. Charge Port Flap

The flap mesh is embedded under the body. If you want it visible when highlighted or open, use `depthTest: false`:

```js
new THREE.MeshStandardMaterial({
  color: 0x22ddff,
  emissive: 0x00aaff,
  emissiveIntensity: 1.0,
  depthTest: false,
  transparent: true,
  opacity: 0.85,
});
```

Open animation uses a pivot rotation similar to the trunk, with `FLAP_OPEN_ANGLE = -Math.PI / 3`.

---

## 16. Tips for a Good Hero Banner Render

1. **Use ACESFilmicToneMapping** with exposure 1.2 — gives cinematic look
2. **Dark background** (`0x0a0a1a`) makes the car pop
3. **Multiple fill lights** avoid harsh shadows — the studio setup in section 8 is battle-tested
4. **Slow auto-rotate** (~0.005 rad/frame) feels premium
5. **Enable tone mapping** — without it, emissive lights look flat
6. **Camera at 3/4 angle** (`-1.8, 1.2, 2.5`) is the most flattering
7. **Add SpotLights** at light mesh positions for ground glow when lights are ON
8. **Clone materials** for dynamic intensity — never modify shared material instances
9. **Use `matrixAutoUpdate = false`** on animated parts (windows, trunk, mirrors) and set `.matrix` directly for precise control
10. **For web (non-React Native):** use standard Three.js `WebGLRenderer` — all the material/mesh logic is identical, only the renderer setup differs

---

## 17. Quick Reference — Minimal Web Setup

```html
<canvas id="car"></canvas>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const canvas = document.getElementById('car');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.setSize(canvas.clientWidth, canvas.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
camera.position.set(-1.8, 1.2, 2.5);
camera.lookAt(0, 0, 0);

// Lighting (simplified)
scene.add(new THREE.AmbientLight(0xffffff, 0.9));
scene.add(new THREE.HemisphereLight(0xffffff, 0x444466, 0.7));
const key = new THREE.DirectionalLight(0xffffff, 1.0);
key.position.set(4, 8, 5);
scene.add(key);

new GLTFLoader().load('/tesla_20260303_geo.glb', (gltf) => {
  const model = gltf.scene;

  // Center & scale
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const s = 3 / Math.max(size.x, size.y, size.z);
  model.scale.setScalar(s);
  model.position.sub(center.multiplyScalar(s));

  // Apply materials (see sections 4-5)
  // ...

  scene.add(model);

  function animate() {
    requestAnimationFrame(animate);
    model.rotation.y += 0.005;
    renderer.render(scene, camera);
  }
  animate();
});
</script>
```
