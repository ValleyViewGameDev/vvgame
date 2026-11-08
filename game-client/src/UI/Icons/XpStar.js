import React from 'react';
import './XpStar.css';

/**
 * XpStar: the one XP mark, the header's level star (`icon-level.svg`), in place of the old 🔷
 * emoji (owner 2026-11-07). Sized in em, so it follows the text it sits in.
 * - <XpStar /> in JSX;
 * - XP_STAR_HTML inside HTML strings (ResourceButton `details`, NPC trade details);
 * - the `{xpStar}` token in plain text (floating text), rendered by withXpStar().
 * The XP row in resources.json carries `iconFile: xp-star.svg` (a copy of icon-level.svg), so
 * ResourceIcon / resourceIconHtml reward lists (Caravan, Mailbox, ...) draw the same star.
 */
export const XP_STAR_SRC = '/assets/icons/icon-level.svg';
export const XP_STAR_TOKEN = '{xpStar}';
export const XP_STAR_HTML = `<img class="xp-star" src="${XP_STAR_SRC}" alt="" draggable="false" />`;

export default function XpStar({ className = '' }) {
  return <img className={`xp-star ${className}`.trim()} src={XP_STAR_SRC} alt="" draggable="false" />;
}

/** Plain text with `{xpStar}` tokens -> React nodes with the star in their place. */
export function withXpStar(text) {
  if (typeof text !== 'string' || !text.includes(XP_STAR_TOKEN)) return text;
  return text.split(XP_STAR_TOKEN).flatMap((part, i) => (i === 0 ? [part] : [<XpStar key={i} />, part]));
}
