import API_BASE from '../../config'; 
import { isTouchPrimary } from '../../Utils/inputMode';
import React, { useState, useEffect } from 'react';
import Panel from '../../UI/Panels/Panel';
import axios from 'axios';
import ResourceButton from '../../UI/Buttons/ResourceButton';

import { resourceIconHtml } from '../../UI/Icons/ResourceIcon';
import { handleConstruction, handleConstructionWithGems } from '../BuildAndBuy';
import { getIngredientDetails, hasRequiredSkill as checkRequiredSkill, isVisibleToPlayer, isDevOnly } from '../../Utils/ResourceHelpers';
import { canAfford, getPlayerQuantity } from '../../Utils/InventoryManagement';
import { usePanelContext } from '../../UI/Panels/PanelContext';
import '../../UI/Buttons/ResourceButton.css'; // ✅ Ensure the correct path
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import { updatePlayerSettings } from '../../settings';
import { loadMasterResources } from '../../Utils/TuningManager';

// The catalogue's sections (resources.json decoGroup, docs/art/deco-pass-plan.md §C), in this order;
// a row with no group lands in "Other" at the end
const DECO_GROUPS = [
  { key: 'farm', stringId: 200720, label: 'Farm' },
  { key: 'garden', stringId: 200721, label: 'Garden' },
  { key: 'furniture', stringId: 200722, label: 'Furniture' },
  { key: 'statuary', stringId: 200723, label: 'Statuary' },
  { key: 'castle', stringId: 200724, label: 'Castle' },
  { key: 'village', stringId: 200725, label: 'Village' },
  { key: 'walls', stringId: 200726, label: 'Walls and Fences' },
  { key: 'other', stringId: 200727, label: 'Other' },
];
// a row's groups: "castle;statuary" lists it under both tabs (owner 2026-11-08); unknown or none = other
const decoGroupsOf = (item) => {
  const keys = String(item.decoGroup || '').split(/[;,]/).map((k) => k.trim()).filter((k) => DECO_GROUPS.some((g) => g.key === k));
  return keys.length ? keys : ['other'];
};
const decoGroupOf = (item) => decoGroupsOf(item)[0];

