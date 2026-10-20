/**
 * Shared bits for the art tools (docs/art-pipeline-plan.md §5): paths, the env file, sharp.
 * The tools reuse game-server's dotenv and game-client's sharp, like tools/avatar/*.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const ART = path.resolve(__dirname, '..');
const MOODBOARD = path.join(ROOT, 'docs', 'art', 'moodboard');
const CANDIDATES = path.join(ART, '_candidates'); // gitignored
const GUIDES = path.join(ART, 'guides');

const sharp = require(path.join(ROOT, 'game-client', 'node_modules', 'sharp'));

/** The API keys live in game-server/.env only (never in the client, never on Render for this). */
function loadEnv() {
  const dotenv = require(path.join(ROOT, 'game-server', 'node_modules', 'dotenv'));
  dotenv.config({ path: path.join(ROOT, 'game-server', '.env'), quiet: true });
  const clean = (v) => (v || '').trim().replace(/^["']|["']$/g, '');
  return { OPENAI_API_KEY: clean(process.env.OPENAI_API_KEY), GEMINI_API_KEY: clean(process.env.GEMINI_API_KEY) };
}

const readJSON = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const ensureDir = (p) => fs.mkdirSync(p, { recursive: true });
const mimeOf = (p) => ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }[path.extname(p).toLowerCase()] || 'application/octet-stream');

/** Resolve a reference image path given in a style or job file: absolute, moodboard/..., guides/..., or relative to tools/art. */
function resolveRef(p) {
  if (path.isAbsolute(p)) return p;
  if (p.startsWith('moodboard/')) return path.join(MOODBOARD, p.slice('moodboard/'.length));
  if (p.startsWith('guides/')) return path.join(GUIDES, p.slice('guides/'.length));
  return path.join(ART, p);
}

/** Rasterise an SVG file to a square PNG buffer (aspect kept, centred, transparent). */
async function svgToPng(src, px) {
  const text = fs.readFileSync(src, 'utf8');
  const vb = text.match(/viewBox\s*=\s*["']\s*([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)/i);
  const longest = vb ? Math.max(parseFloat(vb[3]), parseFloat(vb[4]), 1) : 100;
  const density = Math.min(2400, Math.max(72, Math.ceil((72 * px) / longest)));
  return sharp(Buffer.from(text), { density }).resize(px, px, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
}

module.exports = { ROOT, ART, MOODBOARD, CANDIDATES, GUIDES, sharp, loadEnv, readJSON, ensureDir, mimeOf, resolveRef, svgToPng };
