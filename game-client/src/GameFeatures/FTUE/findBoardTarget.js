import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import NPCsInGridManager from '../../GridState/GridStateNPCs';

// The tile of a named thing on the current board: a resource (by type) first, else an NPC.
// Returns { x, y, size } in tiles, or null. Shared by the doinker, the scrim and cutscenes.
export function findBoardTarget(targetName, gridId) {
  const resources = GlobalGridStateTilesAndResources.getResources();
  const res = resources?.find((r) => r && r.type === targetName);
  if (res) return { x: res.x, y: res.y, size: res.size || 1 };
  if (gridId) {
    const npcs = NPCsInGridManager.getNPCsInGrid(gridId);
    const npc = npcs && Object.values(npcs).find((n) => n.type === targetName);
    if (npc && npc.position) return { x: npc.position.x, y: npc.position.y, size: 1 };
  }
  return null;
}
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') window.__boardTarget = findBoardTarget; // dev hook
