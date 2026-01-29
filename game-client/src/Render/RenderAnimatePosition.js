import { renderPositions } from '../PlayerMovement';

// Animation duration in milliseconds for PC movement
// IMPORTANT: This should be <= MOVEMENT_COOLDOWN_MS (60ms in PlayerMovement.js)
// to ensure animations complete before the next movement can start.
// If duration > cooldown, animations will chain (new one starts from current position)
// which works but can feel slightly choppy at high speeds.
const PC_ANIMATION_DURATION_MS = 60;

// Track active animations to handle interruption/chaining
// Maps playerId -> { animationId, targetPos }
const activeAnimations = {};

// Animation ID counter for cancellation
let animationIdCounter = 0;

/**
 * Animate a PC from one position to another using time-based interpolation.
 * This provides smooth animation regardless of frame rate.
 *
 * KEY FEATURES:
 * - Handles animation interruption: if a new animation starts while one is running,
 *   the new animation starts from the current interpolated position
 * - Uses linear interpolation for consistent speed (no ease-out which causes choppiness on chaining)
 * - Keeps renderPositions entry until explicitly replaced or animation completes
 *
 * @param {string} playerId - The player/entity ID
 * @param {Object} from - Starting position { x, y } in tile coordinates
 * @param {Object} to - Target position { x, y } in tile coordinates
 * @param {number} TILE_SIZE - Size of a tile in pixels (unused but kept for API compatibility)
 * @param {number} durationMs - Animation duration in milliseconds (default: PC_ANIMATION_DURATION_MS)
 * @param {Function} onFrame - Optional callback called each frame with interpolated position
 */
export function animateRemotePC(playerId, from, to, TILE_SIZE, durationMs = PC_ANIMATION_DURATION_MS, onFrame = null) {
  const duration = typeof durationMs === 'number' ? durationMs : PC_ANIMATION_DURATION_MS;

  // Get the current animation ID and increment for next use
  const thisAnimationId = ++animationIdCounter;

  // Check if there's already an active animation for this player
  // If so, start from the current interpolated position instead of 'from'
  let actualStartX, actualStartY;

  if (renderPositions[playerId]) {
    // Use the current visual position as the starting point
    actualStartX = renderPositions[playerId].x;
    actualStartY = renderPositions[playerId].y;
  } else {
    // No active animation, use the provided 'from' position
    actualStartX = from.x;
    actualStartY = from.y;
  }

  const endX = to.x;
  const endY = to.y;

  // Store this animation info
  activeAnimations[playerId] = {
    animationId: thisAnimationId,
    targetPos: { x: endX, y: endY }
  };

  // Set initial position immediately (prevents flash to wrong position)
  renderPositions[playerId] = { x: actualStartX, y: actualStartY };

  // Debug logging for animation tracking
  console.log(`🎬 Animation ${thisAnimationId} for ${playerId}: (${actualStartX.toFixed(2)}, ${actualStartY.toFixed(2)}) → (${endX}, ${endY}), duration=${duration}ms`);

  const startTime = performance.now();

  function animate(currentTime) {
    // Check if this animation has been superseded by a newer one
    if (activeAnimations[playerId]?.animationId !== thisAnimationId) {
      // This animation was interrupted, let the newer one handle things
      console.log(`🛑 Animation ${thisAnimationId} interrupted by newer animation`);
      return;
    }

    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Use LINEAR interpolation for consistent speed during chained movements
    // This prevents the "slow down, speed up" feel when holding a direction key
    const interpolatedPosition = {
      x: actualStartX + (endX - actualStartX) * progress,
      y: actualStartY + (endY - actualStartY) * progress,
    };

    renderPositions[playerId] = interpolatedPosition;

    // Call the frame callback with interpolated position (e.g., for camera following)
    if (onFrame) {
      onFrame(interpolatedPosition);
    }

    if (progress < 1) {
      // Continue animation
      requestAnimationFrame(animate);
    } else {
      // Animation complete
      // Set exact final position to prevent float rounding errors
      renderPositions[playerId] = { x: endX, y: endY };
      console.log(`✅ Animation ${thisAnimationId} complete at (${endX}, ${endY})`);

      // Clean up animation tracking
      if (activeAnimations[playerId]?.animationId === thisAnimationId) {
        delete activeAnimations[playerId];
      }

      // Keep renderPositions entry for a brief moment to prevent visual jump
      // The ticker will detect no active animations and stop
      // We leave the final position in renderPositions until the next animation or timeout
      setTimeout(() => {
        // Only delete if no new animation has started
        if (!activeAnimations[playerId]) {
          delete renderPositions[playerId];
        }
      }, 16); // One frame delay

      // Final callback with exact target position
      if (onFrame) {
        onFrame({ x: endX, y: endY });
      }
    }
  }

  // Start animation immediately
  requestAnimationFrame(animate);
}

/**
 * Check if a player has an active animation
 */
export function hasActiveAnimation(playerId) {
  return !!activeAnimations[playerId];
}

/**
 * Get the current visual position for a player (animated or final)
 */
export function getVisualPosition(playerId) {
  return renderPositions[playerId] || null;
}

// Export the default duration for external configuration
export { PC_ANIMATION_DURATION_MS };
