const Frontier = require('../models/frontier');
const Settlement = require('../models/settlement');

// Fetch frontier ID by name
const getFrontierId = async () => {
  console.log(getFrontierId); // Should log the function definition

  try {
    const frontier = await Frontier.findOne({ name: 'Valley View 1' });
    if (!frontier) {
      throw new Error('Frontier not found');
    }
    return frontier._id;
  } catch (error) {
    console.error('Error fetching frontier ID:', error);
    throw new Error('Failed to fetch frontier ID');
  }
};

// Fetch settlement ID within a frontier
const getSettlementId = async (frontierId) => {
  try {
    // Fetch the Frontier document
    const frontier = await Frontier.findById(frontierId);
    if (!frontier) {
      throw new Error("Frontier not found");
    }
    console.log('Settlements array:', frontier.settlements);
    // Flatten the settlements array to access individual settlement objects
    const flattenedSettlements = frontier.settlements.flatMap((row) =>
      Object.values(row).filter((entry) => typeof entry === 'object')
    );

    console.log('Flattened settlements array:', flattenedSettlements);

    // Find the first settlement with descriptor = "available"
    const availableSettlement = frontier.settlements.flat().find(
      (settlement) => settlement.available === true
    );  

    if (!availableSettlement) {
      console.error('No available settlements found. Flattened array:', flattenedSettlements);
      throw new Error('No available settlements in this frontier');
    }

    console.log('Available settlement found:', availableSettlement);
    return availableSettlement.settlementId
  } catch (error) {
    console.error('Error in getSettlementId:', error);
    throw new Error('Failed to fetch settlement ID');
  }
};


// Fetch homestead ID within a settlement
const getgridId = async (settlementId) => {
  try {
    const settlement = await Settlement.findById(settlementId);
    if (!settlement) {
      throw new Error('Settlement not found');
    }

    const availableGrid = settlement.grids.flat().find(
      (grid) => grid.available === true
    );  

    if (!availableGrid) {
      throw new Error('No available grids in this settlement');
    }

    return availableGrid.gridId;
  } catch (error) {
    console.error('Error fetching grid ID:', error);
    throw new Error('Failed to fetch grid ID');
  }
};

// Export the functions
module.exports = {
  getFrontierId,
  getSettlementId,
  getgridId,
};
