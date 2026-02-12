import React, { useState, useEffect } from 'react';

// Normalize emoji by removing variation selectors (U+FE0F) for consistent matching
const normalizeEmoji = (emoji) => {
  if (!emoji) return emoji;
  return emoji.replace(/\uFE0F/g, '');
};

// Static mapping of emojis to SVG filenames for the start screen animation characters
// These are NPC characters from resources.json that have SVG files
const emojiToSvgMap = {
  '👸': 'npc-gertrude.svg',  // Gertrude (princess)
  '🤠': 'npc-kent.svg',      // Kent (cowboy)
  // Note: 🐺 (Coyote) does not have an SVG file yet
};

// Individual animated emoji component
const AnimatedEmoji = ({ emoji, svgFilename, initialX, initialY }) => {
  const [position, setPosition] = useState({ x: initialX, y: initialY });
  const [targetPosition, setTargetPosition] = useState({ x: initialX, y: initialY });
  const [duration, setDuration] = useState(0);
  const speed = 100; // pixels per second

  useEffect(() => {
    const moveToNewPosition = () => {
      // Pick a random direction (0: up, 1: right, 2: down, 3: left)
      const direction = Math.floor(Math.random() * 4);

      // Calculate distance to travel (random between 100-300 pixels)
      const distance = 100 + Math.random() * 200;

      // Calculate new position based on direction
      let newX = position.x;
      let newY = position.y;

      // Boundaries: account for base panel (220px) on left
      const minX = 240;
      const maxX = 950;
      const minY = 50;
      const maxY = 550;

      switch (direction) {
        case 0: // up
          newY = Math.max(minY, position.y - distance);
          break;
        case 1: // right
          newX = Math.min(maxX, position.x + distance);
          break;
        case 2: // down
          newY = Math.min(maxY, position.y + distance);
          break;
        case 3: // left
          newX = Math.max(minX, position.x - distance);
          break;
        default:
          break;
      }

      // Calculate animation duration based on actual distance and speed
      const actualDistance = Math.sqrt(
        Math.pow(newX - position.x, 2) + Math.pow(newY - position.y, 2)
      );
      const animationDuration = actualDistance / speed; // in seconds

      setDuration(animationDuration);
      setTargetPosition({ x: newX, y: newY });
      setPosition({ x: newX, y: newY });
    };

    // Start movement every 1 second + animation duration
    const timer = setTimeout(moveToNewPosition, 1000 + (duration * 1000));

    return () => clearTimeout(timer);
  }, [position, duration]);

  return (
    <div
      className="start-screen-emoji"
      style={{
        position: 'absolute',
        left: `${targetPosition.x}px`,
        top: `${targetPosition.y}px`,
        fontSize: '30px',
        width: svgFilename ? '50px' : 'auto',
        height: svgFilename ? '50px' : 'auto',
        transition: duration > 0 ? `all ${duration}s linear` : 'none',
        zIndex: 10,
        userSelect: 'none'
      }}
    >
      {svgFilename ? (
        <img
          src={`/assets/resources/${svgFilename}`}
          alt={emoji}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      ) : (
        emoji
      )}
    </div>
  );
};

// Configuration for animated emojis on the start screen
// Bounds: minX=240 (after base panel), maxX=950, minY=50, maxY=550
const START_SCREEN_EMOJIS = [
  { emoji: '👸', initialX: 300, initialY: 100 },
  { emoji: '🤠', initialX: 800, initialY: 400 },
  { emoji: '🐺', initialX: 550, initialY: 300 },
];

const StartScreenAnimation = () => {
  return (
    <>
      {START_SCREEN_EMOJIS.map((config, index) => {
        const normalizedEmoji = normalizeEmoji(config.emoji);
        const svgFilename = emojiToSvgMap[normalizedEmoji];
        return (
          <AnimatedEmoji
            key={index}
            emoji={config.emoji}
            svgFilename={svgFilename}
            initialX={config.initialX}
            initialY={config.initialY}
          />
        );
      })}
    </>
  );
};

export default StartScreenAnimation;
