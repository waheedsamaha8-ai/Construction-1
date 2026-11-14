// @ts-nocheck
import React, { useState, useRef } from 'react';
import { FileItem } from '../types';
import { api } from '../services/api';
import { openDwgInExternalApp } from './DwgController';

interface DwgViewerProps {
    item: FileItem;
    onClose: () => void;
}

const DwgViewer: React.FC<DwgViewerProps> = ({ item }) => {
    const [downloading, setDownloading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [statusMsg, setStatusMsg] = useState('');
    const [previewFailed, setPreviewFailed] = useState(false);

    // Preview image zoom/pan state (when Google Drive provides a thumbnail preview)
    const [imgScale, setImgScale] = useState(1);
    const [imgPos, setImgPos] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const lastTouchRef = useRef<{ x: number; y: number; dist: number } | null>(null);

    const previewUrl =
        !previewFailed
            ? item.previewUrl?.replace(/=s\d+/, '=s1600') ||
              item.previewUrl ||
              item.thumbnailLink ||
              null
            : null;

    const handleOpenExternal = async () => {
        if (downloading) return;
        setDownloading(true);
        setProgress(0);
        setStatusMsg('جاري تحميل الملف لفتحه...');
        try {
            await openDwgInExternalApp(item.id, item.name, p => setProgress(p));
            setStatusMsg('تم تجهيز الملف — اختر تطبيق الأوتوكاد أو DWG FastView');
        } catch (err) {
            console.error(err);
            setStatusMsg('تعذر تحميل الملف، يرجى المحاولة مرة أخرى');
        } finally {
            setDownloading(false);
            setTimeout(() => setStatusMsg(''), 3500);
        }
    };

    const handleDirectDownload = async () => {
        if (downloading) return;
        setDownloading(true);
        setProgress(0);
        setStatusMsg('جاري تنزيل ملف الأوتوكاد...');
        try {
            const blob = await api.downloadFileBlob(item.id, p => setProgress(p));
            const safeName =
                item.name.toLowerCase().endsWith('.dwg') || item.name.toLowerCase().endsWith('.dxf')
                    ? item.name
                    : `${item.name}.dwg`;
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = safeName;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                if (document.body.contains(a)) document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 2500);
            setStatusMsg('تم تنزيل الملف بنجاح');
        } catch (err) {
            console.error(err);
            setStatusMsg('فشل تنزيل الملف');
        } finally {
            setDownloading(false);
            setTimeout(() => setStatusMsg(''), 3000);
        }
    };

    const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
        setIsDragging(true);
        if ('touches' in e) {
            if (e.touches.length === 1) {
                lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, dist: 0 };
            } else if (e.touches.length === 2) {
                const dist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                lastTouchRef.current = { x: 0, y: 0, dist };
            }
        } else {
            lastTouchRef.current = {
                x: (e as React.MouseEvent).clientX,
                y: (e as React.MouseEvent).clientY,
                dist: 0,
            };
        }
    };

    const handleTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
        if (!isDragging || !lastTouchRef.current) return;
        if ('touches' in e) {
            if (e.touches.length === 1) {
                const dx = e.touches[0].clientX - lastTouchRef.current.x;
                const dy = e.touches[0].clientY - lastTouchRef.current.y;
                setImgPos(prev => ({ x: prev.x + dx, y: prev.y + dy }));
                lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, dist: 0 };
            } else if (e.touches.length === 2) {
                const dist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                if (lastTouchRef.current.dist > 0) {
                    const ratio = dist / lastTouchRef.current.dist;
                    setImgScale(prev => Math.min(Math.max(1, prev * ratio), 6));
                }
                lastTouchRef.current = { x: 0, y: 0, dist };
            }
        } else {
            const me = e as React.MouseEvent;
            const dx = me.clientX - lastTouchRef.current.x;
            const dy = me.clientY - lastTouchRef.current.y;
            setImgPos(prev => ({ x: prev.x + dx, y: prev.y + dy }));
            lastTouchRef.current = { x: me.clientX, y: me.clientY, dist: 0 };
        }
    };

    const handleTouchEnd = () => {
        setIsDragging(false);
        lastTouchRef.current = null;
    };

    const isDxf = item.name.toLowerCase().endsWith('.dxf');

    return (
        <div
            className="w-full h-full bg-slate-900 relative flex flex-col items-center justify-center overflow-hidden select-none"
            dir="rtl"
        >
            {previewUrl ? (
                <>
                    {/* Static Drive Thumbnail Preview with Pan & Zoom */}
                    <div
                        className="w-full h-full flex items-center justify-center cursor-move active:cursor-grabbing touch-none overflow-hidden"
                        onMouseDown={handleTouchStart}
                        onMouseMove={handleTouchMove}
                        onMouseUp={handleTouchEnd}
                        onMouseLeave={handleTouchEnd}
                        onTouchStart={handleTouchStart}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                        onWheel={e => {
                            const delta = e.deltaY > 0 ? -0.15 : 0.15;
                            setImgScale(prev => Math.min(Math.max(1, prev + delta), 6));
                        }}
                    >
                        <img
                            src={previewUrl}
                            alt={item.name}
                            onError={() => setPreviewFailed(true)}
                            className="max-w-none shadow-2xl bg-white transition-transform duration-75 rounded-lg"
                            style={{
                                transform: `scale(${imgScale}) translate(${imgPos.x / imgScale}px, ${imgPos.y / imgScale}px)`,
                                maxWidth: '92%',
                                maxHeight: '80%',
                                objectFit: 'contain',
                            }}
                            draggable={false}
                        />
                    </div>

                    {/* Floating Bottom Bar to Open in External AutoCAD App */}
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-slate-950/90 backdrop-blur-md border border-slate-700/80 px-3 py-2 rounded-2xl shadow-2xl max-w-[94vw]">
                        <button
                            type="button"
                            onClick={handleOpenExternal}
                            disabled={downloading}
                            className="!min-h-0 px-4 py-2 rounded-xl bg-[#c41e3a] hover:bg-[#a61830] text-white font-bold text-xs flex items-center gap-2 shadow-md transition disabled:opacity-60 whitespace-nowrap"
                        >
                            {downloading ? (
                                <i className="fa-solid fa-circle-notch fa-spin"></i>
                            ) : (
                                <i className="fa-solid fa-up-right-from-square"></i>
                            )}
                            <span>
                                {downloading
                                    ? `جاري التحضير ${progress}%`
                                    : 'فتح في تطبيق الأوتوكاد'}
                            </span>
                        </button>
                        <button
                            type="button"
                            onClick={handleDirectDownload}
                            disabled={downloading}
                            className="!min-h-0 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center gap-1.5 border border-slate-700 transition disabled:opacity-60 whitespace-nowrap"
                        >
                            <i className="fa-solid fa-download"></i>
                            <span>تنزيل</span>
                        </button>
                    </div>
                </>
            ) : (
                /* Classic AutoCAD External Launcher Card */
                <div className="max-w-md w-full mx-4 bg-slate-800/90 border border-slate-700 rounded-3xl p-6 text-center shadow-2xl backdrop-blur-md animate-scale-in">
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#c41e3a]/25 to-rose-950/40 border border-red-500/30 flex items-center justify-center mx-auto mb-4 shadow-inner">
                        <i className="fa-solid fa-compass-drafting text-4xl text-[#f43f5e]"></i>
                    </div>

                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/15 border border-red-500/30 text-red-300 text-[10px] font-extrabold mb-3">
                        <span>{isDxf ? 'AutoCAD DXF' : 'AutoCAD DWG'}</span>
                    </div>

                    <h2
                        className="text-sm sm:text-base font-extrabold text-white mb-2 truncate px-2"
                        title={item.name}
                    >
                        {item.name}
                    </h2>

                    <p className="text-slate-300 text-xs leading-relaxed mb-6">
                        يتم فتح واستعراض ملفات الأوتوكاد عبر التطبيقات الهندسية المتخصصة على جهازك (مثل
                        DWG FastView أو AutoCAD Mobile).
                    </p>

                    {downloading && (
                        <div className="mb-4">
                            <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden mb-1.5">
                                <div
                                    className="h-full bg-[#c41e3a] transition-all duration-200"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                            <span className="text-[11px] font-bold text-slate-300">
                                جاري تحميل الملف... {progress}%
                            </span>
                        </div>
                    )}

                    <div className="flex flex-col gap-2.5">
                        <button
                            type="button"
                            onClick={handleOpenExternal}
                            disabled={downloading}
                            className="!min-h-0 w-full py-3 px-4 rounded-xl bg-[#c41e3a] hover:bg-[#a61830] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition disabled:opacity-60"
                        >
                            {downloading ? (
                                <i className="fa-solid fa-circle-notch fa-spin"></i>
                            ) : (
                                <i className="fa-solid fa-mobile-screen-button"></i>
                            )}
                            <span>فتح في تطبيق الأوتوكاد (DWG FastView / AutoCAD)</span>
                        </button>

                        <button
                            type="button"
                            onClick={handleDirectDownload}
                            disabled={downloading}
                            className="!min-h-0 w-full py-2.5 px-4 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-bold text-xs flex items-center justify-center gap-2 border border-slate-600 transition disabled:opacity-60"
                        >
                            <i className="fa-solid fa-download"></i>
                            <span>تنزيل الملف على الجهاز</span>
                        </button>

                        {item.webViewLink && (
                            <a
                                href={item.webViewLink}
                                target="_blank"
                                rel="noreferrer"
                                className="w-full py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 font-bold text-xs flex items-center justify-center gap-2 border border-white/10 transition"
                            >
                                <i className="fa-brands fa-google-drive text-blue-400"></i>
                                <span>فتح في Google Drive</span>
                            </a>
                        )}
                    </div>
                </div>
            )}

            {statusMsg && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/85 text-white px-4 py-2 rounded-xl text-xs font-bold border border-white/15 backdrop-blur-md text-center z-50 shadow-xl">
                    {statusMsg}
                </div>
            )}
        </div>
    );
};

export default DwgViewer;
