import { Sprite } from 'pixi.js-legacy';
import { BREATH, breathDeform, breathingAllowed, turnAt, turnProgress, turnOver } from './breathing';
import { WALK, DEFAULT_LEGS, NO_ARMS, shapeOf, armsOf, armCutAt, walkLegs } from './walking';

/**
 * BreathSprite - a Sprite whose quad becomes a mesh while it breathes (breathing.js), turns
 * (breathing.js TURN) or walks (walking.js).
 *
 * Pixi's batch renderer draws whatever `vertexData`, `uvs` and `indices` an element hands it, so
 * the deformation lives entirely in calculateVertices. Position, scale, anchor, tint, the facing
 * flip and CombatFX all keep working, because nothing but the vertices changes; standing still
 * with no breath it is exactly a Sprite (the same four vertices). The legacy canvas renderer
 * ignores vertexData, so there a figure simply stands still.
 *
 * THE MESH. Rows from the top of the drawing to its feet, with a row exactly on every line that
 * matters: where the head ends (`breathTop`: the head is one undeformed band), where each arm
 * ends, the hinge of the legs (the hip) and where the two legs part. Each row is four cells
 * across, cut at three columns read from the drawing's own silhouette (walking.js shapeOf):
 *
 *     left edge | arm strip | body, left of the legs' gap | body, right of it | arm strip | right edge
 *
 * A column between two cells is two vertices, one per cell, so the cells can part: each leg below
 * where the legs part, each arm from the shoulder down. Where the drawing is still one piece the
 * two vertices are moved together and nothing tears. The body cells are drawn first and the arm
 * strips over them, so an arm that swings in passes in front of the body; when it swings out the
 * body's edge follows it, so the cut never shows as a crack of background. A strip also rides
 * with the hip it hangs against, and under a hand's end it eases back into the body (ARM_TAIL)
 * instead of stopping dead: a hard stop there is a seam across the hip.
 *
 *   sprite.breath = breathLevel(now, seed);   // 0..1, each frame it stands still; 0 while it walks
 *   sprite.walking = true;                    // while it moves; `walkCycleMs` sets its cadence
 *   sprite.walkSideways = true;               // going left or right (stride, arm swing); false going up or down (the feet only step)
 *
 * It also TURNS (breathing.js TURN): the renderers go on setting the sign of scale.x the moment a
 * figure's facing changes, and the sprite notices the sign change itself when it next computes
 * its vertices and plays the turn in them: each row narrows to TURN.minWidth, flips to the new
 * look there, and widens again. Nothing else has to know. A sign change found on a sprite that
 * was not being drawn (hidden, pooled, off screen) is taken as it is: there was no old look to
 * turn from.
 */
const COLS = 8;          // per row: left edge, arm cut x2, legs' gap x2, arm cut x2, right edge
const MAX_ROWS = 48;
const ROW_STEP = 0.045;  // no two rows further apart than this (of the square): the breath's chest bump is a curve
const ARM_TAIL = 0.03;   // under a hand's end the strip eases back into the body over this much of the square
const QUAD_INDICES = new Uint16Array([0, 1, 2, 0, 2, 3]);
const indexCache = new Map(); // bands -> indices
function indicesFor(bands) {
  let idx = indexCache.get(bands);
  if (idx) return idx;
  idx = new Uint16Array(bands * 24); let o = 0;
  const quad = (r, p, q) => { const a = r * COLS, n = a + COLS; idx.set([a + p, a + q, n + p, a + q, n + q, n + p], o); o += 6; };
  for (let r = 0; r < bands; r++) { quad(r, 2, 3); quad(r, 4, 5); }   // the body first
  for (let r = 0; r < bands; r++) { quad(r, 0, 1); quad(r, 6, 7); }   // the arm strips over it
  indexCache.set(bands, idx);
  return idx;
}

