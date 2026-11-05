import FloatingTextManager from '../UI/FloatingText';
import { hasRoomFor, isCurrency } from './InventoryManagement';

/**
 * The one "no room" response for anything collected into the holdings: a doober on the board
 * (ResourceClicking.js), a farm animal (NPCs/NPCUtils.js), a crafting station's slot, the Farm
 * House, the Ancient Temple, a pet. "Not enough room..." in the status bar, "You're full" where the
 * thing was (its tile, or the panel card that was tapped), and nothing is collected: the caller
 * leaves the item where it was. A missing Backpack is a different problem with its own message
 * (19, "No backpack").
 *
 * Where the text appears (`at`):
 *   { col, row, TILE_SIZE }   a board tile
 *   { rect }                  a panel card (a DOMRect: the text rises from its centre)
 * `openPanel` (board collects only) opens Inventory so the player can make room; a collect made in
 * a panel leaves the player in that panel.
 *
 * The order is always: check room FIRST (canCollect), and only then show the "+N" and send the
 * request; if the server refuses anyway (its copy was fuller), reportRefusal gives the same response.
 */

function floatAt(at, text) {
  if (!at) return;
  if (at.rect) {
    const r = at.rect;
    FloatingTextManager.addFloatingTextAt(text, r.left + r.width / 2, r.top + r.height / 2);
  } else if (at.col !== undefined && at.row !== undefined) {
    FloatingTextManager.addFloatingText(text, at.col, at.row, at.TILE_SIZE);
  }
}

/** Not enough room: status 43 + "You're full" (+ Inventory for a board collect). */
export function reportNoRoom({ col, row, TILE_SIZE, rect, at, strings, updateStatus, openPanel }) {
  updateStatus?.(43);
  floatAt(at || (rect ? { rect } : { col, row, TILE_SIZE }), strings?.['41'] || "You're full");
  openPanel?.('InventoryPanel');
}

/** Away from home without a Backpack: status 19 + "No backpack". */
export function reportNoBackpack({ at, strings, updateStatus }) {
  updateStatus?.(19);
  floatAt(at, strings?.['44'] || 'No backpack');
}

/**
 * The room check before a collect, with the response when there is none. True = go ahead.
 *   canCollect({ resource, quantity, currentPlayer, inventory, backpack, masterResources,
 *                globalTuning, at, strings, updateStatus, openPanel })
 */
export function canCollect({ resource, quantity, currentPlayer, inventory, backpack, masterResources, globalTuning, at, strings, updateStatus, openPanel }) {
  if (isCurrency(resource)) return true;
  const awayFromHome = currentPlayer?.location?.gtype !== 'homestead';
  if (awayFromHome && !currentPlayer?.skills?.some((s) => s.type === 'Backpack' && s.quantity > 0)) {
    reportNoBackpack({ at, strings, updateStatus });
    return false;
  }
  if (!hasRoomFor({
    resource, quantity, currentPlayer,
    // the App's inventory state starts as {}: fall back to the player record's arrays
    inventory: Array.isArray(inventory) ? inventory : (currentPlayer?.inventory || []),
    backpack: Array.isArray(backpack) ? backpack : (currentPlayer?.backpack || []),
    masterResources, globalTuning,
  })) {
    reportNoRoom({ at, strings, updateStatus, openPanel });
    return false;
  }
  return true;
}

/**
 * The same response for a refusal from an /action/* route. True when the reason was about room
 * (and has been reported); false for any other reason, which the caller reports itself.
 */
export function reportRefusal(reason, { at, strings, updateStatus, openPanel } = {}) {
  if (reason === 'no-backpack') { reportNoBackpack({ at, strings, updateStatus }); return true; }
  if (reason === 'warehouse-full' || reason === 'backpack-full') { reportNoRoom({ at, strings, updateStatus, openPanel }); return true; }
  return false;
}
