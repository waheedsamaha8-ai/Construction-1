import React, { useState, useEffect, useRef } from 'react';
import { FileItem } from '../types';
import { api } from '../services/api';
import { dbService } from '../services/db';
import { imageUtils } from '../services/imageUtils';

interface VideoThumbnailProps {
  item: FileItem;
  className?: string;
  showPlayBadge?: boolean;
}

// Memory cache + persistent localStorage + IndexedDB cache for instant 0ms video thumbnails
const memoryThumbCache = new Map<string, string>();
const inFlightThumbTasks = new Map<string, Promise<string | null>>();

const getSyncCachedThumb = (item: FileItem): string | null => {
  const id = item.id;
  if (!id) return null;
  if (memoryThumbCache.has(id)) return memoryThumbCache.get(id)!;
  if (item.previewUrl && item.previewUrl.startsWith('data:image')) {
    memoryThumbCache.set(id, item.previewUrl);
    try { localStorage.setItem(`vthumb_${id}`, item.previewUrl); } catch (e) {}
    return item.previewUrl;
  }
  try {
    const saved = localStorage.getItem(`vthumb_${id}`);
    if (saved && saved.startsWith('data:image')) {
      memoryThumbCache.set(id, saved);
      return saved;
    }
  } catch (e) {}
  return null;
};

const savePersistentThumb = async (item: FileItem, dataUrl: string) => {
  if (!dataUrl || !dataUrl.startsWith('data:image') || dataUrl.length < 500) return;
  const id = item.id;
  memoryThumbCache.set(id, dataUrl);
  try {
    if (dataUrl.length < 180000) {
      localStorage.setItem(`vthumb_${id}`, dataUrl);
    }
  } catch (e) {}
  try {
    await dbService.putBlob(`vthumb_${id}`, new Blob([dataUrl], { type: 'text/plain' }));
  } catch (e) {}
  try {
    const existing = await dbService.getItem<FileItem>('files', id);
    if (existing) {
      await dbService.putItem('files', { ...existing, previewUrl: dataUrl });
    } else {
      await dbService.putItem('files', { ...item, previewUrl: dataUrl });
    }
  } catch (e) {}
};

const blobToCompressedDataUrl = (blob: Blob): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    const objUrl = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(objUrl);
      try {
        const canvas = document.createElement('canvas');
        const maxDim = 360;
        let w = img.width || 320;
        let h = img.height || 240;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        canvas.width = Math.max(w, 120);
        canvas.height = Math.max(h, 90);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
          resolve(dataUrl);
          return;
        }
      } catch (e) {}
      resolve('');
    };
    img.onerror = () => {
      URL.revokeObjectURL(objUrl);
      resolve('');
    };
    img.src = objUrl;
  });
};

