// AmbientVFX.js - PixiJS rendering for ambient visual effects

import { Container, Graphics } from 'pixi.js-legacy';

const FADE_DURATION_MS = 1000;

/**
 * Base class for ambient effects
 */
class AmbientEffect {
  constructor(app, gridWidth, gridHeight, TILE_SIZE) {
    this.app = app;
    this.gridWidth = gridWidth;
    this.gridHeight = gridHeight;
    this.TILE_SIZE = TILE_SIZE;
    this.container = new Container();
    this.container.alpha = 0;
    this.isActive = false;
    this.animationFrame = null;
    this.fadeAnimationFrame = null;
  }

  fadeIn() {
    const startTime = Date.now();
    const startAlpha = this.container.alpha;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / FADE_DURATION_MS, 1);
      this.container.alpha = startAlpha + (1 - startAlpha) * progress;

      if (progress < 1) {
        this.fadeAnimationFrame = requestAnimationFrame(animate);
      }
    };

    if (this.fadeAnimationFrame) {
      cancelAnimationFrame(this.fadeAnimationFrame);
    }
    animate();
  }

  fadeOut(onComplete) {
    const startTime = Date.now();
    const startAlpha = this.container.alpha;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / FADE_DURATION_MS, 1);
      this.container.alpha = startAlpha * (1 - progress);

      if (progress < 1) {
        this.fadeAnimationFrame = requestAnimationFrame(animate);
      } else {
        this.stop();
        if (onComplete) onComplete();
      }
    };

    if (this.fadeAnimationFrame) {
      cancelAnimationFrame(this.fadeAnimationFrame);
    }
    animate();
  }

  start() {
    this.isActive = true;
  }

  stop() {
    this.isActive = false;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  destroy() {
    this.stop();
    if (this.fadeAnimationFrame) {
      cancelAnimationFrame(this.fadeAnimationFrame);
      this.fadeAnimationFrame = null;
    }
    if (this.container.parent) {
      this.container.parent.removeChild(this.container);
    }
    this.container.destroy({ children: true });
  }
}

/**
 * Butterflies effect - organic floating particles in packs
 */
class ButterfliesEffect extends AmbientEffect {
  constructor(app, gridWidth, gridHeight, TILE_SIZE) {
    super(app, gridWidth, gridHeight, TILE_SIZE);
    this.packs = [];
    this.packCount = 8; // Number of packs
    this.colors = [0xFFB347, 0xFF6B6B, 0x87CEEB, 0xDDA0DD, 0x98FB98, 0xFFD700];
    this.init();
  }

  init() {
    const worldWidth = this.gridWidth * this.TILE_SIZE;
    const worldHeight = this.gridHeight * this.TILE_SIZE;

    for (let p = 0; p < this.packCount; p++) {
      // Each pack has 2-5 butterflies
      const packSize = 2 + Math.floor(Math.random() * 4);

      // Pack center position
      const packCenterX = Math.random() * worldWidth;
      const packCenterY = Math.random() * worldHeight;

      // Shared pack movement direction (with individual variation)
      const packAngle = Math.random() * Math.PI * 2;
      const packSpeed = 0.3 + Math.random() * 0.3;
      const packVx = Math.cos(packAngle) * packSpeed;
      const packVy = Math.sin(packAngle) * packSpeed * 0.6;

      const pack = {
        vx: packVx,
        vy: packVy,
        turnPhase: Math.random() * Math.PI * 2,
        butterflies: []
      };

      for (let i = 0; i < packSize; i++) {
        const butterfly = this.createButterfly();

        // Position near pack center with some spread
        butterfly.x = packCenterX + (Math.random() - 0.5) * 60;
        butterfly.y = packCenterY + (Math.random() - 0.5) * 60;

        // Individual movement variation relative to pack
        butterfly.individualVx = (Math.random() - 0.5) * 0.15;
        butterfly.individualVy = (Math.random() - 0.5) * 0.1;

        // Movement properties for fluttering
        butterfly.phase = Math.random() * Math.PI * 2;
        butterfly.speed = 0.3 + Math.random() * 0.4;
        butterfly.amplitude = 15 + Math.random() * 25;
        butterfly.wingPhase = Math.random() * Math.PI * 2;
        butterfly.wingSpeed = 0.1 + Math.random() * 0.05;

        pack.butterflies.push(butterfly);
        this.container.addChild(butterfly);
      }

      this.packs.push(pack);
    }
  }

