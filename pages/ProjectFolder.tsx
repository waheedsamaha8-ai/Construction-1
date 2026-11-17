
// @ts-nocheck
import React, { useEffect, useState, useRef, useMemo, startTransition } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import Layout from '../components/Layout';
import FileItemRow from '../components/FileItemRow';
import FileViewer from '../components/FileViewer';
import ProjectAI from '../components/ProjectAI';
import ConfirmModal from '../components/ConfirmModal'; 
import { api, ARCHIVE_SECTIONS, ARCHIVE_FOLDER_NAME } from '../services/api';
import { collectFolderFilesRecursive, downloadItemsAsFiles, createZipFromDownloaded, formatShareBytes, inferShareMimeType, sanitizeShareName } from '../services/shareHelper';
import { aiHelper } from '../services/aiHelper'; 
import { geoUtils, GeoData } from '../services/geoUtils';
import { imageUtils } from '../services/imageUtils';
import { printService } from '../services/printService';
import AudioRecorder from '../components/AudioRecorder';
import { FileItem, ItemType, Project, ProjectLog, ProjectPayment, BOQItem, PaymentItem } from '../types';
import ProjectMasterData from '../components/ProjectMasterData';
import { DwgController, openDwgInExternalApp } from '../components/DwgController'; 
import { ReportGenerator } from '../services/reportGenerator'; // IMPORT GENERATOR
import VideoThumbnail from '../components/VideoThumbnail';
import InteractiveReportViewer from '../components/InteractiveReportViewer';
import { SitePhotoInspectionData } from '../services/photoReportExport';

// ... (ArchiveSummaryCard, CategoryCard, FileGridCard, ArchiveFullViewer, SkeletonRow components remain unchanged) ...
const ArchiveSummaryCard: React.FC<{ item: FileItem, onClick: () => void, onDelete: () => void, onRename: () => void, onMove: () => void, onShare: () => void }> = ({ item, onClick, onDelete, onRename, onMove, onShare }) => {
    const [showMenu, setShowMenu] = useState(false); const menuRef = useRef<HTMLDivElement>(null); const btnRef = useRef<HTMLButtonElement>(null);
    useEffect(() => { const handleClickOutside = (event: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(event.target as Node) && btnRef.current && !btnRef.current.contains(event.target as Node)) setShowMenu(false); }; if (showMenu) document.addEventListener('mousedown', handleClickOutside); return () => document.removeEventListener('mousedown', handleClickOutside); }, [showMenu]);
    return ( <div onClick={onClick} className={`bg-white rounded-2xl shadow-sm border border-slate-100 overflow-visible mb-3 transition hover:shadow-md cursor-pointer group relative ${showMenu ? 'z-[100]' : 'z-0'}`}> <div className="px-4 py-3 flex justify-between items-center"> <div className="flex items-center gap-3 overflow-hidden"> <div className="w-10 h-10 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center border border-teal-100 group-hover:bg-teal-100 transition shrink-0"><i className="fa-solid fa-file-contract text-sm"></i></div> <div className="min-w-0"><h3 className="font-bold text-slate-800 text-sm group-hover:text-teal-700 transition truncate">{item.name.replace('.html', '')}</h3><p className="text-[10px] text-slate-400">{new Date(item.createdTime).toLocaleDateString('ar-EG')}</p></div> </div> <div className="relative"><button ref={btnRef} onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }} className={`w-8 h-8 rounded-full flex items-center justify-center transition ${showMenu ? 'bg-teal-50 text-teal-600' : 'bg-slate-50 text-slate-400 hover:text-teal-600'}`}><i className="fa-solid fa-ellipsis-vertical text-xs"></i></button>{showMenu && (<div ref={menuRef} className="absolute left-0 top-full mt-1 w-40 bg-white rounded-xl shadow-xl border border-slate-100 z-50 overflow-hidden animate-scale-in origin-top-left"><button onClick={(e)=>{e.stopPropagation();setShowMenu(false);onShare()}} className="w-full text-right px-3 py-2.5 text-[10px] font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 flex items-center gap-2 border-b"><i className="fa-solid fa-share-nodes text-indigo-500 w-4"></i> مشاركة</button><button onClick={(e)=>{e.stopPropagation();setShowMenu(false);onRename()}} className="w-full text-right px-3 py-2.5 text-[10px] font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2 border-b"><i className="fa-solid fa-pen-to-square text-blue-500 w-4"></i> تعديل</button><button onClick={(e)=>{e.stopPropagation();setShowMenu(false);onMove()}} className="w-full text-right px-3 py-2.5 text-[10px] font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2 border-b"><i className="fa-solid fa-arrow-right-to-bracket text-orange-500 w-4"></i> نقل</button><button onClick={(e)=>{e.stopPropagation();setShowMenu(false);onDelete()}} className="w-full text-right px-3 py-2.5 text-[10px] font-bold text-red-600 hover:bg-red-50 flex items-center gap-2"><i className="fa-solid fa-trash text-red-500 w-4"></i> حذف</button></div>)}</div> </div> </div> );
};
const CategoryCard: React.FC<{ item: FileItem, onClick: () => void, onRename: () => void, onMove: () => void, onDelete: () => void, onShare: () => void }> = ({ item, onClick, onRename, onMove, onDelete, onShare }) => {
    const sectionInfo = ARCHIVE_SECTIONS.find(s => s.name === item.name) || { icon: 'fa-folder-open', color: 'slate', desc: 'مجلد أرشيف' }; const [showMenu, setShowMenu] = useState(false); const menuRef = useRef<HTMLDivElement>(null); const btnRef = useRef<HTMLButtonElement>(null);
    useEffect(() => { const handleClickOutside = (event: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(event.target as Node) && btnRef.current && !btnRef.current.contains(event.target as Node)) setShowMenu(false); }; if (showMenu) document.addEventListener('mousedown', handleClickOutside); return () => document.removeEventListener('mousedown', handleClickOutside); }, [showMenu]);
    return ( <div onClick={onClick} className={`bg-gradient-to-br from-${sectionInfo.color}-600 to-${sectionInfo.color}-800 rounded-3xl p-5 shadow-lg relative overflow-visible group cursor-pointer mb-3 transition transform hover:-translate-y-1 hover:shadow-xl ${showMenu ? 'z-[100]' : 'z-0'}`}> <div className="absolute -right-4 -bottom-4 text-white opacity-10 text-8xl transform rotate-12 group-hover:scale-110 transition duration-500 pointer-events-none"><i className={`fa-solid ${sectionInfo.icon}`}></i></div> <div className="relative z-10 flex justify-between items-start"> <div className="flex items-center gap-4"><div className={`w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-white shadow-inner border border-white/10`}><i className={`fa-solid ${sectionInfo.icon} text-2xl`}></i></div><div><h3 className="font-extrabold text-white text-lg mb-1">{item.name}</h3><p className="text-white/80 text-xs font-medium">{sectionInfo.desc}</p></div></div> <div className="flex flex-col items-end gap-2"> <div className="bg-white/20 px-3 py-1 rounded-full border border-white/10 backdrop-blur-md shadow-sm flex items-center gap-1.5"><span className="text-[10px] font-bold text-white">{item.fileCount || 0}</span><span className="text-[9px] text-white/90">ملف</span></div> <div className="relative mt-1"><button ref={btnRef} onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }} className={`w-8 h-8 rounded-full flex items-center justify-center transition border border-white/10 ${showMenu ? 'bg-white text-slate-800' : 'bg-white/10 text-white hover:bg-white/30'}`}><i className="fa-solid fa-ellipsis-vertical text-xs"></i></button>{showMenu && ( <div ref={menuRef} className="absolute left-0 top-full mt-1 w-40 bg-white rounded-xl shadow-xl border border-slate-100 z-50 overflow-hidden animate-scale-in text-slate-800 origin-top-left"><button onClick={(e)=>{e.stopPropagation();setShowMenu(false);onShare()}} className="w-full text-right px-3 py-2.5 text-[10px] font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 flex items-center gap-2 border-b"><i className="fa-solid fa-share-nodes text-indigo-500 w-4"></i> مشاركة</button><button onClick={(e)=>{e.stopPropagation();setShowMenu(false);onRename()}} className="w-full text-right px-3 py-2.5 text-[10px] font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2 border-b"><i className="fa-solid fa-pen-to-square text-blue-500 w-4"></i> تعديل</button><button onClick={(e)=>{e.stopPropagation();setShowMenu(false);onMove()}} className="w-full text-right px-3 py-2.5 text-[10px] font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2 border-b"><i className="fa-solid fa-arrow-right-to-bracket text-orange-500 w-4"></i> نقل</button><button onClick={(e)=>{e.stopPropagation();setShowMenu(false);onDelete()}} className="w-full text-right px-3 py-2.5 text-[10px] font-bold text-red-600 hover:bg-red-50 flex items-center gap-2"><i className="fa-solid fa-trash text-red-500 w-4"></i> حذف</button></div> )}</div> </div> </div> </div> );
};
const FileGridCard: React.FC<{ item: FileItem, onClick: () => void, onDelete: () => void, onRename: () => void, onMove: () => void, onShare: () => void }> = ({ item, onClick, onDelete, onRename, onMove, onShare }) => {
    const [showMenu, setShowMenu] = useState(false); const menuRef = useRef<HTMLDivElement>(null); const btnRef = useRef<HTMLButtonElement>(null); const isFolder = item.type === ItemType.FOLDER;
    useEffect(() => { const handleClickOutside = (event: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(event.target as Node) && btnRef.current && !btnRef.current.contains(event.target as Node)) { setShowMenu(false); } }; if (showMenu) document.addEventListener('mousedown', handleClickOutside); return () => document.removeEventListener('mousedown', handleClickOutside); }, [showMenu]);
    const getIcon = () => {
        if (isFolder) return { icon: 'fa-folder', color: 'text-amber-600', bg: 'bg-gradient-to-br from-amber-100 via-yellow-200 to-amber-300 border-amber-400 shadow-sm' };
        const mime = (item.mimeType || '').toLowerCase();
        const name = item.name.toLowerCase();
        if (name.endsWith('.dwg') || name.endsWith('.dxf') || mime.includes('acad') || mime.includes('dwg') || mime.includes('dxf')) { return { icon: 'fa-compass-drafting', color: 'text-[#c41e3a]', bg: 'bg-red-50 border-red-100' }; }
        if (mime.startsWith('image/')) return { icon: 'fa-image', color: 'text-purple-500', bg: 'bg-purple-50 border-purple-100' };
        if (mime.includes('pdf')) return { icon: 'fa-file-pdf', color: 'text-red-500', bg: 'bg-red-50 border-red-100' };
        if (mime.includes('spreadsheet') || mime.includes('excel') || name.endsWith('.xlsx')) return { icon: 'fa-file-excel', color: 'text-green-500', bg: 'bg-green-50 border-green-100' };
        if (mime.includes('word') || name.endsWith('.docx')) return { icon: 'fa-file-word', color: 'text-blue-500', bg: 'bg-blue-50 border-blue-100' };
        if (mime.startsWith('video/') || name.endsWith('.mp4') || name.endsWith('.webm') || name.endsWith('.mov') || name.endsWith('.avi')) return { icon: 'fa-video', color: 'text-rose-500', bg: 'bg-rose-50 border-rose-100' };
        return { icon: 'fa-file', color: 'text-slate-400', bg: 'bg-slate-50 border-slate-100' };
    };
    const style = getIcon();
    const mime = (item.mimeType || '').toLowerCase();
    const name = item.name.toLowerCase();
    const isVideoItem = mime.startsWith('video/') || name.endsWith('.mp4') || name.endsWith('.webm') || name.endsWith('.mov') || name.endsWith('.avi');

    return ( 
        <div
            onClick={onClick}
            className={`aspect-square bg-white rounded-2xl p-2 sm:p-3 shadow-sm border border-slate-100 flex flex-col items-center justify-between hover:shadow-lg hover:border-blue-200 hover:-translate-y-0.5 transition-all cursor-pointer group relative overflow-visible ${showMenu ? 'z-[100]' : 'z-0'}`}
        > 
            <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-xl sm:text-2xl border ${style.bg} relative overflow-hidden shrink-0`}>
                {isVideoItem ? (
                    <VideoThumbnail item={item} className="w-full h-full" />
                ) : (item.previewUrl || item.thumbnailLink || (mime.startsWith('image/') && !item.id.startsWith('temp_') && !item.id.startsWith('file_'))) ? (
                    <img src={item.previewUrl || item.thumbnailLink || `https://drive.google.com/thumbnail?id=${item.id}&sz=w300`} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                ) : (
                    <i className={`fa-solid ${style.icon} ${style.color} drop-shadow-sm`}></i>
                )}
            </div> 
            <div className="w-full text-center flex flex-col items-center min-w-0">
                <h3 className="font-bold text-slate-800 text-[10px] sm:text-xs truncate w-full leading-tight group-hover:text-blue-700 transition-colors" title={item.name}>{item.name}</h3>
                <span className="text-[10px] text-slate-400 font-mono bg-slate-50 px-1.5 py-0.5 rounded mt-1 leading-none">
                    {new Date(item.createdTime).toLocaleDateString('ar-EG')}
                </span>
            </div>
            {isFolder && (
                <div className="flex items-center justify-center gap-1.5 shrink-0">
                    <span className="text-[10px] text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded flex items-center gap-1" title="عدد الملفات">
                        <i className="fa-solid fa-file text-slate-400 text-[9px]"></i> {item.fileCount || 0}
                    </span>
                    <span className="text-[10px] text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded flex items-center gap-1" title="عدد المجلدات الفرعية">
                        <i className="fa-solid fa-folder text-slate-400 text-[9px]"></i> {item.folderCount || 0}
                    </span>
                </div>
            )}
            <div className="absolute top-1.5 right-1.5">
                <button ref={btnRef} onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }} className={`w-6 h-6 sm:w-7 sm:h-7 !min-h-0 rounded-full flex items-center justify-center transition border border-slate-100 ${showMenu ? 'bg-blue-50 text-blue-600 opacity-100' : 'bg-white/90 text-slate-400 opacity-0 group-hover:opacity-100 hover:text-blue-600 shadow-sm'}`}><i className="fa-solid fa-ellipsis-vertical text-[10px]"></i></button>
                {showMenu && (
                    <div ref={menuRef} className="absolute right-0 top-full mt-1 w-36 bg-white rounded-xl shadow-xl border border-slate-100 z-50 overflow-hidden animate-scale-in origin-top-right">
                        <button onClick={(e)=>{e.stopPropagation();setShowMenu(false);onShare()}} className="w-full text-right px-3 py-2.5 text-[10px] font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 flex items-center gap-2 border-b"><i className="fa-solid fa-share-nodes text-indigo-500 w-4"></i> مشاركة</button>
                        <button onClick={(e)=>{e.stopPropagation();setShowMenu(false);onRename()}} className="w-full text-right px-3 py-2.5 text-[10px] font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2 border-b"><i className="fa-solid fa-pen-to-square text-blue-500 w-4"></i> تعديل</button>
                        <button onClick={(e)=>{e.stopPropagation();setShowMenu(false);onMove()}} className="w-full text-right px-3 py-2.5 text-[10px] font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2 border-b"><i className="fa-solid fa-arrow-right-to-bracket text-orange-500 w-4"></i> نقل</button>
                        <button onClick={(e)=>{e.stopPropagation();setShowMenu(false);onDelete()}} className="w-full text-right px-3 py-2.5 text-[10px] font-bold text-red-600 hover:bg-red-50 flex items-center gap-2"><i className="fa-solid fa-trash text-red-500 w-4"></i> حذف</button>
                    </div>
                )}
            </div> 
        </div> 
    );
};
const MediaGridCard: React.FC<{
    item: FileItem;
    isVideoItem: boolean;
    colIndex: number;
    onClick: () => void;
    onPrefetch: () => void;
    onDelete: () => void;
    onRename: () => void;
    onMove: () => void;
    onShare: () => void;
}> = ({ item, isVideoItem, colIndex, onClick, onPrefetch, onDelete, onRename, onMove, onShare }) => {
    const [showMenu, setShowMenu] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const btnRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                menuRef.current &&
                !menuRef.current.contains(event.target as Node) &&
                btnRef.current &&
                !btnRef.current.contains(event.target as Node)
            ) {
                setShowMenu(false);
            }
        };
        if (showMenu) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showMenu]);

    const smMenuAlign = colIndex % 3 === 0 ? 'right-0 origin-top-right' : 'left-0 origin-top-left';
    const mdMenuAlign = colIndex % 4 === 0 ? 'md:right-0 md:left-auto md:origin-top-right' : 'md:left-0 md:right-auto md:origin-top-left';

    return (
        <div
            onPointerDown={onPrefetch}
            onMouseEnter={onPrefetch}
            onTouchStart={onPrefetch}
            onClick={onClick}
            className={`aspect-square relative group overflow-visible rounded-2xl shadow-sm cursor-pointer bg-slate-900 border border-slate-100/10 ${showMenu ? 'z-[100]' : 'z-0'}`}
        >
            <div className="w-full h-full rounded-2xl overflow-hidden relative">
                {isVideoItem ? (
                    <VideoThumbnail item={item} className="w-full h-full" />
                ) : (
                    item.previewUrl || item.thumbnailLink ? (
                        <img
                            src={item.previewUrl || item.thumbnailLink}
                            alt={item.name}
                            className="w-full h-full object-cover transition duration-300 group-hover:scale-110"
                            referrerPolicy="no-referrer"
                        />
                    ) : (
                        <div className="w-full h-full bg-slate-100 flex items-center justify-center text-slate-400">
                            <i className="fa-solid fa-image text-2xl"></i>
                        </div>
                    )
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent pt-3 pb-1 px-1 pointer-events-none z-10 flex items-end justify-center">
                    <p className="text-[7.5px] sm:text-[8.5px] text-white/95 font-medium truncate text-center leading-none tracking-tight drop-shadow-sm" title={item.name}>
                        {item.name}
                    </p>
                </div>
            </div>

            <div
                className="absolute top-1.5 left-1.5 z-20"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
            >
                <button
                    ref={btnRef}
                    type="button"
                    aria-label="خيارات الملف"
                    onClick={(e) => {
                        e.stopPropagation();
                        setShowMenu(!showMenu);
                    }}
                    className={`w-6 h-6 sm:w-7 sm:h-7 !min-h-0 rounded-full flex items-center justify-center transition backdrop-blur-sm border ${
                        showMenu
                            ? 'bg-blue-600 text-white border-blue-400 shadow-md'
                            : 'bg-black/45 text-white/95 border-white/25 hover:bg-black/75 shadow-sm'
                    }`}
                >
                    <i className="fa-solid fa-ellipsis-vertical text-[10px]"></i>
                </button>
                {showMenu && (
                    <div
                        ref={menuRef}
                        className={`absolute top-full mt-1 w-36 bg-white rounded-xl shadow-xl border border-slate-100 z-50 overflow-hidden animate-scale-in ${smMenuAlign} ${mdMenuAlign}`}
                    >
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowMenu(false);
                                onShare();
                            }}
                            className="w-full text-right px-3 py-2.5 text-[10px] font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 flex items-center gap-2 border-b"
                        >
                            <i className="fa-solid fa-share-nodes text-indigo-500 w-4"></i> مشاركة
                        </button>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowMenu(false);
                                onRename();
                            }}
                            className="w-full text-right px-3 py-2.5 text-[10px] font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2 border-b"
                        >
                            <i className="fa-solid fa-pen-to-square text-blue-500 w-4"></i> تعديل
                        </button>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowMenu(false);
                                onMove();
                            }}
                            className="w-full text-right px-3 py-2.5 text-[10px] font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2 border-b"
                        >
                            <i className="fa-solid fa-arrow-right-to-bracket text-orange-500 w-4"></i> نقل
                        </button>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowMenu(false);
                                onDelete();
                            }}
                            className="w-full text-right px-3 py-2.5 text-[10px] font-bold text-red-600 hover:bg-red-50 flex items-center gap-2"
                        >
                            <i className="fa-solid fa-trash text-red-500 w-4"></i> حذف
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
const wrapTablesInHtml = (html: string) => {
    if (!html) return '';
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
};

