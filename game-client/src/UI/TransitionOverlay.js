import React, { useState, useEffect } from 'react';

// Shared transition overlay utility for location changes
const TransitionOverlay = ({ isTransitioning, onTransitionComplete }) => {
  const [opacity, setOpacity] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isTransitioning) {
      // Start transition - fade to black
      setIsVisible(true);
      // Small delay to ensure DOM update, then start fade
      requestAnimationFrame(() => {
        setOpacity(1);
      });
    } else {
      // End transition - fade back to transparent
      setOpacity(0);
      // Wait for fade animation to complete before hiding
      const timer = setTimeout(() => {
        setIsVisible(false);
        if (onTransitionComplete) {
          onTransitionComplete();
        }
      }, 300); // Match CSS transition duration
      
      return () => clearTimeout(timer);
    }
  }, [isTransitioning, onTransitionComplete]);

  if (!isVisible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: '#000000',
        opacity: opacity,
        transition: 'opacity 0.3s ease-in-out',
        zIndex: 9999, // High z-index to cover everything
        pointerEvents: isTransitioning ? 'all' : 'none', // Block interaction during transition
      }}
    />
  );
};

export default TransitionOverlay;