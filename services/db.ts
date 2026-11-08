
import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface ConstructionDB extends DBSchema {
  files: {
    key: string;
    value: any;
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
const DB_VERSION = 13; // Bumped to 13 to fix VersionError (was < 11)

class DatabaseService {
  private dbPromise: Promise<IDBPDatabase<ConstructionDB>>;

  constructor() {
    this.dbPromise = openDB<ConstructionDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, newVersion, transaction) {
        if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' });
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
  
  async clearQueue() {
      const db = await this.dbPromise;
      await db.clear('sync_queue');
  }
}

export const dbService = new DatabaseService();
