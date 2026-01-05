import React, { useState, useEffect, useRef } from 'react';
import './Modal.css';
import './StoryModal.css';
import '../Buttons/SharedButtons.css';
import { useStrings } from '../StringsContext';
import RelationshipMatrix from '../../GameFeatures/Relationships/RelationshipMatrix.json';

/**
 * StoryModal Component
 *
 * Displays dialog when a relationship milestone is reached with an NPC,
 * or for FTUE moments featuring the player character.
 * Supports pagination for long dialog text, breaking at sentence boundaries.
 * Text appears word by word to simulate talking.
 *
 * @param {boolean} isOpen - Whether the modal is visible
 * @param {function} onClose - Callback when modal is closed
 * @param {string} npcName - The name/type of the NPC (e.g., "Portia", "Hotspur") - used for NPC dialog lookup
 * @param {string} relationshipType - The relationship milestone (e.g., "met", "friend", "married", "FTUE")
 * @param {string} username - The player's username to replace {username} placeholders
 * @param {string} symbol - Direct symbol to display (overrides NPC lookup, useful for PC icon in FTUE)
 * @param {number|string} dialogKey - Direct string ID for dialog text (overrides NPC dialog lookup)
 */
function StoryModal({ isOpen = false, onClose, npcName, relationshipType, username, symbol, dialogKey: directDialogKey }) {
  const strings = useStrings();
  const [currentPage, setCurrentPage] = useState(0);
  const [pages, setPages] = useState([]);
  const [visibleWordCount, setVisibleWordCount] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const animationRef = useRef(null);
  const isInitialMount = useRef(true);

  // Word reveal speed in milliseconds
  const WORD_REVEAL_DELAY = 80;

  // Map relationship types to their dialog key names in RelationshipMatrix
  const relationshipDialogKeys = {
    met: 'dialogOnMet',
    friend: 'dialogOnFriend',
    married: 'dialogOnMarried',
    love: 'dialogOnLove',
    rival: 'dialogOnRival',
  };

  // Get NPC data from RelationshipMatrix (only needed for NPC-based dialogs)
  const npcData = npcName ? RelationshipMatrix.find(r => r.type === npcName) : null;

  // Determine the symbol to display:
  // 1. Use direct symbol prop if provided (for FTUE with player icon)
  // 2. Otherwise use NPC symbol from RelationshipMatrix
  // 3. Fall back to '?' if neither available
  const displaySymbol = symbol || npcData?.symbol || '?';

  // Determine the dialog text:
  // 1. If directDialogKey is provided, use it directly (for FTUE)
  // 2. Otherwise look up from NPC's relationship dialog
  let rawDialogText = null;
  if (directDialogKey) {
    // Direct dialog key provided (e.g., from FTUE step's bodyKey)
    rawDialogText = strings[directDialogKey];
  } else if (npcData && relationshipType) {
    // NPC-based dialog lookup
    const dialogKeyName = relationshipDialogKeys[relationshipType];
    const npcDialogStringId = npcData?.[dialogKeyName];
    rawDialogText = npcDialogStringId ? strings[npcDialogStringId] : null;
  }

  // Replace {username} placeholder with actual player username
  const dialogText = rawDialogText ? rawDialogText.replace(/\{username\}/gi, username || 'Adventurer') : null;

  // Split dialog into pages at sentence boundaries
  useEffect(() => {
    if (!dialogText) {
      setPages([]);
      return;
    }

    // Split at sentence boundaries (., !, ?)
    // Keep the punctuation with the sentence
    const sentences = dialogText.match(/[^.!?]+[.!?]+/g) || [dialogText];

    // Group sentences into pages (aim for ~150 characters per page for readability)
    const MAX_CHARS_PER_PAGE = 150;
    const newPages = [];
    let currentPageText = '';

    sentences.forEach((sentence) => {
      const trimmedSentence = sentence.trim();

      // If adding this sentence would exceed the limit, start a new page
      if (currentPageText.length > 0 &&
          currentPageText.length + trimmedSentence.length > MAX_CHARS_PER_PAGE) {
        newPages.push(currentPageText.trim());
        currentPageText = trimmedSentence;
      } else {
        currentPageText += (currentPageText ? ' ' : '') + trimmedSentence;
      }
    });

    // Don't forget the last page
    if (currentPageText.trim()) {
      newPages.push(currentPageText.trim());
    }

    setPages(newPages);
    setCurrentPage(0);
    setVisibleWordCount(0);
    setIsAnimating(true);
  }, [dialogText]);

  // Reset to first page and start animation when modal opens with new content
  useEffect(() => {
    if (isOpen) {
      setCurrentPage(0);
      setVisibleWordCount(0);
      setIsAnimating(true);
    } else {
      // Clear animation when modal closes
      if (animationRef.current) {
        clearTimeout(animationRef.current);
      }
    }
  }, [isOpen, npcName, relationshipType, directDialogKey, symbol]);

  // Word-by-word animation effect
  useEffect(() => {
    if (!isOpen || !isAnimating) return;

    const currentText = pages[currentPage] || '';
    const words = currentText.split(/\s+/).filter(w => w.length > 0);
    const totalWords = words.length;

    if (visibleWordCount < totalWords) {
      animationRef.current = setTimeout(() => {
        setVisibleWordCount(prev => prev + 1);
      }, WORD_REVEAL_DELAY);
    } else {
      setIsAnimating(false);
    }

    return () => {
      if (animationRef.current) {
        clearTimeout(animationRef.current);
      }
    };
  }, [isOpen, isAnimating, visibleWordCount, currentPage, pages]);

  // Reset word count when page changes (but not on initial mount)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    setVisibleWordCount(0);
    setIsAnimating(true);
  }, [currentPage]);

  // Don't render until pages are populated to avoid showing empty ""
  if (!isOpen || !dialogText || pages.length === 0) return null;

  const isLastPage = currentPage >= pages.length - 1;
  const currentText = pages[currentPage] || '';
  const words = currentText.split(/\s+/).filter(w => w.length > 0);
  const visibleText = words.slice(0, visibleWordCount).join(' ');
  const isTextComplete = visibleWordCount >= words.length;

  const handleNext = () => {
    if (isTextComplete && !isLastPage) {
      setCurrentPage(prev => prev + 1);
    } else if (!isTextComplete) {
      // Skip animation - show all words immediately
      setVisibleWordCount(words.length);
      setIsAnimating(false);
    }
  };

  const handleOk = () => {
    if (isTextComplete) {
      onClose();
    } else {
      // Skip animation - show all words immediately
      setVisibleWordCount(words.length);
      setIsAnimating(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-container modal-small story-modal">
        {/* Close Button */}
        <button className="modal-close-btn" onClick={onClose}>
          &times;
        </button>

        {/* Character Symbol (NPC or PC) */}
        <div className="story-modal-symbol">
          {displaySymbol}
        </div>

        {/* Dialog Content */}
        <div className="modal-content story-modal-content">
          <p className="story-modal-text">"{visibleText}"</p>
        </div>

        {/* Page indicator for multi-page dialogs */}
        {pages.length > 1 && (
          <div className="story-modal-page-indicator">
            {currentPage + 1} / {pages.length}
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="modal-buttons shared-buttons">
          {isLastPage ? (
            <button className="btn-basic btn-modal btn-success" onClick={handleOk}>
              {strings[796] || 'OK'}
            </button>
          ) : (
            <button className="btn-basic btn-modal btn-success" onClick={handleNext}>
              {strings[796] || 'OK'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default StoryModal;
