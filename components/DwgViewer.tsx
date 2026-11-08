
import React, { useState, useRef, useEffect } from 'react';
import { FileItem } from '../types';
import { api } from '../services/api';
import { openDwgInExternalApp } from './DwgController';

interface DwgViewerProps {
    item: FileItem;
    onClose: () => void;
}

const DwgViewer: React.FC<DwgViewerProps> = ({ item, onClose }) => {
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<string>('');
    const [progress, setProgress] = useState(0);
    
    // Zoom/Pan State
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const lastTouchRef = useRef<{ x: number; y: number; dist: number } | null>(null);

    // Use high-res thumbnail if available, otherwise standard preview
    const previewImage = item.previewUrl?.replace(/=s\d+/, '=s1600') || item.previewUrl;

    const handleOpenInApp = async () => {
        setLoading(true);
        setStatus('جاري تحميل المخطط...');
        try {
            await openDwgInExternalApp(item.id, item.name);
            setStatus('يرجى اختيار DWG FastView من القائمة');
        } catch (e) {
            setStatus('فشل فتح الملف');
        } finally {
            setLoading(false);
            setTimeout(() => setStatus(''), 5000);
        }
    };

    // --- Pan/Zoom Logic (Identical to Image Viewer) ---
    const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
        setIsDragging(true);
        if ('touches' in e) {
            if (e.touches.length === 1) {
                lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, dist: 0 };
            } else if (e.touches.length === 2) {
                const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
                lastTouchRef.current = { x: 0, y: 0, dist };
            }
        } else {
            lastTouchRef.current = { x: (e as React.MouseEvent).clientX, y: (e as React.MouseEvent).clientY, dist: 0 };
        }
    };

    const handleTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
        if (!isDragging || !lastTouchRef.current) return;

        let clientX, clientY;
        if ('touches' in e) {
            if (e.touches.length === 1) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            } else if (e.touches.length === 2) {
                // Pinch Zoom Logic
                const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
                if (lastTouchRef.current.dist > 0) {
                    const delta = dist - lastTouchRef.current.dist;
                    const newScale = Math.min(Math.max(1, scale + delta * 0.01), 5);
                    setScale(newScale);
                }
                lastTouchRef.current.dist = dist;
                return;
            }
        } else {
            clientX = (e as React.MouseEvent).clientX;
            clientY = (e as React.MouseEvent).clientY;
        }

        if (clientX !== undefined && clientY !== undefined) {
            const dx = clientX - lastTouchRef.current.x;
            const dy = clientY - lastTouchRef.current.y;
            setPosition(prev => ({ x: prev.x + dx, y: prev.y + dy }));
            lastTouchRef.current = { ...lastTouchRef.current, x: clientX, y: clientY };
        }
    };

    const handleTouchEnd = () => {
        setIsDragging(false);
        lastTouchRef.current = null;
    };

    const handleWheel = (e: React.WheelEvent) => {
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        setScale(prev => Math.min(Math.max(1, prev + delta), 5));
    };

    return (
        <div className="w-full h-full flex flex-col relative bg-[#1a237e] overflow-hidden">
            {/* Blueprint Grid Background - Acts as backdrop */}
            <div 
                className="absolute inset-0 opacity-20 pointer-events-none" 
                style={{ 
                    backgroundImage: 'linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)', 
                    backgroundSize: '20px 20px' 
                }}
            ></div>
            <div 
                className="absolute inset-0 opacity-20 pointer-events-none" 
                style={{ 
                    backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)', 
                    backgroundSize: '100px 100px' 
                }}
            ></div>

            {/* Header */}
            <div className="relative z-20 p-4 flex justify-between items-center text-white/80 border-b border-white/10 bg-[#0f172a]/80 backdrop-blur-md shadow-lg">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-[#c41e3a] flex items-center justify-center text-white shadow-inner">
                        <i className="fa-solid fa-compass-drafting"></i>
                    </div>
                    <div className="flex flex-col">
                        <span className="font-bold text-sm text-white">{item.name}</span>
                        <span className="text-[10px] text-white/50 font-mono">AUTOCAD DRAWING</span>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setScale(1)} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition"><i className="fa-solid fa-compress"></i></button>
                    <button onClick={onClose} className="w-8 h-8 rounded-full bg-red-500/20 hover:bg-red-500/40 text-red-200 flex items-center justify-center transition"><i className="fa-solid fa-times"></i></button>
                </div>
            </div>

            {/* Main Content Area (Preview or Placeholder) */}
            <div className="flex-1 relative z-10 overflow-hidden flex items-center justify-center">
                {previewImage ? (
                    <div 
                        ref={containerRef}
                        className="w-full h-full flex items-center justify-center cursor-move active:cursor-grabbing touch-none"
                        onMouseDown={handleTouchStart}
                        onMouseMove={handleTouchMove}
                        onMouseUp={handleTouchEnd}
                        onMouseLeave={handleTouchEnd}
                        onTouchStart={handleTouchStart}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                        onWheel={handleWheel}
                    >
                        <img 
                            src={previewImage} 
                            alt="DWG Preview" 
                            className="max-w-none shadow-2xl bg-white transition-transform duration-75"
                            style={{ 
                                transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
                                maxWidth: '90%',
                                maxHeight: '90%',
                                objectFit: 'contain'
                            }}
                            draggable={false}
                        />
                    </div>
                ) : (
                    <div className="text-center p-6 animate-fade-in">
                        {/* Icon Circle Placeholder */}
                        <div className="w-32 h-32 rounded-full border-4 border-dashed border-white/20 flex items-center justify-center mb-8 mx-auto relative group">
                            <div className="absolute inset-0 bg-blue-500/20 rounded-full blur-xl animate-pulse"></div>
                            <img 
                                src="https://upload.wikimedia.org/wikipedia/commons/thumb/f/f7/AutoCAD_logo.svg/1024px-AutoCAD_logo.svg.png" 
                                alt="DWG"
                                className="w-16 h-16 object-contain relative z-10 opacity-80 group-hover:opacity-100 transition duration-500 group-hover:scale-110"
                                onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                }}
                            />
                            <i className="fa-solid fa-compass-drafting text-5xl text-white absolute z-0 opacity-50"></i>
                        </div>
                        <h2 className="text-xl font-bold text-white mb-2">لا توجد معاينة متاحة</h2>
                        <p className="text-blue-200 text-xs mb-8">
                            هذا الملف لا يحتوي على صورة مصغرة. يرجى فتحه بالتطبيق الخارجي.
                        </p>
                    </div>
                )}
                
                {/* Floating Action Bar */}
                <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex flex-col gap-3 w-full max-w-xs px-4 pointer-events-none">
                    {/* Status Message */}
                    {status && (
                        <div className="bg-black/60 text-white px-4 py-2 rounded-lg text-xs font-bold border border-white/10 backdrop-blur-md text-center animate-slide-up pointer-events-auto">
                            {loading && <i className="fa-solid fa-circle-notch fa-spin ml-2"></i>}
                            {status} {progress > 0 && `(${progress}%)`}
                        </div>
                    )}

                    <button 
                        onClick={handleOpenInApp}
                        disabled={loading}
                        className="bg-[#c41e3a] hover:bg-[#a01830] text-white py-3.5 rounded-xl font-bold shadow-[0_0_20px_rgba(196,30,58,0.4)] transition transform active:scale-95 flex items-center justify-center gap-3 border border-white/10 group relative overflow-hidden pointer-events-auto"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
                        <i className="fa-solid fa-cube text-lg"></i>
                        <span className="text-sm">فتح بواسطة DWG FastView</span>
                    </button>

                    {item.webViewLink && (
                        <a 
                            href={item.webViewLink} 
                            target="_blank" 
                            rel="noreferrer"
                            className="bg-white/10 hover:bg-white/20 text-white py-3 rounded-xl font-bold transition flex items-center justify-center gap-2 border border-white/10 backdrop-blur-sm pointer-events-auto text-[10px]"
                        >
                            <i className="fa-brands fa-google-drive text-blue-400 text-sm"></i>
                            <span>معاينة Google Drive</span>
                        </a>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DwgViewer;
