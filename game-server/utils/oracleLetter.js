/**
 * The Oracle's letter for a Quest for Hope find (owner, 2026-11-06). Elders collect the seven
 * artifacts in any order, so the letter is composed from what the player holds, not chained:
 *
 *   <this artifact's `oracleFound`> <how many remain> <the `oracleSeek` of the next one>
 *   or, when all seven are held: <oracleFound> <ALL_FOUND>
 *
 * "The next one" is the unfound artifact whose Constable Elbow "Find" quest opens earliest
 * (quests/questsEN.json level), so the hint follows the order the game is tuned for. The text
 * pieces live on the messages.json rows with `hopeArtifact` (editor: Mailbox templates sheet);
 * a row without `oracleFound` falls back to its static `body`.
 */
const REMAIN = ['', 'One treasure remains.', 'Two treasures remain.', 'Three treasures remain.',
  'Four treasures remain.', 'Five treasures remain.', 'Six treasures remain.'];
const ALL_FOUND = 'All that was lost is found. Bring the seven treasures to me on Hope Mountain, and Hope shall be thine.';

/** Artifacts in the order their Elbow quests open (artifacts with no such quest go last). */
function hintOrder(artifacts, quests) {
  const levelOf = new Map();
  for (const q of quests || []) {
    if (q.giver !== 'Constable Elbow' || q.goal1action !== 'Find' || !artifacts.includes(q.goal1item)) continue;
    levelOf.set(q.goal1item, Math.min(levelOf.get(q.goal1item) ?? Infinity, Number(q.level) || 0));
  }
  return [...artifacts].sort((a, b) => (levelOf.get(a) ?? Infinity) - (levelOf.get(b) ?? Infinity));
}

/**
 * The composed body for `artifact`, given everything the player has found (it included), or null
 * to use the template's static body.
 */
function composeOracleLetter(artifact, found, { artifacts, templates, quests }) {
  const row = templates.find((m) => m.hopeArtifact === artifact);
  if (!row?.oracleFound) return null;
  const remaining = hintOrder(artifacts, quests).filter((a) => !found.includes(a));
  if (remaining.length === 0) return `${row.oracleFound} ${ALL_FOUND}`;
  const next = templates.find((m) => m.hopeArtifact === remaining[0]);
  return [row.oracleFound, REMAIN[remaining.length] || '', next?.oracleSeek || ''].filter(Boolean).join(' ');
}

module.exports = { composeOracleLetter, hintOrder };
