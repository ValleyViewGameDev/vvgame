/** Master resources, loaded once from the local server and indexed. */
import { local } from './api.js';

let cache = null;

export async function loadResources(force = false) {
  if (cache && !force) return cache;
  const list = await local.resources();
  const byType = new Map(list.map((r) => [r.type, r]));
  const byLayoutKey = new Map(list.filter((r) => r.layoutkey).map((r) => [r.layoutkey, r]));
  cache = {
    list,
    byType,
    byLayoutKey,
    tiles: list.filter((r) => r.category === 'tile'),
    npcs: list.filter((r) => r.category === 'npc'),
    enemies: list.filter((r) => r.category === 'npc' && (r.action === 'attack' || r.action === 'spawn')),
    regions: list.filter((r) => r.category === 'region'),
    placeable: list.filter((r) => !['tile', 'region', 'skill', 'power', 'special', 'pet'].includes(r.category)),
    categories: [...new Set(list.map((r) => r.category))],
  };
  return cache;
}

export function getResources() { return cache; }
