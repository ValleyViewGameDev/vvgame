import { Sprite } from 'pixi.js-legacy';
import { BREATH, breathDeform, breathingAllowed, turnAt, turnProgress, turnOver } from './breathing';
import { WALK, DEFAULT_LEGS, legsOf, walkLegs } from './walking';

/**
 * BreathSprite - a Sprite whose quad becomes a mesh of rows while it breathes (breathing.js),
 * turns (breathing.js TURN) or walks (walking.js).
 *
 * Pixi's batch renderer draws whatever `vertexData`, `uvs` and `indices` an element hands it, so
 * the deformation lives entirely in calculateVertices: each row of the mesh goes where
 * breathDeform sends it (the body stretched up from the feet and widened at the chest; the head,
 * everything above `breathTop`, carried up rigid). One row sits exactly on breathTop, so the
 * head is a single undeformed band; another sits at the hinge of the legs (the hip) and another
 * where the two legs part. Every row is two cells, left and right of the column the legs part at
 * (walking.js legsOf, read from the drawing's own silhouette): down to where they part the two
 * cells share that edge, below it each leg has its own, so a walking figure's legs swing from the
 * hip and its feet lift one at a time. Position, scale, anchor, tint, the facing flip and CombatFX all keep working,
 * because nothing but the vertices changes; with `breath` at 0 it is exactly a Sprite (same four
 * vertices). The legacy canvas renderer ignores vertexData, so there a figure simply stands still.
 *
 *   sprite.breath = breathLevel(now, seed);   // 0..1, each frame it stands still; 0 while it walks
 *
 * It also TURNS (breathing.js TURN): the renderers go on setting the sign of scale.x the moment a
 * figure's facing changes, and the sprite notices the sign change itself when it next computes
 * its vertices and plays the turn in them: each row narrows to TURN.minWidth, flips to the new
 * look there, and widens again. Nothing else has to know. A sign change found on a sprite that was not
 * being drawn (hidden, pooled, off screen) is taken as it is: there was no old look to turn from.
 *
 *   sprite.walking = true;                    // while it moves; `walkCycleMs` sets its cadence
 */
const ROWS = 16;      // 1 head band + the body rows + LEG_ROWS
const LEG_ROWS = 4;   // below the hinge: one band down to where the legs part, then three down to the feet
const COLS = 4;       // per row: left edge, the parting column twice (one per half), right edge
const GRID_INDICES = (() => {
  const idx = new Uint16Array(ROWS * 12);
  for (let r = 0; r < ROWS; r++) {
    const a = r * COLS, n = a + COLS; // this row, the next one
    idx.set([a, a + 1, n, a + 1, n + 1, n, a + 2, a + 3, n + 2, a + 3, n + 3, n + 2], r * 12);
  }
  return idx;
})();
const QUAD_INDICES = new Uint16Array([0, 1, 2, 0, 2, 3]);

export default class BreathSprite extends Sprite {
  constructor(texture) {
    super(texture);
    this._breath = 0;
    this.breathTop = BREATH.top; // where this figure's head ends (the row's or the icon's breathTop)
    this._quadVerts = this.vertexData;                       // the Sprite's own 8 floats
    this._gridVerts = new Float32Array((ROWS + 1) * COLS * 2);
    this._gridUvs = new Float32Array((ROWS + 1) * COLS * 2);
    this._walkOn = false;  // the renderer says the figure is moving
    this._walkAmp = 0;     // 0..1: the walk fading in and out
    this._walkT0 = 0;      // when this walk began (its phase runs from here)
    this._walkSeen = 0;    // when the walk was last advanced
    this.walkCycleMs = WALK.cycleMs;
    this._facing = 0;      // the sign of scale.x last seen (0: not drawn yet)
    this._turnT0 = 0;      // when the turn in flight began (performance.now), 0 when none
    this._turnFrom = -1;   // where it began: -1 the full old look, more when it reversed one in flight
    this._seenAt = 0;      // when the vertices were last computed
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
    if (v && !this._walkAmp) { this._walkT0 = performance.now(); this._walkSeen = this._walkT0; }
    this._transformID = -1;
  }

