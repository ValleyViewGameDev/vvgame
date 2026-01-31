/**
 * LocationChangeManager - Prevents concurrent location changes and HP data loss
 * 
 * This manager ensures that only one location change can happen at a time,
 * preventing race conditions that cause HP to reset to 25 during rapid grid transitions.
 */
class LocationChangeManager {
  constructor() {
    this.isLocationChangeInProgress = false;
    this.pendingLocationChange = null;
    this.lastCompletedChange = null;
  }

  /**
   * Check if a location change is currently in progress
   */
  isInProgress() {
    return this.isLocationChangeInProgress;
  }

  /**
   * Request permission to start a location change
   * @param {Object} changeRequest - The location change request details
   * @returns {Promise<boolean>} - True if permission granted, false if blocked
   */
  async requestLocationChange(changeRequest) {
    // If already in progress, queue this request
    if (this.isLocationChangeInProgress) {
      console.log('🚫 Location change blocked - operation already in progress');
      
      // Store the most recent request (overwrite any pending)
      this.pendingLocationChange = {
        ...changeRequest,
        timestamp: Date.now()
      };
      
      return false;
    }

    // Grant permission and mark as in progress
    this.isLocationChangeInProgress = true;
    this.pendingLocationChange = null;
    
    console.log('✅ Location change permission granted');
    return true;
  }

  /**
   * Mark location change as completed successfully
   * @param {Object} completedChange - Details of the completed change
   */
  completeLocationChange(completedChange) {
    this.isLocationChangeInProgress = false;
    this.lastCompletedChange = {
      ...completedChange,
      completedAt: Date.now()
    };

    console.log('✅ Location change completed successfully');

    // CRITICAL FIX: Do NOT process queued location changes after a successful transition.
    //
    // The player has already moved to the destination grid. Processing a queued change
    // would cause a SECOND transition where:
    // 1. The player's combat stats no longer exist in the "from" grid (already removed)
    // 2. addPC() falls back to default values (HP: 25, maxHP: 25)
    // 3. Player loses all their combat stats
    //
    // This race condition was caused by rapid signpost clicks queuing multiple transitions.
    // The safe behavior is to discard queued transitions - the player is already where they
    // need to be, and trying again would corrupt their data.
    if (this.pendingLocationChange) {
      console.log('🚫 Discarding queued location change - player already transitioned successfully');
      console.log('   Queued destination was:', this.pendingLocationChange.to?.g);
      console.log('   Completed destination:', completedChange?.to?.g || completedChange?.gridId);
      this.pendingLocationChange = null;
    }
  }

  /**
   * Mark location change as failed and allow retry
   * @param {Error} error - The error that caused the failure
   */
  failLocationChange(error) {
    console.error('❌ Location change failed:', error);
    this.isLocationChangeInProgress = false;
    
    // Don't process pending changes on failure - let user retry manually
    if (this.pendingLocationChange) {
      console.log('🚫 Discarding pending location change due to failure');
      this.pendingLocationChange = null;
    }
  }

  /**
   * Get the status of location changes
   */
  getStatus() {
    return {
      inProgress: this.isLocationChangeInProgress,
      hasPending: !!this.pendingLocationChange,
      lastCompleted: this.lastCompletedChange,
      pendingChange: this.pendingLocationChange
    };
  }

  /**
   * Clear any pending location changes (useful for cleanup)
   */
  clearPending() {
    this.pendingLocationChange = null;
    console.log('🧹 Cleared pending location changes');
  }

  /**
   * Force reset the manager state (emergency use only)
   */
  reset() {
    this.isLocationChangeInProgress = false;
    this.pendingLocationChange = null;
    this.lastCompletedChange = null;
    console.warn('⚠️ LocationChangeManager force reset');
  }
}

// Create singleton instance
const locationChangeManager = new LocationChangeManager();

// Development tools - make available in console for debugging
if (typeof window !== 'undefined') {
  window.locationChangeManager = locationChangeManager;
  window.debugLocationChanges = () => {
    console.log('Location Change Manager Status:', locationChangeManager.getStatus());
    return locationChangeManager.getStatus();
  };
  window.resetLocationChangeManager = () => {
    locationChangeManager.reset();
    console.log('Location Change Manager reset');
  };
}

export default locationChangeManager;