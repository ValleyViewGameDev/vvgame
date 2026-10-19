import React from 'react';
import RelationshipMatrix from '../Relationships/RelationshipMatrix.json';
import { getLocalizedString } from '../../Utils/stringLookup';
import './NPCConnections.css';

/**
 * NPCConnections: who and what an NPC cares about, in one compact row of chips: an icon for the
 * category, then the emoji of each character or item in it. Replaces the old "Interests:" /
 * "In love with:" / "Friends with:" / "Rivals with:" / "Married to:" rows (one line each).
 * The category's name is on the chip as a tooltip and an aria-label. Shown once the player has
 * met the NPC (RelationshipMatrix: interest1..3, and other NPCs' names keyed to love / friend /
 * rival / married).
 */
const CATEGORIES = [
  { key: 'interest', icon: '💬', labelKey: 619, fallback: 'Interests' },
  { key: 'love', icon: '❤️', labelKey: 660, fallback: 'In love with' },
  { key: 'married', icon: '💍', labelKey: 663, fallback: 'Married to' },
  { key: 'friend', icon: '🤝', labelKey: 661, fallback: 'Friends with' },
  { key: 'rival', icon: '⚔️', labelKey: 662, fallback: 'Rivals with' },
];
const clean = (s) => String(s || '').replace(/:\s*$/, '').trim();

export default function NPCConnections({ npcType, relationship, masterResources, strings }) {
  if (!relationship?.met) return null;
  const matrix = RelationshipMatrix.find((r) => r.type === npcType);
  if (!matrix) return null;

  const groups = { interest: [], love: [], married: [], friend: [], rival: [] };
  [...new Set([matrix.interest1, matrix.interest2, matrix.interest3].filter(Boolean))].forEach((type) => {
    const res = (masterResources || []).find((r) => r.type === type);
    if (res) groups.interest.push({ name: getLocalizedString(type, strings), symbol: res.symbol });
  });
  Object.entries(matrix).forEach(([name, value]) => {
    if (!groups[value] || value === 'interest') return;
    const other = RelationshipMatrix.find((r) => r.type === name);
    if (other) groups[value].push({ name: getLocalizedString(name, strings), symbol: other.symbol });
  });

  const chips = CATEGORIES.filter((c) => groups[c.key].length);
  if (!chips.length) return null;
  return (
    <div className="npc-connections">
      {chips.map((c) => {
        const label = clean(strings[c.labelKey]) || c.fallback;
        const who = groups[c.key].map((g) => g.name).join(', ');
        return (
          <span key={c.key} className="npc-chip" title={`${label}: ${who}`} aria-label={`${label}: ${who}`}>
            <span className="npc-chip-icon" aria-hidden="true">{c.icon}</span>
            {groups[c.key].map((g, i) => <span key={i} className="npc-chip-item" title={g.name} aria-hidden="true">{g.symbol}</span>)}
          </span>
        );
      })}
    </div>
  );
}
