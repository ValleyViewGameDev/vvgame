import React, { createContext, useContext, useRef, useCallback, useState } from 'react';

const TransitionContext = createContext(null);

// Fade durations in ms
const FADE_TO_BLACK_DURATION = 600;  // Slower fade to black (feels more deliberate)
const FADE_FROM_BLACK_DURATION = 900; // Faster reveal of new scene

// Fixed positioning for the game area overlay
// These match the CSS layout: header (85px), nav column (300px)
const OVERLAY_STYLE = {
  position: 'fixed',
  top: '85px',
  left: '300px',
  right: 0,
  bottom: 0,
  backgroundColor: '#000000',
  opacity: 0,
  // Transition duration set dynamically via ref based on fade direction
  zIndex: 9999, // Very high to ensure it's on top of everything
  pointerEvents: 'all',
};

export const useTransition = () => {
  const context = useContext(TransitionContext);
  if (!context) {
    throw new Error('useTransition must be used within TransitionProvider');
  }
  return context;
};

/**
 * TransitionProvider - Manages screen fade transitions for grid travel and app initialization
 *
 * Uses a lock mechanism to prevent overlapping transitions and Promise-based API
 * for explicit control flow. The overlay uses fixed positioning to cover the game area
 * (right of nav, below header) regardless of whether .homestead exists.
 *
 * Usage:
 *   const { fadeToBlack, fadeFromBlack } = useTransition();
 *   await fadeToBlack();   // Screen fades to black
 *   // ... do loading work ...
 *   await fadeFromBlack(); // Screen fades back to normal
 */
export const TransitionProvider = ({ children }) => {
  const overlayRef = useRef(null);
  const isLockedRef = useRef(false);
  const [isVisible, setIsVisible] = useState(false);

  // Returns a Promise that resolves when fade-to-black is complete
  const fadeToBlack = useCallback(() => {
    return new Promise((resolve) => {
      if (isLockedRef.current) {
        console.log('🎬 [TRANSITION] Already locked, resolving immediately');
        resolve();
        return;
      }

      console.log('🎬 [TRANSITION] fadeToBlack starting');
      isLockedRef.current = true;
      setIsVisible(true);

      // Wait for mount, then animate
      const attemptFade = () => {
        requestAnimationFrame(() => {
          if (overlayRef.current) {
            // Set transition duration first
            overlayRef.current.style.transition = `opacity ${FADE_TO_BLACK_DURATION / 1000}s ease-in-out`;
            // Wait for next frame before changing opacity - this ensures transition is applied
            requestAnimationFrame(() => {
              if (overlayRef.current) {
                overlayRef.current.style.opacity = '1';
              }
              // Wait for CSS transition to complete
              setTimeout(() => {
                console.log('🎬 [TRANSITION] fadeToBlack complete');
                resolve();
              }, FADE_TO_BLACK_DURATION);
            });
          } else {
            // Retry if not mounted yet
            requestAnimationFrame(attemptFade);
          }
        });
      };
      attemptFade();
    });
  }, []);

  // Returns a Promise that resolves when fade-from-black is complete
  const fadeFromBlack = useCallback(() => {
    return new Promise((resolve) => {
      if (!isLockedRef.current) {
        console.log('🎬 [TRANSITION] Not locked, nothing to fade from');
        resolve();
        return;
      }

      console.log('🎬 [TRANSITION] fadeFromBlack starting');
      if (overlayRef.current) {
        // Set transition duration for fade-from-black
        overlayRef.current.style.transition = `opacity ${FADE_FROM_BLACK_DURATION / 1000}s ease-in-out`;
        overlayRef.current.style.opacity = '0';
      }

      // Wait for CSS transition to complete
      setTimeout(() => {
        console.log('🎬 [TRANSITION] fadeFromBlack complete');
        setIsVisible(false);
        isLockedRef.current = false;
        resolve();
      }, FADE_FROM_BLACK_DURATION + 50); // Slightly longer than transition to ensure completion
    });
  }, []);

  // Check if currently transitioning (for debugging/status)
  const isTransitioning = useCallback(() => {
    return isLockedRef.current;
  }, []);

  return (
    <TransitionContext.Provider value={{ fadeToBlack, fadeFromBlack, isTransitioning }}>
      {children}
      {isVisible && (
        <div
          ref={overlayRef}
          style={OVERLAY_STYLE}
        />
      )}
    </TransitionContext.Provider>
  );
};

export default TransitionProvider;
