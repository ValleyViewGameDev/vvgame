import React from 'react';
import './ZoomedOut.css';

const ZoomOut = ({ children }) => {
  return (
    <div className="zoom-out-container">
      {children}
    </div>
  );
};

export default ZoomOut;