  createButterfly() {
    const container = new Container();
    const color = this.colors[Math.floor(Math.random() * this.colors.length)];
    const size = 4 + Math.random() * 4;

    // Left wing
    const leftWing = new Graphics();
    leftWing.beginFill(color, 0.8);
    leftWing.drawEllipse(-size * 0.6, 0, size, size * 0.6);
    leftWing.endFill();
    leftWing.name = 'leftWing';
    container.addChild(leftWing);

    // Right wing
    const rightWing = new Graphics();
    rightWing.beginFill(color, 0.8);
    rightWing.drawEllipse(size * 0.6, 0, size, size * 0.6);
    rightWing.endFill();
    rightWing.name = 'rightWing';
    container.addChild(rightWing);

    // Body
    const body = new Graphics();
    body.beginFill(0x333333, 0.9);
    body.drawEllipse(0, 0, size * 0.15, size * 0.5);
    body.endFill();
    container.addChild(body);

    return container;
  }

  start() {
    super.start();
    this.lastTime = Date.now();
    this.animate();
  }

  animate() {
    if (!this.isActive) return;

    const now = Date.now();
    const delta = (now - this.lastTime) / 16.67; // Normalize to ~60fps
    this.lastTime = now;

    const worldWidth = this.gridWidth * this.TILE_SIZE;
    const worldHeight = this.gridHeight * this.TILE_SIZE;

    for (const pack of this.packs) {
      // Update pack turn phase for gentle drifting direction changes
      pack.turnPhase += 0.008 * delta;

      // Apply gentle turn to pack velocity
      const turnAmount = Math.sin(pack.turnPhase) * 0.003 * delta;
      const currentAngle = Math.atan2(pack.vy, pack.vx);
      const newAngle = currentAngle + turnAmount;
      const speed = Math.sqrt(pack.vx * pack.vx + pack.vy * pack.vy);
      pack.vx = Math.cos(newAngle) * speed;
      pack.vy = Math.sin(newAngle) * speed;

      // Occasional larger direction change for the whole pack
      if (Math.random() < 0.001) {
        const newPackAngle = Math.random() * Math.PI * 2;
        const newPackSpeed = 0.3 + Math.random() * 0.3;
        pack.vx = Math.cos(newPackAngle) * newPackSpeed;
        pack.vy = Math.sin(newPackAngle) * newPackSpeed * 0.6;
      }

      // Calculate pack center for wrapping
      let packCenterX = 0;
      let packCenterY = 0;
      for (const butterfly of pack.butterflies) {
        packCenterX += butterfly.x;
        packCenterY += butterfly.y;
      }
      packCenterX /= pack.butterflies.length;
      packCenterY /= pack.butterflies.length;

      // Check if pack needs to wrap
      const margin = 100;
      let wrapX = 0;
      let wrapY = 0;
      if (packCenterX < -margin) wrapX = worldWidth + margin * 2;
      if (packCenterX > worldWidth + margin) wrapX = -(worldWidth + margin * 2);
      if (packCenterY < -margin) wrapY = worldHeight + margin * 2;
      if (packCenterY > worldHeight + margin) wrapY = -(worldHeight + margin * 2);

      for (const butterfly of pack.butterflies) {
        // Update phase for sine wave movement
        butterfly.phase += butterfly.speed * 0.02 * delta;
        butterfly.wingPhase += butterfly.wingSpeed * delta;

        // Calculate actual movement for this frame (pack velocity + individual variation)
        const sineOffset = Math.sin(butterfly.phase) * butterfly.amplitude * 0.01;
        const actualVx = (pack.vx + butterfly.individualVx + sineOffset) * delta;
        const actualVy = (pack.vy + butterfly.individualVy) * delta + Math.cos(butterfly.phase * 0.5) * 0.3 * delta;

        // Apply movement
        butterfly.x += actualVx;
        butterfly.y += actualVy;

        // Apply wrap if needed
        if (wrapX !== 0) butterfly.x += wrapX;
        if (wrapY !== 0) butterfly.y += wrapY;

        // Wing flapping animation
        const wingAngle = Math.sin(butterfly.wingPhase) * 0.4;
        const leftWing = butterfly.getChildByName('leftWing');
        const rightWing = butterfly.getChildByName('rightWing');
        if (leftWing) leftWing.scale.x = 0.6 + Math.abs(wingAngle) * 0.4;
        if (rightWing) rightWing.scale.x = 0.6 + Math.abs(wingAngle) * 0.4;

        // Rotate butterfly to point in movement direction
        // atan2 gives angle from positive x-axis, add PI/2 to orient body forward
        const targetRotation = Math.atan2(actualVy, actualVx) + Math.PI / 2;
        // Smooth rotation interpolation to avoid jarring snaps
        const rotationSpeed = 0.1;
        let rotationDiff = targetRotation - butterfly.rotation;
        // Normalize to -PI to PI range
        while (rotationDiff > Math.PI) rotationDiff -= Math.PI * 2;
        while (rotationDiff < -Math.PI) rotationDiff += Math.PI * 2;
        butterfly.rotation += rotationDiff * rotationSpeed;
      }
    }

    this.animationFrame = requestAnimationFrame(() => this.animate());
  }
}

