#!/usr/bin/env node
/**
 * Cut a wall or fence junction panel (tools/art/jobs/walls.json) into the autotile pieces
 * the renderer composes formations from (PixiRendererWalls.js):
 *
 *   <set>-post.png            the centre post
 *   <set>-n/e/s/w.png         a straight run from the centre to that edge of the tile
 *   <set>-run-h/v.png         a tile-long straight run with no post (E-W, N-S)
 *
 * One PLUS panel per set (post + the four straight spokes); the spokes only overlap at the
 * post, so each cuts clean as a band along its direction. The stone post comes from a second,
 * lone-tower panel (--post-panel). Walls connect N, E, S, W only (owner, 2026-10-21: the
 * diagonal pieces, cut from a CROSS panel, were removed as not needed).
 * Output: game-client/public/assets/walls/, 128 px (192 for the tall stone set), plus walls.json.
 *
 *   node tools/art/walls.js --set stone --plus painterly-stone-wall-plus-1 --post-panel painterly-stone-wall-post-1 [--from exploration|approved]
 *   node tools/art/walls.js --set fence --from approved
 */
const fs = require('fs');
const path = require('path');
const { ROOT, CANDIDATES, sharp, ensureDir } = require('./lib/common');
const { keyMagenta } = require('./lib/key');

const OUT = path.join(ROOT, 'game-client', 'public', 'assets', 'walls');
const PX = 128, CELL = 256;
// The piece window: CELL wide, WIN_H tall, the wall's line LINE_Y px below the window's top.
// A one-tile window holds a low wall; the stone wall is 1.5 tiles tall (the owner's 50%),
// so its window is 384 high and its pieces land in the atlas at 192 px, drawn by the renderer
// as a 1.5-tile square whose bottom 256 rows and middle 256 columns are the tile.
const TALL = { stone: { winH: 384, lineY: 200 }, fence: { winH: 256, lineY: 128 } };
const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const set = opt('set', 'stone');
const { winH: WIN_H, lineY: LINE_Y } = TALL[set] || TALL.fence;
const OUT_PX = Math.round(PX * WIN_H / CELL);
const plusPanel = opt('plus', `painterly-${set === 'stone' ? 'stone-wall' : 'wood-fence'}-plus-1`), from = opt('from', 'exploration');

const DIRS = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
// --s-raise N: the south spoke's near end is raised N px. In the plus panel the artist ends the
// south spoke low on the tower's face, two brick courses under where the east and west walkways
// meet it; since the renderer draws the south spoke OVER the post, the spoke must end at the
// same imagined height as the others (owner, 2026-10-21). The piece is cut from a window N px
// further down the spoke (so its content sits N px higher) and its band mask reaches N px above
// the wall's line to keep the raised end.
const S_RAISE = Number(opt('s-raise', set === 'stone' ? 72 : 0));
// The post mask, per set: an ellipse that covers the drawn post, its top (which sits ABOVE the
// wall's line, the post being taller) and its face below, but not the spokes' bases beyond the
// post's rim. Otherwise each spoke's quarter wedge carries a quarter of the post's rim and a
// lone straight run shows notches where the missing wedges were. --post "dy,rx,ry".
// The post mask is MEASURED from the plus panel (towerProfile): the cap's top, the tower's
// width and its base, where the south spoke takes over. Cutting at the base is what keeps a
// stub of the south spoke's capstones off a post that has no wall to the south; drawing the
// full cap ellipse is what gives every post the same complete top whatever joins it.
let TOWER = null; // { capTop, base, rx } in window px relative to the line, set in main

/**
 * Where the post is: the centroid of the art gives a first guess (pulled down by the front
 * faces), then the N spoke's column gives x and the E spoke's TOP SURFACE gives y: at a
 * column well to the right of the centre, the opaque run's top edge plus a third of its
 * height is the wall's line (the rest is the face hanging below it).
 */
async function postCentre(keyed) {
  const { data, info } = await sharp(keyed).raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, A = (x, y) => data[(y * W + x) * 4 + 3];
  let sx = 0, sy = 0, n = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (A(x, y) > 200) { sx += x; sy += y; n++; }
  const gx = Math.round(sx / n), gy = Math.round(sy / n);
  const xs = [];
  for (let y = gy - 230; y < gy - 170; y++) for (let x = gx - 120; x < gx + 120; x++) if (A(x, y) > 200) xs.push(x);
  xs.sort((a, b) => a - b);
  const cx = xs.length ? xs[xs.length >> 1] : gx;
  const tops = [], bottoms = [];
  for (let x = cx + 170; x < cx + 230; x++) {
    let top = -1, bottom = -1;
    for (let y = gy - 150; y < gy + 150; y++) if (A(x, y) > 200) { if (top < 0) top = y; bottom = y; }
    if (top >= 0) { tops.push(top); bottoms.push(bottom); }
  }
  const med = (a) => a.sort((p, q) => p - q)[a.length >> 1];
  const cy = tops.length ? Math.round(med(tops) + (med(bottoms) - med(tops)) * 0.33) : gy;
  return { x: cx, y: cy };
}

