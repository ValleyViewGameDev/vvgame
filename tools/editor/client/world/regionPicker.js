// The World tab's region pickers (grid view and tile view, single grid and "Region for all").
// "All regions" lists every region in resources.json; "Unused regions" (owner, 2026-10-12) lists
// only the regions no grid of the frontier carries yet, alphabetically. Both set the same pick,
// so the section's one Save button applies whichever was chosen last.
import { el } from '../core/dom.js';

/** Regions (resources.json rows) that no grid in `gridMap` carries, sorted by name. */
export function unusedRegions(regions, gridMap) {
  const used = new Set([...(gridMap?.values() || [])].map((g) => g.region).filter(Boolean));
  return (regions || []).filter((r) => !used.has(r.type)).sort((a, b) => a.type.localeCompare(b.type));
}

const label = (r) => `${r.symbol || ''} ${r.type}`.trim();

/** The "All regions" dropdown (the existing one). */
export function allRegionsSelect(regions, pick, onPick) {
  return el('select', { onchange: (e) => onPick(e.target.value) }, [
    el('option', { value: '', selected: !pick }, '(none)'),
    ...(regions || []).map((r) => el('option', { value: r.type, selected: pick === r.type }, label(r))),
  ]);
}

/** The "Unused regions" dropdown: a placeholder until one is chosen, then that region. */
export function unusedRegionsSelect(regions, gridMap, pick, onPick) {
  const unused = unusedRegions(regions, gridMap);
  const shown = unused.some((r) => r.type === pick) ? pick : '';
  return el('select', { title: 'Regions not yet used on any grid', onchange: (e) => { if (e.target.value) onPick(e.target.value); } }, [
    el('option', { value: '', selected: !shown }, unused.length ? `Unused regions (${unused.length})` : 'No unused regions'),
    ...unused.map((r) => el('option', { value: r.type, selected: shown === r.type }, label(r))),
  ]);
}
