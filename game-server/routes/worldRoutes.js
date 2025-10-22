const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;
const fs = require('fs');
const express = require('express');
const router = express.Router();
const path = require('path');
const { readJSON } = require('../utils/fileUtils');
const Settlement = require('../models/settlement');
const Frontier = require('../models/frontier');
const Town = require('../models/town');
const Grid = require('../models/grid'); // Assuming you have a Grid model
const Player = require('../models/player'); // Adjust the path to match your project structure
const { getFrontierId, getSettlementId, getgridId } = require('../utils/IDs');
const { performGridCreation } = require('../utils/createGridLogic');
const { performGridReset } = require('../utils/resetGridLogic');
const { generateGrid, generateResources } = require('../utils/worldUtils');
const masterResources = require('../tuning/resources.json'); // Import resources.json directly
const { getTemplate, getHomesteadLayoutFile } = require('../utils/templateUtils');
const queue = require('../queue'); // Import the in-memory queue
const { relocateOnePlayerHome } = require('../utils/relocatePlayersHome');

// Cleanup old transaction IDs to prevent database bloat
function cleanupTransactionIds(player, maxEntries = 100, maxAgeHours = 24) {
  if (!player.lastTransactionIds || player.lastTransactionIds.size === 0) {
    console.log(`🧹 No transaction IDs to clean for player ${player.playerId}`);
    return;
  }

  const initialSize = player.lastTransactionIds.size;
  const now = Date.now();
  const maxAge = maxAgeHours * 60 * 60 * 1000;
  let cleanedCount = 0;
  let ageBasedRemovals = 0;
  let sizeBasedRemovals = 0;
  
  console.log(`🧹 Starting cleanup for player ${player.playerId}: ${initialSize} transaction IDs (limit: ${maxEntries}, maxAge: ${maxAgeHours}h)`);
  
  // Remove entries older than maxAge hours
  for (const [key, transactionData] of player.lastTransactionIds.entries()) {
    // Handle both old format (just ID string) and new format (object with timestamp)
    // For old format entries (strings), keep them (don't delete based on age)
    if (typeof transactionData === 'object' && transactionData?.timestamp) {
      const timestamp = transactionData.timestamp;
      if (now - timestamp > maxAge) {
        player.lastTransactionIds.delete(key);
        cleanedCount++;
      }
    }
  }
  
  // If still over limit, remove oldest entries (prioritize old format entries first)
  if (player.lastTransactionIds.size > maxEntries) {
    const sorted = Array.from(player.lastTransactionIds.entries())
      .sort((a, b) => {
        // Prioritize old format (strings) for removal first
        const aIsOld = typeof a[1] === 'string';
        const bIsOld = typeof b[1] === 'string';
        
        if (aIsOld && !bIsOld) return -1; // a goes first (will be removed)
        if (!aIsOld && bIsOld) return 1;  // b goes first (will be removed)
        
        // If both are same format, sort by timestamp
        const aTime = a[1]?.timestamp || 0;
        const bTime = b[1]?.timestamp || 0;
        return aTime - bTime;
      });
    
    const toRemove = sorted.length - maxEntries;
    for (let i = 0; i < toRemove; i++) {
      player.lastTransactionIds.delete(sorted[i][0]);
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`🧹 Cleaned up ${cleanedCount} old transaction IDs for player ${player.playerId}`);
  }
}
const { getSeasonLevel } = require('../utils/scheduleHelpers');

///////////////////////////////////////////////////////////////
// GRID ROUTES 
///////////////////////////////////////////////////////////////


// create-grid
router.post('/create-grid', async (req, res) => {
  console.log('Incoming request: /create-grid');
  console.log('req.body = ', req.body);

  try {
    const result = await performGridCreation(req.body);
    res.status(201).json(result);
  } catch (error) {
    console.error('Error creating grid:', error);
    res.status(500).json({ error: error.message || 'Failed to create grid.' });
  }
});

// reset-grid 
router.post('/reset-grid', async (req, res) => {
  const { gridCoord, gridId, gridType } = req.body;
  console.log('Reached reset-grid;  gridCoord =', gridCoord, ', gridId =', gridId, ', gridType =', gridType);

  if (!gridId || !gridType) {
    console.error('Missing required fields in request body:', req.body);
    return res.status(400).json({ error: 'gridId and gridType are required.' });
  }

  try {
    await performGridReset(gridId, gridType, gridCoord);
    res.status(200).json({ success: true, message: 'Grid reset successfully.' });
  } catch (error) {
    console.error('Error resetting grid:', error);
    res.status(500).json({ error: 'Failed to reset grid.' });
  }
});


// Remove homestead - delete grid and update settlement
router.post('/remove-homestead', async (req, res) => {
  const { gridId } = req.body;
  console.log('🏚️ Removing homestead grid:', gridId);

  if (!gridId) {
    return res.status(400).json({ error: 'gridId is required.' });
  }

  try {
    // 1. Find the grid to get its settlement info and players
    const grid = await Grid.findById(gridId);
    if (!grid) {
      return res.status(404).json({ error: 'Grid not found.' });
    }

    const settlementId = grid.settlementId;
    const gridCoord = grid.gridCoord;

    // 2. Relocate all players in this grid before deleting it
    if (grid.playersInGrid) {
      const playersInGrid = grid.playersInGrid instanceof Map
        ? Array.from(grid.playersInGrid.keys())
        : Object.keys(grid.playersInGrid);
      
      console.log(`🚶 Found ${playersInGrid.length} players to relocate`);
      
      for (const playerId of playersInGrid) {
        console.log(`🏠 Relocating player ${playerId} to their home...`);
        try {
          await relocateOnePlayerHome(playerId);
        } catch (relocateError) {
          console.error(`⚠️ Failed to relocate player ${playerId}:`, relocateError);
          // Continue with other players even if one fails
        }
      }
    }

    // 3. Delete the grid from the grids collection
    await Grid.findByIdAndDelete(gridId);
    console.log('✅ Grid deleted from database');

    // 4. Update the settlement to remove this grid reference
    const settlement = await Settlement.findById(settlementId);
    if (settlement && settlement.grids) {
      // Find and update the grid cell in the settlement's grids array
      let updated = false;
      for (let row = 0; row < settlement.grids.length; row++) {
        for (let col = 0; col < settlement.grids[row].length; col++) {
          const cell = settlement.grids[row][col];
          if (cell.gridId && cell.gridId.toString() === gridId) {
            // Mark this cell as available with no gridId
            settlement.grids[row][col] = {
              gridCoord: cell.gridCoord,
              gridType: cell.gridType,
              gridId: null,
              available: true
            };
            updated = true;
            console.log(`✅ Updated settlement grid at [${row}][${col}] to available`);
            break;
          }
        }
        if (updated) break;
      }

      if (updated) {
        await settlement.save();
        console.log('✅ Settlement updated successfully');
      } else {
        console.warn('⚠️ Grid not found in settlement grids array');
      }
    } else {
      console.warn('⚠️ Settlement not found or has no grids array');
    }

    res.status(200).json({ 
      success: true, 
      message: 'Homestead removed successfully. All players relocated.',
      deletedGridId: gridId,
      settlementId: settlementId
    });

  } catch (error) {
    console.error('❌ Error removing homestead:', error);
    res.status(500).json({ error: 'Failed to remove homestead.' });
  }
});


router.post('/claim-homestead/:gridId', async (req, res) => {
  const { gridId } = req.params;
  const { playerId } = req.body; // or from session token, etc.

  if (!playerId) {
    return res.status(400).json({ error: 'No playerId provided to claim homestead.' });
  }

  // Log attempt to claim homestead
  console.log(`🔐 Attempting to claim gridId: ${gridId} for playerId: ${playerId}`);

  try {
    const grid = await Grid.findById(gridId);
    if (!grid) return res.status(404).json({ error: 'Grid not found.' });

    // Log grid found
    console.log(`📋 Grid found: type = ${grid.gridType}, ownerId = ${grid.ownerId || 'null'}`);

    if (grid.gridType !== 'homestead') {
      return res.status(400).json({ error: 'Cannot claim a non-homestead grid.' });
    }

    if (grid.ownerId) {
      return res.status(400).json({ error: 'Homestead is already claimed.' });
    }

    // Assign the player as owner
    grid.ownerId = playerId;
    await grid.save();

    return res.status(200).json({ success: true, message: 'Homestead claimed successfully.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to claim homestead.' });
  }
});

