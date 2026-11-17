---
name: fseq-export
description: Tesla FSEQ v2 binary export and light channel mapping. Use when editing src/fseqExport.js, changing which FSEQ channels a part drives, debugging "light X doesn't turn on in the car", generating diagnostic .fseq files for real-car tests, or answering questions about Tesla light show channels (48-channel layout, Model Y Juniper 200-channel layout, light bars, interior RGB, ramping vs boolean lights).
---

# FSEQ export & Tesla channel mapping

The exported `.fseq` is what actually runs on the customer's car. A wrong byte here is invisible in the app and only shows up in a parking lot. Treat this area as high-risk.

## Where things live

| What | Where |
|------|-------|
| Encoder (header, frame compilation, light/closure/RGB writers) | `src/fseqExport.js` |
| Part -> channel tables | `CHANNEL_MAP` (lights), `CLOSURE_MAP` (closures), RGB map in `src/fseqExport.js` |
| Channel count per car (48 or 200) | `src/carModels.js` (`channelCount`) |
| Part lists, effect enums, closure modes | `src/constants.js` |
| Offline FSEQ inspection / validation | `scripts/fseq/analyze-fseq.js`, `scripts/fseq/validate-export.js` |
| Diagnostic .fseq generators (one channel at a time, for real-car tests) | `scripts/fseq/generate-diagnostic*.js`, `scripts/fseq/generate_test_fseq.mjs` |

## Reference material (read the one you need)

- `reference/fseq-format.md` — the format model: frames x channels, 20 ms, everything compiled to bytes, no events in the file.
- `reference/channels-48.md` — full 48-channel map (lights 0-29, closures 30-47), what was confirmed on a real Model 3, model differences, ramping vs boolean behavior.
- `reference/juniper-200-channels.md` — Model Y Juniper 200-channel layout: front bar (60 LEDs), rear bar (52 LEDs), interior RGB, and **§13: the light-bar power-gating workaround** (bars stay dark unless Signature/Tail channels are co-driven).
- `scripts/fseq/README.md` — raw results of the Model 3 retro-engineering sessions.
- Closure command bytes and limits: see the `tesla-closures` skill.

## Invariants (do not break)

- **Indexing:** the code uses **0-indexed** bytes. xLights and `juniper-200-channels.md` use **1-indexed** channel numbers. FSEQ byte N = xLights channel N+1. Most past bugs in this area came from mixing the two.
- **Frame step is 20 ms**, file is FSEQ V2 **uncompressed**. Tesla's validator accepts only channel_count 48 or 200.
- Channel count comes from `getChannelCount(carModel)`. Never hardcode 48. Juniper-only channels (>= 48) must never be written in a 48-channel file.
- Lights on Model 3/Y are boolean above ~50% (byte > 127). Only some front channels ramp. The light bars and interior RGB take real 0-255 values.
- `light_center_front` / `light_center_back` intentionally include Signature (idx 4,5) / Tail (idx 25,26) channels. That is the §13 workaround. Do not "clean it up".
- Closures write **command bytes** (0/64/128/192/255), not brightness. See `tesla-closures`.

## Verify a change

1. Run `node scripts/fseq/validate-export.js` and `node scripts/fseq/analyze-fseq.js <file.fseq>`. Both still assume 48 channels (`CHANNEL_COUNT = 48`): fine for Model 3, update them before trusting them on a Juniper file.
2. For a real export: export from the app, then check it with the official validator (https://validator.t2k.dev, or `validator.py` in teslamotors/light-show).
3. Anything touching a new channel needs a real-car test before release. Generate a diagnostic file (`node scripts/fseq/generate-diagnostic.js`, output lands next to the script) and say in the PR/commit that it is unconfirmed until tested. Record the results in `reference/channels-48.md` or `reference/juniper-200-channels.md`.

## Adding a part's channels

Mapping a new part is only one step of the full checklist in the `add-vehicle-part` skill. Follow that skill. This one only covers the channel side.
