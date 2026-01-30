// SoundManager.js - Ambient music system based on player location

import MusicMap from './MusicMap.json';

const FADE_DURATION_MS = 2000; // 2 second fade for music
const MUSIC_BASE_PATH = '/sound/';

class SoundManager {
  constructor() {
    this.currentAudio = null;
    this.currentTrackName = null;
    this.isMuted = false;
    this.volume = 0.3; // Default music volume (lower than SFX)
    this.fadeInterval = null;
    this.pendingTrack = null; // Track to play after current fade out
    this.soundEffectsEnabled = true; // Sound effects on by default
  }

  /**
   * Determine which music track to play based on gtype and region
   * More specific matches (gtype + region) take priority
   */
  getTrackForLocation(gtype, region) {
    // First look for specific gtype + region match
    const specificMatch = MusicMap.find(
      entry => entry.gtype === gtype && entry.region === region
    );
    if (specificMatch) return specificMatch.music;

    // Fall back to gtype-only match (no region specified in map)
    const gtypeMatch = MusicMap.find(
      entry => entry.gtype === gtype && !entry.region
    );
    return gtypeMatch?.music || null;
  }

  /**
   * Called when player enters a new grid
   */
  onGridEnter(location) {
    if (!location) {
      console.warn('SoundManager: No location provided');
      return;
    }

    const { gtype, region } = location;
    const trackName = this.getTrackForLocation(gtype, region);

    console.log(`SoundManager: Looking for track - gtype: '${gtype}', region: '${region}', found: '${trackName}'`);

    // If same track is already playing, keep it
    if (trackName === this.currentTrackName && this.currentAudio) {
      return;
    }

    // If we have a current track, fade it out first, then play new track
    if (this.currentAudio) {
      this.pendingTrack = trackName;
      this.fadeOut(() => {
        this.playTrack(this.pendingTrack);
        this.pendingTrack = null;
      });
    } else {
      // No current track, just play the new one
      this.playTrack(trackName);
    }
  }

  /**
   * Play a music track with fade in
   */
  playTrack(trackName) {
    if (!trackName) {
      console.log('SoundManager: No track to play');
      this.currentTrackName = null;
      return;
    }

    const audioPath = `${MUSIC_BASE_PATH}${trackName}.mp3`;
    console.log(`SoundManager: Playing track '${trackName}' from ${audioPath}`);

    try {
      const audio = new Audio(audioPath);
      audio.loop = true;
      audio.volume = 0; // Start silent for fade in

      // Handle load errors
      audio.onerror = (e) => {
        console.error(`SoundManager: Failed to load track '${trackName}'`, e);
        this.currentAudio = null;
        this.currentTrackName = null;
      };

      // Start playing once loaded
      audio.oncanplaythrough = () => {
        if (this.isMuted) {
          audio.volume = 0;
        }
        audio.play().then(() => {
          this.currentAudio = audio;
          this.currentTrackName = trackName;
          this.fadeIn();
          console.log(`SoundManager: Started '${trackName}'`);
        }).catch(err => {
          // Autoplay may be blocked by browser
          console.warn('SoundManager: Autoplay blocked, will retry on user interaction', err);
          this.currentAudio = audio;
          this.currentTrackName = trackName;
          // Set up retry on user interaction
          this.setupAutoplayRetry(audio);
        });
      };

      audio.load();
    } catch (err) {
      console.error('SoundManager: Error creating audio', err);
    }
  }

  /**
   * Set up retry for autoplay-blocked audio
   */
  setupAutoplayRetry(audio) {
    const retryPlay = () => {
      if (this.currentAudio === audio && audio.paused) {
        audio.play().then(() => {
          this.fadeIn();
          console.log('SoundManager: Autoplay retry succeeded');
        }).catch(() => {
          // Still blocked, will try again on next interaction
        });
      }
      // Remove listeners after first attempt
      document.removeEventListener('click', retryPlay);
      document.removeEventListener('keydown', retryPlay);
    };

    document.addEventListener('click', retryPlay, { once: true });
    document.addEventListener('keydown', retryPlay, { once: true });
  }

