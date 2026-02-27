let dbPromise;

export function getDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open('pinboard_v1', 1);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        db.createObjectStore('boards', { keyPath: 'id' });

        const cards = db.createObjectStore('cards', { keyPath: 'id' });
        cards.createIndex('board_id', 'board_id');

        const tabs = db.createObjectStore('tabs', { keyPath: 'id' });
        tabs.createIndex('board_id', 'board_id');

        const placements = db.createObjectStore('placements', { keyPath: 'id' });
        placements.createIndex('tab_id', 'tab_id');
        placements.createIndex('card_id', 'card_id');

        const groups = db.createObjectStore('groups', { keyPath: 'id' });
        groups.createIndex('tab_id', 'tab_id');

        const connections = db.createObjectStore('connections', { keyPath: 'id' });
        connections.createIndex('tab_id', 'tab_id');
        connections.createIndex('from_id', 'from_id');
        connections.createIndex('to_id', 'to_id');

        db.createObjectStore('images', { keyPath: 'hash' });
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

// Helper: wrap a single IDBRequest in a Promise
function req(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Helper: wrap a transaction's completion in a Promise
function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function dbGet(storeName, key) {
  const db = await getDB();
  const tx = db.transaction(storeName, 'readonly');
  return req(tx.objectStore(storeName).get(key));
}

export async function dbGetAll(storeName) {
  const db = await getDB();
  const tx = db.transaction(storeName, 'readonly');
  return req(tx.objectStore(storeName).getAll());
}

export async function dbGetAllFromIndex(storeName, indexName, key) {
  const db = await getDB();
  const tx = db.transaction(storeName, 'readonly');
  return req(tx.objectStore(storeName).index(indexName).getAll(key));
}

export async function dbPut(storeName, value) {
  const db = await getDB();
  const tx = db.transaction(storeName, 'readwrite');
  tx.objectStore(storeName).put(value);
  try {
    await txDone(tx);
  } catch (err) {
    if (err?.name === 'QuotaExceededError') {
      window.dispatchEvent(new CustomEvent('pinboard:storage-full'));
    }
    throw err;
  }
}

export async function dbDelete(storeName, key) {
  const db = await getDB();
  const tx = db.transaction(storeName, 'readwrite');
  tx.objectStore(storeName).delete(key);
  await txDone(tx);
}
