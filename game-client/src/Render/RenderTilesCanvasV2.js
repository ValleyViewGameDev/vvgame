/**
 * RenderTilesCanvasV2 - Autotiling Renderer with Grass Overlay
 *
 * Key insight from reference: Grass is the TOP layer that overlays onto other tiles.
 * The grass "grows over" the edges of dirt/sand/water, not the other way around.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import { getTileColor } from '../UI/Styles/tileColors';

/**
 * Parse a hex color string to RGB values
 * Supports formats: #RGB, #RGBA, #RRGGBB, #RRGGBBAA
 */
function parseColorToRgb(color) {
  // Default fallback
  const fallback = { r: 128, g: 128, b: 128 };

  if (!color || typeof color !== 'string') return fallback;

  // Remove # if present
  const hex = color.replace('#', '');

  let r, g, b;
  if (hex.length === 3 || hex.length === 4) {
    // #RGB or #RGBA format
    r = parseInt(hex[0] + hex[0], 16);
    g = parseInt(hex[1] + hex[1], 16);
    b = parseInt(hex[2] + hex[2], 16);
  } else if (hex.length === 6 || hex.length === 8) {
    // #RRGGBB or #RRGGBBAA format
    r = parseInt(hex.substring(0, 2), 16);
    g = parseInt(hex.substring(2, 4), 16);
    b = parseInt(hex.substring(4, 6), 16);
  } else {
    return fallback;
  }

  // Handle NaN from invalid hex
  if (isNaN(r) || isNaN(g) || isNaN(b)) return fallback;

  return { r, g, b };
}

// Corner rounding priority - higher priority tiles round INTO lower priority tiles
// Inorganic tiles (p, x, y) never get rounded - they have sharp edges
// Priority order: grass > snow > dirt/sand > water (lowest)
const CORNER_PRIORITY = {
  'g': 100,  // grass - highest priority, rounds into everything
  'o': 90,   // snow - second highest
  'z': 80,   // moss
  'n': 70,   // sand
  'd': 60,   // dirt
  'c': 50,   // clay
  's': 40,   // slate
  'l': 30,   // lava
  'w': 20,   // water - lowest organic priority
  'v': 15,   // tbdTile1
  'u': 15,   // tbdTile2
  'p': 0,    // pavement - inorganic, never rounded
  'x': 0,    // cobblestone - inorganic, never rounded
  'y': 0,    // dungeon - inorganic, never rounded
};

// Tile priority - higher priority tiles overlay lower priority ones
// Grass is highest priority (renders on top)
const TILE_PRIORITY = {
  'g': 10,  // grass - highest, overlays everything
  'z': 9,   // moss
  'o': 8,   // snow
  'n': 7,   // sand
  'd': 6,   // dirt
  'c': 5,   // clay
  's': 4,   // slate
  'w': 3,   // water
  'l': 2,   // lava
  'p': 1,   // pavement
  'x': 1,   // cobblestone
  'y': 1,   // dungeon
  'v': 1,   // tbdTile1
  'u': 1,   // tbdTile2
};

// Tile edge style - organic tiles get smooth wavy edges, inorganic get straight edges
// Organic tiles create natural-looking transitions with other organic tiles
const TILE_EDGE_STYLE = {
  'g': 'organic',   // grass
  'z': 'organic',   // moss
  'o': 'organic',   // snow
  'n': 'organic',   // sand
  'd': 'organic',   // dirt
  'c': 'organic',   // clay
  's': 'organic',   // slate
  'w': 'organic',   // water
  'l': 'organic',   // lava
  'p': 'straight',  // pavement
  'x': 'straight',  // cobblestone
  'y': 'straight',  // dungeon
  'v': 'organic',   // tbdTile1
  'u': 'organic',   // tbdTile2
};

// Helper to check if a tile type uses organic edges (kept for future use)
function isOrganicTile(tileType) {
  return TILE_EDGE_STYLE[tileType] === 'organic';
}

/**
 * Get neighbor tile type safely
 */
function getNeighbor(tileTypes, row, col, defaultType) {
  return tileTypes[row]?.[col] ?? defaultType;
}

/**
 * Draw rounded corners where higher-priority tiles meet lower-priority tiles.
 * The higher-priority tile's color rounds INTO the lower-priority tile.
 * Inorganic tiles (pavement, cobblestone, dungeon) never get rounded.
 */
