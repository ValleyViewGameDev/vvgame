/**
 * ArmRig: jointed, SKINNED arms for a drawn figure (docs/arm-rig-plan.md).
 *
 * A rigged drawing (rigs.json, keyed by art file) is split ONCE into the body, with its arms removed
 * and the torso behind them painted in, and per arm ONE soft-edged arm image (the whole arm, shoulder
 * to fingertips). The arm image is drawn on a fine mesh, and every mesh point follows the arm's bones
 * by a weight that blends smoothly across each joint (torso -> upper arm around the shoulder, upper
 * arm -> forearm around the elbow): a point turns about the joint by its weight times the joint's
 * angle (angle blending, so a bend curves round the joint instead of collapsing the way averaged
 * positions do). The arm therefore bends and stays joined like one piece of skin: no cut seams, no
 * piece corners (owner 2026-11-12, after rigid cut-out pieces showed blocky corners and pinches).
 * At rest every point is where it was drawn, so the figure looks exactly as painted.
 *
 * The body stays the NPC's BreathSprite (breath, walk, turn, crouch, hover); the arm meshes are its
 * children (position, scale, mirror, hit pops come free) and BreathSprite.updateTransform calls
 * `sync`, which moves each arm with the body's deformation at its shoulder (BreathSprite.pointAt) and
 * poses it from the playing clip (armClips.js: shoulder and elbow angles).
 */
import { Container, RenderTexture, SimpleMesh, Sprite, Texture } from 'pixi.js-legacy';
import RIGS from './rigs.json';
import { ARM_CLIPS, poseAt, valueAt, clipLength } from './armClips';

const limbNames = (rig) => Object.keys(rig.arms || {}); // 'L' / 'R' for arms; any names for other limbs (a spider's legs)

/** The rig for an art file, or null. */
export const rigFor = (filename) => (filename && RIGS[filename]) || null;

// ---------------------------------------------------------------------------------------------
// The cut: one set of piece textures per drawing (and per texture, if the art is reloaded)
// ---------------------------------------------------------------------------------------------
const cuts = new WeakMap(); // texture -> { body, arms: { L: { tex, box }, R: ... }, w, h }

const tracePoly = (ctx, poly, w, h) => {
  ctx.beginPath();
  poly.forEach(([u, v], i) => (i ? ctx.lineTo(u * w, v * h) : ctx.moveTo(u * w, v * h)));
  ctx.closePath();
};

const blankCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

/** The arm's outline (its `upper` and `fore` outlines and the round `cap` / `shoulderCap` discs, as one union). */
const pieceMask = (arm, which, w, h) => {
  const c = blankCanvas(w, h), ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  const poly = arm[which] || (which === 'upper' ? arm.outline : null);
  if (poly) { tracePoly(ctx, poly, w, h); ctx.fill(); } // each shape filled on its own: a union, whatever their winding
  const disc = (j, r) => { if (j && r > 0) { ctx.beginPath(); ctx.arc(j[0] * w, j[1] * h, r * w, 0, Math.PI * 2); ctx.fill(); } };
  if (arm.elbow) disc(arm.elbow, arm.cap || 0);
  if (which === 'upper') disc(arm.shoulder, arm.shoulderCap || 0);
  return c;
};


/** The drawing as a canvas at its full square (trim and atlas packing undone by a render). */
function drawingCanvas(renderer, texture) {
  const w = Math.round(texture.orig.width), h = Math.round(texture.orig.height);
  const probe = new Sprite(texture);
  const rt = RenderTexture.create({ width: w, height: h, resolution: 1 });
  renderer.render(probe, { renderTexture: rt, clear: true });
  const canvas = renderer.extract.canvas(rt);
  rt.destroy(true); probe.destroy();
  if (canvas.width === w && canvas.height === h) return canvas;
  const c = blankCanvas(w, h); c.getContext('2d').drawImage(canvas, 0, 0, w, h); return c;
}

