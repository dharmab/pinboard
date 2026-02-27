import { dbGet, dbGetAllFromIndex, dbPut, dbDelete } from './db.js';
import { createId } from '../utils/uuid.js';

export async function createConnection(tabId, fromType, fromId, toType, toId, label = null, color = 'red') {
  const connection = {
    id: createId(),
    tab_id: tabId,
    from_type: fromType,
    from_id: fromId,
    to_type: toType,
    to_id: toId,
    label,
    color,
  };
  await dbPut('connections', connection);
  return connection;
}

export async function getConnection(id) {
  return dbGet('connections', id);
}

export async function getConnectionsByTab(tabId) {
  return dbGetAllFromIndex('connections', 'tab_id', tabId);
}

export async function updateConnection(id, updates) {
  const connection = await dbGet('connections', id);
  if (!connection) return null;
  Object.assign(connection, updates);
  await dbPut('connections', connection);
  return connection;
}

export async function deleteConnection(id) {
  await dbDelete('connections', id);
}

export async function deleteConnectionsByTab(tabId) {
  const connections = await dbGetAllFromIndex('connections', 'tab_id', tabId);
  for (const c of connections) {
    await dbDelete('connections', c.id);
  }
}
