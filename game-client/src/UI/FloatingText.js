import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import './FloatingText.css';
import { useStrings } from '../UI/StringsContext';
import PixiCamera from '../Render/PixiRenderer/PixiCamera';
import { registerFlight, flyToTarget } from './FlyToTarget';

// Global array to store floating texts - shared across all instances. World texts (addFloatingText)
// follow the map; screen texts (addFloatingTextAt) sit on the UI, e.g. a Kent card.
// options.flyTo = '<key>': at the end of its rise the text does not fade but flies into the header
// element marked data-fly-target="<key>" (UI/FlyToTarget.js), which pulses as it is hit.
let globalFloatingTexts = [];
let globalScreenTexts = [];
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

            if (options.flyTo) registerFlight(options.flyTo);
            globalFloatingTexts.push({
                id: newId,
                text: displayText,
                x: finalX,
                y: finalY,
                timestamp: Date.now(),
                color: options.color,
                size: options.size,
                flyTo: options.flyTo || null,
            });

            if (globalForceUpdate) globalForceUpdate();
        };

        // A floating text at a SCREEN point (client px), for things that happen on the UI
        FloatingTextManager.addFloatingTextAt = (message, clientX, clientY, options = {}) => {
            const displayText = typeof message === 'number' ? (strings[message] || `Missing string for code: ${message}`) : message;
            if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return;
            if (options.flyTo) registerFlight(options.flyTo);
            globalScreenTexts.push({
                id: `${Date.now()}-${Math.floor(Math.random() * 10000)}`,
                text: displayText, x: clientX, y: clientY,
                color: options.color, size: options.size, flyTo: options.flyTo || null,
            });
            if (globalForceUpdate) globalForceUpdate();
        };
    }, [strings]);

    // Prefer pixi-world-container for PixiJS, fallback to homestead
    const container = document.querySelector('.pixi-world-container') || document.querySelector('.homestead');
    if (!container) return null;

    // end of the rise: a flying text goes on to its header target, the rest are done
    const finish = (list, id, flyTo, el) => {
        if (flyTo) flyToTarget(el, flyTo);
        el.style.display = 'none';   // hide at once (no flash of the end frame)
        if (list === 'screen') globalScreenTexts = globalScreenTexts.filter(t => t.id !== id);
        else globalFloatingTexts = globalFloatingTexts.filter(t => t.id !== id);
        if (globalForceUpdate) globalForceUpdate();
    };

    return (
        <>
            {createPortal(
                <div className="floating-text-container">
                    {globalFloatingTexts.map(({ id, text, x, y, color, size, flyTo }) => (
                        <div
                            key={id}
                            className={`floating-text ${flyTo ? 'floating-text--flies' : ''}`}
                            style={{
                                position: 'absolute',
                                left: x,
                                top: y - 30,
                                transform: 'translate(-50%, -50%)',
                                color: color || undefined,
                                fontSize: size || undefined
                            }}
                            onAnimationEnd={(e) => { if (e.target === e.currentTarget) finish('world', id, flyTo, e.currentTarget); }}
                        >
                            {text}
                        </div>
                    ))}
                </div>,
                container
            )}
            {globalScreenTexts.length > 0 && createPortal(
                <div className="floating-text-container floating-text-container--screen">
                    {globalScreenTexts.map(({ id, text, x, y, color, size, flyTo }) => (
                        <div
                            key={id}
                            className={`floating-text floating-text--screen ${flyTo ? 'floating-text--flies' : ''}`}
                            style={{ left: x, top: y, color: color || undefined, fontSize: size || undefined }}
                            onAnimationEnd={(e) => { if (e.target === e.currentTarget) finish('screen', id, flyTo, e.currentTarget); }}
                        >
                            {text}
                        </div>
                    ))}
                </div>,
                document.body
            )}
        </>
    );
};

// Will be assigned inside useEffect
FloatingTextManager.addFloatingText = (...args) => {
    console.warn('FloatingTextManager not ready yet', ...args);
};
FloatingTextManager.addFloatingTextAt = (...args) => {
    console.warn('FloatingTextManager not ready yet', ...args);
};

export default FloatingTextManager;
