import React, { useState, useEffect, useRef, useCallback } from 'react';
import './AtlasView.css';

const fs = window.require('fs');
const path = window.require('path');
const app = window.require('@electron/remote').app;
const isDev = !app.isPackaged;
const projectRoot = isDev
  ? path.join(__dirname, '..', '..')
  : path.join(app.getAppPath(), '..', '..', '..', '..', '..', '..', '..');

const GRID_SIZE = 64; // Each grid is 64x64
const GRIDS_PER_SETTLEMENT = 8; // 8x8 grids per settlement
const SETTLEMENTS_PER_FRONTIER = 8; // 8x8 settlements per frontier
const PIXEL_PER_TILE = 2; // Each tile rendered as 2x2 pixels

const AtlasView = ({ selectedFrontier, settlements, activePanel }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [loadedGrids, setLoadedGrids] = useState(new Map());
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [loadProgress, setLoadProgress] = useState(0);
  const [tileColors, setTileColors] = useState({});
  const [masterResources, setMasterResources] = useState([]);

  // Load master resources on mount
  useEffect(() => {
    try {
      const resourcePath = path.join(projectRoot, 'game-server', 'tuning', 'resources.json');
      const fileContents = fs.readFileSync(resourcePath, 'utf-8');
      const parsedResources = JSON.parse(fileContents);
      setMasterResources(parsedResources);
      
      // Build tile color map
      const colors = {};
      parsedResources.forEach(res => {
        if (res.category === 'tile') {
          // Map tile types to colors
          switch(res.type) {
            case 'g': colors.g = '#3dc43d'; break; // grass
            case 's': colors.s = '#8b989c'; break; // slate
            case 'd': colors.d = '#c0834a'; break; // dirt
            case 'w': colors.w = '#58cad8'; break; // water
            case 'p': colors.p = '#dab965'; break; // pavement
            case 'l': colors.l = '#c4583d'; break; // lava
            case 'n': colors.n = '#f4e4bc'; break; // sand
            default: colors[res.type] = '#333333';
          }
        }
      });
      setTileColors(colors);
    } catch (error) {
      console.error('Failed to load resources:', error);
    }
  }, []);

  // Load grids when the view becomes active
  useEffect(() => {
    if (activePanel !== 'atlas' || !selectedFrontier || !settlements.length) return;

    const loadGrids = async () => {
      setLoading(true);
      const newLoadedGrids = new Map();
      let totalGrids = 0;
      let loadedCount = 0;

      // Count total grids to load
      settlements.forEach(settlement => {
        const sid = settlement.frontierId?.toString();
        if (sid === selectedFrontier?.toString()) {
          const grids = Array.isArray(settlement.grids) ? settlement.grids.flat() : [];
          totalGrids += grids.filter(g => g.gridId).length;
        }
      });

      // Load each grid
      for (const settlement of settlements) {
        const sid = settlement.frontierId?.toString();
        if (sid !== selectedFrontier?.toString()) continue;

        const grids = Array.isArray(settlement.grids) ? settlement.grids.flat() : [];
        
        for (const gridInfo of grids) {
          if (!gridInfo.gridId) continue;

          try {
            // Try valleyFixedCoord first
            let layoutPath = path.join(
              projectRoot,
              'game-server',
              'layouts',
              'gridLayouts',
              'valleyFixedCoord',
              `${gridInfo.gridCoord}.json`
            );

            if (!fs.existsSync(layoutPath)) {
              // Fall back to grid type directory
              layoutPath = path.join(
                projectRoot,
                'game-server',
                'layouts',
                'gridLayouts',
                gridInfo.gridType,
                `${gridInfo.gridCoord}.json`
              );
            }

            if (fs.existsSync(layoutPath)) {
              const raw = fs.readFileSync(layoutPath, 'utf-8');
              const gridData = JSON.parse(raw);
              newLoadedGrids.set(gridInfo.gridCoord, {
                ...gridData,
                gridCoord: gridInfo.gridCoord,
                gridType: gridInfo.gridType
              });
              loadedCount++;
              setLoadProgress(Math.round((loadedCount / totalGrids) * 100));
            }
          } catch (error) {
            console.error(`Failed to load grid ${gridInfo.gridCoord}:`, error);
          }
        }
      }

      setLoadedGrids(newLoadedGrids);
      setLoading(false);
      console.log(`Loaded ${loadedCount} grids out of ${totalGrids}`);
      
      // Debug: check first grid
      if (newLoadedGrids.size > 0) {
        const firstGrid = Array.from(newLoadedGrids.values())[0];
        console.log('First grid sample:', {
          gridCoord: Array.from(newLoadedGrids.keys())[0],
          tilesSample: firstGrid.tiles?.[0]?.slice(0, 5),
          hasResources: !!firstGrid.resources
        });
      }
    };

    loadGrids();
  }, [activePanel, selectedFrontier, settlements]);

  // Render all grids on canvas
  useEffect(() => {
    if (loading || !canvasRef.current || loadedGrids.size === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    // Calculate canvas size
    const totalWidth = SETTLEMENTS_PER_FRONTIER * GRIDS_PER_SETTLEMENT * GRID_SIZE * PIXEL_PER_TILE;
    const totalHeight = totalWidth;
    
    // Set canvas size based on container
    const container = containerRef.current;
    if (container) {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    } else {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    
    // Clear canvas
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Apply transformations
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-totalWidth / 2 + pan.x, -totalHeight / 2 + pan.y);
    
    // Render each grid
    loadedGrids.forEach((gridData, gridCoord) => {
      // Calculate grid position from gridCoord
      const coordStr = String(gridCoord).padStart(7, '0');
      const settlementRow = parseInt(coordStr[3], 10);
      const settlementCol = parseInt(coordStr[4], 10);
      const gridRow = parseInt(coordStr[5], 10);
      const gridCol = parseInt(coordStr[6], 10);
      
      const baseX = (settlementCol * GRIDS_PER_SETTLEMENT + gridCol) * GRID_SIZE * PIXEL_PER_TILE;
      const baseY = (settlementRow * GRIDS_PER_SETTLEMENT + gridRow) * GRID_SIZE * PIXEL_PER_TILE;
      
      // Render tiles
      if (gridData.tiles) {
        gridData.tiles.forEach((row, y) => {
          row.forEach((tileKey, x) => {
            if (tileKey && tileKey !== '**') {
              // For fixed grids, tileKey might already be the type (like 'g', 's', etc)
              let color = tileColors[tileKey];
              
              if (!color) {
                // Try to find tile resource to get the type
                const tileResource = masterResources.find(r => r.layoutkey === tileKey && r.category === 'tile');
                if (tileResource && tileColors[tileResource.type]) {
                  color = tileColors[tileResource.type];
                }
              }
              
              if (color) {
                ctx.fillStyle = color;
                ctx.fillRect(
                  baseX + x * PIXEL_PER_TILE,
                  baseY + y * PIXEL_PER_TILE,
                  PIXEL_PER_TILE,
                  PIXEL_PER_TILE
                );
              }
            }
          });
        });
      }
      
      // Render resources as single pixels
      if (gridData.resources) {
        // Resources might be in array format [{type, x, y}] or grid format
        if (Array.isArray(gridData.resources) && gridData.resources.length > 0 && gridData.resources[0].x !== undefined) {
          // Array format from server
          gridData.resources.forEach(resource => {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(
              baseX + resource.x * PIXEL_PER_TILE + PIXEL_PER_TILE * 0.25,
              baseY + resource.y * PIXEL_PER_TILE + PIXEL_PER_TILE * 0.25,
              PIXEL_PER_TILE * 0.5,
              PIXEL_PER_TILE * 0.5
            );
          });
        } else if (Array.isArray(gridData.resources)) {
          // Grid format
          gridData.resources.forEach((row, y) => {
            if (Array.isArray(row)) {
              row.forEach((resourceKey, x) => {
                if (resourceKey && resourceKey !== '**') {
                  // Draw resource as a white pixel
                  ctx.fillStyle = '#FFFFFF';
                  ctx.fillRect(
                    baseX + x * PIXEL_PER_TILE + PIXEL_PER_TILE * 0.25,
                    baseY + y * PIXEL_PER_TILE + PIXEL_PER_TILE * 0.25,
                    PIXEL_PER_TILE * 0.5,
                    PIXEL_PER_TILE * 0.5
                  );
                }
              });
            }
          });
        }
      }
    });
    
    ctx.restore();
  }, [loading, loadedGrids, pan, zoom, tileColors, masterResources]);

  // Mouse handlers for panning
  const handleMouseDown = useCallback((e) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x * zoom, y: e.clientY - pan.y * zoom });
  }, [pan, zoom]);

  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return;
    setPan({
      x: (e.clientX - dragStart.x) / zoom,
      y: (e.clientY - dragStart.y) / zoom
    });
  }, [isDragging, dragStart, zoom]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Wheel handler for zooming
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(prevZoom => Math.max(0.1, Math.min(5, prevZoom * delta)));
  }, []);

  return (
    <div className="atlas-container" ref={containerRef}>
      <div className="atlas-controls">
        <h2>🗺️ Atlas View</h2>
        {loading && <div className="loading-bar">Loading grids... {loadProgress}%</div>}
        <div className="zoom-info">Zoom: {Math.round(zoom * 100)}%</div>
        <div className="grid-count">Loaded: {loadedGrids.size} grids</div>
        <button onClick={() => { setPan({ x: 0, y: 0 }); setZoom(1); }}>Reset View</button>
      </div>
      
      <canvas
        ref={canvasRef}
        className="atlas-canvas"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      />
    </div>
  );
};

export default AtlasView;