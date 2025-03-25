import './VFX.css';

// Configurable Parameters
const TILE_SIZE = 30; // Size of each tile in pixels
const GRID_WIDTH = 64; // Number of tiles horizontally
const GRID_HEIGHT = 64; // Number of tiles vertically

const BUTTERFLY_COUNT = 20; // Number of butterflies per batch
const SPAWN_INTERVAL = 5000; // Time between batches (ms)
const STAGGER_DELAY = 500; // Staggered spawn interval within a batch (ms)

const FADE_DURATION = 1000; // Duration of fade-in/out (ms)
const PAUSE_AT_DESTINATION = 100; // Pause duration at destination (ms)
const MIN_DISTANCE = 100; // Minimum distance a butterfly travels (px)
const MAX_DISTANCE = 400; // Maximum distance a butterfly travels (px)
const FLIGHT_SPEED = 70; // Speed in pixels per second

let spawnIntervalId = null; // Declare globally to manage the interval

// Get grid bounds
function getGridBounds() {
  return {
    width: TILE_SIZE * GRID_WIDTH,
    height: TILE_SIZE * GRID_HEIGHT,
  };
}

// Calculate a random destination
function getRandomDestination(startX, startY, bounds) {
  const angle = Math.random() * Math.PI * 2;
  const distance = MIN_DISTANCE + Math.random() * (MAX_DISTANCE - MIN_DISTANCE);
  const newX = Math.max(0, Math.min(startX + Math.cos(angle) * distance, bounds.width));
  const newY = Math.max(0, Math.min(startY + Math.sin(angle) * distance, bounds.height));
  return { x: newX, y: newY, distance };
}

// Animate a single butterfly
function animateButterfly(butterfly) {
  const bounds = getGridBounds();
  const startX = parseFloat(butterfly.dataset.x || 0);
  const startY = parseFloat(butterfly.dataset.y || 0);
  
  const { x: newX, y: newY, distance } = getRandomDestination(startX, startY, bounds);
  const flightDuration = (distance / FLIGHT_SPEED) * 1000;

  // Calculate angle of rotation
  const angle = Math.atan2(newY - startY, newX - startX) * (180 / Math.PI) + 90;

  butterfly.dataset.x = newX;
  butterfly.dataset.y = newY;

  // Set initial transform and force reflow
  butterfly.style.transform = `translate(${startX}px, ${startY}px) rotate(${angle}deg)`;
  const reflow = butterfly.offsetHeight; // Force reflow to trigger CSS transitions

  // Apply animation
  butterfly.style.transition = `opacity ${FADE_DURATION}ms, transform ${flightDuration}ms linear`;
  butterfly.style.opacity = '1'; // Fade in
  butterfly.style.transform = `translate(${newX}px, ${newY}px) rotate(${angle}deg)`; // Smooth movement with rotation

  // Fade-out after animation
  setTimeout(() => {
    butterfly.style.opacity = '0';
    setTimeout(() => {
      butterfly.remove(); // Remove after fade-out
    }, FADE_DURATION);
  }, flightDuration + PAUSE_AT_DESTINATION);
}

// Spawn a single butterfly
function spawnButterfly() {
  const bounds = getGridBounds();
  const butterfly = document.createElement('div');
  butterfly.className = 'butterfly';
  butterfly.textContent = '🦋';

  // Random start position
  const startX = Math.random() * bounds.width;
  const startY = Math.random() * bounds.height;
  butterfly.dataset.x = startX;
  butterfly.dataset.y = startY;

  butterfly.style.position = 'absolute';
  butterfly.style.transform = `translate(${startX}px, ${startY}px)`;
  butterfly.style.opacity = '0'; // Start transparent
  butterfly.style.transition = `opacity ${FADE_DURATION}ms`;

  document.querySelector('.homestead').appendChild(butterfly);

  animateButterfly(butterfly);
}

// Spawn a batch of butterflies
function spawnButterflyBatch() {
  for (let i = 0; i < BUTTERFLY_COUNT; i++) {
    setTimeout(spawnButterfly, i * STAGGER_DELAY); // Stagger butterfly spawning
  }
}



export function startAmbientVFX() {
  if (spawnIntervalId) return; // Avoid multiple intervals
  console.log('Ambient VFX starting...');
  spawnButterflyBatch(); // Initial batch
  spawnIntervalId = setInterval(spawnButterflyBatch, SPAWN_INTERVAL); // Continuous spawning
  console.log('Ambient VFX started');
}

export function stopAmbientVFX() {
  if (!spawnIntervalId) return; // Avoid redundant calls
  console.log('Ambient VFX stopping...');
  clearInterval(spawnIntervalId);
  spawnIntervalId = null;

  // Remove all existing butterflies
  const butterflies = document.querySelectorAll('.butterfly');
  butterflies.forEach((butterfly) => butterfly.remove());
  console.log('Ambient VFX stopped');
}