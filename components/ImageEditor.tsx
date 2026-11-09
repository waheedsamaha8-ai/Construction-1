import React, { useRef, useState, useEffect, useLayoutEffect } from 'react';
import { api } from '../services/api';

interface ImageEditorProps {
    fileId: string;
    imageUrl: string;
    fileName: string;
    parentId: string;
    onClose: () => void;
    onSave: () => void;
}

// Comprehensive Tool Types
type ToolType = 
    | 'select' 
    | 'pen' 
    | 'highlighter' 
    | 'line' 
    | 'arrow' 
    | 'double_arrow' 
    | 'curved_arrow' 
    | 'dimension'
    | 'rect' 
    | 'filled_rect' 
    | 'circle' 
    | 'filled_circle' 
    | 'star'
    | 'triangle'
    | 'cloud' 
    | 'text' 
    | 'callout' 
    | 'badge' 
    | 'pin'
    | 'checkmark'
    | 'cross'
    | 'hazard'
    | 'stamp' 
    | 'blur'
    | 'compass_north'
    | 'target'
    | 'camera_angle'
    | 'hazard_strip';

type StampType = 
    | 'approved' 
    | 'rejected' 
    | 'review' 
    | 'urgent' 
    | 'resolved' 
    | 'compliant' 
    | 'stop' 
    | 'poured' 
    | 'rebar' 
    | 'consultant';

interface DrawingElement {
    id: string;
    type: ToolType;
    x: number;
    y: number;
    w: number;
    h: number;
    points?: {x: number, y: number}[];
    text?: string;
    badgeNum?: number;
    stampType?: StampType;
    color: string;
    size: number;
    opacity?: number;
    isFilled?: boolean;
    scalePercent?: number;
}

