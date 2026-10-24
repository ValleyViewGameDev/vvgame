import React from 'react';
import { useStrings } from '../StringsContext';
import TransactionButton from '../Buttons/TransactionButton';
import '../Buttons/SharedButtons.css';
import './SellSection.css';

/**
 * SellSection: the pinned bottom row of a panel opened from something placed on the grid (a
 * building, station, deco, plot, pet) or a placed NPC (docs/ui-conventions.md §3, "Sell section").
 * Build it with sellSection({...}) and pass the result as the panel's footer:
 *   <Panel footer={sellSection({ canSell, isDeveloper, ... })}>
 * (it returns null when there is nothing to show, so the panel draws no footer at all).
 *
 *   Sell (💰120 +5🪵)   [⤧]      Sell takes the left 60%, Move the rest
 *
 * The label is the refund the server gives back (routes/worldRoutes.js /sell-for-refund: the
 * item's recipe, every ingredient at full quantity): Money first, then any other ingredient as
 * "+qty symbol"; a removal that returns nothing reads "Sell (💰0)".
 *
 * Who sees what (owner 2026-10-22):
 *   allowed for this player             green button
 *   not allowed, player is a developer  RED button (red = developer-only)
 *   not allowed, not a developer        hidden; both hidden = no Sell section at all
 * Move follows Sell: where the rules stop a sale (a town building) they stop a move too.
 * sellLocked: a building that can never be sold, by anyone (the Trading Post, the Warehouse):
 * Sell stays in place as a grayed, untappable button so Move keeps its spot (owner 2026-10-25).
 *
 * Props:
 *   canSell, canMove (default canSell), isDeveloper   the rules above
 *   sellLocked                      never sellable: a gray, disabled Sell (pass canMove for Move)
 *   resourceType, masterResources   what is being sold (its recipe is the refund)
 *   refund                          optional [{ type, quantity }] when the refund is not the recipe
 *   onSell(transactionId, key)      the panel's own sell handler (unchanged per panel)
 *   transactionKey                  spam-click key for the sell
 *   onMove()                        pick the thing up (GameFeatures/Move); omit for NPCs (they walk about)
 *   disabled                        both buttons
 */
export function refundFor(resourceType, masterResources, refund) {
  const def = (masterResources || []).find((r) => r.type === resourceType);
  const items = refund || [1, 2, 3, 4]
    .map((i) => def?.[`ingredient${i}`] && { type: def[`ingredient${i}`], quantity: Number(def[`ingredient${i}qty`]) || 0 })
    .filter(Boolean);
  const money = items.filter((i) => i.type === 'Money').reduce((t, i) => t + i.quantity, 0);
  const others = items.filter((i) => i.type !== 'Money' && i.quantity > 0)
    .map((i) => ({ ...i, symbol: (masterResources || []).find((r) => r.type === i.type)?.symbol || '' }));
  return { money, others };
}

// what to show; *Dev = shown only because the player is a developer
function visibility({ canSell = false, canMove, isDeveloper = false, onMove, sellLocked = false }) {
  const moveAllowed = canMove === undefined ? canSell : canMove;
  return {
    sell: sellLocked || canSell || isDeveloper,
    sellDev: !sellLocked && !canSell && isDeveloper,
    move: !!onMove && (moveAllowed || isDeveloper),
    moveDev: !!onMove && !moveAllowed && isDeveloper,
  };
}

/** The panel footer: a <SellSection> when there is something to show, else null (no footer). */
export function sellSection(props) {
  const v = visibility(props);
  return v.sell || v.move ? <SellSection {...props} /> : null;
}

// four arrows out from the centre: the usual "move" mark (there is no four-way arrow emoji)
const MoveIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="12" y1="3" x2="12" y2="21" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <polyline points="9,6 12,3 15,6" />
    <polyline points="9,18 12,21 15,18" />
    <polyline points="6,9 3,12 6,15" />
    <polyline points="18,9 21,12 18,15" />
  </svg>
);

export default function SellSection({ resourceType, masterResources, refund, onSell, transactionKey, onMove, canSell, canMove, isDeveloper, sellLocked = false, disabled = false }) {
  const strings = useStrings();
  const v = visibility({ canSell, canMove, isDeveloper, onMove, sellLocked });
  if (!v.sell && !v.move) return null;
  const { money, others } = refundFor(resourceType, masterResources, refund);
  const label = `${strings[2112] || 'Sell'} (💰${money.toLocaleString()}${others.map((o) => ` +${o.quantity.toLocaleString()}${o.symbol}`).join('')})`;
  return (
    <div className={`sell-section shared-buttons ${v.move ? '' : 'sell-section--sell-only'} ${v.sell ? '' : 'sell-section--move-only'}`}>
      {v.sell && sellLocked && (
        <button type="button" className="btn-basic btn-neutral sell-section-sell" disabled>
          {strings[2112] || 'Sell'}
        </button>
      )}
      {v.sell && !sellLocked && (
        <TransactionButton
          className={`btn-basic ${v.sellDev ? 'btn-danger' : 'btn-success'} sell-section-sell`}
          onAction={onSell}
          transactionKey={transactionKey || `sell-${resourceType}`}
          disabled={disabled}
        >
          {label}
        </TransactionButton>
      )}
      {v.move && (
        <button
          type="button"
          className={`btn-basic ${v.moveDev ? 'btn-danger' : 'btn-success'} sell-section-move`}
          onClick={onMove}
          disabled={disabled}
          title={strings[2113] || 'Move'}
          aria-label={strings[2113] || 'Move'}
        >
          <MoveIcon />
        </button>
      )}
    </div>
  );
}
