/**
 * AvatarFace - a player's SAVED avatar (player.avatar, the Edit Avatar editor) as a profile
 * picture: the composed figure cropped to its head, in a circle (docs/avatar-plan.md v2 P5).
 *
 *   <AvatarFace avatar={player.avatar} fallback={<whatever the site shows today>} size={40} />
 *
 * It draws ONLY a saved look. A player without one (or whose spec names parts an older catalogue
 * had) gets `fallback`: the site's own icon rendering, untouched. The look is composed once by
 * the shared compositor (cached per look) at 256 px and placed with CSS, so every site showing the
 * same player shares one image. Without `size` it fills its container (the header's round button).
 */
import React, { useEffect, useState } from 'react';
import { loadAvatarCatalogue } from '../Utils/TuningManager';
import { lookFor, byId } from './avatarLook';
import { renderLookDataUrl } from './avatarCompositor';
import './AvatarFace.css';

// The head in the figure square every part is drawn in, as fractions of the square: the same box
// the figure icons' faces use (x 156, y 0, size 200 of 512), which holds both bodies' heads
const FACE = { x: 156 / 512, y: 0, size: 200 / 512 };
const SOURCE_PX = 256;

/** The composed look's image URL for a spec, or null (no spec, an unknown face, still loading). */
export function useAvatarFaceUrl(avatar) {
  const key = avatar && avatar.skin ? JSON.stringify(avatar) : '';
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let live = true;
    if (!key) { setUrl(null); return undefined; }
    (async () => {
      try {
        const data = await loadAvatarCatalogue();
        const spec = JSON.parse(key);
        const face = byId(data.catalogue, spec.skin);
        if (!face || !face.file) { if (live) setUrl(null); return; }
        const look = lookFor(spec, data, {});
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
