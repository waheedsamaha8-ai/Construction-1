import { api } from './api';
import { dbService } from './db';
import { FileItem, ItemType } from '../types';

class BackgroundSyncEngine {
    private queue: string[] = [];
    private isProcessing = false;
    private maxConcurrent = 1;
    private processedSet = new Set<string>();

    constructor() {
        window.addEventListener('online', () => this.processQueue());
    }

    /**
     * Called when a folder is opened.
     * Only pre-caches small non-video files in the background so we never choke bandwidth
     * or slow down immediate image/video viewing.
     */
    public async prioritizeFolder(files: FileItem[]) {
        if (!navigator.onLine) return;

        const downloadCandidates = files.filter(f => {
            if (f.type !== ItemType.FILE || this.processedSet.has(f.id)) return false;
            const mime = (f.mimeType || '').toLowerCase();
            const name = (f.name || '').toLowerCase();
            const isVideo = mime.startsWith('video/') || name.endsWith('.mp4') || name.endsWith('.webm') || name.endsWith('.mov') || name.endsWith('.avi');
            if (isVideo) return false;
            // Skip files larger than 2MB in background pre-fetch
            if (f.size && f.size > 2 * 1024 * 1024) return false;
            return true;
        });

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

        while (this.queue.length > 0 && activeDownloads.length < this.maxConcurrent) {
            const fileId = this.queue.shift();
            if (fileId) {
                activeDownloads.push(this.downloadFile(fileId));
            }
        }

        await Promise.allSettled(activeDownloads);
        this.isProcessing = false;

        if (this.queue.length > 0) {
            setTimeout(() => this.processQueue(), 150);
        }
    }

    private async downloadFile(fileId: string) {
        try {
            const exists = await dbService.hasBlob(fileId);
            if (exists) return;

            await api.downloadFileBlob(fileId, undefined, true);
            this.processedSet.add(fileId);
        } catch (e: any) {
            if (e.message && e.message.includes('404')) {
                try {
                    await dbService.deleteItem('files', fileId);
                    this.processedSet.add(fileId);
                } catch (dbError) {}
            }
        }
    }
}

export const autoSync = new BackgroundSyncEngine();
