// Hand-crafted demo light shows for ALL built-in tracks
// Run: node generate_demo.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';

const outDir = './src/demoShows';
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

let idCounter = 1;
function makeId(p) { return p + '_' + (idCounter++); }

function add(events, prefix, part, s, e, opts = {}) {
  if (e <= s) return;
  events.push({
    id: makeId(prefix), part, startMs: Math.round(s), endMs: Math.round(e),
    effect: opts.effect || 'solid', power: 100, blinkSpeed: opts.blinkSpeed ?? 0,
    easeIn: opts.easeIn ?? false, easeOut: opts.easeOut ?? false,
    retroMode: opts.retroMode ?? 'roundtrip', windowMode: opts.windowMode ?? 'window_dance',
    windowDurationMs: opts.windowDurationMs ?? 5000, trunkMode: opts.trunkMode ?? 'trunk_open',
    flapMode: opts.flapMode ?? 'flap_open',
  });
}

function makeHelpers(events, px) {
  const a = (part, s, e, o) => add(events, px, part, s, e, o);
  const h = (s, e, o) => { a('light_left_front', s, e, o); a('light_right_front', s, e, o); };
  const t = (s, e, o) => { a('light_left_back', s, e, o); a('light_right_back', s, e, o); };
  const fb = (s, e, o) => { a('blink_front_left', s, e, o); a('blink_front_right', s, e, o); };
  const bb = (s, e, o) => { a('blink_back_left', s, e, o); a('blink_back_right', s, e, o); };
  const ab = (s, e, o) => { fb(s, e, o); bb(s, e, o); };
  const sr = (s, e, o) => { a('side_repeater_left', s, e, o); a('side_repeater_right', s, e, o); };
  const all = (s, e, o) => { h(s, e, o); t(s, e, o); ab(s, e, o); a('license_plate', s, e, o); a('brake_lights', s, e, o); sr(s, e, o); };
  const L = (s, e, o) => { a('light_left_front', s, e, o); a('light_left_back', s, e, o); a('blink_front_left', s, e, o); a('blink_back_left', s, e, o); };
  const R = (s, e, o) => { a('light_right_front', s, e, o); a('light_right_back', s, e, o); a('blink_front_right', s, e, o); a('blink_back_right', s, e, o); };
  return { a, h, t, fb, bb, ab, sr, all, L, R };
}

const MAX_EVENTS = 300;

// Priority tiers for trimming (remove lowest tier first)
const TRIM_TIERS = [
  ['side_repeater_left', 'side_repeater_right'],   // tier 0: barely visible
  ['rear_fog'],                                      // tier 1: small rear light
  ['license_plate'],                                 // tier 2: small white light
  ['brake_lights'],                                  // tier 3: redundant with taillights
  ['blink_back_left', 'blink_back_right'],           // tier 4: rear blinkers
  ['blink_front_left', 'blink_front_right'],         // tier 5: front blinkers
];

function capEvents(events) {
  if (events.length <= MAX_EVENTS) return events;
  let result = [...events];
  for (const tier of TRIM_TIERS) {
    if (result.length <= MAX_EVENTS) break;
    result = result.filter(e => !tier.includes(e.part));
  }
  // If still over, remove shortest-duration events
  if (result.length > MAX_EVENTS) {
    result.sort((a, b) => (a.endMs - a.startMs) - (b.endMs - b.startMs));
    result = result.slice(result.length - MAX_EVENTS);
  }
  return result;
}

function saveTrack(id, events) {
  const capped = capEvents(events);
  capped.sort((a, b) => a.startMs - b.startMs);
  const data = { trackId: id, isBuiltinTrack: true, bodyColor: '#222222', cursorOffsetMs: 0, events: capped };
  writeFileSync(`${outDir}/${id}.json`, JSON.stringify(data, null, 2));
  const trimmed = events.length > capped.length ? ` (trimmed from ${events.length})` : '';
  console.log(`${id}: ${capped.length} events${trimmed}`);
}

// =====================================================
// JINGLE BELLS METAL (30s) — Constant high energy metal
// =====================================================
function genJingleBellsMetal() {
  idCounter = 1;
  const events = [];
  const { a, h, t, fb, bb, ab, sr, all, L, R } = makeHelpers(events, 'jbm');

  // 0-0.5s: Quick intro burst
  h(200, 500, { easeIn: true });

  // 0.5-3s: First riff — aggressive blink
  h(500, 2000, { effect: 'blink', blinkSpeed: 1 });
  t(500, 2000, { effect: 'blink', blinkSpeed: 0 });
  fb(500, 1500, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 500, 2000);
  sr(800, 1500, { effect: 'blink', blinkSpeed: 2 });
  // Hit
  all(2000, 3000, { effect: 'blink', blinkSpeed: 2 });
  a('rear_fog', 2000, 3000);

  // 3-6s: Alternating L/R
  L(3000, 4000);
  R(3500, 4500);
  L(4500, 5500, { effect: 'blink', blinkSpeed: 1 });
  R(5000, 6000, { effect: 'blink', blinkSpeed: 1 });
  a('brake_lights', 3000, 6000);
  a('license_plate', 3500, 5500);

  // 6-9s: All blinkers fast + headlights
  h(6000, 8000, { effect: 'blink', blinkSpeed: 2 });
  t(6000, 7500);
  ab(6000, 8000, { effect: 'blink', blinkSpeed: 2 });
  sr(6500, 8000, { effect: 'blink', blinkSpeed: 1 });
  a('brake_lights', 6500, 8000);
  // Peak hit at 8s
  all(8000, 9500, { effect: 'blink', blinkSpeed: 2 });
  a('rear_fog', 8000, 9500);

  // 9.5-12s: Wave pattern front to back
  h(9500, 10500, { effect: 'blink', blinkSpeed: 1 });
  fb(10000, 11000, { effect: 'blink', blinkSpeed: 2 });
  t(10500, 11500);
  bb(11000, 12000, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 10500, 12000);
  sr(10000, 11500, { effect: 'blink', blinkSpeed: 1 });

  // 12-14.5s: Build up — retro fold
  h(12000, 14500, { effect: 'blink', blinkSpeed: 1 });
  t(12000, 14000, { effect: 'blink', blinkSpeed: 0 });
  ab(12500, 14000, { effect: 'blink', blinkSpeed: 2 });
  a('license_plate', 12000, 14500);
  a('retro_right', 12000, 16000, { retroMode: 'roundtrip' });

  // 14.5-17s: Second half opener — full blast
  all(14500, 16500, { effect: 'blink', blinkSpeed: 2 });
  a('rear_fog', 14500, 16500);

  // 17-20s: Alternating patterns
  h(16500, 17500);
  t(17000, 18000, { effect: 'blink', blinkSpeed: 1 });
  fb(17500, 18500, { effect: 'blink', blinkSpeed: 2 });
  h(18500, 19500, { effect: 'blink', blinkSpeed: 2 });
  bb(18000, 19000, { effect: 'blink', blinkSpeed: 1 });
  sr(17000, 19000, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 17000, 20000);

  // 20-22s: Peak at 20.5s — everything
  all(20000, 22000, { effect: 'blink', blinkSpeed: 2 });
  a('rear_fog', 20000, 22000);
  // Window dance
  a('window_left_front', 20000, 25000, { windowMode: 'window_dance', windowDurationMs: 5000 });
  a('window_right_front', 20000, 25000, { windowMode: 'window_dance', windowDurationMs: 5000 });

  // 22-25s: Hammering
  L(22000, 23000, { effect: 'blink', blinkSpeed: 2 });
  R(22500, 23500, { effect: 'blink', blinkSpeed: 2 });
  h(23500, 25000, { effect: 'blink', blinkSpeed: 1 });
  t(23500, 25000);
  ab(24000, 25000, { effect: 'blink', blinkSpeed: 2 });
  a('license_plate', 22000, 25000);

  // 25-28s: Final push — flap rainbow
  all(25000, 28000, { effect: 'blink', blinkSpeed: 2 });
  a('rear_fog', 25000, 28000);
  a('flap', 25000, 28000, { flapMode: 'flap_rainbow' });
  sr(25000, 28000, { effect: 'blink', blinkSpeed: 2 });

  // 28-29.5s: Outro burst then fade
  h(28000, 29000, { effect: 'blink', blinkSpeed: 2 });
  t(28000, 29000, { effect: 'blink', blinkSpeed: 1 });
  h(29000, 29800, { easeOut: true });

  saveTrack('jingle_bells_metal', events);
}

