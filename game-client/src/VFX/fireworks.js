// Fireworks VFX — a realistic, particle-based celebration burst.
//
// Unlike the emoji flower-shower, fireworks need HUNDREDS of small glowing
// sparks across several staggered explosions — too many for individual DOM
// nodes. So this renders to a single <canvas> overlay: platform/OS-agnostic
// (no emoji font dependence, identical on every device), and a few hundred
// particles integrate at 60fps well within a mobile budget.
//
// Look: each shell launches as a rising "comet", then bursts into a radial
// shower of sparks that fly out, decelerate (air drag), fall under gravity,
// twinkle, and fade — leaving a brief glowing trail. Several shells fire over
// ~3s in assorted colors, so it reads as a finale rather than one pop.
//
// Mirrors flowerShower's contract: play({ rootEl, overModal, overlayClass })
// mounts an overlay, runs the animation, unmounts + resolves when done. Pin
// the overlay to the play panel for the in-panel case, or fixed above modals
// for the over-modal case (same rect logic as the flower shower).

const DURATION_MS = 3000;     // window in which new shells launch
const TAIL_MS = 1400;         // grace after the last launch for sparks to finish
const GRAVITY = 320;          // px/s² downward pull on sparks
const DRAG = 1.1;             // per-second velocity damping (air resistance)

// Firework palettes. Each shell picks one palette; its sparks vary within it so
// a burst shimmers rather than being flat single-color.
const PALETTES = [
  // Muted, slightly-dark hues — deeper and less "candy"/primary than bright
  // pyro colors, so the bursts read as warm and antique rather than neon. Each
  // shell picks one palette; sparks vary within it.
  ['#c9912f', '#a8741c', '#e0bd6b'], // amber / antique gold
  ['#b23b46', '#8f2730', '#cf6e74'], // wine red
  ['#3f7fb0', '#2c5e87', '#6ea3c9'], // steel blue
  ['#7159a3', '#553f80', '#9a82c2'], // muted plum
  ['#4f8f63', '#386b48', '#7bb088'], // forest green
  ['#b8893f', '#946a28', '#d4ab6a'], // warm bronze
];

