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
    if (typeof input === 'number') {
      // Use predefined string from strings.json
      const predefinedMessage = strings[input];
      if (predefinedMessage) {
        setMessage(predefinedMessage);
      } else {
        console.warn(`No string found for index ${input}. Falling back to default.`);
        //setMessage('Welcome to Valley View');
      }
    } else if (typeof input === 'string') {
      // Use custom string directly
      setMessage(input);
    } else {
      console.warn('Invalid status message input. Falling back to default.');
      //setMessage('Welcome to Valley View');
    }
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