/**
 * Clouds effect - billowy white clouds drifting across the grid
 */
class CloudsEffect extends AmbientEffect {
  constructor(app, gridWidth, gridHeight, TILE_SIZE) {
    super(app, gridWidth, gridHeight, TILE_SIZE);
    this.clouds = [];
    this.cloudCount = 10;
    this.init();
  }

  init() {
    const worldWidth = this.gridWidth * this.TILE_SIZE;
    const worldHeight = this.gridHeight * this.TILE_SIZE;

    for (let i = 0; i < this.cloudCount; i++) {
      const cloud = this.createCloud();
      cloud.x = Math.random() * worldWidth;
      cloud.y = Math.random() * worldHeight; // Clouds across full height

      // Randomly move left or right
      const movesRight = Math.random() > 0.5;
      cloud.vx = (movesRight ? 1 : -1) * (0.25 + Math.random() * 0.2); // Moderate drift

      // Semi-transparent (store target alpha for fading)
      cloud.targetAlpha = 0.25 + Math.random() * 0.15;
      cloud.alpha = cloud.targetAlpha; // Start fully visible

      this.clouds.push(cloud);
      this.container.addChild(cloud);
    }
  }

  createCloud() {
    const container = new Container();
    // More puffs for billowy look
    const numPuffs = 6 + Math.floor(Math.random() * 5);
    const baseSize = 50 + Math.random() * 70; // Larger clouds

    // Create overlapping circles for billowy effect
    for (let i = 0; i < numPuffs; i++) {
      const puff = new Graphics();
      // Semi-transparent white
      puff.beginFill(0xFFFFFF, 0.5 + Math.random() * 0.2);
      const puffSize = baseSize * (0.5 + Math.random() * 0.5);
      // More spread out for billowy appearance
      puff.drawCircle(
        (i - numPuffs / 2) * baseSize * 0.4 + (Math.random() - 0.5) * baseSize * 0.3,
        (Math.random() - 0.5) * baseSize * 0.5,
        puffSize
      );
      puff.endFill();
      container.addChild(puff);
    }

    // Add extra smaller puffs on top for texture
    for (let i = 0; i < 3; i++) {
      const smallPuff = new Graphics();
      smallPuff.beginFill(0xFFFFFF, 0.4);
      const smallSize = baseSize * (0.3 + Math.random() * 0.3);
      smallPuff.drawCircle(
        (Math.random() - 0.5) * baseSize * 1.5,
        (Math.random() - 0.5) * baseSize * 0.4,
        smallSize
      );
      smallPuff.endFill();
      container.addChild(smallPuff);
    }

    return container;
  }

  start() {
    super.start();
    this.lastTime = Date.now();
    this.animate();
  }

