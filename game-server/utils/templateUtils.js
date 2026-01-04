const fs = require('fs');
const path = require('path');

// ============================================================
// KNOWN TILE TYPES
// These single-character keys represent tile types in the game.
// Used to parse tile distribution from randomValleyGridLayouts.json
// ============================================================
const TILE_TYPE_KEYS = ['g', 's', 'd', 'w', 'p', 'l', 'n', 'o', 'x', 'y', 'z', 'c', 'v', 'u'];

// Cache for the valley layouts JSON (loaded once on first use)
let valleyLayoutsCache = null;

/**
 * Loads the unified valley grid layouts JSON file.
 * Uses caching to avoid re-reading the file on every call.
 * @returns {Array} Array of valley layout objects
 */
function loadValleyLayouts() {
  if (valleyLayoutsCache === null) {
    const layoutsPath = path.resolve(__dirname, '../layouts/gridLayouts/randomValleyGridLayouts.json');
    try {
      valleyLayoutsCache = JSON.parse(fs.readFileSync(layoutsPath, 'utf8'));
      console.log(`📦 Loaded ${valleyLayoutsCache.length} valley layouts from randomValleyGridLayouts.json`);
    } catch (err) {
      console.error('❌ Failed to load randomValleyGridLayouts.json:', err.message);
      valleyLayoutsCache = [];
    }
  }
  return valleyLayoutsCache;
}

/**
 * Selects a random valley layout for the given grid type and parses it into
 * the format expected by generateGrid/generateResources/generateEnemies.
 *
 * === HOW THE UNIFIED JSON FORMAT WORKS ===
 *
 * Each entry in randomValleyGridLayouts.json has:
 * - valleyType: "valley1", "valley2", or "valley3" - used to filter layouts
 * - layout: Layout name (for logging/debugging)
 * - variant: Variant identifier (number or string like "Daisy")
 * - description: Optional description
 *
 * TILE DISTRIBUTION:
 * - Single-letter keys (g, s, d, c, z, etc.) with percentage values
 * - Example: { "g": 70, "s": 8, "d": 22 } means 70% grass, 8% slate, 22% dirt
 *
 * RESOURCE DISTRIBUTION:
 * - r1, r1qty, r2, r2qty, ... rN, rNqty format
 * - Example: { "r1": "Oak Tree", "r1qty": 1500, "r2": "Pine Tree", "r2qty": 300 }
 * - The number of resources varies per layout
 *
 * ENEMY DISTRIBUTION:
 * - e1, e1qty, e2, e2qty, ... eN, eNqty format
 * - Example: { "e1": "Coyote", "e1qty": 6, "e2": "Bear", "e2qty": 3 }
 * - Some layouts have no enemies at all
 *
 * @param {string} gridType - The grid type (valley1, valley2, valley3)
 * @returns {Object} Layout object with tileDistribution, resourceDistribution, enemiesDistribution
 */
function getRandomValleyLayout(gridType) {
  const allLayouts = loadValleyLayouts();

  // Filter layouts that match the requested valley type
  const matchingLayouts = allLayouts.filter(layout => layout.valleyType === gridType);

  if (matchingLayouts.length === 0) {
    console.warn(`⚠️ No layouts found for gridType "${gridType}" in randomValleyGridLayouts.json`);
    return null;
  }

  // Pick a random layout from the matching ones
  const randomIndex = Math.floor(Math.random() * matchingLayouts.length);
  const selectedLayout = matchingLayouts[randomIndex];

  console.log(`🎲 Selected valley layout: "${selectedLayout.layout}" (variant: ${selectedLayout.variant}) for ${gridType}`);
  if (selectedLayout.description) {
    console.log(`   📝 ${selectedLayout.description}`);
  }

  // ============================================================
  // PARSE TILE DISTRIBUTION
  // Look for single-letter keys that match known tile types
  // ============================================================
  const tileDistribution = {};
  for (const key of TILE_TYPE_KEYS) {
    if (selectedLayout[key] !== undefined && selectedLayout[key] > 0) {
      tileDistribution[key] = selectedLayout[key];
    }
  }

  // ============================================================
  // PARSE RESOURCE DISTRIBUTION
  // Look for r1/r1qty, r2/r2qty, etc. pairs
  // Note: JSON may have gaps (e.g., r1, r2, r4 - skipping r3), so we check up to r15
  // ============================================================
  const resourceDistribution = {};
  for (let resourceIndex = 1; resourceIndex <= 15; resourceIndex++) {
    const resourceName = selectedLayout[`r${resourceIndex}`];
    const resourceQty = selectedLayout[`r${resourceIndex}qty`];
    if (resourceName && resourceQty > 0) {
      resourceDistribution[resourceName] = resourceQty;
    }
  }

  // ============================================================
  // PARSE ENEMY DISTRIBUTION
  // Look for e1/e1qty, e2/e2qty, etc. pairs
  // Note: JSON may have gaps, so we check up to e10
  // ============================================================
  const enemiesDistribution = {};
  for (let enemyIndex = 1; enemyIndex <= 10; enemyIndex++) {
    const enemyName = selectedLayout[`e${enemyIndex}`];
    const enemyQty = selectedLayout[`e${enemyIndex}qty`];
    if (enemyName && enemyQty > 0) {
      enemiesDistribution[enemyName] = enemyQty;
    }
  }

  // Log what we parsed for debugging
  console.log(`   🗺️ Tile distribution: ${Object.entries(tileDistribution).map(([k, v]) => `${k}=${v}%`).join(', ')}`);
  console.log(`   🌲 Resources: ${Object.keys(resourceDistribution).length} types`);
  if (Object.keys(enemiesDistribution).length > 0) {
    console.log(`   👹 Enemies: ${Object.entries(enemiesDistribution).map(([k, v]) => `${k}×${v}`).join(', ')}`);
  }

  // Return in the format expected by the existing grid generation code
  return {
    layoutName: selectedLayout.layout,
    variant: selectedLayout.variant,
    tileDistribution,
    resourceDistribution,
    enemiesDistribution: Object.keys(enemiesDistribution).length > 0 ? enemiesDistribution : undefined
  };
}

