// server/autoTimeSync.js
const axios = require('axios');

function startAutoTimeSync(opts = {}) {
  const intervalMs = opts.intervalMs || 60_000;
  const onOffset = typeof opts.onOffset === 'function' ? opts.onOffset : (o)=>{};
  let running = true;

  async function syncOnce() {
    try {
      const res = await axios.get('http://worldtimeapi.org/api/timezone/Etc/UTC', { timeout: 8000 });
      if (res && res.data && res.data.unixtime) {
        const serverUtcMs = res.data.unixtime * 1000;
        const localMs = Date.now();
        const offset = serverUtcMs - localMs;
        onOffset(offset);
      } else if (res && res.data && res.data.datetime) {
        const dt = new Date(res.data.datetime);
        const offset = dt.getTime() - Date.now();
        onOffset(offset);
      }
    } catch (e) { /* ignore */ }
  }

  (async function loop(){
    while(running){
      await syncOnce();
      await new Promise(r => setTimeout(r, intervalMs));
    }
  })();

  return { stop: ()=> { running = false; } };
}

module.exports = { startAutoTimeSync };
