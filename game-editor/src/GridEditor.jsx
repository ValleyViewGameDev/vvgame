// game-editor/src/GridEditor.jsx
const fs = window.require('fs');
const path = window.require('path');
const app = window.require('@electron/remote').app;
const isDev = !app.isPackaged;
const projectRoot = isDev
  ? path.join(__dirname, '..', '..')
  : path.join(app.getAppPath(), '..', '..', '..', '..', '..', '..', '..');
  
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Tile from './Tile';
import FileManager from './FileManager';
import './App.css'; 

const GRID_SIZE = 64; // 64x64 grid

const GridEditor = () => {
  const [tileSize, setTileSize] = useState(20); // Default size of 20px
  const [brushSize, setBrushSize] = useState(1); // New brush size state
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
    try {
      const resourcePath = path.join(projectRoot, 'game-server', 'tuning', 'resources.json');      
      const fileContents = fs.readFileSync(resourcePath, 'utf-8');
      const parsedResources = JSON.parse(fileContents);
      console.log("🔍 Loaded resources:", parsedResources);
      if (!Array.isArray(parsedResources)) {
        throw new Error("Invalid resources.json format: Expected an array");
      }

      setMasterResources(parsedResources);
      console.log("✅ Stored masterResources:", parsedResources);

      const tileTypeList = parsedResources
        .filter(res => res.category === "tile")
        .map(res => res.layoutkey);
      setTileTypes(tileTypeList);

      const filteredResources = parsedResources.filter(res =>
        ["source", "doober", "reward", "special", "crafting", "training", "shop","trading", "station", "deco", "travel", "stall"].includes(res.category)
      );
      setAvailableResources(filteredResources);

      const filteredNpcs = parsedResources.filter(res => res.category === "npc");
      setAvailableNpcs(filteredNpcs);
    } catch (error) {
      console.error('Failed to load resources:', error);
    }
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

      // ✅ DELETE or BACKSPACE now removes resource if present, else resets tile type
      if (key === "backspace" || key === "delete") {
        const currentTile = grid[selectedTile.x][selectedTile.y];
        if (currentTile.resource) {
          console.log(`❌ Removing resource at (${selectedTile.x}, ${selectedTile.y})`);
          updateTileResource(selectedTile.x, selectedTile.y, "");
        } else {
          console.log(`❌ Resetting tile at (${selectedTile.x}, ${selectedTile.y}) to "None (**)"`);
          updateTileType(selectedTile.x, selectedTile.y, "**");
        }
        // Ensure selectedTile state is refreshed so user can DEL again
        setSelectedTile({ x: selectedTile.x, y: selectedTile.y });
        return;
      }

      // Find the resource with a matching key
      const matchingTile = masterResources.find(res => res.category === "tile" && res.type.toLowerCase() === key);

      if (matchingTile) {
        console.log(`✅ Setting tile type to: ${matchingTile.layoutkey}`);
        // --- Brush logic: apply in a diamond shape based on brushSize ---
        for (let dx = -brushSize + 1; dx < brushSize; dx++) {
          for (let dy = -brushSize + 1; dy < brushSize; dy++) {
            const x = selectedTile.x + dx;
            const y = selectedTile.y + dy;
            if (
              x >= 0 &&
              x < GRID_SIZE &&
              y >= 0 &&
              y < GRID_SIZE &&
              Math.abs(dx) + Math.abs(dy) < brushSize
            ) {
              updateTileType(x, y, matchingTile.layoutkey);
            }
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => {
      window.removeEventListener("keydown", handleKeyPress);
    };
  }, [selectedTile, masterResources, brushSize]);

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
      const layoutPath = path.join(projectRoot, 'game-server', 'layouts', 'gridLayouts', directory, `${fileName}.json`);
      const raw = fs.readFileSync(layoutPath, 'utf-8');
      const loadedGrid = JSON.parse(raw);

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
              type: tileResource ? tileResource.layoutkey : '**',
              resource: resourceItem ? resourceItem.symbol : '',
            };
          })
        )
      );

      setTileDistribution(loadedGrid.tileDistribution || { g: 100, s: 0, d: 0, w: 0, p: 0, l: 0 });
      setResourceDistribution(loadedGrid.resourceDistribution || {});

      console.log("✅ Grid successfully loaded from:", layoutPath);
    } catch (error) {
      console.error('❌ Failed to load layout:', error);
      alert('Error: Unable to load layout. Check the console for details.');
    }
  };

  const saveLayout = async (fileName, directory) => {
    try {
      const layoutPath = path.join(projectRoot, 'game-server', 'layouts', 'gridLayouts', directory, `${fileName}.json`);

      const formattedTiles = grid.map(row => 
        row.map(cell => {
          const tileResource = masterResources.find(res => res.layoutkey === cell.type && res.category === "tile");
          return tileResource ? tileResource.layoutkey : '**';
        })
      );

      const formattedResources = grid.map(row => 
        row.map(cell => {
          if (!cell.resource) return '**';
          const resourceItem = masterResources.find(res => res.symbol === cell.resource);
          return resourceItem ? resourceItem.layoutkey : '**';
        })
      );

      const filteredResourceDistribution = Object.fromEntries(
        Object.entries(resourceDistribution).filter(([_, value]) => value > 0)
      );

      const formattedGrid = {
        tiles: formattedTiles,
        resources: formattedResources,
        tileDistribution: tileDistribution,
        resourceDistribution: filteredResourceDistribution
      };

      fs.writeFileSync(layoutPath, JSON.stringify(formattedGrid, null, 2), 'utf-8');
      console.log(`✅ Successfully saved layout to ${layoutPath}`);
      alert(`Layout saved to ${layoutPath}`);
    } catch (error) {
      console.error('❌ Failed to save layout:', error);
      alert('Error: Unable to save layout. Check the console for details.');
    }
  };

 // 🔹 Generate Tiles Function (Client)
 const handleGenerateTiles = () => {
   let choice = null;
   if (window.confirm("Generate tile types across the entire board? Click Cancel to limit to blank tiles.")) {
     choice = 'all';
   } else if (window.confirm("Generate tile types only for blank tiles?")) {
     choice = 'blanks';
   }
   if (!choice) return;
   console.log("🔄 Generating new tile types...");

   if (!grid || !tileDistribution || !masterResources) {
     console.warn("⚠️ Missing grid or tile distribution data. Cannot generate tiles.");
     return;
   }

   let tilePool = Object.entries(tileDistribution).flatMap(([tileType, count]) => {
     const tileResource = masterResources.find(res => res.type === tileType && res.category === "tile");
     return tileResource ? Array(count).fill(tileResource.layoutkey) : [];
   });

   if (tilePool.length === 0) {
     console.warn("⚠️ No valid tile distribution found.");
     return;
   }

   tilePool = tilePool.sort(() => Math.random() - 0.5); // Shuffle tile options

   let newGrid = grid.map(row => row.map(cell => ({ ...cell })));

   if (choice.toLowerCase() === 'all') {
     newGrid = newGrid.map(row => row.map(cell => ({ ...cell, type: "" })));
   }

   let targets = [];
   newGrid.forEach((row, x) => {
     row.forEach((cell, y) => {
       if (!cell.type || cell.type === "**") {
         targets.push({ x, y });
       }
     });
   });

   targets.forEach(({ x, y }) => {
     const randomTile = tilePool[Math.floor(Math.random() * tilePool.length)];
     newGrid[x][y].type = randomTile;
   });

   setGrid(newGrid);
   console.log("✅ Tiles successfully generated!");
 };


 // 🔹 Generate Resources Function (Client)
 const handleGenerateResources = () => {
   let choice = null;
   if (window.confirm("Regenerate all resources (clear and repopulate)?")) {
     choice = 'regenerate';
   } else if (window.confirm("Add additional resources (keep existing)?")) {
     choice = 'additional';
   }
   if (!choice) return;
   console.log("🔄 Generating new resources...");

  if (!grid || !availableResources || !masterResources) {
    console.warn("⚠️ Missing grid or resource data. Cannot generate resources.");
    return;
  }

  let newGrid = grid.map(row => row.map(cell => ({ ...cell })));

  if (choice.toLowerCase() === "regenerate") {
    newGrid = newGrid.map(row => row.map(cell => ({ ...cell, resource: "" })));
  }

  let resourcePool = Object.entries(resourceDistribution).flatMap(([type, count]) => {
    const res = masterResources.find(r => r.type === type);
    return res ? Array(count).fill(res) : [];
  });

  if (resourcePool.length === 0) {
    console.warn("⚠️ No valid resource distribution found.");
    return;
  }

  resourcePool = resourcePool.sort(() => Math.random() - 0.5); // Shuffle

  let validCells = [];
  newGrid.forEach((row, x) =>
    row.forEach((cell, y) => {
      if (!cell.resource) {
        const tileRes = masterResources.find(r => r.layoutkey === cell.type && r.category === "tile");
        if (tileRes) validCells.push({ x, y, tileType: tileRes.type });
      }
    })
  );

  validCells = validCells.sort(() => Math.random() - 0.5); // Shuffle again

  resourcePool.forEach((res, i) => {
    const cell = validCells[i];
    if (cell && res[`validon${cell.tileType}`]) {
      newGrid[cell.x][cell.y].resource = res.symbol;
    }
  });

  setGrid(newGrid);
  console.log("✅ Resources successfully generated!");
};

