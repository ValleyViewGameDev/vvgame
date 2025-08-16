import API_BASE from '../config';
import axios from 'axios';
import { loadMasterResources } from './TuningManager';

/**
 * Fetches the Signpost Town position from a homestead grid
 * @param {string} gridId - The homestead grid ID
 * @returns {Promise<{x: number, y: number}>} The x,y coordinates of Signpost Town, or default {x: 1, y: 1}
 */
export const fetchHomesteadSignpostPosition = async (gridId) => {
  try {
    const gridResponse = await axios.get(`${API_BASE}/api/load-grid/${gridId}`);
    const gridData = gridResponse.data;
    
    if (gridData.resources && Array.isArray(gridData.resources)) {
      const signpostTown = gridData.resources.find(res => res.type === "Signpost Town");
      if (signpostTown) {
        console.log(`✅ Found Signpost Town at (${signpostTown.x}, ${signpostTown.y}) on homestead grid ${gridId}`);
        return { x: signpostTown.x, y: signpostTown.y };
      } else {
        console.log(`⚠️ Signpost Town not found on homestead grid ${gridId}, using default (1, 1)`);
      }
    }
  } catch (error) {
    console.error(`❌ Error fetching homestead grid data for grid ${gridId}:`, error);
  }
  
  // Return default position if not found or error
  return { x: 1, y: 1 };
};

/**
 * Fetches the Signpost Home position from a town grid
 * @param {string} gridId - The town grid ID
 * @returns {Promise<{x: number, y: number}>} The x,y coordinates of Signpost Home, or default {x: 0, y: 0}
 */
export const fetchTownSignpostPosition = async (gridId) => {
  try {
    const gridResponse = await axios.get(`${API_BASE}/api/load-grid/${gridId}`);
    const gridData = gridResponse.data;
    
    if (gridData.resources && Array.isArray(gridData.resources)) {
      const signpostHome = gridData.resources.find(res => res.type === "Signpost Home");
      if (signpostHome) {
        console.log(`✅ Found Signpost Home at (${signpostHome.x}, ${signpostHome.y}) on town grid ${gridId}`);
        return { x: signpostHome.x, y: signpostHome.y };
      } else {
        console.log(`⚠️ Signpost Home not found on town grid ${gridId}, using default (0, 0)`);
      }
    }
  } catch (error) {
    console.error(`❌ Error fetching town grid data for grid ${gridId}:`, error);
  }
  
  // Return default position if not found or error
  return { x: 0, y: 0 };
};
 
export const fetchHomesteadOwner = async (gridId) => {
  try {
    console.log(`Fetching homestead owner for gridId: ${gridId}`);

    // 🔹 Step 1: Fetch grid details (to get `ownerId`)
    const gridResponse = await axios.get(`${API_BASE}/api/load-grid/${gridId}`);
    const { ownerId = null, gridType = null } = gridResponse.data;

    console.log("ownerId =",ownerId);

    if (!ownerId) {
      console.log("🏡 This homestead is unoccupied.");
      return { username: null, gridType };
    }

    // 🔹 Step 2: Fetch player document using `ownerId`
    const playerResponse = await axios.get(`${API_BASE}/api/player/${ownerId._id}`);
    const { username = null } = playerResponse.data;
 
    if (username) {
      console.log(`🏡 Homestead belongs to: ${username}`);
      return { username, gridType };
    } else {
      console.warn("🚨 Owner's player document not found!");
      return { username: null, gridType };
    }

  } catch (error) {
    console.error('❌ Error fetching homestead owner:', error);
    return { username: null, gridType: null }; // Return defaults in case of an error
  }
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