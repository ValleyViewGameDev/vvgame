#!/usr/bin/env node
/**
 * VVGame Editor: local content and world-administration tool (docs/tools-plan.md).
 *
 *   node tools/editor/server.js [--port 8770] [--game-server https://vvgame-server.onrender.com]
 *
 * Plain Node http server, binds 127.0.0.1, no auth, no build step. Serves the vanilla-JS
 * client from ./client, reads and writes the game server's files under game-server/
 * (layouts and tuning JSON) through /api/local/*, and proxies /api/game/* to the game
 * server so the client stays same-origin. Reuses game-server/node_modules; no package.json
 * here.
 *
 * Writes: validated, read-compare-write (nothing touched when the serialised JSON is
 * unchanged), one .bak beside the file (overwritten each save). Git is the real undo.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const TOOL_ROOT = __dirname;
const REPO_ROOT = path.resolve(TOOL_ROOT, '..', '..');
const GAME_SERVER_DIR = path.join(REPO_ROOT, 'game-server');
const CLIENT_DIR = path.join(TOOL_ROOT, 'client');
const SHEETS_DIR = path.join(TOOL_ROOT, 'sheets');
const LAYOUTS_DIR = path.join(GAME_SERVER_DIR, 'layouts');
const GRID_LAYOUT_DIRS = ['valleyFixedCoord', 'homestead', 'town', 'dungeon', 'miniTemplates'];

const defs = require(path.join(SHEETS_DIR, 'definitions.js')); // ESM via require (Node >= 22.12)

// ----------------------------------------------------------------------------- args
function parseArgs(argv) {
  const out = { port: 8770, gameServer: 'https://vvgame-server.onrender.com' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port') out.port = Number(argv[++i]);
    else if (a === '--game-server') out.gameServer = String(argv[++i]).replace(/\/+$/, '');
    else if (a === '-h' || a === '--help') { console.log('node server.js [--port 8770] [--game-server <url>]'); process.exit(0); }
  }
  return out;
}
const ARGS = parseArgs(process.argv.slice(2));

// ----------------------------------------------------------------------------- helpers
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

function sendJSON(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(text);
}
function sendError(res, status, message, extra = {}) { sendJSON(res, status, { error: message, ...extra }); }

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function readJSONBody(req) {
  const buf = await readBody(req);
  if (!buf.length) return null;
  return JSON.parse(buf.toString('utf8'));
}

function serveStatic(res, root, rel) {
  const target = path.normalize(path.join(root, rel));
  if (!target.startsWith(root)) return sendError(res, 403, 'forbidden');
  if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) return sendError(res, 404, 'not found');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(target).pipe(res);
}

function readJSONFile(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

/** Write only when the serialised text differs; keep one .bak. Returns {path, bytes, changed}. */
function writeJSONFile(file, data) {
  const text = JSON.stringify(data, null, 2) + '\n';
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  let same = existing === text;
  if (!same && existing !== null) { try { same = JSON.stringify(JSON.parse(existing)) === JSON.stringify(data); } catch (e) { same = false; } }
  if (same) return { path: path.relative(REPO_ROOT, file), bytes: Buffer.byteLength(text), changed: false };
  if (existing !== null) fs.writeFileSync(file + '.bak', existing);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return { path: path.relative(REPO_ROOT, file), bytes: Buffer.byteLength(text), changed: true };
}

const safeName = (s) => typeof s === 'string' && /^[A-Za-z0-9_.-]{1,80}$/.test(s) && !s.includes('..');

// ----------------------------------------------------------------------------- layouts
function listLayouts() {
  const dirs = {};
  for (const d of GRID_LAYOUT_DIRS) {
    const dir = path.join(LAYOUTS_DIR, 'gridLayouts', d);
    dirs[d] = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort() : [];
  }
  return dirs;
}

function resourcesJSON() { return readJSONFile(path.join(GAME_SERVER_DIR, 'tuning', 'resources.json')); }

function validateLayout(layout) {
  const problems = [];
  const resources = resourcesJSON();
  const tileKeys = new Set(resources.filter((r) => r.category === 'tile').map((r) => r.layoutkey));
  const resourceKeys = new Set(resources.map((r) => r.layoutkey).filter(Boolean));
  const check = (matrix, name, allowed) => {
    if (!Array.isArray(matrix) || matrix.length !== 64) { problems.push(`${name}: must be 64 rows`); return; }
    matrix.forEach((row, y) => {
      if (!Array.isArray(row) || row.length !== 64) { problems.push(`${name}: row ${y} must have 64 cells`); return; }
      row.forEach((cell, x) => {
        if (cell === '**' || cell === '' || cell === null) return;
        if (typeof cell !== 'string') problems.push(`${name}[${y}][${x}]: not a string`);
        else if (!allowed.has(cell)) problems.push(`${name}[${y}][${x}]: unknown key "${cell}"`);
      });
    });
  };
  check(layout.tiles, 'tiles', tileKeys);
  check(layout.resources, 'resources', resourceKeys);
  for (const k of ['tileDistribution', 'resourceDistribution', 'enemiesDistribution']) {
    if (layout[k] !== undefined && (typeof layout[k] !== 'object' || Array.isArray(layout[k]))) problems.push(`${k}: must be an object`);
  }
  return problems.slice(0, 50);
}

