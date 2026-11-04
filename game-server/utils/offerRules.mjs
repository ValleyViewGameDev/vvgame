/**
 * Which outlets may use a resource: THE one rule (docs/tuning.md, "Where a good can be offered").
 * Plain ES module with no imports, shared by:
 *   - the game server (utils/offerEligibility.js loads it): the Bank's random offers, the Caravan's
 *     orders, the Trade Stall routes, and GET /api/resources, which attaches each row's
 *     `offerBlocks` so the client's Kent offers use the same answer;
 *   - the VVGame Editor (server-side derive on every ECONOMY save) and tools/derive-economy.js,
 *     which write the read-only `offeredAt` column.
 *
 * These are the STATIC gates, the ones that never change for a row. Each outlet adds its own
 * dynamic ones on top (season, the player's level, skills, the "Explore the Valley" trophy).
 *
 * The flags on a resource row (ECONOMY sheet checkboxes, 2026-11-04; they replace output: noBank):
 *   noKent        Kent never asks for it
 *   noBank        the Bank never picks it as a random offer (its standing Silver / Diamond Ring /
 *                 Gold offers and the valley Counting Houses' fixed list are hand-picked)
 *   noCaravan     the Caravan never orders it
 *   noTradeStall  never listed or requested at a Trade Stall (Quest for Hope artifacts never are)
 * The Harvest Fair takes only what tuning/seasons.json lists for the season.
 */

export const OUTLETS = ['kent', 'bank', 'caravan', 'fair', 'tradeStall'];
const LABELS = { kent: 'Kent', bank: 'Bank', caravan: 'Caravan', fair: 'Fair', tradeStall: 'Stall' };
const SCROLL_ONLY = new Set(['epic', 'legendary']);

/**
 * Why `outlet` may never use resource `r`, or null when it may.
 * ctx: { hopeArtifacts: Set of artifact types, fairSeasons: Map type -> [season names] }
 */
export function blockReason(r, outlet, ctx = {}) {
  if (!r) return 'unknown resource';
  switch (outlet) {
    case 'kent':
      if (r.category !== 'doober') return 'not a good';
      if (r.type === 'Money') return 'Money';
      if (r.noKent) return 'noKent';
      if (SCROLL_ONLY.has(r.scrollchance)) return `${r.scrollchance} scroll find`;
      if (r.source === 'valley') return 'valley find';
      return null;
    case 'bank':
      if (r.category !== 'doober') return 'not a good';
      if (r.type === 'Money') return 'Money';
      if (r.noBank) return 'noBank';
      return null;
    case 'caravan':
      if (r.category !== 'doober') return 'not a good';
      if (r.noCaravan) return 'noCaravan';
      if (!r.source) return 'no source';
      if (r.source === 'valley') return 'valley find';
      if (SCROLL_ONLY.has(r.scrollchance)) return `${r.scrollchance} scroll find`;
      return null;
    case 'fair':
      return ctx.fairSeasons?.get(r.type)?.length ? null : 'not on a season list';
    case 'tradeStall':
      if (ctx.hopeArtifacts?.has(r.type)) return 'Quest for Hope artifact';
      if (r.noTradeStall) return 'noTradeStall';
      return null;
    default:
      return 'unknown outlet';
  }
}

/** { kent, bank, caravan, fair, tradeStall } -> reason or null, for one row. */
export function offerBlocks(r, ctx = {}) {
  const out = {};
  for (const o of OUTLETS) out[o] = blockReason(r, o, ctx);
  return out;
}

/** The context the rules need, from the tuning files: seasons.json rows and the Hope artifacts. */
export function offerContext({ seasons = [], hopeArtifacts = new Set() } = {}) {
  const fairSeasons = new Map();
  for (const s of seasons || []) {
    for (const t of s.seasonResources || []) {
      if (!fairSeasons.has(t)) fairSeasons.set(t, []);
      fairSeasons.get(t).push(s.seasonType);
    }
  }
  return { fairSeasons, hopeArtifacts };
}

/**
 * The ECONOMY sheet's read-only "offeredAt" text for a good, e.g.
 *   "Kent ✓ · Bank ✓ · Caravan ✗ valley find · Fair ✓ Summer · Stall ✓"
 * Undefined for rows that are not goods (doobers): no outlet ever uses them.
 */
export function offeredAtText(r, ctx = {}) {
  if (!r || r.category !== 'doober') return undefined;
  return OUTLETS.map((o) => {
    const why = blockReason(r, o, ctx);
    if (why) return `${LABELS[o]} ✗ ${why}`;
    if (o === 'fair') return `${LABELS[o]} ✓ ${ctx.fairSeasons.get(r.type).join('/')}`;
    return `${LABELS[o]} ✓`;
  }).join(' · ');
}