// =====================================================
// JINGLE BELLS (104s) — Festive Christmas
// =====================================================
function genJingleBells() {
  idCounter = 1;
  const events = [];
  const { a, h, t, fb, bb, ab, sr, all, L, R } = makeHelpers(events, 'jb');

  // 0-1s: Intro
  h(300, 1000, { easeIn: true });

  // 1-5s: First phrase — bright and cheerful
  h(1000, 3000, { effect: 'blink', blinkSpeed: 0 });
  t(1000, 3000);
  fb(1500, 2500, { effect: 'blink', blinkSpeed: 1 });
  h(3000, 5000, { effect: 'blink', blinkSpeed: 1 });
  t(3000, 5000, { effect: 'blink', blinkSpeed: 0 });
  ab(3500, 4500, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 3000, 5000);

  // 5-9s: Verse continues
  L(5000, 6500);
  R(5500, 7000);
  a('license_plate', 5000, 7000);
  h(7000, 9000, { effect: 'blink', blinkSpeed: 1 });
  t(7500, 9000);
  fb(7500, 8500, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 7000, 9000);

  // 9-13s: Building — peak at 13s (0.62)
  h(9000, 11000);
  t(9500, 11000, { effect: 'blink', blinkSpeed: 0 });
  sr(9500, 11000, { effect: 'blink', blinkSpeed: 1 });
  h(11000, 13000, { effect: 'blink', blinkSpeed: 1 });
  t(11000, 13000);
  ab(11500, 13000, { effect: 'blink', blinkSpeed: 2 });
  // Peak
  all(13000, 14500, { effect: 'blink', blinkSpeed: 2 });
  a('rear_fog', 13000, 14500);

  // 14.5-21s: Alternating verse
  h(14500, 16000);
  t(15000, 16500, { effect: 'blink', blinkSpeed: 0 });
  fb(15500, 16500, { effect: 'blink', blinkSpeed: 1 });
  L(16500, 18000, { effect: 'blink', blinkSpeed: 1 });
  R(17000, 18500, { effect: 'blink', blinkSpeed: 1 });
  a('brake_lights', 16500, 18500);
  h(18500, 20000, { effect: 'blink', blinkSpeed: 0 });
  t(19000, 20500);
  bb(19000, 20000, { effect: 'blink', blinkSpeed: 2 });
  // Build to 21s (0.60)
  h(20500, 22000, { effect: 'blink', blinkSpeed: 1 });
  t(20500, 22000);
  ab(21000, 22000, { effect: 'blink', blinkSpeed: 2 });
  a('license_plate', 20500, 22000);

  // 22-28s: Second verse
  h(22000, 24000, { effect: 'blink', blinkSpeed: 1 });
  t(22000, 24000, { effect: 'blink', blinkSpeed: 0 });
  fb(22500, 23500, { effect: 'blink', blinkSpeed: 2 });
  sr(23000, 24000, { effect: 'blink', blinkSpeed: 1 });
  L(24000, 25500);
  R(24500, 26000);
  a('brake_lights', 24000, 26000);
  h(26000, 28000, { effect: 'blink', blinkSpeed: 1 });
  t(26000, 28000);
  ab(26500, 28000, { effect: 'blink', blinkSpeed: 2 });
  // Peak at 28s (0.61)
  all(28000, 29500, { effect: 'blink', blinkSpeed: 2 });
  a('rear_fog', 28000, 29500);

  // 29.5-35s: Chorus begins
  h(29500, 31500, { effect: 'blink', blinkSpeed: 1 });
  t(30000, 32000, { effect: 'blink', blinkSpeed: 0 });
  fb(30000, 31000, { effect: 'blink', blinkSpeed: 2 });
  bb(31000, 32000, { effect: 'blink', blinkSpeed: 2 });
  sr(30500, 32000, { effect: 'blink', blinkSpeed: 1 });
  a('brake_lights', 30000, 32000);
  // Retro
  a('retro_right', 31000, 35000, { retroMode: 'roundtrip' });
  h(32000, 34000, { effect: 'blink', blinkSpeed: 2 });
  t(32000, 34000, { effect: 'blink', blinkSpeed: 1 });
  ab(33000, 34500, { effect: 'blink', blinkSpeed: 2 });
  a('license_plate', 32000, 35000);

  // 35-42s: Bridge
  L(35000, 36500, { effect: 'blink', blinkSpeed: 1 });
  R(36000, 37500, { effect: 'blink', blinkSpeed: 1 });
  h(37500, 39500, { effect: 'blink', blinkSpeed: 0 });
  t(38000, 40000);
  fb(38000, 39000, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 37500, 40000);
  h(40000, 42000, { effect: 'blink', blinkSpeed: 1 });
  t(40000, 42000, { effect: 'blink', blinkSpeed: 0 });
  ab(40500, 42000, { effect: 'blink', blinkSpeed: 2 });
  sr(40500, 42000, { effect: 'blink', blinkSpeed: 1 });

  // 42-48s: Big build — peaks 47-48s (0.68-0.69)
  all(42000, 44000, { effect: 'blink', blinkSpeed: 1 });
  a('rear_fog', 42000, 44000);
  L(44000, 45500, { effect: 'blink', blinkSpeed: 2 });
  R(45000, 46500, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 44000, 47000);
  // Window dance
  a('window_left_front', 45000, 50000, { windowMode: 'window_dance', windowDurationMs: 5000 });
  a('window_right_front', 45000, 50000, { windowMode: 'window_dance', windowDurationMs: 5000 });
  // Peak
  all(47000, 49000, { effect: 'blink', blinkSpeed: 2 });
  a('rear_fog', 47000, 49000);

  // 49-55s: Post-peak sustained
  h(49000, 51000, { effect: 'blink', blinkSpeed: 1 });
  t(49000, 51000);
  fb(49500, 51000, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 49000, 51500);
  h(51500, 53500, { effect: 'blink', blinkSpeed: 0 });
  t(52000, 54000, { effect: 'blink', blinkSpeed: 0 });
  bb(52000, 53000, { effect: 'blink', blinkSpeed: 2 });
  sr(52000, 54000, { effect: 'blink', blinkSpeed: 1 });
  h(54000, 56000, { effect: 'blink', blinkSpeed: 1 });
  t(54000, 56000);
  ab(54500, 56000, { effect: 'blink', blinkSpeed: 2 });
  a('license_plate', 54000, 56000);

  // 56-60s: Build to climax (60s = 0.71)
  h(56000, 58000, { effect: 'blink', blinkSpeed: 1 });
  t(56000, 58000, { effect: 'blink', blinkSpeed: 0 });
  ab(57000, 58500, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 56000, 58500);
  h(58500, 60000, { effect: 'blink', blinkSpeed: 2 });
  t(58500, 60000, { effect: 'blink', blinkSpeed: 1 });
  sr(58500, 60000, { effect: 'blink', blinkSpeed: 2 });
  // CLIMAX at 60s
  all(60000, 62000, { effect: 'blink', blinkSpeed: 2 });
  a('rear_fog', 60000, 62000);
  a('retro_right', 60000, 64000, { retroMode: 'roundtrip' });
  a('flap', 60000, 65000, { flapMode: 'flap_rainbow' });

  // 62-70s: Sustained high energy
  h(62000, 64000, { effect: 'blink', blinkSpeed: 1 });
  t(62500, 64500);
  fb(63000, 64500, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 62000, 65000);
  L(64500, 66000, { effect: 'blink', blinkSpeed: 2 });
  R(65000, 66500, { effect: 'blink', blinkSpeed: 2 });
  h(66500, 68500, { effect: 'blink', blinkSpeed: 1 });
  t(66500, 68500, { effect: 'blink', blinkSpeed: 0 });
  ab(67000, 68500, { effect: 'blink', blinkSpeed: 2 });
  sr(67000, 68500, { effect: 'blink', blinkSpeed: 1 });
  a('license_plate', 66500, 69000);
  h(69000, 71000, { effect: 'blink', blinkSpeed: 2 });
  t(69000, 71000);
  fb(69500, 70500, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 69000, 71000);

  // 71-80s: Second climax zone
  // Window dance rear
  a('window_left_back', 71000, 78000, { windowMode: 'window_dance', windowDurationMs: 7000 });
  a('window_right_back', 71000, 78000, { windowMode: 'window_dance', windowDurationMs: 7000 });
  h(71000, 73000, { effect: 'blink', blinkSpeed: 1 });
  t(71000, 73000, { effect: 'blink', blinkSpeed: 0 });
  ab(72000, 73500, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 71000, 74000);
  all(74000, 76000, { effect: 'blink', blinkSpeed: 2 });
  a('rear_fog', 74000, 76000);
  h(76000, 78000, { effect: 'blink', blinkSpeed: 1 });
  t(76000, 78000);
  fb(76500, 77500, { effect: 'blink', blinkSpeed: 2 });
  all(78000, 80000, { effect: 'blink', blinkSpeed: 2 });
  a('rear_fog', 78000, 80000);

  // 80-92s: Long sustained section
  h(80000, 82000, { effect: 'blink', blinkSpeed: 0 });
  t(80500, 82000);
  bb(81000, 82000, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 80000, 82500);
  L(82500, 84000, { effect: 'blink', blinkSpeed: 1 });
  R(83000, 84500, { effect: 'blink', blinkSpeed: 1 });
  h(84500, 86500, { effect: 'blink', blinkSpeed: 1 });
  t(84500, 86500, { effect: 'blink', blinkSpeed: 0 });
  ab(85000, 86500, { effect: 'blink', blinkSpeed: 2 });
  // Peak 86s (0.68)
  all(86500, 88500, { effect: 'blink', blinkSpeed: 2 });
  a('rear_fog', 86500, 88500);
  a('retro_right', 87000, 91000, { retroMode: 'roundtrip' });
  h(88500, 90000, { effect: 'blink', blinkSpeed: 1 });
  t(88500, 90000);
  fb(89000, 90000, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 88500, 90500);

  // 90-98s: Final push (peaks 94-98s)
  h(90500, 92500, { effect: 'blink', blinkSpeed: 1 });
  t(91000, 93000, { effect: 'blink', blinkSpeed: 0 });
  ab(91500, 93000, { effect: 'blink', blinkSpeed: 2 });
  sr(91500, 93000, { effect: 'blink', blinkSpeed: 1 });
  a('license_plate', 90500, 93000);
  // Final climax
  all(93000, 95000, { effect: 'blink', blinkSpeed: 2 });
  a('rear_fog', 93000, 95000);
  h(95000, 97000, { effect: 'blink', blinkSpeed: 2 });
  t(95000, 97000, { effect: 'blink', blinkSpeed: 1 });
  ab(95500, 97000, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 95000, 98000);
  all(97000, 99000, { effect: 'blink', blinkSpeed: 2 });
  a('rear_fog', 97000, 99000);

  // 99-104s: Fadeout
  h(99000, 100500, { easeOut: true });
  t(99000, 100000, { easeOut: true });
  h(101000, 103000, { easeIn: true, easeOut: true });

  saveTrack('jingle_bells', events);
}