/**
 * Paint in the torso the arm hid: inside `under`, every pixel the cut left see-through is filled.
 * `fill: "clone"` copies the body from `cloneStep` away (fractions of the square, stepped again
 * until it leaves the area), so fur keeps its texture; otherwise, or where the clone lands on
 * nothing, it takes the colour of the nearest solid body pixel on its row toward the image's centre.
 */
function underpaint(body, arm, side, w, h) {
  const mask = blankCanvas(w, h), mctx = mask.getContext('2d');
  mctx.fillStyle = '#fff'; tracePoly(mctx, arm.under, w, h); mctx.fill();
  const m = mctx.getImageData(0, 0, w, h).data;
  const bctx = body.getContext('2d');
  const img = bctx.getImageData(0, 0, w, h), d = img.data, src = new Uint8ClampedArray(d);
  const inMask = (x, y) => m[(y * w + x) * 4 + 3] >= 128;
  const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3] >= 250;
  const step = arm.fillDir || (side === 'L' ? 1 : -1), reach = Math.round(w * 0.2);
  const cs = arm.fill === 'clone' ? (arm.cloneStep || [0.08 * step, 0]) : null;
  const cdx = cs ? Math.round(cs[0] * w) : 0, cdy = cs ? Math.round(cs[1] * h) : 0;
  const put = (i, j) => {
    const a = d[i + 3] / 255; // blend over what is left (the cut's soft edge)
    d[i] = src[j] * (1 - a) + d[i] * a; d[i + 1] = src[j + 1] * (1 - a) + d[i + 1] * a; d[i + 2] = src[j + 2] * (1 - a) + d[i + 2] * a; d[i + 3] = 255;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (!inMask(x, y) || d[i + 3] >= 250) continue;
      if (cs && (cdx || cdy)) {
        let sx = x, sy = y;
        for (let k = 0; k < 12 && sx >= 0 && sy >= 0 && sx < w && sy < h && inMask(sx, sy); k++) { sx += cdx; sy += cdy; }
        if (solid(sx, sy) && !inMask(sx, sy)) { put(i, (sy * w + sx) * 4); continue; }
      }
      for (let k = 1, sx = x + step; k <= reach && sx >= 0 && sx < w; k++, sx += step) {
        if (solid(sx, y) && !inMask(sx, y)) { put(i, (y * w + sx) * 4); break; }
      }
    }
  }
  bctx.putImageData(img, 0, 0);
}

/** Cut a drawing into its rig's pieces (cached per texture). Null if it cannot be read. */
/**
 * Soft cut edges (owner 2026-11-12: hard cuts through the fur showed as ragged lines and spikes once
 * an arm turned). Each piece's mask is FEATHERED by FEATHER (of the square's width), so in motion its
 * edge fades out instead of ending in a cut line. The body is erased with the HARD outlines: where a
 * cut runs through the body (the shoulder, the armpit) the `under` fill makes it solid again, so the
 * soft edge still lies over solid body at rest; eroding the erase instead left a ghost rim of arm
 * pixels on the body wherever an outline ran close to the arm's own edge.
 */
const FEATHER = 0.006;

/** A copy of a mask canvas with its alpha box-blurred by r px (two passes, separable). */
function blurMask(mask, r) {
  const w = mask.width, h = mask.height, ctx = mask.getContext('2d');
  const a = new Float32Array(w * h), b = new Float32Array(w * h);
  const d = ctx.getImageData(0, 0, w, h).data;
  for (let i = 0; i < w * h; i++) a[i] = d[i * 4 + 3];
  const pass = (src, dst, horizontal) => {
    const n = horizontal ? w : h, m = horizontal ? h : w, span = 2 * r + 1;
    for (let j = 0; j < m; j++) {
      let sum = 0;
      const at = (i) => (horizontal ? j * w + Math.min(n - 1, Math.max(0, i)) : Math.min(n - 1, Math.max(0, i)) * w + j);
      for (let i = -r; i <= r; i++) sum += src[at(i)];
      for (let i = 0; i < n; i++) { dst[at(i)] = sum / span; sum += src[at(i + r + 1)] - src[at(i - r)]; }
    }
  };
  for (let k = 0; k < 2; k++) { pass(a, b, true); pass(b, a, false); }
  const out = blankCanvas(w, h), octx = out.getContext('2d'), img = octx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) { img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 255; img.data[i * 4 + 3] = a[i]; }
  octx.putImageData(img, 0, 0);
  return out;
}

