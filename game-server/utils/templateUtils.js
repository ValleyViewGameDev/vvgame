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


function getHomesteadLayoutFile(seasonType) {
  const layoutFileName = `homestead${seasonType}.json`;
  const layoutPath = path.join(__dirname, '../layouts/gridLayouts/homestead', layoutFileName);
  return fs.existsSync(layoutPath) ? layoutFileName : 'homestead_default.json';
}


module.exports = { getTemplate, getHomesteadLayoutFile };
