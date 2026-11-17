---
name: tesla-closures
description: Rules for Tesla mechanical closures in light shows (mirrors, windows, liftgate/trunk, charge port flap) — command bytes, per-show usage limits, movement durations, Open-before-Dance rule, thermal limits. Use when touching closure logic in the editor (ModelViewer, PartOptionsPanel, AudioTimeline limits), closure export in fseqExport.js, closure patterns in backend/src/services/patterns.js, or demo show generation.
---

# Tesla closures

Closures move physical parts of a customer's car. A rule violation can stop the show, or make the car ignore commands for the rest of it. The limits are hardware limits, not product choices.

Full reference: `reference/closures.md` (French, includes the measured durations and retro-engineering results).

## Source of truth in code

`src/constants.js` holds `RETRO_MODES`, `WINDOW_MODES`, `TRUNK_MODES`, `FLAP_MODES`, their `*_DURATIONS`, `WINDOW_MAX_DANCE_MS`, `CLOSURE_LIMITS` and `closureCommandCost()`. If the doc and the code disagree, the code is what ships. Fix whichever is wrong, and say which one you fixed.

## Rules

| Closure | Part IDs | App modes | Limit / show | Channel (0-idx) |
|---|---|---|---|---|
| Mirrors | `retro_left`, `retro_right` | open, close, roundtrip (costs 2) | 20 each | 34, 35 |
| Windows | `window_{left,right}_{front,back}` | dance only | 6 each, ~30 s dance max | 36-39 |
| Liftgate | `trunk` | open (~13 s), close (~4 s), dance | 6 | 40 |
| Charge port | `flap` | open, close, rainbow (LED dance) | 3 | 45 |

- Command bytes: Idle 0, Open 64, Dance 128, Close 192, Stop 255.
- **Open before Dance**: the trunk must be open (and finished opening, ~13 s) before a Dance. Windows are the exception.
- Mirrors do not support Dance. "Roundtrip" is Close + Open and costs 2 commands.
- The car opens all windows at show start. Close (192) raises a window.
- Commands that are too close together still count toward the limit.
- The flap closes by itself after 2 min open.

## Where closure rules are enforced (keep them in sync)

1. Editor UI: limit counter and blocking (`CLOSURE_LIMITS`, `closureCommandCost` used in `ModelViewer.js` / `PartOptionsPanel.js`).
2. Export: `CLOSURE_MAP` + `writeClosure()` in `src/fseqExport.js` (roundtrip = Close then Open, split at midpoint).
3. AI generation: closure patterns in `backend/src/services/patterns.js`. The AI is intentionally more conservative than the app. `backend/tests/test-generation.js` warns above 12 mirror events, 3 trunk or 3 flap events.
4. Demo shows: `scripts/demo/generateDemos.js` hardcodes the same limits in its header comment and logic.

If you change a limit or duration, update all four, plus `reference/closures.md`.
