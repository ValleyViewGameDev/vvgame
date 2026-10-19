/**
 * The Quest for Hope artifacts: whatever the Oracle's Hope trade asks for (traders.json,
 * requires1..7), so the list follows the data. Mirrors game-server/utils/hopeArtifacts.js. They are
 * never sold or requested at the Trading Post (owner, 2026-10-19).
 */
export function hopeArtifacts(masterTraders) {
  const oracle = (masterTraders || []).find((t) => t.gives === 'Hope');
  return new Set([1, 2, 3, 4, 5, 6, 7].map((i) => oracle?.[`requires${i}`]).filter(Boolean));
}
