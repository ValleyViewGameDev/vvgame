/**
 * PlayerAvatarFace: the player's avatar as a profile picture (the header's avatar button).
 *
 * A full-body figure (a PlayerIcons.json entry with artSpan, the pc-figure-* art: 512 px square,
 * one rig, head at the top centre) is cropped to its face: the FACE box below, shown at the size
 * of its container. Any other icon (older busts, emoji-only avatars) shows whole, as before.
 * The container sets the size and the circle; this fills it.
 */
import React from 'react';
import PlayerIcons from '../../Authentication/PlayerIcons.json';
import './PlayerAvatarFace.css';

// The face in the figure rig, in px of the 512 px art: x, y, size (checked on all four figures)
const ART = 512;
const FACE = { x: 156, y: 0, size: 200 };

const normalizeEmoji = (e) => (e ? e.replace(/\uFE0F/g, '') : e); // as App.js
const byValue = new Map();
Object.values(PlayerIcons).flat().forEach((icon) => {
  if (icon?.value) byValue.set(normalizeEmoji(icon.value), icon);
});

export default function PlayerAvatarFace({ icon, className = '' }) {
  const value = icon || '😊';
  const entry = byValue.get(normalizeEmoji(value));
  if (!entry?.filename) return <span className={`avatar-face-emoji ${className}`}>{value}</span>;
  const src = `/assets/playerIcons/${entry.filename}`;
  if (!(Number(entry.artSpan) > 0)) {
    return <img className={`avatar-face-whole ${className}`} src={src} alt={value} draggable="false" />;
  }
  const scale = ART / FACE.size;
  return (
    <span className={`avatar-face ${className}`}>
      <img
        src={src}
        alt={value}
        draggable="false"
        style={{
          width: `${scale * 100}%`,
          height: `${scale * 100}%`,
          left: `${(-FACE.x / FACE.size) * 100}%`,
          top: `${(-FACE.y / FACE.size) * 100}%`,
        }}
      />
    </span>
  );
}
