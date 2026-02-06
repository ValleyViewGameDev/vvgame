import React, { useState, useRef, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { calculateGemPurchase } from '../../Economy/GemCosts';
import { useStrings } from '../StringsContext';
import { usePanelContext } from '../Panels/PanelContext';
import { formatNumber } from '../Timers';
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
  noClickSfx = false
}) => { 
  const strings = useStrings();
  const { openPanel } = usePanelContext();
  const [showInfo, setShowInfo] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const [isProcessing, setIsProcessing] = useState(false);
  const [transactionId, setTransactionId] = useState(() => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  const [showGemTooltip, setShowGemTooltip] = useState(false);
  const [gemTooltipPosition, setGemTooltipPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef(null);
  
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

  const updateTooltipPosition = (event) => {
    setTooltipPosition({
      top: event.clientY + window.scrollY + 10, // ✅ Adjust Y position (below cursor)
      left: event.clientX + window.scrollX + 15, // ✅ Adjust X position (to the right of cursor)
    });
  };

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
      setIsProcessing(true);
      try {
        await onTransactionAction(transactionId, transactionKey);
        console.log(`✅ [RESOURCE_BUTTON] Transaction completed for ${transactionKey}`);
        // Generate a new transactionId for the next transaction
        setTransactionId(`${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
      } catch (error) {
        console.error('Transaction failed:', error);
      } finally {
        console.log(`🔓 [RESOURCE_BUTTON] Clearing processing state for ${transactionKey}`);
        setIsProcessing(false);
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
        className="resource-button-wrapper"
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
          
          {/* ✅ Hide "ℹ️" info button when `hideInfo` is true */}
          {!hideInfo && info && (
            <span
              className="info-button"
              onMouseEnter={(event) => {
                setShowInfo(true);
                updateTooltipPosition(event);
              }}
              onMouseMove={updateTooltipPosition} // ✅ Dynamically reposition on cursor move
              onMouseLeave={() => setShowInfo(false)}
            >
              ℹ️
            </span>
            )}

        </button>

        {/* ✅ Gem button for gem purchases - moved outside button so it's always clickable */}
        {/* Hidden when level requirement not met - cannot bypass level requirements with gems */}
        {!hideGem && meetsLevelRequirement && shouldCalculateGem && gemCalculation && !isProcessing && (
          <span
            className="gem-button"
            onClick={handleGemClick}
            onMouseEnter={(event) => {
              setShowGemTooltip(true);
              updateGemTooltipPosition(event);
            }}
            onMouseMove={updateGemTooltipPosition}
            onMouseLeave={() => setShowGemTooltip(false)}
          >
            💎
          </span>
        )}
      </div>

      {/* ✅ Render info toaster inside `document.body` for proper layering */}
      {showInfo && info && ReactDOM.createPortal(
        <div
          className="info-toaster"
          style={{
            top: tooltipPosition.top,
            left: tooltipPosition.left,
            position: 'absolute', // ✅ Prevents clipping
          }}
        >
          {typeof info === 'string' ? (
            <p dangerouslySetInnerHTML={{ __html: info }} />
          ) : (
            <>{info}</> // ✅ Supports JSX rendering
          )}
        </div>,
        document.body
      )}

      {/* ✅ Render gem tooltip inside `document.body` for proper layering */}
      {showGemTooltip && gemCalculation && ReactDOM.createPortal(
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