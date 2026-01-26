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

const createParticleElement = (char, x, y) => {
    const particle = document.createElement('div');
    particle.innerText = char;
    particle.style.position = 'absolute';
    particle.style.left = `${x}px`;
    particle.style.top = `${y}px`;
    particle.style.pointerEvents = 'none';
    particle.style.zIndex = '1000';
    particle.style.fontSize = '12px';
    return particle;
};

// Add this utility function
export const calculateTileCenter = (x, y, TILE_SIZE) => {
    const centerX = (x * TILE_SIZE) + (TILE_SIZE / 2) - 6;
    const centerY = (y * TILE_SIZE) + (TILE_SIZE / 2) - 6;
    return { centerX, centerY };
};

export const createCollectEffect = (x, y, TILE_SIZE) => {
    const gameContainer = document.querySelector('.homestead');
    if (!gameContainer) return;
    
    // Debounce duplicate effects at the same location
    const effectKey = `collect-${x}-${y}`;
    const now = Date.now();
    const lastEffectTime = recentEffects.get(effectKey);
    
    if (lastEffectTime && (now - lastEffectTime) < 100) {
        console.log('Skipping duplicate collect effect at', x, y);
        return;
    }
    
    recentEffects.set(effectKey, now);
    
    // Clean up old entries after 1 second
    setTimeout(() => {
        recentEffects.delete(effectKey);
    }, 1000);
    
    // Try to find the actual tile element to get its real position
    const tiles = gameContainer.querySelectorAll('.tile');
    let tileElement = null;
    
    // Find the tile at position (x, y) by checking computed positions
    tiles.forEach(tile => {
        const tileTop = parseInt(tile.style.top) / TILE_SIZE;
        const tileLeft = parseInt(tile.style.left) / TILE_SIZE;
        if (Math.round(tileLeft) === x && Math.round(tileTop) === y) {
            tileElement = tile;
        }
    });
    
    let centerX, centerY;
    
    if (tileElement) {
        // Use the actual tile's position for accurate placement
        const rect = tileElement.getBoundingClientRect();
        const containerRect = gameContainer.getBoundingClientRect();
        centerX = rect.left - containerRect.left + (rect.width / 2) - 6;
        centerY = rect.top - containerRect.top + (rect.height / 2) - 6;
    } else {
        // Fallback to calculated position
        const { centerX: calcX, centerY: calcY } = calculateTileCenter(x, y, TILE_SIZE);
        centerX = calcX;
        centerY = calcY;
    }
    
    console.log('createCollectEffect at grid(', x, ',', y, ') -> screen(', centerX, ',', centerY, ')');

    const directions = [
        { dx: -1, dy: -1, startX: -2, startY: -2 }, 
        { dx: 1, dy: -1, startX: 2, startY: -2 },  
        { dx: -1, dy: 1, startX: -2, startY: 2 },   
        { dx: 1, dy: 1, startX: 2, startY: 2 }     
    ];

    directions.forEach(dir => {
        // Position particle at tile center + small initial offset
        const particle = createParticleElement('💨', 
            centerX + dir.startX, 
            centerY + dir.startY
        );
        gameContainer.appendChild(particle);

        // Animate outward from center
        particle.style.transition = 'all 0.5s ease-out';
        requestAnimationFrame(() => {
            particle.style.transform = `translate(${dir.dx * 20}px, ${dir.dy * 20}px)`;
            particle.style.opacity = '0';
        });

        setTimeout(() => {
            gameContainer.removeChild(particle);
        }, VFX_TIMING.COLLECT_DURATION);
    });
};
 
