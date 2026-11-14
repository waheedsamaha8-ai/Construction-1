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
type MeasureMode = 'ortho_both' | 'ortho_lock' | 'inclined';
type CropAction = 'export_png' | 'print_pdf' | null;

interface MeasurementSegment {
    p1: CadPoint;
    p2: CadPoint;
    distance: number;
    dx: number;
    dy: number;
    angleDeg: number;
    mode: MeasureMode;
}

interface CropRect {
    x: number;
    y: number;
    w: number;
    h: number;
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
    const [measureMode, setMeasureMode] = useState<MeasureMode>('ortho_both');
    const [measureStart, setMeasureStart] = useState<CadPoint | null>(null);
    const [cursorCadPos, setCursorCadPos] = useState<CadPoint | null>(null);
    const [snapPoint, setSnapPoint] = useState<CadPoint | null>(null);
    const [measurements, setMeasurements] = useState<MeasurementSegment[]>([]);

    // Menus, Sharing & Cached Blob
    const [showActionsMenu, setShowActionsMenu] = useState(false);
    const [showShareModal, setShowShareModal] = useState(false);
    const [isSharing, setIsSharing] = useState(false);
    const loadedBlobRef = useRef<Blob | null>(null);
    const localFileInputRef = useRef<HTMLInputElement>(null);

    // Window Selection (Crop) State for Print / Export PNG
    const [cropAction, setCropAction] = useState<CropAction>(null);
    const [cropRect, setCropRect] = useState<CropRect>({ x: 60, y: 60, w: 320, h: 240 });
    const [cropWhiteBg, setCropWhiteBg] = useState<boolean>(false);
    const cropDragRef = useRef<{
        type: 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'draw';
        startX: number;
        startY: number;
        initialRect: CropRect;
    } | null>(null);

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

                loadedBlobRef.current = blob;

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
            loadedBlobRef.current = file;
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

        const { zoom, panX, panY } = viewRef.current;
        const { minX, maxY } = cadDoc.bounds;
        const toSX = (cx: number) => panX + (cx - minX) * zoom;
        const toSY = (cy: number) => panY + (maxY - cy) * zoom;

        // 2. World-Coordinate Engineering Grid (scales & aligns with CAD drawing on zoom/pan)
        if (showGrid && zoom > 0) {
            const targetMinorPx = 28;
            const rawWorldStep = targetMinorPx / zoom;
            const mag = Math.pow(10, Math.floor(Math.log10(Math.max(1e-9, rawWorldStep))));
            const res = rawWorldStep / mag;
            const minorWorldStep = res >= 5 ? 5 * mag : res >= 2 ? 2 * mag : mag;
            const majorWorldStep = minorWorldStep * 5;

            const worldLeft = minX + (0 - panX) / zoom;
            const worldRight = minX + (width - panX) / zoom;
            const worldTop = maxY - (0 - panY) / zoom;
            const worldBottom = maxY - (height - panY) / zoom;

            const startMinorWX = Math.floor(worldLeft / minorWorldStep) * minorWorldStep;
            const startMinorWY = Math.floor(worldBottom / minorWorldStep) * minorWorldStep;

            ctx.lineWidth = 1;
            ctx.strokeStyle = theme.gridMinor;
            ctx.beginPath();
            for (let wx = startMinorWX; wx <= worldRight; wx += minorWorldStep) {
                const sx = toSX(wx);
                ctx.moveTo(sx, 0);
                ctx.lineTo(sx, height);
            }
            for (let wy = startMinorWY; wy <= worldTop; wy += minorWorldStep) {
                const sy = toSY(wy);
                ctx.moveTo(0, sy);
                ctx.lineTo(width, sy);
            }
            ctx.stroke();

            const startMajorWX = Math.floor(worldLeft / majorWorldStep) * majorWorldStep;
            const startMajorWY = Math.floor(worldBottom / majorWorldStep) * majorWorldStep;

            ctx.strokeStyle = theme.gridMajor;
            ctx.beginPath();
            for (let wx = startMajorWX; wx <= worldRight; wx += majorWorldStep) {
                const sx = toSX(wx);
                ctx.moveTo(sx, 0);
                ctx.lineTo(sx, height);
            }
            for (let wy = startMajorWY; wy <= worldTop; wy += majorWorldStep) {
                const sy = toSY(wy);
                ctx.moveTo(0, sy);
                ctx.lineTo(width, sy);
            }
            ctx.stroke();
        }

        // 3. Render CAD Vector Primitives
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 1.1;

