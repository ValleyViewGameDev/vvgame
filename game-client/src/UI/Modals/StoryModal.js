import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './Modal.css';
import './StoryModal.css';
import '../Buttons/SharedButtons.css';
import { useStrings } from '../StringsContext';
import RelationshipMatrix from '../../GameFeatures/Relationships/RelationshipMatrix.json';
import CloseButton from '../Buttons/CloseButton';
import NPCPortrait from '../Icons/NPCPortrait';
import { getMasterResources } from '../../Utils/TuningManager';
import { getLocalizedString } from '../../Utils/stringLookup';

/**
 * StoryModal Component: THE story modal (docs/ui-conventions.md §2, "Story moments"). Every story
 * moment (an NPC's milestone dialog, an FTUE speech, a quest's clue, a story scene with several
 * speakers) uses this modal, so it can be iterated on in one place: the speaker's art, the
 * speaker's name under it, then the words. No title.
 *
 * Displays dialog when a relationship milestone is reached with an NPC,
 * or for FTUE moments featuring the player character.
 * Supports pagination for long dialog text, breaking at sentence boundaries.
 * Text appears word by word to simulate talking.
 *
 * @param {boolean} isOpen - Whether the modal is visible
 * @param {function} onClose - Callback when modal is closed: onClose() from OK, onClose('dismiss') from the corner X
 * @param {string} npcName - The name/type of the NPC (e.g., "Portia", "Hotspur") - used for NPC dialog lookup
 * @param {string} relationshipType - The relationship milestone (e.g., "met", "friend", "married", "FTUE")
 * @param {string} username - The player's username to replace {username} placeholders
 * @param {string} symbol - Direct symbol to display (overrides NPC lookup, useful for PC icon in FTUE)
 * @param {React.ReactNode} symbolNode - A picture to show instead of `symbol` (the player's saved avatar head, Avatar/AvatarFace.js)
 * @param {number|string} dialogKey - Direct string ID for dialog text (overrides NPC dialog lookup)
 * @param {string} npcFilename - Optional SVG filename for the NPC (e.g., "npc-head-portia.svg") - used instead of emoji if provided.
 *   A named NPC (or a file that is an NPC's board figure) shows its head crop whatever is passed here.
 * @param {string} speakerName - Optional name under the icon; by default the localized npcName, else the
 *   resource whose art npcFilename is, else (FTUE, the player's own icon) the player's username
 * @param {string} okLabel - Optional label for the last page's button (a scene's "Next" between speakers)
 */
function StoryModal({ isOpen = false, onClose, npcName, relationshipType, username, symbol, symbolNode = null, dialogKey: directDialogKey, npcFilename, speakerName, okLabel }) {
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

  // The name under the icon (every version of this modal)
  const spriteDef = !npcName && npcFilename
    ? (getMasterResources() || []).find((r) => r.filename === npcFilename || r.iconFile === npcFilename)
    : null;
  const nameType = npcName || spriteDef?.type;

  // The picture: a character speaks with its FACE (owner 2026-11-10). The speaker's row gives its
  // head crop (`iconFile`), whether the caller named the NPC or handed over its board figure
  // (`filename`, the whole body, which is a speck at this size); a caller's file with no row
  // behind it (an FTUE step's modalSprite) is shown as given.
  const speakerRow = npcName
    ? (getMasterResources() || []).find((r) => r.type === npcName && r.category === 'npc')
    : spriteDef;
  const pictureFile = speakerRow?.iconFile || npcFilename || speakerRow?.filename || null;
  const displayName = speakerName
    || (nameType ? getLocalizedString(nameType, strings) : (relationshipType === 'FTUE' ? (username || 'Adventurer') : null));

  // Determine the dialog text:
  // 1. If directDialogKey is provided, use it directly (for FTUE)
  // 2. Otherwise look up from NPC's relationship dialog
  let rawDialogText = null;
  if (directDialogKey) {
    // Direct dialog key provided (e.g., from FTUE step's bodyKey)
    // an array of keys reads as ONE story, paged as one sequence (the Oracle's finale speeches)
    rawDialogText = Array.isArray(directDialogKey)
      ? directDialogKey.map((k) => strings[k]).filter(Boolean).join(' ') || null
      : strings[directDialogKey];
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

    // A string with explicit page breaks (a blank line, "\n\n") is paged exactly there, so a
    // story's page count is the writer's call in every language (FTUE opening: 3 pages)
    if (/\n\s*\n/.test(dialogText)) {
      setPages(dialogText.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean));
      setCurrentPage(0);
      setVisibleWordCount(0);
      setIsAnimating(true);
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

  // Portal to <body>: NPC panels render this while they are animated/transformed on phones,
  // and a transformed ancestor would otherwise become the fixed overlay's containing block
  // (the modal then conforms to the panel instead of the viewport)
  return createPortal(
    <div className="modal-overlay">
      <div className="modal-container modal-small story-modal">
        {/* Close Button */}
        <CloseButton corner onClick={() => onClose('dismiss')} />

        {/* Character Symbol (NPC or PC) - use SVG if filename provided, otherwise emoji */}
        <div className="story-modal-symbol">
          {speakerRow?.category === 'npc' && speakerRow.iconFile ? (
            // a character speaks in its round profile icon, the NPC panel's ring (owner 2026-11-10)
            <NPCPortrait resource={speakerRow} className="story-modal-portrait" />
          ) : pictureFile ? (
            <img
              src={`/assets/resources/${pictureFile}`}
              alt={npcName || 'Character'}
              className="story-modal-svg"
            />
          ) : (
            symbolNode || displaySymbol
          )}
        </div>
        {displayName && <h3 className="story-modal-name">{displayName}</h3>}

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
              {okLabel || strings[796] || 'OK'}
            </button>
          ) : (
            <button className="btn-basic btn-modal btn-success" onClick={handleNext}>
              {strings[796] || 'OK'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export default StoryModal;
