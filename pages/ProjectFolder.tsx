
// @ts-nocheck
import React, { useEffect, useState, useRef, useMemo, startTransition } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import Layout from '../components/Layout';
import FileItemRow from '../components/FileItemRow';
import FileViewer from '../components/FileViewer';
import ProjectAI from '../components/ProjectAI';
import ConfirmModal from '../components/ConfirmModal'; 
import { api, ARCHIVE_SECTIONS, ARCHIVE_FOLDER_NAME } from '../services/api';
import { aiHelper } from '../services/aiHelper'; 
import { geoUtils, GeoData } from '../services/geoUtils';
import { imageUtils } from '../services/imageUtils';
import { printService } from '../services/printService';
import AudioRecorder from '../components/AudioRecorder';
import { FileItem, ItemType, Project, ProjectLog, ProjectPayment, BOQItem, PaymentItem } from '../types';
import ProjectMasterData from '../components/ProjectMasterData';
import { DwgController, openDwgInExternalApp } from '../components/DwgController'; 
import { ReportGenerator } from '../services/reportGenerator'; // IMPORT GENERATOR

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
    const getIcon = () => { if (isFolder) return { icon: 'fa-folder', color: 'text-yellow-500', bg: 'bg-yellow-50 border-yellow-100' }; const mime = (item.mimeType || '').toLowerCase(); const name = item.name.toLowerCase(); if (name.endsWith('.dwg') || mime.includes('acad') || mime.includes('dwg')) { return { icon: 'fa-compass-drafting', color: 'text-[#c41e3a]', bg: 'bg-red-50 border-red-100' }; } if (mime.startsWith('image/')) return { icon: 'fa-image', color: 'text-purple-500', bg: 'bg-purple-50 border-purple-100' }; if (mime.includes('pdf')) return { icon: 'fa-file-pdf', color: 'text-red-500', bg: 'bg-red-50 border-red-100' }; if (mime.includes('spreadsheet') || mime.includes('excel') || name.endsWith('.xlsx')) return { icon: 'fa-file-excel', color: 'text-green-500', bg: 'bg-green-50 border-green-100' }; if (mime.includes('word') || name.endsWith('.docx')) return { icon: 'fa-file-word', color: 'text-blue-500', bg: 'bg-blue-50 border-blue-100' }; if (mime.startsWith('video/') || name.endsWith('.mp4')) return { icon: 'fa-video', color: 'text-rose-500', bg: 'bg-rose-50 border-rose-100' }; return { icon: 'fa-file', color: 'text-slate-400', bg: 'bg-slate-50 border-slate-100' }; };
    const style = getIcon();
    return ( <div onClick={onClick} className={`bg-white rounded-3xl p-4 shadow-sm border border-slate-100 flex flex-col items-center gap-3 hover:shadow-lg hover:-translate-y-1 transition-all cursor-pointer group relative overflow-visible h-full ${showMenu ? 'z-[100]' : 'z-0'}`}> <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shadow-inner border ${style.bg} ${item.previewUrl ? 'p-0 overflow-hidden' : ''}`}>{item.previewUrl ? (<img src={item.previewUrl} alt="" className="w-full h-full object-cover" />) : (<i className={`fa-solid ${style.icon} ${style.color} drop-shadow-sm`}></i>)}</div> <div className="w-full text-center flex-1 flex flex-col"><h3 className="font-bold text-slate-800 text-xs truncate w-full mb-1" title={item.name}>{item.name}</h3><span className="text-[9px] text-slate-400 font-mono bg-slate-50 px-2 py-0.5 rounded-full mx-auto border border-slate-100 mb-2">{new Date(item.createdTime).toLocaleDateString('ar-EG')}</span>{isFolder && (<div className="mt-auto w-full grid grid-cols-2 gap-1.5 pt-2 border-t border-slate-50"><div className="flex flex-col items-center bg-blue-50/50 rounded-lg py-1 border border-blue-100"><span className="text-[10px] font-bold text-blue-700">{item.fileCount || 0}</span><span className="text-[8px] text-blue-400">ملف</span></div><div className="flex flex-col items-center bg-yellow-50/50 rounded-lg py-1 border border-yellow-100"><span className="text-[10px] font-bold text-yellow-700">{item.folderCount || 0}</span><span className="text-[8px] text-yellow-500">مجلد</span></div></div>)}</div> <div className="absolute top-2 right-2"><button ref={btnRef} onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }} className={`w-7 h-7 rounded-full flex items-center justify-center transition border border-slate-100 ${showMenu ? 'bg-blue-50 text-blue-600 opacity-100' : 'bg-white text-slate-400 opacity-0 group-hover:opacity-100 hover:text-blue-600 shadow-sm'}`}><i className="fa-solid fa-ellipsis-vertical text-[10px]"></i></button>{showMenu && (<div ref={menuRef} className="absolute right-0 top-full mt-1 w-36 bg-white rounded-xl shadow-xl border border-slate-100 z-50 overflow-hidden animate-scale-in origin-top-right"><button onClick={(e)=>{e.stopPropagation();setShowMenu(false);onShare()}} className="w-full text-right px-3 py-2.5 text-[10px] font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 flex items-center gap-2 border-b"><i className="fa-solid fa-share-nodes text-indigo-500 w-4"></i> مشاركة</button><button onClick={(e)=>{e.stopPropagation();setShowMenu(false);onRename()}} className="w-full text-right px-3 py-2.5 text-[10px] font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2 border-b"><i className="fa-solid fa-pen-to-square text-blue-500 w-4"></i> تعديل</button><button onClick={(e)=>{e.stopPropagation();setShowMenu(false);onMove()}} className="w-full text-right px-3 py-2.5 text-[10px] font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2 border-b"><i className="fa-solid fa-arrow-right-to-bracket text-orange-500 w-4"></i> نقل</button><button onClick={(e)=>{e.stopPropagation();setShowMenu(false);onDelete()}} className="w-full text-right px-3 py-2.5 text-[10px] font-bold text-red-600 hover:bg-red-50 flex items-center gap-2"><i className="fa-solid fa-trash text-red-500 w-4"></i> حذف</button></div>)}</div> </div> );
};
const ArchiveFullViewer: React.FC<{ item: FileItem, onClose: () => void, onEdit: (content: string) => void }> = ({ item, onClose, onEdit }) => {
    const [content, setContent] = useState<string>(''); const [loading, setLoading] = useState(true);
    useEffect(() => { let active = true; const fetchContent = async () => { try { if (item.content) { if(active) { setContent(item.content); setLoading(false); } return; } const text = await api.getFileContent(item.id); if(active) { setContent(text); } } catch (e) { if(active) setContent('<div class="p-10 text-center text-red-500 font-bold">فشل تحميل المحتوى</div>'); } finally { if(active) setLoading(false); } }; fetchContent(); return () => { active = false; }; }, [item.id, item.content]);
    const handlePrint = () => { const bodyContent = content.replace(/<!DOCTYPE html>[\s\S]*<body>/, '').replace(/<\/body>[\s\S]*<\/html>/, ''); printService.printReport(bodyContent, item.name.replace('.html', '')); };
    return ( <div className="fixed inset-0 z-[100] bg-white flex flex-col animate-scale-in"><div className="bg-slate-900 text-white px-4 py-3 flex justify-between items-center shadow-md z-10 shrink-0"><div className="flex items-center gap-3"><button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center transition"><i className="fa-solid fa-arrow-right rtl:rotate-180"></i></button><h3 className="font-bold text-sm truncate max-w-[200px] sm:max-w-md">{item.name.replace('.html', '')}</h3></div><div className="flex gap-2"><button onClick={() => onEdit(content)} disabled={loading} className="bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition shadow-sm border border-white/10 disabled:opacity-50"><i className="fa-solid fa-pen-to-square"></i> <span className="hidden sm:inline">تعديل</span></button><button onClick={handlePrint} disabled={loading} className="bg-teal-600 hover:bg-teal-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition shadow-sm disabled:opacity-50"><i className="fa-solid fa-print"></i> <span className="hidden sm:inline">طباعة</span></button></div></div><div className="flex-1 overflow-y-auto bg-white w-full">{loading ? (<div className="h-full flex items-center justify-center"><div className="flex flex-col items-center"><div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mb-4"></div><p className="text-slate-400 font-bold">جاري تحميل المستند...</p></div></div>) : (<div className="archive-card-content w-full min-h-full p-4 md:p-8 max-w-4xl mx-auto" dangerouslySetInnerHTML={{ __html: content }} />)}</div></div> );
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
  const [items, setItems] = useState<FileItem[]>(cachedData || []);
  const [loading, setLoading] = useState(!cachedData);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  // ... (Modal states remain unchanged)
  const [modalMode, setModalMode] = useState<'none' | 'createFolder' | 'upload' | 'masterData' | 'rename' | 'move' | 'createManualBOQ'>('none');
  const [selectedItem, setSelectedItem] = useState<FileItem | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [currentFolderId, setCurrentFolderId] = useState(targetId);
  const [currentFolderName, setCurrentFolderName] = useState<string>(isArchiveRoute ? ARCHIVE_FOLDER_NAME : (location.state?.folderName || '...'));
  const [currentParentId, setCurrentParentId] = useState<string | null>(null);
  const [pendingPdfFile, setPendingPdfFile] = useState<File | null>(null);
  const [showPdfModeModal, setShowPdfModeModal] = useState(false);
  const [uploadStatusMsg, setUploadStatusMsg] = useState('');
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: 'name' | 'date'; direction: 'asc' | 'desc' }>({ key: 'date', direction: 'desc' });
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
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
  const [shareState, setShareState] = useState<{ isOpen: boolean; item: FileItem | null; file: File | null; status: 'idle' | 'downloading' | 'ready' | 'error' | 'choice'; progress: number; }>({ isOpen: false, item: null, file: null, status: 'idle', progress: 0 });

  // --- NEW COMMENT STATES ---
  const [commentModalOpen, setCommentModalOpen] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [pendingUploadFiles, setPendingUploadFiles] = useState<File[]>([]);
  const [pendingVideoFile, setPendingVideoFile] = useState<File | null>(null); // For video case
  
  useEffect(() => {
      const checkArchive = async () => {
          if (!currentFolderId) return;
          try {
              const archiveId = await api.getArchiveFolderId();
              if (currentFolderId === archiveId) {
                  setCurrentFolderName(ARCHIVE_FOLDER_NAME);
                  // Force refresh contents to ensure subfolders are visible
                  const fresh = await api.getContents(archiveId, true);
                  setItems(fresh);
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
          if (location.state?.folderName) setCurrentFolderName(location.state.folderName); 
          setCurrentFolderId(newId); 
          const freshCache = api.getCachedContents(newId); 
          if (freshCache) { setItems(freshCache); setLoading(false); } 
          else { setLoading(true); } 
      } 
  }, [folderId, projectId, navigate, currentFolderId, location.state]);

  useEffect(() => {
      if (location.state?.returnToMasterData) {
          setModalMode('masterData');
          // Clear state to prevent reopening on refresh
          navigate(location.pathname, { replace: true, state: { ...location.state, returnToMasterData: undefined } });
      }
  }, [location.state, navigate]);

  const fetchContents = async () => { 
      if (!api.isAuthenticated()) return; 
      try { 
          if (currentFolderId && currentFolderId !== projectId) { 
              // Fix: Auto-redirect if metadata fails or invalid folder
              try {
                  const meta = await api.getFileMetadata(currentFolderId); 
                  if (meta) { 
                      if (!location.state?.folderName) setCurrentFolderName(meta.name); 
                      setCurrentParentId(meta.parentId); 
                  } else {
                      // Metadata not found or failed (could be guest mode glitch or offline)
                      // Only redirect if we absolutely have no folder name (meaning direct link access)
                      if (!location.state?.folderName) {
                          console.warn("Folder metadata missing, might be invalid link");
                          // Optional: navigate('/', { replace: true });
                      }
                  }
              } catch(e) {
                  // API error, stay on page if possible or show error
                  console.warn("Metadata fetch error", e);
              }
          } else { 
              setCurrentParentId(null); 
          } 
          
          const folderData = await api.getContents(currentFolderId); 
          startTransition(() => { setItems(folderData); setLoading(false); }); 
          
          if (!api.isGuest()) { 
              api.enrichItemCounts(folderData).then(enrichedItems => { 
                  if (currentFolderId === (folderId || projectId || '')) startTransition(() => setItems(enrichedItems)); 
              }); 
          } 
      } catch(e) { 
          setLoading(false); 
      } 
      
      try { 
          const cachedProjects = api.getCachedProjects(); 
          let projects = cachedProjects; 
          if (!projects) { projects = await api.getProjects(); } 
          if (projectId && projects) { 
              const p = projects.find(p => p.id === projectId); 
              setCurrentProject(p || null); 
              
              // NEW: Fetch FULL project details immediately (Sub-collection logs, BOQ, etc)
              // This fixes the "Missing Data" and "Stale Logs" issue in MasterData
              api.getProjectById(projectId).then(fullProj => {
                  if (fullProj) setCurrentProject(fullProj);
              });

              if (currentFolderId === projectId) setCurrentFolderName(p?.name || 'مجلد المشروع'); 
          } 
      } catch (error) {} 
  };
  
  useEffect(() => { if (currentFolderId) fetchContents(); }, [currentFolderId]);

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
          
          await api.uploadFile(currentFolderId, fileToUpload, (p) => setUploadProgress(p)); 
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
          if (currentFolderId === folderId && isArchiveRoute) {
              navigate('/');
              return;
          }
          if (currentFolderName === ARCHIVE_FOLDER_NAME) {
              navigate('/');
              return;
          }
          if (currentParentId) {
             navigate(`/archive/${currentParentId}`, { state: { folderName: '...' } });
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
  
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => { 
      const files = e.target.files; 
      if (!files || files.length === 0) return; 
      
      const pdfFile = Array.from(files).find(f => f.type === 'application/pdf'); 
      if (pdfFile) { 
          setPendingPdfFile(pdfFile); 
          setShowPdfModeModal(true); 
          e.target.value = ''; 
          return; 
      } 
      
      // If Geotagging is ON, intercept for comment
      if (useGeotagging) {
          const imageOrVideo = Array.from(files).filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'));
          if (imageOrVideo.length > 0) {
              setPendingUploadFiles(imageOrVideo);
              setCommentText('');
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
          // Pass the comment here AND index i for unique serial numbers in batch
          await performUpload(filesToProcess[i], i === totalFiles - 1, true, comment, i);
          completed++;
          setUploadProgress((completed / totalFiles) * 100);
      }
      
      setPendingUploadFiles([]);
      setPendingVideoFile(null);
  };

  const handlePdfChoice = async (mode: 'file' | 'images') => { setShowPdfModeModal(false); if (!pendingPdfFile) return; if (mode === 'file') { setIsUploading(true); setUploadStatusMsg("جاري رفع ملف PDF..."); await performUpload(pendingPdfFile, true, false, '', 0); } else { setIsUploading(true); setUploadStatusMsg("جاري تحويل PDF إلى صور..."); try { const folderName = pendingPdfFile.name.replace('.pdf', ''); const newFolder = await api.createFolder(currentFolderId, folderName); const images = await imageUtils.convertPdfToImages(pendingPdfFile, (curr, total) => { setUploadStatusMsg(`جاري تحويل صفحة ${curr} من ${total}`); setUploadProgress((curr/total)*50); }); for (let i = 0; i < images.length; i++) { setUploadStatusMsg(`جاري رفع صورة ${i + 1} من ${images.length}`); await api.uploadFile(newFolder.id, images[i], (p) => { setUploadProgress(50 + ((i / images.length) * 50) + (p * 0.5 / images.length)); }); } fetchContents(); } catch (e) { alert("فشل معالجة ملف PDF"); console.error(e); } finally { setIsUploading(false); setUploadStatusMsg(''); } } setPendingPdfFile(null); };
  const handleCreateFolder = async () => { if (!newFolderName.trim()) return; try { await api.createFolder(currentFolderId, newFolderName); setModalMode('none'); setNewFolderName(''); fetchContents(); } catch (e) { alert("فشل إنشاء المجلد"); } };
  const handleItemClick = (item: FileItem) => { if (item.type === ItemType.FOLDER) { navigate(`/project/${projectId}/${item.id}`, { state: { folderName: item.name } }); } else { if (item.mimeType === 'text/html' || item.name.endsWith('.html')) { navigate(`/editor/${projectId}/${item.parentId}?fileId=${item.id}`); } else { setPreviewItem(item); } } };
  
  const handleShare = async (item: FileItem) => {
      if (item.type === ItemType.FOLDER) {
          api.shareSmart(item);
          return;
      }
      
      // Check for large files (> 30MB)
      const isLarge = (item.size || 0) > 30 * 1024 * 1024; // 30MB limit
      
      setShareState({ 
          isOpen: true, 
          item, 
          file: null, 
          status: isLarge ? 'choice' : 'downloading', 
          progress: 0 
      });

      if (!isLarge) {
          downloadForShare(item);
      }
  };

  const downloadForShare = async (item: FileItem) => {
      setShareState(prev => ({ ...prev, status: 'downloading', progress: 0 }));
      try {
          const blob = await api.downloadFileBlob(item.id, (p) => setShareState(prev => ({...prev, progress: p})));
          let mimeType = blob.type;
          if (item.name.toLowerCase().endsWith('.dwg')) {
              mimeType = 'application/octet-stream';
          }
          const file = new File([blob], item.name, { type: mimeType });
          setShareState(prev => ({ ...prev, status: 'ready', file }));
      } catch (e) {
          console.error(e);
          setShareState(prev => ({ ...prev, status: 'error' }));
      }
  };

  const shareLink = () => {
      if (shareState.item) {
          api.shareSmart(shareState.item); // Will default to link share if no file provided
      }
      setShareState(prev => ({ ...prev, isOpen: false }));
  };

  const executeShare = () => { if (shareState.item && shareState.file) { api.shareSmart(shareState.item, shareState.file); setShareState(prev => ({ ...prev, isOpen: false })); } };
  const handleRename = (item: FileItem) => { setSelectedItem(item); setRenameValue(item.name); setModalMode('rename'); };
  const confirmRename = async () => { if (selectedItem && renameValue.trim()) { try { await api.renameItem(selectedItem.id, renameValue); setModalMode('none'); fetchContents(); } catch (e) { alert("فشل إعادة التسمية"); } } };
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
    <Layout title={currentFolderName} showBack={true} onBack={handleBack} actions={<div className="flex items-center gap-2 relative z-50 pointer-events-auto">{!isArchive && (<button onClick={(e) => { e.stopPropagation(); setUseGeotagging(!useGeotagging); }} className={`w-8 h-8 rounded-full flex items-center justify-center shadow-sm border transition relative ${useGeotagging ? 'bg-green-500 text-white border-green-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}> <i className="fa-solid fa-location-dot text-xs"></i> </button>)}<button onClick={(e) => { e.stopPropagation(); setModalMode('createFolder'); }} className="w-8 h-8 rounded-full bg-white text-orange-600 border border-orange-200 flex items-center justify-center shadow-sm hover:bg-orange-50 transition"><i className="fa-solid fa-folder-plus text-xs"></i></button>{!isArchive && (<button onClick={(e) => { e.stopPropagation(); setViewMode(viewMode === 'list' ? 'grid' : 'list'); }} className="w-8 h-8 rounded-full bg-white text-slate-700 border border-slate-200 flex items-center justify-center shadow-sm"><i className={`fa-solid ${viewMode === 'list' ? 'fa-border-all' : 'fa-list'} text-xs`}></i></button>)}</div>}>
      
      {/* ... (Hidden Inputs) ... */}
      <input type="file" multiple ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} accept="image/*,video/*,audio/*,application/pdf,text/plain,text/csv,application/rtf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation" />
      <input type="file" ref={cameraInputRef} onChange={handleFileUpload} accept="image/*" capture="environment" style={{ display: 'none' }} />
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
      {loading ? ( <div className="space-y-2"><SkeletonRow /><SkeletonRow /><SkeletonRow /></div> ) : ( <div key={currentFolderId} className="animate-slide-up min-h-[300px]"> {isArchiveRoot || isArchiveSection ? ( <div className="space-y-4 pb-10"> <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"> {sortedItems.filter(i => i.type === ItemType.FOLDER).map(item => <CategoryCard key={item.id} item={item} onClick={() => handleItemClick(item)} onRename={() => handleRename(item)} onMove={() => handleMove(item)} onDelete={() => handleDeleteItemClick(item.id, item.name)} onShare={() => handleShare(item)} /> )} </div> {sortedItems.filter(i => i.fileCount !== undefined && i.type !== ItemType.FOLDER).map(item => <ArchiveSummaryCard key={item.id} item={item} onClick={() => setSelectedArchiveItem(item)} onDelete={() => handleDeleteItemClick(item.id, item.name)} onRename={() => handleRename(item)} onMove={() => handleMove(item)} onShare={() => handleShare(item)} /> )} </div> ) : ( <div className={viewMode === 'grid' && isMediaFolder ? 'grid grid-cols-3 gap-1 md:gap-2' : (viewMode === 'list' ? 'space-y-2' : 'grid grid-cols-2 md:grid-cols-4 gap-3')}> {sortedItems.map(item => {
          if (viewMode === 'grid' && isMediaFolder && (item.mimeType?.startsWith('image/') || item.mimeType?.startsWith('video/'))) {
              return (
                  <div key={item.id} onClick={() => handleItemClick(item)} className="aspect-square relative group overflow-hidden rounded-lg shadow-sm cursor-pointer bg-slate-100">
                      {item.mimeType?.startsWith('video/') ? (
                          <video 
                              src={`${item.previewUrl || item.thumbnailLink}#t=0.1`} 
                              className="w-full h-full object-cover transition duration-300 group-hover:scale-110" 
                              preload="metadata"
                              muted
                              playsInline
                          />
                      ) : (
                          item.previewUrl || item.thumbnailLink ? (
                              <img src={item.previewUrl || item.thumbnailLink} alt={item.name} className="w-full h-full object-cover transition duration-300 group-hover:scale-110" referrerPolicy="no-referrer" />
                          ) : (
                              <div className="w-full h-full bg-slate-100 flex items-center justify-center text-slate-400">
                                  <i className={`fa-solid ${item.mimeType?.startsWith('video/') ? 'fa-video' : 'fa-image'} text-2xl`}></i>
                              </div>
                          )
                      )}
                      {item.mimeType?.startsWith('video/') && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
                              <i className="fa-solid fa-play text-white text-xl drop-shadow-md"></i>
                          </div>
                      )}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 pointer-events-none">
                          <p className="text-[8px] text-white font-bold truncate">{item.name}</p>
                      </div>
                  </div>
              );
          }
          return viewMode === 'list' ? ( <FileItemRow key={item.id} item={item} onClick={() => handleItemClick(item)} onDelete={() => handleDeleteItemClick(item.id, item.name)} onRename={() => handleRename(item)} onMove={() => handleMove(item)} onShare={() => handleShare(item)} /> ) : ( <FileGridCard key={item.id} item={item} onClick={() => handleItemClick(item)} onDelete={() => handleDeleteItemClick(item.id, item.name)} onRename={() => handleRename(item)} onMove={() => handleMove(item)} onShare={() => handleShare(item)} /> );
      })} </div> )} </div> )}
      
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
            <div className="bg-white w-full max-w-xs rounded-2xl shadow-2xl p-6 text-center animate-scale-in border border-slate-200 relative overflow-hidden"> 
                {shareState.status === 'choice' ? (
                    <>
                        <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-blue-100 shadow-sm relative animate-pulse">
                            <i className="fa-solid fa-file-video text-2xl"></i>
                        </div>
                        <h3 className="font-bold text-slate-800 mb-2 text-base">ملف كبير الحجم</h3>
                        <p className="text-xs text-slate-500 mb-6 px-2 leading-relaxed">
                            هذا الملف حجمه كبير ({Math.round((shareState.item?.size || 0) / 1024 / 1024)} MB).<br/>
                            لضمان سرعة المشاركة، نوصي بإرسال الرابط.
                        </p>
                        <div className="space-y-3">
                            <button onClick={shareLink} className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl shadow-lg hover:bg-blue-700 transition flex items-center justify-center gap-2 active:scale-95">
                                <i className="fa-solid fa-link"></i> مشاركة الرابط (فوري)
                            </button>
                            <button onClick={() => downloadForShare(shareState.item!)} className="w-full bg-slate-100 text-slate-700 font-bold py-3 rounded-xl border border-slate-200 hover:bg-slate-200 transition flex items-center justify-center gap-2 text-xs">
                                <i className="fa-solid fa-download"></i> تحميل ومشاركة الملف
                            </button>
                        </div>
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
                                <i className="fa-solid fa-share-nodes text-2xl animate-pulse"></i> 
                            ) : ( 
                                <i className="fa-solid fa-triangle-exclamation text-red-500 text-2xl"></i> 
                            )} 
                        </div> 
                        <h3 className="font-bold text-slate-800 mb-2 text-base"> 
                            {shareState.status === 'downloading' ? 'جاري تحضير الملف...' : shareState.status === 'ready' ? 'الملف جاهز للمشاركة' : 'فشل التحميل'} 
                        </h3> 
                        {shareState.status === 'ready' && ( <p className="text-xs text-slate-500 mb-6 px-2 truncate"> {shareState.item?.name} </p> )} 
                        {shareState.status === 'ready' ? ( 
                            <button onClick={executeShare} className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl shadow-lg hover:bg-indigo-700 transition flex items-center justify-center gap-2 active:scale-95"> 
                                <i className="fa-solid fa-paper-plane rtl:rotate-180"></i> مشاركة الآن 
                            </button> 
                        ) : shareState.status === 'error' ? ( 
                            <div className="text-xs text-red-500 mb-4 font-bold bg-red-50 p-2 rounded-lg"> تعذر تحميل الملف. يرجى التحقق من الإنترنت. </div> 
                        ) : null} 
                    </>
                )}
                <button onClick={() => setShareState(prev => ({...prev, isOpen: false}))} className="mt-4 text-slate-400 text-xs font-bold hover:text-slate-600 transition"> إغلاق </button> 
            </div> 
        </div> 
      )}

      {/* Modals remain the same */}
      <ConfirmModal isOpen={!!deleteTarget} title="تأكيد الحذف" message={`هل أنت متأكد من رغبتك في حذف "${deleteTarget?.name}"؟ لا يمكن التراجع عن هذا الإجراء.`} onConfirm={confirmDelete} onCancel={() => setDeleteTarget(null)} type="danger" />
      {modalMode === 'createFolder' && ( <div className="fixed inset-0 z-[1200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"> <div className="bg-white w-full max-w-xs rounded-2xl shadow-2xl p-5 animate-scale-in"> <h3 className="font-bold text-slate-800 mb-4 text-center">مجلد جديد</h3> <input type="text" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="اسم المجلد..." className="w-full p-3 border border-slate-200 rounded-xl mb-4 bg-slate-50 outline-none focus:border-blue-500 text-sm font-bold text-center" autoFocus /> <div className="flex gap-2"> <button onClick={handleCreateFolder} className="flex-1 bg-blue-600 text-white py-2 rounded-xl font-bold hover:bg-blue-700 transition">إنشاء</button> <button onClick={() => setModalMode('none')} className="flex-1 bg-slate-100 text-slate-600 py-2 rounded-xl font-bold hover:bg-slate-200 transition">إلغاء</button> </div> </div> </div> )}
      {showPdfModeModal && ( <div className="fixed inset-0 z-[1200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"> <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl p-6 text-center animate-scale-in border border-slate-200"> <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl"> <i className="fa-solid fa-file-pdf"></i> </div> <h3 className="text-lg font-bold text-slate-800 mb-2">طريقة رفع ملف PDF</h3> <p className="text-xs text-slate-500 mb-6">كيف ترغب في حفظ هذا الملف في المجلد؟</p> <div className="flex flex-col gap-3"> <button onClick={() => handlePdfChoice('file')} className="w-full bg-slate-50 border border-slate-200 hover:bg-slate-100 p-4 rounded-xl flex items-center gap-4 transition group"> <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm text-red-500 border border-slate-100"> <i className="fa-solid fa-file-pdf text-xl"></i> </div> <div className="text-right flex-1"> <h4 className="font-bold text-slate-800 text-sm">ملف مستند (PDF)</h4> <p className="text-[10px] text-slate-400">حفظ كملف واحد للقراءة والطباعة</p> </div> <i className="fa-solid fa-chevron-left text-slate-300 group-hover:text-blue-500 transition"></i> </button> <button onClick={() => handlePdfChoice('images')} className="w-full bg-slate-50 border border-slate-200 hover:bg-slate-100 p-4 rounded-xl flex items-center gap-4 transition group"> <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm text-purple-500 border border-slate-100"> <i className="fa-solid fa-images text-xl"></i> </div> <div className="text-right flex-1"> <h4 className="font-bold text-slate-800 text-sm">ألبوم صور (مجلد)</h4> <p className="text-[10px] text-slate-400">تحويل كل صفحة لصورة وحفظها في مجلد</p> </div> <i className="fa-solid fa-chevron-left text-slate-300 group-hover:text-blue-500 transition"></i> </button> </div> <button onClick={() => { setShowPdfModeModal(false); setPendingPdfFile(null); }} className="mt-6 text-slate-400 text-xs font-bold hover:text-red-500 transition">إلغاء</button> </div> </div> )}
      {modalMode === 'rename' && ( <div className="fixed inset-0 z-[1200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"> <div className="bg-white w-full max-w-xs rounded-2xl shadow-2xl p-5 animate-scale-in"> <h3 className="font-bold text-slate-800 mb-4 text-center">إعادة تسمية</h3> <input type="text" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} className="w-full p-3 border border-slate-200 rounded-xl mb-4 bg-slate-50 outline-none focus:border-blue-500 text-sm font-bold text-center" autoFocus /> <div className="flex gap-2"> <button onClick={confirmRename} className="flex-1 bg-blue-600 text-white py-2 rounded-xl font-bold hover:bg-blue-700 transition">حفظ</button> <button onClick={() => setModalMode('none')} className="flex-1 bg-slate-100 text-slate-600 py-2 rounded-xl font-bold hover:bg-slate-200 transition">إلغاء</button> </div> </div> </div> )}
      {modalMode === 'move' && ( <div className="fixed inset-0 z-[1200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"> <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl flex flex-col max-h-[80vh] animate-scale-in border border-slate-200 overflow-hidden"> <div className="p-4 bg-slate-100 border-b border-slate-200 flex justify-between items-center shrink-0"> <div> <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2"><i className="fa-solid fa-arrow-right-to-bracket text-orange-500"></i> نقل "{selectedItem?.name}" إلى...</h3> </div> <button onClick={() => setModalMode('none')} className="w-8 h-8 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-500 transition"><i className="fa-solid fa-times"></i></button> </div> <div className="px-3 py-2 bg-white border-b border-slate-100 flex items-center gap-1 overflow-x-auto text-xs whitespace-nowrap hide-scrollbar"> {(moveBreadcrumbs.length > 1 || (moveTargetId !== projectId)) && ( <button onClick={handleMoveBack} className="w-6 h-6 flex items-center justify-center bg-slate-100 rounded-full hover:bg-slate-200 mr-1 shrink-0"> <i className="fa-solid fa-arrow-right text-[10px] text-slate-600 rtl:rotate-180"></i> </button> )} {moveBreadcrumbs.map((crumb, idx) => ( <div key={crumb.id} className="flex items-center"> {idx > 0 && <span className="text-slate-300 mx-1">/</span>} <span className={`font-bold ${idx === moveBreadcrumbs.length - 1 ? 'text-orange-600' : 'text-slate-500'}`}>{crumb.name}</span> </div> ))} </div> <div className="flex-1 overflow-y-auto p-2 bg-slate-50 min-h-[200px]"> {loadingMove ? ( <div className="text-center py-10"><div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div><p className="text-xs text-slate-400">جاري التحميل...</p></div> ) : moveFolderItems.length === 0 ? ( <div className="text-center py-10 text-slate-400"><i className="fa-solid fa-folder-open text-3xl mb-2 opacity-30"></i><p className="text-xs font-bold">لا توجد مجلدات فرعية</p></div> ) : ( <div className="space-y-1"> {moveFolderItems.map(item => ( <div key={item.id} onClick={() => handleMoveNavigate(item)} className="flex items-center gap-3 p-3 rounded-xl cursor-pointer border bg-white border-slate-100 hover:bg-yellow-50 transition group"> <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-yellow-100 text-yellow-600"><i className="fa-solid fa-folder text-sm"></i></div> <div className="flex-1 min-w-0"><h4 className="text-xs font-bold text-slate-700 truncate group-hover:text-blue-700">{item.name}</h4></div> <i className="fa-solid fa-chevron-left text-slate-300 text-xs group-hover:text-blue-400"></i> </div> ))} </div> )} </div> <div className="p-3 bg-white border-t border-slate-200 shrink-0 flex gap-2"> <button onClick={confirmMove} className="flex-1 bg-orange-600 text-white py-3 rounded-xl font-bold hover:bg-orange-700 transition shadow-lg flex items-center justify-center gap-2 text-xs"> <i className="fa-solid fa-check"></i> نقل إلى هنا </button> <button onClick={() => setModalMode('none')} className="bg-slate-100 text-slate-600 px-6 py-3 rounded-xl font-bold hover:bg-slate-200 transition text-xs"> إلغاء </button> </div> </div> </div> )}
      {showMediaChoice && ( <div className="fixed inset-0 z-[1200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"> <div className="bg-white w-full max-w-xs rounded-2xl shadow-2xl p-6 text-center animate-scale-in"> <h3 className="text-slate-800 font-bold mb-4">التصوير الهندسي</h3> <div className="grid grid-cols-2 gap-3"> <button onClick={() => { setShowMediaChoice(false); triggerFileInput(cameraInputRef); }} className="bg-indigo-50 text-indigo-700 p-4 rounded-2xl flex flex-col items-center gap-2 font-bold text-xs"> <i className="fa-solid fa-camera text-xl"></i> صورة </button> <button onClick={() => { setShowMediaChoice(false); setShowVideoRecorder(true); }} className="bg-purple-50 text-purple-700 p-4 rounded-2xl flex flex-col items-center gap-2 font-bold text-xs"> <i className="fa-solid fa-video text-xl"></i> فيديو </button> </div> <button onClick={() => setShowMediaChoice(false)} className="mt-4 text-slate-400 font-bold">إلغاء</button> </div> </div> )}
      {showVideoRecorder && ( <div className="fixed inset-0 z-[1300] bg-black flex flex-col"> <div className="relative flex-1 bg-black overflow-hidden flex items-center justify-center"> <video ref={videoPreviewRef} className="absolute inset-0 w-full h-full object-cover" autoPlay playsInline muted></video> <canvas ref={canvasRef} className="hidden"></canvas> <div className="absolute top-4 left-4 right-4 flex justify-between items-start z-10"> <div className="bg-black/50 text-white px-3 py-1 rounded-full text-xs font-bold border border-white/20"> {isVideoRecording ? <span className="text-red-500 animate-pulse">● REC {Math.floor(videoTimer/60)}:{(videoTimer%60).toString().padStart(2,'0')}</span> : 'جاهز'} </div> <button onClick={() => setVideoQuality(videoQuality === 'hd' ? 'sd' : 'hd')} className="bg-black/40 text-white px-3 py-1 rounded-full text-[10px] font-bold border border-white/20"> {videoQuality === 'hd' ? 'HD 720p' : 'SD 480p'} </button> </div> </div> <div className="bg-slate-900 p-6 flex justify-between items-center text-white shrink-0 safe-bottom"> <button onClick={() => setShowVideoRecorder(false)} className="font-bold">إلغاء</button> <button onClick={isVideoRecording ? stopRecordingVideo : startRecordingVideo} className={`w-16 h-16 rounded-full border-4 flex items-center justify-center transition ${isVideoRecording ? 'border-red-500 scale-110' : 'border-white bg-red-600'}`}> {isVideoRecording ? <div className="w-6 h-6 bg-red-500 rounded-sm"></div> : <div className="w-16 h-16 rounded-full bg-red-600"></div>} </button> <div className="w-10"></div> </div> </div> )}
      
      {/* Comment Modal for Geotagging */}
      {commentModalOpen && (
          <div className="fixed inset-0 z-[1400] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
              <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl p-6 text-center animate-scale-in border border-slate-200">
                  <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl border border-blue-200">
                      <i className="fa-regular fa-comment-dots"></i>
                  </div>
                  <h3 className="font-bold text-slate-800 text-lg mb-2">إضافة تعليق</h3>
                  <p className="text-xs text-slate-500 mb-4">يمكنك إضافة تعليق يظهر في شريط علوي على الصورة/الفيديو.</p>
                  
                  <textarea 
                      value={commentText} 
                      onChange={(e) => setCommentText(e.target.value)} 
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mb-4 text-sm outline-none focus:border-blue-500 transition min-h-[80px] resize-none font-bold" 
                      placeholder="اكتب التعليق هنا..." 
                      autoFocus
                  />
                  
                  <div className="flex gap-3">
                      <button onClick={() => processPendingUploads(commentText)} className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition shadow-lg text-xs flex items-center justify-center gap-2">
                          <i className="fa-solid fa-pen-nib"></i> إدراج التعليق
                      </button>
                      <button onClick={() => processPendingUploads('')} className="bg-slate-100 text-slate-600 px-6 py-3 rounded-xl font-bold hover:bg-slate-200 transition text-xs">
                          بدون تعليق
                      </button>
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
          onOpenAI={() => setShowAI(true)}
      />
      
      {selectedArchiveItem && <ArchiveFullViewer item={selectedArchiveItem} onClose={() => setSelectedArchiveItem(null)} onEdit={(c) => navigate(`/editor/${projectId}/${currentFolderId}`, {state:{initialContent:c}})} />}
      {previewItem && ( <FileViewer item={previewItem} siblings={previewItem.mimeType?.startsWith('image/') ? items.filter(i => i.mimeType?.startsWith('image/')) : []} onClose={() => setPreviewItem(null)} /> )}
      {showAI && <ProjectAI projectId={projectId || ''} folderId={currentFolderId} onClose={() => setShowAI(false)} />}
    </Layout>
  );
}
