/**
 * depthSort - the draw order of things standing on the ground (the y-sorted 'objects' layer in
 * PixiRenderer.js).
 *
 * A resource sorts at its anchor tile's row (zIndex = row). An actor (an NPC, the player)
 * sorts by where its FEET are, not by its in-between position. While it walks from one row to
 * the next it counts as the northern of the two rows:
 * - stepping north, it goes behind a tree on the row it is leaving at once, not halfway;
 * - stepping south, it stays behind the trees of the row it is entering until it gets there.
 * It is in front of everything on its own row, behind everything on the row south.
 *
 * AMONG ACTORS the order is by where the feet really are, mid-step too (owner 2026-11-16): whoever
 * is lower on the screen is in front. Counting a walker as its northern row alone made it TIE with
 * a neighbour standing on that row, and a tie is drawn in the order the sprites were made: a cow
 * stepping south past another on its row, or coming north onto another's row, drew behind it or
 * in front of it by luck. So how far the actor is through its row (0..1) is added, scaled to stay
 * inside the row's band: it never passes a resource of the row south, and every actor on the way
 * to or from a row is on the right side of every actor standing on it.
 *
 * `tie` breaks a tie between actors at the same height (the player wins over an NPC).
 */
export const ACTOR_BAND = 0.4; // an actor's zIndex runs from row + tie to row + tie + this, as it goes down its row

export function actorZ(y, tie = 0.5) {
  const row = Math.floor(y + 1e-6);
  return row + tie + Math.max(0, Math.min(1, y - row)) * ACTOR_BAND;
}

/** Where a ground shadow sorts for the actor whose zIndex is `z`: under every actor of that row, over the row's resources. */
export function shadowZ(z) {
  return Math.floor(z) + 0.45;
}