function drawCornerRounding(ctx, tileType, TILE_SIZE, rowIndex, colIndex, tileTypes) {
  // Inorganic tiles never get rounded corners
  if (!isOrganicTile(tileType)) return;

  const myPriority = CORNER_PRIORITY[tileType] || 0;
  const cornerRadius = Math.max(2, Math.floor(TILE_SIZE * 0.2));

  // Get all 8 neighbors
  const top = getNeighbor(tileTypes, rowIndex - 1, colIndex, tileType);
  const bottom = getNeighbor(tileTypes, rowIndex + 1, colIndex, tileType);
  const left = getNeighbor(tileTypes, rowIndex, colIndex - 1, tileType);
  const right = getNeighbor(tileTypes, rowIndex, colIndex + 1, tileType);
  const topLeft = getNeighbor(tileTypes, rowIndex - 1, colIndex - 1, tileType);
  const topRight = getNeighbor(tileTypes, rowIndex - 1, colIndex + 1, tileType);
  const bottomLeft = getNeighbor(tileTypes, rowIndex + 1, colIndex - 1, tileType);
  const bottomRight = getNeighbor(tileTypes, rowIndex + 1, colIndex + 1, tileType);

  // Helper to draw an OUTER corner - small triangular fill in the corner
  // Used when both cardinal neighbors are the same type (different from this tile)
  const drawOuterCorner = (corner, fillColor) => {
    ctx.fillStyle = fillColor;
    ctx.beginPath();

    switch (corner) {
      case 'topLeft':
        ctx.moveTo(0, 0);
        ctx.lineTo(cornerRadius, 0);
        ctx.quadraticCurveTo(0, 0, 0, cornerRadius);
        ctx.closePath();
        break;
      case 'topRight':
        ctx.moveTo(TILE_SIZE - cornerRadius, 0);
        ctx.lineTo(TILE_SIZE, 0);
        ctx.lineTo(TILE_SIZE, cornerRadius);
        ctx.quadraticCurveTo(TILE_SIZE, 0, TILE_SIZE - cornerRadius, 0);
        ctx.closePath();
        break;
      case 'bottomLeft':
        ctx.moveTo(0, TILE_SIZE - cornerRadius);
        ctx.lineTo(0, TILE_SIZE);
        ctx.lineTo(cornerRadius, TILE_SIZE);
        ctx.quadraticCurveTo(0, TILE_SIZE, 0, TILE_SIZE - cornerRadius);
        ctx.closePath();
        break;
      case 'bottomRight':
        ctx.moveTo(TILE_SIZE, TILE_SIZE - cornerRadius);
        ctx.lineTo(TILE_SIZE, TILE_SIZE);
        ctx.lineTo(TILE_SIZE - cornerRadius, TILE_SIZE);
        ctx.quadraticCurveTo(TILE_SIZE, TILE_SIZE, TILE_SIZE, TILE_SIZE - cornerRadius);
        ctx.closePath();
        break;
    }
    ctx.fill();
  };

  // Corner rounding logic:
  // 1. SURROUNDED CORNERS: If all 3 neighbors (both cardinals + diagonal) are the same different type,
  //    that type ALWAYS wins regardless of priority (the surrounding tile rounds into this corner)
  // 2. OUTER CORNERS: If both cardinals are the same different type (but diagonal differs or matches),
  //    use normal priority to determine if we round

  // Top-left corner
  if (top !== tileType && left !== tileType && top === left) {
    // Both cardinals are the same different type
    const neighborPriority = CORNER_PRIORITY[top] || 0;
    // Surrounded: all 3 neighbors match AND they're organic - always round regardless of priority
    // Outer: only cardinals match - use priority
    const isSurrounded = topLeft === top && isOrganicTile(top);
    if (isSurrounded || neighborPriority > myPriority) {
      drawOuterCorner('topLeft', getTileColor(top));
    }
  }

  // Top-right corner
  if (top !== tileType && right !== tileType && top === right) {
    const neighborPriority = CORNER_PRIORITY[top] || 0;
    const isSurrounded = topRight === top && isOrganicTile(top);
    if (isSurrounded || neighborPriority > myPriority) {
      drawOuterCorner('topRight', getTileColor(top));
    }
  }

  // Bottom-left corner
  if (bottom !== tileType && left !== tileType && bottom === left) {
    const neighborPriority = CORNER_PRIORITY[bottom] || 0;
    const isSurrounded = bottomLeft === bottom && isOrganicTile(bottom);
    if (isSurrounded || neighborPriority > myPriority) {
      drawOuterCorner('bottomLeft', getTileColor(bottom));
    }
  }

  // Bottom-right corner
  if (bottom !== tileType && right !== tileType && bottom === right) {
    const neighborPriority = CORNER_PRIORITY[bottom] || 0;
    const isSurrounded = bottomRight === bottom && isOrganicTile(bottom);
    if (isSurrounded || neighborPriority > myPriority) {
      drawOuterCorner('bottomRight', getTileColor(bottom));
    }
  }
}


/**
 * Draw a single beveled stone with highlight and shadow
 */
function drawSingleBeveledStone(ctx, x, y, width, height, bevelSize, mainColor, highlightColor, shadowColor) {
  // Draw main stone body
  ctx.fillStyle = mainColor;
  ctx.fillRect(x, y, width, height);

  // Draw highlight (top and left edges)
  ctx.fillStyle = highlightColor;
  ctx.fillRect(x, y, width, bevelSize); // Top
  ctx.fillRect(x, y, bevelSize, height); // Left

  // Draw shadow (bottom and right edges)
  ctx.fillStyle = shadowColor;
  ctx.fillRect(x, y + height - bevelSize, width, bevelSize); // Bottom
  ctx.fillRect(x + width - bevelSize, y, bevelSize, height); // Right
}

/**
 * Draw a beveled stone tile (for pavement and cobblestone)
 * Pavement: single stone per tile
 * Cobblestone: 4 stones per tile (2x2 grid)
 */
