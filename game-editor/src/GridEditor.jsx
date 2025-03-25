// game-editor/src/GridEditor.jsx
import API_BASE from '../../game-client/src/config';
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Tile from './Tile';
import FileManager from './FileManager';
import './App.css'; 

const GRID_SIZE = 64; // 64x64 grid

const GridEditor = () => {
  const [tileSize, setTileSize] = useState(20); // Default size of 20px
  const [masterResources, setMasterResources] = useState([]); // ✅ Store all resources
  const [grid, setGrid] = useState(
    Array.from({ length: GRID_SIZE }, () => 
      Array.from({ length: GRID_SIZE }, () => ({ type: '', resource: '', npc: '' }))
    )
  );
  const [selectedTile, setSelectedTile] = useState(null);
  const [tileTypes, setTileTypes] = useState([]); // ✅ Add missing state
  const [availableResources, setAvailableResources] = useState([]);
  const [selectedResource, setSelectedResource] = useState(null);
  const [availableNpcs, setAvailableNpcs] = useState([]); // ✅ Store available NPCs

  const [tileDistribution, setTileDistribution] = useState({ g: 100, s: 0, d: 0, w: 0, p: 0, l: 0 });
  const [resourceDistribution, setResourceDistribution] = useState({});
  const tileColors = { g: "#3dc43d", s: "#8b989c", d: "#c0834a", w: "#58cad8", p: "#dab965", l: "#c4583d" };
  const [copiedResource, setCopiedResource] = useState(null); // Holds copied resource

  useEffect(() => {
    const fetchResources = async () => {
      try {
        const response = await axios.get(`${API_BASE}/api/resources`);
        console.log("🔍 Loaded resources:", response.data);
        if (!Array.isArray(response.data)) {
          throw new Error("Invalid resources.json format: Expected an array");
        } 
        setMasterResources(response.data); // ✅ Store all resources
        console.log("✅ Stored masterResources:", masterResources); // ✅ Log stored resources

        const tileTypeList = response.data
          .filter(res => res.category === "tile")
          .map(res => res.layoutkey); // ✅ Extract layoutkey for cycling
        setTileTypes(tileTypeList); // ✅ Store only tile types
  
        const filteredResources = response.data.filter(res =>
          ["source", "doober", "crafting","training","trading", "station", "deco", "travel", "stall"].includes(res.category)
        );
        setAvailableResources(filteredResources);

        const filteredNpcs = response.data.filter(res => res.category === "npc"); // ✅ NPCs
        setAvailableNpcs(filteredNpcs); // ✅ Store separately

      } catch (error) { console.error('Failed to load resources:', error); }
    };
    fetchResources();
  }, []);


  useEffect(() => {
    const handleKeyPress = (event) => {
      if (!selectedTile) return;
  
      // ✅ Ignore key presses if typing in an input, select, or textarea
      const activeElement = document.activeElement;
      if (activeElement.tagName === "INPUT" || activeElement.tagName === "TEXTAREA" || activeElement.tagName === "SELECT") {
        return;
      }
      
      const key = event.key.toLowerCase();
      console.log(`🎹 Key Pressed: ${key}`);
  
      // Prevent default arrow key scrolling
      if (["arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
        event.preventDefault();
      }

      let newX = selectedTile.x;
      let newY = selectedTile.y;
  
      if (key === "arrowup" && newX > 0) newX -= 1;
      if (key === "arrowdown" && newX < GRID_SIZE - 1) newX += 1;
      if (key === "arrowleft" && newY > 0) newY -= 1;
      if (key === "arrowright" && newY < GRID_SIZE - 1) newY += 1;
  
      if (newX !== selectedTile.x || newY !== selectedTile.y) {
        console.log(`➡️ Moving selection to (${newX}, ${newY})`);
        setSelectedTile({ x: newX, y: newY });
      }

      // ✅ DELETE or BACKSPACE resets tile type to "None (**)"
      if (key === "backspace" || key === "delete") {
        console.log(`❌ Resetting tile at (${selectedTile.x}, ${selectedTile.y}) to "None (**)"`);
        updateTileType(selectedTile.x, selectedTile.y, "**");
        updateTileResource(selectedTile.x, selectedTile.y, ""); // ✅ Also clears resource
        return;
      }

      // Find the resource with a matching key
      const matchingTile = masterResources.find(res => res.category === "tile" && res.type.toLowerCase() === key);
      
      if (matchingTile) {
        console.log(`✅ Setting tile type to: ${matchingTile.layoutkey}`);
        updateTileType(selectedTile.x, selectedTile.y, matchingTile.layoutkey);
      }
    };
  
    window.addEventListener("keydown", handleKeyPress);
    return () => {
      window.removeEventListener("keydown", handleKeyPress);
    };
  }, [selectedTile, masterResources]);

  useEffect(() => {
    const handleKeyDown = (event) => {
        console.log(`✅ Key down event: ${event.key}`);

        if (event.metaKey && event.key === 'c') {
            event.preventDefault();
            handleCopy();
        } else if (event.metaKey && event.key === 'v') {
            event.preventDefault();
            handlePaste();
        }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
}, [selectedTile, copiedResource, grid]); // ✅ Include `grid`


const handleCopy = () => {
  if (!selectedTile || !grid) return;

  const { x, y } = selectedTile;
  const resource = grid[x][y]?.resource; // Extract resource only

  if (resource) {
      setCopiedResource(resource); // ✅ Copy only the string value
      console.log(`📋 Copied resource: ${resource} from (${x}, ${y})`);
  } else {
      console.warn("⚠️ No resource found at selected tile.");
  }
};

const handlePaste = () => {
  if (!selectedTile || !copiedResource || !grid) return;

  const { x, y } = selectedTile;

  setGrid(prevGrid => {
      const newGrid = prevGrid.map(row => [...row]); // Create a new grid copy
      newGrid[x][y] = { ...newGrid[x][y], resource: copiedResource }; // ✅ Set resource as string

      console.log(`📋 Pasted resource: ${copiedResource} to (${x}, ${y})`);
      return newGrid; // Ensure React detects a change
  });
};


  const updateTileType = (x, y, newType) => {
    setGrid(prevGrid => {
      return prevGrid.map((row, rowIndex) =>
        row.map((cell, colIndex) => {
          if (rowIndex === x && colIndex === y) {
            console.log(`🔄 Changing tile type at (${x}, ${y}) to ${newType}`);
            return { ...cell, type: newType };
          }
          return cell;
        })
      );
    });
  };

  const handleResourceSelect = (resourceType) => {
    if (!selectedTile) {
      console.log("⚠️ No tile selected, resource change ignored.");
      return;
    }
    const resource = masterResources.find(res => res.type === resourceType);
    console.log(`🎯 Selected Resource: ${resourceType} → ${resource?.symbol || "None"}`);
    updateTileResource(selectedTile.x, selectedTile.y, resource ? resource.symbol : "");
    setSelectedResource(resourceType);
  };

  const updateTileResource = (x, y, resource) => {
    setGrid(prevGrid => {
      const newGrid = prevGrid.map((row, rowIndex) =>
        row.map((cell, colIndex) => {
          if (rowIndex === x && colIndex === y) {
            console.log(`🔍 Updating grid at (${x}, ${y}): ${resource}`);
            return { ...cell, resource }; // ✅ Ensure React detects this as a new object
          }
          return cell;
        })
      );
      console.log("📂 New grid state after update:", newGrid);
      return newGrid;
    });
  
    setSelectedResource(resource); // ✅ Ensure dropdown reflects the update
  };


const handleResourceDistributionChange = (resourceType, value) => {
  setResourceDistribution(prev => ({
    ...prev,
    [resourceType]: value === "" ? 0 : parseInt(value, 10) // Ensure empty values default to 0
  }));
};


  const handleTileClick = (x, y) => {
    setGrid(prevGrid => {
      const newGrid = prevGrid.map(row => [...row]);
      const currentTile = newGrid[x][y];
  
      console.log(`🔍 Clicking tile at (${x}, ${y}) - Current Type: ${currentTile.type}`);
      console.log("🔹 Available Tile Types:", tileTypes);
  
      // ✅ Ensure the first option in cycle is "None (**)"
      const cycleOptions = ["**", ...tileTypes]; 
  
      if (selectedTile && selectedTile.x === x && selectedTile.y === y) {
        const currentIndex = cycleOptions.indexOf(currentTile.type);
        console.log("🔄 Current Index:", currentIndex);
  
        const nextIndex = (currentIndex + 1) % cycleOptions.length;
        console.log("➡️ Next Index:", nextIndex);
  
        newGrid[x][y] = { ...currentTile, type: cycleOptions[nextIndex] }; // ✅ Cycle including "None"
        console.log(`✅ Updated Tile Type: ${newGrid[x][y].type}`);
      } else {
        setSelectedTile({ x, y });
      }
      return newGrid;
    });
  };

    // ✅ Function to update sliders while maintaining 100% total
  const adjustSliders = (tileType, newValue) => {
    let remaining = 100 - newValue;
    let otherKeys = Object.keys(tileDistribution).filter(k => k !== tileType);
    let otherTotal = otherKeys.reduce((sum, key) => sum + tileDistribution[key], 0);

    let adjustedDistribution = { ...tileDistribution, [tileType]: newValue };

    if (otherTotal > 0) {
      otherKeys.forEach(key => {
        adjustedDistribution[key] = Math.max(
          Math.round((tileDistribution[key] / otherTotal) * remaining),
          0
        );
      });
    }

    setTileDistribution(adjustedDistribution);
  };

  const loadLayout = async (fileName, directory) => {
    try {
      const response = await axios.get(`${API_BASE}/api/load-layout?fileName=${fileName}&directory=${directory}`);
      
      if (!response.data.success || !response.data.grid) {
        console.error("❌ Error: Invalid response format.");
        return;
      }
  
      const loadedGrid = response.data.grid; // ✅ Extract the actual grid data
      console.log("📂 Loaded grid from file:", loadedGrid);
  
      if (!loadedGrid.tiles || !loadedGrid.resources) {
        console.error("❌ Error: Missing tiles or resources in loaded file.");
        return;
      }
  
      setGrid(
        loadedGrid.tiles.map((row, x) =>
          row.map((cell, y) => {
            const tileResource = masterResources.find(res => res.layoutkey === cell && res.category === "tile");
            const resourceItem = masterResources.find(res => res.layoutkey === loadedGrid.resources[x][y]);
  
            return {
              type: tileResource ? tileResource.layoutkey : '**', // ✅ Ensures tile layoutKey remains
              resource: resourceItem ? resourceItem.symbol : '', // ✅ Converts layoutKey → symbol
            };
          })
        )
      );
  
      setTileDistribution(loadedGrid.tileDistribution || { g: 100, s: 0, d: 0, w: 0, p: 0, l: 0 });
      setResourceDistribution(loadedGrid.resourceDistribution || {});
  
      console.log("✅ Grid successfully loaded and updated.");
  
    } catch (error) {
      console.error('❌ Failed to load layout:', error);
      alert('Error: Unable to load layout. Check the console for details.');
    }
  };

  const saveLayout = async (fileName, directory) => {
    console.log(`📝 Attempting to save layout: ${fileName} in directory: ${directory}`);
  
    // ✅ Generate Tiles Array
    const formattedTiles = grid.map(row => 
        row.map(cell => {
            const tileResource = masterResources.find(res => res.layoutkey === cell.type && res.category === "tile");
            return tileResource ? tileResource.layoutkey : '**'; // Default to "**" if no match
        })
    );

    // ✅ Generate Resources Array
    const formattedResources = grid.map(row => 
        row.map(cell => {
            if (!cell.resource) return '**'; // Default for empty tiles

            const resourceItem = masterResources.find(res => res.symbol === cell.resource);
            console.log(`🔍 Mapping resource for (${cell.resource}):`, resourceItem?.layoutkey || "**"); 

            return resourceItem ? resourceItem.layoutkey : '**';
        })
    );

    // ✅ Filter out zero values from Resource Distribution
    const filteredResourceDistribution = Object.fromEntries(
        Object.entries(resourceDistribution).filter(([_, value]) => value > 0)
    );

    // ✅ Construct JSON Payload
    const formattedGrid = {
        tiles: formattedTiles,
        resources: formattedResources,
        tileDistribution: tileDistribution,
        resourceDistribution: filteredResourceDistribution // ✅ Saves only non-zero values
    };

    // ✅ Debug Logging
    console.log("📂 Final tiles array before saving:", JSON.stringify(formattedGrid.tiles, null, 2));
    console.log("📂 Final resources array before saving:", JSON.stringify(formattedGrid.resources, null, 2));
    console.log("📊 Tile Distribution before saving:", JSON.stringify(formattedGrid.tileDistribution, null, 2));
    console.log("📊 Resource Distribution before saving:", JSON.stringify(formattedGrid.resourceDistribution, null, 2));

    try {
        await axios.post('${API_BASE}/api/save-layout', {
            fileName,
            directory,
            grid: JSON.stringify(formattedGrid), // ✅ Ensures correct formatting
        });

        console.log(`✅ Successfully saved layout to /game-server/layouts/${directory}/${fileName}.json`);
        alert(`Layout saved to /game-server/layouts/${directory}/${fileName}.json`);
    } catch (error) {
        console.error('❌ Failed to save layout:', error);
        alert('Error: Unable to save layout. Check the console for details.');
    }
};

 // 🔹 Generate Tiles Function (Client)
 const handleGenerateTiles = () => {
  console.log("🔄 Generating new tile types for all empty spaces...");

  if (!grid || !tileDistribution || !masterResources) {
    console.warn("⚠️ Missing grid or tile distribution data. Cannot generate tiles.");
    return;
  }

  // ✅ Create a weighted pool of tile types based on `tileDistribution`
  let tilePool = Object.entries(tileDistribution).flatMap(([tileType, count]) => {
    const tileResource = masterResources.find(res => res.type === tileType && res.category === "tile");
    return tileResource ? Array(count).fill(tileResource.layoutkey) : [];
  });

  if (tilePool.length === 0) {
    console.warn("⚠️ No valid tile distribution found.");
    return;
  }

  tilePool = tilePool.sort(() => Math.random() - 0.5); // ✅ Shuffle tile options

  let newGrid = grid.map(row => row.map(cell => ({ ...cell }))); // ✅ Deep copy of grid

  let emptyTiles = [];
  newGrid.forEach((row, x) => {
    row.forEach((cell, y) => {
      if (!cell.type || cell.type === "**") { // ✅ Fill ALL empty tiles
        emptyTiles.push({ x, y });
      }
    });
  });

  console.log(`📊 Found ${emptyTiles.length} empty tiles to fill.`);

  emptyTiles.forEach(({ x, y }) => {
    const randomTile = tilePool[Math.floor(Math.random() * tilePool.length)];
    newGrid[x][y] = { ...newGrid[x][y], type: randomTile };
    console.log(`🟩 Placing tile "${randomTile}" at (${x}, ${y})`);
  });

  setGrid(newGrid);
  console.log("✅ Tiles successfully generated!");
};


// 🔹 Generate Resources Function (Client)
const handleGenerateResources = () => {
  console.log("🔄 Generating new resources only on empty spaces...");

  if (!grid || !availableResources || !masterResources) {
    console.warn("⚠️ Missing grid or resource data. Cannot generate resources.");
    return;
  }

  // ✅ Create a shuffled resource pool based on resourceDistribution
  let resourcePool = Object.entries(resourceDistribution).flatMap(([resourceType, count]) => {
    const resource = masterResources.find(res => res.type === resourceType);
    return resource ? Array(count).fill(resource) : [];
  });

  if (resourcePool.length === 0) {
    console.warn("⚠️ No valid resource distribution found.");
    return;
  }

  resourcePool = resourcePool.sort(() => Math.random() - 0.5); // ✅ Shuffle resources

  let newGrid = grid.map(row => row.map(cell => ({ ...cell }))); // ✅ Deep copy of grid

  let validCells = [];
  newGrid.forEach((row, x) => {
    row.forEach((cell, y) => {
      if (!cell.resource) { // ✅ Only place resources on empty spaces
        // ✅ Convert layoutKey to tile type (g, s, d, etc.)
        const tileResource = masterResources.find(res => res.layoutkey === cell.type && res.category === "tile");
        const tileType = tileResource ? tileResource.type : null;
        
        if (tileType) {
          validCells.push({ x, y, tileType });
        }
      }
    });
  });

  console.log(`📊 Found ${validCells.length} valid tiles for resource placement.`);

  validCells = validCells.sort(() => Math.random() - 0.5); // ✅ Shuffle available tiles

  resourcePool.forEach((resource, index) => {
    if (validCells[index]) {
      const { x, y, tileType } = validCells[index];

      // ✅ Check if resource is valid on this tile type (now using correct `tileType`)
      const isValid = resource[`validon${tileType}`]; 
      if (!isValid) {
        console.warn(`🚫 "${resource.type}" cannot be placed on "${tileType}" at (${x}, ${y}). Skipping.`);
        return;
      }

      newGrid[x][y] = { ...newGrid[x][y], resource: resource.symbol };
      console.log(`🌱 Placing "${resource.symbol}" at (${x}, ${y})`);
    }
  });

  setGrid(newGrid);
  console.log("✅ Resources successfully generated!");
};


  //////////////////////////////////////////////////

  return (
    <div className="editor-container">
      
      {/* Left Panel for UI Controls */}
      <div className="editor-panel">
        <h2>Grid Editor</h2>
        <FileManager loadLayout={loadLayout} saveLayout={saveLayout} currentFile={''} />

        <h4>Tile Size:</h4>
        <input 
          type="range" min="10" max="50" value={tileSize} 
          onChange={(e) => setTileSize(Number(e.target.value))}
        />
  
        {selectedTile && (
          <>
            <h3>Selected Tile:</h3>
            <h4>Tile Type: {grid[selectedTile.x][selectedTile.y].type || "None"}</h4>
            <p>Shortcuts: (g)rass; (d)irt; (s)late; (p)avement; (w)ater; (l)ava; sa(n)d; (DEL)=clear</p>
  
            <h4>Resource: {grid[selectedTile.x][selectedTile.y].resource || "None"}</h4>

            <select onChange={(e) => handleResourceSelect(e.target.value)}>
              <option value="">None</option>
              {availableResources.map(resource => (
                <option key={resource.type} value={resource.type}>
                  {resource.symbol} {resource.type}
                </option>
              ))}
            </select>
  
            <p>NPCs: </p>

            <select onChange={(e) => handleResourceSelect(e.target.value)}>  
              <option value="">None</option>
              {availableNpcs.map(npc => (
                <option key={npc.type} value={npc.type}>
                  {npc.symbol} {npc.type}
                </option>
              ))}
            </select>
          </>
        )}

        {/* Moved Tile Distribution Below Selected Tile Info */}
        <h3>Tile Distribution:</h3>
        <p>Blank tile random distribution (when grid is created):</p>
        <div className="button-group">
          <button className="small-button" onClick={handleGenerateTiles}>Generate Tiles</button>
        </div>
        {Object.keys(tileDistribution).map(type => (
          <div key={type} style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
            <label style={{
              width: '30px',
              fontWeight: 'bold'
            }}>
              {type.toLowerCase()}:
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={tileDistribution[type]}
              onChange={(e) => adjustSliders(type, parseInt(e.target.value))}
              style={{
                width: '300px',
                accentColor: tileColors[type]
              }}
            />
            <span style={{ marginLeft: '5px' }}>{tileDistribution[type]}%</span>
          </div>
        ))}


        {/* 🔹 Resource Distribution Section */}
        <h3>Resource Distribution</h3>
        <p>Enter how many of each resource should randomly generate:</p>
        <div className="button-group">
          <button className="small-button" onClick={handleGenerateResources}>Generate Resources</button>        
        </div>
          {availableResources.map(resource => (
          <div key={resource.type} style={{ display: 'flex', alignItems: 'center', marginBottom: '5px' }}>
            <input
              type="number"
              min="0"
              value={resourceDistribution[resource.type] || ""}
              onChange={(e) => handleResourceDistributionChange(resource.type, e.target.value)}
              style={{ width: "50px", marginRight: "10px" }}
            />
            <label>{resource.symbol} {resource.type}</label>
          </div>
        ))}


      </div>
  
      {/* Grid Container */}
      <div className="editor-grid-container">
        <div className="grid" style={{ 
          display: 'grid', 
          gridTemplateColumns: `repeat(${GRID_SIZE}, ${tileSize}px)`, 
          gridTemplateRows: `repeat(${GRID_SIZE}, ${tileSize}px)`, 
          gap: '1px', 
          background: '#ccc',
          width: `${GRID_SIZE * tileSize}px`,
          height: `${GRID_SIZE * tileSize}px`
        }}>
          {grid.map((row, x) =>
            row.map((tile, y) => (
              <Tile 
                key={`${x}-${y}`} 
                x={x} 
                y={y} 
                tile={tile} 
                updateTile={() => handleTileClick(x, y)}
                isSelected={selectedTile?.x === x && selectedTile?.y === y}
                setSelectedTile={setSelectedTile}
                tileSize={tileSize} 
              />
            ))
          )}
        </div>
      </div>
  
    </div>
);
}

export default GridEditor;
