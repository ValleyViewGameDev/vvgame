import { useState, useCallback } from 'react';

// Custom hook for managing location transition fade effects
export const useTransitionFade = () => {
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Start the fade to black transition
  const startTransition = useCallback(() => {
    console.log('🌑 [TRANSITION FADE] Starting fade to black...');
    setIsTransitioning(true);
  }, []);

  // End the transition and fade back to normal
  const endTransition = useCallback(() => {
    console.log('🌕 [TRANSITION FADE] Ending transition, fading back...');
    setIsTransitioning(false);
  }, []);

  // Get current transition state
  const getTransitionState = useCallback(() => {
    return isTransitioning;
  }, [isTransitioning]);

  return {
    isTransitioning,
    startTransition,
    endTransition,
    getTransitionState
  };
};

export default useTransitionFade;