import React from 'react';
import './ZoomedOut.css';

// Helper function for grid tile colors
export const getGridBackgroundColor = (type) => {
  switch (type) {
    // Settlement grid types
    case "homestead":
    case "homesteadSet":
      return 'var(--homestead-color)';
    
    // Valley types (both views)
    case "valley0":
    case "valley1":
    case "valley2":
    case "valley3":
    case "valley0Set":  
    case "valley1Set":
    case "valley2Set":
    case "valley3Set":
      return 'var(--valley-color)';
    
    // Settlement-specific types
    case "reserved":
      return 'var(--reserved-color)';
    case "town":
      return 'var(--town-color)';
    
    default:
      return 'var(--unknown-color)';
  }
};

const ZoomOut = ({ children }) => {
  return (
    <div className="zoom-out-container">
      {children}
    </div>
  );
};

export default ZoomOut;
