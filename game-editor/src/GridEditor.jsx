// game-editor/src/GridEditor.jsx
const fs = window.require('fs');
const path = window.require('path');
const app = window.require('@electron/remote').app;
const isDev = !app.isPackaged;
const projectRoot = isDev
  ? path.join(__dirname, '..', '..')
  : path.join(app.getAppPath(), '..', '..', '..', '..', '..', '..', '..');
  
import React, { useState, useEffect, useRef } from 'react';
import Modal from './components/Modal.jsx';
import axios from 'axios';
import Tile from './Tile';
import FileManager from './FileManager';
import './App.css';
import { useFileContext } from './FileContext';
import { tileColors } from './tileConfig';

const GRID_SIZE = 64; // 64x64 grid

const GridEditor = ({ activePanel }) => {
  const { fileName, setFileName, directory, setDirectory } = useFileContext();
  const [grid, setGrid] = useState(
    Array.from({ length: GRID_SIZE }, () => 
      Array.from({ length: GRID_SIZE }, () => ({ type: '', resource: '', npc: '' }))
    )
  );
  const [tileSize, setTileSize] = useState(20); // Default size of 20px
  const [brushSize, setBrushSize] = useState(1); // New brush size state
  const [brushShape, setBrushShape] = useState('square'); // Brush shape: 'square', 'circle', 'scatter'
  const [scatterPercentage, setScatterPercentage] = useState(20); // Percentage for scatter brush
  const [masterResources, setMasterResources] = useState([]); // ✅ Store all resources
  const [selectedTile, setSelectedTile] = useState(null);
  const [tileTypes, setTileTypes] = useState([]); // ✅ Add missing state
  const [availableResources, setAvailableResources] = useState([]);
  const [selectedResource, setSelectedResource] = useState(null);
  const [availableNpcs, setAvailableNpcs] = useState([]); // ✅ Store available NPCs
  const [availableMiniTemplates, setAvailableMiniTemplates] = useState([]); // Store available mini templates
  const [tileDistribution, setTileDistribution] = useState({ g: 100, s: 0, d: 0, w: 0, p: 0, l: 0, n: 0, x: 0, y:0, z:0 }); // Track tile type distribution
  const [resourceDistribution, setResourceDistribution] = useState({});
  const [enemyDistribution, setEnemyDistribution] = useState({}); // Track enemy distribution

  const [copiedResource, setCopiedResource] = useState(null); // Holds copied resource
  const [currentGridType, setCurrentGridType] = useState(''); // Track current grid's type
  const [selectedTileTypes, setSelectedTileTypes] = useState({ g: true, s: true, d: true, w: true, p: true, l: true, n: true, x: true, y: true, z: true }); // For selective tile deletion
  
  // Undo functionality - NEW APPROACH
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const maxUndoSize = 50; // Limit history to prevent memory issues
  
  // Removed currentFile, setCurrentFile, currentDirectory, setCurrentDirectory
  const pendingLoad = useRef(null);

  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [showLoadConfirm, setShowLoadConfirm] = useState(false);
  
  // Computed list of enemy NPCs
  const enemyNpcs = availableNpcs.filter(npc => npc.action === 'attack' || npc.action === 'spawn');

  // Function to initialize undo stack (used after loading)
  const initializeUndoStack = () => {
    setUndoStack([]);
    setRedoStack([]);
    console.log('📚 INIT UNDO - Undo stack cleared and ready');
  };

  // Function to push current state to undo stack before making changes
  const pushToUndoStack = () => {
    const currentState = {
      grid: grid.map(row => row.map(cell => ({ ...cell }))), // Deep copy
      tileDistribution: { ...tileDistribution },
      resourceDistribution: { ...resourceDistribution },
      enemyDistribution: { ...enemyDistribution }
    };
    
    console.log('💾 PUSH UNDO - Pushing current state to undo stack');
    console.log('💾 PUSH UNDO - Current undo stack size:', undoStack.length);

    setUndoStack(prev => {
      const newStack = [...prev, currentState];
      // Limit stack size
      if (newStack.length > maxUndoSize) {
        newStack.shift();
      }
      console.log('💾 PUSH UNDO - New undo stack size:', newStack.length);
      return newStack;
    });
    
    // Clear redo stack when new change is made
    setRedoStack([]);
  };

  // Function to undo last action
  const handleUndo = () => {
    console.log('⏪ UNDO - Called handleUndo');
    console.log('⏪ UNDO - Undo stack size:', undoStack.length);
    console.log('⏪ UNDO - Redo stack size:', redoStack.length);
    
    if (undoStack.length === 0) {
      console.log("⏪ UNDO - No more actions to undo");
      return;
    }

    // Pop the last state from undo stack
    const stateToRestore = undoStack[undoStack.length - 1];
    
    // Save current state to redo stack
    const currentState = {
      grid: grid.map(row => row.map(cell => ({ ...cell }))),
      tileDistribution: { ...tileDistribution },
      resourceDistribution: { ...resourceDistribution },
      enemyDistribution: { ...enemyDistribution }
    };
    
    console.log('⏪ UNDO - Restoring state and moving current to redo stack');
    
    // Update stacks
    setUndoStack(prev => prev.slice(0, -1)); // Remove last item
    setRedoStack(prev => [...prev, currentState]); // Add current to redo
    
    // Restore the state
    setGrid(stateToRestore.grid.map(row => row.map(cell => ({ ...cell }))));
    setTileDistribution({ ...stateToRestore.tileDistribution });
    setResourceDistribution({ ...stateToRestore.resourceDistribution });
    setEnemyDistribution({ ...stateToRestore.enemyDistribution });
    
    console.log('⏪ UNDO - Successfully undid action. New undo size:', undoStack.length - 1);
  };

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
        ["source", "editor", "doober", "reward", "special", "crafting", "training", "shop", "trading", "station", "deco", "travel", "stall", "farmhouse"].includes(res.category)
      );
      setAvailableResources(filteredResources);

      const filteredNpcs = parsedResources.filter(res => res.category === "npc");
      setAvailableNpcs(filteredNpcs);
      
      // Load mini templates
      try {
        const miniTemplatesDir = path.join(projectRoot, 'game-server', 'layouts', 'gridLayouts', 'miniTemplates');
        const miniTemplateFiles = fs.readdirSync(miniTemplatesDir).filter(file => file.endsWith('.json'));
        const miniTemplates = miniTemplateFiles.map(file => ({
          name: file.replace('.json', ''),
          filename: file
        }));
        setAvailableMiniTemplates(miniTemplates);
        console.log('✅ Loaded mini templates:', miniTemplates);
      } catch (error) {
        console.warn('⚠️ Could not load mini templates:', error.message);
        setAvailableMiniTemplates([]);
      }
      
      // Initialize enemy distribution for NPCs with attack or spawn actions
      const enemies = filteredNpcs.filter(npc => npc.action === 'attack' || npc.action === 'spawn');
      const initialEnemyDist = {};
      enemies.forEach(enemy => {
        initialEnemyDist[enemy.type] = 0;
      });
      setEnemyDistribution(initialEnemyDist);
    } catch (error) {
      console.error('Failed to load resources:', error);
    }
  }, []);
  
  // Initialize undo stack once when masterResources are loaded
  useEffect(() => {
    console.log('🚀 INIT EFFECT - masterResources.length:', masterResources.length);
    console.log('🚀 INIT EFFECT - undoStack.length:', undoStack.length);
    if (masterResources.length > 0 && undoStack.length === 0) {
      console.log('🚀 INIT EFFECT - Calling initializeUndoStack in 100ms');
      setTimeout(() => {
        initializeUndoStack();
      }, 100);
    }
  }, [masterResources.length]); // Only depend on masterResources, not gridHistory.length!

  // LISTENER for the custom event that triggers loading the Grid Editor (from FrontierView)
  useEffect(() => {
    const handleEditorLoadGrid = (event) => {
      const { gridCoord, gridType, directory } = event.detail || {};
      console.log("🕓 Received load request for:", gridCoord, "gridType:", gridType, "directory:", directory);
      pendingLoad.current = { fileName: gridCoord, directory: directory || gridType };
      // Set the actual grid type from the database
      if (gridType) {
        setCurrentGridType(gridType);
      }
    };
    window.addEventListener('editor-load-grid', handleEditorLoadGrid);
    return () => window.removeEventListener('editor-load-grid', handleEditorLoadGrid);
  }, []);

  // Handler for clearing the grid
  useEffect(() => {
    const handleEditorClearGrid = () => {
      console.log("🧹 Clearing grid for new layout");
      // Reset grid to empty state
      setGrid(
        Array.from({ length: GRID_SIZE }, () => 
          Array.from({ length: GRID_SIZE }, () => ({ type: '', resource: '', npc: '' }))
        )
      );
      // Reset distributions
      setTileDistribution({ g: 100, s: 0, d: 0, w: 0, p: 0, l: 0, n: 0, x: 0, y: 0, z: 0 });
      setResourceDistribution({});
      
      // Initialize enemy distribution for available enemy NPCs
      const enemies = availableNpcs.filter(npc => npc.action === 'attack' || npc.action === 'spawn');
      const initialEnemyDist = {};
      enemies.forEach(enemy => {
        initialEnemyDist[enemy.type] = 0;
      });
      setEnemyDistribution(initialEnemyDist);
      
      // Clear current grid type - will be set by create-grid event
      setCurrentGridType('');
    };
    window.addEventListener('editor-clear-grid', handleEditorClearGrid);
    return () => window.removeEventListener('editor-clear-grid', handleEditorClearGrid);
  }, [availableNpcs]);

  // Handler for creating a new grid with specific type
  useEffect(() => {
    const handleEditorCreateGrid = (event) => {
      const { gridCoord, gridType } = event.detail || {};
      console.log("🆕 Creating new grid - coord:", gridCoord, "type:", gridType);
      
      // Set the grid type from the Frontier view selection
      if (gridType) {
        setCurrentGridType(gridType);
        console.log("✅ Set currentGridType to:", gridType);
      }
      
      // Set file context
      if (gridCoord) {
        setFileName(String(gridCoord));
        setDirectory("valleyFixedCoord/");
      }
    };
    window.addEventListener('editor-create-grid', handleEditorCreateGrid);
    return () => window.removeEventListener('editor-create-grid', handleEditorCreateGrid);
  }, [setFileName, setDirectory]);

  useEffect(() => {
    if (activePanel === 'grid' && pendingLoad.current && masterResources.length > 0) {
      const { fileName, directory } = pendingLoad.current;
      console.log("🚀 Performing deferred loadLayout:", fileName, directory);
      loadLayout(fileName, directory, true);
      pendingLoad.current = null;
    }
  }, [activePanel, masterResources]);

  // Function to get tiles affected by the brush based on shape
  const getBrushTiles = (centerX, centerY, brushSize, brushShape) => {
    const tiles = [];
    
    for (let dx = -brushSize + 1; dx < brushSize; dx++) {
      for (let dy = -brushSize + 1; dy < brushSize; dy++) {
        const x = centerX + dx;
        const y = centerY + dy;
        
        // Check if tile is within grid bounds
        if (x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE) {
          let includeTile = false;
          
          switch (brushShape) {
            case 'square':
              // Square shape: include all tiles within the square
              includeTile = Math.abs(dx) < brushSize && Math.abs(dy) < brushSize;
              break;
              
            case 'circle':
              // Circle shape: use euclidean distance with better small size handling
              const distance = Math.sqrt(dx * dx + dy * dy);
              // For small brush sizes, be more selective to maintain circle appearance
              if (brushSize <= 2) {
                // At size 1: only center
                // At size 2: center + cardinal directions (N,S,E,W)
                if (brushSize === 1) {
                  includeTile = (dx === 0 && dy === 0);
                } else {
                  includeTile = (dx === 0 && dy === 0) || 
                               (Math.abs(dx) + Math.abs(dy) === 1);
                }
              } else if (brushSize === 3) {
                // At size 3: create a small circle pattern
                includeTile = distance < 2.5;
              } else {
                // For larger sizes, use standard circle formula
                includeTile = distance < brushSize;
              }
              break;
              
            case 'scatter':
              // Scatter shape: circle with random selection
              const scatterDistance = Math.sqrt(dx * dx + dy * dy);
              let inCircle = false;
              
              // Use same circle logic as circle brush
              if (brushSize <= 2) {
                if (brushSize === 1) {
                  inCircle = (dx === 0 && dy === 0);
                } else {
                  inCircle = (dx === 0 && dy === 0) || 
                            (Math.abs(dx) + Math.abs(dy) === 1);
                }
              } else if (brushSize === 3) {
                inCircle = scatterDistance < 2.5;
              } else {
                inCircle = scatterDistance < brushSize;
              }
              
              if (inCircle) {
                // Only include tile based on scatter percentage
                includeTile = Math.random() * 100 < scatterPercentage;
              }
              break;
              
            default:
              // Default to square
              includeTile = Math.abs(dx) < brushSize && Math.abs(dy) < brushSize;
          }
          
          if (includeTile) {
            tiles.push({ x, y });
          }
        }
      }
    }
    
    return tiles;
  };

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
        console.log(`❌ Deleting with brush size ${brushSize} and shape ${brushShape}`);
        
        // Push current state to undo stack BEFORE making changes
        pushToUndoStack();
        
        // Get tiles affected by brush
        const tilesToDelete = getBrushTiles(selectedTile.x, selectedTile.y, brushSize, brushShape);
        
        // Create new grid with all changes at once
        setGrid(prevGrid => {
          const newGrid = prevGrid.map(row => row.map(cell => ({ ...cell })));
          
          tilesToDelete.forEach(({ x, y }) => {
            const currentTile = prevGrid[x][y];
            if (currentTile.resource) {
              console.log(`❌ Removing resource at (${x}, ${y})`);
              newGrid[x][y] = { ...newGrid[x][y], resource: "" };
            } else {
              console.log(`❌ Resetting tile at (${x}, ${y}) to "None (**)"`);
              newGrid[x][y] = { ...newGrid[x][y], type: "**" };
            }
          });
          
          return newGrid;
        });
        
        // Ensure selectedTile state is refreshed so user can DEL again
        setSelectedTile({ x: selectedTile.x, y: selectedTile.y });
        return;
      }

      // Find the resource with a matching key
      const matchingTile = masterResources.find(res => res.category === "tile" && res.type.toLowerCase() === key);

      if (matchingTile) {
        console.log(`✅ Setting tile type to: ${matchingTile.layoutkey} with brush shape ${brushShape}`);
        
        // Push current state to undo stack BEFORE making changes
        pushToUndoStack();
        
        // Get tiles affected by brush
        const tilesToUpdate = getBrushTiles(selectedTile.x, selectedTile.y, brushSize, brushShape);
        
        // Create new grid with all changes at once
        setGrid(prevGrid => {
          const newGrid = prevGrid.map(row => row.map(cell => ({ ...cell })));
          
          tilesToUpdate.forEach(({ x, y }) => {
            console.log(`🔄 Changing tile type at (${x}, ${y}) to ${matchingTile.layoutkey}`);
            newGrid[x][y] = { ...newGrid[x][y], type: matchingTile.layoutkey };
          });
          
          return newGrid;
        });
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => {
      window.removeEventListener("keydown", handleKeyPress);
    };
  }, [selectedTile, masterResources, brushSize, brushShape, scatterPercentage]);

  useEffect(() => {
    const handleKeyDown = (event) => {
        console.log(`✅ Key down event: ${event.key}`);

        // Check if we're typing in an input field
        const activeElement = document.activeElement;
        if (activeElement.tagName === "INPUT" || activeElement.tagName === "TEXTAREA" || activeElement.tagName === "SELECT") {
          return;
        }

        if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
            event.preventDefault();
            handleUndo();
        } else if ((event.ctrlKey || event.metaKey) && event.key === 'c') {
            event.preventDefault();
            handleCopy();
        } else if ((event.ctrlKey || event.metaKey) && event.key === 'v') {
            event.preventDefault();
            handlePaste();
        }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
}, [selectedTile, copiedResource, grid, undoStack]); // ✅ Include undo dependencies


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
  
  // Push current state to undo stack BEFORE making changes
  pushToUndoStack();

  setGrid(prevGrid => {
      const newGrid = prevGrid.map(row => [...row]); // Create a new grid copy
      newGrid[x][y] = { ...newGrid[x][y], resource: copiedResource }; // ✅ Set resource as string

      console.log(`📋 Pasted resource: ${copiedResource} to (${x}, ${y})`);
      return newGrid; // Ensure React detects a change
  });
};


  const updateTileType = (x, y, newType) => {
    // Push current state to undo stack before making changes
    pushToUndoStack();
    
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
  updateTileResource(selectedTile.x, selectedTile.y, resourceType); // ✅ type only
    setSelectedResource(resourceType);
  };
  
  const handleMiniTemplateSelect = (templateName) => {
    if (!selectedTile || !templateName) {
      console.log("⚠️ No tile selected or template name, template placement ignored.");
      return;
    }
    
    try {
      // Load the mini template file
      const templatePath = path.join(projectRoot, 'game-server', 'layouts', 'gridLayouts', 'miniTemplates', `${templateName}.json`);
      const templateData = JSON.parse(fs.readFileSync(templatePath, 'utf-8'));
      
      console.log(`🏰 Placing mini template: ${templateName} at (${selectedTile.x}, ${selectedTile.y})`);
      
      // Push current state to undo stack before making changes
      pushToUndoStack();
      
      // Apply the template to the grid
      setGrid(prevGrid => {
        const newGrid = prevGrid.map(row => row.map(cell => ({ ...cell })));
        
        // Process tiles from template
        if (templateData.tiles) {
          templateData.tiles.forEach((row, templateY) => {
            row.forEach((tileLayoutKey, templateX) => {
              const gridX = selectedTile.x + templateY;
              const gridY = selectedTile.y + templateX;
              
              // Check bounds
              if (gridX >= 0 && gridX < GRID_SIZE && gridY >= 0 && gridY < GRID_SIZE) {
                // Only place if not empty/blank
                if (tileLayoutKey && tileLayoutKey !== '**') {
                  const tileResource = masterResources.find(res => res.layoutkey === tileLayoutKey && res.category === "tile");
                  if (tileResource) {
                    newGrid[gridX][gridY] = { 
                      ...newGrid[gridX][gridY], 
                      type: tileResource.layoutkey,
                      resource: "" // Clear any existing resource when placing a tile from template
                    };
                  }
                }
              }
            });
          });
        }
        
        // Process resources from template
        if (templateData.resources) {
          templateData.resources.forEach((row, templateY) => {
            row.forEach((resourceLayoutKey, templateX) => {
              const gridX = selectedTile.x + templateY;
              const gridY = selectedTile.y + templateX;
              
              // Check bounds
              if (gridX >= 0 && gridX < GRID_SIZE && gridY >= 0 && gridY < GRID_SIZE) {
                // Only place if not empty/blank
                if (resourceLayoutKey && resourceLayoutKey !== '**') {
                  const resourceItem = masterResources.find(res => res.layoutkey === resourceLayoutKey);
                  if (resourceItem) {
                    newGrid[gridX][gridY] = { ...newGrid[gridX][gridY], resource: resourceItem.type };
                  }
                }
              }
            });
          });
        }
        
        console.log(`✅ Mini template ${templateName} placed successfully`);
        return newGrid;
      });
      
    } catch (error) {
      console.error(`❌ Error loading mini template ${templateName}:`, error);
      alert(`Error loading mini template: ${error.message}`);
    }
  };

  const updateTileResource = (x, y, resourceType) => {
    // Push current state to undo stack before making changes
    pushToUndoStack();
    
    setGrid(prevGrid => {
      const newGrid = prevGrid.map((row, rowIndex) =>
        row.map((cell, colIndex) => {
          if (rowIndex === x && colIndex === y) {
            return { ...cell, resource: resourceType }; // store the TYPE here
          }
          return cell;
        })
      );
      return newGrid;
    });

    setSelectedResource(resourceType);
  };


