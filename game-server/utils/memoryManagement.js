// Memory management utilities

function logMemoryUsage(label = '') {
  const used = process.memoryUsage();
  const mb = (bytes) => Math.round(bytes / 1024 / 1024 * 100) / 100;
  
  console.log(`📊 Memory Usage ${label}:`);
  console.log(`   RSS: ${mb(used.rss)} MB (Total memory allocated)`);
  console.log(`   Heap Total: ${mb(used.heapTotal)} MB`);
  console.log(`   Heap Used: ${mb(used.heapUsed)} MB`);
  console.log(`   External: ${mb(used.external)} MB`);
}

function setupMemoryMonitoring() {
  // Log memory usage every 5 minutes
  setInterval(() => {
    logMemoryUsage('Periodic Check');
    
    // Force garbage collection if available (requires --expose-gc flag)
    if (global.gc) {
      console.log('🗑️ Running garbage collection...');
      global.gc();
      setTimeout(() => logMemoryUsage('After GC'), 1000);
    }
  }, 5 * 60 * 1000); // 5 minutes

  // Log on startup
  logMemoryUsage('Startup');
}

// Clean up old entries from Maps/Sets
function cleanupMemoryMaps(io) {
  if (!io) return;
  
  const gridControllers = io.gridControllers;
  const connectedPlayersByGrid = io.connectedPlayersByGrid;
  
  if (connectedPlayersByGrid) {
    // Remove empty Sets from the Map
    for (const [gridId, playerSet] of connectedPlayersByGrid.entries()) {
      if (playerSet.size === 0) {
        connectedPlayersByGrid.delete(gridId);
      }
    }
  }
  
  console.log(`🧹 Memory cleanup: ${connectedPlayersByGrid?.size || 0} grids with players`);
}

// Monitor for memory warnings
function setupMemoryWarnings() {
  const heapUsedThreshold = 0.8; // Warn at 80% heap usage
  
  setInterval(() => {
    const used = process.memoryUsage();
    const heapUsedPercent = used.heapUsed / used.heapTotal;
    
    if (heapUsedPercent > heapUsedThreshold) {
      console.error(`⚠️ HIGH MEMORY USAGE: Heap is ${Math.round(heapUsedPercent * 100)}% full!`);
      logMemoryUsage('WARNING');
    }
  }, 30 * 1000); // Check every 30 seconds
}

module.exports = {
  logMemoryUsage,
  setupMemoryMonitoring,
  cleanupMemoryMaps,
  setupMemoryWarnings
};