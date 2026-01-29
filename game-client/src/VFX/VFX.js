// Configure animation durations (in milliseconds)
const VFX_TIMING = {
    COLLECT_DURATION: 500,      // Doober collection poof animation
    SWIPE_DURATION: 1000,        // Source conversion swipe animation (was 400)
    FADE_DURATION: 400,         // How long fade-out takes
    PLANT_GROW_DURATION: 1500,  // Plant grow animation
};

// Track recent effects to prevent duplicates
const recentEffects = new Map();

// Track resources that are currently animating (grow effect) - canvas should skip rendering these
const animatingResources = new Set();

// Counter that changes when animations complete, used to trigger re-renders
let animationVersion = 0;

// Callback to force resource canvas re-render (set by RenderResourcesCanvas)
let forceResourceRender = null;

/**
 * Register a callback to force resource canvas re-render
 * Called by RenderResourcesCanvas on mount
 */
export const registerForceRender = (callback) => {
    forceResourceRender = callback;
};

/**
 * Check if a resource at given position is currently animating
 * @param {number} x - Grid x coordinate
 * @param {number} y - Grid y coordinate
 * @returns {boolean} - True if resource should be hidden (animating)
 */
export const isResourceAnimating = (x, y) => {
    return animatingResources.has(`${x},${y}`);
};

/**
 * Get the current animation version - changes when animations complete
 * Used by canvas renderer to detect when it needs to re-render
 */
export const getAnimationVersion = () => animationVersion;

// Utility function for calculating tile center (used by legacy effects)
export const calculateTileCenter = (x, y, TILE_SIZE) => {
    const centerX = (x * TILE_SIZE) + (TILE_SIZE / 2) - 6;
    const centerY = (y * TILE_SIZE) + (TILE_SIZE / 2) - 6;
    return { centerX, centerY };
};

export const createCollectEffect = (x, y, TILE_SIZE) => {
    // Find the PixiJS containers - same approach as createPlantGrowEffect
    const pixiContainer = document.querySelector('.pixi-container');
    const worldContainer = document.querySelector('.pixi-world-container');

    if (!pixiContainer || !worldContainer) {
        console.warn('🎬 VFX: PixiJS containers not found for collect effect');
        return;
    }

    // Debounce duplicate effects at the same location
    const effectKey = `collect-${x}-${y}`;
    const now = Date.now();
    const lastEffectTime = recentEffects.get(effectKey);

    if (lastEffectTime && (now - lastEffectTime) < 100) {
        return; // Skip duplicate
    }

    recentEffects.set(effectKey, now);
    setTimeout(() => recentEffects.delete(effectKey), 1000);

    // Get the grid offset from pixi-container (same as createPlantGrowEffect)
    const gridOffsetX = parseFloat(pixiContainer.style.left) || 0;
    const gridOffsetY = parseFloat(pixiContainer.style.top) || 0;

    // Calculate world center position for the tile
    const scaledTileSize = TILE_SIZE;
    const centerX = gridOffsetX + (x * scaledTileSize) + (scaledTileSize / 2);
    const centerY = gridOffsetY + (y * scaledTileSize) + (scaledTileSize / 2);

    // "Poof" particle configuration - burst of particles expanding outward
    const particleCount = 10;
    const particleChars = ['✨', '💫', '⭐']; // Removed ✦ (too dark/hard to see)
    const baseDistance = scaledTileSize * 1.2; // How far particles travel
    const duration = VFX_TIMING.COLLECT_DURATION;

    for (let i = 0; i < particleCount; i++) {
        // Distribute particles evenly in a circle with slight randomization
        const baseAngle = (i / particleCount) * Math.PI * 2;
        const angleVariation = (Math.random() - 0.5) * 0.3; // Reduced variation for more consistent spread
        const angle = baseAngle + angleVariation;

        // Consistent distance with small variation
        const distance = baseDistance * (0.85 + Math.random() * 0.3);

        // Calculate end position
        const endX = Math.cos(angle) * distance;
        const endY = Math.sin(angle) * distance;

        // More consistent scale - always clearly visible
        const startScale = 0.8 + Math.random() * 0.3; // 0.8-1.1 (was 0.5-1.0)
        const endScale = 0.4 + Math.random() * 0.2;   // 0.4-0.6 (was 0.2-0.5)
        const char = particleChars[Math.floor(Math.random() * particleChars.length)];

        // Reduced stagger for more simultaneous burst feel
        const delay = Math.random() * 30;

        setTimeout(() => {
            const particle = document.createElement('div');
            particle.innerText = char;
            particle.style.position = 'absolute';
            particle.style.left = `${centerX}px`;
            particle.style.top = `${centerY}px`;
            particle.style.pointerEvents = 'none';
            particle.style.zIndex = '1001';
            particle.style.fontSize = `${scaledTileSize * 0.7}px`;
            particle.style.transform = `translate(-50%, -50%) scale(${startScale})`;
            particle.style.opacity = '1';
            // Separate transitions: position fast, opacity slower
            particle.style.transition = `transform ${duration}ms cubic-bezier(0.2, 0, 0.2, 1), opacity ${duration * 1.2}ms ease-out`;

            worldContainer.appendChild(particle);

            // Trigger animation on next frame
            requestAnimationFrame(() => {
                particle.style.transform = `translate(calc(-50% + ${endX}px), calc(-50% + ${endY}px)) scale(${endScale})`;
                particle.style.opacity = '0';
            });

            // Cleanup - wait for longer opacity fade
            setTimeout(() => {
                if (particle.parentNode) {
                    worldContainer.removeChild(particle);
                }
            }, duration * 1.2 + 50);
        }, delay);
    }

    // Add a central "poof" flash that quickly expands and fades
    const flashParticle = document.createElement('div');
    flashParticle.innerText = '💨';
    flashParticle.style.position = 'absolute';
    flashParticle.style.left = `${centerX}px`;
    flashParticle.style.top = `${centerY}px`;
    flashParticle.style.pointerEvents = 'none';
    flashParticle.style.zIndex = '1000';
    flashParticle.style.fontSize = `${scaledTileSize * 0.6}px`;
    flashParticle.style.transform = 'translate(-50%, -50%) scale(0.8)';
    flashParticle.style.opacity = '0.9';
    flashParticle.style.transition = `all ${duration * 0.6}ms ease-out`;

    worldContainer.appendChild(flashParticle);

    requestAnimationFrame(() => {
        flashParticle.style.transform = 'translate(-50%, -50%) scale(2)';
        flashParticle.style.opacity = '0';
    });

    setTimeout(() => {
        if (flashParticle.parentNode) {
            worldContainer.removeChild(flashParticle);
        }
    }, duration * 0.6 + 50);
};
 
