/**
 * Which season comes next, and how long it lasts (docs/season-reset.md "The calendar").
 *
 * `globalTuning.seasons.schedule` overrides a season by its NUMBER:
 *   { "39": { "seasonType": "Fall", "days": 60 }, "40": { "seasonType": "Winter", "days": 30 } }
 * A season with no entry follows the rotation in seasons.json and lasts `phases.onSeason` minutes.
 * The schedulers ask here (mainScheduler for the off-season modal and the new season's length,
 * seasonScheduler for the type the reset prepares), so the two never disagree.
 */
const globalTuning = require('../tuning/globalTuning.json');
const seasons = require('../tuning/seasons.json');

const scheduleFor = (seasonNumber) => globalTuning.seasons?.schedule?.[String(seasonNumber)] || null;

/** The season after `currentType` #`currentNumber`: { seasonType, seasonNumber }. */
function nextSeason(currentType, currentNumber) {
  const seasonNumber = (Number(currentNumber) || 0) + 1;
  const override = scheduleFor(seasonNumber);
  if (override?.seasonType) return { seasonType: override.seasonType, seasonNumber };
  const i = seasons.findIndex((s) => s.seasonType === currentType);
  return { seasonType: i !== -1 ? seasons[(i + 1) % seasons.length].seasonType : 'Spring', seasonNumber };
}

/** How long season #`seasonNumber` lasts, in ms (its schedule entry's days, else phases.onSeason). */
function seasonLengthMs(seasonNumber) {
  const days = Number(scheduleFor(seasonNumber)?.days);
  if (days > 0) return days * 24 * 60 * 60 * 1000;
  return (globalTuning.seasons?.phases?.onSeason || 0) * 60 * 1000;
}

module.exports = { nextSeason, seasonLengthMs };
