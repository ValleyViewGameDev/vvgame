/**
 * Cosmetic art variants for one resource (owner, 2026-10-23: the oak's autumn canopies).
 *
 * A resource row may carry `artVariants`, a string of `file=weight` pairs separated by
 * semicolons, e.g. "oak-tree.svg=2;oak-tree-autumn-gold.svg=1;oak-tree-autumn-red.svg=1".
 * The board picks one file per cell, weighted, from a hash of the cell and the type, so a
 * given tree keeps its look across re-renders, grid reloads and sessions, and a field of
 * them mixes in the stated proportions. Everything else (the panels' buttons, the cursor,
 * the atlas lookup by name) keeps using `filename`; the atlas script packs every variant.
 */
export function parseArtVariants(str) {
  if (!str || typeof str !== 'string') return null;
  const out = [];
  for (const part of str.split(';')) {
    const [file, w] = part.split('=').map((s) => s.trim());
    if (!file) continue;
    const weight = Number(w);
    out.push({ file, weight: Number.isFinite(weight) && weight > 0 ? weight : 1 });
  }
  return out.length ? out : null;
}

/** A stable 0..1 number for a cell and a type (a small integer hash, no Math.random). */
function unit(x, y, type) {
  let h = 2166136261;
  const s = `${type}:${x}:${y}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10007) / 10007;
}

/** The file to draw for this resource at this cell: a weighted pick among its variants, or its filename. */
export function pickArtFile(master, x, y) {
  if (!master) return null;
  const variants = parseArtVariants(master.artVariants);
  if (!variants) return master.filename || null;
  const total = variants.reduce((a, v) => a + v.weight, 0);
  let r = unit(x, y, master.type) * total;
  for (const v of variants) { r -= v.weight; if (r < 0) return v.file; }
  return variants[variants.length - 1].file;
}