  /** Advance the walk's fade and say where it is: { phase (cycles), amp (0..1) }, or null when the figure stands. */
  _walkNow() {
    if (!this._walkOn && !this._walkAmp) return null;
    const now = performance.now();
    const dt = Math.min(100, Math.max(0, now - this._walkSeen)); this._walkSeen = now;
    this._walkAmp = this._walkOn ? Math.min(1, this._walkAmp + dt / WALK.attackMs) : Math.max(0, this._walkAmp - dt / WALK.releaseMs);
    if (!this._walkAmp) { this._transformID = -1; return null; } // settled: one more pass as it stands
    const amp = this._walkAmp * this._walkAmp * (3 - 2 * this._walkAmp); // eased
    return { phase: (now - this._walkT0) / (this.walkCycleMs || WALK.cycleMs), amp };
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
    if (!moving && this.vertexData === this._gridVerts && this._transformID === this.transform._worldID && this._textureID === texture._updateID) return;
    this._transformID = moving ? -1 : this.transform._worldID;
    this._textureID = texture._updateID;
    this.vertexData = this._gridVerts; this.indices = GRID_INDICES; this.uvs = this._gridUvs;

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
    // the legs (walking.js): where they begin, the column they part at, and where each half is in its walk
    const legs = legsOf(texture) || DEFAULT_LEGS;
    const hinge = Math.min(vEnd - 0.03, Math.max(legs.hinge, (headBand ? headV : vStart) + 0.05)); // where the walk begins to move the drawing
    const partV = Math.min(vEnd - 0.02, Math.max(legs.top, hinge));                                // where the two legs part (the hinge itself for shoes and hems)
    const feetV = Math.max(partV + 0.01, Math.min(legs.feet, vEnd));
    const gapX = Math.min(right - 1, Math.max(left + 1, origLeft + legs.gapU * orig.width)); // local x of the parting column
    const tGap = (gapX - left) / (right - left);                                             // ... and along the drawn frame, for the texture
    const step = walk ? walkLegs(walk.phase, walk.amp, legs) : null;
    const bodyRows = ROWS - LEG_ROWS - (headBand ? 1 : 0), bodyFrom = headBand ? headV : vStart, firstBody = headBand ? 1 : 0;
    const uv = texture._uvs; // x0,y0 TL  x1,y1 TR  x2,y2 BR  x3,y3 BL (a rotated frame included)
    const V = this._gridVerts, U = this._gridUvs;
    for (let r = 0; r <= ROWS; r++) {
      // the rows: the top of the frame, the head's end, the body down to the legs, the legs down to the feet
      let v;
      if (headBand && r === 0) v = vStart;
      else if (r - firstBody <= bodyRows) v = bodyFrom + (hinge - bodyFrom) * ((r - firstBody) / bodyRows);
      else if (r - firstBody === bodyRows + 1) v = partV;
      else v = partV + (vEnd - partV) * ((r - firstBody - bodyRows - 1) / (LEG_ROWS - 1));
      const t = (v - vStart) / (vEnd - vStart);                 // along the drawn frame, for the texture
      const [, vD] = breathDeform(0, v, L, headV);
      const w = v <= hinge ? 0 : Math.min(1, (v - hinge) / (feetV - hinge)); // how far from the hinge to the foot this row is
      const parted = legs.split && v > partV + 1e-6;                         // below where the legs part, each half has its own inner edge
      const f = turning >= 0 ? turnAt(turning, this._turnFrom, v, headV) : 1;   // the turn: this row's width, about the centre line
      // texture: the row's two ends, and the parting column between them
      const ulx = uv.x0 + (uv.x3 - uv.x0) * t, uly = uv.y0 + (uv.y3 - uv.y0) * t, urx = uv.x1 + (uv.x2 - uv.x1) * t, ury = uv.y1 + (uv.y2 - uv.y1) * t;
      const umx = ulx + (urx - ulx) * tGap, umy = uly + (ury - uly) * tGap;
      for (let k = 0; k < COLS; k++) {
        const half = k < 2 ? 0 : 1, inner = k === 1 || k === 2;
        let [x] = breathDeform((k === 0 ? left : k === 3 ? right : gapX) - centreX, v, L, headV);
        let y = origTop + vD * orig.height;
        if (step) {
          y -= step.bob * (1 - w) * orig.height; // the body bobs; a standing foot stays on the ground
          if (w > 0) {
            // each side goes with its own leg. Where the drawing is still one piece (a hem; the hips
            // above where the legs part) its middle takes the mean of the two, so nothing tears.
            const own = parted || !inner;
            const lift = own ? step.lift[half] : (step.lift[0] + step.lift[1]) / 2;
            const swing = own ? step.swing[half] : (step.swing[0] + step.swing[1]) / 2;
            y -= lift * w * orig.height;
            x += (swing + step.sway) * w * orig.width;
          }
        }
        x = centreX + x * f;
        const o = (r * COLS + k) * 2;
        V[o] = a * x + c * y + tx; V[o + 1] = d * y + b * x + ty;
        U[o] = k === 0 ? ulx : k === 3 ? urx : umx; U[o + 1] = k === 0 ? uly : k === 3 ? ury : umy;
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
