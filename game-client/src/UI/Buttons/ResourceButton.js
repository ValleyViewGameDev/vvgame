import React, { useState, useRef, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { calculateGemPurchase } from '../../Economy/GemCosts';
import { useStrings } from '../StringsContext';
import { usePanelContext } from '../Panels/PanelContext';
import { formatNumber } from '../Timers';
import { canHover } from '../../Utils/inputMode';
import InfoButton from './InfoButton';
import './ResourceButton.css';

// Function to format numbers in HTML details strings
const formatDetailsForDisplay = (details) => {
  if (!details || typeof details !== 'string') {
    return details;
  }
  
  // Replace standalone numbers (not part of words) with formatted versions
  // This regex finds numbers that are either at word boundaries or surrounded by non-alphanumeric characters
  return details.replace(/\b(\d{4,})\b/g, (match, number) => {
    return formatNumber(parseInt(number, 10));
  });
};
 
const ResourceButton = ({
  symbol,
  name,
  details,
  info,
  disabled,
  className,
  style,
  onClick,
  hideInfo = false,
  children,
  // Transaction support props
  transactionKey,
  onTransactionAction,
  isTransactionMode = false,
  // Gem button props
  gemCost = null,
  onGemPurchase = null,
  hideGem = false,
  // Level requirement - if false, gem button is hidden (cannot bypass level with gems)
  meetsLevelRequirement = true,
  // For gem calculation
  resource = null,
  inventory = null,
  backpack = null,
  masterResources = null,
  currentPlayer = null,
  // Developer-only styling - applies danger/red tint to buttons for devonly resources
  devOnly = false,
  // SVG filename - when provided, shows SVG image instead of emoji symbol
  filename = null,
  // Resource type - used for data attribute to enable CSS selector targeting
  resourceType = null,
  // When true, suppresses the global button_press SFX (use when button has its own SFX)
  noClickSfx = false,
  // External processing state - used for cursor mode where processing happens outside the button
  externalProcessing = false
}) => {
  const strings = useStrings();
  const { openPanel } = usePanelContext();
  const [internalProcessing, setInternalProcessing] = useState(false);
  // Combined processing state - either internal (transaction mode) or external (cursor mode)
  const isProcessing = internalProcessing || externalProcessing;
  const [transactionId, setTransactionId] = useState(() => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  const [showGemTooltip, setShowGemTooltip] = useState(false);
  const [gemTooltipPosition, setGemTooltipPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef(null);
  // Touch screens get no hovertips: ℹ️ opens on a tap (InfoButton) and the gem cost is printed on
  // the gem button itself (every layout; desktop's hover tooltip adds the breakdown).
  const hoverTips = canHover();
  
  // Only create gem calculation when we have gem functionality enabled
  const shouldCalculateGem = !!(resource && inventory && backpack && masterResources && currentPlayer && onGemPurchase && (gemCost || resource?.gemcost));
  
  const gemCalculation = useMemo(() => {
    if (!shouldCalculateGem) {
      return null;
    }
    
    try {
      return calculateGemPurchase({
        resource,
        inventory,
        backpack,
        masterResources,
        currentPlayer,
        strings,
        overrideGemCost: gemCost // Pass the explicit gem cost if provided
      });
    } catch (error) {
      console.error('Error creating gem calculation:', error);
      return null;
    }
  }, [shouldCalculateGem, resource, inventory, backpack, masterResources, currentPlayer, strings]);

  // Debug processing state changes
  useEffect(() => {
    if (isTransactionMode && transactionKey) {
      console.log(`📱 [RESOURCE_BUTTON] Processing state changed: ${isProcessing} for ${transactionKey}`);
    }
  }, [isProcessing, transactionKey, isTransactionMode]);

  const updateGemTooltipPosition = (event) => {
    setGemTooltipPosition({
      top: event.clientY + window.scrollY + 10,
      left: event.clientX + window.scrollX + 15,
    });
  };

  const handleClick = async (e) => {
    if (disabled || isProcessing) return;

    if (isTransactionMode && onTransactionAction && transactionKey) {
      // Transaction mode - prevent multiple clicks
      e.preventDefault();
      e.stopPropagation();
      
      console.log(`🔒 [RESOURCE_BUTTON] Setting processing state for ${transactionKey}`);
      setInternalProcessing(true);
      try {
        await onTransactionAction(transactionId, transactionKey);
        console.log(`✅ [RESOURCE_BUTTON] Transaction completed for ${transactionKey}`);
        // Generate a new transactionId for the next transaction
        setTransactionId(`${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
      } catch (error) {
        console.error('Transaction failed:', error);
      } finally {
        console.log(`🔓 [RESOURCE_BUTTON] Clearing processing state for ${transactionKey}`);
        setInternalProcessing(false);
      }
    } else if (onClick) {
      // Normal mode
      onClick(e);
    }
  };

  const handleGemClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (onGemPurchase && gemCalculation) {
      if (gemCalculation.hasEnoughGems) {
        // Has enough gems - execute the purchase
        const modifiedRecipe = gemCalculation.getModifiedRecipe();
        onGemPurchase(modifiedRecipe);
      } else {
        // Not enough gems - open the HowToGemsPanel
        openPanel('HowToGemsPanel');
      }
    }
  };

  return (
    <>
      <div
        className={`resource-button-wrapper ${/\bmini\b/.test(className || '') ? 'resource-button-wrapper--mini' : ''}`}
        data-resource-type={resourceType || name}
      >
        <button
          ref={buttonRef}
          className={`resource-button ${disabled || isProcessing ? 'disabled' : ''} ${className || ''} ${isProcessing ? 'processing' : ''} ${devOnly ? 'dev-only' : ''}`}
          onClick={handleClick}
          disabled={disabled || isProcessing}
          data-no-click-sfx={noClickSfx ? 'true' : undefined}
          style={{
            opacity: (disabled || isProcessing) ? 0.6 : 1,
            cursor: (disabled || isProcessing) ? 'not-allowed' : 'pointer',
            ...style
          }}
        >

          {/* ✅ Ensure default content is displayed - keep visible during processing */}
          <span className="resource-title">
            {filename ? (
              <img
                src={`/assets/resources/${filename}`}
                alt={name}
                style={{
                  width: '24px',
                  height: '24px',
                  verticalAlign: 'middle',
                  marginRight: '4px'
                }}
              />
            ) : symbol} {name}
          </span>
          <span className="resource-details" dangerouslySetInnerHTML={{
            __html: details ? formatDetailsForDisplay(details) : details
          }} />

          {/* Processing overlay - hourglass centered on button */}
          {isProcessing && (
            <span className="resource-button-processing-overlay">⏳</span>
          )}


          {/* ✅ Render children properly (fixes missing text issue) */}
          {children}
          
        </button>

        {/* ℹ️ details: hover on desktop, tap on touch. Outside the <button> so a tap on it never
            fires the button, and still works when the button is disabled. */}
        {!hideInfo && info && <InfoButton info={info} />}

        {/* ✅ Gem button for gem purchases - moved outside button so it's always clickable */}
        {/* Hidden when level requirement not met - cannot bypass level requirements with gems */}
        {!hideGem && meetsLevelRequirement && shouldCalculateGem && gemCalculation && !isProcessing && (
          <span
            className="gem-button"
            onClick={handleGemClick}
            onMouseEnter={(event) => {
              if (!hoverTips) return;
              setShowGemTooltip(true);
              updateGemTooltipPosition(event);
            }}
            onMouseMove={(event) => { if (hoverTips) updateGemTooltipPosition(event); }}
            onMouseLeave={() => setShowGemTooltip(false)}
          >
            💎{gemCalculation.gemCost != null ? <span className="gem-button-cost">{formatNumber(gemCalculation.gemCost)}</span> : null}
          </span>
        )}
      </div>

      {/* ✅ Render gem tooltip inside `document.body` for proper layering */}
      {showGemTooltip && gemCalculation && hoverTips && ReactDOM.createPortal(
        <div
          style={{
            top: gemTooltipPosition.top,
            left: gemTooltipPosition.left,
            position: 'absolute',
            zIndex: 99999,
          }}
        >
          {gemCalculation.render()}
        </div>,
        document.body
      )}
    </>
  );
};

export default ResourceButton;