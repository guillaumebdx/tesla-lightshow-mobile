#!/usr/bin/env node
/**
 * Generate all demo light shows programmatically.
 * Rules:
 *  - MAX 500 events per show
 *  - power always 100
 *  - Closure limits: window x6 each, retro x20 each, trunk x6, flap x3
 *  - Trunk: must open (13s) BEFORE dance; dance needs open state
 *  - Windows: dance all 4, at least 10s each occurrence
 *  - Lots of blink, phase changes, stacking, wow factor
 *  - Tesla light-only parts: no closure limits (just event count limit)
 */

const fs = require('fs');
const path = require('path');

// Track durations in ms
const TRACKS = {
  halloween:          { dur: 78600,  bodyColor: '#222222' },
  jingle_bells:       { dur: 104100, bodyColor: '#cc0000' },
  jingle_bells_metal: { dur: 29900,  bodyColor: '#111111' },
  happy_birthday:     { dur: 84000,  bodyColor: '#ff69b4' },
  classical_piano:    { dur: 134800, bodyColor: '#1a1a2e' },
  moonlight_mambo:    { dur: 171100, bodyColor: '#2d1b69' },
  new_year_countdown: { dur: 72500,  bodyColor: '#000033' },
  star_wars_battle:   { dur: 92400,  bodyColor: '#0a0a0a' },
};

const LIGHT_PARTS = [
  'light_left_front','light_right_front','light_left_back','light_right_back',
  'blink_front_left','blink_front_right','blink_back_left','blink_back_right',
  'license_plate','brake_lights','rear_fog','side_repeater_left','side_repeater_right'
];
const FRONT_LIGHTS = ['light_left_front','light_right_front'];
const BACK_LIGHTS = ['light_left_back','light_right_back'];
const FRONT_BLINKS = ['blink_front_left','blink_front_right'];
const BACK_BLINKS = ['blink_back_left','blink_back_right'];
const SIDE_REPEATERS = ['side_repeater_left','side_repeater_right'];
const ALL_BLINKS = [...FRONT_BLINKS, ...BACK_BLINKS, ...SIDE_REPEATERS];
const WINDOWS = ['window_left_front','window_right_front','window_left_back','window_right_back'];
const RETROS = ['retro_left','retro_right'];

// Left-side and right-side light groups (3 parts each = 6 events per alt step)
const LEFT_LIGHTS = ['light_left_front','light_left_back','blink_front_left'];
const RIGHT_LIGHTS = ['light_right_front','light_right_back','blink_front_right'];

let idCounter = 0;
function evt(part, startMs, endMs, opts = {}) {
  idCounter++;
  return {
    id: `d_${idCounter}`,
    part,
    startMs: Math.round(startMs),
    endMs: Math.round(endMs),
    effect: opts.effect || 'solid',
    power: 100,
    blinkSpeed: opts.blinkSpeed ?? 0,
    easeIn: opts.easeIn ?? false,
    easeOut: opts.easeOut ?? false,
    retroMode: opts.retroMode || 'roundtrip',
    windowMode: opts.windowMode || 'window_dance',
    windowDurationMs: opts.windowDurationMs || 10000,
    trunkMode: opts.trunkMode || 'trunk_open',
    flapMode: opts.flapMode || 'flap_open',
  };
}

// Helper: add events for multiple parts at same time
function multiEvt(parts, startMs, endMs, opts = {}) {
  return parts.map(p => evt(p, startMs, endMs, opts));
}

// Helper: stroboscopic burst on parts
function strobe(parts, startMs, endMs, speed = 0) {
  return parts.map(p => evt(p, startMs, endMs, { effect: 'blink', blinkSpeed: speed }));
}

// Lightweight alternating left/right — only 3 parts per side, 2 steps only = 6 events
function altFlash(startMs, durMs, speed = 0) {
  const half = durMs / 2;
  return [
    ...multiEvt(LEFT_LIGHTS, startMs, startMs + half, { effect: 'blink', blinkSpeed: speed }),
    ...multiEvt(RIGHT_LIGHTS, startMs + half, startMs + durMs, { effect: 'blink', blinkSpeed: speed }),
  ];
}

// Rich alternating left/right — 5 parts per side, N steps = 5*N events
function altBlink(startMs, duration, interval, speed = 0) {
  const evts = [];
  const leftParts = ['light_left_front','light_left_back','blink_front_left','blink_back_left','side_repeater_left'];
  const rightParts = ['light_right_front','light_right_back','blink_front_right','blink_back_right','side_repeater_right'];
  let t = startMs;
  let isLeft = true;
  while (t + interval <= startMs + duration) {
    const parts = isLeft ? leftParts : rightParts;
    evts.push(...parts.map(p => evt(p, t, t + interval, { effect: 'blink', blinkSpeed: speed })));
    t += interval;
    isLeft = !isLeft;
  }
  return evts;
}

// Light wave front→back: 7 events (compact version)
function wave(startMs, segDur, opts = {}) {
  return [
    ...multiEvt(FRONT_LIGHTS, startMs, startMs + segDur, opts),
    evt('license_plate', startMs + segDur*0.3, startMs + segDur*1.3, opts),
    ...multiEvt(BACK_LIGHTS, startMs + segDur*0.6, startMs + segDur*1.6, opts),
    evt('brake_lights', startMs + segDur*0.6, startMs + segDur*1.6, opts),
    evt('rear_fog', startMs + segDur*0.8, startMs + segDur*1.8, opts),
  ];
}