/**
 * The tower in a keyed plus panel, relative to the wall's line: capTop (the cap's top row),
 * base (the row where the tower's width falls to the south spoke's) and rx (half the
 * tower's width). Widths are measured within +-140 px of the centre column so the east and
 * west walls do not count; "tower rows" are those wider than the spoke by a margin.
 */
async function towerProfile(keyed, ctr, lineDy) {
  const { data, info } = await sharp(keyed).raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, A = (x, y) => data[(y * W + x) * 4 + 3];
  const width = (y) => { if (y < 0 || y >= H) return 0; let l = -1, r = -1; for (let x = ctr.x - 140; x <= ctr.x + 140; x++) if (A(x, y) > 200) { if (l < 0) l = x; r = x; } return l < 0 ? 0 : r - l + 1; };
  const med = (a) => a.sort((p, q) => p - q)[a.length >> 1];
  const spokeS = med([300, 330, 360, 390, 420].map((d) => width(ctr.y + d)));
  const spokeN = med([300, 330, 360, 390, 420].map((d) => width(ctr.y - d)));
  const line = ctr.y + lineDy;
  // the cap's top: the first row that is wider than the north spoke at all (an ellipse's top
  // rows are narrow, so a fat margin read the cap as starting lower than it does and clipped it)
  let capTop = line; for (let y = line; y >= 0; y--) { if (width(y) > spokeN + 4) capTop = y; else if (y < line - 40) break; }
  // the half-width from the cap alone (rows below it hold the east and west walls)
  // a tower is a cap that rises well above the wall's top band (a fence post does not); its
  // half-width is read from the cap rows alone, which hold no wall
  if (capTop > line - 80) return null;
  let rx = 0; for (let y = capTop; y < Math.min(capTop + 50, line - 80); y++) rx = Math.max(rx, width(y) / 2);
  if (rx * 2 < spokeN + 16) return null;
  // the base: the last row that is still nearly the tower's full width. The south spoke
  // flares where it meets the tower, so "wider than the spoke" read the base too low and
  // carried a stub of the spoke's capstones under every post with no wall to the south.
  let base = line; for (let y = line; y < H; y++) { if (width(y) >= rx * 2 - 12) base = y; else if (y > line + 40) break; }
  return { capTop: capTop - line - 6, base: base - line, rx: Math.round(rx) };
}


/**
 * An SVG mask (white = keep, transparent elsewhere) for one piece in the 256 px cell: the post
 * ellipse, or a BAND along a spoke's direction. A band, not a wedge: a tall wall's face hangs
 * below its centreline, so a +-45 degree wedge cut a triangle out of the face where it met the
 * post and handed that triangle to the spoke below (the owner's notches and stray triangles).
 * The band runs from the centre outward, `top` px above the centreline and `face` px below it
 * (orthogonal spokes; a north-south spoke is a symmetric band `side` wide, it shows no face);
 * --band "top,face,side" per set.
 */
