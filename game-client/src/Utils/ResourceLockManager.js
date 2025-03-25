const lockedResources = new Map(); // Key: "x-y", Value: timestamp

export function lockResource(x, y) {
  lockedResources.set(`${x}-${y}`, Date.now());
}

export function unlockResource(x, y) {
    lockedResources.delete(`${x}-${y}`);
}

export function isResourceLocked(x, y) {
  const lockTime = lockedResources.get(`${x}-${y}`);
  const now = Date.now();

  // Ignore lock if it has expired (e.g., 3 seconds timeout)
  return lockTime && now - lockTime < 1000;
}
