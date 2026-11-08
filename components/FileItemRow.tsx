
import React, { useState, useRef, useEffect, memo } from 'react';
import { FileItem, ItemType } from '../types';

interface FileItemRowProps {
  item: FileItem;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
  onRename?: (e: React.MouseEvent) => void;
  onMove?: (e: React.MouseEvent) => void;
  onShare?: (e: React.MouseEvent) => void; // New prop
  onAnalyze?: (e: React.MouseEvent) => void; // New prop for AI analysis
}

const FileItemRow: React.FC<FileItemRowProps> = ({ item, onClick, onDelete, onRename, onMove, onShare, onAnalyze }) => {
  const [showMenu, setShowMenu] = useState(false);
  const [menuPos, setMenuPos] = useState<{v: 'top'|'bottom', h: 'left'|'right'}>({v: 'bottom', h: 'right'});
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  
  const isFolder = item.type === ItemType.FOLDER;

  // Handle outside click to close menu
  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (menuRef.current && !menuRef.current.contains(event.target as Node) && 
              buttonRef.current && !buttonRef.current.contains(event.target as Node)) {
              setShowMenu(false);
          }
      };
      if (showMenu) {
          document.addEventListener('mousedown', handleClickOutside);
      }
      return () => {
          document.removeEventListener('mousedown', handleClickOutside);
      };
  }, [showMenu]);

  const toggleMenu = (e: React.MouseEvent) => {
      e.stopPropagation();
      
      if (!showMenu && buttonRef.current) {
          const rect = buttonRef.current.getBoundingClientRect();
          const spaceBelow = window.innerHeight - rect.bottom;
          const spaceLeft = rect.left;
          
          // Vertical Check (Standard 220px menu height)
          const v = spaceBelow < 220 ? 'top' : 'bottom';
          
          // Horizontal Check (Prevent left overflow in RTL)
          // If button is very close to left edge (< 200px), align 'left' so menu grows to the right
          const h = spaceLeft < 200 ? 'left' : 'right';
          
          setMenuPos({v, h});
      }
      
      setShowMenu(!showMenu);
  };

  const getIconConfig = () => {
    if (isFolder) return { icon: 'fa-folder', color: 'text-yellow-500', bg: 'bg-yellow-50' };
    
    const mime = (item.mimeType || '').toLowerCase();
    const name = item.name.toLowerCase();

    // AutoCAD Special Icon
    if (name.endsWith('.dwg') || mime.includes('acad') || mime.includes('dwg')) {
        return { icon: 'fa-compass-drafting', color: 'text-[#c41e3a]', bg: 'bg-red-50 border border-red-100' };
    }

    // Images & Videos
    if (item.previewUrl && mime.startsWith('image/')) return { type: 'image', url: item.previewUrl };
    if ((item.previewUrl || item.thumbnailLink) && (mime.startsWith('video/') || name.endsWith('.mp4') || name.endsWith('.webm') || name.endsWith('.mov'))) {
        return { type: 'video', url: item.previewUrl || item.thumbnailLink };
    }
    if (mime.startsWith('image/')) return { icon: 'fa-file-image', color: 'text-purple-600', bg: 'bg-purple-50' };

    // Documents
    if (mime.includes('pdf')) return { icon: 'fa-file-pdf', color: 'text-red-500', bg: 'bg-red-50' };
    if (mime.includes('word') || name.endsWith('.doc') || name.endsWith('.docx')) return { icon: 'fa-file-word', color: 'text-blue-600', bg: 'bg-blue-50' };
    if (mime.includes('excel') || mime.includes('sheet') || mime.includes('csv') || name.endsWith('.xls')) return { icon: 'fa-file-excel', color: 'text-green-600', bg: 'bg-green-50' };
    if (mime.includes('powerpoint') || mime.includes('presentation') || name.endsWith('.ppt') || name.endsWith('.pptx')) return { icon: 'fa-file-powerpoint', color: 'text-orange-600', bg: 'bg-orange-50' };
    if (mime.includes('text') || name.endsWith('.txt')) return { icon: 'fa-file-lines', color: 'text-slate-500', bg: 'bg-slate-100' };
    if (name.endsWith('.html')) return { icon: 'fa-file-code', color: 'text-orange-500', bg: 'bg-slate-50' };

    // Media
    if (mime.startsWith('video/') || name.endsWith('.mp4')) return { icon: 'fa-file-video', color: 'text-rose-500', bg: 'bg-rose-50' };
    if (mime.startsWith('audio/') || name.endsWith('.mp3') || name.endsWith('.wav')) return { icon: 'fa-file-audio', color: 'text-cyan-600', bg: 'bg-cyan-50' };

    // Archives
    if (mime.includes('zip') || mime.includes('compressed') || mime.includes('rar')) return { icon: 'fa-file-zipper', color: 'text-slate-600', bg: 'bg-slate-200' };
    
    // Default
    return { icon: 'fa-file', color: 'text-slate-400', bg: 'bg-slate-50' };
  };

  const config = getIconConfig();

  // Determine origin for scale animation
  const originClass = `origin-${menuPos.v === 'top' ? 'bottom' : 'top'}-${menuPos.h}`;

  return (
    <div 
      onClick={onClick}
      className={`group bg-white p-3 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 hover:shadow-md hover:border-blue-200 transition-all cursor-pointer mb-2 relative overflow-visible ${showMenu ? 'z-50' : 'z-10'}`}
    >
      <div className={`w-12 h-12 flex items-center justify-center rounded-xl shrink-0 overflow-hidden relative ${config.type !== 'image' && config.type !== 'video' ? config.bg : 'bg-slate-50'}`}>
        {config.type === 'image' ? (
             <img src={config.url} alt="" className="w-full h-full object-cover" />
        ) : config.type === 'video' ? (
             <>
                <video src={`${config.url}#t=0.5`} className="w-full h-full object-cover" preload="metadata" muted playsInline />
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center pointer-events-none">
                    <i className="fa-solid fa-play text-white text-[10px] drop-shadow-md"></i>
                </div>
             </>
        ) : (
            // @ts-ignore
             <i className={`fa-solid ${config.icon} ${config.color} text-2xl`}></i>
        )}
      </div>
      
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-bold text-slate-800 truncate group-hover:text-blue-700 transition-colors">{item.name}</h4>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
            {/* Project Name Badge */}
            {item.projectName && (
                <span className="text-[10px] text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded font-bold flex items-center gap-1">
                    <i className="fa-solid fa-building-columns"></i> {item.projectName}
                </span>
            )}

            <span className="text-[10px] text-slate-400 font-mono bg-slate-50 px-1.5 py-0.5 rounded">
                {new Date(item.createdTime).toLocaleDateString('ar-EG')}
            </span>
            
            {/* Folder Counters */}
            {isFolder && (
                <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded flex items-center gap-1" title="عدد الملفات">
                        <i className="fa-solid fa-file text-slate-400 text-[9px]"></i> {item.fileCount || 0}
                    </span>
                    <span className="text-[10px] text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded flex items-center gap-1" title="عدد المجلدات الفرعية">
                        <i className="fa-solid fa-folder text-slate-400 text-[9px]"></i> {item.folderCount || 0}
                    </span>
                </div>
            )}
        </div>
      </div>

      <div className="relative">
          <button 
            ref={buttonRef}
            onClick={toggleMenu}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 transition relative z-20"
          >
            <i className="fa-solid fa-ellipsis-vertical"></i>
          </button>
          
          {showMenu && (
             <div 
                ref={menuRef}
                onClick={(e) => e.stopPropagation()} 
                className={`absolute w-48 bg-white rounded-xl shadow-2xl border border-slate-200 py-1 overflow-hidden animate-scale-in ${originClass}
                    ${menuPos.v === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'}
                    ${menuPos.h === 'left' ? 'left-0' : 'right-0'}
                `}
                style={{ zIndex: 100 }}
             >
                 {onShare && (
                    <button 
                        onClick={(e) => { e.stopPropagation(); setShowMenu(false); onShare(e); }}
                        className="w-full text-right px-4 py-3 text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 flex items-center gap-3 transition border-b border-slate-50"
                    >
                        <i className="fa-solid fa-share-nodes text-indigo-500 w-4"></i> مشاركة
                    </button>
                 )}
                 {onAnalyze && (
                    <button 
                        onClick={(e) => { e.stopPropagation(); setShowMenu(false); onAnalyze(e); }}
                        className="w-full text-right px-4 py-3 text-xs font-bold text-indigo-700 hover:bg-indigo-50 flex items-center gap-3 transition border-b border-slate-50"
                    >
                        <i className="fa-solid fa-wand-magic-sparkles text-indigo-500 w-4"></i> تحويل لخطاب
                    </button>
                 )}
                 {onRename && (
                    <button 
                        onClick={(e) => { e.stopPropagation(); setShowMenu(false); onRename(e); }}
                        className="w-full text-right px-4 py-3 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-blue-700 flex items-center gap-3 transition border-b border-slate-50"
                    >
                        <i className="fa-solid fa-pen-to-square text-blue-500 w-4"></i> تعديل
                    </button>
                 )}
                 {onMove && (
                    <button 
                        onClick={(e) => { e.stopPropagation(); setShowMenu(false); onMove(e); }}
                        className="w-full text-right px-4 py-3 text-xs font-bold text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-3 transition border-b border-slate-50"
                    >
                        <i className="fa-solid fa-arrow-right-to-bracket text-orange-500 w-4"></i> نقل
                    </button>
                 )}
                 <button 
                    onClick={(e) => { e.stopPropagation(); setShowMenu(false); onDelete(e); }}
                    className="w-full text-right px-4 py-3 text-xs font-bold text-red-600 hover:bg-red-50 flex items-center gap-3 transition"
                 >
                    <i className="fa-solid fa-trash-can w-4"></i> حذف
                 </button>
             </div>
          )}
      </div>
    </div>
  );
};

export default memo(FileItemRow);
