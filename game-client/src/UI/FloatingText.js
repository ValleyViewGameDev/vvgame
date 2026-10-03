import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import './FloatingText.css';
import { useStrings } from '../UI/StringsContext';
import PixiCamera from '../Render/PixiRenderer/PixiCamera';

// Global array to store floating texts - shared across all instances
let globalFloatingTexts = [];
let globalForceUpdate = null;

/**
 * World position for floating text, in BASE px with the current grid at the origin.
 * The `.pixi-world-container` overlay is CSS-transformed by PixiCamera to match the Pixi
 * world, so no zoom or grid offset is applied here (the TILE_SIZE argument is ignored).
 */
const calculateWorldPosition = (x, y /* , TILE_SIZE */) => {
    const scaledTileSize = PixiCamera.getTileSize();
    const centerX = (x * scaledTileSize) + (scaledTileSize / 2);
    const centerY = (y * scaledTileSize) + (scaledTileSize / 2);
    return { centerX, centerY, scaledTileSize };
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

            // Position within the grid (the grid is at the overlay's origin)
            const posInGridX = centerX;
            const posInGridY = centerY;

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
