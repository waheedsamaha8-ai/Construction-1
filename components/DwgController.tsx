
import React, { useRef, useState } from 'react';
import { api } from '../services/api';

interface DwgControllerProps {
    currentFolderId: string;
    onUploadStart: () => void;
    onUploadProgress: (progress: number, status: string) => void;
    onUploadComplete: () => void;
}

export const DwgController: React.FC<DwgControllerProps> = ({ 
    currentFolderId, 
    onUploadStart, 
    onUploadProgress, 
    onUploadComplete 
}) => {
    const inputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        const file = files[0];
        
        const lowerName = file.name.toLowerCase();
        // Check for DWG or DXF extension
        if (!lowerName.endsWith('.dwg') && !lowerName.endsWith('.dxf')) {
            alert("هذا الزر مخصص لملفات الأوتوكاد (.dwg أو .dxf)");
            return;
        }

        onUploadStart();
        try {
            const cadMime = lowerName.endsWith('.dxf') ? 'application/dxf' : 'application/acad';
            const cadBlob = file.slice(0, file.size, cadMime); 
            const cadFile = new File([cadBlob], file.name, { type: cadMime });

            await api.uploadFile(currentFolderId, cadFile, (p) => {
                onUploadProgress(p, `جاري رفع المخطط: ${file.name}`);
            });
            onUploadComplete();
        } catch (error) {
            console.error(error);
            alert("فشل رفع ملف الأوتوكاد");
            onUploadComplete(); // Close loading state even on error
        } finally {
            if (inputRef.current) inputRef.current.value = '';
        }
    };

    return (
        <>
            <input 
                type="file" 
                ref={inputRef}
                onChange={handleFileSelect}
                // Comprehensive DWG & DXF MIME types + extensions
                accept=".dwg,.dxf,application/acad,application/x-acad,application/autocad_dwg,image/vnd.dwg,drawing/dwg,application/dwg,application/x-dwg,application/x-autocad,application/dxf,image/vnd.dxf,drawing/dxf" 
                className="hidden"
            />
            {/* Floating Action Button for DWG/DXF - Positioned bottom-left to avoid conflict with other buttons */}
            <div className="fixed bottom-20 left-4 z-[100] animate-slide-up no-print">
                <button 
                    onClick={() => inputRef.current?.click()}
                    className="w-14 h-14 bg-[#c41e3a] text-white rounded-2xl shadow-2xl flex items-center justify-center border-2 border-white/20 hover:scale-110 transition-transform active:scale-95 group relative"
                >
                    <div className="absolute inset-0 bg-gradient-to-tr from-black/20 to-transparent rounded-2xl"></div>
                    <div className="flex flex-col items-center relative z-10">
                        <span className="text-[8px] font-black tracking-wider mb-[-2px]">DWG/DXF</span>
                        <i className="fa-solid fa-cloud-arrow-up text-xl"></i>
                    </div>
                    
                    {/* Tooltip */}
                    <div className="absolute left-full ml-3 bg-slate-900 text-white text-xs px-3 py-1.5 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none font-bold shadow-lg">
                        رفع مخطط أوتوكاد (DWG / DXF)
                    </div>
                </button>
            </div>
        </>
    );
};

// --- Helper Function to Open DWG/DXF in External App (FastView / AutoCAD Mobile) ---
export const openDwgInExternalApp = async (
    fileId: string,
    fileName: string,
    cachedBlob?: Blob | null,
    useMobileChooser = false
) => {
    const safeName =
        fileName.toLowerCase().endsWith('.dwg') || fileName.toLowerCase().endsWith('.dxf')
            ? fileName
            : `${fileName}.dwg`;
    const isDxf = safeName.toLowerCase().endsWith('.dxf');

    let blob = cachedBlob || null;
    if (!blob || blob.size === 0) {
        blob = await api.downloadFileBlob(fileId);
    }

    // On mobile (Android / iOS), Web Share Level 2 with a File opens the system app chooser (including DWG FastView / AutoCAD Mobile)
    if (useMobileChooser && typeof navigator !== 'undefined' && navigator.share) {
        try {
            const shareFile = new File([blob], safeName, {
                type: 'application/octet-stream',
            });
            if (!navigator.canShare || navigator.canShare({ files: [shareFile] })) {
                await navigator.share({
                    files: [shareFile],
                    title: safeName,
                    text: `فتح المخطط الهندسي: ${safeName}`,
                });
                return;
            }
        } catch (err: any) {
            if (err?.name === 'AbortError') return;
        }
    }

    const cadBlob = new Blob([blob], {
        type: isDxf ? 'application/dxf' : 'application/acad',
    });
    const url = URL.createObjectURL(cadBlob);

    const a = document.createElement('a');
    a.href = url;
    a.download = safeName;
    a.target = '_self';

    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
        if (document.body.contains(a)) {
            document.body.removeChild(a);
        }
        URL.revokeObjectURL(url);
    }, 2500);
};