export default class BreathSprite extends Sprite {
  constructor(texture) {
    super(texture);
    this._breath = 0;
    this.breathTop = BREATH.top; // where this figure's head ends (the row's or the icon's breathTop)
    this._quadVerts = this.vertexData;                       // the Sprite's own 8 floats
    this._meshVerts = null; this._meshUvs = null; this._meshBands = 0; // sized to the mesh in use
    this._rows = new Float32Array(MAX_ROWS + 1);
    this._facing = 0;      // the sign of scale.x last seen (0: not drawn yet)
    this._turnT0 = 0;      // when the turn in flight began (performance.now), 0 when none
    this._turnFrom = -1;   // where it began: -1 the full old look, more when it reversed one in flight
    this._seenAt = 0;      // when the vertices were last computed
    this._walkOn = false;  // the renderer says the figure is moving
    this._walkAmp = 0;     // 0..1: the walk fading in and out
    this._walkT0 = 0;      // when this walk began (its phase runs from here)
    this._walkSeen = 0;    // when the walk was last advanced
    this._side = 1;        // 0..1: how sideways the walk is (eased toward walkSideways)
    this.walkSideways = true;
    this.walkCycleMs = WALK.cycleMs;
  }

  /** Notice a reversed facing and say how far into its turn the figure is (ms), or -1 when it is not turning. */
  _turnElapsed() {
    const now = performance.now();
    const sign = this.transform.scale.x < 0 ? -1 : 1;
    const drawnLately = now - this._seenAt < 120;
    this._seenAt = now;
    if (sign !== this._facing) {
      const first = this._facing === 0;
      // reversing a turn in flight starts from where that one had got to, seen from the other side
      const from = this._turnT0 ? -turnProgress(now - this._turnT0, this._turnFrom) : -1;
      this._facing = sign;
      if (first || !drawnLately || !breathingAllowed()) this._turnT0 = 0;
      else { this._turnT0 = now; this._turnFrom = from; }
    }
    if (!this._turnT0) return -1;
    const elapsed = now - this._turnT0;
    if (turnOver(elapsed)) { this._turnT0 = 0; this._transformID = -1; return -1; } // one more pass as a plain sprite
    return elapsed;
  }

  get breath() { return this._breath; }
  set breath(level) {
    const v = level > 0.0005 ? level : 0;
    if (v === this._breath) return;
    this._breath = v;
    this._transformID = -1; // the vertices depend on it: recompute on the next render
  }

  get walking() { return this._walkOn; }
  set walking(on) {
    const v = !!on && breathingAllowed(); // reduced motion: the figure glides as it did
    if (v === this._walkOn) return;
    this._walkOn = v;
    if (v && !this._walkAmp) { this._walkT0 = performance.now(); this._walkSeen = this._walkT0; this._side = this.walkSideways ? 1 : 0; }
    this._transformID = -1;
  }

  /** Advance the walk's fade and say where it is: { phase (cycles), amp (0..1), side (0..1) }, or null when the figure stands. */
  _walkNow() {
    if (!this._walkOn && !this._walkAmp) return null;
    const now = performance.now();
    const dt = Math.min(100, Math.max(0, now - this._walkSeen)); this._walkSeen = now;
    this._walkAmp = this._walkOn ? Math.min(1, this._walkAmp + dt / WALK.attackMs) : Math.max(0, this._walkAmp - dt / WALK.releaseMs);
    if (!this._walkAmp) { this._transformID = -1; return null; } // settled: one more pass as it stands
    if (this._walkOn) { const want = this.walkSideways ? 1 : 0; this._side += Math.max(-dt / WALK.sideMs, Math.min(dt / WALK.sideMs, want - this._side)); }
    const ease = (x) => x * x * (3 - 2 * x);
    return { phase: (now - this._walkT0) / (this.walkCycleMs || WALK.cycleMs), amp: ease(this._walkAmp), side: ease(this._side) };
  }

