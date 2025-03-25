const path = require('path');
const { readJSON, writeJSON } = require('./game-server/utils/fileUtils');

// Adjust the path to point to the resources.json file relative to this script
const testData = readJSON(path.join(__dirname, 'game-server', 'resources.json'));

//console.log('Test Data:', testData);
