/**
 * GridCanvas: draws a 64x64 layout grid on one <canvas> (rulers, tile colours, resource
 * symbols, multi-tile footprints anchored bottom-left like the game, selection, brush hover)
 * and turns pointer events into cell callbacks.
 *
 *   const cv = new GridCanvas(container, { idx, tileColors, onCellClick(row, col, ev), onHover(row, col|null) })
 *   cv.setState({ grid, selected, tileSize, brush: { size, shape }, hover })
 */
import { GRID_SIZE, isBlank, brushTiles } from './GridModel.js';

export class GridCanvas {
  constructor(container, { idx, tileColors, onCellClick, onHover }) {
    this.idx = idx;
    this.tileColors = tileColors;
    this.onCellClick = onCellClick;
    this.onHover = onHover;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'grid-canvas';
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.state = { grid: null, selected: null, tileSize: 20, brush: { size: 1, shape: 'square' }, hover: null };
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.addEventListener('click', (e) => { const c = this.cellAt(e); if (c) this.onCellClick?.(c.row, c.col, e); });
    this.canvas.addEventListener('mousemove', (e) => {
      const c = this.cellAt(e);
      const h = this.state.hover;
      if ((c?.row) !== (h?.row) || (c?.col) !== (h?.col)) { this.state.hover = c; this.onHover?.(c); this.draw(); }
    });
    this.canvas.addEventListener('mouseleave', () => { this.state.hover = null; this.onHover?.(null); this.draw(); });
  }

  get ruler() { return this.state.tileSize; }

  cellAt(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - this.ruler, y = e.clientY - rect.top - this.ruler;
    const col = Math.floor(x / this.state.tileSize), row = Math.floor(y / this.state.tileSize);
    if (row < 0 || col < 0 || row >= GRID_SIZE || col >= GRID_SIZE) return null;
    return { row, col };
  }

  setState(patch) {
    Object.assign(this.state, patch);
    this.draw();
  }

  draw() {
    const { grid, tileSize: ts, selected, hover, brush } = this.state;
    if (!grid) return;
    const px = GRID_SIZE * ts + 2 * ts;
    if (this.canvas.width !== px * this.dpr) {
      this.canvas.width = px * this.dpr; this.canvas.height = px * this.dpr;
      this.canvas.style.width = `${px}px`; this.canvas.style.height = `${px}px`;
    }
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, px, px);
    const o = ts; // ruler offset

    // rulers
    ctx.fillStyle = '#6b7266';
    ctx.font = `${Math.max(8, Math.min(11, ts * 0.5))}px ui-monospace, Menlo, monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < GRID_SIZE; i++) {
      ctx.fillText(String(i), o + i * ts + ts / 2, o / 2);
      ctx.fillText(String(i), o + i * ts + ts / 2, o + GRID_SIZE * ts + o / 2);
      ctx.fillText(String(i), o / 2, o + i * ts + ts / 2);
      ctx.fillText(String(i), o + GRID_SIZE * ts + o / 2, o + i * ts + ts / 2);
    }

    // tiles
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const cell = grid[r][c];
        const tile = isBlank(cell.type) ? null : this.idx.tileByLayoutKey.get(cell.type);
        ctx.fillStyle = tile ? (this.tileColors[tile.type] || '#ff0000') : (isBlank(cell.type) ? '#ffffff' : '#ff0000');
        ctx.fillRect(o + c * ts, o + r * ts, ts, ts);
      }
    }
    // grid lines
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= GRID_SIZE; i++) {
      ctx.moveTo(o + i * ts + 0.5, o); ctx.lineTo(o + i * ts + 0.5, o + GRID_SIZE * ts);
      ctx.moveTo(o, o + i * ts + 0.5); ctx.lineTo(o + GRID_SIZE * ts, o + i * ts + 0.5);
    }
    ctx.stroke();

    // single-tile symbols, then multi-tile footprints on top
    const big = [];
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const cell = grid[r][c];
        if (!cell.resource) continue;
        const res = this.idx.byType.get(cell.resource);
        if (!res) continue;
        const size = res.size > 1 && res.category !== 'npc' ? res.size : 1;
        if (size > 1) { big.push({ r, c, res, size }); continue; }
        ctx.font = `${ts * 0.65}px sans-serif`;
        ctx.fillStyle = '#000';
        ctx.fillText(symbolOf(res), o + c * ts + ts / 2, o + r * ts + ts / 2 + 1);
      }
    }
    for (const { r, c, res, size } of big) {
      const w = ts * size;
      const left = o + c * ts, bottom = o + (r + 1) * ts; // anchored bottom-left of the anchor cell
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(left, bottom - w, w, w);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.strokeRect(left + 0.5, bottom - w + 0.5, w - 1, w - 1);
      ctx.font = `${ts * 0.85 * size}px sans-serif`;
      ctx.fillStyle = '#000';
      ctx.fillText(symbolOf(res), left + w / 2, bottom - w / 2 + 1);
    }

    // brush hover
    if (hover && brush) {
      ctx.fillStyle = 'rgba(63,138,47,0.25)';
      for (const { row, col } of brushTiles(hover.row, hover.col, brush.size, brush.shape === 'scatter' ? 'circle' : brush.shape)) {
        ctx.fillRect(o + col * ts, o + row * ts, ts, ts);
      }
    }
    // selection
    if (selected) {
      ctx.strokeStyle = '#e3342f'; ctx.lineWidth = 3;
      ctx.strokeRect(o + selected.col * ts + 1.5, o + selected.row * ts + 1.5, ts - 3, ts - 3);
    }
  }
}

function symbolOf(res) {
  if (res.symbol) return res.symbol;
  return (res.type || '?').slice(0, 2);
}
