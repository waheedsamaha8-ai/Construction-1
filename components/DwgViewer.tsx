// @ts-nocheck
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { FileItem } from '../types';
import { api } from '../services/api';
import { dbService } from '../services/db';
import { printService } from '../services/printService';
import { openDwgInExternalApp } from './DwgController';
import {
    parseCadBuffer,
    createSampleStructuralCadDocument,
    CadDocument,
    CadLayer,
    CadPoint,
} from '../services/cadParser';

interface DwgViewerProps {
    item: FileItem;
    onClose: () => void;
}

type CadBgTheme = 'dark' | 'blueprint' | 'white';

interface MeasurementSegment {
    p1: CadPoint;
    p2: CadPoint;
    distance: number;
    dx: number;
    dy: number;
    angleDeg: number;
}

const THEME_CONFIG: Record<
    CadBgTheme,
    {
        label: string;
        bgHex: string;
        gridMinor: string;
        gridMajor: string;
        adaptiveStroke: string;
        badgeClass: string;
    }
> = {
    dark: {
        label: 'أسود أوتوكاد',
        bgHex: '#0b0f19',
        gridMinor: 'rgba(148, 163, 184, 0.08)',
        gridMajor: 'rgba(148, 163, 184, 0.18)',
        adaptiveStroke: '#f8fafc',
        badgeClass: 'bg-slate-900 text-white border-slate-700',
    },
    blueprint: {
        label: 'كحلي هندسي',
        bgHex: '#0f2547',
        gridMinor: 'rgba(125, 211, 252, 0.10)',
        gridMajor: 'rgba(125, 211, 252, 0.22)',
        adaptiveStroke: '#ffffff',
        badgeClass: 'bg-blue-950 text-sky-200 border-sky-700',
    },
    white: {
        label: 'أبيض للطباعة',
        bgHex: '#ffffff',
        gridMinor: 'rgba(15, 23, 42, 0.06)',
        gridMajor: 'rgba(15, 23, 42, 0.14)',
        adaptiveStroke: '#0f172a',
        badgeClass: 'bg-white text-slate-900 border-slate-300',
    },
};

