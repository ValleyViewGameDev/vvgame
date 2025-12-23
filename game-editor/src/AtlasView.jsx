import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import API_BASE from './config';
import { tileColors as defaultTileColors } from './tileConfig';

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
  const [loadResources, setLoadResources] = useState(false); // Toggle for loading resources

  // Load master resources on mount
  useEffect(() => {
    try {
      const resourcePath = path.join(projectRoot, 'game-server', 'tuning', 'resources.json');
      const fileContents = fs.readFileSync(resourcePath, 'utf-8');
      const parsedResources = JSON.parse(fileContents);
      setMasterResources(parsedResources);
      
      // Use centralized tile colors from tileConfig
      // This ensures consistency with game-client and other editor components
      setTileColors(defaultTileColors);
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
      const gridsWithData = new Set();

      // Count grids from settlements
      settlements.forEach(settlement => {
        const sid = settlement.frontierId?.toString();
        if (sid === selectedFrontier?.toString()) {
          const grids = Array.isArray(settlement.grids) ? settlement.grids.flat() : [];
          totalGrids += grids.filter(g => g.gridId).length;
        }
      });

      // FIRST PRIORITY: Load actual grid data from database for grids with gridId
      const gridPromises = [];
      const gridInfoMap = new Map();
      
      for (const settlement of settlements) {
        const sid = settlement.frontierId?.toString();
        if (sid !== selectedFrontier?.toString()) continue;

        const grids = Array.isArray(settlement.grids) ? settlement.grids.flat() : [];
        
        for (const gridInfo of grids) {
          if (!gridInfo.gridId) continue;
          
          // Store grid info for later use
          gridInfoMap.set(gridInfo.gridId, gridInfo);
          
          // Create promise for this grid
          const promise = axios.get(`${API_BASE}/api/load-grid/${gridInfo.gridId}`)
            .then(response => ({
              gridId: gridInfo.gridId,
              data: response.data,
              error: null
            }))
            .catch(error => ({
              gridId: gridInfo.gridId,
              data: null,
              error
            }));
          
          gridPromises.push(promise);
        }
      }
      
      // Load grids in batches to avoid overwhelming the server
      const BATCH_SIZE = 10;
      const results = [];
      
      for (let i = 0; i < gridPromises.length; i += BATCH_SIZE) {
        const batch = gridPromises.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(batch);
        results.push(...batchResults);
        
        // Update progress after each batch
        const batchProgress = Math.round(((i + batch.length) / gridPromises.length) * 50); // First 50% for database loading
        setLoadProgress(batchProgress);
      }
      
      // Process results
      for (const result of results) {
        if (result.error) {
          console.error(`Failed to load grid ${result.gridId}:`, result.error);
          continue;
        }
        
        const gridInfo = gridInfoMap.get(result.gridId);
        const gridData = result.data;
        
        if (gridData && gridData.tiles) {
          newLoadedGrids.set(gridInfo.gridCoord, {
            tiles: gridData.tiles,
            resources: loadResources ? (gridData.resources || []) : [],
            gridCoord: gridInfo.gridCoord,
            gridType: gridInfo.gridType,
            fromDatabase: true
          });
          gridsWithData.add(gridInfo.gridCoord);
          loadedCount++;
          setLoadProgress(Math.round((loadedCount / totalGrids) * 100));
        }
      }

      // SECOND PRIORITY: Load valleyFixedCoord templates for grids without database data
      const valleyFixedCoordPath = path.join(
        projectRoot,
        'game-server',
        'layouts',
        'gridLayouts',
        'valleyFixedCoord'
      );
      
      if (fs.existsSync(valleyFixedCoordPath)) {
        const files = fs.readdirSync(valleyFixedCoordPath);
        for (const file of files) {
          if (file.endsWith('.json')) {
            const gridCoord = parseInt(file.replace('.json', ''));
            // Check if this grid belongs to the selected frontier
            const coordStr = String(gridCoord).padStart(7, '0');
            const frontierIdFromCoord = parseInt(coordStr.substring(0, 3));
            
            if (frontierIdFromCoord === parseInt(selectedFrontier) && !gridsWithData.has(gridCoord)) {
              try {
                const layoutPath = path.join(valleyFixedCoordPath, file);
                const raw = fs.readFileSync(layoutPath, 'utf-8');
                const gridData = JSON.parse(raw);
                newLoadedGrids.set(gridCoord, {
                  ...gridData,
                  gridCoord: gridCoord,
                  gridType: 'valley',
                  fromTemplate: true
                });
                loadedCount++;
              } catch (error) {
                console.error(`Failed to load valleyFixedCoord grid ${file}:`, error);
              }
            }
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
  }, [activePanel, selectedFrontier, settlements, loadResources]);

  // Render all grids on canvas
  useEffect(() => {
    if (loading || !canvasRef.current || loadedGrids.size === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      console.error('Failed to get 2D context');
      return;
    }
    
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
    
    // Clear canvas - white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    console.log('Canvas dimensions:', canvas.width, 'x', canvas.height);
    console.log('Drawing', loadedGrids.size, 'grids');
    
    // Apply transformations - anchor at top-left
    ctx.save();
    ctx.scale(zoom, zoom);
    ctx.translate(pan.x, pan.y);
    
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
              let color = null;
              
              // Check if this is from database (single letter) or template (layout key)
              if (gridData.fromDatabase || tileKey.length === 1) {
                // Database format: already uses type letters like 'g', 's', etc.
                color = tileColors[tileKey];
              } else {
                // Template format: uses layout keys like 'GR', 'ST', etc.
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
      
      // Render resources as single pixels (only if loaded)
      if (loadResources && gridData.resources) {
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
      
      // Add border for template grids (not from database)
      if (gridData.fromTemplate) {
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(
          baseX,
          baseY,
          GRID_SIZE * PIXEL_PER_TILE,
          GRID_SIZE * PIXEL_PER_TILE
        );
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
    <div style={{ display: 'flex', height: '100vh', position: 'relative' }}>
      {/* Side Panel */}
      <div className="editor-panel" style={{ height: 'calc(100vh - 40px)' }}>
        <h2>Atlas View</h2>
        
        <div style={{ 
          backgroundColor: 'white', 
          padding: '10px', 
          borderRadius: '5px', 
          marginBottom: '15px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <h4 style={{ margin: '0 0 10px 0' }}>View Controls</h4>
          {loading && <div className="loading-bar">Loading grids... {loadProgress}%</div>}
          <div style={{ marginBottom: '5px' }}>Zoom: {Math.round(zoom * 100)}%</div>
          <div style={{ marginBottom: '10px' }}>Loaded: {loadedGrids.size} grids</div>
          <label style={{ display: 'flex', alignItems: 'center', marginBottom: '10px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={loadResources}
              onChange={(e) => setLoadResources(e.target.checked)}
              style={{ marginRight: '5px' }}
            />
            <span style={{ fontSize: '12px' }}>Show Resources</span>
          </label>
          <button className="small-button" onClick={() => { setPan({ x: 0, y: 0 }); setZoom(1); }}>Reset View</button>
        </div>
        
        <div style={{ 
          backgroundColor: 'white', 
          padding: '10px', 
          borderRadius: '5px', 
          marginBottom: '15px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <h4 style={{ margin: '0 0 5px 0' }}>Controls</h4>
          <p style={{ fontSize: '12px', marginBottom: '3px' }}>• Drag to pan</p>
          <p style={{ fontSize: '12px', marginBottom: '3px' }}>• Scroll to zoom</p>
          <p style={{ fontSize: '12px', marginBottom: '3px' }}>• Red borders = template only</p>
        </div>
      </div>
      
      {/* Canvas Container */}
      <div 
        ref={containerRef}
        style={{
          position: 'absolute',
          top: 40,
          left: 240,
          right: 0,
          bottom: 0,
          overflow: 'hidden',
          backgroundColor: 'white'
        }}
      >
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          style={{ 
            cursor: isDragging ? 'grabbing' : 'grab',
            position: 'absolute',
            top: 0,
            left: 0,
            imageRendering: 'pixelated'
          }}
        />
      </div>
    </div>
  );
};

export default AtlasView;