// Update specific fields of a grid document
router.patch('/update-grid/:gridId', (req, res) => {
  const startTime = Date.now();
  const { gridId } = req.params;
  const { resource } = req.body; // ✅ this is the new schema you're using

  if (!resource) {
    return res.status(400).json({ error: 'Missing resource in request body.' });
  }

  const { type, x, y, growEnd, craftEnd, craftedItem } = resource;


  if (!mongoose.Types.ObjectId.isValid(gridId)) {
    return res.status(400).json({ error: 'Invalid gridId.' });
  }

  if (typeof x !== 'number' || typeof y !== 'number') {
    return res.status(400).json({ error: 'Invalid x or y coordinates.' });
  }

  // Enqueue the update task
  const { enqueueByKey } = require('../queue');
  enqueueByKey(gridId, async () => {
    try {
      const grid = await Grid.findById(gridId);
      if (!grid) {
        console.error(`Grid not found for _id: ${gridId}`);
        return; // Avoid sending a response here since it's already enqueued
      }

      // **Find the resource at the specified location**
      const resourceIndex = grid.resources.findIndex((res) => res.x === x && res.y === y);
      if (type) {
        if (resourceIndex !== -1) {

          // ✅ CASE 1: Resource Exists - Determine if we're appending or replacing
          if (growEnd !== undefined || craftEnd !== undefined || craftedItem !== undefined) {

            if (growEnd !== undefined) {
                if (growEnd === null) {
                    delete grid.resources[resourceIndex].growEnd; // ✅ Remove attribute
                } else {
                    grid.resources[resourceIndex].growEnd = growEnd; // ✅ Append value
                }
            }
            if (craftEnd !== undefined) {
                if (craftEnd === null) {
                    delete grid.resources[resourceIndex].craftEnd; // ✅ Remove attribute
                } else {
                    grid.resources[resourceIndex].craftEnd = craftEnd; // ✅ Append value
                }
            }
            if (craftedItem !== undefined) {
                if (craftedItem === null) {
                    delete grid.resources[resourceIndex].craftedItem; // ✅ Remove attribute
                } else {
                    grid.resources[resourceIndex].craftedItem = craftedItem; // ✅ Append value
                }
            }
            // ✅ Force Mongoose to track modifications in this nested array
            grid.markModified(`resources.${resourceIndex}`);

          } else {
            // ✅ Preserve existing resource & append attributes if needed
            
            // Load master resources to check resource categories
            const fs = require('fs');
            const path = require('path');
            const masterResources = JSON.parse(fs.readFileSync(path.join(__dirname, '../tuning/resources.json'), 'utf-8'));
            const newResourceDef = masterResources.find(r => r.type === type);
            
            // When converting from farmplot to crop (doober), remove farmplot-specific fields
            if (newResourceDef && newResourceDef.category === 'doober') {
              // This is a crop - remove any farmplot-specific fields
              const { growEnd: oldGrowEnd, ...cleanResource } = grid.resources[resourceIndex];
              grid.resources[resourceIndex] = {
                ...cleanResource,
                type,
                x,
                y,
                ...(craftEnd !== undefined && { craftEnd }),
                ...(craftedItem !== undefined && { craftedItem }),
              };
            } else {
              // Not a crop, preserve everything
              grid.resources[resourceIndex] = {
                ...grid.resources[resourceIndex], // Preserve everything
                type,
                x,
                y,
                ...(growEnd !== undefined && { growEnd }),
                ...(craftEnd !== undefined && { craftEnd }),
                ...(craftedItem !== undefined && { craftedItem }),
              };
            }
            grid.markModified(`resources.${resourceIndex}`);
          }

        } else {
          // ✅ CASE 2: No Existing Resource - Add New One
          console.log(`➕ Adding new resource at (${x}, ${y}): ${type}`);
          grid.resources.push({
            type: type,
            x,
            y,
            ...(growEnd !== undefined && { growEnd }),
            ...(craftEnd !== undefined && { craftEnd }),
            ...(craftedItem !== undefined && { craftedItem }),
          });
        }
      } else {
        // ✅ CASE 3: Remove Resource (Delete it completely)
        if (resourceIndex !== -1) {
          console.log(`❌ Removing resource at (${x}, ${y})`);
          grid.resources.splice(resourceIndex, 1);
        } else {
          console.warn(`⚠️ No resource found to remove at (${x}, ${y})`);
        }
      }
      
      // Save changes to the database
      await grid.save();
    } catch (error) {
      console.error('Error updating grid:', error);
    }
  });

  // Respond immediately
  res.status(202).json({ success: true, message: 'Update queued.' });
});


