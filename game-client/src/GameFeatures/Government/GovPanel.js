import API_BASE from '../../config';
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Panel from '../../UI/Panel';
import strings from '../../UI/strings.json';

function GovPanel({ onClose, currentPlayer, setModalContent, setIsModalOpen }) {
  const [settlementData, setSettlementData] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [settlementRoles, setSettlementRoles] = useState([]);
  const [playerNames, setPlayerNames] = useState({});
  const [taxRate, setTaxRate] = useState(0);
  const [population, setPopulation] = useState(0);
  const [taxLog, setTaxLog] = useState([]);

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
        setTaxLog(settlement.taxlog || []);
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

  const handleShowTaxLog = async () => {
    if (!currentPlayer?.settlementId) {
      console.warn("⚠️ Cannot show tax log: settlementId missing.");
      return;
    }

    console.log("📤 Requesting tax log for settlement ID:", currentPlayer.settlementId);

    try {
      const response = await axios.get(`${API_BASE}/api/settlement/${currentPlayer.settlementId}/taxlog`);
      console.log("📥 Tax log response:", response.data);
      const taxlog = response.data.taxlog || [];

      console.log("📊 Parsed taxlog:", taxlog);

      const taxLogTable = (
        <table className="tax-log-table" style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ padding: "6px 12px" }}>{strings["5102"]}</th>
              <th style={{ padding: "6px 12px" }}>{strings["5103"]}</th>
              <th style={{ padding: "6px 12px" }}>{strings["5104"]}</th>
              <th style={{ padding: "6px 12px" }}>{strings["5105"]}</th>
            </tr>
          </thead>
          <tbody>
            {taxlog.map((entry, i) => (
              <tr key={i}>
                <td style={{ padding: "6px 12px" }}>{new Date(entry.date).toLocaleDateString()}</td>
                <td style={{ padding: "6px 12px" }}>{entry.totalcollected}</td>
                <td style={{ padding: "6px 12px" }}>{entry.currentmayor}</td>
                <td style={{ padding: "6px 12px" }}>{entry.mayortake}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );

      console.log("📦 taxlog.length =", taxlog.length);
      console.log("📦 typeof taxLogTable =", typeof taxLogTable);
      console.log("📦 taxLogTable =", taxLogTable);

      setModalContent({
        title: strings["5100"],
        size: "large",
        message: taxlog.length === 0
          ? strings["5101"]
          : undefined,
        custom: taxLogTable,
      });
      setIsModalOpen(true);
    } catch (error) {
      console.error("❌ Failed to fetch tax log:", error);
      setModalContent({
        title: "Error",
        message: "Failed to load tax log.",
        size: "small",
      });
      setIsModalOpen(true);
    }
  };

  return (
    <Panel onClose={onClose} descriptionKey="1007" titleKey="1107" panelName="GovPanel">
      <div className="panel-content">
        {errorMessage && <p className="error-message">{errorMessage}</p>}
  
        {/* Settlement Information */}
        {settlementData && (
          <>
            <h3><strong>{strings["3001"]}</strong></h3>  
            <h3><strong>{settlementData.displayName || settlementData.name || 'Unnamed Settlement'}</strong></h3>
            <h3>{strings["3002"]} <strong>{population}</strong></h3>
          </>
        )}

        {/* Taxes Section */}
        <h3>{strings["3003"]} {taxRate}%</h3>
        <p>{strings["3004"]}</p>
        <p>{strings["3005"]}</p>
        <button onClick={handleShowTaxLog}>View Tax Log</button>

        {/* Government Officials Section */}
        <h3>{strings["3006"]}</h3>
        <div>
          {settlementRoles.length > 0 ? (
            settlementRoles.map((role, index) => (
              <p key={index}>
                <strong>{role.roleName}:</strong> {playerNames[role.roleName] || "Vacant"}
              </p>
            ))
          ) : (
            <p>{strings["3007"]}</p>
          )}
        </div>

        <h3>{strings["3008"]}</h3>
        <p>{strings["3009"]}</p>
        <p>{strings["3010"]}</p>
        <p>{strings["3011"]}</p>
        <p>{strings["3012"]}</p>
        <p>{strings["3013"]}</p>
      </div>
    </Panel>
  );
}

export default GovPanel;