import API_BASE from '../config';
import axios from 'axios';


export async function generateTownGrids ({ currentPlayer })
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




export async function generateValleyGrids({ valleyType, currentPlayer }) {
    try {
      const frontierId = currentPlayer?.location?.f;
      if (!frontierId) {
        console.error("No frontier ID found for the current player.");
        alert("No frontier ID found for the current player.");
        return;
      }
      console.log(`Fetching frontier data for ID: ${frontierId}`);
      const frontierResponse = await axios.get(`${API_BASE}/api/get-frontier/${frontierId}`);
      const frontierData = frontierResponse.data;
      if (!frontierData || !frontierData.settlements) {
        console.error("Frontier data is incomplete or missing settlements.");
        alert("Frontier data is incomplete or missing settlements.");
        return;
      }
      console.log(`Searching settlements for valley${valleyType} grids.`);
      const valleyGrids = [];
  
      // 1) For each settlement in the frontier, fetch its data
      for (const settlementRow of frontierData.settlements) {
        for (const settlement of settlementRow) {
          if (!settlement?.settlementId) {
            console.warn("Settlement is invalid or missing settlementId. Skipping.");
            continue;
          }
          try {
            console.log("Fetching settlement data for settlement ID:", settlement.settlementId);
            const settlementResponse = await axios.get(
              `${API_BASE}/api/get-settlement/${settlement.settlementId}`
            );
            const settlementData = settlementResponse.data;
  
            if (!settlementData?.grids) {
              console.warn(`Settlement ${settlement.settlementId} has no grids. Skipping.`);
              continue;
            }
            // 2) Find all uninitialized valleyX sub-grids (i.e., same valleyType, no gridId)
            settlementData.grids.flat().forEach((grid) => {
              if (grid.gridType === `valley${valleyType}` && !grid.gridId) {
                valleyGrids.push({
                  ...grid,
                  settlementId: settlement.settlementId,
                });
              }
            });
          } catch (error) {
            console.error(`Failed to fetch data for settlement ${settlement.settlementId}:`, error);
          }
        }
      }
  
      if (valleyGrids.length === 0) {
        console.log(`No valley${valleyType} grids found in this frontier.`);
        alert(`No valley${valleyType} grids found in this frontier.`);
        return;
      }
  
      console.log(`Found ${valleyGrids.length} valley${valleyType} grids. Starting generation process.`);
  
      // 3) Create each valley grid via /create-grid, sending gridCoord instead of placeholderName
      for (const valleyGrid of valleyGrids) {
        try {
          console.log(
            `Creating valley${valleyType} grid with gridCoord: ${valleyGrid.gridCoord}, Settlement ID: ${valleyGrid.settlementId}`
          );
  
          await axios.post(`${API_BASE}/api/create-grid`, {
            gridCoord: valleyGrid.gridCoord,
            gridType: valleyGrid.gridType, // 'valley0', 'valley1', 'valley2', or 'valley3'
            settlementId: valleyGrid.settlementId,
            frontierId: frontierId,
          });
  
          console.log(`Successfully created valley${valleyType} grid for gridCoord: ${valleyGrid.gridCoord}`);
        } catch (error) {
          console.error(
            `Error creating valley${valleyType} grid with gridCoord ${valleyGrid.gridCoord}:`,
            error
          );
        }
      }
  
      alert(`Valley${valleyType} grids processed successfully!`);
    } catch (error) {
      console.error(`Error processing valley${valleyType} grids:`, error);
      alert(`Failed to process valley${valleyType} grids. Check the console for details.`);
    }
  };


export async function createSingleValleyGrid({ gridCoord }) {
  try {
    console.log("🔍 Fetching all settlements to determine gridType for gridCoord:", gridCoord);
    const settlementsResponse = await axios.get(`${API_BASE}/api/settlements`);
    const settlements = settlementsResponse.data;

    if (!settlements || settlements.length === 0) {
      throw new Error("No settlements returned from the server");
    }

    let foundGrid = null;
    let foundSettlementId = null;
    let foundFrontierId = null;

    for (const settlement of settlements) {
      if (!settlement.grids) continue;

      for (const row of settlement.grids) {
        for (const grid of row) {
          console.log(`🔍 Checking gridCoord ${grid.gridCoord} (type: ${typeof grid.gridCoord}) against input ${gridCoord}`);
          if (String(grid.gridCoord) === String(gridCoord)) {
            foundGrid = grid;
            foundSettlementId = settlement._id;
            foundFrontierId = settlement.frontierId;
            break;
          }
        }
        if (foundGrid) break;
      }
      if (foundGrid) break;
    }

    if (!foundGrid) {
      console.warn(`❗ GridCoord ${gridCoord} not found in any settlement.`);
      alert("GridCoord not found in any settlement data.");
      return;
    }

    const payload = {
      gridCoord,
      gridType: foundGrid.gridType,
      settlementId: foundSettlementId,
      frontierId: foundFrontierId,
    };

    console.log("📤 Sending grid creation request with:", payload);

    const response = await axios.post(`${API_BASE}/api/create-grid`, payload);

    console.log(`✅ Grid created: ${gridCoord}`, response.data);
    alert(`Grid ${gridCoord} created successfully!`);
  } catch (error) {
    console.error(`❌ Failed to create grid ${gridCoord}:`, error);
    alert(`Failed to create grid ${gridCoord}. See console for details.`);
  }
}