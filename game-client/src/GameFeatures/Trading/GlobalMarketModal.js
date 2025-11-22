import React, { useState, useEffect } from 'react';
import Modal from '../../UI/Modal';
import TransactionButton from '../../UI/TransactionButton';
import axios from 'axios';
import API_BASE from '../../config';
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import '../../UI/SharedButtons.css';
import './GlobalMarketModal.css';

/**
 * Global Market Modal - Shows all players in settlement with items for sale
 * Displays one user per row with their tradestall slots and buy buttons
 */
function GlobalMarketModal({
  isOpen,
  onClose,
  currentPlayer,
  onBuyItem,
  onFulfillRequest,
  masterResources,
  globalTuning
}) {
  const strings = useStrings();
  const [settlementPlayers, setSettlementPlayers] = useState([]);
  const [playerTradeStalls, setPlayerTradeStalls] = useState({});
  const [playerTradeRequests, setPlayerTradeRequests] = useState({});
  const [resourceData, setResourceData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('buy'); // 'buy' or 'sell'

  // Fetch all players and their trade stalls when modal opens
  useEffect(() => {
    if (!isOpen || !currentPlayer?.location?.s) return;

    const fetchGlobalMarketData = async () => {
      setIsLoading(true);
      try {
        // Fetch players in settlement
        const settlementResponse = await axios.get(`${API_BASE}/api/players-in-settlement`, {
          params: { settlementId: currentPlayer.location.s },
        });
        const players = settlementResponse.data.players || [];
        setSettlementPlayers(players);

        // Fetch resource data for symbols
        const resourcesResponse = await axios.get(`${API_BASE}/api/resources`);
        setResourceData(resourcesResponse.data);

        // Fetch trade stalls for all players in parallel
        const tradeStallPromises = players.map(player => 
          axios.get(`${API_BASE}/api/player-trade-stall`, {
            params: { playerId: player.playerId },
          }).then(response => ({
            playerId: player.playerId,
            tradeStall: response.data.tradeStall || []
          })).catch(error => ({
            playerId: player.playerId,
            tradeStall: []
          }))
        );

        const tradeStallResults = await Promise.all(tradeStallPromises);
        const tradeStallsData = {};
        tradeStallResults.forEach(result => {
          tradeStallsData[result.playerId] = result.tradeStall;
        });

        setPlayerTradeStalls(tradeStallsData);

        // Fetch trade requests for all players in parallel
        const tradeRequestPromises = players.map(player =>
          axios.get(`${API_BASE}/api/player-trade-stall-requests`, {
            params: { playerId: player.playerId },
          }).then(response => ({
            playerId: player.playerId,
            tradeStallRequests: response.data.tradeStallRequests || []
          })).catch(() => ({
            playerId: player.playerId,
            tradeStallRequests: []
          }))
        );

        const tradeRequestResults = await Promise.all(tradeRequestPromises);
        const tradeRequestsData = {};
        tradeRequestResults.forEach(result => {
          tradeRequestsData[result.playerId] = result.tradeStallRequests;
        });

        console.log('[Global Market] Trade request results:', tradeRequestResults);
        console.log('[Global Market] Trade requests data object:', tradeRequestsData);
        setPlayerTradeRequests(tradeRequestsData);
      } catch (error) {
        console.error('Error fetching global market data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchGlobalMarketData();
  }, [isOpen, currentPlayer?.location?.s]);

  // Filter players who have items for sale (excluding current player)
  const getPlayersWithItems = () => {
    return settlementPlayers.filter(player => {
      // Exclude current player from the list
      if (player.playerId === currentPlayer.playerId) {
        return false;
      }

      const stall = playerTradeStalls[player.playerId];
      return stall && stall.some(slot =>
        slot?.resource &&
        slot?.amount > 0 &&
        !slot?.boughtBy // Not sold - that's all we need to check
      );
    }).sort((a, b) => {
      // Sort by username alphabetically
      return a.username.localeCompare(b.username);
    });
  };

  // Filter players who have active requests (excluding current player)
  const getPlayersWithRequests = () => {
    console.log('[Global Market] Filtering players with requests...');
    console.log('[Global Market] Settlement players:', settlementPlayers);
    console.log('[Global Market] Player trade requests state:', playerTradeRequests);
    console.log('[Global Market] Current player ID:', currentPlayer.playerId);

    const filtered = settlementPlayers.filter(player => {
      // Exclude current player from the list
      if (player.playerId === currentPlayer.playerId) {
        console.log(`[Global Market] Excluding current player: ${player.username}`);
        return false;
      }

      const requests = playerTradeRequests[player.playerId];
      console.log(`[Global Market] Player ${player.username} (${player.playerId}) requests:`, requests);

      if (!requests) {
        console.log(`[Global Market]   -> No requests found`);
        return false;
      }

      const hasActive = requests.some(slot => {
        const isActive = slot?.resource && slot?.amount > 0 && slot?.moneyCommitted > 0;
        if (slot?.resource) {
          console.log(`[Global Market]   -> Slot:`, slot, `Active: ${isActive}`);
        }
        return isActive;
      });

      console.log(`[Global Market]   -> Has active requests: ${hasActive}`);
      return hasActive;
    });

    console.log('[Global Market] Filtered players with requests:', filtered);

    return filtered.sort((a, b) => {
      // Sort by username alphabetically
      return a.username.localeCompare(b.username);
    });
  };

  // Get symbol for a resource type
  const getSymbol = (resourceType) => {
    const resource = resourceData.find((res) => res.type === resourceType);
    return resource?.symbol || '';
  };

  // Handle buying an item - delegates to parent component
  const handleBuyItem = async (playerId, slotIndex, transactionId, transactionKey) => {
    try {
      await onBuyItem(playerId, slotIndex, transactionId, transactionKey);

      // Refresh the trade stall data for this player after purchase
      const response = await axios.get(`${API_BASE}/api/player-trade-stall`, {
        params: { playerId },
      });

      setPlayerTradeStalls(prev => ({
        ...prev,
        [playerId]: response.data.tradeStall || []
      }));
    } catch (error) {
      console.error('Error in global market buy:', error);
    }
  };

  // Handle fulfilling a request (selling to a player's request)
  const handleFulfillRequest = async (playerId, slotIndex, transactionId, transactionKey) => {
    try {
      await onFulfillRequest(playerId, slotIndex, transactionId, transactionKey);

      // Refresh the trade requests data for this player after fulfillment
      const requestsResponse = await axios.get(`${API_BASE}/api/player-trade-stall-requests`, {
        params: { playerId },
      });

      setPlayerTradeRequests(prev => ({
        ...prev,
        [playerId]: requestsResponse.data.tradeStallRequests || []
      }));
    } catch (error) {
      console.error('Error fulfilling request:', error);
    }
  };

  if (!isOpen) return null;

  const playersWithItems = getPlayersWithItems();
  const playersWithRequests = getPlayersWithRequests();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={strings[362] || "Global Market"}
      size="large"
      className="global-market-modal"
    >
      <div className="global-market-content">
        {/* TAB NAVIGATION */}
        <div className="tab-navigation">
          <button
            className={`tab-button ${activeTab === 'buy' ? 'active' : ''}`}
            onClick={() => setActiveTab('buy')}
          >
            Buy
          </button>
          <button
            className={`tab-button ${activeTab === 'sell' ? 'active' : ''}`}
            onClick={() => setActiveTab('sell')}
          >
            Sell (Player Requests)
          </button>
        </div>

        {isLoading ? (
          <div className="loading-container">
            <div className="loading-text">{strings[98] || "Loading..."}</div>
          </div>
        ) : activeTab === 'buy' ? (
          playersWithItems.length === 0 ? (
            <div className="no-items-container">
              <div className="no-items-text">{strings[363] || "No items currently available for purchase"}</div>
            </div>
          ) : (
          <div className="players-list">
            {playersWithItems.map(player => {
              const stall = playerTradeStalls[player.playerId] || [];
              const availableSlots = stall.filter(slot => 
                slot?.resource && 
                slot?.amount > 0 && 
                !slot?.boughtBy // Show all unsold items, regardless of timer
              );

              return (
                <div key={player.playerId} className="player-row">
                  <div className="player-info">
                    <div className="player-username">
                      {player.icon && <span className="player-icon">{player.icon}</span>}
                      {player.username}
                    </div>
                    <div className="player-items-count">
                      {availableSlots.length} {strings[364] || "items available"}
                    </div>
                  </div>
                  
                  <div className="player-slots">
                    {availableSlots.map((slot, slotIndex) => {
                      // Find the actual slot index in the full stall
                      const actualSlotIndex = stall.findIndex(s => s === slot);
                      const totalCost = slot.amount * slot.price;
                      
                      return (
                        <div key={actualSlotIndex} className="slot-item">
                          <div className="slot-info">
                            <div className="slot-item-name">
                              {slot.amount}x {getSymbol(slot.resource)} {getLocalizedString(slot.resource, strings)}
                            </div>
                          </div>
                          
                          <div className="slot-button">
                            <div className="shared-buttons">
                              <TransactionButton
                                className="btn-basic btn-success"
                                transactionKey={`global-market-buy-${player.playerId}-${actualSlotIndex}`}
                                onAction={(transactionId, transactionKey) => 
                                  handleBuyItem(player.playerId, actualSlotIndex, transactionId, transactionKey)
                                }
                              >
                                {strings[365] || "Buy"} 💰{totalCost.toLocaleString()}
                              </TransactionButton>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          )
        ) : (
          // SELL TAB - Player Requests
          playersWithRequests.length === 0 ? (
            <div className="no-items-container">
              <div className="no-items-text">No player requests currently available</div>
            </div>
          ) : (
          <div className="players-list">
            {playersWithRequests.map(player => {
              const requests = playerTradeRequests[player.playerId] || [];
              const activeRequests = requests.filter(slot =>
                slot?.resource &&
                slot?.amount > 0 &&
                slot?.moneyCommitted > 0
              );

              return (
                <div key={player.playerId} className="player-row">
                  <div className="player-info">
                    <div className="player-username">
                      {player.icon && <span className="player-icon">{player.icon}</span>}
                      {player.username}
                    </div>
                    <div className="player-items-count">
                      {activeRequests.length} {strings[364] || "requests available"}
                    </div>
                  </div>

                  <div className="player-slots">
                    {activeRequests.map((slot) => {
                      // Find the actual slot index in the full requests array
                      const actualSlotIndex = requests.findIndex(s => s === slot);

                      // Check if current player has enough of this resource
                      const playerInventoryItem = currentPlayer.inventory?.find(
                        item => item.type === slot.resource
                      );
                      const playerHasAmount = playerInventoryItem?.quantity || 0;
                      const canFulfill = playerHasAmount >= slot.amount;

                      return (
                        <div
                          key={actualSlotIndex}
                          className={`slot-item ${!canFulfill ? 'unfulfillable' : ''}`}
                        >
                          <div className="slot-info">
                            <div className="slot-item-name">
                              {slot.amount}x {getSymbol(slot.resource)} {getLocalizedString(slot.resource, strings)}
                            </div>
                          </div>

                          <div className="slot-button">
                            <div className="shared-buttons">
                              <TransactionButton
                                className="btn-basic btn-success"
                                transactionKey={`fulfill-request-${player.playerId}-${actualSlotIndex}`}
                                onAction={(transactionId, transactionKey) =>
                                  handleFulfillRequest(player.playerId, actualSlotIndex, transactionId, transactionKey)
                                }
                                disabled={!canFulfill}
                              >
                                {strings[167] || "Sell"} 💰{slot.moneyCommitted.toLocaleString()}
                              </TransactionButton>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          )
        )}
      </div>

      <div className="global-market-footer">
        <div className="shared-buttons">
          <button 
            onClick={onClose}
            className="btn-basic btn-neutral"
          >
            {strings[366] || "Close"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default GlobalMarketModal;