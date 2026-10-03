/**
 * LocationChangeManager: a single mutex around grid changes.
 *
 * changePlayerLocation acquires it before touching any store and releases it
 * on every exit path (success, refusal, exception, and when a no-fade
 * crossing's deferred `enter-grid` commit settles). While held, any further
 * grid change is refused and the player stays on their tile.
 */
class LocationChangeManager {
  constructor() {
    this.held = false;
  }

  isInProgress() {
    return this.held;
  }

  /** Take the lock. Returns false (without blocking) when a change is already in flight. */
  tryAcquire() {
    if (this.held) {
      console.log('🚫 Location change blocked - operation already in progress');
      return false;
    }
    this.held = true;
    return true;
  }

  release() {
    this.held = false;
  }
}

const locationChangeManager = new LocationChangeManager();

export default locationChangeManager;
