import React from 'react';
import './HelpBadge.css';

/**
 * HelpBadge: the game's one "help / more info" mark (docs/ui-conventions.md §5), the How to Play
 * "?" disc at every size. `size`:
 *   'sm' (16 px): ResourceButton / Trophy details (InfoButton), list rows that open an
 *                 explanation (Currencies & Keys, Quest for Hope);
 *   'md' (26 px): a panel section's corner (the Inventory currency block).
 * The header's How to Play button is the same disc at full size. Small sizes use the flat redraw
 * (icon-help-small.svg): the painted 256 px disc (icon-help.svg) turns to mush below ~22 px.
 * It is a picture: the tappable thing is whatever it sits in (a row, a section, InfoButton), so
 * it carries no handler and is hidden from screen readers.
 */
export default function HelpBadge({ size = 'sm', className = '' }) {
  const src = size === 'sm' ? '/assets/icons/icon-help-small.svg' : '/assets/icons/icon-help.svg';
  return (
    <span className={`help-badge help-badge--${size} ${className}`} aria-hidden="true">
      <img src={src} alt="" draggable="false" />
    </span>
  );
}
