// AmbientVFXManager.js - Manages ambient VFX based on player location

import VFXMap from './VFXMap.json';
import { createAmbientEffect } from './AmbientVFX';

class AmbientVFXManager {
  constructor() {
    this.currentEffect = null;
    this.currentEffectName = null;
    this.app = null;
    this.worldContainer = null;
    this.enabled = true; // Whether ambient VFX are enabled
    // Store pending location if onGridEnter is called before PixiJS is ready
    this.pendingLocation = null;
    this.pendingGridWidth = null;
    this.pendingGridHeight = null;
    this.pendingTileSize = null;
    // Store current location info for re-enabling
    this.currentLocation = null;
    this.currentGridWidth = null;
    this.currentGridHeight = null;
    this.currentTileSize = null;
  }

  setPixiApp(app) {
    this.app = app;
    // If we have a pending location, start the effect now
    this.tryStartPendingEffect();
  }

  setWorldContainer(worldContainer) {
    this.worldContainer = worldContainer;
    // If we have a pending location, start the effect now
    this.tryStartPendingEffect();
  }

  /**
   * Try to start the pending effect if both app and worldContainer are ready
   */
  tryStartPendingEffect() {
    if (this.pendingLocation && this.app && this.worldContainer) {
      console.log('AmbientVFX: PixiJS ready, starting pending effect...');
      this.startEffect(
        this.pendingLocation,
        this.pendingGridWidth,
        this.pendingGridHeight,
        this.pendingTileSize
      );
      // Clear pending state
      this.pendingLocation = null;
      this.pendingGridWidth = null;
      this.pendingGridHeight = null;
      this.pendingTileSize = null;
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
   * Called when player enters a new grid
   */
  onGridEnter(location, gridWidth, gridHeight, TILE_SIZE) {
    if (!location) {
      console.warn('AmbientVFXManager: No location provided');
      return;
    }

    // If PixiJS isn't ready yet, store the location and wait
    if (!this.app || !this.worldContainer) {
      console.log('AmbientVFX: PixiJS not ready, storing pending location:', location.gtype);
      this.pendingLocation = location;
      this.pendingGridWidth = gridWidth;
      this.pendingGridHeight = gridHeight;
      this.pendingTileSize = TILE_SIZE;
      return;
    }

    this.startEffect(location, gridWidth, gridHeight, TILE_SIZE);
  }

  /**
   * Actually start the effect (called when PixiJS is ready)
   */
  startEffect(location, gridWidth, gridHeight, TILE_SIZE) {
    // Store location info for re-enabling later
    this.currentLocation = location;
    this.currentGridWidth = gridWidth;
    this.currentGridHeight = gridHeight;
    this.currentTileSize = TILE_SIZE;

    const { gtype, region } = location;
    const effectName = this.getEffectForLocation(gtype, region);

    console.log(`AmbientVFX: Looking for effect - gtype: '${gtype}', region: '${region}', found: '${effectName}'`);

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
      console.log(`AmbientVFX: Disabled, not starting '${effectName}'`);
      return;
    }

    // Start new effect if applicable
    if (effectName && this.app) {
      this.currentEffect = createAmbientEffect(effectName, this.app, gridWidth, gridHeight, TILE_SIZE);
      if (this.currentEffect) {
        this.currentEffectName = effectName;

        // Add to world container if available, otherwise to stage
        const targetContainer = this.worldContainer || this.app.stage;
        targetContainer.addChild(this.currentEffect.container);

        this.currentEffect.fadeIn();
        this.currentEffect.start();

        console.log(`AmbientVFX: Started '${effectName}' effect for ${gtype}${region ? ` (${region})` : ''}`);
      }
    } else if (!effectName) {
      console.log(`AmbientVFX: No effect defined for gtype '${gtype}'${region ? ` region '${region}'` : ''}`);
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
      if (this.currentLocation && this.app && this.worldContainer) {
        this.startEffect(
          this.currentLocation,
          this.currentGridWidth,
          this.currentGridHeight,
          this.currentTileSize
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
