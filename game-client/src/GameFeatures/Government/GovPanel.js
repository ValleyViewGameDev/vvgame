import API_BASE from '../../config';
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Panel from '../../UI/Panel';
import strings from '../../UI/strings.json';
import { getMayorUsername } from './GovUtils';
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import '../../UI/Modal.css';

function GovPanel({ onClose, currentPlayer, setModalContent, setIsModalOpen }) {
  const [settlementData, setSettlementData] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [taxRate, setTaxRate] = useState(0);
  const [population, setPopulation] = useState(0);
  const [taxLog, setTaxLog] = useState([]);
  const [mayor, setMayor] = useState("");
  // Community Buildings counts
  const resources = GlobalGridStateTilesAndResources.getResources() || [];
  const buildingCounts = {
      School: 0,
      Hospital: 0,
      AnimalYard: 0,
      Library: 0
  };
  resources.forEach(res => {
      if (res.type === 'School') buildingCounts.School++;
      if (res.type === 'Hospital') buildingCounts.Hospital++;
      if (res.type === 'Animal Yard') buildingCounts.AnimalYard++;
      if (res.type === 'Library') buildingCounts.Library++;
  });
  
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
        setTaxRate(settlement.taxrate || 0);
        
        const allGrids = settlement.grids?.flat() || []; 
        const occupiedHomesteads = allGrids.filter(grid => 
            grid.gridType === "homestead" && grid.available === false
        ).length || 0;
        setPopulation(occupiedHomesteads);
        
        const mayorName = await getMayorUsername(currentPlayer.settlementId);
        setMayor(mayorName);
          
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
            {[...taxlog].reverse().map((entry, i) => (
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
        <div className="panel-buttons">
          <button className="btn-success" onClick={handleShowTaxLog}>
            {strings[3020]}
          </button>
        </div>
        
        {/* Government Officials Section */}
        <h3>{strings["3006"]}</h3>
        <div>
        <p><strong>Mayor:</strong> {mayor || "Vacant"}</p>
        </div>

        <p>{strings["3009"]}</p>
        <p>{strings["3010"]}</p>
        <p>{strings["3011"]}</p>
        <p>{strings["3012"]}</p>
        <p>{strings["3013"]}</p>


        {/* COMMUNITY BUILDINGS section */}
        <h3>{strings["2090"]}</h3>
        <p>{buildingCounts.School > 0 ? `${strings["2092"]}${buildingCounts.School}` : strings["2093"]}</p>
        <p>{buildingCounts.Hospital > 0 ? `${strings["2094"]}${buildingCounts.Hospital}` : strings["2095"]}</p>
        <p>{buildingCounts.AnimalYard > 0 ? `${strings["2096"]}${buildingCounts.AnimalYard}` : strings["2097"]}</p>
        <p>{buildingCounts.Library > 0 ? `${strings["2098"]}${buildingCounts.Library}` : strings["2099"]}</p>


      </div>
    </Panel>
  );
}

export default GovPanel;