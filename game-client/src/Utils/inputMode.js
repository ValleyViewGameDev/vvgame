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
