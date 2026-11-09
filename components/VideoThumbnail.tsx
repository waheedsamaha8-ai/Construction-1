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

export const VideoThumbnail: React.FC<VideoThumbnailProps> = ({ item, className = "w-full h-full", showPlayBadge = true }) => {
  const [imgSrc, setImgSrc] = useState<string | null>(() => {
    const url = item.previewUrl || item.thumbnailLink;
    if (url && (url.startsWith('data:image') || url.includes('googleusercontent.com') || url.includes('thumbnail'))) {
      return url;
    }
    // If valid Drive ID, use direct Drive thumbnail URL
    if (item.id && !item.id.startsWith('temp_') && !item.id.startsWith('doc_') && !item.id.startsWith('file_')) {
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

    const loadVideoFrame = async () => {
      // If we already have a working imgSrc and no error, we don't need blob loading
      if (imgSrc && !isImgError) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);

        // 1. Try local IndexedDB blob first (fastest for offline/recorded videos)
        const localBlob = await dbService.getBlob(item.id).catch(() => null);
        if (localBlob && isMounted) {
          const fileObj = new File([localBlob], item.name, { type: localBlob.type || 'video/webm' });
          const canvasThumb = await imageUtils.generateVideoThumbnail(fileObj).catch(() => '');
          if (canvasThumb && isMounted) {
            setImgSrc(canvasThumb);
            setIsImgError(false);
            setIsLoading(false);
            return;
          }
          
          const blobUrl = URL.createObjectURL(localBlob);
          setVideoBlobUrl(blobUrl);
          setIsVideoError(false);
          setIsLoading(false);
          return;
        }

        // 2. Try downloadFileBlob from API
        const remoteBlob = await api.downloadFileBlob(item.id).catch(() => null);
        if (remoteBlob && isMounted) {
          const fileObj = new File([remoteBlob], item.name, { type: remoteBlob.type || 'video/mp4' });
          const canvasThumb = await imageUtils.generateVideoThumbnail(fileObj).catch(() => '');
          if (canvasThumb && isMounted) {
            setImgSrc(canvasThumb);
            setIsImgError(false);
            setIsLoading(false);
            return;
          }

          const blobUrl = URL.createObjectURL(remoteBlob);
          setVideoBlobUrl(blobUrl);
          setIsVideoError(false);
          setIsLoading(false);
          return;
        }
      } catch (e) {
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadVideoFrame();

    return () => {
      isMounted = false;
    };
  }, [item.id, item.name, isImgError, imgSrc]);

  // 1. Render image thumbnail (Drive thumbnail or Canvas generated JPEG)
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
          <div className="absolute inset-0 bg-black/25 flex items-center justify-center pointer-events-none">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-black/60 backdrop-blur-sm border border-white/30 flex items-center justify-center text-white text-xs shadow-md transform transition-transform group-hover:scale-110">
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
          <div className="absolute inset-0 bg-black/25 flex items-center justify-center pointer-events-none">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-black/60 backdrop-blur-sm border border-white/30 flex items-center justify-center text-white text-xs shadow-md transform transition-transform group-hover:scale-110">
              <i className="fa-solid fa-play text-white text-[10px] sm:text-xs translate-x-[1px]"></i>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 3. Fallback while loading or if all sources fail
  return (
    <div className={`relative overflow-hidden ${className} bg-gradient-to-br from-slate-800 via-rose-950 to-slate-900 flex items-center justify-center shrink-0`}>
      {isLoading ? (
        <div className="w-5 h-5 border-2 border-rose-400 border-t-transparent rounded-full animate-spin"></div>
      ) : (
        <div className="flex flex-col items-center justify-center text-rose-300 p-1 text-center">
          <div className="w-7 h-7 rounded-full bg-rose-500/20 border border-rose-400/30 flex items-center justify-center mb-0.5 shadow-inner">
            <i className="fa-solid fa-play text-rose-300 text-xs translate-x-[1px]"></i>
          </div>
          <span className="text-[8px] font-bold text-rose-200/90 tracking-wider">فيديو</span>
        </div>
      )}
    </div>
  );
};

export default VideoThumbnail;