export const createSourceConversionEffect = (x, y, TILE_SIZE, requiredSkill) => {
    // Find the PixiJS containers - same approach as createCollectEffect
    const pixiContainer = document.querySelector('.pixi-container');
    const worldContainer = document.querySelector('.pixi-world-container');

    if (!pixiContainer || !worldContainer) {
        console.warn('🎬 VFX: PixiJS containers not found for source conversion effect');
        return;
    }

    console.log(`🎬 VFX: createSourceConversionEffect at (${x}, ${y}), TILE_SIZE=${TILE_SIZE}, skill=${requiredSkill}`);

    // Determine emoji and chunk color based on required skill
    const isAxe = requiredSkill?.includes('Axe');
    const isPickaxe = requiredSkill?.includes('Pickaxe');
    const emoji = isAxe ? '🪓' : isPickaxe ? '⛏️' : '💫';

    // Chunk particles - wood chips for axe, stone chips for pickaxe
    const chunkChars = isAxe ? ['🟤', '🟫', '▪️', '◾'] :
                       isPickaxe ? ['🩶', '🪨', '▪️', '◾'] :
                       ['💥', '◾', '▫️'];

    // Get the grid offset from pixi-container
    const gridOffsetX = parseFloat(pixiContainer.style.left) || 0;
    const gridOffsetY = parseFloat(pixiContainer.style.top) || 0;

    // Calculate world center position for the tile
    const scaledTileSize = TILE_SIZE;
    const centerX = gridOffsetX + (x * scaledTileSize) + (scaledTileSize / 2);
    const centerY = gridOffsetY + (y * scaledTileSize) + (scaledTileSize / 2);

    console.log(`🎬 VFX: gridOffset=(${gridOffsetX}, ${gridOffsetY}), center=(${centerX}, ${centerY})`);

    const duration = VFX_TIMING.SWIPE_DURATION;

    // === TOOL SWIPE EFFECT ===
    // Start from upper-right, swipe to lower-left across the resource
    const swipeStartX = scaledTileSize * 0.6;
    const swipeStartY = -scaledTileSize * 0.5;
    const swipeEndX = -scaledTileSize * 0.7;
    const swipeEndY = scaledTileSize * 0.6;

    const toolParticle = document.createElement('div');
    toolParticle.innerText = emoji;
    toolParticle.style.cssText = `
        position: absolute;
        left: ${centerX}px;
        top: ${centerY}px;
        pointer-events: none;
        z-index: 1002;
        font-size: ${scaledTileSize * 1.0}px;
        transform: translate(calc(-50% + ${swipeStartX}px), calc(-50% + ${swipeStartY}px)) rotate(-30deg);
        opacity: 1;
        will-change: transform, opacity;
    `;

    worldContainer.appendChild(toolParticle);

    // Force a reflow to ensure the initial styles are applied before transition
    void toolParticle.offsetHeight;

    // Add transition after initial position is set
    toolParticle.style.transition = `all ${duration * 0.7}ms cubic-bezier(0.4, 0, 0.2, 1)`;

    // Trigger swipe animation after a microtask to ensure transition is registered
    setTimeout(() => {
        toolParticle.style.transform = `translate(calc(-50% + ${swipeEndX}px), calc(-50% + ${swipeEndY}px)) rotate(15deg)`;
        toolParticle.style.opacity = '0';
    }, 0);

    // Cleanup tool particle
    setTimeout(() => {
        if (toolParticle.parentNode) {
            worldContainer.removeChild(toolParticle);
        }
    }, duration * 0.7 + 100);

    // === CHUNK PARTICLE BURST ===
    // Spawn chunks immediately in parallel with swipe (no delay)
    const chunkCount = 10; // More chunks for bigger impact

    for (let i = 0; i < chunkCount; i++) {
        // Chunks fly mostly upward and outward (like debris from an impact)
        const baseAngle = (i / chunkCount) * Math.PI * 2;
        // Bias toward upper hemisphere for more natural debris feel
        const angle = baseAngle + (Math.random() - 0.5) * 0.5;

        // Larger distance for bigger effect
        const distance = scaledTileSize * (0.8 + Math.random() * 1.0);
        const endX = Math.cos(angle) * distance;
        const endY = Math.sin(angle) * distance - (scaledTileSize * 0.4); // Bias upward

        // Random chunk character
        const char = chunkChars[Math.floor(Math.random() * chunkChars.length)];

        // Bigger, more visible chunks
        const startScale = 0.6 + Math.random() * 0.5; // 0.6-1.1
        const endScale = 0.2 + Math.random() * 0.3;   // 0.2-0.5

        // Minimal stagger for simultaneous burst feel
        const spawnDelay = Math.random() * 30;

        setTimeout(() => {
            const chunk = document.createElement('div');
            chunk.innerText = char;
            chunk.style.cssText = `
                position: absolute;
                left: ${centerX}px;
                top: ${centerY}px;
                pointer-events: none;
                z-index: 1001;
                font-size: ${scaledTileSize * 0.5}px;
                transform: translate(-50%, -50%) scale(${startScale});
                opacity: 1;
                will-change: transform, opacity;
            `;

            worldContainer.appendChild(chunk);

            // Force reflow
            void chunk.offsetHeight;

            // Add transition after initial position
            chunk.style.transition = `transform ${duration * 0.5}ms cubic-bezier(0.2, 0, 0.6, 1), opacity ${duration * 0.7}ms ease-out`;

            // Trigger chunk animation
            setTimeout(() => {
                chunk.style.transform = `translate(calc(-50% + ${endX}px), calc(-50% + ${endY}px)) scale(${endScale}) rotate(${Math.random() * 360}deg)`;
                chunk.style.opacity = '0';
            }, 0);

            // Cleanup
            setTimeout(() => {
                if (chunk.parentNode) {
                    worldContainer.removeChild(chunk);
                }
            }, duration * 0.7 + 100);
        }, spawnDelay);
    }
};

