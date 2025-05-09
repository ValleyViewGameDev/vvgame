import { renderPositions } from '../PlayerMovement';

export function animateRemotePC(playerId, from, to, TILE_SIZE) {
  const stepCount = 10;
  let step = 0;

  const currentX = from.x * TILE_SIZE;
  const currentY = from.y * TILE_SIZE;
  const targetX = to.x * TILE_SIZE;
  const targetY = to.y * TILE_SIZE;

  function animate() {
    if (step >= stepCount) {
      delete renderPositions[playerId];
      return;
    }

    const interpolatedX = currentX + ((targetX - currentX) / stepCount) * step;
    const interpolatedY = currentY + ((targetY - currentY) / stepCount) * step;

    renderPositions[playerId] = {
      x: interpolatedX / TILE_SIZE,
      y: interpolatedY / TILE_SIZE,
    };

    step++;
    requestAnimationFrame(animate);
  }

  animate();
}