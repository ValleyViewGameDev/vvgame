import API_BASE from '../config';
import axios from 'axios';

let masterSkills = null;
let masterResources = null;
let globalTuning = null;
let masterInteractions = null;
let masterTraders = null;
let masterTrophies = null;
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
      console.error('Error fetching global tuning:', error);
      globalTuning = {};
    }
  }
  return globalTuning;
}

/**
 * Fetch and cache interactions.json
 */
export async function loadMasterInteractions() {
  if (!masterInteractions) {
    try {
      const response = await axios.get(`${API_BASE}/api/interactions`);
      masterInteractions = response.data;
      console.log('Master interactions loaded:', masterInteractions);
    } catch (error) {
      console.error('Error fetching master interactions:', error);
      masterInteractions = [];
    }
  }
  return masterInteractions;
}

/**
 * Fetch and cache traders.json
 */
export async function loadMasterTraders() {
  if (!masterTraders) {
    try {
      const response = await axios.get(`${API_BASE}/api/traders`);
      masterTraders = response.data;
      console.log('Master traders loaded:', masterTraders);
    } catch (error) {
      console.error('Error fetching master traders:', error);
      masterTraders = [];
    }
  }
  return masterTraders;
}

/**
 * Fetch and cache trophies.json
 */
export async function loadMasterTrophies() {
  if (!masterTrophies) {
    try {
      const response = await axios.get(`${API_BASE}/api/trophies`);
      masterTrophies = response.data;
      console.log('Master trophies loaded:', masterTrophies);
    } catch (error) {
      console.error('Error fetching master trophies:', error);
      masterTrophies = [];
    }
  }
  return masterTrophies;
}

/**
 * Clear cached data (optional, for debugging or forced reloads).
 */
export function clearTuningCache() {
  masterSkills = null;
  masterResources = null;
  masterTraders = null;
  masterTrophies = null;
}