router.patch('/update-tile/:gridId', async (req, res) => {
  const { gridId } = req.params;
  const { x, y, newType } = req.body;
  
  console.log(`📬 Incoming request: POST /api/update-tile`);
  console.log(`🧱 Requested tile update: (${x}, ${y}) on grid ${gridId} to type: ${newType}`);

  if (!gridId || typeof x !== 'number' || typeof y !== 'number') {
    console.error('❌ Missing or invalid parameters');
    return res.status(400).json({ success: false, message: 'Missing or invalid parameters.' });
  }

  try {
    const grid = await Grid.findById(gridId);
    if (!grid) {
      console.error(`❌ Grid not found for ID: ${gridId}`);
      return res.status(404).json({ success: false, message: 'Grid not found.' });
    }

    // Defensive initialization of tiles array
    if (!Array.isArray(grid.tiles)) {
      console.warn('⚠️ Grid.tiles is not an array — initializing as empty 64x64 grid.');
      grid.tiles = Array.from({ length: 64 }, () => Array(64).fill('grass'));
    }

    if (!Array.isArray(grid.tiles[y])) {
      console.warn(`⚠️ grid.tiles[${y}] was missing. Reinitializing row.`);
      grid.tiles[y] = Array(64).fill('grass');
    }

    const before = grid.tiles[y][x];
    console.log(`🧩 Tile before: ${before}`);

    grid.tiles[y][x] = newType;
    grid.markModified('tiles');

    await grid.save();

    const updatedGrid = await Grid.findById(gridId);
    const after = updatedGrid.tiles?.[y]?.[x];
    console.log(`✅ Confirmed saved tile: (${x}, ${y}) = ${after}`);

    return res.json({ success: true });
  } catch (error) {
    console.error('❌ Server error during tile update:', error);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});


// Abstract endpoint to load a grid by its ID
router.get('/load-grid/:gridId', async (req, res) => {
  const { gridId } = req.params;
  console.log(`Fetching grid for ID: ${gridId}`);

  try {
    // 1) Find the grid by _id and populate the ownerId so we have player's username if it's a homestead
    const gridDocument = await Grid.findById(gridId)
      .populate('ownerId', 'username') // <== THE KEY CHANGE
      .exec();

    if (!gridDocument) {
      console.error(`No grid found for ID: ${gridId}`);
      return res.status(404).json({ error: `Grid not found for ID: ${gridId}` });
    }

    console.log(`Grid found for ID: ${gridId}`);

    // 2) Check if we need to clean up any corrupted crops
    let needsSave = false;
    const cleanedResources = gridDocument.resources.map((resource) => {
      const resourceTemplate = masterResources.find((res) => res.type === resource.type);

      if (!resourceTemplate) {
        console.warn(`Resource template not found for type: ${resource.type}`);
        return resource; // Return the resource as-is if no template
      }

      // If this is a crop (doober) with growEnd, it needs cleanup
      if (resourceTemplate.category === 'doober' && resource.growEnd) {
        console.log(`🧹 Found corrupted crop ${resource.type} at (${resource.x}, ${resource.y}) - removing growEnd permanently`);
        needsSave = true;
        // Create a new object without growEnd
        const { growEnd, ...cleanedResource } = resource.toObject ? resource.toObject() : resource;
        return cleanedResource;
      }

      return resource;
    });

    // If we found corrupted crops, save the cleanup to database
    if (needsSave) {
      console.log(`💾 Saving ${cleanedResources.filter((r, i) => r !== gridDocument.resources[i]).length} cleaned crops to database`);
      gridDocument.resources = cleanedResources;
      gridDocument.markModified('resources');
      await gridDocument.save();
    }

    // 3) Enrich resources with masterResources data for response
    const enrichedResources = cleanedResources.map((resource) => {
      const resourceTemplate = masterResources.find((res) => res.type === resource.type);

      if (!resourceTemplate) {
        return { ...resource };
      }

      // Merge attributes from the resource template with instance-specific attributes
      return {
        ...resourceTemplate, // All static attributes
        ...resource,         // Instance-specific (x, y, etc)
      };
    });

    // 4) Construct the enriched grid data structure
    const enrichedGrid = {
      ...gridDocument.toObject(),
      resources: enrichedResources,        // Replace resources with enriched
    };

    // 4) Respond with the enriched grid, which now includes ownerId.username if it's a homestead
    res.status(200).json(enrichedGrid);
  } catch (error) {
    console.error(`Error loading grid with ID: ${gridId}:`, error);
    res.status(500).json({ error: 'Failed to load grid.' });
  }
});

// update-homestead-descriptor
router.patch('/update-grid-availability/:gridId', async (req, res) => {
  const { gridId } = req.params;
  const { available } = req.body; // Expect the new availability value in the request body

  console.log('Updating Grid Availability; gridId =', gridId, ', available =', available);

  try {
    const gridObjectId = new mongoose.Types.ObjectId(gridId);

    // Find the settlement containing the grid
    const settlement = await Settlement.findOne({
      grids: { $elemMatch: { $elemMatch: { gridId: gridObjectId } } },
    });

    if (!settlement) {
      console.error('Grid not found in any Settlement.');
      return res.status(404).json({ error: 'Grid not found in any Settlement.' });
    }

    console.log('Matching Settlement:', settlement._id);

    // Update the specific grid's availability
    let updated = false;
    settlement.grids.forEach((row) => {
      row.forEach((grid) => {
        if (grid.gridId && String(grid.gridId) === String(gridObjectId)) {
          grid.available = available;
          updated = true;
        }
      });
    });

    if (!updated) {
      return res.status(404).json({ error: 'Grid availability update failed.' });
    }

    await settlement.save();
    console.log('Updated Settlement:', settlement._id);

    res.status(200).json({ success: true, message: 'Grid availability updated.' });
  } catch (error) {
    console.error('Error updating grid availability:', error);
    res.status(500).json({ error: 'Failed to update grid availability.' });
  }
});



///////////////////////////////////////////////////////////////
// TILE AND RESOURCE ROUTES 
///////////////////////////////////////////////////////////////

router.get('/resources', (req, res) => {
  try {
    const resourcesData = readJSON(path.join(__dirname, '../tuning/resources.json'));
    if (!resourcesData) {
      console.error('No resources data found');
      return res.status(404).json({ error: 'Resources not found' });
    }
    res.json(resourcesData);
  } catch (error) {
    console.error('Error fetching resources:', error);
    res.status(500).json({ error: 'Error fetching resources' });
  }
});

router.get('/traders', (req, res) => {
  try {
    const tradersData = readJSON(path.join(__dirname, '../tuning/traders.json'));
    if (!tradersData) {
      console.error('No traders data found');
      return res.status(404).json({ error: 'Traders not found' });
    }
    res.json(tradersData);
  } catch (error) {
    console.error('Error fetching traders:', error);
    res.status(500).json({ error: 'Error fetching traders' });
  }
});

// GET /world/trophies - Get all trophy definitions
router.get('/trophies', (req, res) => {
  try {
    const trophiesData = readJSON(path.join(__dirname, '../tuning/trophies.json'));
    if (!trophiesData) {
      console.error('No trophies data found');
      return res.status(404).json({ error: 'Trophies not found' });
    }
    res.json(trophiesData);
  } catch (error) {
    console.error('Error fetching trophies:', error);
    res.status(500).json({ error: 'Error fetching trophies' });
  }
});

router.get('/warehouse', (req, res) => {
  try {
    const warehouseData = readJSON(path.join(__dirname, '../tuning/warehouse.json'));
    if (!warehouseData) {
      console.error('No warehouse data found');
      return res.status(404).json({ error: 'Warehouse data not found' });
    }
    res.json(warehouseData);
  } catch (error) {
    console.error('Error fetching warehouse data:', error);
    res.status(500).json({ error: 'Error fetching warehouse data' });
  }
});

// Endpoint to fetch a specific resource at (x, y) in the grid
router.get('/get-resource/:gridId/:col/:row', async (req, res) => {
  const { gridId, col, row } = req.params;

  try {
    console.log(`Fetching resource at (${col}, ${row}) in grid ${gridId}`);

    // Fetch only the 'resources' field from the grid by its MongoDB _id
    const grid = await Grid.findOne({ _id: gridId }).select('resources');

    if (!grid) {
      console.error(`Grid not found for ID: ${gridId}`);
      return res.status(404).json({ error: `Grid not found for ID: ${gridId}` });
    }

    // Find the resource at the given coordinates
    const resource = grid.resources.find(
      (res) => res.x === parseInt(col, 10) && res.y === parseInt(row, 10)
    );

    if (!resource) {
      console.log(`No resource found at (${col}, ${row}). Returning null.`);
      return res.status(200).json({ type: null });
    }

    console.log(`Resource found at (${col}, ${row}):`, resource.type);
    res.status(200).json({ type: resource.type });
  } catch (error) {
    console.error('Error fetching resource:', error);
    res.status(500).json({ error: 'Failed to fetch resource.' });
  }
});

// Endpoint to fetch tile data
router.get('/get-tile/:gridId/:x/:y', async (req, res) => {
  const { gridId, x, y } = req.params;

  try {
    console.log(`Fetching tile at (${x}, ${y}) in grid ${gridId}`);

    // Fetch the grid by its MongoDB _id
    const grid = await Grid.findOne({ _id: gridId });
    if (!grid) {
      console.error(`Grid not found for ID: ${gridId}`);
      return res.status(404).json({ error: `Grid not found for ID: ${gridId}` });
    }

    // Ensure the tiles array exists and is valid
    const tiles = grid.tiles; // Assuming grid.tiles is your 2D array
    if (!Array.isArray(tiles) || tiles.length !== 64 || !Array.isArray(tiles[0]) || tiles[0].length !== 64) {
      console.error(`Tiles array is empty or invalid for grid ${gridId}`);
      return res.status(500).json({ error: `Tiles data missing or invalid for grid ${gridId}` });
    }

    // Validate coordinates
    const xInt = parseInt(x, 10);
    const yInt = parseInt(y, 10);
    if (isNaN(xInt) || isNaN(yInt) || xInt < 0 || xInt >= 64 || yInt < 0 || yInt >= 64) {
      console.error(`Invalid coordinates: (${x}, ${y})`);
      return res.status(400).json({ error: `Invalid coordinates: (${x}, ${y})` });
    }

    // Get the tile type from the 2D array
    const tileType = tiles[yInt][xInt];
    if (!tileType) {
      console.error(`Tile not found at (${x}, ${y})`);
      return res.status(404).json({ error: `Tile not found at (${x}, ${y})` });
    }

    console.log(`Tile found at (${x}, ${y}):`, tileType);
    res.json({ tileType }); // Respond with the tile type
  } catch (error) {
    console.error('Error fetching tile:', error);
    res.status(500).json({ error: 'Failed to fetch tile.' });
  }
});




//
// ID ROUTES 
//
// Endpoint to fetch default Frontier ID
router.get('/get-frontier-id', async (req, res) => {
  try {
    const frontierId = await getFrontierId();
    res.json(frontierId);
  } catch (error) {
    console.error('Error fetching default Frontier ID:', error.message);
    res.status(500).json({ error: 'Failed to fetch default Frontier ID.' });
  }
});

// Endpoint to fetch default Settlement ID
router.get('/get-settlement-id', async (req, res) => {
  const { frontierId } = req.query;
  try {
    const settlementId = await getSettlementId(frontierId).catch((error) => {
      console.error("Error in getSettlementId:", error.message);
      throw error;
    });
        res.json(settlementId);
  } catch (error) {
    console.error('Error fetching default Settlement ID:', error.message);
    res.status(500).json({ error: 'Failed to fetch default Settlement ID.' });
  }
});

// Endpoint to fetch default Homestead ID
router.get('/get-homestead-id', async (req, res) => {
  const { settlementId } = req.query;
  try {
    const gridId = await getgridId(settlementId).catch((error) => {
      console.error("Error in getgridId:", error.message);
      throw error;
    });
        res.json(gridId);
  } catch (error) {
    console.error('Error fetching default Homestead ID:', error.message);
    res.status(500).json({ error: 'Failed to fetch default Homestead ID.' });
  }
});


//
// GAME EDITOR ROUTES 
//
// 🔹 API Route: Generate Tiles
router.post('/api/generate-tiles', async (req, res) => {
  try {
    const { layoutName } = req.body;
    if (!layoutName) return res.status(400).json({ success: false, error: 'Missing layoutName' });

    // Load the layout template
    const layoutPath = path.join(__dirname, `../layouts/gridLayouts/${layoutName}.json`);
    const layout = readJSON(layoutPath);
    if (!layout || !layout.tiles || !layout.tileDistribution) {
      return res.status(400).json({ success: false, error: 'Invalid layout data' });
    }

    // Generate new tiles based on tileDistribution
    const newTiles = generateGrid(layout, layout.tileDistribution);

    res.json({ success: true, tiles: newTiles });
  } catch (error) {
    console.error('❌ Error generating tiles:', error);
    res.status(500).json({ success: false, error: 'Failed to generate tiles' });
  }
});

// 🔹 API Route: Generate Resources
router.post('/api/generate-resources', async (req, res) => {
  try {
    const { layoutName, tiles } = req.body;
    if (!layoutName || !tiles) return res.status(400).json({ success: false, error: 'Missing layoutName or tiles' });

    // Load the layout template
    const layoutPath = path.join(__dirname, `../layouts/gridLayouts/${layoutName}.json`);
    const layout = readJSON(layoutPath);
    if (!layout || !layout.resourceDistribution) {
      return res.status(400).json({ success: false, error: 'Invalid layout data' });
    }

    // Generate new resources based on resourceDistribution
    const newResources = generateResources(layout, tiles, layout.resourceDistribution);

    res.json({ success: true, resources: newResources });
  } catch (error) {
    console.error('❌ Error generating resources:', error);
    res.status(500).json({ success: false, error: 'Failed to generate resources' });
  }
});


router.post('/debug/refresh-bank-offers/:frontierId', async (req, res) => {
  try {
    // Get frontier document for season data
    const frontier = await Frontier.findById(req.params.frontierId);
    if (!frontier) {
      return res.status(404).json({ error: 'Frontier not found' });
    }

    // Import bankScheduler and generate new offers using correct seasonLevel
    const bankScheduler = require('../schedulers/bankScheduler');
    const seasonLevel = getSeasonLevel(frontier?.seasons?.startTime, frontier?.seasons?.endTime);
    const newOffers = bankScheduler.generateBankOffers(seasonLevel);

    // Save new offers to frontier document
    await Frontier.findByIdAndUpdate(
      req.params.frontierId,
      { $set: { 'bank.offers': newOffers } },
      { new: true }
    );

    res.json({ success: true, offers: newOffers });
  } catch (error) {
    console.error('Error refreshing bank offers:', error);
    res.status(500).json({ error: 'Failed to refresh bank offers' });
  }
});



// 🔁 Relocate Homestead
router.post('/relocate-homestead', async (req, res) => {
  const { fromGridId, targetGridCoord } = req.body;

  console.log("RELOCATE HOMESTEAD; fromGridId = ", fromGridId, "; targetGridCoord = ", targetGridCoord);
  try {
    let fromSettlement = null;
    let targetSettlement = null;

    // Step 1: Loop through all settlements to locate from and target grids
    const settlements = await Settlement.find({});

    for (const settlement of settlements) {
      for (const row of settlement.grids) {
        for (const cell of row) {
          if (cell.gridId && String(cell.gridId) === String(fromGridId)) {
            cell.gridId = null;
            cell.available = true;
            fromSettlement = settlement;
            updated = true;
          } else if (String(cell.gridCoord) === String(targetGridCoord)) {
            cell.gridId = fromGridId;
            cell.available = false;
            targetSettlement = settlement;
            updated = true;
          }
        }
      }
    }
    console.log("fromSettlement = ", fromSettlement);
    console.log("targetSettlement = ", targetSettlement);

    if (!fromSettlement || !targetSettlement) {
      return res.status(400).json({ error: 'Failed to locate both source and target settlement entries.' });
    }

    // Ensure the gridId/available state is correct for both settlements
    for (const row of fromSettlement.grids) {
      for (const cell of row) {
        if (cell.gridCoord === targetGridCoord) {
          console.log(`✅ Updating target cell: gridCoord=${cell.gridCoord}`);
          cell.gridId = fromGridId;
          cell.available = false;
        } else if (cell.gridId && String(cell.gridId) === fromGridId) {
          console.log(`✅ Clearing source cell: gridId=${cell.gridId}`);
          cell.gridId = null;
          cell.available = true;
        }
      }
    }

    if (fromSettlement._id.toString() !== targetSettlement._id.toString()) {
      // Update population counts
      if (typeof fromSettlement.population === 'number') {
        fromSettlement.population = Math.max(0, fromSettlement.population - 1);
      } else {
        fromSettlement.population = 0;
        console.warn("population was not a number; changed to 0");
      }
      if (typeof targetSettlement.population === 'number') {
        targetSettlement.population += 1;
      } else {
        targetSettlement.population = 1;
        console.warn("population was not a number; changed to 1");
      }

      console.log(`👥 Updated populations: from=${fromSettlement.population}, to=${targetSettlement.population}`);
    }

    console.log("💾 Saving fromSettlement...");
    await fromSettlement.save();
    console.log("✅ fromSettlement saved");

    if (fromSettlement._id.toString() !== targetSettlement._id.toString()) {
      console.log("💾 Saving targetSettlement...");
      await targetSettlement.save();
      console.log("✅ targetSettlement saved");
    }

    // Step 2: Update the Grid document to reference the new settlement if needed
    if (fromSettlement._id.toString() !== targetSettlement._id.toString()) {
      const grid = await Grid.findById(fromGridId);
      if (!grid) return res.status(404).json({ error: 'Grid not found.' });

      grid.settlementId = targetSettlement._id;
      await grid.save();

      // 🔁 Update the player who owns this homestead
      // Find player by their gridId (homestead), not their current location
      const player = await Player.findOne({ gridId: fromGridId });
      if (player) {
        // Update their home settlement reference
        player.settlementId = targetSettlement._id;
        
        // If they're currently at their homestead, update their current location too
        if (player.location.g?.toString() === fromGridId.toString()) {
          player.location.s = targetSettlement._id;
          console.log(`✅ Player ${player.username} is at homestead, updating location.s to ${targetSettlement._id}`);
        } else {
          console.log(`⚠️ Player ${player.username} is not at homestead (at ${player.location.g}), only updating settlementId`);
        }
        
        // Decrement relocation count
        if (player.relocations > 0) {
          player.relocations -= 1;
        }
        
        await player.save();
        console.log(`✅ Player ${player.username} homestead relocated to settlement ${targetSettlement._id}`);
      } else {
        console.log(`⚠️ No player found with gridId ${fromGridId}`);
      }
    }

    res.status(200).json({ success: true, message: 'Homestead relocation completed.' });
  } catch (error) {
    console.error('Error in /relocate-homestead:', error);
    res.status(500).json({ error: 'Failed to relocate homestead.' });
  }
});





// Endpoint to fetch multiple grids by ID array, enriched with owner info
router.post('/get-grids-by-id-array', async (req, res) => {
  const { gridIds } = req.body;

  if (!Array.isArray(gridIds) || gridIds.length === 0) {
    return res.status(400).json({ error: 'gridIds must be a non-empty array.' });
  }

  try {
    const objectIds = gridIds.map((id) => new mongoose.Types.ObjectId(id));
    const grids = await Grid.find({ _id: { $in: objectIds } }).populate('ownerId', 'username netWorth role tradeStall');

    const enrichedGrids = grids.map(grid => {
      const gridObj = grid.toObject();
      if (gridObj.ownerId && typeof gridObj.ownerId === 'object') {
        gridObj.username = gridObj.ownerId.username || '';
        gridObj.netWorth = gridObj.ownerId.netWorth || 0;
        gridObj.role = gridObj.ownerId.role || '';
        gridObj.tradeStall = gridObj.ownerId.tradeStall || null;
      } else {
        gridObj.username = '';
        gridObj.netWorth = 0;
        gridObj.role = '';
        gridObj.tradeStall = null;
      }
      return gridObj;
    });

    res.json({ grids: enrichedGrids });
  } catch (error) {
    console.error('Error in /get-grids-by-id-array:', error);
    res.status(500).json({ error: 'Failed to fetch grid data.' });
  }
});

// Protected crafting collection endpoint
router.post('/crafting/collect-item', async (req, res) => {
  const { playerId, gridId, stationX, stationY, craftedItem, transactionId, transactionKey } = req.body;
  
  if (!playerId || !gridId || stationX === undefined || stationY === undefined || !craftedItem || !transactionId || !transactionKey) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Find player and check transaction state
    const player = await Player.findOne({ playerId });
    if (!player) throw new Error('Player not found');

    // Check if transaction already processed (idempotency)
    const lastTxData = player.lastTransactionIds.get(transactionKey);
    const lastTxId = typeof lastTxData === 'object' ? lastTxData.id : lastTxData;
    if (lastTxId === transactionId) {
      return res.json({ success: true, message: 'Item already collected' });
    }

    // Check if there's an active transaction for this action
    if (player.activeTransactions.has(transactionKey)) {
      const activeTransaction = player.activeTransactions.get(transactionKey);
      const timeSinceStart = Date.now() - activeTransaction.timestamp.getTime();
      
      if (timeSinceStart > 30000) {
        player.activeTransactions.delete(transactionKey);
        await player.save();
      } else {
        throw new Error('Transaction in progress');
      }
    }

    // Mark transaction as active
    player.activeTransactions.set(transactionKey, {
      type: transactionKey,
      timestamp: new Date(),
      transactionId
    });
    await player.save();

    // Find the grid and validate the crafting station
    const grid = await Grid.findOne({ _id: gridId });
    if (!grid) {
      player.activeTransactions.delete(transactionKey);
      await player.save();
      return res.status(404).json({ error: 'Grid not found' });
    }

    // Find the station resource
    const stationResource = grid.resources.find(res => res.x === stationX && res.y === stationY);
    if (!stationResource || !stationResource.craftEnd || !stationResource.craftedItem) {
      player.activeTransactions.delete(transactionKey);
      await player.save();
      return res.status(400).json({ error: 'No crafted item ready at this location' });
    }

    // Validate the item matches and is ready
    if (stationResource.craftedItem !== craftedItem || stationResource.craftEnd > Date.now()) {
      player.activeTransactions.delete(transactionKey);
      await player.save();
      return res.status(400).json({ error: 'Item not ready for collection' });
    }

    // Get item details for processing
    const itemResource = masterResources.find(res => res.type === craftedItem);
    if (!itemResource) {
      player.activeTransactions.delete(transactionKey);
      await player.save();
      return res.status(400).json({ error: 'Invalid crafted item' });
    }

    // Handle NPCs vs regular items
    if (itemResource.category === 'npc') {
      // For NPCs, we just need to spawn them (handled client-side for now)
      console.log(`🤖 NPC ${craftedItem} ready for spawn at (${stationX}, ${stationY})`);
    }
    // Don't add items to inventory here - let client handle with skill buffs via gainIngredients

    // Clear the crafting state from the station
    const resourceIndex = grid.resources.findIndex(res => res.x === stationX && res.y === stationY);
    if (resourceIndex !== -1) {
      delete grid.resources[resourceIndex].craftEnd;
      delete grid.resources[resourceIndex].craftedItem;
      grid.markModified(`resources.${resourceIndex}`);
    }

    // Save changes
    await grid.save();
    await player.save();

    // Complete transaction and cleanup old IDs
    cleanupTransactionIds(player);
    player.lastTransactionIds.set(transactionKey, { id: transactionId, timestamp: Date.now() });
    player.activeTransactions.delete(transactionKey);
    await player.save();

    res.json({ 
      success: true, 
      collectedItem: craftedItem,
      isNPC: itemResource.category === 'npc',
      inventory: player.inventory,
      updatedStation: grid.resources[resourceIndex]
    });

  } catch (error) {
    // Cleanup on error
    try {
      const player = await Player.findOne({ playerId });
      if (player) {
        player.activeTransactions.delete(transactionKey);
        await player.save();
      }
    } catch (cleanupError) {
      console.error('Error cleaning up failed crafting transaction:', cleanupError);
    }

    if (error.message === 'Transaction in progress') {
      return res.status(429).json({ error: 'Collection already in progress' });
    }
    console.error('Error collecting crafted item:', error);
    res.status(500).json({ error: 'Failed to collect crafted item' });
  }
});

