// gridsVisitedUtils.js (Client-side)
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
export function gridCoordToBitIndex(gridCoord) {
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
export function bitIndexToGridCoordPart(bitIndex) {
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
 * Convert gridsVisited data from server to Uint8Array
 * @param {Object|Array|string} gridsVisited - Data from player.gridsVisited
 * @returns {Uint8Array} - Usable byte array
 */
function toByteArray(gridsVisited) {
  if (!gridsVisited) {
    return new Uint8Array(512);
  }

  // If it's already a Uint8Array
  if (gridsVisited instanceof Uint8Array) {
    return gridsVisited;
  }

  // If it's a regular array
  if (Array.isArray(gridsVisited)) {
    return new Uint8Array(gridsVisited);
  }

  // If it's a MongoDB Buffer object with data property
  if (gridsVisited.type === 'Buffer' && Array.isArray(gridsVisited.data)) {
    return new Uint8Array(gridsVisited.data);
  }

  // If it's a base64 string
  if (typeof gridsVisited === 'string') {
    const binaryString = atob(gridsVisited);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  return new Uint8Array(512);
}

/**
 * Check if a grid has been visited
 * @param {Object|Array|Uint8Array} gridsVisited - The gridsVisited data from player
 * @param {number} gridCoord - The full gridCoord value (e.g., 1011100)
 * @returns {boolean} - True if the grid has been visited
 */
export function isGridVisited(gridsVisited, gridCoord) {
  if (!gridsVisited) {
    return false;
  }

  // Convert gridCoord to bit index
  const bitIndex = gridCoordToBitIndex(gridCoord);
  if (bitIndex < 0) {
    return false;
  }

  const buffer = toByteArray(gridsVisited);
  const byteIndex = Math.floor(bitIndex / 8);
  const bitPosition = bitIndex % 8;

  if (byteIndex >= buffer.length) {
    return false;
  }

  return (buffer[byteIndex] & (1 << bitPosition)) !== 0;
}

/**
 * Mark a grid as visited (returns new array, does not mutate)
 * @param {Object|Array|Uint8Array} gridsVisited - The gridsVisited data from player
 * @param {number} gridCoord - The full gridCoord value (e.g., 1011100)
 * @returns {Uint8Array} - New array with the grid marked as visited
 */
export function markGridVisited(gridsVisited, gridCoord) {
  // Convert gridCoord to bit index
  const bitIndex = gridCoordToBitIndex(gridCoord);
  if (bitIndex < 0) {
    return toByteArray(gridsVisited);
  }

  const buffer = toByteArray(gridsVisited);

  // Create a copy to avoid mutation
  const newBuffer = new Uint8Array(Math.max(512, buffer.length));
  newBuffer.set(buffer);

  const byteIndex = Math.floor(bitIndex / 8);
  const bitPosition = bitIndex % 8;

  newBuffer[byteIndex] |= (1 << bitPosition);

  return newBuffer;
}

/**
 * Get all visited grid coordinates
 * @param {Object|Array|Uint8Array} gridsVisited - The gridsVisited data from player
 * @returns {number[]} - Array of visited gridCoords (SSGG format)
 */
export function getVisitedGridCoords(gridsVisited) {
  if (!gridsVisited) {
    return [];
  }

  const buffer = toByteArray(gridsVisited);
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
 * @param {Object|Array|Uint8Array} gridsVisited - The gridsVisited data from player
 * @returns {number} - Count of visited grids
 */
export function countVisitedGrids(gridsVisited) {
  if (!gridsVisited) {
    return 0;
  }

  const buffer = toByteArray(gridsVisited);
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

/**
 * Convert a Uint8Array to the format expected by the server
 * @param {Uint8Array} buffer - The byte array
 * @returns {Array} - Array of numbers for JSON serialization
 */
export function toServerFormat(buffer) {
  return Array.from(buffer);
}
