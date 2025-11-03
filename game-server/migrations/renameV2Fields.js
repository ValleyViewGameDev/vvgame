// One-time migration: Rename V2 fields to primary names
// Run this once after schema update to rename fields in existing documents

require('dotenv').config();
const mongoose = require('mongoose');

async function renameV2Fields() {
  try {
    console.log('🔄 Starting V2 field rename migration...');
    
    // Connect to MongoDB (if not already connected)
    if (mongoose.connection.readyState !== 1) {
      const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/valleyview';
      console.log('📡 Connecting to MongoDB...');
      await mongoose.connect(mongoUri);
    }
    
    const db = mongoose.connection.db;
    const gridsCollection = db.collection('grids');
    
    // Rename resourcesV2 to resources
    const resourceResult = await gridsCollection.updateMany(
      { resourcesV2: { $exists: true } },
      { 
        $rename: { 
          'resourcesV2': 'resources' 
        },
        $unset: {
          'resourcesSchemaVersion': ""
        }
      }
    );
    
    console.log(`✅ Renamed resourcesV2 field in ${resourceResult.modifiedCount} documents`);
    
    // Rename tilesV2 to tiles  
    const tilesResult = await gridsCollection.updateMany(
      { tilesV2: { $exists: true } },
      { 
        $rename: { 
          'tilesV2': 'tiles' 
        },
        $unset: {
          'tilesSchemaVersion': ""
        }
      }
    );
    
    console.log(`✅ Renamed tilesV2 field in ${tilesResult.modifiedCount} documents`);
    
    // Clean up any remaining schema version fields
    const cleanupResult = await gridsCollection.updateMany(
      {},
      { 
        $unset: {
          'resourcesSchemaVersion': "",
          'tilesSchemaVersion': ""
        }
      }
    );
    
    console.log(`✅ Cleaned up schema version fields in ${cleanupResult.modifiedCount} documents`);
    
    // Verify the migration
    const sampleGrid = await gridsCollection.findOne({ gridType: 'homestead' });
    console.log('📋 Sample grid after migration:', {
      _id: sampleGrid._id,
      hasResources: !!sampleGrid.resources,
      hasTiles: !!sampleGrid.tiles,
      hasOldResourcesV2: !!sampleGrid.resourcesV2,
      hasOldTilesV2: !!sampleGrid.tilesV2,
      hasResourcesSchema: !!sampleGrid.resourcesSchemaVersion,
      hasTilesSchema: !!sampleGrid.tilesSchemaVersion
    });
    
    console.log('🎉 V2 field rename migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration if called directly
if (require.main === module) {
  renameV2Fields()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = renameV2Fields;