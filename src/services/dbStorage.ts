export interface OfflineQueueItem {
  id: string;
  lotId: string;
  collectorId: string;
  scannedAt: number;
  idempotencyKey: string;
  status: 'PENDING_SYNC' | 'SYNCED';
}

const DB_NAME = 'ProofAfterPickupDB';
const DB_VERSION = 1;
const STORE_NAME = 'collectorQueue';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('IndexedDB not supported in this browser environment.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

export async function saveOfflineLot(lotId: string, collectorId: string, idempotencyKey: string): Promise<OfflineQueueItem> {
  const item: OfflineQueueItem = {
    id: `queue-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    lotId,
    collectorId,
    scannedAt: Date.now(),
    idempotencyKey,
    status: 'PENDING_SYNC'
  };

  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(item);

      req.onsuccess = () => resolve(item);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('IndexedDB fallback to LocalStorage:', err);
    const saved = JSON.parse(localStorage.getItem(STORE_NAME) || '[]');
    saved.push(item);
    localStorage.setItem(STORE_NAME, JSON.stringify(saved));
    return item;
  }
}

export async function getOfflineQueue(): Promise<OfflineQueueItem[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return JSON.parse(localStorage.getItem(STORE_NAME) || '[]');
  }
}

export async function removeOfflineItem(id: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    const saved: OfflineQueueItem[] = JSON.parse(localStorage.getItem(STORE_NAME) || '[]');
    const filtered = saved.filter(i => i.id !== id);
    localStorage.setItem(STORE_NAME, JSON.stringify(filtered));
  }
}

export async function clearOfflineQueue(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    localStorage.removeItem(STORE_NAME);
  }
}