const DwgViewer: React.FC<DwgViewerProps> = ({ item, onClose }) => {
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState<string>('جاري تحميل وتحليل المخطط الهندسي...');
    const [progress, setProgress] = useState(0);
    const [parseError, setParseError] = useState<string | null>(null);

    const [cadDoc, setCadDoc] = useState<CadDocument | null>(null);
    const [layers, setLayers] = useState<CadLayer[]>([]);
    const [layerSearch, setLayerSearch] = useState('');
    const [showLayersPanel, setShowLayersPanel] = useState(false);

    const [viewMode, setViewMode] = useState<'vector' | 'preview'>('vector');
    const [bgTheme, setBgTheme] = useState<CadBgTheme>('dark');
    const [showGrid, setShowGrid] = useState(true);
    const [showTexts, setShowTexts] = useState(true);

    // Measurement Tool State
    const [measureActive, setMeasureActive] = useState(false);
    const [measureStart, setMeasureStart] = useState<CadPoint | null>(null);
    const [cursorCadPos, setCursorCadPos] = useState<CadPoint | null>(null);
    const [snapPoint, setSnapPoint] = useState<CadPoint | null>(null);
    const [measurements, setMeasurements] = useState<MeasurementSegment[]>([]);

    // Menus & Sharing
    const [showActionsMenu, setShowActionsMenu] = useState(false);
    const [isSharing, setIsSharing] = useState(false);
    const localFileInputRef = useRef<HTMLInputElement>(null);

    // Canvas & Viewport Transform State (world CAD units -> screen pixels)
    const viewportRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    // Transform: screenX = panX + (cadX - bounds.minX) * zoom
    //            screenY = panY + (bounds.maxY - cadY) * zoom
    const viewRef = useRef<{ zoom: number; panX: number; panY: number; baseZoom: number }>({
        zoom: 1,
        panX: 0,
        panY: 0,
        baseZoom: 1,
    });
    const [zoomPercent, setZoomPercent] = useState(100);

    // Fallback Preview Image Zoom/Pan State
    const [imgScale, setImgScale] = useState(1);
    const [imgPos, setImgPos] = useState({ x: 0, y: 0 });
    const [isImgDragging, setIsImgDragging] = useState(false);
    const lastImgTouchRef = useRef<{ x: number; y: number; dist: number } | null>(null);

    const previewImage =
        cadDoc?.embeddedThumbnailUrl ||
        item.previewUrl?.replace(/=s\d+/, '=s1600') ||
        item.previewUrl ||
        item.thumbnailLink;

    const visibleLayerMap = useMemo(() => {
        const map = new Map<string, boolean>();
        for (const l of layers) {
            map.set(l.name, l.visible);
        }
        return map;
    }, [layers]);

    const filteredLayers = useMemo(() => {
        const q = layerSearch.trim().toLowerCase();
        if (!q) return layers;
        return layers.filter(l => l.name.toLowerCase().includes(q));
    }, [layers, layerSearch]);

    // Convert Screen (canvas CSS px) <-> CAD World Coordinates
    const screenToCad = useCallback(
        (sx: number, sy: number): CadPoint => {
            if (!cadDoc) return { x: 0, y: 0 };
            const { zoom, panX, panY } = viewRef.current;
            const { minX, maxY } = cadDoc.bounds;
            return {
                x: minX + (sx - panX) / zoom,
                y: maxY - (sy - panY) / zoom,
            };
        },
        [cadDoc]
    );

    const cadToScreen = useCallback(
        (cx: number, cy: number): CadPoint => {
            if (!cadDoc) return { x: 0, y: 0 };
            const { zoom, panX, panY } = viewRef.current;
            const { minX, maxY } = cadDoc.bounds;
            return {
                x: panX + (cx - minX) * zoom,
                y: panY + (maxY - cy) * zoom,
            };
        },
        [cadDoc]
    );

    // Fit CAD drawing to viewport (Zoom Extents)
    const fitToScreen = useCallback(
        (docToFit?: CadDocument | null) => {
            const targetDoc = docToFit ?? cadDoc;
            const vp = viewportRef.current;
            if (!targetDoc || !vp) return;

            const vw = vp.clientWidth || 800;
            const vh = vp.clientHeight || 600;
            const pad = Math.min(vw, vh) * 0.08;
            const availW = Math.max(100, vw - pad * 2);
            const availH = Math.max(100, vh - pad * 2);

            const bw = Math.max(1e-3, targetDoc.bounds.width);
            const bh = Math.max(1e-3, targetDoc.bounds.height);
            const fitZoom = Math.min(availW / bw, availH / bh);

            const drawW = bw * fitZoom;
            const drawH = bh * fitZoom;
            const panX = (vw - drawW) / 2;
            const panY = (vh - drawH) / 2;

            viewRef.current = {
                zoom: fitZoom,
                panX,
                panY,
                baseZoom: fitZoom,
            };
            setZoomPercent(100);
        },
        [cadDoc]
    );

    // Load & Parse CAD file on mount
    useEffect(() => {
        let active = true;

        const loadAndParse = async () => {
            setLoading(true);
            setParseError(null);
            setStatus('جاري فتح ملف الأوتوكاد...');
            setProgress(10);

            try {
                let blob: Blob | null = null;

                // 1. Check IndexedDB local cache first
                try {
                    const cached = await dbService.getBlob(item.id);
                    if (cached && cached.size > 0) {
                        blob = cached;
                    }
                } catch {}

                // 2. Download via API if not cached
                if (!blob) {
                    blob = await api.downloadFileBlob(item.id, p => {
                        if (active) setProgress(p);
                    });
                }

                if (!active) return;

                if (!blob || blob.size === 0) {
                    throw new Error('ملف المخطط فارغ أو غير متوفر محلياً.');
                }

                setStatus('جاري تحليل الطبقات والعناصر الهندسية (Vector)...');
                const buffer = await blob.arrayBuffer();
                if (!active) return;

                const parsed = await parseCadBuffer(buffer, item.name);
                if (!active) return;

                if (parsed.primitives.length === 0) {
                    throw new Error('لم يتم العثور على عناصر هندسية ثنائية الأبعاد (ModelSpace) داخل الملف.');
                }

                setCadDoc(parsed);
                setLayers(parsed.layers);
                setViewMode('vector');
                setStatus('');
                setTimeout(() => {
                    if (active) fitToScreen(parsed);
                }, 40);
            } catch (err: any) {
                console.warn('CAD parse warning:', err);
                if (!active) return;
                const msg = err?.message || 'تعذر قراءة البيانات الهندسية للملف.';
                setParseError(msg);
                // If we have a preview image, show preview tab automatically; otherwise offer sample or local file
                if (item.previewUrl || item.thumbnailLink) {
                    setViewMode('preview');
                }
                setStatus('');
            } finally {
                if (active) {
                    setLoading(false);
                    setProgress(0);
                }
            }
        };

        loadAndParse();
        return () => {
            active = false;
        };
    }, [item.id, item.name]);

    // Handle loading a local DWG/DXF file directly from user's device into the viewer
    const handleLocalCadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setLoading(true);
        setParseError(null);
        setStatus(`جاري قراءة المخطط: ${file.name}...`);
        try {
            const buffer = await file.arrayBuffer();
            const parsed = await parseCadBuffer(buffer, file.name);
            if (parsed.primitives.length === 0) {
                throw new Error('الملف لا يحتوي على عناصر رسومية قابلة للعرض.');
            }
            setCadDoc(parsed);
            setLayers(parsed.layers);
            setMeasurements([]);
            setMeasureStart(null);
            setViewMode('vector');
            setStatus('تم فتح المخطط بنجاح');
            setTimeout(() => {
                fitToScreen(parsed);
                setStatus('');
            }, 60);
        } catch (err: any) {
            setParseError(err?.message || 'تعذر تحليل ملف الأوتوكاد المحدد.');
            setStatus('');
        } finally {
            setLoading(false);
            if (localFileInputRef.current) localFileInputRef.current.value = '';
        }
    };

    const handleLoadSampleDrawing = () => {
        const sample = createSampleStructuralCadDocument(item.name.replace(/\.(dwg|dxf)$/i, ''));
        setCadDoc(sample);
        setLayers(sample.layers);
        setParseError(null);
        setMeasurements([]);
        setMeasureStart(null);
        setViewMode('vector');
        setTimeout(() => fitToScreen(sample), 40);
    };

    // High-DPI 2D Vector Canvas Render Loop
    const renderCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        const vp = viewportRef.current;
        if (!canvas || !vp || !cadDoc || viewMode !== 'vector') return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
        const width = vp.clientWidth;
        const height = vp.clientHeight;
        if (width <= 0 || height <= 0) return;

        if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(height * dpr);
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const theme = THEME_CONFIG[bgTheme];
        ctx.save();
        ctx.scale(dpr, dpr);

        // 1. Background Fill
        ctx.fillStyle = theme.bgHex;
        ctx.fillRect(0, 0, width, height);

        // 2. Engineering Grid
        if (showGrid) {
            const minorStep = 24;
            const majorStep = 120;
            const { panX, panY } = viewRef.current;

            ctx.lineWidth = 1;
            ctx.strokeStyle = theme.gridMinor;
            ctx.beginPath();
            const startMinorX = ((panX % minorStep) + minorStep) % minorStep;
            const startMinorY = ((panY % minorStep) + minorStep) % minorStep;
            for (let x = startMinorX; x < width; x += minorStep) {
                ctx.moveTo(x, 0);
                ctx.lineTo(x, height);
            }
            for (let y = startMinorY; y < height; y += minorStep) {
                ctx.moveTo(0, y);
                ctx.lineTo(width, y);
            }
            ctx.stroke();

            ctx.strokeStyle = theme.gridMajor;
            ctx.beginPath();
            const startMajorX = ((panX % majorStep) + majorStep) % majorStep;
            const startMajorY = ((panY % majorStep) + majorStep) % majorStep;
            for (let x = startMajorX; x < width; x += majorStep) {
                ctx.moveTo(x, 0);
                ctx.lineTo(x, height);
            }
            for (let y = startMajorY; y < height; y += majorStep) {
                ctx.moveTo(0, y);
                ctx.lineTo(width, y);
            }
            ctx.stroke();
        }

        // 3. Render CAD Vector Primitives
        const { zoom, panX, panY } = viewRef.current;
        const { minX, maxY } = cadDoc.bounds;
        const toSX = (cx: number) => panX + (cx - minX) * zoom;
        const toSY = (cy: number) => panY + (maxY - cy) * zoom;

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 1.15;

        for (const prim of cadDoc.primitives) {
            if (visibleLayerMap.get(prim.layer) === false) continue;
            if (prim.kind === 'text' && !showTexts) continue;

            const strokeColor = prim.isAdaptiveWhite ? theme.adaptiveStroke : prim.colorHex;
            ctx.strokeStyle = strokeColor;
            ctx.fillStyle = strokeColor;

            if (prim.kind === 'polyline') {
                const pts = prim.points;
                if (pts.length < 2) continue;

                // Quick screen-space frustum culling for segments
                let anyInBounds = false;
                for (let i = 0; i < pts.length; i++) {
                    const sx = toSX(pts[i].x);
                    const sy = toSY(pts[i].y);
                    if (sx >= -200 && sx <= width + 200 && sy >= -200 && sy <= height + 200) {
                        anyInBounds = true;
                        break;
                    }
                }
                if (!anyInBounds && pts.length > 4) continue;

                if (prim.dashed) {
                    ctx.setLineDash([8, 4, 2, 4]);
                }
                ctx.beginPath();
                ctx.moveTo(toSX(pts[0].x), toSY(pts[0].y));
                for (let i = 1; i < pts.length; i++) {
                    ctx.lineTo(toSX(pts[i].x), toSY(pts[i].y));
                }
                if (prim.closed) {
                    ctx.closePath();
                }
                if (prim.filled) {
                    ctx.globalAlpha = 0.28;
                    ctx.fill();
                    ctx.globalAlpha = 1.0;
                }
                ctx.stroke();
                if (prim.dashed) {
                    ctx.setLineDash([]);
                }
            } else if (prim.kind === 'circle') {
                const sx = toSX(prim.cx);
                const sy = toSY(prim.cy);
                const sr = prim.r * zoom;
                if (sr < 0.3) continue;
                if (sx + sr < 0 || sx - sr > width || sy + sr < 0 || sy - sr > height) continue;

                ctx.beginPath();
                ctx.arc(sx, sy, sr, 0, Math.PI * 2);
                ctx.stroke();
            } else if (prim.kind === 'arc') {
                const sx = toSX(prim.cx);
                const sy = toSY(prim.cy);
                const sr = prim.r * zoom;
                if (sr < 0.3) continue;
                if (sx + sr < 0 || sx - sr > width || sy + sr < 0 || sy - sr > height) continue;

                // Because screen Y is inverted relative to CAD Y, CAD angle +theta is screen angle -theta, and CCW in CAD is anticlockwise=true in canvas
                ctx.beginPath();
                ctx.arc(sx, sy, sr, -prim.startAngle, -prim.endAngle, prim.ccw !== false);
                ctx.stroke();
            } else if (prim.kind === 'ellipse') {
                const sx = toSX(prim.cx);
                const sy = toSY(prim.cy);
                const srx = prim.rx * zoom;
                const sry = prim.ry * zoom;
                const maxR = Math.max(srx, sry);
                if (maxR < 0.3) continue;
                if (sx + maxR < 0 || sx - maxR > width || sy + maxR < 0 || sy - maxR > height) continue;

                ctx.beginPath();
                ctx.ellipse(sx, sy, srx, sry, -prim.rotation, -prim.startAngle, -prim.endAngle, true);
                ctx.stroke();
            } else if (prim.kind === 'text') {
                const fontPx = prim.height * zoom;
                if (fontPx < 3.5 || fontPx > 400) continue;
                const sx = toSX(prim.x);
                const sy = toSY(prim.y);
                if (sx < -300 || sx > width + 300 || sy < -150 || sy > height + 150) continue;

                ctx.save();
                ctx.translate(sx, sy);
                if (prim.rotation) {
                    ctx.rotate(-prim.rotation);
                }
                ctx.font = `bold ${Math.max(8, Math.min(72, fontPx))}px "Cairo", "Segoe UI", Tahoma, sans-serif`;
                ctx.textAlign = prim.align;
                ctx.textBaseline = 'alphabetic';
                ctx.fillText(prim.text, 0, 0);
                ctx.restore();
            } else if (prim.kind === 'point') {
                const sx = toSX(prim.x);
                const sy = toSY(prim.y);
                if (sx < 0 || sx > width || sy < 0 || sy > height) continue;
                ctx.fillRect(sx - 1.5, sy - 1.5, 3, 3);
            }
        }

        // 4. Render Saved Measurements & Live Rubber-band Measurement
        const drawMeasurement = (p1: CadPoint, p2: CadPoint, isPreview = false) => {
            const s1 = { x: toSX(p1.x), y: toSY(p1.y) };
            const s2 = { x: toSX(p2.x), y: toSY(p2.y) };
            const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);

            ctx.save();
            ctx.strokeStyle = isPreview ? '#38bdf8' : '#10b981';
            ctx.fillStyle = isPreview ? '#38bdf8' : '#10b981';
            ctx.lineWidth = 2;
            if (isPreview) ctx.setLineDash([6, 4]);

            ctx.beginPath();
            ctx.moveTo(s1.x, s1.y);
            ctx.lineTo(s2.x, s2.y);
            ctx.stroke();
            ctx.setLineDash([]);

            // Endpoints
            [s1, s2].forEach(pt => {
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, 4.5, 0, Math.PI * 2);
                ctx.fill();
            });

            // Distance Badge at Midpoint
            const midX = (s1.x + s2.x) / 2;
            const midY = (s1.y + s2.y) / 2;
            const label = `${dist.toFixed(3)} m`;
            ctx.font = 'bold 12px "Cairo", monospace';
            const textW = ctx.measureText(label).width;
            const boxW = textW + 14;
            const boxH = 22;

            ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
            ctx.strokeStyle = isPreview ? '#38bdf8' : '#10b981';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.roundRect(midX - boxW / 2, midY - boxH - 6, boxW, boxH, 6);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, midX, midY - boxH / 2 - 6);
            ctx.restore();
        };

        for (const m of measurements) {
            drawMeasurement(m.p1, m.p2, false);
        }

        if (measureActive && measureStart && (snapPoint || cursorCadPos)) {
            drawMeasurement(measureStart, snapPoint || cursorCadPos!, true);
        }

        // 5. Render AutoCAD OSNAP Green Square Indicator when Measure Tool is active
        if (measureActive && snapPoint) {
            const sp = { x: toSX(snapPoint.x), y: toSY(snapPoint.y) };
            ctx.save();
            ctx.strokeStyle = '#22c55e';
            ctx.lineWidth = 2;
            ctx.strokeRect(sp.x - 6, sp.y - 6, 12, 12);
            ctx.restore();
        }

        ctx.restore();
    }, [
        cadDoc,
        viewMode,
        bgTheme,
        showGrid,
        showTexts,
        visibleLayerMap,
        measurements,
        measureActive,
        measureStart,
        snapPoint,
        cursorCadPos,
    ]);

    useEffect(() => {
        const raf = requestAnimationFrame(renderCanvas);
        return () => cancelAnimationFrame(raf);
    }, [renderCanvas]);

    // ResizeObserver for responsive canvas
    useEffect(() => {
        const vp = viewportRef.current;
        if (!vp) return;
        const ro = new ResizeObserver(() => {
            renderCanvas();
        });
        ro.observe(vp);
        return () => ro.disconnect();
    }, [renderCanvas]);

    // Find nearest OSNAP vertex within 18px screen distance
    const findNearestSnapPoint = useCallback(
        (screenX: number, screenY: number): CadPoint | null => {
            if (!cadDoc || cadDoc.snapPoints.length === 0) return null;
            const { zoom, panX, panY } = viewRef.current;
            const { minX, maxY } = cadDoc.bounds;
            const maxPixelDist = 18;
            let bestDist = maxPixelDist;
            let bestPt: CadPoint | null = null;

            for (let i = 0; i < cadDoc.snapPoints.length; i++) {
                const pt = cadDoc.snapPoints[i];
                const sx = panX + (pt.x - minX) * zoom;
                const sy = panY + (maxY - pt.y) * zoom;
                const d = Math.hypot(sx - screenX, sy - screenY);
                if (d < bestDist) {
                    bestDist = d;
                    bestPt = pt;
                }
            }
            return bestPt;
        },
        [cadDoc]
    );

    // Zoom around a specific screen focal point (fx, fy)
    const zoomAtScreenPoint = useCallback(
        (targetZoom: number, fx: number, fy: number) => {
            const prev = viewRef.current;
            const minZoom = prev.baseZoom * 0.1;
            const maxZoom = prev.baseZoom * 250;
            const nextZoom = Math.max(minZoom, Math.min(maxZoom, targetZoom));
            const ratio = prev.zoom > 0 ? nextZoom / prev.zoom : 1;

            const nextPanX = fx - (fx - prev.panX) * ratio;
            const nextPanY = fy - (fy - prev.panY) * ratio;

            viewRef.current = {
                ...prev,
                zoom: nextZoom,
                panX: nextPanX,
                panY: nextPanY,
            };
            setZoomPercent(Math.round((nextZoom / Math.max(1e-6, prev.baseZoom)) * 100));
            renderCanvas();
        },
        [renderCanvas]
    );

    // Native Touch & Mouse Gestures for Vector Canvas (Focal-Point Pinch Zoom + Pan + Measure Click)
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || viewMode !== 'vector' || !cadDoc) return;

        let gesture: {
            mode: 'pan' | 'pinch';
            startX: number;
            startY: number;
            lastX: number;
            lastY: number;
            dist: number;
            midX: number;
            midY: number;
            moved: boolean;
        } | null = null;
        let lastTapTime = 0;

        const handlePointSelect = (clientX: number, clientY: number) => {
            const rect = canvas.getBoundingClientRect();
            const sx = clientX - rect.left;
            const sy = clientY - rect.top;
            const snapped = findNearestSnapPoint(sx, sy);
            const targetPt = snapped || screenToCad(sx, sy);

            if (!measureStart) {
                setMeasureStart(targetPt);
            } else {
                const dx = targetPt.x - measureStart.x;
                const dy = targetPt.y - measureStart.y;
                const distance = Math.hypot(dx, dy);
                const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
                if (distance > 1e-4) {
                    setMeasurements(prev => [
                        ...prev,
                        { p1: measureStart, p2: targetPt, distance, dx, dy, angleDeg },
                    ]);
                }
                setMeasureStart(null);
            }
        };

        const onTouchStart = (e: TouchEvent) => {
            if (e.touches.length === 1) {
                const t = e.touches[0];
                gesture = {
                    mode: 'pan',
                    startX: t.clientX,
                    startY: t.clientY,
                    lastX: t.clientX,
                    lastY: t.clientY,
                    dist: 0,
                    midX: 0,
                    midY: 0,
                    moved: false,
                };
                if (measureActive) {
                    const rect = canvas.getBoundingClientRect();
                    const sx = t.clientX - rect.left;
                    const sy = t.clientY - rect.top;
                    setCursorCadPos(screenToCad(sx, sy));
                    setSnapPoint(findNearestSnapPoint(sx, sy));
                }
            } else if (e.touches.length === 2) {
                e.preventDefault();
                const rect = canvas.getBoundingClientRect();
                const t0 = e.touches[0];
                const t1 = e.touches[1];
                gesture = {
                    mode: 'pinch',
                    startX: 0,
                    startY: 0,
                    lastX: 0,
                    lastY: 0,
                    dist: Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY),
                    midX: (t0.clientX + t1.clientX) / 2 - rect.left,
                    midY: (t0.clientY + t1.clientY) / 2 - rect.top,
                    moved: true,
                };
            }
        };

        const onTouchMove = (e: TouchEvent) => {
            if (e.touches.length === 2) {
                e.preventDefault();
                const rect = canvas.getBoundingClientRect();
                const t0 = e.touches[0];
                const t1 = e.touches[1];
                const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
                const midX = (t0.clientX + t1.clientX) / 2 - rect.left;
                const midY = (t0.clientY + t1.clientY) / 2 - rect.top;

                if (!gesture || gesture.mode !== 'pinch') {
                    gesture = {
                        mode: 'pinch',
                        startX: 0,
                        startY: 0,
                        lastX: 0,
                        lastY: 0,
                        dist,
                        midX,
                        midY,
                        moved: true,
                    };
                    return;
                }

                const prev = viewRef.current;
                const scaleFactor = gesture.dist > 0 ? dist / gesture.dist : 1;
                const minZoom = prev.baseZoom * 0.1;
                const maxZoom = prev.baseZoom * 250;
                const nextZoom = Math.max(minZoom, Math.min(maxZoom, prev.zoom * scaleFactor));
                const ratio = prev.zoom > 0 ? nextZoom / prev.zoom : 1;

                viewRef.current = {
                    ...prev,
                    zoom: nextZoom,
                    panX: midX - (gesture.midX - prev.panX) * ratio,
                    panY: midY - (gesture.midY - prev.panY) * ratio,
                };
                gesture.dist = dist;
                gesture.midX = midX;
                gesture.midY = midY;
                setZoomPercent(Math.round((nextZoom / Math.max(1e-6, prev.baseZoom)) * 100));
                renderCanvas();
            } else if (e.touches.length === 1 && gesture && gesture.mode === 'pan') {
                e.preventDefault();
                const t = e.touches[0];
                const dx = t.clientX - gesture.lastX;
                const dy = t.clientY - gesture.lastY;
                if (Math.hypot(t.clientX - gesture.startX, t.clientY - gesture.startY) > 7) {
                    gesture.moved = true;
                }

                if (measureActive) {
                    const rect = canvas.getBoundingClientRect();
                    const sx = t.clientX - rect.left;
                    const sy = t.clientY - rect.top;
                    setCursorCadPos(screenToCad(sx, sy));
                    setSnapPoint(findNearestSnapPoint(sx, sy));
                }

                viewRef.current.panX += dx;
                viewRef.current.panY += dy;
                gesture.lastX = t.clientX;
                gesture.lastY = t.clientY;
                renderCanvas();
            }
        };

        const onTouchEnd = (e: TouchEvent) => {
            if (e.touches.length === 0 && gesture) {
                if (!gesture.moved && e.changedTouches.length > 0) {
                    const t = e.changedTouches[0];
                    if (measureActive) {
                        handlePointSelect(t.clientX, t.clientY);
                    } else {
                        const now = Date.now();
                        if (now - lastTapTime < 280) {
                            lastTapTime = 0;
                            const rect = canvas.getBoundingClientRect();
                            zoomAtScreenPoint(
                                viewRef.current.zoom * 1.85,
                                t.clientX - rect.left,
                                t.clientY - rect.top
                            );
                        } else {
                            lastTapTime = now;
                        }
                    }
                }
                gesture = null;
            }
        };

        canvas.addEventListener('touchstart', onTouchStart, { passive: false });
        canvas.addEventListener('touchmove', onTouchMove, { passive: false });
        canvas.addEventListener('touchend', onTouchEnd, { passive: false });
        canvas.addEventListener('touchcancel', onTouchEnd, { passive: false });

        return () => {
            canvas.removeEventListener('touchstart', onTouchStart);
            canvas.removeEventListener('touchmove', onTouchMove);
            canvas.removeEventListener('touchend', onTouchEnd);
            canvas.removeEventListener('touchcancel', onTouchEnd);
        };
    }, [
        viewMode,
        cadDoc,
        measureActive,
        measureStart,
        findNearestSnapPoint,
        screenToCad,
        zoomAtScreenPoint,
        renderCanvas,
    ]);

    // Mouse Handlers for Vector Canvas
    const mouseDragRef = useRef<{ startX: number; startY: number; lastX: number; lastY: number; moved: boolean } | null>(null);

    const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (e.button !== 0) return;
        mouseDragRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            lastX: e.clientX,
            lastY: e.clientY,
            moved: false,
        };
    };

    const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas || !cadDoc) return;
        const rect = canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;

        const cadPt = screenToCad(sx, sy);
        setCursorCadPos(cadPt);
        if (measureActive) {
            setSnapPoint(findNearestSnapPoint(sx, sy));
        }

        if (mouseDragRef.current) {
            const dx = e.clientX - mouseDragRef.current.lastX;
            const dy = e.clientY - mouseDragRef.current.lastY;
            if (Math.hypot(e.clientX - mouseDragRef.current.startX, e.clientY - mouseDragRef.current.startY) > 5) {
                mouseDragRef.current.moved = true;
            }
            viewRef.current.panX += dx;
            viewRef.current.panY += dy;
            mouseDragRef.current.lastX = e.clientX;
            mouseDragRef.current.lastY = e.clientY;
            renderCanvas();
        }
    };

    const handleCanvasMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const drag = mouseDragRef.current;
        mouseDragRef.current = null;
        if (!drag || drag.moved || !measureActive || !canvasRef.current) return;

        const rect = canvasRef.current.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const snapped = findNearestSnapPoint(sx, sy);
        const targetPt = snapped || screenToCad(sx, sy);

        if (!measureStart) {
            setMeasureStart(targetPt);
        } else {
            const dx = targetPt.x - measureStart.x;
            const dy = targetPt.y - measureStart.y;
            const distance = Math.hypot(dx, dy);
            const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
            if (distance > 1e-4) {
                setMeasurements(prev => [
                    ...prev,
                    { p1: measureStart, p2: targetPt, distance, dx, dy, angleDeg },
                ]);
            }
            setMeasureStart(null);
        }
    };

    const handleCanvasWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const fx = e.clientX - rect.left;
        const fy = e.clientY - rect.top;
        const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18;
        zoomAtScreenPoint(viewRef.current.zoom * factor, fx, fy);
    };

    // Layer Visibility Controls
    const toggleLayer = (layerName: string) => {
        setLayers(prev =>
            prev.map(l => (l.name === layerName ? { ...l, visible: !l.visible } : l))
        );
    };

    const toggleAllLayers = (visible: boolean) => {
        setLayers(prev => prev.map(l => ({ ...l, visible })));
    };

    // Export high-res PNG or Print CAD Sheet
    const handleExportPng = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const dataUrl = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `${item.name.replace(/\.(dwg|dxf)$/i, '')}_CAD.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    const handlePrintDrawing = () => {
        const canvas = canvasRef.current;
        const imgUrl = canvas && viewMode === 'vector' ? canvas.toDataURL('image/png') : previewImage;
        if (!imgUrl) return;

        const visibleLayersCount = layers.filter(l => l.visible).length;
        const html = `
            <div style="direction: rtl; font-family: 'Cairo', sans-serif; padding: 8px;">
                <div style="border: 2px solid #0f172a; border-radius: 12px; padding: 12px; background: #fff;">
                    <div style="text-align: center; margin-bottom: 12px;">
                        <img src="${imgUrl}" style="max-width: 100%; max-height: 72vh; object-fit: contain; border: 1px solid #cbd5e1; border-radius: 8px;" />
                    </div>
                    <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px;">
                        <tr>
                            <td style="border: 1px solid #cbd5e1; padding: 6px 10px; font-weight: bold; background: #f8fafc;">اسم اللوحة الهندسية</td>
                            <td style="border: 1px solid #cbd5e1; padding: 6px 10px;">${item.name}</td>
                            <td style="border: 1px solid #cbd5e1; padding: 6px 10px; font-weight: bold; background: #f8fafc;">الطبقات المعروضة</td>
                            <td style="border: 1px solid #cbd5e1; padding: 6px 10px;">${visibleLayersCount} / ${layers.length}</td>
                        </tr>
                    </table>
                </div>
            </div>
        `;
        printService.printReport(html, `مخطط هندسي - ${item.name}`, undefined, {
            showHeader: true,
            showFooter: true,
        });
    };

    const handleOpenInApp = async () => {
        setLoading(true);
        setStatus('جاري تحضير المخطط للفتح الخارجي...');
        try {
            await openDwgInExternalApp(item.id, item.name);
            setStatus('يرجى اختيار DWG FastView من القائمة');
        } catch {
            setStatus('فشل فتح الملف');
        } finally {
            setLoading(false);
            setTimeout(() => setStatus(''), 4000);
        }
    };

    const handleShare = async () => {
        if (isSharing) return;
        setIsSharing(true);
        try {
            const blob = await api.downloadFileBlob(item.id);
            const file = new File([blob], item.name, { type: blob.type || 'application/acad' });
            await api.shareSmart(item, file);
        } catch {
            alert('فشل تحضير الملف للمشاركة.');
        } finally {
            setIsSharing(false);
        }
    };

    // Fallback Preview Image Pan/Zoom Handlers
    const handleImgTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
        setIsImgDragging(true);
        if ('touches' in e) {
            if (e.touches.length === 1) {
                lastImgTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, dist: 0 };
            } else if (e.touches.length === 2) {
                const dist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                lastImgTouchRef.current = { x: 0, y: 0, dist };
            }
        } else {
            lastImgTouchRef.current = {
                x: (e as React.MouseEvent).clientX,
                y: (e as React.MouseEvent).clientY,
                dist: 0,
            };
        }
    };

    const handleImgTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
        if (!isImgDragging || !lastImgTouchRef.current) return;
        let clientX: number | undefined;
        let clientY: number | undefined;
        if ('touches' in e) {
            if (e.touches.length === 1) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            } else if (e.touches.length === 2) {
                const dist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                if (lastImgTouchRef.current.dist > 0) {
                    const delta = dist - lastImgTouchRef.current.dist;
                    setImgScale(prev => Math.min(Math.max(1, prev + delta * 0.01), 6));
                }
                lastImgTouchRef.current.dist = dist;
                return;
            }
        } else {
            clientX = (e as React.MouseEvent).clientX;
            clientY = (e as React.MouseEvent).clientY;
        }
        if (clientX !== undefined && clientY !== undefined) {
            const dx = clientX - lastImgTouchRef.current.x;
            const dy = clientY - lastImgTouchRef.current.y;
            setImgPos(prev => ({ x: prev.x + dx, y: prev.y + dy }));
            lastImgTouchRef.current = { ...lastImgTouchRef.current, x: clientX, y: clientY };
        }
    };

    const handleImgTouchEnd = () => {
        setIsImgDragging(false);
        lastImgTouchRef.current = null;
    };

    const cycleBgTheme = () => {
        setBgTheme(prev => (prev === 'dark' ? 'blueprint' : prev === 'blueprint' ? 'white' : 'dark'));
    };

    const lastMeasurement = measurements.length > 0 ? measurements[measurements.length - 1] : null;

    return (
        <div className="w-full h-full flex flex-col relative bg-[#0b0f19] overflow-hidden select-none">
            <input
                ref={localFileInputRef}
                type="file"
                accept=".dwg,.dxf"
                onChange={handleLocalCadFile}
                className="hidden"
            />

            {/* Top Engineering Header */}
            <div className="relative z-30 px-2.5 sm:px-4 py-2 flex justify-between items-center text-white border-b border-white/10 bg-[#0f172a]/95 backdrop-blur-md shadow-lg shrink-0">
                <div className="flex items-center gap-2 overflow-hidden min-w-0 flex-1 ml-2">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#c41e3a] to-rose-800 flex items-center justify-center text-white shadow-md shrink-0 border border-white/15">
                        <i className="fa-solid fa-compass-drafting text-xs"></i>
                    </div>
                    <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1.5">
                            <span className="font-bold text-xs sm:text-sm text-white truncate">
                                {item.name}
                            </span>
                            {cadDoc && (
                                <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
                                    {cadDoc.format} VECTOR
                                </span>
                            )}
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono truncate">
                            {cadDoc
                                ? `${layers.length} طبقة • ${cadDoc.totalEntities.toLocaleString()} عنصر هندسي`
                                : 'عارض الأوتوكاد التفاعلي المباشر'}
                        </span>
                    </div>
                </div>

                {/* Quick Engineering Controls */}
                <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                    {cadDoc && (
                        <>
                            {/* Layers Button */}
                            <button
                                type="button"
                                onClick={() => setShowLayersPanel(prev => !prev)}
                                className={`!min-h-0 h-8 px-2.5 rounded-xl flex items-center gap-1.5 text-[11px] font-bold transition border ${
                                    showLayersPanel
                                        ? 'bg-amber-500 text-slate-950 border-amber-300 shadow-md'
                                        : 'bg-white/10 hover:bg-white/20 text-white border-white/10'
                                }`}
                                title="التحكم في الطبقات (Layers)"
                            >
                                <i className="fa-solid fa-layer-group text-xs"></i>
                                <span className="hidden sm:inline">الطبقات</span>
                                <span className="text-[9px] px-1 py-0.2 rounded bg-black/30 font-mono">
                                    {layers.filter(l => l.visible).length}/{layers.length}
                                </span>
                            </button>

                            {/* Measure Tool Button */}
                            <button
                                type="button"
                                onClick={() => {
                                    setMeasureActive(prev => !prev);
                                    setMeasureStart(null);
                                }}
                                className={`!min-h-0 h-8 px-2.5 rounded-xl flex items-center gap-1.5 text-[11px] font-bold transition border ${
                                    measureActive
                                        ? 'bg-emerald-600 text-white border-emerald-400 shadow-md'
                                        : 'bg-white/10 hover:bg-white/20 text-white border-white/10'
                                }`}
                                title="أداة القياس الهندسي (Measure)"
                            >
                                <i className="fa-solid fa-ruler-combined text-xs"></i>
                                <span className="hidden sm:inline">قياس</span>
                            </button>

                            {/* Background Theme Switcher */}
                            <button
                                type="button"
                                onClick={cycleBgTheme}
                                className="!min-h-0 h-8 px-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/10 flex items-center gap-1.5 text-[11px] font-bold transition"
                                title={`تغيير الخلفية (${THEME_CONFIG[bgTheme].label})`}
                            >
                                <i className="fa-solid fa-palette text-xs text-sky-300"></i>
                                <span className="hidden md:inline">{THEME_CONFIG[bgTheme].label}</span>
                            </button>
                        </>
                    )}

                    {/* Options Menu Button */}
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => setShowActionsMenu(prev => !prev)}
                            className={`!min-h-0 w-8 h-8 rounded-xl flex items-center justify-center transition text-xs border ${
                                showActionsMenu
                                    ? 'bg-indigo-600 text-white border-indigo-400'
                                    : 'bg-white/10 hover:bg-white/20 text-white border-white/10'
                            }`}
                            title="خيارات المخطط"
                        >
                            {loading || isSharing ? (
                                <i className="fa-solid fa-circle-notch fa-spin text-xs text-yellow-300"></i>
                            ) : (
                                <i className="fa-solid fa-ellipsis-vertical text-xs"></i>
                            )}
                        </button>

                        {showActionsMenu && (
                            <>
                                <div
                                    className="fixed inset-0 z-[90]"
                                    onClick={() => setShowActionsMenu(false)}
                                ></div>
                                <div className="absolute left-0 top-10 w-64 bg-slate-900/95 backdrop-blur-xl border border-slate-700 rounded-2xl shadow-2xl p-2 z-[100] space-y-1 text-white animate-scale-in origin-top-left">
                                    <div className="px-2.5 py-1 border-b border-slate-800 flex items-center justify-between">
                                        <span className="text-[10px] font-bold text-slate-400">
                                            أدوات وخيارات الأوتوكاد
                                        </span>
                                        <i className="fa-solid fa-compass-drafting text-[10px] text-red-400"></i>
                                    </div>

                                    {cadDoc && (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setShowActionsMenu(false);
                                                    fitToScreen();
                                                }}
                                                className="!min-h-0 w-full px-3 py-2 rounded-xl hover:bg-white/10 flex items-center gap-2.5 transition text-xs font-bold"
                                            >
                                                <div className="w-7 h-7 rounded-lg bg-slate-800 text-teal-400 flex items-center justify-center shrink-0">
                                                    <i className="fa-solid fa-expand text-xs"></i>
                                                </div>
                                                <span>ملاءمة المخطط للشاشة (Zoom Extents)</span>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setShowTexts(prev => !prev);
                                                    setShowActionsMenu(false);
                                                }}
                                                className="!min-h-0 w-full px-3 py-2 rounded-xl hover:bg-white/10 flex items-center gap-2.5 transition text-xs font-bold"
                                            >
                                                <div className="w-7 h-7 rounded-lg bg-slate-800 text-amber-400 flex items-center justify-center shrink-0">
                                                    <i className="fa-solid fa-font text-xs"></i>
                                                </div>
                                                <span>{showTexts ? 'إخفاء النصوص والأبعاد' : 'إظهار النصوص والأبعاد'}</span>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setShowGrid(prev => !prev);
                                                    setShowActionsMenu(false);
                                                }}
                                                className="!min-h-0 w-full px-3 py-2 rounded-xl hover:bg-white/10 flex items-center gap-2.5 transition text-xs font-bold"
                                            >
                                                <div className="w-7 h-7 rounded-lg bg-slate-800 text-sky-400 flex items-center justify-center shrink-0">
                                                    <i className="fa-solid fa-border-all text-xs"></i>
                                                </div>
                                                <span>{showGrid ? 'إخفاء الشبكة الهندسية' : 'إظهار الشبكة الهندسية'}</span>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setShowActionsMenu(false);
                                                    handleExportPng();
                                                }}
                                                className="!min-h-0 w-full px-3 py-2 rounded-xl hover:bg-white/10 flex items-center gap-2.5 transition text-xs font-bold"
                                            >
                                                <div className="w-7 h-7 rounded-lg bg-slate-800 text-purple-400 flex items-center justify-center shrink-0">
                                                    <i className="fa-solid fa-image text-xs"></i>
                                                </div>
                                                <span>تصدير المخطط كصورة (PNG)</span>
                                            </button>
                                        </>
                                    )}

                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowActionsMenu(false);
                                            handlePrintDrawing();
                                        }}
                                        className="!min-h-0 w-full px-3 py-2 rounded-xl hover:bg-white/10 flex items-center gap-2.5 transition text-xs font-bold"
                                    >
                                        <div className="w-7 h-7 rounded-lg bg-slate-800 text-indigo-400 flex items-center justify-center shrink-0">
                                            <i className="fa-solid fa-print text-xs"></i>
                                        </div>
                                        <span>طباعة / تصدير PDF</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowActionsMenu(false);
                                            localFileInputRef.current?.click();
                                        }}
                                        className="!min-h-0 w-full px-3 py-2 rounded-xl hover:bg-white/10 flex items-center gap-2.5 transition text-xs font-bold"
                                    >
                                        <div className="w-7 h-7 rounded-lg bg-slate-800 text-cyan-400 flex items-center justify-center shrink-0">
                                            <i className="fa-solid fa-folder-open text-xs"></i>
                                        </div>
                                        <span>فتح ملف DWG / DXF من الجهاز</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowActionsMenu(false);
                                            handleShare();
                                        }}
                                        disabled={isSharing}
                                        className="!min-h-0 w-full px-3 py-2 rounded-xl hover:bg-white/10 flex items-center gap-2.5 transition text-xs font-bold"
                                    >
                                        <div className="w-7 h-7 rounded-lg bg-slate-800 text-emerald-400 flex items-center justify-center shrink-0">
                                            <i className="fa-solid fa-share-nodes text-xs"></i>
                                        </div>
                                        <span>مشاركة المخطط</span>
                                    </button>

                                    <div className="border-t border-slate-800 pt-1">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setShowActionsMenu(false);
                                                handleOpenInApp();
                                            }}
                                            disabled={loading}
                                            className="!min-h-0 w-full px-3 py-2 rounded-xl bg-[#c41e3a] hover:bg-[#a01830] text-white flex items-center gap-2.5 transition shadow-md text-xs font-bold disabled:opacity-50"
                                        >
                                            <div className="w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
                                                <i className="fa-solid fa-cube text-xs"></i>
                                            </div>
                                            <span>فتح خارجي (DWG FastView)</span>
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Close Button */}
                    <button
                        type="button"
                        onClick={onClose}
                        className="!min-h-0 w-8 h-8 rounded-xl bg-white/10 hover:bg-red-500/80 text-white flex items-center justify-center transition text-xs border border-white/10"
                        title="إغلاق"
                    >
                        <i className="fa-solid fa-times text-xs"></i>
                    </button>
                </div>
            </div>

            {/* Interactive Measurement Banner when active */}
            {(measureActive || measurements.length > 0) && (
                <div className="relative z-20 bg-slate-900/95 border-b border-emerald-500/30 px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-white">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold text-[11px]">
                            <i className="fa-solid fa-ruler-combined"></i>
                            {measureActive
                                ? measureStart
                                    ? 'حدد النقطة الثانية على المخطط (يدعم الالتقاط التلقائي OSNAP)'
                                    : 'حدد النقطة الأولى للقياس على المخطط'
                                : 'نتائج القياس'}
                        </span>
                        {lastMeasurement && (
                            <div className="flex items-center gap-2 font-mono text-[11px] bg-black/40 px-2.5 py-0.5 rounded-lg border border-white/10">
                                <span className="text-emerald-400 font-bold">
                                    L = {lastMeasurement.distance.toFixed(3)}
                                </span>
                                <span className="text-slate-400">|</span>
                                <span className="text-sky-300">
                                    ΔX = {Math.abs(lastMeasurement.dx).toFixed(3)}
                                </span>
                                <span className="text-slate-400">|</span>
                                <span className="text-amber-300">
                                    ΔY = {Math.abs(lastMeasurement.dy).toFixed(3)}
                                </span>
                                <span className="text-slate-400">|</span>
                                <span className="text-purple-300">
                                    ∠ {lastMeasurement.angleDeg.toFixed(1)}°
                                </span>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-1.5">
                        {measurements.length > 0 && (
                            <button
                                type="button"
                                onClick={() => {
                                    setMeasurements([]);
                                    setMeasureStart(null);
                                }}
                                className="!min-h-0 px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-[11px] font-bold transition"
                            >
                                مسح القياسات ({measurements.length})
                            </button>
                        )}
                        {measureActive && (
                            <button
                                type="button"
                                onClick={() => {
                                    setMeasureActive(false);
                                    setMeasureStart(null);
                                }}
                                className="!min-h-0 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[11px] font-bold transition"
                            >
                                إنهاء القياس
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Main CAD Viewport */}
            <div ref={viewportRef} className="flex-1 relative z-10 overflow-hidden flex items-center justify-center">
                {/* Loading Overlay */}
                {loading && (
                    <div className="absolute inset-0 z-40 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
                        <div className="relative w-16 h-16 flex items-center justify-center mb-4">
                            <div className="absolute inset-0 border-4 border-red-500/25 rounded-full"></div>
                            <div className="absolute inset-0 border-4 border-[#c41e3a] border-t-transparent rounded-full animate-spin"></div>
                            <i className="fa-solid fa-compass-drafting text-xl text-white"></i>
                        </div>
                        <p className="text-white font-bold text-sm mb-1">
                            {status || 'جاري قراءة وتحليل المخطط الهندسي...'}
                        </p>
                        {progress > 0 && (
                            <span className="text-xs font-mono text-emerald-400">{progress}%</span>
                        )}
                    </div>
                )}

                {/* Vector Canvas Mode */}
                {cadDoc && viewMode === 'vector' && (
                    <canvas
                        ref={canvasRef}
                        onMouseDown={handleCanvasMouseDown}
                        onMouseMove={handleCanvasMouseMove}
                        onMouseUp={handleCanvasMouseUp}
                        onMouseLeave={() => {
                            mouseDragRef.current = null;
                        }}
                        onWheel={handleCanvasWheel}
                        onDoubleClick={e => {
                            if (measureActive) return;
                            const rect = e.currentTarget.getBoundingClientRect();
                            zoomAtScreenPoint(
                                viewRef.current.zoom * 1.85,
                                e.clientX - rect.left,
                                e.clientY - rect.top
                            );
                        }}
                        className={`w-full h-full block touch-none ${
                            measureActive ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'
                        }`}
                    />
                )}

                {/* Preview Image Mode (if user toggled or fallback with thumbnail) */}
                {(!cadDoc || viewMode === 'preview') && previewImage && !loading && (
                    <div
                        className="w-full h-full flex items-center justify-center cursor-move active:cursor-grabbing touch-none"
                        onMouseDown={handleImgTouchStart}
                        onMouseMove={handleImgTouchMove}
                        onMouseUp={handleImgTouchEnd}
                        onMouseLeave={handleImgTouchEnd}
                        onTouchStart={handleImgTouchStart}
                        onTouchMove={handleImgTouchMove}
                        onTouchEnd={handleImgTouchEnd}
                        onWheel={e => {
                            const delta = e.deltaY > 0 ? -0.15 : 0.15;
                            setImgScale(prev => Math.min(Math.max(1, prev + delta), 6));
                        }}
                    >
                        <img
                            src={previewImage}
                            alt="DWG Preview"
                            className="max-w-none shadow-2xl bg-white transition-transform duration-75"
                            style={{
                                transform: `scale(${imgScale}) translate(${imgPos.x / imgScale}px, ${imgPos.y / imgScale}px)`,
                                maxWidth: '92%',
                                maxHeight: '92%',
                                objectFit: 'contain',
                            }}
                            draggable={false}
                        />
                    </div>
                )}

                {/* Empty / Error State with Direct Local File Open & Interactive Structural Sample */}
                {!cadDoc && !previewImage && !loading && (
                    <div className="max-w-md w-full mx-4 bg-slate-900/90 border border-slate-700/80 rounded-3xl p-6 text-center shadow-2xl backdrop-blur-md animate-fade-in">
                        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#c41e3a]/20 to-rose-900/30 border border-red-500/30 flex items-center justify-center mx-auto mb-4">
                            <i className="fa-solid fa-compass-drafting text-3xl text-red-400"></i>
                        </div>
                        <h2 className="text-base sm:text-lg font-extrabold text-white mb-2">
                            عارض الأوتوكاد التفاعلي (DWG / DXF)
                        </h2>
                        <p className="text-slate-300 text-xs leading-relaxed mb-5">
                            {parseError ||
                                'يمكنك فتح واستعراض ملفات الأوتوكاد (DWG و DXF) كرسوم متجهة (Vector) بدقة كاملة مع التحكم في الطبقات والقياس.'}
                        </p>
                        <div className="flex flex-col gap-2.5">
                            <button
                                type="button"
                                onClick={() => localFileInputRef.current?.click()}
                                className="!min-h-0 w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition"
                            >
                                <i className="fa-solid fa-folder-open"></i>
                                <span>اختيار ملف DWG أو DXF من جهازك</span>
                            </button>
                            <button
                                type="button"
                                onClick={handleLoadSampleDrawing}
                                className="!min-h-0 w-full py-2.5 px-4 rounded-xl bg-emerald-600/90 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition"
                            >
                                <i className="fa-solid fa-drafting-compass"></i>
                                <span>فتح مخطط إنشائي تفاعلي نموذجي (محاور وقواعد)</span>
                            </button>
                            <button
                                type="button"
                                onClick={handleOpenInApp}
                                className="!min-h-0 w-full py-2 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 font-bold text-xs flex items-center justify-center gap-2 border border-white/10 transition"
                            >
                                <i className="fa-solid fa-cube text-red-400"></i>
                                <span>فتح بواسطة تطبيق DWG FastView الخارجي</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* Layers Control Drawer */}
                {showLayersPanel && cadDoc && (
                    <div className="absolute top-3 right-3 bottom-14 w-72 max-w-[88vw] bg-slate-900/95 backdrop-blur-xl border border-slate-700 rounded-2xl shadow-2xl z-30 flex flex-col overflow-hidden animate-scale-in">
                        <div className="px-3.5 py-2.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
                            <div className="flex items-center gap-2">
                                <i className="fa-solid fa-layer-group text-amber-400 text-xs"></i>
                                <span className="font-bold text-xs text-white">
                                    طبقات المخطط ({layers.length})
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowLayersPanel(false)}
                                className="!min-h-0 w-6 h-6 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 flex items-center justify-center text-[10px]"
                            >
                                <i className="fa-solid fa-times"></i>
                            </button>
                        </div>

                        <div className="p-2.5 border-b border-slate-800 space-y-2">
                            <div className="relative">
                                <input
                                    type="text"
                                    value={layerSearch}
                                    onChange={e => setLayerSearch(e.target.value)}
                                    placeholder="بحث في أسماء الطبقات..."
                                    className="w-full bg-slate-800/90 text-white text-xs rounded-xl pr-8 pl-3 py-1.5 border border-slate-700 focus:outline-none focus:border-amber-400"
                                />
                                <i className="fa-solid fa-search text-slate-400 text-[10px] absolute right-3 top-1/2 -translate-y-1/2"></i>
                            </div>
                            <div className="flex gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => toggleAllLayers(true)}
                                    className="!min-h-0 flex-1 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold transition"
                                >
                                    إظهار الكل
                                </button>
                                <button
                                    type="button"
                                    onClick={() => toggleAllLayers(false)}
                                    className="!min-h-0 flex-1 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[10px] font-bold transition"
                                >
                                    إخفاء الكل
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                            {filteredLayers.map(layer => (
                                <button
                                    key={layer.name}
                                    type="button"
                                    onClick={() => toggleLayer(layer.name)}
                                    className={`!min-h-0 w-full px-2.5 py-2 rounded-xl flex items-center justify-between gap-2 text-right transition border ${
                                        layer.visible
                                            ? 'bg-slate-800/80 hover:bg-slate-800 border-slate-700/80 text-white'
                                            : 'bg-slate-900/40 border-slate-800/50 text-slate-500 opacity-60'
                                    }`}
                                >
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <span
                                            className="w-3.5 h-3.5 rounded-md shrink-0 border border-white/25 shadow-sm"
                                            style={{ backgroundColor: layer.colorHex }}
                                        />
                                        <span className="text-xs font-bold truncate" dir="auto">
                                            {layer.name}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className="text-[10px] font-mono text-slate-400 bg-black/30 px-1.5 py-0.5 rounded">
                                            {layer.entityCount}
                                        </span>
                                        <i
                                            className={`fa-solid ${
                                                layer.visible
                                                    ? 'fa-eye text-emerald-400'
                                                    : 'fa-eye-slash text-slate-600'
                                            } text-xs`}
                                        ></i>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Floating Zoom & Fit Toolbar (Bottom Left) */}
                {cadDoc && viewMode === 'vector' && (
                    <div className="absolute bottom-3 left-3 z-20 flex items-center gap-1 bg-slate-900/90 backdrop-blur-md border border-white/15 rounded-2xl p-1 shadow-xl text-white">
                        <button
                            type="button"
                            onClick={() => {
                                const vp = viewportRef.current;
                                if (!vp) return;
                                zoomAtScreenPoint(
                                    viewRef.current.zoom * 1.25,
                                    vp.clientWidth / 2,
                                    vp.clientHeight / 2
                                );
                            }}
                            className="!min-h-0 w-7 h-7 rounded-xl hover:bg-white/15 flex items-center justify-center text-xs transition"
                            title="تكبير (Zoom In)"
                        >
                            <i className="fa-solid fa-plus"></i>
                        </button>
                        <button
                            type="button"
                            onClick={() => fitToScreen()}
                            className="!min-h-0 px-2 h-7 rounded-xl hover:bg-white/15 flex items-center justify-center text-[10px] font-mono font-bold transition"
                            title="ملاءمة للشاشة (Fit Extents)"
                        >
                            {zoomPercent}%
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                const vp = viewportRef.current;
                                if (!vp) return;
                                zoomAtScreenPoint(
                                    viewRef.current.zoom / 1.25,
                                    vp.clientWidth / 2,
                                    vp.clientHeight / 2
                                );
                            }}
                            className="!min-h-0 w-7 h-7 rounded-xl hover:bg-white/15 flex items-center justify-center text-xs transition"
                            title="تصغير (Zoom Out)"
                        >
                            <i className="fa-solid fa-minus"></i>
                        </button>
                        <button
                            type="button"
                            onClick={() => fitToScreen()}
                            className="!min-h-0 w-7 h-7 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-xs text-teal-300 transition"
                            title="إعادة ضبط الأبعاد (Fit)"
                        >
                            <i className="fa-solid fa-compress"></i>
                        </button>
                    </div>
                )}

                {/* Live CAD Coordinates Readout (Bottom Right) */}
                {cadDoc && viewMode === 'vector' && cursorCadPos && (
                    <div
                        dir="ltr"
                        className="absolute bottom-3 right-3 z-20 hidden sm:flex items-center gap-2 bg-slate-900/85 backdrop-blur-md border border-white/10 rounded-xl px-2.5 py-1 text-[10px] font-mono text-slate-300 pointer-events-none"
                    >
                        <span className="text-emerald-400 font-bold">XY</span>
                        <span>X: {cursorCadPos.x.toFixed(2)}</span>
                        <span>Y: {cursorCadPos.y.toFixed(2)}</span>
                        {snapPoint && (
                            <span className="text-green-400 font-bold">[OSNAP]</span>
                        )}
                    </div>
                )}

                {/* Status Toast */}
                {status && !loading && (
                    <div className="absolute bottom-14 left-1/2 -translate-x-1/2 bg-black/80 text-white px-4 py-2 rounded-xl text-xs font-bold border border-white/10 backdrop-blur-md text-center animate-slide-up z-30">
                        {status}
                    </div>
                )}
            </div>
        </div>
    );
};

export default DwgViewer;
