// server/uiEnhancer.js
function getUIAssets(opts = {}) {
  const theme = opts.theme || 'ultra_premium';
  const css = `
:root{--glow: rgba(245,197,24,0.18);--card-gradient: linear-gradient(135deg, rgba(245,197,24,0.06), rgba(255,217,77,0.02));}
.enhancer-badge { padding:6px 10px; border-radius:10px; background:var(--glow); color:#fff; font-weight:700; box-shadow:0 8px 30px rgba(0,0,0,0.6); }
.pulse-conf { animation: pulse 1.8s infinite; }
@keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(245,197,24,0.15); } 70% { box-shadow: 0 0 0 18px rgba(245,197,24,0); } 100% { box-shadow:0 0 0 0 rgba(245,197,24,0); } }
`;
  const js = `function flashLog(msg){ const container = document.getElementById('logs'); if(!container) return; const el = document.createElement('div'); el.className = 'enhancer-badge'; el.style.marginBottom='6px'; el.textContent = '[' + new Date().toLocaleTimeString() + '] ' + msg; container.prepend(el); setTimeout(()=> el.remove(), 7000); }`;
  const htmlSnippets = { premiumHeader: `<div style="display:flex;gap:12px;align-items:center"><div style="width:46px;height:46px;border-radius:10px;background:linear-gradient(135deg,#f5c518,#ffd94d);display:flex;align-items:center;justify-content:center;font-weight:800;color:#070707">G</div><div><div style="font-weight:800">God Mode</div><div style="font-size:12px;color:#ccc">Ultra premium signals</div></div></div>` };
  return { css, js, htmlSnippets };
}
module.exports = { getUIAssets };
