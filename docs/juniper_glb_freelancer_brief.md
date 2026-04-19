# Brief — Tesla Model Y Juniper GLB Rework

## Context

I am building a mobile app (React Native + Three.js) that lets Tesla owners design custom light shows on a 3D model of their car. The 3D model must be **interactive** — every light, window, mirror and closure on the car has to be a **separately named mesh** that my code can detect and animate individually.

I already have a working Model 3 GLB. I now need to prepare a **Model Y Juniper (2025 refresh)** GLB the same way.

You will receive one input file and must deliver one output file that meets all the specifications below.

---

## Input

- File: `model_y_juniper.glb`
- Current problems:
  1. All the mesh names are generic Blender names (`Plane_045.001`, `Plane_072.001`, `COCKPIT_HR.001`, …). My code cannot identify which mesh is which light or closure.
  2. Some logical parts are merged into a single mesh (e.g. all four windows are one object). These must be split apart.
  3. Some meshes have confusing names (e.g. `Hyundai KONA n-line_005.001`, `Tesla Model 3 Performance_001`). Whoever created this model probably copy-pasted primitives from other projects they had made. These meshes still belong to this Model Y — **do not delete them**, just rename them according to the list below (or leave them as-is if they are part of the body).

---

## Output — deliverable

A single file: **`model_y_juniper_clean.glb`**

