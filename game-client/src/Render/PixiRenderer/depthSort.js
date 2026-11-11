/**
 * depthSort - the draw order of things standing on the ground (the y-sorted 'objects' layer in
 * PixiRenderer.js).
 *
 * A resource sorts at its anchor tile's row (zIndex = row). An actor (an NPC, the player)
 * sorts by the row it is standing on, and while it walks from one row to the next it keeps the
 * depth of the row it is LEAVING until it lands (owner 2026-11-11): stepping north, it stays in
 * front of the row it leaves (another actor, a tree) until it reaches the new tile; stepping
 * south, it stays behind the row it is entering until it gets there. Pass the step's target row
 * as `targetY`; without one (or once it has landed) the actor is on the row under its feet.
 * It is in front of everything on its own row, behind everything on the row south.
 * `tie` breaks a tie between actors on one row (the player wins over an NPC).
 */
export function actorZ(y, tie = 0.5, targetY = null) {
  const movingNorth = typeof targetY === 'number' && targetY < y - 1e-6;
  return (movingNorth ? Math.ceil(y - 1e-6) : Math.floor(y + 1e-6)) + tie;
}
