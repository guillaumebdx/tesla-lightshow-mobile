/**
 * Check generated events against the app's own rules (src/constants.js):
 * valid parts per car, event fields, closure command limits, trunk Open before
 * Dance, window dance thermal budget, unique ids, pulse only on pulse parts.
 * Returns a list of problems (empty = OK).
 */

const fs = require('fs');
const path = require('path');

// src/constants.js is an app (ESM + Metro require() for icons) module: evaluate
// it with require() stubbed and `export` stripped to read the real values.
let constants = null;
function loadConstants() {
  if (constants) return constants;
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'constants.js'), 'utf8');
  const names = [...src.matchAll(/^export\s+(?:const|function)\s+(\w+)/gm)].map((m) => m[1]);
  const body = src.replace(/^export\s+/gm, '');
  // eslint-disable-next-line no-new-func
  constants = new Function('require', `${body}\nreturn { ${names.join(', ')} };`)(() => null);
  return constants;
}

const MODEL3_ONLY = new Set(['left_high_light', 'right_high_light', 'left_signature_light', 'right_signature_light']);

async function validateEvents(events, { carModel = 'model_3', durationMs }) {
  const C = await loadConstants();
  const problems = [];
  const isJuniper = carModel === 'model_y_juniper';
  const ids = new Set();
  const closureCount = {};
  let windowDanceMs = 0;

  for (const e of events) {
    const where = `${e.id || '?'} ${e.part} ${e.startMs}-${e.endMs}`;
    if (!C.INTERACTIVE_PARTS.includes(e.part)) problems.push(`unknown part: ${where}`);
    if (!isJuniper && C.JUNIPER_ONLY_PARTS.has(e.part)) problems.push(`Juniper-only part on Model 3: ${where}`);
    if (isJuniper && MODEL3_ONLY.has(e.part)) problems.push(`Model 3-only part on Juniper: ${where}`);
    if (!Number.isInteger(e.startMs) || !Number.isInteger(e.endMs) || e.startMs < 0 || e.endMs <= e.startMs) problems.push(`bad times: ${where}`);
    if (durationMs && e.endMs > durationMs) problems.push(`ends after the track: ${where}`);
    if (!['solid', 'blink', 'pulse'].includes(e.effect)) problems.push(`bad effect ${e.effect}: ${where}`);
    if (e.effect === 'pulse' && !C.PULSE_PARTS.has(e.part)) problems.push(`pulse on non-pulse part: ${where}`);
    if (typeof e.power !== 'number' || e.power < 1 || e.power > 100) problems.push(`bad power ${e.power}: ${where}`);
    if (!e.id || ids.has(e.id)) problems.push(`missing or duplicate id: ${where}`);
    ids.add(e.id);
    if (C.isClosure(e.part)) {
      closureCount[e.part] = (closureCount[e.part] || 0) + C.closureCommandCost(e.part, e);
      if (C.isWindow(e.part)) windowDanceMs = Math.max(windowDanceMs, 0);
    }
  }

  for (const [part, n] of Object.entries(closureCount)) {
    if (n > C.CLOSURE_LIMITS[part]) problems.push(`closure limit: ${part} uses ${n} > ${C.CLOSURE_LIMITS[part]}`);
  }

  // Window dance thermal budget (~30 s per show), measured on one window.
  windowDanceMs = events.filter((e) => e.part === 'window_left_front').reduce((s, e) => s + (e.endMs - e.startMs), 0);
  if (windowDanceMs > C.WINDOW_MAX_DANCE_MS) problems.push(`window dance ${windowDanceMs} ms > ${C.WINDOW_MAX_DANCE_MS}`);

  // Trunk: a Dance must come after a completed Open.
  const trunk = events.filter((e) => e.part === 'trunk').sort((a, b) => a.startMs - b.startMs);
  let open = false;
  for (const e of trunk) {
    if (e.trunkMode === 'trunk_open') open = e.endMs;
    else if (e.trunkMode === 'trunk_dance' && (open === false || open > e.startMs)) problems.push(`trunk dance without a completed open at ${e.startMs}`);
    else if (e.trunkMode === 'trunk_close') open = false;
  }
  return problems;
}

module.exports = { validateEvents };
