import React, { createContext, useState, useContext } from 'react';
import { useStrings } from '../StringsContext';
import './StatusBar.css';

// Create Context
export const StatusBarContext = createContext();

// Provider Component
export const StatusBarProvider = ({ children }) => {
  const strings = useStrings(); // Get strings from context
  const [messages, setMessages] = useState([]); // Array of messages
  const [updateTrigger, setUpdateTrigger] = useState(0); // Force animation on duplicates
  const maxMessages = 5; // Maximum number of messages to display

  React.useEffect(() => {
    const id = Math.floor(Math.random() * 10000);
    console.log(`🧩 StatusBarProvider mounted. ID: ${id}`);
    return () => console.warn(`🧨 StatusBarProvider unmounted. ID: ${id}`);
  }, []);

  /**
   * Updates the status bar message.
   * @param {number|string} input - Index for predefined message or custom string.
   */
  const updateStatus = (input) => {
    let newMessage = '';
    
    if (typeof input === 'number') {
      // Use predefined string from strings.json
      const predefinedMessage = strings[input];
      if (predefinedMessage) {
        newMessage = predefinedMessage;
      } else {
        console.warn(`No string found for index ${input}. Falling back to default.`);
        return;
      }
    } else if (typeof input === 'string') {
      // Use custom string directly
      newMessage = input;
    } else {
      console.warn('Invalid status message input. Falling back to default.');
      return;
    }

    // Add new message to the beginning and keep only the last maxMessages
    setMessages(prev => {
      const newMessages = [newMessage, ...prev];
      return newMessages.slice(0, maxMessages);
    });
    
    // Trigger animation even for duplicate messages
    setUpdateTrigger(prev => prev + 1);
  };

  return (
    <StatusBarContext.Provider value={{ messages, updateStatus, updateTrigger }}>
      {children}
    </StatusBarContext.Provider>
  );
};

// StatusBar Component
const StatusBar = () => {
  const { messages, updateTrigger } = React.useContext(StatusBarContext);
  const [isAnimating, setIsAnimating] = React.useState(false);

  React.useEffect(() => {
    // Trigger animation whenever updateTrigger changes
    if (updateTrigger > 0) {
      setIsAnimating(true);
      // Remove animation class after animation completes
      const timer = setTimeout(() => {
        setIsAnimating(false);
      }, 500); // Match CSS animation duration
      return () => clearTimeout(timer);
    }
  }, [updateTrigger]);

  return (
    <div className="status-bar">
      <div className={`status-bar-messages ${isAnimating ? 'slide-all' : ''}`}>
        {messages.map((msg, index) => (
          <React.Fragment key={`${msg}-${index}-${updateTrigger}`}>
            <span className="status-message">
              {msg}
            </span>
            {index < messages.length - 1 && (
              <span className="status-separator"> ⬥ </span>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

export default StatusBar;
