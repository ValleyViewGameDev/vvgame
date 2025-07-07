import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import './ResourceButton.css';
 
const ResourceButton = ({ symbol, name, details, info, disabled, className, onClick, hideInfo = false, children }) => { 
  const [showInfo, setShowInfo] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef(null);

  const updateTooltipPosition = (event) => {
    setTooltipPosition({
      top: event.clientY + window.scrollY + 10, // ✅ Adjust Y position (below cursor)
      left: event.clientX + window.scrollX + 15, // ✅ Adjust X position (to the right of cursor)
    });
  };

  return (
    <>
      <div
        className="resource-button-wrapper"
        onMouseLeave={() => setShowInfo(false)}
      >
        <button
          ref={buttonRef}
          className={`resource-button ${disabled ? 'disabled' : ''} ${className || ''}`}
          onClick={onClick}
          disabled={disabled}
        >

          {/* ✅ Ensure default content is displayed */}
          <span className="resource-title">
            {symbol} {name}
          </span>
          <span className="resource-details" dangerouslySetInnerHTML={{ __html: details }} />


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