// =====================================================
// NEW YEAR COUNTDOWN (73s) — Building crescendo + big finale
// Structure: 0-3 quiet intro, 4-16 medium build, 17-40 loud, 41-59 bridge build, 60-68 CLIMAX, 69-72 fade
// =====================================================
function genNewYearCountdown() {
  idCounter = 1;
  const events = [];
  const { a, h, t, fb, bb, ab, sr, all, L, R } = makeHelpers(events, 'nyc');

  // 0-4s: Quiet intro — gentle fade in
  h(500, 2000, { easeIn: true });
  a('license_plate', 1000, 3000, { easeIn: true });
  h(2500, 4000, { effect: 'blink', blinkSpeed: 0 });
  t(3000, 4500);

  // 4-10s: Medium energy build
  h(4000, 6000, { effect: 'blink', blinkSpeed: 0 });
  t(4500, 6000);
  fb(5000, 6000, { effect: 'blink', blinkSpeed: 1 });
  a('brake_lights', 4500, 6500);
  L(6000, 7500, { effect: 'blink', blinkSpeed: 1 });
  R(6500, 8000, { effect: 'blink', blinkSpeed: 1 });
  h(8000, 10000, { effect: 'blink', blinkSpeed: 0 });
  t(8500, 10000);
  ab(8500, 10000, { effect: 'blink', blinkSpeed: 1 });
  a('license_plate', 8000, 10000);

  // 10-17s: Building — peak at 17s (0.73)
  h(10000, 12000, { effect: 'blink', blinkSpeed: 1 });
  t(10500, 12000, { effect: 'blink', blinkSpeed: 0 });
  sr(10500, 12000, { effect: 'blink', blinkSpeed: 1 });
  a('brake_lights', 10000, 12500);
  h(12500, 14500, { effect: 'blink', blinkSpeed: 1 });
  t(13000, 14500);
  fb(13000, 14000, { effect: 'blink', blinkSpeed: 2 });
  bb(13500, 14500, { effect: 'blink', blinkSpeed: 2 });
  h(15000, 17000, { effect: 'blink', blinkSpeed: 1 });
  t(15000, 17000, { effect: 'blink', blinkSpeed: 0 });
  ab(15500, 17000, { effect: 'blink', blinkSpeed: 2 });
  a('license_plate', 15000, 17500);
  // Peak hit at 17s
  all(17000, 19000, { effect: 'blink', blinkSpeed: 2 });
  a('rear_fog', 17000, 19000);

  // 19-27s: Sustained loud — peaks at 27s (0.76)
  h(19000, 21000, { effect: 'blink', blinkSpeed: 1 });
  t(19500, 21000);
  fb(20000, 21000, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 19000, 21500);
  L(21000, 22500, { effect: 'blink', blinkSpeed: 2 });
  R(21500, 23000, { effect: 'blink', blinkSpeed: 2 });
  h(23000, 25000, { effect: 'blink', blinkSpeed: 1 });
  t(23000, 25000, { effect: 'blink', blinkSpeed: 0 });
  ab(23500, 25000, { effect: 'blink', blinkSpeed: 2 });
  sr(24000, 25500, { effect: 'blink', blinkSpeed: 1 });
  a('license_plate', 23000, 25500);
  // Retro fold
  a('retro_right', 25000, 29000, { retroMode: 'roundtrip' });
  h(25500, 27500, { effect: 'blink', blinkSpeed: 2 });
  t(25500, 27500, { effect: 'blink', blinkSpeed: 1 });
  ab(26000, 27500, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 25500, 28000);
  // Peak at 27s
  all(27500, 29500, { effect: 'blink', blinkSpeed: 2 });
  a('rear_fog', 27500, 29500);

  // 29.5-37s: Sustained high — peak at 37s (0.79)
  h(29500, 31500, { effect: 'blink', blinkSpeed: 1 });
  t(30000, 32000);
  fb(30500, 31500, { effect: 'blink', blinkSpeed: 2 });
  bb(31000, 32000, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 30000, 32500);
  h(32500, 34500, { effect: 'blink', blinkSpeed: 1 });
  t(32500, 34500, { effect: 'blink', blinkSpeed: 0 });
  sr(33000, 34500, { effect: 'blink', blinkSpeed: 2 });
  L(34500, 36000, { effect: 'blink', blinkSpeed: 2 });
  R(35000, 36500, { effect: 'blink', blinkSpeed: 2 });
  a('license_plate', 34500, 37000);
  // Window dance
  a('window_left_front', 35000, 40000, { windowMode: 'window_dance', windowDurationMs: 5000 });
  a('window_right_front', 35000, 40000, { windowMode: 'window_dance', windowDurationMs: 5000 });
  // BIG PEAK at 37s
  all(37000, 39000, { effect: 'blink', blinkSpeed: 2 });
  a('rear_fog', 37000, 39000);
  h(39000, 41000, { effect: 'blink', blinkSpeed: 1 });
  t(39000, 41000, { effect: 'blink', blinkSpeed: 0 });
  ab(39500, 41000, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 39000, 41000);

  // 41-51s: Quieter bridge (0.30-0.44) — more sparse, building slowly
  h(41500, 43000, { effect: 'blink', blinkSpeed: 0 });
  a('license_plate', 42000, 44000);
  t(43000, 44500);
  fb(43500, 44500, { effect: 'blink', blinkSpeed: 1 });
  L(45000, 46500);
  R(46000, 47500);
  a('brake_lights', 45000, 48000);
  h(47500, 49500, { effect: 'blink', blinkSpeed: 0 });
  t(48000, 49500);
  sr(48000, 49500, { effect: 'blink', blinkSpeed: 1 });
  h(49500, 51500, { effect: 'blink', blinkSpeed: 1 });
  t(50000, 51500, { effect: 'blink', blinkSpeed: 0 });
  ab(50000, 51500, { effect: 'blink', blinkSpeed: 1 });
  a('license_plate', 49500, 52000);

  // 51-60s: Building towards final climax
  h(52000, 54000, { effect: 'blink', blinkSpeed: 1 });
  t(52000, 54000);
  fb(52500, 54000, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 52000, 54500);
  h(54500, 56500, { effect: 'blink', blinkSpeed: 1 });
  t(55000, 56500, { effect: 'blink', blinkSpeed: 0 });
  bb(55000, 56000, { effect: 'blink', blinkSpeed: 2 });
  sr(55000, 56500, { effect: 'blink', blinkSpeed: 1 });
  h(56500, 58500, { effect: 'blink', blinkSpeed: 1 });
  t(57000, 58500);
  ab(57000, 58500, { effect: 'blink', blinkSpeed: 2 });
  a('license_plate', 56500, 59000);
  // Build
  h(58500, 60500, { effect: 'blink', blinkSpeed: 2 });
  t(59000, 60500, { effect: 'blink', blinkSpeed: 1 });
  ab(59000, 60500, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 58500, 61000);
  a('retro_right', 58000, 62000, { retroMode: 'roundtrip' });

  // 60-68s: FINAL CLIMAX (0.68-0.79) — everything max
  all(60500, 62500, { effect: 'blink', blinkSpeed: 2 });
  a('rear_fog', 60500, 62500);
  a('flap', 60500, 68000, { flapMode: 'flap_rainbow' });
  // Window dance all
  a('window_left_front', 61000, 68000, { windowMode: 'window_dance', windowDurationMs: 7000 });
  a('window_right_front', 61000, 68000, { windowMode: 'window_dance', windowDurationMs: 7000 });
  a('window_left_back', 61000, 68000, { windowMode: 'window_dance', windowDurationMs: 7000 });
  a('window_right_back', 61000, 68000, { windowMode: 'window_dance', windowDurationMs: 7000 });
  h(62500, 64500, { effect: 'blink', blinkSpeed: 2 });
  t(62500, 64500, { effect: 'blink', blinkSpeed: 1 });
  ab(63000, 64500, { effect: 'blink', blinkSpeed: 2 });
  sr(63000, 64500, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 62500, 65000);
  // Peak at 64s (0.79)
  all(64500, 66500, { effect: 'blink', blinkSpeed: 2 });
  a('rear_fog', 64500, 66500);
  h(66500, 68500, { effect: 'blink', blinkSpeed: 2 });
  t(66500, 68500, { effect: 'blink', blinkSpeed: 1 });
  ab(67000, 68500, { effect: 'blink', blinkSpeed: 2 });
  a('license_plate', 66500, 69000);

  // 68.5-72s: Fadeout
  h(69000, 70500, { easeOut: true });
  t(69000, 70000, { easeOut: true });
  a('license_plate', 69500, 71000, { easeOut: true });

  saveTrack('new_year_countdown', events);
}

