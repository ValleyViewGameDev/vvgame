import React, { useState, useEffect } from 'react';

// Shared transition overlay utility for location changes
const TransitionOverlay = ({ isTransitioning, onTransitionComplete }) => {
  const [opacity, setOpacity] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [homesteadElement, setHomesteadElement] = useState(null);

  // Find the homestead container on mount
  useEffect(() => {
    const element = document.querySelector('.homestead');
    setHomesteadElement(element);
  }, []);

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

  if (!isVisible || !homesteadElement) return null;

  // Get the homestead container's position and dimensions
  const rect = homesteadElement.getBoundingClientRect();

  return (
    <div
      style={{
        position: 'absolute',
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
        height: rect.height,
        backgroundColor: '#000000',
        opacity: opacity,
        transition: 'opacity 0.3s ease-in-out',
        zIndex: 1000, // High z-index to cover homestead content
        pointerEvents: isTransitioning ? 'all' : 'none', // Block interaction during transition
      }}
    />
  );
};

export default TransitionOverlay;