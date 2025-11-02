// server/aiLearner.js
const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, 'ai_learner.json');
const DEFAULT = { version:1, weights:{ bos:0.0, fvg:0.0, volume:0.0, wick:0.0, round:0.0, manipulation_penalty:-0.0 }, alpha:0.05, stats:{ wins:0, losses:0 } };

function load() {
  try {
    if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, JSON.stringify(DEFAULT, null, 2));
    return JSON.parse(fs.readFileSync(FILE,'utf8'));
  } catch (e) { console.warn('aiLearner load error', e.message); return JSON.parse(JSON.stringify(DEFAULT)); }
}
function save(state) { try { fs.writeFileSync(FILE, JSON.stringify(state, null, 2)); } catch(e){ console.warn('aiLearner save error', e.message); } }
const state = load();

function predictBoost(featureVector) {
  const w = state.weights;
  let boost = 0;
  boost += (w.bos || 0) * (featureVector.bos ? 1 : 0);
  boost += (w.fvg || 0) * (featureVector.fvg ? 1 : 0);
  boost += (w.volume || 0) * (featureVector.volumeSpike ? 1 : 0);
  boost += (w.wick || 0) * (featureVector.wick ? 1 : 0);
  boost += (w.round || 0) * (featureVector.roundNumber ? 1 : 0);
  boost += (w.manipulation_penalty || 0) * (featureVector.manipulation ? 1 : 0);
  const scaled = Math.round(boost * 10);
  return scaled;
}

function recordOutcome(featureVector, outcome) {
  const y = outcome ? 1 : 0;
  const pred = predictBoost(featureVector) > 0 ? 1 : 0;
  const error = y - pred;
  const alpha = state.alpha || 0.03;
  const w = state.weights;
  ['bos','fvg','volume','wick','round'].forEach(k => {
    const x = featureVector[k] ? 1 : 0;
    w[k] = (w[k] || 0) + alpha * error * x;
  });
  const xm = featureVector.manipulation ? 1 : 0;
  w.manipulation_penalty = (w.manipulation_penalty || 0) + alpha * (-error) * xm;
  if (y === 1) state.stats.wins = (state.stats.wins || 0) + 1; else state.stats.losses = (state.stats.losses || 0) + 1;
  save(state);
}

module.exports = { getState: () => JSON.parse(JSON.stringify(state)), predictBoost, recordOutcome };