export const VideoThumbnail: React.FC<VideoThumbnailProps> = ({ item, className = "w-full h-full", showPlayBadge = true }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  const [imgSrc, setImgSrc] = useState<string | null>(() => {
    const syncCached = getSyncCachedThumb(item);
    if (syncCached) return syncCached;

    const url = item.thumbnailLink || item.previewUrl;
    if (url && typeof url === 'string') {
      if (url.startsWith('data:image') || url.startsWith('blob:')) return url;
      if (url.includes('googleusercontent.com') || url.includes('drive.google.com')) {
        return url.replace(/=s\d+/, '=s400');
      }
    }
    return null;
  });

  const [videoStreamUrl, setVideoStreamUrl] = useState<string | null>(null);
  const [isImgError, setIsImgError] = useState(false);
  const [isVideoError, setIsVideoError] = useState(false);

  // Lazy visibility observer with generous rootMargin so thumbnails are ready before scrolling into view
  useEffect(() => {
    if (imgSrc && imgSrc.startsWith('data:image')) return;
    const el = containerRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setIsVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '300px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [imgSrc]);

  useEffect(() => {
    let isMounted = true;
    let createdBlobUrl: string | null = null;

    // 1. Check synchronous memory / localStorage cache first (0ms)
    const syncCached = getSyncCachedThumb(item);
    if (syncCached) {
      setImgSrc(syncCached);
      setIsImgError(false);
      return;
    }

    const resolvePersistentThumbnail = async () => {
      try {
        // 2. Check IndexedDB persistent thumbnail blob ('vthumb_' + id) — survives localStorage limits!
        const idbThumbBlob = await dbService.getBlob(`vthumb_${item.id}`).catch(() => null);
        if (idbThumbBlob) {
          const textDataUrl = await idbThumbBlob.text().catch(() => '');
          if (textDataUrl && textDataUrl.startsWith('data:image')) {
            memoryThumbCache.set(item.id, textDataUrl);
            try { localStorage.setItem(`vthumb_${item.id}`, textDataUrl); } catch (e) {}
            if (isMounted) {
              setImgSrc(textDataUrl);
              setIsImgError(false);
            }
            return;
          }
        }

        // Check IndexedDB 'files' store in case previewUrl was already saved as data:image
        const savedFileItem = await dbService.getItem<FileItem>('files', item.id).catch(() => null);
        if (savedFileItem?.previewUrl && savedFileItem.previewUrl.startsWith('data:image')) {
          memoryThumbCache.set(item.id, savedFileItem.previewUrl);
          try { localStorage.setItem(`vthumb_${item.id}`, savedFileItem.previewUrl); } catch (e) {}
          if (isMounted) {
            setImgSrc(savedFileItem.previewUrl);
            setIsImgError(false);
          }
          return;
        }

        if (!isVisible) return;

        // Deduplicate in-flight thumbnail generation for the same video ID
        let task = inFlightThumbTasks.get(item.id);
        if (!task) {
          task = (async (): Promise<string | null> => {
            // 3. Check if full video blob is already in local IndexedDB (0ms local extraction)
            const localVideoBlob = await dbService.getBlob(item.id).catch(() => null);
            if (localVideoBlob) {
              const videoFile = new File([localVideoBlob], item.name || 'video.mp4', {
                type: item.mimeType || localVideoBlob.type || 'video/mp4'
              });
              const generated = await imageUtils.generateVideoThumbnail(videoFile).catch(() => '');
              if (generated && generated.startsWith('data:image')) {
                await savePersistentThumb(item, generated);
                return generated;
              }
            }

            // 4. Try fetching Google Drive thumbnailLink and converting it to a permanent data:image Base64
            const token = api.getAccessToken ? api.getAccessToken() : '';
            let driveThumbUrl = item.thumbnailLink || (item.previewUrl && !item.previewUrl.startsWith('data:') ? item.previewUrl : '');

            if (!driveThumbUrl && token && item.id && !item.id.startsWith('temp_') && !item.id.startsWith('doc_') && !item.id.startsWith('file_')) {
              try {
                const metaRes = await fetch(
                  `https://www.googleapis.com/drive/v3/files/${item.id}?fields=thumbnailLink`,
                  { headers: { Authorization: `Bearer ${token}` } }
                );
                if (metaRes.ok) {
                  const metaJson = await metaRes.json();
                  if (metaJson?.thumbnailLink) {
                    driveThumbUrl = metaJson.thumbnailLink;
                  }
                }
              } catch (e) {}
            }

            if (driveThumbUrl) {
              try {
                const hiResThumbUrl = driveThumbUrl.replace(/=s\d+/, '=s400');
                const thumbRes = await fetch(hiResThumbUrl);
                if (thumbRes.ok) {
                  const thumbBlob = await thumbRes.blob();
                  const dataUrl = await blobToCompressedDataUrl(thumbBlob);
                  if (dataUrl && dataUrl.startsWith('data:image')) {
                    await savePersistentThumb(item, dataUrl);
                    return dataUrl;
                  }
                }
              } catch (e) {}
            }

            // 5. Fallback for videos where Drive hasn't generated a thumbnailLink yet:
            // Download the video blob silently (which also caches it in IndexedDB for instant playback!) and extract frame
            if (token && item.id && !item.id.startsWith('temp_')) {
              try {
                const downloadedBlob = await api.downloadFileBlob(item.id, undefined, true);
                if (downloadedBlob) {
                  const videoFile = new File([downloadedBlob], item.name || 'video.mp4', {
                    type: item.mimeType || downloadedBlob.type || 'video/mp4'
                  });
                  const generated = await imageUtils.generateVideoThumbnail(videoFile).catch(() => '');
                  if (generated && generated.startsWith('data:image')) {
                    await savePersistentThumb(item, generated);
                    return generated;
                  }
                }
              } catch (e) {}
            }

            return null;
          })();
          inFlightThumbTasks.set(item.id, task);
        }

        const resolvedDataUrl = await task;
        inFlightThumbTasks.delete(item.id);

        if (resolvedDataUrl && isMounted) {
          setImgSrc(resolvedDataUrl);
          setIsImgError(false);
          return;
        }

        // 6. Final visual stream fallback if everything else is still pending
        if (isMounted) {
          const token = api.getAccessToken ? api.getAccessToken() : '';
          if (token && item.id && !item.id.startsWith('temp_')) {
            setVideoStreamUrl(`https://www.googleapis.com/drive/v3/files/${item.id}?alt=media&access_token=${token}`);
          } else if (item.webContentLink) {
            setVideoStreamUrl(item.webContentLink);
          }
        }
      } catch (e) {
        inFlightThumbTasks.delete(item.id);
      }
    };

    resolvePersistentThumbnail();

    return () => {
      isMounted = false;
      if (createdBlobUrl) {
        URL.revokeObjectURL(createdBlobUrl);
      }
    };
  }, [item.id, item.name, item.mimeType, item.thumbnailLink, item.previewUrl, item.webContentLink, isVisible]);

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden ${className} bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center shrink-0 group`}
    >
      {imgSrc && !isImgError ? (
        <img
          src={imgSrc}
          alt={item.name}
          loading="eager"
          decoding="async"
          crossOrigin="anonymous"
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          referrerPolicy="no-referrer"
          onLoad={(e) => {
            // If an external thumbnail URL loaded directly, persist it as a permanent Base64 data:image
            if (imgSrc && !imgSrc.startsWith('data:image')) {
              try {
                const imgEl = e.currentTarget;
                if (imgEl.naturalWidth > 0 && imgEl.naturalHeight > 0) {
                  const canvas = document.createElement('canvas');
                  const scale = Math.min(1, 360 / imgEl.naturalWidth);
                  canvas.width = Math.max(120, Math.round(imgEl.naturalWidth * scale));
                  canvas.height = Math.max(90, Math.round(imgEl.naturalHeight * scale));
                  const ctx = canvas.getContext('2d');
                  if (ctx) {
                    ctx.drawImage(imgEl, 0, 0, canvas.width, canvas.height);
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
                    if (dataUrl && dataUrl.startsWith('data:image')) {
                      savePersistentThumb(item, dataUrl);
                    }
                  }
                }
              } catch (err) {}
            }
          }}
          onError={() => setIsImgError(true)}
        />
      ) : videoStreamUrl && !isVideoError ? (
        <video
          src={`${videoStreamUrl}#t=0.2`}
          crossOrigin="anonymous"
          className="w-full h-full object-cover pointer-events-none select-none transition-transform duration-300 group-hover:scale-105"
          preload="metadata"
          muted
          playsInline
          onLoadedData={(e) => {
            try {
              const video = e.currentTarget;
              if (video.videoWidth > 0 && video.videoHeight > 0) {
                const canvas = document.createElement('canvas');
                const scale = Math.min(1, 360 / video.videoWidth);
                canvas.width = Math.round(video.videoWidth * scale);
                canvas.height = Math.round(video.videoHeight * scale);
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                  const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
                  if (dataUrl && dataUrl.length > 1000) {
                    savePersistentThumb(item, dataUrl);
                    setImgSrc(dataUrl);
                    setIsImgError(false);
                  }
                }
              }
            } catch (err) {}
          }}
          onError={() => setIsVideoError(true)}
        />
      ) : (
        <div className="flex flex-col items-center justify-center text-white p-1 text-center z-10">
          <div className="w-8 h-8 rounded-full bg-blue-600/90 backdrop-blur-sm border border-white/40 flex items-center justify-center mb-1 shadow-md group-hover:scale-110 transition-transform">
            <i className="fa-solid fa-play text-white text-xs translate-x-[1px]"></i>
          </div>
          <span className="text-[8px] font-bold text-blue-200 bg-blue-950/70 px-1.5 py-0.5 rounded border border-blue-500/30">
            فيديو
          </span>
        </div>
      )}

      {showPlayBadge && ((imgSrc && !isImgError) || (videoStreamUrl && !isVideoError)) && (
        <div className="absolute inset-0 bg-black/20 flex items-center justify-center pointer-events-none">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-black/60 backdrop-blur-sm border border-white/40 flex items-center justify-center text-white text-xs shadow-lg transform transition-transform group-hover:scale-110">
            <i className="fa-solid fa-play text-white text-[10px] sm:text-xs translate-x-[1px]"></i>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoThumbnail;
