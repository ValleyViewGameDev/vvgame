import React from 'react';
import ResourceIcon, { resourceIconHtml } from './ResourceIcon';
import './RichText.css';

/**
 * The rich status line (emoji audit pass 5, 2026-11-07): a plain string carries a thing's art
 * through a token, so toasts, float-ups, the status bar, mail bodies, FTUE notices, the How to
 * Play pages and the "Grown on ..." sentences can show a picture where they used to print an
 * emoji. Tokens:
 *   {res:Wheat}              a resource row's art (UI/Icons/ResourceIcon: iconFile, else filename;
 *                            a skill or power renders nothing, an NPC its portrait)
 *   {icon:icon-farming.svg}  a UI icon from public/assets/icons (a panel button, the season)
 *   {art:item-health-heart.svg}  a picture from public/assets/resources that is not a row's
 *   {xpStar}                 the XP mark (the header's level star)
 * richText(text) -> React nodes for JSX; richTextHtml(text) -> an HTML string for innerHTML.
 * A string without a token comes back unchanged, so both are safe on every message.
 */
const TOKEN = /(\{(?:res|icon|art):[^}]+\}|\{xpStar\})/g;
const XP_STAR_SRC = '/assets/icons/icon-level.svg';

export function hasRichTokens(text) {
  return typeof text === 'string' && /\{(?:res|icon|art):[^}]+\}|\{xpStar\}/.test(text);
}

function nodeFor(token, key) {
  if (token === '{xpStar}') return <img key={key} className="resource-icon rich-icon" src={XP_STAR_SRC} alt="" draggable="false" />;
  const m = token.match(/^\{(res|icon|art):([^}]+)\}$/);
  if (!m) return token;
  if (m[1] === 'res') return <ResourceIcon key={key} type={m[2]} />;
  const src = m[1] === 'icon' ? `/assets/icons/${m[2]}` : `/assets/resources/${m[2]}`;
  return <img key={key} className="resource-icon rich-icon" src={src} alt="" draggable="false" />;
}

/** Plain text with tokens -> React nodes (an array), or the text itself when it holds none. */
export function richText(text) {
  if (!hasRichTokens(text)) return text;
  return text.split(TOKEN).map((part, i) => (i % 2 ? nodeFor(part, i) : part)); // split on a capturing group alternates text, token, text ...
}

/** Plain text with tokens -> an HTML string (for innerHTML lists); text itself is NOT escaped. */
export function richTextHtml(text, masterResources) {
  if (!hasRichTokens(text)) return text;
  return text.replace(TOKEN, (token) => {
    if (token === '{xpStar}') return `<img class="resource-icon rich-icon" src="${XP_STAR_SRC}" alt="" draggable="false" />`;
    const m = token.match(/^\{(res|icon|art):([^}]+)\}$/);
    if (m[1] === 'res') return resourceIconHtml(m[2], masterResources) || '';
    const src = m[1] === 'icon' ? `/assets/icons/${m[2]}` : `/assets/resources/${m[2]}`;
    return `<img class="resource-icon rich-icon" src="${src}" alt="" draggable="false" />`;
  });
}

/** Strip the tokens out (for a `title` attribute, a window title, a log line). */
export function plainText(text) {
  return typeof text === 'string' ? text.replace(TOKEN, '').replace(/\s{2,}/g, ' ').trim() : text;
}
