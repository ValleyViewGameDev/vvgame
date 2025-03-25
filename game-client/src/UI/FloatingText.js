import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import strings from './strings.json';  // ✅ Import strings.json
import './FloatingText.css';

const FloatingTextManager = () => {
  const [floatingTexts, setFloatingTexts] = useState([]);

  // Helper to determine if a message should use index lookup or bypass it
  const getFloatingTextMessage = (message) => {
    // Check if message is a number or a string that can be parsed as a number
    if (typeof message === 'number' || (!isNaN(message) && /^\d+$/.test(message))) {
      const messageIndex = parseInt(message, 10);
      if (strings[messageIndex]) {
        return strings[messageIndex]; // ✅ Return message from strings.json
      }
    }

    // Otherwise, treat it as a normal string (e.g., "+3 Apples")
    return message;
  };

  const addFloatingText = (message, x, y) => {
    // Ensure uniqueness in case of rapid calls
    const id = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const OFFSET_X = 190;
    const OFFSET_Y = 60;

    // Get the correct floating text message
    const floatingTextMessage = getFloatingTextMessage(message);

    // ✅ Adjust position to account for camera scroll
    const gameContainer = document.querySelector(".homestead"); // Adjust if needed
    const scrollX = gameContainer ? gameContainer.scrollLeft : 0;
    const scrollY = gameContainer ? gameContainer.scrollTop : 0;

    console.log(`📢 FloatingText at (${x}, ${y}) → Adjusted for scroll (${scrollX}, ${scrollY})`);

    setFloatingTexts((prev) => [
        ...prev,
        { id, text: floatingTextMessage, x: x + OFFSET_X - scrollX, y: y + OFFSET_Y - scrollY }
    ]);

    setTimeout(() => {
        setFloatingTexts((prev) => prev.filter((ft) => ft.id !== id));
    }, 1000);
};

  // Expose globally
  FloatingTextManager.addFloatingText = addFloatingText;

  return createPortal(
    <>
      {floatingTexts.map(({ id, text, x, y }) => (
        <div
          key={id}
          className="floating-text"
          style={{
            position: 'absolute',
            left: x,
            top: y,
          }}
        >
          {text}
        </div>
      ))}
    </>,
    document.body
  );
};

export default FloatingTextManager;