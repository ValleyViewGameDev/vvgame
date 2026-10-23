import React, { useEffect } from 'react';
import { MOVE_START_EVENT, findAnchor, setGhost } from './moveMode';
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import './Move.css';

/**
 * App's half of Move (moveMode.js): pick up on MOVE_START_EVENT, cancel on Esc or when the grid
 * changes, and the banner that says what is being moved. App keeps cursorMode; this only drives it.
 */
export function useMoveMode({ cursorMode, setCursorMode, setResources, closePanel, gridId }) {
  // pick up: ghost the original, carry it on the cursor, close the panel
  useEffect(() => {
    const onStart = (e) => {
      const from = e.detail;
      const anchor = findAnchor(from);
      if (!anchor) return;
      setGhost(from, true, setResources);
      setCursorMode({
        type: 'move', from, item: anchor.type, size: anchor.size || 1,
        emoji: anchor.symbol || null, filename: anchor.filename || null,
      });
      closePanel?.();
    };
    window.addEventListener(MOVE_START_EVENT, onStart);
    return () => window.removeEventListener(MOVE_START_EVENT, onStart);
  }, [setCursorMode, setResources, closePanel]);

  // Esc cancels on desktop
  useEffect(() => {
    if (cursorMode?.type !== 'move') return undefined;
    const onKey = (e) => { if (e.key === 'Escape') cancelMove({ cursorMode, setCursorMode, setResources }); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cursorMode, setCursorMode, setResources]);

  // leaving the grid drops the move (the ghost belongs to the old grid's list)
  useEffect(() => {
    setCursorMode((prev) => (prev?.type === 'move' ? null : prev));
  }, [gridId]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function cancelMove({ cursorMode, setCursorMode, setResources }) {
  if (cursorMode?.type === 'move') setGhost(cursorMode.from, false, setResources);
  setCursorMode(null);
}

/** "Moving <item>. Tap a free spot to put it down. [Cancel]" while a move is in hand. */
export function MoveBanner({ cursorMode, setCursorMode, setResources }) {
  const strings = useStrings();
  if (cursorMode?.type !== 'move') return null;
  const item = getLocalizedString(cursorMode.item, strings);
  return (
    <div className="move-banner" role="status">
      <span className="move-banner-text">{(strings[2114] || 'Moving {item}. Tap a free spot to put it down.').replace('{item}', item)}</span>
      <span className="shared-buttons move-banner-cancel">
        <button className="btn-basic btn-neutral btn-mini" onClick={() => cancelMove({ cursorMode, setCursorMode, setResources })}>
          {strings[2029] || 'Cancel'}
        </button>
      </span>
    </div>
  );
}

export default React;
