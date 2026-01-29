/**
 * PixiRendererTileTextures - Tile texture generation for PixiJS renderer
 *
 * Ports the sophisticated tile rendering from RenderTilesCanvasV2.js:
 * - Procedural texture details (grass tufts, dirt specks, cracks, etc.)
 * - Seeded variations to prevent pattern repetition
 * - Priority-based corner rounding for natural terrain transitions
 */

import { Texture } from 'pixi.js-legacy';
import { getTileColor } from '../../UI/Styles/tileColors';

// Base texture size - textures are rendered at this size and scaled via sprites
const BASE_TEXTURE_SIZE = 64;

// Texture cache - stores pre-rendered textures by key
const tileTextureCache = new Map();

// Corner rounding priority - higher priority tiles round INTO lower priority tiles
const CORNER_PRIORITY = {
  'g': 100,  // grass - highest priority, rounds into everything
  'o': 90,   // snow
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

// Tile edge style - organic tiles get smooth edges, inorganic get straight edges
const TILE_EDGE_STYLE = {
  'g': 'organic', 'z': 'organic', 'o': 'organic', 'n': 'organic',
  'd': 'organic', 'c': 'organic', 's': 'organic', 'w': 'organic',
  'l': 'organic', 'v': 'organic', 'u': 'organic',
  'p': 'straight', 'x': 'straight', 'y': 'straight',
};

/**
 * Check if a tile type uses organic edges
 */
function isOrganicTile(tileType) {
  return TILE_EDGE_STYLE[tileType] === 'organic';
}

/**
 * Parse hex color to RGB values
 */
function parseColorToRgb(color) {
  const fallback = { r: 128, g: 128, b: 128 };
  if (!color || typeof color !== 'string') return fallback;

  const hex = color.replace('#', '');
  let r, g, b;

  if (hex.length === 3 || hex.length === 4) {
    r = parseInt(hex[0] + hex[0], 16);
    g = parseInt(hex[1] + hex[1], 16);
    b = parseInt(hex[2] + hex[2], 16);
  } else if (hex.length === 6 || hex.length === 8) {
    r = parseInt(hex.substring(0, 2), 16);
    g = parseInt(hex.substring(2, 4), 16);
    b = parseInt(hex.substring(4, 6), 16);
  } else {
    return fallback;
  }

  if (isNaN(r) || isNaN(g) || isNaN(b)) return fallback;
  return { r, g, b };
}

/**
 * Get variation index from row/col position
 */
export function getVariation(row, col, numVariations = 4) {
  return (row * 73 + col * 37) % numVariations;
}

/**
 * Get seed from row/col position
 */
export function getSeed(row, col) {
  return (row * 127 + col * 53) % 10000;
}

// ============================================
// TEXTURE DETAIL DRAWING FUNCTIONS
// ============================================

/**
 * Draw a single grass tuft - irregular clump shape
 */
function drawGrassTuft(ctx, x, y, tuftSeed, size) {
  const tuftSize = Math.max(1, size * 0.08 + (tuftSeed * 0.01) % (size * 0.04));
  const opacity = 0.15 + (tuftSeed * 0.01) % 0.1;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((tuftSeed * 0.5) % 60 - 30);
  ctx.fillStyle = `rgba(0, 50, 0, ${opacity})`;

  ctx.beginPath();
  const points = [
    [0.3, 1], [0, 0.8], [0.1, 0.6], [0, 0.4], [0.15, 0.2],
    [0.4, 0.3], [0.6, 0.1], [0.8, 0.3], [1, 0.5], [0.85, 0.8], [0.7, 1]
  ];

  points.forEach(([px, py], index) => {
    const drawX = px * tuftSize - tuftSize / 2;
    const drawY = py * tuftSize - tuftSize / 2;
    if (index === 0) ctx.moveTo(drawX, drawY);
    else ctx.lineTo(drawX, drawY);
  });
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * Draw grass texture details
 */
function drawGrassDetails(ctx, size, seed, variation) {
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
    const x = (baseX + offsetX) / 100 * size;
    const y = (baseY + offsetY) / 100 * size;
    drawGrassTuft(ctx, x, y, tuftSeed, size);
  });

  // Occasional yellow clump
  const yellowVariation = (seed * 7 + variation * 3) % 8;
  const yellowPositionSets = [
    [15, 25], [75, 65], [40, 80], [85, 20],
    [55, 35], [25, 70], [70, 45], [35, 15]
  ];
  const showYellow = ((seed * 31 + variation * 17) % 100) < 20;

  if (showYellow) {
    const yellowPos = yellowPositionSets[yellowVariation];
    const offsetSeed = (seed * 37 + variation * 53) % 1000;
    const offsetX = (offsetSeed % 20) - 10;
    const offsetY = ((offsetSeed * 7) % 20) - 10;

    const lightX = (yellowPos[0] + offsetX) / 100 * size;
    const lightY = (yellowPos[1] + offsetY) / 100 * size;
    const lightSize = Math.max(2, size * 0.12 + (offsetSeed % 40) / 1000 * size);

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
}

/**
 * Draw dirt texture details
 */
function drawDirtDetails(ctx, size, seed, variation) {
  const baseSeeds = [173, 349, 541, 797];
  const varSeed = baseSeeds[variation] || 500;

  // Darker specks
  const darkPositions = [
    [15, 25], [45, 15], [75, 35], [25, 55], [55, 45],
    [85, 65], [35, 85], [65, 75], [20, 70], [80, 20]
  ];

  ctx.fillStyle = 'rgba(60, 35, 20, 0.35)';
  darkPositions.forEach(([baseX, baseY], i) => {
    const dotSeed = (varSeed + i * 73 + seed * 13) % 1000;
    const offsetX = (dotSeed * 0.15) % 20 - 10;
    const offsetY = ((dotSeed * 0.23) % 20) - 10;
    const x = (baseX + offsetX) / 100 * size;
    const y = (baseY + offsetY) / 100 * size;
    const dotSize = Math.max(0.8, size * (0.012 + (dotSeed % 8) / 2000));

    ctx.beginPath();
    ctx.arc(x, y, dotSize, 0, Math.PI * 2);
    ctx.fill();
  });

  // Lighter specks
  const lightPositions = [
    [30, 20], [60, 40], [20, 60], [70, 80], [50, 70], [85, 45]
  ];

  ctx.fillStyle = 'rgba(130, 95, 60, 0.25)';
  lightPositions.forEach(([baseX, baseY], i) => {
    const dotSeed = (varSeed + i * 89 + seed * 17 + 300) % 1000;
    const offsetX = (dotSeed * 0.18) % 18 - 9;
    const offsetY = ((dotSeed * 0.27) % 18) - 9;
    const x = (baseX + offsetX) / 100 * size;
    const y = (baseY + offsetY) / 100 * size;
    const dotSize = Math.max(0.6, size * (0.01 + (dotSeed % 6) / 2000));

    ctx.beginPath();
    ctx.arc(x, y, dotSize, 0, Math.PI * 2);
    ctx.fill();
  });

  // Occasional pebble
  if (seed % 4 === 0) {
    const pebbleSeed = (varSeed + seed * 1.5) % 1000;
    const px = (20 + (pebbleSeed * 0.6) % 60) / 100 * size;
    const py = (20 + (pebbleSeed * 0.8) % 60) / 100 * size;
    const psize = Math.max(1.5, size * 0.02);

    ctx.fillStyle = 'rgba(90, 70, 50, 0.3)';
    ctx.beginPath();
    ctx.arc(px, py, psize, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Draw sand texture details
 */
function drawSandDetails(ctx, size, seed, variation) {
  const baseSeeds = [191, 373, 557, 811];
  const varSeed = baseSeeds[variation] || 500;

  // Darker sand specks
  const darkPositions = [
    [20, 30], [50, 20], [80, 40], [30, 60], [60, 50],
    [90, 70], [40, 80], [70, 70], [25, 75], [75, 25]
  ];

  ctx.fillStyle = 'rgba(140, 110, 20, 0.4)';
  darkPositions.forEach(([baseX, baseY], i) => {
    const dotSeed = (varSeed + i * 79 + seed * 11) % 1000;
    const offsetX = (dotSeed * 0.15) % 20 - 10;
    const offsetY = ((dotSeed * 0.23) % 20) - 10;
    const x = (baseX + offsetX) / 100 * size;
    const y = (baseY + offsetY) / 100 * size;
    const dotSize = Math.max(0.8, size * (0.012 + (dotSeed % 8) / 2000));

    ctx.beginPath();
    ctx.arc(x, y, dotSize, 0, Math.PI * 2);
    ctx.fill();
  });

  // Lighter sand specks
  const lightPositions = [
    [35, 25], [65, 45], [25, 65], [75, 85], [55, 75], [80, 40]
  ];

  ctx.fillStyle = 'rgba(160, 130, 50, 0.3)';
  lightPositions.forEach(([baseX, baseY], i) => {
    const dotSeed = (varSeed + i * 83 + seed * 19 + 400) % 1000;
    const offsetX = (dotSeed * 0.18) % 18 - 9;
    const offsetY = ((dotSeed * 0.27) % 18) - 9;
    const x = (baseX + offsetX) / 100 * size;
    const y = (baseY + offsetY) / 100 * size;
    const dotSize = Math.max(0.6, size * (0.01 + (dotSeed % 6) / 2000));

    ctx.beginPath();
    ctx.arc(x, y, dotSize, 0, Math.PI * 2);
    ctx.fill();
  });

  // Occasional shell/pebble
  if (seed % 5 === 0) {
    const shellSeed = (varSeed + seed * 1.7) % 1000;
    const sx = (20 + (shellSeed * 0.6) % 60) / 100 * size;
    const sy = (20 + (shellSeed * 0.8) % 60) / 100 * size;
    const ssize = Math.max(1.5, size * 0.02);

    ctx.fillStyle = 'rgba(220, 200, 150, 0.35)';
    ctx.beginPath();
    ctx.arc(sx, sy, ssize, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Draw slate texture details (Y-shaped cracks)
 */
function drawSlateDetails(ctx, size, seed) {
  // ~48% of tiles get cracks
  if (seed % 100 >= 48) {
    // Just add subtle surface texture
    const speckCount = 2 + (seed % 3);
    ctx.fillStyle = 'rgba(100, 110, 120, 0.1)';
    for (let i = 0; i < speckCount; i++) {
      const speckSeed = (seed + i * 89) % 1000;
      const x = (speckSeed % 90 + 5) / 100 * size;
      const y = ((speckSeed * 1.4) % 90 + 5) / 100 * size;
      const speckSize = Math.max(1, size * 0.03);
      ctx.beginPath();
      ctx.arc(x, y, speckSize, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  const crackSeed = (seed * 3) % 1000;
  const crackColor = 'rgba(70, 80, 90, 0.6)';
  const crackHighlight = 'rgba(120, 130, 140, 0.3)';

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Helper to draw organic crack segment with bezier curves
  const drawCrackSegment = (startX, startY, endX, endY, width, segSeed) => {
    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;
    const perpAngle = Math.atan2(endY - startY, endX - startX) + Math.PI / 2;
    const bulge = ((segSeed % 60) - 30) / 100 * size * 0.05;

    const ctrlX = midX + Math.cos(perpAngle) * bulge;
    const ctrlY = midY + Math.sin(perpAngle) * bulge;

    ctx.strokeStyle = crackColor;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.quadraticCurveTo(ctrlX, ctrlY, endX, endY);
    ctx.stroke();

    ctx.strokeStyle = crackHighlight;
    ctx.lineWidth = Math.max(0.5, width * 0.4);
    ctx.beginPath();
    ctx.moveTo(startX + 0.5, startY + 0.5);
    ctx.quadraticCurveTo(ctrlX + 0.5, ctrlY + 0.5, endX + 0.5, endY + 0.5);
    ctx.stroke();
  };

  const numCracks = 1 + (crackSeed % 2);

  for (let c = 0; c < numCracks; c++) {
    const cSeed = (crackSeed + c * 137) % 1000;

    // Start point
    let startX, startY;
    const startEdge = cSeed % 6;
    if (startEdge === 0) {
      startX = 0;
      startY = (cSeed % 80 + 10) / 100 * size;
    } else if (startEdge === 1) {
      startX = size;
      startY = ((cSeed * 1.3) % 80 + 10) / 100 * size;
    } else if (startEdge === 2) {
      startX = (cSeed % 80 + 10) / 100 * size;
      startY = 0;
    } else if (startEdge === 3) {
      startX = ((cSeed * 1.5) % 80 + 10) / 100 * size;
      startY = size;
    } else {
      startX = (25 + cSeed % 50) / 100 * size;
      startY = (25 + (cSeed * 1.2) % 50) / 100 * size;
    }

    const mainAngle = (cSeed * 0.8) % (Math.PI * 2);
    const mainLength = size * (0.15 + (cSeed % 25) / 100);
    const mainWidth = Math.max(1, size * 0.012);

    const segments = 2 + (cSeed % 2);
    let prevX = startX;
    let prevY = startY;
    let forkX = startX;
    let forkY = startY;
    let forkAngle = mainAngle;

    for (let s = 0; s < segments; s++) {
      const progress = (s + 1) / segments;
      const segSeed = (cSeed + s * 47) % 1000;

      const angleVar = ((segSeed % 30) - 15) / 180 * Math.PI;
      const segAngle = mainAngle + angleVar;

      const segLength = mainLength / segments;
      const nextX = prevX + Math.cos(segAngle) * segLength;
      const nextY = prevY + Math.sin(segAngle) * segLength;

      const segWidth = mainWidth * (1 - progress * 0.3);

      drawCrackSegment(prevX, prevY, nextX, nextY, segWidth, segSeed);

      if (s === Math.floor(segments * 0.5)) {
        forkX = nextX;
        forkY = nextY;
        forkAngle = segAngle;
      }

      prevX = nextX;
      prevY = nextY;
    }

    // Y-BRANCH
    if (cSeed % 3 !== 0) {
      const forkSpread = (25 + cSeed % 35) * Math.PI / 180;
      const branchLength = mainLength * (0.3 + (cSeed % 20) / 100);

      const leftAngle = forkAngle - forkSpread;
      const leftEndX = forkX + Math.cos(leftAngle) * branchLength;
      const leftEndY = forkY + Math.sin(leftAngle) * branchLength;
      drawCrackSegment(forkX, forkY, leftEndX, leftEndY, mainWidth * 0.7, cSeed + 100);

      const rightAngle = forkAngle + forkSpread;
      const rightEndX = forkX + Math.cos(rightAngle) * branchLength;
      const rightEndY = forkY + Math.sin(rightAngle) * branchLength;
      drawCrackSegment(forkX, forkY, rightEndX, rightEndY, mainWidth * 0.7, cSeed + 200);

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

  // Surface texture
  const speckCount = 2 + (seed % 3);
  ctx.fillStyle = 'rgba(100, 110, 120, 0.1)';
  for (let i = 0; i < speckCount; i++) {
    const speckSeed = (seed + i * 89) % 1000;
    const x = (speckSeed % 90 + 5) / 100 * size;
    const y = ((speckSeed * 1.4) % 90 + 5) / 100 * size;
    const speckSize = Math.max(1, size * 0.03);
    ctx.beginPath();
    ctx.arc(x, y, speckSize, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Draw snow texture details
 */
function drawSnowDetails(ctx, size, seed, variation) {
  const baseSeeds = [197, 389, 571, 827];
  const varSeed = baseSeeds[variation] || 500;

  // Shadow blotches
  const shadowPositionSets = [
    [[10, 15], [85, 40], [45, 90], [60, 5]],
    [[5, 55], [50, 20], [90, 75], [35, 60]],
    [[75, 10], [20, 80], [95, 50], [40, 35]],
    [[55, 95], [15, 30], [80, 65], [45, 5]]
  ];
  const shadowPositions = shadowPositionSets[variation];

  ctx.fillStyle = 'rgba(220, 230, 240, 0.35)';
  shadowPositions.forEach(([baseX, baseY], i) => {
    const dotSeed = (varSeed + i * 71 + seed * 17) % 1000;
    const offsetX = (dotSeed * 0.12) % 16 - 8;
    const offsetY = ((dotSeed * 0.17) % 16) - 8;
    const x = (baseX + offsetX) / 100 * size;
    const y = (baseY + offsetY) / 100 * size;
    const dotSize = Math.max(2, size * (0.04 + (dotSeed % 10) / 500));

    ctx.beginPath();
    ctx.arc(x, y, dotSize, 0, Math.PI * 2);
    ctx.fill();
  });

  // Sparkle highlights
  const sparklePositionSets = [
    [[30, 5], [85, 60], [15, 85]],
    [[70, 15], [10, 50], [55, 80]],
    [[90, 30], [40, 70], [5, 20]],
    [[25, 45], [75, 90], [50, 10]]
  ];
  const sparklePositions = sparklePositionSets[variation];

  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  sparklePositions.forEach(([baseX, baseY], i) => {
    const dotSeed = (varSeed + i * 97 + seed * 23 + 500) % 1000;
    const offsetX = (dotSeed * 0.15) % 14 - 7;
    const offsetY = ((dotSeed * 0.2) % 14) - 7;
    const x = (baseX + offsetX) / 100 * size;
    const y = (baseY + offsetY) / 100 * size;
    const dotSize = Math.max(1, size * (0.015 + (dotSeed % 5) / 1500));

    ctx.beginPath();
    ctx.arc(x, y, dotSize, 0, Math.PI * 2);
    ctx.fill();
  });

  // Occasional drift shadow
  if (seed % 6 === 0) {
    const driftSeed = (varSeed + seed * 1.9) % 1000;
    const dx = (5 + (driftSeed * 0.9) % 90) / 100 * size;
    const dy = (5 + (driftSeed * 1.1) % 90) / 100 * size;
    const dsize = Math.max(3, size * 0.06);

    ctx.fillStyle = 'rgba(230, 238, 245, 0.3)';
    ctx.beginPath();
    ctx.arc(dx, dy, dsize, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Draw moss texture details
 */
function drawMossDetails(ctx, size, seed, variation) {
  const baseSeeds = [163, 337, 509, 733];
  const varSeed = baseSeeds[variation] || 500;

  // Fluffy moss clumps
  const clumpPositionSets = [
    [[20, 25], [65, 35], [35, 70], [80, 75], [50, 50]],
    [[15, 50], [55, 20], [85, 55], [40, 85], [70, 70]],
    [[30, 15], [75, 45], [20, 75], [60, 65], [45, 40]],
    [[45, 25], [80, 30], [25, 60], [65, 80], [15, 35]]
  ];
  const clumpPositions = clumpPositionSets[variation];

  clumpPositions.forEach(([baseX, baseY], i) => {
    const clumpSeed = (varSeed + i * 67 + seed * 13) % 1000;
    const offsetX = (clumpSeed * 0.15) % 20 - 10;
    const offsetY = ((clumpSeed * 0.2) % 20) - 10;
    const x = (baseX + offsetX) / 100 * size;
    const y = (baseY + offsetY) / 100 * size;
    const clumpSize = Math.max(3, size * (0.08 + (clumpSeed % 40) / 500));

    ctx.fillStyle = 'rgba(45, 140, 55, 0.5)';

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

  // Yellow-green highlights
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
      const x = (baseX + offsetX) / 100 * size;
      const y = (baseY + offsetY) / 100 * size;
      const blobSize = Math.max(2, size * (0.06 + (yellowSeed % 30) / 600));

      ctx.fillStyle = 'rgba(180, 200, 50, 0.55)';

      ctx.beginPath();
      const points = 5 + (yellowSeed % 2);
      for (let p = 0; p < points; p++) {
        const angle = (p / points) * Math.PI * 2;
        const radiusVariation = 0.7 + ((yellowSeed * (p + 2)) % 100) / 300;
        const px = x + Math.cos(angle) * blobSize * radiusVariation;
        const py = y + Math.sin(angle) * blobSize * radiusVariation;
        if (p === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    });
  }

  // Bright green accents
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
    const x = (baseX + offsetX) / 100 * size;
    const y = (baseY + offsetY) / 100 * size;
    const dotSize = Math.max(1.5, size * (0.025 + (accentSeed % 15) / 800));

    ctx.beginPath();
    ctx.arc(x, y, dotSize, 0, Math.PI * 2);
    ctx.fill();
  });

  // Dark moss shadows
  if (seed % 3 === 0) {
    const shadowSeed = (varSeed + seed * 2.3) % 1000;
    const sx = (15 + (shadowSeed * 0.7) % 70) / 100 * size;
    const sy = (15 + (shadowSeed * 0.9) % 70) / 100 * size;
    const ssize = Math.max(2, size * 0.04);

    ctx.fillStyle = 'rgba(10, 60, 20, 0.3)';
    ctx.beginPath();
    ctx.arc(sx, sy, ssize, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Draw a single beveled stone
 */
function drawSingleBeveledStone(ctx, x, y, width, height, bevelSize, mainColor, highlightColor, shadowColor) {
  ctx.fillStyle = mainColor;
  ctx.fillRect(x, y, width, height);

  ctx.fillStyle = highlightColor;
  ctx.fillRect(x, y, width, bevelSize);
  ctx.fillRect(x, y, bevelSize, height);

  ctx.fillStyle = shadowColor;
  ctx.fillRect(x, y + height - bevelSize, width, bevelSize);
  ctx.fillRect(x + width - bevelSize, y, bevelSize, height);
}

/**
 * Draw pavement texture (single beveled stone with grass tufts)
 */
function drawPavementDetails(ctx, size, seed, baseColor) {
  // Fill background with grass color first
  ctx.fillStyle = getTileColor('g');
  ctx.fillRect(0, 0, size, size);

  const bevelSize = Math.max(2, Math.floor(size * 0.08));
  const highlightColor = 'rgba(220, 200, 160, 0.5)';
  const shadowColor = 'rgba(160, 140, 100, 0.6)';

  drawSingleBeveledStone(ctx, 0, 0, size, size, bevelSize, baseColor, highlightColor, shadowColor);

  // Grass tufts at edges
  if (seed % 5 < 3) {
    const tuftSeed = (seed * 3) % 1000;
    const grassDark = 'rgba(50, 130, 50, 0.85)';
    const tuftCount = 1 + (tuftSeed % 2);

    for (let t = 0; t < tuftCount; t++) {
      const edge = (seed * 7 + t * 41) % 4;
      const tSeed = (tuftSeed + t * 100) % 1000;
      const edgePos = (0.2 + (tSeed % 60) / 100) * size;
      const bladeCount = 2 + (tSeed % 2);
      const bladeSpacing = size * 0.064;

      ctx.fillStyle = grassDark;

      for (let b = 0; b < bladeCount; b++) {
        const bSeed = (tSeed + b * 17) % 100;
        const h = size * (0.04 + bSeed / 1500);
        const w = Math.max(1, size * 0.04);

        let x, y;
        switch (edge) {
          case 0: // top
            x = edgePos + b * bladeSpacing;
            y = 0;
            ctx.beginPath();
            ctx.moveTo(x - w, y);
            ctx.lineTo(x, y + h);
            ctx.lineTo(x + w, y);
            ctx.closePath();
            ctx.fill();
            break;
          case 1: // right
            x = size;
            y = edgePos + b * bladeSpacing;
            ctx.beginPath();
            ctx.moveTo(x, y - w);
            ctx.lineTo(x - h, y);
            ctx.lineTo(x, y + w);
            ctx.closePath();
            ctx.fill();
            break;
          case 2: // bottom
            x = edgePos + b * bladeSpacing;
            y = size;
            ctx.beginPath();
            ctx.moveTo(x - w, y);
            ctx.lineTo(x, y - h);
            ctx.lineTo(x + w, y);
            ctx.closePath();
            ctx.fill();
            break;
          case 3: // left
            x = 0;
            y = edgePos + b * bladeSpacing;
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
 * Draw cobblestone texture (2x2 beveled stones with grass)
 */
function drawCobblestoneDetails(ctx, size, seed, baseColor) {
  // Fill background with grass color first
  ctx.fillStyle = getTileColor('g');
  ctx.fillRect(0, 0, size, size);

  const halfSize = size / 2;
  const bevelSize = Math.max(1, Math.floor(halfSize * 0.12));
  const highlightColor = 'rgba(180, 180, 185, 0.7)';
  const shadowColor = 'rgba(90, 90, 95, 0.5)';

  const positions = [[0, 0], [halfSize, 0], [0, halfSize], [halfSize, halfSize]];
  const baseRgb = parseColorToRgb(baseColor);

  positions.forEach(([ox, oy], i) => {
    const stoneSeed = (seed + i * 37) % 1000;
    const colorVariation = (stoneSeed % 20) - 10;
    const r = Math.min(255, Math.max(0, baseRgb.r + colorVariation));
    const g = Math.min(255, Math.max(0, baseRgb.g + colorVariation));
    const b = Math.min(255, Math.max(0, baseRgb.b + colorVariation));
    const stoneColor = `rgb(${r}, ${g}, ${b})`;

    drawSingleBeveledStone(ctx, ox, oy, halfSize, halfSize, bevelSize, stoneColor, highlightColor, shadowColor);

    // Occasional crack
    if (stoneSeed % 3 === 0) {
      ctx.strokeStyle = 'rgba(60, 60, 65, 0.3)';
      ctx.lineWidth = 1;
      const crackStartX = ox + bevelSize + (stoneSeed % 30) / 100 * (halfSize - bevelSize * 2);
      const crackStartY = oy + bevelSize + ((stoneSeed * 1.3) % 30) / 100 * (halfSize - bevelSize * 2);
      const crackEndX = crackStartX + (stoneSeed % 20 - 10) / 100 * halfSize * 0.5;
      const crackEndY = crackStartY + ((stoneSeed * 0.7) % 20) / 100 * halfSize * 0.5;

      ctx.beginPath();
      ctx.moveTo(crackStartX, crackStartY);
      ctx.lineTo(crackEndX, crackEndY);
      ctx.stroke();
    }
  });
}

// ============================================
// CORNER ROUNDING
// ============================================

/**
 * Get neighbor tile type safely
 */
function getNeighbor(tileTypes, row, col, defaultType) {
  return tileTypes[row]?.[col] ?? defaultType;
}

/**
 * Draw corner rounding for a tile
 */
function drawCornerRounding(ctx, tileType, size, row, col, tileTypes) {
  if (!isOrganicTile(tileType)) return;

  const myPriority = CORNER_PRIORITY[tileType] || 0;
  const cornerRadius = Math.max(2, Math.floor(size * 0.2));

  const top = getNeighbor(tileTypes, row - 1, col, tileType);
  const bottom = getNeighbor(tileTypes, row + 1, col, tileType);
  const left = getNeighbor(tileTypes, row, col - 1, tileType);
  const right = getNeighbor(tileTypes, row, col + 1, tileType);
  const topLeft = getNeighbor(tileTypes, row - 1, col - 1, tileType);
  const topRight = getNeighbor(tileTypes, row - 1, col + 1, tileType);
  const bottomLeft = getNeighbor(tileTypes, row + 1, col - 1, tileType);
  const bottomRight = getNeighbor(tileTypes, row + 1, col + 1, tileType);

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
        ctx.moveTo(size - cornerRadius, 0);
        ctx.lineTo(size, 0);
        ctx.lineTo(size, cornerRadius);
        ctx.quadraticCurveTo(size, 0, size - cornerRadius, 0);
        ctx.closePath();
        break;
      case 'bottomLeft':
        ctx.moveTo(0, size - cornerRadius);
        ctx.lineTo(0, size);
        ctx.lineTo(cornerRadius, size);
        ctx.quadraticCurveTo(0, size, 0, size - cornerRadius);
        ctx.closePath();
        break;
      case 'bottomRight':
        ctx.moveTo(size, size - cornerRadius);
        ctx.lineTo(size, size);
        ctx.lineTo(size - cornerRadius, size);
        ctx.quadraticCurveTo(size, size, size, size - cornerRadius);
        ctx.closePath();
        break;
    }
    ctx.fill();
  };

  // Top-left corner
  if (top !== tileType && left !== tileType && top === left) {
    const neighborPriority = CORNER_PRIORITY[top] || 0;
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

// ============================================
// MAIN TEXTURE GENERATION
// ============================================

/**
 * Generate a tile texture with all details
 * @param {string} tileType - Single letter tile type
 * @param {number} row - Grid row index
 * @param {number} col - Grid column index
 * @param {Array} tileTypes - Full grid of tile types (for corner rounding)
 * @returns {Texture} PixiJS texture
 */
export function generateTileTexture(tileType, row, col, tileTypes = null) {
  const seed = getSeed(row, col);
  const variation = getVariation(row, col, 4);

  // Create cache key - include neighbor info if corner rounding is needed
  let cacheKey = `${tileType}-${variation}-${seed}`;
  if (tileTypes && isOrganicTile(tileType)) {
    // Include neighbor types in cache key for corner rounding
    const neighbors = [
      tileTypes[row - 1]?.[col] || 'g',
      tileTypes[row + 1]?.[col] || 'g',
      tileTypes[row]?.[col - 1] || 'g',
      tileTypes[row]?.[col + 1] || 'g',
      tileTypes[row - 1]?.[col - 1] || 'g',
      tileTypes[row - 1]?.[col + 1] || 'g',
      tileTypes[row + 1]?.[col - 1] || 'g',
      tileTypes[row + 1]?.[col + 1] || 'g',
    ].join('');
    cacheKey = `${tileType}-${variation}-${seed}-${neighbors}`;
  }

  // Return cached texture if available AND still valid
  if (tileTextureCache.has(cacheKey)) {
    const cachedTexture = tileTextureCache.get(cacheKey);
    // Check if texture is still valid (not destroyed by WebGL context loss)
    if (cachedTexture && cachedTexture.valid !== false && cachedTexture.baseTexture?.valid !== false) {
      return cachedTexture;
    }
    // Texture is invalid, remove from cache and regenerate
    tileTextureCache.delete(cacheKey);
  }

  // Create canvas and render texture
  const canvas = document.createElement('canvas');
  canvas.width = BASE_TEXTURE_SIZE;
  canvas.height = BASE_TEXTURE_SIZE;
  const ctx = canvas.getContext('2d');
  const size = BASE_TEXTURE_SIZE;

  const baseColor = getTileColor(tileType);

  // Special handling for pavement and cobblestone
  if (tileType === 'p') {
    drawPavementDetails(ctx, size, seed, baseColor);
  } else if (tileType === 'x') {
    drawCobblestoneDetails(ctx, size, seed, baseColor);
  } else {
    // Fill base color
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, size, size);

    // Add texture details
    switch (tileType) {
      case 'g':
        drawGrassDetails(ctx, size, seed, variation);
        break;
      case 'd':
        drawDirtDetails(ctx, size, seed, variation);
        break;
      case 'n':
        drawSandDetails(ctx, size, seed, variation);
        break;
      case 's':
        drawSlateDetails(ctx, size, seed);
        break;
      case 'o':
        drawSnowDetails(ctx, size, seed, variation);
        break;
      case 'z':
        drawMossDetails(ctx, size, seed, variation);
        break;
      // Water (w), lava (l), clay (c), dungeon (y) - just base color for now
    }

    // Draw corner rounding
    if (tileTypes) {
      drawCornerRounding(ctx, tileType, size, row, col, tileTypes);
    }
  }

  // Convert to PixiJS texture
  const texture = Texture.from(canvas);
  tileTextureCache.set(cacheKey, texture);

  return texture;
}

/**
 * Clear the texture cache, properly destroying textures to release GPU resources
 */
export function clearTileTextureCache() {
  // Destroy each cached texture to release GPU resources
  for (const texture of tileTextureCache.values()) {
    if (texture && texture.destroy) {
      try {
        texture.destroy(true); // true = destroy base texture too
      } catch (e) {
        // Texture may already be destroyed or invalid
      }
    }
  }
  tileTextureCache.clear();
}

/**
 * Get cache statistics
 */
export function getTileTextureCacheStats() {
  return {
    size: tileTextureCache.size,
    keys: Array.from(tileTextureCache.keys()),
  };
}

export { CORNER_PRIORITY, isOrganicTile };