  calculateVertices() {
    const texture = this._texture;
    const turning = this._turnElapsed();
    const walk = this._walkNow();
    if (!this._breath && turning < 0 && !walk) {
      // a plain sprite again: hand the quad back (uvs are re-read by Sprite when _textureID differs)
      if (this.vertexData !== this._quadVerts) { this.vertexData = this._quadVerts; this.indices = QUAD_INDICES; this._textureID = -1; this._transformID = -1; }
      super.calculateVertices();
      return;
    }
    const moving = turning >= 0 || !!walk; // a turn or a walk moves every frame: never cached
    if (!moving && this.vertexData === this._meshVerts && this._transformID === this.transform._worldID && this._textureID === texture._updateID) return;
    this._transformID = moving ? -1 : this.transform._worldID;
    this._textureID = texture._updateID;

    const wt = this.transform.worldTransform, a = wt.a, b = wt.b, c = wt.c, d = wt.d, tx = wt.tx, ty = wt.ty;
    const trim = texture.trim, orig = texture.orig, anchor = this._anchor;
    // the drawn rectangle in local units (the trimmed frame inside the full square), as Sprite computes it
    const origLeft = -anchor._x * orig.width, origTop = -anchor._y * orig.height;
    const left = trim ? origLeft + trim.x : origLeft, right = left + (trim ? trim.width : orig.width);
    const top = trim ? origTop + trim.y : origTop, bottom = top + (trim ? trim.height : orig.height);
    // the breath is defined on the FULL square: its bottom edge is the feet, its centre line the body's
    const centreX = origLeft + orig.width / 2;
    const L = this._breath, headV = this.breathTop;
    const vStart = (top - origTop) / orig.height, vEnd = (bottom - origTop) / orig.height; // the drawn rows, as fractions of the square
    const headBand = headV > vStart + 0.01 && headV < vEnd - 0.01; // the head is one band, the body the other rows

    // the figure's shape (walking.js): its legs, and its arms from its shoulder line down
    const shape = shapeOf(texture);
    const legs = shape ? shape.legs : DEFAULT_LEGS;
    const arms = walk && headBand ? armsOf(shape, headV) : NO_ARMS; // arms only matter while it walks
    const hinge = Math.min(vEnd - 0.03, Math.max(legs.hinge, (headBand ? headV : vStart) + 0.05)); // where the walk begins to move the drawing
    const partV = Math.min(vEnd - 0.02, Math.max(legs.top, hinge));                                // where the two legs part (the hinge itself for shoes and hems)
    const feetV = Math.max(partV + 0.01, Math.min(legs.feet, vEnd));
    const gapX = Math.min(right - 2, Math.max(left + 2, origLeft + legs.gapU * orig.width));       // local x of the column the legs part at
    const step = walk ? walkLegs(walk.phase, walk.amp, legs, walk.side) : null;

    // the rows: every line that matters, then enough between them
    const R = this._rows; let n = 0;
    const lines = [vStart, hinge, partV, vEnd];
    if (headBand) lines.push(headV);
    for (const arm of arms) if (arm && arm.bottom > vStart && arm.bottom + ARM_TAIL < vEnd) lines.push(arm.bottom, arm.bottom + ARM_TAIL);
    lines.sort((p, q) => p - q);
    for (let i = 0; i < lines.length; i++) {
      const v = Math.min(vEnd, Math.max(vStart, lines[i]));
      if (n && v - R[n - 1] < 0.0002) continue;
      if (n) { const fill = Math.ceil((v - R[n - 1]) / ROW_STEP) - 1, from = R[n - 1]; for (let k = 1; k <= fill && n < MAX_ROWS; k++) R[n++] = from + (v - from) * (k / (fill + 1)); }
      if (n <= MAX_ROWS) R[n++] = v;
    }
    const bands = n - 1;
    if (this._meshBands !== bands) { this._meshBands = bands; this._meshVerts = new Float32Array(n * COLS * 2); this._meshUvs = new Float32Array(n * COLS * 2); }
    this.vertexData = this._meshVerts; this.uvs = this._meshUvs; this.indices = indicesFor(bands);

    const uv = texture._uvs; // x0,y0 TL  x1,y1 TR  x2,y2 BR  x3,y3 BL (a rotated frame included)
    const V = this._meshVerts, U = this._meshUvs;
    const liftMean = step ? (step.lift[0] + step.lift[1]) / 2 : 0, swingMean = step ? (step.swing[0] + step.swing[1]) / 2 : 0;
    for (let r = 0; r < n; r++) {
      const v = R[r];
      const t = (v - vStart) / (vEnd - vStart);                 // along the drawn frame, for the texture
      const [, vD] = breathDeform(0, v, L, headV);
      const w = v <= hinge ? 0 : Math.min(1, (v - hinge) / (feetV - hinge)); // how far from the hinge to the foot this row is
      const parted = legs.split && v > partV + 1e-6;                         // below where the legs part, each half has its own inner edge
      const f = turning >= 0 ? turnAt(turning, this._turnFrom, v, headV) : 1; // the turn: this row's width, about the centre line
      // the arms on this row: its cut, how far down the arm it is (0 at the shoulder .. 1 at the hand's end and
      // under it), and how much of the strip is ARM here (1 on the arm, easing to 0 under the hand's end; 0 off it)
      let cutL = left + (gapX - left) * 0.5, cutR = gapX + (right - gapX) * 0.5, wL = 0, wR = 0, armL = 0, armR = 0;
      const onArm = (arm) => (v < arm.top || v > arm.bottom + ARM_TAIL ? 0 : v <= arm.bottom ? 1 : 1 - (v - arm.bottom) / ARM_TAIL);
      if (arms[0]) { cutL = Math.min(gapX - 1, Math.max(left + 1, origLeft + armCutAt(arms[0], v) * orig.width)); armL = onArm(arms[0]); wL = Math.min(1, Math.max(0, (v - arms[0].top) / (arms[0].bottom - arms[0].top))); }
      if (arms[1]) { cutR = Math.max(gapX + 1, Math.min(right - 1, origLeft + armCutAt(arms[1], v) * orig.width)); armR = onArm(arms[1]); wR = Math.min(1, Math.max(0, (v - arms[1].top) / (arms[1].bottom - arms[1].top))); }
      // texture: the row's two ends
      const ulx = uv.x0 + (uv.x3 - uv.x0) * t, uly = uv.y0 + (uv.y3 - uv.y0) * t, urx = uv.x1 + (uv.x2 - uv.x1) * t, ury = uv.y1 + (uv.y2 - uv.y1) * t;
      for (let k = 0; k < COLS; k++) {
        const half = k < 4 ? 0 : 1;
        const isArm = (k < 2 || k > 5) ? (half ? armR : armL) : 0; // how much this vertex belongs to an arm (0: the body)
        const x0 = k === 0 ? left : k < 3 ? cutL : k < 5 ? gapX : k < 7 ? cutR : right; // where the drawing has it
        let [x] = breathDeform(x0 - centreX, v, L, headV);
        let y = origTop + vD * orig.height;
        if (step) {
          y -= step.bob * (1 - w) * orig.height; // the body bobs; a standing foot stays on the ground
          // as BODY: each side goes with its own leg. Where the drawing is still one piece (a hem; the
          // hips above where the legs part) it eases from its own leg at the flank to the mean of the
          // two at the gap, so nothing tears.
          const body = (at) => {
            if (w <= 0) return [0, 0];
            const across = parted ? 0 : (half ? (right - at) / (right - gapX) : (at - left) / (gapX - left)); // 0 at the flank .. 1 at the gap
            const own = parted ? 1 : 1 - Math.min(1, Math.max(0, across));
            return [(swingMean + (step.swing[half] - swingMean) * own + step.sway) * w * orig.width, (liftMean + (step.lift[half] - liftMean) * own) * w * orig.height];
          };
          let [bx, by] = body(x0);
          const wArm = half ? wR : wL, armF = half ? armR : armL, swingX = step.arm[half] * wArm * armF * orig.width;
          if (isArm) {
            // as ARM: the strip rides with the body it hangs against (the body's own move at the cut, so
            // no gap opens between hand and hip) and swings from the shoulder as one piece
            const [cx, cy] = body(half ? cutR : cutL);
            bx += (cx - bx) * isArm + swingX; by += (cy - by) * isArm;
          } else if ((k === 2 || k === 5) && step.arm[half] * (half ? 1 : -1) > 0) {
            bx += swingX; // the body's edge follows its arm OUT, so no hole opens between them; it stays when the arm swings in over it
          }
          x += bx; y -= by;
        }
        x = centreX + x * f;
        const o = (r * COLS + k) * 2, tu = (x0 - left) / (right - left);
        V[o] = a * x + c * y + tx; V[o + 1] = d * y + b * x + ty;
        U[o] = ulx + (urx - ulx) * tu; U[o + 1] = uly + (ury - uly) * tu;
      }
    }
  }

  // Bounds from the full, undeformed square (Sprite reads the first 8 floats of vertexData as a quad,
  // which the mesh is not): a breath of a pixel or two never matters to culling or hit areas
  _calculateBounds() {
    this.calculateTrimmedVertices();
    this._bounds.addQuad(this.vertexTrimmedData);
  }
}
