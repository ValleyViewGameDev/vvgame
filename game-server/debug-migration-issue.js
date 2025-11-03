// Debug script to check migration status of specific grid
require('dotenv').config();
const mongoose = require('mongoose');
const { MongoClient } = require('mongodb');

async function debugMigrationIssue() {
  try {
    console.log('🔍 Starting migration debug...');
    
    // Connect using native MongoDB driver to see raw document
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/valleyview';
    const client = new MongoClient(mongoUri);
    await client.connect();
    
    const db = client.db();
    const gridsCollection = db.collection('grids');
    
    // Find the specific grid that's failing
    const gridId = new mongoose.Types.ObjectId('68c24837fb93edccc370d5d3');
    const grid = await gridsCollection.findOne({ _id: gridId });
    
    if (!grid) {
      console.log('❌ Grid not found');
      return;
    }
    
    console.log(`🏠 Found grid: ${grid._id}`);
    console.log(`📊 Grid type: ${grid.gridType}`);
    
    // Check field existence
    console.log(`📦 Has 'resources' field: ${!!grid.resources}`);
    console.log(`📦 Has 'resourcesV2' field: ${!!grid.resourcesV2}`);
    console.log(`📦 Has 'resourcesSchemaVersion' field: ${!!grid.resourcesSchemaVersion}`);
    
    if (grid.resources) {
      console.log(`📦 Resources type: ${typeof grid.resources}`);
      console.log(`📦 Resources length: ${grid.resources.length}`);
      
      if (grid.resources.length > 0) {
        const firstResource = grid.resources[0];
        console.log(`📦 First resource type: ${typeof firstResource}`);
        console.log(`📦 First resource is array: ${Array.isArray(firstResource)}`);
        console.log(`📦 First resource: ${JSON.stringify(firstResource)}`);
        
        // Check if this looks like V1 (object) or V2 (array) format
        if (Array.isArray(firstResource)) {
          console.log('✅ This appears to be V2 encoded format');
        } else if (typeof firstResource === 'object' && firstResource.type) {
          console.log('❌ This appears to be V1 raw format - MIGRATION ISSUE!');
        }
      }
    }
    
    if (grid.resourcesV2) {
      console.log(`📦 ResourcesV2 type: ${typeof grid.resourcesV2}`);
      console.log(`📦 ResourcesV2 length: ${grid.resourcesV2.length}`);
    }
    
    await client.close();
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
  }
}

// Run debug if called directly
if (require.main === module) {
  debugMigrationIssue()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Debug failed:', error);
      process.exit(1);
    });
}

module.exports = debugMigrationIssue;