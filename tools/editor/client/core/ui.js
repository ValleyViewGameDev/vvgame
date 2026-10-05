import { el, clear, $ } from './dom.js';

const root = () => $('#modal-root');

/** Open a modal. Returns { close }. Buttons: [{label, primary, danger, onClick(close)}]. */
export function modal({ title, body, buttons = [{ label: 'Close' }], width }) {
  const overlay = el('div', { class: 'overlay' });
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const foot = el('div', { class: 'foot' }, buttons.map((b) => el('button', {
    class: [b.primary && 'primary', b.danger && 'danger'].filter(Boolean).join(' '),
    onclick: () => (b.onClick ? b.onClick(close) : close()),
  }, b.label)));
  const box = el('div', { class: 'modal', style: width ? { width } : undefined }, [
    el('div', { class: 'head' }, [title || '', el('button', { onclick: close, title: 'Close' }, '×')]),
    el('div', { class: 'body' }, body),
    foot,
  ]);
  overlay.appendChild(box);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', onKey);
  root().appendChild(overlay);
  return { close, box };
}

/** Promise<boolean> confirm dialog. */
export function confirm(message, { title = 'Confirm', okLabel = 'OK', danger = false } = {}) {
  return new Promise((resolve) => {
    modal({
      title,
      body: el('div', {}, message),
      buttons: [
        { label: 'Cancel', onClick: (close) => { close(); resolve(false); } },
        { label: okLabel, primary: !danger, danger, onClick: (close) => { close(); resolve(true); } },
      ],
    });
  });
}

/** Promise<string|null> text prompt. */
export function prompt(message, { title = 'Input', value = '', placeholder = '' } = {}) {
  return new Promise((resolve) => {
    const input = el('input', { value, placeholder, style: { width: '100%' } });
    const m = modal({
      title,
      body: el('div', {}, [el('div', { class: 'note' }, message), input]),
      buttons: [
        { label: 'Cancel', onClick: (close) => { close(); resolve(null); } },
        { label: 'OK', primary: true, onClick: (close) => { close(); resolve(input.value); } },
      ],
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { m.close(); resolve(input.value); } });
    setTimeout(() => input.focus(), 0);
  });
}

export function toast(message, kind = 'info', ms = 3500) {
  const t = el('div', { class: `toast ${kind}` }, message);
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), ms);
  return t;
}

export function setStatus(text) { const s = $('#status'); if (s) s.textContent = text || ''; }

/** Simple text diff (line-based) for the Diff modal. Returns an element. */
export function diffElement(beforeText, afterText) {
  const a = beforeText.split('\n'), b = afterText.split('\n');
  // LCS on lines (fine for a few thousand lines)
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = el('div', { class: 'diff' });
  let i = 0, j = 0, ctx = 0;
  const push = (cls, line) => out.appendChild(el('div', { class: cls }, (cls === 'add' ? '+ ' : cls === 'del' ? '- ' : '  ') + line));
  while (i < n && j < m) {
    if (a[i] === b[j]) { if (ctx < 2) push('', a[i]); i++; j++; ctx++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { push('del', a[i++]); ctx = 0; }
    else { push('add', b[j++]); ctx = 0; }
  }
  while (i < n) push('del', a[i++]);
  while (j < m) push('add', b[j++]);
  if (!out.childNodes.length) out.textContent = 'No differences.';
  return out;
}

export { clear };
