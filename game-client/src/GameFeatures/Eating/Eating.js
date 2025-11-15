import React, { useState, useMemo } from 'react';
import { getLocalizedString } from '../../Utils/stringLookup';
import { useStrings } from '../../UI/StringsContext';
import playersInGridManager from '../../GridState/PlayersInGrid';
import './Eating.css';

const EatingModal = ({
  isOpen,
  onClose,
  currentPlayer,
  setCurrentPlayer,
  masterResources,
  updateStatus
}) => {
  const strings = useStrings();
  const [eatAmounts, setEatAmounts] = useState({});
  
  // Filter edible resources (those with hp property defined)
  const edibleResources = useMemo(() => {
    const edible = masterResources.filter(resource => resource.hp && resource.hp > 0);
    return edible;
  }, [masterResources]);

  // Get backpack items that are edible
  const backpackFoods = useMemo(() => {
    const backpack = currentPlayer.backpack || [];
    
    const foods = backpack
      .filter(item => edibleResources.some(r => r.type === item.type))
      .map(item => {
        const resourceData = edibleResources.find(r => r.type === item.type);
        return {
          ...item,
          hp: resourceData.hp,
          symbol: resourceData.symbol
        };
      });
    
    return foods;
  }, [currentPlayer.backpack, edibleResources]);

  // Get warehouse items (inventory) that are edible (only if in homestead)
  const warehouseFoods = useMemo(() => {
    const isInSafeLocation = currentPlayer.location?.gtype === 'homestead';
    
    if (!isInSafeLocation) return [];

    const inventory = currentPlayer.inventory || [];
    
    const foods = inventory
      .filter(item => {
        const hasMatch = edibleResources.some(r => r.type === item.type);
        return hasMatch;
      })
      .map(item => {
        const resourceData = edibleResources.find(r => r.type === item.type);
        return {
          ...item,
          hp: resourceData.hp,
          symbol: resourceData.symbol
        };
      });
    
    return foods;
  }, [currentPlayer.inventory, currentPlayer.location?.gtype, edibleResources]);

  // Handle amount change for eating
  const handleAmountChange = (itemType, newAmount, maxQuantity) => {
    // Get current and max HP from PlayersInGrid
    const gridId = currentPlayer.location?.g;
    const playerId = String(currentPlayer._id || currentPlayer.playerId);
    const playersInGrid = playersInGridManager.getPlayersInGrid(gridId);
    const currentHp = playersInGrid?.[playerId]?.hp || 0;
    const maxHp = playersInGrid?.[playerId]?.maxhp || 100;
    
    // Calculate how much HP we can still gain
    const hpNeeded = maxHp - currentHp;
    
    if (hpNeeded <= 0) {
      // Already at max HP, can't eat anything
      setEatAmounts(prev => ({
        ...prev,
        [itemType]: 0
      }));
      return;
    }
    
    // Find the resource data to get HP per item
    const resourceData = edibleResources.find(r => r.type === itemType);
    const hpPerItem = resourceData?.hp || 1;
    
    // Calculate max items we can eat based on HP needed
    const maxItemsForHp = Math.floor(hpNeeded / hpPerItem);
    
    // The actual max is the minimum of: available quantity, HP-limited quantity, and requested amount
    const effectiveMax = Math.min(maxQuantity, maxItemsForHp);
    const clampedAmount = Math.max(0, Math.min(newAmount, effectiveMax));
    
    setEatAmounts(prev => ({
      ...prev,
      [itemType]: clampedAmount
    }));
  };

  // Calculate HP to add based on quantity * resource.hp
  const getHpToAdd = (itemType, hp) => {
    const amount = eatAmounts[itemType] || 0;
    return amount * hp;
  };

  // Handle eating an item
  const handleEat = async (item, isFromWarehouse = false) => {
    const amountToEat = eatAmounts[item.type] || 0;
    if (amountToEat <= 0 || amountToEat > item.quantity) {
      updateStatus("Invalid amount to eat.");
      return;
    }

    const hpToAdd = amountToEat * item.hp;
    
    try {
      // Update player HP in PlayersInGrid
      const gridId = currentPlayer.location?.g;
      if (gridId) {
        const playerId = currentPlayer._id || currentPlayer.playerId;
        const currentHp = playersInGridManager.getPlayersInGrid(gridId)?.[playerId]?.hp || 0;
        const maxHp = playersInGridManager.getPlayersInGrid(gridId)?.[playerId]?.maxhp || 100;
        const newHp = Math.min(currentHp + hpToAdd, maxHp);
        
        playersInGridManager.updatePC(gridId, playerId, { hp: newHp });
        
        // Update current player state
        setCurrentPlayer(prev => ({
          ...prev,
          hp: newHp
        }));
      }

      // Remove eaten items from inventory
      const inventoryType = isFromWarehouse ? 'inventory' : 'backpack';
      setCurrentPlayer(prev => ({
        ...prev,
        [inventoryType]: prev[inventoryType].map(invItem => 
          invItem.type === item.type 
            ? { ...invItem, quantity: invItem.quantity - amountToEat }
            : invItem
        ).filter(invItem => invItem.quantity > 0)
      }));

      // Reset all eat amounts to clear the modal
      setEatAmounts({});

      updateStatus(`🍽️ Ate ${amountToEat} ${item.type}(s) ${strings[1404]} +${hpToAdd} ❤️‍🩹 ${strings[10157]}`);
      
    } catch (error) {
      console.error("Error eating item:", error);
      updateStatus("Failed to eat item.");
    }
  };

  // Render a food section (backpack or warehouse)
  const renderFoodSection = (foods, title, isWarehouse = false) => {
    if (foods.length === 0) {
      return (
        <div className="eating-section">
          <h3>{title}</h3>
          <p>No edible items available.</p>
        </div>
      );
    }

    return (
      <div className="eating-section">
        <h3>{title}</h3>
        <div className="eating-container">
          <div className="eating-header">
            <table>
              <thead>
                <tr>
                  <th>{strings[191]}</th>
                  <th>{strings[10156]}</th>
                  <th>{strings[10157]}</th>
                  <th>{strings[10158]}</th>
                  <th>{strings[10159]}</th>
                  <th>{strings[192]}</th>
                </tr>
              </thead>
            </table>
          </div>
          
          <div className="eating-scroll">
            <table>
              <tbody>
                {foods.map((item, index) => (
                  <tr key={`${item.type}-${index}`}>
                    <td>
                      {item.symbol} {getLocalizedString(item.type, strings)}
                    </td>
                    <td>{item.quantity.toLocaleString()}</td>
                    <td>{item.hp}</td>
                    <td>
                      <div className="amount-input">
                        <button
                          onClick={() =>
                            handleAmountChange(item.type, (eatAmounts[item.type] || 0) - 1, item.quantity)
                          }
                          disabled={(eatAmounts[item.type] || 0) <= 0}
                        >
                          -
                        </button>
                        <input
                          type="number"
                          value={eatAmounts[item.type] || 0}
                          onChange={(e) =>
                            handleAmountChange(item.type, parseInt(e.target.value, 10) || 0, item.quantity)
                          }
                          min="0"
                          max={item.quantity}
                        />
                        <button
                          onClick={() =>
                            handleAmountChange(item.type, (eatAmounts[item.type] || 0) + 1, item.quantity)
                          }
                          disabled={(() => {
                            // Check both quantity limit and HP limit
                            const currentAmount = eatAmounts[item.type] || 0;
                            if (currentAmount >= item.quantity) return true;
                            
                            const gridId = currentPlayer.location?.g;
                            const playerId = String(currentPlayer._id || currentPlayer.playerId);
                            const playersInGrid = playersInGridManager.getPlayersInGrid(gridId);
                            const currentHp = playersInGrid?.[playerId]?.hp || 0;
                            const maxHp = playersInGrid?.[playerId]?.maxhp || 100;
                            const hpNeeded = maxHp - currentHp;
                            const maxItemsForHp = Math.floor(hpNeeded / item.hp);
                            
                            return currentAmount >= maxItemsForHp;
                          })()}
                        >
                          +
                        </button>
                        <button
                          onClick={() => {
                            // Calculate HP-limited max for this item
                            const gridId = currentPlayer.location?.g;
                            const playerId = String(currentPlayer._id || currentPlayer.playerId);
                            const playersInGrid = playersInGridManager.getPlayersInGrid(gridId);
                            const currentHp = playersInGrid?.[playerId]?.hp || 0;
                            const maxHp = playersInGrid?.[playerId]?.maxhp || 100;
                            const hpNeeded = maxHp - currentHp;
                            const maxItemsForHp = Math.floor(hpNeeded / item.hp);
                            const effectiveMax = Math.min(item.quantity, maxItemsForHp);
                            handleAmountChange(item.type, effectiveMax, item.quantity);
                          }}
                          style={{ marginLeft: '4px' }}
                          title="Max"
                        >
                          {strings[10160]}
                        </button>
                      </div>
                    </td>
                    <td>
                      <strong>{getHpToAdd(item.type, item.hp)}</strong>
                    </td>
                    <td>
                      <button
                        className="eat-button"
                        onClick={() => handleEat(item, isWarehouse)}
                        disabled={!(eatAmounts[item.type] > 0 && eatAmounts[item.type] <= item.quantity)}
                      >
                        {strings[78]}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-container eating-modal-container">
        <button className="modal-close-btn" onClick={onClose}>×</button>
        
        <div className="modal-title">{strings[10161]} ({currentPlayer?._id ? playersInGridManager.getPlayersInGrid(currentPlayer?.location?.g)?.[String(currentPlayer._id)]?.hp ?? "?" : "?"}/{currentPlayer?._id ? playersInGridManager.getPlayersInGrid(currentPlayer?.location?.g)?.[String(currentPlayer._id)]?.maxhp ?? "?" : "?"})</div>
        
        <div className="modal-content">
          {/* Backpack Food Section */}
          {renderFoodSection(backpackFoods, `${strings[182]}`, false)}
          
          {/* Warehouse Food Section (only if in homestead) */}
          {currentPlayer.location?.gtype === 'homestead' && (
            renderFoodSection(warehouseFoods, `${strings[181]}`, true)
          )}
          
          {backpackFoods.length === 0 && warehouseFoods.length === 0 && (
            <div className="no-food-message">
              <p>{strings[10162]} {
                currentPlayer.location?.gtype === 'homestead' 
                  ? 'backpack or warehouse' 
                  : 'backpack'
              }.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EatingModal;