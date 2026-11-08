
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

// Updated Tool Types
type ToolType = 'select' | 'pen' | 'line' | 'arrow' | 'double_arrow' | 'curved_arrow' | 'rect' | 'circle' | 'text';

interface DrawingElement {
    id: string;
    type: ToolType;
    x: number; // Start X
    y: number; // Start Y
    w: number; // End X (Current Pointer X)
    h: number; // End Y (Current Pointer Y)
    points?: {x: number, y: number}[]; // For Pen
    text?: string;
    color: string;
    size: number;
}

const ImageEditor: React.FC<ImageEditorProps> = ({ fileId, imageUrl, fileName, parentId, onClose, onSave }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    
    // --- State ---
    const [elements, setElements] = useState<DrawingElement[]>([]);
    const [history, setHistory] = useState<DrawingElement[][]>([]); 
    const [activeTool, setActiveTool] = useState<ToolType>('arrow'); // Default to arrow drawing, user can switch to select
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [color, setColor] = useState('#ef4444');
    const [lineWidth, setLineWidth] = useState(5);
    
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

    // --- History Management ---
    const addToHistory = () => {
        const newHistory = [...history, elements];
        if (newHistory.length > 20) newHistory.shift(); 
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
    const generateId = () => `el_${Date.now()}_${Math.random()}`;

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

    // Improved Hit Detection for Mobile
    const isCursorOnElement = (x: number, y: number, element: DrawingElement) => {
        const tolerance = 40; // Increased tolerance for touch
        
        if (element.type === 'rect' || element.type === 'text') {
            
            // For text specifically, check if inside box
            if (element.type === 'text') {
                 // Text 'w' and 'h' are updated during render to reflect dimensions, 
                 // but we store position in x,y. Let's use the bounds calculated in render.
                 // We will approximate here based on stored x,y and presumed size
                 const ctx = canvasRef.current?.getContext('2d');
                 if(ctx && element.text) {
                     ctx.save();
                     // FORCE LTR to match visual drawing
                     ctx.direction = 'ltr';
                     ctx.textAlign = 'left';
                     ctx.textBaseline = 'top';
                     ctx.font = `bold ${element.size * 5}px Tajawal, sans-serif`;
                     const metrics = ctx.measureText(element.text);
                     const w = metrics.width;
                     const h = element.size * 5; // Approx height
                     ctx.restore();
                     
                     // Hit box with generous padding
                     return x >= element.x - 20 && x <= element.x + w + 20 && 
                            y >= element.y - 20 && y <= element.y + h + 20;
                 }
            }

            const minX = Math.min(element.x, element.w);
            const maxX = Math.max(element.x, element.w);
            const minY = Math.min(element.y, element.h);
            const maxY = Math.max(element.y, element.h);

            return x >= minX - tolerance && x <= maxX + tolerance && y >= minY - tolerance && y <= maxY + tolerance;
        }

        if (element.type === 'circle') {
            const radius = Math.sqrt(Math.pow(element.w - element.x, 2) + Math.pow(element.h - element.y, 2));
            const distance = Math.sqrt(Math.pow(x - element.x, 2) + Math.pow(y - element.y, 2));
            return Math.abs(distance - radius) < tolerance;
        }
        
        if (['arrow', 'double_arrow', 'curved_arrow', 'line', 'pen'].includes(element.type)) {
            if (element.type === 'pen' && element.points) {
                return element.points.some(p => Math.sqrt(Math.pow(x - p.x, 2) + Math.pow(y - p.y, 2)) < tolerance);
            }

            const x1 = element.x;
            const y1 = element.y;
            const x2 = element.w;
            const y2 = element.h;
            
            const A = x - x1;
            const B = y - y1;
            const C = x2 - x1;
            const D = y2 - y1;

            const dot = A * C + B * D;
            const len_sq = C * C + D * D;
            let param = -1;
            if (len_sq !== 0) param = dot / len_sq;

            let xx, yy;

            if (param < 0) { xx = x1; yy = y1; }
            else if (param > 1) { xx = x2; yy = y2; }
            else { xx = x1 + param * C; yy = y1 + param * D; }

            const dx = x - xx;
            const dy = y - yy;
            return (dx * dx + dy * dy) < (tolerance * tolerance);
        }
        
        return false;
    };

    // Check if clicking on the Resize Handle (Bottom-Right)
    const isOnResizeHandle = (x: number, y: number, element: DrawingElement) => {
        if (!['text', 'rect', 'circle'].includes(element.type)) return false;
        
        let targetX = element.w;
        let targetY = element.h;

        if (element.type === 'text') {
             const ctx = canvasRef.current?.getContext('2d');
             if(ctx && element.text) {
                 ctx.save();
                 ctx.direction = 'ltr';
                 ctx.textAlign = 'left';
                 ctx.textBaseline = 'top';
                 ctx.font = `bold ${element.size * 5}px Tajawal, sans-serif`;
                 const metrics = ctx.measureText(element.text);
                 targetX = element.x + metrics.width;
                 targetY = element.y + (element.size * 5);
                 ctx.restore();
             }
        } else if (element.type === 'circle') {
             // For circle, handle is at the perimeter
             // Simplified: Handle is at w, h (end point of radius)
             targetX = element.w;
             targetY = element.h;
        }

        const dist = Math.sqrt(Math.pow(x - targetX, 2) + Math.pow(y - targetY, 2));
        return dist < 40; // 40px radius hit area
    };

    // --- Main Rendering Loop ---
    useLayoutEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx || !bgImage) return;

        // 1. Clear & Background
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bgImage, 0, 0);

        // 2. Draw Elements
        elements.forEach(el => {
            ctx.save(); // Save state to avoid bleeding styles
            ctx.beginPath();
            ctx.lineWidth = el.size;
            ctx.strokeStyle = el.color;
            ctx.fillStyle = el.color;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            if (el.type === 'rect') {
                const w = el.w - el.x;
                const h = el.h - el.y;
                ctx.strokeRect(el.x, el.y, w, h);
            } else if (el.type === 'circle') {
                const radius = Math.sqrt(Math.pow(el.w - el.x, 2) + Math.pow(el.h - el.y, 2));
                ctx.arc(el.x, el.y, radius, 0, 2 * Math.PI);
                ctx.stroke();
            } else if (el.type === 'line') {
                ctx.moveTo(el.x, el.y);
                ctx.lineTo(el.w, el.h);
                ctx.stroke();
            } else if (el.type === 'arrow') {
                drawArrow(ctx, el.x, el.y, el.w, el.h, el.size, false);
            } else if (el.type === 'double_arrow') {
                drawArrow(ctx, el.x, el.y, el.w, el.h, el.size, true);
            } else if (el.type === 'curved_arrow') {
                drawCurvedArrow(ctx, el.x, el.y, el.w, el.h, el.size);
            } else if (el.type === 'pen' && el.points) {
                if (el.points.length > 0) {
                    ctx.moveTo(el.points[0].x, el.points[0].y);
                    for (let i = 1; i < el.points.length; i++) {
                        ctx.lineTo(el.points[i].x, el.points[i].y);
                    }
                    ctx.stroke();
                }
            } else if (el.type === 'text' && el.text) {
                if (editingTextId !== el.id) {
                    // FORCE LTR drawing to align visual with math bounds regardless of Arabic text
                    ctx.direction = 'ltr'; 
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'top';
                    ctx.font = `bold ${el.size * 5}px Tajawal, sans-serif`;
                    
                    ctx.strokeStyle = 'white';
                    ctx.lineWidth = 3;
                    ctx.strokeText(el.text, el.x, el.y);
                    ctx.fillStyle = el.color;
                    ctx.fillText(el.text, el.x, el.y);
                }
            }
            ctx.restore(); // Restore state
        });

        // 3. Draw Selection & Handles
        if (selectedId && action !== 'drawing') {
            const el = elements.find(e => e.id === selectedId);
            if (el) {
                ctx.save();
                ctx.strokeStyle = '#3b82f6';
                ctx.lineWidth = 2;
                ctx.setLineDash([6, 4]);
                ctx.fillStyle = '#3b82f6';

                let minX = el.x, minY = el.y, maxX = el.w, maxY = el.h;

                if (el.type === 'text' && el.text) {
                    // Match the Text Drawing Settings exactly
                    ctx.direction = 'ltr';
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'top';
                    ctx.font = `bold ${el.size * 5}px Tajawal, sans-serif`;
                    const metrics = ctx.measureText(el.text);
                    maxX = el.x + metrics.width;
                    maxY = el.y + (el.size * 5);
                    
                    // Add padding to text selection box for easier grab
                    ctx.strokeRect(el.x - 5, el.y - 5, (maxX - el.x) + 10, (maxY - el.y) + 10);
                    
                    // Draw Resize Handle
                    ctx.fillRect(maxX - 8, maxY - 8, 16, 16); 
                } 
                else if (el.type === 'rect') {
                    const w = el.w - el.x;
                    const h = el.h - el.y;
                    ctx.strokeRect(el.x, el.y, w, h);
                    // Resize Handle at Corner
                    ctx.fillRect(el.w - 8, el.h - 8, 16, 16);
                }
                else if (el.type === 'circle') {
                    // Draw radius line for visual feedback
                    ctx.beginPath();
                    ctx.moveTo(el.x, el.y);
                    ctx.lineTo(el.w, el.h);
                    ctx.setLineDash([2, 4]);
                    ctx.stroke();
                    // Center point
                    ctx.fillRect(el.x - 4, el.y - 4, 8, 8);
                    // Radius handle
                    ctx.fillRect(el.w - 8, el.h - 8, 16, 16);
                }
                else if (['arrow', 'double_arrow', 'curved_arrow', 'line', 'pen'].includes(el.type)) {
                    // Start Handle
                    ctx.fillRect(el.x - 8, el.y - 8, 16, 16);
                    if (el.type !== 'pen') {
                        // End Handle
                        ctx.fillRect(el.w - 8, el.h - 8, 16, 16);
                    }
                }
                
                ctx.restore();
            }
        }

    }, [elements, selectedId, editingTextId, bgImage, canvasSize]);

    // --- Drawing Helpers ---
    const drawArrow = (ctx: CanvasRenderingContext2D, fromx: number, fromy: number, tox: number, toy: number, width: number, double: boolean) => {
        const headlen = width * 4; 
        const dx = tox - fromx;
        const dy = toy - fromy;
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
        const headlen = width * 4;
        const mx = (fromx + tox) / 2;
        const my = (fromy + toy) / 2;
        const dist = Math.sqrt(Math.pow(tox - fromx, 2) + Math.pow(toy - fromy, 2));
        const offset = dist * 0.25; 
        
        const dx = tox - fromx;
        const dy = toy - fromy;
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
        // "Sticky" logic for Select:
        // If clicking 'select' again while it's active, toggle it off (optional, but good UX)
        // If clicking other tool, switch to it.
        if (tool === 'select') {
            if (activeTool === 'select') setActiveTool('arrow'); // Toggle off
            else setActiveTool('select');
        } else {
            setActiveTool(tool);
        }
        setSelectedId(null);
    };

    const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
        const pos = getMouseCoordinates(e);
        
        // 1. Text Insertion
        if (activeTool === 'text') {
            const newTextId = generateId();
            const newTextElement: DrawingElement = {
                id: newTextId,
                type: 'text',
                x: pos.x,
                y: pos.y,
                w: pos.x, 
                h: pos.y, 
                text: '',
                color: color,
                size: lineWidth
            };
            addToHistory();
            setElements(prev => [...prev, newTextElement]);
            setEditingTextId(newTextId);
            setTextInputValue('');
            // Don't switch tool, stay in Text mode for multiple inputs
            return;
        }

        // 2. Selection Mode
        if (activeTool === 'select') {
            // Check for Resize Handle first if something is selected
            if (selectedId) {
                const selectedEl = elements.find(el => el.id === selectedId);
                if (selectedEl && isOnResizeHandle(pos.x, pos.y, selectedEl)) {
                    setAction('resizing');
                    setStartPos(pos);
                    return;
                }
            }

            // Hit test for elements (Reverse to pick top-most)
            const clickedElement = elements.slice().reverse().find(el => isCursorOnElement(pos.x, pos.y, el));
            
            if (clickedElement) {
                setSelectedId(clickedElement.id);
                setStartPos(pos);
                setAction('moving');
                
                // Double tap check for text edit could go here
                if (clickedElement.type === 'text') {
                    // Logic to detect double tap manually if needed, or simple edit button
                }
            } else {
                setSelectedId(null);
            }
            return;
        }

        // 3. Drawing Mode (Sticky)
        setSelectedId(null);
        addToHistory();
        setAction('drawing');
        const newId = generateId();
        const newElement: DrawingElement = {
            id: newId,
            type: activeTool,
            x: pos.x,
            y: pos.y,
            w: pos.x, // Initial End Point = Start Point
            h: pos.y, 
            color: color,
            size: lineWidth,
            points: activeTool === 'pen' ? [{x: pos.x, y: pos.y}] : undefined
        };
        setElements(prev => [...prev, newElement]);
        setSelectedId(newId);
    };

    const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
        if (action === 'none') return;
        // Prevent scrolling on touch
        if ('touches' in e) e.preventDefault();
        
        const pos = getMouseCoordinates(e);

        if (action === 'drawing' && selectedId) {
            setElements(prev => prev.map(el => {
                if (el.id === selectedId) {
                    if (el.type === 'pen') {
                        return { ...el, points: [...(el.points || []), {x: pos.x, y: pos.y}] };
                    }
                    // Update End Coordinates (w, h) to follow cursor
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
                    if (el.type === 'pen' && el.points) {
                        return { ...el, points: el.points.map(p => ({ x: p.x + dx, y: p.y + dy })) };
                    }
                    return { 
                        ...el, 
                        x: el.x + dx, 
                        y: el.y + dy,
                        // Move endpoint too
                        w: el.w + dx,
                        h: el.h + dy
                    };
                }
                return el;
            }));
        }
        else if (action === 'resizing' && selectedId) {
            // Resize Logic
            // For Text: Dragging increases/decreases font size
            // For Shapes: Updates 'w' and 'h' (end points)
            setElements(prev => prev.map(el => {
                if (el.id === selectedId) {
                    if (el.type === 'text') {
                        // Calculate distance change to scale font
                        const dist = Math.sqrt(Math.pow(pos.x - el.x, 2) + Math.pow(pos.y - el.y, 2));
                        // Heuristic: 100px width approx size 5. Scale factor.
                        const newSize = Math.max(2, Math.min(50, dist / 20));
                        return { ...el, size: newSize };
                    }
                    // For Rect/Circle, simply update end coordinate
                    return { ...el, w: pos.x, h: pos.y };
                }
                return el;
            }));
        }
    };

    const handlePointerUp = () => {
        // Sticky Tools: Don't switch tool back to 'select' if we are drawing
        // If action was 'drawing', we just finish this shape. 
        // ActiveTool stays what it is.
        setAction('none');
    };

    // --- Text Editing ---
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
        // Don't switch to select automatically, keep text tool if active
    };

    const handleDeleteSelected = () => {
        if (selectedId) {
            addToHistory();
            setElements(prev => prev.filter(el => el.id !== selectedId));
            setSelectedId(null);
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
                    ctx.save();
                    ctx.beginPath();
                    ctx.lineWidth = el.size;
                    ctx.strokeStyle = el.color;
                    ctx.fillStyle = el.color;
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';

                    if (el.type === 'rect') {
                        ctx.strokeRect(el.x, el.y, el.w - el.x, el.h - el.y);
                    } else if (el.type === 'circle') {
                        const radius = Math.sqrt(Math.pow(el.w - el.x, 2) + Math.pow(el.h - el.y, 2));
                        ctx.arc(el.x, el.y, radius, 0, 2 * Math.PI);
                        ctx.stroke();
                    } else if (el.type === 'line') {
                        ctx.moveTo(el.x, el.y);
                        ctx.lineTo(el.w, el.h);
                        ctx.stroke();
                    } else if (el.type === 'arrow') drawArrow(ctx, el.x, el.y, el.w, el.h, el.size, false);
                    else if (el.type === 'double_arrow') drawArrow(ctx, el.x, el.y, el.w, el.h, el.size, true);
                    else if (el.type === 'curved_arrow') drawCurvedArrow(ctx, el.x, el.y, el.w, el.h, el.size);
                    else if (el.type === 'pen' && el.points) {
                        if (el.points.length > 0) {
                            ctx.moveTo(el.points[0].x, el.points[0].y);
                            for (let i = 1; i < el.points.length; i++) ctx.lineTo(el.points[i].x, el.points[i].y);
                            ctx.stroke();
                        }
                    } else if (el.type === 'text' && el.text) {
                        // FORCE LTR for text drawing to match visual expectation
                        ctx.direction = 'ltr'; 
                        ctx.textAlign = 'left';
                        ctx.textBaseline = 'top';
                        ctx.font = `bold ${el.size * 5}px Tajawal, sans-serif`;
                        
                        ctx.strokeStyle = 'white'; ctx.lineWidth = 3;
                        ctx.strokeText(el.text, el.x, el.y);
                        ctx.fillStyle = el.color;
                        ctx.fillText(el.text, el.x, el.y);
                    }
                    ctx.restore();
                });

                const blob = await new Promise<Blob | null>(resolve => tempCanvas.toBlob(resolve, 'image/jpeg', 0.85));
                if (blob) {
                    const newFileName = fileName.replace(/\.[^/.]+$/, "") + "_edited_" + Date.now().toString().slice(-4) + ".jpg";
                    const file = new File([blob], newFileName, { type: 'image/jpeg' });
                    await api.uploadFile(parentId, file);
                    alert("تم حفظ الصورة المعدلة.");
                    onSave();
                }
            }
        } catch (e) {
            alert("فشل الحفظ.");
        } finally {
            setIsSaving(false);
        }
    };

    const getTextAreaStyle = () => {
        if (!editingTextId || !canvasRef.current || !containerRef.current) return { display: 'none' };
        const el = elements.find(e => e.id === editingTextId);
        if (!el) return { display: 'none' };

        const canvasRect = canvasRef.current.getBoundingClientRect();
        const containerRect = containerRef.current.getBoundingClientRect();
        const scaleX = canvasRect.width / canvasRef.current.width;
        const scaleY = canvasRect.height / canvasRef.current.height;

        return {
            position: 'absolute',
            left: (el.x * scaleX) + (canvasRect.left - containerRect.left),
            top: (el.y * scaleY) + (canvasRect.top - containerRect.top),
            fontSize: `${el.size * 5 * scaleY}px`,
            color: el.color,
            fontFamily: 'Tajawal, sans-serif',
            fontWeight: 'bold',
            lineHeight: 1,
            background: 'transparent',
            border: '1px dashed #3b82f6',
            padding: '0',
            margin: '0',
            minWidth: '50px',
            outline: 'none',
            overflow: 'hidden',
            resize: 'none',
            whiteSpace: 'pre',
            direction: 'ltr', // Force LTR for input to match drawing
            textAlign: 'left',
            textShadow: '0 0 2px white'
        };
    };

    return (
        <div className="fixed inset-0 z-[200] bg-slate-900 flex flex-col animate-fade-in touch-none">
            {/* Header */}
            <div className="bg-slate-800 p-3 flex justify-between items-center shrink-0 border-b border-slate-700">
                <div className="flex items-center gap-3">
                    <button onClick={onClose} className="w-10 h-10 rounded-full bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition"><i className="fa-solid fa-times"></i></button>
                    <h3 className="text-white font-bold text-sm hidden sm:block">المحرر الهندسي الذكي</h3>
                </div>
                <div className="flex gap-3 items-center">
                    <button onClick={handleUndo} className="w-10 h-10 rounded-xl bg-slate-700 text-white hover:bg-slate-600 transition flex items-center justify-center" title="تراجع"><i className="fa-solid fa-rotate-left"></i></button>
                    {selectedId && (
                        <button onClick={handleDeleteSelected} className="w-10 h-10 rounded-xl bg-red-900/50 text-red-400 hover:bg-red-900 transition flex items-center justify-center border border-red-800" title="حذف المحدد"><i className="fa-solid fa-trash-can"></i></button>
                    )}
                    {/* Explicit Edit Button for Text when selected */}
                    {selectedId && elements.find(e => e.id === selectedId)?.type === 'text' && (
                        <button onClick={() => { setEditingTextId(selectedId); setTextInputValue(elements.find(e => e.id === selectedId)?.text || ''); }} className="w-10 h-10 rounded-xl bg-indigo-900/50 text-indigo-400 hover:bg-indigo-900 transition flex items-center justify-center border border-indigo-800" title="تعديل النص"><i className="fa-solid fa-pen"></i></button>
                    )}
                    <button onClick={handleSaveImage} disabled={isSaving} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-xl font-bold transition flex items-center gap-2 disabled:opacity-50">
                        {isSaving ? <i className="fa-solid fa-circle-notch fa-spin"></i> : <i className="fa-solid fa-save"></i>} <span>حفظ</span>
                    </button>
                </div>
            </div>

            {/* Canvas Area */}
            <div className="flex-1 relative overflow-hidden bg-slate-950 flex items-center justify-center cursor-crosshair" ref={containerRef}>
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
                    className="max-w-full max-h-full shadow-2xl border border-slate-800"
                    style={{ touchAction: 'none' }}
                />
                {editingTextId && (
                    // @ts-ignore
                    <textarea ref={textAreaRef} value={textInputValue} onChange={handleTextChange} onBlur={finishTextEditing} style={getTextAreaStyle() as any} autoFocus />
                )}
            </div>

            {/* Tools Bar */}
            <div className="bg-slate-900 p-2 sm:p-4 shrink-0 border-t border-slate-800 safe-bottom">
                <div className="max-w-5xl mx-auto flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-center gap-2">
                        {/* Main Tools */}
                        <div className="flex bg-slate-800 rounded-2xl p-1 gap-1 border border-slate-700 shadow-xl overflow-x-auto hide-scrollbar max-w-full">
                            {/* Sticky Select Button */}
                            <button onClick={() => handleToolSelect('select')} className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center transition ${activeTool === 'select' ? 'bg-blue-600 text-white shadow-lg scale-105 ring-2 ring-blue-400' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`} title="تحديد (Sticky)"><i className="fa-solid fa-arrow-pointer"></i></button>
                            
                            <div className="w-px h-6 bg-slate-700 my-auto mx-1"></div>
                            
                            <button onClick={() => handleToolSelect('text')} className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center transition ${activeTool === 'text' ? 'bg-blue-600 text-white shadow-lg scale-105' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`} title="كتابة نص"><i className="fa-solid fa-font"></i></button>
                            
                            <button onClick={() => handleToolSelect('line')} className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center transition ${activeTool === 'line' ? 'bg-blue-600 text-white shadow-lg scale-105' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`} title="خط"><i className="fa-solid fa-minus transform -rotate-45"></i></button>
                            <button onClick={() => handleToolSelect('arrow')} className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center transition ${activeTool === 'arrow' ? 'bg-blue-600 text-white shadow-lg scale-105' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`} title="سهم"><i className="fa-solid fa-arrow-right transform -rotate-45"></i></button>
                            <button onClick={() => handleToolSelect('double_arrow')} className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center transition ${activeTool === 'double_arrow' ? 'bg-blue-600 text-white shadow-lg scale-105' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`} title="سهم مزدوج"><i className="fa-solid fa-arrows-left-right transform -rotate-45"></i></button>
                            <button onClick={() => handleToolSelect('curved_arrow')} className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center transition ${activeTool === 'curved_arrow' ? 'bg-blue-600 text-white shadow-lg scale-105' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`} title="سهم منحني"><i className="fa-solid fa-share text-lg transform -scale-x-100"></i></button>
                            
                            <button onClick={() => handleToolSelect('rect')} className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center transition ${activeTool === 'rect' ? 'bg-blue-600 text-white shadow-lg scale-105' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`} title="مربع"><i className="fa-regular fa-square"></i></button>
                            <button onClick={() => handleToolSelect('circle')} className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center transition ${activeTool === 'circle' ? 'bg-blue-600 text-white shadow-lg scale-105' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`} title="دائرة"><i className="fa-regular fa-circle"></i></button>
                            <button onClick={() => handleToolSelect('pen')} className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center transition ${activeTool === 'pen' ? 'bg-blue-600 text-white shadow-lg scale-105' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`} title="قلم"><i className="fa-solid fa-pen"></i></button>
                        </div>

                        {/* Colors & Size */}
                        <div className="flex gap-3 items-center bg-slate-800 rounded-2xl p-2 px-4 border border-slate-700 shadow-xl overflow-x-auto hide-scrollbar">
                            <div className="flex gap-2 shrink-0">
                                {['#ef4444', '#eab308', '#22c55e', '#3b82f6', '#ffffff', '#000000'].map(c => (
                                    <button 
                                        key={c}
                                        onClick={() => setColor(c)}
                                        className={`w-6 h-6 rounded-full border-2 transition ${color === c ? 'border-white scale-125 shadow-md ring-2 ring-white/20' : 'border-transparent hover:scale-110'}`}
                                        style={{ backgroundColor: c }}
                                    />
                                ))}
                            </div>
                            <div className="w-px h-6 bg-slate-700 mx-1"></div>
                            <div className="flex items-center gap-2 shrink-0">
                                <i className="fa-solid fa-circle text-[4px] text-slate-500"></i>
                                <input type="range" min="2" max="20" value={lineWidth} onChange={(e) => setLineWidth(Number(e.target.value))} className="w-16 h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                                <i className="fa-solid fa-circle text-[12px] text-slate-500"></i>
                            </div>
                        </div>
                    </div>
                    
                    <div className="text-center text-[10px] text-slate-500 font-bold">
                        {activeTool === 'select' ? 'اختر عنصراً للتحريك. اسحب المربع الأزرق للتكبير.' : 'اسحب للرسم'}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ImageEditor;
