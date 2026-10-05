// Daily purge of unnamed silent accounts (utils/purgeUnnamed.js). Started from mainScheduler in
// production only, like every other scheduler: first run 10 minutes after boot, then every 24 h.
const { purgeUnnamed } = require('../utils/purgeUnnamed');

const FIRST_RUN_MS = 10 * 60 * 1000;
const EVERY_MS = 24 * 60 * 60 * 1000;
let started = false;

function run() {
  purgeUnnamed({ apply: true }).catch((err) => console.error('❌ purgeScheduler:', err?.message || err));
}

function start() {
  if (started) return;
  started = true;
  setTimeout(() => { run(); setInterval(run, EVERY_MS); }, FIRST_RUN_MS);
  console.log('🧹 purgeScheduler armed (unnamed silent accounts, daily)');
}

module.exports = { start };
