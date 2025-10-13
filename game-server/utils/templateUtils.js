const fs = require('fs');
const path = require('path');

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
// HOMESTEAD & TOWN LAYOUTS -- always the same 4, based on the season
//
function getHomesteadLayoutFile(seasonType) {
  const layoutFileName = `homestead${seasonType}.json`;
  const layoutPath = path.join(__dirname, '../layouts/gridLayouts/homestead', layoutFileName);
  return fs.existsSync(layoutPath) ? layoutFileName : 'homestead_default.json';
}
// Extract position suffix from settlementType (e.g., "homesteadNW" -> "NW")
function getPositionFromSettlementType(settlementType) {
  if (!settlementType) return '';
  
  // Match pattern like "homesteadNW", "homesteadN", etc.
  const match = settlementType.match(/homestead([NSEW]+)$/);
  return match ? match[1] : '';
}

function getTownLayoutFile(seasonType, position = '') {
  // If position is provided, try position+season combination first
  if (position) {
    const positionSeasonFileName = `town${position}${seasonType}.json`;
    const positionSeasonPath = path.join(__dirname, '../layouts/gridLayouts/town', positionSeasonFileName);
    if (fs.existsSync(positionSeasonPath)) {
      return positionSeasonFileName;
    }
  }
  
  // Fall back to season-only layout
  const layoutFileName = `town${seasonType}.json`;
  const layoutPath = path.join(__dirname, '../layouts/gridLayouts/town', layoutFileName);
  return fs.existsSync(layoutPath) ? layoutFileName : 'town_default.json';
}

module.exports = { getTemplate, getHomesteadLayoutFile, getTownLayoutFile, getPositionFromSettlementType };
