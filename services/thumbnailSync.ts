import { doc, getDoc, setDoc, collection, query, where, documentId, onSnapshot } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { dbService } from './db';
import { imageUtils } from './imageUtils';
import { FileItem, ItemType } from '../types';

const memoryThumbCache = new Map<string, string>();
const inFlightThumbTasks = new Map<string, Promise<string | null>>();

const THUMB_CHANNEL_NAME = 'construction_app_thumbs_channel';
const thumbChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(THUMB_CHANNEL_NAME) : null;

const isSyntheticId = (id?: string | null): boolean => {
  if (!id) return true;
  return (
    id.startsWith('proj_') ||
    id.startsWith('folder_') ||
    id.startsWith('file_') ||
    id.startsWith('doc_') ||
    id.startsWith('temp_') ||
    id.startsWith('pay_') ||
    id.startsWith('log_') ||
    id.startsWith('starter_demo') ||
    id.startsWith('guest_') ||
    id === 'Connecting...'
  );
};

const emitThumbLocal = (id: string, thumb: string) => {
  if (!id || !thumb || !thumb.startsWith('data:image')) return;
  memoryThumbCache.set(id, thumb);
  // Thumbnails stay in RAM + IndexedDB to avoid exhausting 5MB localStorage quota
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('thumb_updated', { detail: { id, thumb } }));
  }
};

if (thumbChannel) {
  thumbChannel.onmessage = (e) => {
    const data = e?.data;
    if (data && data.type === 'THUMB_UPDATED' && data.id && data.thumb) {
      emitThumbLocal(data.id, data.thumb);
    }
  };
}

