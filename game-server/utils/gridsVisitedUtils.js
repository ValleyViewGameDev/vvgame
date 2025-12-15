// gridsVisitedUtils.js
// Bit manipulation utilities for tracking visited grids
// Uses a 512-byte buffer to store 4096 bits (64 settlements × 64 grids = 4096)

/**
 * Convert a gridCoord to a 0-4095 bit index
 * gridCoord format: TFFSSGG where:
 *   T = Frontier tier (ignored for bit storage)
 *   FF = Frontier index (ignored for bit storage)
 *   SS = Settlement row (0-7) & col (0-7) within frontier's 8x8 grid
 *   GG = Grid row (0-7) & col (0-7) within settlement's 8x8 grid
 *
 * @param {number} gridCoord - The full gridCoord value (e.g., 1011100)
 * @returns {number} - Bit index 0-4095, or -1 if invalid
 */
function gridCoordToBitIndex(gridCoord) {
  if (typeof gridCoord !== 'number' || gridCoord < 0) {
    return -1;
  }

  // Extract the last 4 digits (SSGG)
  const relevantPart = gridCoord % 10000;

  // Extract settlement and grid positions (each digit is 0-7)
  const settlementRow = Math.floor(relevantPart / 1000) % 10;
  const settlementCol = Math.floor(relevantPart / 100) % 10;
  const gridRow = Math.floor(relevantPart / 10) % 10;
  const gridCol = relevantPart % 10;

  // Validate ranges (each should be 0-7)
  if (settlementRow > 7 || settlementCol > 7 || gridRow > 7 || gridCol > 7) {
    return -1;
  }

  // Calculate bit index: settlement position (0-63) * 64 + grid position (0-63)
  const settlementIndex = settlementRow * 8 + settlementCol;  // 0-63
  const gridIndex = gridRow * 8 + gridCol;                     // 0-63
  const bitIndex = settlementIndex * 64 + gridIndex;           // 0-4095

  return bitIndex;
}

/**
 * Convert a bit index (0-4095) back to the SSGG portion of a gridCoord
 * @param {number} bitIndex - Bit index 0-4095
 * @returns {number} - The SSGG portion (e.g., 1100 for settlement 1,1 grid 0,0)
 */
function bitIndexToGridCoordPart(bitIndex) {
  if (bitIndex < 0 || bitIndex > 4095) {
    return -1;
  }

  const settlementIndex = Math.floor(bitIndex / 64);  // 0-63
  const gridIndex = bitIndex % 64;                     // 0-63

  const settlementRow = Math.floor(settlementIndex / 8);  // 0-7
  const settlementCol = settlementIndex % 8;               // 0-7
  const gridRow = Math.floor(gridIndex / 8);               // 0-7
  const gridCol = gridIndex % 8;                           // 0-7

  return settlementRow * 1000 + settlementCol * 100 + gridRow * 10 + gridCol;
}

/**
 * Check if a grid has been visited
 * @param {Buffer|Array} gridsVisited - The buffer or array from player.gridsVisited
 * @param {number} gridCoord - The full gridCoord value (e.g., 1011100)
 * @returns {boolean} - True if the grid has been visited
 */
function isGridVisited(gridsVisited, gridCoord) {
  if (!gridsVisited) {
    return false;
  }

  // Convert gridCoord to bit index
  const bitIndex = gridCoordToBitIndex(gridCoord);
  if (bitIndex < 0) {
    return false;
  }

  // Convert to Buffer if it's an array (MongoDB may return array)
  const buffer = Buffer.isBuffer(gridsVisited)
    ? gridsVisited
    : Buffer.from(gridsVisited);

  const byteIndex = Math.floor(bitIndex / 8);
  const bitPosition = bitIndex % 8;

  if (byteIndex >= buffer.length) {
    return false;
  }

  return (buffer[byteIndex] & (1 << bitPosition)) !== 0;
}

/**
 * Mark a grid as visited (mutates the buffer)
 * @param {Buffer} gridsVisited - The buffer from player.gridsVisited
 * @param {number} gridCoord - The full gridCoord value (e.g., 1011100)
 * @returns {Buffer} - The modified buffer
 */
function markGridVisited(gridsVisited, gridCoord) {
  // Convert gridCoord to bit index
  const bitIndex = gridCoordToBitIndex(gridCoord);
  if (bitIndex < 0) {
    return gridsVisited;
  }

  // Ensure we have a Buffer
  let buffer = gridsVisited;
  if (!Buffer.isBuffer(buffer)) {
    buffer = buffer ? Buffer.from(buffer) : Buffer.alloc(512);
  }

  // Ensure buffer is the right size
  if (buffer.length < 512) {
    const newBuffer = Buffer.alloc(512);
    buffer.copy(newBuffer);
    buffer = newBuffer;
  }

  const byteIndex = Math.floor(bitIndex / 8);
  const bitPosition = bitIndex % 8;

  buffer[byteIndex] |= (1 << bitPosition);

  return buffer;
}

/**
 * Get all visited grid coordinates from the buffer
 * @param {Buffer|Array} gridsVisited - The buffer or array from player.gridsVisited
 * @returns {number[]} - Array of visited gridCoords
 */
function getVisitedGridCoords(gridsVisited) {
  if (!gridsVisited) {
    return [];
  }

  // Convert to Buffer if it's an array
  const buffer = Buffer.isBuffer(gridsVisited)
    ? gridsVisited
    : Buffer.from(gridsVisited);

  const visited = [];

  for (let byteIndex = 0; byteIndex < buffer.length && byteIndex < 512; byteIndex++) {
    const byte = buffer[byteIndex];
    if (byte === 0) continue; // Skip empty bytes for efficiency

    for (let bitPos = 0; bitPos < 8; bitPos++) {
      if (byte & (1 << bitPos)) {
        const bitIndex = byteIndex * 8 + bitPos;
        if (bitIndex <= 4095) {
          // Convert bit index back to SSGG gridCoord format
          const gridCoordPart = bitIndexToGridCoordPart(bitIndex);
          if (gridCoordPart >= 0) {
            visited.push(gridCoordPart);
          }
        }
      }
    }
  }

  return visited;
}

/**
 * Count how many grids have been visited
 * @param {Buffer|Array} gridsVisited - The buffer or array from player.gridsVisited
 * @returns {number} - Count of visited grids
 */
function countVisitedGrids(gridsVisited) {
  if (!gridsVisited) {
    return 0;
  }

  // Convert to Buffer if it's an array
  const buffer = Buffer.isBuffer(gridsVisited)
    ? gridsVisited
    : Buffer.from(gridsVisited);

  let count = 0;

  for (let byteIndex = 0; byteIndex < buffer.length && byteIndex < 512; byteIndex++) {
    let byte = buffer[byteIndex];
    // Count set bits using Brian Kernighan's algorithm
    while (byte) {
      byte &= (byte - 1);
      count++;
    }
  }

  return count;
}

module.exports = {
  gridCoordToBitIndex,
  bitIndexToGridCoordPart,
  isGridVisited,
  markGridVisited,
  getVisitedGridCoords,
  countVisitedGrids
};
