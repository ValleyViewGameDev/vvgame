import React, { createContext, useState, useContext } from 'react';
import strings from './strings.json';
import './StatusBar.css';

// Create Context
export const StatusBarContext = createContext();

// Provider Component
export const StatusBarProvider = ({ children }) => {
  const [message, setMessage] = useState('...'); // Default message

  /**
   * Updates the status bar message.
   * @param {number|string} input - Index for predefined message or custom string.
   */
  const updateStatus = (input) => {
    // First clear the message to force animation
    setMessage('');
    
    // Small delay before setting new message
    setTimeout(() => {
      if (typeof input === 'number') {
        // Use predefined string from strings.json
        const predefinedMessage = strings[input];
        if (predefinedMessage) {
          setMessage(predefinedMessage);
        } else {
          console.warn(`No string found for index ${input}. Falling back to default.`);
        }
      } else if (typeof input === 'string') {
        // Use custom string directly
        setMessage(input);
      } else {
        console.warn('Invalid status message input. Falling back to default.');
      }
    }, 10); // Very short delay to ensure state update
  };

  return (
    <StatusBarContext.Provider value={{ message, updateStatus }}>
      {children}
    </StatusBarContext.Provider>
  );
};

// StatusBar Component
const StatusBar = () => {
  const { message } = React.useContext(StatusBarContext);

  return (
    <div className="status-bar">
      {/* The p tag will re-render and trigger the slide-in animation */}
      <p key={message}>{message}</p>
    </div>
  );
};

export default StatusBar;
