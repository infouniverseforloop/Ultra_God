// server/manipulationDetector.js
const MAX_RECENT_SEC = 30;

function analyzeTicks(ticks = [], bars = []) {
  const res = { suspiciousWick: false, spreadSpike: false, tickBurst: false, score: 0, reasons: [] };
  if (bars && bars.length) {
    const last = bars[bars.length - 1];
    const body = Math.abs(last.close - last.open);
    const wickUp = last.high - Math.max(last.open, last.close);
    const wickDown = Math.min(last.open, last.close) - last.low;
    if (body < 1e-9) {
      if (wickUp > 0 || wickDown > 0) { res.suspiciousWick = true; res.reasons.push('tiny body with large wick'); res.score += 15; }
    } else {
      if (wickUp > body * 3 || wickDown > body * 3) { res.suspiciousWick = true; res.reasons.push('wick > 3x body'); res.score += 12; }
    }
  }

  if (ticks && ticks.length >= 6) {
    const now = Math.floor(Date.now() / 1000);
    const recent = ticks.filter(t => t.ts >= now - MAX_RECENT_SEC);
    if (recent.length >= 6) {
      let changes = 0;
      for (let i = 1; i < recent.length; i++) if ((recent[i].price - recent[i - 1].price) * (recent[i - 1].price - (recent[i - 2] ? recent[i - 2].price : recent[i - 1].price)) < 0) changes++;
      if (changes > recent.length * 0.4) { res.tickBurst = true; res.reasons.push('rapid alternation of ticks (burst)'); res.score += 10; }
    }
  }

  if (bars && bars.length >= 10) {
    const last10 = bars.slice(-10);
    const highs = last10.map(b => b.high);
    const lows = last10.map(b => b.low);
    const range = Math.max(...highs) - Math.min(...lows);
    const lastBar = last10[last10.length - 1];
    if (range > 0 && (lastBar.high - lastBar.low) > range * 0.6) {
      res.spreadSpike = true; res.reasons.push('bar range spike compared to recent range'); res.score += 10;
    }
  }

  res.score = Math.min(100, Math.max(0, res.score));
  return res;
}

module.exports = { analyzeTicks };
