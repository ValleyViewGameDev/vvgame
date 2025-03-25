import API_BASE from '../config';
import axios from 'axios';
import { loadMasterResources } from './TuningManager';

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
    const resourceType = newResource.newResource || newResource.type;
    if (!resourceType) {
      console.error('Invalid resource payload:', newResource);
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


