
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
        
        // Strict check for DWG extension
        if (!file.name.toLowerCase().endsWith('.dwg')) {
            alert("هذا الزر مخصص فقط لملفات الأوتوكاد (.dwg)");
            return;
        }

        onUploadStart();
        try {
            // Upload with specific MIME type for CAD to ensure proper handling later
            // We ensure strict MIME type manually if browser fails detection
            const dwgBlob = file.slice(0, file.size, 'application/acad'); 
            const dwgFile = new File([dwgBlob], file.name, { type: 'application/acad' });

            await api.uploadFile(currentFolderId, dwgFile, (p) => {
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
                // Comprehensive DWG MIME types + extension to ensure file picker filters correctly on all devices
                accept=".dwg,application/acad,application/x-acad,application/autocad_dwg,image/vnd.dwg,drawing/dwg,application/dwg,application/x-dwg,application/x-autocad" 
                className="hidden"
            />
            {/* Floating Action Button for DWG - Positioned bottom-left to avoid conflict with other buttons */}
            <div className="fixed bottom-20 left-4 z-[100] animate-slide-up no-print">
                <button 
                    onClick={() => inputRef.current?.click()}
                    className="w-14 h-14 bg-[#c41e3a] text-white rounded-2xl shadow-2xl flex items-center justify-center border-2 border-white/20 hover:scale-110 transition-transform active:scale-95 group relative"
                >
                    <div className="absolute inset-0 bg-gradient-to-tr from-black/20 to-transparent rounded-2xl"></div>
                    <div className="flex flex-col items-center relative z-10">
                        <span className="text-[9px] font-black tracking-widest mb-[-2px]">DWG</span>
                        <i className="fa-solid fa-cloud-arrow-up text-xl"></i>
                    </div>
                    
                    {/* Tooltip */}
                    <div className="absolute left-full ml-3 bg-slate-900 text-white text-xs px-3 py-1.5 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none font-bold shadow-lg">
                        رفع ملف أوتوكاد
                    </div>
                </button>
            </div>
        </>
    );
};

// --- Helper Function to Open DWG in External App (FastView) ---
export const openDwgInExternalApp = async (fileId: string, fileName: string) => {
    // 1. Trigger loading UI (handled by caller usually, but we assume file is ready)
    try {
        // 2. Download the file as a Blob
        const blob = await api.downloadFileBlob(fileId);
        
        // 3. Create a strict blob with AutoCAD MIME type to force OS recognition
        // Common MIME types for DWG: application/acad, application/x-acad, image/vnd.dwg
        const dwgBlob = new Blob([blob], { type: 'application/acad' });
        
        // 4. Create Object URL
        const url = URL.createObjectURL(dwgBlob);
        
        // 5. Create a temporary anchor to trigger "Download/Open" intent
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName.endsWith('.dwg') ? fileName : `${fileName}.dwg`;
        a.target = '_self'; // Try to open in same context to trigger app intent
        
        document.body.appendChild(a);
        a.click();
        
        // Cleanup
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 1000);

    } catch (error) {
        console.error("Failed to open DWG", error);
        alert("فشل تحميل ملف الأوتوكاد. تأكد من الاتصال بالإنترنت.");
    }
};
