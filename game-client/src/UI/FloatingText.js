import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import './FloatingText.css';
import { calculateTileCenter } from '../VFX/VFX.js';
import strings from '../UI/strings.json';

let setFloatingTexts = null;

const addFloatingText = (message, x, y, TILE_SIZE) => {
    // Handle string code lookup
    const displayText = typeof message === 'number' 
        ? (strings[message] || `Missing string for code: ${message}`)
        : message;

    console.log('🎈 Adding floating text:', { message, displayText, x, y });

    const container = document.querySelector('.homestead');
    if (!container) return;

    if (isNaN(x) || isNaN(y)) {
        console.warn('Invalid coordinates in addFloatingText:', { x, y });
        return;
    }

    const { centerX, centerY } = calculateTileCenter(x, y, TILE_SIZE);
    const newId = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    
    setFloatingTexts(prev => {
        console.log('🎈 Previous texts:', prev);
        const updated = [
            ...prev,
            {
                id: newId,
                text: displayText, // Use resolved text string
                x: centerX,
                y: centerY,
                timestamp: Date.now()
            }
        ];
        console.log('🎈 Updated texts:', updated);
        return updated;
    });
};

const FloatingTextManager = () => {
    const [floatingTexts, setFloatingTextsState] = useState([]);
    setFloatingTexts = setFloatingTextsState;

    useEffect(() => {
        const timer = setInterval(() => {
            const now = Date.now();
            
            setFloatingTexts(texts => {
                // Only keep texts that are less than 1000ms old (match CSS animation)
                const remaining = texts.filter(text => (now - text.timestamp) < 1000);
                return remaining;
            });
        }, 100);

        return () => clearInterval(timer);
    }, []);

    const container = document.querySelector('.homestead');
    if (!container) return null;

    return createPortal(
        <div className="floating-text-container">
            {floatingTexts.map(({ id, text, x, y }) => (
                <div
                    key={id}
                    className="floating-text"
                    style={{
                        position: 'absolute',
                        left: x,
                        top: y-30,
                        transform: 'translate(-50%, -50%)' // Center the text
                    }}
                    onAnimationEnd={() => {
                        // Remove this specific text when animation completes
                        setFloatingTexts(prev => prev.filter(t => t.id !== id));
                    }}
                >
                    {text}
                </div>
            ))}
        </div>,
        container
    );
};

FloatingTextManager.addFloatingText = addFloatingText;
export default FloatingTextManager;