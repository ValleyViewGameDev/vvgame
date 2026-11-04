import FloatingTextManager from '../UI/FloatingText';

/**
 * The one "no room" response for collecting from the board (a doober, ResourceClicking.js; a farm
 * animal, NPCs/NPCUtils.js): "Not enough room..." in the status bar, "You're full" over the
 * tile, and the Inventory panel opens so the player can make room. Nothing is collected; the
 * caller leaves the doober or the animal's product where it was. A missing Backpack is a
 * different problem with its own message (19, "No backpack") and does not come here.
 */
export function reportNoRoom({ col, row, TILE_SIZE, strings, updateStatus, openPanel }) {
  updateStatus?.(43);
  FloatingTextManager.addFloatingText(strings?.['41'] || "You're full", col, row, TILE_SIZE);
  openPanel?.('InventoryPanel');
}
