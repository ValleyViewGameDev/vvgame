/**
 * AvatarFace - a player's avatar (player.avatar, the avatar editor) as a profile picture: the
 * composed figure cropped to its head, in a circle (docs/avatar-plan.md v2 P5).
 *
 *   <AvatarFace avatar={player.avatar} fallback={<shown until the picture is ready>} size={40} />
 *
 * A player who has not made a look (or whose saved one names a face the catalogue no longer has)
 * is drawn in the DEFAULT look (avatarLook.specFor), so every player has a face; `fallback` only
 * shows while the catalogue and the picture load, or if they cannot. The look is composed once by
 * the shared compositor (cached per look) at 256 px and placed with CSS, so every site showing the
 * same player shares one image. Without `size` it fills its container (the header's round button).
 */
import React, { useEffect, useState } from 'react';
import { loadAvatarCatalogue } from '../Utils/TuningManager';
import { lookFor, specFor } from './avatarLook';
import { renderLookDataUrl } from './avatarCompositor';
import './AvatarFace.css';

// The head in the figure square every part is drawn in, as fractions of the square: the same box
// the figure icons' faces use (x 156, y 0, size 200 of 512), which holds both bodies' heads
const FACE = { x: 156 / 512, y: 0, size: 200 / 512 };
const SOURCE_PX = 256;

/** The composed look's image URL for a player's saved spec (the default look when there is none), or null while it loads. */
export function useAvatarFaceUrl(avatar) {
  const key = avatar && avatar.skin ? JSON.stringify(avatar) : '';
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const data = await loadAvatarCatalogue();
        if (!data.catalogue.length) { if (live) setUrl(null); return; } // the catalogue could not be read: the fallback
        const look = lookFor(specFor(key ? JSON.parse(key) : null, data), data, {});
        const dataUrl = await renderLookDataUrl(look.layers, { size: SOURCE_PX });
        if (live) setUrl(dataUrl);
      } catch (e) { if (live) setUrl(null); }
    })();
    return () => { live = false; };
  }, [key]);
  return url;
}

export default function AvatarFace({ avatar, fallback = null, size = null, className = '' }) {
  const url = useAvatarFaceUrl(avatar);
  if (!url) return fallback;
  const scale = 1 / FACE.size;
  return (
    <span className={`avatar-face-crop ${size ? 'avatar-face-sized' : ''} ${className}`.trim()} style={size ? { width: size, height: size } : undefined}>
      <img src={url} alt="" draggable="false" style={{ width: `${scale * 100}%`, height: `${scale * 100}%`, left: `${-FACE.x * scale * 100}%`, top: `${-FACE.y * scale * 100}%` }} />
    </span>
  );
}