// Protected crafting start endpoint
router.post('/crafting/start-craft', async (req, res) => {
  const { playerId, gridId, stationX, stationY, recipe, transactionId, transactionKey } = req.body;
  
  if (!playerId || !gridId || stationX === undefined || stationY === undefined || !recipe || !transactionId || !transactionKey) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Find player and check transaction state
    const player = await Player.findOne({ playerId });
    if (!player) throw new Error('Player not found');

    // Check if transaction already processed (idempotency)
    const lastTxData = player.lastTransactionIds.get(transactionKey);
    const lastTxId = typeof lastTxData === 'object' ? lastTxData.id : lastTxData;
    if (lastTxId === transactionId) {
      return res.json({ success: true, message: 'Craft already started' });
    }

    // Check if there's an active transaction for this action
    if (player.activeTransactions.has(transactionKey)) {
      const activeTransaction = player.activeTransactions.get(transactionKey);
      const timeSinceStart = Date.now() - activeTransaction.timestamp.getTime();
      
      if (timeSinceStart > 30000) {
        player.activeTransactions.delete(transactionKey);
        await player.save();
      } else {
        throw new Error('Transaction in progress');
      }
    }

    // Mark transaction as active
    player.activeTransactions.set(transactionKey, {
      type: transactionKey,
      timestamp: new Date(),
      transactionId
    });
    await player.save();

    // Find the grid and validate the crafting station
    const grid = await Grid.findOne({ _id: gridId });
    if (!grid) {
      player.activeTransactions.delete(transactionKey);
      await player.save();
      return res.status(404).json({ error: 'Grid not found' });
    }

    // Find the station resource
    const stationResource = grid.resources.find(res => res.x === stationX && res.y === stationY);
    if (!stationResource) {
      player.activeTransactions.delete(transactionKey);
      await player.save();
      return res.status(400).json({ error: 'Crafting station not found' });
    }

    // Check if station is already crafting
    if (stationResource.craftEnd && stationResource.craftEnd > Date.now()) {
      player.activeTransactions.delete(transactionKey);
      await player.save();
      return res.status(400).json({ error: 'Station is already crafting' });
    }

    // Check if player can afford the recipe (server-side validation)
    const inventory = player.inventory || [];
    const backpack = player.backpack || [];
    
    // Validate ingredients
    for (let i = 1; i <= 4; i++) {
      const ingredientType = recipe[`ingredient${i}`];
      const ingredientQty = recipe[`ingredient${i}qty`];
      
      if (ingredientType && ingredientQty) {
        const inventoryQty = inventory.find(item => item.type === ingredientType)?.quantity || 0;
        const backpackQty = backpack.find(item => item.type === ingredientType)?.quantity || 0;
        const totalQty = inventoryQty + backpackQty;
        
        if (totalQty < ingredientQty) {
          player.activeTransactions.delete(transactionKey);
          await player.save();
          return res.status(400).json({ error: `Insufficient ${ingredientType}` });
        }
      }
    }

    // Spend ingredients server-side
    for (let i = 1; i <= 4; i++) {
      const ingredientType = recipe[`ingredient${i}`];
      const ingredientQty = recipe[`ingredient${i}qty`];
      
      if (ingredientType && ingredientQty) {
        let remaining = ingredientQty;
        
        // Try inventory first
        const inventoryItem = inventory.find(item => item.type === ingredientType);
        if (inventoryItem && remaining > 0) {
          const takeFromInventory = Math.min(inventoryItem.quantity, remaining);
          inventoryItem.quantity -= takeFromInventory;
          remaining -= takeFromInventory;
          
          if (inventoryItem.quantity <= 0) {
            const index = inventory.findIndex(item => item.type === ingredientType);
            inventory.splice(index, 1);
          }
        }
        
        // Then backpack if needed
        if (remaining > 0) {
          const backpackItem = backpack.find(item => item.type === ingredientType);
          if (backpackItem) {
            const takeFromBackpack = Math.min(backpackItem.quantity, remaining);
            backpackItem.quantity -= takeFromBackpack;
            remaining -= takeFromBackpack;
            
            if (backpackItem.quantity <= 0) {
              const index = backpack.findIndex(item => item.type === ingredientType);
              backpack.splice(index, 1);
            }
          }
        }
      }
    }

    // Update player inventory
    player.inventory = inventory;
    player.backpack = backpack;

    // Set up crafting on the station
    const craftTime = recipe.crafttime || 60;
    const craftEnd = Date.now() + craftTime * 1000;
    
    const resourceIndex = grid.resources.findIndex(res => res.x === stationX && res.y === stationY);
    if (resourceIndex !== -1) {
      grid.resources[resourceIndex].craftEnd = craftEnd;
      grid.resources[resourceIndex].craftedItem = recipe.type;
      grid.markModified(`resources.${resourceIndex}`);
    }

    // Save changes
    await grid.save();
    await player.save();

    // Complete transaction and cleanup old IDs
    cleanupTransactionIds(player);
    player.lastTransactionIds.set(transactionKey, { id: transactionId, timestamp: Date.now() });
    player.activeTransactions.delete(transactionKey);
    await player.save();

    res.json({ 
      success: true, 
      craftEnd,
      craftedItem: recipe.type,
      updatedResources: grid.resources,
      inventory: player.inventory,
      backpack: player.backpack
    });

  } catch (error) {
    // Cleanup on error
    try {
      const player = await Player.findOne({ playerId });
      if (player) {
        player.activeTransactions.delete(transactionKey);
        await player.save();
      }
    } catch (cleanupError) {
      console.error('Error cleaning up failed crafting start transaction:', cleanupError);
    }

    if (error.message === 'Transaction in progress') {
      return res.status(429).json({ error: 'Crafting start already in progress' });
    }
    console.error('Error starting crafting:', error);
    res.status(500).json({ error: 'Failed to start crafting' });
  }
});