// =====================================================
// HALLOWEEN (79s) — Spooky with dramatic drops
// Structure: 0 intro, 1-21 build+peaks, 22 DROP, 23-35 loud, 36-55 medium, 56-67 big, 68 DROP, 69-75 final, 76+ fade
// =====================================================
function genHalloween() {
  idCounter = 1;
  const events = [];
  const { a, h, t, fb, bb, ab, sr, all, L, R } = makeHelpers(events, 'hw');

  // 0-2s: Spooky intro
  h(300, 1500, { easeIn: true });
  a('license_plate', 500, 2000, { easeIn: true });

  // 2-7s: First attack
  h(2000, 4000, { effect: 'blink', blinkSpeed: 0 });
  t(2000, 4000);
  fb(2500, 3500, { effect: 'blink', blinkSpeed: 1 });
  a('brake_lights', 2500, 4000);
  L(4000, 5500, { effect: 'blink', blinkSpeed: 1 });
  R(4500, 6000, { effect: 'blink', blinkSpeed: 1 });
  h(6000, 7500, { effect: 'blink', blinkSpeed: 1 });
  t(6000, 7500);
  bb(6500, 7500, { effect: 'blink', blinkSpeed: 2 });
  a('license_plate', 5000, 7500);

  // 7-14s: Building spookiness
  h(7500, 9500, { effect: 'blink', blinkSpeed: 0 });
  t(8000, 9500);
  fb(8500, 9500, { effect: 'blink', blinkSpeed: 2 });
  sr(8000, 9500, { effect: 'blink', blinkSpeed: 1 });
  a('brake_lights', 7500, 10000);
  h(10000, 12000, { effect: 'blink', blinkSpeed: 1 });
  t(10000, 12000, { effect: 'blink', blinkSpeed: 0 });
  ab(10500, 12000, { effect: 'blink', blinkSpeed: 2 });
  a('license_plate', 10000, 12500);
  h(12000, 14000, { effect: 'blink', blinkSpeed: 1 });
  t(12500, 14000);
  fb(12500, 13500, { effect: 'blink', blinkSpeed: 2 });
  bb(13000, 14000, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 12000, 14500);

  // 14-21s: Peaks at 15s (0.69), 19-21s (0.72)
  all(14500, 16500, { effect: 'blink', blinkSpeed: 2 });
  a('rear_fog', 14500, 16500);
  h(16500, 18000, { effect: 'blink', blinkSpeed: 1 });
  t(17000, 18500);
  ab(17000, 18500, { effect: 'blink', blinkSpeed: 1 });
  a('brake_lights', 17000, 19000);
  // BIG PEAK 19-21s
  all(19000, 21500, { effect: 'blink', blinkSpeed: 2 });
  a('rear_fog', 19000, 21500);
  a('retro_right', 19000, 23000, { retroMode: 'roundtrip' });

  // 22s: DRAMATIC DROP (0.25) — brief silence
  h(22000, 23000, { easeIn: true, easeOut: true });

  // 23-31s: Second wave
  h(23000, 25000, { effect: 'blink', blinkSpeed: 1 });
  t(23000, 25000);
  fb(23500, 24500, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 23000, 25500);
  sr(24000, 25500, { effect: 'blink', blinkSpeed: 1 });
  L(25500, 27000, { effect: 'blink', blinkSpeed: 2 });
  R(26000, 27500, { effect: 'blink', blinkSpeed: 2 });
  a('license_plate', 25500, 28000);
  h(27500, 29500, { effect: 'blink', blinkSpeed: 1 });
  t(28000, 29500, { effect: 'blink', blinkSpeed: 0 });
  ab(28000, 29500, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 27500, 30000);
  all(30000, 31500, { effect: 'blink', blinkSpeed: 2 });
  a('rear_fog', 30000, 31500);

  // 31s: Another drop (0.23)
  h(31500, 32500, { easeIn: true, easeOut: true });

  // 32-36s: Recovery
  h(32500, 34500, { effect: 'blink', blinkSpeed: 1 });
  t(33000, 34500);
  fb(33000, 34000, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 33000, 35000);
  h(35000, 36500, { effect: 'blink', blinkSpeed: 0 });
  t(35000, 36500);
  ab(35000, 36500, { effect: 'blink', blinkSpeed: 1 });
  a('license_plate', 35000, 37000);

  // 36-55s: Medium intensity — creepy atmosphere
  h(37000, 39000, { effect: 'blink', blinkSpeed: 0 });
  t(37500, 39000);
  sr(38000, 39500, { effect: 'blink', blinkSpeed: 1 });
  a('brake_lights', 37500, 39500);
  L(39500, 41000);
  R(40000, 41500);
  h(41500, 43000, { effect: 'blink', blinkSpeed: 0 });
  t(42000, 43500);
  fb(42000, 43000, { effect: 'blink', blinkSpeed: 1 });
  a('license_plate', 41500, 44000);
  // Window creepy
  a('window_left_front', 43000, 48000, { windowMode: 'window_dance', windowDurationMs: 5000 });
  a('window_right_front', 43000, 48000, { windowMode: 'window_dance', windowDurationMs: 5000 });
  h(44000, 46000, { effect: 'blink', blinkSpeed: 0 });
  t(44500, 46000);
  bb(44500, 46000, { effect: 'blink', blinkSpeed: 1 });
  a('brake_lights', 44000, 46500);
  h(46500, 48500, { effect: 'blink', blinkSpeed: 1 });
  t(47000, 48500);
  ab(47000, 48500, { effect: 'blink', blinkSpeed: 1 });
  sr(47000, 48500, { effect: 'blink', blinkSpeed: 1 });
  a('license_plate', 47000, 49000);
  h(49000, 51000, { effect: 'blink', blinkSpeed: 0 });
  t(49500, 51000);
  fb(50000, 51000, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 49000, 51500);
  L(51500, 53000, { effect: 'blink', blinkSpeed: 1 });
  R(52000, 53500, { effect: 'blink', blinkSpeed: 1 });
  h(53500, 55500, { effect: 'blink', blinkSpeed: 1 });
  t(54000, 55500);
  ab(54000, 55500, { effect: 'blink', blinkSpeed: 2 });
  a('license_plate', 53500, 56000);

  // 56-67s: BIG section — peak at 56s (0.70)
  all(56000, 58000, { effect: 'blink', blinkSpeed: 2 });
  a('rear_fog', 56000, 58000);
  a('retro_right', 56000, 60000, { retroMode: 'roundtrip' });
  h(58000, 60000, { effect: 'blink', blinkSpeed: 1 });
  t(58500, 60000, { effect: 'blink', blinkSpeed: 0 });
  fb(58500, 59500, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 58000, 60500);
  h(60500, 62500, { effect: 'blink', blinkSpeed: 1 });
  t(60500, 62500);
  ab(61000, 62500, { effect: 'blink', blinkSpeed: 2 });
  sr(61000, 62500, { effect: 'blink', blinkSpeed: 1 });
  a('license_plate', 60500, 63000);
  L(63000, 64500, { effect: 'blink', blinkSpeed: 2 });
  R(63500, 65000, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 63000, 65500);
  all(65000, 67000, { effect: 'blink', blinkSpeed: 2 });
  a('rear_fog', 65000, 67000);
  a('flap', 65000, 68000, { flapMode: 'flap_rainbow' });
  // Window dance
  a('window_left_back', 65000, 68000, { windowMode: 'window_dance', windowDurationMs: 3000 });
  a('window_right_back', 65000, 68000, { windowMode: 'window_dance', windowDurationMs: 3000 });

  // 68s: DROP (0.24) — spooky silence
  h(68000, 69000, { easeIn: true, easeOut: true });
  a('license_plate', 68000, 69000);

  // 69-75s: Final section
  h(69000, 71000, { effect: 'blink', blinkSpeed: 1 });
  t(69000, 71000);
  fb(69500, 70500, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 69000, 71500);
  h(71500, 73500, { effect: 'blink', blinkSpeed: 1 });
  t(72000, 73500, { effect: 'blink', blinkSpeed: 0 });
  ab(72000, 73500, { effect: 'blink', blinkSpeed: 2 });
  sr(72000, 73500, { effect: 'blink', blinkSpeed: 1 });
  a('license_plate', 71500, 74000);
  h(74000, 75500, { effect: 'blink', blinkSpeed: 0 });
  t(74000, 75500);
  a('brake_lights', 74000, 76000);

  // 76-79s: Fadeout
  h(76000, 77500, { easeOut: true });
  a('license_plate', 76000, 77000, { easeOut: true });

  saveTrack('halloween', events);
}

