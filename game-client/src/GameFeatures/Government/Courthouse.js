import API_BASE from '../../config';
import React, { useState, useEffect, useContext } from 'react';
import Panel from '../../UI/Panel';
import axios from 'axios';
import { StatusBarContext } from '../../UI/StatusBar';
import './Courthouse.css';
import '../../UI/Panel.css'; 

const CourthousePanel = ({ onClose, currentPlayer }) => {
    const [settlement, setSettlement] = useState(null);
    const [taxRate, setTaxRate] = useState(0);
    const [isMayor, setIsMayor] = useState(false);
    const [electionPhase, setElectionPhase] = useState('');
    const [countdown, setCountdown] = useState('');
    const { updateStatus } = useContext(StatusBarContext);
    const [campaignPromises, setCampaignPromises] = useState([]);
    const [newPromise, setNewPromise] = useState('');
    const [selectedCandidate, setSelectedCandidate] = useState(null);
    const [hasVoted, setHasVoted] = useState(false);
    const [candidateList, setCandidateList] = useState([]);
    const [tempTaxRate, setTempTaxRate] = useState(0); // Temporary UI state for the slider

// ✅ Fetch settlement + election data
const fetchElectionData = async () => {
    try {
        console.log(`🏛️ Fetching election & settlement data for Frontier: ${currentPlayer.frontierId}, Settlement: ${currentPlayer.settlementId}`);

        // ✅ Fetch Settlement Data
        const settlementResponse = await axios.get(`${API_BASE}/api/get-settlement/${currentPlayer.settlementId}`);
        const settlementData = settlementResponse.data;
        setSettlement(settlementData);
        setTaxRate(settlementData.taxrate || 0);
        setTempTaxRate(settlementData.taxrate || 0);
        setCampaignPromises(settlementData.campaignPromises || []);

        // ✅ Read Election Phase from Local Storage (instead of API call)
        const storedTimers = JSON.parse(localStorage.getItem("timers")) || {};
        const electionPhase = storedTimers.elections?.phase || "Administration"; // ✅ Default to "Administration" if undefined
        setElectionPhase(electionPhase);

        console.log("✅ Election Phase (From Local Storage):", electionPhase);

        // ✅ If election just transitioned to "Counting", clear campaignPromises & votes
        if (electionPhase === "Counting") {
            console.log("🗳️ Election ended. Clearing campaign promises and votes...");

            await axios.post(`${API_BASE}/api/reset-election-votes`, {
                settlementId: currentPlayer.settlementId,
            });

            // ✅ Clear from local state
            setCampaignPromises([]);
            setCandidateList([]);
        } else {
            setCampaignPromises(settlementData.campaignPromises || []);
        }
        
        // ✅ Determine if the current player is the Mayor
        const mayorRole = settlementData.roles.find(role => role.roleName === 'Mayor');
        setIsMayor(mayorRole && mayorRole.playerId.toString() === currentPlayer._id.toString());

        // ✅ Extract candidates if in Voting phase
        if (electionPhase === "Voting") {
            const uniqueCandidates = settlementData.campaignPromises?.reduce((acc, promise) => {
                if (!acc.find((c) => c.playerId === promise.playerId)) {
                    acc.push({ playerId: promise.playerId, username: promise.username });
                }
                return acc;
            }, []) || [];

            console.log("✅ Voting Candidates:", uniqueCandidates);
            setCandidateList(uniqueCandidates);
        }

    } catch (error) {
        console.error('❌ Error fetching election or settlement data:', error);
    }
};

// ✅ Auto-refresh election status
useEffect(() => {
    fetchElectionData();
    const interval = setInterval(fetchElectionData, 1000);
    return () => clearInterval(interval);
}, [currentPlayer.frontierId, currentPlayer.settlementId]);



// ✅ Countdown Timer Effect (Uses Local Storage `timers.election.endTime`)
useEffect(() => {
    const updateCountdown = () => {
        const now = Date.now();
        const storedTimers = JSON.parse(localStorage.getItem("timers")) || {};
        const electionEndTime = storedTimers.elections?.endTime;

        if (!electionEndTime || isNaN(electionEndTime)) {
            setCountdown("N/A");
            return;
        }

        const remainingTime = Math.max(0, Math.floor((electionEndTime - now) / 1000));
        const hours = Math.floor(remainingTime / 3600);
        const minutes = Math.floor((remainingTime % 3600) / 60);
        const seconds = remainingTime % 60;

        setCountdown(`${hours}h ${minutes}m ${seconds}s`);
    };

    updateCountdown(); // Run immediately
    const interval = setInterval(updateCountdown, 1000); // Update every second

    return () => clearInterval(interval); // Cleanup on unmount
}, []); // ✅ No dependencies needed (pulls from local storage)



const handleAddCampaignPromise = async () => {
    if (!newPromise.trim()) return;
    if (newPromise.length > 200) {
        updateStatus('Campaign promises cannot exceed 200 characters.');
        return;
    }
    try {
        const response = await axios.post(`${API_BASE}/api/save-campaign-promise`, {
            settlementId: currentPlayer.settlementId,
            playerId: currentPlayer._id,
            username: currentPlayer.username,
            text: newPromise,
        });

        if (response.data.message) {
            console.log(`📢 ${response.data.message}`);
            updateStatus('✅ Campaign promise submitted.');
            setCampaignPromises(response.data.campaignPromises);
            setNewPromise('');
        }
    } catch (error) {
        console.error('❌ Error submitting campaign promise:', error);
        updateStatus('❌ Failed to submit campaign promise.');
    }
};


const handleVote = async () => {
    if (!selectedCandidate) return;

    try {
        const response = await axios.post(`${API_BASE}/api/cast-vote`, {
            settlementId: currentPlayer.settlementId,
            voterId: currentPlayer._id,
            candidateId: selectedCandidate,
        });

        if (response.data.message) {
            console.log(`🗳️ ${response.data.message}`);
            updateStatus('✅ Vote successfully cast.');
            setHasVoted(true);
            fetchElectionData();
        }
    } catch (error) {
        console.error('❌ Error casting vote:', error);
        if (error.response.data.error === "Already voted.") {
            updateStatus('❌ You already voted.');
        } else{
            updateStatus('❌ Failed to cast vote.');
        }
    }
};

const handleSaveTaxRate = async () => {
    if (!isMayor) return;
  
    try {
      console.log(`💾 Saving new tax rate: ${tempTaxRate}%`);
  
      const response = await axios.post(`${API_BASE}/api/update-settlement`, {
        settlementId: currentPlayer.settlementId,
        updates: { taxrate: tempTaxRate }, // ✅ Save the new tax rate
    });
  
      if (response.data.success) {
        console.log(`✅ Tax rate updated successfully.`);
        updateStatus(`✅ Tax rate set to ${tempTaxRate}%`);
        // ✅ Sync stored tax rate with UI slider
        setTaxRate(tempTaxRate);
      } else {
        console.error(`❌ Failed to update tax rate:`, response.data.error);
        updateStatus("❌ Error updating tax rate.");
      }
    } catch (error) {
      console.error('❌ Error saving tax rate:', error);
      updateStatus("❌ Failed to save tax rate.");
    }
  };

////////////////////////////////////

  return (
    <Panel onClose={onClose} descriptionKey="1012" titleKey="1112" panelName="Courthouse">
        <div className="panel-content courthouse-panel">       
        <div className="debug-buttons">
        <h1> {isMayor && ( <p>Welcome, Mayor.</p> )} </h1>
        <h2>💰 Tax Rate: {taxRate}%</h2>

        {isMayor ? (
        <>
            <input
            type="range" min="0" max="20" value={tempTaxRate}
            onChange={(e) => setTempTaxRate(Number(e.target.value))} // ✅ Allow free movement
            />
            <p>Proposed Tax Rate: {tempTaxRate}%</p>
            <button className="btn-success" onClick={handleSaveTaxRate}>Update Tax Rate</button>        
            </>
        ) : (
        <p>⚠️ Only the Mayor can set the tax rate.</p>
        )}
<br></br>
        <h2>🗳️ Elections</h2>
        <p><strong>Current Phase:</strong> {electionPhase}</p>
        <p><strong>Next Phase Begins In:</strong></p>
        <p>{countdown}</p>


        {/* ✅ Campaigning Phase */}
        {electionPhase === "Campaigning" && (
        <>
            <h3>📢 Campaign Promises</h3>
            
            {/* ✅ Scrollable List of Promises */}
            <div className="campaign-promises">
            {campaignPromises.length > 0 ? (
                campaignPromises.map((promise, index) => (
                <div key={index} className="campaign-entry">
                    <strong>{promise.username}:</strong> {promise.text}
                </div>
                ))
            ) : (
                <p>No one has made a campaign promise yet.</p>
            )}
            </div>

            {/* ✅ Player Can Submit a Promise */}
            {!campaignPromises.some(p => p.playerId === currentPlayer._id) && (
            <>
                <textarea
                value={newPromise}
                onChange={(e) => setNewPromise(e.target.value)}
                placeholder="Enter your campaign promise (max 200 characters)..."
                />
                <button className="btn-success" onClick={handleAddCampaignPromise}>Submit Campaign Promise</button>
            </>
            )}
        </>
        )}

        {/* ✅ Voting Phase UI */}
        {electionPhase === 'Voting' && !hasVoted && (
    <>
        <h3>Cast Your Vote</h3>
        {candidateList.length > 0 ? (
            candidateList.map((candidate, index) => (
                <div key={candidate.playerId || index}>
                    <input 
                        type="radio" 
                        name="vote" 
                        value={candidate.playerId} 
                        onChange={() => {
                            console.log(`🔍 Selected Candidate: ${candidate.username} (${candidate.playerId})`);
                            setSelectedCandidate(candidate.playerId);
                        }} 
                    />
                    {candidate.username}
                </div>
            ))
        ) : (
            <p>No candidates available for voting.</p>
        )}
        <button 
            className="btn-success"
            onClick={handleVote} 
            disabled={!selectedCandidate}>
            Cast Your Vote
        </button>
    </>
)}
      </div>
      </div>
    </Panel>
  );
};

export default CourthousePanel;