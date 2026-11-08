
import { api } from './api';
import { dbService } from './db';
import { FileItem, ItemType } from '../types';

class BackgroundSyncEngine {
    private queue: string[] = [];
    private isProcessing = false;
    private maxConcurrent = 3;
    private processedSet = new Set<string>();

    constructor() {
        // Listen to online status to resume
        window.addEventListener('online', () => this.processQueue());
    }

    /**
     * Called when a folder is opened. 
     * Adds all files in the folder to the high-priority download queue.
     */
    public async prioritizeFolder(files: FileItem[]) {
        if (!navigator.onLine) return;

        const downloadCandidates = files.filter(f => 
            f.type === ItemType.FILE && 
            !this.processedSet.has(f.id)
        );

        // Check which ones are missing from DB
        for (const file of downloadCandidates) {
            const exists = await dbService.hasBlob(file.id);
            if (!exists) {
                this.addToQueue(file.id);
            } else {
                this.processedSet.add(file.id);
            }
        }
    }

    private addToQueue(fileId: string) {
        if (!this.queue.includes(fileId)) {
            this.queue.push(fileId);
            this.processQueue();
        }
    }

    private async processQueue() {
        if (this.isProcessing || this.queue.length === 0 || !navigator.onLine) return;

        this.isProcessing = true;
        const activeDownloads = [];

        // Take batch of files
        while (this.queue.length > 0 && activeDownloads.length < this.maxConcurrent) {
            const fileId = this.queue.shift();
            if (fileId) {
                activeDownloads.push(this.downloadFile(fileId));
            }
        }

        await Promise.allSettled(activeDownloads);
        this.isProcessing = false;
        
        // Loop if items remain
        if (this.queue.length > 0) {
            this.processQueue();
        }
    }

    private async downloadFile(fileId: string) {
        try {
            // Check existence one last time before network call
            const exists = await dbService.hasBlob(fileId);
            if (exists) return;

            // This call automatically caches to IDB in api.ts
            // We pass a dummy progress function to ensure it treats it as a download
            await api.downloadFileBlob(fileId, () => {}); 
            
            this.processedSet.add(fileId);
            // console.log(`[AutoSync] Synced: ${fileId}`);
        } catch (e: any) {
            console.warn(`[AutoSync] Failed: ${fileId}`, e);
            
            // Handle 404 (Not Found) by removing the stale file record locally
            if (e.message && e.message.includes('404')) {
                console.log(`[AutoSync] Removing stale file record: ${fileId}`);
                try {
                    await dbService.deleteItem('files', fileId);
                    this.processedSet.add(fileId); // Mark as processed to avoid immediate retry
                } catch (dbError) {
                    console.error("Failed to remove stale file", dbError);
                }
            }
        }
    }
}

export const autoSync = new BackgroundSyncEngine();
