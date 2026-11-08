import { hopeArtifacts } from './hopeArtifacts';

/**
 * A one-of-a-kind gain is never multiplied by the relationship buff (owner 2026-11-07: Portia's
 * Pardon paid out five at marriage). One of a kind = a resource row flagged `unique` (the
 * Secrets, the story keys, Portia's Pardon, Yorick's Skull...), a Quest for Hope artifact, a
 * skill, a power or a worker. Gems and Hearts share the 'special' category but are currencies,
 * hence the explicit flag. Server twin: game-server/utils/playerEconomy.js isOneOfAKind.
 */
export function isOneOfAKind(type, masterResources, masterTraders) {
  if (!type) return false;
  const def = (masterResources || []).find((r) => r.type === type);
  if (def?.unique === true) return true;
  if (['skill', 'power', 'npc'].includes(def?.category)) return true;
  return hopeArtifacts(masterTraders).has(type);
}