function rand(a, b) { return a + Math.random() * (b - a); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// A rising shell that bursts at its apex into `sparkCount` sparks.
function makeShell(stageW, stageH) {
  const x = rand(stageW * 0.18, stageW * 0.82);
  const yStart = stageH + 8;                       // just below the bottom edge
  // Burst height varies widely so comets don't all explode near the top — some
  // pop high (12% down), others much lower (70% down, well into the panel), for
  // a spread of explosion altitudes rather than a single band at the top.
  const yBurst = rand(stageH * 0.12, stageH * 0.7);
  const palette = pick(PALETTES);
  return {
    phase: 'rise',
    x,
    y: yStart,
    yBurst,
    vy: -rand(stageH * 1.05, stageH * 1.35) / 1, // px/s upward; tuned to reach apex ~0.6s
    palette,
    sparkCount: Math.round(rand(46, 78)),
    trail: [],                                     // recent positions for the comet tail
  };
}

// One spark thrown from a burst point.
function makeSpark(x, y, palette) {
  const angle = rand(0, Math.PI * 2);
  const speed = rand(60, 230);
  return {
    x, y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life: rand(0.9, 1.7),    // seconds until fully faded
    age: 0,
    size: rand(1.8, 4.0),    // bumped up so the burst reads bigger / pops more
    color: pick(palette),
  };
}

// opts: { rootEl, overModal?, overlayClass? }
export function play({ rootEl, overModal = false, overlayClass = '' } = {}) {
  return new Promise((resolve) => {
    const host = rootEl || document.querySelector('main') || document.body;

    // Stage box: the play panel's rect (so fireworks fill the panel, not the
    // whole viewport) — same approach as flowerShower's over-modal path.
    const stageEl = overModal ? (document.querySelector('main') || host) : host;
    const rect = stageEl.getBoundingClientRect();
    const stageW = Math.max(1, rect.width);
    const stageH = Math.max(1, rect.height);

    const overlay = document.createElement('div');
    overlay.className = `vfx-overlay vfx-fireworks${overlayClass ? ' ' + overlayClass : ''}`;
    if (overModal) {
      overlay.style.top = `${rect.top}px`;
      overlay.style.left = `${rect.left}px`;
      overlay.style.width = `${rect.width}px`;
      overlay.style.height = `${rect.height}px`;
    }

    // Ensure the (in-panel) host can position the absolute overlay.
    const computedPos = getComputedStyle(host).position;
    if (computedPos === 'static') {
      host.dataset.vfxOrigPosition = computedPos;
      host.style.position = 'relative';
    }

    // Canvas sized to the stage box, scaled for crisp rendering on retina.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const canvas = document.createElement('canvas');
    canvas.className = 'vfx-fireworks-canvas';
    canvas.width = Math.round(stageW * dpr);
    canvas.height = Math.round(stageH * dpr);
    canvas.style.width = `${stageW}px`;
    canvas.style.height = `${stageH}px`;
    overlay.appendChild(canvas);
    host.appendChild(overlay);

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const shells = [];
    const sparks = [];

    // Launch cadence: a first shell immediately, then more at randomized
    // intervals across DURATION_MS so explosions overlap into a finale.
    let nextLaunch = 0;
    const start = performance.now();
    let last = start;

    function launchShell() {
      shells.push(makeShell(stageW, stageH));
    }

    function burst(shell) {
      for (let i = 0; i < shell.sparkCount; i++) {
        sparks.push(makeSpark(shell.x, shell.y, shell.palette));
      }
    }

    function frame(now) {
      const elapsed = now - start;
      const dt = Math.min(0.05, (now - last) / 1000); // clamp big tab-restore gaps
      last = now;

      // Schedule launches within the active window.
      if (elapsed < DURATION_MS && elapsed >= nextLaunch) {
        launchShell();
        // Tighter gaps toward the end → a finale crescendo.
        const t = elapsed / DURATION_MS;
        nextLaunch = elapsed + rand(260, 620) * (1 - 0.5 * t);
      }

      // Clear with a slight fade so trails persist a frame or two (the dark
      // wash also keeps the panel from flashing solid black under the sparks).
      ctx.clearRect(0, 0, stageW, stageH);

      const damp = Math.max(0, 1 - DRAG * dt);

      // Rising shells (comets).
      for (let i = shells.length - 1; i >= 0; i--) {
        const s = shells[i];
        s.y += s.vy * dt;
        s.vy += GRAVITY * dt * 0.35; // gentle gravity on the way up
        s.trail.push({ x: s.x, y: s.y });
        if (s.trail.length > 6) s.trail.shift();

        // Comet head + tail. Bigger + a small glow so the "shot" pops; cheap
        // since only a handful of shells are ever airborne at once (unlike the
        // hundreds of sparks, which stay glow-light for performance).
        ctx.shadowBlur = 6;
        ctx.shadowColor = s.palette[0];
        ctx.fillStyle = s.palette[0];
        for (let t = 0; t < s.trail.length; t++) {
          const p = s.trail[t];
          const a = (t + 1) / s.trail.length;
          ctx.beginPath();
          ctx.globalAlpha = a * 0.9;
          ctx.arc(p.x, p.y, 2.6 * a + 1.0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.shadowBlur = 0;

        if (s.y <= s.yBurst || s.vy >= 0) {
          burst(s);
          shells.splice(i, 1);
        }
      }

      // Sparks.
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i];
        p.age += dt;
        if (p.age >= p.life) { sparks.splice(i, 1); continue; }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += GRAVITY * dt;
        p.vx *= damp;
        p.vy *= damp;

        const lifeLeft = 1 - p.age / p.life;
        // Twinkle: a little high-frequency flicker near end of life.
        const twinkle = 0.7 + 0.3 * Math.sin(p.age * 40 + p.x);
        ctx.globalAlpha = Math.max(0, lifeLeft) * twinkle;
        ctx.fillStyle = p.color;
        // Additive glow for a luminous look.
        ctx.shadowBlur = 8;
        ctx.shadowColor = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.5 + lifeLeft * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;

      const done = elapsed >= DURATION_MS + TAIL_MS && shells.length === 0 && sparks.length === 0;
      if (!done) {
        requestAnimationFrame(frame);
      } else {
        overlay.remove();
        if (host.dataset.vfxOrigPosition !== undefined) {
          host.style.position = '';
          delete host.dataset.vfxOrigPosition;
        }
        resolve();
      }
    }
    requestAnimationFrame(frame);
  });
}
