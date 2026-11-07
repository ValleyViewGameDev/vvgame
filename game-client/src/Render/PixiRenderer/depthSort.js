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
 * `tie` breaks a tie between actors on one row (the player wins over an NPC).
 */
export function actorZ(y, tie = 0.5) {
  return Math.floor(y + 1e-6) + tie;
}
