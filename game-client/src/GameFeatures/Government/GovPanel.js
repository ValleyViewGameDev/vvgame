import API_BASE from '../../config';
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Panel from '../../UI/Panel';

function GovPanel({ onClose, currentPlayer }) {
  const [settlementData, setSettlementData] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [settlementRoles, setSettlementRoles] = useState([]);
  const [playerNames, setPlayerNames] = useState({});
  const [taxRate, setTaxRate] = useState(0);
  const [population, setPopulation] = useState(0);

  useEffect(() => {
    const fetchGovernmentData = async () => {
      if (!currentPlayer || !currentPlayer.settlementId) {
        console.warn("⚠️ currentPlayer or settlementId is not available yet.");
        return;
      }
  
      try {
        console.log("🏛️ Fetching full settlement data for ID:", currentPlayer.settlementId);
        
        const settlementResponse = await axios.get(`${API_BASE}/api/get-settlement/${currentPlayer.settlementId}`);
        const settlement = settlementResponse.data;
        setSettlementData(settlement);
        setSettlementRoles(settlement.roles || []);
        setTaxRate(settlement.taxrate || 0);
        
        const allGrids = settlement.grids?.flat() || []; 
        const occupiedHomesteads = allGrids.filter(grid => 
            grid.gridType === "homestead" && grid.available === false
        ).length || 0;
        setPopulation(occupiedHomesteads);
                
        // ✅ Extract `roleName` and `playerId` pairs properly
        const roleEntries = settlement.roles.map(role => ({
          roleName: role.roleName,
          playerId: role.playerId
        }));
        console.log('✅ Extracted roleEntries:', roleEntries);
  
        // ✅ Fetch player usernames for all role holders
        const fetchPlayerPromises = roleEntries.map(async ({ roleName, playerId }) => {
          if (!playerId || playerId === "Vacant") {
            return { roleName, username: "Vacant" };
          }
  
          try {
            const playerResponse = await axios.get(`${API_BASE}/api/player/${playerId}`);
            return { roleName, username: playerResponse.data.username };
          } catch (error) {
            console.error(`❌ Error fetching player for ${roleName}:`, error);
            return { roleName, username: "Error" };
          }
        });
  
        // ✅ Wait for all player lookups to complete
        const resolvedPlayers = await Promise.all(fetchPlayerPromises);
        const playerLookup = {};
        resolvedPlayers.forEach(({ roleName, username }) => {
          playerLookup[roleName] = username;
        });
  
        setPlayerNames(playerLookup);
      } catch (error) {
        console.error("❌ Error fetching government data:", error);
      }
    };
  
    fetchGovernmentData();
  }, [currentPlayer]);

  return (
    <Panel onClose={onClose} descriptionKey="1007" titleKey="1107" panelName="GovPanel">
      <div className="panel-content">
        {errorMessage && <p className="error-message">{errorMessage}</p>}
  
        {/* ✅ Settlement Information */}
        {settlementData && (
          <>
            <p><strong>Your Settlement: </strong></p>
            <h3>{settlementData.name}</h3>
            <h3>😊 Pop. <strong>{population}</strong></h3>
            </>
        )}

        {/* ✅ Taxes Section (Placeholder) */}
        <h3>💰 Tax Rate: {taxRate}%</h3>
        <p>The tax rate is set by the Mayor, for this Settlement, and a percentage of all taxes collected are added to the Mayor's account.</p>
        <p>Mayors are elected at the Courthouse in Town.</p>


        {/* ✅ Government Officials Section */}
        <h3>🏛️ Government Officials</h3>
        <div>
          {settlementRoles.length > 0 ? (
            settlementRoles.map((role, index) => (
              <p key={index}>
                <strong>{role.roleName}:</strong> {playerNames[role.roleName] || "Vacant"}
              </p>
            ))
          ) : (
            <p>No government officials elected yet.</p>
          )}
        </div>

      <h3>🏛️ Roles & Responsibilities:</h3>
      <p>Only the Mayor can build Schools, Hospitals and Animal Yards in the Town. </p>
      <p>🏫 Schools give citizens access to certain Skills that cannot be gained elsewhere. </p>
      <p>🏥 Hospitals supply Doctors, who can heal adventurers returning from the Valley. </p>
      <p>🐾 Animal Yards supply unique livestock, which can be transported back to Homesteads by any player. </p>
      <p>🚂 The Mayor can influence demand for goods at the Train. </p>

  
      </div>
    </Panel>
  );
}

export default GovPanel;