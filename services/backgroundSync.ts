import { api } from './api';
import { dbService } from './db';
import { FileItem, ItemType } from '../types';

class BackgroundSyncEngine {
    private queue: string[] = [];
    private activeCount = 0;
    private maxConcurrent = 3;
    private processedSet = new Set<string>();

    constructor() {
        window.addEventListener('online', () => this.processQueue());
    }

    private isVideoFile(f: FileItem): boolean {
        const mime = (f.mimeType || '').toLowerCase();
        const name = (f.name || '').toLowerCase();
        return mime.startsWith('video/') || /\.(mp4|webm|mov|avi|mkv|3gp)$/i.test(name);
    }

    private getPriorityWeight(f: FileItem): number {
        const mime = (f.mimeType || '').toLowerCase();
        const name = (f.name || '').toLowerCase();
        if (mime.startsWith('image/') || /\.(jpg|jpeg|png|webp)$/i.test(name)) return 0;
        if (mime.includes('pdf') || name.endsWith('.pdf')) return 1;
        if (mime.includes('html') || mime.startsWith('text/') || name.endsWith('.html')) return 2;
        if (/\.(dwg|dxf)$/i.test(name)) return 3;
        return 4;
    }

    /**
     * Called when a folder is opened.
     * Pre-caches images, PDFs, letters, and drawings concurrently in the background
     * so opening any file is instantaneous (0ms).
     */
    public async prioritizeFolder(files: FileItem[]) {
        if (!navigator.onLine || !files || files.length === 0) return;

        const downloadCandidates = files
            .filter(f => {
                if (!f || f.type !== ItemType.FILE || this.processedSet.has(f.id)) return false;
                if (this.isVideoFile(f)) return false;
                // Allow up to 12MB for PDFs/CAD/High-res photos
                if (f.size && f.size > 12 * 1024 * 1024) return false;
                // Skip if already hot in memory cache
                if (api.getCachedBlobSync(f.id)) {
                    this.processedSet.add(f.id);
                    return false;
                }
                return true;
            })
            .sort((a, b) => this.getPriorityWeight(a) - this.getPriorityWeight(b));

        if (downloadCandidates.length === 0) return;

        // Check IndexedDB presence in parallel batches instead of sequentially
        const checks = await Promise.all(
            downloadCandidates.map(async (file) => ({
                id: file.id,
                exists: await dbService.hasBlob(file.id).catch(() => false)
            }))
        );

        let added = false;
        for (const res of checks) {
            if (res.exists) {
                this.processedSet.add(res.id);
            } else if (!this.queue.includes(res.id)) {
                this.queue.push(res.id);
                added = true;
            }
        }
        if (added) this.processQueue();
    }

    private processQueue() {
        if (!navigator.onLine) return;
        while (this.activeCount < this.maxConcurrent && this.queue.length > 0) {
            const fileId = this.queue.shift();
            if (!fileId) continue;
            this.activeCount++;
            this.downloadFile(fileId).finally(() => {
                this.activeCount--;
                if (this.queue.length > 0 && navigator.onLine) {
                    this.processQueue();
                }
            });
        }
    }

    private async downloadFile(fileId: string) {
        try {
            if (api.getCachedBlobSync(fileId)) {
                this.processedSet.add(fileId);
                return;
            }
            const exists = await dbService.hasBlob(fileId);
            if (exists) {
                this.processedSet.add(fileId);
                return;
            }

            await api.downloadFileBlob(fileId, undefined, true);
            this.processedSet.add(fileId);
        } catch (e: any) {
            if (e?.message && e.message.includes('404')) {
                try {
                    await dbService.deleteItem('files', fileId);
                    this.processedSet.add(fileId);
                } catch (dbError) {}
            }
        }
    }
}

export const autoSync = new BackgroundSyncEngine();
