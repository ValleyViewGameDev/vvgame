// Debug script to test doober collection issue
require('dotenv').config();
const mongoose = require('mongoose');
const Grid = require('./models/grid');
const gridResourceManager = require('./utils/GridResourceManager');

async function debugDooberCollection() {
  try {
    console.log('🔍 Starting doober collection debug...');
    
    // Connect to MongoDB
    if (mongoose.connection.readyState !== 1) {
      const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/valleyview';
      console.log('📡 Connecting to MongoDB...');
      await mongoose.connect(mongoUri);
    }
    
    // Initialize GridResourceManager
    await gridResourceManager.initialize();
    
    // Find a homestead grid
    const grid = await Grid.findOne({ gridType: 'homestead' });
    if (!grid) {
      console.log('❌ No homestead grid found');
      return;
    }
    
    console.log(`🏠 Found homestead: ${grid._id}`);
    
    // Get current resources
    const currentResources = gridResourceManager.getResources(grid);
    console.log(`📦 Current resources count: ${currentResources.length}`);
    
    if (currentResources.length > 0) {
      const testResource = currentResources[0];
      console.log(`🎯 Testing with resource: ${JSON.stringify(testResource)}`);
      
      console.log('🔄 Before removal:');
      console.log(`  - Resources count: ${currentResources.length}`);
      console.log(`  - Resource at (${testResource.x}, ${testResource.y}): ${testResource.type}`);
      
      // Test removing the resource
      console.log('🗑️ Removing resource...');
      gridResourceManager.updateResource(grid, { type: null, x: testResource.x, y: testResource.y });
      
      // Check resources after removal
      const afterResources = gridResourceManager.getResources(grid);
      console.log('🔄 After removal:');
      console.log(`  - Resources count: ${afterResources.length}`);
      
      const foundAfter = afterResources.find(r => r.x === testResource.x && r.y === testResource.y);
      console.log(`  - Resource at (${testResource.x}, ${testResource.y}): ${foundAfter ? foundAfter.type : 'NOT FOUND'}`);
      
      // Save to database
      console.log('💾 Saving to database...');
      await grid.save();
      console.log('✅ Saved successfully');
      
      // Re-fetch from database to verify persistence
      console.log('🔍 Re-fetching from database...');
      const refetchedGrid = await Grid.findById(grid._id);
      const refetchedResources = gridResourceManager.getResources(refetchedGrid);
      console.log('🔄 After database round-trip:');
      console.log(`  - Resources count: ${refetchedResources.length}`);
      
      const foundRefetched = refetchedResources.find(r => r.x === testResource.x && r.y === testResource.y);
      console.log(`  - Resource at (${testResource.x}, ${testResource.y}): ${foundRefetched ? foundRefetched.type : 'NOT FOUND'}`);
      
      if (foundRefetched) {
        console.log('❌ PROBLEM: Resource was not actually removed from database!');
      } else {
        console.log('✅ SUCCESS: Resource was properly removed from database');
      }
      
    } else {
      console.log('⚠️ No resources found to test with');
    }
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
  } finally {
    await mongoose.disconnect();
  }
}

// Run debug if called directly
if (require.main === module) {
  debugDooberCollection()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Debug failed:', error);
      process.exit(1);
    });
}

module.exports = debugDooberCollection;