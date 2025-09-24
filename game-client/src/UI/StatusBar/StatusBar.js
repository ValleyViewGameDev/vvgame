import React, { createContext, useState, useContext } from 'react';
import { useStrings } from '../StringsContext';
import './StatusBar.css';

// Create Context
export const StatusBarContext = createContext();

// Provider Component
export const StatusBarProvider = ({ children }) => {
  const strings = useStrings(); // Get strings from context
  const [messages, setMessages] = useState([]); // Array of message objects with id and text
  const messageIdRef = React.useRef(0); // Counter for unique message IDs

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

    // Create a new message object with unique ID
    const messageObject = {
      id: messageIdRef.current++,
      text: newMessage
    };

    // Add new message to the beginning (no max limit for infinite scrolling)
    setMessages(prev => [messageObject, ...prev]);
  };

  return (
    <StatusBarContext.Provider value={{ messages, updateStatus }}>
      {children}
    </StatusBarContext.Provider>
  );
};

// StatusBar Component
const StatusBar = () => {
  const { messages } = React.useContext(StatusBarContext);
  const [displayMessages, setDisplayMessages] = React.useState([]);
  const [slideOffset, setSlideOffset] = React.useState(0);
  const prevFirstId = React.useRef(null);
  const newMessageRef = React.useRef(null);

  React.useEffect(() => {
    if (messages.length === 0) {
      setDisplayMessages([]);
      setSlideOffset(0);
      return;
    }

    const currentFirstId = messages[0]?.id;
    
    // First render or new message
    if (prevFirstId.current === null) {
      // Initial load - also animate the first message
      if (newMessageRef.current) {
        const width = newMessageRef.current.offsetWidth || 200; // fallback width
        setSlideOffset(-width);
        setDisplayMessages(messages);
        
        requestAnimationFrame(() => {
          setSlideOffset(0);
        });
      } else {
        // Fallback if ref not ready
        setSlideOffset(-200);
        setDisplayMessages(messages);
        
        requestAnimationFrame(() => {
          setSlideOffset(0);
        });
      }
    } else if (currentFirstId !== prevFirstId.current) {
      // New message added - measure its width first
      if (newMessageRef.current) {
        const width = newMessageRef.current.offsetWidth;
        // Start with new message off-screen
        setSlideOffset(-width);
        setDisplayMessages(messages);
        
        // Trigger slide animation
        requestAnimationFrame(() => {
          setSlideOffset(0);
        });
      }
    } else {
      // No change
      setDisplayMessages(messages);
    }
    
    prevFirstId.current = currentFirstId;
  }, [messages]);

  return (
    <div className="status-bar">
      <div className="status-bar-viewport">
        {/* Hidden measuring container */}
        {messages.length > 0 && messages[0].id !== prevFirstId.current && (
          <div style={{ position: 'absolute', visibility: 'hidden', whiteSpace: 'nowrap' }}>
            <span ref={newMessageRef} className="status-message">
              {messages[0].text}
            </span>
            <span className="status-separator">&nbsp;&nbsp;⬥&nbsp;&nbsp;</span>
          </div>
        )}
        
        {/* Actual messages container */}
        <div 
          className="status-bar-messages"
          style={{
            transform: `translateX(${slideOffset}px)`,
            transition: slideOffset === 0 ? 'transform 0.5s ease-out' : 'none'
          }}
        >
          {displayMessages.map((msg, index) => (
            <React.Fragment key={msg.id}>
              <span className="status-message">
                {msg.text}
              </span>
              {index < displayMessages.length - 1 && (
                <span className="status-separator">&nbsp;&nbsp;⬥&nbsp;&nbsp;</span>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
};

export default StatusBar;