// server/server.js (FINAL integrated)
require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');

// --- top of server.js ---
const pairsList = require('./pairsList'); // import final pairs

// --- Combine all pairs into a single watch list ---
const WATCH = [
  ...pairsList.real,
  ...pairsList.otc,
  ...pairsList.crypto,
  ...pairsList.commodities
].map(s => s.trim().toUpperCase());

// --- Map market type for each pair ---
const MARKET_TYPE = {};
pairsList.real.forEach(p => MARKET_TYPE[p.toUpperCase()] = 'real');
pairsList.otc.forEach(p => MARKET_TYPE[p.toUpperCase()] = 'otc');
pairsList.crypto.forEach(p => MARKET_TYPE[p.toUpperCase()] = 'crypto');
pairsList.commodities.forEach(p => MARKET_TYPE[p.toUpperCase()] = 'commodities');

// --- Initialize bars for each symbol ---
const bars = {}; // per-symbol second bars

// Example: use WATCH array anywhere in server.js
// Periodic signal generation
setInterval(() => {
  WATCH.forEach(sym => {
    if (!bars[sym] || bars[sym].length < 30) simulateTick(sym); // simulate if needed
    const sig = computeSignalForSymbol(sym, bars, { market: MARKET_TYPE[sym] || 'binary' });
    if (sig) {
      db.insertSignal(sig);
      broadcast({ type: 'signal', data: sig });
      broadcast({ type: 'log', data: `Signal ${sig.symbol} ${sig.direction} conf:${sig.confidence}` });
    }
  });
}, 5000);

// === NEW MODULES (non-replacement) ===
const rr = require('./resultResolver');
const quotexAdapter = require('./quotexAdapter');
const uiEnhancer = require('./uiEnhancer');
const ats = require('./autoTimeSync');
const pa = require('./patternAnalyzer');
const strategyAdvanced = require('./strategyAdvanced');
const manipulationDetector = require('./manipulationDetector');
const aiLearner = require('./aiLearner');
// =======================================
const { computeSignalForSymbol } = require('./computeStrategy');
const { startBinanceStream } = require('./brokerAdapters/binanceAdapter');
const db = require('./db');
const fetch = require('node-fetch');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const WATCH = (process.env.WATCH_SYMBOLS || 'BTCUSDT,EURUSD,USDJPY').split(',').map(s=>s.trim().toUpperCase());
const HISTORY_MAX = parseInt(process.env.HISTORY_MAX||'2000',10);

const bars = {}; // per-symbol second bars

// Serve frontend static (if you place built frontend in public/)
app.use(express.static('public'));

// small endpoints
app.get('/pairs', (req,res)=> {
  const pairs = WATCH.map(p => ({ symbol:p, type: p.endsWith('USDT') ? 'crypto' : 'forex', available:true }));
  res.json({ ok:true, pairs, server_time: new Date().toISOString() });
});
app.get('/signals/history', (req,res)=> res.json({ ok:true, rows: db.listRecent(200) }));

// broadcast helper
function broadcast(obj){ const raw = JSON.stringify(obj); wss.clients.forEach(c=>{ if(c.readyState===WebSocket.OPEN) c.send(raw); }); }

// append tick -> build 1s bars
function appendTick(sym, price, qty, tsSec){
  bars[sym] = bars[sym] || [];
  const arr = bars[sym];
  const last = arr[arr.length-1];
  if(!last || last.time !== tsSec){
    arr.push({ time: tsSec, open: price, high: price, low: price, close: price, volume: qty });
    if(arr.length > 7200) arr.shift();
  } else {
    last.close = price;
    last.high = Math.max(last.high, price);
    last.low = Math.min(last.low, price);
    last.volume += qty;
  }
}

// simulate ticks for non-crypto pairs until real adapter connected
function simulateTick(sym){
  const base = sym.includes('BTC') ? 110000 : (sym.startsWith('EUR') ? 1.09 : 1.0);
  const noise = (Math.random()-0.5) * (sym.includes('BTC') ? 200 : 0.0018);
  const price = +(base + noise).toFixed(sym.includes('BTC') ? 0 : 4);
  const qty = Math.random()* (sym.includes('BTC') ? 1 : 100);
  appendTick(sym, price, qty, Math.floor(Date.now()/1000));
}

// Binance adapter for crypto USDT pairs (example)
try {
  startBinanceStream(WATCH, appendTick);
} catch(e){ console.warn('binance adapter not started', e.message); }

// === STEP 3: Auto Time Sync (start) ===
let serverTimeOffset = 0;
ats.startAutoTimeSync({
  intervalMs: 60_000,
  onOffset: (offsetMs) => {
    serverTimeOffset = offsetMs;
    console.log('AutoTimeSync offset (ms):', offsetMs);
  }
});
// =======================================

