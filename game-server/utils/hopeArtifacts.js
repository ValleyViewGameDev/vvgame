/**
 * The Quest for Hope artifacts: whatever the Oracle's Hope trade asks for (traders.json,
 * requires1..7), so this list follows the data. They can never be sold or requested at the Trading
 * Post (owner, 2026-10-19): each one is a journey, not a commodity.
 * traders.json is read fresh (the editor's sheet saves it without a server restart).
 */
const fs = require('fs');
const path = require('path');

const TRADERS = path.join(__dirname, '..', 'tuning', 'traders.json');

function hopeArtifacts() {
  try {
    const oracle = JSON.parse(fs.readFileSync(TRADERS, 'utf8')).find((t) => t.gives === 'Hope');
    return new Set([1, 2, 3, 4, 5, 6, 7].map((i) => oracle?.[`requires${i}`]).filter(Boolean));
  } catch (e) {
    console.error('hopeArtifacts: could not read traders.json', e.message);
    return new Set();
  }
}

const isHopeArtifact = (type) => !!type && hopeArtifacts().has(type);

module.exports = { hopeArtifacts, isHopeArtifact };
