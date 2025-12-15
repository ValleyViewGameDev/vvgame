// gridsVisitedUtils.js
// Bit manipulation utilities for tracking visited grids
// Uses a 512-byte buffer to store 4096 bits (one per gridCoord 0-4095)

/**
 * Check if a grid has been visited
 * @param {Buffer|Array} gridsVisited - The buffer or array from player.gridsVisited
 * @param {number} gridCoord - The grid coordinate (0-4095)
 * @returns {boolean} - True if the grid has been visited
 */
function isGridVisited(gridsVisited, gridCoord) {
  if (!gridsVisited || gridCoord < 0 || gridCoord > 4095) {
    return false;
  }

  // Convert to Buffer if it's an array (MongoDB may return array)
  const buffer = Buffer.isBuffer(gridsVisited)
    ? gridsVisited
    : Buffer.from(gridsVisited);

  const byteIndex = Math.floor(gridCoord / 8);
  const bitIndex = gridCoord % 8;

  if (byteIndex >= buffer.length) {
    return false;
  }

  return (buffer[byteIndex] & (1 << bitIndex)) !== 0;
}

/**
 * Mark a grid as visited (mutates the buffer)
 * @param {Buffer} gridsVisited - The buffer from player.gridsVisited
 * @param {number} gridCoord - The grid coordinate (0-4095)
 * @returns {Buffer} - The modified buffer
 */
function markGridVisited(gridsVisited, gridCoord) {
  if (gridCoord < 0 || gridCoord > 4095) {
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

  const byteIndex = Math.floor(gridCoord / 8);
  const bitIndex = gridCoord % 8;

  buffer[byteIndex] |= (1 << bitIndex);

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

    for (let bitIndex = 0; bitIndex < 8; bitIndex++) {
      if (byte & (1 << bitIndex)) {
        const gridCoord = byteIndex * 8 + bitIndex;
        if (gridCoord <= 4095) {
          visited.push(gridCoord);
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
  isGridVisited,
  markGridVisited,
  getVisitedGridCoords,
  countVisitedGrids
};
