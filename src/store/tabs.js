import { getDB, dbGet, dbGetAllFromIndex, dbPut, dbDelete } from './db.js';
import { createId } from '../utils/uuid.js';

export async function createTab(boardId, name, order) {
  const tab = {
    id: createId(),
    board_id: boardId,
    name,
    order,
    viewport_x: 0,
    viewport_y: 0,
    viewport_zoom: 1.0,
  };
  await dbPut('tabs', tab);
  return tab;
}

export async function getTab(id) {
  return dbGet('tabs', id);
}

export async function getTabsByBoard(boardId) {
  const tabs = await dbGetAllFromIndex('tabs', 'board_id', boardId);
  return tabs.sort((a, b) => a.order - b.order);
}

export async function updateTab(id, updates) {
  const tab = await dbGet('tabs', id);
  if (!tab) return null;
  Object.assign(tab, updates);
  await dbPut('tabs', tab);
  return tab;
}

export async function deleteTab(id) {
  await dbDelete('tabs', id);
}

export async function reorderTabs(boardId, orderedIds) {
  const db = await getDB();
  const tx = db.transaction('tabs', 'readwrite');
  const store = tx.objectStore('tabs');

  for (let i = 0; i < orderedIds.length; i++) {
    const tab = await new Promise((resolve, reject) => {
      const r = store.get(orderedIds[i]);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    if (tab && tab.board_id === boardId) {
      tab.order = i;
      store.put(tab);
    }
  }

  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
