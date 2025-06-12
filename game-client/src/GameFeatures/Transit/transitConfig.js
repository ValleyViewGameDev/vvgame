// Mapping of signpost directions to entrance positions on the destination grid
const TRANSIT_POSITIONS = {
  N: { x: 30, y: 62 },   // Enter from south edge, middle
  NE: { x: 1, y: 62 },   // Enter from southwest corner
  E: { x: 1, y: 30 },    // Enter from west edge, middle
  SE: { x: 1, y: 1 },    // Enter from northwest corner
  S: { x: 30, y: 1 },    // Enter from north edge, middle
  SW: { x: 62, y: 1 },   // Enter from northeast corner
  W: { x: 62, y: 30 },   // Enter from east edge, middle
  NW: { x: 62, y: 62 },  // Enter from southeast corner
};

// Get the opposite direction for entrance position
const OPPOSITE_DIRECTION = {
  N: "S",
  NE: "SW",
  E: "W",
  SE: "NW",
  S: "N",
  SW: "NE",
  W: "E",
  NW: "SE"
};

export function getEntryPosition(direction) {
  return TRANSIT_POSITIONS[direction] || { x: 0, y: 0 }; // Default to center if unknown
}

export function getOppositeEntryPosition(direction) {
  const oppositeDir = OPPOSITE_DIRECTION[direction];
  return TRANSIT_POSITIONS[oppositeDir] || { x: 0, y: 0 };
}