const BuyDecoPanel = ({
  TILE_SIZE,
  resources,
  setResources,
  inventory,
  setInventory, 
  backpack,
  setBackpack,
  currentPlayer,
  setCurrentPlayer,
  gridId,
  masterResources, 
  masterSkills, 
  updateStatus,
  isDeveloper,
  currentSeason,
  cursorMode,
  setCursorMode,
}) => {
  const { closePanel } = usePanelContext();
  const [buyOptions, setBuyOptions] = useState([]);
  const [decoTab, setDecoTab] = useState('all'); // the catalogue tab (All or a decoGroup)
  const [allResources, setAllResources] = useState([]);
  const [isContentLoading, setIsContentLoading] = useState(false);
  const strings = useStrings();
  const [placeWithCursor, setPlaceWithCursor] = useState(
    isTouchPrimary() || (currentPlayer?.settings?.plantWithCursor ?? false) // phones always place with the cursor (the toggle is hidden)
  );

  // Toggle handler - persists to player settings
  const handleToggleChange = (checked) => {
    setPlaceWithCursor(checked);
    if (!checked) {
      setCursorMode(null);
    }
    // Persist to player settings (uses same setting as farming panel)
    updatePlayerSettings({ plantWithCursor: checked }, currentPlayer, setCurrentPlayer);
  };

  // Handle selecting an item for cursor mode
  const handleCursorModeSelect = (item) => {
    setCursorMode({
      type: 'build',
      item: item.type,
      emoji: item.symbol || '🪴',
      filename: item.filename || null,
      size: item.size || 1, sizeX: item.sizeX, sizeY: item.sizeY,
      buildOptions: buyOptions,
    });
  };

  useEffect(() => {
    const fetchData = async () => {
//      setIsContentLoading(true);
      try { 
        // the inventory refresh runs alongside; the panel never waits on it
        axios.get(`${API_BASE}/api/inventory/${currentPlayer.playerId}`)
          .then((r) => setInventory(r.data.inventory || []))
          .catch((e) => console.error('Error refreshing inventory:', e));
        const allResourcesData = await loadMasterResources(); // cached at boot: no round trip
        setAllResources(allResourcesData);
        const isHomestead = currentPlayer?.location?.gtype === 'homestead';
        const purchasableItems = allResourcesData.filter(
          (resource) => {
            // Filter out devonly resources unless player is a developer
            if (!isVisibleToPlayer(resource, isDeveloper)) return false;

            // Check if resource is a deco item
            if (resource.source !== 'Deco') return false;

            // Check passability based on location
            if (!isDeveloper && !isHomestead && resource.passable === false) return false;

            // Check seasonal restriction
            if (resource.season && currentSeason && resource.season !== currentSeason) {
              return false;
            }

            return true;
          }
        );
        // Always cheapest first, on every tab (owner 2026-11-08): the price is the one order a
        // catalogue of deco needs, and a sub-sort keeps it
        purchasableItems.sort((a, b) => (Number(a.ingredient1qty) || 0) - (Number(b.ingredient1qty) || 0));
        setBuyOptions(purchasableItems);
      } catch (error) {
        console.error('Error fetching buy panel data:', error);
      } finally {
        setIsContentLoading(false);
      }
    }; 

    fetchData();
  }, [currentPlayer]);

  // Local wrapper for the utility function
  const hasRequiredSkill = (requiredSkill) => checkRequiredSkill(requiredSkill, currentPlayer);

  const handleGemPurchase = async (modifiedRecipe) => {
    // If placeWithCursor is enabled, put the gem-modified item into cursor mode
    if (placeWithCursor) {
      const item = buyOptions.find(opt => opt.type === modifiedRecipe.type) || modifiedRecipe;
      setCursorMode({
        type: 'build',
        item: modifiedRecipe.type,
        emoji: item.symbol || '🪴',
        filename: item.filename || null,
        size: item.size || 1, sizeX: item.sizeX, sizeY: item.sizeY,
        buildOptions: buyOptions,
        modifiedRecipe: modifiedRecipe, // Include the gem-modified recipe for cursor placement
      });
      return;
    }
    // Normal mode: place at player position immediately with gems
    return handleConstructionWithGems({
      TILE_SIZE,
      selectedItem: modifiedRecipe.type,
      buildOptions: buyOptions,
      inventory,
      setInventory,
      backpack,
      setBackpack,
      resources,
      setResources,
      currentPlayer,
      setCurrentPlayer,
      gridId,
      updateStatus,
      modifiedRecipe, // Pass the gem-modified recipe
    });
  };

  return (
    <Panel onClose={closePanel} descriptionKey="1031" titleKey="1131" panelName="BuyDecoPanel">
      <div className="standard-panel">
        {/* Place with cursor toggle (not on phones) */}
        {!isTouchPrimary() && (
          <div className="cursor-toggle-row">
            <label className="cursor-toggle-label">
              {strings[10187] || 'Place with cursor'}
            </label>
            <input
              type="checkbox"
              checked={placeWithCursor}
              onChange={(e) => handleToggleChange(e.target.checked)}
              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
            />
          </div>
        )}

        {isContentLoading ? (
          <p>{strings[98]}</p>
        ) : (
          <>
            {/* the catalogue's tabs (owner 2026-11-08): All, then one per decoGroup present; the same
                .tab-button row the Trade Stall uses */}
            <div className="tab-navigation buy-deco-tabs">
              {[{ key: 'all', stringId: 200728, label: 'All' }, ...DECO_GROUPS.filter((g) => buyOptions.some((it) => decoGroupsOf(it).includes(g.key)))].map((g) => (
                <button key={g.key} className={`tab-button ${decoTab === g.key ? 'active' : ''}`} onClick={() => setDecoTab(g.key)}>{strings[g.stringId] || g.label}</button>
              ))}
            </div>
            {[null].map(() => (
            <React.Fragment key="list">
            {buyOptions.filter((it) => decoTab === 'all' || decoGroupsOf(it).includes(decoTab)).map((item) => {
              const ingredients = getIngredientDetails(item, allResources);
              const affordable = canAfford(item, inventory);
              const requirementsMet = hasRequiredSkill(item.requires);
              const isDisabled = !affordable || !requirementsMet;
              const isSelectedForCursor = cursorMode?.type === 'build' && cursorMode?.item === item.type;

              // Build className based on state
              let buttonClassName = '';
              if (isSelectedForCursor) buttonClassName += 'cursor-selected ';

              const formattedCosts = [1, 2, 3, 4].map((i) => {
                const type = item[`ingredient${i}`];
                const qty = item[`ingredient${i}qty`];
                if (!type || !qty) return '';

                const playerQty = getPlayerQuantity(type, inventory, backpack); // backpack + warehouse
                const color = playerQty >= qty ? 'var(--color-text-positive)' : 'var(--color-text-negative)';
                return `<span style="color: ${color}; display: block;">${resourceIconHtml(type, allResources)} ${getLocalizedString(type, strings)} ${qty} / ${playerQty}</span>`;
              }).join('');

              const skillColor = requirementsMet ? 'var(--color-text-positive)' : 'var(--color-text-negative)';
              const details =
                (item.requires ? `<span style="color: ${skillColor};">${strings[460]}${getLocalizedString(item.requires, strings)}</span>` : '') +
                `${strings[461]}<div>${formattedCosts}</div>`;

              return (
                <ResourceButton
                  key={item.type}
                  symbol={item.symbol}
                  name={getLocalizedString(item.type, strings)}
                  details={details}
                  disabled={isDisabled}
                  className={buttonClassName}
                  onClick={() => {
                    if (isDisabled) return;
                    if (placeWithCursor) {
                      // In cursor mode: select this item for placing via clicks
                      handleCursorModeSelect(item);
                    } else {
                      // Normal mode: place at player position immediately
                      handleConstruction({
                        TILE_SIZE,
                        selectedItem: item.type,
                        buildOptions: buyOptions,
                        inventory,
                        setInventory,
                        backpack,
                        setBackpack,
                        resources,
                        setResources,
                        setErrorMessage: console.error,
                        currentPlayer,
                        setCurrentPlayer,
                        gridId,
                        updateStatus,
                      });
                    }
                  }}
                  // Gem purchase props - gemCost=null so dynamic calculation is used for missing ingredients
                  gemCost={null}
                  onGemPurchase={(item.gemcost && isDisabled) ? handleGemPurchase : null}
                  resource={item}
                  inventory={inventory}
                  backpack={backpack}
                  masterResources={masterResources || allResources}
                  currentPlayer={currentPlayer}
                  devOnly={isDevOnly(item)}
                  filename={item.filename}
                />
              );
            })}
            </React.Fragment>
            ))}
          </>
        )}
      </div>
    </Panel>
  );
};

export default React.memo(BuyDecoPanel);