/**
 * Limbs given as a `path` (their centre line, root to tip; a spider's legs, which touch each other so
 * no outline separates them cleanly) are cut by NEAREST PATH: every solid pixel outside the `exclude`
 * ellipses and within `reach` (of the square) of some path belongs to the limb whose path is nearest.
 * The limbs never share a pixel and their borders fall in the gaps between them. Returns { name: mask }.
 */
function limbsByPath(rig, src, w, h) {
  const names = limbNames(rig).filter((n) => rig.arms[n].path);
  if (!names.length) return {};
  const data = src.getContext('2d').getImageData(0, 0, w, h).data;
  const ex = blankCanvas(w, h), ectx = ex.getContext('2d'); ectx.fillStyle = '#fff';
  for (const [cx, cy, rx, ry] of rig.exclude || []) { ectx.beginPath(); ectx.ellipse(cx * w, cy * h, rx * w, ry * h, 0, 0, Math.PI * 2); ectx.fill(); }
  const exd = ectx.getImageData(0, 0, w, h).data;
  const segs = names.map((n) => { const P = rig.arms[n].path.map(([u, v]) => [u * w, v * h]); const out = []; for (let i = 1; i < P.length; i++) out.push([P[i - 1], P[i]]); return out; });
  const reach = names.map((n) => (rig.arms[n].reach || 0.06) * w);
  const dist2 = ([a, b], x, y) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy || 1; let t = ((x - a[0]) * dx + (y - a[1]) * dy) / l; t = Math.max(0, Math.min(1, t)); const px = a[0] + dx * t - x, py = a[1] + dy * t - y; return px * px + py * py; };
  const imgs = names.map(() => new ImageData(w, h));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (data[i + 3] < 8 || exd[i + 3] > 127) continue;
    let best = -1, bd = Infinity;
    for (let k = 0; k < names.length; k++) for (const sg of segs[k]) { const d = dist2(sg, x + 0.5, y + 0.5); if (d < bd) { bd = d; best = k; } }
    if (best >= 0 && bd <= reach[best] * reach[best]) { const im = imgs[best].data; im[i] = im[i + 1] = im[i + 2] = 255; im[i + 3] = 255; }
  }
  const out = {};
  names.forEach((n, k) => { const c = blankCanvas(w, h); c.getContext('2d').putImageData(imgs[k], 0, 0); out[n] = c; });
  return out;
}

/** The box (fractions of the square) the arm's mesh covers: its outlines and discs, padded. */
function armBox(arm) {
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
  const take = (x, y, r = 0) => { x0 = Math.min(x0, x - r); y0 = Math.min(y0, y - r); x1 = Math.max(x1, x + r); y1 = Math.max(y1, y + r); };
  if (arm.path) for (const [x, y] of arm.path) take(x, y, arm.reach || 0.06);
  for (const [x, y] of [...(arm.upper || arm.outline || []), ...(arm.fore || [])]) take(x, y);
  if (arm.cap && arm.elbow) take(arm.elbow[0], arm.elbow[1], arm.cap);
  if (arm.shoulderCap) take(arm.shoulder[0], arm.shoulder[1], arm.shoulderCap);
  const pad = 0.01;
  return { x0: Math.max(0, x0 - pad), y0: Math.max(0, y0 - pad), x1: Math.min(1, x1 + pad), y1: Math.min(1, y1 + pad) };
}

