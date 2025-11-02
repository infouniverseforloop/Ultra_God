// server/resultResolver.js
function defaultComparator(signal, finalPrice) {
  const entryStr = (signal.entry || '').split('–').map(s => s.trim());
  let entryMid = null;
  if (entryStr.length === 2) {
    const low = parseFloat(entryStr[0].replace(/,/g,''));
    const high = parseFloat(entryStr[1].replace(/,/g,''));
    if (!isNaN(low) && !isNaN(high)) entryMid = (low + high) / 2;
  }
  if (entryMid === null) return { result: 'UNKNOWN', won: false };
  if (signal.direction === 'CALL') return { result: (finalPrice >= entryMid) ? 'WIN' : 'LOSS', won: finalPrice >= entryMid };
  else return { result: (finalPrice <= entryMid) ? 'WIN' : 'LOSS', won: finalPrice <= entryMid };
}

function safeNum(v){ return (typeof v === 'number' && isFinite(v)) ? v : null; }

function startResultResolver(opts = {}) {
  const db = opts.db;
  const barsRef = opts.barsRef;
  const intervalMs = opts.checkIntervalMs || 5000;
  const aiLearner = opts.aiLearner || null;
  const broadcast = typeof opts.broadcast === 'function' ? opts.broadcast : null;
  let running = true;
  if (!db || !barsRef) {
    console.warn('resultResolver: db and barsRef required. Not started.');
    return { stop: ()=> { running=false; } };
  }

  function toMs(iso) { try { return new Date(iso).getTime(); } catch(e){ return null; } }

  async function checkLoop() {
    while(running) {
      try {
        const rows = db.listRecent(200);
        const unresolved = rows.filter(r => !r.result && r.expiry_iso);
        for (const sig of unresolved) {
          const expiryMs = toMs(sig.expiry_iso);
          if (!expiryMs) continue;
          const now = Date.now();
          if (now < expiryMs) continue;
          const sym = sig.symbol;
          const bars = (barsRef[sym] || []);
          const expirySec = Math.floor(expiryMs / 1000);
          let candidateBar = null;
          for (let i = 0; i < bars.length; i++) {
            if (bars[i].time >= expirySec) { candidateBar = bars[i]; break; }
          }
          if (!candidateBar) candidateBar = bars[bars.length - 1];
          const finalPrice = candidateBar ? safeNum(candidateBar.close) : null;
          if (finalPrice === null) continue;
          const outcome = defaultComparator(sig, finalPrice);
          try {
            if (typeof db.saveResult === 'function') {
              if (sig.id) db.saveResult(sig.id, outcome.result);
            }
          } catch(e){ console.warn('resultResolver: db.saveResult error', e.message); }
          try {
            if (aiLearner && typeof aiLearner.recordOutcome === 'function') {
              const fv = { bos:0,fvg:0,volumeSpike:0,wick:0,roundNumber:0,manipulation:0 };
              aiLearner.recordOutcome(fv, outcome.won ? 1 : 0);
            }
          } catch(e){ console.warn('resultResolver: aiLearner error', e.message); }
          if (broadcast) broadcast({ type:'signal_result', data: { symbol: sym, time_iso: sig.time_iso, result: outcome.result, finalPrice } });
        }
      } catch (err) {
        console.warn('resultResolver checkLoop err', err && err.message ? err.message : err);
      }
      await new Promise(r => setTimeout(r, intervalMs));
    }
  }

  checkLoop();
  return { stop: () => { running = false; } };
}

module.exports = { startResultResolver };
