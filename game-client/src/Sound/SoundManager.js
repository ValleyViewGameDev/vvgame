// SoundManager.js - Ambient music system based on player location

import MusicMap from './MusicMap.json';
import SFXMap from './SFXMap.json';

const FADE_DURATION_MS = 2000; // 2 second fade for music
const MUSIC_BASE_PATH = '/sound/music/';
const SFX_BASE_PATH = '/sound/sfx/';

class SoundManager {
  constructor() {
    this.currentAudio = null;
    this.currentTrackName = null;
    this.isMuted = false;
    this.volume = 0.3; // Default music volume (lower than SFX)
    this.fadeInterval = null;
    this.pendingTrack = null; // Track to play after current fade out
    this.soundEffectsEnabled = true; // Sound effects on by default

    // Playlist cycling
    this.currentPlaylist = null; // Array of track names for current location
    this.currentPlaylistIndex = 0; // Current position in playlist

    // Generation counter to prevent stale async handlers from acting
    // Each call to playTrack increments this, and handlers check if their
    // generation matches before taking action
    this.audioGeneration = 0;
  }

  /**
   * Determine which music track(s) to play based on gtype and region
   * More specific matches (region-only or gtype + region) take priority
   * Returns an array of track names extracted from music1, music2, etc. keys
   */
  getTracksForLocation(gtype, region) {
    // First look for specific region-only match (highest priority for region-specific music)
    if (region) {
      const regionOnlyMatch = MusicMap.find(
        entry => entry.region === region && !entry.gtype
      );
      if (regionOnlyMatch) {
        return this.extractMusicTracks(regionOnlyMatch);
      }
    }

    // Then look for specific gtype + region match
    if (gtype && region) {
      const specificMatch = MusicMap.find(
        entry => entry.gtype === gtype && entry.region === region
      );
      if (specificMatch) {
        return this.extractMusicTracks(specificMatch);
      }
    }

    // Fall back to gtype-only match (no region specified in map)
    if (gtype) {
      const gtypeMatch = MusicMap.find(
        entry => entry.gtype === gtype && !entry.region
      );
      if (gtypeMatch) {
        return this.extractMusicTracks(gtypeMatch);
      }
    }

    return null;
  }

  /**
   * Extract all music tracks from an entry
   * Looks for music1, music2, music3, etc. keys and returns them as an array
   */
  extractMusicTracks(entry) {
    if (!entry) return null;

    const tracks = [];
    let i = 1;

    // Keep looking for musicN keys until we don't find one
    while (entry[`music${i}`]) {
      tracks.push(entry[`music${i}`]);
      i++;
    }

    return tracks.length > 0 ? tracks : null;
  }

  /**
   * Check if two playlists are the same
   */
  playlistsMatch(a, b) {
    if (!a && !b) return true;
    if (!a || !b) return false;
    if (a.length !== b.length) return false;
    return a.every((track, i) => track === b[i]);
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
    const tracks = this.getTracksForLocation(gtype, region);

    console.log(`SoundManager: Looking for tracks - gtype: '${gtype}', region: '${region}', found:`, tracks);

    // If same playlist is already playing, keep it
    if (this.playlistsMatch(tracks, this.currentPlaylist) && this.currentAudio) {
      return;
    }

    // If we have a current track, fade it out first, then start new playlist
    if (this.currentAudio) {
      this.pendingTrack = tracks;
      this.fadeOut(() => {
        this.startPlaylist(this.pendingTrack);
        this.pendingTrack = null;
      });
    } else {
      // No current track, just start the new playlist
      this.startPlaylist(tracks);
    }
  }

  /**
   * Start playing a playlist of tracks
   * If multiple tracks, starts at a random position for variety
   */
  startPlaylist(tracks) {
    if (!tracks || tracks.length === 0) {
      console.log('SoundManager: No tracks to play');
      this.currentPlaylist = null;
      this.currentPlaylistIndex = 0;
      this.currentTrackName = null;
      return;
    }

    this.currentPlaylist = tracks;

    // Pick a random starting track if there's more than one
    if (tracks.length > 1) {
      this.currentPlaylistIndex = Math.floor(Math.random() * tracks.length);
      console.log(`SoundManager: Starting playlist at random index ${this.currentPlaylistIndex} of ${tracks.length}`);
    } else {
      this.currentPlaylistIndex = 0;
    }

    this.playCurrentPlaylistTrack();
  }

  /**
   * Play the current track in the playlist
   */
  playCurrentPlaylistTrack() {
    if (!this.currentPlaylist || this.currentPlaylist.length === 0) return;

    const trackName = this.currentPlaylist[this.currentPlaylistIndex];
    this.playTrack(trackName, false); // Don't loop - we handle cycling ourselves
  }

