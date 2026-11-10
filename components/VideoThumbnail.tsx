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

// Memory cache + persistent localStorage cache for instant 0ms video thumbnails
const memoryThumbCache = new Map<string, string>();

const getCachedThumb = (id: string): string | null => {
  if (memoryThumbCache.has(id)) return memoryThumbCache.get(id)!;
  try {
    const saved = localStorage.getItem(`vthumb_${id}`);
    if (saved && saved.startsWith('data:image')) {
      memoryThumbCache.set(id, saved);
      return saved;
    }
  } catch (e) {}
  return null;
};

const saveCachedThumb = (id: string, dataUrl: string) => {
  if (!dataUrl) return;
  memoryThumbCache.set(id, dataUrl);
  try {
    if (dataUrl.length < 120000) {
      localStorage.setItem(`vthumb_${id}`, dataUrl);
    }
  } catch (e) {}
};

export const VideoThumbnail: React.FC<VideoThumbnailProps> = ({ item, className = "w-full h-full", showPlayBadge = true }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  const [imgSrc, setImgSrc] = useState<string | null>(() => {
    const cached = getCachedThumb(item.id);
    if (cached) return cached;

    const url = item.previewUrl || item.thumbnailLink;
    if (url && typeof url === 'string') {
      if (url.startsWith('data:image') || url.startsWith('blob:')) return url;
      if (url.includes('googleusercontent.com') || url.includes('drive.google.com')) {
        return url.replace(/=s\d+/, '=s400');
      }
    }
    if (item.id && !item.id.startsWith('temp_') && !item.id.startsWith('doc_') && !item.id.startsWith('file_')) {
      return `https://drive.google.com/thumbnail?id=${item.id}&sz=w400`;
    }
    return null;
  });

  const [videoStreamUrl, setVideoStreamUrl] = useState<string | null>(null);
  const [isImgError, setIsImgError] = useState(false);
  const [isVideoError, setIsVideoError] = useState(false);

  // Lazy visibility observer so offscreen videos never consume resources
  useEffect(() => {
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
      { rootMargin: '150px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    let isMounted = true;
    let createdBlobUrl: string | null = null;

    const cached = getCachedThumb(item.id);
    if (cached) {
      setImgSrc(cached);
      setIsImgError(false);
      return;
    }

    const resolveQuickThumbnail = async () => {
      try {
        // 1. Check local IndexedDB blob ONLY (0ms local lookup, no network download!)
        const localBlob = await dbService.getBlob(item.id).catch(() => null);
        if (localBlob && isMounted) {
          const fileObj = new File([localBlob], item.name, { type: localBlob.type || 'video/mp4' });
          const canvasThumb = await imageUtils.generateVideoThumbnail(fileObj).catch(() => '');
          if (canvasThumb && isMounted) {
            saveCachedThumb(item.id, canvasThumb);
            setImgSrc(canvasThumb);
            setIsImgError(false);
            return;
          }
          if (isMounted) {
            createdBlobUrl = URL.createObjectURL(localBlob);
            setVideoStreamUrl(createdBlobUrl);
            return;
          }
        }

        // 2. If Drive thumbnail image failed or wasn't available, use lightweight metadata range stream (#t=0.1)
        if ((isImgError || !imgSrc) && isMounted) {
          const token = api.getAccessToken ? api.getAccessToken() : '';
          if (token && item.id && !item.id.startsWith('temp_')) {
            setVideoStreamUrl(`https://www.googleapis.com/drive/v3/files/${item.id}?alt=media&access_token=${token}`);
          } else if (item.webContentLink) {
            setVideoStreamUrl(item.webContentLink);
          }
        }
      } catch (e) {}
    };

    resolveQuickThumbnail();

    return () => {
      isMounted = false;
      if (createdBlobUrl) {
        URL.revokeObjectURL(createdBlobUrl);
      }
    };
  }, [item.id, item.name, isVisible, isImgError, imgSrc, item.webContentLink]);

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden ${className} bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center shrink-0 group`}
    >
      {imgSrc && !isImgError ? (
        <img
          src={imgSrc}
          alt={item.name}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          referrerPolicy="no-referrer"
          onError={() => setIsImgError(true)}
        />
      ) : videoStreamUrl && !isVideoError ? (
        <video
          src={`${videoStreamUrl}#t=0.1`}
          className="w-full h-full object-cover pointer-events-none select-none transition-transform duration-300 group-hover:scale-105"
          preload="metadata"
          muted
          playsInline
          onLoadedData={(e) => {
            try {
              const video = e.currentTarget;
              if (video.videoWidth > 0 && video.videoHeight > 0) {
                const canvas = document.createElement('canvas');
                const scale = Math.min(1, 320 / video.videoWidth);
                canvas.width = Math.round(video.videoWidth * scale);
                canvas.height = Math.round(video.videoHeight * scale);
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                  const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
                  if (dataUrl && dataUrl.length > 1000) {
                    saveCachedThumb(item.id, dataUrl);
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

      {showPlayBadge && (imgSrc && !isImgError || (videoStreamUrl && !isVideoError)) && (
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
