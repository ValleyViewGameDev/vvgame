import React, { useRef, useEffect, memo } from 'react';

// Tile type bit mappings (same as server-side TileEncoder)
const BITS_TO_TILE_TYPE = {
  0b0000: 'g', // grass
  0b0001: 's', // slate
  0b0010: 'd', // dirt
  0b0011: 'w', // water
  0b0100: 'p', // pavement
  0b0101: 'l', // lava
  0b0110: 'n', // sand
  0b0111: 'o', // snow
  0b1000: 'x', // cobblestone
  0b1001: 'y', // dungeon
  0b1010: 'z'  // tbd
};

// Tile colors (same as RenderTilesCanvas)
const TILE_COLORS = {
  g: '#67c257', // grass
  s: '#8fa6bd', // stone
  d: '#c0834a', // dirt
  w: '#58cad8', // water
  l: '#c4583d', // lava
  p: '#c5a85d', // pavement
  n: '#fbde00', // sand
  o: '#ffffff', // snow
  x: '#959ba3', // cobblestone
  y: '#000000', // dungeon
  z: '#ffffff', // TBD
  unknown: '#808080', // gray fallback
};

const BITS_PER_TILE = 4;
const GRID_SIZE = 64;
const TOTAL_TILES = GRID_SIZE * GRID_SIZE; // 4096 tiles

/**
 * Decode Base64 encoded tiles to 2D array
 * @param {string} encodedTiles - Base64 encoded compressed tile data
 * @returns {Array<Array<string>>} - 64x64 2D array of tile types
 */
function decodeTiles(encodedTiles) {
  if (typeof encodedTiles !== 'string' || encodedTiles.length === 0) {
    return null;
  }

  try {
    // Decode from Base64
    const binaryString = atob(encodedTiles);
    const packedBytes = [];
    for (let i = 0; i < binaryString.length; i++) {
      packedBytes.push(binaryString.charCodeAt(i));
    }

    // Unpack bits to get tile types
    const flatTiles = [];
    let bitBuffer = 0;
    let bitsInBuffer = 0;

    for (const byte of packedBytes) {
      // Add byte to bit buffer
      bitBuffer = (bitBuffer << 8) | byte;
      bitsInBuffer += 8;

      // Extract 4-bit tile values while we have enough bits
      while (bitsInBuffer >= BITS_PER_TILE && flatTiles.length < TOTAL_TILES) {
        const tileBits = (bitBuffer >> (bitsInBuffer - BITS_PER_TILE)) & 0b1111;
        const tileType = BITS_TO_TILE_TYPE[tileBits] || 'unknown';
        flatTiles.push(tileType);
        bitsInBuffer -= BITS_PER_TILE;
        bitBuffer = bitBuffer & ((1 << bitsInBuffer) - 1);
      }
    }

    // Pad with grass if not enough tiles
    while (flatTiles.length < TOTAL_TILES) {
      flatTiles.push('g');
    }

    // Convert flat array back to 2D
    const tiles = [];
    for (let y = 0; y < GRID_SIZE; y++) {
      const row = [];
      for (let x = 0; x < GRID_SIZE; x++) {
        const index = y * GRID_SIZE + x;
        row.push(flatTiles[index]);
      }
      tiles.push(row);
    }

    return tiles;
  } catch (error) {
    console.error('Error decoding tiles:', error);
    return null;
  }
}

/**
 * RenderVisitedGrid - Renders a 64x64 tile grid as a small canvas
 * Used in SettlementView to show visited grids
 */
const RenderVisitedGrid = memo(({
  encodedTiles,
  size = 64, // Canvas size in pixels (default 64x64)
  className = '',
  style = {}
}) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !encodedTiles) return;

    const tiles = decodeTiles(encodedTiles);
    if (!tiles) return;

    const ctx = canvas.getContext('2d');
    const pixelSize = size / GRID_SIZE; // Size of each tile pixel

    // Clear canvas
    ctx.clearRect(0, 0, size, size);

    // If pixel size is less than 1, we need to scale
    if (pixelSize < 1) {
      // Create an offscreen canvas at 64x64
      const offscreen = document.createElement('canvas');
      offscreen.width = GRID_SIZE;
      offscreen.height = GRID_SIZE;
      const offCtx = offscreen.getContext('2d');

      // Render each tile as a single pixel
      for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
          const tileType = tiles[y][x];
          offCtx.fillStyle = TILE_COLORS[tileType] || TILE_COLORS.unknown;
          offCtx.fillRect(x, y, 1, 1);
        }
      }

      // Scale down to target size
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(offscreen, 0, 0, size, size);
    } else {
      // Direct rendering at target size
      for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
          const tileType = tiles[y][x];
          ctx.fillStyle = TILE_COLORS[tileType] || TILE_COLORS.unknown;
          ctx.fillRect(x * pixelSize, y * pixelSize, pixelSize, pixelSize);
        }
      }
    }
  }, [encodedTiles, size]);

  // If no encoded tiles, show placeholder
  if (!encodedTiles) {
    return (
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        className={className}
        style={{
          backgroundColor: TILE_COLORS.g,
          ...style
        }}
      />
    );
  }

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className={className}
      style={{
        imageRendering: 'pixelated',
        ...style
      }}
    />
  );
});

RenderVisitedGrid.displayName = 'RenderVisitedGrid';

export default RenderVisitedGrid;