const BAND = (opt('band', set === 'fence' ? '30,56,16' : '72,142,56')).split(',').map(Number);
function maskSvg(piece) {
  const c = CELL / 2, cy = LINE_Y, R = WIN_H; // (c, cy) is the wall's line in the window
  let shape;
  if (piece === 'post' && !TOWER) {
    const [dy, rx, ry] = (opt('post', '10,24,70')).split(',').map(Number); // a plain post (the fence): an ellipse
    shape = `<ellipse cx="${c}" cy="${cy + dy}" rx="${rx}" ry="${ry}"/>`;
  } else if (piece === 'post') {
    const { capTop, base, rx } = TOWER;
    const ry = Math.round(rx * 0.7); // the cap seen from above is an ellipse about this flat (generous: a clipped cap is worse than a sliver of wall)
    const capCy = cy + capTop + ry;
    shape = `<ellipse cx="${c}" cy="${capCy}" rx="${rx}" ry="${ry}"/><rect x="${c - rx}" y="${capCy}" width="${2 * rx}" height="${cy + base - capCy}"/>`;
  }
  else {
    const [dx, dy] = DIRS[piece];
    const ang = Math.atan2(dy, dx) * 180 / Math.PI;
    const [top, face, side] = BAND;
    let above, below; // extents on the local -y and +y sides, in the rotated frame
    if (dy === 0) { above = top; below = face; }                       // e, w: a face hangs below
    else { above = side; below = side; }                               // n, s: symmetric (widths)
    // rotate(ang) maps local +y to (-sin, cos): it points DOWN on the canvas only when cos(ang) > 0
    const localYIsDown = Math.cos(ang * Math.PI / 180) > 0;
    const [yMin, yMax] = localYIsDown ? [-above, below] : [-below, above];
    // The near end: the south spoke's raised end reaches S_RAISE px above the line. The east and
    // west spokes start at the tower's edge instead of its centre: the plus panel's south spoke
    // is painted over the tower's lower face, inside their face band, and a band from the centre
    // carried a stub of it out from under the post's base. They start 12 px INSIDE the tower's
    // edge: a cut exactly at the half-width left a one-pixel gap against the post's soft edge
    // (owner), and 12 px in is still clear of the spoke, which is `side` wide (56) about the centre.
    const near = piece === 's' ? -S_RAISE : (TOWER && (piece === 'e' || piece === 'w')) ? TOWER.rx - 12 : 0;
    shape = `<g transform="translate(${c} ${cy}) rotate(${ang})"><rect x="${near}" y="${yMin}" width="${R - near}" height="${yMax - yMin}"/></g>`;
  }
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${CELL}" height="${WIN_H}"><g fill="#fff">${shape}</g></svg>`);
}