// Protected farm animal collection endpoint
router.post('/farm-animal/collect', async (req, res) => {
  const { playerId, gridId, npcId, npcPosition, transactionId, transactionKey } = req.body;
  
  if (!playerId || !gridId || !npcId || !npcPosition || !transactionId || !transactionKey) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Find player and check transaction state
    const player = await Player.findOne({ playerId });
    if (!player) throw new Error('Player not found');

    // Check if transaction already processed (idempotency)
    const lastTxData = player.lastTransactionIds.get(transactionKey);
    const lastTxId = typeof lastTxData === 'object' ? lastTxData.id : lastTxData;
    if (lastTxId === transactionId) {
      return res.json({ success: true, message: 'Collection already processed' });
    }

    // Check if there's an active transaction for this action
    if (player.activeTransactions.has(transactionKey)) {
      const activeTransaction = player.activeTransactions.get(transactionKey);
      const timeSinceStart = Date.now() - activeTransaction.timestamp.getTime();
      
      if (timeSinceStart > 30000) {
        player.activeTransactions.delete(transactionKey);
        await player.save();
      } else {
        throw new Error('Transaction in progress');
      }
    }

    // Mark transaction as active
    player.activeTransactions.set(transactionKey, {
      type: transactionKey,
      timestamp: new Date(),
      transactionId
    });
    await player.save();

    // Find the grid
    const grid = await Grid.findOne({ _id: gridId });
    if (!grid) {
      player.activeTransactions.delete(transactionKey);
      await player.save();
      return res.status(404).json({ error: 'Grid not found' });
    }

    // Find the NPC in the grid's NPCs collection
    if (!grid.NPCsInGrid || !grid.NPCsInGrid.has(npcId)) {
      player.activeTransactions.delete(transactionKey);
      await player.save();
      return res.status(400).json({ error: 'NPC not found in grid' });
    }

    const npc = grid.NPCsInGrid.get(npcId);
    
    // Validate NPC is ready for collection
    if (npc.state !== 'processing') {
      player.activeTransactions.delete(transactionKey);
      await player.save();
      return res.status(400).json({ error: `NPC not ready for collection (state: ${npc.state})` });
    }

    // Load master resources to get NPC definition
    const fs = require('fs');
    const path = require('path');
    const resourcesPath = path.join(__dirname, '../tuning/resources.json');
    const masterResources = JSON.parse(fs.readFileSync(resourcesPath, 'utf-8'));
    
    const npcDefinition = masterResources.find(res => res.type === npc.type);
    if (!npcDefinition) {
      player.activeTransactions.delete(transactionKey);
      await player.save();
      return res.status(400).json({ error: 'NPC definition not found' });
    }

    // Load master skills for buff calculations
    const skillsPath = path.join(__dirname, '../tuning/skillsTuning.json');
    const masterSkills = JSON.parse(fs.readFileSync(skillsPath, 'utf-8'));

    // Calculate collection quantity with skill buffs
    const baseQuantity = npcDefinition.qtycollected || 1;
    const playerSkills = player.skills || [];
    
    // Find applicable skill buffs
    const skillsApplied = playerSkills
      .filter(skill => {
        const skillDef = masterResources.find(res => res.type === skill.type);
        const isSkill = skillDef?.category === 'skill' || skillDef?.category === 'upgrade';
        const applies = (masterSkills?.[skill.type]?.[npcDefinition.output] || 1) > 1;
        return isSkill && applies;
      })
      .map(skill => skill.type);

    const skillMultiplier = skillsApplied.reduce((mult, skillType) => {
      const boost = masterSkills?.[skillType]?.[npcDefinition.output] || 1;
      return mult * boost;
    }, 1);

    const collectedQuantity = Math.floor(baseQuantity * skillMultiplier);
    const collectedItem = npcDefinition.output;

    // Don't add items to inventory on server - let client handle with gainIngredients
    // This ensures Gold Pass warehouse bonus is properly respected

    // Update NPC state to 'emptystall'
    npc.state = 'emptystall';
    npc.hp = 0;
    grid.NPCsInGrid.set(npcId, npc);
    grid.markModified('NPCsInGrid');

    // Complete transaction and cleanup old IDs
    cleanupTransactionIds(player);
    player.lastTransactionIds.set(transactionKey, { id: transactionId, timestamp: Date.now() });
    player.activeTransactions.delete(transactionKey);

    // Save all changes in a single operation
    await Promise.all([
      grid.save(),
      player.save()
    ]);

    res.json({ 
      success: true, 
      collectedQuantity,
      collectedItem,
      skillsApplied,
      updatedNPC: {
        state: 'emptystall',
        hp: 0
      }
    });

  } catch (error) {
    // Cleanup on error
    try {
      const player = await Player.findOne({ playerId });
      if (player) {
        player.activeTransactions.delete(transactionKey);
        await player.save();
      }
    } catch (cleanupError) {
      console.error('Error cleaning up failed farm animal transaction:', cleanupError);
    }

    if (error.message === 'Transaction in progress') {
      return res.status(429).json({ error: 'Collection already in progress' });
    }
    console.error('Error collecting from farm animal:', error);
    res.status(500).json({ error: 'Failed to collect from farm animal' });
  }
});

