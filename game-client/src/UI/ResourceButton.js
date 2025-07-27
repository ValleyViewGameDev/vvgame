import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import './ResourceButton.css';
 
const ResourceButton = ({ 
  symbol, 
  name, 
  details, 
  info, 
  disabled, 
  className, 
  onClick, 
  hideInfo = false, 
  children,
  // Transaction support props
  transactionKey,
  onTransactionAction,
  isTransactionMode = false
}) => { 
  const [showInfo, setShowInfo] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const [isProcessing, setIsProcessing] = useState(false);
  const [transactionId] = useState(() => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  const buttonRef = useRef(null);

  const updateTooltipPosition = (event) => {
    setTooltipPosition({
      top: event.clientY + window.scrollY + 10, // ✅ Adjust Y position (below cursor)
      left: event.clientX + window.scrollX + 15, // ✅ Adjust X position (to the right of cursor)
    });
  };

  const handleClick = async (e) => {
    if (disabled || isProcessing) return;

    if (isTransactionMode && onTransactionAction && transactionKey) {
      // Transaction mode - prevent multiple clicks
      e.preventDefault();
      e.stopPropagation();
      
      setIsProcessing(true);
      try {
        await onTransactionAction(transactionId, transactionKey);
      } catch (error) {
        console.error('Transaction failed:', error);
      } finally {
        setIsProcessing(false);
      }
    } else if (onClick) {
      // Normal mode
      onClick(e);
    }
  };

  return (
    <>
      <div
        className="resource-button-wrapper"
        onMouseLeave={() => setShowInfo(false)}
      >
        <button
          ref={buttonRef}
          className={`resource-button ${disabled || isProcessing ? 'disabled' : ''} ${className || ''} ${isProcessing ? 'processing' : ''}`}
          onClick={handleClick}
          disabled={disabled || isProcessing}
          style={{
            opacity: (disabled || isProcessing) ? 0.6 : 1,
            cursor: (disabled || isProcessing) ? 'not-allowed' : 'pointer'
          }}
        >

          {/* ✅ Ensure default content is displayed */}
          <span className="resource-title">
            {isProcessing ? '⏳' : symbol} {name}
          </span>
          <span className="resource-details" dangerouslySetInnerHTML={{ 
            __html: isProcessing ? details.replace(/✅ Ready!/, 'Processing...') : details 
          }} />


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
            >
              ℹ️
            </span>
            )}

        </button>
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
    </>
  );
};

export default ResourceButton;