// =====================================================
// HAPPY BIRTHDAY (84s) — Gentle start, cheerful middle, gentle end
// Structure: 0-9 quiet, 10-38 medium build, 39-47 break, 48-76 second build, 77-84 fade
// =====================================================
function genHappyBirthday() {
  idCounter = 1;
  const events = [];
  const { a, h, t, fb, bb, ab, sr, all, L, R } = makeHelpers(events, 'hb');

  // 0-9s: Soft quiet intro
  h(500, 3000, { easeIn: true });
  a('license_plate', 1000, 3500, { easeIn: true });
  h(3500, 6000, { effect: 'blink', blinkSpeed: 0, easeIn: true });
  t(4000, 6500);
  fb(5000, 6500, { effect: 'blink', blinkSpeed: 0 });
  h(7000, 9500, { effect: 'blink', blinkSpeed: 0 });
  t(7500, 9500);
  a('brake_lights', 7500, 10000);

  // 10-18s: First verse builds (0.28-0.37)
  h(10000, 12000, { effect: 'blink', blinkSpeed: 0 });
  t(10000, 12000);
  fb(10500, 12000, { effect: 'blink', blinkSpeed: 1 });
  a('license_plate', 10000, 12500);
  L(12500, 14000);
  R(13000, 14500);
  a('brake_lights', 12500, 15000);
  h(14500, 16500, { effect: 'blink', blinkSpeed: 0 });
  t(15000, 16500);
  fb(15000, 16000, { effect: 'blink', blinkSpeed: 1 });
  bb(15500, 16500, { effect: 'blink', blinkSpeed: 1 });
  h(17000, 18500, { effect: 'blink', blinkSpeed: 1 });
  t(17000, 18500);
  ab(17500, 18500, { effect: 'blink', blinkSpeed: 1 });
  a('license_plate', 17000, 19000);

  // 18-26s: Chorus build (0.37-0.46)
  h(19000, 21000, { effect: 'blink', blinkSpeed: 1 });
  t(19000, 21000, { effect: 'blink', blinkSpeed: 0 });
  fb(19500, 20500, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 19000, 21500);
  sr(20000, 21500, { effect: 'blink', blinkSpeed: 1 });
  h(21500, 23500, { effect: 'blink', blinkSpeed: 1 });
  t(22000, 23500);
  ab(22000, 23500, { effect: 'blink', blinkSpeed: 1 });
  L(23500, 25000, { effect: 'blink', blinkSpeed: 1 });
  R(24000, 25500, { effect: 'blink', blinkSpeed: 1 });
  a('license_plate', 23500, 26000);
  a('brake_lights', 23500, 26000);

  // 26-33s: Peak section (0.42-0.47)
  h(26000, 28000, { effect: 'blink', blinkSpeed: 1 });
  t(26000, 28000);
  fb(26500, 27500, { effect: 'blink', blinkSpeed: 2 });
  bb(27000, 28000, { effect: 'blink', blinkSpeed: 2 });
  sr(27000, 28000, { effect: 'blink', blinkSpeed: 1 });
  a('brake_lights', 26000, 28500);
  // Retro
  a('retro_right', 28000, 32000, { retroMode: 'roundtrip' });
  h(28500, 30500, { effect: 'blink', blinkSpeed: 1 });
  t(29000, 30500, { effect: 'blink', blinkSpeed: 0 });
  ab(29000, 30500, { effect: 'blink', blinkSpeed: 2 });
  a('license_plate', 28500, 31000);
  h(31000, 33000, { effect: 'blink', blinkSpeed: 1 });
  t(31000, 33000);
  ab(31500, 33000, { effect: 'blink', blinkSpeed: 1 });
  a('brake_lights', 31000, 33500);

  // 33-38s: Climax of first half
  h(33500, 35500, { effect: 'blink', blinkSpeed: 1 });
  t(34000, 35500, { effect: 'blink', blinkSpeed: 0 });
  fb(34000, 35000, { effect: 'blink', blinkSpeed: 2 });
  sr(34000, 35500, { effect: 'blink', blinkSpeed: 1 });
  all(36000, 38000, { effect: 'blink', blinkSpeed: 2 });
  a('rear_fog', 36000, 38000);

  // 38-47s: Break — quiet again (0.17-0.22)
  h(39000, 41000, { easeIn: true });
  a('license_plate', 39500, 41500, { easeIn: true });
  h(41500, 44000, { effect: 'blink', blinkSpeed: 0 });
  t(42000, 44000);
  fb(43000, 44000, { effect: 'blink', blinkSpeed: 0 });
  h(44500, 47000, { effect: 'blink', blinkSpeed: 0 });
  t(45000, 47000);
  a('brake_lights', 45000, 47500);

  // 48-57s: Second verse builds (0.28-0.36)
  h(48000, 50000, { effect: 'blink', blinkSpeed: 0 });
  t(48000, 50000);
  fb(48500, 49500, { effect: 'blink', blinkSpeed: 1 });
  a('license_plate', 48000, 50500);
  L(50500, 52000);
  R(51000, 52500);
  a('brake_lights', 50500, 53000);
  h(53000, 55000, { effect: 'blink', blinkSpeed: 0 });
  t(53000, 55000);
  bb(53500, 54500, { effect: 'blink', blinkSpeed: 1 });
  h(55000, 57500, { effect: 'blink', blinkSpeed: 1 });
  t(55500, 57500);
  ab(55500, 57000, { effect: 'blink', blinkSpeed: 1 });
  a('license_plate', 55000, 58000);

  // 57-65s: Second chorus (0.36-0.47)
  h(58000, 60000, { effect: 'blink', blinkSpeed: 1 });
  t(58000, 60000, { effect: 'blink', blinkSpeed: 0 });
  fb(58500, 59500, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 58000, 60500);
  sr(59000, 60500, { effect: 'blink', blinkSpeed: 1 });
  // Peak at 60s (0.47)
  all(60500, 62500, { effect: 'blink', blinkSpeed: 2 });
  a('rear_fog', 60500, 62500);
  h(62500, 64500, { effect: 'blink', blinkSpeed: 1 });
  t(63000, 64500);
  ab(63000, 64500, { effect: 'blink', blinkSpeed: 1 });
  a('brake_lights', 62500, 65000);
  a('license_plate', 62500, 65000);

  // 65-72s: Sustained peak
  h(65000, 67000, { effect: 'blink', blinkSpeed: 1 });
  t(65000, 67000);
  fb(65500, 66500, { effect: 'blink', blinkSpeed: 2 });
  bb(66000, 67000, { effect: 'blink', blinkSpeed: 2 });
  sr(66000, 67000, { effect: 'blink', blinkSpeed: 1 });
  a('retro_right', 67000, 71000, { retroMode: 'roundtrip' });
  h(67500, 69500, { effect: 'blink', blinkSpeed: 1 });
  t(68000, 69500, { effect: 'blink', blinkSpeed: 0 });
  ab(68000, 69500, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 67500, 70000);
  a('license_plate', 67500, 70000);
  // Window dance
  a('window_left_front', 69000, 74000, { windowMode: 'window_dance', windowDurationMs: 5000 });
  a('window_right_front', 69000, 74000, { windowMode: 'window_dance', windowDurationMs: 5000 });
  h(70000, 72000, { effect: 'blink', blinkSpeed: 1 });
  t(70500, 72000);
  ab(70500, 72000, { effect: 'blink', blinkSpeed: 1 });
  a('brake_lights', 70000, 72500);

  // 72-76s: Final peak
  all(72500, 74500, { effect: 'blink', blinkSpeed: 2 });
  a('rear_fog', 72500, 74500);
  a('flap', 72500, 76000, { flapMode: 'flap_rainbow' });
  h(74500, 76500, { effect: 'blink', blinkSpeed: 1 });
  t(75000, 76500);
  ab(75000, 76500, { effect: 'blink', blinkSpeed: 1 });
  a('brake_lights', 74500, 77000);

  // 77-84s: Gentle fadeout
  h(77500, 79500, { easeOut: true });
  t(78000, 79000, { easeOut: true });
  a('license_plate', 77500, 79000, { easeOut: true });
  h(80000, 82000, { easeIn: true, easeOut: true });

  saveTrack('happy_birthday', events);
}

