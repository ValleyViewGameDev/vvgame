// Emergency fix: Update all code references from resourcesV2/tilesV2 to resources/tiles
const fs = require('fs');
const path = require('path');

const filesToFix = [
  'utils/GridResourceManager.js',
  'utils/GridTileManager.js',
  'utils/createGridLogic.js', 
  'utils/resetGridLogic.js',
  'routes/gridRoutes.js'
];

const replacements = [
  // Resources field name changes
  { from: /resourcesV2/g, to: 'resources' },
  { from: /tilesV2/g, to: 'tiles' },
  // Schema version references that no longer exist
  { from: /resourcesSchemaVersion/g, to: 'resourcesSchemaVersion_REMOVED' },
  { from: /tilesSchemaVersion/g, to: 'tilesSchemaVersion_REMOVED' }
];

console.log('🚨 Emergency fix: Updating field name references...');

filesToFix.forEach(fileName => {
  const filePath = path.join(__dirname, fileName);
  
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️ File not found: ${fileName}`);
    return;
  }
  
  let content = fs.readFileSync(filePath, 'utf8');
  let changes = 0;
  
  replacements.forEach(({ from, to }) => {
    const beforeLength = content.length;
    content = content.replace(from, to);
    const afterLength = content.length;
    
    if (beforeLength !== afterLength) {
      changes++;
    }
  });
  
  if (changes > 0) {
    fs.writeFileSync(filePath, content);
    console.log(`✅ Updated ${fileName} (${changes} changes)`);
  } else {
    console.log(`➖ No changes needed in ${fileName}`);
  }
});

console.log('🎉 Emergency fix complete! Restart your server.');