// periodic: ensure ticks present & compute signals
setInterval(()=>{
  WATCH.forEach(sym=>{
    if(!bars[sym] || bars[sym].length < 30) simulateTick(sym);

    // compute signal using computeStrategy (multi-TF heuristics)
    const sig = computeSignalForSymbol(sym, bars, { market:'binary' });
    if(sig){
      // attach small advanced confluence & ai boost
      try {
        // build small bars obj for advanced scoring
        const m1 = (bars[sym] || []).slice(-300);
        const m5 = []; // aggregate if needed in computeSignalForSymbol
        const advBoost = strategyAdvanced.scoreZoneConfluence({ m1, m5 });
        sig.confidence = Math.max(0, Math.min(99, sig.confidence + advBoost));
        // attach predicted AI boost
        const fv = {
          bos: strategyAdvanced.isBreakOfStructure(m5).type ? 1 : 0,
          fvg: strategyAdvanced.detectFVG(m1) ? 1 : 0,
          volumeSpike: 0,
          wick: 0,
          roundNumber: 0,
          manipulation: 0
        };
        const aib = aiLearner.predictBoost(fv);
        sig.confidence = Math.max(0, Math.min(99, sig.confidence + aib));
        sig.featureVector = fv;
      } catch(e){
        // ignore
      }

      // manipulation detection penalty
      try {
        const manip = manipulationDetector.analyzeTicks([], (bars[sym] || []).slice(-120));
        if(manip.score > 0) {
          sig.confidence = Math.max(0, sig.confidence - Math.round(manip.score/3));
          sig.notes = (sig.notes || '') + ' | manip:' + JSON.stringify(manip.reasons || []);
        }
      } catch(e){}

      // small safety: only broadcast if confidence >= threshold (you can lower)
      const MIN_BROADCAST_CONF = parseInt(process.env.MIN_BROADCAST_CONF || '10', 10);
      if(sig.confidence >= MIN_BROADCAST_CONF){
        db.insertSignal(sig);
        broadcast({ type:'signal', data:sig });
        broadcast({ type:'log', data:`Signal ${sig.symbol} ${sig.direction} conf:${sig.confidence}` });
      }
    }
  });
}, 5000);

// WS server for frontends & control
wss.on('connection', ws => {
  console.log('client connected');
  ws.send(JSON.stringify({ type:'info', server_time: new Date().toISOString(), server_offset: serverTimeOffset }));
  ws.on('message', msg => {
    try {
      const m = JSON.parse(msg.toString());
      if(m.type === 'reqSignalNow'){
        const symbol = (m.pair||WATCH[0]).toUpperCase();
        const sig = computeSignalForSymbol(symbol, bars, { market: m.market || 'binary' });
        if(sig){
          db.insertSignal(sig);
          ws.send(JSON.stringify({ type:'signal', data: sig }));
        } else ws.send(JSON.stringify({ type:'error', data: 'No signal ready' }));
      } else if(m.type === 'execTrade'){
        // placeholder: execute trade via adapter
        ws.send(JSON.stringify({ type:'info', data:'exec placeholder' }));
      }
    } catch(e){
      console.warn('ws parse err', e.message);
    }
  });
  ws.on('close', ()=> console.log('client disconnected'));
});

// optional Telegram push for each signal (can be called where needed)
async function pushTelegram(msg){
  if(process.env.ENABLE_TELEGRAM !== 'true') return;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if(!token || !chat) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ chat_id: chat, text: msg })
    });
  } catch(e){ console.warn('telegram push failed', e.message); }
}

// === STEP 4: Auto Learning (background) ===
function autoLearnPatterns() {
  try {
    const allSymbols = Object.keys(bars);
    allSymbols.forEach(symbol => {
      const data = bars[symbol];
      if (!data || data.length < 50) return;
      const last = data[data.length - 1];
      const avg = data.reduce((a, b) => a + b.close, 0) / data.length;
      const delta = last.close - avg;
      if (Math.abs(delta) > avg * 0.002) {
        // simple log — aiLearner will be updated when results resolved
        console.log(`[AI] ${symbol} adapting pattern… Δ=${delta.toFixed(5)}`);
      }
    });
  } catch (err) {
    console.error("AutoLearn error:", err);
  }
}
setInterval(autoLearnPatterns, 60_000);

// === STEP 5: Auto Heal / Optimization ===
function autoHealAndOptimize() {
  try {
    const symbols = Object.keys(bars);
    symbols.forEach(symbol => {
      const data = bars[symbol];
      if (!data || data.length < 10) return;
      const cleaned = [];
      for (let i = 0; i < data.length; i++) {
        if (!data[i].close || data[i].close <= 0) continue;
        if (i > 0 && data[i].time <= data[i - 1].time) continue;
        cleaned.push(data[i]);
      }
      if (cleaned.length !== data.length) {
        bars[symbol] = cleaned;
        console.log(`[HEAL] ${symbol} data repaired (${data.length - cleaned.length} fix)`);
      }
    });
    if (global.gc) global.gc();
  } catch (err) {
    console.error("AutoHeal error:", err);
  }
}
setInterval(autoHealAndOptimize, 120_000);

// === STEP 7: Start Quotex Adapter (placeholder safe) ===
try {
  quotexAdapter.startQuotexAdapter({
    apiUrl: process.env.QUOTEX_API_URL,
    username: process.env.QUOTEX_USERNAME,
    password: process.env.QUOTEX_PASSWORD,
    wsUrl: process.env.QUOTEX_WS_URL
  }, {
    appendTick: (sym, price, qty, ts)=> appendTick(sym, price, qty, ts),
    onOrderConfirm: (o)=> { console.log('quotex order confirm', o); }
  });
} catch(e){
  console.warn('quotex adapter start failed (placeholder)', e.message);
}

// === Start Result Resolver (auto update status & learn) ===
rr.startResultResolver({ db, barsRef: bars, checkIntervalMs: 5000, aiLearner, broadcast });

// optional UI Enhancer endpoint
app.get('/ui/enhancer', (req,res)=> {
  try { res.json({ ok:true, assets: uiEnhancer.getUIAssets() }); } catch(e){ res.status(500).json({ ok:false, error: e.message }); }
});

// final start
server.listen(PORT, ()=> {
  console.log(`Server listening on ${PORT} — watching ${WATCH.join(',')}`);
});