// =====================================================
// CLASSICAL PIANO (135s) — Elegant, flowing, rich dynamics
// Structure: 0-8 intro, 9-48 first movement, 49 peak, 50-107 sustained, 108-134 fadeout
// =====================================================
function genClassicalPiano() {
  idCounter = 1;
  const events = [];
  const { a, h, t, fb, bb, ab, sr, all, L, R } = makeHelpers(events, 'cp');

  // 0-4s: Elegant opening
  h(300, 2000, { easeIn: true });
  a('license_plate', 500, 2500, { easeIn: true });
  h(2500, 4500, { effect: 'blink', blinkSpeed: 0 });
  t(3000, 5000);

  // 4-9s: First phrase
  h(5000, 7000, { effect: 'blink', blinkSpeed: 0 });
  t(5500, 7000);
  fb(5500, 6500, { effect: 'blink', blinkSpeed: 1 });
  a('brake_lights', 5500, 7500);
  L(7500, 9000);
  R(8000, 9500);
  a('license_plate', 7500, 10000);

  // 9-16s: Building
  h(9500, 11500, { effect: 'blink', blinkSpeed: 0 });
  t(10000, 11500);
  ab(10000, 11500, { effect: 'blink', blinkSpeed: 1 });
  a('brake_lights', 10000, 12000);
  h(12000, 14000, { effect: 'blink', blinkSpeed: 1 });
  t(12000, 14000, { effect: 'blink', blinkSpeed: 0 });
  fb(12500, 13500, { effect: 'blink', blinkSpeed: 2 });
  sr(13000, 14000, { effect: 'blink', blinkSpeed: 1 });
  a('license_plate', 12000, 14500);
  h(14500, 16500, { effect: 'blink', blinkSpeed: 1 });
  t(15000, 16500);
  bb(15000, 16000, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 14500, 17000);

  // 16-22s: Sustained energy
  h(17000, 19000, { effect: 'blink', blinkSpeed: 1 });
  t(17000, 19000);
  ab(17500, 19000, { effect: 'blink', blinkSpeed: 1 });
  a('license_plate', 17000, 19500);
  L(19500, 21000, { effect: 'blink', blinkSpeed: 1 });
  R(20000, 21500, { effect: 'blink', blinkSpeed: 1 });
  a('brake_lights', 19500, 22000);
  h(21500, 23000, { effect: 'blink', blinkSpeed: 1 });
  t(22000, 23500);
  fb(22000, 23000, { effect: 'blink', blinkSpeed: 2 });

  // 23-30s: More intensity
  h(23500, 25500, { effect: 'blink', blinkSpeed: 1 });
  t(24000, 25500, { effect: 'blink', blinkSpeed: 0 });
  ab(24000, 25500, { effect: 'blink', blinkSpeed: 2 });
  sr(24500, 25500, { effect: 'blink', blinkSpeed: 1 });
  a('license_plate', 23500, 26000);
  a('brake_lights', 24000, 26500);
  h(26500, 28500, { effect: 'blink', blinkSpeed: 1 });
  t(27000, 28500);
  fb(27000, 28000, { effect: 'blink', blinkSpeed: 2 });
  bb(27500, 28500, { effect: 'blink', blinkSpeed: 2 });
  // Retro fold
  a('retro_right', 28000, 32000, { retroMode: 'roundtrip' });
  all(29000, 31000, { effect: 'blink', blinkSpeed: 2 });
  a('rear_fog', 29000, 31000);

  // 31-40s: Rich middle section
  h(31000, 33000, { effect: 'blink', blinkSpeed: 1 });
  t(31500, 33000);
  ab(32000, 33000, { effect: 'blink', blinkSpeed: 1 });
  a('brake_lights', 31500, 33500);
  a('license_plate', 31000, 33500);
  L(33500, 35000, { effect: 'blink', blinkSpeed: 1 });
  R(34000, 35500, { effect: 'blink', blinkSpeed: 1 });
  h(35500, 37500, { effect: 'blink', blinkSpeed: 1 });
  t(36000, 37500, { effect: 'blink', blinkSpeed: 0 });
  fb(36000, 37000, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 35500, 38000);
  h(38000, 40000, { effect: 'blink', blinkSpeed: 1 });
  t(38000, 40000);
  ab(38500, 40000, { effect: 'blink', blinkSpeed: 2 });
  sr(39000, 40000, { effect: 'blink', blinkSpeed: 1 });
  a('license_plate', 38000, 40500);

  // 40-49s: Building to first peak (49s = 0.71)
  h(40500, 42500, { effect: 'blink', blinkSpeed: 1 });
  t(41000, 42500);
  fb(41000, 42000, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 40500, 43000);
  h(43000, 45000, { effect: 'blink', blinkSpeed: 1 });
  t(43000, 45000, { effect: 'blink', blinkSpeed: 0 });
  ab(43500, 45000, { effect: 'blink', blinkSpeed: 2 });
  a('license_plate', 43000, 45500);
  // Window dance
  a('window_left_front', 44000, 49000, { windowMode: 'window_dance', windowDurationMs: 5000 });
  a('window_right_front', 44000, 49000, { windowMode: 'window_dance', windowDurationMs: 5000 });
  h(45500, 47500, { effect: 'blink', blinkSpeed: 2 });
  t(46000, 47500, { effect: 'blink', blinkSpeed: 1 });
  ab(46000, 47500, { effect: 'blink', blinkSpeed: 2 });
  sr(46500, 47500, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 45500, 48000);
  // PEAK at 49s
  all(48000, 50000, { effect: 'blink', blinkSpeed: 2 });
  a('rear_fog', 48000, 50000);

  // 50-60s: Post-peak sustained
  h(50000, 52000, { effect: 'blink', blinkSpeed: 1 });
  t(50500, 52000);
  fb(50500, 51500, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 50000, 52500);
  L(52500, 54000, { effect: 'blink', blinkSpeed: 1 });
  R(53000, 54500, { effect: 'blink', blinkSpeed: 1 });
  a('license_plate', 52500, 55000);
  h(55000, 57000, { effect: 'blink', blinkSpeed: 1 });
  t(55000, 57000);
  ab(55500, 57000, { effect: 'blink', blinkSpeed: 1 });
  a('brake_lights', 55000, 57500);
  h(57500, 59500, { effect: 'blink', blinkSpeed: 1 });
  t(58000, 59500, { effect: 'blink', blinkSpeed: 0 });
  bb(58000, 59000, { effect: 'blink', blinkSpeed: 2 });
  sr(58000, 59500, { effect: 'blink', blinkSpeed: 1 });

  // 60-70s: Rich middle
  h(60000, 62000, { effect: 'blink', blinkSpeed: 1 });
  t(60000, 62000);
  fb(60500, 61500, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 60000, 62500);
  a('license_plate', 60000, 62500);
  h(62500, 64500, { effect: 'blink', blinkSpeed: 1 });
  t(63000, 64500);
  ab(63000, 64500, { effect: 'blink', blinkSpeed: 2 });
  a('retro_right', 63000, 67000, { retroMode: 'roundtrip' });
  h(65000, 67000, { effect: 'blink', blinkSpeed: 1 });
  t(65000, 67000, { effect: 'blink', blinkSpeed: 0 });
  fb(65500, 66500, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 65000, 67500);
  L(67500, 69000, { effect: 'blink', blinkSpeed: 1 });
  R(68000, 69500, { effect: 'blink', blinkSpeed: 1 });
  a('license_plate', 67500, 70000);
  h(70000, 72000, { effect: 'blink', blinkSpeed: 1 });
  t(70000, 72000);
  ab(70500, 72000, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 70000, 72500);

  // 72-76s: Building to second peak (76s = 0.75)
  h(72500, 74500, { effect: 'blink', blinkSpeed: 1 });
  t(73000, 74500, { effect: 'blink', blinkSpeed: 0 });
  fb(73000, 74000, { effect: 'blink', blinkSpeed: 2 });
  sr(73500, 74500, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 72500, 75000);
  // PEAK at 76s
  all(75000, 77000, { effect: 'blink', blinkSpeed: 2 });
  a('rear_fog', 75000, 77000);
  a('flap', 75000, 80000, { flapMode: 'flap_rainbow' });
  a('window_left_back', 76000, 81000, { windowMode: 'window_dance', windowDurationMs: 5000 });
  a('window_right_back', 76000, 81000, { windowMode: 'window_dance', windowDurationMs: 5000 });

  // 77-90s: Sustained high energy
  h(77000, 79000, { effect: 'blink', blinkSpeed: 1 });
  t(77500, 79000);
  ab(77500, 79000, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 77000, 79500);
  a('license_plate', 77000, 79500);
  h(79500, 81500, { effect: 'blink', blinkSpeed: 1 });
  t(80000, 81500, { effect: 'blink', blinkSpeed: 0 });
  fb(80000, 81000, { effect: 'blink', blinkSpeed: 2 });
  L(82000, 83500, { effect: 'blink', blinkSpeed: 1 });
  R(82500, 84000, { effect: 'blink', blinkSpeed: 1 });
  a('brake_lights', 82000, 84500);
  h(84500, 86500, { effect: 'blink', blinkSpeed: 1 });
  t(85000, 86500);
  ab(85000, 86500, { effect: 'blink', blinkSpeed: 2 });
  sr(85500, 86500, { effect: 'blink', blinkSpeed: 1 });
  a('license_plate', 84500, 87000);
  h(87000, 89000, { effect: 'blink', blinkSpeed: 1 });
  t(87000, 89000);
  fb(87500, 88500, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 87000, 89500);
  h(89500, 91500, { effect: 'blink', blinkSpeed: 1 });
  t(90000, 91500, { effect: 'blink', blinkSpeed: 0 });
  bb(90000, 91000, { effect: 'blink', blinkSpeed: 2 });

  // 91-102s: Third movement — peaks at 102-106s (0.65-0.70)
  h(92000, 94000, { effect: 'blink', blinkSpeed: 1 });
  t(92000, 94000);
  ab(92500, 94000, { effect: 'blink', blinkSpeed: 2 });
  a('license_plate', 92000, 94500);
  a('brake_lights', 92000, 94500);
  a('retro_right', 94000, 98000, { retroMode: 'roundtrip' });
  L(94500, 96000, { effect: 'blink', blinkSpeed: 2 });
  R(95000, 96500, { effect: 'blink', blinkSpeed: 2 });
  h(97000, 99000, { effect: 'blink', blinkSpeed: 1 });
  t(97000, 99000, { effect: 'blink', blinkSpeed: 0 });
  ab(97500, 99000, { effect: 'blink', blinkSpeed: 2 });
  sr(98000, 99000, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 97000, 99500);
  h(99500, 101500, { effect: 'blink', blinkSpeed: 1 });
  t(100000, 101500);
  fb(100000, 101000, { effect: 'blink', blinkSpeed: 2 });
  a('license_plate', 99500, 102000);
  // Final peak 102-106s
  all(102000, 104000, { effect: 'blink', blinkSpeed: 2 });
  a('rear_fog', 102000, 104000);
  a('window_left_front', 102000, 107000, { windowMode: 'window_dance', windowDurationMs: 5000 });
  a('window_right_front', 102000, 107000, { windowMode: 'window_dance', windowDurationMs: 5000 });
  h(104000, 106000, { effect: 'blink', blinkSpeed: 2 });
  t(104000, 106000, { effect: 'blink', blinkSpeed: 1 });
  ab(104500, 106000, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 104000, 107000);
  a('license_plate', 104000, 107000);

  // 107-115s: Winding down
  h(107000, 109000, { effect: 'blink', blinkSpeed: 0 });
  t(107500, 109000);
  fb(108000, 109000, { effect: 'blink', blinkSpeed: 1 });
  a('brake_lights', 107500, 109500);
  h(110000, 112000, { effect: 'blink', blinkSpeed: 0 });
  t(110500, 112000);
  ab(110500, 112000, { effect: 'blink', blinkSpeed: 1 });
  a('license_plate', 110000, 112500);
  h(113000, 115000, { effect: 'blink', blinkSpeed: 0 });
  t(113500, 115000);
  a('brake_lights', 113000, 115500);

  // 115-126s: Quiet with brief resurgence
  h(116000, 118000, { effect: 'blink', blinkSpeed: 0 });
  t(117000, 118500);
  a('license_plate', 116000, 119000);
  h(119500, 121500);
  t(120000, 122000);
  fb(120500, 121500, { effect: 'blink', blinkSpeed: 0 });
  a('brake_lights', 120000, 122500);
  // Brief resurgence at 123-126s
  h(123000, 125000, { effect: 'blink', blinkSpeed: 1 });
  t(123000, 125000);
  ab(123500, 125000, { effect: 'blink', blinkSpeed: 1 });
  sr(124000, 125000, { effect: 'blink', blinkSpeed: 1 });
  a('license_plate', 123000, 126000);
  h(125500, 127500, { effect: 'blink', blinkSpeed: 0 });
  t(126000, 127500);
  a('brake_lights', 125500, 128000);

  // 128-135s: Final fadeout
  h(128500, 130500, { easeOut: true });
  t(129000, 130000, { easeOut: true });
  a('license_plate', 128500, 130000, { easeOut: true });
  h(131000, 133000, { easeIn: true, easeOut: true });

  saveTrack('classical_piano', events);
}