// Protected sell for refund endpoint
router.post('/sell-for-refund', async (req, res) => {
  const { playerId, gridId, stationX, stationY, stationType, transactionId, transactionKey } = req.body;
  
  if (!playerId || !gridId || stationX === undefined || stationY === undefined || !stationType || !transactionId || !transactionKey) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Find player and check transaction state
    const player = await Player.findOne({ playerId });
    if (!player) throw new Error('Player not found');

    // Check if transaction already processed (idempotency)
    const lastTxData = player.lastTransactionIds.get(transactionKey);
    const lastTxId = typeof lastTxData === 'object' ? lastTxData.id : lastTxData;
    if (lastTxId === transactionId) {
      return res.json({ success: true, message: 'Station already sold' });
    }

    // Check if there's an active transaction for this action
    if (player.activeTransactions.has(transactionKey)) {
      const activeTransaction = player.activeTransactions.get(transactionKey);
      const timeSinceStart = Date.now() - activeTransaction.timestamp.getTime();
      
      if (timeSinceStart > 30000) {
        player.activeTransactions.delete(transactionKey);
        await player.save();
      } else {
        throw new Error('Transaction in progress');
      }
    }

    // Mark transaction as active
    player.activeTransactions.set(transactionKey, {
      type: transactionKey,
      timestamp: new Date(),
      transactionId
    });
    await player.save();

    // Find the grid and validate the station
    const grid = await Grid.findOne({ _id: gridId });
    if (!grid) {
      player.activeTransactions.delete(transactionKey);
      await player.save();
      return res.status(404).json({ error: 'Grid not found' });
    }

    // Find the station resource
    const stationResource = grid.resources.find(res => res.x === stationX && res.y === stationY);
    if (!stationResource || stationResource.type !== stationType) {
      player.activeTransactions.delete(transactionKey);
      await player.save();
      return res.status(400).json({ error: 'Station not found or type mismatch' });
    }

    // Load master resources to get station definition and refund ingredients
    const fs = require('fs');
    const path = require('path');
    const resourcesPath = path.join(__dirname, '../tuning/resources.json');
    const masterResources = JSON.parse(fs.readFileSync(resourcesPath, 'utf-8'));
    
    const stationDefinition = masterResources.find(res => res.type === stationType);
    if (!stationDefinition) {
      player.activeTransactions.delete(transactionKey);
      await player.save();
      return res.status(400).json({ error: 'Station definition not found' });
    }

    // Calculate refund ingredients
    const refundIngredients = [];
    for (let i = 1; i <= 3; i++) {
      const ingredientType = stationDefinition[`ingredient${i}`];
      const ingredientQty = stationDefinition[`ingredient${i}qty`];
      if (ingredientType && ingredientQty) {
        refundIngredients.push({ type: ingredientType, quantity: ingredientQty });
      }
    }

    if (refundIngredients.length === 0) {
      player.activeTransactions.delete(transactionKey);
      await player.save();
      return res.status(400).json({ error: 'No refund ingredients found' });
    }

    // Add refund items to player inventory
    const inventory = player.inventory || [];
    let totalMoneyRefund = 0;

    for (const { type, quantity } of refundIngredients) {
      if (type === 'Money') {
        totalMoneyRefund += quantity;
      }
      
      const existingItem = inventory.find(item => item.type === type);
      if (existingItem) {
        existingItem.quantity += quantity;
      } else {
        inventory.push({ type, quantity });
      }
    }
    
    player.inventory = inventory;

    // Don't remove station from grid here - let client handle via updateGridResource
    // This ensures proper socket broadcasting to other players
    
    // Save player changes only
    await player.save();

    // Complete transaction and cleanup old IDs
    cleanupTransactionIds(player);
    player.lastTransactionIds.set(transactionKey, { id: transactionId, timestamp: Date.now() });
    player.activeTransactions.delete(transactionKey);
    await player.save();

    res.json({ 
      success: true, 
      refundIngredients,
      totalMoneyRefund,
      inventory: player.inventory,
      removedStation: { x: stationX, y: stationY, type: stationType }
    });

  } catch (error) {
    // Cleanup on error
    try {
      const player = await Player.findOne({ playerId });
      if (player) {
        player.activeTransactions.delete(transactionKey);
        await player.save();
      }
    } catch (cleanupError) {
      console.error('Error cleaning up failed sell transaction:', cleanupError);
    }

    if (error.message === 'Transaction in progress') {
      return res.status(429).json({ error: 'Sale already in progress' });
    }
    console.error('Error selling station for refund:', error);
    res.status(500).json({ error: 'Failed to sell station' });
  }
});