/**
 * Dynamically fetches a template from the specified layout directory.
 * @param {string} type - The type of template to fetch (e.g., gridType or settlementType).
 * @param {string} baseDir - The base directory for templates (e.g., 'gridLayouts', 'settlementLayouts').
 * @returns {Object|null} - Parsed JSON template or null if not found.
 */
const getTemplate = (baseDir, type, gridCoord) => { 
  const layoutsPath = path.resolve(__dirname, `../layouts/${baseDir}`);
  const typeDir = `${type}`;
  const dirPath = path.join(layoutsPath, typeDir);

  if (!fs.existsSync(dirPath)) {
    console.warn(`Directory not found for type "${type}": ${dirPath}`);
    return null;
  }

  // ✅ Step 1: Check if a specific gridCoord template exists
  const specificFile = `${gridCoord}.json`;
  const specificFilePath = path.join(dirPath, specificFile);

  if (fs.existsSync(specificFilePath)) {
    try {
      const template = JSON.parse(fs.readFileSync(specificFilePath, 'utf8'));
      console.log(`✅ Using specific template: ${specificFilePath}`);
      return { template, fileName: specificFile.replace('.json', '') };
    } catch (err) {
      console.error(`❌ Error parsing specific template: ${specificFilePath}`, err.message);
      return null;
    }
  }

  // ✅ Step 2: If no specific file, choose a random one
  const files = fs.readdirSync(dirPath);
  if (files.length === 0) {
    console.warn(`No templates found for type "${type}" in ${dirPath}`);
    return null;
  }

  const randomIndex = Math.floor(Math.random() * files.length);
  const selectedFile = files[randomIndex]; // Full file name with extension
  const selectedTemplatePath = path.join(dirPath, selectedFile);

  try {
    const template = JSON.parse(fs.readFileSync(selectedTemplatePath, 'utf8'));
    console.log(`Selected template for "${type}": ${selectedTemplatePath}`);
    return { template, fileName: selectedFile.replace('.json', '') }; // Return file name without extension
  } catch (err) {
    console.error(`Failed to parse template for "${type}": ${selectedTemplatePath}`, err.message);
    return null;
  }
};



/////////////////////////////////////////////////////////////
// HOMESTEAD & TOWN LAYOUTS
//
function getHomesteadLayoutFile(seasonType) {
  // Always use the single homestead.json template
  // Seasonal crops and snow tiles are applied dynamically in createGridLogic.js
  return 'homestead.json';
}
// Extract position suffix from settlementType (e.g., "homesteadSetNW" -> "NW")
function getPositionFromSettlementType(settlementType) {
  if (!settlementType) return '';
  
  // Match pattern like "homesteadSetNW", "homesteadSetN", etc.
  const match = settlementType.match(/homesteadSet([NSEW]+)$/);
  return match ? match[1] : '';
}

function getTownLayoutFile(seasonType, position = '') {
  // If position is provided, try position-specific layout first
  if (position) {
    const positionFileName = `town${position}.json`;
    const positionPath = path.join(__dirname, '../layouts/gridLayouts/town', positionFileName);
    if (fs.existsSync(positionPath)) {
      return positionFileName;
    }
  }
  
  // Fall back to default town layout
  return 'town_default.json';
}

module.exports = { getTemplate, getRandomValleyLayout, getHomesteadLayoutFile, getTownLayoutFile, getPositionFromSettlementType };