// Full wave front→back with blinkers+repeaters: 14 events
function fullWave(startMs, segDur, opts = {}) {
  return [
    ...multiEvt(FRONT_LIGHTS, startMs, startMs + segDur, opts),
    ...multiEvt(FRONT_BLINKS, startMs + segDur*0.2, startMs + segDur*1.2, opts),
    ...multiEvt(SIDE_REPEATERS, startMs + segDur*0.4, startMs + segDur*1.4, opts),
    ...multiEvt(BACK_BLINKS, startMs + segDur*0.6, startMs + segDur*1.6, opts),
    ...multiEvt(BACK_LIGHTS, startMs + segDur*0.8, startMs + segDur*1.8, opts),
    evt('brake_lights', startMs + segDur*0.8, startMs + segDur*1.8, opts),
    evt('rear_fog', startMs + segDur*0.8, startMs + segDur*1.8, opts),
    evt('license_plate', startMs + segDur*0.6, startMs + segDur*1.6, opts),
  ];
}

// All 13 light parts on = 13 events
function allLightsOn(startMs, endMs, opts = {}) {
  return LIGHT_PARTS.map(p => evt(p, startMs, endMs, opts));
}

// Front 4 lights (headlights + front blinkers) = 4 events
function frontBlock(startMs, endMs, opts = {}) {
  return [...multiEvt(FRONT_LIGHTS, startMs, endMs, opts), ...multiEvt(FRONT_BLINKS, startMs, endMs, opts)];
}

// Rear 5 lights (taillights + rear blinkers + brake) = 5 events
function rearBlock(startMs, endMs, opts = {}) {
  return [...multiEvt(BACK_LIGHTS, startMs, endMs, opts), ...multiEvt(BACK_BLINKS, startMs, endMs, opts), evt('brake_lights', startMs, endMs, opts)];
}

// Windows dance (all 4) = 4 events
function windowsDance(startMs, durationMs) {
  return WINDOWS.map(p => evt(p, startMs, startMs + durationMs, { windowMode: 'window_dance', windowDurationMs: durationMs }));
}

// Retro roundtrip = 2 events
function retroRoundtrip(startMs) {
  return RETROS.map(p => evt(p, startMs, startMs + 4000, { retroMode: 'roundtrip' }));
}

// Retro close then open later = 4 events
function retroCloseOpen(closeMs, openMs) {
  return [
    ...RETROS.map(p => evt(p, closeMs, closeMs + 2000, { retroMode: 'close' })),
    ...RETROS.map(p => evt(p, openMs, openMs + 2000, { retroMode: 'open' })),
  ];
}

// Trunk open → dance → close = 3 events (or 2 without close)
function trunkSequence(openMs, danceDur, closeTrunk = true) {
  const evts = [
    evt('trunk', openMs, openMs + 13000, { trunkMode: 'trunk_open' }),
    evt('trunk', openMs + 14000, openMs + 14000 + danceDur, { trunkMode: 'trunk_dance' }),
  ];
  if (closeTrunk) {
    evts.push(evt('trunk', openMs + 15000 + danceDur, openMs + 19000 + danceDur, { trunkMode: 'trunk_close' }));
  }
  return evts;
}

// Flap open + rainbow + close = 3 events
function flapSequence(openMs, rainbowDur) {
  return [
    evt('flap', openMs, openMs + 2000, { flapMode: 'flap_open' }),
    evt('flap', openMs + 2500, openMs + 2500 + rainbowDur, { flapMode: 'flap_rainbow' }),
    evt('flap', openMs + 3000 + rainbowDur, openMs + 5000 + rainbowDur, { flapMode: 'flap_close' }),
  ];
}

