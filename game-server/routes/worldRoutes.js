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

// router.post('/create-grid', async (req, res) => {
//   const { gridCoord, gridType, settlementId, frontierId } = req.body;

//   console.log('Incoming request: /create-grid');
//   console.log('req.body = ', req.body);

//   // Validate required fields
//   if (!gridCoord || !gridType || !settlementId || !frontierId) {
//     return res.status(400).json({ error: 'gridCoord, gridType, settlementId, and frontierId are required.' });
//   }

//   try {
//     // 1) Fetch the settlement & frontier
//     let settlement = await Settlement.findById(settlementId);
//     if (!settlement) {
//       // Try to find the gridCoord in all settlements if not found or settlementId is null
//       const allSettlements = await Settlement.find({});
//       for (const s of allSettlements) {
//         const flatGrids = s.grids?.flat?.() || [];
//         const match = flatGrids.find(g => g.gridCoord === Number(gridCoord));
//         if (match) {
//           settlement = s;
//           break;
//         }
//       }
//       if (!settlement) {
//         return res.status(404).json({ error: 'Settlement not found for gridCoord: ' + gridCoord });
//       }
//     }

//     const frontier = await Frontier.findById(frontierId);
//     if (!frontier) return res.status(404).json({ error: 'Frontier not found.' });

//     // 2) Locate the target sub-grid in the settlement by gridCoord
//     //    Flatten the 2D array to find the matching subdocument
//     //    If your schema stores gridCoord as a number, parse it here.
//     const targetGrid = settlement.grids.flat().find( (g) => g.gridCoord === Number(gridCoord) );
//     if (!targetGrid) { return res.status(400).json({error: `No sub-grid found in settlement for gridCoord: ${gridCoord}`,}); }
//     // Log if the gridCoord is already associated with a gridId
//     if (targetGrid.gridId) {
//       console.warn(`⚠️ Warning: targetGrid at coord ${gridCoord} already has gridId: ${targetGrid.gridId}`);
//       const existingGrid = await Grid.findById(targetGrid.gridId);
//       if (!existingGrid) {
//         console.warn(`❌ But gridId ${targetGrid.gridId} does not exist in DB! Potential orphan.`);
//       } else {
//         console.warn(`📦 Existing Grid found with gridType: ${existingGrid.gridType}, ownerId: ${existingGrid.ownerId || 'null'}`);
//       }
//     }

//     // 3) Load the correct grid template — seasonal override if gridType is 'homestead'
//     let layoutFileName, layout, isFixedLayout = false;
//     const seasonType = frontier.seasons?.seasonType || 'default'; // e.g., Spring, Summer

//     if (gridType === 'homestead') {
//       const seasonalLayoutFile = getHomesteadLayoutFile(seasonType); 
//       const seasonalPath = path.join(__dirname, '../layouts/gridLayouts/homestead', seasonalLayoutFile);
//       layout = readJSON(seasonalPath);
//       layoutFileName = seasonalLayoutFile;
//       console.log(`🗓️ Using seasonal homestead layout: ${seasonalLayoutFile}`);

//     } else if (gridType === 'town') {
//       const seasonalLayoutFile = getTownLayoutFile(seasonType); 
//       const seasonalPath = path.join(__dirname, '../layouts/gridLayouts/town', seasonalLayoutFile);
//       layout = readJSON(seasonalPath);
//       layoutFileName = seasonalLayoutFile;
//       console.log(`🗓️ Using seasonal town layout: ${seasonalLayoutFile}`);

//     } else {
//       // First, check for a fixed layout in valleyFixedCoord
//       const fixedCoordPath = path.join(__dirname, `../layouts/gridLayouts/valleyFixedCoord/${gridCoord}.json`);
//       if (fs.existsSync(fixedCoordPath)) {
//         layout = readJSON(fixedCoordPath);
//         layoutFileName = `${gridCoord}.json`;
//         isFixedLayout = true; // ✅ Track it here
//         console.log(`📌 Using fixed-coordinate layout: ${layoutFileName}`);
//       } else {
//         const templateData = getTemplate('gridLayouts', gridType, gridCoord);
//         layout = templateData.template;
//         layoutFileName = templateData.fileName;
//         console.log(`📦 Using standard grid layout: ${layoutFileName}`);
//       }
//     }
//     if (!layout || !layout.tiles || !layout.resources || !layout.tileDistribution || !layout.resourceDistribution) {
//       return res.status(400).json({ error: `Invalid layout for gridType: ${gridType}` });
//     }

//     // 4/5) Generate tiles/resources, or use fixed layout if valleyFixedCoord
//     let newTiles, newResources;
//     if (isFixedLayout) {
//       const { generateFixedGrid, generateFixedResources } = require('../utils/worldUtils');
//       console.log(`🔒 Using fixed layout tiles and resources via generateFixedGrid and generateFixedResources.`);
//       newTiles = generateFixedGrid(layout);
//       newResources = generateFixedResources(layout);
//     } else {
//       console.log('⚠️ Fixed layout condition failed. layoutFileName =', layoutFileName);
//       console.log(`📌 Generating tiles using in-template tile distribution...`);
//       newTiles = generateGrid(layout, layout.tileDistribution).map(row =>
//         row.map(layoutKey => {
//           const tileResource = masterResources.find(res => res.layoutkey === layoutKey && res.category === "tile");
//           return tileResource ? tileResource.type : "g";
//         })
//       );
//       console.log(`📌 Generating resources using in-template resource distribution...`);
//       newResources = generateResources(layout, newTiles, layout.resourceDistribution);
//     }


