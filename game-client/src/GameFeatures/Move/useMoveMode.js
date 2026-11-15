import React, { useEffect } from 'react';
import { MOVE_START_EVENT, findAnchor, setGhost } from './moveMode';
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import { isTouchPrimary } from '../../Utils/inputMode';
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
        type: 'move', from, item: anchor.type, size: anchor.size || 1, sizeX: anchor.sizeX, sizeY: anchor.sizeY,
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

  // leaving the grid drops the move (the ghost belongs to the old grid's list), and on a phone a
  // placement too (its panel is already closed, so nothing else would end it)
  useEffect(() => {
    setCursorMode((prev) => (prev?.type === 'move' || (isPlacing(prev) && isTouchPrimary()) ? null : prev));
  }, [gridId]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** A panel's placement cursor (build, buy, deco, pets, plant, terraform), as opposed to a Move. */
export const isPlacing = (cursorMode) => ['build', 'plant', 'terraform'].includes(cursorMode?.type);

export function cancelMove({ cursorMode, setCursorMode, setResources }) {
  if (cursorMode?.type === 'move') setGhost(cursorMode.from, false, setResources);
  setCursorMode(null);
}

/**
 * The black banner, top centre, while something is in hand (desktop and phones alike):
 *   Move: "Moving <item>. Tap a free spot to put it down. [Cancel]"
 *   placement mode (a Build, Buy, deco, Pets, Farming or Tools pick): "Placing <item>. Tap a spot
 *   to put it there. [Cancel]". On a phone the panel has closed and the item waits, ghosted, in the
 *   middle of the board (PixiRenderer); on desktop the panel stays open and the preview follows the
 *   mouse as before. Cancel just lets go of the cursor.
 */
export function PlacementBanner({ cursorMode, setCursorMode, setResources }) {
  const strings = useStrings();
  const moving = cursorMode?.type === 'move';
  if (!moving && !isPlacing(cursorMode)) return null;
  let text;
  if (moving) {
    const item = getLocalizedString(cursorMode.item, strings);
    text = (strings[2114] || 'Moving {item}. Tap a free spot to put it down.').replace('{item}', item);
  } else {
    const type = cursorMode.type === 'terraform' ? cursorMode.label || cursorMode.tileType
      : typeof cursorMode.item === 'object' ? cursorMode.item?.type : cursorMode.item;
    const item = type ? getLocalizedString(type, strings) : '';
    text = (strings[2172] || 'Placing {item}. Tap a spot to put it there.').replace('{item}', item);
  }
  return (
    <div className="move-banner" role="status">
      <span className="move-banner-text">{text}</span>
      <span className="shared-buttons move-banner-cancel">
        <button className="btn-basic btn-neutral btn-mini" onClick={() => cancelMove({ cursorMode, setCursorMode, setResources })}>
          {strings[2029] || 'Cancel'}
        </button>
      </span>
    </div>
  );
}

export default React;
