import { dbGet, dbGetAllFromIndex, dbPut, dbDelete } from './db.js';
import { createId } from '../utils/uuid.js';

export async function createCard(boardId, title, description = null) {
  const card = {
    id: createId(),
    board_id: boardId,
    title,
    description,
    image_filename: null,
  };
  await dbPut('cards', card);
  return card;
}

export async function getCard(id) {
  return dbGet('cards', id);
}

export async function getCardsByBoard(boardId) {
  return dbGetAllFromIndex('cards', 'board_id', boardId);
}

export async function updateCard(id, updates) {
  const card = await dbGet('cards', id);
  if (!card) return null;
  Object.assign(card, updates);
  await dbPut('cards', card);
  return card;
}

export async function deleteCard(id) {
  await dbDelete('cards', id);
}
