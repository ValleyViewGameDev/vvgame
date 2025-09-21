import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import './FloatingText.css';
import { calculateTileCenter } from '../VFX/VFX.js';
import { useStrings } from '../UI/StringsContext';

// Global array to store floating texts - shared across all instances
let globalFloatingTexts = [];
let globalForceUpdate = null;

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

            const container = document.querySelector('.homestead');
            if (!container) return;

            if (isNaN(x) || isNaN(y)) {
                console.warn('Invalid coordinates in addFloatingText:', { x, y });
                return;
            }

            const { centerX, centerY } = calculateTileCenter(x, y, TILE_SIZE);
            const newId = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
            
            // Edge detection and offset calculation
            const EDGE_THRESHOLD = 100; // Distance from edge to trigger offset
            const OFFSET_AMOUNT = 40; // How much to offset when near edge
            
            let finalX = centerX;
            let finalY = centerY;
            
            // Get container dimensions (64x64 grid)
            const gridSize = 64 * TILE_SIZE;
            
            // Check left edge
            if (centerX < EDGE_THRESHOLD) {
                finalX = centerX + OFFSET_AMOUNT;
            }
            // Check right edge
            else if (centerX > gridSize - EDGE_THRESHOLD) {
                finalX = centerX - OFFSET_AMOUNT;
            }
            
            // Check top edge
            if (centerY < EDGE_THRESHOLD) {
                finalY = centerY + OFFSET_AMOUNT;
            }
            // Check bottom edge  
            else if (centerY > gridSize - EDGE_THRESHOLD) {
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

    const container = document.querySelector('.homestead');
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