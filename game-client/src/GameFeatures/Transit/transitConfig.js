// Mapping of signpost directions to entrance positions on the destination grid
const TRANSIT_POSITIONS = {
  N: { x: 31, y: 63 },   // Enter from south edge, middle
  NE: { x: 0, y: 63 },   // Enter from southwest corner
  E: { x: 0, y: 31 },    // Enter from west edge, middle
  SE: { x: 0, y: 0 },    // Enter from northwest corner
  S: { x: 31, y: 0 },    // Enter from north edge, middle
  SW: { x: 63, y: 0 },   // Enter from northeast corner
  W: { x: 63, y: 31 },   // Enter from east edge, middle
  NW: { x: 63, y: 63 },  // Enter from southeast corner
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