// ============================================================
// HALLOWEEN — 78.6s — Spooky, intense, lots of strobes
// Budget: ~480 events
// ============================================================
function generateHalloween() {
  const evts = [];
  
  // Phase 1: Creepy intro (0-10s) — eerie fade-in then sudden burst
  evts.push(...multiEvt(FRONT_LIGHTS, 500, 3000, { easeIn: true }));       // 2
  evts.push(evt('license_plate', 1000, 3500, { easeIn: true }));           // 1
  evts.push(...multiEvt(BACK_LIGHTS, 2000, 4500, { easeIn: true }));       // 2
  evts.push(...strobe(LIGHT_PARTS, 4000, 6500, 2));                        // 13
  evts.push(...RETROS.map(p => evt(p, 5000, 7000, { retroMode: 'close' }))); // 2
  evts.push(...RETROS.map(p => evt(p, 8000, 10000, { retroMode: 'open' }))); // 2  = 22

  // Phase 2: Building tension (10-25s)
  evts.push(...altBlink(10000, 4000, 500, 1));                             // 40
  evts.push(...frontBlock(14500, 17000));                                   // 4
  evts.push(...rearBlock(15000, 17500));                                    // 5
  evts.push(...strobe(ALL_BLINKS, 17000, 20000, 2));                       // 6
  evts.push(evt('brake_lights', 17000, 20000, { effect: 'blink', blinkSpeed: 2 })); // 1
  evts.push(evt('rear_fog', 17000, 20000, { effect: 'blink', blinkSpeed: 2 }));     // 1
  evts.push(...fullWave(20000, 1500));                                     // 14
  evts.push(...altFlash(22000, 3000, 0));                                  // 6  = 77

  // Phase 3: Peak madness (25-42s) — windows + trunk + everything
  evts.push(...windowsDance(25000, 12000));                                // 4
  evts.push(...strobe(LIGHT_PARTS, 25000, 30000, 1));                      // 13
  evts.push(...trunkSequence(26000, 8000));                                // 3
  evts.push(...flapSequence(30000, 8000));                                 // 3
  evts.push(...retroRoundtrip(32000));                                     // 2
  evts.push(...fullWave(34000, 1000));                                     // 14
  evts.push(...strobe(LIGHT_PARTS, 37000, 42000, 2));                      // 13
  evts.push(...retroRoundtrip(38000));                                     // 2  = 54

  // Phase 4: Second wave (42-55s) — intense alternating + windows
  evts.push(...fullWave(42000, 1200));                                     // 14
  evts.push(...altBlink(44000, 4000, 600, 0));                             // 30
  evts.push(...allLightsOn(49000, 52000));                                 // 13
  evts.push(...windowsDance(50000, 10000));                                // 4
  evts.push(...retroCloseOpen(50000, 55000));                              // 4  = 65

  // Phase 5: Intensity surge (55-68s) — full strobes + rich waves
  evts.push(...strobe(LIGHT_PARTS, 55000, 60000, 2));                      // 13
  evts.push(...fullWave(60000, 1000));                                     // 14
  evts.push(...allLightsOn(62000, 66000, { effect: 'blink', blinkSpeed: 1 })); // 13
  evts.push(...fullWave(66000, 800));                                      // 14
  evts.push(...retroRoundtrip(66000));                                     // 2  = 56

  // Phase 6: Grand finale (68-78s) — maximum everything
  evts.push(...altBlink(68000, 3000, 500, 2));                             // 30
  evts.push(...allLightsOn(70000, 75000, { effect: 'blink', blinkSpeed: 2 })); // 13
  evts.push(...retroRoundtrip(71000));                                     // 2
  evts.push(...fullWave(74000, 600));                                      // 14
  evts.push(...allLightsOn(75500, 77500));                                 // 13
  evts.push(...strobe(LIGHT_PARTS, 77000, 78000, 2));                      // 13
  evts.push(...allLightsOn(77800, 78400, { easeOut: true }));              // 13  = 98
  // Total ≈ 372
  return evts;
}

// ============================================================
// JINGLE BELLS — 104.1s — Festive, joyful, variety
// Budget: aim ~480 events, coverage full 104s
// ============================================================
function generateJingleBells() {
  const evts = [];
  
  // Intro (0-12s)
  evts.push(...multiEvt(FRONT_LIGHTS, 500, 3000, { easeIn: true }));       // 2
  evts.push(evt('license_plate', 1000, 4000, { easeIn: true }));           // 1
  evts.push(...multiEvt(BACK_LIGHTS, 2000, 5000, { easeIn: true }));       // 2
  evts.push(...frontBlock(5000, 8000, { effect: 'blink', blinkSpeed: 0 })); // 4
  evts.push(...rearBlock(6000, 9000, { effect: 'blink', blinkSpeed: 0 })); // 5
  evts.push(...fullWave(8000, 1200));                                      // 14 = 28

  // Verse 1 (12-30s)
  evts.push(...altBlink(12000, 4000, 500, 0));                             // 40
  evts.push(...allLightsOn(16000, 19000));                                 // 13
  evts.push(...strobe(ALL_BLINKS, 19000, 22000, 1));                       // 6
  evts.push(...multiEvt(FRONT_LIGHTS, 19000, 22000));                      // 2
  evts.push(...retroRoundtrip(20000));                                     // 2
  evts.push(...fullWave(24000, 1000));                                     // 14
  evts.push(...altFlash(26000, 4000, 1));                                  // 6 = 83

  // Chorus 1 (30-50s) — full blast + windows + trunk
  evts.push(...strobe(LIGHT_PARTS, 30000, 35000, 1));                      // 13
  evts.push(...windowsDance(31000, 12000));                                // 4
  evts.push(...trunkSequence(32000, 8000));                                // 3
  evts.push(...retroRoundtrip(34000));                                     // 2
  evts.push(...flapSequence(36000, 6000));                                 // 3
  evts.push(...fullWave(38000, 800));                                      // 14
  evts.push(...allLightsOn(40000, 45000, { effect: 'blink', blinkSpeed: 2 })); // 13
  evts.push(...retroRoundtrip(42000));                                     // 2
  evts.push(...fullWave(45000, 1000));                                     // 14 = 68

  // Bridge (50-65s)
  evts.push(...frontBlock(50000, 54000));                                  // 4
  evts.push(evt('license_plate', 50000, 54000));                           // 1
  evts.push(...rearBlock(54000, 58000));                                   // 5
  evts.push(...multiEvt(SIDE_REPEATERS, 55000, 59000, { effect: 'blink', blinkSpeed: 0 })); // 2
  evts.push(...fullWave(59000, 1500));                                     // 14
  evts.push(...altBlink(61000, 3000, 500, 1));                             // 30 = 56

  // Chorus 2 (65-85s) — even bigger
  evts.push(...strobe(LIGHT_PARTS, 65000, 70000, 2));                      // 13
  evts.push(...windowsDance(66000, 12000));                                // 4
  evts.push(...retroCloseOpen(67000, 73000));                              // 4
  evts.push(...fullWave(70000, 800));                                      // 14
  evts.push(...allLightsOn(73000, 78000, { effect: 'blink', blinkSpeed: 1 })); // 13
  evts.push(...retroRoundtrip(76000));                                     // 2
  evts.push(...fullWave(78000, 1000));                                     // 14
  evts.push(...allLightsOn(80000, 85000));                                 // 13 = 77

  // Grand finale (85-104s)
  evts.push(...strobe(LIGHT_PARTS, 85000, 90000, 2));                      // 13
  evts.push(...windowsDance(86000, 10000));                                // 4
  evts.push(...retroRoundtrip(88000));                                     // 2
  evts.push(...fullWave(90000, 600));                                      // 14
  evts.push(...allLightsOn(92000, 97000, { effect: 'blink', blinkSpeed: 2 })); // 13
  evts.push(...retroRoundtrip(94000));                                     // 2
  evts.push(...fullWave(97000, 800));                                      // 14
  evts.push(...allLightsOn(99000, 103000));                                // 13
  evts.push(...allLightsOn(103000, 103800, { easeOut: true }));            // 13 = 88
  // Total ≈ 400
  return evts;
}

