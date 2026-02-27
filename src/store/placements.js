import { dbGet, dbGetAllFromIndex, dbPut, dbDelete } from './db.js';
import { createId } from '../utils/uuid.js';

export async function createPlacement(tabId, cardId, x, y) {
  const placement = {
    id: createId(),
    tab_id: tabId,
    card_id: cardId,
    x,
    y,
    group_id: null,
  };
  await dbPut('placements', placement);
  return placement;
}

export async function getPlacement(id) {
  return dbGet('placements', id);
}

export async function getPlacementsByTab(tabId) {
  return dbGetAllFromIndex('placements', 'tab_id', tabId);
}

export async function getPlacementsByCard(cardId) {
  return dbGetAllFromIndex('placements', 'card_id', cardId);
}

export async function updatePlacement(id, updates) {
  const placement = await dbGet('placements', id);
  if (!placement) return null;
  Object.assign(placement, updates);
  await dbPut('placements', placement);
  return placement;
}

export async function deletePlacement(id) {
  await dbDelete('placements', id);
}

export async function deletePlacementsByTab(tabId) {
  const placements = await dbGetAllFromIndex('placements', 'tab_id', tabId);
  for (const p of placements) {
    await dbDelete('placements', p.id);
  }
}