export function cutRig(renderer, texture, rig) {
  if (!renderer || !texture || !rig) return null;
  const cached = cuts.get(texture);
  if (cached) return cached;
  let src;
  try { src = drawingCanvas(renderer, texture); } catch (e) { console.warn('ArmRig: cannot read the drawing', e); return null; }
  const w = src.width, h = src.height;
  const layer = (mask) => {
    const c = blankCanvas(w, h), ctx = c.getContext('2d');
    ctx.drawImage(src, 0, 0);
    ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(mask, 0, 0);
    return Texture.from(c);
  };
  const body = blankCanvas(w, h), bctx = body.getContext('2d');
  bctx.drawImage(src, 0, 0);
  bctx.globalCompositeOperation = 'destination-out';
  const arms = {};
  const r = Math.max(1, Math.round(FEATHER * w));
  // `exclude`: ellipses [cx, cy, rx, ry] no limb may take (a spider's body: its legs run in under it)
  const cutAway = (c) => {
    if (!rig.exclude) return;
    const x = c.getContext('2d'); x.globalCompositeOperation = 'destination-out'; x.fillStyle = '#fff';
    for (const [cx, cy, rx, ry] of rig.exclude) { x.beginPath(); x.ellipse(cx * w, cy * h, rx * w, ry * h, 0, 0, Math.PI * 2); x.fill(); }
    x.globalCompositeOperation = 'source-over';
  };
  const pathMasks = limbsByPath(rig, src, w, h);
  for (const side of limbNames(rig)) {
    const arm = rig.arms[side];
    let both = pathMasks[side];
    if (!both) {
      const upper = pieceMask(arm, 'upper', w, h), fore = pieceMask(arm, 'fore', w, h);
      both = blankCanvas(w, h); const bc = both.getContext('2d'); bc.drawImage(upper, 0, 0); bc.drawImage(fore, 0, 0);
      if (!arm.noExclude) cutAway(both); // a fang hangs in front of the head: it keeps its top
    }
    bctx.drawImage(both, 0, 0); // erased from the body (destination-out) with the HARD outline
    const feather = arm.feather ?? (arm.path ? 0 : r); // legs cut along each other stay hard: two soft edges meeting would show a seam
    arms[side] = { tex: layer(feather ? blurMask(both, feather) : both), box: armBox(arm) }; // the whole limb, one image
  }
  bctx.globalCompositeOperation = 'source-over';
  for (const side of limbNames(rig)) if (rig.arms[side].under) underpaint(body, rig.arms[side], side, w, h);
  const out = { body: Texture.from(body), arms, w, h };
  cuts.set(texture, out);
  return out;
}

// ---------------------------------------------------------------------------------------------
// The runtime: the arm sprites on a BreathSprite, and the clip player
// ---------------------------------------------------------------------------------------------
const MESH_STEP = 1 / 72;          // the arm mesh's grid spacing (of the square): fine enough for a smooth bend
const BLEND = [0.05, 0.04];          // default half-widths (of the square) of the shoulder and elbow blend zones
const smooth01 = (t) => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };

