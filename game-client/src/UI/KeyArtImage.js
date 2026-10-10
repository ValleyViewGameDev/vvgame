import React from 'react';

// The key art behind the login / Begin screen (and a new player's first load). Pinned to the
// top-left at its natural size on every layout (App.css .keyart-image): it never rescales, a
// bigger window shows more of it. Phones get their own file through <picture>, so mobile key
// art is one constant away; for now both point at the same image.
export const KEYART_DESKTOP = '/assets/images/ValleyViewLoadScreen.png';
export const KEYART_MOBILE = '/assets/images/ValleyViewLoadScreen.png';
// Same breakpoints as the phone layout (UI/Styles/mobile.css)
const PHONE_MEDIA = '(max-width: 767px), (max-height: 500px) and (orientation: landscape)';

export default function KeyArtImage({ style, alt = 'Secrets of Elsinore' }) {
  return (
    <picture>
      <source media={PHONE_MEDIA} srcSet={KEYART_MOBILE} />
      <img src={KEYART_DESKTOP} alt={alt} className="keyart-image" style={style} />
    </picture>
  );
}