// =====================================================
// MOONLIGHT MAMBO (186s) — Dance groove with rhythmic alternation
// Structure: 0-14 intro, 15-57 main groove, 58 dip, 59-103 sustained, 103-104 dip, 105-133 bridge, 134 dip, 135-183 final, 184+ fade
// =====================================================
function genMoonlightMambo() {
  idCounter = 1;
  const events = [];
  const { a, h, t, fb, bb, ab, sr, all, L, R } = makeHelpers(events, 'mm');

  // 0-4s: Rhythmic intro
  h(300, 1500, { easeIn: true });
  a('license_plate', 500, 2000, { easeIn: true });
  h(2000, 3500, { effect: 'blink', blinkSpeed: 0 });
  t(2500, 4000);

  // 4-14s: Building dance rhythm
  L(4000, 5500, { effect: 'blink', blinkSpeed: 0 });
  R(5000, 6500, { effect: 'blink', blinkSpeed: 0 });
  a('brake_lights', 4000, 7000);
  h(7000, 9000, { effect: 'blink', blinkSpeed: 0 });
  t(7500, 9000);
  fb(7500, 8500, { effect: 'blink', blinkSpeed: 1 });
  L(9000, 10500, { effect: 'blink', blinkSpeed: 1 });
  R(9500, 11000, { effect: 'blink', blinkSpeed: 1 });
  a('license_plate', 9000, 11500);
  h(11000, 13000, { effect: 'blink', blinkSpeed: 0 });
  t(11500, 13000);
  ab(11500, 13000, { effect: 'blink', blinkSpeed: 1 });
  a('brake_lights', 11000, 14000);

  // 14s: Dip (0.05)
  h(14000, 15000, { easeIn: true, easeOut: true });

  // 15-22s: Groove kicks in
  h(15000, 17000, { effect: 'blink', blinkSpeed: 1 });
  t(15000, 17000);
  fb(15500, 16500, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 15000, 17500);
  L(17500, 19000, { effect: 'blink', blinkSpeed: 1 });
  R(18000, 19500, { effect: 'blink', blinkSpeed: 1 });
  a('license_plate', 17500, 20000);
  h(19500, 21500, { effect: 'blink', blinkSpeed: 1 });
  t(20000, 21500, { effect: 'blink', blinkSpeed: 0 });
  ab(20000, 21500, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 19500, 22000);

  // 22-30s: Dance pattern — alternating L/R with blinks
  h(22000, 24000, { effect: 'blink', blinkSpeed: 1 });
  t(22500, 24000);
  sr(22500, 24000, { effect: 'blink', blinkSpeed: 1 });
  L(24000, 25500, { effect: 'blink', blinkSpeed: 2 });
  R(24500, 26000, { effect: 'blink', blinkSpeed: 2 });
  a('license_plate', 24000, 26500);
  a('brake_lights', 24000, 27000);
  h(27000, 29000, { effect: 'blink', blinkSpeed: 1 });
  t(27000, 29000);
  fb(27500, 28500, { effect: 'blink', blinkSpeed: 2 });
  bb(28000, 29000, { effect: 'blink', blinkSpeed: 2 });

  // 30-37s: Intensifying — peak at 31s (0.65)
  all(30000, 32000, { effect: 'blink', blinkSpeed: 2 });
  a('rear_fog', 30000, 32000);
  h(32000, 34000, { effect: 'blink', blinkSpeed: 1 });
  t(32500, 34000);
  ab(32500, 34000, { effect: 'blink', blinkSpeed: 1 });
  a('brake_lights', 32000, 34500);
  a('retro_right', 33000, 37000, { retroMode: 'roundtrip' });
  L(34500, 36000, { effect: 'blink', blinkSpeed: 1 });
  R(35000, 36500, { effect: 'blink', blinkSpeed: 1 });
  a('license_plate', 34500, 37000);
  h(37000, 39000, { effect: 'blink', blinkSpeed: 1 });
  t(37000, 39000, { effect: 'blink', blinkSpeed: 0 });
  ab(37500, 39000, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 37000, 39500);

  // 39-48s: Groove continues
  h(39500, 41500, { effect: 'blink', blinkSpeed: 1 });
  t(40000, 41500);
  fb(40000, 41000, { effect: 'blink', blinkSpeed: 2 });
  sr(40500, 41500, { effect: 'blink', blinkSpeed: 1 });
  a('license_plate', 39500, 42000);
  L(42000, 43500, { effect: 'blink', blinkSpeed: 1 });
  R(42500, 44000, { effect: 'blink', blinkSpeed: 1 });
  a('brake_lights', 42000, 44500);
  h(44500, 46500, { effect: 'blink', blinkSpeed: 1 });
  t(45000, 46500);
  ab(45000, 46500, { effect: 'blink', blinkSpeed: 2 });
  // Window dance
  a('window_left_front', 45000, 50000, { windowMode: 'window_dance', windowDurationMs: 5000 });
  a('window_right_front', 45000, 50000, { windowMode: 'window_dance', windowDurationMs: 5000 });
  h(47000, 49000, { effect: 'blink', blinkSpeed: 1 });
  t(47000, 49000, { effect: 'blink', blinkSpeed: 0 });
  fb(47500, 48500, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 47000, 49500);
  a('license_plate', 47000, 49500);

  // 49-57s: Building to section end
  h(49500, 51500, { effect: 'blink', blinkSpeed: 1 });
  t(50000, 51500);
  ab(50000, 51500, { effect: 'blink', blinkSpeed: 1 });
  a('brake_lights', 49500, 52000);
  all(52000, 54000, { effect: 'blink', blinkSpeed: 2 });
  a('rear_fog', 52000, 54000);
  h(54000, 56000, { effect: 'blink', blinkSpeed: 1 });
  t(54500, 56000);
  fb(54500, 55500, { effect: 'blink', blinkSpeed: 2 });
  a('license_plate', 54000, 57000);
  a('brake_lights', 54000, 57000);

  // 57-58s: Dip (0.13)
  h(57000, 59000, { easeIn: true, easeOut: true });

  // 59-70s: Second main groove
  h(59000, 61000, { effect: 'blink', blinkSpeed: 1 });
  t(59000, 61000);
  fb(59500, 60500, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 59000, 61500);
  L(61500, 63000, { effect: 'blink', blinkSpeed: 1 });
  R(62000, 63500, { effect: 'blink', blinkSpeed: 1 });
  a('license_plate', 61500, 64000);
  h(64000, 66000, { effect: 'blink', blinkSpeed: 1 });
  t(64000, 66000, { effect: 'blink', blinkSpeed: 0 });
  ab(64500, 66000, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 64000, 66500);
  sr(65000, 66500, { effect: 'blink', blinkSpeed: 1 });
  h(67000, 69000, { effect: 'blink', blinkSpeed: 1 });
  t(67000, 69000);
  fb(67500, 68500, { effect: 'blink', blinkSpeed: 2 });
  bb(68000, 69000, { effect: 'blink', blinkSpeed: 2 });
  a('license_plate', 67000, 69500);
  a('brake_lights', 67000, 70000);

  // 70-78s: Intensifying — peak at 78s (0.69)
  h(70000, 72000, { effect: 'blink', blinkSpeed: 1 });
  t(70500, 72000);
  ab(70500, 72000, { effect: 'blink', blinkSpeed: 1 });
  a('brake_lights', 70000, 72500);
  a('retro_right', 71000, 75000, { retroMode: 'roundtrip' });
  L(72500, 74000, { effect: 'blink', blinkSpeed: 2 });
  R(73000, 74500, { effect: 'blink', blinkSpeed: 2 });
  a('license_plate', 72500, 75000);
  h(75000, 77000, { effect: 'blink', blinkSpeed: 1 });
  t(75000, 77000, { effect: 'blink', blinkSpeed: 0 });
  ab(75500, 77000, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 75000, 77500);
  // PEAK at 78s
  all(77500, 79500, { effect: 'blink', blinkSpeed: 2 });
  a('rear_fog', 77500, 79500);
  a('flap', 77500, 82000, { flapMode: 'flap_rainbow' });

  // 79.5-90s: Post-peak groove
  h(79500, 81500, { effect: 'blink', blinkSpeed: 1 });
  t(80000, 81500);
  fb(80000, 81000, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 79500, 82000);
  a('license_plate', 79500, 82000);
  L(82000, 83500, { effect: 'blink', blinkSpeed: 1 });
  R(82500, 84000, { effect: 'blink', blinkSpeed: 1 });
  h(84000, 86000, { effect: 'blink', blinkSpeed: 1 });
  t(84500, 86000);
  ab(84500, 86000, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 84000, 86500);
  sr(85000, 86500, { effect: 'blink', blinkSpeed: 1 });
  h(87000, 89000, { effect: 'blink', blinkSpeed: 1 });
  t(87000, 89000, { effect: 'blink', blinkSpeed: 0 });
  fb(87500, 88500, { effect: 'blink', blinkSpeed: 2 });
  a('license_plate', 87000, 89500);
  a('brake_lights', 87000, 90000);

  // 90-103s: Sustained groove
  h(90000, 92000, { effect: 'blink', blinkSpeed: 1 });
  t(90500, 92000);
  ab(90500, 92000, { effect: 'blink', blinkSpeed: 1 });
  a('brake_lights', 90000, 92500);
  L(92500, 94000, { effect: 'blink', blinkSpeed: 1 });
  R(93000, 94500, { effect: 'blink', blinkSpeed: 1 });
  a('license_plate', 92500, 95000);
  // Window dance
  a('window_left_back', 93000, 98000, { windowMode: 'window_dance', windowDurationMs: 5000 });
  a('window_right_back', 93000, 98000, { windowMode: 'window_dance', windowDurationMs: 5000 });
  h(95000, 97000, { effect: 'blink', blinkSpeed: 1 });
  t(95000, 97000);
  fb(95500, 96500, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 95000, 97500);
  h(97500, 99500, { effect: 'blink', blinkSpeed: 1 });
  t(98000, 99500, { effect: 'blink', blinkSpeed: 0 });
  ab(98000, 99500, { effect: 'blink', blinkSpeed: 2 });
  sr(98500, 99500, { effect: 'blink', blinkSpeed: 1 });
  a('license_plate', 97500, 100000);
  h(100000, 102000, { effect: 'blink', blinkSpeed: 1 });
  t(100500, 102000);
  bb(100500, 101500, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 100000, 103000);

  // 103-105s: Dip section (0.23-0.24)
  h(103000, 105000, { easeIn: true, easeOut: true });
  a('license_plate', 103500, 105000);

  // 105-133s: Bridge — lower energy, alternating
  h(105000, 107000, { effect: 'blink', blinkSpeed: 0 });
  t(105500, 107000);
  a('brake_lights', 105500, 107500);
  L(107500, 109000);
  R(108000, 109500);
  a('license_plate', 107500, 110000);
  h(110000, 112000, { effect: 'blink', blinkSpeed: 0 });
  t(110500, 112000);
  fb(110500, 111500, { effect: 'blink', blinkSpeed: 1 });
  a('brake_lights', 110000, 112500);
  h(113000, 115000, { effect: 'blink', blinkSpeed: 0 });
  t(113000, 115000);
  ab(113500, 115000, { effect: 'blink', blinkSpeed: 1 });
  a('license_plate', 113000, 115500);
  h(116000, 118000, { effect: 'blink', blinkSpeed: 1 });
  t(116500, 118000);
  fb(116500, 117500, { effect: 'blink', blinkSpeed: 1 });
  a('brake_lights', 116000, 118500);
  L(118500, 120000, { effect: 'blink', blinkSpeed: 1 });
  R(119000, 120500, { effect: 'blink', blinkSpeed: 1 });
  a('license_plate', 118500, 121000);
  h(121000, 123000, { effect: 'blink', blinkSpeed: 1 });
  t(121000, 123000);
  ab(121500, 123000, { effect: 'blink', blinkSpeed: 1 });
  a('brake_lights', 121000, 123500);
  h(124000, 126000, { effect: 'blink', blinkSpeed: 0 });
  t(124500, 126000);
  sr(124500, 126000, { effect: 'blink', blinkSpeed: 1 });
  a('license_plate', 124000, 126500);
  h(127000, 129000, { effect: 'blink', blinkSpeed: 1 });
  t(127000, 129000);
  fb(127500, 128500, { effect: 'blink', blinkSpeed: 1 });
  a('brake_lights', 127000, 129500);
  h(130000, 132000, { effect: 'blink', blinkSpeed: 0 });
  t(130500, 132000);
  ab(130500, 132000, { effect: 'blink', blinkSpeed: 1 });
  a('license_plate', 130000, 133000);
  a('brake_lights', 130000, 133500);

  // 134s: Dip (0.02)
  h(133500, 135000, { easeIn: true, easeOut: true });

  // 135-150s: Final section starts — groove returns
  h(135000, 137000, { effect: 'blink', blinkSpeed: 1 });
  t(135500, 137000);
  fb(135500, 136500, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 135000, 137500);
  a('retro_right', 136000, 140000, { retroMode: 'roundtrip' });
  L(137500, 139000, { effect: 'blink', blinkSpeed: 1 });
  R(138000, 139500, { effect: 'blink', blinkSpeed: 1 });
  a('license_plate', 137500, 140000);
  h(140000, 142000, { effect: 'blink', blinkSpeed: 1 });
  t(140000, 142000, { effect: 'blink', blinkSpeed: 0 });
  ab(140500, 142000, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 140000, 142500);
  h(143000, 145000, { effect: 'blink', blinkSpeed: 1 });
  t(143000, 145000);
  fb(143500, 144500, { effect: 'blink', blinkSpeed: 2 });
  sr(144000, 145000, { effect: 'blink', blinkSpeed: 1 });
  a('license_plate', 143000, 145500);
  a('brake_lights', 143000, 146000);
  // Window dance
  a('window_left_front', 145000, 150000, { windowMode: 'window_dance', windowDurationMs: 5000 });
  a('window_right_front', 145000, 150000, { windowMode: 'window_dance', windowDurationMs: 5000 });
  h(146000, 148000, { effect: 'blink', blinkSpeed: 1 });
  t(146500, 148000);
  ab(146500, 148000, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 146000, 148500);
  all(148500, 150500, { effect: 'blink', blinkSpeed: 2 });
  a('rear_fog', 148500, 150500);

  // 150-153s: Brief dip at 153s (0.11)
  h(150500, 152500, { effect: 'blink', blinkSpeed: 1 });
  t(151000, 152500);
  a('brake_lights', 150500, 153000);
  h(153000, 154000, { easeIn: true, easeOut: true });

  // 154-170s: Final groove
  h(154000, 156000, { effect: 'blink', blinkSpeed: 1 });
  t(154500, 156000);
  fb(154500, 155500, { effect: 'blink', blinkSpeed: 1 });
  a('license_plate', 154000, 156500);
  L(156500, 158000, { effect: 'blink', blinkSpeed: 1 });
  R(157000, 158500, { effect: 'blink', blinkSpeed: 1 });
  a('brake_lights', 156500, 159000);
  h(159000, 161000, { effect: 'blink', blinkSpeed: 1 });
  t(159000, 161000);
  ab(159500, 161000, { effect: 'blink', blinkSpeed: 2 });
  a('license_plate', 159000, 161500);
  a('brake_lights', 159000, 162000);
  h(162000, 164000, { effect: 'blink', blinkSpeed: 1 });
  t(162500, 164000);
  fb(162500, 163500, { effect: 'blink', blinkSpeed: 2 });
  sr(163000, 164000, { effect: 'blink', blinkSpeed: 1 });
  L(164500, 166000, { effect: 'blink', blinkSpeed: 1 });
  R(165000, 166500, { effect: 'blink', blinkSpeed: 1 });
  a('license_plate', 164500, 167000);
  a('brake_lights', 164500, 167000);
  h(167000, 169000, { effect: 'blink', blinkSpeed: 1 });
  t(167500, 169000);
  ab(167500, 169000, { effect: 'blink', blinkSpeed: 1 });
  a('brake_lights', 167000, 170000);

  // 170-180s: Building to finale
  h(170000, 172000, { effect: 'blink', blinkSpeed: 1 });
  t(170000, 172000, { effect: 'blink', blinkSpeed: 0 });
  fb(170500, 171500, { effect: 'blink', blinkSpeed: 2 });
  a('license_plate', 170000, 172500);
  a('brake_lights', 170000, 172500);
  a('retro_right', 172000, 176000, { retroMode: 'roundtrip' });
  L(172500, 174000, { effect: 'blink', blinkSpeed: 2 });
  R(173000, 174500, { effect: 'blink', blinkSpeed: 2 });
  h(175000, 177000, { effect: 'blink', blinkSpeed: 1 });
  t(175000, 177000);
  ab(175500, 177000, { effect: 'blink', blinkSpeed: 2 });
  sr(176000, 177000, { effect: 'blink', blinkSpeed: 2 });
  a('brake_lights', 175000, 177500);
  // Finale
  all(177500, 179500, { effect: 'blink', blinkSpeed: 2 });
  a('rear_fog', 177500, 179500);
  a('flap', 177500, 182000, { flapMode: 'flap_rainbow' });
  h(179500, 181500, { effect: 'blink', blinkSpeed: 2 });
  t(180000, 181500, { effect: 'blink', blinkSpeed: 1 });
  ab(180000, 181500, { effect: 'blink', blinkSpeed: 2 });
  a('license_plate', 179500, 182000);
  a('brake_lights', 179500, 182000);

  // 182-186s: Fadeout
  h(182000, 183500, { easeOut: true });
  t(182000, 183000, { easeOut: true });
  a('license_plate', 182000, 183000, { easeOut: true });

  saveTrack('moonlight_mambo', events);
}

