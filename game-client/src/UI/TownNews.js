import API_BASE from '../config';
import React, { useEffect, useState, useContext } from 'react';
import axios from 'axios';
import Modal from './Modal';
import './TownNews.css';
import { StatusBarContext } from './StatusBar';
import strings from './strings.json';

function TownNews({ onClose, currentPlayer, setCurrentPlayer, resources }) {

  const [modalContent, setModalContent] = useState();
    
  setModalContent({
    title: strings["5001"],
    message: strings["5002"],
    message2: strings["5003"],
    size: "small",
    });

  const { updateStatus } = useContext(StatusBarContext);
  const [taxRate, setTaxRate] = useState(0);
  const [isMayor, setIsMayor] = useState(false);

  // ✅ Fetch settlement + election data
  const fetchElectionData = async () => {
      try {
          console.log(`🏛️ Fetching election & settlement data for Frontier: ${currentPlayer.frontierId}, Settlement: ${currentPlayer.settlementId}`);
  
          // ✅ Fetch Settlement Data
          const settlementResponse = await axios.get(`${API_BASE}/api/get-settlement/${currentPlayer.settlementId}`);
          const settlementData = settlementResponse.data;
          setTaxRate(settlementData.taxrate || 0);
          // ✅ Read Election Phase from Local Storage (instead of API call)
          const storedTimers = JSON.parse(localStorage.getItem("timers")) || {};
          const electionPhase = storedTimers.elections?.phase || "Waiting..."; // ✅ Default to "Administration" if undefined
          // ✅ Determine if the current player is the Mayor
          const mayorRole = settlementData.roles.find(role => role.roleName === 'Mayor');
          setIsMayor(mayorRole && mayorRole.playerId.toString() === currentPlayer._id.toString());
  
  
      } catch (error) {
          console.error('❌ Error fetching election or settlement data:', error);
      }
  };

  // ✅ Auto-refresh election status
  useEffect(() => {
      fetchElectionData();
  }, [currentPlayer]);

          
  return (
    <Modal onClose={onClose} >

        <h4>Here's what's happening in Town right now:</h4>
            <p>The current Mayor is X, and the tax rate is Y.</p>
            <p>It's election season, and campaigning is in full swing. Stop by the Courtnouse in Town to run for Mayor.</p>
            <p>Voting for the next Mayor has begun. Cast your vote at the Courthouse in Town.</p>
            <p>The Train is arriving in XX and will be offering to buy X X and X. Collaborate with your neighbors for extra rewards. The next train will be buying YYY.</p>
            <p>The Train is departing, and will return in XXX, offering to buy YYYY.</p>
            <p>The Train is arriving, and will offer to buy YYYY. The next train after this one will buy YYYY.</p>
            <p>Visit the Bank to sell gold, silver, and diamonds. The Bank is also currently offering to buy X X and X. </p>
            <p>The Royal Court</p>

    </Modal>
  );
}

export default TownNews;