// Debug script to examine corrupted resources
require('dotenv').config();
const mongoose = require('mongoose');
const Grid = require('./models/grid');

async function debugCorruptedResources() {
  try {
    console.log('🔍 Starting corrupted resources debug...');
    
    // Connect to MongoDB
    if (mongoose.connection.readyState !== 1) {
      const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/valleyview';
      console.log('📡 Connecting to MongoDB...');
      await mongoose.connect(mongoUri);
    }
    
    // Find the specific grid that's failing
    const grid = await Grid.findById('68c24837fb93edccc370d5d3');
    if (!grid) {
      console.log('❌ Grid not found');
      return;
    }
    
    console.log(`🏠 Found grid: ${grid._id}`);
    console.log(`📦 Resources field type: ${typeof grid.resources}`);
    console.log(`📦 Resources is array: ${Array.isArray(grid.resources)}`);
    console.log(`📦 Resources length: ${grid.resources ? grid.resources.length : 'N/A'}`);
    
    if (grid.resources) {
      console.log('🔍 First few resources:');
      for (let i = 0; i < Math.min(10, grid.resources.length); i++) {
        const resource = grid.resources[i];
        console.log(`  [${i}]: type=${typeof resource}, isArray=${Array.isArray(resource)}, value=${JSON.stringify(resource).substring(0, 100)}...`);
      }
      
      // Look for problematic resources
      let corruptedCount = 0;
      for (let i = 0; i < grid.resources.length; i++) {
        const resource = grid.resources[i];
        if (!Array.isArray(resource) && !(resource && typeof resource === 'object' && resource.layoutKey === 'UNKNOWN')) {
          corruptedCount++;
          if (corruptedCount <= 5) {
            console.log(`❌ Corrupted resource at index ${i}: ${JSON.stringify(resource)}`);
          }
        }
      }
      console.log(`❌ Total corrupted resources: ${corruptedCount}`);
    }
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
  } finally {
    await mongoose.disconnect();
  }
}

// Run debug if called directly
if (require.main === module) {
  debugCorruptedResources()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Debug failed:', error);
      process.exit(1);
    });
}

module.exports = debugCorruptedResources;