import API_BASE from '../config';
import axios from 'axios';


export async function generateTownGrid ({ currentPlayer })
    {
    try {
      const settlementId = currentPlayer.location.s;
      if (!settlementId) {
        console.error('No settlement ID found for the current player.');
        alert('No settlement ID found for the current player.');
        return;
      }
  
      // Fetch the settlement data
      const response = await axios.get(
        `${API_BASE}/api/get-settlement/${settlementId}`
      );
  
      const settlement = response.data;
      if (!settlement || !settlement.grids || settlement.grids.length === 0) {
        console.error('Settlement data is incomplete or missing grids.');
        alert('Settlement data is incomplete or missing grids.');
        return;
      }
  
      // Find all uninitialized town grids by looking for gridType === 'town' but no gridId
      const townGrids = [];
      settlement.grids.forEach((row) => {
        row.forEach((grid) => {
          if (grid.gridType === 'town' && !grid.gridId) {
            // Instead of placeholderName, push the gridCoord
            townGrids.push(grid.gridCoord);
          }
        });
      });
  
      if (townGrids.length === 0) {
        console.log('No uninitialized town grids found in this settlement.');
        alert('No uninitialized town grids found in this settlement.');
        return;
      }
  
      console.log(`Found ${townGrids.length} uninitialized town grids. Processing grids...`);
  
      // Generate/create each town grid by passing gridCoord
      for (const gridCoord of townGrids) {
        try {
          console.log(`Creating Town grid with gridCoord: ${gridCoord}`);
  
          const result = await axios.post(`${API_BASE}/api/create-grid`, {
            gridCoord,             // instead of placeholderName
            gridType: 'town',
            settlementId,
            frontierId: settlement.frontierId,
          });
  
          console.log(`Processed town grid for gridCoord: ${gridCoord}`, result.data);
  
        } catch (gridError) {
          console.error(`Failed to process grid for gridCoord: ${gridCoord}`, gridError);
        }
      }
  
      alert('Town grids created successfully!');
    } catch (error) {
      console.error('Error processing town grids:', error);
      alert('Failed to create town grids. Check the console for details.');
    }
  };