// Protected bulk harvest/replant endpoint
router.post('/bulk-harvest', async (req, res) => {
  const { playerId, gridId, operations, transactionId, transactionKey } = req.body;
  
  if (!playerId || !gridId || !operations || !Array.isArray(operations) || operations.length === 0 || !transactionId || !transactionKey) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Find player and check transaction state
    const player = await Player.findOne({ playerId });
    if (!player) throw new Error('Player not found');

    // Check if transaction already processed (idempotency)
    const lastTxData = player.lastTransactionIds.get(transactionKey);
    const lastTxId = typeof lastTxData === 'object' ? lastTxData.id : lastTxData;
    if (lastTxId === transactionId) {
      return res.json({ success: true, message: 'Bulk harvest already processed' });
    }

    // Check if there's an active transaction for this action
    if (player.activeTransactions.has(transactionKey)) {
      const activeTransaction = player.activeTransactions.get(transactionKey);
      const timeSinceStart = Date.now() - activeTransaction.timestamp.getTime();
      
      if (timeSinceStart > 30000) {
        player.activeTransactions.delete(transactionKey);
        await player.save();
      } else {
        throw new Error('Transaction in progress');
      }
    }

    // Mark transaction as active
    player.activeTransactions.set(transactionKey, {
      type: transactionKey,
      timestamp: new Date(),
      transactionId
    });
    await player.save();

    // Find the grid
    const grid = await Grid.findOne({ _id: gridId });
    if (!grid) {
      player.activeTransactions.delete(transactionKey);
      await player.save();
      return res.status(404).json({ error: 'Grid not found' });
    }

    // Load master resources and skills
    const fs = require('fs');
    const path = require('path');
    const resourcesPath = path.join(__dirname, '../tuning/resources.json');
    const skillsPath = path.join(__dirname, '../tuning/skillsTuning.json');
    const masterResources = JSON.parse(fs.readFileSync(resourcesPath, 'utf-8'));
    const masterSkills = JSON.parse(fs.readFileSync(skillsPath, 'utf-8'));

    // Calculate warehouse and backpack capacities with skills
    // Match the client-side logic from deriveWarehouseAndBackpackCapacity
    const baseWarehouse = player.warehouseCapacity || 0;
    const baseBackpack = player.backpackCapacity || 0;
    const isGold = player.accountStatus === "Gold";
    const warehouseBonus = isGold ? 1000000 : 0;
    const backpackBonus = isGold ? 1000000 : 0;

    let warehouseCapacity = baseWarehouse + warehouseBonus;
    let backpackCapacity = baseBackpack + backpackBonus;

    // Add skill bonuses
    (player.skills || []).forEach(skill => {
      const skillDetails = masterResources.find(res => res.type === skill.type);
      if (skillDetails) {
        const bonus = skillDetails.qtycollected || 0;
        if (skillDetails.output === 'warehouseCapacity') {
          warehouseCapacity += bonus;
        } else if (skillDetails.output === 'backpackCapacity') {
          backpackCapacity += bonus;
        }
      }
    });

    // Calculate current usage (exclude Money and Gem)
    const currentWarehouseUsage = (player.inventory || [])
      .filter(item => item.type !== 'Money' && item.type !== 'Gem')
      .reduce((sum, item) => sum + (item.quantity || 0), 0);
    const currentBackpackUsage = (player.backpack || [])
      .filter(item => item.type !== 'Money' && item.type !== 'Gem')
      .reduce((sum, item) => sum + (item.quantity || 0), 0);
    const totalCapacity = warehouseCapacity + backpackCapacity;
    const currentTotalUsage = currentWarehouseUsage + currentBackpackUsage;
    const availableSpace = totalCapacity - currentTotalUsage;

    // Track harvest results
    const harvestResults = {
      harvested: {},
      replanted: {},
      failed: [],
      totalYield: 0,
      seedsUsed: {}
    };

    // Process each operation
    for (const operation of operations) {
      const { cropType, positions, replant, expectedYield } = operation;
      
      if (!cropType || !positions || !Array.isArray(positions) || positions.length === 0) {
        harvestResults.failed.push({ cropType, reason: 'Invalid operation data' });
        continue;
      }

      const baseCrop = masterResources.find(r => r.type === cropType);
      if (!baseCrop) {
        harvestResults.failed.push({ cropType, reason: 'Unknown crop type' });
        continue;
      }

      // Trust client's expectedYield which includes skill calculations
      // Server doesn't calculate skills - that's handled client-side
      const totalYieldForType = expectedYield || positions.length;

      // Check if we have enough space for this harvest
      if (harvestResults.totalYield + totalYieldForType > availableSpace) {
        harvestResults.failed.push({ 
          cropType, 
          reason: 'Not enough inventory space',
          needed: totalYieldForType,
          available: availableSpace - harvestResults.totalYield
        });
        continue;
      }

      // Harvest each position
      const harvestedPositions = [];
      for (const pos of positions) {
        // First try to find the crop
        let resourceIndex = grid.resources.findIndex(r => r.x === pos.x && r.y === pos.y && r.type === cropType);
        
        // If not found, check if there's a farmplot that produces this crop (race condition handling)
        if (resourceIndex === -1) {
          // Find the farmplot type that produces this crop
          const farmplot = masterResources.find(r => 
            r.category === 'farmplot' && r.output === cropType
          );
          
          if (farmplot) {
            // Look for the farmplot at this position
            resourceIndex = grid.resources.findIndex(r => 
              r.x === pos.x && r.y === pos.y && r.type === farmplot.type
            );
            
            if (resourceIndex !== -1) {
              const resource = grid.resources[resourceIndex];
              
              // Check if it's ready to harvest (growEnd in the past)
              if (resource.growEnd && new Date(resource.growEnd) <= new Date()) {
                // The farmplot is ready - we can harvest it
              } else if (!resource.growEnd) {
                // No growEnd means it might be a crop already (data inconsistency)
              } else {
                // Not ready yet
                resourceIndex = -1; // Reset to skip this one
              }
            }
          }
        }
        
        if (resourceIndex !== -1) {
          grid.resources.splice(resourceIndex, 1);
          harvestedPositions.push(pos);
        }
      }

      if (harvestedPositions.length > 0) {
        // Use the client's expected yield which includes skill bonuses
        const actualYield = totalYieldForType;
        harvestResults.harvested[cropType] = {
          count: harvestedPositions.length,
          quantity: actualYield,
          positions: harvestedPositions
        };
        harvestResults.totalYield += actualYield;

        // Add to player inventory
        const existingItem = player.inventory.find(item => item.type === cropType);
        if (existingItem) {
          existingItem.quantity += actualYield;
        } else {
          player.inventory.push({ type: cropType, quantity: actualYield });
        }
      }

      // Handle replanting if requested
      if (replant && harvestedPositions.length > 0) {
        // Find the farmplot that produces this crop
        const farmplot = masterResources.find(r => 
          r.category === 'farmplot' && r.output === cropType
        );

        if (farmplot) {
          // Check and consume seeds
          const seedsNeeded = {};
          for (let i = 1; i <= 4; i++) {
            const ingredientType = farmplot[`ingredient${i}`];
            const ingredientQty = farmplot[`ingredient${i}qty`];
            
            if (ingredientType && ingredientQty) {
              const totalNeeded = ingredientQty * harvestedPositions.length;
              seedsNeeded[ingredientType] = totalNeeded;
            }
          }

          // Check if player has enough seeds
          let canReplant = true;
          const seedsToConsume = {};
          
          for (const [seedType, needed] of Object.entries(seedsNeeded)) {
            const inInventory = player.inventory?.find(item => item.type === seedType)?.quantity || 0;
            const inBackpack = player.backpack?.find(item => item.type === seedType)?.quantity || 0;
            const totalHas = inInventory + inBackpack;
            
            if (totalHas < needed) {
              canReplant = false;
              harvestResults.failed.push({
                cropType,
                reason: `Not enough ${seedType} for replanting`,
                needed,
                has: totalHas
              });
              break;
            }
            seedsToConsume[seedType] = needed;
          }

          if (canReplant) {
            // Consume seeds from backpack first, then inventory
            for (const [seedType, needed] of Object.entries(seedsToConsume)) {
              let remaining = needed;
              
              // Take from backpack first
              const backpackItem = player.backpack?.find(item => item.type === seedType);
              if (backpackItem && backpackItem.quantity > 0) {
                const toTake = Math.min(remaining, backpackItem.quantity);
                backpackItem.quantity -= toTake;
                remaining -= toTake;
                
                if (backpackItem.quantity === 0) {
                  player.backpack = player.backpack.filter(item => item.type !== seedType);
                }
              }
              
              // Take remaining from inventory
              if (remaining > 0) {
                const invItem = player.inventory.find(item => item.type === seedType);
                if (invItem) {
                  invItem.quantity -= remaining;
                  if (invItem.quantity === 0) {
                    player.inventory = player.inventory.filter(item => item.type !== seedType);
                  }
                }
              }

              harvestResults.seedsUsed[seedType] = (harvestResults.seedsUsed[seedType] || 0) + needed;
            }

            // Add new farmplots
            const seasonLevel = getSeasonLevel();
            const currentTime = Date.now();
            
            for (const pos of harvestedPositions) {
              // Match the exact format from handleFarmPlotPlacement
              const growEndTime = currentTime + (farmplot.growtime || 0) * 1000;
              
              grid.resources.push({
                type: farmplot.type,
                x: pos.x,
                y: pos.y,
                growEnd: growEndTime,
                state: 'growingtimer',
                passable: true,
                seasonLevel: seasonLevel,
                // Include output for crop conversion (matching farmState.addSeed)
                output: farmplot.output
              });
            }

            harvestResults.replanted[cropType] = {
              farmplotType: farmplot.type,
              count: harvestedPositions.length,
              growtime: farmplot.growtime,
              positions: harvestedPositions
            };
          }
        }
      }
    }

    // Save grid and player changes
    await grid.save();
    await player.save();

    // Complete transaction and cleanup old IDs
    cleanupTransactionIds(player);
    player.lastTransactionIds.set(transactionKey, { id: transactionId, timestamp: Date.now() });
    player.activeTransactions.delete(transactionKey);
    await player.save();

    res.json({
      success: true,
      results: harvestResults,
      inventory: {
        warehouse: player.inventory,
        backpack: player.backpack,
        capacities: {
          warehouse: { used: currentWarehouseUsage, total: warehouseCapacity },
          backpack: { used: currentBackpackUsage, total: backpackCapacity }
        }
      }
    });

  } catch (error) {
    // Cleanup on error
    try {
      const player = await Player.findOne({ playerId });
      if (player) {
        player.activeTransactions.delete(transactionKey);
        await player.save();
      }
    } catch (cleanupError) {
      console.error('Error cleaning up failed bulk harvest transaction:', cleanupError);
    }

    if (error.message === 'Transaction in progress') {
      return res.status(429).json({ error: 'Bulk harvest already in progress' });
    }
    console.error('Error in bulk harvest:', error);
    res.status(500).json({ error: 'Failed to process bulk harvest' });
  }
});

