import API_BASE from '../config';
import axios from 'axios';

let masterSkills = null;
let masterResources = null;

/**
 * Fetch and cache skillsTuning.json
 */
export async function loadMasterSkills() {
  if (!masterSkills) {
    try {
      const response = await axios.get(`${API_BASE}/api/skills-tuning`);
      masterSkills = response.data;
//      console.log('Skills tuning loaded:', masterSkills);
    } catch (error) {
      console.error('Error fetching master skills:', error);
      masterSkills = {};
    }
  }
  return masterSkills;
}

/**
 * Fetch and cache resources.json
 */
export async function loadMasterResources() {
  if (!masterResources) {
    try {
      const response = await axios.get(`${API_BASE}/api/resources`);
      masterResources = response.data;
console.log('Master resources loaded:', masterResources);
    } catch (error) {
      console.error('Error fetching master resources:', error);
      masterResources = [];
    }
  }
console.log('Master resources available and being returned');
  return masterResources;
}

/**
 * Clear cached data (optional, for debugging or forced reloads).
 */
export function clearTuningCache() {
  masterSkills = null;
  masterResources = null;
}
