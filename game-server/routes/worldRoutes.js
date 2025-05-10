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
const { generateGrid, generateResources } = require('../utils/worldUtils');
//const tileTypesPath = path.resolve(__dirname, '../layouts/tileTypes.json');
//const tileTypes = JSON.parse(fs.readFileSync(tileTypesPath, 'utf-8'));
const masterResources = require('../tuning/resources.json'); // Import resources.json directly
const { getTemplate, getHomesteadLayoutFile } = require('../utils/templateUtils');
const queue = require('../queue'); // Import the in-memory queue


///////////////////////////////////////////////////////////////
// GRID ROUTES 
///////////////////////////////////////////////////////////////


// create-grid
router.post('/create-grid', async (req, res) => {
  const { gridCoord, gridType, settlementId, frontierId } = req.body;

  console.log('Incoming request: /create-grid');
  console.log('req.body = ', req.body);

  // Validate required fields
  if (!gridCoord || !gridType || !settlementId || !frontierId) {
    return res.status(400).json({ error: 'gridCoord, gridType, settlementId, and frontierId are required.' });
  }

  try {
    // 1) Fetch the settlement & frontier
    const settlement = await Settlement.findById(settlementId);
    if (!settlement) return res.status(404).json({ error: 'Settlement not found.' });

    const frontier = await Frontier.findById(frontierId);
    if (!frontier) return res.status(404).json({ error: 'Frontier not found.' });

    // 2) Locate the target sub-grid in the settlement by gridCoord
    //    Flatten the 2D array to find the matching subdocument
    //    If your schema stores gridCoord as a number, parse it here.
    const targetGrid = settlement.grids.flat().find( (g) => g.gridCoord === Number(gridCoord) );
    if (!targetGrid) { return res.status(400).json({error: `No sub-grid found in settlement for gridCoord: ${gridCoord}`,}); }

    // 3) Load the correct grid template — seasonal override if gridType is 'homestead'
    let layoutFileName, layout;
    if (gridType === 'homestead') {
      const seasonType = frontier.seasons?.seasonType || 'default'; // e.g., Spring, Summer
      const seasonalLayoutFile = getHomesteadLayoutFile(seasonType); // fallback-safe helper
      const seasonalPath = path.join(__dirname, '../layouts/gridLayouts/homestead', seasonalLayoutFile);
      layout = readJSON(seasonalPath);
      layoutFileName = seasonalLayoutFile;
      console.log(`🌱 Using seasonal homestead layout: ${seasonalLayoutFile}`);
    } else {
      // First, check for a fixed layout in valleyFixedCoord
      const fixedCoordPath = path.join(__dirname, `../layouts/gridLayouts/valleyFixedCoord/${gridCoord}.json`);
      if (fs.existsSync(fixedCoordPath)) {
        layout = readJSON(fixedCoordPath);
        layoutFileName = `${gridCoord}.json`;
        console.log(`📌 Using fixed-coordinate layout: ${layoutFileName}`);
      } else {
        const templateData = getTemplate('gridLayouts', gridType, gridCoord);
        layout = templateData.template;
        layoutFileName = templateData.fileName;
        console.log(`📦 Using standard grid layout: ${layoutFileName}`);
      }
    }
    if (!layout || !layout.tiles || !layout.resources || !layout.tileDistribution || !layout.resourceDistribution) {
      return res.status(400).json({ error: `Invalid layout for gridType: ${gridType}` });
    }

    // 4) Generate tiles using `tileDistribution`
    console.log(`📌 Generating tiles using in-template tile distribution...`);
    const newTiles = generateGrid(layout, layout.tileDistribution).map(row =>
      row.map(layoutKey => {
        const tileResource = masterResources.find(res => res.layoutkey === layoutKey && res.category === "tile");
        return tileResource ? tileResource.type : "g"; // Default to "g" if missing
      })
    );    
    // 5) Generate resources using `resourceDistribution`
    console.log(`📌 Generating resources using in-template resource distribution...`);
    const newResources = generateResources(layout, newTiles, layout.resourceDistribution); // ✅ Uses `layout.resourceDistribution`


    // 6) Separate NPCs into gridStateNPCs Map
    const newGridState = { npcs: {} };
    layout.resources.forEach((row, y) => {
      row.forEach((cell, x) => {
        const resourceEntry = masterResources.find(res => res.layoutkey === cell);
        if (resourceEntry && resourceEntry.category === 'npc') {
          console.log(`📌 Placing NPC "${resourceEntry.type}" at (${x}, ${y})`);
          const npcId = new ObjectId();
          newGridState.npcs[npcId.toString()] = {
            id: npcId.toString(),
            type: resourceEntry.type,
            position: { x, y },
            state: resourceEntry.defaultState || 'idle',
            hp: Math.max(resourceEntry.hp || 10, 0),
            maxhp: resourceEntry.maxhp || 10,
            lastUpdated: 0,
          };
        }
      });
    });

    // 7) Create the actual Grid document
    const newGrid = new Grid({
      gridType,
      frontierId,
      settlementId,
      tiles: newTiles,
      resources: newResources,
      gridStateNPCs: new Map(Object.entries(newGridState.npcs)),
      gridStateNPCsLastUpdated: Date.now(),
    });
    await newGrid.save();

    // 8) Update the settlement sub-grid to reference this new Grid
    targetGrid.available = false;
    targetGrid.gridId = newGrid._id;
    await settlement.save();
    console.log(`New Grid created successfully with ID: ${newGrid._id} for gridCoord: ${gridCoord}`);

    // 9) Respond to client
    res.status(201).json({
      success: true,
      gridId: newGrid._id,
      message: 'Grid created successfully.',
    });
  } catch (error) {
    console.error('Error creating grid:', error);
    res.status(500).json({ error: 'Failed to create grid.' });
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
    console.log(`Resetting grid with ID: ${gridId}, Type: ${gridType}`);

    // Step 1: Load the Grid first so we can use frontierId for seasonal layouts
    const grid = await Grid.findById(gridId);
    if (!grid) {
      console.error(`Grid not found for ID: ${gridId}`);
      return res.status(404).json({ error: 'Grid not found.' });
    }

    // Step 2: Fetch layout based on gridType — with seasonal override for homesteads
    let layout, layoutFileName;
    if (gridType === 'homestead') {
      const frontier = await Frontier.findById(grid.frontierId);
      if (!frontier) {
        return res.status(404).json({ error: 'Associated frontier not found.' });
      }

      const seasonType = frontier?.seasons?.seasonType || 'default';
      const layoutFile = getHomesteadLayoutFile(seasonType);
      const seasonalPath = path.join(__dirname, '../layouts/gridLayouts/homestead', layoutFile);
      layout = readJSON(seasonalPath);
      layoutFileName = layoutFile;
      console.log(`🌱 Using seasonal homestead layout for reset: ${layoutFile}`);
    } else {
      // First, check for a fixed layout in valleyFixedCoord
      console.log(`Checking for fixed layout at: ${gridCoord}`);
      const fixedCoordPath = path.join(__dirname, `../layouts/gridLayouts/valleyFixedCoord/${gridCoord}.json`);
      if (fs.existsSync(fixedCoordPath)) {
        layout = readJSON(fixedCoordPath);
        layoutFileName = `${gridCoord}.json`;
        console.log(`📌 Using fixed-coordinate layout: ${layoutFileName}`);
      } else {
        const layoutInfo = getTemplate('gridLayouts', gridType, gridCoord);
        layout = layoutInfo.template;
        layoutFileName = layoutInfo.fileName;
        console.log(`📦 Using standard grid layout: ${layoutFileName}`);
      }
    }

    // Step 3: Validate layout content
    if (!layout || !layout.tiles || !layout.resources) {
      console.error(`Invalid layout for gridType: ${gridType}`);
      return res.status(400).json({ error: `Invalid layout for gridType: ${gridType}` });
    }

    // Generate new tiles
    const newTiles = generateGrid(layout, layout.tileDistribution).map(row =>
      row.map(layoutKey => {
        const tileResource = masterResources.find(res => res.layoutkey === layoutKey && res.category === "tile");
        return tileResource ? tileResource.type : "g"; // Default to "g" if missing
      })
    );

    // Step 5: Generate resources
    const newResources = generateResources(layout, newTiles, layout.resourceDistribution);

    // ✅ Step 6: Preserve existing PCs, only if not a homestead reset
    // NOT NEEDED, NOW THAT NPCS ARE IN A SEPERATE GRIDSTATE STRUCTURE FROM PCS; LEAVE PCS ALONE
    // let existingPCs = {};
    // if (gridType !== "homestead") {
    //   existingPCs = grid.gridStatePCs?.pcs || {};
    // }
    
    const newNPCGridState = { npcs: {} };

    // Process layout resources, separating NPCs into gridState
    layout.resources.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (cell && cell.type && masterResources.find(r => r.type === cell.type)?.category === 'npc') {
          const npcTemplate = masterResources.find(r => r.type === cell.type);
          if (npcTemplate) {
            const npcId = `${cell.type}_${x}_${y}`;
            newNPCGridState.npcs[npcId] = {
              id: npcId,
              type: cell.type,
              position: { x, y },
              state: 'idle',
              hp: Math.max(npcTemplate.hp || 10, 0),
              maxhp: npcTemplate.maxhp || 10,
              lastUpdated: 0
            };
          }
        }
      });
    });

    // Reset tiles, resources, and gridState
    grid.tiles = newTiles;
    grid.resources = newResources;
    grid.gridStateNPCs = new Map(Object.entries(newNPCGridState.npcs));
    grid.gridStateNPCsLastUpdated = Date.now();

    await grid.save();

    console.log(`Grid reset successfully for ID: ${gridId}, Type: ${gridType}`);
    res.status(200).json({ success: true, message: 'Grid reset successfully.' });

  } catch (error) {
    console.error('Error resetting grid:', error);
    res.status(500).json({ error: 'Failed to reset grid.' });
  }
});

