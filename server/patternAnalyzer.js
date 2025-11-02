// server/patternAnalyzer.js
function isBullishEngulfing(bars) {
  if (!bars || bars.length < 2) return false;
  const prev = bars[bars.length - 2], last = bars[bars.length - 1];
  const prevBody = prev.close - prev.open;
  const lastBody = last.close - last.open;
  if (prevBody < 0 && lastBody > 0 && Math.abs(lastBody) > Math.abs(prevBody) && last.close > prev.open) return true;
  return false;
}
function isBearishEngulfing(bars) {
  if (!bars || bars.length < 2) return false;
  const prev = bars[bars.length - 2], last = bars[bars.length - 1];
  const prevBody = prev.close - prev.open;
  const lastBody = last.close - last.open;
  if (prevBody > 0 && lastBody < 0 && Math.abs(lastBody) > Math.abs(prevBody) && last.close < prev.open) return true;
  return false;
}
function isPinBar(bars) {
  if (!bars || bars.length < 1) return false;
  const b = bars[bars.length - 1];
  const body = Math.abs(b.close - b.open);
  const range = b.high - b.low;
  if (range <= 0) return false;
  const ratio = body / range;
  if (ratio < 0.25) {
    const wickTop = b.high - Math.max(b.open, b.close);
    const wickBottom = Math.min(b.open, b.close) - b.low;
    if (wickTop > body * 3 || wickBottom > body * 3) return true;
  }
  return false;
}
function detectTripleTop(bars) {
  if (!bars || bars.length < 15) return false;
  const highs = bars.slice(-15).map(b => b.high);
  const peaks = [];
  for (let i = 1; i < highs.length - 1; i++) if (highs[i] > highs[i-1] && highs[i] > highs[i+1]) peaks.push({ index: i, value: highs[i] });
  if (peaks.length < 3) return false;
  peaks.sort((a,b) => b.value - a.value);
  const top3 = peaks.slice(0,3);
  const vals = top3.map(p => p.value);
  const max = Math.max(...vals), min = Math.min(...vals);
  if ((max - min) / min < 0.003) return true;
  return false;
}
function momentumCluster(bars) {
  if (!bars || bars.length < 12) return null;
  const recent = bars.slice(-6);
  const prev = bars.slice(-12, -6);
  const avgRecent = recent.reduce((s,b)=> s + (b.close - b.open), 0) / recent.length;
  const avgPrev = prev.reduce((s,b)=> s + (b.close - b.open), 0) / prev.length;
  return { momentum: avgRecent, prevMomentum: avgPrev, momentumChange: avgRecent - avgPrev };
}
module.exports = { isBullishEngulfing, isBearishEngulfing, isPinBar, detectTripleTop, momentumCluster };
