import React, { useState, useEffect } from 'react';

const CowboyAnimation = () => {
  const [position, setPosition] = useState({ x: 100, y: 100 });
  const [targetPosition, setTargetPosition] = useState({ x: 100, y: 100 });
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
      
      switch (direction) {
        case 0: // up
          newY = Math.max(50, position.y - distance);
          break;
        case 1: // right
          newX = Math.min(950, position.x + distance);
          break;
        case 2: // down
          newY = Math.min(550, position.y + distance);
          break;
        case 3: // left
          newX = Math.max(50, position.x - distance);
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

    // Start movement every 5 seconds + animation duration
    const timer = setTimeout(moveToNewPosition, 1000 + (duration * 1000));
    
    return () => clearTimeout(timer);
  }, [position, duration]);

  return (
    <div
      className="cowboy-emoji"
      style={{
        position: 'absolute',
        left: `${targetPosition.x}px`,
        top: `${targetPosition.y}px`,
        fontSize: '30px',
        transition: duration > 0 ? `all ${duration}s linear` : 'none',
        zIndex: 10,
        userSelect: 'none'
      }}
    >
      👸
    </div>
  );
};

export default CowboyAnimation;