  animate() {
    if (!this.isActive) return;

    const now = Date.now();
    const delta = (now - this.lastTime) / 16.67;
    this.lastTime = now;

    const worldWidth = this.gridWidth * this.TILE_SIZE;
    const margin = 150;
    const fadeZone = 100; // Distance over which clouds fade in/out
    const fadeSpeed = 0.03; // How fast clouds fade

    for (const cloud of this.clouds) {
      cloud.x += cloud.vx * delta;

      // Wrap around based on direction
      if (cloud.vx > 0 && cloud.x > worldWidth + margin) {
        cloud.x = -margin;
        cloud.alpha = 0; // Start invisible after wrap
      } else if (cloud.vx < 0 && cloud.x < -margin) {
        cloud.x = worldWidth + margin;
        cloud.alpha = 0; // Start invisible after wrap
      }

      // Calculate target alpha based on position (fade near edges)
      let edgeFade = 1;
      if (cloud.vx > 0) {
        // Moving right: fade in from left edge, fade out at right edge
        if (cloud.x < fadeZone) {
          edgeFade = Math.max(0, cloud.x / fadeZone);
        } else if (cloud.x > worldWidth - fadeZone) {
          edgeFade = Math.max(0, (worldWidth - cloud.x) / fadeZone);
        }
      } else {
        // Moving left: fade in from right edge, fade out at left edge
        if (cloud.x > worldWidth - fadeZone) {
          edgeFade = Math.max(0, (worldWidth - cloud.x) / fadeZone + 1);
        } else if (cloud.x < fadeZone) {
          edgeFade = Math.max(0, cloud.x / fadeZone);
        }
      }

      // Smoothly interpolate alpha towards target
      const targetAlpha = cloud.targetAlpha * edgeFade;
      cloud.alpha += (targetAlpha - cloud.alpha) * fadeSpeed * delta;
    }

    this.animationFrame = requestAnimationFrame(() => this.animate());
  }
}

/**
 * Birds effect - large ravens flying across the grid in flocks
 */
class BirdsEffect extends AmbientEffect {
  constructor(app, gridWidth, gridHeight, TILE_SIZE) {
    super(app, gridWidth, gridHeight, TILE_SIZE);
    this.flocks = [];
    this.flockCount = 3; // Number of flocks
    this.birdsPerFlock = 3;
    this.init();
  }

  init() {
    const worldWidth = this.gridWidth * this.TILE_SIZE;
    const worldHeight = this.gridHeight * this.TILE_SIZE;

    for (let f = 0; f < this.flockCount; f++) {
      // Each flock has a leader position and shared direction
      const flockLeaderX = Math.random() * worldWidth;
      const flockLeaderY = Math.random() * worldHeight * 0.6;
      const flockAngle = Math.random() * Math.PI * 2;
      const flockSpeed = 1.0 + Math.random() * 0.4; // Faster flight

      // Flock turning parameters (shared by all birds in flock)
      const flockTurnRate = (Math.random() - 0.5) * 0.004; // Gentler curves for longer arcs
      const flockTurnPhase = Math.random() * Math.PI * 2;

      const flock = {
        vx: Math.cos(flockAngle) * flockSpeed,
        vy: Math.sin(flockAngle) * flockSpeed * 0.4,
        turnRate: flockTurnRate,
        turnPhase: flockTurnPhase,
        birds: []
      };

      // Create birds in a loose V formation
      for (let i = 0; i < this.birdsPerFlock; i++) {
        const bird = this.createBird();

        // Position in V formation relative to leader
        // Bird 0 is leader, birds 1 and 2 are behind and to the sides
        let offsetX = 0;
        let offsetY = 0;
        if (i === 1) {
          offsetX = -25 - Math.random() * 10;
          offsetY = -20 - Math.random() * 10;
        } else if (i === 2) {
          offsetX = -25 - Math.random() * 10;
          offsetY = 20 + Math.random() * 10;
        }

        bird.x = flockLeaderX + offsetX;
        bird.y = flockLeaderY + offsetY;

        // Store formation offset for maintaining flock cohesion
        bird.formationOffsetX = offsetX;
        bird.formationOffsetY = offsetY;

        // Small individual variation in movement
        bird.individualDrift = {
          x: (Math.random() - 0.5) * 0.02,
          y: (Math.random() - 0.5) * 0.02
        };

        // Wing flapping (slightly different phase per bird)
        bird.wingPhase = Math.random() * Math.PI * 2;
        bird.wingSpeed = 0.07 + Math.random() * 0.02;

        // Current rotation
        bird.rotation = flockAngle;

        flock.birds.push(bird);
        this.container.addChild(bird);
      }

      this.flocks.push(flock);
    }
  }

