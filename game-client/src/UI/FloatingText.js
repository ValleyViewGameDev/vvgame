import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import './FloatingText.css';
import { useStrings } from '../UI/StringsContext';

// Global array to store floating texts - shared across all instances
let globalFloatingTexts = [];
let globalForceUpdate = null;

/**
 * Calculate world position for floating text
 * Works with both legacy canvas and PixiJS world model
 *
 * The TILE_SIZE parameter is often the base tile size (30), but we need to use the
 * scaled tile size based on the current zoom level. We derive this from the
 * pixi-container's actual pixel dimensions.
 */
const calculateWorldPosition = (x, y, TILE_SIZE) => {
    // Try to get PixiJS container position (for unified world model)
    const pixiContainer = document.querySelector('.pixi-container');

    if (pixiContainer) {
        // PixiJS world model: grid is positioned at an offset within the world
        const gridOffsetX = parseFloat(pixiContainer.style.left) || 0;
        const gridOffsetY = parseFloat(pixiContainer.style.top) || 0;

        // Derive the scaled tile size from the container's actual dimensions
        // The container width = 64 tiles * scaledTileSize
        const containerWidth = parseFloat(pixiContainer.style.width) || (64 * TILE_SIZE);
        const scaledTileSize = containerWidth / 64;

        // Calculate world position: grid offset + tile position + center offset
        // Use scaledTileSize for correct positioning at all zoom levels
        const worldX = gridOffsetX + (x * scaledTileSize) + (scaledTileSize / 2);
        const worldY = gridOffsetY + (y * scaledTileSize) + (scaledTileSize / 2);

        return { centerX: worldX, centerY: worldY, scaledTileSize };
    }

    // Legacy fallback: simple tile calculation
    const centerX = (x * TILE_SIZE) + (TILE_SIZE / 2) - 6;
    const centerY = (y * TILE_SIZE) + (TILE_SIZE / 2) - 6;
    return { centerX, centerY, scaledTileSize: TILE_SIZE };
};

const FloatingTextManager = () => {
    const [tick, setTick] = useState(0);
    const strings = useStrings();
    const instanceIdRef = useRef(Math.floor(Math.random() * 10000));

    const forceUpdate = () => setTick((prev) => prev + 1);

    // Set this instance as the active one for force updates
    useEffect(() => {
        globalForceUpdate = forceUpdate;

        FloatingTextManager.addFloatingText = (message, x, y, TILE_SIZE, options = {}) => {
            const displayText = typeof message === 'number'
                ? (strings[message] || `Missing string for code: ${message}`)
                : message;

            // Prefer pixi-world-container for PixiJS, fallback to homestead
            const container = document.querySelector('.pixi-world-container') || document.querySelector('.homestead');
            if (!container) return;

            if (isNaN(x) || isNaN(y)) {
                console.warn('Invalid coordinates in addFloatingText:', { x, y });
                return;
            }

            const { centerX, centerY, scaledTileSize } = calculateWorldPosition(x, y, TILE_SIZE);
            const newId = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

            // Edge detection and offset calculation
            // Scale thresholds based on zoom level for consistent visual behavior
            const EDGE_THRESHOLD = 100 * (scaledTileSize / 30); // Scale with zoom
            const OFFSET_AMOUNT = 40 * (scaledTileSize / 30); // Scale with zoom

            let finalX = centerX;
            let finalY = centerY;

            // Get container dimensions (64x64 grid) using scaled tile size
            const gridSize = 64 * scaledTileSize;

            // For PixiJS world model, edge detection needs to account for grid offset
            const pixiContainer = document.querySelector('.pixi-container');
            const gridOffsetX = pixiContainer ? (parseFloat(pixiContainer.style.left) || 0) : 0;
            const gridOffsetY = pixiContainer ? (parseFloat(pixiContainer.style.top) || 0) : 0;

            // Calculate position within the grid (for edge detection)
            const posInGridX = centerX - gridOffsetX;
            const posInGridY = centerY - gridOffsetY;

            // Check left edge
            if (posInGridX < EDGE_THRESHOLD) {
                finalX = centerX + OFFSET_AMOUNT;
            }
            // Check right edge
            else if (posInGridX > gridSize - EDGE_THRESHOLD) {
                finalX = centerX - OFFSET_AMOUNT;
            }

            // Check top edge
            if (posInGridY < EDGE_THRESHOLD) {
                finalY = centerY + OFFSET_AMOUNT;
            }
            // Check bottom edge
            else if (posInGridY > gridSize - EDGE_THRESHOLD) {
                finalY = centerY - OFFSET_AMOUNT;
            }

            globalFloatingTexts.push({
                id: newId,
                text: displayText,
                x: finalX,
                y: finalY,
                timestamp: Date.now(),
                color: options.color,
                size: options.size
            });

            if (globalForceUpdate) globalForceUpdate();
        };
    }, [strings]);

    // Prefer pixi-world-container for PixiJS, fallback to homestead
    const container = document.querySelector('.pixi-world-container') || document.querySelector('.homestead');
    if (!container) return null;

    return createPortal(
        <div className="floating-text-container">
            {globalFloatingTexts.map(({ id, text, x, y, color, size }) => (
                <div
                    key={id}
                    className="floating-text"
                    style={{
                        position: 'absolute',
                        left: x,
                        top: y - 30,
                        transform: 'translate(-50%, -50%)',
                        color: color || undefined,
                        fontSize: size || undefined
                    }}
                    onAnimationEnd={(e) => {
                        // Immediately hide the element to prevent visual artifacts
                        e.target.style.display = 'none';

                        globalFloatingTexts = globalFloatingTexts.filter(t => t.id !== id);
                        if (globalForceUpdate) globalForceUpdate();
                    }}
                >
                    {text}
                </div>
            ))}
        </div>,
        container
    );
};

// Will be assigned inside useEffect
FloatingTextManager.addFloatingText = (...args) => {
    console.warn('FloatingTextManager not ready yet', ...args);
};

export default FloatingTextManager;
