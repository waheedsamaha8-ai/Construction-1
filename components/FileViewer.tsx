
// @ts-nocheck
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom'; 
import { FileItem } from '../types';
import { aiHelper } from '../services/aiHelper';
import { api } from '../services/api';
import { dbService } from '../services/db';
import { printService } from '../services/printService';
import * as pdfjsLib from 'pdfjs-dist';
import ImageEditor from './ImageEditor';
import DwgViewer from './DwgViewer';

// ... (Keep Imports and PDF Config) ...
const pdfJs: any = pdfjsLib;
const GlobalWorkerOptions = pdfJs.GlobalWorkerOptions || pdfJs.default?.GlobalWorkerOptions;
const getDocument = pdfJs.getDocument || pdfJs.default?.getDocument;

if (GlobalWorkerOptions) {
    GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
}

interface FileViewerProps {
  item: FileItem;
  siblings?: FileItem[]; 
  onClose: () => void;
}

// ... (Keep PdfPage Component) ...
const PdfPage: React.FC<{ pdfDoc: any, pageNum: number, scale: number }> = ({ pdfDoc, pageNum, scale }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isRendered, setIsRendered] = useState(false);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true);
                }
            },
            { rootMargin: '600px 0px' }
        );
        if (containerRef.current) observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        let active = true;
        const render = async () => {
            if (!pdfDoc || !canvasRef.current || !isVisible) return;
            try {
                const page = await pdfDoc.getPage(pageNum);
                const viewport = page.getViewport({ scale: scale * 1.8 });
                
                const canvas = canvasRef.current;
                if (!canvas) return;

                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;
                
                canvas.style.width = '100%';
                canvas.style.height = 'auto';
                canvas.style.display = 'block';

                if (context && active) {
                    await page.render({ canvasContext: context, viewport: viewport }).promise;
                    if (active) setIsRendered(true);
                }
            } catch (e) {
                console.error(`Error rendering page ${pageNum}`, e);
            }
        };
        render();
        return () => { active = false; };
    }, [pdfDoc, pageNum, scale, isVisible]);

    return (
        <div ref={containerRef} className="mb-1.5 shadow-xl relative bg-white min-h-[280px] w-full max-w-none flex justify-center items-center overflow-hidden border-b border-slate-700/60">
            {!isRendered && (
                <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-xs bg-slate-900/80 gap-2 font-bold">
                    <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                    <span>جاري تحميل صفحة {pageNum}...</span>
                </div>
            )}
            <canvas ref={canvasRef} className="block w-full h-auto" />
            <div className="absolute bottom-2 left-2 bg-black/70 text-white text-[10px] px-2.5 py-0.5 rounded-md backdrop-blur-sm z-10 font-bold border border-white/10 shadow">{pageNum}</div>
        </div>
    );
};

