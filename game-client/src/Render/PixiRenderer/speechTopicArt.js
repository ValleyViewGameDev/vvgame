/**
 * speechTopicArt: the picture inside a conversation bubble (owner 2026-11-10). A topic is an
 * emoji string (Conversation.js getTopicSymbol; topics are compared as strings), so the art is
 * resolved from the emoji here, at draw time:
 *
 *   a character (RelationshipMatrix symbol, or an NPC row's) -> its head crop (`iconFile`,
 *       tools/art/headcrop.js), drawn as a portrait in the avatar ring (kind 'portrait')
 *   the player's own picture (topicTokens.js PLAYER_FACE) -> the saved avatar's head, the default
 *       look's when the player has made none (`setSpeechPlayer`; the header's crop, AvatarFace.js)
 *       (kind 'portrait'). An old PlayerIcons figure emoji still shows that figure's face.
 *   a resource's symbol (a doober, Money, ...)          -> its painted art, `iconFile` or
 *       `filename`, as ResourceIcon shows it in panels (kind 'art')
 *   a feeling or a mark (a heart, a smiling face, a thumb) -> its painted glyph, GLYPH_ART below
 *       (public/assets/icons/mark-*.png, tools/art/jobs/icons-r12.json): the same pictures the
 *       relationship outcomes float over a head (`glyphArt`) (kind 'art')
 *   anything else (weather, the secret topics, ...)     -> the atlas's Twemoji frame (kind 'art'),
 *       else null and the caller draws the glyph as text
 *
 * Textures load once and are cached; `topicArt` is synchronous and returns null while a texture
 * is still loading, calling `onReady` when it lands so the caller redraws.
 */
import { Texture, Rectangle } from 'pixi.js-legacy';
import { getAtlasTexture } from './AtlasTextures';
import { emojiKey } from '../../Utils/emojiKey';
import { getMasterResources } from '../../Utils/TuningManager';
import RelationshipMatrix from '../../GameFeatures/Relationships/RelationshipMatrix.json';
import PlayerIcons from '../../Authentication/PlayerIcons.json';
import { PLAYER_FACE } from '../../GameFeatures/Relationships/topicTokens';
import { loadAvatarCatalogue } from '../../Utils/TuningManager';
import { lookFor, specFor } from '../../Avatar/avatarLook';
import { renderLook } from '../../Avatar/avatarCompositor';

const strip = (s) => (s ? String(s).replace(/️/g, '') : s);
const FACE = { x: 156, y: 0, size: 200, art: 512 }; // the figure rig's face box (PlayerAvatarFace.js)

// The painted glyphs (owner 2026-11-10: no emoji over a character's head). Keys are emoji with the
// variation selector stripped; values are files under public/assets/. The feelings and marks are
// the icons-r12 sheets (docs/art/ui-icons.md); a few topics borrow art the game already had.
const GLYPH_ART = {
  '✅': 'icons/mark-check.png', '❓': 'icons/mark-question.png', '❌': 'icons/mark-cross.png',
  '👋': 'icons/mark-hand.png', '✋': 'icons/mark-hand.png', '🕐': 'icons/mark-clock.png', '🕑': 'icons/mark-clock.png',
  '👍': 'icons/mark-thumbs-up.png', '👎': 'icons/mark-thumbs-down.png',
  '❤': 'icons/mark-heart.png', '💖': 'icons/mark-heart.png', '💔': 'icons/mark-broken-heart.png',
  '🎁': 'icons/mark-gift.png', '🤝': 'icons/mark-handshake.png', '🙏': 'icons/mark-thanks.png', '👫': 'icons/mark-friends.png',
  '😄': 'icons/mark-happy.png', '🙂': 'icons/mark-happy.png', '😊': 'icons/mark-blush.png', '🥰': 'icons/mark-blush.png',
  '😂': 'icons/mark-laughing.png', '🤣': 'icons/mark-laughing.png', '😘': 'icons/mark-kiss.png', '😉': 'icons/mark-kiss.png',
  '🤗': 'icons/mark-hug.png', '😮': 'icons/mark-surprised.png', '😳': 'icons/mark-surprised.png',
  '😡': 'icons/mark-angry.png', '😠': 'icons/mark-annoyed.png', '😤': 'icons/mark-annoyed.png',
  '😈': 'icons/mark-mischief.png', '🤨': 'icons/mark-doubtful.png', '🤔': 'icons/mark-doubtful.png',
  '💭': 'icons/icon-chat.png', '💬': 'icons/icon-chat.png', '👤': 'icons/icon-profile.png',
  '🗺': 'icons/icon-map.png', '⚔': 'icons/icon-combat.png',
};

// The local player's saved look, for PLAYER_FACE (PixiRendererSpeech hands it over)
let playerAvatar = null;
let playerKey = 'default';
/** The local player's `avatar` (null: the default look). A new look gets a new picture. */
export function setSpeechPlayer(avatar) {
  playerAvatar = avatar && avatar.skin ? avatar : null;
  playerKey = playerAvatar ? JSON.stringify(playerAvatar) : 'default';
}

const cache = new Map();   // key -> Texture | null (null: none exists)
const pending = new Map(); // key -> Promise
const listeners = new Map(); // key -> Set of onReady callbacks waiting on it

