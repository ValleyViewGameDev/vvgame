import React from 'react';

/**
 * CloseButton: THE close control for every panel, modal and chat window
 * (docs/ui-conventions.md §5, "Close"). One glyph (a drawn ×, crisp at any size), one look
 * (.close-btn in SharedButtons.css). `corner` pins it to the top-right of a modal container
 * (.close-btn--corner); without it, it sits where its parent's layout puts it (a panel or chat
 * header).
 */
export default function CloseButton({ onClick, corner = false, className = '', title, ...rest }) {
  return (
    <button
      type="button"
      className={`close-btn ${corner ? 'close-btn--corner' : ''} ${className}`.trim()}
      onClick={onClick}
      aria-label={title || 'Close'}
      title={title}
      {...rest}
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="22" height="22" aria-hidden="true">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  );
}
