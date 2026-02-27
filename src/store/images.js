import { getDB, dbGet, dbPut, dbDelete } from './db.js';

async function computeHash(blob) {
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function saveImage(blob, originalFilename) {
  const hash = await computeHash(blob);
  const existing = await dbGet('images', hash);
  if (!existing) {
    await dbPut('images', {
      hash,
      data: blob,
      content_type: blob.type,
      original_filename: originalFilename,
    });
  }
  return hash;
}

export async function getImage(hash) {
  return dbGet('images', hash);
}

export async function deleteImage(hash) {
  await dbDelete('images', hash);
}

export async function getAllImageHashes() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('images', 'readonly');
    const store = tx.objectStore('images');
    const req = store.getAllKeys();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
