import React from 'react';
import ResourceIcon from './ResourceIcon';
import './NPCPortrait.css';

/**
 * NPCPortrait: the big round avatar of an NPC (owner 2026-11-10): its head crop (`iconFile`,
 * tools/art/headcrop.js) filling a circle in the same ring as the player's avatar in the header
 * (.header-desk-avatar, App.css), on the ResourceButton green. The NPC's glyph when it has no art.
 * Used by the NPC panel's first row and the Clues modal; the caller sizes it with `className`
 * (it is square: give it a width).
 */
export default function NPCPortrait({ resource, symbol, className = '' }) {
  return (
    <div className={`npc-portrait ${className}`.trim()}>
      <ResourceIcon resource={resource || null} symbol={symbol} className="npc-portrait-art" />
    </div>
  );
}
