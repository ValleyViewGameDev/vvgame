import React, { useState } from 'react';
import axios from 'axios';
import API_BASE from '../config';
import Modal from './Modal';

const ShowLogs = ({ selectedSettlement }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [taxLogContent, setTaxLogContent] = useState(null);

  const handleShowTaxLog = async () => {
    if (!selectedSettlement) {
      console.warn("⚠️ No settlement selected.");
      return;
    }

    console.log("🧾 Show Log clicked for taxes");
    console.log("📤 Fetching tax log for settlement:", selectedSettlement);

    try {
      const response = await axios.get(`${API_BASE}/api/settlement/${selectedSettlement}/taxlog`);
      console.log("📥 Tax log API response:", response.data);

      const taxlog = response.data.taxlog || [];

      const taxLogTable = (
        <table className="tax-log-table" style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ padding: "6px 12px" }}>Date</th>
              <th style={{ padding: "6px 12px" }}>Total Collected</th>
              <th style={{ padding: "6px 12px" }}>Current Mayor</th>
              <th style={{ padding: "6px 12px" }}>Mayor Take</th>
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

      setTaxLogContent(taxLogTable);
      setIsModalOpen(true);
      console.log("✅ Modal opened with tax log content.");
    } catch (error) {
      console.error("❌ Failed to fetch tax log:", error);
      setTaxLogContent(<p>Failed to load tax log.</p>);
      setIsModalOpen(true);
    }
  };

  const handleShowSeasonLog = () => {
    console.log("📘 Show Season Log clicked — functionality not yet implemented.");
    alert("Season log view coming soon.");
  };

  const handleShowBankLog = () => {
    console.log("🏦 Show Bank Log clicked — functionality not yet implemented.");
    alert("Bank log view coming soon.");
  };

  const handleShowElectionLog = () => {
    console.log("🗳️ Show Election Log clicked — functionality not yet implemented.");
    alert("Election log view coming soon.");
  };

  const handleShowTrainLog = () => {
    console.log("🚂 Show Train Log clicked — functionality not yet implemented.");
    alert("Train log view coming soon.");
  };

  window.showLogHandlers = {
    handleShowTaxLog,
    handleShowSeasonLog,
    handleShowBankLog,
    handleShowElectionLog,
    handleShowTrainLog,
  };

  return (
    <>
      {isModalOpen && (
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title="Tax Log"
        >
          {taxLogContent}
        </Modal>
      )}
    </>
  );
};


export default ShowLogs;