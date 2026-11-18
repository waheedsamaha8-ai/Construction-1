import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildMultiPagePdf,
  dataUrlToImageFile,
  DEFAULT_ADJUSTMENTS_BY_FILTER,
  detectDocumentCorners,
  FULL_PAGE_QUAD,
  getRotatedCanvas,
  loadSourceCanvas,
  Point2D,
  processScannedPage,
  QuadPoints,
  ScanAdjustments,
  ScanFilterMode,
  ScannedPage,
} from '../services/documentScannerUtils';

interface DocumentScannerModalProps {
  isOpen: boolean;
  projectName?: string;
  onClose: () => void;
  onSaveFiles: (files: File[], statusLabel: string) => Promise<void>;
}

type ScannerViewMode = 'capture' | 'edit' | 'export';
type EditSubTab = 'crop' | 'enhance';

const FILTER_OPTIONS: {
  id: ScanFilterMode;
  label: string;
  subtitle: string;
  icon: string;
}[] = [
  { id: 'magic', label: 'تحسين سحري', subtitle: 'إزالة الظل وتبييض الورق', icon: 'fa-wand-magic-sparkles' },
  { id: 'bw_doc', label: 'أبيض وأسود', subtitle: 'حبر حاد للطباعة والعقود', icon: 'fa-file-lines' },
  { id: 'grayscale', label: 'رمادي هندسي', subtitle: 'مناسب للرسومات واللوحات', icon: 'fa-circle-half-stroke' },
  { id: 'color_boost', label: 'ألوان ناصعة', subtitle: 'إبراز الأختام والألوان', icon: 'fa-palette' },
  { id: 'original', label: 'الأصل', subtitle: 'بدون معالجة لونية', icon: 'fa-image' },
];