- **Format**: glTF 2.0 binary (`.glb`)
- **Optimize the file size as much as possible** without destroying the silhouette of the car. The current file is very heavy. I will compress it further on my side, but please reduce the geometry where you can.
- **No Draco / Meshopt compression** (React Native can't decode it)
- **No WebP textures**
- **Meshes must be separated and renamed exactly** as described in the list below.
- **Keep every mesh** — I do not want anything deleted. If a mesh doesn't match one of the named parts below, leave it under its current name (or merge it into the `body` node).

---

## Required mesh list (exact node names — case sensitive)

Every one of these must be a **separate node** in the GLB scene graph, with the exact name shown. My code matches the node name (not the mesh name) via a string comparison, so spelling and underscores must be identical.

### Body / base
| Node name | Description |
|---|---|
| `body` | Full car body shell (everything structural that is not one of the named parts below). |

### Head / tail lights
On the Model Y Juniper, the headlights and tail lights are **both present AND distinct from the LED light bars**. The LED bars are thin horizontal strips across the front/rear; the headlight and tail light units sit separately below (front) and on the sides (rear). You must keep both as separate named meshes.

| Node name | Description |
|---|---|
| `light_left_front` | Left headlight unit (the projector housing sitting below the front LED bar) |
| `light_right_front` | Right headlight unit |
| `light_left_back` | Left tail light cluster (on the left rear quarter, separate from the rear LED bar between them) |
| `light_right_back` | Right tail light cluster |

### Turn signals
| Node name | Description |
|---|---|
| `blink_front_left` | Front left turn signal |
| `blink_front_right` | Front right turn signal |
| `blink_back_left` | Rear left turn signal |
| `blink_back_right` | Rear right turn signal |
| `side_repeater_left` | Side turn repeater on the left front fender |
| `side_repeater_right` | Side turn repeater on the right front fender |

### Other lights
| Node name | Description |
|---|---|
| `license_plate` | License plate illumination strip (rear) |
| `brake_lights` | Central high-mounted brake light (on the rear spoiler/roof, separate from the tail lights) |
| `rear_fog` | Rear fog light (bottom center of rear bumper) |

### Windows — MUST be split into 4 separate meshes
Currently the windows are one merged mesh. Please separate them:
| Node name | Description |
|---|---|
| `window_left_front` | Front left door window glass |
| `window_right_front` | Front right door window glass |
| `window_left_back` | Rear left door window glass |
| `window_right_back` | Rear right door window glass |

(Do not include the windshield or rear glass in these — they must NOT be part of these 4 nodes, because the app animates these 4 door windows individually as closures.)

### Mirrors
| Node name | Description |
|---|---|
| `retro_left` | Left side mirror assembly (the full mirror that folds in/out) |
| `retro_right` | Right side mirror assembly |

### Closures
| Node name | Description |
|---|---|
| `trunk` | Rear liftgate / trunk lid (the moving panel, not the bumper) |
| `flap` | Charge port flap (rear left quarter panel) |

---

## Juniper-specific parts — NEW, must be created

The Model Y Juniper has new lighting hardware that does not currently exist as separate meshes in the GLB. You need to **model them** (simple geometry is fine) and place them correctly on the car.

### Front light bar — 60 individually addressable LEDs
A thin horizontal light bar runs across the front of the car, above the headlights. It contains **60 white LEDs total, 30 on the left half + 30 on the right half**.

Create **60 separate meshes**, each as a small rectangular segment representing one LED, named:

```
front_bar_led_00, front_bar_led_01, ..., front_bar_led_59
```

- `front_bar_led_00` = leftmost LED
- `front_bar_led_59` = rightmost LED
- All 60 LEDs should be the same size, evenly spaced along the bar
- Use 2-digit zero-padding: `_00`, `_01`, …, `_09`, `_10`, …, `_59`
- Each LED should be a simple plane or thin box (~2–12 triangles)

### Rear light bar — 52 individually addressable LEDs
A red light bar runs across the rear of the car between the two tail light clusters. It contains **52 red LEDs total**.

```
rear_bar_led_00, rear_bar_led_01, ..., rear_bar_led_51
```

- `rear_bar_led_00` = leftmost
- `rear_bar_led_51` = rightmost
- Same sizing/spacing rule

### Interior RGB — 6 segments
The Juniper has 6 RGB interior ambient light segments. Model them as 6 thin light strips inside the cabin, along the dashboard and door cards:

```
interior_rgb_0, interior_rgb_1, interior_rgb_2, interior_rgb_3, interior_rgb_4, interior_rgb_5
```

Suggested placement (left to right when viewed from the front):
- `interior_rgb_0` — driver door card strip
- `interior_rgb_1` — left dashboard strip
- `interior_rgb_2` — center dashboard strip (left half)
- `interior_rgb_3` — center dashboard strip (right half)
- `interior_rgb_4` — right dashboard strip
- `interior_rgb_5` — passenger door card strip

These should be visible from outside through the windows (so the camera can see them when the car is displayed).

---

## Geometry notes

- Aim for a reasonable triangle count for the body (use Blender's **Decimate modifier** in Collapse mode where the detail is excessive).
- The 60 + 52 LED meshes and the 6 interior strips should each be **very simple** (flat plane or thin box).
- Apply all transforms (location, rotation, scale) before export.
- Merge duplicate vertices on the body.

---

## Export settings (Blender → glTF 2.0)

- Format: **glTF Binary (.glb)**
- Transform: **+Y Up**
- Geometry: Apply Modifiers ✅, UVs ✅, Normals ✅, Tangents ❌, Vertex Colors ❌
- Materials: Export (basic PBR is fine)
- Compression: **OFF** (no Draco)
- Animation: not needed

---

## Validation checklist before delivery

Before sending the file back, please confirm:

- [ ] File opens in https://gltf-viewer.donmccurdy.com/ without errors
- [ ] Scene graph shows all the node names from the tables above, spelled exactly
- [ ] Windows are 4 distinct nodes (click each — only one window glass highlights at a time)
- [ ] Mirrors are 2 distinct nodes
- [ ] Trunk is its own node (not merged into body)
- [ ] Charge port flap is its own node
- [ ] Headlights (`light_left_front`, `light_right_front`) are distinct from the front LED bar
- [ ] Tail lights (`light_left_back`, `light_right_back`) are distinct from the rear LED bar
- [ ] All 60 `front_bar_led_XX` nodes are present and visible
- [ ] All 52 `rear_bar_led_XX` nodes are present and visible
- [ ] All 6 `interior_rgb_X` nodes are present
- [ ] No Draco / Meshopt compression

---

## Reference — what the app will do with these names

For your understanding:
- Every mesh whose node name matches one of the above will be given a specific material (color, glow) at runtime and animated in sync with music.
- Unknown node names fall back to a default grey body material and are not selectable.
- The front/rear LED bars will animate patterns (chase, sweep, strobe) — so each LED really does need to be a separate mesh that can be colored individually.
