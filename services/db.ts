
import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface ConstructionDB extends DBSchema {
  files: {
    key: string;
    value: any;
    indexes: { 'by_parent': string };
  };
  projects: {
    key: string;
    value: any;
  };
  file_blobs: {
    key: string;
    value: Blob; 
  };
  sync_queue: {
    key: string;
    value: any;
  };
}

const DB_NAME = 'ConstructionProDB';
const DB_VERSION = 14; // Bumped to 14 to add by_parent index on files for instant folder queries

class DatabaseService {
  private dbPromise: Promise<IDBPDatabase<ConstructionDB>>;

  constructor() {
    this.dbPromise = openDB<ConstructionDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, newVersion, transaction) {
        let filesStore;
        if (!db.objectStoreNames.contains('files')) {
          filesStore = db.createObjectStore('files', { keyPath: 'id' });
        } else {
          filesStore = transaction.objectStore('files');
        }
        if (!filesStore.indexNames.contains('by_parent')) {
          filesStore.createIndex('by_parent', 'parentId', { unique: false });
        }
        if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('sync_queue')) db.createObjectStore('sync_queue', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('file_blobs')) db.createObjectStore('file_blobs');
      },
    });
  }

  async putBlob(id: string, blob: Blob) {
    const db = await this.dbPromise;
    try {
        await db.put('file_blobs', blob, id);
    } catch (e) {
        console.error("Storage Error:", e);
    }
  }

  async getBlob(id: string): Promise<Blob | undefined> {
    const db = await this.dbPromise;
    const item = await db.get('file_blobs', id);
    if (!item) return undefined;
    // @ts-ignore
    if (item.iv && item.data) { // Cleanup legacy
        try { await db.delete('file_blobs', id); } catch(e){}
        return undefined;
    }
    if (item instanceof Blob) return item;
    return undefined;
  }

  async hasBlob(id: string): Promise<boolean> {
    const db = await this.dbPromise;
    const key = await db.getKey('file_blobs', id);
    return !!key;
  }

  async putItem(store: 'files' | 'projects', item: any) {
    const db = await this.dbPromise;
    await db.put(store, item);
  }

  async putItems(store: 'files' | 'projects', items: any[]) {
    if (!items || items.length === 0) return;
    const db = await this.dbPromise;
    const tx = db.transaction(store, 'readwrite');
    await Promise.all([
      ...items.map(item => tx.store.put(item)),
      tx.done
    ]);
  }

  async getByParentId<T>(parentId: string): Promise<T[]> {
    if (!parentId) return [];
    const db = await this.dbPromise;
    try {
      return await db.getAllFromIndex('files', 'by_parent', parentId) as T[];
    } catch {
      const all = await db.getAll('files') as any[];
      return all.filter(f => f && f.parentId === parentId) as T[];
    }
  }

  async getAll<T>(store: 'files' | 'projects' | 'sync_queue'): Promise<T[]> {
    const db = await this.dbPromise;
    return await db.getAll(store) as T[];
  }

  async getAllItems<T>(store: 'files' | 'projects'): Promise<T[]> {
    const db = await this.dbPromise;
    return await db.getAll(store) as T[];
  }
  
  async getItem<T>(store: 'files' | 'projects', id: string): Promise<T | undefined> {
    const db = await this.dbPromise;
    return await db.get(store, id) as T;
  }

  async deleteItem(store: 'files' | 'projects' | 'file_blobs', id: string) {
    const db = await this.dbPromise;
    await db.delete(store, id);
  }

  async deleteItems(store: 'files' | 'projects' | 'file_blobs', ids: string[]) {
    if (!ids || ids.length === 0) return;
    const db = await this.dbPromise;
    const tx = db.transaction(store, 'readwrite');
    await Promise.all([
      ...ids.map(id => tx.store.delete(id)),
      tx.done
    ]);
  }
  
  async clearStore(store: 'files' | 'projects' | 'file_blobs') {
      const db = await this.dbPromise;
      await db.clear(store);
  }
  
  async count(store: 'sync_queue'): Promise<number> {
      const db = await this.dbPromise;
      return await db.count(store);
  }
  
  async addToQueue(item: any) {
      const db = await this.dbPromise;
      await db.put('sync_queue', item);
  }

  async getQueue(): Promise<any[]> {
      const db = await this.dbPromise;
      return await db.getAll('sync_queue');
  }

  async deleteFromQueue(id: string) {
      const db = await this.dbPromise;
      await db.delete('sync_queue', id);
  }
  
  async clearQueue() {
      const db = await this.dbPromise;
      await db.clear('sync_queue');
  }
}

export const dbService = new DatabaseService();
