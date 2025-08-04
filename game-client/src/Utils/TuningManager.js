import API_BASE from '../config';
import axios from 'axios';

let masterSkills = null;
let masterResources = null;
let globalTuning = null;
let masterInteractions = null;
/**
 * Fetch and cache skillsTuning.json
 */
export async function loadMasterSkills() {
  if (!masterSkills) {
    try {
      const response = await axios.get(`${API_BASE}/api/skills-tuning`);
      masterSkills = response.data;
      console.log('Skills tuning loaded:', masterSkills);
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
  return masterResources;
}


/**
 * Fetch and cache globalTuning.json
 */
export async function loadGlobalTuning() {
  if (!globalTuning) {
    try {
      const response = await axios.get(`${API_BASE}/api/global-tuning`);
      globalTuning = response.data;
      console.log('Global tuning loaded:', globalTuning);
    } catch (error) {
      console.error('Error fetching master resources:', error);
      globalTuning = [];
    }
  }
  return globalTuning;
}

/**
 * Fetch and cache globalTuning.json
 */
export async function loadMasterInteractions() {
  if (!masterInteractions) {
    try {
      const response = await axios.get(`${API_BASE}/api/interactions`);
      masterInteractions = response.data;
      console.log('Master intearctions loaded:', masterInteractions);
    } catch (error) {
      console.error('Error fetching master resources:', error);
      masterInteractions = [];
    }
  }
  return masterInteractions;
}

/**
 * Clear cached data (optional, for debugging or forced reloads).
 */
export function clearTuningCache() {
  masterSkills = null;
  masterResources = null;
}