        for (const prim of cadDoc.primitives) {
            if (visibleLayerMap.get(prim.layer) === false) continue;
            if (!showTexts && (prim.kind === 'text' || prim.isDimension)) continue;

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
                if (fontPx < 1.2 || fontPx > 900) continue;
                const sx = toSX(prim.x);
                const sy = toSY(prim.y);
                if (sx < -600 || sx > width + 600 || sy < -200 || sy > height + 200) continue;

                const isArabicText = /[\u0600-\u06FF]/.test(prim.text);
                ctx.save();
                ctx.translate(sx, sy);
                if (prim.rotation) {
                    ctx.rotate(-prim.rotation);
                }
                const wf = prim.widthFactor && prim.widthFactor > 0.1 ? prim.widthFactor : isArabicText ? 0.88 : 0.92;
                if (Math.abs(wf - 1) > 0.01) {
                    ctx.scale(wf, 1);
                }
                ctx.direction = isArabicText ? 'rtl' : 'ltr';
                ctx.font = `500 ${fontPx.toFixed(2)}px "Cairo", "Segoe UI", Tahoma, sans-serif`;
                ctx.textAlign = prim.align;
                ctx.textBaseline = prim.valign || 'alphabetic';
                ctx.fillText(prim.text, 0, 0);
                ctx.restore();
            } else if (prim.kind === 'point') {
                const sx = toSX(prim.x);
                const sy = toSY(prim.y);
                if (sx < 0 || sx > width || sy < 0 || sy > height) continue;
                ctx.fillRect(sx - 1.5, sy - 1.5, 3, 3);
            }
        }

        // Helper to draw a crisp floating badge on canvas
        const drawDimBadge = (
            x: number,
            y: number,
            text: string,
            borderColor: string,
            textColor = '#ffffff'
        ) => {
            ctx.save();
            ctx.direction = 'rtl';
            ctx.font = 'bold 11px "Cairo", monospace';
            const textW = ctx.measureText(text).width;
            const boxW = textW + 14;
            const boxH = 21;

            ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
            ctx.strokeStyle = borderColor;
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.roundRect(x - boxW / 2, y - boxH / 2, boxW, boxH, 6);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = textColor;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, x, y);
            ctx.restore();
        };

        // Helper to draw AutoCAD-style Snap Point (نقطة السناب) with square + crosshair + label
        const drawSnapMarker = (pt: CadPoint, label: string, colorHex: string) => {
            const sp = { x: toSX(pt.x), y: toSY(pt.y) };
            ctx.save();
            ctx.strokeStyle = colorHex;
            ctx.fillStyle = colorHex;
            ctx.lineWidth = 2.2;
            ctx.strokeRect(sp.x - 7, sp.y - 7, 14, 14);

            ctx.beginPath();
            ctx.moveTo(sp.x - 12, sp.y);
            ctx.lineTo(sp.x + 12, sp.y);
            ctx.moveTo(sp.x, sp.y - 12);
            ctx.lineTo(sp.x, sp.y + 12);
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(sp.x, sp.y, 2.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            drawDimBadge(sp.x, sp.y - 22, label, colorHex, '#ffffff');
        };

        // 4. Render Saved Measurements & Live Rubber-band Dimensions (Orthogonal or Inclined)
        const drawMeasurement = (
            p1: CadPoint,
            rawP2: CadPoint,
            segMode: MeasureMode,
            isPreview = false
        ) => {
            const p2: CadPoint =
                segMode === 'ortho_lock'
                    ? Math.abs(rawP2.x - p1.x) >= Math.abs(rawP2.y - p1.y)
                        ? { x: rawP2.x, y: p1.y }
                        : { x: p1.x, y: rawP2.y }
                    : rawP2;

            const s1 = { x: toSX(p1.x), y: toSY(p1.y) };
            const s2 = { x: toSX(p2.x), y: toSY(p2.y) };
            const corner = { x: s2.x, y: s1.y };

            const absDx = Math.abs(p2.x - p1.x);
            const absDy = Math.abs(p2.y - p1.y);
            const directDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
            const angleDeg = (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI;
            const screenDx = Math.abs(s2.x - s1.x);
            const screenDy = Math.abs(s2.y - s1.y);

            ctx.save();

            if (segMode === 'inclined') {
                // Direct Inclined / Diagonal Measurement Line (وضع مائل)
                if (directDist > 1e-4) {
                    const incColor = isPreview ? '#c084fc' : '#a855f7';
                    ctx.strokeStyle = incColor;
                    ctx.fillStyle = incColor;
                    ctx.lineWidth = 2.4;
                    if (isPreview) ctx.setLineDash([7, 4]);
                    ctx.beginPath();
                    ctx.moveTo(s1.x, s1.y);
                    ctx.lineTo(s2.x, s2.y);
                    ctx.stroke();
                    ctx.setLineDash([]);

                    // Perpendicular end ticks at s1 and s2
                    const sLen = Math.hypot(s2.x - s1.x, s2.y - s1.y);
                    if (sLen > 4) {
                        const nx = -(s2.y - s1.y) / sLen;
                        const ny = (s2.x - s1.x) / sLen;
                        [s1, s2].forEach(pt => {
                            ctx.beginPath();
                            ctx.moveTo(pt.x - nx * 7, pt.y - ny * 7);
                            ctx.lineTo(pt.x + nx * 7, pt.y + ny * 7);
                            ctx.stroke();
                        });
                    }

                    const midX = (s1.x + s2.x) / 2;
                    const midY = (s1.y + s2.y) / 2 - 18;
                    drawDimBadge(
                        midX,
                        midY,
                        `مائل: ${directDist.toFixed(2)} م (${Math.abs(angleDeg).toFixed(1)}°)`,
                        incColor,
                        '#e9d5ff'
                    );
                }
            } else {
                // Subtle reference line between p1 and p2 if both ΔX and ΔY exist
                if (screenDx > 4 && screenDy > 4) {
                    ctx.strokeStyle = isPreview
                        ? 'rgba(148, 163, 184, 0.45)'
                        : 'rgba(148, 163, 184, 0.35)';
                    ctx.lineWidth = 1.2;
                    ctx.setLineDash([4, 4]);
                    ctx.beginPath();
                    ctx.moveTo(s1.x, s1.y);
                    ctx.lineTo(s2.x, s2.y);
                    ctx.stroke();
                    ctx.setLineDash([]);

                    const sq = Math.min(10, screenDx * 0.3, screenDy * 0.3);
                    const dirX = s1.x < corner.x ? -1 : 1;
                    const dirY = s2.y > corner.y ? 1 : -1;
                    ctx.strokeStyle = '#94a3b8';
                    ctx.lineWidth = 1.2;
                    ctx.strokeRect(
                        dirX > 0 ? corner.x : corner.x - sq,
                        dirY > 0 ? corner.y : corner.y - sq,
                        sq,
                        sq
                    );
                }

                // A) Horizontal Dimension Line (بعد أفقي ΔX)
                if (absDx > 1e-4) {
                    const hColor = isPreview ? '#38bdf8' : '#10b981';
                    ctx.strokeStyle = hColor;
                    ctx.fillStyle = hColor;
                    ctx.lineWidth = 2.2;
                    if (isPreview) ctx.setLineDash([6, 4]);
                    ctx.beginPath();
                    ctx.moveTo(s1.x, s1.y);
                    ctx.lineTo(corner.x, corner.y);
                    ctx.stroke();
                    ctx.setLineDash([]);

                    [s1, corner].forEach(pt => {
                        ctx.beginPath();
                        ctx.moveTo(pt.x, pt.y - 6);
                        ctx.lineTo(pt.x, pt.y + 6);
                        ctx.stroke();
                    });

                    const hMidX = (s1.x + corner.x) / 2;
                    const hMidY = s1.y + (s2.y >= s1.y ? -18 : 18);
                    drawDimBadge(hMidX, hMidY, `أفقي: ${absDx.toFixed(2)} م`, hColor, '#38bdf8');
                }

                // B) Vertical Dimension Line (بعد عمودي ΔY)
                if (absDy > 1e-4) {
                    const vColor = isPreview ? '#fbbf24' : '#f59e0b';
                    ctx.strokeStyle = vColor;
                    ctx.fillStyle = vColor;
                    ctx.lineWidth = 2.2;
                    if (isPreview) ctx.setLineDash([6, 4]);
                    ctx.beginPath();
                    ctx.moveTo(corner.x, corner.y);
                    ctx.lineTo(s2.x, s2.y);
                    ctx.stroke();
                    ctx.setLineDash([]);

                    [corner, s2].forEach(pt => {
                        ctx.beginPath();
                        ctx.moveTo(pt.x - 6, pt.y);
                        ctx.lineTo(pt.x + 6, pt.y);
                        ctx.stroke();
                    });

                    const vMidX = corner.x + (s2.x >= s1.x ? 48 : -48);
                    const vMidY = (corner.y + s2.y) / 2;
                    drawDimBadge(vMidX, vMidY, `عمودي: ${absDy.toFixed(2)} م`, vColor, '#fbbf24');
                }
            }

            // Start & End Anchor Dots on saved measurements
            if (!isPreview) {
                [s1, s2].forEach((pt, idx) => {
                    ctx.fillStyle = idx === 0 ? '#22c55e' : '#f59e0b';
                    ctx.beginPath();
                    ctx.arc(pt.x, pt.y, 4.5, 0, Math.PI * 2);
                    ctx.fill();
                });
            }

            ctx.restore();
        };

        if (showTexts || measureActive) {
            for (const m of measurements) {
                drawMeasurement(m.p1, m.p2, m.mode || 'ortho_both', false);
            }
        }

        const activeTargetPt = snapPoint || cursorCadPos;
        if (measureActive && measureStart && activeTargetPt) {
            drawMeasurement(measureStart, activeTargetPt, measureMode, true);
        }

        // 5. Render AutoCAD OSNAP Indicators for Start Point (نقطة البداية) & End Point (نقطة النهاية)
        if (measureActive) {
            if (measureStart) {
                drawSnapMarker(measureStart, 'نقطة البداية (سناب)', '#22c55e');
                if (activeTargetPt) {
                    const effectiveEnd =
                        measureMode === 'ortho_lock'
                            ? Math.abs(activeTargetPt.x - measureStart.x) >=
                              Math.abs(activeTargetPt.y - measureStart.y)
                                ? { x: activeTargetPt.x, y: measureStart.y }
                                : { x: measureStart.x, y: activeTargetPt.y }
                            : activeTargetPt;
                    drawSnapMarker(
                        effectiveEnd,
                        snapPoint ? 'نقطة النهاية (سناب)' : 'نقطة النهاية',
                        '#f59e0b'
                    );
                }
            } else if (activeTargetPt) {
                drawSnapMarker(
                    activeTargetPt,
                    snapPoint ? 'نقطة البداية (سناب)' : 'حدد نقطة البداية',
                    '#22c55e'
                );
            }
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
        measureMode,
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

    // Find nearest OSNAP vertex, midpoint, or nearest point on a visible line/polyline segment
    const findNearestSnapPoint = useCallback(
        (screenX: number, screenY: number): CadPoint | null => {
            if (!cadDoc) return null;
            const { zoom, panX, panY } = viewRef.current;
            const { minX, maxY } = cadDoc.bounds;
            const maxVertexDist = 28;
            let bestDist = maxVertexDist;
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

            if (bestPt && bestDist <= 18) {
                return bestPt;
            }

            let bestSegDist = bestPt ? bestDist : 24;
            for (let pIdx = 0; pIdx < cadDoc.primitives.length; pIdx++) {
                const prim = cadDoc.primitives[pIdx];
                if (prim.kind !== 'polyline' || visibleLayerMap.get(prim.layer) === false) continue;
                const pts = prim.points;
                for (let i = 0; i < pts.length - 1; i++) {
                    const a = pts[i];
                    const b = pts[i + 1];
                    const ax = panX + (a.x - minX) * zoom;
                    const ay = panY + (maxY - a.y) * zoom;
                    const bx = panX + (b.x - minX) * zoom;
                    const by = panY + (maxY - b.y) * zoom;

                    const abx = bx - ax;
                    const aby = by - ay;
                    const lenSq = abx * abx + aby * aby;
                    if (lenSq < 1e-4) continue;
                    const t = Math.max(0, Math.min(1, ((screenX - ax) * abx + (screenY - ay) * aby) / lenSq));
                    const projScreenX = ax + t * abx;
                    const projScreenY = ay + t * aby;
                    const d = Math.hypot(projScreenX - screenX, projScreenY - screenY);
                    if (d < bestSegDist) {
                        bestSegDist = d;
                        bestPt = {
                            x: a.x + t * (b.x - a.x),
                            y: a.y + t * (b.y - a.y),
                        };
                    }
                }
            }

            return bestPt;
        },
        [cadDoc, visibleLayerMap]
    );

    // When Measure Tool is activated, immediately show an initial Snap Point near viewport center
    useEffect(() => {
        if (measureActive && cadDoc && viewportRef.current) {
            const cx = viewportRef.current.clientWidth / 2;
            const cy = viewportRef.current.clientHeight / 2;
            const initialSnap = findNearestSnapPoint(cx, cy);
            const initialCad = initialSnap || screenToCad(cx, cy);
            setCursorCadPos(initialCad);
            setSnapPoint(initialSnap || initialCad);
        }
    }, [measureActive, cadDoc, findNearestSnapPoint, screenToCad]);

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

    const commitPointSelection = useCallback(
        (sx: number, sy: number) => {
            const snapped = findNearestSnapPoint(sx, sy);
            const rawPt = snapped || screenToCad(sx, sy);
            setCursorCadPos(rawPt);
            setSnapPoint(snapped || rawPt);

            if (!measureStart) {
                setMeasureStart(rawPt);
            } else {
                const targetPt: CadPoint =
                    measureMode === 'ortho_lock'
                        ? Math.abs(rawPt.x - measureStart.x) >= Math.abs(rawPt.y - measureStart.y)
                            ? { x: rawPt.x, y: measureStart.y }
                            : { x: measureStart.x, y: rawPt.y }
                        : rawPt;

                const dx = targetPt.x - measureStart.x;
                const dy = targetPt.y - measureStart.y;
                const distance = Math.hypot(dx, dy);
                const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
                if (distance > 1e-4) {
                    setMeasurements(prev => [
                        ...prev,
                        { p1: measureStart, p2: targetPt, distance, dx, dy, angleDeg, mode: measureMode },
                    ]);
                }
                setMeasureStart(null);
            }
        },
        [findNearestSnapPoint, screenToCad, measureStart, measureMode]
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
                    const snapped = findNearestSnapPoint(sx, sy);
                    const cadPt = snapped || screenToCad(sx, sy);
                    setCursorCadPos(cadPt);
                    setSnapPoint(snapped || cadPt);
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
                if (Math.hypot(t.clientX - gesture.startX, t.clientY - gesture.startY) > 9) {
                    gesture.moved = true;
                }

                if (measureActive) {
                    const rect = canvas.getBoundingClientRect();
                    const sx = t.clientX - rect.left;
                    const sy = t.clientY - rect.top;
                    const snapped = findNearestSnapPoint(sx, sy);
                    const cadPt = snapped || screenToCad(sx, sy);
                    setCursorCadPos(cadPt);
                    setSnapPoint(snapped || cadPt);
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
                        const rect = canvas.getBoundingClientRect();
                        commitPointSelection(t.clientX - rect.left, t.clientY - rect.top);
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
        findNearestSnapPoint,
        screenToCad,
        commitPointSelection,
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
            const snapped = findNearestSnapPoint(sx, sy);
            setSnapPoint(snapped || cadPt);
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
        commitPointSelection(sx, sy);
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

    // Start Window Selection (Crop) Mode for Export PNG or Print PDF
    const openWindowSelector = (action: 'export_png' | 'print_pdf') => {
        const vp = viewportRef.current;
        const vw = vp?.clientWidth || 800;
        const vh = vp?.clientHeight || 600;
        const w = Math.round(vw * 0.78);
        const h = Math.round(vh * 0.74);
        setCropRect({
            x: Math.round((vw - w) / 2),
            y: Math.round((vh - h) / 2),
            w,
            h,
        });
        setCropWhiteBg(action === 'print_pdf');
        setCropAction(action);
    };

    // Render the selected screen window (cropRect) to a high-resolution dataURL
    const generateCroppedCadDataUrl = useCallback(
        (rect: CropRect, forceWhiteBg: boolean): string | null => {
            const vp = viewportRef.current;
            const canvas = canvasRef.current;
            if (!vp) return null;

            // If in vector mode and cadDoc is loaded, render the exact crop window at high DPI
            if (cadDoc && viewMode === 'vector') {
                const exportScale = 2.5;
                const outCanvas = document.createElement('canvas');
                outCanvas.width = Math.max(100, Math.round(rect.w * exportScale));
                outCanvas.height = Math.max(100, Math.round(rect.h * exportScale));
                const ctx = outCanvas.getContext('2d');
                if (!ctx) return null;

                const theme = forceWhiteBg ? THEME_CONFIG.white : THEME_CONFIG[bgTheme];
                ctx.save();
                ctx.scale(exportScale, exportScale);

                // Background
                ctx.fillStyle = theme.bgHex;
                ctx.fillRect(0, 0, rect.w, rect.h);

                // Translate so cropRect.x, cropRect.y becomes (0,0)
                ctx.translate(-rect.x, -rect.y);

                const { zoom, panX, panY } = viewRef.current;
                const { minX, maxY } = cadDoc.bounds;
                const toSX = (cx: number) => panX + (cx - minX) * zoom;
                const toSY = (cy: number) => panY + (maxY - cy) * zoom;

                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.lineWidth = 1.15;

                for (const prim of cadDoc.primitives) {
                    if (visibleLayerMap.get(prim.layer) === false) continue;
                    if (!showTexts && (prim.kind === 'text' || prim.isDimension)) continue;

                    const strokeColor = prim.isAdaptiveWhite
                        ? theme.adaptiveStroke
                        : forceWhiteBg && prim.colorHex.toLowerCase() === '#ffffff'
                        ? '#0f172a'
                        : prim.colorHex;
                    ctx.strokeStyle = strokeColor;
                    ctx.fillStyle = strokeColor;

                    if (prim.kind === 'polyline') {
                        const pts = prim.points;
                        if (pts.length < 2) continue;
                        if (prim.dashed) ctx.setLineDash([8, 4, 2, 4]);
                        ctx.beginPath();
                        ctx.moveTo(toSX(pts[0].x), toSY(pts[0].y));
                        for (let i = 1; i < pts.length; i++) {
                            ctx.lineTo(toSX(pts[i].x), toSY(pts[i].y));
                        }
                        if (prim.closed) ctx.closePath();
                        if (prim.filled) {
                            ctx.globalAlpha = 0.28;
                            ctx.fill();
                            ctx.globalAlpha = 1.0;
                        }
                        ctx.stroke();
                        if (prim.dashed) ctx.setLineDash([]);
                    } else if (prim.kind === 'circle') {
                        const sx = toSX(prim.cx);
                        const sy = toSY(prim.cy);
                        const sr = prim.r * zoom;
                        if (sr < 0.3) continue;
                        ctx.beginPath();
                        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
                        ctx.stroke();
                    } else if (prim.kind === 'arc') {
                        const sx = toSX(prim.cx);
                        const sy = toSY(prim.cy);
                        const sr = prim.r * zoom;
                        if (sr < 0.3) continue;
                        ctx.beginPath();
                        ctx.arc(sx, sy, sr, -prim.startAngle, -prim.endAngle, prim.ccw !== false);
                        ctx.stroke();
                    } else if (prim.kind === 'ellipse') {
                        const sx = toSX(prim.cx);
                        const sy = toSY(prim.cy);
                        const srx = prim.rx * zoom;
                        const sry = prim.ry * zoom;
                        if (Math.max(srx, sry) < 0.3) continue;
                        ctx.beginPath();
                        ctx.ellipse(sx, sy, srx, sry, -prim.rotation, -prim.startAngle, -prim.endAngle, true);
                        ctx.stroke();
                    } else if (prim.kind === 'text') {
                        const fontPx = prim.height * zoom;
                        if (fontPx < 1.2 || fontPx > 900) continue;
                        const sx = toSX(prim.x);
                        const sy = toSY(prim.y);
                        const isArabicText = /[\u0600-\u06FF]/.test(prim.text);
                        ctx.save();
                        ctx.translate(sx, sy);
                        if (prim.rotation) ctx.rotate(-prim.rotation);
                        const wf =
                            prim.widthFactor && prim.widthFactor > 0.1
                                ? prim.widthFactor
                                : isArabicText
                                ? 0.88
                                : 0.92;
                        if (Math.abs(wf - 1) > 0.01) ctx.scale(wf, 1);
                        ctx.direction = isArabicText ? 'rtl' : 'ltr';
                        ctx.font = `500 ${fontPx.toFixed(2)}px "Cairo", "Segoe UI", Tahoma, sans-serif`;
                        ctx.textAlign = prim.align;
                        ctx.textBaseline = prim.valign || 'alphabetic';
                        ctx.fillText(prim.text, 0, 0);
                        ctx.restore();
                    }
                }

                ctx.restore();
                return outCanvas.toDataURL('image/png');
            }

            if (canvas) {
                return canvas.toDataURL('image/png');
            }
            return previewImage || null;
        },
        [cadDoc, viewMode, bgTheme, visibleLayerMap, showTexts, previewImage]
    );

    const handleConfirmCropAction = () => {
        const dataUrl = generateCroppedCadDataUrl(cropRect, cropWhiteBg);
        const currentAction = cropAction;
        setCropAction(null);
        if (!dataUrl) return;

        if (currentAction === 'export_png') {
            const a = document.createElement('a');
            a.href = dataUrl;
            a.download = `${item.name.replace(/\.(dwg|dxf)$/i, '')}_CAD.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setStatus('تم تصدير الجزء المحدد كصورة PNG عالية الدقة');
            setTimeout(() => setStatus(''), 3000);
        } else if (currentAction === 'print_pdf') {
            const visibleLayersCount = layers.filter(l => l.visible).length;
            const html = `
                <div style="direction: rtl; font-family: 'Cairo', sans-serif; padding: 8px;">
                    <div style="border: 2px solid #0f172a; border-radius: 12px; padding: 12px; background: #fff;">
                        <div style="text-align: center; margin-bottom: 12px;">
                            <img src="${dataUrl}" style="max-width: 100%; max-height: 75vh; object-fit: contain; border: 1px solid #cbd5e1; border-radius: 8px;" />
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
        }
    };

    // Window Selection Pointer Drag/Resize Handlers
    const startCropDrag = (
        type: 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'draw',
        clientX: number,
        clientY: number
    ) => {
        const vp = viewportRef.current;
        if (!vp) return;
        const vpRect = vp.getBoundingClientRect();
        const localX = clientX - vpRect.left;
        const localY = clientY - vpRect.top;

        if (type === 'draw') {
            const newRect = { x: localX, y: localY, w: 10, h: 10 };
            setCropRect(newRect);
            cropDragRef.current = {
                type: 'draw',
                startX: localX,
                startY: localY,
                initialRect: newRect,
            };
        } else {
            cropDragRef.current = {
                type,
                startX: localX,
                startY: localY,
                initialRect: { ...cropRect },
            };
        }
    };

    const moveCropDrag = (clientX: number, clientY: number) => {
        const drag = cropDragRef.current;
        const vp = viewportRef.current;
        if (!drag || !vp) return;
        const vpRect = vp.getBoundingClientRect();
        const vw = vp.clientWidth;
        const vh = vp.clientHeight;
        const curX = Math.max(8, Math.min(vw - 8, clientX - vpRect.left));
        const curY = Math.max(8, Math.min(vh - 8, clientY - vpRect.top));
        const dx = curX - drag.startX;
        const dy = curY - drag.startY;
        const r = drag.initialRect;
        const minSize = 60;

        if (drag.type === 'move') {
            const nx = Math.max(8, Math.min(vw - r.w - 8, r.x + dx));
            const ny = Math.max(8, Math.min(vh - r.h - 8, r.y + dy));
            setCropRect({ x: nx, y: ny, w: r.w, h: r.h });
        } else if (drag.type === 'draw') {
            const x = Math.min(drag.startX, curX);
            const y = Math.min(drag.startY, curY);
            const w = Math.max(minSize, Math.abs(curX - drag.startX));
            const h = Math.max(minSize, Math.abs(curY - drag.startY));
            setCropRect({ x, y, w, h });
        } else if (drag.type === 'se') {
            const nw = Math.max(minSize, Math.min(vw - r.x - 8, r.w + dx));
            const nh = Math.max(minSize, Math.min(vh - r.y - 8, r.h + dy));
            setCropRect({ ...r, w: nw, h: nh });
        } else if (drag.type === 'sw') {
            const nx = Math.max(8, Math.min(r.x + r.w - minSize, r.x + dx));
            const nw = r.x + r.w - nx;
            const nh = Math.max(minSize, Math.min(vh - r.y - 8, r.h + dy));
            setCropRect({ x: nx, y: r.y, w: nw, h: nh });
        } else if (drag.type === 'ne') {
            const ny = Math.max(8, Math.min(r.y + r.h - minSize, r.y + dy));
            const nh = r.y + r.h - ny;
            const nw = Math.max(minSize, Math.min(vw - r.x - 8, r.w + dx));
            setCropRect({ x: r.x, y: ny, w: nw, h: nh });
        } else if (drag.type === 'nw') {
            const nx = Math.max(8, Math.min(r.x + r.w - minSize, r.x + dx));
            const ny = Math.max(8, Math.min(r.y + r.h - minSize, r.y + dy));
            setCropRect({
                x: nx,
                y: ny,
                w: r.x + r.w - nx,
                h: r.y + r.h - ny,
            });
        }
    };

    const endCropDrag = () => {
        cropDragRef.current = null;
    };

    // Open in External Mobile App (DWG FastView / AutoCAD Mobile) using cached Blob immediately
    const handleOpenInApp = async () => {
        setStatus('جاري فتح المخطط في تطبيق الأوتوكاد الخارجي...');
        try {
            await openDwgInExternalApp(item.id, item.name, loadedBlobRef.current, true);
            setStatus('اختر تطبيق DWG FastView أو AutoCAD من القائمة');
        } catch {
            setStatus('تم تنزيل ملف المخطط لفتحه في التطبيق الخارجي');
        } finally {
            setTimeout(() => setStatus(''), 4000);
        }
    };

    // Share CAD File (Native File Share / PNG Share / Link Share)
    const handleNativeShareFile = async () => {
        setIsSharing(true);
        try {
            let blob = loadedBlobRef.current;
            if (!blob) {
                blob = await api.downloadFileBlob(item.id);
                loadedBlobRef.current = blob;
            }
            const safeName =
                item.name.toLowerCase().endsWith('.dwg') || item.name.toLowerCase().endsWith('.dxf')
                    ? item.name
                    : `${item.name}.dwg`;
            const file = new File([blob], safeName, { type: 'application/octet-stream' });

            if (navigator.share) {
                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        files: [file],
                        title: safeName,
                        text: `مخطط هندسي: ${safeName}`,
                    });
                    setShowShareModal(false);
                    return;
                }
                const shareUrl = item.webViewLink || item.url || window.location.href;
                await navigator.share({
                    title: safeName,
                    text: `مخطط هندسي: ${safeName}`,
                    url: shareUrl,
                });
                setShowShareModal(false);
                return;
            }
            // Fallback: trigger download
            await openDwgInExternalApp(item.id, safeName, blob, false);
            setStatus('تم تحميل الملف لمشاركته');
            setTimeout(() => setStatus(''), 3000);
        } catch (err: any) {
            if (err?.name !== 'AbortError') {
                setStatus('تم تجهيز الملف للمشاركة');
                setTimeout(() => setStatus(''), 3000);
            }
        } finally {
            setIsSharing(false);
        }
    };

    const handleShareAsImage = async () => {
        setIsSharing(true);
        try {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const blob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            if (!blob) return;
            const imgName = `${item.name.replace(/\.(dwg|dxf)$/i, '')}_CAD.png`;
            const file = new File([blob], imgName, { type: 'image/png' });

            if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: imgName,
                    text: `صورة مخطط: ${item.name}`,
                });
                setShowShareModal(false);
                return;
            }
            const dataUrl = canvas.toDataURL('image/png');
            const a = document.createElement('a');
            a.href = dataUrl;
            a.download = imgName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setShowShareModal(false);
            setStatus('تم حفظ صورة المخطط لمشاركتها');
            setTimeout(() => setStatus(''), 3000);
        } catch (err: any) {
            if (err?.name !== 'AbortError') {
                setStatus('تعذر مشاركة الصورة مباشرة');
                setTimeout(() => setStatus(''), 3000);
            }
        } finally {
            setIsSharing(false);
        }
    };

    const handleCopyShareLink = async () => {
        const shareUrl =
            item.webViewLink ||
            item.url ||
            `https://drive.google.com/file/d/${item.id}/view`;
        try {
            await navigator.clipboard.writeText(shareUrl);
            setShowShareModal(false);
            setStatus('تم نسخ رابط المخطط إلى الحافظة بنجاح');
            setTimeout(() => setStatus(''), 3000);
        } catch {
            setStatus(shareUrl);
        }
    };

    const handleWhatsAppShare = () => {
        const shareUrl =
            item.webViewLink ||
            item.url ||
            `https://drive.google.com/file/d/${item.id}/view`;
        const text = encodeURIComponent(`مخطط أوتوكاد هندسي: ${item.name}\n${shareUrl}`);
        window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer');
        setShowShareModal(false);
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

                {/* Quick Engineering Controls (3-dots Menu + Close Button) */}
                <div className="flex items-center gap-1.5 shrink-0">
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => setShowActionsMenu(prev => !prev)}
                            className={`!min-h-0 w-8 h-8 rounded-xl flex items-center justify-center transition text-xs border ${
                                showActionsMenu
                                    ? 'bg-indigo-600 text-white border-indigo-400'
                                    : 'bg-white/10 hover:bg-white/20 text-white border-white/10'
                            }`}
                            title="خيارات وأدوات المخطط"
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
                                <div className="absolute left-0 top-10 w-64 sm:w-72 bg-slate-900/95 backdrop-blur-xl border border-slate-700 rounded-2xl shadow-2xl p-1.5 z-[100] space-y-0.5 text-white animate-scale-in origin-top-left max-h-[84vh] overflow-y-auto custom-scrollbar">
                                    <div className="px-2.5 py-1 border-b border-slate-800 flex items-center justify-between">
                                        <span className="text-[10px] font-bold text-slate-400">
                                            أدوات وخيارات الأوتوكاد
                                        </span>
                                        <i className="fa-solid fa-compass-drafting text-[10px] text-red-400"></i>
                                    </div>

                                    {cadDoc && (
                                        <>
                                            {/* 1. Layers Control */}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setShowActionsMenu(false);
                                                    setShowLayersPanel(prev => !prev);
                                                }}
                                                className={`!min-h-0 w-full px-2.5 py-1.5 rounded-xl flex items-center justify-between gap-2 transition text-[10px] sm:text-[11px] font-bold ${
                                                    showLayersPanel
                                                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                                        : 'hover:bg-white/10 text-white'
                                                }`}
                                            >
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <div className="w-6 h-6 rounded-lg bg-slate-800 text-amber-400 flex items-center justify-center shrink-0">
                                                        <i className="fa-solid fa-layer-group text-[10px]"></i>
                                                    </div>
                                                    <span className="truncate whitespace-nowrap">
                                                        التحكم في الطبقات (Layers)
                                                    </span>
                                                </div>
                                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-black/40 border border-white/10 font-mono text-amber-300 shrink-0">
                                                    {layers.filter(l => l.visible).length}/{layers.length}
                                                </span>
                                            </button>

                                            {/* 2. Engineering Measurement Tool */}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setShowActionsMenu(false);
                                                    setMeasureActive(prev => !prev);
                                                    setMeasureStart(null);
                                                }}
                                                className={`!min-h-0 w-full px-2.5 py-1.5 rounded-xl flex items-center justify-between gap-2 transition text-[10px] sm:text-[11px] font-bold ${
                                                    measureActive
                                                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                                        : 'hover:bg-white/10 text-white'
                                                }`}
                                            >
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <div className="w-6 h-6 rounded-lg bg-slate-800 text-emerald-400 flex items-center justify-center shrink-0">
                                                        <i className="fa-solid fa-ruler-combined text-[10px]"></i>
                                                    </div>
                                                    <span className="truncate whitespace-nowrap">
                                                        أداة القياس (أفقي / عمودي / مائل)
                                                    </span>
                                                </div>
                                                <span
                                                    className={`text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0 ${
                                                        measureActive
                                                            ? 'bg-emerald-500 text-slate-950'
                                                            : 'bg-slate-800 text-slate-400'
                                                    }`}
                                                >
                                                    {measureActive ? 'مفعل' : 'تفعيل'}
                                                </span>
                                            </button>

                                            {/* 3. Background Theme Switcher */}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    cycleBgTheme();
                                                }}
                                                className="!min-h-0 w-full px-2.5 py-1.5 rounded-xl hover:bg-white/10 flex items-center justify-between gap-2 transition text-[10px] sm:text-[11px] font-bold"
                                            >
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <div className="w-6 h-6 rounded-lg bg-slate-800 text-sky-400 flex items-center justify-center shrink-0">
                                                        <i className="fa-solid fa-palette text-[10px]"></i>
                                                    </div>
                                                    <span className="truncate whitespace-nowrap">
                                                        تغيير لون الخلفية
                                                    </span>
                                                </div>
                                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-sky-300 border border-slate-700 shrink-0">
                                                    {THEME_CONFIG[bgTheme].label}
                                                </span>
                                            </button>

                                            <div className="border-t border-slate-800 my-1"></div>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setShowActionsMenu(false);
                                                    fitToScreen();
                                                }}
                                                className="!min-h-0 w-full px-2.5 py-1.5 rounded-xl hover:bg-white/10 flex items-center gap-2 transition text-[10px] sm:text-[11px] font-bold"
                                            >
                                                <div className="w-6 h-6 rounded-lg bg-slate-800 text-teal-400 flex items-center justify-center shrink-0">
                                                    <i className="fa-solid fa-expand text-[10px]"></i>
                                                </div>
                                                <span className="truncate whitespace-nowrap">
                                                    ملاءمة المخطط للشاشة (Zoom Extents)
                                                </span>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setShowTexts(prev => !prev);
                                                    setShowActionsMenu(false);
                                                }}
                                                className="!min-h-0 w-full px-2.5 py-1.5 rounded-xl hover:bg-white/10 flex items-center gap-2 transition text-[10px] sm:text-[11px] font-bold"
                                            >
                                                <div className="w-6 h-6 rounded-lg bg-slate-800 text-amber-400 flex items-center justify-center shrink-0">
                                                    <i className="fa-solid fa-font text-[10px]"></i>
                                                </div>
                                                <span className="truncate whitespace-nowrap">
                                                    {showTexts ? 'إخفاء النصوص والأبعاد' : 'إظهار النصوص والأبعاد'}
                                                </span>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setShowGrid(prev => !prev);
                                                    setShowActionsMenu(false);
                                                }}
                                                className="!min-h-0 w-full px-2.5 py-1.5 rounded-xl hover:bg-white/10 flex items-center gap-2 transition text-[10px] sm:text-[11px] font-bold"
                                            >
                                                <div className="w-6 h-6 rounded-lg bg-slate-800 text-sky-400 flex items-center justify-center shrink-0">
                                                    <i className="fa-solid fa-border-all text-[10px]"></i>
                                                </div>
                                                <span className="truncate whitespace-nowrap">
                                                    {showGrid ? 'إخفاء الشبكة الهندسية' : 'إظهار الشبكة الهندسية'}
                                                </span>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setShowActionsMenu(false);
                                                    openWindowSelector('export_png');
                                                }}
                                                className="!min-h-0 w-full px-2.5 py-1.5 rounded-xl hover:bg-white/10 flex items-center gap-2 transition text-[10px] sm:text-[11px] font-bold"
                                            >
                                                <div className="w-6 h-6 rounded-lg bg-slate-800 text-purple-400 flex items-center justify-center shrink-0">
                                                    <i className="fa-solid fa-crop-simple text-[10px]"></i>
                                                </div>
                                                <span className="truncate whitespace-nowrap">
                                                    تحديد جزء وتصديره كصورة (PNG)
                                                </span>
                                            </button>
                                        </>
                                    )}

                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowActionsMenu(false);
                                            openWindowSelector('print_pdf');
                                        }}
                                        className="!min-h-0 w-full px-2.5 py-1.5 rounded-xl hover:bg-white/10 flex items-center gap-2 transition text-[10px] sm:text-[11px] font-bold"
                                    >
                                        <div className="w-6 h-6 rounded-lg bg-slate-800 text-indigo-400 flex items-center justify-center shrink-0">
                                            <i className="fa-solid fa-print text-[10px]"></i>
                                        </div>
                                        <span className="truncate whitespace-nowrap">
                                            تحديد نافذة للطباعة / تصدير PDF
                                        </span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowActionsMenu(false);
                                            localFileInputRef.current?.click();
                                        }}
                                        className="!min-h-0 w-full px-2.5 py-1.5 rounded-xl hover:bg-white/10 flex items-center gap-2 transition text-[10px] sm:text-[11px] font-bold"
                                    >
                                        <div className="w-6 h-6 rounded-lg bg-slate-800 text-cyan-400 flex items-center justify-center shrink-0">
                                            <i className="fa-solid fa-folder-open text-[10px]"></i>
                                        </div>
                                        <span className="truncate whitespace-nowrap">
                                            فتح ملف DWG / DXF من الجهاز
                                        </span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowActionsMenu(false);
                                            setShowShareModal(true);
                                        }}
                                        className="!min-h-0 w-full px-2.5 py-1.5 rounded-xl hover:bg-white/10 flex items-center gap-2 transition text-[10px] sm:text-[11px] font-bold"
                                    >
                                        <div className="w-6 h-6 rounded-lg bg-slate-800 text-emerald-400 flex items-center justify-center shrink-0">
                                            <i className="fa-solid fa-share-nodes text-[10px]"></i>
                                        </div>
                                        <span className="truncate whitespace-nowrap">
                                            مشاركة المخطط (ملف / صورة / رابط)
                                        </span>
                                    </button>

                                    <div className="border-t border-slate-800 pt-1">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setShowActionsMenu(false);
                                                handleOpenInApp();
                                            }}
                                            disabled={loading}
                                            className="!min-h-0 w-full px-2.5 py-1.5 rounded-xl bg-[#c41e3a] hover:bg-[#a01830] text-white flex items-center gap-2 transition shadow-md text-[10px] sm:text-[11px] font-bold disabled:opacity-50"
                                        >
                                            <div className="w-6 h-6 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
                                                <i className="fa-solid fa-mobile-screen-button text-[10px]"></i>
                                            </div>
                                            <span className="truncate whitespace-nowrap">
                                                فتح في تطبيق خارجي (DWG FastView)
                                            </span>
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
                <div className="relative z-20 bg-slate-900/95 border-b border-emerald-500/30 px-2.5 sm:px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-white">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold text-[10px] sm:text-[11px]">
                            <i className="fa-solid fa-crosshairs text-emerald-400"></i>
                            {measureActive
                                ? measureStart
                                    ? 'حدد نقطة النهاية (مؤشر السناب مفعل)'
                                    : 'حدد نقطة البداية (مؤشر السناب مفعل)'
                                : 'نتائج القياس الهندسي'}
                        </span>
                        {lastMeasurement && (
                            <div className="flex items-center gap-2 font-mono text-[10px] sm:text-[11px] bg-black/40 px-2 py-0.5 rounded-lg border border-white/10 flex-wrap">
                                <span className="text-purple-300 font-bold">
                                    مائل = {lastMeasurement.distance.toFixed(2)} م
                                </span>
                                <span className="text-slate-600">|</span>
                                <span className="text-sky-300 font-bold">
                                    أفقي ΔX = {Math.abs(lastMeasurement.dx).toFixed(2)} م
                                </span>
                                <span className="text-slate-600">|</span>
                                <span className="text-amber-300 font-bold">
                                    عمودي ΔY = {Math.abs(lastMeasurement.dy).toFixed(2)} م
                                </span>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-1 flex-wrap">
                        {measureActive && (
                            <div className="inline-flex items-center bg-slate-950/80 p-0.5 rounded-xl border border-slate-700/80 gap-0.5">
                                <button
                                    type="button"
                                    onClick={() => setMeasureMode('ortho_both')}
                                    className={`!min-h-0 px-2 py-1 rounded-lg text-[10px] font-bold transition flex items-center gap-1 ${
                                        measureMode === 'ortho_both'
                                            ? 'bg-sky-500 text-slate-950 shadow'
                                            : 'text-slate-300 hover:bg-white/5'
                                    }`}
                                    title="إظهار البعد الأفقي والعمودي معاً"
                                >
                                    <i className="fa-solid fa-vector-square text-[9px]"></i>
                                    <span>أفقي + عمودي</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setMeasureMode('inclined')}
                                    className={`!min-h-0 px-2 py-1 rounded-lg text-[10px] font-bold transition flex items-center gap-1 ${
                                        measureMode === 'inclined'
                                            ? 'bg-purple-500 text-white shadow'
                                            : 'text-slate-300 hover:bg-white/5'
                                    }`}
                                    title="أخذ مقاس بوضع مائل مباشر بين النقطتين"
                                >
                                    <i className="fa-solid fa-ruler-horizontal -rotate-45 text-[9px]"></i>
                                    <span>وضع مائل</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setMeasureMode('ortho_lock')}
                                    className={`!min-h-0 px-2 py-1 rounded-lg text-[10px] font-bold transition flex items-center gap-1 ${
                                        measureMode === 'ortho_lock'
                                            ? 'bg-amber-500 text-slate-950 shadow'
                                            : 'text-slate-300 hover:bg-white/5'
                                    }`}
                                    title="قفل القياس على محور واحد متعامد (أفقي فقط أو عمودي فقط)"
                                >
                                    <i className="fa-solid fa-arrows-up-down-left-right text-[9px]"></i>
                                    <span>متعامد فقط</span>
                                </button>
                            </div>
                        )}
                        {measurements.length > 0 && (
                            <button
                                type="button"
                                onClick={() => {
                                    setMeasurements([]);
                                    setMeasureStart(null);
                                }}
                                className="!min-h-0 px-2 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-[10px] font-bold transition"
                            >
                                مسح ({measurements.length})
                            </button>
                        )}
                        {measureActive && (
                            <button
                                type="button"
                                onClick={() => {
                                    setMeasureActive(false);
                                    setMeasureStart(null);
                                }}
                                className="!min-h-0 px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold transition"
                            >
                                إنهاء
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

                {/* Interactive Window Selection Overlay for Print / Export PNG */}
                {cropAction && (
                    <div
                        className="absolute inset-0 z-40 select-none touch-none"
                        onMouseMove={e => moveCropDrag(e.clientX, e.clientY)}
                        onMouseUp={endCropDrag}
                        onMouseLeave={endCropDrag}
                        onTouchMove={e => {
                            if (e.touches.length === 1) {
                                moveCropDrag(e.touches[0].clientX, e.touches[0].clientY);
                            }
                        }}
                        onTouchEnd={endCropDrag}
                    >
                        {/* Top instruction bar (single compact row, no fullscreen button) */}
                        <div className="absolute top-2.5 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 backdrop-blur-xl border border-indigo-500/40 rounded-xl px-2.5 py-1.5 shadow-2xl flex items-center justify-between gap-1.5 flex-nowrap whitespace-nowrap text-white w-[95vw] max-w-md">
                            <div className="flex items-center gap-1 text-[9px] sm:text-[10px] font-bold text-indigo-300 truncate min-w-0">
                                <i className="fa-solid fa-crop-simple text-[9px] shrink-0"></i>
                                <span className="truncate">
                                    {cropAction === 'export_png' ? 'نافذة تصدير الصورة' : 'نافذة الطباعة PDF'}
                                </span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setCropWhiteBg(prev => !prev)}
                                    className={`!min-h-0 px-2 py-1 rounded-lg text-[9px] sm:text-[10px] font-bold border transition flex items-center gap-1 ${
                                        cropWhiteBg
                                            ? 'bg-white text-slate-900 border-white'
                                            : 'bg-slate-800 text-slate-300 border-slate-700'
                                    }`}
                                >
                                    <i className="fa-solid fa-fill-drip text-[8px]"></i>
                                    <span>{cropWhiteBg ? 'خلفية بيضاء' : 'لون الشاشة'}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={handleConfirmCropAction}
                                    className="!min-h-0 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[9px] sm:text-[10px] font-extrabold shadow-md transition flex items-center gap-1"
                                >
                                    <i
                                        className={`fa-solid ${
                                            cropAction === 'export_png' ? 'fa-download' : 'fa-print'
                                        } text-[9px]`}
                                    ></i>
                                    <span>
                                        {cropAction === 'export_png' ? 'حفظ الصورة' : 'طباعة'}
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCropAction(null)}
                                    className="!min-h-0 px-2 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-[9px] sm:text-[10px] font-bold transition"
                                >
                                    إلغاء
                                </button>
                            </div>
                        </div>

                        {/* Bottom instruction pill constrained within screen bounds */}
                        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 text-emerald-300 border border-emerald-500/40 px-2.5 py-1 rounded-xl text-[9px] sm:text-[10px] font-mono font-bold max-w-[92vw] truncate pointer-events-none shadow-lg text-center">
                            اسحب النافذة أو الزوايا لتحديد الجزء المطلوب ({Math.round(cropRect.w)} ×{' '}
                            {Math.round(cropRect.h)})
                        </div>

                        {/* Background Dimmer outside cropRect (allows drawing a new box by dragging) */}
                        <div
                            className="absolute inset-0 cursor-crosshair"
                            onMouseDown={e => startCropDrag('draw', e.clientX, e.clientY)}
                            onTouchStart={e => {
                                if (e.touches.length === 1) {
                                    startCropDrag('draw', e.touches[0].clientX, e.touches[0].clientY);
                                }
                            }}
                        />

                        {/* Interactive Selection Window Box */}
                        <div
                            style={{
                                left: `${cropRect.x}px`,
                                top: `${cropRect.y}px`,
                                width: `${cropRect.w}px`,
                                height: `${cropRect.h}px`,
                                boxShadow: '0 0 0 9999px rgba(2, 6, 23, 0.68)',
                            }}
                            onMouseDown={e => {
                                e.stopPropagation();
                                startCropDrag('move', e.clientX, e.clientY);
                            }}
                            onTouchStart={e => {
                                e.stopPropagation();
                                if (e.touches.length === 1) {
                                    startCropDrag('move', e.touches[0].clientX, e.touches[0].clientY);
                                }
                            }}
                            className="absolute border-2 border-dashed border-emerald-400 cursor-move"
                        >
                            {/* Rule of thirds helper grid inside crop window */}
                            <div className="w-full h-full grid grid-cols-3 grid-rows-3 pointer-events-none">
                                <div className="border-r border-b border-emerald-400/20" />
                                <div className="border-r border-b border-emerald-400/20" />
                                <div className="border-b border-emerald-400/20" />
                                <div className="border-r border-b border-emerald-400/20" />
                                <div className="border-r border-b border-emerald-400/20" />
                                <div className="border-b border-emerald-400/20" />
                                <div className="border-r border-emerald-400/20" />
                                <div className="border-r border-emerald-400/20" />
                                <div />
                            </div>

                            {/* 4 Corner Resize Handles */}
                            <div
                                onMouseDown={e => {
                                    e.stopPropagation();
                                    startCropDrag('nw', e.clientX, e.clientY);
                                }}
                                onTouchStart={e => {
                                    e.stopPropagation();
                                    if (e.touches.length === 1) {
                                        startCropDrag('nw', e.touches[0].clientX, e.touches[0].clientY);
                                    }
                                }}
                                className="absolute -top-2.5 -left-2.5 w-5 h-5 rounded-full bg-emerald-400 border-2 border-slate-950 shadow-md cursor-nwse-resize"
                            />
                            <div
                                onMouseDown={e => {
                                    e.stopPropagation();
                                    startCropDrag('ne', e.clientX, e.clientY);
                                }}
                                onTouchStart={e => {
                                    e.stopPropagation();
                                    if (e.touches.length === 1) {
                                        startCropDrag('ne', e.touches[0].clientX, e.touches[0].clientY);
                                    }
                                }}
                                className="absolute -top-2.5 -right-2.5 w-5 h-5 rounded-full bg-emerald-400 border-2 border-slate-950 shadow-md cursor-nesw-resize"
                            />
                            <div
                                onMouseDown={e => {
                                    e.stopPropagation();
                                    startCropDrag('sw', e.clientX, e.clientY);
                                }}
                                onTouchStart={e => {
                                    e.stopPropagation();
                                    if (e.touches.length === 1) {
                                        startCropDrag('sw', e.touches[0].clientX, e.touches[0].clientY);
                                    }
                                }}
                                className="absolute -bottom-2.5 -left-2.5 w-5 h-5 rounded-full bg-emerald-400 border-2 border-slate-950 shadow-md cursor-nesw-resize"
                            />
                            <div
                                onMouseDown={e => {
                                    e.stopPropagation();
                                    startCropDrag('se', e.clientX, e.clientY);
                                }}
                                onTouchStart={e => {
                                    e.stopPropagation();
                                    if (e.touches.length === 1) {
                                        startCropDrag('se', e.touches[0].clientX, e.touches[0].clientY);
                                    }
                                }}
                                className="absolute -bottom-2.5 -right-2.5 w-5 h-5 rounded-full bg-emerald-400 border-2 border-slate-950 shadow-md cursor-nwse-resize"
                            />
                        </div>
                    </div>
                )}

                {/* Share & External App Modal */}
                {showShareModal && (
                    <div className="fixed inset-0 z-[110] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
                        <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-sm w-full p-5 text-white shadow-2xl space-y-3">
                            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                                        <i className="fa-solid fa-share-nodes text-sm"></i>
                                    </div>
                                    <div>
                                        <h3 className="font-extrabold text-xs sm:text-sm">
                                            مشاركة وفتح المخطط الهندسي
                                        </h3>
                                        <p className="text-[10px] text-slate-400 truncate max-w-[210px]">
                                            {item.name}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowShareModal(false)}
                                    className="!min-h-0 w-7 h-7 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-xs"
                                >
                                    <i className="fa-solid fa-times"></i>
                                </button>
                            </div>

                            <div className="space-y-2">
                                <button
                                    type="button"
                                    onClick={handleNativeShareFile}
                                    disabled={isSharing}
                                    className="!min-h-0 w-full py-2.5 px-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-between transition shadow-lg"
                                >
                                    <div className="flex items-center gap-2.5">
                                        <i className="fa-solid fa-file-export text-sm"></i>
                                        <span>مشاركة ملف الأوتوكاد الأصلي (DWG)</span>
                                    </div>
                                    <i className="fa-solid fa-chevron-left text-[10px] opacity-80"></i>
                                </button>

                                {cadDoc && (
                                    <button
                                        type="button"
                                        onClick={handleShareAsImage}
                                        disabled={isSharing}
                                        className="!min-h-0 w-full py-2.5 px-3.5 rounded-2xl bg-purple-600/90 hover:bg-purple-500 text-white font-bold text-xs flex items-center justify-between transition shadow-lg"
                                    >
                                        <div className="flex items-center gap-2.5">
                                            <i className="fa-solid fa-image text-sm"></i>
                                            <span>مشاركة كصورة عالية الدقة (PNG)</span>
                                        </div>
                                        <i className="fa-solid fa-chevron-left text-[10px] opacity-80"></i>
                                    </button>
                                )}

                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowShareModal(false);
                                        handleOpenInApp();
                                    }}
                                    className="!min-h-0 w-full py-2.5 px-3.5 rounded-2xl bg-[#c41e3a] hover:bg-[#a01830] text-white font-bold text-xs flex items-center justify-between transition shadow-lg"
                                >
                                    <div className="flex items-center gap-2.5">
                                        <i className="fa-solid fa-mobile-screen-button text-sm"></i>
                                        <span>فتح في تطبيق موبايل (DWG FastView / AutoCAD)</span>
                                    </div>
                                    <i className="fa-solid fa-chevron-left text-[10px] opacity-80"></i>
                                </button>

                                <div className="grid grid-cols-2 gap-2 pt-1">
                                    <button
                                        type="button"
                                        onClick={handleWhatsAppShare}
                                        className="!min-h-0 py-2 px-3 rounded-xl bg-green-600/20 hover:bg-green-600/30 text-green-300 border border-green-500/30 font-bold text-[11px] flex items-center justify-center gap-1.5 transition"
                                    >
                                        <i className="fa-brands fa-whatsapp text-sm"></i>
                                        <span>مشاركة واتساب</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleCopyShareLink}
                                        className="!min-h-0 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-[11px] flex items-center justify-center gap-1.5 transition"
                                    >
                                        <i className="fa-solid fa-link text-xs text-sky-400"></i>
                                        <span>نسخ رابط الملف</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
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
                                <i className="fa-solid fa-mobile-screen-button text-red-400"></i>
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
                    <div className="absolute bottom-14 left-1/2 -translate-x-1/2 bg-black/85 text-white px-4 py-2 rounded-xl text-xs font-bold border border-white/15 backdrop-blur-md text-center animate-slide-up z-50 shadow-xl">
                        {status}
                    </div>
                )}
            </div>
        </div>
    );
};

export default DwgViewer;
