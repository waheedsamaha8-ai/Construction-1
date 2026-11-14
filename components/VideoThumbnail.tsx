import React, { useState, useEffect, useRef, memo } from 'react';
import { FileItem } from '../types';
import { api } from '../services/api';
import { thumbnailSync } from '../services/thumbnailSync';

interface VideoThumbnailProps {
  item: FileItem;
  className?: string;
  showPlayBadge?: boolean;
}

export const VideoThumbnail: React.FC<VideoThumbnailProps> = ({
  item,
  className = 'w-full h-full',
  showPlayBadge = true
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  const [imgSrc, setImgSrc] = useState<string | null>(() => {
    const syncCached = thumbnailSync.getSyncCachedThumb(item);
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

  // Instant update when thumbnail arrives via Firestore live listener or BroadcastChannel
  useEffect(() => {
    const syncCached = thumbnailSync.getSyncCachedThumb(item);
    if (syncCached) {
      setImgSrc(syncCached);
      setIsImgError(false);
    }
    const onThumbUpdated = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.id === item.id && detail?.thumb) {
        setImgSrc(detail.thumb);
        setIsImgError(false);
      }
    };
    window.addEventListener('thumb_updated', onThumbUpdated);
    return () => window.removeEventListener('thumb_updated', onThumbUpdated);
  }, [item.id, item.previewUrl, item.thumbnailLink]);

  useEffect(() => {
    if (imgSrc && imgSrc.startsWith('data:image')) return;
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
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
      { rootMargin: '350px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [imgSrc]);

  useEffect(() => {
    if (!isVisible) return;
    const syncCached = thumbnailSync.getSyncCachedThumb(item);
    if (syncCached) {
      setImgSrc(syncCached);
      setIsImgError(false);
      return;
    }

    let isMounted = true;
    thumbnailSync
      .resolveThumbnail(item, {
        accessToken: api.getAccessToken ? api.getAccessToken() : '',
        downloadFileBlob: api.downloadFileBlob.bind(api),
        allowHeavyFallback: true
      })
      .then((resolved) => {
        if (!isMounted) return;
        if (resolved) {
          setImgSrc(resolved);
          setIsImgError(false);
          return;
        }
        const token = api.getAccessToken ? api.getAccessToken() : '';
        if (token && item.id && !item.id.startsWith('temp_')) {
          setVideoStreamUrl(`https://www.googleapis.com/drive/v3/files/${item.id}?alt=media&access_token=${token}`);
        } else if (item.webContentLink) {
          setVideoStreamUrl(item.webContentLink);
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
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
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => {
            setIsImgError(true);
            thumbnailSync
              .resolveThumbnail(item, {
                accessToken: api.getAccessToken ? api.getAccessToken() : '',
                downloadFileBlob: api.downloadFileBlob.bind(api),
                allowHeavyFallback: true
              })
              .then((resolved) => {
                if (resolved) {
                  setImgSrc(resolved);
                  setIsImgError(false);
                }
              })
              .catch(() => {});
          }}
        />
      ) : videoStreamUrl && !isVideoError ? (
        <video
          src={`${videoStreamUrl}#t=0.2`}
          crossOrigin="anonymous"
          className="w-full h-full object-cover pointer-events-none select-none"
          preload="metadata"
          muted
          playsInline
          onLoadedData={(e) => {
            try {
              const video = e.currentTarget;
              if (video.videoWidth > 0 && video.videoHeight > 0) {
                const canvas = document.createElement('canvas');
                const scale = Math.min(1, 280 / video.videoWidth);
                canvas.width = Math.max(120, Math.round(video.videoWidth * scale));
                canvas.height = Math.max(90, Math.round(video.videoHeight * scale));
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                  let dataUrl = canvas.toDataURL('image/webp', 0.72);
                  if (!dataUrl || !dataUrl.startsWith('data:image/webp')) {
                    dataUrl = canvas.toDataURL('image/jpeg', 0.72);
                  }
                  if (dataUrl && dataUrl.length > 600) {
                    thumbnailSync.saveThumb(item, dataUrl, true);
                    setImgSrc(dataUrl);
                    setIsImgError(false);
                  }
                }
              }
            } catch {}
          }}
          onError={() => setIsVideoError(true)}
        />
      ) : (
        <div className="flex flex-col items-center justify-center text-white p-1 text-center z-10">
          <div className="w-8 h-8 rounded-full bg-blue-600/90 border border-white/40 flex items-center justify-center mb-1 shadow-md">
            <i className="fa-solid fa-play text-white text-xs translate-x-[1px]"></i>
          </div>
          <span className="text-[8px] font-bold text-blue-200 bg-blue-950/70 px-1.5 py-0.5 rounded border border-blue-500/30">
            فيديو
          </span>
        </div>
      )}

      {showPlayBadge && ((imgSrc && !isImgError) || (videoStreamUrl && !isVideoError)) && (
        <div className="absolute inset-0 bg-black/20 flex items-center justify-center pointer-events-none">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-black/60 border border-white/40 flex items-center justify-center text-white text-xs shadow-lg">
            <i className="fa-solid fa-play text-white text-[10px] sm:text-xs translate-x-[1px]"></i>
          </div>
        </div>
      )}
    </div>
  );
};

export default memo(VideoThumbnail);