// ----------------------------------------------------------------------------- tuning (sheets)
function tuningFileFor(def) { return path.join(GAME_SERVER_DIR, def.file); }

function tuningList() {
  return defs.DEFINITIONS.map((d) => {
    const file = tuningFileFor(d);
    const stat = fs.existsSync(file) ? fs.statSync(file) : null;
    return { id: d.id, label: d.label, group: d.group, file: d.file, description: d.description, restartNeeded: !!d.restartNeeded, exists: !!stat, bytes: stat?.size || 0, mtime: stat?.mtime || null };
  });
}

function refsForValidation() {
  const resources = resourcesJSON();
  let quests = [];
  try { quests = readJSONFile(path.join(GAME_SERVER_DIR, 'tuning', 'quests', 'questsEN.json')); } catch (e) { /* optional */ }
  return defs.buildRefs({ resources, quests });
}

// ----------------------------------------------------------------------------- proxy
function proxyToGame(req, res, pathname, search) {
  const target = new URL(ARGS.gameServer + pathname + (search || ''));
  const lib = target.protocol === 'https:' ? https : http;
  const headers = { ...req.headers, host: target.host };
  delete headers['content-length'];
  readBody(req).then((body) => {
    if (body.length) headers['content-length'] = String(body.length);
    const upstream = lib.request(target, { method: req.method, headers }, (up) => {
      res.writeHead(up.statusCode || 502, { ...up.headers, 'cache-control': 'no-store' });
      up.pipe(res);
    });
    upstream.on('error', (err) => sendError(res, 502, `game server unreachable: ${err.message}`, { target: ARGS.gameServer }));
    upstream.end(body);
  }).catch((err) => sendError(res, 500, err.message));
}

