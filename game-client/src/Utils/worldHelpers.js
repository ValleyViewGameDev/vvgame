import { loadMasterResources } from './TuningManager';
import GlobalGridStateTilesAndResources from '../GridState/GlobalGridStateTilesAndResources';

/**
 * Owner + type of the LOADED grid, from the enter-grid meta (no HTTP). Other
 * players' homesteads can no longer be entered, so for a homestead the owner is
 * always the player themselves; `username` is null for towns/valleys/dungeons.
 */
export const fetchHomesteadOwner = async (gridId) => {
  const meta = GlobalGridStateTilesAndResources.getGridMeta();
  if (!meta || (gridId && meta.gridId !== String(gridId))) {
    console.warn(`fetchHomesteadOwner: ${gridId} is not the loaded grid`);
    return { username: null, gridType: null };
  }
  const username = meta.gridType === 'homestead' ? (meta.ownerUsername || null) : null;
  return { username, gridType: meta.gridType };
};

export const addResourceToGrid = async (resources, newResource) => {
  try {
    const masterResources = await loadMasterResources();
    console.log('masterResources:', masterResources);
    console.log('current resources:', resources);
    console.log('newResource:', newResource);

    if (!Array.isArray(masterResources)) {
      console.error('Failed to load masterResources or incorrect format:', masterResources);
      return resources;
    }

    // Extract `type` from `newResource` payload
    const resourceType = newResource?.type || newResource?.newResource;
    if (!resourceType) {
      console.error('[addResourceToGrid] Invalid resource payload:', newResource);
      return resources;
    }

    // Find the resource template to get the symbol
    const resourceTemplate = masterResources.find((template) => template.type === resourceType);

    // Enrich only with the basics
    const enrichedResource = {
      ...resourceTemplate, // Use the full template from masterResources
      type: resourceType, // Keep type
      x: newResource.x,   // Keep x
      y: newResource.y,   // Keep y
      growEnd: newResource.growEnd, // Keep growEnd
    };

    console.log('Enriched resource:', enrichedResource);

    // Ensure no duplicates exist at the same x, y position
    return [
      ...resources.filter((res) => !(res.x === newResource.x && res.y === newResource.y)),
      enrichedResource, // Add the enriched resource
    ];
  } catch (error) {
    console.error('Error enriching resource:', error);
    return resources; // Return unmodified resources on error
  }
};


// Inline function to calculate Euclidean distance safely
export const calculateDistance = (pos1, pos2) => {
  if (!pos1 || !pos2 || typeof pos1.x === 'undefined' || typeof pos1.y === 'undefined' || typeof pos2.x === 'undefined' || typeof pos2.y === 'undefined') {
    console.warn("Skipping distance calculation due to invalid position:", { pos1, pos2 });
    return Infinity;
  }
  return Math.sqrt(Math.pow(pos1.x - pos2.x, 2) + Math.pow(pos1.y - pos2.y, 2));
};


// Calculates the derived range based on base range + bonus from skill metadata
export const getDerivedRange = (currentPlayer, masterResources) => {
  if (!currentPlayer || !Array.isArray(masterResources)) return 1;

  const baseRange = currentPlayer.range || 1;

  const bonusRangeFromSkills = currentPlayer.skills?.reduce((sum, skill) => {
    const master = masterResources.find(r => r.type === skill.type);
    if (master?.output === 'range' && typeof master.qtycollected === 'number') {
      return sum + master.qtycollected;
    }
    return sum;
  }, 0) || 0;

  const gridType = currentPlayer?.location?.gtype;
  const totalRange = gridType === 'homestead'
    ? baseRange + bonusRangeFromSkills + 5
    : baseRange + bonusRangeFromSkills;

  return totalRange;
};