  /**
   * Fade in the current track
   */
  fadeIn() {
    if (!this.currentAudio || this.isMuted) return;

    // Clear any existing fade
    if (this.fadeInterval) {
      clearInterval(this.fadeInterval);
    }

    const targetVolume = this.volume;
    const steps = 50;
    const stepTime = FADE_DURATION_MS / steps;
    const volumeStep = targetVolume / steps;
    let currentStep = 0;

    this.fadeInterval = setInterval(() => {
      currentStep++;
      if (currentStep >= steps) {
        this.currentAudio.volume = targetVolume;
        clearInterval(this.fadeInterval);
        this.fadeInterval = null;
      } else {
        this.currentAudio.volume = Math.min(targetVolume, volumeStep * currentStep);
      }
    }, stepTime);
  }

  /**
   * Fade out the current track
   */
  fadeOut(onComplete) {
    if (!this.currentAudio) {
      if (onComplete) onComplete();
      return;
    }

    // Clear any existing fade
    if (this.fadeInterval) {
      clearInterval(this.fadeInterval);
    }

    const startVolume = this.currentAudio.volume;
    const steps = 50;
    const stepTime = FADE_DURATION_MS / steps;
    const volumeStep = startVolume / steps;
    let currentStep = 0;

    const audioToFade = this.currentAudio;

    this.fadeInterval = setInterval(() => {
      currentStep++;
      if (currentStep >= steps) {
        audioToFade.volume = 0;
        audioToFade.pause();
        audioToFade.src = ''; // Release the audio resource
        clearInterval(this.fadeInterval);
        this.fadeInterval = null;

        // Only clear current if this is still the current audio
        if (this.currentAudio === audioToFade) {
          this.currentAudio = null;
          this.currentTrackName = null;
        }

        if (onComplete) onComplete();
      } else {
        audioToFade.volume = Math.max(0, startVolume - volumeStep * currentStep);
      }
    }, stepTime);
  }

  /**
   * Called when player leaves grid (cleanup)
   */
  onGridLeave() {
    // Don't stop music on grid leave - let onGridEnter handle transitions
    // This allows for seamless crossfade between grids
  }

  /**
   * Set the music volume (0-1)
   */
  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.currentAudio && !this.isMuted) {
      this.currentAudio.volume = this.volume;
    }
  }

  /**
   * Mute all music
   */
  mute() {
    this.isMuted = true;
    if (this.currentAudio) {
      this.currentAudio.volume = 0;
    }
  }

  /**
   * Unmute music
   */
  unmute() {
    this.isMuted = false;
    if (this.currentAudio) {
      this.currentAudio.volume = this.volume;
    }
  }

  /**
   * Toggle mute state
   */
  toggleMute() {
    if (this.isMuted) {
      this.unmute();
    } else {
      this.mute();
    }
    return this.isMuted;
  }

  /**
   * Stop all music immediately
   */
  stop() {
    if (this.fadeInterval) {
      clearInterval(this.fadeInterval);
      this.fadeInterval = null;
    }
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.src = '';
      this.currentAudio = null;
      this.currentTrackName = null;
    }
  }

  /**
   * Cleanup all resources
   */
  destroy() {
    this.stop();
  }

  /**
   * Get the name of the currently playing track (for debug display)
   */
  getCurrentTrackName() {
    return this.currentTrackName;
  }

  /**
   * Check if music is currently muted
   */
  getIsMuted() {
    return this.isMuted;
  }

  /**
   * Get current volume level
   */
  getVolume() {
    return this.volume;
  }

  // ========== Sound Effects Settings ==========

  /**
   * Set whether sound effects are enabled
   */
  setSoundEffectsEnabled(enabled) {
    this.soundEffectsEnabled = enabled;
  }

  /**
   * Check if sound effects are enabled
   */
  areSoundEffectsEnabled() {
    return this.soundEffectsEnabled;
  }
}

// Singleton instance
const soundManager = new SoundManager();
export default soundManager;
