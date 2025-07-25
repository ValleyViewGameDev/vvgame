/**
 * Calculates settlement population by counting occupied homesteads
 * This is the unified method for determining settlement population across the application
 * @param {Object} settlementData - The settlement data object containing grids
 * @returns {number} The population count based on occupied homesteads
 */
export const calculateSettlementPopulation = (settlementData) => {
  if (!settlementData || !settlementData.grids) {
    console.warn('calculateSettlementPopulation: No settlement data or grids provided');
    return 0;
  }

  const allGrids = settlementData.grids?.flat() || [];
  const occupiedHomesteads = allGrids.filter(grid => 
    grid.gridType === "homestead" && grid.available === false
  ).length || 0;
  
  return occupiedHomesteads;
};