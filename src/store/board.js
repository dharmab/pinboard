import { dbGet, dbGetAll, dbPut } from './db.js';
import { createId } from '../utils/uuid.js';

export async function createBoard(name) {
  const board = { id: createId(), name };
  await dbPut('boards', board);
  return board;
}

export async function getBoard(id) {
  return dbGet('boards', id);
}

export async function getAllBoards() {
  return dbGetAll('boards');
}

export async function updateBoardName(id, name) {
  const board = await dbGet('boards', id);
  if (!board) return null;
  board.name = name;
  await dbPut('boards', board);
  return board;
}
