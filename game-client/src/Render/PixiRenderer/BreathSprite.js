import { Sprite } from 'pixi.js-legacy';
import { BREATH, breathDeform } from './breathing';

/**
 * BreathSprite - a Sprite whose quad becomes a strip of rows while it breathes (breathing.js).
 *
 * Pixi's batch renderer draws whatever `vertexData`, `uvs` and `indices` an element hands it, so
 * the deformation lives entirely in calculateVertices: each row of the strip goes where
 * breathDeform sends it (the body stretched up from the feet and widened at the chest; the head,
 * everything above `breathTop`, carried up rigid). One row sits exactly on breathTop, so the
 * head is a single undeformed band. Position, scale, anchor, tint, the facing flip and CombatFX all keep working,
 * because nothing but the vertices changes; with `breath` at 0 it is exactly a Sprite (same four
 * vertices). The legacy canvas renderer ignores vertexData, so there a figure simply stands still.
 *
 *   sprite.breath = breathLevel(now, seed);   // 0..1, each frame it stands still; 0 while it walks
 */
const ROWS = 16;
const GRID_INDICES = (() => {
  const idx = new Uint16Array(ROWS * 6);
  for (let r = 0; r < ROWS; r++) { const a = r * 2, b = a + 1, c = a + 2, d = a + 3; idx.set([a, b, c, b, d, c], r * 6); }
  return idx;
})();
const QUAD_INDICES = new Uint16Array([0, 1, 2, 0, 2, 3]);

export default class BreathSprite extends Sprite {
  constructor(texture) {
    super(texture);
    this._breath = 0;
    this.breathTop = BREATH.top; // where this figure's head ends (the row's or the icon's breathTop)
    this._quadVerts = this.vertexData;                       // the Sprite's own 8 floats
    this._gridVerts = new Float32Array((ROWS + 1) * 4);
    this._gridUvs = new Float32Array((ROWS + 1) * 4);
  }

  get breath() { return this._breath; }
  set breath(level) {
    const v = level > 0.0005 ? level : 0;
    if (v === this._breath) return;
    this._breath = v;
    this._transformID = -1; // the vertices depend on it: recompute on the next render
  }

  calculateVertices() {
    const texture = this._texture;
    if (!this._breath) {
      // a plain sprite again: hand the quad back (uvs are re-read by Sprite when _textureID differs)
      if (this.vertexData !== this._quadVerts) { this.vertexData = this._quadVerts; this.indices = QUAD_INDICES; this._textureID = -1; this._transformID = -1; }
      super.calculateVertices();
      return;
    }
    if (this.vertexData === this._gridVerts && this._transformID === this.transform._worldID && this._textureID === texture._updateID) return;
    this._transformID = this.transform._worldID;
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
    const uv = texture._uvs; // x0,y0 TL  x1,y1 TR  x2,y2 BR  x3,y3 BL (a rotated frame included)
    const V = this._gridVerts, U = this._gridUvs;
    for (let r = 0; r <= ROWS; r++) {
      const v = !headBand ? vStart + (vEnd - vStart) * (r / ROWS) : (r === 0 ? vStart : headV + (vEnd - headV) * ((r - 1) / (ROWS - 1)));
      const t = (v - vStart) / (vEnd - vStart);                 // along the drawn frame, for the texture
      const [, vD] = breathDeform(0, v, L, headV);
      const yD = origTop + vD * orig.height;
      const [xl] = breathDeform(left - centreX, v, L, headV), [xr] = breathDeform(right - centreX, v, L, headV);
      const o = r * 4;
      V[o] = a * (centreX + xl) + c * yD + tx; V[o + 1] = d * yD + b * (centreX + xl) + ty;
      V[o + 2] = a * (centreX + xr) + c * yD + tx; V[o + 3] = d * yD + b * (centreX + xr) + ty;
      U[o] = uv.x0 + (uv.x3 - uv.x0) * t; U[o + 1] = uv.y0 + (uv.y3 - uv.y0) * t;
      U[o + 2] = uv.x1 + (uv.x2 - uv.x1) * t; U[o + 3] = uv.y1 + (uv.y2 - uv.y1) * t;
    }
  }

  // Bounds from the full, undeformed square (Sprite reads the first 8 floats of vertexData as a quad,
  // which the strip is not): a breath of a pixel or two never matters to culling or hit areas
  _calculateBounds() {
    this.calculateTrimmedVertices();
    this._bounds.addQuad(this.vertexTrimmedData);
  }
}