const ArchiveFullViewer: React.FC<{
    item: FileItem;
    onClose: () => void;
    onEdit: (content: string) => void;
    onDelete?: (item: FileItem) => void;
    onContentUpdated?: (itemId: string, newContent: string) => void;
}> = ({ item, onClose, onEdit, onDelete, onContentUpdated }) => {
    const [content, setContent] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [showActionsMenu, setShowActionsMenu] = useState(false);
    const [isDirectEditing, setIsDirectEditing] = useState(false);
    const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

    useEffect(() => {
        let active = true;
        const fetchContent = async () => {
            try {
                if (item.content) {
                    if (active) {
                        setContent(item.content);
                        setLoading(false);
                    }
                    return;
                }
                const text = await api.getFileContent(item.id);
                if (active) {
                    setContent(text);
                }
            } catch (e) {
                if (active) setContent('<div class="p-10 text-center text-red-500 font-bold">فشل تحميل المحتوى</div>');
            } finally {
                if (active) setLoading(false);
            }
        };
        fetchContent();
        return () => {
            active = false;
        };
    }, [item.id, item.content]);

    const handlePrint = () => {
        const docName = item.name.replace('.html', '');
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(content, 'text/html');
            const settingsEl = doc.getElementById('saved-page-settings');
            if (settingsEl && settingsEl.dataset?.config) {
                const cfg = JSON.parse(decodeURIComponent(settingsEl.dataset.config));
                printService.printReport(content, cfg.reportTitle || docName, cfg.metaRef, {
                    date: cfg.metaDate,
                    subtitle: cfg.headerSubtitle,
                    footerText: cfg.footerText,
                    headerColor: cfg.headerColor,
                    footerColor: cfg.footerColor,
                    margins: cfg.marginConfig,
                    pageMargin: cfg.printPageMargin,
                    labels: { date: cfg.dateLabel || 'التاريخ:', ref: cfg.refLabel || 'المرجع:' },
                    fontSizes: {
                        title: cfg.titleFontSize,
                        subtitle: cfg.subtitleFontSize,
                        meta: cfg.metaFontSize,
                        footer: cfg.footerFontSize
                    },
                    showHeader: cfg.showHeader ?? false,
                    showTitle: cfg.showTitle ?? true,
                    showSubtitle: cfg.showSubtitle ?? true,
                    showDate: cfg.showDate ?? true,
                    showRef: cfg.showRef ?? true,
                    showFooter: cfg.showFooter ?? false,
                    preserveUserStyles: Boolean(cfg.showHeader)
                });
                return;
            }
        } catch {}

        printService.printReport(content, docName, undefined, { showHeader: false, showFooter: false });
    };

    const handleContentChange = async (updatedHtml: string) => {
        setContent(updatedHtml);
        setAutoSaveStatus('saving');
        onContentUpdated?.(item.id, updatedHtml);
        try {
            await api.updateFileContent(item.id, updatedHtml);
            setAutoSaveStatus('saved');
            setTimeout(() => setAutoSaveStatus('idle'), 2000);
        } catch (err) {
            console.warn('Auto-save archive document warning:', err);
            setAutoSaveStatus('idle');
        }
    };

    return (
        <div className="fixed inset-0 z-[2000] bg-white flex flex-col animate-fade-in">
            <div className="bg-slate-900 text-white px-3.5 py-2.5 flex justify-between items-center shadow-md z-20 shrink-0 border-b border-slate-800">
                <div className="flex items-center gap-2.5 overflow-hidden min-w-0 flex-1 ml-2">
                    <div className="w-7 h-7 rounded-lg bg-teal-600 flex items-center justify-center shrink-0">
                        <i className="fa-solid fa-file-contract text-xs text-white"></i>
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="font-bold text-[11px] sm:text-xs text-white truncate leading-tight !bg-transparent !border-0 !p-0 !m-0">
                            {item.name.replace('.html', '')}
                        </div>
                        <div className="text-[9.5px] sm:text-[10px] font-medium text-emerald-400 flex items-center gap-1 mt-0.5 truncate">
                            {autoSaveStatus === 'saving' ? (
                                <>
                                    <i className="fa-solid fa-circle-notch fa-spin text-[9px]"></i>
                                    <span>جاري الحفظ التلقائي...</span>
                                </>
                            ) : autoSaveStatus === 'saved' ? (
                                <>
                                    <i className="fa-solid fa-check-double text-[9px]"></i>
                                    <span>تم الحفظ التلقائي على نفس التقرير</span>
                                </>
                            ) : (
                                <>
                                    <i className="fa-solid fa-cloud-arrow-up text-[9px]"></i>
                                    <span>محفوظ في الأرشيف الهندسي</span>
                                </>
                            )}
                        </div>
                    </div>
                </div>
                <div className="flex gap-1.5 items-center relative shrink-0">
                    {isDirectEditing && (
                        <button
                            type="button"
                            onClick={() => setIsDirectEditing(false)}
                            className="w-8 h-8 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center transition shadow-sm border border-emerald-400"
                            title="إنهاء التعديل المباشر"
                        >
                            <i className="fa-solid fa-check text-xs"></i>
                        </button>
                    )}
                    <button
                        onClick={() => setShowActionsMenu(prev => !prev)}
                        className={`w-8 h-8 rounded-xl flex items-center justify-center transition text-xs border ${
                            showActionsMenu
                                ? 'bg-teal-600 text-white border-teal-400'
                                : 'bg-white/10 hover:bg-white/20 text-white border-white/10'
                        }`}
                        title="خيارات التقرير"
                    >
                        <i className="fa-solid fa-ellipsis-vertical text-xs"></i>
                    </button>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-xl bg-white/10 hover:bg-red-500/80 flex items-center justify-center transition text-xs border border-white/10"
                        title="إغلاق"
                    >
                        <i className="fa-solid fa-times text-xs"></i>
                    </button>

                    {showActionsMenu && (
                        <>
                            <div className="fixed inset-0 z-[90]" onClick={() => setShowActionsMenu(false)}></div>
                            <div className="absolute left-0 top-10 w-56 bg-slate-900/95 backdrop-blur-xl border border-slate-700 rounded-2xl shadow-2xl p-2 z-[100] space-y-1.5 text-white animate-scale-in origin-top-left">
                                {/* 1. Direct Edit Button */}
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowActionsMenu(false);
                                        setIsDirectEditing(!isDirectEditing);
                                    }}
                                    disabled={loading}
                                    className={`w-full px-3 py-2.5 rounded-xl flex items-center gap-2.5 transition text-xs font-bold text-right disabled:opacity-50 ${
                                        isDirectEditing
                                            ? 'bg-emerald-600 text-white'
                                            : 'bg-slate-800 hover:bg-purple-600 text-white'
                                    }`}
                                >
                                    <div
                                        className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                                            isDirectEditing
                                                ? 'bg-white/20 text-white'
                                                : 'bg-purple-500/20 text-purple-300'
                                        }`}
                                    >
                                        <i className={`fa-solid ${isDirectEditing ? 'fa-check' : 'fa-file-pen'} text-xs`}></i>
                                    </div>
                                    <span>{isDirectEditing ? 'إنهاء التعديل المباشر' : 'التعديل المباشر'}</span>
                                </button>

                                {/* 2. Edit Document in Letter Editor */}
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowActionsMenu(false);
                                        onEdit(content);
                                    }}
                                    disabled={loading}
                                    className="w-full px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-indigo-600 text-white flex items-center gap-2.5 transition text-xs font-bold disabled:opacity-50 text-right"
                                >
                                    <div className="w-6 h-6 rounded-lg bg-indigo-500/20 text-indigo-300 flex items-center justify-center shrink-0">
                                        <i className="fa-solid fa-pen-to-square text-xs"></i>
                                    </div>
                                    <span>تعديل المستند</span>
                                </button>

                                {/* 3. Print Document */}
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowActionsMenu(false);
                                        handlePrint();
                                    }}
                                    disabled={loading}
                                    className="w-full px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-teal-600 text-white flex items-center gap-2.5 transition text-xs font-bold disabled:opacity-50 text-right"
                                >
                                    <div className="w-6 h-6 rounded-lg bg-teal-500/20 text-teal-300 flex items-center justify-center shrink-0">
                                        <i className="fa-solid fa-print text-xs"></i>
                                    </div>
                                    <span>طباعة المستند</span>
                                </button>

                                {/* 4. Delete Document */}
                                {onDelete && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowActionsMenu(false);
                                            onDelete(item);
                                        }}
                                        disabled={loading}
                                        className="w-full px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-red-600 text-red-300 hover:text-white flex items-center gap-2.5 transition text-xs font-bold disabled:opacity-50 text-right border-t border-slate-700/60 mt-1"
                                    >
                                        <div className="w-6 h-6 rounded-lg bg-red-500/20 text-red-400 flex items-center justify-center shrink-0">
                                            <i className="fa-solid fa-trash-can text-xs"></i>
                                        </div>
                                        <span>حذف التقرير</span>
                                    </button>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
            <div className="flex-1 overflow-y-auto bg-white w-full">
                {loading ? (
                    <div className="h-full flex items-center justify-center">
                        <div className="flex flex-col items-center">
                            <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                            <p className="text-slate-400 font-bold">جاري تحميل المستند...</p>
                        </div>
                    </div>
                ) : (
                    <div className="archive-card-content w-full min-h-full p-4 md:p-8">
                        <InteractiveReportViewer
                            htmlContent={content}
                            isDirectEditing={isDirectEditing}
                            onDirectEditChange={setIsDirectEditing}
                            showFloatingEditBar={false}
                            onContentChange={handleContentChange}
                        />
                    </div>
                )}
            </div>
        </div>
    );
};
const SkeletonRow = () => (<div className="bg-white p-3 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 animate-pulse mb-2 h-[74px]"><div className="w-12 h-12 rounded-xl bg-slate-200 shrink-0"></div><div className="flex-1 space-y-2"><div className="h-4 w-1/2 bg-slate-200 rounded"></div><div className="h-3 w-1/4 bg-slate-200 rounded"></div></div></div>);

export default function ProjectFolder() {
  const { projectId, folderId } = useParams<{ projectId: string; folderId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isArchiveRoute = location.pathname.startsWith('/archive');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const customMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const customChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const currentGeoDataRef = useRef<GeoData | null>(null);
  const [showMediaChoice, setShowMediaChoice] = useState(false);
  const [showVideoRecorder, setShowVideoRecorder] = useState(false);
  const [videoQuality, setVideoQuality] = useState<'hd' | 'sd'>('sd'); 
  const [isVideoRecording, setIsVideoRecording] = useState(false);
  const [videoTimer, setVideoTimer] = useState(0);
  const [useGeotagging, setUseGeotagging] = useState(true);
  const targetId = folderId || projectId || '';
  const cachedData = useMemo(() => api.getCachedContents(targetId), [targetId]);
  const initialProj = useMemo(() => {
      if (!projectId) return null;
      const list = api.getCachedProjects() || api.getSyncProjects();
      return list?.find(p => p.id === projectId) || null;
  }, [projectId]);

  const [items, setItems] = useState<FileItem[]>(cachedData || []);
  const [loading, setLoading] = useState(!cachedData);
  const [currentProject, setCurrentProject] = useState<Project | null>(initialProj);
  // ... (Modal states remain unchanged)
  const [modalMode, setModalMode] = useState<'none' | 'createFolder' | 'upload' | 'masterData' | 'rename' | 'move' | 'createManualBOQ'>('none');
  const [selectedItem, setSelectedItem] = useState<FileItem | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameDescription, setRenameDescription] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [currentFolderId, setCurrentFolderId] = useState(targetId);
  const [currentFolderName, setCurrentFolderName] = useState<string>(
      isArchiveRoute
          ? ARCHIVE_FOLDER_NAME
          : (location.state?.folderName || (targetId === projectId && initialProj?.name ? initialProj.name : '...'))
  );
  const [currentParentId, setCurrentParentId] = useState<string | null>(null);
  const [pendingPdfFile, setPendingPdfFile] = useState<File | null>(null);
  const [showPdfModeModal, setShowPdfModeModal] = useState(false);
  const [uploadStatusMsg, setUploadStatusMsg] = useState('');
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: 'name' | 'date'; direction: 'asc' | 'desc' }>({ key: 'date', direction: 'desc' });
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(() => {
      try {
          const saved = localStorage.getItem('construction_pro_folder_view_mode');
          return saved === 'grid' || saved === 'list' ? saved : 'list';
      } catch {
          return 'list';
      }
  });
  const handleToggleViewMode = () => {
      setViewMode(prev => {
          const next = prev === 'list' ? 'grid' : 'list';
          try {
              localStorage.setItem('construction_pro_folder_view_mode', next);
          } catch {}
          return next;
      });
  };
  const [previewItem, setPreviewItem] = useState<FileItem | null>(null);
  const [showAI, setShowAI] = useState(false);
  const [selectedArchiveItem, setSelectedArchiveItem] = useState<FileItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{id: string, name: string} | null>(null);
  const [moveTargetId, setMoveTargetId] = useState<string>('');
  const [moveFolderItems, setMoveFolderItems] = useState<FileItem[]>([]);
  const [moveBreadcrumbs, setMoveBreadcrumbs] = useState<{id: string, name: string}[]>([]);
  const [loadingMove, setLoadingMove] = useState(false);
  const isArchiveRoot = isArchiveRoute || currentFolderName === ARCHIVE_FOLDER_NAME;
  const isArchiveSection = ARCHIVE_SECTIONS.some(s => s.name === currentFolderName);
  const isArchive = isArchiveRoot || isArchiveSection;
  const isDrawingsFolder = currentFolderName === 'الرسومات';
  const isAudioFolder = currentFolderName === 'تسجيلات صوتية';
  const isMediaFolder = currentFolderName === 'صور الموقع' || items.some(i => i.mimeType?.startsWith('image/') || i.mimeType?.startsWith('video/'));
  // Removed effectiveViewMode to allow manual toggle
  const [shareState, setShareState] = useState<{
    isOpen: boolean;
    item: FileItem | null;
    file: File | null;
    files: File[];
    status: 'idle' | 'folder_choice' | 'multi_select' | 'downloading' | 'ready' | 'downloaded_notice' | 'empty_folder' | 'error' | 'choice';
    progress: number;
    progressText?: string;
    isZip?: boolean;
    selectedIds: string[];
    shareTitle?: string;
    errorMessage?: string;
  }>({
    isOpen: false,
    item: null,
    file: null,
    files: [],
    status: 'idle',
    progress: 0,
    selectedIds: []
  });

  // --- NEW COMMENT & SMART VISUAL INSPECTION STATES ---
  const [commentModalOpen, setCommentModalOpen] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [pendingUploadFiles, setPendingUploadFiles] = useState<File[]>([]);
  const [pendingVideoFile, setPendingVideoFile] = useState<File | null>(null); // For video case
  const [pendingCapturePreviewUrl, setPendingCapturePreviewUrl] = useState<string>('');
  const [captureInspecting, setCaptureInspecting] = useState(false);
  const [captureInspectionError, setCaptureInspectionError] = useState<string | null>(null);
  const [captureInspectionResult, setCaptureInspectionResult] = useState<SitePhotoInspectionData | null>(null);

  useEffect(() => {
      const firstImage = pendingUploadFiles.find(f => f.type.startsWith('image/'));
      if (commentModalOpen && firstImage) {
          const url = URL.createObjectURL(firstImage);
          setPendingCapturePreviewUrl(url);
          return () => URL.revokeObjectURL(url);
      } else {
          setPendingCapturePreviewUrl('');
      }
  }, [commentModalOpen, pendingUploadFiles]);

  const handleInspectCapturedPhoto = async () => {
      const targetImage = pendingUploadFiles.find(f => f.type.startsWith('image/'));
      if (!targetImage) return;
      setCaptureInspecting(true);
      setCaptureInspectionError(null);
      try {
          const result = await aiHelper.inspectSitePhoto(
              targetImage,
              currentProject?.boqItems || [],
              currentProject?.name || ''
          );
          setCaptureInspectionResult(result);
      } catch (err: any) {
          setCaptureInspectionError(err?.message || 'تعذر إجراء الفحص البصري الذكي للصورة.');
      } finally {
          setCaptureInspecting(false);
      }
  };
  
  useEffect(() => {
      const checkArchive = async () => {
          if (!currentFolderId) return;
          try {
              const archiveId = await api.getArchiveFolderId();
              if (currentFolderId === archiveId) {
                  setCurrentFolderName(ARCHIVE_FOLDER_NAME);
                  const fresh = await api.getContents(archiveId, true);
                  setItems(fresh);
                  const enriched = await api.enrichItemCounts(fresh, archiveId);
                  setItems(enriched);
              }
          } catch(e) {}
      };
      
      // If folder name is missing or generic, check if it's the archive
      if (currentFolderId && (!location.state?.folderName || currentFolderName === '...')) {
          checkArchive();
      }
  }, [currentFolderId, location.state, currentFolderName]);

  useEffect(() => { 
      if (!api.isAuthenticated()) { navigate('/'); return; } 
      const newId = folderId || projectId || ''; 
      if (newId !== currentFolderId) { 
          if (location.state?.folderName) {
              setCurrentFolderName(location.state.folderName);
          } else if (newId === projectId && currentProject?.name) {
              setCurrentFolderName(currentProject.name);
          }
          setCurrentFolderId(newId); 
          const freshCache = api.getCachedContents(newId); 
          if (freshCache) {
              setItems(freshCache);
              setLoading(false);
          } else {
              api.getLocalContents(newId).then(localItems => {
                  if (localItems && localItems.length > 0) {
                      setItems(localItems);
                      setLoading(false);
                  }
              });
          } 
      } 
  }, [folderId, projectId, navigate, currentFolderId, location.state, currentProject]);

  useEffect(() => {
      if (location.state?.returnToMasterData) {
          setModalMode('masterData');
          // Clear state to prevent reopening on refresh
          navigate(location.pathname, { replace: true, state: { ...location.state, returnToMasterData: undefined } });
      }
  }, [location.state, navigate]);

  const fetchContents = async () => { 
      if (!api.isAuthenticated()) return; 

      // 1. Show cached folder contents immediately (0ms)
      const immediateCached = api.getCachedContents(currentFolderId);
      if (immediateCached && immediateCached.length > 0) {
          setItems(immediateCached);
          setLoading(false);
      } else {
          // 1b. Fast IndexedDB read (~2ms) before network request
          const localItems = await api.getLocalContents(currentFolderId);
          if (localItems && localItems.length > 0) {
              setItems(localItems);
              setLoading(false);
          }
      }

      // 2. Load cached project metadata immediately (0ms)
      try { 
          const cachedProjects = api.getCachedProjects() || api.getSyncProjects(); 
          if (projectId && cachedProjects) { 
              const p = cachedProjects.find(p => p.id === projectId); 
              if (p) {
                  setCurrentProject(p);
                  if (currentFolderId === projectId && p.name) setCurrentFolderName(p.name);
              }
          }
          if (projectId) {
              api.getProjectById(projectId).then(fullProj => {
                  if (fullProj) {
                      setCurrentProject(fullProj);
                      if (currentFolderId === projectId && fullProj.name) setCurrentFolderName(fullProj.name);
                  }
              });
          }
      } catch (error) {}

      try { 
          // 3. Fetch folder contents and metadata in parallel in background
          const metadataPromise = (currentFolderId && currentFolderId !== projectId)
              ? api.getFileMetadata(currentFolderId).catch(() => null)
              : Promise.resolve(null);

          const contentsPromise = api.getContents(currentFolderId);

          const [meta, folderData] = await Promise.all([metadataPromise, contentsPromise]);

          if (currentFolderId && currentFolderId !== projectId) {
              if (meta) {
                  if (!location.state?.folderName) setCurrentFolderName(meta.name);
                  setCurrentParentId(meta.parentId);
              }
          } else {
              setCurrentParentId(null);
          }

          startTransition(() => { setItems(folderData); setLoading(false); }); 
          api.warmLocalBlobsToMemory(folderData).catch(() => {});
          
          api.enrichItemCounts(folderData, currentFolderId).then(enrichedItems => { 
              if (currentFolderId === (folderId || projectId || '')) startTransition(() => setItems(enrichedItems)); 
          }); 
      } catch(e) { 
          setLoading(false); 
      } 
  };
  
  useEffect(() => { if (currentFolderId) fetchContents(); }, [currentFolderId]);
  useEffect(() => {
      if (items && items.length > 0) {
          api.warmLocalBlobsToMemory(items).catch(() => {});
      }
  }, [items]);

  useEffect(() => {
    const onProjectChanged = (e: Event) => {
      const updated = (e as CustomEvent).detail as Project | undefined;
      if (updated && updated.id === projectId) {
        setCurrentProject(updated);
        if (currentFolderId === projectId && updated.name) setCurrentFolderName(updated.name);
      }
    };
    window.addEventListener('project_data_changed', onProjectChanged);
    return () => window.removeEventListener('project_data_changed', onProjectChanged);
  }, [projectId, currentFolderId]);

  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      e.preventDefault();
      handleBack();
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [currentFolderId, projectId, currentProject]);

  const updateGeoData = async () => { if (!useGeotagging) return; try { if (currentProject?.lat && currentProject?.lng) { const weather = await geoUtils.getWeather(currentProject.lat, currentProject.lng); const address = await geoUtils.getAddress(currentProject.lat, currentProject.lng); currentGeoDataRef.current = { lat: currentProject.lat, lng: currentProject.lng, address: address, temperature: weather?.temp, weatherDesc: weather?.desc, timestamp: new Date().toLocaleString('ar-EG', { dateStyle: 'full', timeStyle: 'short' }) }; } else { const data = await geoUtils.getFullContext(); currentGeoDataRef.current = data; } } catch (e) { console.warn("Update Geo failed", e); } };
  const startVideoCamera = async () => { try { const constraints = videoQuality === 'hd' ? { video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true } : { video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }, audio: true }; const stream = await navigator.mediaDevices.getUserMedia(constraints); streamRef.current = stream; if (videoPreviewRef.current) { videoPreviewRef.current.srcObject = stream; videoPreviewRef.current.play(); } await updateGeoData(); drawVideoFrame(); } catch (err) { alert("لا يمكن الوصول للكاميرا. تأكد من الصلاحيات."); setShowVideoRecorder(false); } };
  
  // FIX: drawVideoFrame ONLY draws raw video to canvas for recording. NO RIBBONS here to avoid double stamping.
  const drawVideoFrame = async () => { 
      if (!videoPreviewRef.current || !canvasRef.current || !showVideoRecorder) return; 
      const video = videoPreviewRef.current; 
      const canvas = canvasRef.current; 
      const ctx = canvas.getContext('2d', { alpha: false }); 
      
      if (video.readyState === video.HAVE_ENOUGH_DATA) { 
          const vWidth = video.videoWidth; 
          const vHeight = video.videoHeight; 
          
          if (canvas.width !== vWidth || canvas.height !== vHeight) { 
              canvas.width = vWidth; 
              canvas.height = vHeight; 
          } 
          
          if (ctx) { 
              // ONLY draw the raw video frame. 
              // The Ribbon will be added by imageUtils.addVideoWatermark during processing.
              ctx.drawImage(video, 0, 0, vWidth, vHeight); 
          } 
      } 
      animationFrameRef.current = requestAnimationFrame(drawVideoFrame); 
  };

  useEffect(() => { let geoInterval: any; if (showVideoRecorder) { startVideoCamera(); geoInterval = setInterval(updateGeoData, 10000); } else { if (streamRef.current) { streamRef.current.getTracks().forEach(track => track.stop()); streamRef.current = null; } if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current); if (geoInterval) clearInterval(geoInterval); } return () => { if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop()); if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current); if (geoInterval) clearInterval(geoInterval); }; }, [showVideoRecorder]);
  
  const startRecordingVideo = () => { if (!canvasRef.current) return; const canvasStream = canvasRef.current.captureStream(24); if (streamRef.current) { const audioTracks = streamRef.current.getAudioTracks(); if (audioTracks.length > 0) canvasStream.addTrack(audioTracks[0]); } let options = { mimeType: 'video/webm' }; if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) options = { mimeType: 'video/webm;codecs=vp9' }; else if (MediaRecorder.isTypeSupported('video/mp4')) options = { mimeType: 'video/mp4' }; try { const mediaRecorder = new MediaRecorder(canvasStream, options); customMediaRecorderRef.current = mediaRecorder; customChunksRef.current = []; mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) customChunksRef.current.push(e.data); }; mediaRecorder.onstop = async () => { const blob = new Blob(customChunksRef.current, { type: options.mimeType }); const file = new File([blob], `Video_${Date.now()}.webm`, { type: options.mimeType }); setShowVideoRecorder(false); if(useGeotagging) { setPendingVideoFile(file); setCommentText(''); setCommentModalOpen(true); } else { performUpload(file, true, false, '', 0); } }; mediaRecorder.start(); setIsVideoRecording(true); let seconds = 0; const timerInterval = setInterval(() => { seconds++; setVideoTimer(seconds); }, 1000); mediaRecorder.timerInterval = timerInterval; } catch (e) { alert("فشل بدء التسجيل."); } };
  
  const stopRecordingVideo = () => { if (customMediaRecorderRef.current && isVideoRecording) { customMediaRecorderRef.current.stop(); setIsVideoRecording(false); clearInterval(customMediaRecorderRef.current.timerInterval); setVideoTimer(0); } };
  
  // Updated performUpload to accept a comment AND batchIndex for serial numbering
  const performUpload = async (file: File, closeOnFinish = true, processGeo = true, comment = '', batchIndex = 0) => { 
      try { 
          // --- AUTO RENAMING LOGIC ---
          // Format: ProjectName_Date_Serial.ext
          const fileExt = file.name.split('.').pop() || 'file';
          // Sanitize project name to be filename-safe
          const cleanProjectName = (currentProject?.name || 'Project').replace(/[\/\\?%*:|"<> ]/g, '_');
          const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
          
          // Calculate serial: Current File Count + 1 + Current Upload Batch Index
          const currentFileCount = items.filter(i => i.type === ItemType.FILE).length;
          const serial = (currentFileCount + 1 + batchIndex).toString().padStart(3, '0');
          
          const newFileName = `${cleanProjectName}_${dateStr}_${serial}.${fileExt}`;
          
          // Create a new File object with the new name
          const renamedFile = new File([file], newFileName, { type: file.type });
          // ---------------------------

          let fileToUpload = renamedFile; 
          let finalGeoData = currentGeoDataRef.current; 
          const isImage = renamedFile.type.startsWith('image/'); 
          const isVideo = renamedFile.type.startsWith('video/'); 
          
          if (useGeotagging && processGeo && (isImage || isVideo)) { 
              if (!finalGeoData) { 
                  if (currentProject?.lat && currentProject?.lng) { 
                      const weather = await geoUtils.getWeather(currentProject.lat, currentProject.lng); 
                      const address = await geoUtils.getAddress(currentProject.lat, currentProject.lng); 
                      finalGeoData = { lat: currentProject.lat, lng: currentProject.lng, address: address, temperature: weather?.temp, weatherDesc: weather?.desc, timestamp: new Date().toLocaleString('ar-EG', { dateStyle: 'full', timeStyle: 'short' }) }; 
                  } else { 
                      finalGeoData = await geoUtils.getFullContext(); 
                  } 
              } 
              
              const locationStr = currentProject?.location || finalGeoData?.address || "موقع غير محدد";

              if (isImage) { 
                  setIsProcessingImage(true); 
                  // Pass comment to imageUtils
                  fileToUpload = await imageUtils.addWatermark(renamedFile, finalGeoData!, currentProject?.name || "مشروع", locationStr, comment); 
                  setIsProcessingImage(false); 
              } else if (isVideo) { 
                  setIsProcessingImage(true); 
                  setUploadStatusMsg("جاري معالجة الفيديو وإضافة التوقيع..."); 
                  // Pass comment to videoUtils
                  // Because we stopped drawing on canvas, this is the ONLY place the ribbon is added.
                  fileToUpload = await imageUtils.addVideoWatermark(renamedFile, finalGeoData!, currentProject?.name || "مشروع", locationStr, (p) => { setUploadProgress(p); }, comment); 
                  setIsProcessingImage(false); 
                  setUploadStatusMsg(''); 
              } 
          } else if (isImage && !useGeotagging) { 
              fileToUpload = await imageUtils.compressImage(renamedFile); 
          } 
          
          await api.uploadFile(currentFolderId, fileToUpload, (p) => setUploadProgress(p), comment); 
          if (closeOnFinish) fetchContents(); 
      } catch (e: any) { 
          alert(`فشل الرفع: ${e.message || 'خطأ غير معروف'}`); console.error(e); 
      } finally { 
          if (closeOnFinish) { setIsUploading(false); setIsProcessingImage(false); } 
      } 
  };

  const handleBack = async () => { 
      // Archive Logic
      if (isArchiveRoute || isArchiveRoot || isArchiveSection) {
          if (currentFolderName === ARCHIVE_FOLDER_NAME) {
              navigate('/');
              return;
          }
          const parentArchiveId = currentParentId || location.state?.parentId || (await api.getArchiveFolderId().catch(() => ''));
          if (parentArchiveId && parentArchiveId !== currentFolderId) {
              navigate(`/archive/${parentArchiveId}`, { state: { folderName: ARCHIVE_FOLDER_NAME } });
              return;
          }
          navigate('/');
          return;
      }

      // 1. If we are at the project root or have no ID, go to Home
      const isAtRoot = currentFolderId === projectId || (currentProject?.driveFolderId && currentFolderId === currentProject.driveFolderId);
      if (isAtRoot || !currentFolderId) {
          navigate('/');
          return;
      }

      // 2. Special Case: Archive Root -> Project Root
      if (currentFolderName === 'الأرشيف الهندسي' || isArchiveRoot) {
          navigate(`/project/${projectId}`);
          return;
      }

      // 3. Try to navigate to parent
      try {
          // Fetch fresh metadata to ensure we have the parent ID
          const meta = await api.getFileMetadata(currentFolderId);
          const parentId = meta?.parentId;

          if (parentId) {
              // Check if parent is the project root (Firestore ID or Drive ID)
              // We also check if currentProject is loaded, if not we try to get it
              let driveRootId = currentProject?.driveFolderId;
              if (!driveRootId) {
                  const p = await api.getProjectById(projectId);
                  driveRootId = p?.driveFolderId;
              }

              const isParentRoot = parentId === projectId || (driveRootId && parentId === driveRootId);
              
              if (isParentRoot) {
                  navigate(`/project/${projectId}`);
              } else {
                  // Try to get parent name for better UX
                  let parentName = '...';
                  try {
                      const parentMeta = await api.getFileMetadata(parentId);
                      if (parentMeta) parentName = parentMeta.name;
                  } catch(e) {}
                  navigate(`/project/${projectId}/${parentId}`, { state: { folderName: parentName } }); 
              }
              return;
          }
      } catch(e) {
          console.error("Back navigation error", e);
      }
      
      // 4. Final Fallback -> Project Root
      navigate(`/project/${projectId}`); 
  };

  const triggerFileInput = (inputRef: React.RefObject<HTMLInputElement>) => { setTimeout(() => { inputRef.current?.click(); }, 50); };
  
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, fromCamera: boolean = false) => { 
      const files = e.target.files; 
      if (!files || files.length === 0) return; 
      
      const pdfFile = Array.from(files).find(f => f.type === 'application/pdf'); 
      if (pdfFile) { 
          setPendingPdfFile(pdfFile); 
          setShowPdfModeModal(true); 
          e.target.value = ''; 
          return; 
      } 
      
      // Intercept live camera capture OR when Geotagging is ON for photos/videos
      if (fromCamera || useGeotagging) {
          const imageOrVideo = Array.from(files).filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'));
          if (imageOrVideo.length > 0) {
              setPendingUploadFiles(imageOrVideo);
              setCommentText('');
              setCaptureInspectionResult(null);
              setCaptureInspectionError(null);
              setCaptureInspecting(false);
              setCommentModalOpen(true);
              e.target.value = '';
              return;
          }
      }

      // Default upload flow if no Geotagging or non-media files
      setIsUploading(true); 
      setUploadProgress(0); 
      const totalFiles = files.length; 
      let completed = 0; 
      for (let i = 0; i < totalFiles; i++) { 
          setUploadStatusMsg(`جاري رفع ${i + 1} من ${totalFiles}: ${files[i].name}`); 
          // Pass index i for serial numbering
          await performUpload(files[i], i === totalFiles - 1, false, '', i); 
          completed++; 
          setUploadProgress((completed / totalFiles) * 100); 
      } 
      e.target.value = ''; 
  };

  // New function to process uploads after comment modal
  const processPendingUploads = async (comment: string) => {
      setCommentModalOpen(false);
      setIsUploading(true);
      setUploadProgress(0);
      
      const filesToProcess = pendingVideoFile ? [pendingVideoFile] : pendingUploadFiles;
      const totalFiles = filesToProcess.length;
      let completed = 0;

      for (let i = 0; i < totalFiles; i++) {
          setUploadStatusMsg(`جاري رفع ${i + 1} من ${totalFiles}: ${filesToProcess[i].name}`);
          // Pass the comment (saved in file metadata AND optionally watermarked) + index i for unique serial numbers
          await performUpload(filesToProcess[i], i === totalFiles - 1, useGeotagging, comment, i);
          completed++;
          setUploadProgress((completed / totalFiles) * 100);
      }
      
      setPendingUploadFiles([]);
      setPendingVideoFile(null);
      setCaptureInspectionResult(null);
      setCaptureInspectionError(null);
  };

  const handlePdfChoice = async (mode: 'file' | 'images') => { setShowPdfModeModal(false); if (!pendingPdfFile) return; if (mode === 'file') { setIsUploading(true); setUploadStatusMsg("جاري رفع ملف PDF..."); await performUpload(pendingPdfFile, true, false, '', 0); } else { setIsUploading(true); setUploadStatusMsg("جاري تحويل PDF إلى صور..."); try { const folderName = pendingPdfFile.name.replace('.pdf', ''); const newFolder = await api.createFolder(currentFolderId, folderName); const images = await imageUtils.convertPdfToImages(pendingPdfFile, (curr, total) => { setUploadStatusMsg(`جاري تحويل صفحة ${curr} من ${total}`); setUploadProgress((curr/total)*50); }); for (let i = 0; i < images.length; i++) { setUploadStatusMsg(`جاري رفع صورة ${i + 1} من ${images.length}`); await api.uploadFile(newFolder.id, images[i], (p) => { setUploadProgress(50 + ((i / images.length) * 50) + (p * 0.5 / images.length)); }); } fetchContents(); } catch (e) { alert("فشل معالجة ملف PDF"); console.error(e); } finally { setIsUploading(false); setUploadStatusMsg(''); } } setPendingPdfFile(null); };
  const handleCreateFolder = async () => { if (!newFolderName.trim()) return; try { await api.createFolder(currentFolderId, newFolderName); setModalMode('none'); setNewFolderName(''); fetchContents(); } catch (e) { alert("فشل إنشاء المجلد"); } };
  const handleItemClick = (item: FileItem) => { 
      if (item.type === ItemType.FOLDER) { 
          if (isArchiveRoute || isArchiveRoot || isArchiveSection) {
              navigate(`/archive/${item.id}`, { state: { folderName: item.name, parentId: currentFolderId } });
          } else {
              navigate(`/project/${projectId}/${item.id}`, { state: { folderName: item.name } }); 
          }
      } else { 
          if (item.mimeType === 'text/html' || item.name.endsWith('.html')) { 
              setSelectedArchiveItem(item); 
          } else { 
              setPreviewItem(item); 
          } 
      } 
  };
  
  const handleShare = async (item: FileItem) => {
      if (item.type === ItemType.FOLDER) {
          setShareState({
              isOpen: true,
              item,
              file: null,
              files: [],
              status: 'folder_choice',
              progress: 0,
              progressText: '',
              isZip: false,
              selectedIds: [],
              shareTitle: item.name
          });
          return;
      }

      // Check for large files (> 30MB)
      const isLarge = (item.size || 0) > 30 * 1024 * 1024; // 30MB limit

      setShareState({
          isOpen: true,
          item,
          file: null,
          files: [],
          status: isLarge ? 'choice' : 'downloading',
          progress: 0,
          progressText: 'جاري تحضير الملف...',
          isZip: false,
          selectedIds: [item.id],
          shareTitle: item.name
      });

      if (!isLarge) {
          downloadForShare(item);
      }
  };

  const downloadForShare = async (item: FileItem) => {
      setShareState(prev => ({ ...prev, status: 'downloading', progress: 0, progressText: 'جاري تحضير الملف...' }));
      try {
          const blob = await api.downloadFileBlob(item.id, (p) => setShareState(prev => ({ ...prev, progress: p })));
          const mimeType = inferShareMimeType(item.name, blob.type);
          const file = new File([blob], sanitizeShareName(item.name, 'file'), { type: mimeType });
          setShareState(prev => ({
              ...prev,
              status: 'ready',
              file,
              files: [file],
              isZip: false,
              selectedIds: prev.selectedIds.length ? prev.selectedIds : [item.id],
              shareTitle: item.name
          }));
      } catch (e) {
          console.error(e);
          setShareState(prev => ({ ...prev, status: 'error', errorMessage: 'تعذر تحميل الملف. يرجى التحقق من الإنترنت.' }));
      }
  };

  const prepareFolderShare = async (folderItem: FileItem, mode: 'zip' | 'separate') => {
      setShareState(prev => ({
          ...prev,
          status: 'downloading',
          progress: 5,
          progressText: 'جاري فحص محتويات المجلد...',
          isZip: mode === 'zip',
          shareTitle: folderItem.name
      }));
      try {
          const collected = await collectFolderFilesRecursive(
              folderItem.id,
              (id) => api.getContents(id),
              (subName, count) => {
                  setShareState(prev => ({
                      ...prev,
                      progress: 8,
                      progressText: count > 0 ? `جاري الفحص (${count} ملف)...` : `جاري فحص ${subName || folderItem.name}...`
                  }));
              }
          );

          if (collected.length === 0) {
              setShareState(prev => ({ ...prev, status: 'empty_folder', progress: 0 }));
              return;
          }

          const downloadWeight = mode === 'zip' ? 0.72 : 1.0;
          const downloaded = await downloadItemsAsFiles(
              collected,
              (id) => api.downloadFileBlob(id, undefined, true),
              (pct, done, total) => {
                  const mappedPct = Math.max(10, Math.round(pct * downloadWeight));
                  setShareState(prev => ({
                      ...prev,
                      progress: mappedPct,
                      progressText: `جاري تجهيز الملفات (${done} من ${total})...`
                  }));
              }
          );

          if (mode === 'zip') {
              setShareState(prev => ({ ...prev, progress: 75, progressText: 'جاري ضغط الملفات في ملف ZIP...' }));
              const zipFile = await createZipFromDownloaded(downloaded, folderItem.name, (zipPct) => {
                  const mapped = Math.min(99, 75 + Math.round(zipPct * 0.25));
                  setShareState(prev => ({ ...prev, progress: mapped, progressText: 'جاري ضغط الملفات...' }));
              });
              setShareState(prev => ({
                  ...prev,
                  status: 'ready',
                  file: zipFile,
                  files: [zipFile],
                  isZip: true,
                  progress: 100,
                  shareTitle: folderItem.name
              }));
          } else {
              const separateFiles = downloaded.map(d => d.file);
              setShareState(prev => ({
                  ...prev,
                  status: 'ready',
                  file: separateFiles[0] || null,
                  files: separateFiles,
                  isZip: false,
                  progress: 100,
                  shareTitle: folderItem.name
              }));
          }
      } catch (e) {
          console.error(e);
          setShareState(prev => ({
              ...prev,
              status: 'error',
              errorMessage: 'تعذر تحضير محتويات المجلد للمشاركة. يرجى التحقق من الإنترنت.'
          }));
      }
  };

  const prepareMultiFileShare = async (selectedFileItems: FileItem[], mode: 'zip' | 'separate') => {
      if (selectedFileItems.length === 0) return;
      const baseTitle = selectedFileItems.length === 1
          ? selectedFileItems[0].name
          : (currentFolderName || shareState.item?.name || 'ملفات المشروع');

      setShareState(prev => ({
          ...prev,
          status: 'downloading',
          progress: 5,
          progressText: `جاري تجهيز ${selectedFileItems.length} ملفات...`,
          isZip: mode === 'zip',
          shareTitle: baseTitle
      }));

      try {
          const entries = selectedFileItems.map(it => ({
              item: it,
              relativePath: sanitizeShareName(it.name, `file_${it.id}`)
          }));
          const downloadWeight = mode === 'zip' ? 0.72 : 1.0;
          const downloaded = await downloadItemsAsFiles(
              entries,
              (id) => api.downloadFileBlob(id, undefined, true),
              (pct, done, total) => {
                  const mappedPct = Math.max(8, Math.round(pct * downloadWeight));
                  setShareState(prev => ({
                      ...prev,
                      progress: mappedPct,
                      progressText: `جاري تحضير (${done} من ${total}) ملف...`
                  }));
              }
          );

          if (mode === 'zip') {
              setShareState(prev => ({ ...prev, progress: 75, progressText: 'جاري ضغط الملفات في ملف ZIP...' }));
              const zipName = selectedFileItems.length === 1
                  ? selectedFileItems[0].name.replace(/.[^/.]+$/, '')
                  : (currentFolderName || 'مجموعة_ملفات');
              const zipFile = await createZipFromDownloaded(downloaded, zipName, (zipPct) => {
                  const mapped = Math.min(99, 75 + Math.round(zipPct * 0.25));
                  setShareState(prev => ({ ...prev, progress: mapped, progressText: 'جاري ضغط الملفات...' }));
              });
              setShareState(prev => ({
                  ...prev,
                  status: 'ready',
                  file: zipFile,
                  files: [zipFile],
                  isZip: true,
                  progress: 100,
                  shareTitle: baseTitle
              }));
          } else {
              const separateFiles = downloaded.map(d => d.file);
              setShareState(prev => ({
                  ...prev,
                  status: 'ready',
                  file: separateFiles[0] || null,
                  files: separateFiles,
                  isZip: false,
                  progress: 100,
                  shareTitle: baseTitle
              }));
          }
      } catch (e) {
          console.error(e);
          setShareState(prev => ({
              ...prev,
              status: 'error',
              errorMessage: 'تعذر تحميل الملفات المحددة. يرجى التحقق من الإنترنت.'
          }));
      }
  };

  const openMultiSelectFromShare = () => {
      setShareState(prev => {
          const initialId = prev.item && prev.item.type === ItemType.FILE ? [prev.item.id] : [];
          return {
              ...prev,
              status: 'multi_select',
              selectedIds: prev.selectedIds.length > 0 ? prev.selectedIds : initialId
          };
      });
  };

  const toggleShareFileSelection = (fileId: string) => {
      setShareState(prev => {
          const exists = prev.selectedIds.includes(fileId);
          return {
              ...prev,
              selectedIds: exists ? prev.selectedIds.filter(id => id !== fileId) : [...prev.selectedIds, fileId]
          };
      });
  };

  const shareLink = () => {
      if (shareState.item) {
          api.shareSmart(shareState.item);
      }
      setShareState(prev => ({ ...prev, isOpen: false }));
  };

  const executeShare = async () => {
      const filesToSend = shareState.files.length > 0 ? shareState.files : (shareState.file ? [shareState.file] : []);
      if (filesToSend.length === 0) return;
      const result = await api.shareFilesSmart(filesToSend, shareState.shareTitle || shareState.item?.name);
      if (result.method === 'native') {
          setShareState(prev => ({ ...prev, isOpen: false }));
      } else if (result.method === 'downloaded') {
          setShareState(prev => ({ ...prev, status: 'downloaded_notice' }));
      }
  };
  const handleRename = (item: FileItem) => {
      setSelectedItem(item);
      setRenameValue(item.name);
      setRenameDescription(item.description || '');
      setModalMode('rename');
      if (item.type === ItemType.FILE && item.description === undefined) {
          api.getFileMetadata(item.id).then((meta) => {
              if (meta?.description !== undefined) setRenameDescription(meta.description);
          }).catch(() => {});
      }
  };
  const confirmRename = async () => {
      if (selectedItem && renameValue.trim()) {
          try {
              const updates: { name?: string; description?: string } = { name: renameValue.trim() };
              if (selectedItem.type === ItemType.FILE) {
                  updates.description = renameDescription.trim();
              }
              await api.updateFileMetadata(selectedItem.id, updates, selectedItem);
              setItems(prev => prev.map(i => i.id === selectedItem.id ? { ...i, ...updates } : i));
              setModalMode('none');
              fetchContents();
          } catch (e) {
              alert("فشل تعديل بيانات الملف");
          }
      }
  };
  const handleMove = async (item: FileItem) => { setSelectedItem(item); setMoveTargetId(currentFolderId); setMoveBreadcrumbs([{ id: currentFolderId, name: currentFolderName }]); setModalMode('move'); fetchMoveContents(currentFolderId); };
  const fetchMoveContents = async (targetId: string) => { setLoadingMove(true); try { const contents = await api.getContents(targetId, true); const folders = contents.filter(i => i.type === ItemType.FOLDER && i.id !== selectedItem?.id); setMoveFolderItems(folders); } catch(e) { setMoveFolderItems([]); } finally { setLoadingMove(false); } };
  const handleMoveNavigate = (folder: FileItem) => { setMoveTargetId(folder.id); setMoveBreadcrumbs(prev => [...prev, { id: folder.id, name: folder.name }]); fetchMoveContents(folder.id); };
  const handleMoveBack = async () => { if (moveBreadcrumbs.length > 1) { const newBreadcrumbs = [...moveBreadcrumbs]; newBreadcrumbs.pop(); const parent = newBreadcrumbs[newBreadcrumbs.length - 1]; setMoveBreadcrumbs(newBreadcrumbs); setMoveTargetId(parent.id); fetchMoveContents(parent.id); return; } if (moveTargetId === projectId) return; setLoadingMove(true); try { const meta = await api.getFileMetadata(moveTargetId); if (meta && meta.parentId) { let parentName = '...'; if (meta.parentId === projectId) { parentName = currentProject?.name || 'المشروع'; } else { try { const parentMeta = await api.getFileMetadata(meta.parentId); if (parentMeta) parentName = parentMeta.name; } catch(e) { parentName = 'المجلد السابق'; } } setMoveTargetId(meta.parentId); setMoveBreadcrumbs([{ id: meta.parentId, name: parentName }]); fetchMoveContents(meta.parentId); } } catch(e) { console.error("Failed to navigate up", e); } finally { setLoadingMove(false); } };
  const confirmMove = async () => { if (!selectedItem || !moveTargetId) return; if (moveTargetId === selectedItem.parentId) { alert("الملف موجود بالفعل في هذا المجلد."); return; } try { await api.moveItem(selectedItem.id, selectedItem.parentId, moveTargetId); setModalMode('none'); fetchContents(); } catch(e) { alert("فشل نقل العنصر."); } };
  const handleDeleteItemClick = (itemId: string, itemName: string) => { setDeleteTarget({ id: itemId, name: itemName }); };
  const confirmDelete = async () => { if (!deleteTarget) return; try { await api.deleteItem(deleteTarget.id, currentFolderId); fetchContents(); } catch (e) { alert("حدث خطأ أثناء الحذف"); } finally { setDeleteTarget(null); } };
  const sortedItems = useMemo(() => { 
      let sorted = [...items]; 
      
      // FILTER OUT SYSTEM FILES
      sorted = sorted.filter(item => {
          const name = item.name.toLowerCase();
          // Hide JSON files, project_data files, and hidden files starting with dot
          if (name.endsWith('.json')) return false;
          if (name.startsWith('project_data')) return false;
          if (name.startsWith('.')) return false;
          return true;
      });

      sorted.sort((a, b) => { 
          if (a.type !== b.type) return a.type === ItemType.FOLDER ? -1 : 1; 
          if (sortConfig.key === 'date') return sortConfig.direction === 'desc' ? new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime() : new Date(a.createdTime).getTime() - new Date(b.createdTime).getTime(); 
          return sortConfig.direction === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name); 
      }); 
      return sorted;
  }, [items, sortConfig]);
  const shareableFilesInFolder = useMemo(() => sortedItems.filter(i => i.type === ItemType.FILE), [sortedItems]);
  const openMasterData = () => { setModalMode('masterData'); };

  // --- REPORT GENERATION LOGIC (UPDATED WITH PMP FLOW) ---
  const handleOpenReportModal = () => {
      setModalMode('report');
  };

  const handleGenerateReport = async (startDate: string, endDate: string, reportType: string, title: string) => {
      if (!currentProject) return;
      setIsGeneratingReport(true);
      
      try {
          // 1. Fetch full project logs to filter
          // Use 'getProjectById' to ensure we have the logs even if they are large
          const fullProject = await api.getProjectById(currentProject.id);
          const logs = fullProject?.executionLogs || [];
          
          // 2. Filter logs by date range
          const filteredLogs = logs.filter(log => {
              const logDate = new Date(log.date);
              const start = new Date(startDate);
              const end = new Date(endDate);
              // Normalize dates to avoid time issues
              logDate.setHours(0,0,0,0);
              start.setHours(0,0,0,0);
              end.setHours(23,59,59,999);
              return logDate >= start && logDate <= end;
          });

          // 3. AI Analysis: Get only the smart summary HTML
          const aiSummaryHtml = await aiHelper.generateCustomProjectReport(
              fullProject || currentProject, 
              filteredLogs, 
              title, 
              startDate, 
              endDate
          );

          // 4. Assemble the Full Report (Summary + Tables + Photos)
          // This ensures the "Evidence" is always there, even if AI hallucinates or summarizes
          const finalReportHtml = ReportGenerator.buildPhotoReport(
              title,
              aiSummaryHtml,
              filteredLogs,
              fullProject || currentProject,
              { start: startDate, end: endDate }
          );

          // 5. Navigate to Editor
          navigate(`/editor/${projectId}/${currentFolderId}`, { 
              state: { 
                  initialContent: finalReportHtml, 
                  filename: `${title.replace(/ /g, '_')}_${endDate}` 
              } 
          });
          
          setModalMode('none');

      } catch (error) {
          console.error(error);
          alert("حدث خطأ أثناء إنشاء التقرير.");
      } finally {
          setIsGeneratingReport(false);
      }
  };

  return (
    <Layout
      title={currentFolderName}
      showBack={true}
      onBack={handleBack}
      actions={
        <div className="flex items-center gap-2 relative z-50 pointer-events-auto">
          {!isArchive && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setUseGeotagging(!useGeotagging);
              }}
              className={`w-8 h-8 rounded-full flex items-center justify-center shadow-sm border transition relative ${
                useGeotagging
                  ? 'bg-green-500 text-white border-green-600'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <i className="fa-solid fa-location-dot text-xs"></i>
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setModalMode('createFolder');
            }}
            className="w-8 h-8 rounded-full bg-white text-orange-600 border border-orange-200 flex items-center justify-center shadow-sm hover:bg-orange-50 transition"
          >
            <i className="fa-solid fa-folder-plus text-xs"></i>
          </button>
          {!isArchive && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleToggleViewMode();
              }}
              className="w-8 h-8 rounded-full bg-white text-slate-700 border border-slate-200 flex items-center justify-center shadow-sm"
            >
              <i className={`fa-solid ${viewMode === 'list' ? 'fa-border-all' : 'fa-list'} text-xs`}></i>
            </button>
          )}
        </div>
      }
    >
      
      {/* ... (Hidden Inputs) ... */}
      <input type="file" multiple ref={fileInputRef} onChange={(e) => handleFileUpload(e, false)} style={{ display: 'none' }} accept="image/*,video/*,audio/*,application/pdf,text/plain,text/csv,application/rtf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation" />
      <input type="file" ref={cameraInputRef} onChange={(e) => handleFileUpload(e, true)} accept="image/*" capture="environment" style={{ display: 'none' }} />
      <input type="file" ref={scanInputRef} style={{ display: 'none' }} />
      
      {isUploading && (<div className="fixed top-0 left-0 w-full h-10 bg-slate-900 text-white z-[1000] flex items-center px-4 shadow-xl"><span className="text-[10px] font-bold mr-2 whitespace-nowrap">{uploadStatusMsg || `جاري الرفع ${uploadProgress}%`}</span><div className="flex-1 h-1 bg-white/20 rounded-full overflow-hidden"><div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div></div></div>)}
      {isProcessingImage && <div className="fixed inset-0 z-[1001] bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center text-white"><div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div><h3 className="text-xl font-bold mb-2">جاري المعالجة الجغرافية</h3></div>}
      {!isArchiveRoot && !isArchive && ( 
        <div className="flex gap-2 mb-4 mt-1 animate-slide-up"> 
            <div onClick={() => setShowMediaChoice(true)} className="flex-1 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-3 text-white cursor-pointer shadow-lg flex flex-col items-center justify-center text-center"> 
                <i className="fa-solid fa-camera text-xl mb-1"></i> 
                <h3 className="text-[10px] font-bold">موقع</h3> 
            </div> 
            <div onClick={() => triggerFileInput(fileInputRef)} className="flex-1 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-3 text-white cursor-pointer shadow-lg flex flex-col items-center justify-center text-center relative overflow-hidden group"> 
                <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-20 transition"></div>
                <div className="flex gap-1 mb-1 opacity-80"><i className="fa-solid fa-file-word text-[8px]"></i><i className="fa-solid fa-file-excel text-[8px]"></i><i className="fa-solid fa-file-audio text-[8px]"></i></div>
                <i className="fa-solid fa-cloud-arrow-up text-xl mb-1"></i> 
                <h3 className="text-[10px] font-bold">ملفات</h3> 
            </div> 
            <div onClick={() => navigate(`/editor/${projectId}/${currentFolderId}`)} className="flex-1 bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl p-3 text-white cursor-pointer shadow-lg flex flex-col items-center justify-center text-center"> 
                <i className="fa-solid fa-file-signature text-xl mb-1"></i> 
                <h3 className="text-[10px] font-bold">خطاب</h3> 
            </div> 
            <div onClick={openMasterData} className="flex-1 bg-gradient-to-br from-slate-700 to-slate-900 rounded-2xl p-3 text-white cursor-pointer shadow-lg flex flex-col items-center justify-center text-center"> 
                <i className="fa-solid fa-clipboard-list text-xl mb-1"></i> 
                <h3 className="text-[10px] font-bold">بيانات</h3> 
            </div>
        </div> 
      )}
      {loading ? ( <div className="space-y-2"><SkeletonRow /><SkeletonRow /><SkeletonRow /></div> ) : ( <div key={currentFolderId} className="min-h-[300px]"> {isArchiveRoot || isArchiveSection ? ( <div className="space-y-4 pb-10"> <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"> {sortedItems.filter(i => i.type === ItemType.FOLDER).map(item => <CategoryCard key={item.id} item={item} onClick={() => handleItemClick(item)} onRename={() => handleRename(item)} onMove={() => handleMove(item)} onDelete={() => handleDeleteItemClick(item.id, item.name)} onShare={() => handleShare(item)} /> )} </div> {sortedItems.filter(i => i.type !== ItemType.FOLDER).map(item => <ArchiveSummaryCard key={item.id} item={item} onClick={() => setSelectedArchiveItem(item)} onDelete={() => handleDeleteItemClick(item.id, item.name)} onRename={() => handleRename(item)} onMove={() => handleMove(item)} onShare={() => handleShare(item)} /> )} </div> ) : ( <div className={viewMode === 'list' ? 'space-y-2' : 'grid grid-cols-3 md:grid-cols-4 gap-1.5 md:gap-2.5'}> {sortedItems.map((item, idx) => {
          const handlePrefetchItem = () => {
              if (item.type === ItemType.FOLDER) {
                  if (!api.getCachedContents(item.id)) {
                      api.getLocalContents(item.id).catch(() => {});
                  }
              } else {
                  api.warmMediaItem(item);
              }
          };
          if (viewMode === 'grid' && (item.mimeType?.startsWith('image/') || item.mimeType?.startsWith('video/') || item.name.endsWith('.webm') || item.name.endsWith('.mp4') || item.name.endsWith('.mov') || item.name.endsWith('.avi'))) {
              const mime = (item.mimeType || '').toLowerCase();
              const name = item.name.toLowerCase();
              const isVideoItem = mime.startsWith('video/') || name.endsWith('.webm') || name.endsWith('.mp4') || name.endsWith('.mov') || name.endsWith('.avi');

              return (
                  <MediaGridCard
                      key={item.id}
                      item={item}
                      isVideoItem={isVideoItem}
                      colIndex={idx}
                      onPrefetch={handlePrefetchItem}
                      onClick={() => handleItemClick(item)}
                      onDelete={() => handleDeleteItemClick(item.id, item.name)}
                      onRename={() => handleRename(item)}
                      onMove={() => handleMove(item)}
                      onShare={() => handleShare(item)}
                  />
              );
          }
          return viewMode === 'list' ? (
              <div key={item.id} onPointerDown={handlePrefetchItem} onMouseEnter={handlePrefetchItem} onTouchStart={handlePrefetchItem}>
                  <FileItemRow item={item} onClick={() => handleItemClick(item)} onDelete={() => handleDeleteItemClick(item.id, item.name)} onRename={() => handleRename(item)} onMove={() => handleMove(item)} onShare={() => handleShare(item)} />
              </div>
          ) : (
              <div key={item.id} onPointerDown={handlePrefetchItem} onMouseEnter={handlePrefetchItem} onTouchStart={handlePrefetchItem}>
                  <FileGridCard item={item} onClick={() => handleItemClick(item)} onDelete={() => handleDeleteItemClick(item.id, item.name)} onRename={() => handleRename(item)} onMove={() => handleMove(item)} onShare={() => handleShare(item)} />
              </div>
          );
      })}
      {viewMode === 'grid' && sortedItems.length > 0 && (
          <>
              {sortedItems.length % 3 !== 0 &&
                  Array.from({ length: 3 - (sortedItems.length % 3) }).map((_, idx) => (
                      <div
                          key={`empty-grid-sm-${idx}`}
                          aria-hidden="true"
                          className="md:hidden aspect-square rounded-2xl border-2 border-dashed border-slate-300/80 bg-slate-50/30 pointer-events-none select-none"
                      />
                  ))}
              {sortedItems.length % 4 !== 0 &&
                  Array.from({ length: 4 - (sortedItems.length % 4) }).map((_, idx) => (
                      <div
                          key={`empty-grid-md-${idx}`}
                          aria-hidden="true"
                          className="hidden md:block aspect-square rounded-2xl border-2 border-dashed border-slate-300/80 bg-slate-50/30 pointer-events-none select-none"
                      />
                  ))}
          </>
      )}
      </div> )} </div> )}
      
      {isDrawingsFolder && ( <DwgController currentFolderId={currentFolderId} onUploadStart={() => { setIsUploading(true); setUploadProgress(0); }} onUploadProgress={(p, msg) => { setUploadProgress(p); setUploadStatusMsg(msg); }} onUploadComplete={() => { setIsUploading(false); fetchContents(); }} /> )}
      
      {isAudioFolder && (
          <AudioRecorder 
            projectId={projectId || ''} 
            folderId={currentFolderId} 
            onUploadComplete={fetchContents} 
          />
      )}

      {shareState.isOpen && (
        <div className="fixed inset-0 z-[1500] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
            <div className={`bg-white w-full ${shareState.status === 'multi_select' ? 'max-w-md' : 'max-w-xs'} rounded-2xl shadow-2xl p-6 text-center animate-scale-in border border-slate-200 relative overflow-hidden transition-all`}>
                {shareState.status === 'folder_choice' ? (
                    <>
                        <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-3 border border-amber-100 shadow-sm">
                            <i className="fa-solid fa-folder-open text-2xl"></i>
                        </div>
                        <h3 className="font-bold text-slate-800 mb-1 text-base">مشاركة المجلد</h3>
                        <p className="text-xs font-bold text-slate-500 mb-5 px-2 truncate">{shareState.item?.name}</p>
                        <div className="space-y-2.5 text-right">
                            <button
                                onClick={() => prepareFolderShare(shareState.item!, 'zip')}
                                className="w-full bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 p-3.5 rounded-xl flex items-center gap-3 transition group active:scale-[0.98]"
                            >
                                <div className="w-10 h-10 bg-indigo-600 text-white rounded-lg flex items-center justify-center shrink-0 shadow-sm">
                                    <i className="fa-solid fa-file-zipper text-lg"></i>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-bold text-slate-800 text-xs">مشاركة كملف مضغوط (ZIP)</h4>
                                    <p className="text-[10px] text-slate-500 mt-0.5">ضغط محتويات المجلد وإرسالها للواتساب</p>
                                </div>
                                <i className="fa-solid fa-chevron-left text-indigo-300 group-hover:text-indigo-600 transition text-xs"></i>
                            </button>

                            <button
                                onClick={() => prepareFolderShare(shareState.item!, 'separate')}
                                className="w-full bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 p-3.5 rounded-xl flex items-center gap-3 transition group active:scale-[0.98]"
                            >
                                <div className="w-10 h-10 bg-emerald-600 text-white rounded-lg flex items-center justify-center shrink-0 shadow-sm">
                                    <i className="fa-brands fa-whatsapp text-xl"></i>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-bold text-slate-800 text-xs">مشاركة كملفات غير مضغوطة</h4>
                                    <p className="text-[10px] text-slate-500 mt-0.5">إرسال كل الملفات منفصلة مباشرة للواتساب</p>
                                </div>
                                <i className="fa-solid fa-chevron-left text-emerald-300 group-hover:text-emerald-600 transition text-xs"></i>
                            </button>

                            <button
                                onClick={shareLink}
                                className="w-full bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 font-bold py-2.5 rounded-xl transition flex items-center justify-center gap-2 text-xs"
                            >
                                <i className="fa-solid fa-link text-blue-500"></i>
                                <span>مشاركة رابط المجلد فقط</span>
                            </button>
                        </div>
                    </>
                ) : shareState.status === 'multi_select' ? (
                    <div className="text-right">
                        <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-100">
                            <div>
                                <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                                    <i className="fa-solid fa-list-check text-indigo-600"></i>
                                    <span>اختيار ملفات للمشاركة</span>
                                </h3>
                                <p className="text-[11px] text-slate-500 mt-0.5">
                                    تم تحديد <span className="font-bold text-indigo-600">{shareState.selectedIds.length}</span> من أصل {shareableFilesInFolder.length} ملف
                                </p>
                            </div>
                            <button
                                onClick={() => {
                                    const allSelected = shareState.selectedIds.length === shareableFilesInFolder.length && shareableFilesInFolder.length > 0;
                                    setShareState(prev => ({
                                        ...prev,
                                        selectedIds: allSelected ? [] : shareableFilesInFolder.map(f => f.id)
                                    }));
                                }}
                                className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                            >
                                {shareState.selectedIds.length === shareableFilesInFolder.length && shareableFilesInFolder.length > 0 ? 'إلغاء الكل' : 'تحديد الكل'}
                            </button>
                        </div>

                        <div className="max-h-[42vh] overflow-y-auto space-y-1.5 pr-1 mb-4">
                            {shareableFilesInFolder.length === 0 ? (
                                <div className="py-8 text-center text-slate-400 text-xs font-bold">لا توجد ملفات أخرى في هذا المجلد</div>
                            ) : (
                                shareableFilesInFolder.map(fileItem => {
                                    const checked = shareState.selectedIds.includes(fileItem.id);
                                    const lower = fileItem.name.toLowerCase();
                                    const mime = (fileItem.mimeType || '').toLowerCase();
                                    let iconClass = 'fa-file text-slate-400';
                                    if (mime.startsWith('image/')) iconClass = 'fa-file-image text-purple-500';
                                    else if (mime.startsWith('video/')) iconClass = 'fa-file-video text-pink-500';
                                    else if (lower.endsWith('.pdf') || mime.includes('pdf')) iconClass = 'fa-file-pdf text-red-500';
                                    else if (lower.endsWith('.dwg') || lower.endsWith('.dxf')) iconClass = 'fa-compass-drafting text-[#c41e3a]';
                                    else if (lower.endsWith('.doc') || lower.endsWith('.docx')) iconClass = 'fa-file-word text-blue-600';
                                    else if (lower.endsWith('.xls') || lower.endsWith('.xlsx')) iconClass = 'fa-file-excel text-green-600';
                                    else if (lower.endsWith('.zip') || lower.endsWith('.rar')) iconClass = 'fa-file-zipper text-amber-600';

                                    return (
                                        <div
                                            key={fileItem.id}
                                            onClick={() => toggleShareFileSelection(fileItem.id)}
                                            className={`flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer transition ${checked ? 'bg-indigo-50/70 border-indigo-300 shadow-sm' : 'bg-slate-50/60 border-slate-200 hover:bg-slate-100'}`}
                                        >
                                            <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 border transition ${checked ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-300 text-transparent'}`}>
                                                <i className="fa-solid fa-check text-[10px]"></i>
                                            </div>
                                            <i className={`fa-solid ${iconClass} text-sm shrink-0`}></i>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-xs font-bold text-slate-700 truncate">{fileItem.name}</div>
                                            </div>
                                            {fileItem.size ? (
                                                <span className="text-[10px] font-bold text-slate-400 shrink-0">{formatShareBytes(fileItem.size)}</span>
                                            ) : null}
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        <div className="grid grid-cols-1 gap-2">
                            <button
                                disabled={shareState.selectedIds.length === 0}
                                onClick={() => {
                                    const selected = shareableFilesInFolder.filter(f => shareState.selectedIds.includes(f.id));
                                    prepareMultiFileShare(selected, 'zip');
                                }}
                                className="w-full bg-indigo-600 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-2.5 px-3 rounded-xl shadow-md hover:bg-indigo-700 transition flex items-center justify-center gap-2 text-xs active:scale-95"
                            >
                                <i className="fa-solid fa-file-zipper"></i>
                                <span>مشاركة كملف مضغوط (ZIP)</span>
                            </button>
                            <button
                                disabled={shareState.selectedIds.length === 0}
                                onClick={() => {
                                    const selected = shareableFilesInFolder.filter(f => shareState.selectedIds.includes(f.id));
                                    prepareMultiFileShare(selected, 'separate');
                                }}
                                className="w-full bg-emerald-600 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-2.5 px-3 rounded-xl shadow-md hover:bg-emerald-700 transition flex items-center justify-center gap-2 text-xs active:scale-95"
                            >
                                <i className="fa-brands fa-whatsapp text-sm"></i>
                                <span>مشاركة كملفات منفصلة (واتساب)</span>
                            </button>
                        </div>
                    </div>
                ) : shareState.status === 'choice' ? (
                    <>
                        <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-blue-100 shadow-sm relative animate-pulse">
                            <i className="fa-solid fa-file-video text-2xl"></i>
                        </div>
                        <h3 className="font-bold text-slate-800 mb-2 text-base">ملف كبير الحجم</h3>
                        <p className="text-xs text-slate-500 mb-6 px-2 leading-relaxed">
                            هذا الملف حجمه كبير ({Math.round((shareState.item?.size || 0) / 1024 / 1024)} MB).<br/>
                            لضمان سرعة المشاركة، نوصي بإرسال الرابط.
                        </p>
                        <div className="space-y-2.5">
                            <button onClick={shareLink} className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl shadow-lg hover:bg-blue-700 transition flex items-center justify-center gap-2 active:scale-95">
                                <i className="fa-solid fa-link"></i> مشاركة الرابط (فوري)
                            </button>
                            <button onClick={() => downloadForShare(shareState.item!)} className="w-full bg-slate-100 text-slate-700 font-bold py-3 rounded-xl border border-slate-200 hover:bg-slate-200 transition flex items-center justify-center gap-2 text-xs">
                                <i className="fa-solid fa-download"></i> تحميل ومشاركة الملف
                            </button>
                            {shareableFilesInFolder.length > 1 && (
                                <button onClick={openMultiSelectFromShare} className="w-full bg-indigo-50 text-indigo-700 font-bold py-2.5 rounded-xl border border-indigo-200 hover:bg-indigo-100 transition flex items-center justify-center gap-2 text-xs">
                                    <i className="fa-solid fa-list-check"></i> تحديد ملفات متعددة للمشاركة
                                </button>
                            )}
                        </div>
                    </>
                ) : shareState.status === 'empty_folder' ? (
                    <>
                        <div className="w-16 h-16 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-amber-100">
                            <i className="fa-regular fa-folder-open text-2xl"></i>
                        </div>
                        <h3 className="font-bold text-slate-800 mb-2 text-base">المجلد فارغ</h3>
                        <p className="text-xs text-slate-500 mb-5 leading-relaxed">لا توجد ملفات داخل هذا المجلد لمشاركتها.</p>
                        <button onClick={shareLink} className="w-full bg-slate-100 text-slate-700 font-bold py-2.5 rounded-xl border border-slate-200 hover:bg-slate-200 transition flex items-center justify-center gap-2 text-xs">
                            <i className="fa-solid fa-link"></i> مشاركة رابط المجلد
                        </button>
                    </>
                ) : shareState.status === 'downloaded_notice' ? (
                    <>
                        <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-100">
                            <i className="fa-solid fa-circle-check text-2xl"></i>
                        </div>
                        <h3 className="font-bold text-slate-800 mb-2 text-base">تم تنزيل الملفات بنجاح</h3>
                        <p className="text-xs text-slate-500 mb-5 leading-relaxed">
                            متصفح الكمبيوتر لا يدعم إرسال الملفات مباشرة لنافذة المشاركة، لذا تم حفظها على جهازك لإرفاقها في واتساب.
                        </p>
                        <a
                            href="https://wa.me/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full bg-emerald-600 text-white font-bold py-3 rounded-xl shadow-lg hover:bg-emerald-700 transition flex items-center justify-center gap-2 active:scale-95 text-xs"
                        >
                            <i className="fa-brands fa-whatsapp text-base"></i>
                            <span>فتح واتساب لإرفاق الملفات</span>
                        </a>
                    </>
                ) : (
                    <>
                        <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-indigo-100 shadow-sm relative">
                            {shareState.status === 'downloading' ? (
                                <>
                                    <div className="absolute inset-0 border-4 border-indigo-100 rounded-full"></div>
                                    <div className="absolute inset-0 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                                    <span className="text-[10px] font-bold z-10">{shareState.progress}%</span>
                                </>
                            ) : shareState.status === 'ready' ? (
                                <i className={`fa-solid ${shareState.isZip ? 'fa-file-zipper' : 'fa-share-nodes'} text-2xl animate-pulse`}></i>
                            ) : (
                                <i className="fa-solid fa-triangle-exclamation text-red-500 text-2xl"></i>
                            )}
                        </div>
                        <h3 className="font-bold text-slate-800 mb-2 text-base">
                            {shareState.status === 'downloading'
                                ? (shareState.progressText || 'جاري تحضير الملف...')
                                : shareState.status === 'ready'
                                    ? (shareState.isZip
                                        ? 'الملف المضغوط جاهز للمشاركة'
                                        : shareState.files.length > 1
                                            ? `تم تجهيز ${shareState.files.length} ملفات للمشاركة`
                                            : 'الملف جاهز للمشاركة')
                                    : 'فشل التحميل'}
                        </h3>
                        {shareState.status === 'ready' && (
                            <p className="text-xs text-slate-500 mb-4 px-2 truncate" title={shareState.files.map(f => f.name).join(', ')}>
                                {shareState.files.length > 1
                                    ? `${shareState.shareTitle || ''} • ${shareState.files.length} ملفات (${formatShareBytes(shareState.files.reduce((acc, f) => acc + f.size, 0))})`
                                    : (shareState.files[0]?.name || shareState.item?.name)}
                            </p>
                        )}
                        {shareState.status === 'ready' ? (
                            <div className="space-y-2.5">
                                {shareState.item?.type !== ItemType.FOLDER && shareableFilesInFolder.length > 0 && (
                                    <button
                                        onClick={openMultiSelectFromShare}
                                        className="w-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold py-2.5 px-3 rounded-xl transition flex items-center justify-center gap-2 text-xs active:scale-95"
                                    >
                                        <i className="fa-solid fa-list-check"></i>
                                        <span>
                                            {shareState.files.length > 1 || shareState.isZip
                                                ? 'تعديل تحديد الملفات'
                                                : 'تحديد ملفات متعددة للمشاركة'}
                                        </span>
                                    </button>
                                )}
                                <button
                                    onClick={executeShare}
                                    className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl shadow-lg hover:bg-indigo-700 transition flex items-center justify-center gap-2 active:scale-95"
                                >
                                    <i className="fa-solid fa-paper-plane rtl:rotate-180"></i>
                                    <span>مشاركة الآن</span>
                                </button>
                            </div>
                        ) : shareState.status === 'error' ? (
                            <div className="text-xs text-red-500 mb-4 font-bold bg-red-50 p-2 rounded-lg">
                                {shareState.errorMessage || 'تعذر تحميل الملف. يرجى التحقق من الإنترنت.'}
                            </div>
                        ) : null}
                    </>
                )}
                <button
                    onClick={() => setShareState(prev => ({ ...prev, isOpen: false }))}
                    className="mt-4 text-slate-400 text-xs font-bold hover:text-slate-600 transition block mx-auto"
                >
                    إغلاق
                </button>
            </div>
        </div>
      )}

      {/* Modals remain the same */}
      <ConfirmModal isOpen={!!deleteTarget} title="تأكيد الحذف" message={`هل أنت متأكد من رغبتك في حذف "${deleteTarget?.name}"؟ لا يمكن التراجع عن هذا الإجراء.`} onConfirm={confirmDelete} onCancel={() => setDeleteTarget(null)} type="danger" />
      {modalMode === 'createFolder' && ( <div className="fixed inset-0 z-[1200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"> <div className="bg-white w-full max-w-xs rounded-2xl shadow-2xl p-5 animate-scale-in"> <h3 className="font-bold text-slate-800 mb-4 text-center">مجلد جديد</h3> <input type="text" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="اسم المجلد..." className="w-full p-3 border border-slate-200 rounded-xl mb-4 bg-slate-50 outline-none focus:border-blue-500 text-sm font-bold text-center" autoFocus /> <div className="flex gap-2"> <button onClick={handleCreateFolder} className="flex-1 bg-blue-600 text-white py-2 rounded-xl font-bold hover:bg-blue-700 transition">إنشاء</button> <button onClick={() => setModalMode('none')} className="flex-1 bg-slate-100 text-slate-600 py-2 rounded-xl font-bold hover:bg-slate-200 transition">إلغاء</button> </div> </div> </div> )}
      {showPdfModeModal && ( <div className="fixed inset-0 z-[1200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"> <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl p-6 text-center animate-scale-in border border-slate-200"> <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl"> <i className="fa-solid fa-file-pdf"></i> </div> <h3 className="text-lg font-bold text-slate-800 mb-2">طريقة رفع ملف PDF</h3> <p className="text-xs text-slate-500 mb-6">كيف ترغب في حفظ هذا الملف في المجلد؟</p> <div className="flex flex-col gap-3"> <button onClick={() => handlePdfChoice('file')} className="w-full bg-slate-50 border border-slate-200 hover:bg-slate-100 p-4 rounded-xl flex items-center gap-4 transition group"> <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm text-red-500 border border-slate-100"> <i className="fa-solid fa-file-pdf text-xl"></i> </div> <div className="text-right flex-1"> <h4 className="font-bold text-slate-800 text-sm">ملف مستند (PDF)</h4> <p className="text-[10px] text-slate-400">حفظ كملف واحد للقراءة والطباعة</p> </div> <i className="fa-solid fa-chevron-left text-slate-300 group-hover:text-blue-500 transition"></i> </button> <button onClick={() => handlePdfChoice('images')} className="w-full bg-slate-50 border border-slate-200 hover:bg-slate-100 p-4 rounded-xl flex items-center gap-4 transition group"> <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm text-purple-500 border border-slate-100"> <i className="fa-solid fa-images text-xl"></i> </div> <div className="text-right flex-1"> <h4 className="font-bold text-slate-800 text-sm">ألبوم صور (مجلد)</h4> <p className="text-[10px] text-slate-400">تحويل كل صفحة لصورة وحفظها في مجلد</p> </div> <i className="fa-solid fa-chevron-left text-slate-300 group-hover:text-blue-500 transition"></i> </button> </div> <button onClick={() => { setShowPdfModeModal(false); setPendingPdfFile(null); }} className="mt-6 text-slate-400 text-xs font-bold hover:text-red-500 transition">إلغاء</button> </div> </div> )}
      {modalMode === 'rename' && (
          <div className="fixed inset-0 z-[1200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
              <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl p-5 animate-scale-in border border-slate-200">
                  <h3 className="font-extrabold text-slate-800 mb-4 text-center flex items-center justify-center gap-2">
                      <i className="fa-solid fa-pen-to-square text-blue-600"></i>
                      <span>{selectedItem?.type === ItemType.FILE ? 'تعديل بيانات وملاحظات الملف' : 'إعادة تسمية المجلد'}</span>
                  </h3>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">الاسم</label>
                  <input
                      type="text"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      className="w-full p-3 border border-slate-200 rounded-xl mb-3 bg-slate-50 outline-none focus:border-blue-500 text-sm font-bold text-right"
                      autoFocus
                  />
                  {selectedItem?.type === ItemType.FILE && (
                      <>
                          <label className="block text-[11px] font-bold text-slate-500 mb-1">ملاحظات وتوثيق الملف</label>
                          <textarea
                              value={renameDescription}
                              onChange={(e) => setRenameDescription(e.target.value)}
                              rows={4}
                              placeholder="لا توجد ملاحظات مسجلة في بيانات الملف..."
                              className="w-full p-3 border border-slate-200 rounded-xl mb-4 bg-slate-50 outline-none focus:border-blue-500 text-xs font-bold text-slate-800 resize-y leading-relaxed"
                          />
                      </>
                  )}
                  <div className="flex gap-2">
                      <button onClick={confirmRename} className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl font-bold hover:bg-blue-700 transition">حفظ</button>
                      <button onClick={() => setModalMode('none')} className="flex-1 bg-slate-100 text-slate-600 py-2.5 rounded-xl font-bold hover:bg-slate-200 transition">إلغاء</button>
                  </div>
              </div>
          </div>
      )}
      {modalMode === 'move' && ( <div className="fixed inset-0 z-[1200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"> <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl flex flex-col max-h-[80vh] animate-scale-in border border-slate-200 overflow-hidden"> <div className="p-4 bg-slate-100 border-b border-slate-200 flex justify-between items-center shrink-0"> <div> <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2"><i className="fa-solid fa-arrow-right-to-bracket text-orange-500"></i> نقل "{selectedItem?.name}" إلى...</h3> </div> <button onClick={() => setModalMode('none')} className="w-8 h-8 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-500 transition"><i className="fa-solid fa-times"></i></button> </div> <div className="px-3 py-2 bg-white border-b border-slate-100 flex items-center gap-1 overflow-x-auto text-xs whitespace-nowrap hide-scrollbar"> {(moveBreadcrumbs.length > 1 || (moveTargetId !== projectId)) && ( <button onClick={handleMoveBack} className="w-6 h-6 flex items-center justify-center bg-slate-100 rounded-full hover:bg-slate-200 mr-1 shrink-0"> <i className="fa-solid fa-arrow-right text-[10px] text-slate-600 rtl:rotate-180"></i> </button> )} {moveBreadcrumbs.map((crumb, idx) => ( <div key={crumb.id} className="flex items-center"> {idx > 0 && <span className="text-slate-300 mx-1">/</span>} <span className={`font-bold ${idx === moveBreadcrumbs.length - 1 ? 'text-orange-600' : 'text-slate-500'}`}>{crumb.name}</span> </div> ))} </div> <div className="flex-1 overflow-y-auto p-2 bg-slate-50 min-h-[200px]"> {loadingMove ? ( <div className="text-center py-10"><div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div><p className="text-xs text-slate-400">جاري التحميل...</p></div> ) : moveFolderItems.length === 0 ? ( <div className="text-center py-10 text-slate-400"><i className="fa-solid fa-folder-open text-3xl mb-2 opacity-30"></i><p className="text-xs font-bold">لا توجد مجلدات فرعية</p></div> ) : ( <div className="space-y-1"> {moveFolderItems.map(item => ( <div key={item.id} onClick={() => handleMoveNavigate(item)} className="flex items-center gap-3 p-3 rounded-xl cursor-pointer border bg-white border-slate-100 hover:bg-yellow-50 transition group"> <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-yellow-100 text-yellow-600"><i className="fa-solid fa-folder text-sm"></i></div> <div className="flex-1 min-w-0"><h4 className="text-xs font-bold text-slate-700 truncate group-hover:text-blue-700">{item.name}</h4></div> <i className="fa-solid fa-chevron-left text-slate-300 text-xs group-hover:text-blue-400"></i> </div> ))} </div> )} </div> <div className="p-3 bg-white border-t border-slate-200 shrink-0 flex gap-2"> <button onClick={confirmMove} className="flex-1 bg-orange-600 text-white py-3 rounded-xl font-bold hover:bg-orange-700 transition shadow-lg flex items-center justify-center gap-2 text-xs"> <i className="fa-solid fa-check"></i> نقل إلى هنا </button> <button onClick={() => setModalMode('none')} className="bg-slate-100 text-slate-600 px-6 py-3 rounded-xl font-bold hover:bg-slate-200 transition text-xs"> إلغاء </button> </div> </div> </div> )}
      {showMediaChoice && ( <div className="fixed inset-0 z-[1200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"> <div className="bg-white w-full max-w-xs rounded-2xl shadow-2xl p-6 text-center animate-scale-in"> <h3 className="text-slate-800 font-bold mb-4">التصوير الهندسي</h3> <div className="grid grid-cols-2 gap-3"> <button onClick={() => { setShowMediaChoice(false); triggerFileInput(cameraInputRef); }} className="bg-indigo-50 text-indigo-700 p-4 rounded-2xl flex flex-col items-center gap-2 font-bold text-xs"> <i className="fa-solid fa-camera text-xl"></i> صورة </button> <button onClick={() => { setShowMediaChoice(false); setShowVideoRecorder(true); }} className="bg-purple-50 text-purple-700 p-4 rounded-2xl flex flex-col items-center gap-2 font-bold text-xs"> <i className="fa-solid fa-video text-xl"></i> فيديو </button> </div> <button onClick={() => setShowMediaChoice(false)} className="mt-4 text-slate-400 font-bold">إلغاء</button> </div> </div> )}
      {showVideoRecorder && ( <div className="fixed inset-0 z-[1300] bg-black flex flex-col"> <div className="relative flex-1 bg-black overflow-hidden flex items-center justify-center"> <video ref={videoPreviewRef} className="absolute inset-0 w-full h-full object-cover" autoPlay playsInline muted></video> <canvas ref={canvasRef} className="hidden"></canvas> <div className="absolute top-4 left-4 right-4 flex justify-between items-start z-10"> <div className="bg-black/50 text-white px-3 py-1 rounded-full text-xs font-bold border border-white/20"> {isVideoRecording ? <span className="text-red-500 animate-pulse">● REC {Math.floor(videoTimer/60)}:{(videoTimer%60).toString().padStart(2,'0')}</span> : 'جاهز'} </div> <button onClick={() => setVideoQuality(videoQuality === 'hd' ? 'sd' : 'hd')} className="bg-black/40 text-white px-3 py-1 rounded-full text-[10px] font-bold border border-white/20"> {videoQuality === 'hd' ? 'HD 720p' : 'SD 480p'} </button> </div> </div> <div className="bg-slate-900 p-6 flex justify-between items-center text-white shrink-0 safe-bottom"> <button onClick={() => setShowVideoRecorder(false)} className="font-bold">إلغاء</button> <button onClick={isVideoRecording ? stopRecordingVideo : startRecordingVideo} className={`w-16 h-16 rounded-full border-4 flex items-center justify-center transition ${isVideoRecording ? 'border-red-500 scale-110' : 'border-white bg-red-600'}`}> {isVideoRecording ? <div className="w-6 h-6 bg-red-500 rounded-sm"></div> : <div className="w-16 h-16 rounded-full bg-red-600"></div>} </button> <div className="w-10"></div> </div> </div> )}
      
      {/* Post-Capture Smart Visual Inspection & Photo Note Modal */}
      {commentModalOpen && (
          <div className="fixed inset-0 z-[1400] bg-slate-900/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fade-in">
              <div className="bg-white w-full max-w-lg max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-scale-in border border-slate-200">
                  <div className="bg-gradient-to-l from-indigo-900 via-indigo-800 to-blue-800 text-white px-4 py-3 flex items-center justify-between shrink-0">
                      <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center">
                              <i className="fa-solid fa-camera text-amber-300 text-sm"></i>
                          </div>
                          <div>
                              <h3 className="font-extrabold text-sm leading-tight">توثيق وفحص الصورة الميدانية</h3>
                              <p className="text-[10px] text-indigo-200">
                                  {pendingVideoFile ? 'فيديو ميداني مسجل' : `عدد الصور المختارة: ${pendingUploadFiles.length || 1}`}
                              </p>
                          </div>
                      </div>
                      <button
                          type="button"
                          onClick={() => {
                              setCommentModalOpen(false);
                              setPendingUploadFiles([]);
                              setPendingVideoFile(null);
                              setCaptureInspectionResult(null);
                              setCaptureInspectionError(null);
                          }}
                          className="w-8 h-8 rounded-xl bg-white/10 hover:bg-red-500/80 flex items-center justify-center transition text-white"
                          title="إلغاء الرفع"
                      >
                          <i className="fa-solid fa-times text-xs"></i>
                      </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50 text-right">
                      {/* Captured Photo Preview + Smart Visual Inspection Trigger */}
                      {pendingCapturePreviewUrl && (
                          <div className="bg-white rounded-2xl p-3 border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center gap-3">
                              <img
                                  src={pendingCapturePreviewUrl}
                                  alt="معاينة الصورة الملتقطة"
                                  className="w-full sm:w-28 h-40 sm:h-28 rounded-xl object-cover border border-slate-200 shrink-0 bg-slate-100"
                              />
                              <div className="flex-1 w-full space-y-2 text-right">
                                  <div className="text-xs font-extrabold text-slate-800">المحلل البصري لصور الموقع</div>
                                  <p className="text-[11px] text-slate-500 font-bold leading-snug">
                                      تحليل العمل المرصود وتقييم الجودة والسلامة المهنية واقتراح بند المقايسة المطابق تلقائياً.
                                  </p>
                                  <button
                                      type="button"
                                      onClick={handleInspectCapturedPhoto}
                                      disabled={captureInspecting}
                                      className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-fuchsia-600 hover:from-indigo-500 hover:to-fuchsia-500 text-white text-xs font-extrabold shadow-md flex items-center justify-center gap-2 transition disabled:opacity-60"
                                  >
                                      {captureInspecting ? (
                                          <>
                                              <i className="fa-solid fa-circle-notch fa-spin text-yellow-300"></i>
                                              <span>جاري الفحص البصري الذكي...</span>
                                          </>
                                      ) : (
                                          <>
                                              <i className="fa-solid fa-eye text-yellow-300"></i>
                                              <span>فحص بصري ذكي</span>
                                          </>
                                      )}
                                  </button>
                              </div>
                          </div>
                      )}

                      {captureInspectionError && (
                          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-2.5 text-xs font-bold flex items-center gap-2">
                              <i className="fa-solid fa-triangle-exclamation"></i>
                              <span>{captureInspectionError}</span>
                          </div>
                      )}

                      {/* Inspection Result Cards */}
                      {captureInspectionResult && (
                          <div className="bg-white rounded-2xl p-3.5 border border-indigo-200 shadow-sm space-y-2.5">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <span className="text-xs font-extrabold text-indigo-900 flex items-center gap-1.5">
                                      <i className="fa-solid fa-clipboard-check text-indigo-600"></i>
                                      نتيجة الفحص البصري
                                  </span>
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md ${
                                          captureInspectionResult.qualityStatus === 'مطابق'
                                              ? 'bg-emerald-100 text-emerald-800'
                                              : captureInspectionResult.qualityStatus === 'يحتاج معالجة'
                                                  ? 'bg-red-100 text-red-800'
                                                  : 'bg-amber-100 text-amber-800'
                                      }`}>
                                          الجودة: {captureInspectionResult.qualityStatus}
                                      </span>
                                      <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md ${
                                          captureInspectionResult.safetyStatus === 'آمن'
                                              ? 'bg-emerald-100 text-emerald-800'
                                              : captureInspectionResult.safetyStatus.includes('خطر')
                                                  ? 'bg-red-100 text-red-800'
                                                  : 'bg-amber-100 text-amber-800'
                                      }`}>
                                          السلامة: {captureInspectionResult.safetyStatus}
                                      </span>
                                  </div>
                              </div>

                              <div className="text-[11.5px] text-slate-700 font-bold space-y-1 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                                  <div><strong className="text-slate-900">العمل المرصود:</strong> {captureInspectionResult.detectedWork}</div>
                                  <div><strong className="text-slate-900">تقييم الجودة:</strong> {captureInspectionResult.qualityAssessment}</div>
                                  <div><strong className="text-slate-900">السلامة المهنية:</strong> {captureInspectionResult.safetyAssessment}</div>
                                  <div className="text-indigo-800">
                                      <strong>بند المقايسة المقترح:</strong>{' '}
                                      {captureInspectionResult.suggestedBoqCode ? `[بند ${captureInspectionResult.suggestedBoqCode}] ` : ''}
                                      {captureInspectionResult.suggestedBoqDescription}
                                  </div>
                              </div>

                              <button
                                  type="button"
                                  onClick={() => setCommentText(captureInspectionResult.conciseNote || captureInspectionResult.detectedWork)}
                                  className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-sm flex items-center justify-center gap-2 transition"
                              >
                                  <i className="fa-solid fa-file-circle-plus"></i>
                                  <span>إدراج الملخص تلقائياً في ملاحظات الصورة</span>
                              </button>
                          </div>
                      )}

                      {/* Photo Note Textarea */}
                      <div className="bg-white rounded-2xl p-3 border border-slate-200 shadow-sm space-y-1.5">
                          <label className="block text-xs font-extrabold text-slate-700">
                              ملاحظات الصورة (تُحفظ في بيانات الملف{useGeotagging ? ' والشريط العلوي للصورة' : ''})
                          </label>
                          <textarea
                              value={commentText}
                              onChange={(e) => setCommentText(e.target.value)}
                              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm outline-none focus:border-blue-500 focus:bg-white transition min-h-[90px] resize-y font-bold text-slate-800 leading-relaxed"
                              placeholder="اكتب ملاحظتك هنا أو استخدم «فحص بصري ذكي»..."
                          />
                      </div>
                  </div>

                  <div className="p-3 bg-white border-t border-slate-200 flex gap-2.5 shrink-0">
                      <button
                          type="button"
                          onClick={() => processPendingUploads(commentText)}
                          className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-extrabold hover:bg-blue-700 transition shadow-lg text-xs flex items-center justify-center gap-2"
                      >
                          <i className="fa-solid fa-cloud-arrow-up"></i>
                          <span>{commentText.trim() ? 'حفظ ورفع مع الملاحظة' : 'رفع الصورة'}</span>
                      </button>
                      {commentText.trim() && (
                          <button
                              type="button"
                              onClick={() => processPendingUploads('')}
                              className="bg-slate-100 text-slate-600 px-4 py-3 rounded-xl font-bold hover:bg-slate-200 transition text-xs"
                          >
                              بدون ملاحظة
                          </button>
                      )}
                  </div>
              </div>
          </div>
      )}

      {/* Pass INITIAL DATA for instant load */}
      <ProjectMasterData 
          projectId={projectId || ''} 
          isOpen={modalMode === 'masterData'} 
          onClose={() => setModalMode('none')}
          onReportGenerated={fetchContents}
          initialProjectData={currentProject} 
          onProjectUpdated={(updated) => setCurrentProject(updated)}
          onOpenAI={() => setShowAI(true)}
      />
      
      {selectedArchiveItem && (
          <ArchiveFullViewer
              item={selectedArchiveItem}
              onClose={() => setSelectedArchiveItem(null)}
              onEdit={(c) =>
                  navigate(`/editor/${projectId || 'archive'}/${currentFolderId}?fileId=${selectedArchiveItem.id}`, {
                      state: { initialContent: c, filename: selectedArchiveItem.name.replace('.html', '') }
                  })
              }
              onDelete={(itemToDelete) => {
                  setSelectedArchiveItem(null);
                  handleDeleteItemClick(itemToDelete.id, itemToDelete.name);
              }}
              onContentUpdated={(itemId, newHtml) => {
                  setItems(prev => prev.map(i => (i.id === itemId ? { ...i, content: newHtml } : i)));
                  setSelectedArchiveItem(prev => (prev && prev.id === itemId ? { ...prev, content: newHtml } : prev));
              }}
          />
      )}
      {previewItem && (
          <FileViewer
              item={previewItem}
              project={currentProject}
              siblings={(() => {
                  const isPreviewMedia = (f: FileItem) => {
                      const m = (f.mimeType || '').toLowerCase();
                      const n = (f.name || '').toLowerCase();
                      return m.startsWith('image/') || m.startsWith('video/') || /\.(mp4|mov|webm|avi|mkv|3gp|jpg|jpeg|png|webp|gif)$/i.test(n);
                  };
                  return isPreviewMedia(previewItem) ? sortedItems.filter(isPreviewMedia) : [];
              })()}
              onItemUpdated={(updated) => {
                  setItems(prev => prev.map(i => (i.id === updated.id ? { ...i, ...updated } : i)));
                  setPreviewItem(prev => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev));
              }}
              onClose={() => setPreviewItem(null)}
          />
      )}
      {showAI && <ProjectAI projectId={projectId || ''} folderId={currentFolderId} projectData={currentProject} onClose={() => setShowAI(false)} onProjectUpdated={(updated) => setCurrentProject(updated)} />}
    </Layout>
  );
}