// ============================================================
// JINGLE BELLS METAL — 30s — Short, ultra intense, max everything
// Budget: aim ~350 (pack 30s to the max)
// ============================================================
function generateJingleBellsMetal() {
  const evts = [];
  
  // Explosive start (0-5s)
  evts.push(...strobe(LIGHT_PARTS, 200, 3000, 2));                        // 13
  evts.push(...retroRoundtrip(500));                                       // 2
  evts.push(...fullWave(2500, 500));                                       // 14

  // Full blast + windows (3-10s)
  evts.push(...allLightsOn(3000, 7000, { effect: 'blink', blinkSpeed: 2 })); // 13
  evts.push(...windowsDance(3000, 12000));                                 // 4

  // Alternating madness (7-15s)
  evts.push(...altBlink(7000, 3000, 300, 2));                              // 50
  evts.push(...fullWave(10000, 600));                                      // 14
  evts.push(...strobe(LIGHT_PARTS, 11500, 15000, 1));                      // 13
  evts.push(...retroRoundtrip(10000));                                     // 2

  // Trunk + flap + chaos (13-22s)
  evts.push(...trunkSequence(13000, 5000, false));                         // 2
  evts.push(...flapSequence(14000, 5000));                                 // 3
  evts.push(...allLightsOn(15000, 18000, { effect: 'blink', blinkSpeed: 2 })); // 13
  evts.push(...fullWave(18000, 500));                                      // 14
  evts.push(...retroRoundtrip(18000));                                     // 2
  evts.push(...strobe(LIGHT_PARTS, 19500, 22000, 2));                      // 13

  // Grand finale (22-30s) — maximum insanity
  evts.push(...altBlink(22000, 3000, 300, 2));                             // 50
  evts.push(...fullWave(25000, 400));                                      // 14
  evts.push(...allLightsOn(25500, 28000, { effect: 'blink', blinkSpeed: 2 })); // 13
  evts.push(...retroRoundtrip(26000));                                     // 2
  evts.push(...strobe(LIGHT_PARTS, 28000, 29500, 2));                      // 13
  evts.push(...allLightsOn(29200, 29700));                                 // 13
  // Total ≈ 277
  return evts;
}

