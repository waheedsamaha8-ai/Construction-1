import React, { useState, useEffect } from 'react';
import { FileItem } from '../types';
import { api } from '../services/api';
import { dbService } from '../services/db';
import { imageUtils } from '../services/imageUtils';

interface VideoThumbnailProps {
  item: FileItem;
  className?: string;
  showPlayBadge?: boolean;
}

// Memory cache to instantly reuse extracted thumbnails across rerenders
const memoryThumbCache = new Map<string, string>();

export const VideoThumbnail: React.FC<VideoThumbnailProps> = ({ item, className = "w-full h-full", showPlayBadge = true }) => {
  const isWebmOrRecorded = item.name?.toLowerCase().endsWith('.webm') || item.name?.includes('_geotagged') || item.mimeType === 'video/webm';

  const [imgSrc, setImgSrc] = useState<string | null>(() => {
    if (memoryThumbCache.has(item.id)) {
      return memoryThumbCache.get(item.id)!;
    }
    const url = item.previewUrl || item.thumbnailLink;
    if (url && typeof url === 'string' && (url.startsWith('data:image') || url.startsWith('blob:'))) {
      return url;
    }
    // Only use Google Drive thumbnail if it's NOT a webm / recorded video (Google returns solid black frame 0 for webm)
    if (!isWebmOrRecorded && item.id && !item.id.startsWith('temp_') && !item.id.startsWith('doc_') && !item.id.startsWith('file_')) {
      return `https://drive.google.com/thumbnail?id=${item.id}&sz=w400`;
    }
    return null;
  });

  const [videoBlobUrl, setVideoBlobUrl] = useState<string | null>(null);
  const [isImgError, setIsImgError] = useState(false);
  const [isVideoError, setIsVideoError] = useState(false);
  const [isLoading, setIsLoading] = useState(!imgSrc);

  useEffect(() => {
    let isMounted = true;
    let activeCreatedBlobUrl: string | null = null;

    // Check memory cache first
    if (memoryThumbCache.has(item.id)) {
      setImgSrc(memoryThumbCache.get(item.id)!);
      setIsLoading(false);
      return;
    }

    const loadVideoFrame = async () => {
      // If we already have a reliable non-black imgSrc and not error, keep it
      if (imgSrc && !isImgError && !isWebmOrRecorded) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);

        // 1. Try local IndexedDB blob first (0ms for newly recorded / cached videos)
        const localBlob = await dbService.getBlob(item.id).catch(() => null);
        if (localBlob && isMounted) {
          const fileObj = new File([localBlob], item.name, { type: localBlob.type || 'video/webm' });
          const canvasThumb = await imageUtils.generateVideoThumbnail(fileObj).catch(() => '');
          if (canvasThumb && isMounted) {
            memoryThumbCache.set(item.id, canvasThumb);
            setImgSrc(canvasThumb);
            setIsImgError(false);
            setIsLoading(false);
            return;
          }
          
          if (isMounted) {
            const blobUrl = URL.createObjectURL(localBlob);
            activeCreatedBlobUrl = blobUrl;
            setVideoBlobUrl(blobUrl);
            setIsVideoError(false);
            setIsLoading(false);
            return;
          }
        }

        // 2. Try downloadFileBlob from API
        const remoteBlob = await api.downloadFileBlob(item.id).catch(() => null);
        if (remoteBlob && isMounted) {
          const fileObj = new File([remoteBlob], item.name, { type: remoteBlob.type || 'video/webm' });
          const canvasThumb = await imageUtils.generateVideoThumbnail(fileObj).catch(() => '');
          if (canvasThumb && isMounted) {
            memoryThumbCache.set(item.id, canvasThumb);
            setImgSrc(canvasThumb);
            setIsImgError(false);
            setIsLoading(false);
            return;
          }

          if (isMounted) {
            const blobUrl = URL.createObjectURL(remoteBlob);
            activeCreatedBlobUrl = blobUrl;
            setVideoBlobUrl(blobUrl);
            setIsVideoError(false);
            setIsLoading(false);
            return;
          }
        }
      } catch (e) {
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadVideoFrame();

    return () => {
      isMounted = false;
      if (activeCreatedBlobUrl) {
        URL.revokeObjectURL(activeCreatedBlobUrl);
      }
    };
  }, [item.id, item.name, isImgError, isWebmOrRecorded]);

  // 1. Render image thumbnail (Canvas generated real frame or Drive thumbnail)
  if (imgSrc && !isImgError) {
    return (
      <div className={`relative overflow-hidden ${className} bg-slate-900 flex items-center justify-center shrink-0 group`}>
        <img
          src={imgSrc}
          alt={item.name}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          referrerPolicy="no-referrer"
          onError={() => {
            setIsImgError(true);
          }}
        />
        {showPlayBadge && (
          <div className="absolute inset-0 bg-black/20 flex items-center justify-center pointer-events-none">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-black/60 backdrop-blur-sm border border-white/40 flex items-center justify-center text-white text-xs shadow-lg transform transition-transform group-hover:scale-110">
              <i className="fa-solid fa-play text-white text-[10px] sm:text-xs translate-x-[1px]"></i>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 2. Render Blob video element (#t=0.5 keyframe)
  if (videoBlobUrl && !isVideoError) {
    return (
      <div className={`relative overflow-hidden ${className} bg-slate-900 flex items-center justify-center shrink-0 group`}>
        <video
          src={`${videoBlobUrl}#t=0.5`}
          className="w-full h-full object-cover pointer-events-none select-none transition-transform duration-300 group-hover:scale-105"
          preload="metadata"
          muted
          playsInline
          onError={() => setIsVideoError(true)}
        />
        {showPlayBadge && (
          <div className="absolute inset-0 bg-black/20 flex items-center justify-center pointer-events-none">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-black/60 backdrop-blur-sm border border-white/40 flex items-center justify-center text-white text-xs shadow-lg transform transition-transform group-hover:scale-110">
              <i className="fa-solid fa-play text-white text-[10px] sm:text-xs translate-x-[1px]"></i>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 3. Fallback / Loading stylish video card
  return (
    <div className={`relative overflow-hidden ${className} bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center shrink-0 border border-slate-800`}>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/30 via-transparent to-black/60 pointer-events-none"></div>
      {isLoading ? (
        <div className="flex flex-col items-center justify-center gap-1 z-10">
          <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-[7.5px] text-blue-200/80 font-bold">معالجة...</span>
        </div>
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
    </div>
  );
};

export default VideoThumbnail;
