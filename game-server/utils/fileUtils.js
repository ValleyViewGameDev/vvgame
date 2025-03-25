const fs = require('fs');
const path = require('path');

function readJSON(filePath) {
  console.log(`Reading file: ${filePath}`);
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading JSON file:', error);
    return null;
  }
}

function writeJSON(filePath, data) {
  console.log(`Attempting to write to file: ${filePath}`);
  try {
    const jsonData = JSON.stringify(data, null, 2);
    // console.log('Data being written:', jsonData); // Log the exact data being written
    fs.writeFileSync(filePath, jsonData, 'utf8');
    console.log('File written successfully');
  } catch (error) {
    console.error('Error writing JSON file:', error);
  }
}

function loadFrontierLayout() {
  try {
      const filePath = path.join(__dirname, '../layouts/frontierLayout.json');
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
  } catch (error) {
      console.error('Error loading Frontier layout:', error);
      throw error;
  }
}

function loadSettlementLayout() {
  try {
      const filePath = path.join(__dirname, '../layouts/settlementLayout.json');
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
  } catch (error) {
      console.error('Error loading Settlement layout:', error);
      throw error;
  }
}

function loadHomesteadLayout() {
  try {
      const filePath = path.join(__dirname, '../layouts/homsesteadLayout.json');
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
  } catch (error) {
      console.error('Error loading Settlement layout:', error);
      throw error;
  }
}

module.exports = { loadFrontierLayout, loadSettlementLayout, loadHomesteadLayout };

module.exports = {
  readJSON,
  writeJSON,
};