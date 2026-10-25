/**
 * Where each quest giver lives, for the "where to find them" line in the Quest panel's giver
 * modal (QuestPanel → ResourceModalSmall). Read off the layout templates (2026-10-25): the
 * Shepherd stands on every homestead (homestead.json), the Town cast in every town (townN/E/S/W),
 * the rest on fixed valley grids (Viola moves to Sebastian's island after the reunion, still the
 * Valley). A giver added to quests.json needs a line here, or the modal shows no location.
 */
const HOMES = {
  'The Shepherd': 'homestead',
  'Constable Elbow': 'town',
  Portia: 'town',
  'Mistress Quickly': 'town',
  Hotspur: 'town',
  Feste: 'town',
  Cassio: 'town',
  Helena: 'valley',
  Titania: 'valley',
  Vampire: 'valley',
  Prospero: 'valley',
  Viola: 'valley',
};

const HOME_STRING = { homestead: 17015, town: 17016, valley: 17017 };
const HOME_FALLBACK = { homestead: 'Lives on your Homestead', town: 'Lives in Town', valley: 'Lives out in the Valley' };

/** The localized "Lives in Town" line for a giver, or '' when we don't know where they live. */
export function questGiverHomeLine(giver, strings) {
  const home = HOMES[giver];
  if (!home) return '';
  return strings?.[HOME_STRING[home]] || HOME_FALLBACK[home];
}
