import React from 'react';
import ResourceIcon from './ResourceIcon';
import { getMasterResources } from '../../Utils/TuningManager';
import './NPCPortrait.css';

/**
 * NPCPortrait: the big round avatar of an NPC (owner 2026-11-10): its head crop (`iconFile`,
 * tools/art/headcrop.js) filling a circle in the same ring as the player's avatar in the header
 * (.header-desk-avatar, App.css), on the ResourceButton green. The NPC's glyph when it has no art.
 * Used by the NPC panel's first row, the Clues modal, the Story modal's speaker and a toast from
 * an NPC (Notifications.js); the caller sizes it with `className`
 * (it is square: give it a width).
 */
export default function NPCPortrait({ resource, symbol, className = '' }) {
  return (
    <div className={`npc-portrait ${className}`.trim()}>
      <ResourceIcon resource={resource || null} symbol={symbol} className="npc-portrait-art" />
    </div>
  );
}

/**
 * The NPC row whose picture a resources/ file is (its head crop `iconFile` or its board figure
 * `filename`), or null. Accepts a bare file or a /assets/resources/ path.
 */
export function npcRowForFile(file) {
  if (!file) return null;
  const m = String(file).match(/^(?:\/assets\/resources\/)?([^/]+)$/);
  if (!m) return null;
  const name = m[1];
  return (getMasterResources() || []).find((r) => r.category === 'npc' && (r.iconFile === name || r.filename === name)) || null;
}