/** What a topic emoji shows: { key, kind, load: () => Promise<Texture|null> } or null for plain text. */
function resolveTopic(topic) {
  const sym = strip(topic);
  if (!sym) return null;
  const rows = getMasterResources() || [];

  // the local player's own picture: the avatar's head
  if (topic === PLAYER_FACE) return { key: `me:${playerKey}`, kind: 'portrait', load: playerFace };

  // a character: the RelationshipMatrix symbol names the NPC type, else an NPC row's own symbol
  const rel = RelationshipMatrix.find((e) => strip(e.symbol) === sym);
  const npcRow = rows.find((r) => r.category === 'npc' && (rel ? r.type === rel.type : strip(r.symbol) === sym));
  if (npcRow?.iconFile) {
    return { key: `npc:${npcRow.type}`, kind: 'portrait', load: () => resourceTexture(npcRow.iconFile) };
  }

  // the player's own icon: a full-body figure, cropped to its face
  const icon = Object.values(PlayerIcons).flat().find((i) => strip(i?.value) === sym);
  if (icon?.filename && Number(icon.artSpan) > 0) {
    return { key: `pc:${icon.filename}`, kind: 'portrait', load: () => figureFace(icon.filename) };
  }

  // a resource (not a skill or power: those show no picture anywhere, by the owner's rule)
  const row = rows.find((r) => strip(r.symbol) === sym && r.category !== 'npc' && r.category !== 'skill'
    && r.category !== 'power' && (r.iconFile || r.filename));
  if (row) return { key: `res:${row.type}`, kind: 'art', load: () => resourceTexture(row.iconFile || row.filename) };

  // a feeling or a mark: its painted glyph
  if (GLYPH_ART[sym]) return { key: `glyph:${GLYPH_ART[sym]}`, kind: 'art', load: () => glyphTexture(GLYPH_ART[sym]) };

  // a bare emoji: the atlas's Twemoji frame when it has one
  const ek = emojiKey(topic);
  if (ek) return { key: `emoji:${ek}`, kind: 'art', load: () => getAtlasTexture('emoji', ek) };
  return null;
}

/** A resources/ file: the atlas frame, else the file itself (a painted .svg ships with its .png). */
async function resourceTexture(file) {
  const atlas = await getAtlasTexture('resources', file);
  if (atlas) return atlas;
  return urlTexture(`/assets/resources/${file.replace(/\.svg$/, '.png')}`)
    .then((t) => t || urlTexture(`/assets/resources/${file}`));
}

/** A painted glyph (`icons/<file>`): the atlas frame (scripts/build-atlas.js icons/), else the file. */
async function glyphTexture(rel) {
  const [ns, file] = rel.split('/');
  return (await getAtlasTexture(ns, file)) || urlTexture(`/assets/${rel}`);
}

/** A player figure's face, cut from its 512 px PNG. */
async function figureFace(filename) {
  const full = await urlTexture(`/assets/playerIcons/${filename.replace(/\.svg$/, '.png')}`);
  if (!full) return null;
  const k = full.baseTexture.width / FACE.art;
  return new Texture(full.baseTexture, new Rectangle(FACE.x * k, FACE.y * k, FACE.size * k, FACE.size * k));
}

/** The local player's head: the composed look (the default one when none is saved), cut to the face box on a canvas of its own. */
async function playerFace() {
  const data = await loadAvatarCatalogue();
  if (!data?.catalogue?.length) return null;
  const look = lookFor(specFor(playerAvatar, data), data, {});
  const figure = await renderLook(look.layers, { size: FACE.art });
  const canvas = document.createElement('canvas');
  canvas.width = FACE.size; canvas.height = FACE.size;
  canvas.getContext('2d').drawImage(figure, FACE.x, FACE.y, FACE.size, FACE.size, 0, 0, FACE.size, FACE.size);
  return Texture.from(canvas);
}

function urlTexture(url) {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => resolve(null), 8000);
    img.onload = () => { clearTimeout(timer); try { resolve(Texture.from(img)); } catch (e) { resolve(null); } };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = url;
  });
}

/**
 * The art for a topic: { texture, kind } when ready, null for plain text (no art, or still
 * loading: `onReady` fires once it lands).
 */
export function topicArt(topic, onReady) {
  const r = resolveTopic(topic);
  if (!r) return null;
  if (cache.has(r.key)) {
    const t = cache.get(r.key);
    if (t && t.valid !== false && !t.baseTexture?.destroyed) return { texture: t, kind: r.kind };
    if (t) cache.delete(r.key); else return null; // a dead texture reloads; none-exists stays text
  }
  // EVERY caller waiting on a picture is told when it lands (or turns out to have none): only the
  // first caller's onReady used to fire, so a bubble asked for a picture already loading (warmed,
  // or the same head a moment earlier) kept its fallback glyph until something else redrew it
  if (onReady) {
    if (!listeners.has(r.key)) listeners.set(r.key, new Set());
    listeners.get(r.key).add(onReady);
  }
  if (!pending.has(r.key)) {
    pending.set(r.key, Promise.resolve(r.load()).catch(() => null).then((t) => {
      pending.delete(r.key);
      cache.set(r.key, t || null);
      const waiting = listeners.get(r.key);
      listeners.delete(r.key);
      waiting?.forEach((fn) => { try { fn(); } catch (e) { /* a gone caller */ } });
    }));
  }
  return null;
}

/** True while a topic's picture is still loading: the bubble stays empty for that moment rather than print the fallback glyph. */
export function topicArtLoading(topic) {
  const r = resolveTopic(topic);
  return !!r && !cache.has(r.key);
}

/** True when a topic is a token (PLAYER_FACE), not a glyph: there is nothing to print while its picture loads. */
export const isTopicToken = (topic) => topic === PLAYER_FACE;

/** Load every painted glyph ahead of its first use (an outcome mark is shown the moment it is asked for). */
export function warmGlyphArt() {
  for (const sym of Object.keys(GLYPH_ART)) topicArt(sym);
}

/** Load the glyphs, every character's head and the player's face ahead of the first conversation. */
export function warmTopicArt() {
  warmGlyphArt();
  for (const e of RelationshipMatrix) if (e?.symbol) topicArt(e.symbol);
  topicArt(PLAYER_FACE);
}