/**
 * Creates a "grow" effect for planting - emoji starts tiny and grows to full size
 * Uses CSS scale transform for smoother animation than font-size
 * @param {number} x - Grid x coordinate
 * @param {number} y - Grid y coordinate
 * @param {number} TILE_SIZE - Current tile size
 * @param {string} emoji - The emoji to display (seed/crop symbol)
 * @param {function} onComplete - Optional callback when animation completes (to trigger re-render)
 */
export const createPlantGrowEffect = (x, y, TILE_SIZE, emoji, onComplete, filename = null) => {
    // Find the PixiJS container - get its position to calculate world coordinates
    const pixiContainer = document.querySelector('.pixi-container');
    const worldContainer = document.querySelector('.pixi-world-container');

    if (!pixiContainer || !worldContainer) {
        console.warn('🎬 VFX: PixiJS containers not found');
        return;
    }

    const posKey = `${x},${y}`;

    // Mark this resource as animating so PixiRenderer skips rendering it
    animatingResources.add(posKey);
    console.log(`🎬 VFX: Added ${posKey} to animatingResources, set size: ${animatingResources.size}`);

    // Force an immediate re-render to ensure PixiRenderer sees the animation flag
    // This prevents the race condition where texture loading completes before the flag is checked
    animationVersion++;
    if (forceResourceRender) {
        forceResourceRender();
    }

    // Get the .pixi-container position (this is where the current grid is in world space)
    // The container's top/left style values give us the grid's world offset
    const gridOffsetX = parseFloat(pixiContainer.style.left) || 0;
    const gridOffsetY = parseFloat(pixiContainer.style.top) || 0;

    // TILE_SIZE passed from App.js is already the scaled tile size (activeTileSize)
    // e.g., at 'close' zoom it's 40, at 'farish' it's 25
    // We use this directly for positioning since gridOffset is in scaled world coordinates
    // and TILE_SIZE already represents the visual size at the current zoom level
    const scaledTileSize = TILE_SIZE;
    const finalFontSize = scaledTileSize * 0.7;

    // Create the growing element (SVG image or emoji)
    const particle = document.createElement('div');
    particle.style.position = 'absolute';
    particle.style.pointerEvents = 'none';
    particle.style.zIndex = '1001'; // Well above resources
    particle.style.transition = `transform ${VFX_TIMING.PLANT_GROW_DURATION}ms ease-out`;

    if (filename) {
        // SVG images: position at grid offset + tile position (scaled)
        // This places the VFX at the same world position as the PixiJS canvas renders
        const worldX = gridOffsetX + (x * scaledTileSize);
        // Add small Y offset (5% of tile size) to align with PixiJS sprite rendering
        const worldY = gridOffsetY + (y * scaledTileSize) + (scaledTileSize * 0.05);
        console.log(`🎬 VFX DEBUG: filename=${filename}, tile=(${x},${y}), gridOffset=(${gridOffsetX},${gridOffsetY}), scaledTileSize=${scaledTileSize}, worldPos=(${worldX},${worldY})`);
        particle.style.left = `${worldX}px`;
        particle.style.top = `${worldY}px`;
        particle.style.width = `${scaledTileSize}px`;
        particle.style.height = `${scaledTileSize}px`;
        particle.style.transformOrigin = 'center center';
        particle.style.transform = 'scale(0.02)'; // Start at 2% scale

        const img = document.createElement('img');
        img.src = `/assets/resources/${filename}`;
        img.alt = '';
        img.style.width = '100%';
        img.style.height = '100%';
        particle.appendChild(img);
    } else {
        // Emojis: position at grid offset + tile center (scaled)
        // Matches PixiJS emoji rendering which centers at (x + size/2, y + size/2) with anchor 0.5
        // Small Y offset (3% of tile size) to align with PixiJS text rendering baseline
        const worldX = gridOffsetX + (x * scaledTileSize) + (scaledTileSize / 2);
        const worldY = gridOffsetY + (y * scaledTileSize) + (scaledTileSize / 2) + (scaledTileSize * 0.03);
        particle.style.left = `${worldX}px`;
        particle.style.top = `${worldY}px`;
        particle.style.transform = 'translate(-50%, -50%) scale(0.02)'; // Start at 2% scale
        particle.innerText = emoji;
        particle.style.fontSize = `${finalFontSize}px`;
    }

    // Append to the world container (not the grid container which has overflow:hidden)
    worldContainer.appendChild(particle);
    console.log(`🎬 VFX: Particle appended to worldContainer, left=${particle.style.left}, top=${particle.style.top}, transform=${particle.style.transform}`);

    // Trigger the grow animation
    requestAnimationFrame(() => {
        if (filename) {
            particle.style.transform = 'scale(1)';
        } else {
            particle.style.transform = 'translate(-50%, -50%) scale(1)';
        }
        console.log(`🎬 VFX: Animation triggered, transform now=${particle.style.transform}`);
    });

    // Remove after animation completes and allow PixiRenderer to render the resource again
    setTimeout(() => {
        if (particle.parentNode) {
            worldContainer.removeChild(particle);
        }
        animatingResources.delete(posKey);
        console.log(`🎬 VFX: Removed ${posKey} from animatingResources, set size: ${animatingResources.size}`);
        animationVersion++;
        if (forceResourceRender) {
            forceResourceRender();
        }
        if (onComplete) {
            onComplete();
        }
    }, VFX_TIMING.PLANT_GROW_DURATION);
};