//     // 6) Separate NPCs into NPCsInGrid Map
//     const newGridState = { npcs: {} };
//     layout.resources.forEach((row, y) => {
//       row.forEach((cell, x) => {
//         const resourceEntry = masterResources.find(res => res.layoutkey === cell);
//         if (resourceEntry && resourceEntry.category === 'npc') {
//           console.log(`📌 Placing NPC "${resourceEntry.type}" at (${x}, ${y})`);
//           const npcId = new ObjectId();
//           newGridState.npcs[npcId.toString()] = {
//             id: npcId.toString(),
//             type: resourceEntry.type,
//             position: { x, y },
//             state: resourceEntry.defaultState || 'idle',
//             hp: resourceEntry.maxhp || 10,
//             maxhp: resourceEntry.maxhp || 10,
//             armorclass: resourceEntry.armorclass || 10,
//             attackbonus: resourceEntry.attackbonus || 0,
//             damage: resourceEntry.damage || 1,
//             attackrange: resourceEntry.attackrange || 1,
//             speed: resourceEntry.speed || 1,
//             lastUpdated: 0,
//           };
//         }
//       });
//     });

//     // 7) Create the actual Grid document
//     const newGrid = new Grid({
//       gridType,
//       frontierId,
//       settlementId,
//       tiles: newTiles,
//       resources: newResources,
//       NPCsInGrid: new Map(Object.entries(newGridState.npcs)),
//       NPCsInGridLastUpdated: Date.now(),
//     });
//     await newGrid.save();

//     // 8) Update the settlement sub-grid to reference this new Grid
//     targetGrid.available = false;
//     targetGrid.gridId = newGrid._id;
//     await settlement.save();
//     console.log(`New Grid created successfully with ID: ${newGrid._id} for gridCoord: ${gridCoord}`);

//     // 9) Respond to client
//     res.status(201).json({
//       success: true,
//       gridId: newGrid._id,
//       message: 'Grid created successfully.',
//     });
//   } catch (error) {
//     console.error('Error creating grid:', error);
//     res.status(500).json({ error: 'Failed to create grid.' });
//   }
// });


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
  const { enqueueByKey } = require('../queue');
  enqueueByKey(gridId, async () => {
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
    const seasonLevel = getSeasonLevel(frontier?.seasons?.onSeasonStart, frontier?.seasons?.onSeasonEnd);
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

      // 🔁 Also update the player's location.s if they exist
      const player = await Player.findOne({ 'location.g': fromGridId });
      if (player) {
        player.location.s = targetSettlement._id;
        await player.save();
        console.log(`✅ Player ${player.username} location.s updated to new settlementId ${targetSettlement._id}`);
      }
    }

    // STEP 2.5: Always update currentPlayer.settlementId to reflect their home settlement
    const playerToUpdate = await Player.findOne({ 'location.g': fromGridId });
    if (playerToUpdate) {
      playerToUpdate.settlementId = targetSettlement._id;
      await playerToUpdate.save();
      console.log(`✅ Player ${playerToUpdate.username} settlementId updated to ${targetSettlement._id}`);
    }

    // Step 3: Decrement the player's relocation count
    const player = await Player.findOne({ 'location.g': fromGridId });
    if (player && player.relocations > 0) {
      player.relocations -= 1;
      await player.save();
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
    const lastTxId = player.lastTransactionIds.get(transactionKey);
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
    } else {
      // Add regular items to player inventory
      const inventory = player.inventory || [];
      const existingItem = inventory.find(item => item.type === craftedItem);
      
      if (existingItem) {
        existingItem.quantity += 1;
      } else {
        inventory.push({ type: craftedItem, quantity: 1 });
      }
      
      player.inventory = inventory;
    }

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

    // Complete transaction
    player.lastTransactionIds.set(transactionKey, transactionId);
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
    const lastTxId = player.lastTransactionIds.get(transactionKey);
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

    // Complete transaction
    player.lastTransactionIds.set(transactionKey, transactionId);
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
    const lastTxId = player.lastTransactionIds.get(transactionKey);
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
    console.log('🔍 Debug - Grid NPCsInGrid structure:', grid.NPCsInGrid);
    console.log('🔍 Debug - Looking for NPC ID:', npcId);
    console.log('🔍 Debug - Grid NPCsInGrid type:', typeof grid.NPCsInGrid);
    
    if (!grid.NPCsInGrid || !grid.NPCsInGrid.has(npcId)) {
      console.log('🔍 Debug - Available NPC IDs:', grid.NPCsInGrid ? Array.from(grid.NPCsInGrid.keys()) : 'none');
      player.activeTransactions.delete(transactionKey);
      await player.save();
      return res.status(400).json({ error: 'NPC not found in grid' });
    }

    const npc = grid.NPCsInGrid.get(npcId);
    console.log('🔍 Debug - Found NPC:', npc);
    console.log('🔍 Debug - NPC state:', npc.state);
    
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

    // Add items to player inventory
    const inventory = player.inventory || [];
    const existingItem = inventory.find(item => item.type === collectedItem);
    
    if (existingItem) {
      existingItem.quantity += collectedQuantity;
    } else {
      inventory.push({ type: collectedItem, quantity: collectedQuantity });
    }
    
    player.inventory = inventory;

    // Update NPC state to 'emptystall'
    npc.state = 'emptystall';
    npc.hp = 0;
    grid.NPCsInGrid.set(npcId, npc);
    grid.markModified('NPCsInGrid');

    // Save changes
    await grid.save();
    await player.save();

    // Complete transaction
    player.lastTransactionIds.set(transactionKey, transactionId);
    player.activeTransactions.delete(transactionKey);
    await player.save();

    res.json({ 
      success: true, 
      collectedQuantity,
      collectedItem,
      skillsApplied,
      inventory: player.inventory,
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

module.exports = router;



