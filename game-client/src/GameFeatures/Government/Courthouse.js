import API_BASE from '../../config';
import React, { useState, useEffect, useContext } from 'react';
import Panel from '../../UI/Panel';
import axios from 'axios';
import { StatusBarContext } from '../../UI/StatusBar';
import './Courthouse.css';
import '../../UI/Panel.css';
import strings from '../../UI/strings.json';

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
    const [votedFor, setVotedFor] = useState('');
    const [candidateList, setCandidateList] = useState([]);
    const [tempTaxRate, setTempTaxRate] = useState(0); // Temporary UI state for the slider
    const [hoveredCandidate, setHoveredCandidate] = useState(null);
    const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
    const [tempSettlementName, setTempSettlementName] = useState('');

    // Effect for initial data load only
    useEffect(() => {
        fetchElectionData();
    }, [currentPlayer.settlementId]);

    // Combined countdown and phase monitor effect
    useEffect(() => {
        const updateTimerAndPhase = () => {
            const now = Date.now();
            const storedTimers = JSON.parse(localStorage.getItem("timers")) || {};
            const electionData = storedTimers.elections || {};
            
            // Update phase first
            const newPhase = electionData.phase || "Administration";
            if (newPhase !== electionPhase) {
                console.log("🗳️ Election phase changing to:", newPhase);
                setElectionPhase(newPhase);
            }

            // Then update countdown
            const endTime = electionData.endTime;
            if (!endTime || isNaN(endTime)) {
                setCountdown("N/A");
                return;
            }

            const remainingTime = Math.max(0, Math.floor((endTime - now) / 1000));
            const hours = Math.floor(remainingTime / 3600);
            const minutes = Math.floor((remainingTime % 3600) / 60);
            const seconds = remainingTime % 60;
            setCountdown(`${hours}h ${minutes}m ${seconds}s`);
        };

        updateTimerAndPhase(); // Initial run
        const interval = setInterval(updateTimerAndPhase, 1000);
        return () => clearInterval(interval);
    }, []); // No dependencies needed

    // Effect to fetch fresh data on phase changes
    useEffect(() => {
        console.log("🗳️ Phase changed to:", electionPhase);
        if (electionPhase === "Counting") {
            setCampaignPromises([]);
            setCandidateList([]);
        }
        fetchElectionData();
    }, [electionPhase]);

    const fetchElectionData = async () => {
        try {
            const settlementResponse = await axios.get(
                `${API_BASE}/api/get-settlement/${currentPlayer.settlementId}`
            );
            const settlementData = settlementResponse.data;
            
            setSettlement(settlementData);
            setTaxRate(settlementData.taxrate || 0);
            setTempTaxRate(settlementData.taxrate || 0);
            setCampaignPromises(settlementData.campaignPromises || []);
            setTempSettlementName(settlementData.displayName || '');
            
            // Update mayor status
            const mayorRole = settlementData.roles.find(role => role.roleName === 'Mayor');
            setIsMayor(mayorRole && mayorRole.playerId.toString() === currentPlayer._id.toString());

            // Check if player has already voted and update voting status
            if (settlementData.votes) {
                const playerVote = settlementData.votes.find(v => v.voterId === currentPlayer._id);
                if (playerVote) {
                    setHasVoted(true);
                    const votedCandidate = settlementData.campaignPromises?.find(p => 
                        p.playerId === playerVote.candidateId
                    );
                    setVotedFor(votedCandidate?.username || 'Unknown');
                }
            }

            // Only update candidates list if in voting phase and haven't voted
            if (electionPhase === "Voting" && !hasVoted) {
                const uniqueCandidates = settlementData.campaignPromises?.reduce((acc, promise) => {
                    if (!acc.find((c) => c.playerId === promise.playerId)) {
                        acc.push({ playerId: promise.playerId, username: promise.username });
                    }
                    return acc;
                }, []) || [];
                setCandidateList(uniqueCandidates);
            }
        } catch (error) {
            console.error('❌ Error fetching election data:', error);
        }
    };

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
                // Store the username of the voted candidate
                const votedCandidate = candidateList.find(c => c.playerId === selectedCandidate);
                setVotedFor(votedCandidate?.username || 'Unknown');
                fetchElectionData();
            }
        } catch (error) {
            console.error('❌ Error casting vote:', error);
            if (error.response.data.error === "Already voted.") {
                updateStatus('❌ You already voted.');
            } else {
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

    const handleSaveSettlementName = async () => {
        if (!isMayor || !tempSettlementName.trim()) return;

        try {
            const response = await axios.post(`${API_BASE}/api/update-settlement`, {
                settlementId: currentPlayer.settlementId,
                updates: { displayName: tempSettlementName } // Changed from name to displayName
            });

            if (response.data.success) {
                updateStatus(`✅ Settlement renamed to ${tempSettlementName}`);
                setSettlement(prev => ({ ...prev, displayName: tempSettlementName }));
            } else {
                updateStatus("❌ Error updating settlement name.");
            }
        } catch (error) {
            console.error('❌ Error saving settlement name:', error);
            updateStatus("❌ Failed to save settlement name.");
        }
    };

    const getCandidatePromise = (candidateId) => {
        return campaignPromises.find(promise => 
            promise.playerId === candidateId
        )?.text || "No campaign promise made.";
    };

    return (
        <Panel onClose={onClose} descriptionKey="1012" titleKey="1112" panelName="Courthouse">
            <div className="panel-content courthouse-panel">       
                <div className="debug-buttons">
                    <h1> {isMayor && ( <p>Welcome, Mayor.</p> )} </h1>

{/* Settlement name section */}

                    <h2>Your Settlement:</h2>
                    {isMayor ? (
                        <div className="settlement-name-editor">
                            <input
                                type="text"
                                value={tempSettlementName}
                                onChange={(e) => setTempSettlementName(e.target.value)}
                                placeholder="Enter settlement name..."
                            />
                            <button 
                                className="btn-success" 
                                onClick={handleSaveSettlementName}
                                disabled={!tempSettlementName.trim()}
                            >
                                Update Name
                            </button>
                        </div>
                    ) : (
                        <h2>{settlement?.displayName || 'Unnamed'}</h2>
                    )}

{/* Tax rate section */}

                    <h2>💰 Tax Rate: {taxRate}%</h2>
                    {isMayor && (
                        <div className="tax-rate-editor">
                            <input
                                type="range" min="0" max="20" value={tempTaxRate}
                                onChange={(e) => setTempTaxRate(Number(e.target.value))}
                            />
                            <p>Proposed Tax Rate: {tempTaxRate}%</p>
                            <button className="btn-success" onClick={handleSaveTaxRate}>
                                Update Tax Rate
                            </button>
                        </div>
                    )}

                    <br></br>
                    <h2>{strings["2045"]}</h2>
                    <p><strong>
                        {electionPhase === "Counting" && strings["2062"]}
                        {electionPhase === "Voting" && strings["2061"]}
                        {electionPhase === "Campaigning" && strings["2060"]}
                        {electionPhase === "Administration" && strings["2063"]}
                    </strong></p>
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

{/* Voting Phase UI */}

                    {electionPhase === 'Voting' && (
                        <div className="voting-section">
                            {hasVoted ? (
                                <p>You have already voted.</p>
                            ) : candidateList.length > 0 ? (
                                <>
                                    <h3>Cast Your Vote</h3>
                                    {candidateList.map((candidate, index) => (
                                        <div 
                                            key={candidate.playerId || index}
                                            className="candidate-row"
                                            onMouseEnter={(e) => {
                                                setHoveredCandidate(candidate.playerId);
                                                setTooltipPosition({
                                                    x: e.clientX + 10,
                                                    y: e.clientY - 40
                                                });
                                            }}
                                            onMouseLeave={() => setHoveredCandidate(null)}
                                        >
                                            <input 
                                                type="radio" 
                                                name="vote" 
                                                value={candidate.playerId}
                                                onChange={() => {
                                                    setSelectedCandidate(candidate.playerId);
                                                }}
                                            />
                                            {candidate.username}
                                        </div>
                                    ))}
                                    <button 
                                        className="btn-success"
                                        onClick={handleVote} 
                                        disabled={!selectedCandidate}
                                    >
                                        Cast Your Vote
                                    </button>

                                    {/* Tooltip */}
                                    {hoveredCandidate && (
                                        <div 
                                            className="candidate-tooltip"
                                            style={{
                                                left: tooltipPosition.x,
                                                top: tooltipPosition.y,
                                            }}
                                        >
                                            <strong>Campaign promise:</strong><br />
                                            "{getCandidatePromise(hoveredCandidate)}"
                                        </div>
                                    )}
                                </>
                            ) : (
                                <p>There were no candidates.</p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </Panel>
    );
};

export default CourthousePanel;