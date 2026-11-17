---
name: add-vehicle-part
description: Checklist for adding or renaming an interactive vehicle part (a new light, blinker, closure or RGB zone) end to end — GLB node name, constants, 3D viewer materials/animation, FSEQ channels, i18n labels, AI patterns, demos. Use whenever a new part ID is introduced or an existing one is renamed, split or restricted to one car model.
---

# Add (or change) a vehicle part

A part ID such as `reversing_lights` is a string key repeated across the app, the export, the backend and the demo data. There is no central registry. Missing one place fails silently: the part is clickable but never lights up, or lights up in 3D but not in the car.

Before editing, grep the repo for a similar existing part and copy its wiring:

```bash
grep -rn "reversing_lights" src backend/src scripts --include=*.js
```

## Checklist

**Model and identity**
- [ ] GLB: the Blender node is named exactly the part ID, or mapped in `nodeNameMap` in `src/ModelViewer.js` (search `const nodeNameMap`). See the `add-car-model` skill for GLB inspection.
- [ ] `src/constants.js`:
  - `INTERACTIVE_PARTS`, `PART_LABELS` (fallback label), `PART_ICONS`, `PART_COLORS`
  - the type sets it belongs to: `PULSE_PARTS`, `RGB_PARTS`, `JUNIPER_ONLY_PARTS`
  - check the `is*()` helpers. `isLight()` matches on the substring `light`, so a part named without it (like `rear_fog`) has to be listed explicitly.
  - for a closure: modes, durations, `CLOSURE_LIMITS` (also see the `tesla-closures` skill)

**3D viewer (`src/ModelViewer.js`, large file: grep, then read only the section)**
- [ ] material assignment (`partMaterials` / the headlight / taillight materials)
- [ ] `alwaysOnTopParts` if it is a light that z-fights with the body
- [ ] `lightDefs` (spotlight color and direction) for lights
- [ ] the emissive color table (search `side_repeater_left:    { r:`)
- [ ] `lightPartNames` / `retroPartNames` / `windowPartNames` used by the animation loop

**Export**
- [ ] `CHANNEL_MAP` / `CLOSURE_MAP` / RGB map in `src/fseqExport.js`. Follow the `fseq-export` skill for indexing rules. A channel above 47 is Juniper-only.

**Text**
- [ ] `parts.<partId>` in all 4 locales (`src/i18n/{en,fr,de,es}.json`), then run `node scripts/check-i18n.mjs`.

**AI generation (backend)**
- [ ] add it to `VALID_PARTS` in `backend/src/services/llmService.js`. That list **silently drops** AI events on any part not in it.
- [ ] add the part to the right groups at the top of `backend/src/services/patterns.js` (`ALL_LIGHTS`, `LEFT_LIGHTS`, `FRONT_LIGHTS`...), or to the Juniper-only groups
- [ ] if the LLM must know about it, update the pattern catalog / `JUNIPER_ADDENDUM` in `backend/src/services/llmService.js`
- [ ] add it to `VALID_PARTS` in `backend/tests/test-generation.js` (the `valid_parts` check)
- [ ] the backend deploys separately from the app: old app versions will receive this part from the AI. Make sure they ignore unknown parts, or gate it by `carModel`.

**Demos (optional)**
- [ ] `scripts/demo/generateDemos.js` and `src/demoShows/index.js` (`getDemoForCar`) if the demos should use it

## Done when

- The part is selectable and animates in the editor for the right car model(s) only
- `node scripts/check-i18n.mjs` passes
- An exported `.fseq` has the expected bytes on the expected channels (`scripts/fseq/analyze-fseq.js`)
- A real-car test is planned or done for any new channel (note it in the commit if it isn't done yet)