export const thumbnailSync = {
  getSyncCachedThumb(item: Partial<FileItem> | string): string | null {
    const id = typeof item === 'string' ? item : item?.id;
    const previewUrl = typeof item === 'string' ? undefined : item?.previewUrl;
    if (!id) return null;

    if (memoryThumbCache.has(id)) return memoryThumbCache.get(id)!;

    if (previewUrl && previewUrl.startsWith('data:image')) {
      memoryThumbCache.set(id, previewUrl);
      // Cached in memoryThumbCache; persistent copy stored in IndexedDB
      return previewUrl;
    }

    try {
      const saved = localStorage.getItem(`vthumb_${id}`);
      if (saved && saved.startsWith('data:image')) {
        memoryThumbCache.set(id, saved);
        return saved;
      }
    } catch {}

    return null;
  },

  async saveThumb(itemOrId: Partial<FileItem> | string, dataUrl: string, syncToCloud: boolean = true): Promise<void> {
    if (!dataUrl || !dataUrl.startsWith('data:image') || dataUrl.length < 300) return;
    const id = typeof itemOrId === 'string' ? itemOrId : itemOrId?.id;
    if (!id) return;

    emitThumbLocal(id, dataUrl);

    if (thumbChannel) {
      try {
        thumbChannel.postMessage({ type: 'THUMB_UPDATED', id, thumb: dataUrl });
      } catch {}
    }

    // Persist asynchronously in IndexedDB
    dbService.putBlob(`vthumb_${id}`, new Blob([dataUrl], { type: 'text/plain' })).catch(() => {});

    dbService.getItem<FileItem>('files', id)
      .then((existing) => {
        if (existing) {
          if (existing.previewUrl !== dataUrl) {
            return dbService.putItem('files', { ...existing, previewUrl: dataUrl });
          }
        } else if (typeof itemOrId !== 'string' && itemOrId?.id) {
          return dbService.putItem('files', { ...(itemOrId as FileItem), previewUrl: dataUrl });
        }
      })
      .catch(() => {});

    // Instant cross-device sync via Firestore file_thumbnails collection
    if (syncToCloud && navigator.onLine && !isSyntheticId(id) && dataUrl.length < 180000) {
      setDoc(
        doc(db, 'file_thumbnails', id),
        {
          thumb: dataUrl,
          updatedAt: Date.now(),
          name: typeof itemOrId !== 'string' ? itemOrId?.name || '' : '',
          mimeType: typeof itemOrId !== 'string' ? itemOrId?.mimeType || '' : ''
        },
        { merge: true }
      ).catch(() => {});
    }
  },

  async rekeyThumb(oldId: string, newId: string, newItem?: Partial<FileItem>): Promise<void> {
    if (!oldId || !newId || oldId === newId) return;
    const existing = this.getSyncCachedThumb(oldId);
    let dataUrl = existing || '';
    if (!dataUrl) {
      try {
        const blob = await dbService.getBlob(`vthumb_${oldId}`);
        if (blob) dataUrl = await blob.text();
      } catch {}
    }
    if (dataUrl && dataUrl.startsWith('data:image')) {
      await this.saveThumb(newItem || newId, dataUrl, true);
    }
    dbService.deleteItem('file_blobs', `vthumb_${oldId}`).catch(() => {});
    try { localStorage.removeItem(`vthumb_${oldId}`); } catch {}
  },

  async resolveThumbnail(
    item: FileItem,
    options: {
      accessToken?: string | null;
      downloadFileBlob?: (id: string, onProgress?: (p: number) => void, silent?: boolean) => Promise<Blob>;
      allowHeavyFallback?: boolean;
    } = {}
  ): Promise<string | null> {
    if (!item?.id) return null;

    const syncHit = this.getSyncCachedThumb(item);
    if (syncHit) return syncHit;

    const existingTask = inFlightThumbTasks.get(item.id);
    if (existingTask) return existingTask;

    const task = (async (): Promise<string | null> => {
      try {
        const id = item.id;
        const mime = (item.mimeType || '').toLowerCase();
        const name = (item.name || '').toLowerCase();
        const isVideo = mime.startsWith('video/') || /\.(mp4|mov|webm|avi|mkv|3gp)$/i.test(name);
        const isImage = mime.startsWith('image/');
        const isPdf = mime.includes('pdf') || name.endsWith('.pdf');

        // 1. Check IndexedDB persistent thumbnail store
        const idbThumbBlob = await dbService.getBlob(`vthumb_${id}`).catch(() => null);
        if (idbThumbBlob) {
          const textDataUrl = await idbThumbBlob.text().catch(() => '');
          if (textDataUrl && textDataUrl.startsWith('data:image')) {
            emitThumbLocal(id, textDataUrl);
            return textDataUrl;
          }
        }

        // 2. Check IndexedDB 'files' metadata
        const savedFileItem = await dbService.getItem<FileItem>('files', id).catch(() => null);
        if (savedFileItem?.previewUrl && savedFileItem.previewUrl.startsWith('data:image')) {
          emitThumbLocal(id, savedFileItem.previewUrl);
          return savedFileItem.previewUrl;
        }

        // 3. Check if full local file blob exists in IndexedDB -> 0 network thumbnail generation
        const localBlob = await dbService.getBlob(id).catch(() => null);
        if (localBlob) {
          let generated = '';
          if (isVideo) {
            const vFile = new File([localBlob], item.name || 'video.mp4', { type: item.mimeType || localBlob.type || 'video/mp4' });
            generated = await imageUtils.generateVideoThumbnail(vFile).catch(() => '');
          } else if (isImage) {
            generated = await imageUtils.generateImageThumbnail(localBlob).catch(() => '');
          } else if (isPdf) {
            generated = await imageUtils.generatePdfThumbnail(localBlob).catch(() => '');
          }
          if (generated && generated.startsWith('data:image')) {
            await this.saveThumb(item, generated, true);
            return generated;
          }
        }

        // 4. Instant Firestore synced thumbnail from another device
        if (navigator.onLine && !isSyntheticId(id)) {
          try {
            const thumbSnap = await getDoc(doc(db, 'file_thumbnails', id));
            if (thumbSnap.exists()) {
              const cloudThumb = thumbSnap.data()?.thumb;
              if (typeof cloudThumb === 'string' && cloudThumb.startsWith('data:image')) {
                await this.saveThumb(item, cloudThumb, false);
                return cloudThumb;
              }
            }
          } catch {}
        }

        // 5. Try Google Drive thumbnailLink (fetch + convert to WebP & sync)
        const token = options.accessToken || '';
        let driveThumbUrl =
          item.thumbnailLink ||
          (item.previewUrl && !item.previewUrl.startsWith('data:') ? item.previewUrl : '');

        if (!driveThumbUrl && token && !isSyntheticId(id)) {
          try {
            const metaRes = await fetch(
              `https://www.googleapis.com/drive/v3/files/${id}?fields=thumbnailLink`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            if (metaRes.ok) {
              const metaJson = await metaRes.json();
              if (metaJson?.thumbnailLink) {
                driveThumbUrl = metaJson.thumbnailLink;
              }
            }
          } catch {}
        }

        if (driveThumbUrl) {
          const hiResThumbUrl = driveThumbUrl.replace(/=s\d+/, '=s400');
          try {
            let thumbRes = await fetch(hiResThumbUrl).catch(() => null);
            if ((!thumbRes || !thumbRes.ok) && token) {
              thumbRes = await fetch(hiResThumbUrl, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
            }
            if (thumbRes && thumbRes.ok) {
              const thumbBlob = await thumbRes.blob();
              if (thumbBlob.size > 0) {
                const compressed = await imageUtils.generateImageThumbnail(thumbBlob, 280, 0.72);
                if (compressed && compressed.startsWith('data:image')) {
                  await this.saveThumb(item, compressed, true);
                  return compressed;
                }
              }
            }
          } catch {}
        }

        // 6. Fallback: silently download media/pdf if allowed and extract local thumbnail
        if (options.allowHeavyFallback && navigator.onLine && options.downloadFileBlob && !isSyntheticId(id)) {
          try {
            const blob = await options.downloadFileBlob(id, undefined, true);
            if (blob) {
              let generated = '';
              if (isVideo) {
                const vFile = new File([blob], item.name || 'video.mp4', { type: item.mimeType || blob.type || 'video/mp4' });
                generated = await imageUtils.generateVideoThumbnail(vFile).catch(() => '');
              } else if (isImage) {
                generated = await imageUtils.generateImageThumbnail(blob).catch(() => '');
              } else if (isPdf) {
                generated = await imageUtils.generatePdfThumbnail(blob).catch(() => '');
              }
              if (generated && generated.startsWith('data:image')) {
                await this.saveThumb(item, generated, true);
                return generated;
              }
            }
          } catch {}
        }

        return null;
      } finally {
        inFlightThumbTasks.delete(item.id);
      }
    })();

    inFlightThumbTasks.set(item.id, task);
    return task;
  },

  subscribeFolderThumbnails(items: FileItem[], onThumb: (id: string, thumb: string) => void): () => void {
    const fileIds = (items || [])
      .filter((i) => i && i.type !== ItemType.FOLDER && i.id && !isSyntheticId(i.id))
      .map((i) => i.id);

    const handleLocalThumb = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.id && detail?.thumb && fileIds.includes(detail.id)) {
        onThumb(detail.id, detail.thumb);
      }
    };
    window.addEventListener('thumb_updated', handleLocalThumb);

    const unsubs: (() => void)[] = [];
    if (navigator.onLine && fileIds.length > 0) {
      // Batch Firestore documentId() 'in' listeners in chunks of 30
      for (let i = 0; i < fileIds.length; i += 30) {
        const chunk = fileIds.slice(i, i + 30);
        try {
          const q = query(collection(db, 'file_thumbnails'), where(documentId(), 'in', chunk));
          const unsub = onSnapshot(
            q,
            (snap) => {
              snap.docChanges().forEach((change) => {
                const data = change.doc.data();
                if (typeof data?.thumb === 'string' && data.thumb.startsWith('data:image')) {
                  const id = change.doc.id;
                  const current = this.getSyncCachedThumb(id);
                  if (current !== data.thumb) {
                    emitThumbLocal(id, data.thumb);
                    dbService.putBlob(`vthumb_${id}`, new Blob([data.thumb], { type: 'text/plain' })).catch(() => {});
                  }
                  onThumb(id, data.thumb);
                }
              });
            },
            () => {}
          );
          unsubs.push(unsub);
        } catch {}
      }
    }

    return () => {
      window.removeEventListener('thumb_updated', handleLocalThumb);
      unsubs.forEach((u) => {
        try { u(); } catch {}
      });
    };
  }
};
