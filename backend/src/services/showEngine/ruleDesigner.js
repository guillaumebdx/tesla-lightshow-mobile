/**
 * Deterministic show designer. Produces a plan from the analysis alone.
 * Used as the fallback when the LLM call fails, and as a baseline in tests.
 */

const CALM = ['breathe', 'glow', 'onsets_soft'];
const MEDIUM = ['groove', 'ping_pong', 'front_back', 'wave'];
const HIGH = ['drive', 'drumkit', 'chase', 'pulse_all'];

function tierOf(seg) {
  if (seg.level < 0.3) return 'calm';
  if (seg.level < 0.65) return 'medium';
  return 'high';
}

function designShowRules(analysis, { carModel = 'model_3' } = {}) {
  const segs = analysis.segments;
  const byLabel = new Map(); // label → { tier → motif }
  const counters = { calm: 0, medium: 0, high: 0 };
  const impacts = new Set(analysis.moments.filter((m) => m.type === 'impact').map((m) => m.segment));

  const sections = segs.map((seg, k) => {
    const tier = tierOf(seg);
    if (!byLabel.has(seg.label)) byLabel.set(seg.label, {});
    const memo = byLabel.get(seg.label);
    if (!memo[tier]) {
      const pool = tier === 'calm' ? CALM : tier === 'medium' ? MEDIUM : HIGH;
      memo[tier] = pool[counters[tier]++ % pool.length];
    }
    const next = segs[k + 1];
    return {
      id: seg.id,
      motif: memo[tier],
      accent: tier === 'high' ? 'downbeats' : tier === 'medium' ? 'backbeat' : 'none',
      build: !!next && next.level - seg.level >= 0.25 && next.level >= 0.6,
      impact: impacts.has(seg.id),
      bars: tier === 'calm' ? 'swell' : 'beat',
      interior: tier === 'calm'
        ? { mode: 'color', color: '#2277ff' }
        : tier === 'medium' ? { mode: 'pulse', color: '#8822ff' } : { mode: 'sync' },
    };
  });

  // Closures, only for tracks long enough to breathe.
  const closures = { mirrors: [], windows: [], trunk: null, flap: null };
  if (analysis.musicEndMs - analysis.musicStartMs >= 45000) {
    const byLevel = [...segs].sort((a, b) => b.level - a.level);
    closures.mirrors = byLevel.filter((s) => s.level >= 0.5).slice(0, 4).map((s) => s.id).sort((a, b) => a - b);
    if (byLevel[0]) closures.windows = [byLevel[0].id];
    const trunkSeg = byLevel.find((s) => s.t0 >= 15000 && s.id !== byLevel[0]?.id);
    closures.trunk = trunkSeg ? trunkSeg.id : null;
    const half = analysis.musicEndMs / 2;
    const flapSeg = segs.find((s) => s.t0 >= half && s.level < 0.65 && s.t1 - s.t0 >= 8000);
    closures.flap = flapSeg ? flapSeg.id : null;
  }

  return { concept: 'rule-based', sections, closures, ending: 'flash', carModel };
}

module.exports = { designShowRules };