(async () => {
  ensureDir(OUT);
  // --from approved | exploration (= exploration/openai) | <round folder under exploration/>
  const dir = path.join(CANDIDATES, 'walls', from === 'approved' ? 'approved' : path.join('exploration', from === 'exploration' ? 'openai' : from));
  const keyedCache = {};
  const windowOf = async (panel, ox = 0, oy = 0) => {
    if (!keyedCache[panel]) {
      const file = fs.readdirSync(dir).find((f) => f.endsWith(`${panel}.png`) || f === `${panel}.png`);
      if (!file) throw new Error(`no panel ${panel} in ${dir}`);
      const keyed = await keyMagenta(await sharp(path.join(dir, file)).png().toBuffer(), { hue: true });
      const ctr = await postCentre(keyed);
      console.log(`${panel}: post at (${ctr.x}, ${ctr.y})`);
      keyedCache[panel] = { keyed, ctr };
    }
    const { keyed, ctr } = keyedCache[panel];
    // a run's window sits one cell out along a spoke: (ox, oy) px from the post
    const left = Math.max(0, Math.min(1024 - CELL, ctr.x + ox - CELL / 2)), top = Math.max(0, Math.min(1024 - WIN_H, ctr.y + oy - LINE_Y));
    return sharp(keyed).extract({ left, top, width: CELL, height: WIN_H }).png().toBuffer();
  };
  // --post-panel <name>: a lone tower drawn on its own panel. The plus panel's tower cannot be
  // cut clean: its south spoke is painted OVER the tower's lower face, so any mask that keeps
  // the tower's base keeps a stub of the spoke's capstones with it (the owner's dangling piece
  // of wall top under posts with no wall south). A lone tower has nothing to cut away; it is
  // aligned to the plus panel's tower by the cap's top row.
  const postPanel = opt('post-panel', null);
  const plus = await windowOf(plusPanel);
  {
    const { keyed, ctr } = keyedCache[plusPanel];
    TOWER = await towerProfile(keyed, ctr, 0);
    console.log(TOWER ? `${set} tower: cap top ${TOWER.capTop}, base ${TOWER.base}, half-width ${TOWER.rx} (px from the line)` : `${set}: no tower wider than its spokes, post = ellipse`);
  }
  const plusS = S_RAISE ? await windowOf(plusPanel, 0, S_RAISE) : plus; // the south spoke's window, shifted down the spoke
  const cellFor = (piece) => (piece === 's' ? plusS : plus);
  let lonePost = null;
  if (postPanel && TOWER) {
    const file = fs.readdirSync(dir).find((f) => f.endsWith(`${postPanel}.png`) || f === `${postPanel}.png`);
    if (!file) throw new Error(`no panel ${postPanel} in ${dir}`);
    const keyed = await keyMagenta(await sharp(path.join(dir, file)).png().toBuffer(), { hue: true });
    const { data, info } = await sharp(keyed).raw().toBuffer({ resolveWithObject: true });
    const W = info.width, H = info.height, A = (x, y) => data[(y * W + x) * 4 + 3];
    let top = -1, l = W, r = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (A(x, y) > 200) { if (top < 0) top = y; if (x < l) l = x; if (x > r) r = x; }
    const cx = Math.round((l + r) / 2);
    const left = Math.max(0, Math.min(W - CELL, cx - CELL / 2)), wtop = Math.max(0, Math.min(H - WIN_H, top - (LINE_Y + TOWER.capTop)));
    lonePost = await sharp(keyed).extract({ left, top: wtop, width: CELL, height: WIN_H }).png().toBuffer();
    console.log(`${postPanel}: lone tower top ${top}, centre ${cx}; post cut from it`);
  }
  // RUNS: a tile-long straight piece with no post, cut one cell out along a spoke (the spokes
  // are 1.75 cells long, so the window holds neither the post nor the end cap). A tile whose
  // only neighbours are opposite each other draws a run instead of post + two spokes, which
  // is what makes a wall read as continuous between its towers.
  const runs = {};
  runs['run-h'] = await windowOf(plusPanel, CELL, 0);
  // run-v: a north-south wall is a flat band seen from above with no face, so it needs only
  // its own tile's rows (the tile above covers the headroom with its own piece). One cell is
  // cut from the far end of the NORTH spoke, clear of the tower, and set into the bottom of
  // the window. (A tall window one cell south of the post held the tower's base.)
  {
    const { keyed, ctr } = keyedCache[plusPanel];
    const top = Math.max(0, ctr.y - Math.round(1.72 * CELL)), left = ctr.x - CELL / 2;
    const cell = await sharp(keyed).extract({ left, top, width: CELL, height: CELL }).png().toBuffer();
    runs['run-v'] = WIN_H === CELL ? cell : await sharp({ create: { width: CELL, height: WIN_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: cell, left: 0, top: WIN_H - CELL }]).png().toBuffer();
  }
  const manifest = { note: 'Cut by tools/art/walls.js from a junction panel; the renderer composes a wall tile from the post plus one spoke per connected neighbour (PixiRendererWalls.js).', sets: JSON.parse(fs.existsSync(path.join(OUT, 'walls.json')) ? fs.readFileSync(path.join(OUT, 'walls.json'), 'utf8') : '{"sets":{}}').sets };
  manifest.sets[set] = { plus: plusPanel, post: postPanel, px: OUT_PX, span: WIN_H / CELL, pieces: [] };
  for (const piece of ['post', ...Object.keys(DIRS), ...Object.keys(runs)]) {
    const cut = runs[piece] ? runs[piece] : (piece === 'post' && lonePost) ? lonePost : await sharp(cellFor(piece)).composite([{ input: await sharp(maskSvg(piece)).png().toBuffer(), blend: 'dest-in' }]).png().toBuffer();
    const pad = (WIN_H - CELL) / 2; // a tall window becomes a square with the tile's columns in the middle
    const square = pad ? await sharp(cut).extend({ left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer() : cut;
    const small = await sharp(square).resize(OUT_PX + 2, OUT_PX + 2, { kernel: 'lanczos3' }).extract({ left: 1, top: 1, width: OUT_PX, height: OUT_PX }).png({ compressionLevel: 9 }).toBuffer();
    fs.writeFileSync(path.join(OUT, `${set}-${piece}.png`), small);
    manifest.sets[set].pieces.push(piece);
  }
  fs.writeFileSync(path.join(OUT, 'walls.json'), JSON.stringify(manifest, null, 2) + '\n');
  // a proof sheet: a few formations composed from the pieces
  const S = WIN_H;
  const piece = (p) => sharp(path.join(OUT, `${set}-${p}.png`)).resize(S, S).png().toBuffer();
  const compose = async (list) => { const layers = []; for (const p of list) layers.push({ input: await piece(p) }); return sharp({ create: { width: S, height: S, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(layers).png().toBuffer(); };
  const forms = [['post'], ['run-h'], ['run-v'], ['post', 'n', 'e'], ['post', 'e', 'w', 's'], ['post', 'n', 'e', 'w', 's'], ['post', 'e'], ['post', 's']];
  const layers = []; let x = 8;
  for (const f of forms) { layers.push({ input: await compose(f), left: x, top: 8 }); x += S + 8; }
  await sharp({ create: { width: x + 8, height: S + 16, channels: 4, background: '#78ac14' } }).composite(layers).png().toFile(path.join(CANDIDATES, 'walls', `${set}-formations.png`));
  console.log(`wrote ${path.relative(ROOT, OUT)}/${set}-*.png and _candidates/walls/${set}-formations.png. Next: npm run build:atlas in game-client.`);
})().catch((e) => { console.error(e); process.exit(1); });