// =====================================================
// FIX STAR WARS — set all power values to 100
// =====================================================
function fixStarWarsPower() {
  const data = JSON.parse(readFileSync(`${outDir}/star_wars_battle.json`, 'utf8'));
  data.events = data.events.map(e => ({ ...e, power: 100 }));
  const before = data.events.length;
  data.events = capEvents(data.events);
  data.events.sort((a, b) => a.startMs - b.startMs);
  writeFileSync(`${outDir}/star_wars_battle.json`, JSON.stringify(data, null, 2));
  const trimmed = before > data.events.length ? ` (trimmed from ${before})` : '';
  console.log(`star_wars_battle: ${data.events.length} events${trimmed}`);
}

// =====================================================
// GENERATE INDEX
// =====================================================
function genIndex() {
  const trackIds = [
    'jingle_bells', 'jingle_bells_metal', 'new_year_countdown',
    'halloween', 'happy_birthday', 'classical_piano',
    'moonlight_mambo', 'star_wars_battle',
  ];
  let code = '// Auto-generated demo show index\n';
  code += '// Maps track IDs to their pre-made light show data\n\n';
  for (const id of trackIds) {
    code += `export const ${id}_demo = require('./${id}.json');\n`;
  }
  code += '\nexport const DEMO_SHOWS = {\n';
  for (const id of trackIds) {
    code += `  '${id}': ${id}_demo,\n`;
  }
  code += '};\n';
  writeFileSync(`${outDir}/index.js`, code);
  console.log('\nWrote index.js');
}

// Run all generators
genJingleBellsMetal();
genJingleBells();
genNewYearCountdown();
genHalloween();
genHappyBirthday();
genClassicalPiano();
genMoonlightMambo();
fixStarWarsPower();
genIndex();
console.log('Done!');
