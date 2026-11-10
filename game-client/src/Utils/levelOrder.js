/**
 * Level order for every shop / training / build list (owner 2026-11-10): offers are listed by the
 * level that unlocks them, lowest first; no level counts as level 1. The sort is stable, so offers
 * of the same level keep the order the data gives them.
 */
export const levelOf = (row) => Number(row?.level) || 1;
export const byLevel = (a, b) => levelOf(a) - levelOf(b);
export const sortByLevel = (rows) => [...(rows || [])].sort(byLevel);
