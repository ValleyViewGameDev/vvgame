import React, { createContext, useContext, useRef, useCallback, useState } from 'react';

const TransitionContext = createContext(null);

// Fade durations in ms
const FADE_TO_BLACK_DURATION = 600;  // Slower fade to black (feels more deliberate)
const FADE_FROM_BLACK_DURATION = 900; // Faster reveal of new scene

// Fixed overlay covering the board. The geometry is read from .homestead when a fade
// starts (see boardRect), so the desktop layout (board at 84/300) and the phone layout
// (mobile.css) both get an exact fit.
const OVERLAY_STYLE = {
  position: 'fixed',
  top: '84px',
  left: '0px',
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
/** Where the board is right now, as fixed-position CSS; falls back to the desktop numbers. */
const boardRect = () => {
  const board = typeof document !== 'undefined' && document.querySelector('.homestead');
  if (!board) return { top: '84px', left: '0px', right: 0, bottom: 0 };
  const r = board.getBoundingClientRect();
  return { top: `${r.top}px`, left: `${r.left}px`, width: `${r.width}px`, height: `${r.height}px`, right: 'auto', bottom: 'auto' };
};

export const TransitionProvider = ({ children }) => {
  const overlayRef = useRef(null);
  const isLockedRef = useRef(false);
  const [isVisible, setIsVisible] = useState(false);
  const [overlayGeometry, setOverlayGeometry] = useState(null);

  // Returns a Promise that resolves when fade-to-black is complete
  const fadeToBlack = useCallback(() => {
    return new Promise((resolve) => {
      if (isLockedRef.current) {
        resolve();
        return;
      }

      isLockedRef.current = true;
      setOverlayGeometry(boardRect());
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
        resolve();
        return;
      }

      if (overlayRef.current) {
        // Set transition duration for fade-from-black
        overlayRef.current.style.transition = `opacity ${FADE_FROM_BLACK_DURATION / 1000}s ease-in-out`;
        overlayRef.current.style.opacity = '0';
      }

      // Wait for CSS transition to complete
      setTimeout(() => {
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
          style={{ ...OVERLAY_STYLE, ...(overlayGeometry || {}) }}
        />
      )}
    </TransitionContext.Provider>
  );
};

export default TransitionProvider;