// ============================================================
// HAPPY BIRTHDAY — 84s — Fun, celebratory, party vibes
// Budget: aim ~450
// ============================================================
function generateHappyBirthday() {
  const evts = [];
  
  // Gentle intro (0-10s)
  evts.push(...multiEvt(FRONT_LIGHTS, 500, 4000, { easeIn: true }));       // 2
  evts.push(evt('license_plate', 1000, 5000, { easeIn: true }));           // 1
  evts.push(...multiEvt(BACK_LIGHTS, 3000, 7000, { easeIn: true }));       // 2
  evts.push(...frontBlock(5000, 8000, { effect: 'blink', blinkSpeed: 0 })); // 4
  evts.push(...fullWave(8000, 1500));                                      // 14 = 23

  // Verse 1 (10-28s) — rhythmic happy patterns
  evts.push(...allLightsOn(10000, 14000));                                 // 13
  evts.push(...strobe(ALL_BLINKS, 14000, 18000, 1));                       // 6
  evts.push(...multiEvt(FRONT_LIGHTS, 14000, 18000));                      // 2
  evts.push(...retroRoundtrip(15000));                                     // 2
  evts.push(...altBlink(18000, 4000, 500, 0));                             // 40
  evts.push(...fullWave(22000, 1200));                                     // 14
  evts.push(...allLightsOn(24000, 28000, { effect: 'blink', blinkSpeed: 0 })); // 13 = 90

  // Party section (28-50s) — windows + trunk + everything
  evts.push(...windowsDance(28000, 12000));                                // 4
  evts.push(...strobe(LIGHT_PARTS, 28000, 33000, 1));                      // 13
  evts.push(...trunkSequence(29000, 8000));                                // 3
  evts.push(...flapSequence(33000, 6000));                                 // 3
  evts.push(...retroRoundtrip(35000));                                     // 2
  evts.push(...fullWave(36000, 800));                                      // 14
  evts.push(...allLightsOn(38000, 43000, { effect: 'blink', blinkSpeed: 2 })); // 13
  evts.push(...fullWave(43000, 1000));                                     // 14
  evts.push(...retroRoundtrip(44000));                                     // 2
  evts.push(...altFlash(46000, 4000, 1));                                  // 6 = 74

  // Calm bridge (50-60s)
  evts.push(...frontBlock(50000, 55000));                                  // 4
  evts.push(evt('license_plate', 50000, 55000));                           // 1
  evts.push(...rearBlock(52000, 57000));                                   // 5
  evts.push(...frontBlock(55000, 59000, { effect: 'blink', blinkSpeed: 0 })); // 4
  evts.push(...fullWave(59000, 1200));                                     // 14 = 28

  // Final celebration (60-84s) — grand party finale
  evts.push(...windowsDance(60000, 11000));                                // 4
  evts.push(...strobe(LIGHT_PARTS, 60000, 65000, 2));                      // 13
  evts.push(...retroCloseOpen(62000, 68000));                              // 4
  evts.push(...fullWave(65000, 800));                                      // 14
  evts.push(...allLightsOn(68000, 73000, { effect: 'blink', blinkSpeed: 1 })); // 13
  evts.push(...retroRoundtrip(70000));                                     // 2
  evts.push(...fullWave(73000, 1000));                                     // 14
  evts.push(...altBlink(74000, 3000, 500, 2));                             // 30
  evts.push(...allLightsOn(77000, 80000, { effect: 'blink', blinkSpeed: 2 })); // 13
  evts.push(...fullWave(80000, 600));                                      // 14
  evts.push(...allLightsOn(81000, 83500));                                 // 13
  evts.push(...allLightsOn(83500, 83900, { easeOut: true }));              // 13 = 147
  // Total ≈ 362
  return evts;
}

// ============================================================
// CLASSICAL PIANO — 134.8s — Elegant, sweeping, dramatic
// Budget: aim ~490 (long track, spread richly over 135s)
// ============================================================
function generateClassicalPiano() {
  const evts = [];
  
  // Soft opening (0-15s)
  evts.push(...multiEvt(FRONT_LIGHTS, 1000, 5000, { easeIn: true }));      // 2
  evts.push(evt('license_plate', 2000, 7000, { easeIn: true }));           // 1
  evts.push(...multiEvt(BACK_LIGHTS, 5000, 10000, { easeIn: true }));      // 2
  evts.push(...fullWave(10000, 2000));                                     // 14 = 19

  // Movement 1 (15-40s) — building
  evts.push(...altBlink(15000, 4000, 600, 0));                             // 30
  evts.push(...allLightsOn(20000, 25000));                                 // 13
  evts.push(...retroRoundtrip(22000));                                     // 2
  evts.push(...fullWave(25000, 1500));                                     // 14
  evts.push(...frontBlock(28000, 33000));                                  // 4
  evts.push(...rearBlock(30000, 35000));                                   // 5
  evts.push(...strobe(ALL_BLINKS, 33000, 37000, 0));                       // 6
  evts.push(...fullWave(37000, 1200));                                     // 14 = 88

  // Movement 2 (40-65s): crescendo + closures
  evts.push(...allLightsOn(40000, 45000, { effect: 'blink', blinkSpeed: 0 })); // 13
  evts.push(...windowsDance(42000, 12000));                                // 4
  evts.push(...retroCloseOpen(44000, 50000));                              // 4
  evts.push(...fullWave(48000, 1000));                                     // 14
  evts.push(...strobe(LIGHT_PARTS, 50000, 55000, 1));                      // 13
  evts.push(...trunkSequence(50000, 6000));                                // 3
  evts.push(...flapSequence(54000, 6000));                                 // 3
  evts.push(...allLightsOn(58000, 63000));                                 // 13
  evts.push(...retroRoundtrip(60000));                                     // 2
  evts.push(...fullWave(62000, 800));                                      // 14 = 83

  // Quiet interlude (65-80s)
  evts.push(...frontBlock(65000, 70000, { easeIn: true }));                // 4
  evts.push(evt('license_plate', 67000, 73000));                           // 1
  evts.push(...rearBlock(70000, 75000));                                   // 5
  evts.push(...fullWave(75000, 2000));                                     // 14
  evts.push(...altFlash(78000, 3000, 0));                                  // 6 = 30

  // Movement 3 (80-115s) — full power
  evts.push(...strobe(LIGHT_PARTS, 80000, 86000, 1));                      // 13
  evts.push(...windowsDance(82000, 12000));                                // 4
  evts.push(...retroRoundtrip(84000));                                     // 2
  evts.push(...altBlink(86000, 4000, 500, 1));                             // 40
  evts.push(...fullWave(91000, 800));                                      // 14
  evts.push(...allLightsOn(94000, 100000, { effect: 'blink', blinkSpeed: 2 })); // 13
  evts.push(...retroRoundtrip(96000));                                     // 2
  evts.push(...fullWave(100000, 1000));                                    // 14
  evts.push(...allLightsOn(103000, 108000));                               // 13
  evts.push(...altFlash(108000, 4000, 1));                                 // 6
  evts.push(...fullWave(112000, 800));                                     // 14 = 135

  // Grand finale (115-134s)
  evts.push(...strobe(LIGHT_PARTS, 115000, 120000, 2));                     // 13
  evts.push(...windowsDance(116000, 10000));                               // 4
  evts.push(...retroRoundtrip(118000));                                    // 2
  evts.push(...fullWave(120000, 600));                                     // 14
  evts.push(...allLightsOn(123000, 128000, { effect: 'blink', blinkSpeed: 2 })); // 13
  evts.push(...retroRoundtrip(125000));                                    // 2
  evts.push(...fullWave(128000, 800));                                     // 14
  evts.push(...allLightsOn(130000, 133000));                               // 13
  evts.push(...allLightsOn(133500, 134500, { easeOut: true }));            // 13 = 88
  // Total ≈ 443
  return evts;
}

