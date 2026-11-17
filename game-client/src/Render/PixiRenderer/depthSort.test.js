import { actorZ, shadowZ } from './depthSort';

// B stands still on row 5; A walks. `y` is A's row as it goes (the renderer's tween).
const B = actorZ(5);
const steps = (from, to) => [0.05, 0.25, 0.5, 0.75, 0.95].map((p) => from + (to - from) * p);

describe('actorZ: who is in front, mid-step', () => {
  test('A leaves B\'s row going south: in front of B all the way', () => {
    for (const y of steps(5, 6)) expect(actorZ(y)).toBeGreaterThan(B);
  });
  test('A leaves B\'s row going north: behind B all the way', () => {
    for (const y of steps(5, 4)) expect(actorZ(y)).toBeLessThan(B);
  });
  test('A comes south onto B\'s row from the row north: behind B until it arrives', () => {
    for (const y of steps(4, 5)) expect(actorZ(y)).toBeLessThan(B);
  });
  test('A comes north onto B\'s row from the row south: in front of B until it arrives', () => {
    for (const y of steps(6, 5)) expect(actorZ(y)).toBeGreaterThan(B);
  });
  test('two walkers: the one lower on the screen is in front, whichever way each is going', () => {
    for (const a of steps(5, 6)) for (const b of steps(6, 5)) {
      if (Math.abs(a - b) < 1e-9) continue;
      expect(actorZ(a) > actorZ(b)).toBe(a > b);
    }
  });
  test('resources keep the rule: a walker is over its northern row\'s resources and under the row south\'s', () => {
    for (const y of [...steps(5, 6), ...steps(6, 5)]) { expect(actorZ(y)).toBeGreaterThan(5); expect(actorZ(y)).toBeLessThan(6); }
    expect(actorZ(5)).toBeGreaterThan(5); expect(actorZ(5)).toBeLessThan(6);
  });
  test('the player still wins a tie with an NPC at the same height, and stays inside the row', () => {
    for (const y of [5, ...steps(5, 6)]) { expect(actorZ(y, 0.51)).toBeGreaterThan(actorZ(y)); expect(actorZ(y, 0.511)).toBeLessThan(6); }
  });
  test('a shadow is under every actor of its row and over the row\'s resources', () => {
    for (const y of [5, ...steps(5, 6)]) { const s = shadowZ(actorZ(y)); expect(s).toBeLessThan(B); expect(s).toBeGreaterThan(5); }
  });
});
