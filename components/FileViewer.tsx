
// @ts-nocheck
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom'; 
import { FileItem, Project } from '../types';
import { aiHelper } from '../services/aiHelper';
import { api } from '../services/api';
import { dbService } from '../services/db';
import { thumbnailSync } from '../services/thumbnailSync';
import { autoSync } from '../services/backgroundSync';
import { printService } from '../services/printService';
import {
    exportPhotoNoteToPdf,
    exportPhotoNoteToExcel,
    exportPhotoNoteToWord,
    SitePhotoInspectionData
} from '../services/photoReportExport';
import * as pdfjsLib from 'pdfjs-dist';
import ImageEditor from './ImageEditor';
import DwgViewer from './DwgViewer';
import InteractiveReportViewer from './InteractiveReportViewer';

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
  project?: Project | null;
  onItemUpdated?: (item: FileItem) => void;
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

const FileViewer: React.FC<FileViewerProps> = ({ item, siblings = [], project, onItemUpdated, onClose }) => {
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(() => {
      const idx = siblings.findIndex(f => f.id === item.id);
      return idx >= 0 ? idx : 0;
  });
  
  const currentItem = siblings.length > 0 ? siblings[currentIndex] : item;

  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [isAnalysisOpen, setIsAnalysisOpen] = useState(false);
  const [isAnalysisMenuOpen, setIsAnalysisMenuOpen] = useState(false);
  const [isDirectEditingAnalysis, setIsDirectEditingAnalysis] = useState(false);

  // Visual Inspection & Photo Note Persistence / Export States
  const loadCachedInspection = (fileId: string): SitePhotoInspectionData | null => {
      if (!fileId) return null;
      try {
          const raw = localStorage.getItem(`me_visual_inspection_v1_${fileId}`);
          if (!raw) return null;
          const parsed = JSON.parse(raw);
          return parsed && typeof parsed === 'object' && parsed.detectedWork ? parsed : null;
      } catch {
          return null;
      }
  };

  const saveCachedInspection = (fileId: string, data: SitePhotoInspectionData) => {
      if (!fileId || !data) return;
      try {
          localStorage.setItem(`me_visual_inspection_v1_${fileId}`, JSON.stringify(data));
      } catch {}
  };

  const [savedNotesById, setSavedNotesById] = useState<Record<string, string>>({});
  const [savedInspectionsById, setSavedInspectionsById] = useState<Record<string, SitePhotoInspectionData>>({});
  const [isVisualModalOpen, setIsVisualModalOpen] = useState(false);
  const [visualModalMode, setVisualModalMode] = useState<'inspect' | 'notes'>('inspect');
  const [isInspectingPhoto, setIsInspectingPhoto] = useState(false);
  const [inspectionError, setInspectionError] = useState<string | null>(null);
  const [inspectionResult, setInspectionResult] = useState<SitePhotoInspectionData | null>(() => loadCachedInspection(currentItem.id));
  const [photoNoteDraft, setPhotoNoteDraft] = useState<string>(currentItem.description || '');
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [noteSavedSuccess, setNoteSavedSuccess] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<'pdf' | 'excel' | 'word' | null>(null);
  
  const isMediaImageItem = (f: Partial<FileItem>) => {
      const m = (f.mimeType || '').toLowerCase();
      const n = (f.name || '').toLowerCase();
      return m.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(n);
  };

  const isMediaVideoItem = (f: Partial<FileItem>) => {
      const m = (f.mimeType || '').toLowerCase();
      const n = (f.name || '').toLowerCase();
      return m.startsWith('video/') || /\.(mp4|mov|avi|webm|mkv|3gp)$/i.test(n);
  };

  const getSyncThumbFallback = (f: Partial<FileItem>): string | null => {
      const cached = thumbnailSync.getSyncCachedThumb(f);
      if (cached) return cached;
      if (f.previewUrl) return f.previewUrl;
      if (f.thumbnailLink) return f.thumbnailLink;
      return null;
  };

  const ensureTypedMediaBlob = (rawBlob: Blob, f: Partial<FileItem>): Blob => {
      const fMime = (f.mimeType || '').toLowerCase();
      const fName = (f.name || '').toLowerCase();
      if (rawBlob.type && (rawBlob.type.startsWith('video/') || rawBlob.type.startsWith('audio/'))) {
          return rawBlob;
      }
      let inferredType = fMime.startsWith('audio/') ? 'audio/mp3' : 'video/mp4';
      if (fMime.startsWith('video/') || fMime.startsWith('audio/')) inferredType = fMime;
      else if (fName.endsWith('.webm')) inferredType = 'video/webm';
      else if (fName.endsWith('.mov')) inferredType = 'video/quicktime';
      return new Blob([rawBlob], { type: inferredType });
  };

  const getInstantSyncMediaState = (f: FileItem): { url: string | null; highRes: boolean } => {
      const img = isMediaImageItem(f);
      const vid = isMediaVideoItem(f);
      const memBlob = api.getCachedBlobSync(f.id);
      if (memBlob && memBlob.size > 0) {
          if (vid) {
              const typed = ensureTypedMediaBlob(memBlob, f);
              return { url: api.getOrCreateBlobUrl(f.id, typed), highRes: true };
          }
          return { url: api.getOrCreateBlobUrl(f.id, memBlob), highRes: true };
      }
      if (img) {
          const thumb = getSyncThumbFallback(f);
          if (thumb) return { url: thumb, highRes: false };
      }
      return { url: null, highRes: false };
  };

  const initialMediaState = getInstantSyncMediaState(currentItem);
  const [displayUrl, setDisplayUrl] = useState<string | null>(initialMediaState.url);
  const [isHighResLoaded, setIsHighResLoaded] = useState(initialMediaState.highRes);
  const [loadError, setLoadError] = useState(false);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);

  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [numPages, setNumPages] = useState(0);
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [pdfRenderError, setPdfRenderError] = useState(false);

  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isImgGesturing, setIsImgGesturing] = useState(false);

  // Refs for jump-free focal-point Image zoom & pan
  const imgStageRef = useRef<HTMLDivElement>(null);
  const imgTransformRef = useRef<HTMLDivElement>(null);
  const imgZoomRef = useRef({ scale: 1, x: 0, y: 0 });

  // Refs for video instant playback & smooth buffering
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isVideoBuffering, setIsVideoBuffering] = useState(false);
  const [isVideoMutedAutoplay, setIsVideoMutedAutoplay] = useState(false);
  const triedDirectStreamRef = useRef(false);
  const videoCachedStartedRef = useRef(false);

  // Refs for jump-free focal-point PDF zoom & native momentum scroll
  const pdfViewportRef = useRef<HTMLDivElement>(null);
  const pdfSizerRef = useRef<HTMLDivElement>(null);
  const pdfPagesWrapperRef = useRef<HTMLDivElement>(null);
  const pdfScaleRef = useRef(1);
  const [pdfBaseWidth, setPdfBaseWidth] = useState(0);
  const pdfBaseWidthRef = useRef(0);
  const [pdfContentHeight, setPdfContentHeight] = useState(0);
  const pdfContentHeightRef = useRef(0);

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

  const isImage = mime.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(name); 
  const isVideo = mime.startsWith('video/') || name.endsWith('.mp4') || name.endsWith('.mov') || name.endsWith('.avi') || name.endsWith('.webm') || name.endsWith('.mkv') || name.endsWith('.3gp');
  const isAudio = mime.startsWith('audio/') || name.endsWith('.mp3') || name.endsWith('.wav') || name.endsWith('.m4a') || name.endsWith('.ogg');
  const isPdf = mime.includes('pdf');
  const isDwg = name.endsWith('.dwg') || name.endsWith('.dxf') || mime.includes('acad') || mime.includes('dwg') || mime.includes('dxf'); 
  
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
      imgZoomRef.current = { scale: 1, x: 0, y: 0 };
      pdfScaleRef.current = 1;
      pdfContentHeightRef.current = 0;
      setPdfContentHeight(0);
      setIsImgGesturing(false);
      setAnalysisResult(null);
      setIsAnalysisOpen(false);
      setIsVisualModalOpen(false);
      setIsInspectingPhoto(false);
      setInspectionError(null);
      setInspectionResult(savedInspectionsById[currentItem.id] || loadCachedInspection(currentItem.id));
      setNoteSavedSuccess(false);
      setExportingFormat(null);
      const localKnownNote = savedNotesById[currentItem.id] ?? currentItem.description ?? '';
      setPhotoNoteDraft(localKnownNote);
      setLoadError(false);
      setDownloadProgress(0);
      setPdfDoc(null);
      setTextContent(null);
      setPdfRenderError(false);
      setIsEditing(false);
      setIsSharing(false);
      setShowActionsMenu(false);
      setUseCloudVideoPlayer(false);
      setIsFallbackDownloading(false);
      setIsVideoMutedAutoplay(false);
      triedDirectStreamRef.current = false;
      videoCachedStartedRef.current = false;

      // Instant 0ms memory or preview hit for images AND videos
      const syncState = getInstantSyncMediaState(currentItem);
      setDisplayUrl(syncState.url);
      setIsHighResLoaded(syncState.highRes);
      setIsVideoBuffering(isVideo && !syncState.url);
  }, [currentItem.id, isImage, isVideo]);

  // Background pre-warming for adjacent sibling files (next / prev) for 0ms switching
  useEffect(() => {
      if (!siblings || siblings.length <= 1) return;
      if (isVideo && isVideoBuffering) return;
      const candidateIndices = [currentIndex + 1, currentIndex - 1, currentIndex + 2];
      const timer = setTimeout(() => {
          candidateIndices.forEach((idx) => {
              if (idx < 0 || idx >= siblings.length) return;
              const sib = siblings[idx];
              if (!sib || sib.type === 'folder') return;
              api.warmMediaItem(sib);
          });
      }, isVideo ? 250 : 30);
      return () => clearTimeout(timer);
  }, [currentIndex, siblings, isVideo, isVideoBuffering]);

  useEffect(() => {
    let active = true;
    if (isOffice || isDwg) {
        return; 
    }

    const load = async () => {
        if (isImage) {
            // 0. Synchronous RAM cache check (0ms)
            const memUrl = api.getBlobUrlSync(currentItem.id);
            if (memUrl) {
                if (active) {
                    setDisplayUrl(memUrl);
                    setIsHighResLoaded(true);
                }
                return;
            }

            // Show cached preview synchronously on frame 0 while upgrading cleanly
            const thumbUrl = getSyncThumbFallback(currentItem);
            if (thumbUrl && active) {
                setDisplayUrl(prev => prev || thumbUrl);
            }

            // 1. Check local IndexedDB cache first (~1-2ms)
            try {
                const cachedBlob = await dbService.getBlob(currentItem.id);
                if (cachedBlob && cachedBlob.size > 0 && active) {
                    setDisplayUrl(api.getOrCreateBlobUrl(currentItem.id, cachedBlob));
                    setIsHighResLoaded(true);
                    return;
                }
            } catch (e) {}

            // 2. Decode high-res Drive preview offscreen before swapping (zero flicker)
            let hiResUrl = currentItem.previewUrl || currentItem.thumbnailLink || '';
            if (hiResUrl && hiResUrl.includes('googleusercontent.com')) {
                hiResUrl = hiResUrl.replace(/=s\d+/, '=s1600').replace(/=w\d+(-h\d+)?/i, '=s1600');
            } else if (hiResUrl && hiResUrl.includes('drive.google.com/thumbnail')) {
                hiResUrl = hiResUrl.replace(/([?&]sz=)w\d+/i, '$1w1600');
            } else if ((!hiResUrl || hiResUrl.startsWith('data:')) && currentItem.id && !currentItem.id.startsWith('temp_') && !currentItem.id.startsWith('file_')) {
                hiResUrl = `https://drive.google.com/thumbnail?id=${currentItem.id}&sz=w1600`;
            }

            if (hiResUrl && hiResUrl !== thumbUrl && navigator.onLine) {
                const offscreen = new Image();
                offscreen.referrerPolicy = 'no-referrer';
                offscreen.src = hiResUrl;
                offscreen.decode?.().then(() => {
                    if (active) {
                        setDisplayUrl(prev => (prev && prev.startsWith('blob:')) ? prev : hiResUrl);
                        setIsHighResLoaded(true);
                    }
                }).catch(() => {
                    offscreen.onload = () => {
                        if (active) {
                            setDisplayUrl(prev => (prev && prev.startsWith('blob:')) ? prev : hiResUrl);
                            setIsHighResLoaded(true);
                        }
                    };
                });
            }

            // 3. Silently cache full raw blob in background for offline & crisp pinch-zoom
            try {
                const hasPreview = Boolean(thumbUrl || hiResUrl);
                const blob = await api.downloadFileBlob(currentItem.id, (p) => { if (active && !hasPreview) setDownloadProgress(p); }, hasPreview);
                if (active && blob && blob.size > 0) {
                    const blobUrl = api.getOrCreateBlobUrl(currentItem.id, blob);
                    const applyBlob = () => {
                        if (active) {
                            setDisplayUrl(blobUrl);
                            setIsHighResLoaded(true);
                        }
                    };
                    const preloader = new Image();
                    preloader.src = blobUrl;
                    if (typeof preloader.decode === 'function') {
                        preloader.decode().then(applyBlob).catch(applyBlob);
                    } else {
                        preloader.onload = applyBlob;
                        preloader.onerror = applyBlob;
                    }
                }
            } catch (e) {
                if (!thumbUrl && !hiResUrl && active) setLoadError(true);
            }
        } 
        else if (isPdf) {
            const hasHotPdf = !!api.getCachedBlobSync(currentItem.id);
            if (!hasHotPdf) setIsPdfLoading(true);
            try {
                const blob = await api.downloadFileBlob(currentItem.id, (p) => { if(active) setDownloadProgress(p) }, hasHotPdf);
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
             // 0. Check RAM cache first (0ms)
             const memMediaBlob = api.getCachedBlobSync(currentItem.id);
             if (memMediaBlob && memMediaBlob.size > 0 && active) {
                 const typedBlob = ensureTypedMediaBlob(memMediaBlob, currentItem);
                 setDisplayUrl(api.getOrCreateBlobUrl(currentItem.id, typedBlob));
                 setIsVideoBuffering(false);
                 return;
             }

             // 1. Check local IndexedDB blob (~1ms for locally recorded or pre-cached media)
             try {
                 const localBlob = await dbService.getBlob(currentItem.id);
                 if (localBlob && localBlob.size > 0 && active) {
                     const typedBlob = ensureTypedMediaBlob(localBlob, currentItem);
                     setDisplayUrl(api.getOrCreateBlobUrl(currentItem.id, typedBlob));
                     setIsVideoBuffering(false);
                     return;
                 }
             } catch (e) {}

             // 2. Stream via high-speed HTTP Range Proxy (or direct Drive URL) with zero bandwidth contention
             const streamUrl = api.getVideoStreamUrl(currentItem.id, currentItem.webContentLink);
             if (streamUrl && active) {
                 if (isVideo) {
                     autoSync.setActiveStreamingFile(currentItem.id);
                     setIsVideoBuffering(true);
                 }
                 setDisplayUrl(streamUrl);
             } else {
                 try {
                     const blob = await api.downloadFileBlob(currentItem.id, (p) => { if (active) setDownloadProgress(p); });
                     if (active && blob) {
                         setDisplayUrl(api.getOrCreateBlobUrl(currentItem.id, ensureTypedMediaBlob(blob, currentItem)));
                         setIsVideoBuffering(false);
                     }
                 } catch (e) {
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
    return () => {
        active = false;
        autoSync.setActiveStreamingFile(null);
    };
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
          printService.printReport(analysisResult, `تقرير فني - ${currentItem.name}`, undefined, { showHeader: false, showFooter: false });
      }
  };

  const handleEditAnalysis = () => {
      if (!analysisResult) return;
      navigate(`/editor/${currentItem.parentId}/${currentItem.parentId}`, {
          state: { initialContent: analysisResult }
      });
  };

  // Sync saved file note from metadata if not yet hydrated on currentItem
  useEffect(() => {
      if (!isImage) return;
      let cancelled = false;
      const existingNote = savedNotesById[currentItem.id] ?? currentItem.description;
      if (existingNote !== undefined) {
          setPhotoNoteDraft(existingNote);
      }
      if (currentItem.description === undefined && savedNotesById[currentItem.id] === undefined) {
          api.getFileMetadata(currentItem.id).then((meta) => {
              if (!cancelled && meta?.description !== undefined) {
                  setSavedNotesById(prev => ({ ...prev, [currentItem.id]: meta.description || '' }));
                  setPhotoNoteDraft(meta.description || '');
              }
          }).catch(() => {});
      }
      return () => { cancelled = true; };
  }, [currentItem.id, isImage]);

  const resolveActiveProject = (): Project | null => {
      if (project) return project;
      const cached = api.getCachedProjects() || [];
      if (currentItem.projectName) {
          const byName = cached.find(p => p.name === currentItem.projectName);
          if (byName) return byName;
      }
      return cached.find(p => p.id === currentItem.parentId || p.driveFolderId === currentItem.parentId) || null;
  };

  const resolveImageSource = async (): Promise<Blob | string> => {
      const memBlob = api.getCachedBlobSync(currentItem.id);
      if (memBlob && memBlob.size > 0) return memBlob;
      try {
          const cachedIdb = await dbService.getBlob(currentItem.id);
          if (cachedIdb && cachedIdb.size > 0) return cachedIdb;
      } catch {}
      if (displayUrl && (displayUrl.startsWith('data:') || displayUrl.startsWith('blob:'))) {
          return displayUrl;
      }
      try {
          const downloaded = await api.downloadFileBlob(currentItem.id);
          if (downloaded && downloaded.size > 0) return downloaded;
      } catch {}
      if (displayUrl) return displayUrl;
      throw new Error('تعذر الوصول لبيانات الصورة.');
  };

  const resolveFastImageForAi = async (): Promise<Blob | string> => {
      // 1. Instant 0ms memory blob
      const memBlob = api.getCachedBlobSync(currentItem.id);
      if (memBlob && memBlob.size > 0) return memBlob;

      // 2. Instant ~1ms IndexedDB blob
      try {
          const cachedIdb = await dbService.getBlob(currentItem.id);
          if (cachedIdb && cachedIdb.size > 0) return cachedIdb;
      } catch {}

      // 3. Local data: or blob: URL already in displayUrl
      if (displayUrl && (displayUrl.startsWith('data:') || displayUrl.startsWith('blob:'))) {
          return displayUrl;
      }

      // 4. Cached thumbnail data URL from thumbnailSync
      const syncThumb = getSyncThumbFallback(currentItem);
      if (syncThumb && syncThumb.startsWith('data:')) {
          return syncThumb;
      }

      // 5. Fallback to full resolve
      return await resolveImageSource();
  };

  const handleVisualInspect = async (forceReinspect = false) => {
      if (!isImage) return;
      setVisualModalMode('inspect');
      setIsVisualModalOpen(true);
      setInspectionError(null);
      setNoteSavedSuccess(false);

      const currentSavedNote = savedNotesById[currentItem.id] ?? currentItem.description ?? '';
      if (!photoNoteDraft && currentSavedNote) {
          setPhotoNoteDraft(currentSavedNote);
      }

      const existingCached = savedInspectionsById[currentItem.id] || loadCachedInspection(currentItem.id);
      if (!forceReinspect && existingCached) {
          setInspectionResult(existingCached);
          if (!photoNoteDraft.trim() && !currentSavedNote.trim() && existingCached.conciseNote) {
              setPhotoNoteDraft(existingCached.conciseNote);
          }
          return;
      }

      setIsInspectingPhoto(true);
      try {
          const imgSource = await resolveFastImageForAi();
          const proj = resolveActiveProject();
          const res = await aiHelper.inspectSitePhoto(
              imgSource,
              proj?.boqItems || [],
              proj?.name || currentItem.projectName || ''
          );
          setInspectionResult(res);
          setSavedInspectionsById(prev => ({ ...prev, [currentItem.id]: res }));
          saveCachedInspection(currentItem.id, res);
          if (!photoNoteDraft.trim() && !currentSavedNote.trim() && res.conciseNote) {
              setPhotoNoteDraft(res.conciseNote);
          } else if (forceReinspect && res.conciseNote && !currentSavedNote.trim()) {
              setPhotoNoteDraft(res.conciseNote);
          }
      } catch (err: any) {
          setInspectionError(err?.message || 'تعذر إجراء الفحص البصري للصورة.');
      } finally {
          setIsInspectingPhoto(false);
      }
  };

  const handleSavePhotoNote = async () => {
      const trimmed = photoNoteDraft.trim();
      setIsSavingNote(true);
      setNoteSavedSuccess(false);
      try {
          const updated = await api.updateFileDescription(currentItem.id, trimmed, currentItem);
          setSavedNotesById(prev => ({ ...prev, [currentItem.id]: trimmed }));
          if (onItemUpdated) {
              onItemUpdated(updated || { ...currentItem, description: trimmed });
          }
          setNoteSavedSuccess(true);
      } catch (err) {
          alert('تعذر حفظ الملاحظة على بيانات الملف.');
      } finally {
          setIsSavingNote(false);
      }
  };

  const handleExportPhotoAndNote = async (format: 'pdf' | 'excel' | 'word') => {
      setExportingFormat(format);
      try {
          const imgSource = await resolveImageSource();
          const proj = resolveActiveProject();
          const payload = {
              imageSrcOrBlob: imgSource,
              fileName: currentItem.name,
              noteText: photoNoteDraft.trim() || savedNotesById[currentItem.id] || currentItem.description || inspectionResult?.conciseNote || '',
              inspection: inspectionResult,
              projectName: proj?.name || currentItem.projectName || '',
              contractorName: proj?.contractor || '',
              dateStr: currentItem.createdTime
                  ? new Date(currentItem.createdTime).toLocaleDateString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit' })
                  : new Date().toLocaleDateString('ar-EG')
          };
          if (format === 'pdf') await exportPhotoNoteToPdf(payload);
          else if (format === 'excel') await exportPhotoNoteToExcel(payload);
          else await exportPhotoNoteToWord(payload);
      } catch (err: any) {
          console.error('Export photo note failed:', err);
          alert(err?.message || 'تعذر تصدير الصورة والملاحظة. يرجى المحاولة مرة أخرى.');
      } finally {
          setExportingFormat(null);
      }
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
  const navCallbacksRef = useRef({ handleNext, handlePrev });
  navCallbacksRef.current = { handleNext, handlePrev };

  // --- Focal-Point Helpers for Image Zoom ---
  const clampImagePos = (s: number, x: number, y: number, rect: DOMRect) => {
      if (s <= 1) return { x: 0, y: 0 };
      const minX = rect.width * (1 - s);
      const minY = rect.height * (1 - s);
      return {
          x: Math.min(0, Math.max(minX, x)),
          y: Math.min(0, Math.max(minY, y)),
      };
  };

  const applyImageTransform = (s: number, x: number, y: number) => {
      imgZoomRef.current = { scale: s, x, y };
      if (imgTransformRef.current) {
          imgTransformRef.current.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${s})`;
      }
      setScale(s);
      setPosition({ x, y });
  };

  const zoomImageAtPoint = (targetScale: number, fx: number, fy: number) => {
      const stage = imgStageRef.current;
      if (!stage) return;
      const rect = stage.getBoundingClientRect();
      const prev = imgZoomRef.current;
      const nextScale = Math.min(5, Math.max(1, targetScale));
      if (nextScale === 1) {
          applyImageTransform(1, 0, 0);
          return;
      }
      const ratio = prev.scale > 0 ? nextScale / prev.scale : 1;
      const rawX = fx - (fx - prev.x) * ratio;
      const rawY = fy - (fy - prev.y) * ratio;
      const clamped = clampImagePos(nextScale, rawX, rawY, rect);
      applyImageTransform(nextScale, clamped.x, clamped.y);
  };

  // --- Focal-Point Helpers for PDF Zoom ---
  const zoomPdfAtPoint = (targetScale: number, prevMidX: number, prevMidY: number, newMidX: number, newMidY: number) => {
      const vp = pdfViewportRef.current;
      const sizer = pdfSizerRef.current;
      const wrapper = pdfPagesWrapperRef.current;
      if (!vp || !sizer || !wrapper) return;

      const oldScale = pdfScaleRef.current;
      const nextScale = Math.min(5, Math.max(1, targetScale));
      const baseW = pdfBaseWidthRef.current || vp.clientWidth;
      const contentH = pdfContentHeightRef.current || wrapper.offsetHeight;

      const contentX = (vp.scrollLeft + prevMidX) / oldScale;
      const contentY = (vp.scrollTop + prevMidY) / oldScale;

      pdfScaleRef.current = nextScale;
      wrapper.style.transform = `scale(${nextScale})`;
      if (baseW > 0) sizer.style.width = `${baseW * nextScale}px`;
      if (contentH > 0) sizer.style.height = `${contentH * nextScale}px`;

      vp.scrollLeft = Math.max(0, contentX * nextScale - newMidX);
      vp.scrollTop = Math.max(0, contentY * nextScale - newMidY);
      setScale(nextScale);
  };

  // --- Native Non-Passive Touch Listeners for Image (Exact Focal-Point Pinch & Pan) ---
  useEffect(() => {
      if (!isImage || !displayUrl) return;
      const stage = imgStageRef.current;
      if (!stage) return;

      let session: {
          mode: 'pan' | 'pinch';
          x: number;
          y: number;
          startX: number;
          startY: number;
          dist: number;
          midX: number;
          midY: number;
          wasPinch: boolean;
      } | null = null;
      let lastTapTime = 0;

      const onTouchStart = (e: TouchEvent) => {
          if (e.touches.length === 1) {
              const t = e.touches[0];
              session = {
                  mode: 'pan',
                  x: t.clientX,
                  y: t.clientY,
                  startX: t.clientX,
                  startY: t.clientY,
                  dist: 0,
                  midX: 0,
                  midY: 0,
                  wasPinch: false,
              };
              if (imgZoomRef.current.scale > 1) {
                  setIsImgGesturing(true);
              }
          } else if (e.touches.length === 2) {
              e.preventDefault();
              const rect = stage.getBoundingClientRect();
              const t0 = e.touches[0];
              const t1 = e.touches[1];
              const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
              const midX = (t0.clientX + t1.clientX) / 2 - rect.left;
              const midY = (t0.clientY + t1.clientY) / 2 - rect.top;
              session = {
                  mode: 'pinch',
                  x: 0,
                  y: 0,
                  startX: 0,
                  startY: 0,
                  dist,
                  midX,
                  midY,
                  wasPinch: true,
              };
              setIsImgGesturing(true);
          }
      };

      const onTouchMove = (e: TouchEvent) => {
          if (e.touches.length === 2) {
              e.preventDefault();
              const rect = stage.getBoundingClientRect();
              const t0 = e.touches[0];
              const t1 = e.touches[1];
              const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
              const midX = (t0.clientX + t1.clientX) / 2 - rect.left;
              const midY = (t0.clientY + t1.clientY) / 2 - rect.top;

              if (!session || session.mode !== 'pinch') {
                  session = { mode: 'pinch', x: 0, y: 0, startX: 0, startY: 0, dist, midX, midY, wasPinch: true };
                  setIsImgGesturing(true);
                  return;
              }

              const prev = imgZoomRef.current;
              const rawScale = session.dist > 0 ? prev.scale * (dist / session.dist) : prev.scale;
              const nextScale = Math.min(5, Math.max(1, rawScale));
              const ratio = prev.scale > 0 ? nextScale / prev.scale : 1;

              const rawX = midX - (session.midX - prev.x) * ratio;
              const rawY = midY - (session.midY - prev.y) * ratio;
              const clamped = clampImagePos(nextScale, rawX, rawY, rect);

              applyImageTransform(nextScale, clamped.x, clamped.y);
              session.dist = dist;
              session.midX = midX;
              session.midY = midY;
              session.wasPinch = true;
          } else if (e.touches.length === 1 && imgZoomRef.current.scale > 1) {
              e.preventDefault();
              const t = e.touches[0];
              if (!session || session.mode !== 'pan') {
                  session = {
                      mode: 'pan',
                      x: t.clientX,
                      y: t.clientY,
                      startX: t.clientX,
                      startY: t.clientY,
                      dist: 0,
                      midX: 0,
                      midY: 0,
                      wasPinch: session?.wasPinch ?? false,
                  };
                  setIsImgGesturing(true);
                  return;
              }
              const dx = t.clientX - session.x;
              const dy = t.clientY - session.y;
              const rect = stage.getBoundingClientRect();
              const prev = imgZoomRef.current;
              const clamped = clampImagePos(prev.scale, prev.x + dx, prev.y + dy, rect);
              applyImageTransform(prev.scale, clamped.x, clamped.y);
              session.x = t.clientX;
              session.y = t.clientY;
          }
      };

      const onTouchEnd = (e: TouchEvent) => {
          if (e.touches.length === 1) {
              const t = e.touches[0];
              session = {
                  mode: 'pan',
                  x: t.clientX,
                  y: t.clientY,
                  startX: t.clientX,
                  startY: t.clientY,
                  dist: 0,
                  midX: 0,
                  midY: 0,
                  wasPinch: true,
              };
              setIsImgGesturing(imgZoomRef.current.scale > 1);
              return;
          }

          if (e.touches.length === 0) {
              setIsImgGesturing(false);
              if (session && !session.wasPinch && e.changedTouches.length > 0) {
                  const t = e.changedTouches[0];
                  const dx = t.clientX - session.startX;
                  const dy = t.clientY - session.startY;

                  if (imgZoomRef.current.scale === 1 && Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.4) {
                      if (dx > 0) navCallbacksRef.current.handleNext();
                      else navCallbacksRef.current.handlePrev();
                  } else if (Math.hypot(dx, dy) < 12) {
                      const now = Date.now();
                      if (now - lastTapTime < 280) {
                          lastTapTime = 0;
                          const rect = stage.getBoundingClientRect();
                          const fx = t.clientX - rect.left;
                          const fy = t.clientY - rect.top;
                          zoomImageAtPoint(imgZoomRef.current.scale > 1 ? 1 : 2.5, fx, fy);
                      } else {
                          lastTapTime = now;
                      }
                  }
              }
              session = null;
          }
      };

      stage.addEventListener('touchstart', onTouchStart, { passive: false });
      stage.addEventListener('touchmove', onTouchMove, { passive: false });
      stage.addEventListener('touchend', onTouchEnd, { passive: false });
      stage.addEventListener('touchcancel', onTouchEnd, { passive: false });

      return () => {
          stage.removeEventListener('touchstart', onTouchStart);
          stage.removeEventListener('touchmove', onTouchMove);
          stage.removeEventListener('touchend', onTouchEnd);
          stage.removeEventListener('touchcancel', onTouchEnd);
      };
  }, [isImage, displayUrl]);

  // --- Native Non-Passive Touch & Resize Listeners for PDF (Exact Focal-Point Pinch without Scroll Reset) ---
  useEffect(() => {
      if (!isPdf || pdfRenderError) return;
      const vp = pdfViewportRef.current;
      const wrapper = pdfPagesWrapperRef.current;
      if (!vp || !wrapper) return;

      const updateBaseWidth = () => {
          const w = vp.clientWidth;
          if (w > 0 && pdfScaleRef.current === 1) {
              pdfBaseWidthRef.current = w;
              setPdfBaseWidth(w);
          } else if (w > 0 && pdfBaseWidthRef.current === 0) {
              pdfBaseWidthRef.current = w;
              setPdfBaseWidth(w);
          }
      };
      updateBaseWidth();

      const vpObserver = new ResizeObserver(updateBaseWidth);
      vpObserver.observe(vp);

      const contentObserver = new ResizeObserver(() => {
          const h = wrapper.offsetHeight;
          if (h > 0) {
              pdfContentHeightRef.current = h;
              setPdfContentHeight(h);
              if (pdfSizerRef.current) {
                  pdfSizerRef.current.style.height = `${h * pdfScaleRef.current}px`;
              }
          }
      });
      contentObserver.observe(wrapper);

      let pinch: { dist: number; midX: number; midY: number } | null = null;
      let singleStart: { x: number; y: number; wasPinch: boolean } | null = null;
      let lastTapTime = 0;

      const onTouchStart = (e: TouchEvent) => {
          if (e.touches.length === 1) {
              singleStart = { x: e.touches[0].clientX, y: e.touches[0].clientY, wasPinch: false };
          } else if (e.touches.length === 2) {
              e.preventDefault();
              if (singleStart) singleStart.wasPinch = true;
              const rect = vp.getBoundingClientRect();
              const t0 = e.touches[0];
              const t1 = e.touches[1];
              pinch = {
                  dist: Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY),
                  midX: (t0.clientX + t1.clientX) / 2 - rect.left,
                  midY: (t0.clientY + t1.clientY) / 2 - rect.top,
              };
          }
      };

      const onTouchMove = (e: TouchEvent) => {
          if (e.touches.length === 2) {
              e.preventDefault();
              const rect = vp.getBoundingClientRect();
              const t0 = e.touches[0];
              const t1 = e.touches[1];
              const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
              const midX = (t0.clientX + t1.clientX) / 2 - rect.left;
              const midY = (t0.clientY + t1.clientY) / 2 - rect.top;

              if (!pinch) {
                  pinch = { dist, midX, midY };
                  return;
              }
              const rawScale = pinch.dist > 0 ? pdfScaleRef.current * (dist / pinch.dist) : pdfScaleRef.current;
              zoomPdfAtPoint(rawScale, pinch.midX, pinch.midY, midX, midY);
              pinch = { dist, midX, midY };
          }
      };

      const onTouchEnd = (e: TouchEvent) => {
          if (e.touches.length < 2) {
              pinch = null;
          }
          if (e.touches.length === 0) {
              if (singleStart && !singleStart.wasPinch && e.changedTouches.length > 0) {
                  const t = e.changedTouches[0];
                  if (Math.hypot(t.clientX - singleStart.x, t.clientY - singleStart.y) < 12) {
                      const now = Date.now();
                      if (now - lastTapTime < 280) {
                          lastTapTime = 0;
                          const rect = vp.getBoundingClientRect();
                          const fx = t.clientX - rect.left;
                          const fy = t.clientY - rect.top;
                          zoomPdfAtPoint(pdfScaleRef.current > 1 ? 1 : 2.5, fx, fy, fx, fy);
                      } else {
                          lastTapTime = now;
                      }
                  }
              }
              singleStart = null;
          }
      };

      vp.addEventListener('touchstart', onTouchStart, { passive: false });
      vp.addEventListener('touchmove', onTouchMove, { passive: false });
      vp.addEventListener('touchend', onTouchEnd, { passive: false });
      vp.addEventListener('touchcancel', onTouchEnd, { passive: false });

      return () => {
          vpObserver.disconnect();
          contentObserver.disconnect();
          vp.removeEventListener('touchstart', onTouchStart);
          vp.removeEventListener('touchmove', onTouchMove);
          vp.removeEventListener('touchend', onTouchEnd);
          vp.removeEventListener('touchcancel', onTouchEnd);
      };
  }, [isPdf, pdfRenderError, pdfDoc, numPages]);

  const handleImageDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
      const stage = imgStageRef.current;
      if (!stage) return;
      const rect = stage.getBoundingClientRect();
      zoomImageAtPoint(imgZoomRef.current.scale > 1 ? 1 : 2.5, e.clientX - rect.left, e.clientY - rect.top);
  };

  const handlePdfDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
      const vp = pdfViewportRef.current;
      if (!vp) return;
      const rect = vp.getBoundingClientRect();
      const fx = e.clientX - rect.left;
      const fy = e.clientY - rect.top;
      zoomPdfAtPoint(pdfScaleRef.current > 1 ? 1 : 2.5, fx, fy, fx, fy);
  };

  const renderContent = () => {
      // ... (Keep existing Render Content logic from original FileViewer.tsx, including DWG, PDF, Image etc.) ...
      if (loadError) return <div className="flex flex-col items-center justify-center text-white z-10 h-full p-6 text-center"><i className="fa-solid fa-triangle-exclamation text-yellow-500 text-5xl mb-4"></i><p className="font-bold mb-2 text-lg">تعذر عرض الملف</p>{currentItem.webViewLink && <a href={currentItem.webViewLink} target="_blank" rel="noreferrer" className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-500 mt-4">فتح في Drive</a>}</div>;
      if (isDwg) return <DwgViewer item={currentItem} onClose={onClose} />;
      
      // Updated PDF Viewer with True Focal-Point Pinch-to-Zoom & Preserved Scroll Position
      if (isPdf && !pdfRenderError) return (
        <div
            ref={pdfViewportRef}
            dir="ltr"
            className="w-full h-full relative bg-slate-800 overflow-auto custom-scrollbar"
            style={{ touchAction: 'pan-x pan-y', WebkitOverflowScrolling: 'touch' }}
            onDoubleClick={handlePdfDoubleClick}
        >
            <div
                ref={pdfSizerRef}
                style={{
                    width: pdfBaseWidth ? `${pdfBaseWidth * scale}px` : '100%',
                    height: pdfContentHeight ? `${pdfContentHeight * scale}px` : 'auto',
                    position: 'relative',
                }}
            >
                <div
                    ref={pdfPagesWrapperRef}
                    dir="rtl"
                    className="flex flex-col items-stretch pt-0 pb-16 will-change-transform"
                    style={{
                        width: pdfBaseWidth ? `${pdfBaseWidth}px` : '100%',
                        transformOrigin: '0 0',
                        transform: `scale(${scale})`,
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
        </div>
      );
      
      // Updated Image Viewer with True Focal-Point Pinch-to-Zoom & Pan
      if (isImage) return (
        <div
            ref={imgStageRef}
            dir="ltr"
            className="w-full h-full overflow-hidden p-0 relative touch-none select-none"
            onDoubleClick={handleImageDoubleClick}
        >
            {!displayUrl && (
                <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
                    <div className="relative w-16 h-16 flex items-center justify-center">
                        <div className="absolute inset-0 border-4 border-blue-500/30 rounded-full"></div>
                        <div className="absolute inset-0 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-xs font-bold text-white relative z-10">{downloadProgress}%</span>
                    </div>
                </div>
            )}
            {displayUrl && (
                <div
                    ref={imgTransformRef}
                    className={`w-full h-full flex items-center justify-center will-change-transform ${isImgGesturing ? '' : 'transition-transform duration-150 ease-out'}`}
                    style={{
                        transformOrigin: '0 0',
                        transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${scale})`,
                    }}
                >
                    <img
                        src={displayUrl}
                        alt={currentItem.name}
                        decoding="async"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-contain z-10 block"
                        style={{ objectPosition: 'center center' }}
                        draggable={false}
                    />
                </div>
            )}
            {siblings.length > 1 && scale === 1 && (
                <>
                    {currentIndex > 0 && <button onClick={(e) => { e.stopPropagation(); handlePrev(); }} className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 bg-black/40 hover:bg-black/60 text-white rounded-full flex items-center justify-center backdrop-blur-sm z-30 transition hover:scale-110"><i className="fa-solid fa-chevron-left text-lg sm:text-2xl"></i></button>}
                    {currentIndex < siblings.length - 1 && <button onClick={(e) => { e.stopPropagation(); handleNext(); }} className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 bg-black/40 hover:bg-black/60 text-white rounded-full flex items-center justify-center backdrop-blur-sm z-30 transition hover:scale-110"><i className="fa-solid fa-chevron-right text-lg sm:text-2xl"></i></button>}
                </>
            )}
        </div>
      );
      
      // FIX: Instant video playback with RAM/IndexedDB 0ms hit, HTTP Range stream proxy & automatic fallbacks
      if (isVideo) {
          const videoPoster = getSyncThumbFallback(currentItem) || undefined;

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
                      <>
                          <video 
                              ref={videoRef}
                              key={displayUrl}
                              controls 
                              autoPlay 
                              playsInline 
                              webkit-playsinline="true"
                              preload="auto" 
                              poster={videoPoster}
                              className="max-w-full max-h-full w-full h-full shadow-2xl m-auto block object-contain" 
                              src={displayUrl}
                              onLoadedData={(e) => {
                                  setIsVideoBuffering(false);
                                  autoSync.setActiveStreamingFile(null);
                                  const vid = e.currentTarget;
                                  if (vid.paused) {
                                      vid.play().catch(() => {
                                          // Mobile/desktop autoplay policy may block unmuted playback; start muted instantly + show unmute tap button
                                          vid.muted = true;
                                          setIsVideoMutedAutoplay(true);
                                          vid.play().catch(() => {});
                                      });
                                  }
                              }}
                              onCanPlay={() => {
                                  setIsVideoBuffering(false);
                                  autoSync.setActiveStreamingFile(null);
                              }}
                              onPlaying={() => {
                                  setIsVideoBuffering(false);
                                  autoSync.setActiveStreamingFile(null);
                              }}
                              onWaiting={() => {
                                  if (displayUrl && !displayUrl.startsWith('blob:')) {
                                      setIsVideoBuffering(true);
                                  }
                              }}
                              onCanPlayThrough={() => {
                                  setIsVideoBuffering(false);
                                  autoSync.setActiveStreamingFile(null);
                                  if (!videoCachedStartedRef.current && displayUrl && !displayUrl.startsWith('blob:') && (!currentItem.size || currentItem.size <= 35 * 1024 * 1024)) {
                                      videoCachedStartedRef.current = true;
                                      api.prefetchFileBlob(currentItem.id);
                                  }
                              }}
                              onVolumeChange={(e) => {
                                  if (!e.currentTarget.muted && isVideoMutedAutoplay) {
                                      setIsVideoMutedAutoplay(false);
                                  }
                              }}
                              onError={async () => {
                                  autoSync.setActiveStreamingFile(null);
                                  // Stage 1 Fallback: If same-origin stream proxy failed, try direct Google Drive media URL
                                  if (displayUrl.startsWith('/api/drive/stream/') && !triedDirectStreamRef.current) {
                                      triedDirectStreamRef.current = true;
                                      const directUrl = api.getDirectDriveStreamUrl(currentItem.id, currentItem.webContentLink);
                                      if (directUrl) {
                                          setDisplayUrl(directUrl);
                                          return;
                                      }
                                  }
                                  // Stage 2 Fallback: If stream URL failed, download as typed local Blob
                                  if (displayUrl && !displayUrl.startsWith('blob:')) {
                                      setIsFallbackDownloading(true);
                                      try {
                                          const blob = await api.downloadFileBlob(currentItem.id, (p) => setDownloadProgress(p));
                                          if (blob && blob.size > 0) {
                                              const typedBlob = ensureTypedMediaBlob(blob, currentItem);
                                              setDisplayUrl(api.getOrCreateBlobUrl(currentItem.id, typedBlob));
                                              setIsFallbackDownloading(false);
                                              setIsVideoBuffering(false);
                                              return;
                                          }
                                      } catch (err) {}
                                      setIsFallbackDownloading(false);
                                  }
                                  // Stage 3 Fallback: Use Google Drive's universal cloud video player
                                  if (!api.isGuest() && currentItem.id && !currentItem.id.startsWith('temp_')) {
                                      setUseCloudVideoPlayer(true);
                                  } else {
                                      setLoadError(true);
                                  }
                              }}
                          />
                          {isVideoBuffering && (
                              <div className="absolute top-3 right-3 bg-black/70 backdrop-blur-md text-white px-3 py-1.5 rounded-full text-[11px] font-bold flex items-center gap-2 border border-white/15 pointer-events-none z-20">
                                  <span className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></span>
                                  <span>جاري التحميل الفوري...</span>
                              </div>
                          )}
                          {isVideoMutedAutoplay && (
                              <button
                                  type="button"
                                  onClick={() => {
                                      if (videoRef.current) {
                                          videoRef.current.muted = false;
                                          videoRef.current.volume = 1;
                                          setIsVideoMutedAutoplay(false);
                                      }
                                  }}
                                  className="absolute top-3 left-3 bg-black/75 hover:bg-black/90 text-white px-3 py-1.5 rounded-full text-[11px] font-bold flex items-center gap-1.5 border border-white/20 backdrop-blur-md shadow-lg z-30 transition active:scale-95"
                              >
                                  <i className="fa-solid fa-volume-xmark text-amber-400"></i>
                                  <span>تشغيل الصوت</span>
                              </button>
                          )}
                      </>
                  ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-black/90 z-20">
                          {videoPoster && (
                              <img src={videoPoster} alt="" className="absolute inset-0 w-full h-full object-contain opacity-45 pointer-events-none" />
                          )}
                          <div className="relative w-16 h-16 flex items-center justify-center mb-3 z-10">
                              <div className="absolute inset-0 border-4 border-white/30 rounded-full"></div>
                              <div className="absolute inset-0 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                              <span className="text-xs font-bold text-white relative z-10">{downloadProgress > 0 ? `${downloadProgress}%` : ''}</span>
                          </div>
                          <p className="font-bold text-sm z-10">جاري تشغيل الفيديو...</p>
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
    <div className="fixed inset-0 z-[2000] bg-black/95 backdrop-blur-md flex flex-col animate-fade-in safe-bottom safe-top">
      <div className={`flex justify-between items-center px-3 py-2 text-white shadow-md z-30 ${isWord ? 'bg-blue-800 border-b border-blue-600' : isExcel ? 'bg-emerald-800 border-b border-emerald-600' : isPowerPoint ? 'bg-orange-800 border-b border-orange-600' : isDwg ? 'bg-[#0f172a] border-b border-slate-700' : 'bg-slate-900'}`}>
        <div className="flex items-center gap-2 overflow-hidden min-w-0 flex-1 ml-2">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isWord ? 'bg-blue-600' : isExcel ? 'bg-emerald-600' : isPowerPoint ? 'bg-orange-600' : isImage ? 'bg-purple-600' : isVideo ? 'bg-rose-600' : isPdf ? 'bg-red-600' : isAudio ? 'bg-teal-600' : isDwg ? 'bg-[#c41e3a]' : isText ? 'bg-slate-600' : 'bg-blue-600'}`}>
                    <i className={`fa-solid ${isWord ? 'fa-file-word' : isExcel ? 'fa-file-excel' : isPowerPoint ? 'fa-file-powerpoint' : isImage ? 'fa-image' : isVideo ? 'fa-clapperboard' : isPdf ? 'fa-file-pdf' : isAudio ? 'fa-headphones' : isDwg ? 'fa-layer-group' : isText ? 'fa-file-code' : 'fa-file-lines'} text-xs`}></i>
                </div>
                <div className="min-w-0 flex flex-col justify-center">
                    <h3 className="font-bold text-xs sm:text-sm truncate max-w-[180px] sm:max-w-[320px] leading-tight" title={currentItem.name}>{currentItem.name}</h3>
                    <div className="flex items-center gap-1.5">
                        {siblings.length > 1 && <span className="text-[9px] text-slate-400 font-mono leading-tight">{currentIndex + 1} / {siblings.length}</span>}
                        {isImage && (savedNotesById[currentItem.id] ?? currentItem.description) && (
                            <span
                                role="button"
                                tabIndex={0}
                                onClick={() => handleVisualInspect(false)}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleVisualInspect(false); }}
                                className="compact-note-pill cursor-pointer bg-amber-500/20 text-amber-300 border border-amber-400/30 rounded font-bold hover:bg-amber-500/30 transition inline-flex items-center gap-1 select-none"
                                title="عرض الفحص البصري والملاحظات المحفوظة"
                            >
                                <i className="fa-solid fa-note-sticky"></i>
                                <span>ملاحظة محفوظة</span>
                            </span>
                        )}
                    </div>
                </div>
            </div>
            <div className="flex gap-1.5 shrink-0 items-center relative">
                {/* Single Small Icon-Only Button grouping all file actions */}
                <button
                    onClick={() => setShowActionsMenu(prev => !prev)}
                    className={`w-8 h-8 rounded-xl flex items-center justify-center transition text-xs border ${showActionsMenu ? 'bg-indigo-600 text-white border-indigo-400 shadow-lg' : 'bg-white/10 hover:bg-white/20 text-white border-white/10'}`}
                    title="أدوات وخيارات الملف"
                >
                    {analyzing || isInspectingPhoto || isSharing ? (
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
                        <div className="absolute left-0 top-10 w-64 bg-slate-900/95 backdrop-blur-xl border border-slate-700 rounded-2xl shadow-2xl p-2 z-[100] space-y-1.5 text-white animate-scale-in origin-top-left">
                            <div className="px-2.5 py-1 border-b border-slate-800 flex items-center justify-between">
                                <span className="text-[10px] font-bold text-slate-400">خيارات وأدوات الملف</span>
                                <i className="fa-solid fa-wand-magic-sparkles text-[10px] text-indigo-400"></i>
                            </div>

                            {/* Visual Site Analyzer Button (Images) - Single unified entry with saved inspection & re-inspect */}
                            {isImage && (
                                <button
                                    onClick={() => {
                                        setShowActionsMenu(false);
                                        handleVisualInspect(false);
                                    }}
                                    disabled={isInspectingPhoto}
                                    className="w-full px-3 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-fuchsia-600 hover:from-indigo-500 hover:to-fuchsia-500 text-white flex items-center gap-2.5 transition shadow-md border border-white/15 text-xs font-extrabold disabled:opacity-50"
                                >
                                    <div className="w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
                                        {isInspectingPhoto ? (
                                            <i className="fa-solid fa-circle-notch fa-spin text-xs text-yellow-300"></i>
                                        ) : (
                                            <i className="fa-solid fa-eye text-xs text-yellow-300"></i>
                                        )}
                                    </div>
                                    <div className="text-right flex-1 min-w-0">
                                        <div className="truncate font-extrabold flex items-center justify-between gap-1">
                                            <span>فحص بصري</span>
                                            {(savedInspectionsById[currentItem.id] || loadCachedInspection(currentItem.id)) && (
                                                <span className="text-[8.5px] bg-emerald-400/25 text-emerald-200 border border-emerald-300/30 px-1.5 py-0.5 rounded font-bold">محفوظ</span>
                                            )}
                                        </div>
                                        <div className="text-[9.5px] text-indigo-100 font-normal truncate">
                                            {(savedInspectionsById[currentItem.id] || loadCachedInspection(currentItem.id))
                                                ? 'عرض النتيجة المحفوظة أو إعادة الفحص والتصدير'
                                                : 'الجودة والسلامة وبند المقايسة والتصدير'}
                                        </div>
                                    </div>
                                </button>
                            )}

                            {/* AI Technical Analysis Button (Images, PDFs, Audio) */}
                            {(isPdf || isImage || isAudio) && (
                                <button
                                    onClick={() => {
                                        setShowActionsMenu(false);
                                        handleAnalyze();
                                    }}
                                    disabled={analyzing}
                                    className="w-full px-3 py-2 rounded-xl bg-gradient-to-r from-blue-700/80 to-indigo-700/80 hover:from-blue-600 hover:to-indigo-600 text-white flex items-center gap-2.5 transition shadow-sm border border-white/10 text-xs font-bold disabled:opacity-50"
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
                                        if (isPdf && pdfViewportRef.current) {
                                            const vp = pdfViewportRef.current;
                                            zoomPdfAtPoint(1, vp.clientWidth / 2, vp.clientHeight / 2, vp.clientWidth / 2, vp.clientHeight / 2);
                                        } else {
                                            applyImageTransform(1, 0, 0);
                                        }
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
      <div className="flex-1 min-h-0 w-full h-full bg-slate-900 relative flex flex-col items-center justify-center overflow-hidden">{renderContent()}</div>
      
      {/* Analysis Modal - UPDATED FOR FULL WIDTH */}
      {isAnalysisOpen && (
            <div className="fixed inset-0 z-[150] bg-white flex flex-col animate-scale-in">
                <div className="bg-slate-900 px-3.5 py-2.5 text-white flex justify-between items-center shadow-md shrink-0 relative border-b border-slate-800">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1 ml-2">
                        <div className="w-7 h-7 rounded-lg bg-teal-600 flex items-center justify-center shrink-0"><i className="fa-solid fa-clipboard-check text-xs text-white"></i></div>
                        <div className="min-w-0 flex-1">
                            <div className="font-bold text-[11px] sm:text-xs text-white truncate leading-tight !bg-transparent !border-0 !p-0 !m-0">{isAudio ? 'تفريغ وتحليل التسجيل الصوتي' : 'تقرير المكتب الفني وضبط الجودة'}</div>
                            <p className="text-[9.5px] sm:text-[10px] text-emerald-400 font-medium mt-0.5 truncate">{isAudio ? 'تحويل الصوت إلى نص وصياغة تقرير' : `تحليل فني ${isPdf ? 'للمستند' : 'للصورة'} بواسطة الذكاء الاصطناعي`}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 relative shrink-0">
                        {isDirectEditingAnalysis && (
                            <button
                                type="button"
                                onClick={() => setIsDirectEditingAnalysis(false)}
                                className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center transition border border-emerald-400 shadow-sm shrink-0"
                                title="إنهاء التعديل المباشر"
                            >
                                <i className="fa-solid fa-check text-sm font-bold"></i>
                            </button>
                        )}
                        {!analyzing && analysisResult && (
                            <button
                                type="button"
                                onClick={() => setIsAnalysisMenuOpen(!isAnalysisMenuOpen)}
                                className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center transition text-xs border ${
                                    isAnalysisMenuOpen
                                        ? 'bg-indigo-600 text-white border-indigo-400 shadow-lg'
                                        : isDirectEditingAnalysis
                                            ? 'bg-indigo-500/30 border-indigo-400 text-indigo-200'
                                            : 'bg-white/10 hover:bg-white/20 text-white border-white/10'
                                }`}
                                title="خيارات التقرير"
                            >
                                <i className="fa-solid fa-ellipsis-vertical text-base"></i>
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => {
                                setIsAnalysisOpen(false);
                                setIsAnalysisMenuOpen(false);
                                setIsDirectEditingAnalysis(false);
                            }}
                            className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-white/10 hover:bg-red-500/80 text-white flex items-center justify-center transition border border-white/10"
                            title="إغلاق"
                        >
                            <i className="fa-solid fa-times"></i>
                        </button>

                        {isAnalysisMenuOpen && !analyzing && analysisResult && (
                            <>
                                <div className="fixed inset-0 z-[160]" onClick={() => setIsAnalysisMenuOpen(false)}></div>
                                <div className="absolute left-0 top-11 w-60 bg-slate-900/95 backdrop-blur-xl border border-slate-700 rounded-2xl shadow-2xl p-2 z-[170] space-y-1.5 text-white animate-scale-in origin-top-left">
                                    <div className="px-2.5 py-1 border-b border-slate-800 flex items-center justify-between">
                                        <span className="text-[10px] font-bold text-slate-400">إجراءات التقرير</span>
                                        <i className="fa-solid fa-file-lines text-[10px] text-indigo-400"></i>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsAnalysisMenuOpen(false);
                                            setIsDirectEditingAnalysis(!isDirectEditingAnalysis);
                                        }}
                                        className={`w-full px-3 py-2.5 rounded-xl text-white flex items-center gap-2.5 transition text-xs font-bold text-right ${
                                            isDirectEditingAnalysis
                                                ? 'bg-emerald-600 hover:bg-emerald-500 shadow-md ring-1 ring-emerald-400'
                                                : 'bg-indigo-600 hover:bg-indigo-500 shadow-sm'
                                        }`}
                                    >
                                        <div className="w-6 h-6 rounded-lg bg-white/20 text-white flex items-center justify-center shrink-0">
                                            <i className={`fa-solid ${isDirectEditingAnalysis ? 'fa-check' : 'fa-file-pen'} text-xs`}></i>
                                        </div>
                                        <div className="flex-1 text-right">
                                            <div>{isDirectEditingAnalysis ? 'إنهاء التعديل المباشر' : 'التعديل المباشر'}</div>
                                            <div className="text-[10px] text-indigo-200 font-normal">حفظ تلقائي على التقرير</div>
                                        </div>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsAnalysisMenuOpen(false);
                                            handleEditAnalysis();
                                        }}
                                        className="w-full px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-indigo-600 text-white flex items-center gap-2.5 transition text-xs font-bold text-right"
                                    >
                                        <div className="w-6 h-6 rounded-lg bg-indigo-500/20 text-indigo-300 flex items-center justify-center shrink-0">
                                            <i className="fa-solid fa-pen-to-square text-xs"></i>
                                        </div>
                                        <span>تعديل المستند</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsAnalysisMenuOpen(false);
                                            handlePrintAnalysis();
                                        }}
                                        className="w-full px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-emerald-600 text-white flex items-center gap-2.5 transition text-xs font-bold text-right"
                                    >
                                        <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-300 flex items-center justify-center shrink-0">
                                            <i className="fa-solid fa-print text-xs"></i>
                                        </div>
                                        <span>طباعة المستند</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (window.confirm('هل أنت متأكد من حذف هذا التقرير؟')) {
                                                setIsAnalysisMenuOpen(false);
                                                setIsDirectEditingAnalysis(false);
                                                setAnalysisResult(null);
                                                setIsAnalysisOpen(false);
                                            }
                                        }}
                                        className="w-full px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-red-600 text-red-300 hover:text-white flex items-center gap-2.5 transition text-xs font-bold text-right border-t border-slate-700/60 mt-1"
                                    >
                                        <div className="w-6 h-6 rounded-lg bg-red-500/20 text-red-400 flex items-center justify-center shrink-0">
                                            <i className="fa-solid fa-trash-can text-xs"></i>
                                        </div>
                                        <span>حذف التقرير</span>
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto bg-white p-0">
                    {analyzing ? ( 
                        <div className="flex flex-col items-center justify-center h-full text-slate-500">
                            <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                            <div className="text-xl font-bold mb-2">جاري {isAudio ? 'تفريغ وتحليل الصوت...' : 'إعداد التقرير الفني...'}</div>
                            <p className="text-sm">{isAudio ? 'قد تستغرق العملية بضع لحظات حسب مدة التسجيل' : `يتم تحليل ${isPdf ? 'بنود وشروط المستند' : 'العناصر الإنشائية والجودة'}`}</p>
                        </div> 
                    ) : ( 
                        <div className="w-full min-h-full bg-slate-50 p-2 sm:p-6">
                            <div className="w-full bg-white rounded-2xl shadow border border-slate-200 p-4 sm:p-8">
                                <InteractiveReportViewer
                                    htmlContent={analysisResult || ''}
                                    showFloatingEditBar={false}
                                    isDirectEditing={isDirectEditingAnalysis}
                                    onDirectEditChange={setIsDirectEditingAnalysis}
                                    onContentChange={(updatedHtml) => setAnalysisResult(updatedHtml)}
                                />
                            </div>
                        </div> 
                    )}
                </div>
            </div>
      )}

      {/* Visual Inspection + Photo Notes Persistence & Export Modal */}
      {isVisualModalOpen && (
          <div className="fixed inset-0 z-[2100] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 animate-fade-in">
              <div className="bg-white w-full max-w-2xl max-h-[92vh] rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-scale-in text-slate-900">
                  {/* Modal Header */}
                  <div className="bg-gradient-to-l from-slate-900 via-indigo-950 to-indigo-900 text-white px-4 py-3 flex items-center justify-between shrink-0">
                      <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-9 h-9 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
                              <i className={`fa-solid ${visualModalMode === 'inspect' ? 'fa-eye text-amber-300' : 'fa-note-sticky text-amber-300'} text-sm`}></i>
                          </div>
                          <div className="min-w-0">
                              <h3 className="font-extrabold text-sm truncate">المحلل البصري وتوثيق الصورة</h3>
                              <p className="text-[10px] text-indigo-200 truncate">{currentItem.name}</p>
                          </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                          {!isInspectingPhoto && (
                              <button
                                  type="button"
                                  onClick={() => handleVisualInspect(true)}
                                  className="px-2.5 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/35 text-amber-200 text-[11px] font-extrabold flex items-center gap-1.5 transition border border-amber-400/30"
                                  title="إعادة تشغيل الفحص البصري الذكي للصورة"
                              >
                                  <i className="fa-solid fa-rotate text-amber-300 text-[10px]"></i>
                                  <span>{inspectionResult ? 'إعادة الفحص' : 'بدء الفحص'}</span>
                              </button>
                          )}
                          <button
                              type="button"
                              onClick={() => setIsVisualModalOpen(false)}
                              className="w-8 h-8 rounded-xl bg-white/10 hover:bg-red-500/80 text-white flex items-center justify-center transition"
                              title="إغلاق"
                          >
                              <i className="fa-solid fa-times text-xs"></i>
                          </button>
                      </div>
                  </div>

                  {/* Modal Body */}
                  <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 space-y-4 bg-slate-50">
                      {/* Image Thumbnail + File Metadata Summary */}
                      <div className="bg-white rounded-2xl p-3 border border-slate-200 shadow-sm flex items-center gap-3">
                          {displayUrl && (
                              <img
                                  src={displayUrl}
                                  alt={currentItem.name}
                                  className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl object-cover border border-slate-200 shrink-0 bg-slate-100"
                              />
                          )}
                          <div className="flex-1 min-w-0 space-y-1">
                              <div className="text-xs font-extrabold text-slate-800 truncate">{currentItem.name}</div>
                              <div className="text-[11px] text-slate-500 font-bold flex flex-wrap gap-2">
                                  <span><i className="fa-regular fa-calendar ml-1 text-indigo-500"></i>{new Date(currentItem.createdTime).toLocaleDateString('ar-EG')}</span>
                                  {resolveActiveProject()?.name && (
                                      <span><i className="fa-solid fa-building ml-1 text-indigo-500"></i>{resolveActiveProject()?.name}</span>
                                  )}
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5">
                                  <div className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md inline-flex items-center gap-1">
                                      <i className="fa-solid fa-database text-[9px]"></i>
                                      <span>بيانات الملف: {savedNotesById[currentItem.id] ?? currentItem.description ? 'توجد ملاحظة موثقة' : 'لم تُضف ملاحظة بعد'}</span>
                                  </div>
                                  {inspectionResult && !isInspectingPhoto && (
                                      <div className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md inline-flex items-center gap-1">
                                          <i className="fa-solid fa-circle-check text-[9px]"></i>
                                          <span>نتيجة الفحص محفوظة</span>
                                      </div>
                                  )}
                              </div>
                          </div>
                      </div>

                      {/* Inspection Loading */}
                      {isInspectingPhoto && (
                          <div className="bg-white rounded-2xl p-5 border border-indigo-100 shadow-sm flex flex-col items-center justify-center text-center gap-2">
                              <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                              <div className="text-sm font-extrabold text-slate-800">جاري الفحص البصري السريع للصورة...</div>
                              <p className="text-xs text-slate-500">رصد الأعمال وتقييم الجودة والسلامة المهنية ومطابقة بنود المقايسة</p>
                          </div>
                      )}

                      {/* Inspection Error */}
                      {inspectionError && (
                          <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-3 text-xs font-bold flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                  <i className="fa-solid fa-triangle-exclamation text-red-500"></i>
                                  <span>{inspectionError}</span>
                              </div>
                              <button
                                  type="button"
                                  onClick={() => handleVisualInspect(true)}
                                  className="px-3 py-1 bg-red-600 text-white rounded-lg text-[11px] hover:bg-red-700 transition shrink-0"
                              >
                                  إعادة المحاولة
                              </button>
                          </div>
                      )}

                      {/* Inspection Structured Cards */}
                      {!isInspectingPhoto && inspectionResult && (
                          <div className="space-y-3">
                              {/* Observed Work */}
                              <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-sm">
                                  <div className="flex items-center justify-between gap-2 mb-1.5">
                                      <span className="text-xs font-extrabold text-indigo-900 flex items-center gap-1.5">
                                          <i className="fa-solid fa-helmet-safety text-indigo-600"></i>
                                          العمل المرصود والمرحلة التنفيذية
                                      </span>
                                      <span className="text-[10px] font-bold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-md">
                                          {inspectionResult.workStage}
                                      </span>
                                  </div>
                                  <p className="text-xs text-slate-700 font-bold leading-relaxed">{inspectionResult.detectedWork}</p>
                              </div>

                              {/* Quality & HSE Grid */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-sm">
                                      <div className="flex items-center justify-between gap-2 mb-1.5">
                                          <span className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                                              <i className="fa-solid fa-award text-blue-600"></i>
                                              تقييم الجودة
                                          </span>
                                          <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md ${
                                              inspectionResult.qualityStatus === 'مطابق'
                                                  ? 'bg-emerald-100 text-emerald-800'
                                                  : inspectionResult.qualityStatus === 'يحتاج معالجة'
                                                      ? 'bg-red-100 text-red-800'
                                                      : 'bg-amber-100 text-amber-800'
                                          }`}>
                                              {inspectionResult.qualityStatus}
                                          </span>
                                      </div>
                                      <p className="text-[11px] text-slate-600 font-bold leading-relaxed">{inspectionResult.qualityAssessment}</p>
                                  </div>

                                  <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-sm">
                                      <div className="flex items-center justify-between gap-2 mb-1.5">
                                          <span className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                                              <i className="fa-solid fa-shield-halved text-emerald-600"></i>
                                              السلامة المهنية (HSE)
                                          </span>
                                          <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md ${
                                              inspectionResult.safetyStatus === 'آمن'
                                                  ? 'bg-emerald-100 text-emerald-800'
                                                  : inspectionResult.safetyStatus.includes('خطر')
                                                      ? 'bg-red-100 text-red-800'
                                                      : 'bg-amber-100 text-amber-800'
                                          }`}>
                                              {inspectionResult.safetyStatus}
                                          </span>
                                      </div>
                                      <p className="text-[11px] text-slate-600 font-bold leading-relaxed">{inspectionResult.safetyAssessment}</p>
                                  </div>
                              </div>

                              {/* Suggested BOQ & Recommendations */}
                              <div className="bg-gradient-to-l from-indigo-50 to-blue-50 rounded-2xl p-3.5 border border-indigo-200 space-y-2">
                                  <div className="flex items-center justify-between gap-2 flex-wrap">
                                      <span className="text-xs font-extrabold text-indigo-950 flex items-center gap-1.5">
                                          <i className="fa-solid fa-list-check text-indigo-600"></i>
                                          بند المقايسة المقترح
                                      </span>
                                      {inspectionResult.suggestedBoqCode && (
                                          <span className="text-[10px] font-mono font-extrabold bg-white text-indigo-700 px-2 py-0.5 rounded-md border border-indigo-200">
                                              بند {inspectionResult.suggestedBoqCode}
                                          </span>
                                      )}
                                  </div>
                                  <p className="text-xs text-indigo-900 font-bold leading-relaxed">{inspectionResult.suggestedBoqDescription}</p>
                                  {inspectionResult.recommendations && inspectionResult.recommendations.length > 0 && (
                                      <div className="pt-2 border-t border-indigo-200/70">
                                          <div className="text-[11px] font-extrabold text-slate-800 mb-1">التوصيات العملية:</div>
                                          <ul className="space-y-1 text-[11px] text-slate-700 font-bold list-disc pr-4">
                                              {inspectionResult.recommendations.map((rec, rIdx) => (
                                                  <li key={rIdx}>{rec}</li>
                                              ))}
                                          </ul>
                                      </div>
                                  )}
                              </div>
                          </div>
                      )}

                      {/* Photo Note Editor & Persistence to File Metadata */}
                      <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-sm space-y-2.5">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                              <label className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                                  <i className="fa-solid fa-pen-to-square text-amber-500"></i>
                                  ملاحظات الصورة (تُحفظ مباشرة في بيانات الملف)
                              </label>
                              {inspectionResult?.conciseNote && photoNoteDraft.trim() !== inspectionResult.conciseNote.trim() && (
                                  <button
                                      type="button"
                                      onClick={() => {
                                          setPhotoNoteDraft(inspectionResult.conciseNote || '');
                                          setNoteSavedSuccess(false);
                                      }}
                                      className="text-[10px] font-extrabold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1 rounded-lg transition flex items-center gap-1"
                                  >
                                      <i className="fa-solid fa-wand-magic-sparkles text-[9px]"></i>
                                      <span>إدراج ملخص الفحص البصري</span>
                                  </button>
                              )}
                          </div>

                          <textarea
                              value={photoNoteDraft}
                              onChange={(e) => {
                                  setPhotoNoteDraft(e.target.value);
                                  if (noteSavedSuccess) setNoteSavedSuccess(false);
                              }}
                              rows={4}
                              placeholder="اكتب ملاحظاتك الهندسية على الصورة أو قم بتشغيل الفحص البصري لإدراج النتيجة تلقائياً..."
                              className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white outline-none text-xs font-bold text-slate-800 leading-relaxed resize-y"
                          />

                          <div className="flex items-center justify-between gap-2 flex-wrap">
                              <button
                                  type="button"
                                  onClick={handleSavePhotoNote}
                                  disabled={isSavingNote}
                                  className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold shadow-md flex items-center gap-2 transition disabled:opacity-50"
                              >
                                  {isSavingNote ? (
                                      <i className="fa-solid fa-circle-notch fa-spin text-xs"></i>
                                  ) : (
                                      <i className="fa-solid fa-floppy-disk text-xs"></i>
                                  )}
                                  <span>حفظ كملاحظة على الصورة</span>
                              </button>

                              {noteSavedSuccess && (
                                  <span className="text-[11px] font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
                                      <i className="fa-solid fa-circle-check"></i>
                                      <span>تم التوثيق والحفظ في بيانات الملف</span>
                                  </span>
                              )}
                          </div>
                      </div>

                      {/* Formatted Exports (PDF / Excel / Word) */}
                      <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-sm space-y-2.5">
                          <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                                  <i className="fa-solid fa-file-export text-teal-600"></i>
                                  تصدير الصورة والملاحظة كملف احترافي منسق
                              </span>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                              <button
                                  type="button"
                                  onClick={() => handleExportPhotoAndNote('pdf')}
                                  disabled={!!exportingFormat}
                                  className="py-2.5 px-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs shadow-sm flex items-center justify-center gap-1.5 transition disabled:opacity-50"
                              >
                                  {exportingFormat === 'pdf' ? (
                                      <i className="fa-solid fa-circle-notch fa-spin text-xs"></i>
                                  ) : (
                                      <i className="fa-solid fa-file-pdf text-sm"></i>
                                  )}
                                  <span>PDF</span>
                              </button>
                              <button
                                  type="button"
                                  onClick={() => handleExportPhotoAndNote('excel')}
                                  disabled={!!exportingFormat}
                                  className="py-2.5 px-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-sm flex items-center justify-center gap-1.5 transition disabled:opacity-50"
                              >
                                  {exportingFormat === 'excel' ? (
                                      <i className="fa-solid fa-circle-notch fa-spin text-xs"></i>
                                  ) : (
                                      <i className="fa-solid fa-file-excel text-sm"></i>
                                  )}
                                  <span>Excel</span>
                              </button>
                              <button
                                  type="button"
                                  onClick={() => handleExportPhotoAndNote('word')}
                                  disabled={!!exportingFormat}
                                  className="py-2.5 px-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs shadow-sm flex items-center justify-center gap-1.5 transition disabled:opacity-50"
                              >
                                  {exportingFormat === 'word' ? (
                                      <i className="fa-solid fa-circle-notch fa-spin text-xs"></i>
                                  ) : (
                                      <i className="fa-solid fa-file-word text-sm"></i>
                                  )}
                                  <span>Word</span>
                              </button>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default FileViewer;
