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

            globalFloatingTexts.push({
                id: newId,
                text: displayText,
                x: centerX,
                y: centerY,
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