const ImageEditor: React.FC<ImageEditorProps> = ({ fileId, imageUrl, fileName, parentId, onClose, onSave }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    
    // --- State ---
    const [elements, setElements] = useState<DrawingElement[]>([]);
    const [history, setHistory] = useState<DrawingElement[][]>([]); 
    const [activeTool, setActiveTool] = useState<ToolType>('arrow');
    const [activeTab, setActiveTab] = useState<'draw' | 'shapes' | 'text' | 'stamps'>('draw');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    
    // Property Settings
    const [color, setColor] = useState('#ef4444');
    const [lineWidth, setLineWidth] = useState(6);
    const [opacity, setOpacity] = useState(1);
    const [isFilled, setIsFilled] = useState(false);
    const [stampType, setStampType] = useState<StampType>('approved');
    const [badgeNum, setBadgeNum] = useState(1);
    
    // Interaction State
    const [action, setAction] = useState<'none' | 'drawing' | 'moving' | 'resizing'>('none');
    const [startPos, setStartPos] = useState({ x: 0, y: 0 });
    
    // Text Input State
    const [editingTextId, setEditingTextId] = useState<string | null>(null);
    const [textInputValue, setTextInputValue] = useState('');
    const textAreaRef = useRef<HTMLTextAreaElement>(null);

    // Load Image
    const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
    const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const img = new Image();
        img.src = imageUrl;
        img.crossOrigin = "anonymous";
        img.onload = () => {
            setBgImage(img);
            setCanvasSize({ w: img.naturalWidth, h: img.naturalHeight });
        };
    }, [imageUrl]);

    // Handle mobile back button to close editor gracefully
    useEffect(() => {
        const handleBack = (e: Event) => {
            if (editingTextId) {
                setEditingTextId(null);
                e.preventDefault();
                return;
            }
            if (selectedId) {
                setSelectedId(null);
                e.preventDefault();
                return;
            }
            onClose();
            e.preventDefault();
        };
        window.addEventListener('app-back-button', handleBack);
        return () => window.removeEventListener('app-back-button', handleBack);
    }, [editingTextId, selectedId, onClose]);

    // --- Synchronize Selected Element Properties to Controls ---
    useEffect(() => {
        if (selectedId) {
            const selectedEl = elements.find(el => el.id === selectedId);
            if (selectedEl) {
                if (selectedEl.color) setColor(selectedEl.color);
                if (selectedEl.size) setLineWidth(selectedEl.size);
                if (selectedEl.opacity !== undefined) setOpacity(selectedEl.opacity);
                if (selectedEl.isFilled !== undefined) setIsFilled(selectedEl.isFilled);
                if (selectedEl.stampType) setStampType(selectedEl.stampType);
                if (selectedEl.badgeNum) setBadgeNum(selectedEl.badgeNum);
            }
        }
    }, [selectedId]);

    // Helper to update selected element in real-time
    const updateSelectedElement = (updates: Partial<DrawingElement>) => {
        if (!selectedId) return;
        setElements(prev => prev.map(el => el.id === selectedId ? { ...el, ...updates } : el));
    };

    // Control Handlers with Real-Time Selection Updates
    const handleColorChange = (newColor: string) => {
        setColor(newColor);
        if (selectedId) updateSelectedElement({ color: newColor });
    };

    const handleLineWidthChange = (newWidth: number) => {
        setLineWidth(newWidth);
        if (selectedId) updateSelectedElement({ size: newWidth });
    };

    const handleOpacityChange = (newOpacity: number) => {
        setOpacity(newOpacity);
        if (selectedId) updateSelectedElement({ opacity: newOpacity });
    };

    const handleFillToggle = () => {
        const newFill = !isFilled;
        setIsFilled(newFill);
        if (selectedId) updateSelectedElement({ isFilled: newFill });
    };

    const handleStampTypeChange = (st: StampType) => {
        setStampType(st);
        if (selectedId) updateSelectedElement({ stampType: st });
    };

    const handleBadgeNumChange = (num: number) => {
        setBadgeNum(num);
        if (selectedId) updateSelectedElement({ badgeNum: num });
    };

    const bringForward = () => {
        if (!selectedId) return;
        setElements(prev => {
            const idx = prev.findIndex(e => e.id === selectedId);
            if (idx === -1 || idx === prev.length - 1) return prev;
            const updated = [...prev];
            const [item] = updated.splice(idx, 1);
            updated.splice(idx + 1, 0, item);
            return updated;
        });
    };

    const sendBackward = () => {
        if (!selectedId) return;
        setElements(prev => {
            const idx = prev.findIndex(e => e.id === selectedId);
            if (idx <= 0) return prev;
            const updated = [...prev];
            const [item] = updated.splice(idx, 1);
            updated.splice(idx - 1, 0, item);
            return updated;
        });
    };

    const handleEditTextOfSelected = () => {
        if (!selectedId) return;
        const el = elements.find(e => e.id === selectedId);
        if (el) {
            setEditingTextId(selectedId);
            setTextInputValue(el.text || '');
        }
    };

    // --- Interactive Scaling for Selected Elements ---
    const scaleSelectedElement = (factor: number) => {
        if (!selectedId) return;
        addToHistory();
        setElements(prev => prev.map(el => {
            if (el.id !== selectedId) return el;

            // Center of element
            const cx = (el.x + el.w) / 2;
            const cy = (el.y + el.h) / 2;

            // Proportional size calculation
            const newSize = Math.max(2, Math.min(80, Math.round(el.size * factor)));
            const currentScale = el.scalePercent || 100;
            const newScale = Math.max(25, Math.min(400, Math.round(currentScale * factor)));

            if (['circle', 'filled_circle', 'badge', 'pin', 'checkmark', 'cross', 'hazard', 'compass_north', 'target'].includes(el.type)) {
                return {
                    ...el,
                    size: newSize,
                    scalePercent: newScale
                };
            }

            if (el.type === 'text') {
                return {
                    ...el,
                    size: newSize,
                    scalePercent: newScale
                };
            }

            // For stamp, callout, rect, hazard_strip, dimension, cloud, star, triangle, etc.
            const halfW = (el.w - el.x) / 2;
            const halfH = (el.h - el.y) / 2;
            const newX = cx - halfW * factor;
            const newW = cx + halfW * factor;
            const newY = cy - halfH * factor;
            const newH = cy + halfH * factor;

            const newPoints = el.points ? el.points.map(p => ({
                x: cx + (p.x - cx) * factor,
                y: cy + (p.y - cy) * factor
            })) : undefined;

            return {
                ...el,
                x: Math.round(newX),
                y: Math.round(newY),
                w: Math.round(newW),
                h: Math.round(newH),
                size: newSize,
                scalePercent: newScale,
                points: newPoints
            };
        }));
    };

    const setElementScalePreset = (presetPercent: number) => {
        const el = elements.find(e => e.id === selectedId);
        if (!el) return;
        const currentScale = el.scalePercent || 100;
        const factor = presetPercent / currentScale;
        scaleSelectedElement(factor);
    };

    // --- History Management ---
    const addToHistory = () => {
        const newHistory = [...history, elements];
        if (newHistory.length > 25) newHistory.shift(); 
        setHistory(newHistory);
    };

    const handleUndo = () => {
        if (history.length === 0) return;
        const previousElements = history[history.length - 1];
        setElements(previousElements);
        setHistory(prev => prev.slice(0, prev.length - 1));
        setSelectedId(null);
    };

    // --- Helper Functions ---
    const generateId = () => `el_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    const getMouseCoordinates = (event: React.MouseEvent | React.TouchEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        
        let clientX, clientY;
        if ('touches' in event) {
            clientX = event.touches[0].clientX;
            clientY = event.touches[0].clientY;
        } else {
            clientX = (event as React.MouseEvent).clientX;
            clientY = (event as React.MouseEvent).clientY;
        }

        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    };

    const getCanvasScaleFactor = () => {
        const cw = canvasRef.current?.width || canvasSize.w || 1000;
        const ch = canvasRef.current?.height || canvasSize.h || 750;
        const minDim = Math.min(cw, ch);
        return Math.max(1, minDim / 800);
    };

    const getHandleRadius = () => {
        const canvas = canvasRef.current;
        if (!canvas) return 22;
        const rect = canvas.getBoundingClientRect();
        const screenToCanvas = rect.width ? (canvas.width / rect.width) : 1;
        return Math.max(22, Math.round(18 * screenToCanvas));
    };

    // Hit Detection for Selection with Proportional Tolerance
    const isCursorOnElement = (x: number, y: number, element: DrawingElement) => {
        const tolerance = Math.max(45, Math.round(getHandleRadius() * 1.6));
        
        if (['rect', 'filled_rect', 'star', 'triangle', 'cloud', 'callout', 'stamp', 'blur', 'hazard_strip'].includes(element.type)) {
            const minX = Math.min(element.x, element.w);
            const maxX = Math.max(element.x, element.w);
            const minY = Math.min(element.y, element.h);
            const maxY = Math.max(element.y, element.h);
            const w = Math.max(100, maxX - minX);
            const h = Math.max(50, maxY - minY);

            return x >= minX - tolerance && x <= minX + w + tolerance && y >= minY - tolerance && y <= minY + h + tolerance;
        }

        if (element.type === 'text') {
            const ctx = canvasRef.current?.getContext('2d');
            if (ctx && element.text) {
                ctx.save();
                ctx.direction = 'ltr';
                ctx.font = `bold ${element.size * 5}px Tajawal, sans-serif`;
                const metrics = ctx.measureText(element.text);
                const w = metrics.width;
                const h = element.size * 5;
                ctx.restore();
                return x >= element.x - tolerance && x <= element.x + w + tolerance && y >= element.y - tolerance && y <= element.y + h + tolerance;
            }
        }

        if (['circle', 'filled_circle', 'badge', 'pin', 'checkmark', 'cross', 'hazard', 'compass_north', 'target'].includes(element.type)) {
            const radius = ['badge', 'pin', 'checkmark', 'cross', 'hazard', 'compass_north', 'target'].includes(element.type) 
                ? Math.max(30, element.size * 4, Math.abs(element.w - element.x)) 
                : Math.sqrt(Math.pow(element.w - element.x, 2) + Math.pow(element.h - element.y, 2));
            const distance = Math.sqrt(Math.pow(x - element.x, 2) + Math.pow(y - element.y, 2));
            return distance <= radius + tolerance;
        }
        
        if (['arrow', 'double_arrow', 'curved_arrow', 'line', 'dimension', 'camera_angle', 'pen', 'highlighter'].includes(element.type)) {
            if ((element.type === 'pen' || element.type === 'highlighter') && element.points) {
                return element.points.some(p => Math.sqrt(Math.pow(x - p.x, 2) + Math.pow(y - p.y, 2)) < tolerance);
            }

            const x1 = element.x, y1 = element.y, x2 = element.w, y2 = element.h;
            const A = x - x1, B = y - y1, C = x2 - x1, D = y2 - y1;
            const dot = A * C + B * D;
            const len_sq = C * C + D * D;
            let param = -1;
            if (len_sq !== 0) param = dot / len_sq;

            let xx, yy;
            if (param < 0) { xx = x1; yy = y1; }
            else if (param > 1) { xx = x2; yy = y2; }
            else { xx = x1 + param * C; yy = y1 + param * D; }

            const dx = x - xx, dy = y - yy;
            return (dx * dx + dy * dy) < (tolerance * tolerance);
        }
        
        return false;
    };

    const isOnResizeHandle = (x: number, y: number, element: DrawingElement) => {
        let targetX = element.w;
        let targetY = element.h;

        if (element.type === 'text' && element.text) {
             const ctx = canvasRef.current?.getContext('2d');
             if (ctx) {
                 ctx.save();
                 ctx.direction = 'ltr';
                 ctx.font = `bold ${element.size * 5}px Tajawal, sans-serif`;
                 const metrics = ctx.measureText(element.text);
                 targetX = element.x + metrics.width;
                 targetY = element.y + (element.size * 5);
                 ctx.restore();
             }
        } else if (['circle', 'filled_circle', 'badge', 'pin', 'checkmark', 'cross', 'hazard', 'compass_north', 'target'].includes(element.type)) {
            const radius = ['badge', 'pin', 'checkmark', 'cross', 'hazard', 'compass_north', 'target'].includes(element.type) 
                ? Math.max(30, element.size * 4, Math.abs(element.w - element.x)) 
                : Math.sqrt(Math.pow(element.w - element.x, 2) + Math.pow(element.h - element.y, 2));
            targetX = element.x + radius;
            targetY = element.y;
        }

        const dist = Math.sqrt(Math.pow(x - targetX, 2) + Math.pow(y - targetY, 2));
        const handleHitTolerance = Math.max(55, Math.round(getHandleRadius() * 2));
        return dist < handleHitTolerance;
    };

    // --- Main Canvas Rendering ---
    useLayoutEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx || !bgImage) return;

        // 1. Clear & Draw Background Photo
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bgImage, 0, 0);

        // 2. Draw Elements
        elements.forEach(el => {
            renderElementOnCanvas(ctx, el);
        });

        // 3. Draw Selected Element Highlight & Handles
        if (selectedId && action !== 'drawing') {
            const el = elements.find(e => e.id === selectedId);
            if (el) {
                renderSelectionOutline(ctx, el);
            }
        }

    }, [elements, selectedId, editingTextId, bgImage, canvasSize]);

    // Canvas Element Renderer
    const renderElementOnCanvas = (ctx: CanvasRenderingContext2D, el: DrawingElement) => {
        ctx.save();
        ctx.globalAlpha = el.opacity ?? 1;
        ctx.lineWidth = el.size;
        ctx.strokeStyle = el.color;
        ctx.fillStyle = el.color;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (el.type === 'rect' || el.type === 'filled_rect') {
            const minX = Math.min(el.x, el.w);
            const minY = Math.min(el.y, el.h);
            const w = Math.abs(el.w - el.x);
            const h = Math.abs(el.h - el.y);
            if (el.type === 'filled_rect' || el.isFilled) {
                ctx.fillStyle = el.color + '40';
                ctx.fillRect(minX, minY, w, h);
            }
            ctx.strokeRect(minX, minY, w, h);
        } 
        else if (el.type === 'circle' || el.type === 'filled_circle') {
            const radius = Math.sqrt(Math.pow(el.w - el.x, 2) + Math.pow(el.h - el.y, 2));
            ctx.beginPath();
            ctx.arc(el.x, el.y, radius, 0, 2 * Math.PI);
            if (el.type === 'filled_circle' || el.isFilled) {
                ctx.fillStyle = el.color + '40';
                ctx.fill();
            }
            ctx.stroke();
        } 
        else if (el.type === 'star') {
            drawStar(ctx, el);
        }
        else if (el.type === 'triangle') {
            drawTriangle(ctx, el);
        }
        else if (el.type === 'cloud') {
            drawRevisionCloud(ctx, el);
        }
        else if (el.type === 'line') {
            ctx.beginPath();
            ctx.moveTo(el.x, el.y);
            ctx.lineTo(el.w, el.h);
            ctx.stroke();
        } 
        else if (el.type === 'arrow') {
            drawArrow(ctx, el.x, el.y, el.w, el.h, el.size, false);
        } 
        else if (el.type === 'double_arrow') {
            drawArrow(ctx, el.x, el.y, el.w, el.h, el.size, true);
        } 
        else if (el.type === 'curved_arrow') {
            drawCurvedArrow(ctx, el.x, el.y, el.w, el.h, el.size);
        } 
        else if (el.type === 'dimension') {
            drawDimensionLine(ctx, el);
        }
        else if ((el.type === 'pen' || el.type === 'highlighter') && el.points) {
            if (el.type === 'highlighter') {
                ctx.globalAlpha = 0.4;
                ctx.lineWidth = el.size * 3;
            }
            if (el.points.length > 0) {
                ctx.beginPath();
                ctx.moveTo(el.points[0].x, el.points[0].y);
                for (let i = 1; i < el.points.length; i++) {
                    ctx.lineTo(el.points[i].x, el.points[i].y);
                }
                ctx.stroke();
            }
        } 
        else if (el.type === 'text' && el.text) {
            if (editingTextId !== el.id) {
                ctx.direction = 'ltr'; 
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';
                ctx.font = `bold ${el.size * 5}px Tajawal, sans-serif`;
                
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 4;
                ctx.strokeText(el.text, el.x, el.y);
                ctx.fillStyle = el.color;
                ctx.fillText(el.text, el.x, el.y);
            }
        }
        else if (el.type === 'callout') {
            drawCallout(ctx, el);
        }
        else if (el.type === 'badge') {
            drawBadge(ctx, el);
        }
        else if (el.type === 'pin') {
            drawPin(ctx, el);
        }
        else if (el.type === 'checkmark' || el.type === 'cross' || el.type === 'hazard') {
            drawSymbol(ctx, el);
        }
        else if (el.type === 'stamp') {
            drawStamp(ctx, el);
        }
        else if (el.type === 'blur') {
            drawBlurBox(ctx, el);
        }
        else if (el.type === 'compass_north') {
            drawNorthCompass(ctx, el);
        }
        else if (el.type === 'target') {
            drawInspectionTarget(ctx, el);
        }
        else if (el.type === 'camera_angle') {
            drawCameraAngle(ctx, el);
        }
        else if (el.type === 'hazard_strip') {
            drawHazardStrip(ctx, el);
        }

        ctx.restore();
    };

    // Star
    const drawStar = (ctx: CanvasRenderingContext2D, el: DrawingElement) => {
        const cx = (el.x + el.w) / 2;
        const cy = (el.y + el.h) / 2;
        const outerRadius = Math.max(15, Math.abs(el.w - el.x) / 2);
        const innerRadius = outerRadius * 0.4;
        const points = 5;

        ctx.beginPath();
        for (let i = 0; i < points * 2; i++) {
            const r = i % 2 === 0 ? outerRadius : innerRadius;
            const a = (i * Math.PI) / points - Math.PI / 2;
            const x = cx + r * Math.cos(a);
            const y = cy + r * Math.sin(a);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        if (el.isFilled) {
            ctx.fillStyle = el.color + '40';
            ctx.fill();
        }
        ctx.stroke();
    };

    // Triangle
    const drawTriangle = (ctx: CanvasRenderingContext2D, el: DrawingElement) => {
        const minX = Math.min(el.x, el.w);
        const maxX = Math.max(el.x, el.w);
        const minY = Math.min(el.y, el.h);
        const maxY = Math.max(el.y, el.h);

        ctx.beginPath();
        ctx.moveTo((minX + maxX) / 2, minY);
        ctx.lineTo(maxX, maxY);
        ctx.lineTo(minX, maxY);
        ctx.closePath();

        if (el.isFilled) {
            ctx.fillStyle = el.color + '40';
            ctx.fill();
        }
        ctx.stroke();
    };

    // Pin Marker
    const drawPin = (ctx: CanvasRenderingContext2D, el: DrawingElement) => {
        const cx = el.x;
        const cy = el.y;
        const size = Math.max(20, el.size * 3.5);

        ctx.beginPath();
        ctx.arc(cx, cy - size, size * 0.6, 0, Math.PI * 2);
        ctx.fillStyle = el.color;
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(cx - size * 0.4, cy - size * 0.6);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx + size * 0.4, cy - size * 0.6);
        ctx.fillStyle = el.color;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(cx, cy - size, size * 0.25, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
    };

    // Checkmark / Cross / Hazard Symbol
    const drawSymbol = (ctx: CanvasRenderingContext2D, el: DrawingElement) => {
        const cx = el.x;
        const cy = el.y;
        const sz = Math.max(24, el.size * 4);

        ctx.save();
        ctx.translate(cx, cy);
        ctx.lineWidth = el.size;
        ctx.strokeStyle = el.color;

        if (el.type === 'checkmark') {
            ctx.beginPath();
            ctx.moveTo(-sz * 0.4, 0);
            ctx.lineTo(-sz * 0.1, sz * 0.35);
            ctx.lineTo(sz * 0.4, -sz * 0.35);
            ctx.stroke();
        } else if (el.type === 'cross') {
            ctx.beginPath();
            ctx.moveTo(-sz * 0.35, -sz * 0.35);
            ctx.lineTo(sz * 0.35, sz * 0.35);
            ctx.moveTo(sz * 0.35, -sz * 0.35);
            ctx.lineTo(-sz * 0.35, sz * 0.35);
            ctx.stroke();
        } else if (el.type === 'hazard') {
            ctx.fillStyle = '#f59e0b';
            ctx.beginPath();
            ctx.moveTo(0, -sz * 0.5);
            ctx.lineTo(sz * 0.5, sz * 0.4);
            ctx.lineTo(-sz * 0.5, sz * 0.4);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#0f172a';
            ctx.lineWidth = 3;
            ctx.stroke();

            ctx.fillStyle = '#0f172a';
            ctx.font = `bold ${sz * 0.4}px Tajawal, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('!', 0, sz * 0.05);
        }

        ctx.restore();
    };

    // Revision Cloud
    const drawRevisionCloud = (ctx: CanvasRenderingContext2D, el: DrawingElement) => {
        const minX = Math.min(el.x, el.w);
        const maxX = Math.max(el.x, el.w);
        const minY = Math.min(el.y, el.h);
        const maxY = Math.max(el.y, el.h);
        const width = Math.max(40, maxX - minX);
        const height = Math.max(40, maxY - minY);
        const arcRadius = Math.max(12, Math.min(width, height) / 5);

        ctx.beginPath();
        let currX = minX;
        while (currX < minX + width) {
            const nextX = Math.min(minX + width, currX + arcRadius * 1.5);
            ctx.quadraticCurveTo((currX + nextX) / 2, minY - arcRadius * 0.7, nextX, minY);
            currX = nextX;
        }
        let currY = minY;
        while (currY < minY + height) {
            const nextY = Math.min(minY + height, currY + arcRadius * 1.5);
            ctx.quadraticCurveTo(minX + width + arcRadius * 0.7, (currY + nextY) / 2, minX + width, nextY);
            currY = nextY;
        }
        currX = minX + width;
        while (currX > minX) {
            const nextX = Math.max(minX, currX - arcRadius * 1.5);
            ctx.quadraticCurveTo((currX + nextX) / 2, minY + height + arcRadius * 0.7, nextX, minY + height);
            currX = nextX;
        }
        currY = minY + height;
        while (currY > minY) {
            const nextY = Math.max(minY, currY - arcRadius * 1.5);
            ctx.quadraticCurveTo(minX - arcRadius * 0.7, (currY + nextY) / 2, minX, nextY);
            currY = nextY;
        }
        ctx.closePath();
        if (el.isFilled) {
            ctx.fillStyle = el.color + '25';
            ctx.fill();
        }
        ctx.stroke();
    };

    // Dimension Line
    const drawDimensionLine = (ctx: CanvasRenderingContext2D, el: DrawingElement) => {
        const dx = el.w - el.x, dy = el.h - el.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        const tickLen = el.size * 3;

        ctx.beginPath();
        ctx.moveTo(el.x, el.y);
        ctx.lineTo(el.w, el.h);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(el.x - tickLen * Math.sin(angle), el.y + tickLen * Math.cos(angle));
        ctx.lineTo(el.x + tickLen * Math.sin(angle), el.y - tickLen * Math.cos(angle));
        ctx.moveTo(el.w - tickLen * Math.sin(angle), el.h + tickLen * Math.cos(angle));
        ctx.lineTo(el.w + tickLen * Math.sin(angle), el.h - tickLen * Math.cos(angle));
        ctx.stroke();

        const label = el.text || `${(len / 40).toFixed(2)} م`;
        const midX = (el.x + el.w) / 2;
        const midY = (el.y + el.h) / 2;
        ctx.font = `bold ${Math.max(14, el.size * 3.5)}px Tajawal, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        const metrics = ctx.measureText(label);
        const pWidth = metrics.width + 16;
        const pHeight = el.size * 4 + 8;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.beginPath();
        ctx.rect(midX - pWidth / 2, midY - pHeight / 2, pWidth, pHeight);
        ctx.fill();

        ctx.fillStyle = el.color;
        ctx.fillText(label, midX, midY);
    };

    // Callout Tag
    const drawCallout = (ctx: CanvasRenderingContext2D, el: DrawingElement) => {
        const minX = Math.min(el.x, el.w);
        const minY = Math.min(el.y, el.h);
        const width = Math.max(120, Math.abs(el.w - el.x));
        const height = Math.max(50, Math.abs(el.h - el.y));
        const text = el.text || "ملاحظة موقعية";

        ctx.fillStyle = el.color;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;

        ctx.beginPath();
        ctx.rect(minX, minY, width, height);
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(minX + 20, minY + height);
        ctx.lineTo(minX + 10, minY + height + 16);
        ctx.lineTo(minX + 35, minY + height);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.max(13, el.size * 3)}px Tajawal, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, minX + width / 2, minY + height / 2);
    };

    // Badge
    const drawBadge = (ctx: CanvasRenderingContext2D, el: DrawingElement) => {
        const radius = Math.max(25, Math.abs(el.w - el.x) || (el.size * 4));
        const num = el.badgeNum || 1;

        ctx.beginPath();
        ctx.arc(el.x, el.y, radius, 0, 2 * Math.PI);
        ctx.fillStyle = el.color;
        ctx.fill();
        ctx.lineWidth = Math.max(3, radius * 0.12);
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = `black ${radius * 1.1}px Tajawal, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(num.toString(), el.x, el.y);
    };

    // Professional Engineering Stamps (10 Stamps)
    const drawStamp = (ctx: CanvasRenderingContext2D, el: DrawingElement) => {
        const stampMap: Record<StampType, { label: string; color: string; icon: string }> = {
            approved: { label: "معتمد هندسياً", color: "#16a34a", icon: "✔" },
            rejected: { label: "مرفوض / غير مطابق", color: "#dc2626", icon: "✖" },
            review: { label: "تحت الفحص والمراجعة", color: "#2563eb", icon: "⏳" },
            urgent: { label: "ملاحظة موقعية عاجلة", color: "#ea580c", icon: "⚠" },
            resolved: { label: "تمت المعالجة والإصلاح", color: "#0d9488", icon: "🔧" },
            compliant: { label: "مطابق للمواصفات", color: "#0284c7", icon: "📋" },
            stop: { label: "إيقاف أعمال فوري", color: "#991b1b", icon: "🛑" },
            poured: { label: "تم الصب والاستلام", color: "#78350f", icon: "🏗" },
            rebar: { label: "فحص حديد التسليح", color: "#4338ca", icon: "📏" },
            consultant: { label: "اعتماد استشاري المشروع", color: "#7c3aed", icon: "👔" },
        };
        const info = stampMap[el.stampType || 'approved'] || stampMap.approved;
        const width = Math.max(200, Math.abs(el.w - el.x) || (el.size * 25));
        const height = Math.max(80, Math.abs(el.h - el.y) || (width * 0.42));

        ctx.save();
        ctx.translate(el.x, el.y);
        ctx.rotate(-0.05);

        ctx.strokeStyle = info.color;
        ctx.lineWidth = Math.max(3.5, height * 0.05);
        ctx.strokeRect(0, 0, width, height);
        ctx.lineWidth = Math.max(1.5, height * 0.02);
        ctx.strokeRect(4, 4, width - 8, height - 8);

        ctx.fillStyle = info.color + '18';
        ctx.fillRect(0, 0, width, height);

        ctx.fillStyle = info.color;
        ctx.font = `black ${Math.max(16, height * 0.35)}px Tajawal, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${info.icon} ${info.label}`, width / 2, height / 2);

        ctx.restore();
    };

    // North Compass Arrow (سهم الشمال الهندسي)
    const drawNorthCompass = (ctx: CanvasRenderingContext2D, el: DrawingElement) => {
        const cx = el.x;
        const cy = el.y;
        const radius = Math.max(25, el.size * 4);

        ctx.save();
        ctx.translate(cx, cy);

        // Outer Dark Ring
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#38bdf8';
        ctx.stroke();

        // Inner Dashed Guide Ring
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.75, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        // North Needle (Red)
        ctx.beginPath();
        ctx.moveTo(0, -radius * 0.82);
        ctx.lineTo(-radius * 0.22, 0);
        ctx.lineTo(0, -radius * 0.15);
        ctx.closePath();
        ctx.fillStyle = '#ef4444';
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(0, -radius * 0.82);
        ctx.lineTo(radius * 0.22, 0);
        ctx.lineTo(0, -radius * 0.15);
        ctx.closePath();
        ctx.fillStyle = '#b91c1c';
        ctx.fill();

        // South Needle (Silver/White)
        ctx.beginPath();
        ctx.moveTo(0, radius * 0.82);
        ctx.lineTo(-radius * 0.22, 0);
        ctx.lineTo(0, radius * 0.15);
        ctx.closePath();
        ctx.fillStyle = '#f8fafc';
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(0, radius * 0.82);
        ctx.lineTo(radius * 0.22, 0);
        ctx.lineTo(0, radius * 0.15);
        ctx.closePath();
        ctx.fillStyle = '#94a3b8';
        ctx.fill();

        // "N" Letter
        ctx.fillStyle = '#fde047';
        ctx.font = `bold ${radius * 0.38}px Tajawal, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('N', 0, -radius * 0.86);

        // Center Gold Pivot
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.12, 0, Math.PI * 2);
        ctx.fillStyle = '#f59e0b';
        ctx.fill();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.restore();
    };

    // Inspection Crosshair Target (بؤرة فحص هندسي دقيق)
    const drawInspectionTarget = (ctx: CanvasRenderingContext2D, el: DrawingElement) => {
        const cx = el.x;
        const cy = el.y;
        const radius = Math.max(22, el.size * 3.5);

        ctx.save();
        ctx.translate(cx, cy);

        // Outer Ring
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.strokeStyle = el.color;
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Inner Ring
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.55, 0, Math.PI * 2);
        ctx.strokeStyle = el.color;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Crosshairs with gap at center
        const gap = radius * 0.2;
        const extent = radius * 1.35;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -gap);
        ctx.lineTo(0, -extent);
        ctx.moveTo(0, gap);
        ctx.lineTo(0, extent);
        ctx.moveTo(-gap, 0);
        ctx.lineTo(-extent, 0);
        ctx.moveTo(gap, 0);
        ctx.lineTo(extent, 0);
        ctx.stroke();

        // Center Pinpoint
        ctx.beginPath();
        ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = el.color;
        ctx.fill();

        ctx.restore();
    };

    // Camera Angle / Viewpoint (زاوية ومجال تصوير الكاميرا)
    const drawCameraAngle = (ctx: CanvasRenderingContext2D, el: DrawingElement) => {
        const cx = el.x;
        const cy = el.y;
        const size = Math.max(24, el.size * 3.5);
        const dx = el.w - el.x;
        const dy = el.h - el.y;
        const angle = Math.atan2(dy, dx) || 0;
        const fov = Math.PI / 4; // 45 degrees
        const coneDist = Math.max(size * 2.2, Math.sqrt(dx * dx + dy * dy));

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);

        // FOV Cone
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, coneDist, -fov / 2, fov / 2);
        ctx.closePath();
        ctx.fillStyle = el.color + '25';
        ctx.fill();
        ctx.strokeStyle = el.color;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Camera Base
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.beginPath();
        ctx.arc(0, 0, size * 0.65, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#38bdf8';
        ctx.font = `${size * 0.55}px FontAwesome, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('📷', 0, 0);

        ctx.restore();
    };

    // Safety Hazard Strip (شريط تحذير هندسي مخطط)
    const drawHazardStrip = (ctx: CanvasRenderingContext2D, el: DrawingElement) => {
        const minX = Math.min(el.x, el.w);
        const minY = Math.min(el.y, el.h);
        const width = Math.max(70, Math.abs(el.w - el.x));
        const height = Math.max(26, Math.max(el.size * 3.5, Math.abs(el.h - el.y)));

        ctx.save();
        ctx.beginPath();
        ctx.rect(minX, minY, width, height);
        ctx.clip();

        // Background Yellow
        ctx.fillStyle = '#facc15';
        ctx.fillRect(minX, minY, width, height);

        // Black Diagonal Stripes
        ctx.fillStyle = '#0f172a';
        const stripeWidth = height * 0.8;
        for (let x = minX - height * 2; x < minX + width + height * 2; x += stripeWidth * 2) {
            ctx.beginPath();
            ctx.moveTo(x, minY);
            ctx.lineTo(x + stripeWidth, minY);
            ctx.lineTo(x + stripeWidth - height, minY + height);
            ctx.lineTo(x - height, minY + height);
            ctx.closePath();
            ctx.fill();
        }

        ctx.restore();

        // Outer Border
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(minX, minY, width, height);
    };

    // Privacy Blur Box
    const drawBlurBox = (ctx: CanvasRenderingContext2D, el: DrawingElement) => {
        const minX = Math.min(el.x, el.w);
        const minY = Math.min(el.y, el.h);
        const width = Math.abs(el.w - el.x);
        const height = Math.abs(el.h - el.y);

        if (width > 5 && height > 5 && bgImage) {
            ctx.save();
            const pSize = 12;
            const offCanvas = document.createElement('canvas');
            offCanvas.width = Math.max(1, Math.floor(width / pSize));
            offCanvas.height = Math.max(1, Math.floor(height / pSize));
            const offCtx = offCanvas.getContext('2d');
            if (offCtx) {
                offCtx.drawImage(bgImage, minX, minY, width, height, 0, 0, offCanvas.width, offCanvas.height);
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(offCanvas, 0, 0, offCanvas.width, offCanvas.height, minX, minY, width, height);
            }
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.setLineDash([6, 4]);
            ctx.strokeRect(minX, minY, width, height);
            ctx.restore();
        }
    };

    // Selection Outline & Extra-Large Touch-Friendly Handles
    const renderSelectionOutline = (ctx: CanvasRenderingContext2D, el: DrawingElement) => {
        ctx.save();
        const r = getHandleRadius();

        // Helper to draw a crisp, large circular grab handle
        const drawHandle = (hx: number, hy: number, isMainResize = true) => {
            ctx.save();
            ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
            ctx.shadowBlur = 8;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 2;

            // Outer ring
            ctx.beginPath();
            ctx.arc(hx, hy, isMainResize ? r : Math.max(8, r * 0.45), 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();

            ctx.lineWidth = isMainResize ? Math.max(3, r * 0.22) : 2;
            ctx.strokeStyle = isMainResize ? '#2563eb' : '#64748b';
            ctx.stroke();

            // Center indicator dot
            if (isMainResize) {
                ctx.beginPath();
                ctx.arc(hx, hy, r * 0.45, 0, Math.PI * 2);
                ctx.fillStyle = '#2563eb';
                ctx.fill();
            }
            ctx.restore();
        };

        // Base outline styles with dual-pass halo for 100% visibility on light/dark backgrounds
        const strokeDualOutline = (drawPath: () => void) => {
            ctx.save();
            ctx.setLineDash([8, 6]);
            // White background halo
            ctx.lineWidth = 4.5;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
            drawPath();
            ctx.stroke();
            // Primary blue dashed line
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = '#2563eb';
            drawPath();
            ctx.stroke();
            ctx.restore();
        };

        if (['text', 'callout', 'stamp', 'rect', 'filled_rect', 'star', 'triangle', 'cloud', 'blur', 'hazard_strip'].includes(el.type)) {
            const minX = Math.min(el.x, el.w);
            const minY = Math.min(el.y, el.h);
            const maxX = Math.max(el.x, el.w);
            const maxY = Math.max(el.y, el.h);
            const w = Math.max(100, maxX - minX);
            const h = Math.max(50, maxY - minY);
            const pad = 8;

            strokeDualOutline(() => {
                ctx.beginPath();
                ctx.rect(minX - pad, minY - pad, w + pad * 2, h + pad * 2);
            });

            // Corner anchor indicators
            drawHandle(minX - pad, minY - pad, false);
            drawHandle(minX + w + pad, minY - pad, false);
            drawHandle(minX - pad, minY + h + pad, false);
            // Main primary resize handle at bottom-right
            drawHandle(minX + w + pad, minY + h + pad, true);
        }
        else if (['circle', 'filled_circle', 'badge', 'pin', 'checkmark', 'cross', 'hazard', 'compass_north', 'target'].includes(el.type)) {
            const radius = ['badge', 'pin', 'checkmark', 'cross', 'hazard', 'compass_north', 'target'].includes(el.type) 
                ? Math.max(30, el.size * 4, Math.abs(el.w - el.x)) 
                : Math.sqrt(Math.pow(el.w - el.x, 2) + Math.pow(el.h - el.y, 2));

            strokeDualOutline(() => {
                ctx.beginPath();
                ctx.arc(el.x, el.y, radius + 8, 0, 2 * Math.PI);
            });

            // Center anchor point
            drawHandle(el.x, el.y, false);
            // Primary resize handle at right perimeter
            drawHandle(el.x + radius + 8, el.y, true);
        }
        else {
            strokeDualOutline(() => {
                ctx.beginPath();
                ctx.moveTo(el.x, el.y);
                ctx.lineTo(el.w, el.h);
            });
            drawHandle(el.x, el.y, false);
            drawHandle(el.w, el.h, true);
        }

        ctx.restore();
    };

    // Arrows
    const drawArrow = (ctx: CanvasRenderingContext2D, fromx: number, fromy: number, tox: number, toy: number, width: number, double: boolean) => {
        const headlen = Math.max(12, width * 3.5); 
        const dx = tox - fromx, dy = toy - fromy;
        const angle = Math.atan2(dy, dx);
        
        ctx.beginPath();
        ctx.lineWidth = width;
        ctx.moveTo(fromx, fromy);
        ctx.lineTo(tox, toy);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(tox - headlen * Math.cos(angle - Math.PI / 6), toy - headlen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(tox, toy);
        ctx.lineTo(tox - headlen * Math.cos(angle + Math.PI / 6), toy - headlen * Math.sin(angle + Math.PI / 6));
        ctx.stroke();

        if (double) {
            ctx.beginPath();
            ctx.moveTo(fromx + headlen * Math.cos(angle - Math.PI / 6), fromy + headlen * Math.sin(angle - Math.PI / 6));
            ctx.lineTo(fromx, fromy);
            ctx.lineTo(fromx + headlen * Math.cos(angle + Math.PI / 6), fromy + headlen * Math.sin(angle + Math.PI / 6));
            ctx.stroke();
        }
    };

    const drawCurvedArrow = (ctx: CanvasRenderingContext2D, fromx: number, fromy: number, tox: number, toy: number, width: number) => {
        const headlen = Math.max(12, width * 3.5);
        const mx = (fromx + tox) / 2, my = (fromy + toy) / 2;
        const dist = Math.sqrt(Math.pow(tox - fromx, 2) + Math.pow(toy - fromy, 2));
        const offset = dist * 0.25; 
        
        const dx = tox - fromx, dy = toy - fromy;
        const angle = Math.atan2(dy, dx);
        const cpx = mx - offset * Math.sin(angle);
        const cpy = my + offset * Math.cos(angle);

        ctx.beginPath();
        ctx.lineWidth = width;
        ctx.moveTo(fromx, fromy);
        ctx.quadraticCurveTo(cpx, cpy, tox, toy);
        ctx.stroke();

        const tangentAngle = Math.atan2(toy - cpy, tox - cpx);
        ctx.beginPath();
        ctx.moveTo(tox - headlen * Math.cos(tangentAngle - Math.PI / 6), toy - headlen * Math.sin(tangentAngle - Math.PI / 6));
        ctx.lineTo(tox, toy);
        ctx.lineTo(tox - headlen * Math.cos(tangentAngle + Math.PI / 6), toy - headlen * Math.sin(tangentAngle + Math.PI / 6));
        ctx.stroke();
    };

    // --- Interaction Handlers ---
    const handleToolSelect = (tool: ToolType) => {
        if (tool === 'select') {
            setActiveTool(activeTool === 'select' ? 'arrow' : 'select');
        } else {
            setActiveTool(tool);
            setSelectedId(null);
        }
    };

    const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
        const pos = getMouseCoordinates(e);
        const cw = canvasRef.current?.width || canvasSize.w || 1200;
        const ch = canvasRef.current?.height || canvasSize.h || 900;
        const sFactor = getCanvasScaleFactor();
        
        // 1. Text Insertion
        if (activeTool === 'text') {
            const newTextId = generateId();
            const dynamicSize = Math.max(lineWidth, Math.round(8 * sFactor));
            const newTextElement: DrawingElement = {
                id: newTextId,
                type: 'text',
                x: pos.x,
                y: pos.y,
                w: pos.x + Math.round(220 * sFactor), 
                h: pos.y + Math.round(55 * sFactor), 
                text: '',
                color: color,
                size: dynamicSize,
                opacity: opacity
            };
            addToHistory();
            setElements(prev => [...prev, newTextElement]);
            setEditingTextId(newTextId);
            setTextInputValue('');
            // Automatically switch to select tool to prevent secondary accidental clicks
            setActiveTool('select');
            return;
        }

        // 2. Selection Mode
        if (activeTool === 'select') {
            if (selectedId) {
                const selectedEl = elements.find(el => el.id === selectedId);
                if (selectedEl && isOnResizeHandle(pos.x, pos.y, selectedEl)) {
                    setAction('resizing');
                    setStartPos(pos);
                    return;
                }
            }

            const clickedElement = elements.slice().reverse().find(el => isCursorOnElement(pos.x, pos.y, el));
            
            if (clickedElement) {
                setSelectedId(clickedElement.id);
                setStartPos(pos);
                setAction('moving');
            } else {
                setSelectedId(null);
            }
            return;
        }

        // 3. Drawing / Insertion Mode with Adaptive Proportional Sizing
        setSelectedId(null);
        addToHistory();
        setAction('drawing');
        const newId = generateId();

        // Calculate generous, proportional element dimensions matching photo resolution
        let defaultW = pos.x;
        let defaultH = pos.y;
        let dynamicSize = Math.max(lineWidth, Math.round(lineWidth * sFactor * 0.7));

        if (activeTool === 'stamp') {
            defaultW = pos.x + Math.max(300, Math.round(cw * 0.34));
            defaultH = pos.y + Math.round((defaultW - pos.x) * 0.42);
            dynamicSize = Math.max(lineWidth, Math.round(12 * sFactor));
        } else if (activeTool === 'callout') {
            defaultW = pos.x + Math.max(260, Math.round(cw * 0.28));
            defaultH = pos.y + Math.max(90, Math.round(ch * 0.12));
            dynamicSize = Math.max(lineWidth, Math.round(6 * sFactor));
        } else if (activeTool === 'hazard_strip') {
            defaultW = pos.x + Math.max(320, Math.round(cw * 0.36));
            defaultH = pos.y + Math.max(52, Math.round(ch * 0.065));
            dynamicSize = Math.max(lineWidth, Math.round(8 * sFactor));
        } else if (['badge', 'pin', 'checkmark', 'cross', 'hazard', 'compass_north', 'target'].includes(activeTool)) {
            const rad = Math.max(38, Math.round(cw * 0.055 * sFactor));
            defaultW = pos.x + rad;
            defaultH = pos.y + rad;
            dynamicSize = Math.max(lineWidth, Math.round(8 * sFactor));
        } else if (['arrow', 'double_arrow', 'curved_arrow'].includes(activeTool)) {
            defaultW = pos.x + Math.max(240, Math.round(cw * 0.25));
            defaultH = pos.y + Math.max(100, Math.round(ch * 0.12));
            dynamicSize = Math.max(lineWidth, Math.round(6 * sFactor));
        } else if (activeTool === 'dimension') {
            defaultW = pos.x + Math.max(280, Math.round(cw * 0.32));
            defaultH = pos.y;
            dynamicSize = Math.max(lineWidth, Math.round(5 * sFactor));
        } else if (activeTool === 'camera_angle') {
            defaultW = pos.x + Math.max(160, Math.round(cw * 0.18));
            defaultH = pos.y + Math.max(110, Math.round(ch * 0.12));
            dynamicSize = Math.max(lineWidth, Math.round(6 * sFactor));
        } else if (['rect', 'filled_rect', 'star', 'triangle', 'cloud', 'blur'].includes(activeTool)) {
            defaultW = pos.x + Math.max(240, Math.round(cw * 0.26));
            defaultH = pos.y + Math.max(160, Math.round(ch * 0.18));
            dynamicSize = Math.max(lineWidth, Math.round(6 * sFactor));
        } else if (['circle', 'filled_circle'].includes(activeTool)) {
            defaultW = pos.x + Math.max(140, Math.round(cw * 0.16));
            defaultH = pos.y;
            dynamicSize = Math.max(lineWidth, Math.round(6 * sFactor));
        }

        const newElement: DrawingElement = {
            id: newId,
            type: activeTool,
            x: pos.x,
            y: pos.y,
            w: defaultW, 
            h: defaultH, 
            color: color,
            size: dynamicSize,
            opacity: opacity,
            isFilled: isFilled,
            stampType: stampType,
            badgeNum: badgeNum,
            scalePercent: 100,
            text: activeTool === 'callout' ? 'ملاحظة موقعية' : (activeTool === 'dimension' ? '2.50 م' : ''),
            points: (activeTool === 'pen' || activeTool === 'highlighter') ? [{x: pos.x, y: pos.y}] : undefined
        };
        
        setElements(prev => [...prev, newElement]);
        setSelectedId(newId);

        if (activeTool === 'badge') {
            setBadgeNum(prev => prev + 1);
        }
    };

    const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
        if (action === 'none') return;
        if ('touches' in e) e.preventDefault();
        
        const pos = getMouseCoordinates(e);

        if (action === 'drawing' && selectedId) {
            setElements(prev => prev.map(el => {
                if (el.id === selectedId) {
                    if ((el.type === 'pen' || el.type === 'highlighter') && el.points) {
                        return { ...el, points: [...el.points, {x: pos.x, y: pos.y}] };
                    }
                    return { ...el, w: pos.x, h: pos.y };
                }
                return el;
            }));
        } 
        else if (action === 'moving' && selectedId) {
            const dx = pos.x - startPos.x;
            const dy = pos.y - startPos.y;
            setStartPos(pos);
            
            setElements(prev => prev.map(el => {
                if (el.id === selectedId) {
                    if ((el.type === 'pen' || el.type === 'highlighter') && el.points) {
                        return { ...el, points: el.points.map(p => ({ x: p.x + dx, y: p.y + dy })) };
                    }
                    return { 
                        ...el, 
                        x: el.x + dx, 
                        y: el.y + dy,
                        w: el.w + dx,
                        h: el.h + dy
                    };
                }
                return el;
            }));
        }
        else if (action === 'resizing' && selectedId) {
            setElements(prev => prev.map(el => {
                if (el.id === selectedId) {
                    if (el.type === 'text') {
                        const dist = Math.sqrt(Math.pow(pos.x - el.x, 2) + Math.pow(pos.y - el.y, 2));
                        const newSize = Math.max(2, Math.min(50, dist / 20));
                        return { ...el, size: newSize };
                    }
                    return { ...el, w: pos.x, h: pos.y };
                }
                return el;
            }));
        }
    };

    const handlePointerUp = () => {
        setAction('none');
        // Stop inserting any more elements automatically!
        // Immediately switch to select mode so the dropped element is ready for editing/adjusting
        // without dropping unwanted duplicate elements on subsequent clicks/taps!
        if (activeTool !== 'pen' && activeTool !== 'highlighter' && activeTool !== 'select') {
            setActiveTool('select');
        }
    };

    // --- Text Input Management ---
    useEffect(() => {
        if (editingTextId && textAreaRef.current) {
            const el = elements.find(e => e.id === editingTextId);
            if (el) {
                textAreaRef.current.value = el.text || '';
                textAreaRef.current.focus();
            }
        }
    }, [editingTextId]);

    const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setTextInputValue(e.target.value);
        setElements(prev => prev.map(el => el.id === editingTextId ? { ...el, text: e.target.value } : el));
    };

    const finishTextEditing = () => {
        if (!editingTextId) return;
        setElements(prev => prev.filter(el => el.id !== editingTextId || (el.text && el.text.trim() !== '')));
        setEditingTextId(null);
        setTextInputValue('');
    };

    const handleDeleteSelected = () => {
        if (selectedId) {
            addToHistory();
            setElements(prev => prev.filter(el => el.id !== selectedId));
            setSelectedId(null);
        }
    };

    const handleDuplicateSelected = () => {
        if (!selectedId) return;
        const selectedEl = elements.find(el => el.id === selectedId);
        if (selectedEl) {
            addToHistory();
            const dupId = generateId();
            const dupEl: DrawingElement = {
                ...selectedEl,
                id: dupId,
                x: selectedEl.x + 30,
                y: selectedEl.y + 30,
                w: selectedEl.w + 30,
                h: selectedEl.h + 30,
                points: selectedEl.points?.map(p => ({ x: p.x + 30, y: p.y + 30 }))
            };
            setElements(prev => [...prev, dupEl]);
            setSelectedId(dupId);
        }
    };

    const handleSaveImage = async () => {
        if (!canvasRef.current || !bgImage) return;
        setIsSaving(true);
        try {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = bgImage.naturalWidth;
            tempCanvas.height = bgImage.naturalHeight;
            const ctx = tempCanvas.getContext('2d');
            
            if (ctx) {
                ctx.drawImage(bgImage, 0, 0);
                elements.forEach(el => {
                    renderElementOnCanvas(ctx, el);
                });

                const blob = await new Promise<Blob | null>(resolve => tempCanvas.toBlob(resolve, 'image/jpeg', 0.92));
                if (blob) {
                    const newFileName = fileName.replace(/\.[^/.]+$/, "") + "_edited_" + Date.now().toString().slice(-4) + ".jpg";
                    const file = new File([blob], newFileName, { type: 'image/jpeg' });
                    await api.uploadFile(parentId, file);
                    alert("تم حفظ الصورة المعدلة بنجاح ✔");
                    onSave();
                }
            }
        } catch (e) {
            alert("فشل حفظ الصورة.");
        } finally {
            setIsSaving(false);
        }
    };

    const selectedElement = elements.find(e => e.id === selectedId);

    return (
        <div className="fixed inset-0 z-[200] bg-slate-950 flex flex-col animate-fade-in touch-none select-none">
            {/* Top Bar */}
            <div className="bg-slate-900/95 backdrop-blur px-2.5 sm:px-4 py-1.5 sm:py-2 flex justify-between items-center shrink-0 border-b border-slate-800 text-white z-20">
                <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
                    <button 
                        onClick={onClose} 
                        className="w-8 h-8 rounded-lg bg-slate-800/90 text-slate-300 hover:bg-slate-700 flex items-center justify-center transition active:scale-95 shrink-0" 
                        title="إغلاق"
                    >
                        <i className="fa-solid fa-times text-xs"></i>
                    </button>
                    <h3 className="font-bold text-xs sm:text-sm text-cyan-400 flex items-center gap-1.5 truncate">
                        <i className="fa-solid fa-wand-magic-sparkles text-xs"></i>
                        <span className="hidden xs:inline truncate">المحرر الهندسي</span>
                        <span className="xs:hidden truncate">المحرر</span>
                    </h3>
                </div>

                <div className="flex gap-1 sm:gap-1.5 items-center shrink-0">
                    <button 
                        onClick={handleUndo} 
                        disabled={history.length === 0} 
                        className="w-8 h-8 rounded-lg bg-slate-800 text-white hover:bg-slate-700 transition flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none active:scale-95" 
                        title="تراجع"
                    >
                        <i className="fa-solid fa-rotate-left text-xs"></i>
                    </button>
                    
                    {selectedId && (
                        <div className="flex gap-1 items-center bg-slate-950/70 p-0.5 rounded-lg border border-slate-800">
                            <button 
                                onClick={bringForward} 
                                className="w-7 h-7 rounded-md bg-slate-800 text-slate-200 hover:bg-slate-700 transition flex items-center justify-center active:scale-95" 
                                title="رفع للأمام"
                            >
                                <i className="fa-solid fa-layer-group text-[10px]"></i>
                            </button>
                            <button 
                                onClick={sendBackward} 
                                className="w-7 h-7 rounded-md bg-slate-800 text-slate-200 hover:bg-slate-700 transition flex items-center justify-center active:scale-95" 
                                title="إرسال للخلف"
                            >
                                <i className="fa-solid fa-layer-group text-[10px] transform rotate-180"></i>
                            </button>
                            <button 
                                onClick={handleDuplicateSelected} 
                                className="w-7 h-7 rounded-md bg-indigo-900/60 text-indigo-300 hover:bg-indigo-800 transition flex items-center justify-center border border-indigo-700/50 active:scale-95" 
                                title="تكرار العنصر"
                            >
                                <i className="fa-solid fa-copy text-[10px]"></i>
                            </button>
                            <button 
                                onClick={handleDeleteSelected} 
                                className="w-7 h-7 rounded-md bg-red-900/60 text-red-300 hover:bg-red-800 transition flex items-center justify-center border border-red-700/50 active:scale-95" 
                                title="حذف المحدد"
                            >
                                <i className="fa-solid fa-trash-can text-[10px]"></i>
                            </button>
                        </div>
                    )}

                    <button 
                        onClick={handleSaveImage} 
                        disabled={isSaving} 
                        className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:brightness-110 active:scale-95 text-white px-2.5 sm:px-3.5 py-1.5 rounded-lg font-bold text-xs transition flex items-center gap-1.5 shadow disabled:opacity-50"
                    >
                        {isSaving ? <i className="fa-solid fa-circle-notch fa-spin text-xs"></i> : <i className="fa-solid fa-save text-xs"></i>}
                        <span className="hidden sm:inline">حفظ الصورة</span>
                        <span className="sm:hidden">حفظ</span>
                    </button>
                </div>
            </div>

            {/* Selected Element Property Inspector Header (Real-Time Live Control Bar) */}
            <div className="bg-slate-900/90 backdrop-blur-md px-2.5 py-1.5 border-b border-slate-800 text-white flex items-center gap-2 overflow-x-auto no-scrollbar text-xs z-10 shrink-0">
                {/* Select / Live Edit Mode */}
                <div className="flex items-center gap-1.5 shrink-0">
                    <button 
                        onClick={() => handleToolSelect('select')} 
                        className={`px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 transition text-[11px] active:scale-95 ${activeTool === 'select' ? 'bg-blue-600 text-white shadow' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                    >
                        <i className="fa-solid fa-arrow-pointer text-[10px]"></i>
                        <span>{selectedId ? 'تعديل' : 'تحديد'}</span>
                    </button>

                    {selectedElement && (
                        <div className="flex items-center gap-1">
                            <span className="text-[10px] text-cyan-300 font-semibold bg-cyan-950/80 border border-cyan-800/80 px-1.5 py-0.5 rounded">
                                {selectedElement.type}
                            </span>
                            {['text', 'callout', 'dimension'].includes(selectedElement.type) && (
                                <button 
                                    onClick={handleEditTextOfSelected}
                                    className="px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-bold text-[10px] transition active:scale-95 flex items-center gap-1"
                                >
                                    <i className="fa-solid fa-pen-to-square text-[9px]"></i> تعديل النص
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Color Swatches & Custom Picker */}
                <div className="flex items-center gap-1.5 shrink-0 bg-slate-950/80 px-2 py-1 rounded-lg border border-slate-800/80">
                    <span className="text-[10px] text-slate-400 font-bold hidden sm:inline">اللون:</span>
                    <div className="flex items-center gap-1">
                        {['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ffffff', '#000000'].map(c => (
                            <button 
                                key={c}
                                onClick={() => handleColorChange(c)}
                                className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full transition-transform border shrink-0 ${color === c ? 'scale-125 border-white ring-2 ring-blue-500' : 'border-slate-700 hover:scale-110'}`}
                                style={{ backgroundColor: c }}
                            />
                        ))}
                    </div>
                    <label className="relative w-5 h-5 rounded-md cursor-pointer border border-slate-700 overflow-hidden shrink-0 flex items-center justify-center bg-slate-800" title="لون مخصص">
                        <i className="fa-solid fa-palette text-[9px] text-slate-400"></i>
                        <input 
                            type="color" 
                            value={color} 
                            onChange={(e) => handleColorChange(e.target.value)} 
                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" 
                        />
                    </label>
                </div>

                {/* Size / Thickness Slider */}
                <div className="flex items-center gap-1.5 shrink-0 bg-slate-950/80 px-2 py-1 rounded-lg border border-slate-800/80">
                    <span className="text-[10px] text-slate-400 font-bold">السمك:</span>
                    <input 
                        type="range" 
                        min="2" 
                        max="35" 
                        value={lineWidth} 
                        onChange={(e) => handleLineWidthChange(Number(e.target.value))} 
                        className="w-16 sm:w-20 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500" 
                    />
                    <span className="text-[10px] font-mono font-bold text-cyan-300 w-4 text-center">{lineWidth}</span>
                </div>

                {/* Opacity Slider */}
                <div className="flex items-center gap-1.5 shrink-0 bg-slate-950/80 px-2 py-1 rounded-lg border border-slate-800/80">
                    <span className="text-[10px] text-slate-400 font-bold">الشفافية:</span>
                    <input 
                        type="range" 
                        min="0.1" 
                        max="1" 
                        step="0.05" 
                        value={opacity} 
                        onChange={(e) => handleOpacityChange(Number(e.target.value))} 
                        className="w-14 sm:w-16 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-400" 
                    />
                    <span className="text-[10px] font-mono font-bold text-cyan-300 w-7 text-center">{Math.round(opacity * 100)}%</span>
                </div>

                {/* Fill Toggle */}
                <button 
                    onClick={handleFillToggle}
                    className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition shrink-0 active:scale-95 flex items-center gap-1 ${isFilled ? 'bg-indigo-600 text-white border-indigo-400' : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'}`}
                >
                    <i className="fa-solid fa-fill-drip text-[9px]"></i>
                    <span>{isFilled ? 'ممتلئ' : 'مفرغ'}</span>
                </button>

                {/* Scale / Zoom Control for Selected Element */}
                {selectedId && (
                    <div className="flex items-center gap-1.5 shrink-0 bg-blue-950/90 px-2.5 py-1 rounded-lg border border-blue-600/80 shadow-xs">
                        <span className="text-[10px] text-blue-300 font-bold flex items-center gap-1">
                            <i className="fa-solid fa-up-right-and-down-left-from-center text-[9px]"></i>
                            <span>الحجم:</span>
                        </span>
                        <button 
                            type="button"
                            onClick={() => scaleSelectedElement(0.85)} 
                            className="w-5 h-5 rounded bg-blue-800 hover:bg-blue-700 text-white flex items-center justify-center font-bold text-xs transition active:scale-90"
                            title="تصغير (-15%)"
                        >
                            <i className="fa-solid fa-minus text-[8px]"></i>
                        </button>
                        <span className="text-[10px] font-mono font-bold text-yellow-300 min-w-8 text-center">
                            {elements.find(e => e.id === selectedId)?.scalePercent || 100}%
                        </span>
                        <button 
                            type="button"
                            onClick={() => scaleSelectedElement(1.15)} 
                            className="w-5 h-5 rounded bg-blue-800 hover:bg-blue-700 text-white flex items-center justify-center font-bold text-xs transition active:scale-90"
                            title="تكبير (+15%)"
                        >
                            <i className="fa-solid fa-plus text-[8px]"></i>
                        </button>
                        <div className="flex items-center gap-0.5 mr-1 border-r border-blue-800/80 pr-1">
                            {[50, 75, 100, 150, 200].map(p => (
                                <button
                                    key={p}
                                    type="button"
                                    onClick={() => setElementScalePreset(p)}
                                    className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-900/80 hover:bg-blue-800 text-blue-200 transition active:scale-95"
                                >
                                    {p}%
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Canvas Viewing & Annotation Area */}
            <div className="flex-1 relative overflow-hidden bg-slate-950 flex items-center justify-center cursor-crosshair p-1 sm:p-2" ref={containerRef}>
                <canvas 
                    ref={canvasRef}
                    width={canvasSize.w}
                    height={canvasSize.h}
                    onMouseDown={handlePointerDown}
                    onMouseMove={handlePointerMove}
                    onMouseUp={handlePointerUp}
                    onMouseLeave={handlePointerUp}
                    onTouchStart={handlePointerDown}
                    onTouchMove={handlePointerMove}
                    onTouchEnd={handlePointerUp}
                    className="max-w-full max-h-full shadow-2xl border border-slate-800 rounded-lg"
                    style={{ touchAction: 'none' }}
                />

                {/* Text Editing Overlay */}
                {editingTextId && (
                    <textarea 
                        ref={textAreaRef} 
                        value={textInputValue} 
                        onChange={handleTextChange} 
                        onBlur={finishTextEditing} 
                        className="absolute z-50 bg-slate-900/95 text-white border-2 border-blue-500 rounded-lg p-2.5 font-bold shadow-2xl outline-none"
                        style={{
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            minWidth: '240px',
                            direction: 'rtl'
                        }}
                        placeholder="اكتب الملاحظة هنا..."
                        autoFocus 
                    />
                )}
            </div>

            {/* Bottom Tool Categories & Controls */}
            <div className="bg-slate-900/95 backdrop-blur border-t border-slate-800 p-1.5 sm:p-2.5 shrink-0 safe-bottom z-30">
                <div className="max-w-3xl mx-auto flex flex-col gap-1.5">
                    
                    {/* Tool Category Tabs */}
                    <div className="flex justify-center gap-1 border-b border-slate-800/80 pb-1 text-xs font-bold overflow-x-auto no-scrollbar">
                        <button 
                            onClick={() => setActiveTab('draw')} 
                            className={`px-2.5 sm:px-3 py-1 rounded-lg transition text-[11px] sm:text-xs whitespace-nowrap active:scale-95 ${activeTab === 'draw' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                        >
                            <i className="fa-solid fa-pen-ruler ml-1 text-[10px]"></i> رسم وأسهم
                        </button>
                        <button 
                            onClick={() => setActiveTab('shapes')} 
                            className={`px-2.5 sm:px-3 py-1 rounded-lg transition text-[11px] sm:text-xs whitespace-nowrap active:scale-95 ${activeTab === 'shapes' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                        >
                            <i className="fa-solid fa-shapes ml-1 text-[10px]"></i> أشكال هندسية
                        </button>
                        <button 
                            onClick={() => setActiveTab('text')} 
                            className={`px-2.5 sm:px-3 py-1 rounded-lg transition text-[11px] sm:text-xs whitespace-nowrap active:scale-95 ${activeTab === 'text' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                        >
                            <i className="fa-solid fa-comment-dots ml-1 text-[10px]"></i> نصوص وملاحظات
                        </button>
                        <button 
                            onClick={() => setActiveTab('stamps')} 
                            className={`px-2.5 sm:px-3 py-1 rounded-lg transition text-[11px] sm:text-xs whitespace-nowrap active:scale-95 ${activeTab === 'stamps' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                        >
                            <i className="fa-solid fa-stamp ml-1 text-[10px]"></i> أختام ورموز
                        </button>
                    </div>

                    {/* Tools Tray based on active tab */}
                    <div className="flex items-center justify-start sm:justify-center gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar py-0.5 px-0.5">
                        
                        {activeTab === 'draw' && (
                            <>
                                <button onClick={() => handleToolSelect('pen')} className={`px-2.5 py-1.5 rounded-lg font-bold text-[11px] sm:text-xs flex items-center gap-1.5 transition shrink-0 active:scale-95 ${activeTool === 'pen' ? 'bg-blue-600 text-white shadow ring-1 ring-blue-400' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                                    <i className="fa-solid fa-pen text-[10px]"></i> قلم
                                </button>
                                <button onClick={() => handleToolSelect('highlighter')} className={`px-2.5 py-1.5 rounded-lg font-bold text-[11px] sm:text-xs flex items-center gap-1.5 transition shrink-0 active:scale-95 ${activeTool === 'highlighter' ? 'bg-amber-600 text-white shadow ring-1 ring-amber-400' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                                    <i className="fa-solid fa-highlighter text-[10px]"></i> تظليل
                                </button>
                                <button onClick={() => handleToolSelect('line')} className={`px-2.5 py-1.5 rounded-lg font-bold text-[11px] sm:text-xs flex items-center gap-1.5 transition shrink-0 active:scale-95 ${activeTool === 'line' ? 'bg-blue-600 text-white shadow ring-1 ring-blue-400' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                                    <i className="fa-solid fa-minus transform -rotate-45 text-[10px]"></i> خط
                                </button>
                                <button onClick={() => handleToolSelect('arrow')} className={`px-2.5 py-1.5 rounded-lg font-bold text-[11px] sm:text-xs flex items-center gap-1.5 transition shrink-0 active:scale-95 ${activeTool === 'arrow' ? 'bg-blue-600 text-white shadow ring-1 ring-blue-400' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                                    <i className="fa-solid fa-arrow-right transform -rotate-45 text-[10px]"></i> سهم
                                </button>
                                <button onClick={() => handleToolSelect('double_arrow')} className={`px-2.5 py-1.5 rounded-lg font-bold text-[11px] sm:text-xs flex items-center gap-1.5 transition shrink-0 active:scale-95 ${activeTool === 'double_arrow' ? 'bg-blue-600 text-white shadow ring-1 ring-blue-400' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                                    <i className="fa-solid fa-arrows-left-right transform -rotate-45 text-[10px]"></i> سهم مزدوج
                                </button>
                                <button onClick={() => handleToolSelect('curved_arrow')} className={`px-2.5 py-1.5 rounded-lg font-bold text-[11px] sm:text-xs flex items-center gap-1.5 transition shrink-0 active:scale-95 ${activeTool === 'curved_arrow' ? 'bg-blue-600 text-white shadow ring-1 ring-blue-400' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                                    <i className="fa-solid fa-share text-[11px] transform -scale-x-100"></i> سهم منحني
                                </button>
                                <button onClick={() => handleToolSelect('dimension')} className={`px-2.5 py-1.5 rounded-lg font-bold text-[11px] sm:text-xs flex items-center gap-1.5 transition shrink-0 active:scale-95 ${activeTool === 'dimension' ? 'bg-emerald-600 text-white shadow ring-1 ring-emerald-400' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                                    <i className="fa-solid fa-ruler-combined text-[10px]"></i> قياس/أبعاد
                                </button>
                            </>
                        )}

                        {activeTab === 'shapes' && (
                            <>
                                <button onClick={() => handleToolSelect('rect')} className={`px-2.5 py-1.5 rounded-lg font-bold text-[11px] sm:text-xs flex items-center gap-1.5 transition shrink-0 active:scale-95 ${activeTool === 'rect' ? 'bg-blue-600 text-white shadow ring-1 ring-blue-400' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                                    <i className="fa-regular fa-square text-[10px]"></i> مستطيل
                                </button>
                                <button onClick={() => handleToolSelect('filled_rect')} className={`px-2.5 py-1.5 rounded-lg font-bold text-[11px] sm:text-xs flex items-center gap-1.5 transition shrink-0 active:scale-95 ${activeTool === 'filled_rect' ? 'bg-blue-600 text-white shadow ring-1 ring-blue-400' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                                    <i className="fa-solid fa-square text-[10px]"></i> مستطيل معبأ
                                </button>
                                <button onClick={() => handleToolSelect('circle')} className={`px-2.5 py-1.5 rounded-lg font-bold text-[11px] sm:text-xs flex items-center gap-1.5 transition shrink-0 active:scale-95 ${activeTool === 'circle' ? 'bg-blue-600 text-white shadow ring-1 ring-blue-400' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                                    <i className="fa-regular fa-circle text-[10px]"></i> دائرة
                                </button>
                                <button onClick={() => handleToolSelect('filled_circle')} className={`px-2.5 py-1.5 rounded-lg font-bold text-[11px] sm:text-xs flex items-center gap-1.5 transition shrink-0 active:scale-95 ${activeTool === 'filled_circle' ? 'bg-blue-600 text-white shadow ring-1 ring-blue-400' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                                    <i className="fa-solid fa-circle text-[10px]"></i> دائرة معبأة
                                </button>
                                <button onClick={() => handleToolSelect('triangle')} className={`px-2.5 py-1.5 rounded-lg font-bold text-[11px] sm:text-xs flex items-center gap-1.5 transition shrink-0 active:scale-95 ${activeTool === 'triangle' ? 'bg-blue-600 text-white shadow ring-1 ring-blue-400' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                                    <i className="fa-solid fa-play transform -rotate-90 text-[10px]"></i> مثلث
                                </button>
                                <button onClick={() => handleToolSelect('star')} className={`px-2.5 py-1.5 rounded-lg font-bold text-[11px] sm:text-xs flex items-center gap-1.5 transition shrink-0 active:scale-95 ${activeTool === 'star' ? 'bg-amber-500 text-white shadow ring-1 ring-amber-400' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                                    <i className="fa-solid fa-star text-[10px]"></i> نجمة
                                </button>
                                <button onClick={() => handleToolSelect('cloud')} className={`px-2.5 py-1.5 rounded-lg font-bold text-[11px] sm:text-xs flex items-center gap-1.5 transition shrink-0 active:scale-95 ${activeTool === 'cloud' ? 'bg-indigo-600 text-white shadow ring-1 ring-indigo-400' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                                    <i className="fa-solid fa-cloud text-[10px]"></i> سحابة مراجعة
                                </button>
                                <button onClick={() => handleToolSelect('compass_north')} className={`px-2.5 py-1.5 rounded-lg font-bold text-[11px] sm:text-xs flex items-center gap-1.5 transition shrink-0 active:scale-95 ${activeTool === 'compass_north' ? 'bg-sky-600 text-white shadow ring-1 ring-sky-400' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                                    <i className="fa-regular fa-compass text-[10px]"></i> سهم الشمال 🧭
                                </button>
                                <button onClick={() => handleToolSelect('target')} className={`px-2.5 py-1.5 rounded-lg font-bold text-[11px] sm:text-xs flex items-center gap-1.5 transition shrink-0 active:scale-95 ${activeTool === 'target' ? 'bg-red-600 text-white shadow ring-1 ring-red-400' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                                    <i className="fa-solid fa-crosshairs text-[10px]"></i> بؤرة فحص 🎯
                                </button>
                                <button onClick={() => handleToolSelect('camera_angle')} className={`px-2.5 py-1.5 rounded-lg font-bold text-[11px] sm:text-xs flex items-center gap-1.5 transition shrink-0 active:scale-95 ${activeTool === 'camera_angle' ? 'bg-cyan-600 text-white shadow ring-1 ring-cyan-400' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                                    <i className="fa-solid fa-video text-[10px]"></i> زاوية تصوير 📷
                                </button>
                                <button onClick={() => handleToolSelect('hazard_strip')} className={`px-2.5 py-1.5 rounded-lg font-bold text-[11px] sm:text-xs flex items-center gap-1.5 transition shrink-0 active:scale-95 ${activeTool === 'hazard_strip' ? 'bg-yellow-600 text-black shadow ring-1 ring-yellow-400' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                                    <i className="fa-solid fa-bars-staggered text-[10px]"></i> شريط أمان 🚧
                                </button>
                            </>
                        )}

                        {activeTab === 'text' && (
                            <>
                                <button onClick={() => handleToolSelect('text')} className={`px-2.5 py-1.5 rounded-lg font-bold text-[11px] sm:text-xs flex items-center gap-1.5 transition shrink-0 active:scale-95 ${activeTool === 'text' ? 'bg-blue-600 text-white shadow ring-1 ring-blue-400' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                                    <i className="fa-solid fa-font text-[10px]"></i> كتابة نص
                                </button>
                                <button onClick={() => handleToolSelect('callout')} className={`px-2.5 py-1.5 rounded-lg font-bold text-[11px] sm:text-xs flex items-center gap-1.5 transition shrink-0 active:scale-95 ${activeTool === 'callout' ? 'bg-blue-600 text-white shadow ring-1 ring-blue-400' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                                    <i className="fa-solid fa-message text-[10px]"></i> ملاحظة بسهم
                                </button>
                                <button onClick={() => handleToolSelect('badge')} className={`px-2.5 py-1.5 rounded-lg font-bold text-[11px] sm:text-xs flex items-center gap-1.5 transition shrink-0 active:scale-95 ${activeTool === 'badge' ? 'bg-orange-600 text-white shadow ring-1 ring-orange-400' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                                    <i className="fa-solid fa-list-ol text-[10px]"></i> شارة #{badgeNum}
                                </button>
                                <button onClick={() => handleToolSelect('pin')} className={`px-2.5 py-1.5 rounded-lg font-bold text-[11px] sm:text-xs flex items-center gap-1.5 transition shrink-0 active:scale-95 ${activeTool === 'pin' ? 'bg-rose-600 text-white shadow ring-1 ring-rose-400' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                                    <i className="fa-solid fa-location-dot text-[10px]"></i> دبوس موقع
                                </button>
                            </>
                        )}

                        {activeTab === 'stamps' && (
                            <>
                                <button onClick={() => handleToolSelect('stamp')} className={`px-2.5 py-1.5 rounded-lg font-bold text-[11px] sm:text-xs flex items-center gap-1.5 transition shrink-0 active:scale-95 ${activeTool === 'stamp' ? 'bg-emerald-600 text-white shadow ring-1 ring-emerald-400' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                                    <i className="fa-solid fa-stamp text-[10px]"></i> ختم مهني
                                </button>
                                <button onClick={() => handleToolSelect('checkmark')} className={`px-2.5 py-1.5 rounded-lg font-bold text-[11px] sm:text-xs flex items-center gap-1.5 transition shrink-0 active:scale-95 ${activeTool === 'checkmark' ? 'bg-green-600 text-white shadow ring-1 ring-green-400' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                                    <i className="fa-solid fa-check text-[10px]"></i> صح
                                </button>
                                <button onClick={() => handleToolSelect('cross')} className={`px-2.5 py-1.5 rounded-lg font-bold text-[11px] sm:text-xs flex items-center gap-1.5 transition shrink-0 active:scale-95 ${activeTool === 'cross' ? 'bg-red-600 text-white shadow ring-1 ring-red-400' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                                    <i className="fa-solid fa-xmark text-[10px]"></i> خطأ
                                </button>
                                <button onClick={() => handleToolSelect('hazard')} className={`px-2.5 py-1.5 rounded-lg font-bold text-[11px] sm:text-xs flex items-center gap-1.5 transition shrink-0 active:scale-95 ${activeTool === 'hazard' ? 'bg-amber-600 text-white shadow ring-1 ring-amber-400' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                                    <i className="fa-solid fa-triangle-exclamation text-[10px]"></i> تنبيه
                                </button>
                                <button onClick={() => handleToolSelect('blur')} className={`px-2.5 py-1.5 rounded-lg font-bold text-[11px] sm:text-xs flex items-center gap-1.5 transition shrink-0 active:scale-95 ${activeTool === 'blur' ? 'bg-purple-600 text-white shadow ring-1 ring-purple-400' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                                    <i className="fa-solid fa-eye-slash text-[10px]"></i> طمس
                                </button>

                                {activeTool === 'stamp' && (
                                    <div className="flex gap-1 items-center bg-slate-950/90 p-1 rounded-lg border border-slate-700 overflow-x-auto no-scrollbar shrink-0 max-w-full">
                                        <button onClick={() => handleStampTypeChange('approved')} className={`px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap active:scale-95 ${stampType === 'approved' ? 'bg-green-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}>معتمد ✔</button>
                                        <button onClick={() => handleStampTypeChange('rejected')} className={`px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap active:scale-95 ${stampType === 'rejected' ? 'bg-red-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}>مرفوض ✖</button>
                                        <button onClick={() => handleStampTypeChange('review')} className={`px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap active:scale-95 ${stampType === 'review' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}>مراجعة ⏳</button>
                                        <button onClick={() => handleStampTypeChange('urgent')} className={`px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap active:scale-95 ${stampType === 'urgent' ? 'bg-orange-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}>عاجل ⚠</button>
                                        <button onClick={() => handleStampTypeChange('resolved')} className={`px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap active:scale-95 ${stampType === 'resolved' ? 'bg-teal-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}>معالجة 🔧</button>
                                        <button onClick={() => handleStampTypeChange('compliant')} className={`px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap active:scale-95 ${stampType === 'compliant' ? 'bg-sky-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}>مطابق 📋</button>
                                        <button onClick={() => handleStampTypeChange('stop')} className={`px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap active:scale-95 ${stampType === 'stop' ? 'bg-red-900 text-white' : 'text-slate-300 hover:bg-slate-800'}`}>إيقاف 🛑</button>
                                        <button onClick={() => handleStampTypeChange('poured')} className={`px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap active:scale-95 ${stampType === 'poured' ? 'bg-amber-800 text-white' : 'text-slate-300 hover:bg-slate-800'}`}>تم الصب 🏗</button>
                                        <button onClick={() => handleStampTypeChange('rebar')} className={`px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap active:scale-95 ${stampType === 'rebar' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}>تسليح 📏</button>
                                        <button onClick={() => handleStampTypeChange('consultant')} className={`px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap active:scale-95 ${stampType === 'consultant' ? 'bg-purple-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}>استشاري 👔</button>
                                    </div>
                                )}
                            </>
                        )}

                    </div>
                </div>
            </div>
        </div>
    );
};

export default ImageEditor;