  createBird() {
    const container = new Container();
    const size = 12 + Math.random() * 6; // Bigger than butterflies

    // Bird is drawn facing RIGHT (positive x direction)
    // When rotation = 0, bird faces right

    // Tail feathers (behind body, to the left)
    const tail = new Graphics();
    tail.beginFill(0x1a1a1a, 0.9);
    tail.moveTo(-size * 0.6, 0);
    tail.lineTo(-size * 1.2, -size * 0.2);
    tail.lineTo(-size * 1.3, 0);
    tail.lineTo(-size * 1.2, size * 0.2);
    tail.lineTo(-size * 0.6, 0);
    tail.endFill();
    container.addChild(tail);

    // Body - elongated dark shape (horizontal, along x-axis)
    const body = new Graphics();
    body.beginFill(0x1a1a1a, 0.95);
    body.drawEllipse(0, 0, size * 0.6, size * 0.2);
    body.endFill();
    container.addChild(body);

    // Left wing - extends UP from body (negative y)
    const leftWing = new Graphics();
    leftWing.beginFill(0x2a2a2a, 0.9);
    leftWing.moveTo(-size * 0.2, 0);
    leftWing.lineTo(-size * 0.1, -size * 1.2);
    leftWing.lineTo(size * 0.3, -size * 0.8);
    leftWing.lineTo(size * 0.2, 0);
    leftWing.endFill();
    leftWing.name = 'leftWing';
    container.addChild(leftWing);

    // Right wing - extends DOWN from body (positive y)
    const rightWing = new Graphics();
    rightWing.beginFill(0x2a2a2a, 0.9);
    rightWing.moveTo(-size * 0.2, 0);
    rightWing.lineTo(-size * 0.1, size * 1.2);
    rightWing.lineTo(size * 0.3, size * 0.8);
    rightWing.lineTo(size * 0.2, 0);
    rightWing.endFill();
    rightWing.name = 'rightWing';
    container.addChild(rightWing);

    // Head (to the right of body)
    const head = new Graphics();
    head.beginFill(0x1a1a1a, 0.95);
    head.drawCircle(size * 0.7, 0, size * 0.22);
    head.endFill();
    container.addChild(head);

    // Beak (pointing right from head)
    const beak = new Graphics();
    beak.beginFill(0x4a4a4a, 0.95);
    beak.moveTo(size * 0.85, -size * 0.05);
    beak.lineTo(size * 1.15, 0);
    beak.lineTo(size * 0.85, size * 0.05);
    beak.lineTo(size * 0.85, -size * 0.05);
    beak.endFill();
    container.addChild(beak);

    return container;
  }

  start() {
    super.start();
    this.lastTime = Date.now();
    this.animate();
  }

  animate() {
    if (!this.isActive) return;

    const now = Date.now();
    const delta = (now - this.lastTime) / 16.67;
    this.lastTime = now;

    const worldWidth = this.gridWidth * this.TILE_SIZE;
    const worldHeight = this.gridHeight * this.TILE_SIZE;

    for (const flock of this.flocks) {
      // Update flock turn phase for gradual curving (slower phase = longer arcs)
      flock.turnPhase += 0.003 * delta;

      // Apply gentle turn to flock velocity direction
      const turnAmount = Math.sin(flock.turnPhase) * flock.turnRate * delta;
      const currentAngle = Math.atan2(flock.vy, flock.vx);
      const newAngle = currentAngle + turnAmount;
      const speed = Math.sqrt(flock.vx * flock.vx + flock.vy * flock.vy);
      flock.vx = Math.cos(newAngle) * speed;
      flock.vy = Math.sin(newAngle) * speed;

      // Get the leader bird (first in flock)
      const leader = flock.birds[0];

      // Move leader
      leader.x += flock.vx * delta;
      leader.y += flock.vy * delta;

      // Wrap leader around with large margin
      const margin = 200;
      let wrapped = false;
      if (leader.x < -margin) { leader.x = worldWidth + margin; wrapped = true; }
      if (leader.x > worldWidth + margin) { leader.x = -margin; wrapped = true; }
      if (leader.y < -margin) { leader.y = worldHeight + margin; wrapped = true; }
      if (leader.y > worldHeight + margin) { leader.y = -margin; wrapped = true; }

      // Move follower birds to maintain formation
      for (let i = 0; i < flock.birds.length; i++) {
        const bird = flock.birds[i];

        if (i > 0) {
          // Calculate target position based on formation offset rotated by flock direction
          const flockAngle = Math.atan2(flock.vy, flock.vx);
          const cos = Math.cos(flockAngle);
          const sin = Math.sin(flockAngle);

          // Rotate formation offset by flock direction
          const rotatedOffsetX = bird.formationOffsetX * cos - bird.formationOffsetY * sin;
          const rotatedOffsetY = bird.formationOffsetX * sin + bird.formationOffsetY * cos;

          const targetX = leader.x + rotatedOffsetX;
          const targetY = leader.y + rotatedOffsetY;

          // If leader wrapped, snap followers to new position
          if (wrapped) {
            bird.x = targetX;
            bird.y = targetY;
          } else {
            // Smoothly follow formation position with slight drift
            bird.x += (targetX - bird.x) * 0.05 * delta + bird.individualDrift.x * delta;
            bird.y += (targetY - bird.y) * 0.05 * delta + bird.individualDrift.y * delta;
          }
        }

        // Wing flapping - slightly different timing per bird
        bird.wingPhase += bird.wingSpeed * delta;
        const wingFlap = 0.6 + Math.abs(Math.sin(bird.wingPhase)) * 0.4;
        const leftWing = bird.getChildByName('leftWing');
        const rightWing = bird.getChildByName('rightWing');
        if (leftWing) leftWing.scale.y = wingFlap;
        if (rightWing) rightWing.scale.y = wingFlap;

        // Rotate bird to face flock movement direction (smooth)
        const targetRotation = Math.atan2(flock.vy, flock.vx);
        const rotationSpeed = 0.05;
        let rotationDiff = targetRotation - bird.rotation;
        // Normalize to -PI to PI
        while (rotationDiff > Math.PI) rotationDiff -= Math.PI * 2;
        while (rotationDiff < -Math.PI) rotationDiff += Math.PI * 2;
        bird.rotation += rotationDiff * rotationSpeed;
      }
    }

    this.animationFrame = requestAnimationFrame(() => this.animate());
  }
}