  /**
   * Called when a track ends - advance to next in playlist
   */
  onTrackEnded() {
    if (!this.currentPlaylist || this.currentPlaylist.length === 0) return;

    // Move to next track in playlist (cycling back to start)
    this.currentPlaylistIndex = (this.currentPlaylistIndex + 1) % this.currentPlaylist.length;

    console.log(`SoundManager: Track ended, cycling to index ${this.currentPlaylistIndex} of ${this.currentPlaylist.length}`);

    // Fade out current, then fade in next
    this.fadeOut(() => {
      this.playCurrentPlaylistTrack();
    });
  }

  /**
   * Play a music track with fade in
   * @param {string} trackName - Name of the track to play (can include extension like .mp3 or .m4a)
   * @param {boolean} loop - Whether to loop (default false for playlist mode)
   */
  playTrack(trackName, loop = false) {
    if (!trackName) {
      console.log('SoundManager: No track to play');
      this.currentTrackName = null;
      return;
    }

    // Increment generation counter - any handlers with old generation will be ignored
    this.audioGeneration++;
    const thisGeneration = this.audioGeneration;

    // If trackName already has an extension, use it as-is; otherwise append .mp3
    const hasExtension = /\.(mp3|m4a|ogg|wav|webm)$/i.test(trackName);
    const audioPath = hasExtension
      ? `${MUSIC_BASE_PATH}${trackName}`
      : `${MUSIC_BASE_PATH}${trackName}.mp3`;
    console.log(`SoundManager: Playing track '${trackName}' from ${audioPath} (gen ${thisGeneration})`);

    try {
      const audio = new Audio(audioPath);
      audio.loop = loop;
      audio.volume = 0; // Start silent for fade in

      // Handle track end for playlist cycling
      audio.onended = () => {
        if (!audio.loop && this.currentAudio === audio && this.audioGeneration === thisGeneration) {
          this.onTrackEnded();
        }
      };

      // Handle load errors
      audio.onerror = (e) => {
        // Only act if this is still the current generation (not superseded by a new track)
        // This prevents stale error handlers from affecting the new playlist
        if (this.audioGeneration !== thisGeneration) {
          console.log(`SoundManager: Ignoring stale error for '${trackName}' (gen ${thisGeneration}, current ${this.audioGeneration})`);
          return;
        }
        console.error(`SoundManager: Failed to load track '${trackName}'`, e);
        this.currentAudio = null;
        this.currentTrackName = null;
        // Try next track in playlist if available
        if (this.currentPlaylist && this.currentPlaylist.length > 1) {
          this.currentPlaylistIndex = (this.currentPlaylistIndex + 1) % this.currentPlaylist.length;
          this.playCurrentPlaylistTrack();
        }
      };

      // Start playing once loaded
      audio.oncanplaythrough = () => {
        // Check if this audio is still the expected one (generation hasn't changed)
        if (this.audioGeneration !== thisGeneration) {
          console.log(`SoundManager: Ignoring stale canplaythrough for '${trackName}' (gen ${thisGeneration}, current ${this.audioGeneration})`);
          audio.pause();
          audio.src = '';
          return;
        }
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
    this.currentPlaylist = null;
    this.currentPlaylistIndex = 0;
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
   * Get info about current playlist for debug
   */
  getPlaylistInfo() {
    if (!this.currentPlaylist) return null;
    return {
      tracks: this.currentPlaylist,
      currentIndex: this.currentPlaylistIndex,
      total: this.currentPlaylist.length
    };
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

  // ========== Sound Effects Playback ==========

  /**
   * Play a sound effect by event name
   * Looks up the event in SFXMap.json, picks a random file if multiple exist
   * @param {string} eventName - The event name (e.g., 'treeCut', 'stoneCut', 'collect_item')
   */
  playSFX(eventName) {
    if (!this.soundEffectsEnabled) {
      return;
    }

    // Find the SFX entry for this event
    const sfxEntry = SFXMap.find(entry => entry.event === eventName);
    if (!sfxEntry) {
      console.warn(`SoundManager: No SFX found for event '${eventName}'`);
      return;
    }

    // Extract all file options (file1, file2, file3, etc.)
    const files = [];
    let i = 1;
    while (sfxEntry[`file${i}`]) {
      files.push(sfxEntry[`file${i}`]);
      i++;
    }

    if (files.length === 0) {
      console.warn(`SoundManager: No files defined for SFX event '${eventName}'`);
      return;
    }

    // Pick a random file if multiple exist
    const selectedFile = files[Math.floor(Math.random() * files.length)];
    const audioPath = `${SFX_BASE_PATH}${selectedFile}`;

    try {
      const audio = new Audio(audioPath);
      audio.volume = 0.5; // SFX volume (can be made configurable later)
      audio.play().catch(err => {
        // Autoplay may be blocked - silently fail for SFX
        console.warn(`SoundManager: Could not play SFX '${eventName}'`, err);
      });
    } catch (err) {
      console.error(`SoundManager: Error creating SFX audio for '${eventName}'`, err);
    }
  }
}

// Singleton instance
const soundManager = new SoundManager();
export default soundManager;
