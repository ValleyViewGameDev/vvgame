// Escape from a Meta/TikTok in-app browser into the phone's real browser, keeping the same URL
// (utm tags included, so attribution carries over). House's Campaign 3 lost most in-app players
// on the return visit: no bookmark, no URL bar, storage that rarely survives (docs/launch-checklist.md).
//   Android: an intent:// URL with no package hands the page to the phone's default browser.
//   iOS 17+: the x-safari-https:// scheme opens Safari; some in-app browsers ignore it, so the
//   caller falls back to the "tap the ⋯ menu" instructions when the page is still visible.
// Returns false where there is no programmatic route (desktop, unknown platforms).
export function openInExternalBrowser() {
  const href = window.location.href;
  const ua = navigator.userAgent || '';
  if (/Android/i.test(ua)) {
    const u = new URL(href);
    window.location.href = `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;S.browser_fallback_url=${encodeURIComponent(href)};end`;
    return true;
  }
  if (/iPhone|iPad|iPod/i.test(ua)) {
    window.location.href = href.replace(/^https?:\/\//, 'x-safari-https://');
    return true;
  }
  return false;
}

// True where the hand-off goes to the default browser (Android) rather than Safari by name (iOS),
// so the copy says "your browser" instead of naming one.
export function opensDefaultBrowser() {
  return /Android/i.test(navigator.userAgent || '');
}