const formatBytes = (bytes: number) => {
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const DocumentScannerModal: React.FC<DocumentScannerModalProps> = ({
  isOpen,
  projectName,
  onClose,
  onSaveFiles,
}) => {
  const [viewMode, setViewMode] = useState<ScannerViewMode>('capture');
  const [editTab, setEditTab] = useState<EditSubTab>('enhance');
  const [pages, setPages] = useState<ScannedPage[]>([]);
  const [activePageId, setActivePageId] = useState<string | null>(null);

  // Camera state
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [batchCaptureMode, setBatchCaptureMode] = useState(true);
  const [captureFlash, setCaptureFlash] = useState(false);

  // Processing & editing states
  const [isBusy, setIsBusy] = useState(false);
  const [busyMessage, setBusyMessage] = useState('');
  const [showSliders, setShowSliders] = useState(false);

  // Interactive 4-corner crop state
  const cropStageRef = useRef<HTMLDivElement>(null);
  const cropImgRef = useRef<HTMLImageElement>(null);
  const loupeCanvasRef = useRef<HTMLCanvasElement>(null);
  const [rotatedPreviewUrl, setRotatedPreviewUrl] = useState<string>('');
  const [rotatedPreviewDims, setRotatedPreviewDims] = useState<{ w: number; h: number }>({ w: 1, h: 1 });
  const [draggingCornerIdx, setDraggingCornerIdx] = useState<number | null>(null);
  const [imgRenderRect, setImgRenderRect] = useState<{ left: number; top: number; width: number; height: number }>({
    left: 0,
    top: 0,
    width: 1,
    height: 1,
  });

  // Export state
  const defaultBaseName = (() => {
    const cleanProj = (projectName || 'مستند').replace(/[\/\\?%*:|"<>]/g, '_').trim();
    const today = new Date().toISOString().split('T')[0];
    return `${cleanProj}_مسح_${today}`;
  })();
  const [pdfFileName, setPdfFileName] = useState(defaultBaseName);
  const [pdfPageSize, setPdfPageSize] = useState<'a4' | 'fit'>('a4');
  const [pdfQuality, setPdfQuality] = useState<'high' | 'balanced'>('high');
  const [statusToast, setStatusToast] = useState<string | null>(null);

  const sliderTimerRef = useRef<number | null>(null);

  const activePage = pages.find(p => p.id === activePageId) || pages[0] || null;
  const activePageIndex = activePage ? pages.findIndex(p => p.id === activePage.id) : -1;

  const showToast = useCallback((msg: string) => {
    setStatusToast(msg);
    window.setTimeout(() => {
      setStatusToast(prev => (prev === msg ? null : prev));
    }, 2200);
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        try {
          track.stop();
        } catch {}
      });
      streamRef.current = null;
    }
    setCameraReady(false);
    setTorchOn(false);
    setTorchSupported(false);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    setCameraReady(false);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('المتصفح لا يدعم فتح الكاميرا المباشرة. استخدم كاميرا الجهاز أو استيراد الصور بالأسفل.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      if (track && typeof track.getCapabilities === 'function') {
        const caps = track.getCapabilities() as any;
        setTorchSupported(Boolean(caps?.torch));
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraReady(true);
      }
    } catch {
      setCameraError('تعذر تشغيل الكاميرا المباشرة داخل الإطار. يمكنك التقاط المستند بكاميرا الهاتف أو استيراد الصور مباشرة.');
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setPages([]);
      setActivePageId(null);
      setViewMode('capture');
      setShowSliders(false);
      return;
    }
    setPdfFileName(defaultBaseName);
  }, [isOpen, defaultBaseName, stopCamera]);

  useEffect(() => {
    if (isOpen && viewMode === 'capture') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      if (viewMode !== 'capture') stopCamera();
    };
  }, [isOpen, viewMode, startCamera, stopCamera]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
      if (sliderTimerRef.current) window.clearTimeout(sliderTimerRef.current);
    };
  }, [stopCamera]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !torchSupported) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as any] });
      setTorchOn(next);
    } catch {
      showToast('الفلاش غير مدعوم على هذا الجهاز');
    }
  };

  /**
   * Ingests a captured/imported image source:
   * loads -> auto-detects 4 document corners -> warps & applies Magic enhancement -> adds to pages list.
   */
  const ingestImageSource = async (
    source: File | Blob | string,
    openEditorImmediately: boolean
  ): Promise<ScannedPage | null> => {
    const { canvas, dataUrl, width, height } = await loadSourceCanvas(source, 2200);
    const detectedCorners = detectDocumentCorners(canvas);
    const defaultFilter: ScanFilterMode = 'magic';
    const defaultAdj = { ...DEFAULT_ADJUSTMENTS_BY_FILTER[defaultFilter] };

    const processed = await processScannedPage({
      originalDataUrl: dataUrl,
      rotation: 0,
      corners: detectedCorners,
      filterMode: defaultFilter,
      adjustments: defaultAdj,
    });

    const newPage: ScannedPage = {
      id: `scan_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      originalDataUrl: dataUrl,
      naturalWidth: width,
      naturalHeight: height,
      rotation: 0,
      corners: detectedCorners,
      filterMode: defaultFilter,
      adjustments: defaultAdj,
      processedDataUrl: processed.processedDataUrl,
      thumbnailDataUrl: processed.thumbnailDataUrl,
      outputWidth: processed.outputWidth,
      outputHeight: processed.outputHeight,
    };

    setPages(prev => [...prev, newPage]);
    setActivePageId(newPage.id);

    if (openEditorImmediately) {
      setEditTab('crop');
      setViewMode('edit');
    }
    return newPage;
  };

  const handleCaptureFromLiveVideo = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight || isBusy) return;

    setCaptureFlash(true);
    window.setTimeout(() => setCaptureFlash(false), 180);

    setIsBusy(true);
    setBusyMessage('جاري اكتشاف حواف المستند وتحسينه...');
    try {
      const snapCanvas = document.createElement('canvas');
      snapCanvas.width = video.videoWidth;
      snapCanvas.height = video.videoHeight;
      const ctx = snapCanvas.getContext('2d');
      if (!ctx) throw new Error('تعذر قراءة إطار الكاميرا');
      ctx.drawImage(video, 0, 0, snapCanvas.width, snapCanvas.height);

      const blob = await new Promise<Blob | null>(res =>
        snapCanvas.toBlob(b => res(b), 'image/jpeg', 0.94)
      );
      if (!blob) throw new Error('فشل التقاط الصورة');

      await ingestImageSource(blob, !batchCaptureMode);
      if (batchCaptureMode) {
        showToast('تم مسح الصفحة وإضافتها للقائمة');
      }
    } catch (err: any) {
      showToast(err?.message || 'فشل التقاط المستند');
    } finally {
      setIsBusy(false);
      setBusyMessage('');
    }
  };

  const handleImportFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const files: File[] = Array.from<File>(fileList).filter(f => f.type.startsWith('image/'));
    e.target.value = '';
    if (!files.length) return;

    setIsBusy(true);
    try {
      for (let i = 0; i < files.length; i++) {
        setBusyMessage(`جاري مسح وتحسين صفحة ${i + 1} من ${files.length}...`);
        await ingestImageSource(files[i], false);
      }
      if (files.length === 1) {
        setEditTab('crop');
        setViewMode('edit');
      } else {
        setEditTab('enhance');
        setViewMode('edit');
        showToast(`تم مسح وتحسين ${files.length} صفحات`);
      }
    } catch (err: any) {
      showToast(err?.message || 'حدث خطأ أثناء معالجة الصور');
    } finally {
      setIsBusy(false);
      setBusyMessage('');
    }
  };

  // Build rotated original preview when editing crop of active page
  useEffect(() => {
    let cancelled = false;
    if (!isOpen || viewMode !== 'edit' || editTab !== 'crop' || !activePage) {
      return;
    }

    (async () => {
      const { canvas } = await loadSourceCanvas(activePage.originalDataUrl, 1200);
      const rotated = getRotatedCanvas(canvas, activePage.rotation);
      if (cancelled) return;
      setRotatedPreviewDims({ w: rotated.width, h: rotated.height });
      setRotatedPreviewUrl(rotated.toDataURL('image/jpeg', 0.88));
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, viewMode, editTab, activePage?.id, activePage?.rotation, activePage?.originalDataUrl]);

  // Measure displayed image rectangle inside crop stage so SVG corner overlay aligns 100% accurately
  const updateCropImgRect = useCallback(() => {
    const stage = cropStageRef.current;
    const img = cropImgRef.current;
    if (!stage || !img) return;
    const stageRect = stage.getBoundingClientRect();
    const imgRect = img.getBoundingClientRect();
    if (imgRect.width > 0 && imgRect.height > 0) {
      setImgRenderRect({
        left: imgRect.left - stageRect.left,
        top: imgRect.top - stageRect.top,
        width: imgRect.width,
        height: imgRect.height,
      });
    }
  }, []);

  useEffect(() => {
    updateCropImgRect();
    window.addEventListener('resize', updateCropImgRect);
    return () => window.removeEventListener('resize', updateCropImgRect);
  }, [updateCropImgRect, rotatedPreviewUrl, viewMode, editTab]);

  // Re-run full processing pipeline for a page
  const reprocessPage = async (
    pageId: string,
    overrides: Partial<Pick<ScannedPage, 'rotation' | 'corners' | 'filterMode' | 'adjustments'>>
  ) => {
    const target = pages.find(p => p.id === pageId);
    if (!target) return;

    const nextRotation = overrides.rotation ?? target.rotation;
    const nextCorners = overrides.corners ?? target.corners;
    const nextFilter = overrides.filterMode ?? target.filterMode;
    const nextAdj = overrides.adjustments ?? target.adjustments;

    // Optimistically update metadata immediately
    setPages(prev =>
      prev.map(p =>
        p.id === pageId
          ? { ...p, rotation: nextRotation, corners: nextCorners, filterMode: nextFilter, adjustments: nextAdj }
          : p
      )
    );

    setIsBusy(true);
    setBusyMessage('جاري تحسين الصفحة...');
    try {
      const processed = await processScannedPage({
        originalDataUrl: target.originalDataUrl,
        rotation: nextRotation,
        corners: nextCorners,
        filterMode: nextFilter,
        adjustments: nextAdj,
      });
      setPages(prev =>
        prev.map(p =>
          p.id === pageId
            ? {
                ...p,
                rotation: nextRotation,
                corners: nextCorners,
                filterMode: nextFilter,
                adjustments: nextAdj,
                processedDataUrl: processed.processedDataUrl,
                thumbnailDataUrl: processed.thumbnailDataUrl,
                outputWidth: processed.outputWidth,
                outputHeight: processed.outputHeight,
              }
            : p
        )
      );
    } finally {
      setIsBusy(false);
      setBusyMessage('');
    }
  };

  // Draw zoomed precision loupe while dragging a corner handle
  const drawLoupe = useCallback(
    (cornerNorm: Point2D) => {
      const loupe = loupeCanvasRef.current;
      const img = cropImgRef.current;
      if (!loupe || !img || !img.complete) return;
      const ctx = loupe.getContext('2d');
      if (!ctx) return;

      const size = loupe.width;
      const zoomRegion = 0.14; // 14% of image width zoomed
      const srcW = (img.naturalWidth || rotatedPreviewDims.w) * zoomRegion;
      const srcH = srcW;
      const cx = cornerNorm.x * (img.naturalWidth || rotatedPreviewDims.w);
      const cy = cornerNorm.y * (img.naturalHeight || rotatedPreviewDims.h);

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(
        img,
        cx - srcW / 2,
        cy - srcH / 2,
        srcW,
        srcH,
        0,
        0,
        size,
        size
      );

      // Crosshair in center
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(size / 2, 0);
      ctx.lineTo(size / 2, size);
      ctx.moveTo(0, size / 2);
      ctx.lineTo(size, size / 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(size / 2, size / 2, 5, 0, Math.PI * 2);
      ctx.strokeStyle = '#fbbf24';
      ctx.stroke();
    },
    [rotatedPreviewDims]
  );

  // Drag corner pointer handlers
  const handleStagePointerMove = (e: React.PointerEvent) => {
    if (draggingCornerIdx === null || !activePage || !cropStageRef.current) return;
    const stageRect = cropStageRef.current.getBoundingClientRect();
    const localX = e.clientX - stageRect.left - imgRenderRect.left;
    const localY = e.clientY - stageRect.top - imgRenderRect.top;

    const nx = Math.max(0, Math.min(1, localX / Math.max(1, imgRenderRect.width)));
    const ny = Math.max(0, Math.min(1, localY / Math.max(1, imgRenderRect.height)));

    const nextCorners = [...activePage.corners] as QuadPoints;
    nextCorners[draggingCornerIdx] = { x: nx, y: ny };

    setPages(prev =>
      prev.map(p => (p.id === activePage.id ? { ...p, corners: nextCorners } : p))
    );
    drawLoupe({ x: nx, y: ny });
  };

  const handleStagePointerUp = () => {
    if (draggingCornerIdx !== null) {
      setDraggingCornerIdx(null);
    }
  };

  const handleAutoDetectActiveCorners = async () => {
    if (!activePage) return;
    setIsBusy(true);
    setBusyMessage('جاري تحديد حواف الورقة تلقائياً...');
    try {
      const { canvas } = await loadSourceCanvas(activePage.originalDataUrl, 1200);
      const rotated = getRotatedCanvas(canvas, activePage.rotation);
      const detected = detectDocumentCorners(rotated);
      setPages(prev =>
        prev.map(p => (p.id === activePage.id ? { ...p, corners: detected } : p))
      );
      showToast('تم تحديد الحواف تلقائياً');
    } finally {
      setIsBusy(false);
      setBusyMessage('');
    }
  };

  const handleRotateActivePage = async () => {
    if (!activePage) return;
    const nextRot = ((activePage.rotation + 90) % 360) as 0 | 90 | 180 | 270;
    // Rotate existing normalized corners clockwise and cycle [TL, TR, BR, BL]
    const rotatedPts = activePage.corners.map(pt => ({ x: 1 - pt.y, y: pt.x }));
    const nextCorners: QuadPoints = [rotatedPts[3], rotatedPts[0], rotatedPts[1], rotatedPts[2]];

    if (editTab === 'crop') {
      setPages(prev =>
        prev.map(p =>
          p.id === activePage.id ? { ...p, rotation: nextRot, corners: nextCorners } : p
        )
      );
    } else {
      await reprocessPage(activePage.id, { rotation: nextRot, corners: nextCorners });
    }
  };

  const handleApplyCropAndSwitchToEnhance = async () => {
    if (!activePage) return;
    await reprocessPage(activePage.id, { corners: activePage.corners });
    setEditTab('enhance');
  };

  const handleFilterSelect = async (filter: ScanFilterMode) => {
    if (!activePage) return;
    const adj = { ...DEFAULT_ADJUSTMENTS_BY_FILTER[filter] };
    await reprocessPage(activePage.id, { filterMode: filter, adjustments: adj });
  };

  const handleSliderChange = (key: keyof ScanAdjustments, value: number) => {
    if (!activePage) return;
    const nextAdj = { ...activePage.adjustments, [key]: value };
    setPages(prev =>
      prev.map(p => (p.id === activePage.id ? { ...p, adjustments: nextAdj } : p))
    );
    if (sliderTimerRef.current) window.clearTimeout(sliderTimerRef.current);
    const targetId = activePage.id;
    sliderTimerRef.current = window.setTimeout(() => {
      reprocessPage(targetId, { adjustments: nextAdj });
    }, 160);
  };

  const handleApplyFilterToAllPages = async () => {
    if (!activePage || pages.length < 2) return;
    setIsBusy(true);
    try {
      const updatedPages: ScannedPage[] = [];
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        setBusyMessage(`تطبيق التحسين على صفحة ${i + 1} من ${pages.length}...`);
        const res = await processScannedPage({
          originalDataUrl: p.originalDataUrl,
          rotation: p.rotation,
          corners: p.corners,
          filterMode: activePage.filterMode,
          adjustments: activePage.adjustments,
        });
        updatedPages.push({
          ...p,
          filterMode: activePage.filterMode,
          adjustments: { ...activePage.adjustments },
          processedDataUrl: res.processedDataUrl,
          thumbnailDataUrl: res.thumbnailDataUrl,
          outputWidth: res.outputWidth,
          outputHeight: res.outputHeight,
        });
      }
      setPages(updatedPages);
      showToast('تم تطبيق نفس التحسين على جميع الصفحات');
    } finally {
      setIsBusy(false);
      setBusyMessage('');
    }
  };

  const handleMovePage = (idx: number, delta: -1 | 1) => {
    const targetIdx = idx + delta;
    if (targetIdx < 0 || targetIdx >= pages.length) return;
    setPages(prev => {
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.splice(targetIdx, 0, item);
      return next;
    });
  };

  const handleDeletePage = (pageId: string) => {
    const idx = pages.findIndex(p => p.id === pageId);
    const remaining = pages.filter(p => p.id !== pageId);
    setPages(remaining);
    if (remaining.length === 0) {
      setActivePageId(null);
      setViewMode('capture');
    } else if (activePageId === pageId) {
      const fallback = remaining[Math.min(idx, remaining.length - 1)];
      setActivePageId(fallback.id);
    }
  };

  const handleGoToExport = async () => {
    // Ensure if user was in crop tab with unsaved corner drags, active page gets warped before export
    if (viewMode === 'edit' && editTab === 'crop' && activePage) {
      await reprocessPage(activePage.id, { corners: activePage.corners });
    }
    setViewMode('export');
  };

  const handleSavePdfToFolder = async () => {
    if (!pages.length || isBusy) return;
    setIsBusy(true);
    setBusyMessage('جاري إنشاء ملف PDF الاحترافي...');
    try {
      const { file } = await buildMultiPagePdf(
        pages,
        { fileName: pdfFileName, pageSizeMode: pdfPageSize, quality: pdfQuality },
        (curr, total) => setBusyMessage(`جاري تجهيز صفحة ${curr} من ${total} في ملف PDF...`)
      );
      setBusyMessage(`جاري حفظ ${file.name} (${formatBytes(file.size)}) في المجلد...`);
      await onSaveFiles([file], `جاري رفع ملف PDF (${file.name})...`);
      onClose();
    } catch (err: any) {
      showToast(err?.message || 'فشل إنشاء أو حفظ ملف PDF');
    } finally {
      setIsBusy(false);
      setBusyMessage('');
    }
  };

  const handleDownloadOrSharePdf = async () => {
    if (!pages.length || isBusy) return;
    setIsBusy(true);
    setBusyMessage('جاري تجهيز ملف PDF للمشاركة والتنزيل...');
    try {
      const { file, blob } = await buildMultiPagePdf(
        pages,
        { fileName: pdfFileName, pageSizeMode: pdfPageSize, quality: pdfQuality }
      );
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: file.name,
          });
          return;
        } catch (shareErr: any) {
          if (shareErr?.name === 'AbortError') return;
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast('تم تنزيل ملف PDF بنجاح');
    } catch (err: any) {
      showToast(err?.message || 'فشل تصدير PDF');
    } finally {
      setIsBusy(false);
      setBusyMessage('');
    }
  };

  const handleSavePagesAsImages = async () => {
    if (!pages.length || isBusy) return;
    setIsBusy(true);
    setBusyMessage('جاري تجهيز الصور الممسوحة للحفظ...');
    try {
      const cleanBase =
        pdfFileName
          .trim()
          .replace(/\.pdf$/i, '')
          .replace(/[\/\\?%*:|"<>]/g, '_') || 'Scan';
      const files: File[] = [];
      for (let i = 0; i < pages.length; i++) {
        const num = String(i + 1).padStart(2, '0');
        const imgFile = await dataUrlToImageFile(pages[i].processedDataUrl, `${cleanBase}_P${num}.jpg`);
        files.push(imgFile);
      }
      await onSaveFiles(files, `جاري حفظ ${files.length} صورة ممسوحة...`);
      onClose();
    } catch (err: any) {
      showToast(err?.message || 'فشل حفظ الصور');
    } finally {
      setIsBusy(false);
      setBusyMessage('');
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[1500] bg-slate-950 text-white flex flex-col overflow-hidden select-none"
      dir="rtl"
    >
      {/* Hidden native camera & multi-image pickers */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleImportFiles}
        className="hidden"
      />
      <input
        ref={nativeCameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleImportFiles}
        className="hidden"
      />

      {/* Top Studio Bar */}
      <header className="h-14 px-3 sm:px-4 bg-slate-900/95 border-b border-white/10 flex items-center justify-between gap-2 shrink-0 z-20">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => {
              if (viewMode === 'export' && pages.length > 0) {
                setViewMode('edit');
              } else if (viewMode === 'edit' && pages.length > 0) {
                setViewMode('capture');
              } else {
                onClose();
              }
            }}
            className="min-w-[44px] min-h-[44px] rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition shrink-0"
            title={viewMode === 'capture' ? 'إغلاق الماسح' : 'رجوع'}
          >
            <i className={`fa-solid ${viewMode === 'capture' ? 'fa-xmark' : 'fa-arrow-right'} text-base`}></i>
          </button>
          <div className="min-w-0">
            <h2 className="text-sm font-extrabold text-white truncate">
              {viewMode === 'capture'
                ? 'ماسح المستندات الاحترافي'
                : viewMode === 'edit'
                  ? `معالجة الصفحة (${activePageIndex + 1} / ${pages.length})`
                  : `تصدير ملف PDF (${pages.length} ${pages.length === 1 ? 'صفحة' : 'صفحات'})`}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {viewMode === 'capture' && torchSupported && (
            <button
              type="button"
              onClick={toggleTorch}
              className={`min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center border transition ${
                torchOn
                  ? 'bg-amber-400 text-slate-950 border-amber-300'
                  : 'bg-white/10 text-white border-white/10 hover:bg-white/20'
              }`}
              title="تشغيل/إطفاء الفلاش"
            >
              <i className="fa-solid fa-bolt text-sm"></i>
            </button>
          )}

          {viewMode === 'capture' && pages.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setEditTab('enhance');
                setViewMode('edit');
              }}
              className="min-h-[44px] px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center gap-2 transition whitespace-nowrap shrink-0 shadow-lg"
            >
              <span>تعديل وتصدير ({pages.length})</span>
              <i className="fa-solid fa-chevron-left text-[10px]"></i>
            </button>
          )}

          {viewMode === 'edit' && (
            <button
              type="button"
              onClick={handleGoToExport}
              className="min-h-[44px] px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-extrabold flex items-center gap-2 transition whitespace-nowrap shrink-0 shadow-lg"
            >
              <i className="fa-solid fa-file-pdf"></i>
              <span>إنشاء PDF</span>
            </button>
          )}

          {viewMode === 'export' && (
            <button
              type="button"
              onClick={onClose}
              className="min-w-[44px] min-h-[44px] rounded-xl bg-white/10 hover:bg-red-500/80 flex items-center justify-center transition"
              title="إغلاق"
            >
              <i className="fa-solid fa-xmark text-sm"></i>
            </button>
          )}
        </div>
      </header>

      {/* Subtle feedback toast */}
      {statusToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[1600] bg-slate-900/95 border border-sky-400/40 text-white px-4 py-2 rounded-xl shadow-2xl text-xs font-bold flex items-center gap-2 animate-fade-in">
          <i className="fa-solid fa-circle-check text-emerald-400"></i>
          <span>{statusToast}</span>
        </div>
      )}

      {/* ==================== 1. CAPTURE MODE ==================== */}
      {viewMode === 'capture' && (
        <div className="flex-1 flex flex-col min-h-0 relative bg-black">
          <div className="flex-1 relative overflow-hidden flex items-center justify-center">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover transition-opacity duration-200 ${
                cameraReady ? 'opacity-100' : 'opacity-0'
              }`}
            />

            {/* Capture shutter flash feedback */}
            {captureFlash && (
              <div className="absolute inset-0 bg-white/75 pointer-events-none z-20 transition-opacity" />
            )}

            {/* Document Alignment Guide Frame */}
            {cameraReady && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-6 sm:p-10">
                <div className="w-full max-w-md aspect-[1/1.41] max-h-full relative border border-white/25 rounded-lg">
                  <div className="absolute -top-0.5 -right-0.5 w-7 h-7 border-t-4 border-r-4 border-sky-400 rounded-tr-lg" />
                  <div className="absolute -top-0.5 -left-0.5 w-7 h-7 border-t-4 border-l-4 border-sky-400 rounded-tl-lg" />
                  <div className="absolute -bottom-0.5 -right-0.5 w-7 h-7 border-b-4 border-r-4 border-sky-400 rounded-br-lg" />
                  <div className="absolute -bottom-0.5 -left-0.5 w-7 h-7 border-b-4 border-l-4 border-sky-400 rounded-bl-lg" />
                  <div className="absolute inset-x-4 bottom-3 text-center">
                    <span className="inline-block bg-black/65 backdrop-blur-sm text-white/90 text-[11px] font-bold px-3 py-1 rounded-lg">
                      ضع المستند داخل الإطار — يتم قص الحواف وتبييض الورق تلقائياً
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Fallback UI when live stream cannot start */}
            {cameraError && (
              <div className="absolute inset-0 flex items-center justify-center p-6 bg-slate-950/95">
                <div className="max-w-sm w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center space-y-4 shadow-2xl">
                  <div className="w-16 h-16 rounded-2xl bg-sky-500/15 text-sky-400 border border-sky-500/30 flex items-center justify-center mx-auto text-2xl">
                    <i className="fa-solid fa-file-invoice"></i>
                  </div>
                  <div className="space-y-1.5">
                    <h3 className="text-base font-extrabold text-white">مسح المستندات بالكاميرا أو الصور</h3>
                    <p className="text-xs text-slate-400 font-semibold leading-relaxed">{cameraError}</p>
                  </div>
                  <div className="space-y-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => nativeCameraInputRef.current?.click()}
                      className="w-full min-h-[48px] px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-extrabold flex items-center justify-center gap-2 transition shadow-lg"
                    >
                      <i className="fa-solid fa-camera text-sm"></i>
                      <span>التقاط صورة بكاميرا الجهاز</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => galleryInputRef.current?.click()}
                      className="w-full min-h-[48px] px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 text-xs font-extrabold flex items-center justify-center gap-2 transition"
                    >
                      <i className="fa-solid fa-images text-sm text-sky-400"></i>
                      <span>اختيار صور متعددة من الجهاز</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Floating Batch Mode Switch */}
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
              <div className="flex items-center gap-1 p-1 bg-slate-900/85 backdrop-blur-md border border-white/15 rounded-xl">
                <button
                  type="button"
                  onClick={() => setBatchCaptureMode(true)}
                  className={`min-h-[36px] px-3 rounded-lg text-[11px] font-bold transition whitespace-nowrap shrink-0 ${
                    batchCaptureMode ? 'bg-sky-600 text-white shadow' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  مسح متعدد الصفحات
                </button>
                <button
                  type="button"
                  onClick={() => setBatchCaptureMode(false)}
                  className={`min-h-[36px] px-3 rounded-lg text-[11px] font-bold transition whitespace-nowrap shrink-0 ${
                    !batchCaptureMode ? 'bg-sky-600 text-white shadow' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  فحص كل صفحة فوراً
                </button>
              </div>
            </div>
          </div>

          {/* Capture Bottom Dock */}
          <div className="bg-slate-900/95 border-t border-white/10 px-4 py-3.5 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                className="min-h-[46px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 flex items-center gap-2 text-xs font-bold transition whitespace-nowrap shrink-0"
                title="استيراد صور مستندات متعددة"
              >
                <i className="fa-solid fa-images text-sky-400 text-sm"></i>
                <span className="hidden sm:inline">استيراد صور</span>
              </button>
              <button
                type="button"
                onClick={() => nativeCameraInputRef.current?.click()}
                className="min-h-[46px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 flex items-center gap-2 text-xs font-bold transition whitespace-nowrap shrink-0"
                title="التقاط بكاميرا الهاتف الأصلية بدقة كاملة"
              >
                <i className="fa-solid fa-mobile-screen-button text-amber-400 text-sm"></i>
                <span className="hidden sm:inline">كاميرا الهاتف</span>
              </button>
            </div>

            {/* Primary Shutter */}
            <button
              type="button"
              disabled={!cameraReady || isBusy}
              onClick={handleCaptureFromLiveVideo}
              className={`w-16 h-16 rounded-full border-4 flex items-center justify-center transition shadow-2xl shrink-0 ${
                cameraReady && !isBusy
                  ? 'border-sky-400 bg-white hover:scale-105 active:scale-95'
                  : 'border-slate-700 bg-slate-800 opacity-50 cursor-not-allowed'
              }`}
              title="التقاط صفحة المستند"
            >
              <div className="w-12 h-12 rounded-full bg-sky-600 flex items-center justify-center text-white">
                <i className="fa-solid fa-camera text-lg"></i>
              </div>
            </button>

            {/* Scanned Deck Preview / Continue */}
            <button
              type="button"
              disabled={pages.length === 0}
              onClick={() => {
                if (pages.length > 0) {
                  setEditTab('enhance');
                  setViewMode('edit');
                }
              }}
              className={`min-h-[46px] min-w-[78px] px-3 rounded-xl border flex items-center justify-center gap-2 transition shrink-0 ${
                pages.length > 0
                  ? 'bg-emerald-600/20 border-emerald-400/50 text-white hover:bg-emerald-600/35'
                  : 'bg-slate-800/50 border-white/5 text-slate-500 cursor-not-allowed'
              }`}
            >
              {pages.length > 0 ? (
                <>
                  <img
                    src={pages[pages.length - 1].thumbnailDataUrl}
                    alt="آخر صفحة"
                    className="w-8 h-9 object-cover rounded border border-white/30"
                  />
                  <div className="text-right leading-tight">
                    <div className="text-xs font-black tabular-nums">{pages.length}</div>
                    <div className="text-[10px] text-emerald-300 font-bold">مراجعة</div>
                  </div>
                </>
              ) : (
                <span className="text-[11px] font-bold">0 صفحات</span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ==================== 2. EDIT (CROP + ENHANCE) MODE ==================== */}
      {viewMode === 'edit' && activePage && (
        <div className="flex-1 flex flex-col min-h-0 bg-slate-950">
          {/* Sub-Tab Bar (Perspective Crop vs Scan Enhancement) */}
          <div className="bg-slate-900 border-b border-white/10 px-3 py-2 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-xl border border-white/10">
              <button
                type="button"
                onClick={() => setEditTab('crop')}
                className={`min-h-[40px] px-3.5 rounded-lg text-xs font-extrabold flex items-center gap-1.5 transition whitespace-nowrap shrink-0 ${
                  editTab === 'crop' ? 'bg-sky-600 text-white shadow' : 'text-slate-300 hover:text-white'
                }`}
              >
                <i className="fa-solid fa-crop-simple"></i>
                <span>قص وتصحيح المنظور</span>
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (editTab === 'crop') {
                    await handleApplyCropAndSwitchToEnhance();
                  } else {
                    setEditTab('enhance');
                  }
                }}
                className={`min-h-[40px] px-3.5 rounded-lg text-xs font-extrabold flex items-center gap-1.5 transition whitespace-nowrap shrink-0 ${
                  editTab === 'enhance' ? 'bg-indigo-600 text-white shadow' : 'text-slate-300 hover:text-white'
                }`}
              >
                <i className="fa-solid fa-wand-magic-sparkles"></i>
                <span>تحسين المسح</span>
              </button>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleRotateActivePage}
                className="min-w-[44px] min-h-[40px] px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 transition whitespace-nowrap shrink-0"
                title="تدوير 90 درجة"
              >
                <i className="fa-solid fa-rotate-right"></i>
                <span className="hidden sm:inline">تدوير</span>
              </button>
            </div>
          </div>

          {/* Workspace Viewport */}
          <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
            {/* Left / Center Canvas Stage */}
            <div
              ref={cropStageRef}
              onPointerMove={editTab === 'crop' ? handleStagePointerMove : undefined}
              onPointerUp={editTab === 'crop' ? handleStagePointerUp : undefined}
              onPointerCancel={editTab === 'crop' ? handleStagePointerUp : undefined}
              className="flex-1 min-h-0 relative flex items-center justify-center p-3 sm:p-5 bg-slate-950 overflow-hidden touch-none"
            >
              {editTab === 'crop' ? (
                <>
                  {rotatedPreviewUrl && (
                    <img
                      ref={cropImgRef}
                      src={rotatedPreviewUrl}
                      alt="قص المستند"
                      onLoad={updateCropImgRect}
                      draggable={false}
                      className="max-w-full max-h-full object-contain rounded-lg shadow-2xl pointer-events-none"
                    />
                  )}

                  {/* SVG Polygon Overlay + Shaded Outside Mask */}
                  {imgRenderRect.width > 10 && (
                    <svg
                      className="absolute pointer-events-none"
                      style={{
                        left: imgRenderRect.left,
                        top: imgRenderRect.top,
                        width: imgRenderRect.width,
                        height: imgRenderRect.height,
                      }}
                      viewBox={`0 0 ${imgRenderRect.width} ${imgRenderRect.height}`}
                    >
                      {(() => {
                        const pts = activePage.corners.map(c => ({
                          x: c.x * imgRenderRect.width,
                          y: c.y * imgRenderRect.height,
                        }));
                        const polyD = `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y} L ${pts[2].x} ${pts[2].y} L ${pts[3].x} ${pts[3].y} Z`;
                        const outerD = `M 0 0 H ${imgRenderRect.width} V ${imgRenderRect.height} H 0 Z ${polyD}`;
                        return (
                          <>
                            <path d={outerD} fill="rgba(2, 6, 23, 0.58)" fillRule="evenodd" />
                            <polygon
                              points={pts.map(p => `${p.x},${p.y}`).join(' ')}
                              fill="none"
                              stroke="#38bdf8"
                              strokeWidth={2.5}
                            />
                            {/* Grid guide inside document */}
                            <line
                              x1={(pts[0].x + pts[3].x) / 2}
                              y1={(pts[0].y + pts[3].y) / 2}
                              x2={(pts[1].x + pts[2].x) / 2}
                              y2={(pts[1].y + pts[2].y) / 2}
                              stroke="rgba(56, 189, 248, 0.3)"
                              strokeDasharray="5 5"
                            />
                            <line
                              x1={(pts[0].x + pts[1].x) / 2}
                              y1={(pts[0].y + pts[1].y) / 2}
                              x2={(pts[3].x + pts[2].x) / 2}
                              y2={(pts[3].y + pts[2].y) / 2}
                              stroke="rgba(56, 189, 248, 0.3)"
                              strokeDasharray="5 5"
                            />
                          </>
                        );
                      })()}
                    </svg>
                  )}

                  {/* 4 Touch-Friendly Draggable Corner Handles (>= 44px hitbox) */}
                  {imgRenderRect.width > 10 &&
                    activePage.corners.map((c, idx) => {
                      const cx = imgRenderRect.left + c.x * imgRenderRect.width;
                      const cy = imgRenderRect.top + c.y * imgRenderRect.height;
                      const isDragging = draggingCornerIdx === idx;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onPointerDown={e => {
                            e.preventDefault();
                            (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
                            setDraggingCornerIdx(idx);
                            drawLoupe(c);
                          }}
                          style={{ left: cx - 22, top: cy - 22 }}
                          className="absolute w-11 h-11 rounded-full flex items-center justify-center cursor-grab active:cursor-grabbing z-20 touch-none"
                          aria-label={`زاوية ${idx + 1}`}
                        >
                          <span
                            className={`w-6 h-6 rounded-full border-[3px] shadow-lg transition-transform ${
                              isDragging
                                ? 'bg-amber-400 border-white scale-125'
                                : 'bg-sky-500 border-white'
                            }`}
                          />
                        </button>
                      );
                    })}

                  {/* Precision Magnifier Loupe when dragging corner */}
                  {draggingCornerIdx !== null && (
                    <div className="absolute top-3 left-3 z-30 rounded-full overflow-hidden border-2 border-sky-400 shadow-2xl bg-slate-900 pointer-events-none">
                      <canvas ref={loupeCanvasRef} width={112} height={112} className="block" />
                    </div>
                  )}
                </>
              ) : (
                <div className="w-full h-full flex items-center justify-center overflow-hidden">
                  <img
                    src={activePage.processedDataUrl}
                    alt={`صفحة ${activePageIndex + 1}`}
                    className="max-w-full max-h-full object-contain rounded-lg shadow-2xl bg-white"
                  />
                </div>
              )}
            </div>

            {/* Right / Bottom Enhancement Controls Panel */}
            {editTab === 'crop' ? (
              <div className="bg-slate-900 border-t lg:border-t-0 lg:border-r border-white/10 p-3 lg:w-72 flex flex-wrap lg:flex-col gap-2 justify-between shrink-0">
                <div className="flex gap-2 flex-1 lg:flex-initial">
                  <button
                    type="button"
                    onClick={handleAutoDetectActiveCorners}
                    className="flex-1 min-h-[44px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition whitespace-nowrap"
                  >
                    <i className="fa-solid fa-expand text-sky-400"></i>
                    <span>تحديد تلقائي</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setPages(prev =>
                        prev.map(p =>
                          p.id === activePage.id ? { ...p, corners: FULL_PAGE_QUAD } : p
                        )
                      )
                    }
                    className="flex-1 min-h-[44px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition whitespace-nowrap"
                  >
                    <i className="fa-solid fa-maximize text-amber-400"></i>
                    <span>كامل الصورة</span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleApplyCropAndSwitchToEnhance}
                  className="w-full lg:w-auto min-h-[46px] px-4 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-extrabold flex items-center justify-center gap-2 transition shadow-lg whitespace-nowrap"
                >
                  <i className="fa-solid fa-check"></i>
                  <span>تأكيد القص ومعاينة التحسين</span>
                </button>
              </div>
            ) : (
              <div className="bg-slate-900 border-t lg:border-t-0 lg:border-r border-white/10 p-3 lg:w-80 flex flex-col gap-2.5 shrink-0 max-h-[42vh] lg:max-h-none overflow-y-auto">
                {/* Filter Presets */}
                <div className="flex lg:grid lg:grid-cols-1 gap-2 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0">
                  {FILTER_OPTIONS.map(f => {
                    const isSelected = activePage.filterMode === f.id;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => handleFilterSelect(f.id)}
                        className={`min-h-[48px] px-3 py-2 rounded-xl border text-right flex items-center gap-2.5 transition shrink-0 lg:shrink whitespace-nowrap lg:whitespace-normal ${
                          isSelected
                            ? 'bg-indigo-600 border-indigo-400 text-white shadow-md'
                            : 'bg-slate-800/80 border-white/10 text-slate-200 hover:bg-slate-800'
                        }`}
                      >
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                            isSelected ? 'bg-white/20 text-white' : 'bg-slate-950 text-sky-400'
                          }`}
                        >
                          <i className={`fa-solid ${f.icon} text-xs`}></i>
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-extrabold leading-tight">{f.label}</div>
                          <div className="text-[10px] opacity-75 hidden lg:block">{f.subtitle}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Fine-tuning toggle + sliders */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowSliders(prev => !prev)}
                    className={`flex-1 min-h-[40px] px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition ${
                      showSliders
                        ? 'bg-slate-800 border-sky-400/50 text-sky-300'
                        : 'bg-slate-800/70 border-white/10 text-slate-300 hover:text-white'
                    }`}
                  >
                    <i className="fa-solid fa-sliders"></i>
                    <span>ضبط السطوع والتباين والحدة</span>
                  </button>
                  {pages.length > 1 && (
                    <button
                      type="button"
                      onClick={handleApplyFilterToAllPages}
                      className="min-h-[40px] px-3 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/35 border border-emerald-500/40 text-emerald-300 text-[11px] font-extrabold whitespace-nowrap transition"
                      title="تطبيق الفلتر الحالي على كل الصفحات"
                    >
                      تطبيق للكل
                    </button>
                  )}
                </div>

                {showSliders && (
                  <div className="bg-slate-950/90 border border-white/10 rounded-xl p-3 space-y-2.5 text-xs">
                    <div>
                      <div className="flex justify-between font-bold mb-1">
                        <span className="text-slate-300">السطوع</span>
                        <span className="font-mono tabular-nums text-sky-400">{activePage.adjustments.brightness}</span>
                      </div>
                      <input
                        type="range"
                        min={-40}
                        max={40}
                        value={activePage.adjustments.brightness}
                        onChange={e => handleSliderChange('brightness', Number(e.target.value))}
                        className="w-full accent-sky-500"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between font-bold mb-1">
                        <span className="text-slate-300">التباين</span>
                        <span className="font-mono tabular-nums text-sky-400">{activePage.adjustments.contrast}</span>
                      </div>
                      <input
                        type="range"
                        min={-40}
                        max={40}
                        value={activePage.adjustments.contrast}
                        onChange={e => handleSliderChange('contrast', Number(e.target.value))}
                        className="w-full accent-sky-500"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between font-bold mb-1">
                        <span className="text-slate-300">حدة النص</span>
                        <span className="font-mono tabular-nums text-sky-400">{activePage.adjustments.sharpness}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={activePage.adjustments.sharpness}
                        onChange={e => handleSliderChange('sharpness', Number(e.target.value))}
                        className="w-full accent-sky-500"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Multi-Page Filmstrip */}
          <div className="bg-slate-900 border-t border-white/10 px-3 py-2 flex items-center gap-2 overflow-x-auto shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('capture')}
              className="w-14 h-16 rounded-xl border-2 border-dashed border-sky-400/60 bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 flex flex-col items-center justify-center gap-1 shrink-0 transition"
              title="مسح صفحة جديدة"
            >
              <i className="fa-solid fa-plus text-sm"></i>
              <span className="text-[10px] font-bold">إضافة</span>
            </button>

            {pages.map((p, idx) => {
              const isCurrent = p.id === activePage.id;
              return (
                <div
                  key={p.id}
                  className={`relative shrink-0 rounded-xl overflow-hidden border-2 transition cursor-pointer ${
                    isCurrent
                      ? 'border-sky-400 shadow-lg ring-2 ring-sky-400/30'
                      : 'border-white/15 opacity-75 hover:opacity-100'
                  }`}
                  onClick={() => setActivePageId(p.id)}
                >
                  <img
                    src={p.thumbnailDataUrl}
                    alt={`صفحة ${idx + 1}`}
                    className="w-14 h-16 object-cover bg-white"
                  />
                  <span className="absolute bottom-0.5 right-0.5 bg-slate-950/85 text-white text-[10px] font-black px-1.5 py-0.5 rounded tabular-nums">
                    {idx + 1}
                  </span>
                  {isCurrent && (
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        handleDeletePage(p.id);
                      }}
                      className="absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-red-600/90 hover:bg-red-500 text-white flex items-center justify-center text-[10px]"
                      title="حذف الصفحة"
                    >
                      <i className="fa-solid fa-trash"></i>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ==================== 3. EXPORT MULTI-PAGE PDF MODE ==================== */}
      {viewMode === 'export' && (
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 bg-slate-950">
          <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Pages Deck Grid */}
            <div className="lg:col-span-7 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-white">ترتيب صفحات المستند</h3>
                <button
                  type="button"
                  onClick={() => setViewMode('capture')}
                  className="min-h-[40px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-sky-300 text-xs font-bold flex items-center gap-1.5 transition whitespace-nowrap"
                >
                  <i className="fa-solid fa-camera"></i>
                  <span>إضافة صفحات أخرى</span>
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {pages.map((p, idx) => (
                  <div
                    key={p.id}
                    className="bg-slate-900 border border-white/10 rounded-2xl p-2 flex flex-col gap-2"
                  >
                    <div
                      onClick={() => {
                        setActivePageId(p.id);
                        setEditTab('enhance');
                        setViewMode('edit');
                      }}
                      className="aspect-[3/4] bg-white rounded-xl overflow-hidden cursor-pointer relative group"
                    >
                      <img
                        src={p.thumbnailDataUrl}
                        alt={`صفحة ${idx + 1}`}
                        className="w-full h-full object-contain"
                      />
                      <div className="absolute top-1.5 right-1.5 bg-slate-950/85 text-white text-[11px] font-black px-2 py-0.5 rounded-lg tabular-nums">
                        {idx + 1}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => handleMovePage(idx, -1)}
                          className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 flex items-center justify-center text-xs transition"
                          title="تقديم الصفحة"
                        >
                          <i className="fa-solid fa-chevron-right"></i>
                        </button>
                        <button
                          type="button"
                          disabled={idx === pages.length - 1}
                          onClick={() => handleMovePage(idx, 1)}
                          className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 flex items-center justify-center text-xs transition"
                          title="تأخير الصفحة"
                        >
                          <i className="fa-solid fa-chevron-left"></i>
                        </button>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setActivePageId(p.id);
                            setEditTab('crop');
                            setViewMode('edit');
                          }}
                          className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-sky-600 text-sky-300 hover:text-white flex items-center justify-center text-xs transition"
                          title="تعديل القص والتحسين"
                        >
                          <i className="fa-solid fa-pen"></i>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeletePage(p.id)}
                          className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-red-600 text-red-400 hover:text-white flex items-center justify-center text-xs transition"
                          title="حذف الصفحة"
                        >
                          <i className="fa-solid fa-trash"></i>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* PDF Settings & Export Actions */}
            <div className="lg:col-span-5">
              <div className="bg-slate-900 border border-white/10 rounded-3xl p-4 sm:p-5 space-y-4 sticky top-0">
                <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                  <i className="fa-solid fa-file-pdf text-rose-400"></i>
                  <span>إعدادات تصدير PDF</span>
                </h3>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-300">اسم الملف</label>
                  <input
                    type="text"
                    value={pdfFileName}
                    onChange={e => setPdfFileName(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-slate-950 border border-white/15 focus:border-sky-500 outline-none text-sm font-bold text-white"
                    placeholder="اكتب اسم ملف PDF..."
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-300">مقاس الصفحات</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPdfPageSize('a4')}
                      className={`min-h-[44px] px-3 rounded-xl border text-xs font-bold transition ${
                        pdfPageSize === 'a4'
                          ? 'bg-sky-600 border-sky-400 text-white'
                          : 'bg-slate-950 border-white/10 text-slate-300 hover:border-white/25'
                      }`}
                    >
                      A4 قياسي ذكي
                    </button>
                    <button
                      type="button"
                      onClick={() => setPdfPageSize('fit')}
                      className={`min-h-[44px] px-3 rounded-xl border text-xs font-bold transition ${
                        pdfPageSize === 'fit'
                          ? 'bg-sky-600 border-sky-400 text-white'
                          : 'bg-slate-950 border-white/10 text-slate-300 hover:border-white/25'
                      }`}
                    >
                      مقاس الصفحة الأصلي
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-300">دقة وجودة الملف</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPdfQuality('high')}
                      className={`min-h-[44px] px-3 rounded-xl border text-xs font-bold transition ${
                        pdfQuality === 'high'
                          ? 'bg-indigo-600 border-indigo-400 text-white'
                          : 'bg-slate-950 border-white/10 text-slate-300 hover:border-white/25'
                      }`}
                    >
                      عالية (للطباعة)
                    </button>
                    <button
                      type="button"
                      onClick={() => setPdfQuality('balanced')}
                      className={`min-h-[44px] px-3 rounded-xl border text-xs font-bold transition ${
                        pdfQuality === 'balanced'
                          ? 'bg-indigo-600 border-indigo-400 text-white'
                          : 'bg-slate-950 border-white/10 text-slate-300 hover:border-white/25'
                      }`}
                    >
                      خفيفة (للمشاركة)
                    </button>
                  </div>
                </div>

                <div className="pt-2 space-y-2.5">
                  <button
                    type="button"
                    disabled={isBusy || pages.length === 0}
                    onClick={handleSavePdfToFolder}
                    className="w-full min-h-[48px] px-4 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-extrabold flex items-center justify-center gap-2 transition shadow-xl"
                  >
                    <i className="fa-solid fa-cloud-arrow-up"></i>
                    <span>حفظ كملف PDF في المجلد</span>
                  </button>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={isBusy || pages.length === 0}
                      onClick={handleDownloadOrSharePdf}
                      className="min-h-[44px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition whitespace-nowrap"
                    >
                      <i className="fa-solid fa-download text-emerald-400"></i>
                      <span>تنزيل / مشاركة</span>
                    </button>
                    <button
                      type="button"
                      disabled={isBusy || pages.length === 0}
                      onClick={handleSavePagesAsImages}
                      className="min-h-[44px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition whitespace-nowrap"
                    >
                      <i className="fa-solid fa-images text-amber-400"></i>
                      <span>حفظ كصور</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Busy Overlay */}
      {isBusy && (
        <div className="fixed inset-0 z-[1700] bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3 p-4">
          <div className="w-12 h-12 border-4 border-sky-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-extrabold text-white text-center">{busyMessage || 'جاري المعالجة...'}</p>
        </div>
      )}
    </div>
  );
};

export default DocumentScannerModal;
