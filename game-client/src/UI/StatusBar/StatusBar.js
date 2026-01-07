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
  const [scrollPosition, setScrollPosition] = React.useState(0);
  const [canScrollRight, setCanScrollRight] = React.useState(false);
  const prevFirstId = React.useRef(null);
  const newMessageRef = React.useRef(null);
  const messagesContainerRef = React.useRef(null);
  const viewportRef = React.useRef(null);

  React.useEffect(() => {
    if (messages.length === 0) {
      setDisplayMessages([]);
      setSlideOffset(0);
      setScrollPosition(0);
      return;
    }

    const currentFirstId = messages[0]?.id;
    
    // First render or new message
    if (prevFirstId.current === null) {
      // Initial load - also animate the first message
      setScrollPosition(0); // Reset scroll position
      const width = newMessageRef.current?.offsetWidth || 200;
      setSlideOffset(-width);
      setDisplayMessages(messages);

      // Use double requestAnimationFrame to ensure browser paints the offset position
      // before we trigger the animation back to 0. Single rAF can be batched.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setSlideOffset(0);
        });
      });
    } else if (currentFirstId !== prevFirstId.current) {
      // New message added - reset scroll position first
      setScrollPosition(0); // Reset to left before showing new message

      // Then measure and animate the new message
      const width = newMessageRef.current?.offsetWidth || 200;

      // Start with new message off-screen
      setSlideOffset(-width);
      setDisplayMessages(messages);

      // Use double requestAnimationFrame to ensure browser paints the offset position
      // before we trigger the animation back to 0. Single rAF can be batched.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setSlideOffset(0);
        });
      });
    } else {
      // No change
      setDisplayMessages(messages);
    }
    
    prevFirstId.current = currentFirstId;
  }, [messages]);

  // Check if we can scroll right
  React.useEffect(() => {
    if (messagesContainerRef.current && viewportRef.current) {
      const containerWidth = messagesContainerRef.current.scrollWidth;
      const viewportWidth = viewportRef.current.offsetWidth;
      const maxScroll = containerWidth - viewportWidth;
      
      // Can scroll right if we haven't reached the max scroll position
      setCanScrollRight(scrollPosition < maxScroll && containerWidth > viewportWidth);
    }
  }, [scrollPosition, displayMessages]);

  // Handle scrolling
  const handleScrollRight = () => {
    if (messagesContainerRef.current && viewportRef.current) {
      const containerWidth = messagesContainerRef.current.scrollWidth;
      const viewportWidth = viewportRef.current.offsetWidth;
      const maxScroll = containerWidth - viewportWidth;
      
      // Scroll right by viewport width or to the end
      const newPosition = Math.min(scrollPosition + viewportWidth, maxScroll);
      setScrollPosition(newPosition);
    }
  };

  const handleScrollLeft = () => {
    // Scroll left by viewport width or to the beginning
    const viewportWidth = viewportRef.current?.offsetWidth || window.innerWidth;
    const newPosition = Math.max(scrollPosition - viewportWidth, 0);
    setScrollPosition(newPosition);
  };

  return (
    <div className="status-bar">
      {/* Left scroll arrow - only show when scrolled */}
      {scrollPosition > 0 && (
        <button
          className="status-bar-arrow status-bar-arrow-left"
          onClick={handleScrollLeft}
          aria-label="Scroll left"
        >
          ◀
        </button>
      )}
      
      <div className="status-bar-viewport" ref={viewportRef}>
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
          ref={messagesContainerRef}
          className="status-bar-messages"
          style={{
            transform: `translateX(${slideOffset - scrollPosition}px)`,
            transition: slideOffset === 0 && scrollPosition === 0 ? 'transform 0.5s ease-out' : 
                       scrollPosition !== 0 ? 'transform 0.3s ease-out' : 'none'
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
      
      {/* Right scroll arrow - only show when can scroll right */}
      {canScrollRight && (
        <button
          className="status-bar-arrow status-bar-arrow-right"
          onClick={handleScrollRight}
          aria-label="Scroll right"
        >
          ▶
        </button>
      )}
    </div>
  );
};

export default StatusBar;