const FileViewer: React.FC<FileViewerProps> = ({ item, siblings = [], onClose }) => {
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(() => {
      const idx = siblings.findIndex(f => f.id === item.id);
      return idx >= 0 ? idx : 0;
  });
  
  const currentItem = siblings.length > 0 ? siblings[currentIndex] : item;

  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [isAnalysisOpen, setIsAnalysisOpen] = useState(false);
  
  const [displayUrl, setDisplayUrl] = useState<string | null>(null);
  const [isHighResLoaded, setIsHighResLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);

  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [numPages, setNumPages] = useState(0);
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [pdfRenderError, setPdfRenderError] = useState(false);

  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const lastTouchRef = useRef<{ x: number; y: number; dist: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);

  const mime = (currentItem.mimeType || '').toLowerCase();
  const name = (currentItem.name || '').toLowerCase();
  
  const isWord = mime.includes('word') || mime.includes('officedocument') || name.endsWith('.docx') || name.endsWith('.doc');
  const isExcel = mime.includes('excel') || mime.includes('spreadsheet') || name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv');
  const isPowerPoint = mime.includes('presentation') || mime.includes('powerpoint') || name.endsWith('.pptx') || name.endsWith('.ppt');
  const isGoogleNative = mime.includes('application/vnd.google-apps.');
  
  const isOffice = isWord || isExcel || isPowerPoint || isGoogleNative;

  const [useCloudVideoPlayer, setUseCloudVideoPlayer] = useState(false);
  const [isFallbackDownloading, setIsFallbackDownloading] = useState(false);

  const isImage = mime.startsWith('image/'); 
  const isVideo = mime.startsWith('video/') || name.endsWith('.mp4') || name.endsWith('.mov') || name.endsWith('.avi') || name.endsWith('.webm') || name.endsWith('.mkv') || name.endsWith('.3gp');
  const isAudio = mime.startsWith('audio/') || name.endsWith('.mp3') || name.endsWith('.wav') || name.endsWith('.m4a') || name.endsWith('.ogg');
  const isPdf = mime.includes('pdf');
  const isDwg = name.endsWith('.dwg') || mime.includes('acad') || mime.includes('dwg'); 
  
  const isText = !isOffice && !isPdf && !isImage && !isVideo && !isAudio && !isDwg && (
                 mime.startsWith('text/') || 
                 mime.includes('json') || 
                 mime.includes('javascript') || 
                 mime.includes('xml') || 
                 name.endsWith('.txt') || 
                 name.endsWith('.md') || 
                 name.endsWith('.log') ||
                 name.endsWith('.html'));

  const getEmbedUrl = () => {
    if (isGoogleNative) {
        if (mime.includes('document')) return `https://docs.google.com/document/d/${currentItem.id}/preview?usp=embed_googleplus`;
        if (mime.includes('spreadsheet')) return `https://docs.google.com/spreadsheets/d/${currentItem.id}/preview?usp=embed_googleplus`;
        if (mime.includes('presentation')) return `https://docs.google.com/presentation/d/${currentItem.id}/preview?usp=embed_googleplus`;
    }
    return `https://drive.google.com/file/d/${currentItem.id}/preview`;
  };

  const embedUrl = getEmbedUrl();

  useEffect(() => {
      setScale(1);
      setPosition({ x: 0, y: 0 });
      setAnalysisResult(null);
      setIsAnalysisOpen(false);
      setLoadError(false);
      setIsHighResLoaded(false);
      setDownloadProgress(0);
      setDisplayUrl(null);
      setPdfDoc(null);
      setTextContent(null);
      setPdfRenderError(false);
      setIsEditing(false);
      setIsSharing(false);
      setShowActionsMenu(false);
      setUseCloudVideoPlayer(false);
      setIsFallbackDownloading(false);
  }, [currentItem.id]);

  useEffect(() => {
    let active = true;
    if (isOffice || isDwg) {
        return; 
    }

    const load = async () => {
        if (isImage) {
            // 1. Check local IndexedDB cache first (0ms)
            try {
                const cachedBlob = await dbService.getBlob(currentItem.id);
                if (cachedBlob && active) {
                    setDisplayUrl(URL.createObjectURL(cachedBlob));
                    setIsHighResLoaded(true);
                    return;
                }
            } catch (e) {}

            // 2. Show high-res Google Drive preview immediately (<100ms, crisp)
            let instantUrl = currentItem.previewUrl || currentItem.thumbnailLink;
            if (instantUrl && instantUrl.includes('googleusercontent.com')) {
                instantUrl = instantUrl.replace(/=s\d+/, '=s1600'); 
            } else if (!instantUrl && currentItem.id && !currentItem.id.startsWith('temp_')) {
                instantUrl = `https://drive.google.com/thumbnail?id=${currentItem.id}&sz=w1600`;
            }
            if (instantUrl && active) {
                setDisplayUrl(instantUrl);
                setIsHighResLoaded(true);
            }

            // 3. Silently cache full blob in background for offline/zoom
            try {
                const blob = await api.downloadFileBlob(currentItem.id, (p) => { if(active && !instantUrl) setDownloadProgress(p); }, !!instantUrl);
                if (active && blob) {
                    const blobUrl = URL.createObjectURL(blob);
                    setDisplayUrl(blobUrl);
                    setIsHighResLoaded(true);
                }
            } catch (e) {
                if (!instantUrl && active) setLoadError(true);
            }
        } 
        else if (isPdf) {
            setIsPdfLoading(true);
            try {
                const blob = await api.downloadFileBlob(currentItem.id, (p) => { if(active) setDownloadProgress(p) });
                const arrayBuffer = await blob.arrayBuffer();
                
                if (!getDocument) {
                    throw new Error("PDF.js library not loaded correctly (getDocument missing)");
                }

                const loadingTask = getDocument({ data: arrayBuffer });
                const pdf = await loadingTask.promise;
                if (active) {
                    setPdfDoc(pdf);
                    setNumPages(pdf.numPages);
                }
            } catch (e) {
                console.error("PDF Load Error", e);
                if (active) {
                    if (embedUrl) {
                        setPdfRenderError(true);
                    } else {
                        setLoadError(true);
                    }
                }
            } finally {
                if (active) setIsPdfLoading(false);
            }
        }
        else if (isVideo || isAudio) {
             const ensureTypedMediaBlob = (rawBlob: Blob) => {
                 if (rawBlob.type && (rawBlob.type.startsWith('video/') || rawBlob.type.startsWith('audio/'))) {
                     return rawBlob;
                 }
                 let inferredType = isAudio ? 'audio/mp3' : 'video/mp4';
                 if (mime.startsWith('video/') || mime.startsWith('audio/')) inferredType = mime;
                 else if (name.endsWith('.webm')) inferredType = 'video/webm';
                 else if (name.endsWith('.mov')) inferredType = 'video/quicktime';
                 return new Blob([rawBlob], { type: inferredType });
             };

             // 1. Check local IndexedDB blob first (0ms for locally recorded or cached media)
             try {
                 const localBlob = await dbService.getBlob(currentItem.id);
                 if (localBlob && localBlob.size > 0 && active) {
                     const typedBlob = ensureTypedMediaBlob(localBlob);
                     setDisplayUrl(URL.createObjectURL(typedBlob));
                     return;
                 }
             } catch (e) {}

             // 2. Set direct stream URL immediately (NEVER use previewUrl because previewUrl is an image thumbnail!)
             const token = api.getAccessToken ? api.getAccessToken() : '';
             const streamUrl = token && currentItem.id && !currentItem.id.startsWith('temp_')
                 ? `https://www.googleapis.com/drive/v3/files/${currentItem.id}?alt=media&access_token=${token}` 
                 : (currentItem.webContentLink || '');
             
             if (streamUrl && active) {
                 setDisplayUrl(streamUrl);
                 // Pre-cache blob in background so mobile browsers that reject direct range streams can switch to local Blob seamlessly
                 api.downloadFileBlob(currentItem.id, (p) => { if (active) setDownloadProgress(p); }, true)
                    .then((blob) => {
                        if (active && blob && blob.size > 0) {
                            const typed = ensureTypedMediaBlob(blob);
                            // Keep cached in IndexedDB; if stream errored out, switch immediately
                            setDisplayUrl((prev) => (!prev ? URL.createObjectURL(typed) : prev));
                        }
                    })
                    .catch(() => {});
             } else {
                 try {
                     const blob = await api.downloadFileBlob(currentItem.id, (p) => { if(active) setDownloadProgress(p) });
                     if (active && blob) {
                         setDisplayUrl(URL.createObjectURL(ensureTypedMediaBlob(blob)));
                     }
                 } catch(e) {
                     if (active) {
                         if (isVideo && !api.isGuest() && currentItem.id && !currentItem.id.startsWith('temp_')) {
                             setUseCloudVideoPlayer(true);
                         } else {
                             setLoadError(true);
                         }
                     }
                 }
             }
        }
        else if (isText) {
            try {
                const text = await api.getFileContent(currentItem.id);
                if (active) setTextContent(text);
            } catch(e) { if (active) setLoadError(true); }
        }
    };

    load();
    return () => { active = false; };
  }, [currentItem.id, isImage, isVideo, isText, isPdf, isOffice, isAudio, isDwg, currentItem.previewUrl, embedUrl]);

  const handleAnalyze = async () => {
      if (!isImage && !isPdf && !isAudio) { alert("التحليل متاح للصور، ملفات PDF، والملفات الصوتية فقط."); return; }
      setAnalyzing(true); 
      setAnalysisResult(null); 
      setIsAnalysisOpen(true); 
      try { 
          const blob = await api.downloadFileBlob(currentItem.id);
          let result = '';
          if (isImage) {
              result = await aiHelper.analyzeSiteImage(blob); 
          } else if (isPdf) {
              result = await aiHelper.analyzePdfDocument(blob);
          } else if (isAudio) {
              result = await aiHelper.transcribeAndRefineLetterText(blob);
              if (!result) result = "لم يتمكن النظام من استخراج نص واضح من الملف الصوتي.";
          }
          setAnalysisResult(result); 
      } catch (error) { 
          setAnalysisResult("حدث خطأ أثناء تحليل الملف."); 
      } finally { 
          setAnalyzing(false); 
      }
  };

  const handlePrintAnalysis = () => {
      if (analysisResult) {
          printService.printReport(analysisResult, `تقرير فني - ${currentItem.name}`);
      }
  };

  const handleEditAnalysis = () => {
      if (!analysisResult) return;
      navigate(`/editor/${currentItem.parentId}/${currentItem.parentId}`, {
          state: { initialContent: analysisResult }
      });
  };

  const handleShare = async () => {
      if (isSharing) return;
      setIsSharing(true);
      setDownloadProgress(10); 
      try {
          const blob = await api.downloadFileBlob(currentItem.id, (p) => setDownloadProgress(p));
          let fileName = currentItem.name;
          const file = new File([blob], fileName, { type: blob.type });
          await api.shareSmart(currentItem, file);
      } catch (e) {
          alert("فشل تحضير الملف للمشاركة.");
      } finally {
          setIsSharing(false);
          setDownloadProgress(0);
      }
  };

  const handleNext = () => { if (currentIndex < siblings.length - 1) setCurrentIndex(prev => prev + 1); };
  const handlePrev = () => { if (currentIndex > 0) setCurrentIndex(prev => prev - 1); };

  // --- Touch Handlers (Unified for Image & PDF) ---
  const handleTouchStart = (e: React.TouchEvent) => { if (e.touches.length === 1) { setIsDragging(true); lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, dist: 0 }; } else if (e.touches.length === 2) { const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); lastTouchRef.current = { x: 0, y: 0, dist }; } };
  const handleTouchMove = (e: React.TouchEvent) => { if (e.touches.length === 1 && isDragging && scale > 1) { if (!lastTouchRef.current) return; const dx = e.touches[0].clientX - lastTouchRef.current.x; const dy = e.touches[0].clientY - lastTouchRef.current.y; setPosition(prev => ({ x: prev.x + dx, y: prev.y + dy })); lastTouchRef.current = { ...lastTouchRef.current, x: e.touches[0].clientX, y: e.touches[0].clientY }; } else if (e.touches.length === 2) { const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); if (lastTouchRef.current && lastTouchRef.current.dist > 0) { const delta = dist - lastTouchRef.current.dist; const newScale = Math.min(Math.max(1, scale + delta * 0.01), 5); setScale(newScale); if (newScale === 1) setPosition({ x: 0, y: 0 }); } if (lastTouchRef.current) lastTouchRef.current.dist = dist; } };
  const handleTouchEnd = (e: React.TouchEvent) => { if (scale === 1 && isDragging && lastTouchRef.current && e.changedTouches.length > 0) { const dx = e.changedTouches[0].clientX - lastTouchRef.current.x; const dy = e.changedTouches[0].clientY - lastTouchRef.current.y; if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) { if (dx > 0) handleNext(); else handlePrev(); } } setIsDragging(false); lastTouchRef.current = null; };
  const handleDoubleTap = () => { if (scale > 1) { setScale(1); setPosition({ x: 0, y: 0 }); } else { setScale(2.5); } };

  const renderContent = () => {
      // ... (Keep existing Render Content logic from original FileViewer.tsx, including DWG, PDF, Image etc.) ...
      if (loadError) return <div className="flex flex-col items-center justify-center text-white z-10 h-full p-6 text-center"><i className="fa-solid fa-triangle-exclamation text-yellow-500 text-5xl mb-4"></i><p className="font-bold mb-2 text-lg">تعذر عرض الملف</p>{currentItem.webViewLink && <a href={currentItem.webViewLink} target="_blank" rel="noreferrer" className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-500 mt-4">فتح في Drive</a>}</div>;
      if (isDwg) return <DwgViewer item={currentItem} onClose={onClose} />;
      
      // Updated PDF Viewer with Pinch-to-Zoom
      if (isPdf && !pdfRenderError) return (
        <div 
            className="w-full h-full relative bg-slate-800 touch-none overflow-hidden" 
            onTouchStart={handleTouchStart} 
            onTouchMove={handleTouchMove} 
            onTouchEnd={handleTouchEnd} 
            onDoubleClick={handleDoubleTap}
        >
            <div 
                className={`absolute inset-0 flex flex-col items-stretch pt-0 pb-16 transition-transform duration-75 ease-out ${scale === 1 ? 'overflow-y-auto custom-scrollbar' : 'overflow-visible'}`} 
                style={{ 
                    transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
                    transformOrigin: 'top left'
                }}
            >
                {(isPdfLoading || !pdfDoc) && (
                    <div className="flex flex-col items-center justify-center mt-20">
                        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                        <p className="text-white font-bold">{downloadProgress}% جاري المعالجة...</p>
                    </div>
                )}
                {pdfDoc && Array.from({ length: numPages }, (_, i) => (
                    <div key={i + 1} className="w-full px-0 m-0 flex justify-center">
                        <PdfPage pageNum={i + 1} pdfDoc={pdfDoc} scale={1} />
                    </div>
                ))}
            </div>
        </div>
      );
      
      // FIX: Ensure Image is perfectly centered using margin-auto and flex
      if (isImage) return <div className="w-full h-full flex items-center justify-center overflow-hidden p-0 relative touch-none select-none" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} onDoubleClick={handleDoubleTap}>
          {!displayUrl && <div className="absolute inset-0 flex flex-col items-center justify-center z-20"><div className="relative w-16 h-16 flex items-center justify-center"><div className="absolute inset-0 border-4 border-blue-500/30 rounded-full"></div><div className="absolute inset-0 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div><span className="text-xs font-bold text-white relative z-10">{downloadProgress}%</span></div></div>}
          {displayUrl && 
            <img 
                ref={containerRef as any} 
                src={displayUrl} 
                alt={currentItem.name} 
                className={`max-w-full max-h-full object-contain shadow-2xl z-10 transition-transform duration-75 ease-out will-change-transform ${!isHighResLoaded ? 'blur-sm scale-95 opacity-80' : 'blur-0 scale-100 opacity-100'} transition-all duration-300 m-auto block`} 
                style={{ 
                    transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
                    objectPosition: 'center center'
                }} 
                draggable={false} 
            />
          }
          {siblings.length > 1 && scale === 1 && (<> {currentIndex > 0 && <button onClick={(e) => { e.stopPropagation(); handlePrev(); }} className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 bg-black/40 hover:bg-black/60 text-white rounded-full flex items-center justify-center backdrop-blur-sm z-30 transition hover:scale-110"><i className="fa-solid fa-chevron-left text-lg sm:text-2xl"></i></button>} {currentIndex < siblings.length - 1 && <button onClick={(e) => { e.stopPropagation(); handleNext(); }} className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 bg-black/40 hover:bg-black/60 text-white rounded-full flex items-center justify-center backdrop-blur-sm z-30 transition hover:scale-110"><i className="fa-solid fa-chevron-right text-lg sm:text-2xl"></i></button>} </>)}
      </div>;
      
      // FIX: Ensure Video is perfectly centered & 100% mobile compatible with automatic fallbacks
      if (isVideo) {
          let videoPoster: string | undefined = undefined;
          try {
              const savedThumb = localStorage.getItem(`vthumb_${currentItem.id}`);
              if (savedThumb && savedThumb.startsWith('data:image')) videoPoster = savedThumb;
              else if (currentItem.previewUrl && currentItem.previewUrl.startsWith('data:image')) videoPoster = currentItem.previewUrl;
          } catch (e) {}

          if (useCloudVideoPlayer && embedUrl && !api.isGuest()) {
              return (
                  <div className="w-full h-full flex flex-col bg-black relative">
                      <iframe
                          src={embedUrl}
                          className="w-full h-full border-0 flex-1"
                          allow="autoplay; fullscreen"
                          allowFullScreen
                          title={currentItem.name}
                      />
                  </div>
              );
          }

          return (
              <div className="w-full h-full flex items-center justify-center bg-black relative"> 
                  {displayUrl && !isFallbackDownloading ? (
                      <video 
                          key={displayUrl}
                          controls 
                          autoPlay 
                          playsInline 
                          webkit-playsinline="true"
                          preload="auto" 
                          poster={videoPoster}
                          className="max-w-full max-h-full w-full h-full shadow-2xl m-auto block object-contain" 
                          src={displayUrl}
                          onLoadedMetadata={(e) => {
                              const vid = e.currentTarget;
                              vid.play().catch(() => {
                                  // If mobile browser blocks unmuted autoplay, user can tap play or we play muted first
                              });
                          }}
                          onError={async () => {
                              // Stage 1 Fallback: If direct stream URL failed on mobile, download as typed local Blob
                              if (displayUrl && !displayUrl.startsWith('blob:')) {
                                  setIsFallbackDownloading(true);
                                  try {
                                      const blob = await api.downloadFileBlob(currentItem.id, (p) => setDownloadProgress(p));
                                      if (blob && blob.size > 0) {
                                          let inferredType = 'video/mp4';
                                          if (mime.startsWith('video/')) inferredType = mime;
                                          else if (name.endsWith('.webm')) inferredType = 'video/webm';
                                          const typedBlob = new Blob([blob], { type: inferredType });
                                          setDisplayUrl(URL.createObjectURL(typedBlob));
                                          setIsFallbackDownloading(false);
                                          return;
                                      }
                                  } catch (err) {}
                                  setIsFallbackDownloading(false);
                              }
                              // Stage 2 Fallback: Use Google Drive's universal mobile transcoded player
                              if (!api.isGuest() && currentItem.id && !currentItem.id.startsWith('temp_')) {
                                  setUseCloudVideoPlayer(true);
                              } else {
                                  setLoadError(true);
                              }
                          }}
                      />
                  ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-black/90 z-20">
                          {videoPoster && (
                              <img src={videoPoster} alt="" className="absolute inset-0 w-full h-full object-contain opacity-35 blur-xs pointer-events-none" />
                          )}
                          <div className="relative w-16 h-16 flex items-center justify-center mb-3 z-10">
                              <div className="absolute inset-0 border-4 border-white/30 rounded-full"></div>
                              <div className="absolute inset-0 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                              <span className="text-xs font-bold text-white relative z-10">{downloadProgress > 0 ? `${downloadProgress}%` : ''}</span>
                          </div>
                          <p className="font-bold text-sm z-10">جاري فتح الفيديو...</p>
                      </div>
                  )}
                  {siblings.length > 1 && (<> {currentIndex > 0 && <button onClick={(e) => { e.stopPropagation(); handlePrev(); }} className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 bg-black/40 hover:bg-black/60 text-white rounded-full flex items-center justify-center backdrop-blur-sm z-30 transition hover:scale-110"><i className="fa-solid fa-chevron-left text-lg sm:text-2xl"></i></button>} {currentIndex < siblings.length - 1 && <button onClick={(e) => { e.stopPropagation(); handleNext(); }} className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 bg-black/40 hover:bg-black/60 text-white rounded-full flex items-center justify-center backdrop-blur-sm z-30 transition hover:scale-110"><i className="fa-solid fa-chevron-right text-lg sm:text-2xl"></i></button>} </>)}
              </div>
          );
      }
      
      if (isAudio) return <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 relative">
        <div className="relative mb-8">
            <div className="w-32 h-32 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg border-4 border-slate-700 relative z-10">
                <i className="fa-solid fa-headphones text-5xl text-white"></i>
            </div>
            <div className="absolute top-0 left-0 w-32 h-32 rounded-full bg-indigo-500 opacity-20 animate-ping"></div>
        </div>
        <div className="bg-slate-800 p-6 rounded-3xl w-full max-w-md mx-4 shadow-xl border border-slate-700">
            {displayUrl ? (
                <audio controls className="w-full" src={displayUrl}>متصفحك لا يدعم تشغيل الصوت.</audio>
            ) : (
                <div className="flex flex-col items-center justify-center text-white py-4">
                    <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                    <span className="text-xs font-bold">{downloadProgress}% جاري تحميل الملف...</span>
                </div>
            )}
        </div>
      </div>;
      if (isText && textContent !== null) return <div className="w-full h-full overflow-auto bg-slate-50 p-4 sm:p-8"><div className="bg-white text-slate-800 p-6 rounded-lg shadow-sm border border-slate-200 min-h-full font-mono text-sm whitespace-pre-wrap leading-relaxed" dir="ltr">{textContent}</div></div>;
      if (embedUrl || isOffice) { if (api.isGuest()) return <div className="flex flex-col items-center justify-center h-full text-white p-6 text-center"><i className="fa-solid fa-cloud-slash text-slate-500 text-6xl mb-4"></i><h3 className="text-xl font-bold mb-2">المعاينة غير متاحة في وضع الزائر</h3><p className="text-slate-400 max-w-xs mb-6">يتطلب العرض السحابي تسجيل الدخول.</p></div>; return <div className="w-full h-full relative overflow-hidden flex flex-col"><div className={`absolute top-0 left-0 right-0 text-white p-2 text-center text-xs font-bold z-20 shadow-md flex items-center justify-center gap-2 ${isWord ? 'bg-blue-600' : isExcel ? 'bg-emerald-600' : 'bg-slate-700'}`}><i className={`fa-solid ${isWord ? 'fa-file-word' : isExcel ? 'fa-file-excel' : 'fa-file'} text-lg`}></i><span>يتم عرض الملف عبر Google Cloud Viewer</span></div><div className="flex-1 relative w-full h-full bg-slate-100 flex flex-col items-center justify-center"><iframe src={embedUrl} className="w-full h-full border-0 relative z-10" allow="autoplay; fullscreen" title="File Viewer"></iframe><div className="absolute inset-0 flex items-center justify-center z-0"><div className="flex flex-col items-center"><div className="w-10 h-10 border-4 border-slate-300 border-t-blue-500 rounded-full animate-spin mb-3"></div><p className="text-slate-500 font-bold text-sm">جاري جلب الملف...</p></div></div></div></div>; }
      return <div className="flex flex-col items-center justify-center h-full text-white"><p>لا يتوفر معاينة</p></div>;
  };

  if (isEditing && displayUrl) {
      return <ImageEditor fileId={currentItem.id} imageUrl={displayUrl} fileName={currentItem.name} parentId={currentItem.parentId} onClose={() => setIsEditing(false)} onSave={() => { setIsEditing(false); onClose(); }} />;
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex flex-col animate-fade-in safe-bottom safe-top">
      {!isDwg && (
          <div className={`flex justify-between items-center px-3 py-2 text-white shadow-md z-30 ${isWord ? 'bg-blue-800 border-b border-blue-600' : isExcel ? 'bg-emerald-800 border-b border-emerald-600' : isPowerPoint ? 'bg-orange-800 border-b border-orange-600' : isDwg ? 'bg-[#0f172a] border-b border-slate-700' : 'bg-slate-900'}`}>
            <div className="flex items-center gap-2 overflow-hidden min-w-0 flex-1 ml-2">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isWord ? 'bg-blue-600' : isExcel ? 'bg-emerald-600' : isPowerPoint ? 'bg-orange-600' : isImage ? 'bg-purple-600' : isVideo ? 'bg-rose-600' : isPdf ? 'bg-red-600' : isAudio ? 'bg-teal-600' : isDwg ? 'bg-[#c41e3a]' : isText ? 'bg-slate-600' : 'bg-blue-600'}`}>
                    <i className={`fa-solid ${isWord ? 'fa-file-word' : isExcel ? 'fa-file-excel' : isPowerPoint ? 'fa-file-powerpoint' : isImage ? 'fa-image' : isVideo ? 'fa-clapperboard' : isPdf ? 'fa-file-pdf' : isAudio ? 'fa-headphones' : isDwg ? 'fa-layer-group' : isText ? 'fa-file-code' : 'fa-file-lines'} text-xs`}></i>
                </div>
                <div className="min-w-0 flex flex-col justify-center">
                    <h3 className="font-bold text-xs sm:text-sm truncate max-w-[180px] sm:max-w-[320px] leading-tight" title={currentItem.name}>{currentItem.name}</h3>
                    {siblings.length > 1 && <span className="text-[9px] text-slate-400 font-mono leading-tight">{currentIndex + 1} / {siblings.length}</span>}
                </div>
            </div>
            <div className="flex gap-1.5 shrink-0 items-center relative">
                {/* Single Small Icon-Only Button grouping all file actions */}
                <button
                    onClick={() => setShowActionsMenu(prev => !prev)}
                    className={`w-8 h-8 rounded-xl flex items-center justify-center transition text-xs border ${showActionsMenu ? 'bg-indigo-600 text-white border-indigo-400 shadow-lg' : 'bg-white/10 hover:bg-white/20 text-white border-white/10'}`}
                    title="أدوات وخيارات الملف"
                >
                    {analyzing || isSharing ? (
                        <i className="fa-solid fa-circle-notch fa-spin text-xs text-yellow-300"></i>
                    ) : (
                        <i className="fa-solid fa-ellipsis-vertical text-xs"></i>
                    )}
                </button>

                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="w-8 h-8 rounded-xl bg-white/10 hover:bg-red-500/80 flex items-center justify-center transition text-xs border border-white/10"
                    title="إغلاق"
                >
                    <i className="fa-solid fa-times text-xs"></i>
                </button>

                {/* Grouped Actions Dropdown Menu */}
                {showActionsMenu && (
                    <>
                        <div
                            className="fixed inset-0 z-[90]"
                            onClick={() => setShowActionsMenu(false)}
                        ></div>
                        <div className="absolute left-0 top-10 w-60 bg-slate-900/95 backdrop-blur-xl border border-slate-700 rounded-2xl shadow-2xl p-2 z-[100] space-y-1.5 text-white animate-scale-in origin-top-left">
                            <div className="px-2.5 py-1 border-b border-slate-800 flex items-center justify-between">
                                <span className="text-[10px] font-bold text-slate-400">خيارات وأدوات الملف</span>
                                <i className="fa-solid fa-wand-magic-sparkles text-[10px] text-indigo-400"></i>
                            </div>

                            {/* AI Technical Analysis Button (Images, PDFs, Audio) */}
                            {(isPdf || isImage || isAudio) && (
                                <button
                                    onClick={() => {
                                        setShowActionsMenu(false);
                                        handleAnalyze();
                                    }}
                                    disabled={analyzing}
                                    className="w-full px-3 py-2.5 rounded-xl bg-gradient-to-r from-blue-700/90 via-indigo-600/90 to-purple-600/90 hover:from-blue-600 hover:to-purple-500 text-white flex items-center gap-2.5 transition shadow-md border border-white/15 text-xs font-extrabold disabled:opacity-50"
                                >
                                    <div className="w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
                                        {analyzing ? (
                                            <i className="fa-solid fa-circle-notch fa-spin text-xs text-yellow-300"></i>
                                        ) : (
                                            <i className="fa-solid fa-wand-magic-sparkles text-xs text-yellow-300"></i>
                                        )}
                                    </div>
                                    <span className="truncate">
                                        {analyzing ? 'جاري التحليل الفني...' : (isAudio ? 'تحليل وتفريغ التسجيل' : 'تحليل فني للمكتب الفني')}
                                    </span>
                                </button>
                            )}

                            {/* Share File Button */}
                            <button
                                onClick={() => {
                                    setShowActionsMenu(false);
                                    handleShare();
                                }}
                                disabled={isSharing}
                                className="w-full px-3 py-2 rounded-xl hover:bg-white/10 flex items-center gap-2.5 transition text-xs font-bold disabled:opacity-50"
                            >
                                <div className="w-7 h-7 rounded-lg bg-slate-800 text-emerald-400 flex items-center justify-center shrink-0">
                                    {isSharing ? (
                                        <i className="fa-solid fa-circle-notch fa-spin text-xs"></i>
                                    ) : (
                                        <i className="fa-solid fa-share-nodes text-xs"></i>
                                    )}
                                </div>
                                <span>{isSharing ? 'جاري تحضير المشاركة...' : 'مشاركة الملف'}</span>
                            </button>

                            {/* Edit & Draw on Image */}
                            {isImage && (
                                <button
                                    onClick={() => {
                                        setShowActionsMenu(false);
                                        setIsEditing(true);
                                    }}
                                    className="w-full px-3 py-2 rounded-xl hover:bg-white/10 flex items-center gap-2.5 transition text-xs font-bold"
                                >
                                    <div className="w-7 h-7 rounded-lg bg-slate-800 text-amber-400 flex items-center justify-center shrink-0">
                                        <i className="fa-solid fa-pen-nib text-xs"></i>
                                    </div>
                                    <span>تعديل ورسم على الصورة</span>
                                </button>
                            )}

                            {/* Reset Zoom (for Images & PDFs when zoomed) */}
                            {(isImage || isPdf) && scale !== 1 && (
                                <button
                                    onClick={() => {
                                        setScale(1);
                                        setPosition({ x: 0, y: 0 });
                                        setShowActionsMenu(false);
                                    }}
                                    className="w-full px-3 py-2 rounded-xl hover:bg-white/10 flex items-center gap-2.5 transition text-xs font-bold"
                                >
                                    <div className="w-7 h-7 rounded-lg bg-slate-800 text-teal-400 flex items-center justify-center shrink-0">
                                        <i className="fa-solid fa-compress text-xs"></i>
                                    </div>
                                    <span>إعادة ضبط التكبير (100%)</span>
                                </button>
                            )}

                            {/* Open in External Window / Drive */}
                            {(currentItem.webViewLink || isOffice) && (
                                <a
                                    href={currentItem.webViewLink || embedUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={() => setShowActionsMenu(false)}
                                    className="w-full px-3 py-2 rounded-xl hover:bg-white/10 flex items-center gap-2.5 transition text-xs font-bold text-white"
                                >
                                    <div className="w-7 h-7 rounded-lg bg-slate-800 text-blue-400 flex items-center justify-center shrink-0">
                                        <i className="fa-solid fa-arrow-up-right-from-square text-xs"></i>
                                    </div>
                                    <span>فتح في نافذة جديدة</span>
                                </a>
                            )}
                        </div>
                    </>
                )}
            </div>
          </div>
      )}
      <div className="flex-1 w-full h-full bg-slate-900 relative flex flex-col items-center justify-center overflow-hidden">{renderContent()}</div>
      
      {/* Analysis Modal - UPDATED FOR FULL WIDTH */}
      {isAnalysisOpen && (
            <div className="fixed inset-0 z-[150] bg-white flex flex-col animate-scale-in">
                <div className="bg-slate-900 p-4 text-white flex justify-between items-center shadow-lg shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center shadow-sm border border-indigo-400"><i className="fa-solid fa-clipboard-check text-xl"></i></div>
                        <div>
                            <h3 className="font-bold text-lg">{isAudio ? 'تفريغ وتحليل التسجيل الصوتي' : 'تقرير المكتب الفني وضبط الجودة'}</h3>
                            <p className="text-[10px] text-slate-300 opacity-90">{isAudio ? 'تحويل الصوت إلى نص وصياغة تقرير' : `تحليل فني ${isPdf ? 'للمستند' : 'للصورة'} بواسطة الذكاء الاصطناعي`}</p>
                        </div>
                    </div>
                    <button onClick={() => setIsAnalysisOpen(false)} className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center transition"><i className="fa-solid fa-times"></i></button>
                </div>
                <div className="flex-1 overflow-y-auto bg-white p-0">
                    {analyzing ? ( 
                        <div className="flex flex-col items-center justify-center h-full text-slate-500">
                            <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                            <h3 className="text-xl font-bold mb-2">جاري {isAudio ? 'تفريغ وتحليل الصوت...' : 'إعداد التقرير الفني...'}</h3>
                            <p className="text-sm">{isAudio ? 'قد تستغرق العملية بضع لحظات حسب مدة التسجيل' : `يتم تحليل ${isPdf ? 'بنود وشروط المستند' : 'العناصر الإنشائية والجودة'}`}</p>
                        </div> 
                    ) : ( 
                        <div className="w-full min-h-full bg-white p-1 sm:p-2">
                            <div 
                                className="report-body w-full text-slate-900 leading-relaxed" 
                                dangerouslySetInnerHTML={{ 
                                    __html: (() => {
                                        if (!analysisResult) return '';
                                        let html = analysisResult;
                                        try {
                                            const parser = new DOMParser();
                                            const doc = parser.parseFromString(html, 'text/html');
                                            const tables = doc.querySelectorAll('table');
                                            tables.forEach((table) => {
                                                const parent = table.parentElement;
                                                if (parent && !parent.classList.contains('table-responsive-wrapper')) {
                                                    const wrapper = doc.createElement('div');
                                                    wrapper.className = 'table-responsive-wrapper';
                                                    parent.insertBefore(wrapper, table);
                                                    wrapper.appendChild(table);
                                                }
                                            });
                                            return doc.body.innerHTML;
                                        } catch (e) {
                                            return html.replace(/(<table[\s\S]*?<\/table>)/gi, '<div class="table-responsive-wrapper">$1</div>');
                                        }
                                    })()
                                }}
                            ></div>
                        </div> 
                    )}
                </div>
                {!analyzing && ( 
                    <div className="bg-white p-2.5 sm:p-3 border-t border-slate-200 flex flex-wrap items-center justify-center gap-2 shrink-0 shadow-upper w-full max-w-full overflow-hidden no-print">
                        <button onClick={handleEditAnalysis} className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-3.5 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-100 transition flex items-center gap-1.5 shadow-sm">
                            <i className="fa-solid fa-pen-to-square text-xs"></i> تعديل
                        </button>
                        <button onClick={handlePrintAnalysis} className="bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-700 transition flex items-center gap-1.5 shadow-md">
                            <i className="fa-solid fa-print text-xs"></i> طباعة
                        </button>
                        <button onClick={() => setIsAnalysisOpen(false)} className="bg-slate-100 text-slate-700 px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-200 transition">
                            إغلاق
                        </button>
                    </div> 
                )}
            </div>
      )}
    </div>
  );
};

export default FileViewer;
