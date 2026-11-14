import React, { useEffect, useRef, useState, memo } from 'react';
import { FileItem } from '../types';
import { api } from '../services/api';
import { thumbnailSync } from '../services/thumbnailSync';

interface MediaThumbnailProps {
  item: FileItem;
  className?: string;
  fallbackIcon?: string;
  fallbackColor?: string;
  fallbackBg?: string;
  allowHeavyFallback?: boolean;
  hoverZoom?: boolean;
}

const MediaThumbnail: React.FC<MediaThumbnailProps> = ({
  item,
  className = 'w-full h-full',
  fallbackIcon = 'fa-file',
  fallbackColor = 'text-slate-400',
  fallbackBg = 'bg-slate-50',
  allowHeavyFallback = true,
  hoverZoom = false
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  const getInitialUrl = (): string | null => {
    const cached = thumbnailSync.getSyncCachedThumb(item);
    if (cached) return cached;
    const url = item.previewUrl || item.thumbnailLink;
    if (url && typeof url === 'string') {
      if (url.startsWith('data:image') || url.startsWith('blob:')) return url;
      if (url.includes('googleusercontent.com') || url.includes('drive.google.com')) {
        return url.replace(/=s\d+/, '=s400');
      }
      return url;
    }
    const mime = (item.mimeType || '').toLowerCase();
    if (mime.startsWith('image/') && item.id && !item.id.startsWith('temp_') && !item.id.startsWith('file_')) {
      return `https://drive.google.com/thumbnail?id=${item.id}&sz=w300`;
    }
    return null;
  };

  const [imgSrc, setImgSrc] = useState<string | null>(getInitialUrl);
  const [imgFailed, setImgFailed] = useState(false);

  // React immediately when a thumbnail updates via Firestore snapshot or BroadcastChannel
  useEffect(() => {
    const syncHit = thumbnailSync.getSyncCachedThumb(item);
    if (syncHit) {
      setImgSrc(syncHit);
      setImgFailed(false);
    }
    const handleThumbUpdated = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.id === item.id && detail?.thumb) {
        setImgSrc(detail.thumb);
        setImgFailed(false);
      }
    };
    window.addEventListener('thumb_updated', handleThumbUpdated);
    return () => window.removeEventListener('thumb_updated', handleThumbUpdated);
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
    const cached = thumbnailSync.getSyncCachedThumb(item);
    if (cached) {
      setImgSrc(cached);
      setImgFailed(false);
      return;
    }

    let active = true;
    thumbnailSync
      .resolveThumbnail(item, {
        accessToken: api.getAccessToken ? api.getAccessToken() : '',
        downloadFileBlob: api.downloadFileBlob.bind(api),
        allowHeavyFallback
      })
      .then((resolved) => {
        if (active && resolved) {
          setImgSrc(resolved);
          setImgFailed(false);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [item.id, item.mimeType, item.thumbnailLink, item.previewUrl, isVisible, allowHeavyFallback]);

  const mime = (item.mimeType || '').toLowerCase();
  const isPdf = mime.includes('pdf') || (item.name || '').toLowerCase().endsWith('.pdf');

  return (
    <div ref={containerRef} className={`relative overflow-hidden ${className} ${fallbackBg} flex items-center justify-center`}>
      {imgSrc && !imgFailed ? (
        <>
          <img
            src={imgSrc}
            alt={item.name}
            loading="eager"
            decoding="async"
            referrerPolicy="no-referrer"
            className={`w-full h-full object-cover ${hoverZoom ? 'transition-transform duration-300 group-hover:scale-105' : ''}`}
            onError={() => {
              // If external Drive URL failed, resolve via authenticated fetch/blob cache
              setImgFailed(true);
              thumbnailSync
                .resolveThumbnail(item, {
                  accessToken: api.getAccessToken ? api.getAccessToken() : '',
                  downloadFileBlob: api.downloadFileBlob.bind(api),
                  allowHeavyFallback: true
                })
                .then((resolved) => {
                  if (resolved) {
                    setImgSrc(resolved);
                    setImgFailed(false);
                  }
                })
                .catch(() => {});
            }}
          />
          {isPdf && (
            <span className="absolute bottom-0.5 left-0.5 bg-red-600/90 text-white text-[7px] font-black px-1 py-0.2 rounded shadow-sm pointer-events-none">
              PDF
            </span>
          )}
        </>
      ) : (
        <i className={`fa-solid ${fallbackIcon} ${fallbackColor}`}></i>
      )}
    </div>
  );
};

export default memo(MediaThumbnail);
