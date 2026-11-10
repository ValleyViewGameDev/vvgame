/**
 * speechTopicArt: the picture inside a conversation bubble (owner 2026-11-10). A topic is an
 * emoji string (Conversation.js getTopicSymbol; topics are compared as strings), so the art is
 * resolved from the emoji here, at draw time:
 *
 *   a character (RelationshipMatrix symbol, or an NPC row's) -> its head crop (`iconFile`,
 *       tools/art/headcrop.js), drawn as a portrait in the avatar ring (kind 'portrait')
 *   the player's own icon (a PlayerIcons figure)       -> the figure cropped to its face, the
 *       header avatar's crop (UI/Icons/PlayerAvatarFace.js) (kind 'portrait')
 *   a resource's symbol (a doober, Money, ...)          -> its painted art, `iconFile` or
 *       `filename`, as ResourceIcon shows it in panels (kind 'art')
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

const strip = (s) => (s ? String(s).replace(/️/g, '') : s);
const FACE = { x: 156, y: 0, size: 200, art: 512 }; // the figure rig's face box (PlayerAvatarFace.js)

const cache = new Map();   // key -> Texture | null (null: none exists)
const pending = new Map(); // key -> Promise

/** What a topic emoji shows: { key, kind, load: () => Promise<Texture|null> } or null for plain text. */
function resolveTopic(topic) {
  const sym = strip(topic);
  if (!sym) return null;
  const rows = getMasterResources() || [];

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

/** A player figure's face, cut from its 512 px PNG. */
async function figureFace(filename) {
  const full = await urlTexture(`/assets/playerIcons/${filename.replace(/\.svg$/, '.png')}`);
  if (!full) return null;
  const k = full.baseTexture.width / FACE.art;
  return new Texture(full.baseTexture, new Rectangle(FACE.x * k, FACE.y * k, FACE.size * k, FACE.size * k));
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
  if (!pending.has(r.key)) {
    pending.set(r.key, Promise.resolve(r.load()).catch(() => null).then((t) => {
      pending.delete(r.key);
      cache.set(r.key, t || null);
      if (t) onReady?.();
    }));
  }
  return null;
}