const handleResourceDistributionChange = (resourceType, value) => {
  setResourceDistribution(prev => ({
    ...prev,
    [resourceType]: value === "" ? 0 : parseInt(value, 10) // Ensure empty values default to 0
  }));
};

const handleEnemyDistributionChange = (enemyType, value) => {
  setEnemyDistribution(prev => ({
    ...prev,
    [enemyType]: value === "" ? 0 : parseInt(value, 10)
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



  const confirmAndLoadLayout = () => {
    setShowLoadConfirm(true);
  };

  // Modified loadLayout to accept setFileInfo and update file context if needed
  const loadLayout = async (setFileInfo = true) => {
    console.log(`🔄 Loading layout: ${fileName} from directory: ${directory}`);
    // Grid type should be set from the database, not the directory
    try {
      const layoutPath = path.join(
        projectRoot,
        'game-server',
        'layouts',
        'gridLayouts',
        directory,
        `${fileName}.json`
      );

      const raw = fs.readFileSync(layoutPath, 'utf-8');
      const loadedGrid = JSON.parse(raw);

      if (!loadedGrid.tiles || !loadedGrid.resources) {
        console.error("❌ Error: Missing tiles or resources in loaded file.");
        return;
      }

      // Force a new grid object to ensure React state change is detected
      setGrid(
        loadedGrid.tiles.map((row, x) =>
          row.map((cell, y) => {
            const tileResource = masterResources.find(res => res.layoutkey === cell && res.category === "tile");
            const resourceItem = masterResources.find(res => res.layoutkey === loadedGrid.resources[x][y]);

            return {
              type: tileResource ? tileResource.layoutkey : '**',
  resource: resourceItem ? resourceItem.type : '', // ✅ store TYPE not symbol
            };
          })
        )
      );

      setSelectedTile(null); // Force deselection to reset render state
      // Ensure all tile types are included, even if not in the loaded grid
      const defaultDistribution = { g: 100, s: 0, d: 0, w: 0, p: 0, l: 0, n: 0, x: 0, y: 0, z: 0 };
      const loadedDistribution = loadedGrid.tileDistribution || {};
      setTileDistribution({ ...defaultDistribution, ...loadedDistribution });
      setResourceDistribution({ ...loadedGrid.resourceDistribution } || {});
      
      // Load enemy distribution
      if (loadedGrid.enemiesDistribution) {
        // Initialize with zeros for all enemy types
        const newEnemyDist = {};
        enemyNpcs.forEach(enemy => {
          newEnemyDist[enemy.type] = 0;
        });
        // Override with loaded values
        Object.entries(loadedGrid.enemiesDistribution).forEach(([type, count]) => {
          newEnemyDist[type] = count;
        });
        setEnemyDistribution(newEnemyDist);
      } else {
        // Reset to zeros if no enemy distribution in file
        const initialEnemyDist = {};
        enemyNpcs.forEach(enemy => {
          initialEnemyDist[enemy.type] = 0;
        });
        setEnemyDistribution(initialEnemyDist);
      }

      console.log("Is setFileInfo true?  ", setFileInfo);
      console.log("Current file name:", fileName);
      console.log("Current directory:", directory);
      console.log("✅ Grid successfully loaded from:", layoutPath);
      
      // Initialize undo stack with the loaded state - delay to ensure all state is set
      setTimeout(() => {
        initializeUndoStack();
      }, 100);
    } catch (error) {
      console.error('❌ Failed to load layout:', error);
      alert('Error: Unable to load layout. Check the console for details.');
    } finally {
      setShowLoadConfirm(false);
    }
  };


  const confirmAndSaveLayout = () => {
    setShowSaveConfirm(true);
  };

  const saveLayout = async () => {

    const layoutPath = path.join(
      projectRoot,
      'game-server',
      'layouts',
      'gridLayouts',
      directory,
      `${fileName}.json`
    );

    try {
      const formattedTiles = grid.map(row => 
        row.map(cell => {
          const tileResource = masterResources.find(res => res.layoutkey === cell.type && res.category === "tile");
          return tileResource ? tileResource.layoutkey : '**';
        })
      );
      const formattedResources = grid.map(row => 
        row.map(cell => {
          if (!cell.resource) return '**';
          const resourceItem = masterResources.find(res => res.type === cell.resource);
          return resourceItem ? resourceItem.layoutkey : '**';
        })
      );
      const filteredResourceDistribution = Object.fromEntries(
        Object.entries(resourceDistribution).filter(([_, value]) => value > 0)
      );
      const filteredEnemyDistribution = Object.fromEntries(
        Object.entries(enemyDistribution).filter(([_, value]) => value > 0)
      );
      const formattedGrid = {
        tiles: formattedTiles,
        resources: formattedResources,
        tileDistribution: tileDistribution,
        resourceDistribution: filteredResourceDistribution
      };
      // Add enemiesDistribution if it has any values
      if (Object.keys(filteredEnemyDistribution).length > 0) {
        formattedGrid.enemiesDistribution = filteredEnemyDistribution;
      }
      fs.writeFileSync(layoutPath, JSON.stringify(formattedGrid, null, 2), 'utf-8');
      console.log(`✅ Successfully saved layout to ${layoutPath}`);
      alert(`Layout saved to ${layoutPath}`);
    } catch (error) {
      console.error('❌ Failed to save layout:', error);
      alert('Error: Unable to save layout. Check the console for details.');
    } finally {
      setShowSaveConfirm(false);
    }
  };

 // 🔹 Generate Tiles Functions
 const handleGenerateTilesBlanksOnly = () => {
   if (!window.confirm("Generate tiles only on blank spaces?")) return;
   
   // Push current state to undo stack before generating
   pushToUndoStack();
   
   console.log("🔄 Generating tiles on blank spaces...");
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
   console.log("✅ Tiles successfully generated on blank spaces!");
 };

 const handleGenerateTilesOverwriteAll = () => {
   if (!window.confirm("Overwrite ALL tiles based on distribution?")) return;
   
   // Push current state to undo stack before overwriting
   pushToUndoStack();
   
   console.log("🔄 Overwriting all tiles...");
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
   let newGrid = grid.map(row => row.map(cell => ({ ...cell, type: "" }))); // Clear all tiles first
   
   let targets = [];
   newGrid.forEach((row, x) => {
     row.forEach((cell, y) => {
       targets.push({ x, y });
     });
   });
   
   targets.forEach(({ x, y }) => {
     const randomTile = tilePool[Math.floor(Math.random() * tilePool.length)];
     newGrid[x][y].type = randomTile;
   });
   
   setGrid(newGrid);
   console.log("✅ All tiles successfully overwritten!");
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
   
   // Push current state to undo stack before generating resources
   pushToUndoStack();
   
   console.log("🔄 Generating new resources...");
  if (!grid || !availableResources || !masterResources) {
    console.warn("⚠️ Missing grid or resource data. Cannot generate resources.");
    return;
  }
  let newGrid = grid.map(row => row.map(cell => ({ ...cell })));
  if (choice.toLowerCase() === "regenerate") {
    newGrid = newGrid.map(row => row.map(cell => ({ ...cell, resource: "" })));
  }
  
  // Build resource pool - but don't shuffle yet
  let resourcesByType = {};
  Object.entries(resourceDistribution).forEach(([type, count]) => {
    const res = masterResources.find(r => r.type === type);
    if (res && count > 0) {
      resourcesByType[type] = {
        resource: res,
        remaining: parseInt(count)
      };
    }
  });
  
  const totalResources = Object.values(resourcesByType).reduce((sum, r) => sum + r.remaining, 0);
  if (totalResources === 0) {
    console.warn("⚠️ No valid resource distribution found.");
    return;
  }
  
  // Find all valid cells
  let validCells = [];
  newGrid.forEach((row, x) =>
    row.forEach((cell, y) => {
      if (!cell.resource) {
        const tileRes = masterResources.find(r => r.layoutkey === cell.type && r.category === "tile");
        if (tileRes) validCells.push({ x, y, tileType: tileRes.type });
      }
    })
  );
  
  // Place resources using true random selection
  let resourcesPlaced = 0;
  const maxAttempts = totalResources * 3; // Prevent infinite loops
  let attempts = 0;
  
  while (resourcesPlaced < totalResources && attempts < maxAttempts && validCells.length > 0) {
    attempts++;
    
    // Pick a random valid cell
    const cellIndex = Math.floor(Math.random() * validCells.length);
    const cell = validCells[cellIndex];
    
    // Pick a random resource type that still has remaining count
    const availableTypes = Object.entries(resourcesByType)
      .filter(([type, data]) => data.remaining > 0)
      .map(([type, data]) => ({ type, resource: data.resource }));
    
    if (availableTypes.length === 0) break;
    
    const randomTypeIndex = Math.floor(Math.random() * availableTypes.length);
    const selectedType = availableTypes[randomTypeIndex];
    
    // Check if this resource can be placed on this tile type
    if (selectedType.resource[`validon${cell.tileType}`]) {
      newGrid[cell.x][cell.y].resource = selectedType.type;
      resourcesByType[selectedType.type].remaining--;
      resourcesPlaced++;
      
      // Remove this cell from valid cells
      validCells.splice(cellIndex, 1);
    }
  }
  
  setGrid(newGrid);
  console.log(`✅ Resources successfully generated! Placed ${resourcesPlaced} resources.`);
  
  // Warn if we couldn't place all resources
  const unplacedCount = totalResources - resourcesPlaced;
  if (unplacedCount > 0) {
    console.warn(`⚠️ Could not place ${unplacedCount} resources due to tile type restrictions.`);
  }
};

// 🔹 Populate Random Enemies Function
const handlePopulateRandomEnemies = () => {
  console.log("🎯 Populating random enemies...");
  if (!grid || !enemyDistribution || !masterResources) {
    console.warn("⚠️ Missing grid or enemy distribution data.");
    return;
  }
  
  // Push current state to undo stack before populating enemies
  pushToUndoStack();
  
  // Create enemy pool based on distribution
  let enemyPool = [];
  Object.entries(enemyDistribution).forEach(([type, count]) => {
    const enemy = masterResources.find(r => r.type === type && r.category === 'npc' && (r.action === 'attack' || r.action === 'spawn'));
    if (enemy && count > 0) {
      for (let i = 0; i < count; i++) {
        enemyPool.push(enemy);
      }
    }
  });
  
  if (enemyPool.length === 0) {
    console.warn("⚠️ No enemies to place. Set enemy quantities first.");
    alert("No enemies to place. Please set enemy quantities first.");
    return;
  }
  
  // Find all valid cells for enemy placement
  let validCells = [];
  grid.forEach((row, x) => {
    row.forEach((cell, y) => {
      if (!cell.resource) {
        // Get the tile type
        const tileResource = masterResources.find(r => r.layoutkey === cell.type && r.category === 'tile');
        if (tileResource) {
          validCells.push({ x, y, tileType: tileResource.type });
        }
      }
    });
  });
  
  if (validCells.length === 0) {
    console.warn("⚠️ No valid cells available for enemy placement.");
    alert("No valid cells available for enemy placement.");
    return;
  }
  
  // Shuffle enemy pool to randomize placement
  enemyPool = enemyPool.sort(() => Math.random() - 0.5);
  
  // Place enemies respecting tile validity
  let newGrid = grid.map(row => row.map(cell => ({ ...cell })));
  let placedCount = 0;
  let skippedCount = 0;
  
  for (const enemy of enemyPool) {
    // Shuffle valid cells for each enemy to ensure random placement
    const shuffledCells = [...validCells].sort(() => Math.random() - 0.5);
    
    // Find first valid cell for this enemy
    let placed = false;
    for (const cell of shuffledCells) {
      // Check if enemy is valid on this tile type
      const validOnProperty = `validon${cell.tileType}`;
      if (enemy[validOnProperty]) {
        newGrid[cell.x][cell.y].resource = enemy.type;
        // Remove this cell from validCells so it won't be used again
        validCells = validCells.filter(c => !(c.x === cell.x && c.y === cell.y));
        placedCount++;
        placed = true;
        break;
      }
    }
    
    if (!placed) {
      skippedCount++;
      console.warn(`⚠️ Could not place ${enemy.type} - no valid tiles available`);
    }
    
    // If no more valid cells, stop trying
    if (validCells.length === 0) break;
  }
  
  setGrid(newGrid);
  console.log(`✅ Successfully placed ${placedCount} enemies!`);
  
  if (placedCount < enemyPool.length) {
    if (skippedCount > 0) {
      alert(`Placed ${placedCount} out of ${enemyPool.length} enemies.\n${skippedCount} enemies could not be placed due to tile validity restrictions.`);
    } else {
      alert(`Only ${placedCount} out of ${enemyPool.length} enemies could be placed due to limited empty cells.`);
    }
  }
};

// 🔹 Clear All Enemies Function
const handleClearAllEnemies = () => {
  if (!window.confirm("Are you sure you want to remove all enemies from the grid?")) return;
  
  console.log("🗑️ Clearing all enemies from grid...");
  
  const newGrid = grid.map(row =>
    row.map(cell => {
      // Check if this resource is an enemy NPC
      if (cell.resource) {
        const resource = masterResources.find(r => 
          r.type === cell.resource && 
          r.category === 'npc' && 
          (r.action === 'attack' || r.action === 'spawn')
        );
        if (resource) {
          // Remove the enemy
          return { ...cell, resource: "" };
        }
      }
      return cell;
    })
  );
  
  setGrid(newGrid);
  console.log("✅ All enemies removed from grid.");
};

// 🔹 Clear Grid Function
const handleClearGrid = () => {
  // Push current state to undo stack before clearing
  pushToUndoStack();
  
  const clearedGrid = grid.map(row =>
    row.map(() => ({ type: "", resource: "", npc: "" }))
  );
  setGrid(clearedGrid);
  setSelectedTile(null);
  console.log("🧹 Cleared all tiles and resources.");
};

// Delete all resources from the grid
const handleDeleteAllResources = () => {
  if (!window.confirm("Are you sure you want to delete all resources from the grid?")) return;
  
  // Push current state to undo stack before deleting all resources
  pushToUndoStack();
  
  const newGrid = grid.map(row =>
    row.map(cell => ({ ...cell, resource: "" }))
  );
  setGrid(newGrid);
  console.log("🗑️ Deleted all resources from grid.");
};

// Delete tiles based on selected types
const handleDeleteSelectedTiles = () => {
  const selectedTypes = Object.entries(selectedTileTypes)
    .filter(([_, selected]) => selected)
    .map(([type, _]) => type);
    
  if (selectedTypes.length === 0) {
    alert("Please select at least one tile type to delete.");
    return;
  }
  
  if (!window.confirm(`Are you sure you want to delete all tiles of types: ${selectedTypes.join(', ')}?`)) return;
  
  // Push current state to undo stack before deleting selected tiles
  pushToUndoStack();
  
  // Map single-letter types to their layoutkey equivalents
  const typeMapping = {
    'g': 'GR',  // grass
    's': 'SL',  // slate
    'd': 'DI',  // dirt
    'w': 'WA',  // water
    'p': 'PA',  // pavement
    'l': 'LV',  // lava
    'n': 'SA',  // sand
    'x': 'CB',  // cobblestone
    'y': 'DU',  // dungeon
    'z': "ZZ"   // moss
  };
  
  const layoutKeysToDelete = selectedTypes.map(type => typeMapping[type] || type);
  
  const newGrid = grid.map(row =>
    row.map(cell => {
      if (layoutKeysToDelete.includes(cell.type)) {
        return { ...cell, type: "" };
      }
      return cell;
    })
  );
  setGrid(newGrid);
  console.log(`🗑️ Deleted tiles of types: ${selectedTypes.join(', ')} (layoutkeys: ${layoutKeysToDelete.join(', ')})`);
};

// Populate resource quantities based on random template from gridType folder
const handlePopulateResourceQuantities = () => {
  if (!currentGridType) {
    alert("Please load a grid first to determine its type.");
    return;
  }
  
  try {
    const layoutDir = path.join(
      projectRoot,
      'game-server',
      'layouts',
      'gridLayouts',
      currentGridType
    );
    
    // Get all JSON files in the directory
    const files = fs.readdirSync(layoutDir).filter(file => file.endsWith('.json'));
    
    if (files.length === 0) {
      alert(`No template files found in ${currentGridType} folder.`);
      return;
    }
    
    // Pick a random file
    const randomFile = files[Math.floor(Math.random() * files.length)];
    const templatePath = path.join(layoutDir, randomFile);
    
    // Read and parse the template
    const templateData = JSON.parse(fs.readFileSync(templatePath, 'utf-8'));
    
    if (templateData.resourceDistribution) {
      // Reset all resource quantities to 0
      const newDistribution = {};
      availableResources.forEach(res => {
        newDistribution[res.type] = 0;
      });
      
      // Apply quantities from template
      Object.entries(templateData.resourceDistribution).forEach(([type, quantity]) => {
        if (newDistribution.hasOwnProperty(type)) {
          newDistribution[type] = quantity;
        }
      });
      
      setResourceDistribution(newDistribution);
      console.log(`✅ Populated resource quantities from template: ${randomFile}`);
      alert(`Resource quantities populated from template: ${randomFile}`);
    } else {
      alert("Selected template has no resource distribution data.");
    }
  } catch (error) {
    console.error('Failed to populate resource quantities:', error);
    alert('Error loading template. Check console for details.');
  }
};

// Populate tile distribution based on random template from gridType folder
const handlePopulateTileDistribution = () => {
  if (!currentGridType) {
    alert("Please load a grid first to determine its type.");
    return;
  }
  
  try {
    const layoutDir = path.join(
      projectRoot,
      'game-server',
      'layouts',
      'gridLayouts',
      currentGridType
    );
    
    // Get all JSON files in the directory
    const files = fs.readdirSync(layoutDir).filter(file => file.endsWith('.json'));
    
    if (files.length === 0) {
      alert(`No template files found in ${currentGridType} folder.`);
      return;
    }
    
    // Pick a random file
    const randomFile = files[Math.floor(Math.random() * files.length)];
    const templatePath = path.join(layoutDir, randomFile);
    
    // Read and parse the template
    const templateData = JSON.parse(fs.readFileSync(templatePath, 'utf-8'));
    
    if (templateData.tileDistribution) {
      // Ensure all tile types are included, even if not in the template
      const defaultDistribution = { g: 100, s: 0, d: 0, w: 0, p: 0, l: 0, n: 0, x: 0, y: 0, z: 0 };
      setTileDistribution({ ...defaultDistribution, ...templateData.tileDistribution });
      console.log(`✅ Populated tile distribution from template: ${randomFile}`);
      alert(`Tile distribution populated from template: ${randomFile}`);
    } else {
      alert("Selected template has no tile distribution data.");
    }
  } catch (error) {
    console.error('Failed to populate tile distribution:', error);
    alert('Error loading template. Check console for details.');
  }
};


// --- Expose loadLayout globally for external triggering ---
if (typeof window !== "undefined") {
  window.gridEditorAPI = {
    loadLayout
  };
}


  //////////////////////////////////////////////////
  // Render the Grid Editor UI
  return (
    <div className="editor-container">
      
      {/* Left Panel for UI Controls */}
      <div className="editor-panel"> 
        <h2>Grid Editor</h2>
        
        <div style={{ display: 'flex', gap: '8px', marginTop: '4px', marginBottom: '4px' }}>
          <button className="small-button" onClick={handleClearGrid}>Clear Grid</button>
          <button 
            className="small-button" 
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            title={`Undo (Ctrl+Z) - ${undoStack.length > 0 ? `${undoStack.length} actions available` : 'No actions to undo'}`}
          >
            Undo
          </button>
        </div>

        {/* File Management Container */}
        <div style={{ 
          backgroundColor: 'rgba(255, 255, 255, 0.95)', 
          padding: '8px', 
          borderRadius: '5px', 
          marginBottom: '8px',
          border: '1px solid rgba(0,0,0,0.1)'
        }}>
          <FileManager
            loadLayout={confirmAndLoadLayout}
            saveLayout={confirmAndSaveLayout}
          />

          {/* Display current grid type */}
          <div style={{ marginTop: '8px' }}>
            <strong>Grid Type:</strong> {currentGridType || 'Not loaded'}
          </div>
        </div>

        {/* Size Controls Container */}
        <div style={{ 
          backgroundColor: 'white', 
          padding: '8px', 
          borderRadius: '5px', 
          marginBottom: '8px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <h4 style={{ margin: '0 0 5px 0' }}>Tile Size:</h4>
          <input 
            type="range" min="10" max="50" value={tileSize} 
            onChange={(e) => setTileSize(Number(e.target.value))}
            style={{ width: '100%', marginBottom: '8px' }}
          />
          <h4 style={{ margin: '0 0 5px 0' }}>Tile Brush Size:</h4>
          <input
            type="range"
            min="1"
            max="13"
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            style={{ width: '100%', marginBottom: '8px' }}
          />
          
          <h4 style={{ margin: '8px 0 3px 0' }}>Brush Shape:</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <label>
              <input
                type="radio"
                name="brushShape"
                value="square"
                checked={brushShape === 'square'}
                onChange={(e) => setBrushShape(e.target.value)}
              />
              Square
            </label>
            <label>
              <input
                type="radio"
                name="brushShape"
                value="circle"
                checked={brushShape === 'circle'}
                onChange={(e) => setBrushShape(e.target.value)}
              />
              Circle
            </label>
            <label>
              <input
                type="radio"
                name="brushShape"
                value="scatter"
                checked={brushShape === 'scatter'}
                onChange={(e) => setBrushShape(e.target.value)}
              />
              Scatter
            </label>
          </div>
          
          {brushShape === 'scatter' && (
            <div style={{ marginTop: '10px' }}>
              <h4 style={{ margin: '0 0 5px 0' }}>Scatter Percentage: {scatterPercentage}%</h4>
              <input
                type="range"
                min="1"
                max="100"
                value={scatterPercentage}
                onChange={(e) => setScatterPercentage(Number(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>
          )}
        </div>
  
        {/* Selected Tile Container */}
        <div style={{ 
          backgroundColor: 'white', 
          padding: '10px', 
          borderRadius: '5px', 
          marginBottom: '15px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>

        {selectedTile && (
          <>
            <h4>SELECTED TILE:</h4>
            <h4>Tile Type: {grid[selectedTile.x][selectedTile.y].type || "None"}</h4>
            <p style={{ fontSize: '12px', color: '#666' }}>Shortcuts: (g)rass; (d)irt; (s)late; (p)avement; (w)ater; (l)ava; sa(n)d; (DEL)=clear</p>
  
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
            
            <p>Mini Templates: </p>

            <select onChange={(e) => handleMiniTemplateSelect(e.target.value)} value="">
              <option value="">None</option>
              {availableMiniTemplates.map(template => (
                <option key={template.name} value={template.name}>
                  🏰 {template.name}
                </option>
              ))}
            </select>
          </>
        )}
        </div>


        <h3>TILES:</h3>

        <div className="button-group" style={{ marginBottom: '10px' }}>
          <button className="small-button" onClick={handleDeleteSelectedTiles}>Delete Selected Tiles</button>
        </div>
        
        {/* Tile type checkboxes for selective deletion */}
        <div style={{ marginBottom: '15px', padding: '8px', backgroundColor: '#f5f5f5', borderRadius: '5px' }}>
          <p style={{ fontSize: '12px', marginBottom: '5px' }}>Select tile types to delete:</p>
          {Object.entries(tileColors).map(([type, color]) => (
            <div key={type} style={{ display: 'inline-block', marginRight: '15px', marginBottom: '5px' }}>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={selectedTileTypes[type]}
                  onChange={(e) => setSelectedTileTypes(prev => ({ ...prev, [type]: e.target.checked }))}
                  style={{ marginRight: '5px' }}
                />
                <span style={{ 
                  backgroundColor: color, 
                  color: 'white', 
                  padding: '2px 8px', 
                  borderRadius: '3px',
                  fontSize: '12px',
                  fontWeight: 'bold'
                }}>
                  {type}
                </span>
              </label>
            </div>
          ))}
        </div>
        
        <div className="button-group" >
          <button className="small-button" onClick={handlePopulateTileDistribution}>Populate tile sliders based on gridType (Loads tile %'s from random template in the {currentGridType || 'gridType'} folder) </button>
        </div>

        {Object.keys(tileDistribution).map(type => (
          <div key={type} style={{ display: 'flex', alignItems: 'center', marginBottom: '5px' }}>
            <label style={{
              fontSize: '12px', width: '30px',
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

        <div className="button-group" style={{ marginBottom: '6px' }}>
          <button className="small-button" onClick={handleGenerateTilesBlanksOnly}>Generate tiles based on sliders (fill blank tiles only)</button>
        </div>
        <div className="button-group">
          <button className="small-button" onClick={handleGenerateTilesOverwriteAll}>Generate tiles based on sliders (overwrite all tiles)</button>
        </div>


        {/* 🎯 Enemy Distribution Section */}
        <h3>ENEMIES:</h3>

        <div className="button-group" style={{ marginBottom: '10px' }}>
          <button className="small-button" onClick={handlePopulateRandomEnemies}>Populate random enemies</button>
        </div>
        <div className="button-group" style={{ marginBottom: '10px' }}>
          <button className="small-button" onClick={handleClearAllEnemies}>Clear all enemies</button>
        </div>
        {enemyNpcs.map(enemy => (
          <div key={enemy.type} style={{ display: 'flex', alignItems: 'center', marginBottom: '5px' }}>
            <input
              type="number"
              min="0"
              value={enemyDistribution[enemy.type] || ""}
              onChange={(e) => handleEnemyDistributionChange(enemy.type, e.target.value)}
              style={{ width: "50px", marginRight: "10px" }}
            />
            <label>{enemy.symbol} {enemy.type}</label>
          </div>
        ))}


        {/* 🔹 Resource Distribution Section */}
        <h3>RESOURCES:</h3>

        <div className="button-group" style={{ marginBottom: '6px' }}>
          <button className="small-button" onClick={handleDeleteAllResources}>Delete All Resources (removes all resources but keeps tile types)</button>
        </div>
        <div className="button-group" style={{ marginBottom: '6px' }}>
          <button className="small-button" onClick={handlePopulateResourceQuantities}>Populate quantities based on gridType (Loads resource counts from a random template in the {currentGridType || 'gridType'} folder)</button>
        </div>
        <div className="button-group">
          <button className="small-button" onClick={handleGenerateResources}>Generate Resources (places resources randomly on valid tiles based on set quantities)</button>
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
        <div
          className="grid-with-rulers"
          style={{
            display: 'flex',
            flexDirection: 'column',
            marginLeft: tileSize,
            minWidth: (GRID_SIZE + 3) * tileSize,
            padding: '10px',
            paddingBottom: '50px' // Extra padding at bottom
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
                {row.map((tile, y) => {
                  // Check if this tile is the anchor of a multi-tile resource
                  const multiTileResource = masterResources.find(res => {
                    if (!tile.resource || res.type !== tile.resource) return false;
                    // Only check the anchor tile (where the resource is stored)
                    if (grid[x][y].resource === res.type) {
                      // Exclude NPCs from multi-tile rendering
                      return res.range > 1 && res.category !== 'npc';
                    }
                    return false;
                  });
                  
                  return (
                    <Tile
                      key={`${x}-${y}`}
                      x={x}
                      y={y}
                      tile={tile}
                      updateTile={() => handleTileClick(x, y)}
                      isSelected={selectedTile?.x === x && selectedTile?.y === y}
                      setSelectedTile={setSelectedTile}
                      tileSize={tileSize}
                      masterResources={masterResources}
                      multiTileResource={multiTileResource}
                    />
                  );
                })}
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
  
      {showSaveConfirm && (
        <Modal
          isOpen={showSaveConfirm}
          onClose={() => setShowSaveConfirm(false)}
          title="Confirm Save"
        >
          <p>Are you sure you want to save this layout? This cannot be undone</p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
            <button onClick={() => setShowSaveConfirm(false)} className="small-button cancel-button">Cancel</button>
            <button onClick={saveLayout} className="small-button confirm-button">Yes</button>
          </div>
        </Modal>
      )}

      {showLoadConfirm && (
        <Modal
          isOpen={showLoadConfirm}
          onClose={() => setShowLoadConfirm(false)}
          title="Confirm Save"
        >
          <p>Are you sure you want to load this layout? It will overwrite the current layout.</p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
            <button onClick={() => setShowLoadConfirm(false)} className="small-button cancel-button">Cancel</button>
            <button onClick={loadLayout} className="small-button confirm-button">Yes</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default GridEditor;
