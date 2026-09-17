import { openDB } from 'idb';

const DB_NAME = 'allagaroo-draft';
const STORE   = 'draft';
const TTL_MS  = 7 * 24 * 60 * 60 * 1000;

async function db() {
  return openDB(DB_NAME, 1, {
    upgrade(db) { db.createObjectStore(STORE); }
  });
}

export async function saveDraft({ name, flavorText, imageBlob }) {
  const store = await db();
  await store.put(STORE, { name, flavorText, imageBlob, savedAt: Date.now() }, 'current');
}

export async function loadDraft() {
  const store = await db();
  const draft = await store.get(STORE, 'current');
  if (!draft) return null;
  if (Date.now() - draft.savedAt > TTL_MS) {
    await store.delete(STORE, 'current');
    return null;
  }
  return draft;
}

export async function clearDraft() {
  const store = await db();
  await store.delete(STORE, 'current');
}
