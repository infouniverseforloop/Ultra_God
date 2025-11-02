
// server/quotexAdapter.js
const axios = require('axios');
const WebSocket = require('ws');

async function loginQuotex(apiUrl, username, password) {
  try {
    if (!apiUrl || !username || !password) throw new Error('Missing credentials or apiUrl');
    const res = await axios.post(`${apiUrl}/auth/login`, { username, password }, { timeout: 10000 });
    if (res.data && (res.data.token || res.data.access_token)) {
      return { token: res.data.token || res.data.access_token, raw: res.data };
    }
    throw new Error('Unexpected login response: ' + JSON.stringify(res.data).slice(0,200));
  } catch (e) {
    console.warn('quotexAdapter login error (placeholder):', e.message);
    throw e;
  }
}

async function startQuotexAdapter(env = {}, callbacks = {}) {
  const apiUrl = env.apiUrl || process.env.QUOTEX_API_URL;
  const username = env.username || process.env.QUOTEX_USERNAME;
  const password = env.password || process.env.QUOTEX_PASSWORD;
  const appendTick = callbacks.appendTick || function(){};
  const onOrderConfirm = callbacks.onOrderConfirm || function(){};

  console.log('quotexAdapter: starting (placeholder). Provide real endpoints to enable live feed.');
  try {
    const auth = await loginQuotex(apiUrl, username, password);
    console.log('quotexAdapter: login ok (placeholder). token present.');
    try {
      const wsUrl = (env.wsUrl || (apiUrl.replace(/^http/, 'ws') + '/realtime')) + `?token=${encodeURIComponent(auth.token)}`;
      const ws = new WebSocket(wsUrl, { handshakeTimeout: 10000 });
      ws.on('open', () => console.log('quotexAdapter WS open (placeholder)'));
      ws.on('message', msg => {
        try {
          const data = JSON.parse(msg.toString());
          if (data.type === 'trade' && data.symbol && data.price) {
            const price = parseFloat(data.price);
            const qty = parseFloat(data.volume || data.qty || 1);
            const ts = Math.floor((data.time ? new Date(data.time).getTime() : Date.now()) / 1000);
            appendTick(data.symbol, price, qty, ts);
          }
          if (data.type === 'order_confirm') {
            onOrderConfirm(data);
          }
        } catch(e) { console.warn('quotexAdapter ws parse err', e.message); }
      });
      ws.on('close', (code, reason) => { console.log('quotexAdapter ws closed', code, reason); setTimeout(()=> startQuotexAdapter(env, callbacks), 5000); });
      ws.on('error', e => { console.warn('quotexAdapter ws error', e.message); try{ ws.terminate(); }catch(_){} });
      return { stop: ()=> { try{ ws.close(); }catch(e){} } };
    } catch (e) {
      console.warn('quotexAdapter ws start failed (placeholder)', e.message);
      return { stop: ()=>{} };
    }
  } catch (e) {
    console.warn('quotexAdapter login failed (placeholder). Adapter inactive until credentials/docs are correct.');
    return { stop: ()=>{} };
  }
}

module.exports = { startQuotexAdapter };