// ============================================================
// MOONLIGHT MAMBO — 171.1s — Groovy, rhythmic, latin vibes
// Budget: aim ~490 (very long track, dense in peak sections)
// ============================================================
function generateMoonlightMambo() {
  const evts = [];
  
  // Intro groove (0-20s)
  evts.push(...multiEvt(FRONT_LIGHTS, 500, 4000, { easeIn: true }));       // 2
  evts.push(evt('license_plate', 1000, 5000, { easeIn: true }));           // 1
  evts.push(...multiEvt(BACK_LIGHTS, 3000, 7000, { easeIn: true }));       // 2
  evts.push(...frontBlock(6000, 9000, { effect: 'blink', blinkSpeed: 0 })); // 4
  evts.push(...rearBlock(8000, 11000, { effect: 'blink', blinkSpeed: 0 })); // 5
  evts.push(...altFlash(13000, 4000, 0));                                  // 6
  evts.push(...fullWave(17000, 1500));                                     // 14 = 34

  // Verse 1 (20-45s)
  evts.push(...allLightsOn(20000, 25000));                                 // 13
  evts.push(...retroRoundtrip(22000));                                     // 2
  evts.push(...strobe(ALL_BLINKS, 25000, 29000, 1));                       // 6
  evts.push(...multiEvt(FRONT_LIGHTS, 25000, 29000));                      // 2
  evts.push(...fullWave(30000, 1200));                                     // 14
  evts.push(...altBlink(33000, 3000, 500, 1));                             // 30
  evts.push(...retroRoundtrip(36000));                                     // 2
  evts.push(...allLightsOn(38000, 43000, { effect: 'blink', blinkSpeed: 0 })); // 13 = 82

  // Chorus 1 (45-70s) — full energy
  evts.push(...strobe(LIGHT_PARTS, 45000, 50000, 1));                      // 13
  evts.push(...windowsDance(46000, 12000));                                // 4
  evts.push(...trunkSequence(47000, 8000));                                // 3
  evts.push(...retroCloseOpen(48000, 54000));                              // 4
  evts.push(...flapSequence(52000, 6000));                                 // 3
  evts.push(...allLightsOn(55000, 60000, { effect: 'blink', blinkSpeed: 2 })); // 13
  evts.push(...fullWave(60000, 800));                                      // 14
  evts.push(...altFlash(63000, 4000, 1));                                  // 6
  evts.push(...retroRoundtrip(66000));                                     // 2
  evts.push(...allLightsOn(67000, 70000));                                 // 13 = 75

  // Bridge (70-95s) — mambo groove
  evts.push(...frontBlock(70000, 76000));                                  // 4
  evts.push(evt('license_plate', 70000, 76000));                           // 1
  evts.push(...rearBlock(74000, 80000));                                   // 5
  evts.push(...retroRoundtrip(78000));                                     // 2
  evts.push(...altBlink(82000, 3000, 500, 0));                             // 30
  evts.push(...fullWave(87000, 1200));                                     // 14
  evts.push(...frontBlock(90000, 95000, { effect: 'blink', blinkSpeed: 1 })); // 4
  evts.push(evt('rear_fog', 92000, 95000));                                // 1 = 61

  // Chorus 2 (95-130s) — bigger
  evts.push(...windowsDance(95000, 12000));                                // 4
  evts.push(...allLightsOn(95000, 100000, { effect: 'blink', blinkSpeed: 1 })); // 13
  evts.push(...retroRoundtrip(98000));                                     // 2
  evts.push(...fullWave(101000, 800));                                     // 14
  evts.push(...altFlash(104000, 4000, 2));                                 // 6
  evts.push(...allLightsOn(108000, 113000, { effect: 'blink', blinkSpeed: 2 })); // 13
  evts.push(...retroRoundtrip(110000));                                    // 2
  evts.push(...fullWave(114000, 1000));                                    // 14
  evts.push(...retroRoundtrip(118000));                                    // 2
  evts.push(...allLightsOn(120000, 125000));                               // 13
  evts.push(...fullWave(126000, 800));                                     // 14 = 97

  // Finale (130-171s) — grand ending
  evts.push(...windowsDance(130000, 10000));                               // 4
  evts.push(...strobe(LIGHT_PARTS, 130000, 135000, 2));                     // 13
  evts.push(...retroRoundtrip(132000));                                    // 2
  evts.push(...fullWave(136000, 600));                                     // 14
  evts.push(...allLightsOn(139000, 145000, { effect: 'blink', blinkSpeed: 2 })); // 13
  evts.push(...retroRoundtrip(142000));                                    // 2
  evts.push(...altFlash(146000, 4000, 2));                                 // 6
  evts.push(...fullWave(150000, 800));                                     // 14
  evts.push(...allLightsOn(153000, 160000));                               // 13
  evts.push(...fullWave(160000, 1000));                                    // 14
  evts.push(...allLightsOn(163000, 169000, { effect: 'blink', blinkSpeed: 1 })); // 13
  evts.push(...allLightsOn(169500, 170800, { easeOut: true }));            // 13 = 121
  // Total ≈ 470
  return evts;
}

