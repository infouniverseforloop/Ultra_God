// server/db.js
const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'sniper.db'));

db.exec(`
CREATE TABLE IF NOT EXISTS signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT,
  market TEXT,
  direction TEXT,
  entry TEXT,
  confidence INTEGER,
  mtg INTEGER,
  notes TEXT,
  time_iso TEXT,
  expiry_iso TEXT,
  result TEXT,
  created_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_symbol_time ON signals(symbol, created_at);
`);

module.exports = {
  insertSignal(sig){
    const stmt = db.prepare(`INSERT INTO signals
      (symbol,market,direction,entry,confidence,mtg,notes,time_iso,expiry_iso,created_at) VALUES
      (@symbol,@market,@direction,@entry,@confidence,@mtg,@notes,@time_iso,@expiry_iso,@created_at)`);
    stmt.run({
      symbol: sig.symbol,
      market: sig.market,
      direction: sig.direction,
      entry: sig.entry,
      confidence: sig.confidence,
      mtg: sig.mtg ? 1 : 0,
      notes: sig.notes || '',
      time_iso: sig.time,
      expiry_iso: sig.expiry_at,
      created_at: Date.now()
    });
  },
  saveResult(id, result){
    const s = db.prepare('UPDATE signals SET result = ? WHERE id = ?');
    s.run(result, id);
  },
  listRecent(limit = 200){
    return db.prepare('SELECT * FROM signals ORDER BY created_at DESC LIMIT ?').all(limit);
  },
  clear(){
    db.exec('DELETE FROM signals');
  }
};
