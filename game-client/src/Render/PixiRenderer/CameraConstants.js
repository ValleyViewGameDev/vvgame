/**
 * Camera Constants - Fixed Player Position Camera Model
 *
 * The player icon is ALWAYS at this fixed pixel position inside the .homestead container,
 * regardless of zoom level. The world scrolls to maintain this position.
 *
 * These values are configurable and may change with tuning.
 *
 * UNIFIED WORLD MODEL:
 * With the unified world model, padding and world dimensions are defined in UnifiedCamera.js.
 * This file only contains the fixed player screen position.
 */

// Fixed player screen position - player is ALWAYS at this pixel position in the .homestead container
export const PLAYER_FIXED_POSITION = { x: 450, y: 350 };
