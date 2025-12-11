import React, { useState, useEffect, useRef } from 'react';
import './Modal.css';
import './StoryModal.css';
import './SharedButtons.css';
import { useStrings } from './StringsContext';
import RelationshipMatrix from '../GameFeatures/Relationships/RelationshipMatrix.json';

/**
 * StoryModal Component
 *
 * Displays dialog when a relationship milestone is reached with an NPC.
 * Supports pagination for long dialog text, breaking at sentence boundaries.
 * Text appears word by word to simulate the NPC talking.
 *
 * @param {boolean} isOpen - Whether the modal is visible
 * @param {function} onClose - Callback when modal is closed
 * @param {string} npcName - The name/type of the NPC (e.g., "Portia", "Hotspur")
 * @param {string} relationshipType - The relationship milestone (e.g., "met", "friend", "married")
 * @param {string} username - The player's username to replace {username} placeholders
 */
function StoryModal({ isOpen = false, onClose, npcName, relationshipType, username }) {
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

  // Get NPC data from RelationshipMatrix
  const npcData = RelationshipMatrix.find(r => r.type === npcName);
  const npcSymbol = npcData?.symbol || '?';

  // Get the dialog string ID based on relationship type
  const dialogKey = relationshipDialogKeys[relationshipType];
  const dialogStringId = npcData?.[dialogKey];
  const rawDialogText = dialogStringId ? strings[dialogStringId] : null;

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
  }, [isOpen, npcName, relationshipType]);

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

        {/* NPC Symbol */}
        <div className="story-modal-symbol">
          {npcSymbol}
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