// ----------------------------------------------------------------------------- router
async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  const m = (method, re) => req.method === method && re.exec(p);
  let x;

  if (p === '/healthz') return sendJSON(res, 200, { ok: true });
  if (p === '/' || p === '/index.html') return serveStatic(res, CLIENT_DIR, 'index.html');
  if (p.startsWith('/sheets/')) return serveStatic(res, SHEETS_DIR, p.slice('/sheets/'.length));
  if (p.startsWith('/api/game/')) return proxyToGame(req, res, p.slice('/api/game'.length), url.search);

  if (p === '/api/local/info') {
    return sendJSON(res, 200, { gameServer: ARGS.gameServer, repoRoot: REPO_ROOT, isProduction: /onrender\.com|secretsofelsinore|valleyviewgame/.test(ARGS.gameServer) });
  }
  if (p === '/api/local/resources') return sendJSON(res, 200, resourcesJSON());
  if (p === '/api/local/random-valley') return sendJSON(res, 200, readJSONFile(path.join(LAYOUTS_DIR, 'gridLayouts', 'randomValleyGridLayouts.json')));
  if (p === '/api/local/settlement-layouts' || p === '/api/local/frontier-layouts') {
    const sub = p.endsWith('settlement-layouts') ? 'settlementLayouts' : 'frontierLayouts';
    const root = path.join(LAYOUTS_DIR, sub);
    const out = {};
    for (const set of fs.readdirSync(root)) {
      const dir = path.join(root, set);
      if (!fs.statSync(dir).isDirectory()) continue;
      out[set] = {};
      for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) out[set][f.replace(/\.json$/, '')] = readJSONFile(path.join(dir, f));
    }
    return sendJSON(res, 200, out);
  }

  if (p === '/api/local/layouts' && req.method === 'GET') return sendJSON(res, 200, { dirs: listLayouts() });
  if ((x = m('GET', /^\/api\/local\/layouts\/([^/]+)\/([^/]+)$/))) {
    const [, dir, name] = x;
    if (!GRID_LAYOUT_DIRS.includes(dir) || !safeName(name)) return sendError(res, 400, 'bad layout path');
    const file = path.join(LAYOUTS_DIR, 'gridLayouts', dir, `${name}.json`);
    if (!fs.existsSync(file)) return sendError(res, 404, 'layout not found');
    return sendJSON(res, 200, readJSONFile(file));
  }
  if ((x = m('PUT', /^\/api\/local\/layouts\/([^/]+)\/([^/]+)$/))) {
    const [, dir, name] = x;
    if (!GRID_LAYOUT_DIRS.includes(dir) || !safeName(name)) return sendError(res, 400, 'bad layout path');
    const layout = await readJSONBody(req);
    const problems = validateLayout(layout || {});
    if (problems.length) return sendError(res, 422, 'layout rejected', { problems });
    const written = writeJSONFile(path.join(LAYOUTS_DIR, 'gridLayouts', dir, `${name}.json`), layout);
    console.log(`[layout] ${dir}/${name} ${written.changed ? 'written' : 'unchanged'} (${written.bytes} bytes)`);
    return sendJSON(res, 200, { written: [written] });
  }
  if ((x = m('DELETE', /^\/api\/local\/layouts\/([^/]+)\/([^/]+)$/))) {
    const [, dir, name] = x;
    if (!GRID_LAYOUT_DIRS.includes(dir) || !safeName(name)) return sendError(res, 400, 'bad layout path');
    const file = path.join(LAYOUTS_DIR, 'gridLayouts', dir, `${name}.json`);
    if (!fs.existsSync(file)) return sendError(res, 404, 'layout not found');
    fs.renameSync(file, file + '.bak');
    console.log(`[layout] ${dir}/${name} deleted (kept as .bak)`);
    return sendJSON(res, 200, { deleted: path.relative(REPO_ROOT, file) });
  }

  if (p === '/api/local/tuning' && req.method === 'GET') return sendJSON(res, 200, { files: tuningList() });
  if ((x = m('GET', /^\/api\/local\/tuning\/([A-Za-z0-9_-]+)$/))) {
    const def = defs.byId(x[1]);
    if (!def) return sendError(res, 404, 'unknown sheet');
    const file = tuningFileFor(def);
    return sendJSON(res, 200, { id: def.id, data: fs.existsSync(file) ? readJSONFile(file) : (def.shape.startsWith('array') ? [] : {}) });
  }
  if ((x = m('PUT', /^\/api\/local\/tuning\/([A-Za-z0-9_-]+)$/))) {
    const def = defs.byId(x[1]);
    if (!def) return sendError(res, 404, 'unknown sheet');
    const body = await readJSONBody(req);
    if (!body || body.data === undefined) return sendError(res, 400, 'body must be { data }');
    const rows = defs.toRows(def, body.data);
    const refs = refsForValidation();
    const file = tuningFileFor(def);
    const baseline = fs.existsSync(file) ? defs.errorSignatures(def, defs.toRows(def, readJSONFile(file)), refs) : null;
    const { errors, warnings } = defs.validateRows(def, rows, refs, baseline);
    if (errors.length) return sendError(res, 422, 'sheet rejected', { errors, warnings });
    const written = writeJSONFile(file, body.data);
    console.log(`[sheet] ${def.id} ${written.changed ? 'written' : 'unchanged'} (${written.bytes} bytes, ${rows.length} rows, ${warnings.length} warnings)`);
    return sendJSON(res, 200, { written: [written], warnings, restartNeeded: !!def.restartNeeded });
  }
  if (p === '/api/local/tuning/globalTuning/phase' && req.method === 'PATCH') {
    const { event, phase, hours } = (await readJSONBody(req)) || {};
    const file = path.join(GAME_SERVER_DIR, 'tuning', 'globalTuning.json');
    const tuning = readJSONFile(file);
    if (!tuning[event]?.phases || !(phase in tuning[event].phases)) return sendError(res, 400, 'unknown event/phase');
    tuning[event].phases[phase] = Number(hours);
    return sendJSON(res, 200, { written: [writeJSONFile(file, tuning)] });
  }

  // client files
  if (req.method === 'GET') return serveStatic(res, CLIENT_DIR, p.replace(/^\/+/, ''));
  return sendError(res, 404, 'not found');
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error(err);
    if (!res.headersSent) sendError(res, 500, err.message);
    else res.end();
  });
});

// ----------------------------------------------------------------------------- lifecycle
const sockets = new Set();
server.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
process.on('SIGINT', () => { console.log('\n[editor] shutting down'); server.close(() => process.exit(0)); for (const s of sockets) s.destroy(); setTimeout(() => process.exit(0), 500); });

server.listen(ARGS.port, '127.0.0.1', () => {
  console.log(`[editor] VVGame Editor on http://127.0.0.1:${ARGS.port}  game server: ${ARGS.gameServer}  repo: ${REPO_ROOT}`);
});
