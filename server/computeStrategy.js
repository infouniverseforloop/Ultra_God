// server/computeStrategy.js
const { SMA, RSI } = require('technicalindicators');

function aggregate(bars, secondsPerBar){
  if(!bars || !bars.length) return [];
  const out = [];
  let bucket = null;
  for(const b of bars){
    const t = Math.floor(b.time / secondsPerBar) * secondsPerBar;
    if(!bucket || bucket.time !== t){
      bucket = { time: t, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume };
      out.push(bucket);
    } else {
      bucket.high = Math.max(bucket.high, b.high);
      bucket.low = Math.min(bucket.low, b.low);
      bucket.close = b.close;
      bucket.volume += b.volume;
    }
  }
  return out;
}

function detectOrderBlock(barsM1){
  if(barsM1.length < 3) return false;
  const last = barsM1[barsM1.length-1];
  const prev = barsM1[barsM1.length-2];
  const sizePrev = Math.abs(prev.close - prev.open);
  const sizeAvg = barsM1.slice(-10).reduce((s,b)=> s + Math.abs(b.close - b.open),0) / Math.max(1, Math.min(10, barsM1.slice(-10).length));
  if(sizePrev > sizeAvg * 1.5){
    const bodyHigh = Math.max(prev.open, prev.close);
    const bodyLow = Math.min(prev.open, prev.close);
    if(last.close >= bodyLow && last.open < bodyLow) return true;
  }
  return false;
}

function detectFVG(barsM1){
  if(barsM1.length < 3) return false;
  const a = barsM1[barsM1.length-3];
  const b = barsM1[barsM1.length-2];
  if(!a||!b) return false;
  if(a.high < b.low) return true;
  if(a.low > b.high) return true;
  return false;
}

function computeSignalForSymbol(symbol, barsAll, opts = {}){
  const bars = barsAll[symbol] || [];
  if(bars.length < 40) return null;
  const m1 = aggregate(bars, 60);
  const m5 = aggregate(bars, 300);
  if(m1.length < 10) return null;

  const closesM1 = m1.map(b => b.close).slice(-120);
  const closesM5 = m5.map(b => b.close).slice(-120);

  let sma5_m1, sma20_m1, rsi_m1, sma5_m5, sma20_m5;
  try {
    sma5_m1 = SMA.calculate({ period:5, values: closesM1 }).slice(-1)[0];
    sma20_m1 = SMA.calculate({ period:20, values: closesM1 }).slice(-1)[0];
    rsi_m1 = RSI.calculate({ period:14, values: closesM1 }).slice(-1)[0];
  } catch(e){}
  try {
    sma5_m5 = SMA.calculate({ period:5, values: closesM5 }).slice(-1)[0];
    sma20_m5 = SMA.calculate({ period:20, values: closesM5 }).slice(-1)[0];
  } catch(e){}

  const vols = bars.slice(-120).map(b=>b.volume);
  const avgVol = vols.slice(-60).reduce((a,b)=>a+b,0) / Math.max(1, Math.min(60, vols.slice(-60).length));
  const lastVol = vols[vols.length-1] || 0;
  const volSpike = lastVol > avgVol * 2.2;

  const lastM1 = m1[m1.length-1];
  const wickUp = lastM1.high - Math.max(lastM1.open, lastM1.close);
  const wickDown = Math.min(lastM1.open, lastM1.close) - lastM1.low;

  let score = 50;
  if(sma5_m1 && sma20_m1) score += (sma5_m1 > sma20_m1 ? 8 : -8);
  if(sma5_m5 && sma20_m5) score += (sma5_m5 > sma20_m5 ? 6 : -6);
  if(typeof rsi_m1 === 'number'){
    if(rsi_m1 < 35) score += 10;
    if(rsi_m1 > 65) score -= 10;
  }
  if(volSpike) score += 8;
  if(wickDown > wickUp) score += 6;
  if(wickUp > wickDown) score -= 6;
  if(detectOrderBlock(m1)) score += 10;
  if(detectFVG(m1)) score += 8;
  const p = lastM1.close;
  const roundDist = Math.abs(Math.round(p) - p);
  if(roundDist < (p * 0.0005)) score += 4;
  score = Math.max(10, Math.min(99, Math.round(score)));
  const direction = (score >= 60) ? 'CALL' : (score <= 40 ? 'PUT' : (sma5_m1 > sma20_m1 ? 'CALL' : 'PUT'));
  const entryLow = (p * 0.999).toFixed(symbol.includes('BTC') ? 0 : 4);
  const entryHigh = (p * 1.001).toFixed(symbol.includes('BTC') ? 0 : 4);
  const now = new Date();
  const expirySeconds = parseInt(process.env.BINARY_EXPIRY_SECONDS || '60', 10);
  const expiryAt = new Date(now.getTime() + expirySeconds * 1000);

  return {
    market: opts.market || 'binary',
    symbol,
    direction,
    entry: `${entryLow} – ${entryHigh}`,
    confidence: score,
    mtg: Math.random() > 0.2,
    notes: 'M1/M5 SMA+RSI+Vol+Wick (+OB/FVG placeholders)',
    time: now.toISOString(),
    expiry_at: expiryAt.toISOString()
  };
}

module.exports = { computeSignalForSymbol, aggregate, detectFVG, detectOrderBlock };
