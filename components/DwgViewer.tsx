
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

    const [showActionsMenu, setShowActionsMenu] = useState(false);
    const [isSharing, setIsSharing] = useState(false);

    const handleShare = async () => {
        if (isSharing) return;
        setIsSharing(true);
        try {
            const blob = await api.downloadFileBlob(item.id);
            const file = new File([blob], item.name, { type: blob.type || 'application/acad' });
            await api.shareSmart(item, file);
        } catch (e) {
            alert('فشل تحضير الملف للمشاركة.');
        } finally {
            setIsSharing(false);
        }
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
            <div className="relative z-30 px-3 py-2.5 flex justify-between items-center text-white/80 border-b border-white/10 bg-[#0f172a]/90 backdrop-blur-md shadow-lg">
                <div className="flex items-center gap-2.5 overflow-hidden min-w-0 flex-1 ml-2">
                    <div className="w-7 h-7 rounded-lg bg-[#c41e3a] flex items-center justify-center text-white shadow-inner shrink-0">
                        <i className="fa-solid fa-compass-drafting text-xs"></i>
                    </div>
                    <div className="flex flex-col min-w-0">
                        <span className="font-bold text-xs sm:text-sm text-white truncate">{item.name}</span>
                        <span className="text-[9px] text-white/50 font-mono">AUTOCAD DRAWING</span>
                    </div>
                </div>
                <div className="flex gap-1.5 items-center relative shrink-0">
                    <button
                        onClick={() => setShowActionsMenu(prev => !prev)}
                        className={`w-8 h-8 rounded-xl flex items-center justify-center transition text-xs border ${showActionsMenu ? 'bg-indigo-600 text-white border-indigo-400' : 'bg-white/10 hover:bg-white/20 text-white border-white/10'}`}
                        title="أدوات المخطط"
                    >
                        {loading || isSharing ? (
                            <i className="fa-solid fa-circle-notch fa-spin text-xs text-yellow-300"></i>
                        ) : (
                            <i className="fa-solid fa-ellipsis-vertical text-xs"></i>
                        )}
                    </button>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-xl bg-white/10 hover:bg-red-500/80 text-white flex items-center justify-center transition text-xs border border-white/10"
                        title="إغلاق"
                    >
                        <i className="fa-solid fa-times text-xs"></i>
                    </button>

                    {showActionsMenu && (
                        <>
                            <div
                                className="fixed inset-0 z-[90]"
                                onClick={() => setShowActionsMenu(false)}
                            ></div>
                            <div className="absolute left-0 top-10 w-60 bg-slate-900/95 backdrop-blur-xl border border-slate-700 rounded-2xl shadow-2xl p-2 z-[100] space-y-1.5 text-white animate-scale-in origin-top-left">
                                <div className="px-2.5 py-1 border-b border-slate-800 flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-slate-400">خيارات المخطط الهندسي</span>
                                    <i className="fa-solid fa-compass-drafting text-[10px] text-red-400"></i>
                                </div>

                                <button
                                    onClick={() => {
                                        setShowActionsMenu(false);
                                        handleOpenInApp();
                                    }}
                                    disabled={loading}
                                    className="w-full px-3 py-2.5 rounded-xl bg-[#c41e3a] hover:bg-[#a01830] text-white flex items-center gap-2.5 transition shadow-md text-xs font-bold disabled:opacity-50"
                                >
                                    <div className="w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
                                        <i className="fa-solid fa-cube text-xs"></i>
                                    </div>
                                    <span>فتح بواسطة DWG FastView</span>
                                </button>

                                <button
                                    onClick={() => {
                                        setShowActionsMenu(false);
                                        handleShare();
                                    }}
                                    disabled={isSharing}
                                    className="w-full px-3 py-2 rounded-xl hover:bg-white/10 flex items-center gap-2.5 transition text-xs font-bold"
                                >
                                    <div className="w-7 h-7 rounded-lg bg-slate-800 text-emerald-400 flex items-center justify-center shrink-0">
                                        <i className="fa-solid fa-share-nodes text-xs"></i>
                                    </div>
                                    <span>مشاركة المخطط</span>
                                </button>

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
                                    <span>إعادة ضبط الأبعاد (100%)</span>
                                </button>

                                {item.webViewLink && (
                                    <a
                                        href={item.webViewLink}
                                        target="_blank"
                                        rel="noreferrer"
                                        onClick={() => setShowActionsMenu(false)}
                                        className="w-full px-3 py-2 rounded-xl hover:bg-white/10 flex items-center gap-2.5 transition text-xs font-bold text-white"
                                    >
                                        <div className="w-7 h-7 rounded-lg bg-slate-800 text-blue-400 flex items-center justify-center shrink-0">
                                            <i className="fa-brands fa-google-drive text-xs"></i>
                                        </div>
                                        <span>معاينة Google Drive</span>
                                    </a>
                                )}
                            </div>
                        </>
                    )}
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
                            هذا الملف لا يحتوي على صورة مصغرة. يمكنك فتحه بالتطبيق الخارجي من زر الخيارات بالأعلى.
                        </p>
                    </div>
                )}

                {status && (
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/75 text-white px-4 py-2 rounded-xl text-xs font-bold border border-white/10 backdrop-blur-md text-center animate-slide-up">
                        {loading && <i className="fa-solid fa-circle-notch fa-spin ml-2"></i>}
                        {status} {progress > 0 && `(${progress}%)`}
                    </div>
                )}
            </div>
        </div>
    );
};

export default DwgViewer;
