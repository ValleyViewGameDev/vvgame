import API_BASE from '../../config';
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Panel from '../../UI/Panels/Panel';
import { formatCountdown } from '../../UI/Timers';
import '../../UI/Modals/Modal.css';
import '../../UI/Buttons/SharedButtons.css';
import { useStrings } from '../../UI/StringsContext';
import { usePanelContext } from '../../UI/Panels/PanelContext';

function SeasonPanel({ onClose, currentPlayer, setModalContent, setIsModalOpen }) {
  const strings = useStrings();
  const { openPanel } = usePanelContext();
  const [countdown, setCountdown] = useState("");


  // ✅ Fetch season data from local storage
  const getSeasonData = () => {
    const storedTimers = JSON.parse(localStorage.getItem("timers"));
    return storedTimers?.seasons || { type: "Unknown", phase: "Unknown", endTime: null };
  };

  // ✅ Compute real-time countdown from local timer state
  useEffect(() => {
    const updateCountdown = () => {
      const seasonData = getSeasonData();
      const now = new Date();
      const end = new Date(seasonData?.endTime);
      setCountdown(formatCountdown(end, now));
    };
  
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, []);


    // ✅ Get current season data from local storage
  const seasonData = getSeasonData();


  // Function to show season rules in modal
  const handleShowSeasonRules = () => {
    const rulesContent = (
      <div style={{ textAlign: 'left', paddingLeft: '20px', paddingRight: '20px' }}>
        {/* docs/season-reset.md: what a season change keeps and what begins again */}
        <p>{strings[15001]}</p>
        <h3 style={{ marginTop: '20px', marginBottom: '10px' }}>{strings[15002]}</h3>
        <ul style={{ paddingLeft: '40px' }}>
          <li>{strings[15003]}</li>
          <li>{strings[15004]}</li>
          <li>{strings[15005]}</li>
          <li>{strings[15006]}</li>
        </ul>
        <h3 style={{ marginTop: '20px', marginBottom: '10px' }}>{strings[15007]}</h3>
        <ul style={{ paddingLeft: '40px' }}>
          <li>{strings[15008]}</li>
          <li>{strings[15009]}</li>
          <li>{strings[15010]}</li>
          <li>{strings[15011]}</li>
        </ul>
        <p style={{ marginTop: '20px' }}>{strings[15013]}</p>
      </div>
    );

    setModalContent({
      title: strings[15000],
      size: "large",
      custom: rulesContent,
    });
    setIsModalOpen(true);
  };

  // New: Function to fetch and open season log
  const handleShowSeasonLog = async () => {
    if (!currentPlayer?.frontierId) { 
      console.warn("⚠️ Cannot show season log: frontierId missing.");
      return;
    }

    console.log("📜 Fetching season log for frontier:", currentPlayer.frontierId);

    try {
      const response = await axios.get(`${API_BASE}/api/frontier/${currentPlayer.frontierId}/seasonlog`);
      const seasonlog = response.data.seasonlog || [];

      const seasonLogTable = (
        <table className="season-log-table" style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ padding: "6px 12px" }}>Season</th>
              <th style={{ padding: "6px 12px" }}>Date</th>
              <th style={{ padding: "6px 12px" }}>Grids Reset</th>
              <th style={{ padding: "6px 12px" }}>Players Relocated</th>
            </tr>
          </thead>
          <tbody>
            {[...seasonlog].reverse().map((entry, i) => (
              <tr key={i}>
                <td style={{ padding: "6px 12px" }}>#{entry.seasonnumber} {entry.seasontype}</td>
                <td style={{ padding: "6px 12px" }}>{new Date(entry.date).toLocaleDateString()}</td>
                <td style={{ padding: "6px 12px" }}>{entry.gridsreset}</td>
                <td style={{ padding: "6px 12px" }}>{entry.playersrelocated}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );

      setModalContent({
        title: "Season Log",
        size: "large",
        message: seasonlog.length === 0 ? "No season history found." : undefined,
        custom: seasonLogTable,
      });
      setIsModalOpen(true);
    } catch (error) {
      console.error("❌ Failed to fetch season log:", error);
      setModalContent({
        title: "Error",
        message: "Failed to load season log.",
        size: "small",
      });
      setIsModalOpen(true);
    }
  };


  return (
    <Panel onClose={onClose} descriptionKey="1015" titleKey="1115" panelName="SeasonPanel">
      {seasonData?.phase === "onSeason" ? (
        <>
          <h3>{strings[3053]} {seasonData?.type || strings[3054]}</h3>
          <h3>{strings[3055]}</h3>
          <h2 className="countdown-timer">{countdown}</h2>
        </>
      ) : (
        <>
          <h3>{strings[3056]}</h3>
        </>
      )}

      <div className="shared-buttons">
        <button className="btn-basic btn-success"
          onClick={handleShowSeasonRules}
        >
          {strings[15000]}
        </button>
      </div>


      <div className="shared-buttons">
        <button className="btn-basic btn-success"
          onClick={() => openPanel && openPanel('LeaderboardPanel')}
        >
          {strings[1140]}
        </button>
      </div>

<br></br>
<br></br>

      <div className="shared-buttons">
        <button className="btn-basic btn-success"
          onClick={handleShowSeasonLog}
        >
          {strings[3064]}
        </button>
      </div>
    </Panel>
  );
}

export default SeasonPanel;