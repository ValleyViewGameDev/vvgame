import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import './Modal.css';
import '../Buttons/SharedButtons.css';
import { useStrings } from '../StringsContext';
import CloseButton from '../Buttons/CloseButton';
import { getLocalizedString } from '../../Utils/stringLookup';

/**
 * "Confirm / Spend X Gems?": asked before any spend of GEM_CONFIRM_MIN gems or more.
 *
 *   if (!(await confirmGemSpend({ gems, items }))) return;
 *
 * `items` lists the other resources the same action spends ([{ type, amount }] or
 * [{ symbol, name, amount }]). Resolves true straight away under the threshold. One
 * <GemSpendConfirmHost /> is mounted at the app root (index.js), above every panel and modal.
 *
 * Every recipe spend goes through Utils/InventoryManagement spendIngredients, which asks on its
 * own when the recipe holds 10+ Gem (confirmRecipeGemSpend). A caller that asks earlier (the gem
 * button, an optimistic animation that must not start before the answer) leaves a one-shot
 * "already confirmed" token that the next spend uses up, so the player is never asked twice.
 * Spends that skip spendIngredients (server routes, e.g. a crafting slot upgrade) pass
 * `oneShot: false` and must ask themselves.
 */
export const GEM_CONFIRM_MIN = 10;
const TOKEN_MS = 15000;

let showRequest = null; // set by the mounted host
let resourceDefs = [];  // masterResources, for symbols (setGemConfirmResources)
let confirmed = null;   // { gems, at }: a Yes the next spendIngredients may use

export const setGemConfirmResources = (list) => { resourceDefs = Array.isArray(list) ? list : []; };

export function confirmGemSpend({ gems, items = [], oneShot = true }) {
  if (!(Number(gems) >= GEM_CONFIRM_MIN)) return Promise.resolve(true);
  const ask = showRequest
    ? new Promise((resolve) => showRequest({ gems, items, resolve }))
    : Promise.resolve(window.confirm(`Spend ${gems} Gems?`));
  return ask.then((ok) => {
    confirmed = ok && oneShot ? { gems: Number(gems), at: Date.now() } : null;
    return ok;
  });
}

/**
 * For spendIngredients: asks when `recipe` holds 10+ Gem, unless the caller just confirmed it.
 * A caller asking ahead of its own spendIngredients passes { leaveToken: true }.
 */
export function confirmRecipeGemSpend(recipe, { leaveToken = false } = {}) {
  let gems = 0;
  const items = [];
  for (let i = 1; i <= 10; i++) {
    const type = recipe?.[`ingredient${i}`], qty = Number(recipe?.[`ingredient${i}qty`]) || 0;
    if (!type || qty <= 0) continue;
    if (type === 'Gem') gems += qty; else items.push({ type, amount: qty });
  }
  if (gems < GEM_CONFIRM_MIN) return Promise.resolve(true);
  const token = confirmed;
  confirmed = null;
  if (token && Date.now() - token.at < TOKEN_MS && gems <= token.gems) return Promise.resolve(true);
  return confirmGemSpend({ gems, items, oneShot: leaveToken });
}

const fmt = (n) => (typeof n === 'number' ? n.toLocaleString() : n);

export const GemSpendConfirmHost = () => {
  const strings = useStrings();
  const [request, setRequest] = useState(null);

  useEffect(() => {
    showRequest = (next) => setRequest((prev) => {
      if (prev) prev.resolve(false); // a second ask replaces an unanswered one
      return next;
    });
    return () => { showRequest = null; };
  }, []);

  if (!request) return null;
  const answer = (ok) => { request.resolve(ok); setRequest(null); };
  const items = (request.items || []).filter((i) => i && i.amount);

  return createPortal(
    <div className="modal-overlay" style={{ zIndex: 2147482000 }}>
      <div className="modal-container modal-small">
        <CloseButton corner onClick={() => answer(false)} />
        <div className="modal-title">{strings[2026] || 'Confirm'}</div>
        <div className="modal-content">
          <p className="modal-message">💎 {(strings[2027] || 'Spend {n} Gems?').replace('{n}', fmt(request.gems))}</p>
          {items.length > 0 && (
            <div className="modal-message">
              <div>{strings[2031] || 'This also uses:'}</div>
              {items.map((i, idx) => (
                <div key={idx}>
                  {i.symbol ?? (resourceDefs.find((r) => r.type === i.type)?.symbol || '')} {fmt(i.amount)} {i.name ?? getLocalizedString(i.type, strings)}
                </div>
              ))}
            </div>
          )}
          <div className="modal-buttons shared-buttons">
            <button className="btn-basic btn-neutral btn-modal" onClick={() => answer(false)}>
              {strings[2029] || 'Cancel'}
            </button>
            <button className="btn-basic btn-success btn-modal" onClick={() => answer(true)}>
              {strings[2028] || 'Yes'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
