const { readJSON } = require('./fileUtils');
const config = require('../config');
const path = require('path');
const { getTemplate } = require('../utils/templateUtils');
const masterResources = require('../tuning/resources.json'); // Import resources.json directly

// File paths
const resourcesFilePath = path.join(__dirname, '../tuning/resources.json');
//const tileTypesFilePath = path.join(__dirname, '../layouts/tileTypes.json');
//const layoutKeyFilePath = path.join(__dirname, '../layouts/layoutKey.json');

// Load JSON files
console.log('Loading resources ...');
const resourcesData = readJSON(resourcesFilePath);
//const tileTypes = readJSON(tileTypesFilePath);
//const layoutKey = readJSON(layoutKeyFilePath);

if (!resourcesData) {
  console.error('Error loading critical JSON files.');
  throw new Error('Failed to load required JSON files.');
}

// function lookupLayoutKey(cell) {
//   return layoutKey[cell] || null;
// }

// Helper function to create a distribution array
function createDistributionArray(tileDistribution) {
  const distributionArray = [];

  Object.entries(tileDistribution).forEach(([tileType, percentage]) => {
    const count = Math.round(percentage * 100); // ✅ Ensure proportional weight
    for (let i = 0; i < count; i++) {
      distributionArray.push(tileType);
    }
  });

  if (distributionArray.length === 0) {
    console.warn("⚠️ Tile distribution array is empty! Defaulting to grass.");
    return ["g"]; // Default fallback to grass if distribution is missing
  }

  console.log("📊 Generated Tile Distribution Array:", distributionArray.slice(0, 20)); // Debugging
  return distributionArray;
}



function generateGrid(layout) {
  if (!layout.tiles) {
    throw new Error('Invalid layout: Missing "tiles".');
  }

  const tileDistribution = layout.tileDistribution || {};
  const distributionArray = createDistributionArray(tileDistribution);

  return layout.tiles.map((row, rowIndex) =>
    row.map((cell, colIndex) => {
      if (cell === '**') {
        const randomTile = distributionArray.length > 0
          ? distributionArray[Math.floor(Math.random() * distributionArray.length)]
          : 'g'; // ✅ Use weighted randomness instead of defaulting to grass
        
        // ✅ Find the correct layoutkey for the randomTile
        const tileResource = masterResources.find(res => res.type === randomTile && res.category === 'tile');
        return tileResource ? tileResource.layoutkey : 'GR'; // ✅ Default to 'GR' if missing
      }

      // ✅ Directly return the correct tile layoutkey
      const tileResource = masterResources.find(res => res.layoutkey === cell && res.category === 'tile');
      return tileResource ? tileResource.layoutkey : 'GR'; // ✅ Default to 'GR' if missing
    })
  );
}


function generateResources(layout, tiles) {
  if (!layout.resources) {
    throw new Error('Invalid layout: Missing "resources".');
  }

  console.log("📌 Generating resources with new validation...");

  // ✅ Use the new resourceDistribution from the template
  const resourceDistribution = layout.resourceDistribution || {};

  const resources = [];
  const availableCells = [];

  // ✅ Step 1: Place Static Resources First
  layout.resources.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (cell === '**') {
        availableCells.push({ x, y }); // ✅ Keep track of empty spots
      } else {
        const resourceEntry = masterResources.find(res => res.layoutkey === cell);

        if (resourceEntry) {
          if (resourceEntry.category === 'npc') {
            console.log(`📌 Skipping NPC "${resourceEntry.type}" at (${x}, ${y}) – handled separately.`);
          } else {
            const tileType = tiles[y]?.[x] || 'g'; // ✅ Ensure tile type exists
            const validKey = `validon${tileType.toLowerCase()}`;
            const isValid = resourceEntry[validKey] === true;

            if (isValid) {
              resources.push({ type: resourceEntry.type, x, y });
            } else {
              console.warn(`❌ Static resource "${resourceEntry.type}" is not valid on "${tileType}" at (${x},${y}).`);
            }
          }
        } else {
          console.warn(`⚠️ No matching resource for key "${cell}" at (${x},${y}).`);
        }
      }
    });
  });

  // ✅ Step 2: Randomly Place Distributed Resources
  shuffleArray(availableCells); // Randomize available placement locations

  Object.entries(resourceDistribution).forEach(([resourceType, quantity]) => {
    let remaining = quantity;
    let retries = 0;
    const maxRetries = 10;

    while (remaining > 0 && availableCells.length > 0) {
      if (retries >= maxRetries) {
        console.warn(`⚠️ Max retries reached for "${resourceType}". Unable to place remaining ${remaining} instances.`);
        break;
      }

      const { x, y } = availableCells.pop();
      const tileType = tiles[y]?.[x] || 'g'; // ✅ Ensure tile type exists
      const resourceDefinition = masterResources.find(res => res.type === resourceType);
      const validKey = `validon${tileType.toLowerCase()}`;
      const isValid = resourceDefinition && resourceDefinition[validKey] === true;

      if (isValid) {
        resources.push({ type: resourceType, x, y });
        remaining--;
        retries = 0;
      } else {
        availableCells.unshift({ x, y }); // Put it back for another try
        retries++;
        //console.warn(`❌ Skipping "${resourceType}" at (${x},${y}) - Not valid on "${tileType}". Retrying...`);
      }
    }

    if (remaining > 0) {
      //console.warn(`⚠️ Unable to place ${remaining} instances of "${resourceType}".`);
    }
  });

  return resources;
}

// Helper function to determine if a resource is an NPC
const isNPC = (resource) => {
  const npcEntry = masterResources.find(item => item.type === resource);
  return npcEntry?.category === 'npc';
};

// Utility to shuffle an array (Fisher-Yates shuffle)
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}


module.exports = {
//  tileTypes,
  generateGrid,
  generateResources,
//  lookupLayoutKey,
  isNPC,
};
