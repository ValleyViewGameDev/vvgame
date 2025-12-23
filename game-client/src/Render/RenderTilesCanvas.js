import React, { useRef, useEffect, useCallback } from 'react';
import { tileRoundingConfig, getTileColor, tilePriorityOrder } from '../UI/Styles/tileColors';

// Use centralized tile rounding configuration
const TILE_ROUNDING_CONFIG = tileRoundingConfig;

// Helper function to draw a single grass tuft
function drawGrassTuft(ctx, x, y, tuftSeed, TILE_SIZE) {
  const size = Math.max(1, TILE_SIZE * 0.08 + (tuftSeed * 0.01) % (TILE_SIZE * 0.04));
  const opacity = 0.15 + (tuftSeed * 0.01) % 0.1;
  
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((tuftSeed * 0.5) % 60 - 30);
  ctx.fillStyle = `rgba(0, 50, 0, ${opacity})`;
  
  // Draw irregular grass clump using path
  ctx.beginPath();
  const points = [
    [0.3, 1], [0, 0.8], [0.1, 0.6], [0, 0.4], [0.15, 0.2],
    [0.4, 0.3], [0.6, 0.1], [0.8, 0.3], [1, 0.5], [0.85, 0.8], [0.7, 1]
  ];
  
  points.forEach(([px, py], index) => {
    const drawX = px * size - size/2;
    const drawY = py * size - size/2;
    if (index === 0) ctx.moveTo(drawX, drawY);
    else ctx.lineTo(drawX, drawY);
  });
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// Calculate which corners should be rounded based on adjacent tiles
function calculateRoundedCorners(tileType, rowIndex, colIndex, tileTypes) {
  // If this tile type doesn't support rounding, return null
  if (!TILE_ROUNDING_CONFIG[tileType]) {
    return null;
  }

  const roundedCorners = {
    topLeft: false,
    topRight: false,
    bottomRight: false,
    bottomLeft: false
  };
  
  // Check each corner: top-left, top-right, bottom-right, bottom-left
  const adjacentChecks = [
    { 
      neighbors: [
        { row: rowIndex - 1, col: colIndex },     // top
        { row: rowIndex, col: colIndex - 1 },     // left
      ],
      corner: 'topLeft'
    },
    { 
      neighbors: [
        { row: rowIndex - 1, col: colIndex },     // top
        { row: rowIndex, col: colIndex + 1 },     // right
      ],
      corner: 'topRight'
    },
    { 
      neighbors: [
        { row: rowIndex + 1, col: colIndex },     // bottom
        { row: rowIndex, col: colIndex + 1 },     // right
      ],
      corner: 'bottomRight'
    },
    { 
      neighbors: [
        { row: rowIndex + 1, col: colIndex },     // bottom
        { row: rowIndex, col: colIndex - 1 },     // left
      ],
      corner: 'bottomLeft'
    }
  ];

  for (const check of adjacentChecks) {
    // For a corner to be rounded, BOTH adjacent sides must have different tiles
    const allNeighborsDifferent = check.neighbors.every(neighbor => {
      const neighborType = tileTypes[neighbor.row]?.[neighbor.col] || 'd'; // default to dirt if out of bounds
      return neighborType !== tileType;
    });
    
    roundedCorners[check.corner] = allNeighborsDifferent;
  }
  
  return roundedCorners;
}

// Calculate corner background color based on adjacent tiles
function calculateCornerColor(tileType, corner, rowIndex, colIndex, tileTypes) {
  let adjacentTiles = [];
  
  switch (corner) {
    case 'topLeft':
      adjacentTiles = [
        tileTypes[rowIndex - 1]?.[colIndex] || 'd',     // top
        tileTypes[rowIndex]?.[colIndex - 1] || 'd',     // left
        tileTypes[rowIndex - 1]?.[colIndex - 1] || 'd', // diagonal
      ];
      break;
    case 'topRight':
      adjacentTiles = [
        tileTypes[rowIndex - 1]?.[colIndex] || 'd',     // top
        tileTypes[rowIndex]?.[colIndex + 1] || 'd',     // right
        tileTypes[rowIndex - 1]?.[colIndex + 1] || 'd', // diagonal
      ];
      break;
    case 'bottomRight':
      adjacentTiles = [
        tileTypes[rowIndex + 1]?.[colIndex] || 'd',     // bottom
        tileTypes[rowIndex]?.[colIndex + 1] || 'd',     // right
        tileTypes[rowIndex + 1]?.[colIndex + 1] || 'd', // diagonal
      ];
      break;
    case 'bottomLeft':
      adjacentTiles = [
        tileTypes[rowIndex + 1]?.[colIndex] || 'd',     // bottom
        tileTypes[rowIndex]?.[colIndex - 1] || 'd',     // left
        tileTypes[rowIndex + 1]?.[colIndex - 1] || 'd', // diagonal
      ];
      break;
  }
  
  // Remove the current tile type from consideration
  adjacentTiles = adjacentTiles.filter(type => type !== tileType);
  
  // If all adjacent tiles are the same type, use that color
  if (adjacentTiles.length > 0 && adjacentTiles.every(type => type === adjacentTiles[0])) {
    return getTileColor(adjacentTiles[0]);
  }
  
  // If there are different adjacent tiles (mixed colors), default to the tile's own color
  if (adjacentTiles.length > 1) {
    const uniqueTypes = [...new Set(adjacentTiles)];
    if (uniqueTypes.length > 1) {
      return getTileColor(tileType);
    }
  }
  
  // If only one adjacent tile type, use priority system
  for (const priorityType of tilePriorityOrder) {
    if (adjacentTiles.includes(priorityType)) {
      return getTileColor(priorityType);
    }
  }
  
  // Fallback to dirt if no adjacent tiles found
  return getTileColor('d');
}

// Pre-render organic textures for tile types with variation
function createTileTexture(tileType, TILE_SIZE, variation = 0, rowIndex, colIndex, tileTypes, zoomLevel) {
  const canvas = document.createElement('canvas');
  canvas.width = TILE_SIZE;
  canvas.height = TILE_SIZE;
  const ctx = canvas.getContext('2d');
  
  // Calculate rounded corners for this tile (skip for far zoom to improve performance)
  const roundedCorners = (zoomLevel === 'far') ? null : calculateRoundedCorners(tileType, rowIndex, colIndex, tileTypes);
  
  // Fill base color
  ctx.fillStyle = getTileColor(tileType);
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  
  // Draw corner backgrounds if we have rounded corners
  if (roundedCorners) {
    const cornerSize = TILE_SIZE / 2;
    
    // Top-left corner
    if (roundedCorners.topLeft) {
      ctx.fillStyle = calculateCornerColor(tileType, 'topLeft', rowIndex, colIndex, tileTypes);
      ctx.fillRect(0, 0, cornerSize, cornerSize);
    }
    
    // Top-right corner
    if (roundedCorners.topRight) {
      ctx.fillStyle = calculateCornerColor(tileType, 'topRight', rowIndex, colIndex, tileTypes);
      ctx.fillRect(cornerSize, 0, cornerSize, cornerSize);
    }
    
    // Bottom-right corner
    if (roundedCorners.bottomRight) {
      ctx.fillStyle = calculateCornerColor(tileType, 'bottomRight', rowIndex, colIndex, tileTypes);
      ctx.fillRect(cornerSize, cornerSize, cornerSize, cornerSize);
    }
    
    // Bottom-left corner
    if (roundedCorners.bottomLeft) {
      ctx.fillStyle = calculateCornerColor(tileType, 'bottomLeft', rowIndex, colIndex, tileTypes);
      ctx.fillRect(0, cornerSize, cornerSize, cornerSize);
    }
    
    // Draw the main tile with rounded corners over the corner backgrounds
    ctx.fillStyle = getTileColor(tileType);
    
    const radius = 8; // Base radius for corners
    ctx.beginPath();
    ctx.moveTo(roundedCorners.topLeft ? radius : 0, 0);
    ctx.lineTo(TILE_SIZE - (roundedCorners.topRight ? radius : 0), 0);
    if (roundedCorners.topRight) {
      ctx.quadraticCurveTo(TILE_SIZE, 0, TILE_SIZE, radius);
    }
    ctx.lineTo(TILE_SIZE, TILE_SIZE - (roundedCorners.bottomRight ? radius : 0));
    if (roundedCorners.bottomRight) {
      ctx.quadraticCurveTo(TILE_SIZE, TILE_SIZE, TILE_SIZE - radius, TILE_SIZE);
    }
    ctx.lineTo(roundedCorners.bottomLeft ? radius : 0, TILE_SIZE);
    if (roundedCorners.bottomLeft) {
      ctx.quadraticCurveTo(0, TILE_SIZE, 0, TILE_SIZE - radius);
    }
    ctx.lineTo(0, roundedCorners.topLeft ? radius : 0);
    if (roundedCorners.topLeft) {
      ctx.quadraticCurveTo(0, 0, radius, 0);
    }
    ctx.closePath();
    ctx.fill();
  }
  
  // Add organic textures based on tile type
  if (tileType === 'g') {
    // Grass tufts - completely different approaches per variation
    const baseSeeds = [157, 331, 523, 769]; // Prime numbers for max variation
    const seed = baseSeeds[variation] || 500;
    
    // Completely different positioning strategies per variation
    if (variation === 0) {
      // Variation 0: Scattered pattern
      const positions = [[25, 30], [70, 45], [45, 70]];
      positions.forEach(([baseX, baseY], i) => {
        const tuftSeed = (seed + i * 73) % 1000;
        const x = (baseX + (tuftSeed * 0.1) % 20 - 10) / 100 * TILE_SIZE;
        const y = (baseY + (tuftSeed * 0.2) % 20 - 10) / 100 * TILE_SIZE;
        drawGrassTuft(ctx, x, y, tuftSeed, TILE_SIZE);
      });
    } else if (variation === 1) {
      // Variation 1: Corner clusters
      const corners = [[20, 20], [75, 25], [30, 75], [80, 80]];
      corners.forEach(([baseX, baseY], i) => {
        const tuftSeed = (seed + i * 91) % 1000;
        const x = (baseX + (tuftSeed * 0.15) % 15 - 7) / 100 * TILE_SIZE;
        const y = (baseY + (tuftSeed * 0.18) % 15 - 7) / 100 * TILE_SIZE;
        drawGrassTuft(ctx, x, y, tuftSeed, TILE_SIZE);
      });
    } else if (variation === 2) {
      // Variation 2: Organic center cluster
      const positions = [[50, 40], [60, 55], [45, 60], [35, 45]];
      positions.forEach(([baseX, baseY], i) => {
        const tuftSeed = (seed + i * 113) % 1000;
        const x = (baseX + (tuftSeed * 0.25) % 30 - 15) / 100 * TILE_SIZE;
        const y = (baseY + (tuftSeed * 0.3) % 25 - 12) / 100 * TILE_SIZE;
        drawGrassTuft(ctx, x, y, tuftSeed, TILE_SIZE);
      });
    } else {
      // Variation 3: Random sparse
      const positions = [[40, 35], [65, 60]];
      positions.forEach(([baseX, baseY], i) => {
        const tuftSeed = (seed + i * 137) % 1000;
        const x = (baseX + (tuftSeed * 0.2) % 30 - 15) / 100 * TILE_SIZE;
        const y = (baseY + (tuftSeed * 0.25) % 25 - 12) / 100 * TILE_SIZE;
        drawGrassTuft(ctx, x, y, tuftSeed, TILE_SIZE);
      });
    }
    
    // Occasional yellow clump - varies by variation  
    if ((seed + variation * 17) % 5 === 0) {
      const lightSeed = (seed * 1.41) % 1000;
      const lightX = (15 + (lightSeed * 0.83) % 70) / 100 * TILE_SIZE;
      const lightY = (25 + (lightSeed * 1.37) % 50) / 100 * TILE_SIZE;
      const lightSize = Math.max(2, TILE_SIZE * 0.12 + (lightSeed * 0.01) % (TILE_SIZE * 0.04));
      
      ctx.save();
      ctx.translate(lightX, lightY);
      ctx.rotate((lightSeed * 0.7) % 60 - 30);
      ctx.fillStyle = `rgba(220, 220, 40, 0.6)`;
      
      ctx.beginPath();
      const points = [
        [0.3, 1], [0, 0.8], [0.1, 0.6], [0, 0.4], [0.15, 0.2],
        [0.4, 0.3], [0.6, 0.1], [0.8, 0.3], [1, 0.5], [0.85, 0.8], [0.7, 1]
      ];
      
      points.forEach(([px, py], index) => {
        const drawX = px * lightSize - lightSize/2;
        const drawY = py * lightSize - lightSize/2;
        if (index === 0) ctx.moveTo(drawX, drawY);
        else ctx.lineTo(drawX, drawY);
      });
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // Dirt cracks - using variation for different patterns

  if (tileType === 'd') {
    const seed = 600 + variation * 150;
    const numPatches = 4 + (seed % 4);
    
    for (let i = 0; i < numPatches; i++) {
      const patchSeed = (seed + i * 139) % 1000;
      const x = (5 + (patchSeed * 0.91) % 90) / 100 * TILE_SIZE;
      const y = (5 + (patchSeed * 1.23) % 90) / 100 * TILE_SIZE;
      const size = Math.max(1, TILE_SIZE * 0.06 + (patchSeed * 0.01) % (TILE_SIZE * 0.03));
      const opacity = 0.12 + (patchSeed * 0.01) % 0.08;
      
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((patchSeed * 0.7) % 180 * Math.PI / 180);
      ctx.fillStyle = `rgba(80, 50, 30, ${opacity})`;
      
      const width = size * 2;
      const height = size * 0.5;
      ctx.fillRect(-width/2, -height/2, width, height);
      ctx.restore();
    }
    
    // Occasional lighter dirt patch
    if (seed % 6 === 0) {
      const lightSeed = (seed * 1.61) % 1000;
      const lightX = (10 + (lightSeed * 0.79) % 80) / 100 * TILE_SIZE;
      const lightY = (10 + (lightSeed * 1.47) % 80) / 100 * TILE_SIZE;
      const lightSize = Math.max(1, TILE_SIZE * 0.08 + (lightSeed * 0.01) % (TILE_SIZE * 0.02));
      
      ctx.fillStyle = `rgba(160, 130, 90, 0.25)`;
      ctx.beginPath();
      ctx.arc(lightX, lightY, lightSize/2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  


  // App icon-style PAVEMENT tile with grass showing through rounded corners

  if (tileType === 'p') {
    const grassColor = '#67c257';
    const cornerRadius = Math.max(4, TILE_SIZE * 0.15); // Nice visible rounded corners
    
    // Step 1: Fill entire tile with grass color (background)
    ctx.fillStyle = grassColor;
    ctx.globalAlpha = 0.4;
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    ctx.globalAlpha = 1.0;
    
    // Step 2: Create rounded rectangle mask for the pavement stone
    const drawRoundedRect = (x, y, width, height, radius) => {
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + width - radius, y);
      ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
      ctx.lineTo(x + width, y + height - radius);
      ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
      ctx.lineTo(x + radius, y + height);
      ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
    };
    
    // Step 3: Draw everything within the rounded rectangle shape
    ctx.save();
    drawRoundedRect(0, 0, TILE_SIZE, TILE_SIZE, cornerRadius);
    ctx.clip(); // Clip everything to the rounded rectangle
    
    // Clear the grass background within the clipped area and draw stone
    ctx.fillStyle = getTileColor(tileType);
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    
    // Add thin grass border inside the rounded shape
    const grassWidth = Math.max(1, TILE_SIZE * 0.001);
    ctx.fillStyle = grassColor;
    ctx.globalAlpha = 0.6;
    
    // Top grass border
    ctx.fillRect(0, 0, TILE_SIZE, grassWidth);
    // Bottom grass border
    ctx.fillRect(0, TILE_SIZE - grassWidth, TILE_SIZE, grassWidth);
    // Left grass border
    ctx.fillRect(0, 0, grassWidth, TILE_SIZE);
    // Right grass border
    ctx.fillRect(TILE_SIZE - grassWidth, 0, grassWidth, TILE_SIZE);
    
    ctx.globalAlpha = 1.0;
    
    // Add beveled effect within the rounded shape
    const bevelSize = Math.max(1, TILE_SIZE * 0.01);
    const inset = grassWidth;
    
    // Light highlights (top and left)
    ctx.fillStyle = 'rgba(220, 215, 200, 0.7)';
    ctx.fillRect(inset, inset, TILE_SIZE - inset * 2, bevelSize);
    ctx.fillRect(inset, inset, bevelSize, TILE_SIZE - inset * 2);
    
    // Dark shadows (bottom and right)
    ctx.fillStyle = 'rgba(80, 65, 45, 0.7)';
    ctx.fillRect(inset, TILE_SIZE - inset - bevelSize, TILE_SIZE - inset * 2, bevelSize);
    ctx.fillRect(TILE_SIZE - inset - bevelSize, inset, bevelSize, TILE_SIZE - inset * 2);
    
    ctx.restore(); // End clipping
    
    // Add stretched grass tufts along edges with random variation
    // Use tile coordinates for consistent but varied seeding
    const uniqueSeed = (rowIndex * 73 + colIndex * 137 + variation * 211) % 1000;
    const numGrassTufts = 2 + (uniqueSeed % 3); // 2-4 tufts per tile
    
    for (let i = 0; i < numGrassTufts; i++) {
      const grassSeed = (uniqueSeed + i * 179) % 1000;
      
      // Position grass tufts along edges
      let x, y, isHorizontal;
      const side = grassSeed % 4;
      const extensionIntoStone = grassWidth * 2; // Allow tufts to extend into pavement area
      
      if (side === 0) { // Top edge - horizontal stretch
        x = (grassSeed * 0.7) % (TILE_SIZE * 0.8) + TILE_SIZE * 0.1; // Stay away from corners
        y = (grassSeed * 0.3) % (grassWidth + extensionIntoStone);
        isHorizontal = true;
      } else if (side === 1) { // Bottom edge - horizontal stretch
        x = (grassSeed * 0.8) % (TILE_SIZE * 0.8) + TILE_SIZE * 0.1;
        y = TILE_SIZE - grassWidth - extensionIntoStone + (grassSeed * 0.4) % (grassWidth + extensionIntoStone);
        isHorizontal = true;
      } else if (side === 2) { // Left edge - vertical stretch
        x = (grassSeed * 0.5) % (grassWidth + extensionIntoStone);
        y = (grassSeed * 0.9) % (TILE_SIZE * 0.8) + TILE_SIZE * 0.1;
        isHorizontal = false;
      } else { // Right edge - vertical stretch
        x = TILE_SIZE - grassWidth - extensionIntoStone + (grassSeed * 0.6) % (grassWidth + extensionIntoStone);
        y = (grassSeed * 1.1) % (TILE_SIZE * 0.8) + TILE_SIZE * 0.1;
        isHorizontal = false;
      }
      
      // Draw stretched grass along the edge (6 pixels long)
      const stretchLength = Math.max(4, TILE_SIZE * 0.15); // About 6 pixels at normal size
      const stretchWidth = Math.max(1, TILE_SIZE * 0.02);
      
      ctx.fillStyle = `rgba(27, 151, 27, 0.7)`;
      ctx.save();
      ctx.translate(x, y);
      
      // Random rotation for natural look
      const baseRotation = (grassSeed * 0.01) % (Math.PI * 0.3) - Math.PI * 0.15; // ±27 degrees
      ctx.rotate(baseRotation);
      
      if (isHorizontal) {
        // Horizontal grass streak
        ctx.fillRect(-stretchLength/2, -stretchWidth/2, stretchLength, stretchWidth);
        
        // Add some organic variation along the length
        for (let k = 0; k < 3; k++) {
          const offset = (k - 1) * stretchLength * 0.3;
          const size = stretchWidth * (0.5 + (grassSeed + k * 23) % 100 / 200);
          ctx.beginPath();
          ctx.ellipse(offset, 0, size, size * 1.5, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        // Vertical grass streak
        ctx.fillRect(-stretchWidth/2, -stretchLength/2, stretchWidth, stretchLength);
        
        // Add some organic variation along the length
        for (let k = 0; k < 3; k++) {
          const offset = (k - 1) * stretchLength * 0.3;
          const size = stretchWidth * (0.5 + (grassSeed + k * 29) % 100 / 200);
          ctx.beginPath();
          ctx.ellipse(0, offset, size * 1.5, size, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      
      ctx.restore();
    }
  }
  
  // App icon-style COBBLESTONE tile with grass showing through rounded corners

    if (tileType === 'x') {
    const grassColor = '#307823ff';
    const cornerRadius = Math.max(4, TILE_SIZE * 0.15); // Nice visible rounded corners
    
    // Step 1: Fill entire tile with grass color (background)
    ctx.fillStyle = grassColor;
    ctx.globalAlpha = 0.4;
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    ctx.globalAlpha = 1.0;
    
    // Step 2: Create rounded rectangle mask for the pavement stone
    const drawRoundedRect = (x, y, width, height, radius) => {
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + width - radius, y);
      ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
      ctx.lineTo(x + width, y + height - radius);
      ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
      ctx.lineTo(x + radius, y + height);
      ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
    };
    
    // Step 3: Draw everything within the rounded rectangle shape
    ctx.save();
    drawRoundedRect(0, 0, TILE_SIZE, TILE_SIZE, cornerRadius);
    ctx.clip(); // Clip everything to the rounded rectangle
    
    // Clear the grass background within the clipped area and draw stone
    ctx.fillStyle = getTileColor(tileType);
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    
    // Add thin grass border inside the rounded shape
    const grassWidth = Math.max(1, TILE_SIZE * 0.006);
    ctx.fillStyle = grassColor;
    ctx.globalAlpha = 0.6;
    
    // Top grass border
    ctx.fillRect(0, 0, TILE_SIZE, grassWidth);
    // Bottom grass border
    ctx.fillRect(0, TILE_SIZE - grassWidth, TILE_SIZE, grassWidth);
    // Left grass border
    ctx.fillRect(0, 0, grassWidth, TILE_SIZE);
    // Right grass border
    ctx.fillRect(TILE_SIZE - grassWidth, 0, grassWidth, TILE_SIZE);
    
    ctx.globalAlpha = 1.0;
    
    // Add beveled effect within the rounded shape
    const bevelSize = Math.max(1, TILE_SIZE * 0.06);
    const inset = grassWidth;
    
    // Light highlights (top and left)
    ctx.fillStyle = 'rgba(200, 212, 220, 0.7)';
    ctx.fillRect(inset, inset, TILE_SIZE - inset * 2, bevelSize);
    ctx.fillRect(inset, inset, bevelSize, TILE_SIZE - inset * 2);
    
    // Dark shadows (bottom and right)
    ctx.fillStyle = 'rgba(45, 54, 80, 0.7)';
    ctx.fillRect(inset, TILE_SIZE - inset - bevelSize, TILE_SIZE - inset * 2, bevelSize);
    ctx.fillRect(TILE_SIZE - inset - bevelSize, inset, bevelSize, TILE_SIZE - inset * 2);
    
    ctx.restore(); // End clipping
    
    // Add stretched grass tufts along edges with random variation
    // Use tile coordinates for consistent but varied seeding
    const uniqueSeed = (rowIndex * 73 + colIndex * 137 + variation * 211) % 1000;
    const numGrassTufts = 2 + (uniqueSeed % 3); // 2-4 tufts per tile
    
    for (let i = 0; i < numGrassTufts; i++) {
      const grassSeed = (uniqueSeed + i * 179) % 1000;
      
      // Position grass tufts along edges
      let x, y, isHorizontal;
      const side = grassSeed % 4;
      const extensionIntoStone = grassWidth * 2; // Allow tufts to extend into pavement area
      
      if (side === 0) { // Top edge - horizontal stretch
        x = (grassSeed * 0.7) % (TILE_SIZE * 0.8) + TILE_SIZE * 0.1; // Stay away from corners
        y = (grassSeed * 0.3) % (grassWidth + extensionIntoStone);
        isHorizontal = true;
      } else if (side === 1) { // Bottom edge - horizontal stretch
        x = (grassSeed * 0.8) % (TILE_SIZE * 0.8) + TILE_SIZE * 0.1;
        y = TILE_SIZE - grassWidth - extensionIntoStone + (grassSeed * 0.4) % (grassWidth + extensionIntoStone);
        isHorizontal = true;
      } else if (side === 2) { // Left edge - vertical stretch
        x = (grassSeed * 0.5) % (grassWidth + extensionIntoStone);
        y = (grassSeed * 0.9) % (TILE_SIZE * 0.8) + TILE_SIZE * 0.1;
        isHorizontal = false;
      } else { // Right edge - vertical stretch
        x = TILE_SIZE - grassWidth - extensionIntoStone + (grassSeed * 0.6) % (grassWidth + extensionIntoStone);
        y = (grassSeed * 1.1) % (TILE_SIZE * 0.8) + TILE_SIZE * 0.1;
        isHorizontal = false;
      }
      
      // Draw stretched grass along the edge (6 pixels long)
      const stretchLength = Math.max(4, TILE_SIZE * 0.15); // About 6 pixels at normal size
      const stretchWidth = Math.max(1, TILE_SIZE * 0.02);
      
      ctx.fillStyle = `rgba(19, 100, 19, 0.7)`;
      ctx.save();
      ctx.translate(x, y);
      
      // Random rotation for natural look
      const baseRotation = (grassSeed * 0.01) % (Math.PI * 0.3) - Math.PI * 0.15; // ±27 degrees
      ctx.rotate(baseRotation);
      
      if (isHorizontal) {
        // Horizontal grass streak
        ctx.fillRect(-stretchLength/2, -stretchWidth/2, stretchLength, stretchWidth);
        
        // Add some organic variation along the length
        for (let k = 0; k < 3; k++) {
          const offset = (k - 1) * stretchLength * 0.3;
          const size = stretchWidth * (0.5 + (grassSeed + k * 23) % 100 / 200);
          ctx.beginPath();
          ctx.ellipse(offset, 0, size, size * 1.5, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        // Vertical grass streak
        ctx.fillRect(-stretchWidth/2, -stretchLength/2, stretchWidth, stretchLength);
        
        // Add some organic variation along the length
        for (let k = 0; k < 3; k++) {
          const offset = (k - 1) * stretchLength * 0.3;
          const size = stretchWidth * (0.5 + (grassSeed + k * 29) % 100 / 200);
          ctx.beginPath();
          ctx.ellipse(0, offset, size * 1.5, size, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      
      ctx.restore();
    }
  }


    if (tileType === 's' || tileType === 'x') {
    // Stone cracks - Y-shaped forking cracks on every 3rd tile
    const seed = (rowIndex * 73 + colIndex * 137 + variation * 211) % 1000;
    
    // Only show cracks on every 3rd tile
    if (seed % 3 === 0) {
      const numCracks = 1 + (seed % 2); // 1-2 Y-shaped cracks per tile
      
      for (let i = 0; i < numCracks; i++) {
        const crackSeed = (seed + i * 179) % 1000;
        const startX = (20 + (crackSeed * 0.6) % 60) / 100 * TILE_SIZE;
        const startY = (20 + (crackSeed * 1.1) % 60) / 100 * TILE_SIZE;
        
        ctx.save();
        ctx.strokeStyle = `rgba(89, 93, 98, 0.7)`;
        ctx.lineWidth = Math.max(1, TILE_SIZE * 0.008);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        // Helper function to draw a wiggly line from start to end
        const drawWigglyLine = (fromX, fromY, toX, toY, wiggleAmount = 0.3) => {
          const distance = Math.sqrt((toX - fromX) ** 2 + (toY - fromY) ** 2);
          const segments = Math.max(4, Math.floor(distance / (TILE_SIZE * 0.05))); // Segment every 5% of tile size
          
          ctx.moveTo(fromX, fromY);
          
          for (let j = 1; j <= segments; j++) {
            const progress = j / segments;
            const linearX = fromX + (toX - fromX) * progress;
            const linearY = fromY + (toY - fromY) * progress;
            
            // Add perpendicular wiggle
            const perpAngle = Math.atan2(toY - fromY, toX - fromX) + Math.PI / 2;
            const wiggleSeed = (crackSeed + j * 23 + i * 67) % 1000;
            const wiggleOffset = Math.sin(progress * Math.PI * 2) * wiggleAmount * TILE_SIZE * 0.02;
            const randomWiggle = ((wiggleSeed * 0.1) % 1 - 0.5) * wiggleAmount * TILE_SIZE * 0.015;
            
            const wiggleX = linearX + Math.cos(perpAngle) * (wiggleOffset + randomWiggle);
            const wiggleY = linearY + Math.sin(perpAngle) * (wiggleOffset + randomWiggle);
            
            ctx.lineTo(wiggleX, wiggleY);
          }
        };
        
        // Main crack stem
        const mainLength = TILE_SIZE * 0.15 + (crackSeed * 0.01) % (TILE_SIZE * 0.1);
        const mainAngle = (crackSeed * 0.8) % 360 * Math.PI / 180;
        const stemEndX = startX + Math.cos(mainAngle) * mainLength;
        const stemEndY = startY + Math.sin(mainAngle) * mainLength;
        
        ctx.beginPath();
        drawWigglyLine(startX, startY, stemEndX, stemEndY);
        ctx.stroke();
        
        // Fork point - slightly before the end of main stem
        const forkProgress = 0.6 + (crackSeed * 0.01) % 0.3; // Fork at 60-90% along stem
        const forkX = startX + Math.cos(mainAngle) * mainLength * forkProgress;
        const forkY = startY + Math.sin(mainAngle) * mainLength * forkProgress;
        
        // Two fork branches
        const forkLength = mainLength * (0.4 + (crackSeed * 0.01) % 0.3); // 40-70% of main length
        const forkAngleSpread = 30 + (crackSeed % 40); // 30-70 degree spread
        
        // Left fork
        const leftForkAngle = mainAngle - (forkAngleSpread * Math.PI / 180);
        const leftEndX = forkX + Math.cos(leftForkAngle) * forkLength;
        const leftEndY = forkY + Math.sin(leftForkAngle) * forkLength;
        
        ctx.beginPath();
        drawWigglyLine(forkX, forkY, leftEndX, leftEndY, 0.2); // Less wiggle on forks
        ctx.stroke();
        
        // Right fork
        const rightForkAngle = mainAngle + (forkAngleSpread * Math.PI / 180);
        const rightEndX = forkX + Math.cos(rightForkAngle) * forkLength;
        const rightEndY = forkY + Math.sin(rightForkAngle) * forkLength;
        
        ctx.beginPath();
        drawWigglyLine(forkX, forkY, rightEndX, rightEndY, 0.2); // Less wiggle on forks
        ctx.stroke();
        
        ctx.restore(); 
      }
    }
  }

    return canvas;
}

// Canvas-based tile renderer component
export const RenderTilesCanvas = ({ grid, tileTypes, TILE_SIZE, zoomLevel, handleTileClick }) => {
  const canvasRef = useRef(null);
  const textureCache = useRef(new Map());
  const lastRenderData = useRef(null);
  
  // Clear texture cache when TILE_SIZE or zoomLevel changes
  useEffect(() => {
    textureCache.current.clear();
  }, [TILE_SIZE, zoomLevel]);
  
  // Get or create tile texture with variation
  const getTileTexture = useCallback((tileType, rowIndex, colIndex) => {
    // Create 4 variations for grass, dirt, and stone; 1 for others (only for close zoom)
    const numVariations = (zoomLevel === 'far') ? 1 : 
                          ((tileType === 'g' || tileType === 'd' || tileType === 's') ? 4 : 1);
    const variation = (rowIndex * 73 + colIndex * 37) % numVariations;
    const cacheKey = `${tileType}-${TILE_SIZE}-${zoomLevel}-${variation}-${rowIndex}-${colIndex}`;
    
    if (!textureCache.current.has(cacheKey)) {
      textureCache.current.set(cacheKey, createTileTexture(tileType, TILE_SIZE, variation, rowIndex, colIndex, tileTypes, zoomLevel));
    }
    return textureCache.current.get(cacheKey);
  }, [TILE_SIZE, tileTypes, zoomLevel]);
  
  // Render tiles to canvas
  const renderTiles = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !grid || !tileTypes) {
      console.log('🔍 [CANVAS DEBUG] renderTiles early return:', {
        hasCanvas: !!canvas,
        hasGrid: !!grid,
        hasTileTypes: !!tileTypes,
        gridLength: grid?.length || 0,
        tileTypesLength: tileTypes?.length || 0
      });
      return;
    }
    
    const ctx = canvas.getContext('2d');
    const rows = grid.length;
    const cols = grid[0]?.length || 0;
    
    console.log('🎨 [CANVAS DEBUG] Starting tile render:', {
      rows,
      cols,
      TILE_SIZE,
      canvasWidth: cols * TILE_SIZE,
      canvasHeight: rows * TILE_SIZE
    });
    
    // Set canvas size
    canvas.width = cols * TILE_SIZE;
    canvas.height = rows * TILE_SIZE;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Render each tile
    for (let rowIndex = 0; rowIndex < rows; rowIndex++) {
      for (let colIndex = 0; colIndex < cols; colIndex++) {
        const tileType = tileTypes[rowIndex]?.[colIndex] || 'unknown';
        const texture = getTileTexture(tileType, rowIndex, colIndex);
        
        ctx.drawImage(
          texture,
          colIndex * TILE_SIZE,
          rowIndex * TILE_SIZE,
          TILE_SIZE,
          TILE_SIZE
        );
      }
    }
    
    console.log('✅ [CANVAS DEBUG] Tile rendering completed:', {
      totalTilesRendered: rows * cols,
      canvasSize: `${canvas.width}x${canvas.height}`
    });
  }, [grid, tileTypes, TILE_SIZE, getTileTexture]);
  
  // Re-render when dependencies change
  useEffect(() => {
    const currentData = JSON.stringify({ grid, tileTypes, TILE_SIZE, zoomLevel });
    if (currentData !== lastRenderData.current) {
      renderTiles();
      lastRenderData.current = currentData;
    }
  }, [renderTiles, grid, tileTypes, TILE_SIZE, zoomLevel]);
  
  // Handle tile clicks by converting canvas coordinates
  const handleCanvasClick = useCallback((event) => {
    const canvas = canvasRef.current;
    if (!canvas || !handleTileClick) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    const colIndex = Math.floor(x / TILE_SIZE);
    const rowIndex = Math.floor(y / TILE_SIZE);
    
    if (rowIndex >= 0 && rowIndex < grid.length && 
        colIndex >= 0 && colIndex < (grid[0]?.length || 0)) {
      handleTileClick(rowIndex, colIndex);
    }
  }, [handleTileClick, TILE_SIZE, grid]);
  
  return (
    <canvas
      ref={canvasRef}
      onClick={handleCanvasClick}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        zIndex: 1, // Same as DOM tiles
        cursor: 'pointer',
        imageRendering: 'pixelated', // Keep crisp pixel art look
      }}
    />
  );
};