export const createSourceConversionEffect = (x, y, TILE_SIZE, requiredSkill) => {
    const gameContainer = document.querySelector('.homestead');
    if (!gameContainer) return;
    console.log('createSourceConversionEffect called with x:', x, 'y:', y, 'requiredSkill:', requiredSkill);
    // Determine emoji based on required skill
    const emoji = requiredSkill?.includes('Axe') ? '🪓' : 
                 requiredSkill?.includes('Pickaxe') ? '⛏️' : 
                 requiredSkill?.includes('Golden Key') ? '🔑' : 
                  requiredSkill?.includes('Skeleton Key') ? '🗝️' : 
                '💫';

    const { centerX, centerY } = calculateTileCenter(x, y, TILE_SIZE);
    
    const particle = document.createElement('div');
    particle.innerText = emoji;
    particle.style.position = 'absolute';
    particle.style.left = `${centerX - TILE_SIZE/2 + 5}px`; // Added OFFSET
    particle.style.top = `${centerY - TILE_SIZE/2 - 4}px`;
    particle.style.pointerEvents = 'none';
    particle.style.zIndex = '1000';
    particle.style.fontSize = '28px';
    gameContainer.appendChild(particle);

    particle.style.transition = `all ${VFX_TIMING.SWIPE_DURATION}ms cubic-bezier(0.2, 0, 0, 1)`; // More forceful start, gentle end
    requestAnimationFrame(() => {
        particle.style.transform = `translate(-${TILE_SIZE}px, ${TILE_SIZE}px)`;
        particle.style.opacity = '0';
    });

    setTimeout(() => {
        gameContainer.removeChild(particle);
    }, VFX_TIMING.SWIPE_DURATION); // Match the new animation duration
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
    const gameContainer = document.querySelector('.homestead');
    if (!gameContainer) return;

    const posKey = `${x},${y}`;

    // Mark this resource as animating so canvas skips rendering it
    animatingResources.add(posKey);

    // Calculate final font size (matching resource rendering)
    const finalFontSize = TILE_SIZE * 0.7;

    // Create the growing element (SVG image or emoji)
    const particle = document.createElement('div');
    particle.style.position = 'absolute';
    particle.style.pointerEvents = 'none';
    particle.style.zIndex = '1001'; // Well above resources
    particle.style.transition = `transform ${VFX_TIMING.PLANT_GROW_DURATION}ms ease-out`;

    if (filename) {
        // SVG images: position at top-left corner to match canvas drawImage behavior
        const tileX = x * TILE_SIZE;
        const tileY = y * TILE_SIZE;
        particle.style.left = `${tileX}px`;
        particle.style.top = `${tileY}px`;
        particle.style.width = `${TILE_SIZE}px`;
        particle.style.height = `${TILE_SIZE}px`;
        particle.style.transformOrigin = 'center center';
        particle.style.transform = 'scale(0.02)'; // Start at 2% scale

        const img = document.createElement('img');
        img.src = `/assets/resources/${filename}`;
        img.alt = '';
        img.style.width = '100%';
        img.style.height = '100%';
        particle.appendChild(img);
    } else {
        // Emojis: position at center to match canvas textAlign/textBaseline behavior
        const centerX = (x * TILE_SIZE) + (TILE_SIZE / 2);
        const centerY = (y * TILE_SIZE) + (TILE_SIZE / 2) - (TILE_SIZE * 0.02);
        particle.style.left = `${centerX}px`;
        particle.style.top = `${centerY}px`;
        particle.style.transform = 'translate(-50%, -50%) scale(0.02)'; // Start at 2% scale
        particle.innerText = emoji;
        particle.style.fontSize = `${finalFontSize}px`;
    }

    gameContainer.appendChild(particle);

    // Trigger the grow animation
    requestAnimationFrame(() => {
        if (filename) {
            particle.style.transform = 'scale(1)';
        } else {
            particle.style.transform = 'translate(-50%, -50%) scale(1)';
        }
    });

    // Remove after animation completes and allow canvas to render the resource again
    setTimeout(() => {
        if (particle.parentNode) {
            gameContainer.removeChild(particle);
        }
        animatingResources.delete(posKey);
        animationVersion++;
        if (forceResourceRender) {
            forceResourceRender();
        }
        if (onComplete) {
            onComplete();
        }
    }, VFX_TIMING.PLANT_GROW_DURATION);
};