function drawBeveledStoneTile(ctx, tileX, tileY, TILE_SIZE, baseColor, tileType, seed) {
  if (tileType === 'x') {
    // COBBLESTONE: 4 stones per tile (2x2 grid), no gap between tiles
    const halfSize = TILE_SIZE / 2;
    const bevelSize = Math.max(1, Math.floor(halfSize * 0.12));
    const highlightColor = 'rgba(180, 180, 185, 0.7)';
    const shadowColor = 'rgba(90, 90, 95, 0.5)';

    // Draw 4 cobblestones in a 2x2 grid
    const positions = [
      [0, 0],           // top-left
      [halfSize, 0],    // top-right
      [0, halfSize],    // bottom-left
      [halfSize, halfSize] // bottom-right
    ];

    // Parse base color to RGB for variation
    const baseRgb = parseColorToRgb(baseColor);

    positions.forEach(([ox, oy], i) => {
      const stoneSeed = (seed + i * 37) % 1000;
      // Slight color variation per stone based on the configured base color
      const colorVariation = (stoneSeed % 20) - 10;
      const r = Math.min(255, Math.max(0, baseRgb.r + colorVariation));
      const g = Math.min(255, Math.max(0, baseRgb.g + colorVariation));
      const b = Math.min(255, Math.max(0, baseRgb.b + colorVariation));
      const stoneColor = `rgb(${r}, ${g}, ${b})`;

      // Draw beveled stone
      drawSingleBeveledStone(
        ctx,
        tileX + ox,
        tileY + oy,
        halfSize,
        halfSize,
        bevelSize,
        stoneColor,
        highlightColor,
        shadowColor
      );

      // Add occasional crack to individual cobblestones
      if (stoneSeed % 3 === 0) {
        ctx.strokeStyle = 'rgba(60, 60, 65, 0.3)';
        ctx.lineWidth = 1;
        const crackStartX = tileX + ox + bevelSize + (stoneSeed % 30) / 100 * (halfSize - bevelSize * 2);
        const crackStartY = tileY + oy + bevelSize + ((stoneSeed * 1.3) % 30) / 100 * (halfSize - bevelSize * 2);
        const crackEndX = crackStartX + (stoneSeed % 20 - 10) / 100 * halfSize * 0.5;
        const crackEndY = crackStartY + ((stoneSeed * 0.7) % 20) / 100 * halfSize * 0.5;

        ctx.beginPath();
        ctx.moveTo(crackStartX, crackStartY);
        ctx.lineTo(crackEndX, crackEndY);
        ctx.stroke();
      }
    });
  } else {
    // PAVEMENT: single stone per tile, no gap
    const bevelSize = Math.max(2, Math.floor(TILE_SIZE * 0.08));
    const highlightColor = 'rgba(220, 200, 160, 0.5)';
    const shadowColor = 'rgba(160, 140, 100, 0.6)';

    drawSingleBeveledStone(
      ctx,
      tileX,
      tileY,
      TILE_SIZE,
      TILE_SIZE,
      bevelSize,
      baseColor,
      highlightColor,
      shadowColor
    );
  }

  // Add tiny grass tufts at edges for pavement
  // Very small, right at the edge - like in Screenshot2_original
  // Using dark grass color (same as grass tuft spots): rgba(0, 50, 0, opacity)
  if (tileType === 'p' && seed % 5 < 3) {
    // ~60% of pavement tiles get grass tufts (was 50%)
    const tuftSeed = (seed * 3) % 1000;
    // Medium grass green - between bright #67c257 and dark rgba(0,50,0)
    const grassDark = 'rgba(50, 130, 50, 0.85)';

    // 1-2 tiny tufts per tile
    const tuftCount = 1 + (tuftSeed % 2);

    for (let t = 0; t < tuftCount; t++) {
      // Use a different prime multiplier for edge selection to get better distribution
      const edge = (seed * 7 + t * 41) % 4;
      const tSeed = (tuftSeed + t * 100) % 1000;
      const edgePos = (0.2 + (tSeed % 60) / 100) * TILE_SIZE;

      // Tuft is just 2-3 tiny triangles right at the edge
      const bladeCount = 2 + (tSeed % 2);
      const bladeSpacing = TILE_SIZE * 0.064; // 60% wider spacing along edge (was 0.04)

      ctx.fillStyle = grassDark;

      for (let b = 0; b < bladeCount; b++) {
        const bSeed = (tSeed + b * 17) % 100;
        // Blade height - 4-7% of tile size
        const h = TILE_SIZE * (0.04 + bSeed / 1500);
        const w = Math.max(1, TILE_SIZE * 0.04); // Thicker blades (was 0.026)

        let x, y;
        switch (edge) {
          case 0: // top
            x = tileX + edgePos + b * bladeSpacing;
            y = tileY;
            ctx.beginPath();
            ctx.moveTo(x - w, y);
            ctx.lineTo(x, y + h);
            ctx.lineTo(x + w, y);
            ctx.closePath();
            ctx.fill();
            break;
          case 1: // right
            x = tileX + TILE_SIZE;
            y = tileY + edgePos + b * bladeSpacing;
            ctx.beginPath();
            ctx.moveTo(x, y - w);
            ctx.lineTo(x - h, y);
            ctx.lineTo(x, y + w);
            ctx.closePath();
            ctx.fill();
            break;
          case 2: // bottom
            x = tileX + edgePos + b * bladeSpacing;
            y = tileY + TILE_SIZE;
            ctx.beginPath();
            ctx.moveTo(x - w, y);
            ctx.lineTo(x, y - h);
            ctx.lineTo(x + w, y);
            ctx.closePath();
            ctx.fill();
            break;
          case 3: // left
            x = tileX;
            y = tileY + edgePos + b * bladeSpacing;
            ctx.beginPath();
            ctx.moveTo(x, y - w);
            ctx.lineTo(x + h, y);
            ctx.lineTo(x, y + w);
            ctx.closePath();
            ctx.fill();
            break;
        }
      }
    }
  }
}

/**
 * Draw a single grass tuft - irregular clump shape (from V1)
 */
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
    const drawX = px * size - size / 2;
    const drawY = py * size - size / 2;
    if (index === 0) ctx.moveTo(drawX, drawY);
    else ctx.lineTo(drawX, drawY);
  });
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * Add subtle texture variation to tiles
 */