export class ArmRig {
  constructor(sprite, rig, cut, { attackClip } = {}) {
    this.rig = rig; this.cut = cut; this.attackClip = attackClip || null;
    this.root = new Container();
    this.arms = {};
    const { w, h } = cut;
    this.names = limbNames(rig);
    for (const side of this.names) {
      const arm = rig.arms[side], part = cut.arms[side];
      if (!arm || !part) continue;
      const { box } = part;
      const cols = Math.max(2, Math.ceil((box.x1 - box.x0) / MESH_STEP) + 1), rows = Math.max(2, Math.ceil((box.y1 - box.y0) / MESH_STEP) + 1);
      const n = cols * rows, uvs = new Float32Array(n * 2), verts = new Float32Array(n * 2);
      const rest = new Float32Array(n * 2), wU = new Float32Array(n), wF = new Float32Array(n), bell = new Float32Array(n);
      // the bones: shoulder -> elbow, elbow -> grip (the hand)
      // a one-joint limb (a spider's fang) has no elbow: nothing past the shoulder turns on its own
      const S = arm.shoulder, E = arm.elbow || arm.grip || S, G = arm.grip || E;
      const axis = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };
      const a1 = axis(S, E), a2 = axis(E, G);
      const [b1, b2] = arm.blend || BLEND;
      // the shoulder bulge (the deltoid): a raised arm is swollen sideways near the shoulder, most at
      // the shoulder and fading out by `bulgeReach` down the arm, so its top keeps its thickness where
      // the drawing's arm tapers into the body (owner 2026-11-12: "too pinched at the shoulder")
      const reach = arm.bulgeReach || 0.16;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const k = r * cols + c, u = box.x0 + (box.x1 - box.x0) * (c / (cols - 1)), v = box.y0 + (box.y1 - box.y0) * (r / (rows - 1));
          uvs[k * 2] = u; uvs[k * 2 + 1] = v;
          rest[k * 2] = u * w; rest[k * 2 + 1] = v * h;
          // how much of this point belongs to the upper arm (past the shoulder along the arm) and to the forearm (past the elbow)
          wU[k] = smooth01(((u - S[0]) * a1[0] + (v - S[1]) * a1[1] + b1) / (2 * b1));
          wF[k] = arm.elbow ? smooth01(((u - E[0]) * a2[0] + (v - E[1]) * a2[1] + b2) / (2 * b2)) : 0;
          const along = (u - S[0]) * a1[0] + (v - S[1]) * a1[1];
          bell[k] = along >= 0 ? 1 - smooth01(along / reach) : 1 - smooth01(-along / 0.04); // 1 at the shoulder, 0 a reach down the arm (and just above it)
        }
      }
      const indices = new Uint16Array((cols - 1) * (rows - 1) * 6);
      let q = 0;
      for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
        const k = r * cols + c;
        indices[q++] = k; indices[q++] = k + 1; indices[q++] = k + cols;
        indices[q++] = k + 1; indices[q++] = k + cols + 1; indices[q++] = k + cols;
      }
      const mesh = new SimpleMesh(part.tex, verts, uvs, indices);
      this.root.addChild(mesh);
      this.arms[side] = { arm, mesh, n, rest, wU, wF, bell, a1, S: [S[0] * w, S[1] * h], E: [E[0] * w, E[1] * h], pose: null };
    }
    this.play = null; // { clip, start, lead }
    sprite.addChild(this.root);
    sprite.armRig = this;
    this.sprite = sprite;
  }

  /** Each frame, before the children's transforms: each arm onto the body, its mesh posed from the clip. */
  sync(sprite) {
    const now = performance.now();
    let t = 0, clip = null;
    if (this.play) {
      t = now - this.play.start;
      if (t > clipLength(this.play.clip)) this.play = null; else clip = this.play.clip;
    }
    // the clip's lean (the Bear's swipe): toward the target, in the sprite's own left/right (a mirrored sprite flips it)
    const leanDir = clip && clip.lean ? this.play.leanDir || 0 : 0;
    sprite.lean = leanDir ? leanDir * (sprite.scale.x < 0 ? -1 : 1) * valueAt(clip.lean, t) : 0;
    // a clip with `leanVertical` lurches up or down instead when the target is in the same column (the Coyote)
    const leanDirY = clip && clip.lean ? this.play.leanDirY || 0 : 0;
    sprite.leanY = leanDirY ? leanDirY * valueAt(clip.lean, t) : 0;
    const { w, h } = this.cut;
    const ow = sprite.texture.orig.width / w, oh = sprite.texture.orig.height / h;
    const ax = sprite.anchor.x * w, ay = sprite.anchor.y * h; // the sprite's origin, in the arm image's pixels
    const auto = this.autoPose(sprite, now); // the gait while it moves, the idle wiggle while it stands (spider)
    for (const side of this.names) {
      const a = this.arms[side];
      if (!a) continue;
      const track = clip ? (side === this.play.lead ? clip.lead : clip.off) : null;
      const pose = track ? poseAt(track, t) : { s: 0, e: 0 };
      const out = side === 'R' ? -1 : 1; // outward is clockwise for the image's left arm
      const extra = auto[side];
      const ts = out * pose.s + (extra ? extra[0] : 0), te = out * pose.e + (extra ? extra[1] : 0);
      // the body's lean shears every row by its height (feet planted): each arm point gets its own row's
      // shift, so a hanging arm leans with the flank beside it instead of sliding off it as one block
      const P = sprite._pt, lean = P ? sprite.lean || 0 : 0, leanY = P ? sprite.leanY || 0 : 0; // this frame's lean (set above), not the last drawn frame's: no lag
      const span = P ? Math.max(0.01, P.feetV - P.vStart) : 1, feetV = P ? P.feetV : 1;
      if (!a.pose || a.pose[0] !== ts || a.pose[1] !== te || a.pose[2] !== lean || a.pose[3] !== leanY) {
        a.pose = [ts, te, lean, leanY];
        const V = a.mesh.verticesBuffer.data, R = a.rest;
        const [Sx, Sy] = a.S, [Ex, Ey] = a.E;
        const bulge = (a.arm.bulge || 0) * Math.min(1, Math.abs(ts) / (Math.PI / 2)); // fully swollen at a level arm
        for (let k = 0; k < a.n; k++) {
          let x = R[k * 2], y = R[k * 2 + 1];
          const sw = bulge * a.bell[k];              // the shoulder swells as the arm rises (in the rest frame, across the arm)
          if (sw) { const dx = x - Sx, dy = y - Sy, along = dx * a.a1[0] + dy * a.a1[1]; x = Sx + a.a1[0] * along + (dx - a.a1[0] * along) * (1 + sw); y = Sy + a.a1[1] * along + (dy - a.a1[1] * along) * (1 + sw); }
          const fe = a.wF[k] * te;               // the elbow first (in the arm's rest frame) ...
          if (fe) { const c = Math.cos(fe), s = Math.sin(fe), dx = x - Ex, dy = y - Ey; x = Ex + dx * c - dy * s; y = Ey + dx * s + dy * c; }
          const fs = a.wU[k] * ts;               // ... then the shoulder carries it
          if (fs) { const c = Math.cos(fs), s = Math.sin(fs), dx = x - Sx, dy = y - Sy; x = Sx + dx * c - dy * s; y = Sy + dx * s + dy * c; }
          const above = Math.max(0, feetV - y / h) / span; // the shear of this point's row (feet planted)
          if (lean) x += lean * h * above;
          if (leanY) y += leanY * h * above;
          V[k * 2] = x - ax; V[k * 2 + 1] = y - ay;
        }
        a.mesh.verticesBuffer.update();
      }
      // the body's breath, walk bob, crouch, hover and turn, as felt at the shoulder, move the whole arm
      const p = sprite.pointAt(a.arm.shoulder[0], a.arm.shoulder[1]);
      a.mesh.scale.set(p.f * ow, oh);
      const shoulderLean = lean ? lean * h * Math.max(0, feetV - a.S[1] / h) / span : 0; // already in p.x, and in the mesh's shoulder point
      const shoulderLeanY = leanY ? leanY * h * Math.max(0, feetV - a.S[1] / h) / span : 0;
      a.mesh.position.set(p.x - p.f * ow * (a.S[0] + shoulderLean - ax), p.y - oh * (a.S[1] + shoulderLeanY - ay));
    }
  }

  /**
   * Motion the rig plays by itself (rigs.json), as extra limb angles { name: [shoulder, elbow] } in radians:
   *   gait: { periodMs, limbs: { name: [phase 0..1, swing, bend] } } while the figure is moving (its sprite
   *     moved in the last moments): each limb swings about its root by swing * sin and its knee bends by
   *     bend while the swing is on its way forward, each in its own phase, so the legs step one after another.
   *   idle: { everyMs: [min, max], ms, limbs: { name: amplitude } } while it stands: every so often (per
   *     figure, irregular, like the foot tap) the limbs open and close twice (a spider's fangs).
   */
  autoPose(sprite, now) {
    const out = {}, rig = this.rig;
    if (!rig.gait && !rig.idle) return out;
    if (this._lx !== sprite.x || this._ly !== sprite.y) { this._lx = sprite.x; this._ly = sprite.y; this._movedAt = now; }
    const moving = now - (this._movedAt || -1e9) < 140;
    if (moving && rig.gait) {
      this._gaitAmp = Math.min(1, (this._gaitAmp || 0) + 0.15);
    } else this._gaitAmp = Math.max(0, (this._gaitAmp || 0) - 0.1); // eases out, so the legs settle instead of snapping
    if (this._gaitAmp > 0 && rig.gait) {
      const per = rig.gait.periodMs || 420;
      for (const [name, [phase, swing, bend]] of Object.entries(rig.gait.limbs)) {
        const q = 2 * Math.PI * (now / per + phase);
        out[name] = [this._gaitAmp * swing * Math.sin(q), this._gaitAmp * bend * Math.max(0, Math.cos(q))];
      }
      this._idleNext = now + 800;
      return out;
    }
    if (rig.idle) {
      const [lo, hi] = rig.idle.everyMs || [1500, 3500], ms = rig.idle.ms || 520;
      if (this._idleNext === undefined) this._idleNext = now + lo + Math.random() * (hi - lo);
      if (now >= this._idleNext) { this._idleAt = now; this._idleNext = now + ms + lo + Math.random() * (hi - lo); }
      const p = this._idleAt !== undefined ? (now - this._idleAt) / ms : 2;
      if (p >= 0 && p < 1) {
        const k = Math.sin(Math.PI * 2 * p) ** 2; // open, close, open, close: two snaps
        for (const [name, amp] of Object.entries(rig.idle.limbs)) out[name] = [amp * k, 0];
      }
    }
    return out;
  }

  /** Play a clip with `lead` ('L' or 'R', the image's side) as the leading arm. Returns its hit ms. */
  playClip(name, lead, leanDir = 0, leanDirY = 0) {
    const clip = ARM_CLIPS[name];
    if (!clip) return null;
    this.play = { clip, start: performance.now(), lead: lead === 'L' ? 'L' : 'R', leanDir, leanDirY };
    return clip.hit ?? null;
  }

  /**
   * The row's attack clip, led by the arm on the target's side of the screen (the image's own left
   * or right, swapped when the sprite is mirrored). `targetDx`: the target's screen x minus the
   * sprite's. `lean`: whether the body may lean toward the target (the player is in another column;
   * only clips with a lean track use it). Returns when the blow lands (ms), or null without an attack clip.
   */
  playAttack(targetDx, lean = false, targetDy = 0) {
    if (!this.attackClip) return null;
    const screenRight = targetDx >= 0;
    const mirrored = this.sprite.scale.x < 0;
    const clip = ARM_CLIPS[this.attackClip];
    // in the same column a `leanVertical` clip lurches toward the target below (+) or above (-) instead
    const leanY = !lean && clip?.leanVertical && targetDy ? Math.sign(targetDy) : 0;
    return this.playClip(this.attackClip, screenRight !== mirrored ? 'R' : 'L', lean ? (screenRight ? 1 : -1) : 0, leanY);
  }

  destroy() {
    if (this.root.parent) this.root.parent.removeChild(this.root);
    this.root.destroy({ children: true });
    if (this.sprite?.armRig === this) this.sprite.armRig = null;
  }
}

/**
 * Keep a sprite's ArmRig in step with what it should wear: attach one for a rigged drawing, swap it
 * when the drawing changes, drop it when there is none.
 */
export function syncArmRig(sprite, rig, cut, opts) {
  const have = sprite.armRig;
  if (have && (have.cut !== cut || !rig)) have.destroy();
  if (!rig || !cut) return null;
  if (sprite.armRig) { sprite.armRig.attackClip = opts?.attackClip || null; return sprite.armRig; }
  return new ArmRig(sprite, rig, cut, opts);
}