/**
 * Dark clouds effect - ominous slow-moving clouds
 */
class DarkCloudsEffect extends AmbientEffect {
  constructor(app, gridWidth, gridHeight, TILE_SIZE) {
    super(app, gridWidth, gridHeight, TILE_SIZE);
    this.clouds = [];
    this.cloudCount = 8;
    this.init();
  }

  init() {
    const worldWidth = this.gridWidth * this.TILE_SIZE;
    const worldHeight = this.gridHeight * this.TILE_SIZE;

    for (let i = 0; i < this.cloudCount; i++) {
      const cloud = this.createDarkCloud();
      cloud.x = Math.random() * worldWidth;
      cloud.y = Math.random() * worldHeight * 0.7;
      cloud.vx = 0.05 + Math.random() * 0.1;
      cloud.alpha = 0.4 + Math.random() * 0.3;

      this.clouds.push(cloud);
      this.container.addChild(cloud);
    }
  }

  createDarkCloud() {
    const container = new Container();
    const numPuffs = 5 + Math.floor(Math.random() * 4);
    const baseSize = 40 + Math.random() * 50;

    for (let i = 0; i < numPuffs; i++) {
      const puff = new Graphics();
      const grayValue = 0x2a2a2a + Math.floor(Math.random() * 0x202020);
      puff.beginFill(grayValue, 0.7);
      const puffSize = baseSize * (0.5 + Math.random() * 0.5);
      puff.drawCircle(
        (i - numPuffs / 2) * baseSize * 0.4,
        (Math.random() - 0.5) * baseSize * 0.4,
        puffSize
      );
      puff.endFill();
      container.addChild(puff);
    }

    return container;
  }

  start() {
    super.start();
    this.lastTime = Date.now();
    this.animate();
  }

  animate() {
    if (!this.isActive) return;

    const now = Date.now();
    const delta = (now - this.lastTime) / 16.67;
    this.lastTime = now;

    const worldWidth = this.gridWidth * this.TILE_SIZE;

    for (const cloud of this.clouds) {
      cloud.x += cloud.vx * delta;

      if (cloud.x > worldWidth + 150) {
        cloud.x = -150;
      }
    }

    this.animationFrame = requestAnimationFrame(() => this.animate());
  }
}

// Export effect factory
export const createAmbientEffect = (effectName, app, gridWidth, gridHeight, TILE_SIZE) => {
  switch (effectName) {
    case 'butterflies':
      return new ButterfliesEffect(app, gridWidth, gridHeight, TILE_SIZE);
    case 'birds':
      return new BirdsEffect(app, gridWidth, gridHeight, TILE_SIZE);
    case 'clouds':
      return new CloudsEffect(app, gridWidth, gridHeight, TILE_SIZE);
    case 'darkClouds':
      return new DarkCloudsEffect(app, gridWidth, gridHeight, TILE_SIZE);
    default:
      console.warn(`Unknown ambient effect: ${effectName}`);
      return null;
  }
};

export { ButterfliesEffect, BirdsEffect, CloudsEffect, DarkCloudsEffect };