// ============================================================
// NEW YEAR COUNTDOWN — 72.5s — Building excitement, fireworks finale
// Budget: aim ~450
// ============================================================
function generateNewYearCountdown() {
  const evts = [];
  
  // Anticipation (0-15s)
  evts.push(...multiEvt(FRONT_LIGHTS, 500, 4000, { easeIn: true }));       // 2
  evts.push(evt('license_plate', 1500, 5000, { easeIn: true }));           // 1
  evts.push(...multiEvt(BACK_LIGHTS, 3000, 7000, { easeIn: true }));       // 2
  evts.push(...fullWave(7000, 2000));                                      // 14
  evts.push(...altFlash(10000, 4000, 0));                                  // 6 = 25

  // Building (15-35s)
  evts.push(...allLightsOn(15000, 20000));                                 // 13
  evts.push(...retroRoundtrip(17000));                                     // 2
  evts.push(...strobe(ALL_BLINKS, 20000, 24000, 1));                       // 6
  evts.push(...multiEvt(FRONT_LIGHTS, 20000, 24000));                      // 2
  evts.push(...fullWave(24000, 1200));                                     // 14
  evts.push(...altBlink(26000, 4000, 500, 1));                             // 40
  evts.push(...allLightsOn(30000, 35000, { effect: 'blink', blinkSpeed: 0 })); // 13
  evts.push(...retroRoundtrip(32000));                                     // 2 = 92

  // Tension (35-50s) + closures
  evts.push(...strobe(LIGHT_PARTS, 35000, 40000, 1));                      // 13
  evts.push(...windowsDance(36000, 12000));                                // 4
  evts.push(...trunkSequence(37000, 7000));                                // 3
  evts.push(...flapSequence(40000, 5000));                                 // 3
  evts.push(...retroCloseOpen(42000, 48000));                              // 4
  evts.push(...allLightsOn(44000, 49000, { effect: 'blink', blinkSpeed: 2 })); // 13
  evts.push(...fullWave(48000, 800));                                      // 14 = 54

  // Countdown climax (50-72s): FIREWORKS!
  evts.push(...fullWave(50000, 600));                                      // 14
  evts.push(...strobe(LIGHT_PARTS, 52000, 57000, 2));                      // 13
  evts.push(...windowsDance(53000, 10000));                                // 4
  evts.push(...retroRoundtrip(54000));                                     // 2
  evts.push(...altBlink(57000, 3000, 400, 2));                             // 35
  evts.push(...fullWave(60000, 500));                                      // 14
  evts.push(...allLightsOn(62000, 67000, { effect: 'blink', blinkSpeed: 2 })); // 13
  evts.push(...retroRoundtrip(64000));                                     // 2
  evts.push(...fullWave(67000, 600));                                      // 14
  evts.push(...allLightsOn(68000, 71000));                                 // 13
  evts.push(...strobe(LIGHT_PARTS, 71000, 72000, 2));                      // 13
  evts.push(...allLightsOn(71500, 72300, { easeOut: true }));              // 13 = 150
  // Total ≈ 321
  return evts;
}