// Bulk crafting collection endpoint
router.post('/crafting/collect-bulk', async (req, res) => {
  const { playerId, gridId, stations } = req.body;
  
  if (!playerId || !gridId || !Array.isArray(stations) || stations.length === 0) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Find player
    const player = await Player.findOne({ playerId });
    if (!player) throw new Error('Player not found');

    // Find the grid
    const grid = await Grid.findOne({ _id: gridId });
    if (!grid) {
      return res.status(404).json({ error: 'Grid not found' });
    }

    const results = [];
    const updatedInventory = [...player.inventory];
    const updatedBackpack = [...player.backpack];
    
    // Process each station
    for (const station of stations) {
      const { x, y, craftedItem, transactionId, shouldRestart, restartRecipe } = station;
      
      try {
        // Find the station resource
        const stationResource = grid.resources.find(res => res.x === x && res.y === y);
        if (!stationResource || !stationResource.craftEnd || !stationResource.craftedItem) {
          results.push({ 
            success: false, 
            station, 
            error: 'No crafted item ready at this location' 
          });
          continue;
        }

        // Validate the item matches and is ready
        if (stationResource.craftedItem !== craftedItem || stationResource.craftEnd > Date.now()) {
          results.push({ 
            success: false, 
            station, 
            error: 'Item not ready for collection' 
          });
          continue;
        }

        // Get item details
        const itemResource = masterResources.find(res => res.type === craftedItem);
        if (!itemResource) {
          results.push({ 
            success: false, 
            station, 
            error: 'Invalid crafted item' 
          });
          continue;
        }

        // Handle NPCs vs regular items
        const isNPC = itemResource.category === 'npc';
        
        // Don't add items to inventory on server - let client handle with skill buffs
        // This matches how individual crafting collection works

        // Clear the crafting state from the station
        const resourceIndex = grid.resources.findIndex(res => res.x === x && res.y === y);
        if (resourceIndex !== -1) {
          delete grid.resources[resourceIndex].craftEnd;
          delete grid.resources[resourceIndex].craftedItem;
          grid.markModified(`resources.${resourceIndex}`);
        }

        // Handle restart if requested
        let restarted = false;
        let newCraftEnd = null;
        let newCraftedItem = null;
        
        if (shouldRestart && restartRecipe && !isNPC) {
          // Check skill requirements first
          const hasRequiredSkill = !restartRecipe.requires || 
            (player.skills && player.skills.some(skill => skill.type === restartRecipe.requires));
          
          if (!hasRequiredSkill) {
            console.log(`Player missing required skill ${restartRecipe.requires} for ${restartRecipe.type}`);
          } else {
            // Check if player can afford the recipe
            const canAfford = checkCanAfford(restartRecipe, updatedInventory, updatedBackpack);
            
            if (canAfford) {
              // Spend ingredients
              const spent = spendIngredients(restartRecipe, updatedInventory, updatedBackpack);
              
              if (spent) {
                // Get craft time from masterResources (in seconds)
                const craftedResource = masterResources.find(r => r.type === restartRecipe.type);
                const craftTimeSeconds = craftedResource?.crafttime || restartRecipe.crafttime || 60;
                newCraftEnd = Date.now() + (craftTimeSeconds * 1000);
                newCraftedItem = restartRecipe.type;
                
                // Set new craft on station
                grid.resources[resourceIndex].craftEnd = newCraftEnd;
                grid.resources[resourceIndex].craftedItem = newCraftedItem;
                grid.markModified(`resources.${resourceIndex}`);
                
                restarted = true;
              }
            }
          }
        }

        results.push({ 
          success: true, 
          station,
          collectedItem: craftedItem,
          isNPC,
          restarted,
          newCraftEnd,
          newCraftedItem
        });
        
      } catch (stationError) {
        console.error(`Error processing station (${station.x}, ${station.y}):`, stationError);
        results.push({ 
          success: false, 
          station, 
          error: stationError.message 
        });
      }
    }

    // Save grid changes only (inventory updates handled by client)
    await grid.save();
    await player.save();

    res.json({ 
      success: true, 
      results,
      inventory: {
        warehouse: player.inventory,
        backpack: player.backpack
      }
    });

  } catch (error) {
    console.error('Error in bulk crafting collection:', error);
    res.status(500).json({ error: 'Failed to process bulk crafting' });
  }
});

// Helper function to check if player can afford recipe
function checkCanAfford(recipe, inventory, backpack) {
  for (let i = 1; i <= 4; i++) {
    const ingredientType = recipe[`ingredient${i}`];
    const ingredientQty = recipe[`ingredient${i}qty`];
    
    if (ingredientType && ingredientQty > 0) {
      const invItem = inventory.find(item => item.type === ingredientType);
      const backpackItem = backpack.find(item => item.type === ingredientType);
      const totalQty = (invItem?.quantity || 0) + (backpackItem?.quantity || 0);
      
      if (totalQty < ingredientQty) {
        return false;
      }
    }
  }
  return true;
}

// Helper function to spend ingredients from inventory/backpack
function spendIngredients(recipe, inventory, backpack) {
  // First check if we can afford everything
  if (!checkCanAfford(recipe, inventory, backpack)) {
    return false;
  }

  // Then spend the ingredients
  for (let i = 1; i <= 4; i++) {
    const ingredientType = recipe[`ingredient${i}`];
    let ingredientQty = recipe[`ingredient${i}qty`];
    
    if (ingredientType && ingredientQty > 0) {
      // Try to spend from inventory first
      const invItem = inventory.find(item => item.type === ingredientType);
      if (invItem && invItem.quantity > 0) {
        const spent = Math.min(invItem.quantity, ingredientQty);
        invItem.quantity -= spent;
        ingredientQty -= spent;
        
        // Remove item if quantity reaches 0
        if (invItem.quantity === 0) {
          const index = inventory.indexOf(invItem);
          inventory.splice(index, 1);
        }
      }
      
      // Then spend remaining from backpack
      if (ingredientQty > 0) {
        const backpackItem = backpack.find(item => item.type === ingredientType);
        if (backpackItem && backpackItem.quantity >= ingredientQty) {
          backpackItem.quantity -= ingredientQty;
          
          // Remove item if quantity reaches 0
          if (backpackItem.quantity === 0) {
            const index = backpack.indexOf(backpackItem);
            backpack.splice(index, 1);
          }
        }
      }
    }
  }
  
  return true;
}

module.exports = router;



