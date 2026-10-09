/**
 * Touch-first or pointer-first? Decides which wording the tutorial and help copy use:
 * a coarse primary pointer (phones, tablets) gets "tap to move"; a mouse or trackpad keeps
 * the keyboard hints. Strings carry an optional `<key>_touch` variant (stringsXX.json);
 * `uiString` picks it on touch devices and falls back to the base key.
 */
export function isTouchPrimary() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  if (window.matchMedia('(pointer: coarse)').matches) return true;
  return (navigator.maxTouchPoints || 0) > 0 && !window.matchMedia('(pointer: fine)').matches;
}

export function uiString(strings, key) {
  if (!strings) return undefined;
  if (isTouchPrimary() && strings[`${key}_touch`]) return strings[`${key}_touch`];
  return strings[key];
}

/**
 * Wrap a strings file so that, on a touch-first device, strings[key] returns strings[`${key}_touch`]
 * when that sibling exists. Enumeration, spreading and `in` see the plain file. Used by
 * UI/StringsContext.js so every component gets the right wording without wiring.
 */
export function withTouchVariants(file) {
  if (!file || !isTouchPrimary()) return file;
  return new Proxy(file, {
    get(target, prop, receiver) {
      if (typeof prop === 'string') {
        const touch = target[`${prop}_touch`];
        if (touch !== undefined) return touch;
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

/**
 * Does the primary pointer really hover (a mouse or trackpad)? Hover tooltips are desktop
 * only: on a touch screen the browser fakes mouseenter/mousemove on every tap, so a hovertip
 * pops up under the finger and sticks. Every hover tooltip checks this before opening, and
 * anything a tooltip says that the player needs (a gem cost, an unlock cost) is printed on
 * the control itself when this is false (docs/ui-conventions.md §5). A touch-first device is
 * never treated as hovering, even when it reports `(hover: hover)` (several Android phones do).
 */
export function canHover() {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  if (isTouchPrimary()) return false;
  return window.matchMedia('(hover: hover)').matches;
}

/**
 * Tag <html> with `touch-ui` on a touch-first device, and keep it current. Some phones (several
 * Android models) report `(hover: hover)`, so `@media (hover: hover)` alone lets a tapped button
 * keep its pale hover colour; the resource and quest button hover rules also require
 * `:where(html:not(.touch-ui))` (zero specificity, so they still lose to .disabled and friends).
 */
export function installTouchClass() {
  if (typeof window === 'undefined' || !window.matchMedia) return;
  const update = () => document.documentElement.classList.toggle('touch-ui', isTouchPrimary());
  update();
  for (const q of ['(pointer: coarse)', '(pointer: fine)']) {
    const mql = window.matchMedia(q);
    if (mql.addEventListener) mql.addEventListener('change', update); else if (mql.addListener) mql.addListener(update);
  }
}
