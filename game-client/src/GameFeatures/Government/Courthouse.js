import API_BASE from '../../config';
import { trackQuestProgress } from '../Quests/QuestGoalTracker';
import React, { useState, useEffect, useContext } from 'react';
import Panel from '../../UI/Panel';
import Modal from '../../UI/Modal';
import axios from 'axios';
import { StatusBarContext } from '../../UI/StatusBar/StatusBar';
import './Courthouse.css';
import '../../UI/Panel.css';
import { useStrings } from '../../UI/StringsContext';
import '../../UI/Modal.css';
import '../../UI/SharedButtons.css';
import { getMayorUsername } from './GovUtils';
import { calculateSettlementPopulation } from '../../Utils/PopulationUtils';
import { formatCountdown } from '../../UI/Timers';
import { handleProtectedSelling } from '../../Utils/ProtectedSelling';
import TransactionButton from '../../UI/TransactionButton';

const CourthousePanel = ({ 
  onClose, 
  currentPlayer, 
  setCurrentPlayer,
  inventory,
  setInventory,
  backpack,
  setBackpack,
  setResources,
  currentStationPosition,
  gridId,
  TILE_SIZE,
  isDeveloper 
}) => {

    const strings = useStrings();
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
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalContent, setModalContent] = useState(null);
    const [mayor, setMayor] = useState("");
    const [population, setPopulation] = useState(0);

    
    const handleViewElectionLog = async () => {
        if (!currentPlayer?.settlementId) {
          console.warn("⚠️ Cannot show election log: settlementId missing.");
          return;
        }

        console.log("🗳️ Show Election Log clicked");
        console.log("📤 Fetching election log for settlement:", currentPlayer.settlementId);

        try {
          const response = await axios.get(`${API_BASE}/api/settlement/${currentPlayer.settlementId}/electionlog`);
          console.log("📥 Election log API response:", response.data);

          const electionlog = response.data.electionlog || [];

          const electionLogTable = (
            <table className="election-log-table" style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ padding: "6px 12px" }}>Date</th>
                  <th style={{ padding: "6px 12px" }}>Candidates</th>
                  <th style={{ padding: "6px 12px" }}>Elected Mayor</th>
                </tr>
              </thead>
              <tbody>
                {[...electionlog].reverse().map((entry, i) => (
                  <tr key={i}>
                    <td style={{ padding: "6px 12px" }}>{new Date(entry.date).toLocaleDateString()}</td>
                    <td style={{ padding: "6px 12px" }}>
                      {entry.candidates?.length > 0 ? (
                        entry.candidates.map((c, j) => (
                          <div key={j}>{c.username}: {c.votes} votes</div>
                        ))
                      ) : (
                        <em>No candidates</em>
                      )}
                    </td>
                    <td style={{ padding: "6px 12px" }}>{entry.electedmayor || 'None'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          );

          setModalContent({
            title: "Recent Election Results",
            size: "large",
            message: electionlog.length === 0
              ? "No election results recorded yet."
              : undefined,
            custom: electionLogTable,
          });
          setIsModalOpen(true);
        } catch (error) {
          console.error("❌ Failed to fetch election log:", error);
          setModalContent({
            title: "Error",
            message: "Failed to load election log.",
            size: "small",
          });
          setIsModalOpen(true);
        }
    };

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

            // Then update countdown using shared formatCountdown function
            const endTime = electionData.endTime;
            if (!endTime || isNaN(endTime)) {
                setCountdown("N/A");
                return;
            }

            setCountdown(formatCountdown(endTime, now));
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
            
            // Fetch mayor username
            const mayorName = await getMayorUsername(currentPlayer.settlementId);
            setMayor(mayorName);
            
            // Calculate population
            const populationCount = calculateSettlementPopulation(settlementData);
            setPopulation(populationCount);

            // Always reset hasVoted and votedFor before checking
            setHasVoted(false);
            setVotedFor('');
            if (settlementData.votes) {
                const playerVote = settlementData.votes.find(v => String(v.voterId) === String(currentPlayer._id));
                if (playerVote) {
                    setHasVoted(true);
                    const votedCandidate = settlementData.campaignPromises?.find(p => 
                        String(p.playerId) === String(playerVote.candidateId)
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
                updateStatus('🏛️ Campaign promise submitted.');
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
                updateStatus('🏛️ Vote successfully cast.');
                setHasVoted(true);
                // Store the username of the voted candidate
                const votedCandidate = candidateList.find(c => c.playerId === selectedCandidate);
                setVotedFor(votedCandidate?.username || 'Unknown');
                await trackQuestProgress(currentPlayer, 'Vote', 'Election', 1);
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
                updateStatus(`💰 Tax rate set to ${tempTaxRate}%`);
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
                updateStatus(`Settlement renamed to ${tempSettlementName}`);
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

    const handleSellStation = async (transactionId, transactionKey) => {
        await handleProtectedSelling({
            currentPlayer,
            setInventory,
            setBackpack,
            setCurrentPlayer,
            setResources,
            stationType: 'Courthouse',
            currentStationPosition,
            gridId,
            TILE_SIZE,
            updateStatus,
            onClose
        });
    };

    console.log("hasVoted:", hasVoted);
    console.log("electionPhase:", electionPhase);




    return (
        <Panel onClose={onClose} descriptionKey="1012" titleKey="1112" panelName="Courthouse">
            <div className="panel-content courthouse-panel">
            {/* Check if player is in their home settlement */}
            {(() => {
                const isInHomeSettlement = String(currentPlayer.location.s) === String(currentPlayer.settlementId);
                console.log('🏛️ Courthouse access check:', {
                    currentSettlement: currentPlayer.location.s,
                    homeSettlement: currentPlayer.settlementId,
                    isInHomeSettlement
                });
                return !isInHomeSettlement;
            })() ? (
                <div style={{ textAlign: 'center', padding: '20px' }}>
                    <h2>{strings[2050] || "This is not your home settlement."}</h2>
                </div>
            ) : (
                <>
                {isMayor && <h2>{strings[2080]}</h2>}
                
                <div className="debug-buttons">


{/* Settlement name section */}
                    <h3>{strings[2082]}</h3>
                    {isMayor ? (
                        <div className="settlement-name-editor">
                            <input
                                type="text"
                                value={tempSettlementName}
                                onChange={(e) => setTempSettlementName(e.target.value)}
                                placeholder={strings[2081]}
                            />
                            <div className="shared-buttons" style={{ display: 'inline-block', marginLeft: '8px' }}>
                                <button 
                                    className="btn-basic btn-success btn-modal-small" 
                                    onClick={handleSaveSettlementName}
                                    disabled={!tempSettlementName.trim()}
                                    style={{ width: 'auto' }}
                                >
                                    {strings[2083]}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <h3 style={{ color: 'rgb(154, 106, 22)' }}><strong>{settlement?.displayName || 'Unnamed'}</strong></h3>
                    )}
 
{/* POPULATION section */}
                    <h3>{strings["3002"]} <strong>{population}</strong></h3>

{/* TAX RATE section */} 
 
                    <h3>{strings[2041]} {taxRate}%</h3>
                    {isMayor && (
                        <div className="tax-rate-editor">
                            <input
                                type="range" min="0" max="20" value={tempTaxRate}
                                onChange={(e) => setTempTaxRate(Number(e.target.value))}
                            />
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                            <span style={{ flex: 1 }}>{strings[2042]} {tempTaxRate}%</span>
                            <button
                                className="btn-basic btn-success btn-modal-small"
                                onClick={handleSaveTaxRate}
                                style={{
                                width: 'auto',
                                maxWidth: '100px',
                                flexShrink: 0
                                }}
                            >
                                {strings["2043"]}
                            </button>
                            </div>
                        </div>
                    )}

{/* CURRENT MAYOR section - only show if player is not the mayor */}
                    {!isMayor && (
                        <>
                            <h3>{strings[2085]}</h3>
                            <h2 style={{ color: 'rgb(154, 106, 22)' }}><strong>{mayor || "Vacant"}</strong></h2>
                        </>
                    )}

                    {!isMayor && <h2>{strings[2079]}</h2>}

                    <p>{strings[2084]}</p>


{/* ELECTIONS section */} 

                    <br></br> 
                    <h2>{strings[2045]}</h2>
                    <div className="shared-buttons">
                        <button className="btn-basic btn-success" onClick={handleViewElectionLog}>Recent Election Results</button>
                    </div>
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
                            <h3>{strings[2048]}</h3>
                            
                            {/* ✅ Scrollable List of Promises */}
                            <div className="campaign-promises">
                                {campaignPromises.length > 0 ? (
                                    campaignPromises.map((promise, index) => (
                                        <div key={index} className="campaign-entry">
                                            <strong>{promise.username}:</strong> {promise.text}
                                        </div>
                                    ))
                                ) : (
                                    <p>{strings[2071]}</p>
                                )}
                            </div>

                            {/* ✅ Player Can Submit a Promise */}
                            {!campaignPromises.some(p => p.playerId === currentPlayer._id) && (
                                <>
                                    <textarea
                                        value={newPromise}
                                        onChange={(e) => setNewPromise(e.target.value)}
                                        placeholder={strings[2072]}
                                    />
                                    <div className="shared-buttons">
                                        <button className="btn-basic btn-success" onClick={handleAddCampaignPromise}>Submit Campaign Promise</button>
                                    </div>
                                </>
                            )}
                        </>
                    )}

{/* Voting Phase UI */}

                <div className="voting-section">
                </div>
                    {electionPhase === 'Voting' && (
                        <div className="voting-section">
                            {hasVoted ? (
                                <p>{strings[2077]}</p>
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
                                    <div className="shared-buttons">
                                        <button 
                                            className="btn-basic btn-success"
                                            onClick={handleVote} 
                                            disabled={!selectedCandidate}
                                        >
                                            {strings[2074]}
                                        </button>
                                    </div>

                                    {/* Tooltip */}
                                    {hoveredCandidate && (
                                        <div 
                                            className="candidate-tooltip"
                                            style={{
                                                left: tooltipPosition.x,
                                                top: tooltipPosition.y,
                                            }}
                                        >
                                            <strong>{strings[2076]}</strong><br />
                                            "{getCandidatePromise(hoveredCandidate)}"
                                        </div>
                                    )}
                                </>
                            ) : (
                                <p>{strings[2078]}</p>
                            )}


                            {/* ✅ Extra message if no one ran */}
                            {candidateList.length === 0 && (
                                <p><em>No one ran for mayor this election cycle.</em></p>
                            )}
                            
                        </div>
                    )}
                </div>
                </>
            )}

            {isDeveloper && (
                <div className="station-panel-footer">
                    <div className="shared-buttons">
                        <TransactionButton 
                            className="btn-basic btn-danger" 
                            onAction={handleSellStation}
                            transactionKey={`sell-refund-Courthouse-${currentStationPosition?.x}-${currentStationPosition?.y}-${gridId}`}
                        >
                            {strings[425] || "Sell for Refund"}
                        </TransactionButton>
                    </div>
                </div>
            )}
            </div>
            {isModalOpen && (
                <Modal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    title={modalContent?.title}
                    size={modalContent?.size}
                    message={modalContent?.message}
                    custom={modalContent?.custom}
                />
            )}
        </Panel>
    );
};

export default CourthousePanel;