// 🔹 Clear Grid Function
const handleClearGrid = () => {
  const clearedGrid = grid.map(row =>
    row.map(() => ({ type: "", resource: "", npc: "" }))
  );
  setGrid(clearedGrid);
  setSelectedTile(null);
  console.log("🧹 Cleared all tiles and resources.");
};


  //////////////////////////////////////////////////

  // --- Generate Signposts Handler ---
  const handleGenerateSignposts = () => {
    console.log("📦 Available resource types:", masterResources.map(r => r.type));

    // Map signpost keys to their actual resource.type strings from your masterResources
    const signpostTypes = {
      SignpostNW: "Signpost NW",
      SignpostN: "Signpost N",
      SignpostNE: "Signpost NE",
      SignpostE: "Signpost E",
      SignpostSE: "Signpost SE",
      SignpostS: "Signpost S",
      SignpostSW: "Signpost SW",
      SignpostW: "Signpost W"
    };

    // The keys here are the signpost names; the type string will be looked up in masterResources
    const signpostLocations = [
      { key: "SignpostNW", x: 0, y: 0 },
      { key: "SignpostN",  x: 0, y: 31 },
      { key: "SignpostNE", x: 0, y: 63 },
      { key: "SignpostE",  x: 31, y: 63 },
      { key: "SignpostSE", x: 63, y: 63 },
      { key: "SignpostS",  x: 63, y: 31 },
      { key: "SignpostSW", x: 63, y: 0 },
      { key: "SignpostW",  x: 31, y: 0 },
    ];

    setGrid(prevGrid => {
      const newGrid = prevGrid.map(row => [...row]);

      signpostLocations.forEach(({ key, x, y }) => {
        const type = signpostTypes[key];
        const resource = masterResources.find(res => res.type === type);

        if (resource) {
          newGrid[x][y] = {
            ...newGrid[x][y],
            resource: resource.symbol,
          };
          console.log(`✅ Placed ${resource.symbol} at (${x}, ${y})`);
        } else {
          console.warn(`❗ Signpost resource "${type}" not found in masterResources.`);
        }
      });

      return newGrid;
    });

    console.log("🪧 Signposts placed at predefined positions.");
  };

  return (
    <div className="editor-container">
      
      {/* Left Panel for UI Controls */}
      <div className="editor-panel">
        <h2>Grid Editor</h2>
        <FileManager loadLayout={loadLayout} saveLayout={saveLayout} currentFile={''} />
        <div className="button-group">
          <button className="small-button" onClick={handleClearGrid}>Clear</button>
        </div>

        <h4>Tile Size:</h4>
        <input 
          type="range" min="10" max="50" value={tileSize} 
          onChange={(e) => setTileSize(Number(e.target.value))}
        />
        <h4>Tile Brush Size:</h4>
        <input
          type="range"
          min="1"
          max="10"
          value={brushSize}
          onChange={(e) => setBrushSize(Number(e.target.value))}
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
        {/* --- Add Generate Signposts Button --- */}
        <div className="button-group">
          <button className="small-button" onClick={handleGenerateSignposts}>Generate Signposts</button>
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
      <div
        className="editor-grid-container"
        style={{
          position: 'absolute',
          top: 0,
          left: 240,
          right: 0,
          bottom: 0,
          overflowX: 'auto',
          overflowY: 'auto',
          zIndex: 0
        }}
      >
        <div
          className="grid-with-rulers"
          style={{
            display: 'flex',
            flexDirection: 'column',
            marginLeft: tileSize,
            minWidth: (GRID_SIZE + 3) * tileSize
          }}
        >
          {/* Top Ruler */}
          <div style={{ display: 'flex' }}>
            <div
              style={{
                width: tileSize,
                height: tileSize,
                flexShrink: 0,
                boxSizing: 'border-box'
              }}
            /> {/* Top-left corner spacer */}
            {Array.from({ length: GRID_SIZE }).map((_, i) => (
              <div
                key={`top-${i}`}
                style={{
                  width: tileSize,
                  height: tileSize,
                  fontSize: '10px',
                  textAlign: 'center',
                  lineHeight: `${tileSize}px`,
                  flexShrink: 0,
                  boxSizing: 'border-box'
                }}
              >
                {i}
              </div>
            ))}
          </div>

          {/* Grid Rows with Left/Right Rulers */}
          {grid.map((row, x) => (
            <div
              key={`row-${x}`}
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center'
              }}
            >
              {/* Left Ruler */}
              <div
                style={{
                  width: tileSize,
                  height: tileSize,
                  fontSize: '10px',
                  textAlign: 'center',
                  lineHeight: `${tileSize}px`,
                  flexShrink: 0,
                  boxSizing: 'border-box'
                }}
              >
                {x}
              </div>

              {/* Tiles as a grid row */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${GRID_SIZE}, ${tileSize}px)`,
                  gridTemplateRows: `${tileSize}px`,
                  flexShrink: 0
                }}
              >
                {row.map((tile, y) => (
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
                ))}
              </div>

              {/* Right Ruler */}
              <div
                style={{
                  width: tileSize,
                  height: tileSize,
                  fontSize: '10px',
                  textAlign: 'center',
                  lineHeight: `${tileSize}px`,
                  flexShrink: 0,
                  boxSizing: 'border-box'
                }}
              >
                {x}
              </div>
            </div>
          ))}

          {/* Bottom Ruler */}
          <div style={{ display: 'flex' }}>
            <div
              style={{
                width: tileSize,
                height: tileSize,
                flexShrink: 0,
                boxSizing: 'border-box'
              }}
            /> {/* Bottom-left corner spacer */}
            {Array.from({ length: GRID_SIZE }).map((_, i) => (
              <div
                key={`bottom-${i}`}
                style={{
                  width: tileSize,
                  height: tileSize,
                  fontSize: '10px',
                  textAlign: 'center',
                  lineHeight: `${tileSize}px`,
                  flexShrink: 0,
                  boxSizing: 'border-box'
                }}
              >
                {i}
              </div>
            ))}
          </div>
        </div>
      </div>
  
    </div>
  );

}

export default GridEditor;