// ============================================================
// STAR WARS BATTLE — 92.4s — Epic, cinematic, dramatic
// Budget: aim ~470
// ============================================================
function generateStarWarsBattle() {
  const evts = [];
  
  // Imperial march intro (0-12s)
  evts.push(...multiEvt(FRONT_LIGHTS, 300, 2500));                         // 2
  evts.push(...rearBlock(800, 3000));                                      // 5
  evts.push(...strobe(ALL_BLINKS, 3000, 6000, 1));                         // 6
  evts.push(...multiEvt(FRONT_LIGHTS, 3000, 6000));                        // 2
  evts.push(...fullWave(6000, 1500));                                      // 14
  evts.push(...retroRoundtrip(8000));                                      // 2
  evts.push(...allLightsOn(10000, 12000));                                 // 13 = 44

  // Battle begins (12-30s)
  evts.push(...strobe(LIGHT_PARTS, 12000, 17000, 2));                      // 13
  evts.push(...altBlink(17000, 4000, 500, 1));                             // 40
  evts.push(...retroRoundtrip(18000));                                     // 2
  evts.push(...fullWave(22000, 800));                                      // 14
  evts.push(...allLightsOn(24000, 28000, { effect: 'blink', blinkSpeed: 1 })); // 13
  evts.push(...fullWave(28000, 1000));                                     // 14 = 96

  // Dogfight (30-55s): chaos + closures
  evts.push(...strobe(LIGHT_PARTS, 30000, 35000, 2));                      // 13
  evts.push(...windowsDance(31000, 12000));                                // 4
  evts.push(...trunkSequence(32000, 8000));                                // 3
  evts.push(...retroCloseOpen(34000, 40000));                              // 4
  evts.push(...flapSequence(38000, 6000));                                 // 3
  evts.push(...allLightsOn(40000, 45000, { effect: 'blink', blinkSpeed: 2 })); // 13
  evts.push(...altFlash(45000, 4000, 2));                                  // 6
  evts.push(...retroRoundtrip(46000));                                     // 2
  evts.push(...fullWave(49000, 800));                                      // 14
  evts.push(...strobe(LIGHT_PARTS, 51000, 55000, 1));                      // 13 = 75

  // Tension bridge (55-70s)
  evts.push(...frontBlock(55000, 60000));                                  // 4
  evts.push(evt('license_plate', 55000, 60000));                           // 1
  evts.push(...rearBlock(57000, 62000));                                   // 5
  evts.push(...retroRoundtrip(58000));                                     // 2
  evts.push(...altBlink(62000, 4000, 500, 0));                             // 40
  evts.push(...fullWave(67000, 1200));                                     // 14 = 66

  // Final battle (70-92s): maximum intensity
  evts.push(...strobe(LIGHT_PARTS, 70000, 76000, 2));                      // 13
  evts.push(...windowsDance(71000, 12000));                                // 4
  evts.push(...retroRoundtrip(72000));                                     // 2
  evts.push(...altBlink(76000, 3000, 500, 2));                             // 30
  evts.push(...fullWave(80000, 600));                                      // 14
  evts.push(...allLightsOn(82000, 87000, { effect: 'blink', blinkSpeed: 2 })); // 13
  evts.push(...retroRoundtrip(84000));                                     // 2
  evts.push(...fullWave(87000, 800));                                      // 14
  evts.push(...allLightsOn(89000, 91500));                                 // 13
  evts.push(...allLightsOn(91500, 92200, { easeOut: true }));              // 13 = 118
  // Total ≈ 399
  return evts;
}

// ============================================================
// GENERATE ALL
// ============================================================
const generators = {
  halloween: generateHalloween,
  jingle_bells: generateJingleBells,
  jingle_bells_metal: generateJingleBellsMetal,
  happy_birthday: generateHappyBirthday,
  classical_piano: generateClassicalPiano,
  moonlight_mambo: generateMoonlightMambo,
  new_year_countdown: generateNewYearCountdown,
  star_wars_battle: generateStarWarsBattle,
};

const outDir = path.join(__dirname, '..', 'src', 'demoShows');

Object.entries(generators).forEach(([trackId, genFn]) => {
  idCounter = 0;
  let events = genFn();
  
  // Sort by startMs
  events.sort((a, b) => a.startMs - b.startMs);
  
  // Truncate to 500 max
  if (events.length > 500) {
    console.warn(`⚠️  ${trackId}: ${events.length} events, truncating to 500`);
    events = events.slice(0, 500);
  }
  
  // Validate closure limits
  const closureCounts = {};
  events.forEach(e => {
    if (['retro_left','retro_right','window_left_front','window_right_front','window_left_back','window_right_back','trunk','flap'].includes(e.part)) {
      const cost = (e.part.includes('retro') && e.retroMode === 'roundtrip') ? 2 : 1;
      closureCounts[e.part] = (closureCounts[e.part] || 0) + cost;
    }
  });
  
  const limits = { retro_left: 20, retro_right: 20, window_left_front: 6, window_right_front: 6, window_left_back: 6, window_right_back: 6, trunk: 6, flap: 3 };
  Object.entries(closureCounts).forEach(([part, count]) => {
    const lim = limits[part];
    if (lim && count > lim) {
      console.warn(`⚠️  ${trackId}: ${part} has ${count} commands (limit ${lim})`);
    }
  });
  
  const show = {
    trackId,
    isBuiltinTrack: true,
    bodyColor: TRACKS[trackId].bodyColor,
    cursorOffsetMs: 0,
    events,
  };
  
  const outFile = path.join(outDir, `${trackId}.json`);
  fs.writeFileSync(outFile, JSON.stringify(show, null, 2));
  console.log(`✅ ${trackId}: ${events.length} events → ${outFile}`);
});

console.log('\nDone! All demos regenerated.');
