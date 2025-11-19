// migrateTilesToV2.js
// One-time migration script to convert 3-bit tile encoding to 4-bit
// This allows us to add new tile types (cobblestone, dungeon, etc.)

const dotenv = require('dotenv');
dotenv.config();

const mongoose = require('mongoose');
const Grid = require('../models/grid');

// Keep the OLD 3-bit encoding mappings for decoding
const OLD_BITS_TO_TILE = {
  0b000: 'g', // grass
  0b001: 's', // slate
  0b010: 'd', // dirt
  0b011: 'w', // water
  0b100: 'p', // pavement
  0b101: 'l', // lava
  0b110: 'n', // sand
  0b111: 'o'  // snow
};

// NEW 4-bit encoding mappings
const NEW_TILE_TO_BITS = {
  'g': 0b0000, // grass
  's': 0b0001, // slate  
  'd': 0b0010, // dirt
  'w': 0b0011, // water
  'p': 0b0100, // pavement
  'l': 0b0101, // lava
  'n': 0b0110, // sand
  'o': 0b0111, // snow
  'x': 0b1000, // cobblestone 
  'y': 0b1001, // dungeon 
  'z': 0b1010  // tbd 
};

// Decode tiles using OLD 3-bit format
function decodeOld3BitTiles(encodedTiles) {
  const GRID_SIZE = 64;
  const TOTAL_TILES = GRID_SIZE * GRID_SIZE;
  const buffer = Buffer.from(encodedTiles, 'base64');
  const packedBytes = Array.from(buffer);
  
  const flatTiles = [];
  let bitBuffer = 0;
  let bitsInBuffer = 0;
  
  for (const byte of packedBytes) {
    bitBuffer = (bitBuffer << 8) | byte;
    bitsInBuffer += 8;
    
    while (bitsInBuffer >= 3 && flatTiles.length < TOTAL_TILES) {
      const tileBits = (bitBuffer >> (bitsInBuffer - 3)) & 0b111;
      const tileType = OLD_BITS_TO_TILE[tileBits];
      
      if (!tileType) {
        throw new Error(`Invalid tile bits: ${tileBits}`);
      }
      
      flatTiles.push(tileType);
      bitsInBuffer -= 3;
      bitBuffer = bitBuffer & ((1 << bitsInBuffer) - 1);
    }
  }
  
  if (flatTiles.length !== TOTAL_TILES) {
    throw new Error(`Decoded ${flatTiles.length} tiles, expected ${TOTAL_TILES}`);
  }
  
  // Convert to 2D array
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
}

// Encode tiles using NEW 4-bit format
function encodeNew4BitTiles(tiles) {
  const GRID_SIZE = 64;
  const TOTAL_TILES = GRID_SIZE * GRID_SIZE;
  
  // Flatten the 2D array
  const flatTiles = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      flatTiles.push(tiles[y][x]);
    }
  }
  
  // Pack 4-bit values into bytes
  const packedBytes = [];
  let currentByte = 0;
  let bitsInCurrentByte = 0;
  
  for (let i = 0; i < flatTiles.length; i++) {
    const tileType = flatTiles[i];
    const tileBits = NEW_TILE_TO_BITS[tileType];
    
    if (tileBits === undefined) {
      throw new Error(`Unknown tile type: ${tileType}`);
    }
    
    currentByte = (currentByte << 4) | tileBits;
    bitsInCurrentByte += 4;
    
    if (bitsInCurrentByte >= 8) {
      const extractedByte = (currentByte >> (bitsInCurrentByte - 8)) & 0xFF;
      packedBytes.push(extractedByte);
      bitsInCurrentByte -= 8;
      currentByte = currentByte & ((1 << bitsInCurrentByte) - 1);
    }
  }
  
  if (bitsInCurrentByte > 0) {
    const finalByte = currentByte << (8 - bitsInCurrentByte);
    packedBytes.push(finalByte);
  }
  
  return Buffer.from(packedBytes).toString('base64');
}

async function migrateGrids() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/vvgame';
    console.log('🔗 Connecting to MongoDB:', mongoUri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')); // Hide credentials
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');
    
    // Count total grids
    const totalGrids = await Grid.countDocuments();
    console.log(`📊 Found ${totalGrids} grids to migrate`);
    
    let migratedCount = 0;
    let skipCount = 0;
    let errorCount = 0;
    
    // Process grids in batches
    const batchSize = 100;
    for (let skip = 0; skip < totalGrids; skip += batchSize) {
      const grids = await Grid.find({})
        .skip(skip)
        .limit(batchSize)
        .select('_id tiles');
      
      for (const grid of grids) {
        try {
          if (!grid.tiles || typeof grid.tiles !== 'string') {
            console.log(`⚠️  Grid ${grid._id} has no tiles, skipping`);
            skipCount++;
            continue;
          }
          
          // Decode using old 3-bit format
          const decodedTiles = decodeOld3BitTiles(grid.tiles);
          
          // Re-encode using new 4-bit format
          const newEncodedTiles = encodeNew4BitTiles(decodedTiles);
          
          // Update the grid
          await Grid.updateOne(
            { _id: grid._id },
            { $set: { tiles: newEncodedTiles } }
          );
          
          migratedCount++;
          
          if (migratedCount % 100 === 0) {
            console.log(`📈 Progress: ${migratedCount}/${totalGrids}`);
          }
        } catch (error) {
          console.error(`❌ Error migrating grid ${grid._id}:`, error.message);
          errorCount++;
        }
      }
    }
    
    console.log('\n📊 Migration Summary:');
    console.log(`✅ Successfully migrated: ${migratedCount} grids`);
    console.log(`⚠️  Skipped (no tiles): ${skipCount} grids`);
    console.log(`❌ Errors: ${errorCount} grids`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
}

// Run migration if called directly
if (require.main === module) {
  console.log('🚀 Starting tile encoding migration (3-bit → 4-bit)...');
  migrateGrids().then(() => {
    console.log('✅ Migration complete!');
    process.exit(0);
  }).catch(error => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  });
}

module.exports = { decodeOld3BitTiles, encodeNew4BitTiles };