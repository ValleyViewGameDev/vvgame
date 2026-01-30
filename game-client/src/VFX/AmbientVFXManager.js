// AmbientVFXManager.js - Manages ambient VFX based on player location

import VFXMap from './VFXMap.json';
import { createAmbientEffect } from './AmbientVFX';

class AmbientVFXManager {
  constructor() {
    this.currentEffect = null;
    this.currentEffectName = null;
    this.app = null;
    this.worldContainer = null;
    this.baseTileSize = null; // The constant base tile size from PixiJS (not zoom-dependent)
    this.enabled = true; // Whether ambient VFX are enabled
    // Store pending location if onGridEnter is called before PixiJS is ready
    this.pendingLocation = null;
    this.pendingGridWidth = null;
    this.pendingGridHeight = null;
    // Store current location info for re-enabling
    this.currentLocation = null;
    this.currentGridWidth = null;
    this.currentGridHeight = null;
  }

  setPixiApp(app) {
    this.app = app;
    // If we have a pending location, start the effect now
    this.tryStartPendingEffect();
  }

  /**
   * Set the world container and base tile size for ambient VFX.
   * The baseTileSize should be the constant PixiJS rendering tile size (e.g., 40 from globalTuning.closeZoom),
   * NOT the zoom-dependent activeTileSize. This ensures effects render at the correct world coordinates
   * regardless of the current zoom level.
   */
  setWorldContainer(worldContainer, baseTileSize = null) {
    this.worldContainer = worldContainer;
    if (baseTileSize) {
      this.baseTileSize = baseTileSize;
    }
    // If we have a pending location, start the effect now
    this.tryStartPendingEffect();
  }

  /**
   * Try to start the pending effect if both app and worldContainer are ready
   */
  tryStartPendingEffect() {
    if (this.pendingLocation && this.app && this.worldContainer && this.baseTileSize) {
      this.startEffect(
        this.pendingLocation,
        this.pendingGridWidth,
        this.pendingGridHeight
      );
      // Clear pending state
      this.pendingLocation = null;
      this.pendingGridWidth = null;
      this.pendingGridHeight = null;
    }
  }

  /**
   * Determine which effect to play based on gtype and region
   * More specific matches (gtype + region) take priority
   */
  getEffectForLocation(gtype, region) {
    // First look for specific gtype + region match
    const specificMatch = VFXMap.find(
      entry => entry.gtype === gtype && entry.region === region
    );
    if (specificMatch) return specificMatch.ambientVFX;

    // Fall back to gtype-only match (no region specified in map)
    const gtypeMatch = VFXMap.find(
      entry => entry.gtype === gtype && !entry.region
    );
    return gtypeMatch?.ambientVFX || null;
  }

  /**
   * Called when player enters a new grid.
   * Note: The TILE_SIZE parameter is ignored - we always use the stored baseTileSize
   * to ensure consistent rendering regardless of current zoom level.
   */
  onGridEnter(location, gridWidth, gridHeight, TILE_SIZE) {
    if (!location) {
      return;
    }

    // If PixiJS isn't ready yet, store the location and wait
    if (!this.app || !this.worldContainer || !this.baseTileSize) {
      this.pendingLocation = location;
      this.pendingGridWidth = gridWidth;
      this.pendingGridHeight = gridHeight;
      return;
    }

    this.startEffect(location, gridWidth, gridHeight);
  }

  /**
   * Actually start the effect (called when PixiJS is ready).
   * Always uses this.baseTileSize for consistent world coordinates.
   */
  startEffect(location, gridWidth, gridHeight) {
    // Store location info for re-enabling later
    this.currentLocation = location;
    this.currentGridWidth = gridWidth;
    this.currentGridHeight = gridHeight;

    const { gtype, region } = location;
    const effectName = this.getEffectForLocation(gtype, region);

    // If same effect is already playing, keep it
    if (effectName === this.currentEffectName && this.currentEffect) {
      return;
    }

    // Fade out old effect
    if (this.currentEffect) {
      const oldEffect = this.currentEffect;
      oldEffect.fadeOut(() => {
        oldEffect.destroy();
      });
      this.currentEffect = null;
      this.currentEffectName = null;
    }

    // Don't start new effect if disabled
    if (!this.enabled) {
      this.currentEffectName = effectName; // Store what would play
      return;
    }

    // Start new effect if applicable - always use baseTileSize for consistent rendering
    if (effectName && this.app && this.baseTileSize) {
      this.currentEffect = createAmbientEffect(effectName, this.app, gridWidth, gridHeight, this.baseTileSize);
      if (this.currentEffect) {
        this.currentEffectName = effectName;

        // Add to world container if available, otherwise to stage
        const targetContainer = this.worldContainer || this.app.stage;
        targetContainer.addChild(this.currentEffect.container);

        this.currentEffect.fadeIn();
        this.currentEffect.start();
      }
    }
  }

  /**
   * Called when player leaves grid (cleanup)
   */
  onGridLeave() {
    if (this.currentEffect) {
      const oldEffect = this.currentEffect;
      oldEffect.fadeOut(() => {
        oldEffect.destroy();
      });
      this.currentEffect = null;
      this.currentEffectName = null;
    }
  }

  destroy() {
    if (this.currentEffect) {
      this.currentEffect.destroy();
      this.currentEffect = null;
      this.currentEffectName = null;
    }
  }

  /**
   * Get the name of the currently playing effect (for debug display)
   */
  getCurrentEffectName() {
    return this.currentEffectName;
  }

  /**
   * Enable or disable ambient VFX
   */
  setEnabled(enabled) {
    this.enabled = enabled;

    if (!enabled) {
      // Fade out and stop current effect
      if (this.currentEffect) {
        const oldEffect = this.currentEffect;
        oldEffect.fadeOut(() => {
          oldEffect.destroy();
        });
        this.currentEffect = null;
        // Keep currentEffectName so we know what to restore
      }
    } else {
      // Re-enable: restart the effect if we have location info
      if (this.currentLocation && this.app && this.worldContainer && this.baseTileSize) {
        this.startEffect(
          this.currentLocation,
          this.currentGridWidth,
          this.currentGridHeight
        );
      }
    }
  }

  /**
   * Check if ambient VFX are enabled
   */
  isEnabled() {
    return this.enabled;
  }
}

// Singleton instance
const ambientVFXManager = new AmbientVFXManager();
export default ambientVFXManager;
