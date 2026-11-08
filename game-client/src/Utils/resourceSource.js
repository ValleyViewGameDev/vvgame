import { getLocalizedString } from './stringLookup';

/**
 * "Where does this come from?" for a resource, from resources.json alone.
 *
 * Returns { line, ingredients, regionLine } where `line` is a localized sentence such as "Grown on
 * {res:Wheat Plot} Wheat Plot" (a rich-text token, UI/Icons/RichText.js richText renders the art),
 * `ingredients` (crafted goods only) is "{res:Wheat} 6 Wheat, ..." or null, and `regionLine`
 * is "Only grows in Belmont" when the source is region-locked (resources.json growregion) or null.
 * Strings 17001 to 17013 hold the sentence patterns ({source} is replaced). Used by
 * UI/Modals/ResourceModalSmall.js; reuse it anywhere a hint about a resource's origin helps.
 */
export function describeResourceSource(resourceType, masterResources, strings) {
  const list = Array.isArray(masterResources) ? masterResources : [];
  const byType = (t) => list.find((r) => r.type === t);
  const resource = byType(resourceType);
  if (!resource) return { line: strings?.[17010] || '', ingredients: null, regionLine: null };

  const label = (t) => `{res:${t}} ${getLocalizedString(t, strings)}`;
  const fill = (key, t) => String(strings?.[key] || '').replace('{source}', label(t));

  const src = resource.source;
  const srcRes = src ? byType(src) : null;
  let line;
  let ingredients = null;

  if (srcRes) {
    switch (srcRes.category) {
      case 'farmplot': line = fill(17001, src); break;
      case 'npc': line = fill(17002, src); break;
      case 'crafting': case 'farmhouse': case 'station': case 'training': case 'trainingAndShop':
        line = fill(17003, src);
        break;
      case 'source': line = fill(17005, src); break;
      case 'shop': line = fill(17007, src); break;
      default: line = fill(17009, src);
    }
  } else if (src === 'valley') {
    line = strings?.[17004];
  } else if (src === 'pets') {
    line = strings?.[17011];
  } else if (src === 'tree') {
    line = strings?.[17012];
  } else if (src === 'Build' || src === 'BuildTown' || src === 'Buy' || src === 'Deco' || src === 'Zoo') {
    line = strings?.[17013];
  } else {
    const attacker = list.find((r) => r.action === 'attack' && r.output === resource.type);
    if (attacker) line = fill(17006, attacker.type);
    else if (resource.scrollchance === 'epic' || resource.scrollchance === 'legendary') line = strings?.[200800];
    else line = strings?.[17010];
  }

  const parts = [1, 2, 3, 4]
    .filter((n) => resource[`ingredient${n}`])
    .map((n) => `{res:${resource[`ingredient${n}`]}} ${resource[`ingredient${n}qty`] || 1} ${getLocalizedString(resource[`ingredient${n}`], strings)}`);
  if (parts.length) ingredients = parts.join(', ');

  const growregion = srcRes?.growregion || resource.growregion;
  const regionLine = growregion
    ? String(strings?.[17022] || 'Only grows in {region}').replace('{region}', getLocalizedString(growregion, strings))
    : null;

  return { line: line || '', ingredients, regionLine };
}