router.post('/claim-homestead/:gridId', async (req, res) => {
  const { gridId } = req.params;
  const { playerId } = req.body; // or from session token, etc.

  if (!playerId) {
    return res.status(400).json({ error: 'No playerId provided to claim homestead.' });
  }

  try {
    const grid = await Grid.findById(gridId);
    if (!grid) return res.status(404).json({ error: 'Grid not found.' });

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

  console.log('🔄 update-grid request received.');
  console.log('🔹 newResourceType =', type);
  console.log(`🔹 Coordinates: (${x}, ${y})`);
  console.log('🔹 growEnd:', growEnd);
  console.log('🔹 craftEnd:', craftEnd);
  console.log('🔹 craftedItem:', craftedItem);

  if (!mongoose.Types.ObjectId.isValid(gridId)) {
    return res.status(400).json({ error: 'Invalid gridId.' });
  }

  if (typeof x !== 'number' || typeof y !== 'number') {
    return res.status(400).json({ error: 'Invalid x or y coordinates.' });
  }

  // Enqueue the update task
  queue.enqueue(async () => {
    try {
      const grid = await Grid.findById(gridId);
      if (!grid) {
        console.error(`Grid not found for _id: ${gridId}`);
        return; // Avoid sending a response here since it's already enqueued
      }
      console.log(`⏳ update-grid: ${Date.now() - startTime}ms`);

      // **Find the resource at the specified location**
      const resourceIndex = grid.resources.findIndex((res) => res.x === x && res.y === y);
      if (type) {
        if (resourceIndex !== -1) {

          // ✅ CASE 1: Resource Exists - Determine if we're appending or replacing
          if (growEnd !== undefined || craftEnd !== undefined || craftedItem !== undefined) {
            console.log(`🛠 Updating existing resource at (${x}, ${y})`);
            console.log('🔹 craftEnd:', craftEnd, '| craftedItem:', craftedItem);

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
            console.log(`🔄 Updating resource at (${x}, ${y}) with: ${type}`);
            grid.resources[resourceIndex] = {
              ...grid.resources[resourceIndex], // Preserve everything
              type,
              x,
              y,
              ...(growEnd !== undefined && { growEnd }),
              ...(craftEnd !== undefined && { craftEnd }),
              ...(craftedItem !== undefined && { craftedItem }),
            };
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
      
      // Log BEFORE saving
      console.log(`🔍 Before saving - Resource at (${x}, ${y}):`, JSON.stringify(grid.resources[resourceIndex], null, 2));
      
      // Save changes to the database
      await grid.save();
      
      // Log AFTER saving
      const updatedGrid = await Grid.findById(gridId); // **Refetch the grid from MongoDB**
      const updatedResource = updatedGrid.resources.find((res) => res.x === x && res.y === y);
      
      console.log(`✅ After saving - Resource at (${x}, ${y}):`, JSON.stringify(updatedResource, null, 2));
      console.log(`Grid updated successfully for _id: ${gridId}`);
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

    // 2) Enrich resources with masterResources data
    const enrichedResources = gridDocument.resources.map((resource) => {
      const resourceTemplate = masterResources.find((res) => res.type === resource.type);

      if (!resourceTemplate) {
        console.warn(`Resource template not found for type: ${resource.type}`);
        return { ...resource }; // Return the resource as-is if no template
      }

      // Merge attributes from the resource template with instance-specific attributes
      return {
        ...resourceTemplate, // All static attributes
        ...resource,         // Instance-specific (growEnd, x, y)
      };
    });

    // 3) Construct the enriched grid data structure
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

// Endpoint to fetch a specific resource at (x, y) in the grid
router.get('/get-resource/:gridId/:col/:row', async (req, res) => {
  const { gridId, col, row } = req.params;

  try {
    console.log(`Fetching resource at (${col}, ${row}) in grid ${gridId}`);

    // Fetch the grid by its MongoDB _id
    const grid = await Grid.findOne({ _id: gridId });

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

// Add this near other debug/admin routes
router.post('/debug/refresh-bank-offers/:frontierId', async (req, res) => {
  try {
    // Get frontier document for season data
    const frontier = await Frontier.findById(req.params.frontierId);
    if (!frontier) {
      return res.status(404).json({ error: 'Frontier not found' });
    }

    // Import bankScheduler and generate new offers
    const bankScheduler = require('../schedulers/bankScheduler');
    const newOffers = bankScheduler.generateBankOffers(frontier);

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

module.exports = router;



