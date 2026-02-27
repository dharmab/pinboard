import { dbGet, dbGetAllFromIndex, dbPut, dbDelete } from './db.js';
import { createId } from '../utils/uuid.js';

export async function createGroup(tabId, label, x, y, width = 300, height = 200) {
  const group = {
    id: createId(),
    tab_id: tabId,
    label,
    x,
    y,
    width,
    height,
  };
  await dbPut('groups', group);
  return group;
}

export async function getGroup(id) {
  return dbGet('groups', id);
}

export async function getGroupsByTab(tabId) {
  return dbGetAllFromIndex('groups', 'tab_id', tabId);
}

export async function updateGroup(id, updates) {
  const group = await dbGet('groups', id);
  if (!group) return null;
  Object.assign(group, updates);
  await dbPut('groups', group);
  return group;
}

export async function deleteGroup(id) {
  await dbDelete('groups', id);
}