function addTileTexture(ctx, tileType, tileX, tileY, TILE_SIZE, seed) {
  if (tileType === 'g') {
    // Grass tufts - replicate V1 logic with 4 variations
    const variation = seed % 4;
    const baseSeeds = [157, 331, 523, 769];
    const varSeed = baseSeeds[variation] || 500;

    // Different positioning strategies per variation
    let positions;
    if (variation === 0) {
      positions = [[25, 30], [70, 45], [45, 70]];
    } else if (variation === 1) {
      positions = [[20, 20], [75, 25], [30, 75], [80, 80]];
    } else if (variation === 2) {
      positions = [[50, 40], [60, 55], [45, 60], [35, 45]];
    } else {
      positions = [[40, 35], [65, 60]];
    }

    positions.forEach(([baseX, baseY], i) => {
      const tuftSeed = (varSeed + i * 73 + seed * 11) % 1000;
      const offsetX = (tuftSeed * 0.1) % 20 - 10;
      const offsetY = (tuftSeed * 0.2) % 20 - 10;
      const x = tileX + (baseX + offsetX) / 100 * TILE_SIZE;
      const y = tileY + (baseY + offsetY) / 100 * TILE_SIZE;
      drawGrassTuft(ctx, x, y, tuftSeed, TILE_SIZE);
    });

    // Occasional yellow clump - use variation-based positioning to break diagonal patterns
    // Each variation has different predefined positions spread across the tile
    const yellowVariation = (seed * 7 + variation * 3) % 8;
    const yellowPositionSets = [
      [15, 25], [75, 65], [40, 80], [85, 20], // 4 corner-ish positions
      [55, 35], [25, 70], [70, 45], [35, 15]  // 4 different positions
    ];

    // Only ~20% of tiles get yellow clumps, but selection is more random
    const showYellow = ((seed * 31 + variation * 17) % 100) < 20;

    if (showYellow) {
      const yellowPos = yellowPositionSets[yellowVariation];
      // Add small offset based on seed for extra variation
      const offsetSeed = (seed * 37 + variation * 53) % 1000;
      const offsetX = (offsetSeed % 20) - 10;
      const offsetY = ((offsetSeed * 7) % 20) - 10;

      const lightX = tileX + (yellowPos[0] + offsetX) / 100 * TILE_SIZE;
      const lightY = tileY + (yellowPos[1] + offsetY) / 100 * TILE_SIZE;
      const lightSize = Math.max(2, TILE_SIZE * 0.12 + (offsetSeed % 40) / 1000 * TILE_SIZE);

      ctx.save();
      ctx.translate(lightX, lightY);
      ctx.rotate((offsetSeed * 0.7) % 60 - 30);
      ctx.fillStyle = 'rgba(220, 220, 40, 0.6)';

      ctx.beginPath();
      const points = [
        [0.3, 1], [0, 0.8], [0.1, 0.6], [0, 0.4], [0.15, 0.2],
        [0.4, 0.3], [0.6, 0.1], [0.8, 0.3], [1, 0.5], [0.85, 0.8], [0.7, 1]
      ];

      points.forEach(([px, py], index) => {
        const drawX = px * lightSize - lightSize / 2;
        const drawY = py * lightSize - lightSize / 2;
        if (index === 0) ctx.moveTo(drawX, drawY);
        else ctx.lineTo(drawX, drawY);
      });
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  } else if (tileType === 'd') {
    // Dirt noise - small scattered dots like grass tufts but smaller
    // Use variation-based positioning like grass for better randomization
    const variation = seed % 4;
    const baseSeeds = [173, 349, 541, 797]; // Different primes than grass
    const varSeed = baseSeeds[variation] || 500;

    // Darker specks - scattered positions
    const darkPositions = [
      [15, 25], [45, 15], [75, 35], [25, 55], [55, 45],
      [85, 65], [35, 85], [65, 75], [20, 70], [80, 20]
    ];

    ctx.fillStyle = 'rgba(60, 35, 20, 0.35)';
    darkPositions.forEach(([baseX, baseY], i) => {
      const dotSeed = (varSeed + i * 73 + seed * 13) % 1000;
      const offsetX = (dotSeed * 0.15) % 20 - 10;
      const offsetY = ((dotSeed * 0.23) % 20) - 10;
      const x = tileX + (baseX + offsetX) / 100 * TILE_SIZE;
      const y = tileY + (baseY + offsetY) / 100 * TILE_SIZE;
      const size = Math.max(0.8, TILE_SIZE * (0.012 + (dotSeed % 8) / 2000));

      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    });

    // Lighter specks - different scattered positions
    const lightPositions = [
      [30, 20], [60, 40], [20, 60], [70, 80], [50, 70], [85, 45]
    ];

    ctx.fillStyle = 'rgba(130, 95, 60, 0.25)';
    lightPositions.forEach(([baseX, baseY], i) => {
      const dotSeed = (varSeed + i * 89 + seed * 17 + 300) % 1000;
      const offsetX = (dotSeed * 0.18) % 18 - 9;
      const offsetY = ((dotSeed * 0.27) % 18) - 9;
      const x = tileX + (baseX + offsetX) / 100 * TILE_SIZE;
      const y = tileY + (baseY + offsetY) / 100 * TILE_SIZE;
      const size = Math.max(0.6, TILE_SIZE * (0.01 + (dotSeed % 6) / 2000));

      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    });

    // Occasional tiny pebble/rock
    if (seed % 4 === 0) {
      const pebbleSeed = (varSeed + seed * 1.5) % 1000;
      const px = tileX + (20 + (pebbleSeed * 0.6) % 60) / 100 * TILE_SIZE;
      const py = tileY + (20 + (pebbleSeed * 0.8) % 60) / 100 * TILE_SIZE;
      const psize = Math.max(1.5, TILE_SIZE * 0.02);

      ctx.fillStyle = 'rgba(90, 70, 50, 0.3)';
      ctx.beginPath();
      ctx.arc(px, py, psize, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (tileType === 'n') {
    // Sand noise - small scattered dots like dirt but dark yellow
    // Use variation-based positioning like grass/dirt for better randomization
    const variation = seed % 4;
    const baseSeeds = [191, 373, 557, 811]; // Different primes than dirt/grass
    const varSeed = baseSeeds[variation] || 500;

    // Darker sand specks - scattered positions
    const darkPositions = [
      [20, 30], [50, 20], [80, 40], [30, 60], [60, 50],
      [90, 70], [40, 80], [70, 70], [25, 75], [75, 25]
    ];

    ctx.fillStyle = 'rgba(140, 110, 20, 0.4)'; // Dark yellow
    darkPositions.forEach(([baseX, baseY], i) => {
      const dotSeed = (varSeed + i * 79 + seed * 11) % 1000;
      const offsetX = (dotSeed * 0.15) % 20 - 10;
      const offsetY = ((dotSeed * 0.23) % 20) - 10;
      const x = tileX + (baseX + offsetX) / 100 * TILE_SIZE;
      const y = tileY + (baseY + offsetY) / 100 * TILE_SIZE;
      const size = Math.max(0.8, TILE_SIZE * (0.012 + (dotSeed % 8) / 2000));

      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    });

    // Lighter sand specks - different scattered positions
    const lightPositions = [
      [35, 25], [65, 45], [25, 65], [75, 85], [55, 75], [80, 40]
    ];

    ctx.fillStyle = 'rgba(160, 130, 50, 0.3)'; // Lighter yellow
    lightPositions.forEach(([baseX, baseY], i) => {
      const dotSeed = (varSeed + i * 83 + seed * 19 + 400) % 1000;
      const offsetX = (dotSeed * 0.18) % 18 - 9;
      const offsetY = ((dotSeed * 0.27) % 18) - 9;
      const x = tileX + (baseX + offsetX) / 100 * TILE_SIZE;
      const y = tileY + (baseY + offsetY) / 100 * TILE_SIZE;
      const size = Math.max(0.6, TILE_SIZE * (0.01 + (dotSeed % 6) / 2000));

      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    });

    // Occasional tiny shell/pebble
    if (seed % 5 === 0) {
      const shellSeed = (varSeed + seed * 1.7) % 1000;
      const sx = tileX + (20 + (shellSeed * 0.6) % 60) / 100 * TILE_SIZE;
      const sy = tileY + (20 + (shellSeed * 0.8) % 60) / 100 * TILE_SIZE;
      const ssize = Math.max(1.5, TILE_SIZE * 0.02);

      ctx.fillStyle = 'rgba(220, 200, 150, 0.35)';
      ctx.beginPath();
      ctx.arc(sx, sy, ssize, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (tileType === 's') {
    // Slate cracks - organic, Y-shaped branching fracture patterns
    // ~48% of tiles get cracks
    if (seed % 100 < 48) {
      const crackSeed = (seed * 3) % 1000;

      // Slate crack colors - darker than the base slate
      const crackColor = 'rgba(70, 80, 90, 0.6)';
      const crackHighlight = 'rgba(120, 130, 140, 0.3)';

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Helper to draw organic crack segment with bezier curves
      const drawCrackSegment = (startX, startY, endX, endY, width, segSeed) => {
        // Calculate control points for natural curve
        const midX = (startX + endX) / 2;
        const midY = (startY + endY) / 2;
        const perpAngle = Math.atan2(endY - startY, endX - startX) + Math.PI / 2;
        const bulge = ((segSeed % 60) - 30) / 100 * TILE_SIZE * 0.05;

        const ctrlX = midX + Math.cos(perpAngle) * bulge;
        const ctrlY = midY + Math.sin(perpAngle) * bulge;

        // Draw shadow/depth line first (offset slightly)
        ctx.strokeStyle = crackColor;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.quadraticCurveTo(ctrlX, ctrlY, endX, endY);
        ctx.stroke();

        // Draw highlight on one edge for depth
        ctx.strokeStyle = crackHighlight;
        ctx.lineWidth = Math.max(0.5, width * 0.4);
        ctx.beginPath();
        ctx.moveTo(startX + 0.5, startY + 0.5);
        ctx.quadraticCurveTo(ctrlX + 0.5, ctrlY + 0.5, endX + 0.5, endY + 0.5);
        ctx.stroke();
      };

      // Number of main cracks (1-2)
      const numCracks = 1 + (crackSeed % 2);

      for (let c = 0; c < numCracks; c++) {
        const cSeed = (crackSeed + c * 137) % 1000;

        // Start point - mostly interior, occasionally from edges
        let startX, startY;
        const startEdge = cSeed % 6; // 0-3 = edges, 4-5 = interior (more interior starts)
        if (startEdge === 0) {
          startX = tileX;
          startY = tileY + (cSeed % 80 + 10) / 100 * TILE_SIZE;
        } else if (startEdge === 1) {
          startX = tileX + TILE_SIZE;
          startY = tileY + ((cSeed * 1.3) % 80 + 10) / 100 * TILE_SIZE;
        } else if (startEdge === 2) {
          startX = tileX + (cSeed % 80 + 10) / 100 * TILE_SIZE;
          startY = tileY;
        } else if (startEdge === 3) {
          startX = tileX + ((cSeed * 1.5) % 80 + 10) / 100 * TILE_SIZE;
          startY = tileY + TILE_SIZE;
        } else {
          startX = tileX + (25 + cSeed % 50) / 100 * TILE_SIZE;
          startY = tileY + (25 + (cSeed * 1.2) % 50) / 100 * TILE_SIZE;
        }

        // Main crack direction and length - SHORTER
        const mainAngle = (cSeed * 0.8) % (Math.PI * 2);
        const mainLength = TILE_SIZE * (0.15 + (cSeed % 25) / 100); // Shorter: 15-40% of tile
        const mainWidth = Math.max(1, TILE_SIZE * 0.012);

        // Draw main stem (shorter, 2-3 segments)
        const segments = 2 + (cSeed % 2);
        let prevX = startX;
        let prevY = startY;
        let forkX = startX;
        let forkY = startY;
        let forkAngle = mainAngle;

        for (let s = 0; s < segments; s++) {
          const progress = (s + 1) / segments;
          const segSeed = (cSeed + s * 47) % 1000;

          // Add variation to angle
          const angleVar = ((segSeed % 30) - 15) / 180 * Math.PI;
          const segAngle = mainAngle + angleVar;

          const segLength = mainLength / segments;
          const nextX = prevX + Math.cos(segAngle) * segLength;
          const nextY = prevY + Math.sin(segAngle) * segLength;

          // Crack gets thinner as it goes
          const segWidth = mainWidth * (1 - progress * 0.3);

          drawCrackSegment(prevX, prevY, nextX, nextY, segWidth, segSeed);

          // Save fork point (around 50-70% along the stem)
          if (s === Math.floor(segments * 0.5)) {
            forkX = nextX;
            forkY = nextY;
            forkAngle = segAngle;
          }

          prevX = nextX;
          prevY = nextY;
        }

        // Y-BRANCH: Most cracks fork into Y shape
        if (cSeed % 3 !== 0) { // ~67% get Y-fork
          const forkSpread = (25 + cSeed % 35) * Math.PI / 180; // 25-60 degree spread
          const branchLength = mainLength * (0.3 + (cSeed % 20) / 100); // 30-50% of main length

          // Left branch of Y
          const leftAngle = forkAngle - forkSpread;
          const leftEndX = forkX + Math.cos(leftAngle) * branchLength;
          const leftEndY = forkY + Math.sin(leftAngle) * branchLength;
          drawCrackSegment(forkX, forkY, leftEndX, leftEndY, mainWidth * 0.7, cSeed + 100);

          // Right branch of Y
          const rightAngle = forkAngle + forkSpread;
          const rightEndX = forkX + Math.cos(rightAngle) * branchLength;
          const rightEndY = forkY + Math.sin(rightAngle) * branchLength;
          drawCrackSegment(forkX, forkY, rightEndX, rightEndY, mainWidth * 0.7, cSeed + 200);

          // Occasional tiny sub-branches on Y tips
          if (cSeed % 5 === 0) {
            const subLength = branchLength * 0.4;
            const subAngle = leftAngle - 20 * Math.PI / 180;
            drawCrackSegment(leftEndX, leftEndY,
              leftEndX + Math.cos(subAngle) * subLength,
              leftEndY + Math.sin(subAngle) * subLength,
              mainWidth * 0.4, cSeed + 300);
          }
        }
      }
    }

    // Add subtle surface texture variation
    const speckCount = 2 + (seed % 3);
    ctx.fillStyle = 'rgba(100, 110, 120, 0.1)';
    for (let i = 0; i < speckCount; i++) {
      const speckSeed = (seed + i * 89) % 1000;
      const x = tileX + (speckSeed % 90 + 5) / 100 * TILE_SIZE;
      const y = tileY + ((speckSeed * 1.4) % 90 + 5) / 100 * TILE_SIZE;
      const size = Math.max(1, TILE_SIZE * 0.03);
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (tileType === 'o') {
    // Snow texture - subtle shadows and sparkle highlights
    // Use variation-based positioning - spread evenly to avoid grid pattern when tiled
    const variation = seed % 4;
    const baseSeeds = [197, 389, 571, 827]; // Different primes for snow
    const varSeed = baseSeeds[variation] || 500;

    // Light shadow blotches - spread across entire tile including edges
    // Different variations place blotches in different quadrants to break up pattern
    const shadowPositionSets = [
      [[10, 15], [85, 40], [45, 90], [60, 5]],   // variation 0: corners/edges
      [[5, 55], [50, 20], [90, 75], [35, 60]],   // variation 1: different spread
      [[75, 10], [20, 80], [95, 50], [40, 35]],  // variation 2: opposite corners
      [[55, 95], [15, 30], [80, 65], [45, 5]]    // variation 3: mixed
    ];
    const shadowPositions = shadowPositionSets[variation];

    ctx.fillStyle = 'rgba(220, 230, 240, 0.35)'; // Very light blue-gray, subtle
    shadowPositions.forEach(([baseX, baseY], i) => {
      const dotSeed = (varSeed + i * 71 + seed * 17) % 1000;
      // Smaller offset to keep distribution even
      const offsetX = (dotSeed * 0.12) % 16 - 8;
      const offsetY = ((dotSeed * 0.17) % 16) - 8;
      const x = tileX + (baseX + offsetX) / 100 * TILE_SIZE;
      const y = tileY + (baseY + offsetY) / 100 * TILE_SIZE;
      // Bigger blotches
      const size = Math.max(2, TILE_SIZE * (0.04 + (dotSeed % 10) / 500));

      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    });

    // Sparkle highlights - spread across tile
    const sparklePositionSets = [
      [[30, 5], [85, 60], [15, 85]],   // variation 0
      [[70, 15], [10, 50], [55, 80]],  // variation 1
      [[90, 30], [40, 70], [5, 20]],   // variation 2
      [[25, 45], [75, 90], [50, 10]]   // variation 3
    ];
    const sparklePositions = sparklePositionSets[variation];

    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'; // Soft white sparkles
    sparklePositions.forEach(([baseX, baseY], i) => {
      const dotSeed = (varSeed + i * 97 + seed * 23 + 500) % 1000;
      const offsetX = (dotSeed * 0.15) % 14 - 7;
      const offsetY = ((dotSeed * 0.2) % 14) - 7;
      const x = tileX + (baseX + offsetX) / 100 * TILE_SIZE;
      const y = tileY + (baseY + offsetY) / 100 * TILE_SIZE;
      const size = Math.max(1, TILE_SIZE * (0.015 + (dotSeed % 5) / 1500));

      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    });

    // Occasional larger snow drift shadow - position varies by seed
    if (seed % 6 === 0) {
      const driftSeed = (varSeed + seed * 1.9) % 1000;
      // Full range positioning including edges
      const dx = tileX + (5 + (driftSeed * 0.9) % 90) / 100 * TILE_SIZE;
      const dy = tileY + (5 + (driftSeed * 1.1) % 90) / 100 * TILE_SIZE;
      const dsize = Math.max(3, TILE_SIZE * 0.06);

      ctx.fillStyle = 'rgba(230, 238, 245, 0.3)'; // Very light, almost white
      ctx.beginPath();
      ctx.arc(dx, dy, dsize, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (tileType === 'z') {
    // Moss texture - bigger clumps than grass with yellow and lighter green highlights
    const variation = seed % 4;
    const baseSeeds = [163, 337, 509, 733]; // Different primes for moss
    const varSeed = baseSeeds[variation] || 500;

    // Big fluffy moss clumps - more positions and larger than grass
    const clumpPositionSets = [
      [[20, 25], [65, 35], [35, 70], [80, 75], [50, 50]],
      [[15, 50], [55, 20], [85, 55], [40, 85], [70, 70]],
      [[30, 15], [75, 45], [20, 75], [60, 65], [45, 40]],
      [[45, 25], [80, 30], [25, 60], [65, 80], [15, 35]]
    ];
    const clumpPositions = clumpPositionSets[variation];

    // Draw moss clumps - lighter green organic shapes
    clumpPositions.forEach(([baseX, baseY], i) => {
      const clumpSeed = (varSeed + i * 67 + seed * 13) % 1000;
      const offsetX = (clumpSeed * 0.15) % 20 - 10;
      const offsetY = ((clumpSeed * 0.2) % 20) - 10;
      const x = tileX + (baseX + offsetX) / 100 * TILE_SIZE;
      const y = tileY + (baseY + offsetY) / 100 * TILE_SIZE;
      // Bigger clumps than grass (1.5x-2x size)
      const clumpSize = Math.max(3, TILE_SIZE * (0.08 + (clumpSeed % 40) / 500));

      // Lighter moss green color
      ctx.fillStyle = 'rgba(45, 140, 55, 0.5)';

      // Draw irregular clump shape
      ctx.beginPath();
      const points = 6 + (clumpSeed % 3);
      for (let p = 0; p < points; p++) {
        const angle = (p / points) * Math.PI * 2;
        const radiusVariation = 0.6 + ((clumpSeed * (p + 1)) % 100) / 250;
        const px = x + Math.cos(angle) * clumpSize * radiusVariation;
        const py = y + Math.sin(angle) * clumpSize * radiusVariation;
        if (p === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    });

    // Yellow-green highlight clumps - more frequent than grass (40% of tiles)
    const yellowPositionSets = [
      [[25, 40], [70, 25], [45, 80]],
      [[60, 50], [20, 70], [80, 15]],
      [[35, 30], [75, 70], [15, 55]],
      [[50, 15], [30, 85], [85, 45]]
    ];
    const yellowPositions = yellowPositionSets[variation];

    const showYellow = ((seed * 29 + variation * 13) % 100) < 40;
    if (showYellow) {
      yellowPositions.forEach(([baseX, baseY], i) => {
        const yellowSeed = (varSeed + i * 83 + seed * 19 + 400) % 1000;
        const offsetX = (yellowSeed * 0.12) % 16 - 8;
        const offsetY = ((yellowSeed * 0.18) % 16) - 8;
        const x = tileX + (baseX + offsetX) / 100 * TILE_SIZE;
        const y = tileY + (baseY + offsetY) / 100 * TILE_SIZE;
        const size = Math.max(2, TILE_SIZE * (0.06 + (yellowSeed % 30) / 600));

        // Yellow-green color
        ctx.fillStyle = 'rgba(180, 200, 50, 0.55)';

        // Irregular blob shape
        ctx.beginPath();
        const points = 5 + (yellowSeed % 2);
        for (let p = 0; p < points; p++) {
          const angle = (p / points) * Math.PI * 2;
          const radiusVariation = 0.7 + ((yellowSeed * (p + 2)) % 100) / 300;
          const px = x + Math.cos(angle) * size * radiusVariation;
          const py = y + Math.sin(angle) * size * radiusVariation;
          if (p === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
      });
    }

    // Bright green accent spots - small highlights
    const accentPositionSets = [
      [[40, 55], [75, 85]],
      [[30, 40], [85, 25]],
      [[55, 75], [15, 20]],
      [[70, 50], [25, 80]]
    ];
    const accentPositions = accentPositionSets[variation];

    ctx.fillStyle = 'rgba(100, 180, 80, 0.4)';
    accentPositions.forEach(([baseX, baseY], i) => {
      const accentSeed = (varSeed + i * 101 + seed * 7 + 200) % 1000;
      const offsetX = (accentSeed * 0.1) % 14 - 7;
      const offsetY = ((accentSeed * 0.15) % 14) - 7;
      const x = tileX + (baseX + offsetX) / 100 * TILE_SIZE;
      const y = tileY + (baseY + offsetY) / 100 * TILE_SIZE;
      const size = Math.max(1.5, TILE_SIZE * (0.025 + (accentSeed % 15) / 800));

      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    });

    // Dark moss shadows for depth
    if (seed % 3 === 0) {
      const shadowSeed = (varSeed + seed * 2.3) % 1000;
      const sx = tileX + (15 + (shadowSeed * 0.7) % 70) / 100 * TILE_SIZE;
      const sy = tileY + (15 + (shadowSeed * 0.9) % 70) / 100 * TILE_SIZE;
      const ssize = Math.max(2, TILE_SIZE * 0.04);

      ctx.fillStyle = 'rgba(10, 60, 20, 0.3)';
      ctx.beginPath();
      ctx.arc(sx, sy, ssize, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Note: pavement (p) and cobblestone (x) textures are handled by drawBeveledStoneTile
}

/**
 * Create tile texture - simple solid tiles with texture and corner rounding
 */
function createTileTextureV2(tileType, TILE_SIZE, rowIndex, colIndex, tileTypes) {
  const canvas = document.createElement('canvas');
  canvas.width = TILE_SIZE;
  canvas.height = TILE_SIZE;
  const ctx = canvas.getContext('2d');

  const baseColor = getTileColor(tileType);
  const seed = (rowIndex * 127 + colIndex * 53) % 10000;

  // Special handling for pavement and cobblestone - beveled stone look
  if (tileType === 'p' || tileType === 'x') {
    // Fill background with grass color first (for gaps between stones)
    ctx.fillStyle = getTileColor('g');
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

    // Draw beveled stone on top
    drawBeveledStoneTile(ctx, 0, 0, TILE_SIZE, baseColor, tileType, seed);

    return canvas;
  }

  // Fill with base tile color (solid fill, no gaps)
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

  // Add subtle texture to base tile
  addTileTexture(ctx, tileType, 0, 0, TILE_SIZE, seed);

  // Draw rounded corners where higher-priority tiles meet this tile
  if (tileTypes) {
    drawCornerRounding(ctx, tileType, TILE_SIZE, rowIndex, colIndex, tileTypes);
  }

  return canvas;
}

// ============================================
// MAIN COMPONENT
// ============================================

export const RenderTilesCanvasV2 = ({ grid, tileTypes, TILE_SIZE, zoomLevel, handleTileClick }) => {
  const canvasRef = useRef(null);
  const textureCache = useRef(new Map());
  const lastRenderData = useRef(null);
  const lastTileTypes = useRef(null);

  // Clear texture cache when TILE_SIZE or zoomLevel changes
  useEffect(() => {
    textureCache.current.clear();
  }, [TILE_SIZE, zoomLevel]);

  // Invalidate cache for changed tiles and their neighbors
  useEffect(() => {
    if (!tileTypes || !lastTileTypes.current) {
      lastTileTypes.current = tileTypes;
      return;
    }

    const rows = tileTypes.length;
    const cols = tileTypes[0]?.length || 0;
    const keysToDelete = new Set();

    // Find changed tiles and mark them + neighbors for cache invalidation
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const currentType = tileTypes[row]?.[col];
        const previousType = lastTileTypes.current[row]?.[col];

        if (currentType !== previousType) {
          // Invalidate this tile and all 8 neighbors
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              const nr = row + dr;
              const nc = col + dc;
              if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                const neighborType = tileTypes[nr]?.[nc] || 'g';
                const cacheKey = `${neighborType}-${TILE_SIZE}-${zoomLevel}-${nr}-${nc}`;
                keysToDelete.add(cacheKey);
              }
            }
          }
        }
      }
    }

    // Delete invalidated cache entries
    keysToDelete.forEach(key => {
      textureCache.current.delete(key);
    });

    lastTileTypes.current = tileTypes;
  }, [tileTypes, TILE_SIZE, zoomLevel]);

  // Get or create tile texture
  const getTileTexture = useCallback((tileType, rowIndex, colIndex) => {
    const cacheKey = `${tileType}-${TILE_SIZE}-${zoomLevel}-${rowIndex}-${colIndex}`;

    if (!textureCache.current.has(cacheKey)) {
      textureCache.current.set(
        cacheKey,
        createTileTextureV2(tileType, TILE_SIZE, rowIndex, colIndex, tileTypes)
      );
    }
    return textureCache.current.get(cacheKey);
  }, [TILE_SIZE, tileTypes, zoomLevel]);

  // Render tiles to canvas
  const renderTiles = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !grid || !tileTypes) {
      return;
    }

    const ctx = canvas.getContext('2d');
    const rows = grid.length;
    const cols = grid[0]?.length || 0;

    canvas.width = cols * TILE_SIZE;
    canvas.height = rows * TILE_SIZE;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let rowIndex = 0; rowIndex < rows; rowIndex++) {
      for (let colIndex = 0; colIndex < cols; colIndex++) {
        const tileType = tileTypes[rowIndex]?.[colIndex] || 'g';
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
  }, [grid, tileTypes, TILE_SIZE, getTileTexture]);

  useEffect(() => {
    const currentData = JSON.stringify({ grid, tileTypes, TILE_SIZE, zoomLevel });
    if (currentData !== lastRenderData.current) {
      renderTiles();
      lastRenderData.current = currentData;
    }
  }, [renderTiles, grid, tileTypes, TILE_SIZE, zoomLevel]);

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
        zIndex: 1,
        cursor: 'pointer',
        imageRendering: 'pixelated',
      }}
    />
  );
};
