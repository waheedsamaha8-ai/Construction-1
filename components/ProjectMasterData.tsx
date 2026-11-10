
// @ts-nocheck
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, HIDDEN_LOGS_FOLDER } from '../services/api';
import { aiHelper } from '../services/aiHelper';
import { imageUtils } from '../services/imageUtils';
import { printService } from '../services/printService';
import ConfirmModal from './ConfirmModal'; 
import ProjectReportModal from './ProjectReportModal';
import { ReportGenerator } from '../services/reportGenerator';
import { Project, ProjectLog, ProjectPayment, BOQItem, PaymentItem, FileItem, ItemType, EngineeringReportItem, RFI, Submittal, Correspondence, Checklist, NCR } from '../types';
import html2canvas from 'html2canvas';

interface ProjectMasterDataProps {
    projectId: string;
    isOpen: boolean;
    onClose: () => void;
    onReportGenerated?: () => void;
    initialProjectData?: Project | null; // NEW PROP FOR INSTANT LOAD
    onOpenAI: () => void;
}

export default function ProjectMasterData({ projectId, isOpen, onClose, onReportGenerated, initialProjectData, onOpenAI }: ProjectMasterDataProps) {
    const navigate = useNavigate();
    
    // --- State Management ---
    const [activeTab, setActiveTab] = useState<'logs' | 'payments' | 'boq' | 'soil'>('logs');
    const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    
    // Report Modal State
    const [showReportModal, setShowReportModal] = useState(false);
    const [isGeneratingReport, setIsGeneratingReport] = useState(false);
    
    // LOADING STATE: Initialize based on whether we have data. 
    // If we have initialData, we show it instantly (loading=false). 
    // If not, we show spinner (loading=true).
    const [loading, setLoading] = useState(!initialProjectData);
    
    // REFRESH STATE: Tracks background syncing even if we showed initial data
    const [isRefreshing, setIsRefreshing] = useState(false);

    // --- LAZY LOAD STATE ---
    const [visibleLogsCount, setVisibleLogsCount] = useState(10); // Start small for instant open

    // CRITICAL FIX: Ref to track if we are currently saving locally.
    const isSavingRef = useRef(false);

    // Helper to sort logs descending (Date DESC -> Creation Time DESC)
    const sortLogs = (logs: ProjectLog[]) => {
        if (!logs) return [];
        return [...logs].sort((a, b) => {
            // 1. Sort by Date (Newest Day First)
            const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
            if (dateDiff !== 0) return dateDiff;
            
            // 2. If same day, Sort by ID timestamp (Newest Entry First)
            // Assuming ID format is `log_${timestamp}`
            const timeA = parseInt(a.id.split('_')[1] || '0');
            const timeB = parseInt(b.id.split('_')[1] || '0');
            return timeB - timeA;
        });
    };

    // Data State
    const [masterData, setMasterData] = useState<{ 
        fullDescription: string; 
        logs: ProjectLog[]; 
        payments: ProjectPayment[]; 
        boqItems: BOQItem[]; 
        engineeringReports: EngineeringReportItem[]; // NEW ARRAY
        soilReport: string; // DEPRECATED: Keep for backward compatibility view
        newLog: string; 
        logDate: string; 
        newPaymentCumulative: string; // CHANGED to Cumulative Input
        newPaymentNote: string; 
        newInvoiceNumber: string; // NEW
        // NEW: DCS & QHSE Data
        rfis: RFI[];
        submittals: Submittal[];
        correspondence: Correspondence[];
        checklists: Checklist[];
        ncrs: NCR[];
    }>({ 
        fullDescription: initialProjectData?.fullDescription || '', 
        logs: sortLogs(initialProjectData?.executionLogs || []), // Sort initially
        payments: initialProjectData?.payments || [], 
        boqItems: initialProjectData?.boqItems || [], 
        engineeringReports: initialProjectData?.engineeringReports || [],
        soilReport: initialProjectData?.soilReportAnalysis || '', 
        newLog: '', 
        logDate: new Date().toISOString().split('T')[0], 
        newPaymentCumulative: '', 
        newPaymentNote: '',
        newInvoiceNumber: '',
        // Initialize new arrays
        rfis: initialProjectData?.rfis || [],
        submittals: initialProjectData?.submittals || [],
        correspondence: initialProjectData?.correspondence || [],
        checklists: initialProjectData?.checklists || [],
        ncrs: initialProjectData?.ncrs || []
    });

    // --- Report Generation ---
    const handleGenerateReport = async (startDate: string, endDate: string, reportType: string, title: string) => {
        setIsGeneratingReport(true);
        
        try {
            // 1. Fetch full project logs to filter
            const fullProject = await api.getProjectById(projectId);
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

            // 3. AI Analysis
            const aiSummaryHtml = await aiHelper.generateCustomProjectReport(
                fullProject || initialProjectData, 
                filteredLogs, 
                title, 
                startDate, 
                endDate
            );

            // 4. Assemble the Full Report
            const finalReportHtml = ReportGenerator.buildPhotoReport(
                title,
                aiSummaryHtml,
                filteredLogs,
                fullProject || initialProjectData,
                { start: startDate, end: endDate }
            );

            // 5. Navigate to Editor
            // We need to close the modal first? Or just navigate.
            // Navigation will unmount this component if it's routed, but this is a modal.
            // We should close the modal.
            onClose();
            navigate(`/editor/${projectId}/${projectId}`, { 
                state: { 
                    initialContent: finalReportHtml, 
                    filename: `${title.replace(/ /g, '_')}_${endDate}`,
                    returnToMasterData: true
                } 
            });
            
            setShowReportModal(false);

        } catch (error) {
            console.error(error);
            alert("حدث خطأ أثناء إنشاء التقرير.");
        } finally {
            setIsGeneratingReport(false);
        }
    };

    // --- Effects ---
    const logImageInputRef = useRef<HTMLInputElement>(null);
    const logCameraInputRef = useRef<HTMLInputElement>(null);
    const editLogImageInputRef = useRef<HTMLInputElement>(null);
    const editLogCameraInputRef = useRef<HTMLInputElement>(null);
    
    const paymentFileRef = useRef<HTMLInputElement>(null);
    const paymentCameraRef = useRef<HTMLInputElement>(null);
    
    const boqImageRef = useRef<HTMLInputElement>(null);
    const boqCameraRef = useRef<HTMLInputElement>(null);
    
    const soilReportInputRef = useRef<HTMLInputElement>(null);
    const soilCameraRef = useRef<HTMLInputElement>(null);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);

    // Specific States (Logs)
    const [logImages, setLogImages] = useState<string[]>([]);
    const [selectedFullScreenImage, setSelectedFullScreenImage] = useState<string | null>(null);
    const [isUploadingImages, setIsUploadingImages] = useState(false); // Used for "Processing" state now
    const [editingLogId, setEditingLogId] = useState<string | null>(null);
    const [tempEditLogContent, setTempEditLogContent] = useState('');
    const [tempEditLogDate, setTempEditLogDate] = useState('');
    const [tempEditLogImages, setTempEditLogImages] = useState<string[]>([]);
    const [logToDeleteId, setLogToDeleteId] = useState<string | null>(null);
    
    // Specific States (Payments)
    const [newPaymentDate, setNewPaymentDate] = useState(new Date().toISOString().split('T')[0]);
    const [newPaymentFile, setNewPaymentFile] = useState<string | null>(null);
    const [newPaymentItems, setNewPaymentItems] = useState<PaymentItem[]>([]);
    const [isAnalyzingPayment, setIsAnalyzingPayment] = useState(false);
    const [editingPayId, setEditingPayId] = useState<string | null>(null);
    const [tempEditPayAmount, setTempEditPayAmount] = useState('');
    const [tempEditPayNote, setTempEditPayNote] = useState('');
    const [tempEditPayDate, setTempEditPayDate] = useState('');
    const [expandedPaymentId, setExpandedPaymentId] = useState<string | null>(null);
    const [paymentToDeleteId, setPaymentToDeleteId] = useState<string | null>(null);
    
    // NEW: Item Editing State inside Payment
    const [editingPaymentItemIndex, setEditingPaymentItemIndex] = useState<{paymentId: string, itemIndex: number} | null>(null);
    const [tempPaymentItem, setTempPaymentItem] = useState<PaymentItem | null>(null);

    // Specific States (BOQ)
    const [isAnalyzingBOQ, setIsAnalyzingBOQ] = useState(false);
    const [editingBoqItem, setEditingBoqItem] = useState<BOQItem | null>(null);
    const [showBoqDeleteConfirm, setShowBoqDeleteConfirm] = useState(false);
    const [collapsedBatches, setCollapsedBatches] = useState<Set<string>>(new Set());
    const [renamingBatchId, setRenamingBatchId] = useState<string | null>(null);
    const [newBatchName, setNewBatchName] = useState('');
    const [showManualBoqModal, setShowManualBoqModal] = useState(false);
    const [manualBoqName, setManualBoqName] = useState('');
    const [batchToDeleteId, setBatchToDeleteId] = useState<string | null>(null); 

    // --- NEW: Document Management State ---
    const [itemToDelete, setItemToDelete] = useState<{ type: 'rfi' | 'submittal' | 'correspondence' | 'checklist' | 'ncr', id: string } | null>(null);
    const [editingItemType, setEditingItemType] = useState<'rfi' | 'submittal' | 'correspondence' | 'checklist' | 'ncr' | null>(null);
    const [editingItemId, setEditingItemId] = useState<string | null>(null);    
    // Specific States (DCS & QHSE)
    const [dcsSubTab, setDcsSubTab] = useState<'rfi' | 'submittal' | 'correspondence'>('rfi');
    const [qhseSubTab, setQhseSubTab] = useState<'checklist' | 'ncr'>('checklist');

    // DCS Form States
    const [showRfiModal, setShowRfiModal] = useState(false);
    const [newRfiData, setNewRfiData] = useState<Partial<RFI>>({ status: 'open', date: new Date().toISOString().split('T')[0] });
    
    const [showSubmittalModal, setShowSubmittalModal] = useState(false);
    const [newSubmittalData, setNewSubmittalData] = useState<Partial<Submittal>>({ status: 'pending', type: 'material', submissionDate: new Date().toISOString().split('T')[0] });

    const [showCorrespondenceModal, setShowCorrespondenceModal] = useState(false);
    const [newCorrespondenceData, setNewCorrespondenceData] = useState<Partial<Correspondence>>({ direction: 'incoming', date: new Date().toISOString().split('T')[0] });

    // QHSE Form States
    const [showChecklistModal, setShowChecklistModal] = useState(false);
    const [newChecklistData, setNewChecklistData] = useState<Partial<Checklist>>({ status: 'pending', date: new Date().toISOString().split('T')[0], items: [] });

    const [showNcrModal, setShowNcrModal] = useState(false);
    const [newNcrData, setNewNcrData] = useState<Partial<NCR>>({ status: 'open', issueDate: new Date().toISOString().split('T')[0] });

    // Specific States (Soil & General)
    const [isAnalyzingSoil, setIsAnalyzingSoil] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [voiceTarget, setVoiceTarget] = useState<'log' | 'payment'>('log');
    const [isProcessingVoice, setIsProcessingVoice] = useState(false);
    
    // Soil Viewer & Editing States
    const [selectedReport, setSelectedReport] = useState<EngineeringReportItem | null>(null);
    const [reportToDeleteId, setReportToDeleteId] = useState<string | null>(null);
    // NEW: Report Renaming States
    const [renamingReportId, setRenamingReportId] = useState<string | null>(null);
    const [tempReportTitle, setTempReportTitle] = useState('');

    // Internal Modals
    const [sourceModal, setSourceModal] = useState<{ type: 'log' | 'editLog' | 'payment' | 'boq' | 'soil'; title: string } | null>(null);

    // App File Picker State
    const [showAppFilePicker, setShowAppFilePicker] = useState(false);
    const [pickerContext, setPickerContext] = useState<'log' | 'editLog' | 'payment' | 'boq' | 'soil' | null>(null);
    const [pickerCurrentFolderId, setPickerCurrentFolderId] = useState<string>(projectId);
    const [pickerBreadcrumbs, setPickerBreadcrumbs] = useState<{id: string, name: string}[]>([{id: projectId, name: 'الرئيسية'}]);
    const [pickerItems, setPickerItems] = useState<FileItem[]>([]);
    const [loadingPickerFiles, setLoadingPickerFiles] = useState(false);
    const [selectedPickerItems, setSelectedPickerItems] = useState<Set<string>>(new Set());
    const [isProcessingPicker, setIsProcessingPicker] = useState(false);

    // --- Effects ---
    useEffect(() => {
        // If initial data changes, reflect it without overwriting non-empty existing data with empty arrays
        if (initialProjectData) {
             setMasterData(prev => ({
                ...prev,
                fullDescription: initialProjectData.fullDescription || prev.fullDescription || '',
                logs: (initialProjectData.executionLogs && initialProjectData.executionLogs.length > 0) 
                    ? sortLogs(initialProjectData.executionLogs) 
                    : prev.logs,
                payments: (initialProjectData.payments && initialProjectData.payments.length > 0) 
                    ? initialProjectData.payments 
                    : prev.payments,
                boqItems: (initialProjectData.boqItems && initialProjectData.boqItems.length > 0) 
                    ? initialProjectData.boqItems 
                    : prev.boqItems,
                engineeringReports: (initialProjectData.engineeringReports && initialProjectData.engineeringReports.length > 0) 
                    ? initialProjectData.engineeringReports 
                    : prev.engineeringReports,
                soilReport: initialProjectData.soilReportAnalysis || prev.soilReport || '',
                rfis: (initialProjectData.rfis && initialProjectData.rfis.length > 0) ? initialProjectData.rfis : prev.rfis,
                submittals: (initialProjectData.submittals && initialProjectData.submittals.length > 0) ? initialProjectData.submittals : prev.submittals,
                correspondence: (initialProjectData.correspondence && initialProjectData.correspondence.length > 0) ? initialProjectData.correspondence : prev.correspondence,
                checklists: (initialProjectData.checklists && initialProjectData.checklists.length > 0) ? initialProjectData.checklists : prev.checklists,
                ncrs: (initialProjectData.ncrs && initialProjectData.ncrs.length > 0) ? initialProjectData.ncrs : prev.ncrs
            }));
            setLoading(false);
        }
    }, [initialProjectData]);

    const applyProjectDataToState = (proj: Project) => {
        setMasterData(prev => {
            const remoteLogs = proj.executionLogs || [];
            const logMap = new Map<string, ProjectLog>();
            (prev.logs || []).forEach(l => { if (l && l.id) logMap.set(l.id, l); });
            remoteLogs.forEach(l => { if (l && l.id) logMap.set(l.id, l); });
            const mergedLogs = sortLogs(Array.from(logMap.values()));

            const remotePayments = proj.payments || [];
            const paymentMap = new Map<string, ProjectPayment>();
            (prev.payments || []).forEach(p => { if (p && p.id) paymentMap.set(p.id, p); });
            remotePayments.forEach(p => { if (p && p.id) paymentMap.set(p.id, p); });
            const mergedPayments = Array.from(paymentMap.values()).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            const remoteBoq = proj.boqItems || [];
            const boqMap = new Map<string, BOQItem>();
            (prev.boqItems || []).forEach(b => { if (b && (b.id || b.itemNumber)) boqMap.set(b.id || b.itemNumber, b); });
            remoteBoq.forEach(b => { if (b && (b.id || b.itemNumber)) boqMap.set(b.id || b.itemNumber, b); });
            const mergedBoq = Array.from(boqMap.values());

            const remoteReports = proj.engineeringReports || [];
            const reportMap = new Map<string, EngineeringReportItem>();
            (prev.engineeringReports || []).forEach(r => { if (r && r.id) reportMap.set(r.id, r); });
            remoteReports.forEach(r => { if (r && r.id) reportMap.set(r.id, r); });
            const mergedReports = Array.from(reportMap.values());

            const mergeArr = <T extends { id: string }>(prevArr: T[] = [], remoteArr: T[] = []): T[] => {
                const map = new Map<string, T>();
                prevArr.forEach(i => { if (i && i.id) map.set(i.id, i); });
                remoteArr.forEach(i => { if (i && i.id) map.set(i.id, i); });
                return Array.from(map.values());
            };

            return {
                ...prev,
                fullDescription: proj.fullDescription || prev.fullDescription || '',
                logs: mergedLogs,
                payments: mergedPayments,
                boqItems: mergedBoq.length > 0 ? mergedBoq : (prev.boqItems || []),
                engineeringReports: mergedReports.length > 0 ? mergedReports : (prev.engineeringReports || []),
                soilReport: proj.soilReportAnalysis || prev.soilReport || '',
                rfis: mergeArr(prev.rfis, proj.rfis),
                submittals: mergeArr(prev.submittals, proj.submittals),
                correspondence: mergeArr(prev.correspondence, proj.correspondence),
                checklists: mergeArr(prev.checklists, proj.checklists),
                ncrs: mergeArr(prev.ncrs, proj.ncrs)
            };
        });
    };

    useEffect(() => {
        if (isOpen && projectId) {
            let isCancelled = false;
            const load = async () => {
                // 1. Instant local load (0ms response)
                try {
                    const localProj = await api.getProjectById(projectId, false);
                    if (localProj && !isCancelled) {
                        applyProjectDataToState(localProj);
                        setLoading(false);
                    }
                } catch(e) {}

                const hasExistingData = Boolean(initialProjectData || masterData.logs.length > 0 || masterData.boqItems.length > 0 || masterData.fullDescription);
                if (hasExistingData) {
                    setIsRefreshing(true);
                    setLoading(false);
                } else {
                    setLoading(true);
                }

                // Safety timer: isRefreshing NEVER hangs
                const refreshSafety = setTimeout(() => {
                    if (!isCancelled) {
                        setIsRefreshing(false);
                        setLoading(false);
                    }
                }, 1200);

                try {
                    const currentProject = await api.getProjectById(projectId, true);
                    if (currentProject && !isCancelled) {
                        applyProjectDataToState(currentProject);
                    }
                } finally {
                    clearTimeout(refreshSafety);
                    if (!isCancelled) {
                        setLoading(false);
                        setIsRefreshing(false);
                    }
                }
            };
            load();

            if (!api.isGuest()) {
                const unsubscribe = api.subscribeToProject(projectId, (updatedProject) => {
                    if (isSavingRef.current) {
                        return;
                    }
                    if (updatedProject) {
                        applyProjectDataToState(updatedProject);
                    }
                });
                return () => {
                    isCancelled = true;
                    unsubscribe();
                };
            }
            return () => { isCancelled = true; };
        }
    }, [isOpen, projectId]);

    const triggerAutoSave = async (newData: any) => {
        if (!projectId) return;
        setAutoSaveStatus('saving');
        isSavingRef.current = true; 
        
        try {
            await api.updateProjectMasterData(projectId, { 
                fullDescription: newData.fullDescription !== undefined ? newData.fullDescription : (masterData.fullDescription || ''), 
                executionLogs: newData.logs || masterData.logs || [],
                logs: newData.logs || masterData.logs || [],
                payments: newData.payments || masterData.payments || [], 
                boqItems: newData.boqItems || masterData.boqItems || [], 
                engineeringReports: newData.engineeringReports || masterData.engineeringReports || [], 
                soilReportAnalysis: newData.soilReport !== undefined ? newData.soilReport : (masterData.soilReport || ''), 
                rfis: newData.rfis || masterData.rfis || [],
                submittals: newData.submittals || masterData.submittals || [],
                correspondence: newData.correspondence || masterData.correspondence || [],
                checklists: newData.checklists || masterData.checklists || [],
                ncrs: newData.ncrs || masterData.ncrs || []
            });
            setAutoSaveStatus('saved');
            setTimeout(() => setAutoSaveStatus('idle'), 1200);
        } catch (e) {
            console.error("Auto save failed", e);
            setAutoSaveStatus('saved'); // Local cache already saved
            setTimeout(() => setAutoSaveStatus('idle'), 1200);
        } finally {
            setTimeout(() => {
                isSavingRef.current = false;
            }, 600);
        }
    };

    // Voice
    const startRecording = async (target: 'log' | 'payment') => { 
        setVoiceTarget(target); 
        try { 
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); 
            const mediaRecorder = new MediaRecorder(stream); 
            mediaRecorderRef.current = mediaRecorder; 
            audioChunksRef.current = []; 
            mediaRecorder.ondataavailable = (event) => { if (event.data.size > 0) audioChunksRef.current.push(event.data); }; 
            mediaRecorder.onstop = async () => { 
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/mp3' }); 
                setIsProcessingVoice(true); 
                try { 
                    const text = await aiHelper.transcribeAudioLog(audioBlob); 
                    if (voiceTarget === 'log') { 
                        setMasterData(prev => ({ ...prev, newLog: text })); 
                    } else { 
                        setMasterData(prev => ({ ...prev, newPaymentNote: text })); 
                    } 
                } catch (error) { 
                    alert("تعذر التحويل"); 
                } finally { 
                    setIsProcessingVoice(false); 
                } 
                stream.getTracks().forEach(track => track.stop()); 
            }; 
            mediaRecorder.start(); 
            setIsRecording(true); 
        } catch (err) { alert("لا يمكن الوصول للميكروفون."); } 
    };
    
    const stopRecording = () => { if (mediaRecorderRef.current && isRecording) { mediaRecorderRef.current.stop(); setIsRecording(false); } };

    // --- LOGS IMAGE HANDLING (STRICT 250KB LIMIT & 4 IMAGES MAX) ---
    const handleLogImageSelect = async (e: React.ChangeEvent<HTMLInputElement>, isEdit: boolean = false) => { 
        const files = Array.from(e.target.files || []); 
        if (files.length === 0) return; 

        // 1. LIMIT: Max 4 images TOTAL per log
        const MAX_IMAGES = 4;
        const currentCount = isEdit ? tempEditLogImages.length : logImages.length;
        
        if (files.length + currentCount > MAX_IMAGES) {
            alert(`تنبيه: لا يمكن إضافة أكثر من 4 صور لليومية الواحدة. لديك حالياً ${currentCount} صور.`);
            // Reset input
            if (e.target) e.target.value = '';
            return;
        }
        
        setIsUploadingImages(true); 
        const processedImages: string[] = [];

        try {
            for (const file of files) {
                // 2. COMPRESS: Resize to max 500px width, 0.3 quality (VERY AGGRESSIVE for Data Storage)
                const compressedFile = await imageUtils.compressImage(file, 0.3, 500);
                
                // 3. CONVERT TO BASE64
                const reader = new FileReader();
                const base64Promise = new Promise<string>((resolve) => {
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(compressedFile);
                });
                const base64String = await base64Promise;
                
                // 4. STRICT SIZE CHECK (Base64 string length)
                // 250KB file ~= 341,333 chars in Base64. We use 350,000 as safe limit.
                // If larger, we REJECT the entire operation to prevent partial data/corruption
                if (base64String.length > 350000) {
                    alert(`خطأ: حجم الصورة "${file.name}" كبير جداً (${Math.round(base64String.length/1024)}KB) حتى بعد الضغط.\nالحد الأقصى 250KB للصورة. يرجى اختيار صورة أصغر.`);
                    setIsUploadingImages(false);
                    if (e.target) e.target.value = '';
                    return; // ABORT EVERYTHING
                }
                
                processedImages.push(base64String);
            }

            // 5. UPDATE STATE (Only if all validations passed)
            if (isEdit) { 
                setTempEditLogImages(prev => {
                    const combined = [...prev, ...processedImages];
                    if (combined.length > 4) {
                        alert("الحد الأقصى 4 صور لكل يومية.");
                        return combined.slice(0, 4);
                    }
                    return combined;
                }); 
            } else { 
                setLogImages(prev => {
                    const combined = [...prev, ...processedImages];
                    if (combined.length > 4) {
                        alert("الحد الأقصى 4 صور لكل يومية.");
                        return combined.slice(0, 4);
                    }
                    return combined;
                }); 
            }

        } catch (error) {
            console.error("Image Processing Failed", error);
            alert("حدث خطأ أثناء معالجة الصور.");
        } finally {
            setIsUploadingImages(false);
            if (logImageInputRef.current) logImageInputRef.current.value = ''; 
            if (logCameraInputRef.current) logCameraInputRef.current.value = ''; 
            if (editLogImageInputRef.current) editLogImageInputRef.current.value = '';
            if (editLogCameraInputRef.current) editLogCameraInputRef.current.value = '';
        }
    };

    const addLog = async () => { 
        if (!masterData.newLog && logImages.length === 0) return; 
        
        // --- OPTIMISTIC UPDATE: UPDATE UI IMMEDIATELY ---
        const newLogItem: ProjectLog = { 
            id: `log_${Date.now()}`, 
            date: masterData.logDate || new Date().toISOString().split('T')[0], 
            content: masterData.newLog,
            images: logImages 
        };

        // 1. Update State First (Instant Feedback)
        // Sort descending so the new log appears at the top if date is today
        const updatedLogs = sortLogs([newLogItem, ...masterData.logs]);
        const newData = { ...masterData, logs: updatedLogs, newLog: '' };
        setMasterData(newData);
        setLogImages([]); 
        
        // 2. Indicate Saving Background
        setAutoSaveStatus('saving');

        try {
            // 3. Send to Server in Background
            await api.addProjectLog(projectId, newLogItem);
            triggerAutoSave(newData);
            setAutoSaveStatus('saved');
        } catch (e) {
            console.error("Failed to add log", e);
            setAutoSaveStatus('idle');
        }
        
        setTimeout(() => setAutoSaveStatus('idle'), 2000);
    };

    const shareLogToWhatsApp = async (log: ProjectLog) => {
        const elementId = `log-card-${log.id}`;
        const element = document.getElementById(elementId);
        if (!element) return;

        try {
            // Add a temporary class to hide action buttons during capture
            const actionsDiv = element.querySelector('.log-actions-container');
            if (actionsDiv) actionsDiv.classList.add('hidden');
            
            // Show the hidden project name header
            const projectNameHeader = element.querySelector('.share-only-project-name');
            if (projectNameHeader) projectNameHeader.classList.remove('hidden');
            
            const canvas = await html2canvas(element, {
                useCORS: true,
                scale: 4, // Ultra High Quality
                backgroundColor: '#ffffff'
            });
            
            if (actionsDiv) actionsDiv.classList.remove('hidden');
            if (projectNameHeader) projectNameHeader.classList.add('hidden');

            canvas.toBlob(async (blob) => {
                if (!blob) return;
                
                const file = new File([blob], `log_${log.date}.png`, { type: 'image/png' });
                
                // Try Web Share API (Mobile native sharing)
                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    try {
                        await navigator.share({
                            title: `يومية مشروع: ${initialProjectData?.name || ''}`,
                            text: `يومية مشروع: ${initialProjectData?.name || ''}\nالتاريخ: ${log.date}`,
                            files: [file]
                        });
                        return;
                    } catch (error) {
                        console.log('Share canceled or failed', error);
                    }
                }
                
                // Fallback: Download the image and open WhatsApp web/app with text
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `log_${log.date}.png`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
                // Alert user
                alert('تم حفظ صورة اليومية في جهازك. سيتم فتح الواتساب الآن لمشاركتها.');
                
                // Optional: Open WhatsApp with text (user still needs to attach the downloaded image)
                const text = `*يومية مشروع: ${initialProjectData?.name || ''}*\n*التاريخ:* ${log.date}\n*البيان:* ${log.content}`;
                window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                
            }, 'image/png');
        } catch (error) {
            console.error("Error generating image:", error);
            alert("حدث خطأ أثناء تجهيز الصورة للمشاركة.");
        }
    };

    const confirmDeleteLog = async () => { 
        if (logToDeleteId) { 
            // FIXED: Immediate Optimistic Delete
            // Create new array WITHOUT the deleted item
            const newLogs = masterData.logs.filter(l => l.id !== logToDeleteId);
            
            // Update State Immediately
            setMasterData(prev => ({ 
                ...prev, 
                logs: newLogs 
            })); 
            
            const idToDelete = logToDeleteId;
            setLogToDeleteId(null); // Clear modal
            
            setAutoSaveStatus('saving');
            isSavingRef.current = true; // Block subscription updates momentarily

            try {
                await api.deleteProjectLog(projectId, idToDelete);
                setAutoSaveStatus('saved');
            } catch(e) {
                console.error("Failed to delete log", e);
                setAutoSaveStatus('idle');
                // Revert if API fails (optional but good practice)
                // For now, we trust eventual consistency or user refresh
            } finally {
                setTimeout(() => {
                    isSavingRef.current = false;
                    setAutoSaveStatus('idle');
                }, 2000);
            }
        } 
    };
    
    const saveEditLog = async (id: string) => { 
        if (!tempEditLogContent.trim() && tempEditLogImages.length === 0) return; 
        
        const updatedLogItem: ProjectLog = {
            id,
            content: tempEditLogContent,
            date: tempEditLogDate,
            images: tempEditLogImages
        };

        // Optimistic Update
        const updatedLogs = sortLogs(masterData.logs.map(l => l.id === id ? updatedLogItem : l)); 
        
        setMasterData(prev => ({ ...prev, logs: updatedLogs })); 
        setEditingLogId(null); 
        
        setAutoSaveStatus('saving');
        try {
            await api.updateProjectLog(projectId, updatedLogItem);
            setAutoSaveStatus('saved');
        } catch(e) {
            setAutoSaveStatus('idle');
        }
        setTimeout(() => setAutoSaveStatus('idle'), 2000);
    };

    // Payment Logic
    const handlePaymentFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsAnalyzingPayment(true);
        try {
            let processedFile = file;
            if (file.type.startsWith('image/')) {
                processedFile = await imageUtils.compressImage(file, 0.2, 500);
            }
            const reader = new FileReader();
            reader.readAsDataURL(processedFile);
            reader.onload = async () => {
                const base64 = reader.result as string;
                setNewPaymentFile(base64);
                
                // Pass BOQ Items for AI Matching
                const extractedData = await aiHelper.parsePaymentDocument(processedFile, masterData.boqItems);
                
                if (extractedData) {
                    if (extractedData.cumulativeAmount) {
                        setMasterData(prev => ({...prev, newPaymentCumulative: extractedData.cumulativeAmount.toString()}));
                    }
                    if (extractedData.date) setNewPaymentDate(extractedData.date);
                    if (extractedData.invoiceNumber) {
                        setMasterData(prev => ({...prev, newInvoiceNumber: extractedData.invoiceNumber}));
                        // Update Note to be JUST the Invoice Number as requested
                        setMasterData(prev => ({...prev, newPaymentNote: `مستخلص رقم ${extractedData.invoiceNumber}`}));
                    }
                    
                    if (extractedData.items && extractedData.items.length > 0) {
                        setNewPaymentItems(extractedData.items);
                    }
                }
                setIsAnalyzingPayment(false);
            };
        } catch (e) { setIsAnalyzingPayment(false); }
        if (paymentFileRef.current) paymentFileRef.current.value = '';
        if (paymentCameraRef.current) paymentCameraRef.current.value = '';
    };

    const addPayment = () => { 
        const rawAmount = String(masterData.newPaymentCumulative || '').trim();
        if (!rawAmount && newPaymentItems.length === 0) {
            alert("يرجى إدخال قيمة المستخلص (إجمالي الأعمال)");
            return;
        }
        
        // Normalize Arabic digits & clean formatting
        const cleanAmountStr = rawAmount.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString()).replace(/,/g, '');
        let cumulativeAmount = parseFloat(cleanAmountStr);
        if (isNaN(cumulativeAmount)) cumulativeAmount = 0;
        
        let previousCumulative = 0;
        if (masterData.payments.length > 0) {
            previousCumulative = Math.max(...masterData.payments.map(p => p.cumulativeAmount || (p as any).amount || 0));
        }
        
        let netAmount = cumulativeAmount > 0 ? (cumulativeAmount - previousCumulative) : 0;
        if (netAmount < 0 && cumulativeAmount > 0) {
            if (!confirm(`قيمة المستخلص التراكمي (${cumulativeAmount.toLocaleString()}) أقل من السابق (${previousCumulative.toLocaleString()}). الصافي سيكون بالسالب (${netAmount.toLocaleString()}). هل أنت متأكد؟`)) return;
        }

        const newPay: ProjectPayment = { 
            id: `pay_${Date.now()}_${Math.floor(Math.random() * 1000)}`, 
            invoiceNumber: masterData.newInvoiceNumber ? String(masterData.newInvoiceNumber).trim() : '',
            date: newPaymentDate || new Date().toISOString().split('T')[0], 
            cumulativeAmount: cumulativeAmount,
            netAmount: netAmount, 
            amount: netAmount,
            note: masterData.newPaymentNote || (masterData.newInvoiceNumber ? `مستخلص رقم ${masterData.newInvoiceNumber}` : 'مستخلص أعمال'),
            items: newPaymentItems.length > 0 ? newPaymentItems : [],
            attachments: newPaymentFile ? [newPaymentFile] : []
        };
        const updatedPayments = [newPay, ...masterData.payments].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const newData = { ...masterData, payments: updatedPayments, newPaymentCumulative: '', newPaymentNote: '', newInvoiceNumber: '' };
        
        setMasterData(newData);
        setNewPaymentFile(null); 
        setNewPaymentItems([]); 
        setNewPaymentDate(new Date().toISOString().split('T')[0]);
        triggerAutoSave(newData);
    };

    const saveEditPayment = (id: string) => { 
        if (!tempEditPayAmount) return; 
        // Update basic info. Note: If amounts are changed here, we should probably check cumulative logic too,
        // but for basic edits we assume user knows what they are doing with Net Amount.
        const newData = { ...masterData, payments: masterData.payments.map(p => p.id === id ? { ...p, netAmount: parseFloat(tempEditPayAmount), amount: parseFloat(tempEditPayAmount), note: tempEditPayNote, date: tempEditPayDate } : p).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()) };
        setMasterData(newData); setEditingPayId(null); triggerAutoSave(newData);
    };

    const confirmDeletePayment = () => { 
        if (paymentToDeleteId) { 
            const newData = { ...masterData, payments: masterData.payments.filter(p => p.id !== paymentToDeleteId) };
            setMasterData(newData); setPaymentToDeleteId(null); triggerAutoSave(newData);
        } 
    };

    // --- ITEM EDITING LOGIC (STRICT MATH) ---
    const handleStartEditItem = (paymentId: string, item: PaymentItem, index: number) => {
        setEditingPaymentItemIndex({ paymentId, itemIndex: index });
        setTempPaymentItem({...item});
    };

    const handleTempItemChange = (field: keyof PaymentItem, value: any) => {
        setTempPaymentItem(prev => {
            if (!prev) return null;
            const updated = { ...prev, [field]: value };
            
            const prevQ = parseFloat(updated.prevQuantity as any) || 0;
            const currQ = parseFloat(updated.currQuantity as any) || 0;
            const price = parseFloat(updated.unitPrice as any) || 0;
            const ratio = parseFloat(updated.completionRatio as any) || 100;
            
            // STRICT MATH: Reverse Calculation if Total is changed
            if (field === 'totalQuantity') {
                const newTotal = parseFloat(value) || 0;
                // Current = Total - Previous
                updated.currQuantity = newTotal - prevQ;
                // Total is set explicitly by input
            } else if (field === 'currQuantity' || field === 'prevQuantity') {
                // Forward Calculation: Total = Prev + Curr
                updated.totalQuantity = prevQ + currQ;
            }
            
            // Recalculate Value: Value = Total Qty * Unit Price * (Ratio/100)
            // Note: Total Quantity is already updated above based on which field changed
            updated.totalValue = (updated.totalQuantity || 0) * price * (ratio / 100);
            
            return updated;
        });
    };

    const saveItemEdit = () => {
        if (!editingPaymentItemIndex || !tempPaymentItem) return;
        
        const { paymentId, itemIndex } = editingPaymentItemIndex;
        
        // 1. Update the items array in the target payment
        const targetPaymentIndex = masterData.payments.findIndex(p => p.id === paymentId);
        if (targetPaymentIndex === -1) return;
        
        const updatedPayments = [...masterData.payments];
        const payment = { ...updatedPayments[targetPaymentIndex] };
        
        // Update item in array
        const newItems = [...(payment.items || [])];
        newItems[itemIndex] = tempPaymentItem;
        payment.items = newItems;
        
        // 2. Recalculate Payment Totals (Cumulative)
        // Cumulative = Sum of all item Total Values
        const newCumulative = newItems.reduce((sum, item) => sum + (item.totalValue || 0), 0);
        payment.cumulativeAmount = newCumulative;
        
        // 3. Recalculate Payment Net
        const newNet = newItems.reduce((sum, item) => {
            const currVal = (item.currQuantity || 0) * (item.unitPrice || 0) * ((item.completionRatio || 100) / 100);
            return sum + currVal;
        }, 0);
        
        payment.netAmount = newNet;
        
        updatedPayments[targetPaymentIndex] = payment;
        
        setMasterData(prev => ({ ...prev, payments: updatedPayments }));
        setEditingPaymentItemIndex(null);
        setTempPaymentItem(null);
        triggerAutoSave({ ...masterData, payments: updatedPayments });
    };

    // --- QUANTITY VALIDATION COLOR HELPER ---
    const getQuantityStatusColor = (totalQty: number, contractQty: number) => {
        if (!contractQty || contractQty === 0) return '';
        const ratio = totalQty / contractQty;
        
        if (ratio > 1.25) return 'bg-red-100 text-red-900 border-red-200'; // Critical (> 125%)
        if (ratio > 1.0) return 'bg-yellow-100 text-yellow-900 border-yellow-200'; // Warning (> 100% to 125%)
        return 'bg-white';
    };

    // BOQ Logic
    const analyzeBoqFile = async (file: File, filename?: string) => { 
        setIsAnalyzingBOQ(true); 
        try { 
            const newItems = await aiHelper.parseBOQ(file); 
            if (newItems && newItems.length > 0) { 
                const batchId = `batch_${Date.now()}`; 
                const batchName = filename ? filename.replace(/\.[^/.]+$/, "") : `مقايسة ${new Date().toLocaleDateString('ar-EG')}`; 
                
                const taggedItems = newItems.map((item, idx) => ({ 
                    ...item, 
                    id: `boq_${Date.now()}_${idx}`, 
                    batchId, 
                    batchName, 
                    executedQuantity: 0,
                    total: (item.quantity || 0) * (item.unitPrice || 0)
                })); 
                
                const newData = { ...masterData, boqItems: [...masterData.boqItems, ...taggedItems] };
                setMasterData(newData); 
                alert(`تم استخراج ${newItems.length} بند بنجاح كحزمة جديدة: ${batchName}`); 
                triggerAutoSave(newData);
            } else { alert("لم يتم العثور على بنود في الملف."); } 
        } catch (e) { alert("فشل تحليل الملف."); } finally { setIsAnalyzingBOQ(false); } 
    };

    const handleBOQAnalysis = async (e: React.ChangeEvent<HTMLInputElement>) => { 
        const file = e.target.files?.[0]; 
        if (!file) return; 
        await analyzeBoqFile(file, file.name); 
        if (boqImageRef.current) boqImageRef.current.value = ''; 
        if (boqCameraRef.current) boqCameraRef.current.value = '';
    };
    
    const handleCreateManualBOQ = () => { 
        setManualBoqName(''); 
        setShowManualBoqModal(true); 
    };

    const confirmCreateManualBOQ = (e: React.FormEvent) => {
        e.preventDefault(); 
        const trimmedName = manualBoqName.trim();
        if (!trimmedName) return;
        const newBatchId = `batch_${Date.now()}`;
        const newItem: BOQItem = { 
            id: `boq_${Date.now()}`, 
            batchId: newBatchId, 
            batchName: trimmedName, 
            itemCode: '1', 
            description: 'بند جديد (اضغط للتعديل)', 
            unit: 'عدد', 
            quantity: 1, 
            unitPrice: 0, 
            total: 0, 
            executedQuantity: 0 
        };
        const newData = { ...masterData, boqItems: [...masterData.boqItems, newItem] };
        setMasterData(newData); 
        setShowManualBoqModal(false); 
        triggerAutoSave(newData);
        setEditingBoqItem(newItem);
    };
    const confirmDeleteBOQItem = () => { if (!editingBoqItem) return; const newData = { ...masterData, boqItems: masterData.boqItems.filter(item => item.id !== editingBoqItem.id) }; setMasterData(newData); setEditingBoqItem(null); setShowBoqDeleteConfirm(false); triggerAutoSave(newData); };
    const saveBOQItemEdit = () => { if (!editingBoqItem) return; const newData = { ...masterData, boqItems: masterData.boqItems.map(item => item.id === editingBoqItem.id ? editingBoqItem : item) }; setMasterData(newData); setEditingBoqItem(null); triggerAutoSave(newData); };
    const addItemBelow = () => { if (!editingBoqItem) return; const currentIndex = masterData.boqItems.findIndex(i => i.id === editingBoqItem.id); if (currentIndex === -1) return; const newItem: BOQItem = { id: `boq_${Date.now()}_${Math.floor(Math.random() * 1000)}`, itemCode: '', description: '', unit: '', quantity: 0, unitPrice: 0, total: 0, executedQuantity: 0, batchId: editingBoqItem.batchId, batchName: editingBoqItem.batchName }; const newItems = [...masterData.boqItems]; newItems.splice(currentIndex + 1, 0, newItem); const newData = { ...masterData, boqItems: newItems }; setMasterData(newData); setEditingBoqItem(null); triggerAutoSave(newData); };
    
    const handleDeleteBatchClick = (batchId: string) => { setBatchToDeleteId(batchId); };
    const confirmDeleteBatch = () => { if (!batchToDeleteId) return; const newData = { ...masterData, boqItems: masterData.boqItems.filter(item => item.batchId !== batchToDeleteId) }; setMasterData(newData); setBatchToDeleteId(null); triggerAutoSave(newData); };
    const saveBatchRename = (batchId: string) => { if (!newBatchName.trim()) return; const newData = { ...masterData, boqItems: masterData.boqItems.map(item => item.batchId === batchId ? { ...item, batchName: newBatchName } : item) }; setMasterData(newData); setRenamingBatchId(null); triggerAutoSave(newData); };
    
    const handleEditBatchAsLetter = (batchItems: BOQItem[], batchName: string) => {
        const tableRows = batchItems.map(item => `
            <tr>
                <td>${item.itemCode || '-'}</td>
                <td>${item.description}</td>
                <td>${item.unit}</td>
                <td>${item.quantity}</td>
                <td>${item.unitPrice.toLocaleString()}</td>
                <td>${(item.quantity * item.unitPrice).toLocaleString()}</td>
            </tr>
        `).join('');
        
        const totalValue = batchItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
        
        const bodyHtml = `
            <h2>${batchName}</h2>
            <table>
                <thead>
                    <tr>
                        <th>بند</th><th>البيان</th><th>الوحدة</th><th>الكمية</th><th>الفئة</th><th>الإجمالي</th>
                    </tr>
                </thead>
                <tbody>${tableRows}</tbody>
                <tfoot>
                    <tr>
                        <td colspan="5" style="font-weight: bold; text-align: left;">الإجمالي العام</td>
                        <td style="font-weight: bold;">${totalValue.toLocaleString()} ج.م</td>
                    </tr>
                </tfoot>
            </table>
        `;
        
        const fullReport = ReportGenerator.buildReport(batchName, bodyHtml);
        navigate(`/editor/${projectId}/${projectId}`, { state: { initialContent: fullReport, returnToMasterData: true } });
    };

    const [isGeneratingDoc, setIsGeneratingDoc] = useState(false);

    const handleGenerateAIDoc = async (type: 'rfi' | 'submittal' | 'correspondence' | 'checklist' | 'ncr') => {
        let data = {};
        let title = '';
        let cardId = '';
        
        // Prepare context
        const projectContext = `
            Project Name: ${initialProjectData?.name || 'N/A'}
            Contractor: ${initialProjectData?.contractor || 'N/A'}
            Location: ${initialProjectData?.location || 'N/A'}
            Description: ${initialProjectData?.fullDescription || 'N/A'}
        `;

        setIsGeneratingDoc(true);
        try {
            const html = await aiHelper.generateEngineeringDocument(type, data, projectContext);
            
            // Create the card in masterData
            let newItem: any;
            const timestamp = Date.now();
            cardId = `${type}_${timestamp}`;

            if (type === 'rfi') {
                newItem = {
                    id: cardId,
                    refNumber: newRfiData.refNumber || `RFI-${timestamp}`,
                    subject: newRfiData.subject || 'طلب استفسار فني',
                    date: newRfiData.date || new Date().toISOString().split('T')[0],
                    location: newRfiData.location || '',
                    status: 'Pending',
                    htmlContent: html
                };
                const newData = { ...masterData, rfis: [newItem, ...masterData.rfis] };
                setMasterData(newData);
                triggerAutoSave(newData);
            } else if (type === 'submittal') {
                newItem = {
                    id: cardId,
                    refNumber: newSubmittalData.refNumber || `SUB-${timestamp}`,
                    type: newSubmittalData.type || 'Material',
                    description: newSubmittalData.description || 'تقديم فني',
                    submissionDate: newSubmittalData.submissionDate || new Date().toISOString().split('T')[0],
                    status: 'Pending',
                    htmlContent: html
                };
                const newData = { ...masterData, submittals: [newItem, ...masterData.submittals] };
                setMasterData(newData);
                triggerAutoSave(newData);
            } else if (type === 'correspondence') {
                newItem = {
                    id: cardId,
                    refNumber: newCorrespondenceData.refNumber || `CORR-${timestamp}`,
                    direction: newCorrespondenceData.direction || 'Outgoing',
                    subject: newCorrespondenceData.subject || 'مراسلة رسمية',
                    entity: newCorrespondenceData.entity || '',
                    date: newCorrespondenceData.date || new Date().toISOString().split('T')[0],
                    htmlContent: html
                };
                const newData = { ...masterData, correspondence: [newItem, ...masterData.correspondence] };
                setMasterData(newData);
                triggerAutoSave(newData);
            } else if (type === 'checklist') {
                newItem = {
                    id: cardId,
                    refNumber: newChecklistData.refNumber || `CHK-${timestamp}`,
                    activityName: newChecklistData.activityName || 'قائمة فحص نشاط',
                    date: newChecklistData.date || new Date().toISOString().split('T')[0],
                    location: newChecklistData.location || '',
                    status: 'Open',
                    htmlContent: html
                };
                const newData = { ...masterData, checklists: [newItem, ...masterData.checklists] };
                setMasterData(newData);
                triggerAutoSave(newData);
            } else if (type === 'ncr') {
                newItem = {
                    id: cardId,
                    ncrNumber: newNcrData.ncrNumber || `NCR-${timestamp}`,
                    description: newNcrData.description || 'تقرير عدم مطابقة',
                    issueDate: newNcrData.issueDate || new Date().toISOString().split('T')[0],
                    status: 'Open',
                    htmlContent: html
                };
                const newData = { ...masterData, ncrs: [newItem, ...masterData.ncrs] };
                setMasterData(newData);
                triggerAutoSave(newData);
            }

            // Navigate to LetterEditor with the generated content and card reference
            navigate(`/editor/${projectId}/${projectId}`, { 
                state: { 
                    initialContent: html,
                    filename: newItem.refNumber || newItem.ncrNumber || cardId,
                    cardId: cardId,
                    cardType: type,
                    returnToMasterData: true
                } 
            });
        } catch (e) {
            alert("فشل توليد المستند");
        } finally {
            setIsGeneratingDoc(false);
            // Close modals
            setShowRfiModal(false);
            setShowSubmittalModal(false);
            setShowCorrespondenceModal(false);
            setShowChecklistModal(false);
            setShowNcrModal(false);
        }
    };

    // --- DCS & QHSE HANDLERS ---
    const handleEditItem = (item: any, type: 'rfi' | 'submittal' | 'correspondence' | 'checklist' | 'ncr') => {
        setEditingItemType(type);
        setEditingItemId(item.id);
        
        if (type === 'rfi') {
            setNewRfiData({
                refNumber: item.refNumber,
                subject: item.subject,
                date: item.date,
                location: item.location,
                status: item.status,
                question: item.question,
                attachments: item.attachments
            });
            setShowRfiModal(true);
        } else if (type === 'submittal') {
            setNewSubmittalData({
                refNumber: item.refNumber,
                description: item.description,
                type: item.type,
                submissionDate: item.submissionDate,
                status: item.status,
                attachments: item.attachments
            });
            setShowSubmittalModal(true);
        } else if (type === 'correspondence') {
            setNewCorrespondenceData({
                refNumber: item.refNumber,
                direction: item.direction,
                subject: item.subject,
                entity: item.entity,
                date: item.date,
                content: item.content,
                attachments: item.attachments
            });
            setShowCorrespondenceModal(true);
        } else if (type === 'checklist') {
            setNewChecklistData({
                refNumber: item.refNumber,
                activityName: item.activityName,
                date: item.date,
                location: item.location,
                inspectorName: item.inspectorName,
                status: item.status,
                items: item.items
            });
            setShowChecklistModal(true);
        } else if (type === 'ncr') {
            setNewNcrData({
                ncrNumber: item.ncrNumber,
                description: item.description,
                location: item.location,
                issueDate: item.issueDate,
                status: item.status,
                rootCause: item.rootCause,
                correctiveAction: item.correctiveAction,
                photos: item.photos
            });
            setShowNcrModal(true);
        }
    };

    const handleDeleteItem = (id: string, type: 'rfi' | 'submittal' | 'correspondence' | 'checklist' | 'ncr') => {
        setItemToDelete({ type, id });
    };

    const confirmDeleteItem = () => {
        if (!itemToDelete) return;
        
        let newData = { ...masterData };
        if (itemToDelete.type === 'rfi') {
            newData.rfis = newData.rfis.filter(i => i.id !== itemToDelete.id);
        } else if (itemToDelete.type === 'submittal') {
            newData.submittals = newData.submittals.filter(i => i.id !== itemToDelete.id);
        } else if (itemToDelete.type === 'correspondence') {
            newData.correspondence = newData.correspondence.filter(i => i.id !== itemToDelete.id);
        } else if (itemToDelete.type === 'checklist') {
            newData.checklists = newData.checklists.filter(i => i.id !== itemToDelete.id);
        } else if (itemToDelete.type === 'ncr') {
            newData.ncrs = newData.ncrs.filter(i => i.id !== itemToDelete.id);
        }
        
        setMasterData(newData);
        triggerAutoSave(newData);
        setItemToDelete(null);
    };

    const handleAddRFI = () => {
        if (!newRfiData.subject || !newRfiData.refNumber) return;
        
        let newData = { ...masterData };
        
        if (editingItemId && editingItemType === 'rfi') {
             newData.rfis = newData.rfis.map(item => 
                item.id === editingItemId ? {
                    ...item,
                    refNumber: newRfiData.refNumber!,
                    subject: newRfiData.subject!,
                    date: newRfiData.date || item.date,
                    location: newRfiData.location || '',
                    status: newRfiData.status || 'open',
                    question: newRfiData.question || '',
                    attachments: newRfiData.attachments || []
                } : item
            );
        } else {
            const newItem: RFI = {
                id: `rfi_${Date.now()}`,
                refNumber: newRfiData.refNumber,
                subject: newRfiData.subject,
                date: newRfiData.date || new Date().toISOString().split('T')[0],
                location: newRfiData.location || '',
                status: newRfiData.status || 'open',
                question: newRfiData.question || '',
                attachments: newRfiData.attachments || []
            };
            newData.rfis = [newItem, ...masterData.rfis];
        }

        setMasterData(newData);
        triggerAutoSave(newData);
        setShowRfiModal(false);
        setNewRfiData({ status: 'open', date: new Date().toISOString().split('T')[0] });
        setEditingItemId(null);
        setEditingItemType(null);
    };

    const handleAddSubmittal = () => {
        if (!newSubmittalData.description || !newSubmittalData.refNumber) return;
        
        let newData = { ...masterData };
        
        if (editingItemId && editingItemType === 'submittal') {
             newData.submittals = newData.submittals.map(item => 
                item.id === editingItemId ? {
                    ...item,
                    refNumber: newSubmittalData.refNumber!,
                    description: newSubmittalData.description!,
                    type: newSubmittalData.type || 'material',
                    submissionDate: newSubmittalData.submissionDate || item.submissionDate,
                    status: newSubmittalData.status || 'pending',
                    attachments: newSubmittalData.attachments || []
                } : item
            );
        } else {
            const newItem: Submittal = {
                id: `sub_${Date.now()}`,
                refNumber: newSubmittalData.refNumber,
                description: newSubmittalData.description,
                type: newSubmittalData.type || 'material',
                submissionDate: newSubmittalData.submissionDate || new Date().toISOString().split('T')[0],
                status: newSubmittalData.status || 'pending',
                attachments: newSubmittalData.attachments || []
            };
            newData.submittals = [newItem, ...masterData.submittals];
        }

        setMasterData(newData);
        triggerAutoSave(newData);
        setShowSubmittalModal(false);
        setNewSubmittalData({ status: 'pending', type: 'material', submissionDate: new Date().toISOString().split('T')[0] });
        setEditingItemId(null);
        setEditingItemType(null);
    };

    const handleAddCorrespondence = () => {
        if (!newCorrespondenceData.subject || !newCorrespondenceData.refNumber) return;
        
        let newData = { ...masterData };
        
        if (editingItemId && editingItemType === 'correspondence') {
             newData.correspondence = newData.correspondence.map(item => 
                item.id === editingItemId ? {
                    ...item,
                    refNumber: newCorrespondenceData.refNumber!,
                    direction: newCorrespondenceData.direction || 'incoming',
                    subject: newCorrespondenceData.subject!,
                    entity: newCorrespondenceData.entity || '',
                    date: newCorrespondenceData.date || item.date,
                    content: newCorrespondenceData.content || '',
                    attachments: newCorrespondenceData.attachments || []
                } : item
            );
        } else {
            const newItem: Correspondence = {
                id: `corr_${Date.now()}`,
                refNumber: newCorrespondenceData.refNumber,
                direction: newCorrespondenceData.direction || 'incoming',
                subject: newCorrespondenceData.subject,
                entity: newCorrespondenceData.entity || '',
                date: newCorrespondenceData.date || new Date().toISOString().split('T')[0],
                content: newCorrespondenceData.content || '',
                attachments: newCorrespondenceData.attachments || []
            };
            newData.correspondence = [newItem, ...masterData.correspondence];
        }

        setMasterData(newData);
        triggerAutoSave(newData);
        setShowCorrespondenceModal(false);
        setNewCorrespondenceData({ direction: 'incoming', date: new Date().toISOString().split('T')[0] });
        setEditingItemId(null);
        setEditingItemType(null);
    };

    const handleAddChecklist = () => {
        if (!newChecklistData.activityName || !newChecklistData.refNumber) return;
        
        let newData = { ...masterData };
        
        if (editingItemId && editingItemType === 'checklist') {
             newData.checklists = newData.checklists.map(item => 
                item.id === editingItemId ? {
                    ...item,
                    refNumber: newChecklistData.refNumber!,
                    activityName: newChecklistData.activityName!,
                    date: newChecklistData.date || item.date,
                    location: newChecklistData.location || '',
                    inspectorName: newChecklistData.inspectorName || '',
                    status: newChecklistData.status || 'pending',
                    items: newChecklistData.items || []
                } : item
            );
        } else {
            const newItem: Checklist = {
                id: `chk_${Date.now()}`,
                refNumber: newChecklistData.refNumber,
                activityName: newChecklistData.activityName,
                date: newChecklistData.date || new Date().toISOString().split('T')[0],
                location: newChecklistData.location || '',
                inspectorName: newChecklistData.inspectorName || '',
                status: newChecklistData.status || 'pending',
                items: newChecklistData.items || []
            };
            newData.checklists = [newItem, ...masterData.checklists];
        }

        setMasterData(newData);
        triggerAutoSave(newData);
        setShowChecklistModal(false);
        setNewChecklistData({ status: 'pending', date: new Date().toISOString().split('T')[0], items: [] });
        setEditingItemId(null);
        setEditingItemType(null);
    };

    const handleAddNCR = () => {
        if (!newNcrData.description || !newNcrData.ncrNumber) return;
        
        let newData = { ...masterData };
        
        if (editingItemId && editingItemType === 'ncr') {
             newData.ncrs = newData.ncrs.map(item => 
                item.id === editingItemId ? {
                    ...item,
                    ncrNumber: newNcrData.ncrNumber!,
                    description: newNcrData.description!,
                    location: newNcrData.location || '',
                    issueDate: newNcrData.issueDate || item.issueDate,
                    status: newNcrData.status || 'open',
                    rootCause: newNcrData.rootCause || '',
                    correctiveAction: newNcrData.correctiveAction || '',
                    photos: newNcrData.photos || []
                } : item
            );
        } else {
            const newItem: NCR = {
                id: `ncr_${Date.now()}`,
                ncrNumber: newNcrData.ncrNumber,
                description: newNcrData.description,
                location: newNcrData.location || '',
                issueDate: newNcrData.issueDate || new Date().toISOString().split('T')[0],
                status: newNcrData.status || 'open',
                rootCause: newNcrData.rootCause || '',
                correctiveAction: newNcrData.correctiveAction || '',
                photos: newNcrData.photos || []
            };
            newData.ncrs = [newItem, ...masterData.ncrs];
        }

        setMasterData(newData);
        triggerAutoSave(newData);
        setShowNcrModal(false);
        setNewNcrData({ status: 'open', issueDate: new Date().toISOString().split('T')[0] });
        setEditingItemId(null);
        setEditingItemType(null);
    };

    // --- SOIL & REPORTS LOGIC (UPDATED MULTI-CARD SYSTEM) ---
    const analyzeSoilFile = async (file: Blob) => { 
        setIsAnalyzingSoil(true); 
        try { 
            const analysisHtml = await aiHelper.analyzeSoilReport(file); 
            const newReport: EngineeringReportItem = {
                id: `rep_${Date.now()}`,
                type: 'soil',
                title: `تقرير جسات - ${new Date().toLocaleDateString('ar-EG')}`,
                content: analysisHtml,
                date: new Date().toISOString()
            };
            
            // Add to array instead of overwrite
            const newData = { 
                ...masterData, 
                engineeringReports: [newReport, ...(masterData.engineeringReports || [])] 
            };
            
            setMasterData(newData); 
            triggerAutoSave(newData);
            alert("تم تحليل التقرير وإضافته للكروت.");
        } catch (e) { 
            alert("فشل تحليل تقرير التربة."); 
        } finally { 
            setIsAnalyzingSoil(false); 
        } 
    };

    const handleSoilAnalysis = async (e: React.ChangeEvent<HTMLInputElement>) => { 
        const file = e.target.files?.[0]; 
        if (!file) return; 
        await analyzeSoilFile(file); 
        if (soilReportInputRef.current) soilReportInputRef.current.value = '';
        if (soilCameraRef.current) soilCameraRef.current.value = '';
    };
    
    // View Full Screen
    const openReportFullScreen = (report: EngineeringReportItem) => {
        // Prevent opening if currently renaming
        if (renamingReportId === report.id) return;
        setSelectedReport(report);
    };

    // Edit as Letter (Navigate to Editor)
    const handleEditReport = (report: EngineeringReportItem) => {
        navigate(`/editor/${projectId}/${projectId}`, { 
            state: { 
                initialContent: report.content,
                filename: report.title,
                returnToMasterData: true
            } 
        });
    };

    const handleOpenCardInEditor = (card: any, type: string) => {
        if (!card.htmlContent) {
            alert("لا يوجد محتوى لهذا الكارت. يرجى توليده بالذكاء الاصطناعي أولاً.");
            return;
        }
        navigate(`/editor/${projectId}/${projectId}`, { 
            state: { 
                initialContent: card.htmlContent,
                filename: card.refNumber || card.ncrNumber || card.id,
                cardId: card.id,
                cardType: type,
                returnToMasterData: true
            } 
        });
    };

    // --- NEW: REPORT RENAMING LOGIC ---
    const handleStartRenameReport = (e: React.MouseEvent, report: EngineeringReportItem) => {
        e.stopPropagation();
        setRenamingReportId(report.id);
        setTempReportTitle(report.title);
    };

    const saveReportRename = (e: React.MouseEvent, reportId: string) => {
        e.stopPropagation();
        if (!tempReportTitle.trim()) return;
        const newData = {
            ...masterData,
            engineeringReports: masterData.engineeringReports.map(r => 
                r.id === reportId ? { ...r, title: tempReportTitle } : r
            )
        };
        setMasterData(newData);
        setRenamingReportId(null);
        triggerAutoSave(newData);
    };

    // Delete Report
    const confirmDeleteReport = () => {
        if (!reportToDeleteId) return;
        const newData = {
            ...masterData,
            engineeringReports: masterData.engineeringReports.filter(r => r.id !== reportToDeleteId)
        };
        setMasterData(newData);
        setReportToDeleteId(null);
        triggerAutoSave(newData);
    };

    // Save Logic
    const prepareDataForSave = () => {
        let currentData = { ...masterData };
        // Logic moved to addPayment for immediate update, this is for backup
        return currentData;
    };

    // Picker Logic
    const handleOpenAppPicker = async () => { if (sourceModal) setPickerContext(sourceModal.type); setSourceModal(null); setShowAppFilePicker(true); setPickerCurrentFolderId(projectId); setPickerBreadcrumbs([{id: projectId, name: 'الرئيسية'}]); setSelectedPickerItems(new Set()); await fetchPickerContents(projectId); };
    const fetchPickerContents = async (folderId: string) => { setLoadingPickerFiles(true); try { const contents = await api.getContents(folderId); setPickerItems(contents); } catch(e) { setPickerItems([]); } finally { setLoadingPickerFiles(false); } };
    const navigatePickerFolder = async (folder: FileItem) => { setPickerCurrentFolderId(folder.id); setPickerBreadcrumbs(prev => [...prev, { id: folder.id, name: folder.name }]); setSelectedPickerItems(new Set()); await fetchPickerContents(folder.id); };
    const navigatePickerBack = async () => { if (pickerBreadcrumbs.length <= 1) return; const newBreadcrumbs = [...pickerBreadcrumbs]; newBreadcrumbs.pop(); const parent = newBreadcrumbs[newBreadcrumbs.length - 1]; setPickerBreadcrumbs(newBreadcrumbs); setPickerCurrentFolderId(parent.id); setSelectedPickerItems(new Set()); await fetchPickerContents(parent.id); };
    const togglePickerSelection = (fileId: string) => { const next = new Set(selectedPickerItems); if (next.has(fileId)) next.delete(fileId); else next.add(fileId); setSelectedPickerItems(next); };
    const confirmPickerSelection = async () => { 
        if (selectedPickerItems.size === 0) return; 
        setIsProcessingPicker(true); 
        try { 
            const selectedFileItems = pickerItems.filter(i => selectedPickerItems.has(i.id) && i.type === ItemType.FILE); 
            for (const item of selectedFileItems) { 
                const blob = await api.downloadFileBlob(item.id); 
                const file = new File([blob], item.name, { type: item.mimeType }); 
                if (pickerContext === 'log' || pickerContext === 'editLog') { 
                    if (item.mimeType?.startsWith('image/')) { 
                        // Compress & Base64
                        const compressedFile = await imageUtils.compressImage(file, 0.4, 600); 
                        const reader = new FileReader(); 
                        const base64 = await new Promise<string>((resolve) => { reader.onloadend = () => resolve(reader.result as string); reader.readAsDataURL(compressedFile); }); 
                        if (pickerContext === 'editLog' || editingLogId) { setTempEditLogImages(prev => [...prev, base64]); } 
                        else { setLogImages(prev => [...prev, base64]); } 
                    } 
                } else if (pickerContext === 'payment') { /* ... */ } 
                else if (pickerContext === 'boq') { await analyzeBoqFile(file, file.name); } 
                else if (pickerContext === 'soil') { await analyzeSoilFile(file); } 
            } 
            setShowAppFilePicker(false); 
        } catch(e) { alert("حدث خطأ أثناء تحميل الملفات من التطبيق."); } finally { setIsProcessingPicker(false); } 
    };
    const handleSourceChoice = (source: 'device' | 'camera' | 'app') => { const mode = sourceModal?.type; if (source === 'app') { handleOpenAppPicker(); return; } setSourceModal(null); if (source === 'camera') { if (mode === 'log') logCameraInputRef.current?.click(); else if (mode === 'editLog') editLogCameraInputRef.current?.click(); else if (mode === 'payment') paymentCameraRef.current?.click(); else if (mode === 'boq') boqCameraRef.current?.click(); else if (mode === 'soil') soilCameraRef.current?.click(); } else { if (mode === 'log') logImageInputRef.current?.click(); else if (mode === 'editLog') editLogImageInputRef.current?.click(); else if (mode === 'payment') paymentFileRef.current?.click(); else if (mode === 'boq') boqImageRef.current?.click(); else if (mode === 'soil') soilReportInputRef.current?.click(); } };
    const getCardColor = (index: number) => { 
        const colors = [
            'bg-blue-50 border-blue-400', 
            'bg-emerald-50 border-emerald-400', 
            'bg-amber-50 border-amber-400', 
            'bg-purple-50 border-purple-400', 
            'bg-rose-50 border-rose-400', 
            'bg-cyan-50 border-cyan-400'
        ]; 
        return colors[index % colors.length]; 
    };

    const boqDerivedData = useMemo(() => {
        const groupedItems: { [key: string]: BOQItem[] } = {}; 
        const batchOrder: string[] = []; 
        masterData.boqItems.forEach(item => { const bId = item.batchId || 'default'; if (!groupedItems[bId]) { groupedItems[bId] = []; batchOrder.push(bId); } groupedItems[bId].push(item); }); 
        const grandTotalValue = masterData.boqItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0); 
        const grandExecutedValue = masterData.boqItems.reduce((sum, item) => sum + (item.executedQuantity * item.unitPrice), 0);
        return { groupedItems, batchOrder, grandTotalValue, grandExecutedValue };
    }, [masterData.boqItems]);

    // NEW: Memoize visible logs for Pagination/Lazy Loading
    const visibleLogs = useMemo(() => {
        // Ensure logs are sorted if they came unsorted
        const sorted = sortLogs(masterData.logs);
        return sorted.slice(0, visibleLogsCount);
    }, [masterData.logs, visibleLogsCount]);

    const handleLoadMoreLogs = () => {
        setVisibleLogsCount(prev => prev + 10);
    };

    // Calculated Previous Payment Total for Cumulative Logic
    const previousTotalPayments = useMemo(() => {
        if (masterData.payments.length === 0) return 0;
        // The cumulative of the last payment is the previous total
        // Payments are sorted Descending date in state, so payments[0] is latest
        // But for calculation of NEW payment, we look at the MAX existing cumulative
        return Math.max(...masterData.payments.map(p => p.cumulativeAmount || 0), 0);
    }, [masterData.payments]);

    const renderBoqTable = () => { 
        const { groupedItems, batchOrder, grandTotalValue, grandExecutedValue } = boqDerivedData;
        return ( 
          <> 
          {batchOrder.map(bId => { 
              const groupItems = groupedItems[bId]; 
              const groupName = groupItems[0].batchName || 'بنود إضافية'; 
              const isDefault = bId === 'default'; 
              const isCollapsed = collapsedBatches.has(bId); 
              const isRenaming = renamingBatchId === bId; 
              const batchTotal = groupItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0); 
              const batchExecutedTotal = groupItems.reduce((sum, item) => sum + (item.executedQuantity * item.unitPrice), 0); 
              
              return ( 
              <React.Fragment key={bId}> 
                  <tr className="bg-indigo-50 border-b border-indigo-200"> 
                      <td colSpan={6} className="p-2 text-right"> 
                          <div className="flex justify-between items-center w-full">
                              <div className="flex flex-col items-start gap-1 cursor-pointer flex-1 w-full" onClick={() => { const newSet = new Set(collapsedBatches); if (newSet.has(bId)) newSet.delete(bId); else newSet.add(bId); setCollapsedBatches(newSet); }}> 
                                  <div className="flex items-center gap-2"> 
                                      <i className={`fa-solid ${isCollapsed ? 'fa-chevron-left' : 'fa-chevron-down'} text-indigo-500 w-4 text-center transition-transform`}></i> 
                                      <i className="fa-solid fa-layer-group text-indigo-400"></i> 
                                      {isRenaming ? ( 
                                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}> 
                                              <input type="text" value={newBatchName} onChange={(e) => setNewBatchName(e.target.value)} className="text-xs p-1 rounded border border-indigo-300 outline-none" autoFocus /> 
                                              <button onClick={() => saveBatchRename(bId)} className="bg-green-500 text-white rounded px-2 py-1 text-[10px]"><i className="fa-solid fa-check"></i></button> 
                                          </div> 
                                      ) : ( 
                                          <span className="font-bold text-indigo-900 text-sm">{groupName} <span className="text-[10px] text-indigo-400 font-normal">({groupItems.length} بند)</span></span> 
                                      )} 
                                  </div> 
                                  <div className="flex items-center gap-1 mr-6"> 
                                      <div className="text-[9px] bg-white px-2 py-0.5 rounded border border-indigo-100 text-indigo-800 font-bold shadow-sm"> <span className="text-indigo-400 font-normal ml-1">إجمالي:</span> {batchTotal.toLocaleString()} </div> 
                                      <div className="text-[9px] bg-white px-2 py-0.5 rounded border border-green-100 text-green-800 font-bold shadow-sm"> <span className="text-green-500 font-normal ml-1">منفذ:</span> {batchExecutedTotal.toLocaleString()} </div> 
                                  </div>
                              </div> 
                              <div className="flex items-center gap-1.5 pl-2"> 
                                  <button onClick={(e) => {
                                      e.stopPropagation();
                                      const newItem: BOQItem = {
                                          id: `boq_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
                                          itemCode: String(groupItems.length + 1),
                                          description: 'بند جديد (اضغط للتعديل)',
                                          unit: 'عدد',
                                          quantity: 1,
                                          unitPrice: 0,
                                          total: 0,
                                          executedQuantity: 0,
                                          batchId: bId,
                                          batchName: groupName
                                      };
                                      const newData = { ...masterData, boqItems: [...masterData.boqItems, newItem] };
                                      setMasterData(newData);
                                      triggerAutoSave(newData);
                                      setEditingBoqItem(newItem);
                                  }} className="text-emerald-700 text-[10px] bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 px-2 py-1.5 rounded transition flex items-center gap-1 font-bold shadow-sm" title="إضافة بند لهذا الباب">
                                      <i className="fa-solid fa-plus text-[9px]"></i> بند
                                  </button>
                                  <button onClick={(e) => { e.stopPropagation(); handleEditBatchAsLetter(groupItems, groupName); }} className="text-indigo-600 text-[10px] bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 p-1.5 rounded transition flex items-center justify-center font-bold shadow-sm" title="تحرير الخطاب"><i className="fa-solid fa-file-signature"></i></button>
                                  {!isDefault && !isRenaming && ( <button onClick={(e) => { e.stopPropagation(); setRenamingBatchId(bId); setNewBatchName(groupName); }} className="text-blue-600 text-[10px] bg-blue-50 border border-blue-100 hover:bg-blue-100 p-1.5 rounded transition flex items-center justify-center font-bold" title="تعديل الاسم"><i className="fa-solid fa-pen"></i></button> )} 
                                  {!isDefault && ( <button onClick={(e) => { e.stopPropagation(); handleDeleteBatchClick(bId); }} className="text-red-600 text-[10px] bg-red-50 border border-red-100 hover:bg-red-100 p-1.5 rounded transition flex items-center justify-center font-bold" title="حذف"><i className="fa-solid fa-trash"></i></button> )}
                              </div> 
                          </div> 
                      </td> 
                  </tr> 
                  {!isCollapsed && groupItems.map((item) => {
                      const isNote = !item.quantity && !item.unitPrice;
                      return ( 
                      <tr key={item.id} className="hover:bg-blue-50/50 transition border-b border-slate-200"> 
                          <td colSpan={6} className="p-3"> 
                              <div className="flex flex-col gap-2">
                                  <div className="w-full bg-blue-50 border border-blue-100 text-blue-800 rounded-xl p-2.5 font-bold text-lg cursor-pointer hover:bg-blue-100 transition shadow-sm flex justify-between items-center" onClick={() => setEditingBoqItem(item)}>
                                      <div className="font-mono text-blue-900">
                                          رقم البند: {item.itemCode || '-'}
                                      </div>
                                      {!isNote && (
                                          <div className="flex items-center gap-1.5 bg-white px-3 py-1 rounded-lg border border-green-200 shadow-sm text-sm">
                                              <span className="text-green-600 font-bold">المنفذ:</span>
                                              <span className="font-mono font-bold text-green-700 text-base">{isNaN(Number(item.executedQuantity)) ? 0 : item.executedQuantity}</span>
                                          </div>
                                      )}
                                  </div>
                                  <div className="w-full text-base sm:text-lg font-bold text-slate-900 leading-relaxed whitespace-pre-wrap break-words">
                                      {item.description}
                                  </div>
                                  {!isNote && (
                                      <div className="grid grid-cols-4 gap-1.5 sm:gap-2 text-center bg-slate-50 p-2 rounded-xl border border-slate-200 mt-2"> 
                                          <div className="flex flex-col border-l border-slate-200"><span className="text-xs text-slate-500 font-bold">الوحدة</span><span className="text-sm sm:text-base font-bold">{item.unit}</span></div> 
                                          <div className="flex flex-col border-l border-slate-200"><span className="text-xs text-slate-500 font-bold">الكمية</span><span className="text-sm sm:text-base font-bold font-mono">{item.quantity}</span></div> 
                                          <div className="flex flex-col border-l border-slate-200"><span className="text-xs text-slate-500 font-bold">الفئة</span><span className="text-sm sm:text-base font-bold font-mono">{item.unitPrice}</span></div> 
                                          <div className="flex flex-col"><span className="text-xs text-slate-500 font-bold">الإجمالي</span><span className="text-sm sm:text-base font-bold font-mono">{Math.round(item.quantity * item.unitPrice)}</span></div> 
                                      </div> 
                                  )}
                              </div>
                          </td> 
                      </tr> 
                  )})} 
              </React.Fragment> 
              ); 
          })} 
          {masterData.boqItems.length > 0 && ( 
              <tr className="bg-slate-900 !text-white font-bold border-t-4 border-slate-600 shadow-lg relative z-10"> 
                  <td colSpan={6} className="p-3 !text-white">
                      <div className="flex flex-wrap justify-between items-center gap-2">
                          <span className="text-xs sm:text-sm font-bold text-slate-200">الإجمالي العام للمشروع:</span>
                          <div className="flex items-center gap-3">
                              <span className="text-xs sm:text-sm bg-slate-800 px-2.5 py-1 rounded-lg">التعاقدي: <strong className="font-mono text-yellow-400 mr-1">{grandTotalValue.toLocaleString()}</strong></span>
                              <span className="text-xs sm:text-sm bg-slate-800 px-2.5 py-1 rounded-lg">المنفذ: <strong className="font-mono text-green-400 mr-1">{grandExecutedValue.toLocaleString()}</strong></span>
                          </div>
                      </div>
                  </td>
              </tr> 
          )} 
          </> 
        ); 
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/50 z-[1500] flex items-center justify-center backdrop-blur-sm animate-fade-in">
            {/* ... (Main Modal Structure) ... */}
            <div className="bg-white w-full h-full md:w-[98vw] md:h-[95vh] md:rounded-3xl shadow-2xl flex flex-col animate-scale-in overflow-hidden relative">
                
                {/* 
                    LOADING SPINNER OVERLAY
                    This covers the entire modal content area IF 'loading' is true (i.e. we don't have initial data).
                    It prevents the "flash of empty/old content".
                */}
                {loading && (
                    <div className="absolute inset-0 z-[1600] bg-white flex flex-col items-center justify-center animate-fade-in">
                        <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4 shadow-lg"></div>
                        <h3 className="text-slate-800 font-bold text-lg animate-pulse">جاري تحميل سجلات المشروع...</h3>
                        <p className="text-slate-500 text-xs mt-2">يتم مزامنة أحدث البيانات من السحابة</p>
                    </div>
                )}

                {/* Full Screen Image View */}
                {selectedFullScreenImage && (
                    <div 
                        className="fixed inset-0 z-[2000] bg-black/95 flex items-center justify-center p-4 animate-fade-in"
                        onClick={() => setSelectedFullScreenImage(null)}
                    >
                        <button className="absolute top-6 right-6 w-10 h-10 bg-white/10 text-white rounded-full flex items-center justify-center hover:bg-white/20 transition">
                            <i className="fa-solid fa-times text-xl"></i>
                        </button>
                        <img 
                            src={selectedFullScreenImage} 
                            alt="Full Screen" 
                            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl animate-scale-in"
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>
                )}

                {/* Header */}
                <div className="p-3 bg-slate-900 flex justify-between items-center text-white shrink-0 relative z-[1601]">
                    <h3 className="font-bold flex items-center gap-2 text-xs"> <i className="fa-solid fa-clipboard-list text-yellow-400 text-sm"></i> سجل المشروع </h3>
                    <div className="flex items-center gap-3">
                        {/* Background Refresh Indicator (Subtle) */}
                        {isRefreshing && !loading && (
                            <span className="text-[9px] text-blue-300 font-bold animate-pulse flex items-center gap-1">
                                <i className="fa-solid fa-circle-notch fa-spin"></i> جاري التحديث
                            </span>
                        )}
                        
                        {autoSaveStatus !== 'idle' && <span className={`text-[10px] font-bold px-2 py-0.5 rounded transition-all ${autoSaveStatus === 'saving' ? 'text-yellow-300 animate-pulse' : 'text-green-400'}`}>{autoSaveStatus === 'saving' ? 'جاري الحفظ...' : 'تم الحفظ ✔'}</span>}
                        <div className="flex gap-2">
                            <button onClick={() => setShowReportModal(true)} className="w-9 h-9 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-lg hover:bg-rose-700 transition transform active:scale-90" title="إنشاء تقرير ذكي"><i className="fa-solid fa-file-invoice text-sm"></i></button>
                            <button onClick={onOpenAI} className="w-9 h-9 rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white flex items-center justify-center shadow-lg hover:shadow-indigo-500/50 transition transform active:scale-90" title="المركز الاستشاري الموحد"><i className="fa-solid fa-wand-magic-sparkles text-sm"></i></button>
                            <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition transform active:scale-90" title="إغلاق"><i className="fa-solid fa-times text-sm"></i></button>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-200 bg-slate-50 overflow-x-auto hide-scrollbar shrink-0">
                    {['logs', 'payments', 'boq', 'soil'].map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab as any)} className={`flex-1 py-3 text-[10px] font-bold transition whitespace-nowrap px-4 ${activeTab === tab ? 'border-b-2 border-blue-600 text-blue-700 bg-white' : 'text-slate-500 hover:bg-slate-100'}`}>
                            {tab === 'logs' ? 'يوميات' : tab === 'payments' ? 'مستخلصات' : tab === 'boq' ? 'مقايسة' : 'جسات وتقارير'}
                        </button>
                    ))}
                </div>

                {/* Content */}
                {/* REMOVED min-h-0 and added custom-scrollbar and webkit scrolling for better mobile touch */}
                <div className="flex-1 overflow-y-auto p-1 bg-slate-50 relative custom-scrollbar enlarged-tabs" style={{ WebkitOverflowScrolling: 'touch' }}>
                    {/* ... (Hidden Inputs) ... */}
                    <input type="file" ref={logImageInputRef} onChange={(e) => handleLogImageSelect(e, false)} accept="image/*" multiple className="hidden" />
                    <input type="file" ref={logCameraInputRef} onChange={(e) => handleLogImageSelect(e, false)} accept="image/*" capture="environment" className="hidden" />
                    <input type="file" ref={editLogImageInputRef} onChange={(e) => handleLogImageSelect(e, true)} accept="image/*" multiple className="hidden" />
                    <input type="file" ref={editLogCameraInputRef} onChange={(e) => handleLogImageSelect(e, true)} accept="image/*" capture="environment" className="hidden" />
                    <input type="file" ref={paymentFileRef} onChange={handlePaymentFileSelect} accept="image/*,application/pdf" className="hidden" />
                    <input type="file" ref={paymentCameraRef} onChange={handlePaymentFileSelect} accept="image/*" capture="environment" className="hidden" />
                    <input type="file" ref={boqImageRef} onChange={handleBOQAnalysis} accept="image/*,application/pdf" className="hidden" />
                    <input type="file" ref={boqCameraRef} onChange={handleBOQAnalysis} accept="image/*" capture="environment" className="hidden" />
                    <input type="file" ref={soilReportInputRef} onChange={handleSoilAnalysis} accept="image/*,application/pdf" className="hidden" />
                    <input type="file" ref={soilCameraRef} onChange={handleSoilAnalysis} accept="image/*" capture="environment" className="hidden" />

                    {activeTab === 'logs' && (
                        <div className="flex flex-col gap-2 pb-20">
                            {/* ... (Keep Log Tab Content) ... */}
                            <div className="bg-white rounded-xl p-2 border border-blue-100 shadow-sm shrink-0">
                                <div className="flex gap-2 items-center mb-2">
                                    <input type="date" className="bg-white border border-blue-200 text-xs rounded-lg px-2 py-1.5 outline-none text-slate-700 font-bold w-24" value={masterData.logDate} onChange={(e) => setMasterData({...masterData, logDate: e.target.value})} />
                                    <button onClick={isRecording ? stopRecording : () => startRecording('log')} className={`w-8 h-8 rounded-lg flex items-center justify-center transition shadow-sm ${isRecording && voiceTarget === 'log' ? 'bg-red-500 text-white animate-pulse' : 'bg-white border border-blue-200 text-blue-600'}`}><i className={`fa-solid ${isRecording && voiceTarget === 'log' ? 'fa-stop' : 'fa-microphone'} text-xs`}></i></button>
                                    <div className="flex-1"></div>
                                    <button onClick={() => setSourceModal({ type: 'log', title: 'رفع صورة لليومية' })} className="bg-white border border-blue-200 text-blue-700 px-3 h-8 rounded-lg text-[10px] font-bold hover:bg-blue-50 transition flex items-center justify-center shadow-sm gap-1 shrink-0">
                                        <i className="fa-solid fa-camera"></i>
                                    </button>
                                    <button onClick={addLog} disabled={isUploadingImages} className="bg-blue-600 text-white px-3 h-8 rounded-lg text-[10px] font-bold hover:bg-blue-700 transition flex items-center justify-center shadow-sm gap-1 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed">
                                        {isUploadingImages ? <i className="fa-solid fa-circle-notch fa-spin"></i> : <i className="fa-solid fa-plus"></i>} 
                                        <span>إضافة</span>
                                    </button>
                                </div>
                                {isUploadingImages && (
                                    <div className="mb-2 text-xs text-blue-600 font-bold flex items-center gap-2 bg-blue-50 p-2 rounded-lg">
                                        <i className="fa-solid fa-gear fa-spin"></i> جاري ضغط الصور وتجهيزها للحفظ...
                                    </div>
                                )}
                                {logImages.length > 0 && <div className="flex gap-2 overflow-x-auto py-1 mb-2">{logImages.map((img, idx) => <div key={idx} className="relative w-12 h-12 shrink-0"><img src={img} alt="" className="w-full h-full object-cover rounded-lg border border-blue-200" /><button onClick={() => setLogImages(prev => prev.filter((_, i) => i !== idx))} className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center text-[8px]"><i className="fa-solid fa-times"></i></button></div>)}</div>}
                                <textarea className="w-full p-2 text-xs rounded-lg border border-blue-200 outline-none focus:ring-2 focus:ring-blue-500 transition text-slate-900 resize-y min-h-[60px]" placeholder="ماذا تم إنجازه؟" value={masterData.newLog} onChange={(e) => setMasterData({...masterData, newLog: e.target.value})} rows={2} />
                            </div>
                            
                            <div className="space-y-2 pr-1">
                                {visibleLogs.map((log, idx) => (
                                    <div key={log.id} className="relative group">
                                        {editingLogId === log.id ? (
                                            <div className="bg-blue-50 p-2 rounded-xl border-2 border-blue-300 shadow-md">
                                                <input type="date" className="w-full p-2 text-xs bg-white border border-blue-200 rounded-lg mb-2" value={tempEditLogDate} onChange={(e) => setTempEditLogDate(e.target.value)} />
                                                <textarea className="w-full p-2 text-xs bg-white border border-blue-200 rounded-lg mb-2 min-h-[80px]" value={tempEditLogContent} onChange={(e) => setTempEditLogContent(e.target.value)} />
                                                <div className="flex gap-2 flex-wrap mb-2">{tempEditLogImages.map((img, i) => <div key={i} className="relative w-16 h-16"><img src={img} alt="" className="w-full h-full object-cover rounded-lg" /><button onClick={() => setTempEditLogImages(prev => prev.filter((_, idx) => idx !== i))} className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-[10px]"><i className="fa-solid fa-times"></i></button></div>)}</div>
                                                <div className="flex justify-between"><button onClick={() => setSourceModal({ type: 'editLog', title: 'إضافة صورة' })} className="text-[10px] text-blue-600 bg-blue-100 px-2 py-1 rounded">إضافة صورة</button><div className="flex gap-2"><button onClick={() => saveEditLog(log.id)} className="text-xs bg-blue-600 text-white px-3 py-1 rounded">حفظ</button><button onClick={() => setEditingLogId(null)} className="text-xs bg-white border px-3 py-1 rounded">إلغاء</button></div></div>
                                            </div>
                                        ) : (
                                            <div id={`log-card-${log.id}`} className={`p-3 rounded-2xl shadow-sm border-4 hover:shadow-md transition relative flex flex-col gap-2 ${getCardColor(idx)}`}>
                                                {/* Hidden project name for sharing */}
                                                <div className="hidden share-only-project-name flex items-center gap-2 mb-2 pb-3 border-b-2 border-black/10 mt-[-5px]">
                                                    <i className="fa-solid fa-building text-blue-600 text-lg"></i>
                                                    <span className="text-lg font-bold text-slate-800 leading-none mt-[-6px]">مشروع: {initialProjectData?.name || 'بدون اسم'}</span>
                                                </div>
                                                <div className="flex justify-between items-center border-b border-black/5 pb-2">
                                                    <div className="flex items-center gap-2 mt-[-2px]"><div className="w-8 h-8 rounded-full bg-white/50 text-slate-700 flex items-center justify-center shadow-sm"><i className="fa-solid fa-calendar-day text-xs"></i></div><span className="font-bold text-slate-800 text-base font-mono bg-white/50 px-3 h-8 flex items-center justify-center rounded border border-black/5 leading-none pb-1.5">{log.date}</span></div>
                                                    <div className="flex gap-1 log-actions-container">
                                                        <button onClick={() => shareLogToWhatsApp(log)} className="w-7 h-7 rounded-full bg-white/50 text-slate-500 hover:text-green-600 transition flex items-center justify-center" title="مشاركة واتساب"><i className="fa-brands fa-whatsapp text-[12px]"></i></button>
                                                        <button onClick={() => { setEditingLogId(log.id); setTempEditLogContent(log.content); setTempEditLogDate(log.date); setTempEditLogImages(log.images || []); }} className="w-7 h-7 rounded-full bg-white/50 text-slate-500 hover:text-blue-600 transition flex items-center justify-center"><i className="fa-solid fa-pen text-[10px]"></i></button>
                                                        <button onClick={() => setLogToDeleteId(log.id)} className="w-7 h-7 rounded-full bg-white/50 text-slate-500 hover:text-red-600 transition flex items-center justify-center"><i className="fa-solid fa-trash text-[10px]"></i></button>
                                                    </div>
                                                </div>
                                                <p className="text-slate-900 text-lg leading-normal font-bold whitespace-pre-wrap mt-[-4px]">{log.content}</p>
                                                {/* OPTIMIZED IMAGES: Loading Eager for top 2 logs for instant feel */}
                                                {log.images && log.images.length > 0 && (
                                                    <div className={`grid gap-1 mt-1 ${
                                                        log.images.length === 1 ? 'grid-cols-1' : 
                                                        log.images.length === 2 ? 'grid-cols-2' : 
                                                        log.images.length === 3 ? 'grid-cols-3' : 
                                                        'grid-cols-2'
                                                    }`}>
                                                        {log.images.slice(0, 4).map((img, i) => (
                                                            <div 
                                                                key={i} 
                                                                className="rounded-lg overflow-hidden border border-black/10 bg-white cursor-pointer relative"
                                                                style={{ paddingTop: log.images?.length === 1 ? '56.25%' : '100%' }}
                                                                onClick={() => setSelectedFullScreenImage(img)}
                                                            >
                                                                <div 
                                                                    className="absolute inset-0 w-full h-full"
                                                                    style={{
                                                                        backgroundImage: `url(${img})`,
                                                                        backgroundSize: 'cover',
                                                                        backgroundPosition: 'center'
                                                                    }}
                                                                />
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                                
                                {/* Show More Button */}
                                {visibleLogsCount < masterData.logs.length && (
                                    <button 
                                        onClick={handleLoadMoreLogs}
                                        className="w-full py-2 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs hover:bg-slate-200 transition shadow-sm mt-2"
                                    >
                                        عرض المزيد ({masterData.logs.length - visibleLogsCount} سجل متبقي)
                                    </button>
                                )}

                                {masterData.logs.length === 0 && <div className="text-center py-10 text-slate-400 text-xs">لا توجد سجلات.</div>}
                            </div>
                        </div>
                    )}

                    {activeTab === 'payments' && (
                        <div className="flex flex-col gap-2 pb-20">
                            {/* Input Area */}
                            <div className="bg-white rounded-xl p-3 border border-green-100 shadow-sm shrink-0 flex flex-col gap-2">
                                <div className="flex gap-2 items-center">
                                    <input type="date" className="bg-white border border-green-200 text-xs rounded-lg px-2 py-2 outline-none text-slate-700 font-bold w-24" value={newPaymentDate} onChange={(e) => setNewPaymentDate(e.target.value)} />
                                    <input type="text" placeholder="رقم المستخلص" className="w-24 p-2 text-xs rounded-lg border border-green-200 outline-none text-slate-900 font-bold" value={masterData.newInvoiceNumber} onChange={(e) => setMasterData({...masterData, newInvoiceNumber: e.target.value})} />
                                    <button onClick={isRecording ? stopRecording : () => startRecording('payment')} className={`w-8 h-8 rounded-lg flex items-center justify-center transition shadow-sm ${isRecording && voiceTarget === 'payment' ? 'bg-red-500 text-white animate-pulse' : 'bg-white border border-green-200 text-green-600'}`}><i className={`fa-solid ${isRecording && voiceTarget === 'payment' ? 'fa-stop' : 'fa-microphone'} text-xs`}></i></button>
                                    <button onClick={() => setSourceModal({ type: 'payment', title: 'رفع مستخلص' })} disabled={isAnalyzingPayment} className="flex-1 bg-white border border-green-200 text-green-700 rounded-lg text-[10px] font-bold flex items-center justify-center gap-2 hover:bg-green-50 transition shadow-sm h-8 whitespace-nowrap">{isAnalyzingPayment ? 'جاري التحليل...' : 'رفع مستخلص'}</button>
                                </div>
                                
                                <div className="flex gap-2 items-stretch">
                                    <div className="flex flex-col gap-2 w-1/3">
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[7px] font-light text-slate-400">إجمالي الأعمال</label>
                                            <input type="number" className="w-full p-2 text-xs rounded-lg border border-green-200 outline-none text-slate-900 font-bold h-9" placeholder="0.00" value={masterData.newPaymentCumulative} onChange={(e) => setMasterData({...masterData, newPaymentCumulative: e.target.value})} />
                                        </div>
                                        
                                        <div className="text-[7px] text-green-700 font-light bg-green-50 px-2 py-1 rounded border border-green-100 flex flex-col justify-center h-full min-h-[36px]">
                                            <span className="opacity-70">صافي المستخلص:</span>
                                            <span className="text-xs font-bold">{Math.max(0, (parseFloat(masterData.newPaymentCumulative) || 0) - previousTotalPayments).toLocaleString()}</span>
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-1 flex-1">
                                        <label className="text-[9px] font-bold text-slate-500"></label>
                                        <textarea className="w-full p-2 text-xs rounded-lg border border-green-200 outline-none text-slate-900 resize-none h-full" placeholder="البيان..." value={masterData.newPaymentNote} onChange={(e) => setMasterData({...masterData, newPaymentNote: e.target.value})} />
                                    </div>
                                </div>
                                <button onClick={addPayment} className="w-full bg-green-600 text-white px-3 h-9 rounded-lg text-sm font-bold hover:bg-green-700 transition flex items-center justify-center shadow-md gap-2"><i className="fa-solid fa-plus"></i> حفظ المستخلص</button>
                            </div>
                            
                            <div className="space-y-2 pb-10">
                                {masterData.payments.map((pay, idx) => (
                                    <div key={pay.id} className="relative group animate-scale-in">
                                        {editingPayId === pay.id ? (
                                            <div className="bg-green-50 p-4 rounded-xl border-2 border-green-300 shadow-md flex flex-col gap-2">
                                                <div className="flex gap-2"><input type="date" className="w-1/3 p-2 text-xs rounded-lg border" value={tempEditPayDate} onChange={(e) => setTempEditPayDate(e.target.value)} /><input type="number" className="w-2/3 p-2 text-xs rounded-lg border" value={tempEditPayAmount} onChange={(e) => setTempEditPayAmount(e.target.value)} /></div>
                                                <textarea className="w-full p-2 text-xs rounded-lg border" value={tempEditPayNote} onChange={(e) => setTempEditPayNote(e.target.value)} />
                                                <div className="flex justify-end gap-2"><button onClick={() => saveEditPayment(pay.id)} className="text-[10px] bg-green-600 text-white px-3 py-1 rounded">حفظ</button><button onClick={() => setEditingPayId(null)} className="text-[10px] bg-white border px-3 py-1 rounded">إلغاء</button></div>
                                            </div>
                                        ) : (
                                            <div className={`p-3 rounded-2xl shadow-sm border-4 hover:shadow-md transition relative flex flex-col gap-2 ${getCardColor(idx)}`}>
                                                <div className="flex justify-between items-center border-b border-black/5 pb-2">
                                                    <div className="flex items-center gap-2"><div className="w-8 h-8 rounded-full bg-white/50 text-green-700 flex items-center justify-center shadow-sm"><i className="fa-solid fa-file-invoice text-xs"></i></div><span className="font-bold text-slate-800 text-base font-mono bg-white/50 px-3 h-8 flex items-center justify-center rounded border border-black/5 leading-none pt-1">{pay.date} | #{pay.invoiceNumber || '-'}</span></div>
                                                    <div className="flex gap-1"><button onClick={() => { setEditingPayId(pay.id); setTempEditPayAmount((pay.netAmount || pay.amount || 0).toString()); setTempEditPayNote(pay.note); setTempEditPayDate(pay.date); }} className="w-7 h-7 rounded-full bg-white/50 text-slate-500 hover:text-blue-600 transition flex items-center justify-center"><i className="fa-solid fa-pen text-[10px]"></i></button><button onClick={() => setPaymentToDeleteId(pay.id)} className="w-7 h-7 rounded-full bg-white/50 text-slate-500 hover:text-red-600 transition flex items-center justify-center"><i className="fa-solid fa-trash text-[10px]"></i></button></div>
                                                </div>
                                                <div className="bg-white/40 p-2.5 rounded-lg border border-black/5 flex flex-col gap-1">
                                                    <div className="flex justify-between items-center border-b border-black/5 pb-1 mb-1">
                                                        <span className="text-[10px] text-slate-500 font-bold">إجمالي الأعمال</span>
                                                        <span className="font-bold text-slate-900 font-mono text-base">{(pay.cumulativeAmount || 0).toLocaleString()} ج.م</span>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-[10px] text-slate-500 font-bold">صافي المستخلص</span>
                                                        <span className="font-black text-green-800 font-mono text-lg">{(pay.netAmount || 0).toLocaleString()} ج.م</span>
                                                    </div>
                                                    <p className="text-slate-900 text-sm leading-relaxed font-bold whitespace-pre-wrap mt-1 opacity-80">{pay.note}</p>
                                                </div>
                                                {pay.items && pay.items.length > 0 && <button onClick={() => setExpandedPaymentId(expandedPaymentId === pay.id ? null : pay.id)} className="w-full bg-white/30 hover:bg-white/60 p-1 rounded-lg transition flex items-center justify-center gap-1 text-[10px] font-bold text-slate-600 mt-1">{expandedPaymentId === pay.id ? 'إخفاء التفاصيل' : 'عرض البنود'}</button>}
                                                {expandedPaymentId === pay.id && pay.items && (
                                                    <div className="mt-1 bg-white rounded-lg border border-slate-200 overflow-hidden p-1 space-y-2">
                                                        {pay.items.map((item, i) => {
                                                            const isEditingThisItem = editingPaymentItemIndex && editingPaymentItemIndex.paymentId === pay.id && editingPaymentItemIndex.itemIndex === i;
                                                            // Determine Color
                                                            const quantityColorClass = getQuantityStatusColor(item.totalQuantity || 0, item.contractQuantity || 0);
                                                            
                                                            return (
                                                                <div key={i} className={`rounded border p-2 text-[10px] transition ${isEditingThisItem ? 'bg-yellow-50 border-yellow-200 shadow-md' : 'bg-slate-50 border-slate-100'}`}>
                                                                    {isEditingThisItem ? (
                                                                        <div className="flex flex-col gap-2">
                                                                            <div className="flex justify-between items-center bg-white p-1 rounded border border-yellow-100">
                                                                                <span className="font-bold text-slate-700">تعديل البند</span>
                                                                                <input type="text" className="w-20 p-1 border rounded font-mono text-center text-xs" value={tempPaymentItem.itemCode} onChange={(e) => handleTempItemChange('itemCode', e.target.value)} placeholder="الكود" />
                                                                            </div>
                                                                            <input type="text" className="w-full p-1 border rounded" value={tempPaymentItem.description} onChange={(e) => handleTempItemChange('description', e.target.value)} />
                                                                            
                                                                            <div className="grid grid-cols-2 gap-2 text-center bg-slate-100 p-1 rounded border border-slate-200 mb-1">
                                                                                <div className="flex flex-col"><label className="text-[8px] text-slate-500">التعاقدية</label><input type="number" className="w-full p-1 border rounded text-center font-bold" value={tempPaymentItem.contractQuantity} onChange={(e) => handleTempItemChange('contractQuantity', e.target.value)} /></div>
                                                                                <div className="flex flex-col"><label className="text-[8px] text-slate-500">السابقة</label><input type="number" className="w-full p-1 border rounded text-center font-bold" value={tempPaymentItem.prevQuantity} onChange={(e) => handleTempItemChange('prevQuantity', e.target.value)} /></div>
                                                                            </div>

                                                                            <div className="grid grid-cols-3 gap-1 text-center">
                                                                                <div className="flex flex-col"><label className="text-[8px] text-blue-600 font-bold">الإجمالية (تلقائي)</label><input type="number" className="w-full p-1 border rounded text-center font-black text-blue-700 border-blue-200 bg-blue-50" value={tempPaymentItem.totalQuantity} onChange={(e) => handleTempItemChange('totalQuantity', e.target.value)} /></div>
                                                                                <div className="flex flex-col"><label className="text-[8px] text-slate-400">الفئة</label><input type="number" className="w-full p-1 border rounded text-center font-bold" value={tempPaymentItem.unitPrice} onChange={(e) => handleTempItemChange('unitPrice', e.target.value)} /></div>
                                                                                <div className="flex flex-col"><label className="text-[8px] text-slate-400">نسبة %</label><input type="number" className="w-full p-1 border rounded text-center font-bold" value={tempPaymentItem.completionRatio} onChange={(e) => handleTempItemChange('completionRatio', e.target.value)} /></div>
                                                                            </div>
                                                                            
                                                                            <div className="flex justify-between items-center bg-white p-1 rounded border border-slate-200 mt-1">
                                                                                <span className="text-[9px] text-slate-400">الحالية (ناتج): {tempPaymentItem.currQuantity?.toLocaleString()}</span>
                                                                                <span className="font-black text-blue-800 font-mono">{(tempPaymentItem.totalValue || 0).toLocaleString()}</span>
                                                                            </div>

                                                                            <div className="flex gap-2 mt-1">
                                                                                <button onClick={saveItemEdit} className="flex-1 bg-green-600 text-white py-1.5 rounded font-bold hover:bg-green-700">حفظ</button>
                                                                                <button onClick={() => { setEditingPaymentItemIndex(null); setTempPaymentItem(null); }} className="flex-1 bg-slate-200 text-slate-700 py-1.5 rounded font-bold hover:bg-slate-300">إلغاء</button>
                                                                            </div>
                                                                        </div>
                                                                    ) : (
                                                                        <div onClick={() => handleStartEditItem(pay.id, item, i)} className="cursor-pointer hover:bg-blue-50 transition p-1 rounded">
                                                                            {/* Row 1: Code & Desc */}
                                                                            <div className="flex gap-2 font-bold text-slate-800 mb-1">
                                                                                <span className="bg-white px-1 rounded border border-slate-200 font-mono text-sm">{item.itemCode || '-'}</span>
                                                                                <span className="truncate text-sm">{item.description}</span>
                                                                                <i className="fa-solid fa-pen text-[8px] text-slate-300 mr-auto mt-1"></i>
                                                                            </div>
                                                                            {/* Row 2: Quantities */}
                                                                            <div className="grid grid-cols-4 gap-1 text-center bg-white rounded border border-slate-100 p-1 mb-1">
                                                                                <div className="flex flex-col"><span className="text-[8px] text-slate-400">التعاقدية</span><span className="font-mono font-bold text-sm">{item.contractQuantity || 0}</span></div>
                                                                                <div className="flex flex-col"><span className="text-[8px] text-slate-400">السابقة</span><span className="font-mono font-bold text-sm">{item.prevQuantity || 0}</span></div>
                                                                                <div className="flex flex-col"><span className="text-[8px] text-green-600 font-bold">الحالية</span><span className="font-mono font-black text-green-700 text-sm">{item.currQuantity || 0}</span></div>
                                                                                <div className={`flex flex-col rounded ${quantityColorClass}`}><span className="text-[8px] text-slate-600 font-bold">الإجمالية</span><span className="font-mono font-bold text-sm">{item.totalQuantity || 0}</span></div>
                                                                            </div>
                                                                            {/* Row 3: Financials */}
                                                                            <div className="flex justify-between items-center bg-blue-50/50 rounded p-1 px-2 border border-blue-100">
                                                                                <div className="flex gap-1 items-center"><span className="text-slate-500 text-[9px]">الفئة:</span><span className="font-mono font-bold text-sm">{item.unitPrice?.toLocaleString()}</span></div>
                                                                                <div className="flex gap-1 items-center"><span className="text-slate-500 text-[9px]">النسبة:</span><span className="font-mono font-bold text-sm">{item.completionRatio || 100}%</span></div>
                                                                                <div className="flex gap-1 items-center"><span className="text-slate-500 text-[9px]">الإجمالي:</span><span className="font-mono font-black text-blue-800 text-sm">{item.totalValue?.toLocaleString()}</span></div>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {masterData.payments.length === 0 && <div className="text-center py-10 text-slate-400 text-xs">لا توجد مستخلصات.</div>}
                            </div>
                        </div>
                    )}

                    {activeTab === 'boq' && (
                        // ... (Keep existing BOQ tab content)
                        <div className="space-y-2 pb-20 p-1">
                            {/* ... BOQ Header ... */}
                            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-1.5 flex justify-between items-center shrink-0">
                                <div><h4 className="font-bold text-indigo-900 text-[10px]">تحليل المقايسة</h4></div>
                                <div className="flex gap-1.5">
                                    <button onClick={handleCreateManualBOQ} className="bg-white border border-indigo-200 text-indigo-700 px-3 py-1.5 rounded-lg text-[10px] font-bold shadow-sm hover:bg-indigo-50 transition flex items-center gap-1.5"><i className="fa-solid fa-plus"></i> إنشاء يدوية</button>
                                    <button onClick={() => setSourceModal({ type: 'boq', title: 'رفع المقايسة' })} disabled={isAnalyzingBOQ} className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold shadow-lg hover:bg-indigo-700 transition flex items-center gap-1.5 disabled:opacity-50">{isAnalyzingBOQ ? <i className="fa-solid fa-circle-notch fa-spin"></i> : <i className="fa-solid fa-file-import"></i>} تحليل</button>
                                </div>
                            </div>
                            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col boq-container w-full max-w-full">
                                <div className="w-full max-w-full overflow-hidden">
                                    <table className="w-full text-sm text-right boq-table table-fixed">
                                        <tbody className="divide-y divide-slate-100">{renderBoqTable()}</tbody>
                                    </table>
                                    {masterData.boqItems.length === 0 && (
                                        <div className="text-center py-12 text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
                                            <i className="fa-solid fa-clipboard-list text-2xl text-slate-300"></i>
                                            <span>لا توجد بنود في المقايسة حالياً.</span>
                                            <button 
                                                onClick={handleCreateManualBOQ} 
                                                className="mt-2 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5"
                                            >
                                                <i className="fa-solid fa-plus"></i> إنشاء مقايسة يدوية
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                            {/* Manual BOQ Creation Modal */}
                            {showManualBoqModal && (
                                <div className="fixed inset-0 z-[1650] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                                    <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-scale-in">
                                        <div className="bg-gradient-to-r from-indigo-700 to-indigo-900 text-white p-4 flex justify-between items-center">
                                            <h3 className="font-bold text-white flex items-center gap-2 text-sm">
                                                <i className="fa-solid fa-list-check text-yellow-300"></i>
                                                إنشاء مقايسة يدوية جديدة
                                            </h3>
                                            <button 
                                                onClick={() => setShowManualBoqModal(false)} 
                                                className="w-8 h-8 rounded-full hover:bg-white/20 flex items-center justify-center text-white transition"
                                            >
                                                <i className="fa-solid fa-times"></i>
                                            </button>
                                        </div>
                                        <form onSubmit={confirmCreateManualBOQ} className="p-4 space-y-4">
                                            <div>
                                                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                                                    اسم المقايسة أو الحزمة (الباب):
                                                </label>
                                                <input 
                                                    type="text" 
                                                    required 
                                                    autoFocus
                                                    value={manualBoqName} 
                                                    onChange={(e) => setManualBoqName(e.target.value)} 
                                                    placeholder="مثال: مقايسة الأعمال الاعتيادية / الحفر والردم" 
                                                    className="w-full p-3 border border-slate-300 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                                />
                                                <p className="text-[11px] text-slate-500 mt-1">
                                                    سيتم إنشاء المقايسة وإضافة أول بند تلقائياً لتتمكن من كتابة الوصف وتحديد الكمية والفئة مباشرة.
                                                </p>
                                            </div>
                                            <div className="flex gap-2 pt-2 border-t border-slate-100">
                                                <button 
                                                    type="submit" 
                                                    disabled={!manualBoqName.trim()}
                                                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
                                                >
                                                    <i className="fa-solid fa-check"></i>
                                                    إنشاء المقايسة
                                                </button>
                                                <button 
                                                    type="button" 
                                                    onClick={() => setShowManualBoqModal(false)} 
                                                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 px-4 rounded-xl text-xs transition"
                                                >
                                                    إلغاء
                                                </button>
                                            </div>
                                        </form>
                                    </div>
                                </div>
                            )}
                            {/* BOQ Edit Modal (Updated with FIXED positioning) */}
                            {editingBoqItem && (
                                <div className="fixed inset-0 z-[1600] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                                    <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-scale-in relative">
                                        {showBoqDeleteConfirm && <div className="absolute inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-6 rounded-2xl"><div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-xs text-center"><h4 className="font-bold mb-2">حذف البند؟</h4><div className="flex gap-3"><button onClick={confirmDeleteBOQItem} className="flex-1 bg-red-600 text-white py-2 rounded-xl">حذف</button><button onClick={() => setShowBoqDeleteConfirm(false)} className="flex-1 bg-slate-100 text-slate-700 py-2 rounded-xl">إلغاء</button></div></div></div>}
                                        <div className="bg-slate-900 text-white p-4 flex justify-between items-center"><h3 className="font-bold text-white">تعديل البند</h3><button onClick={() => setEditingBoqItem(null)} className="w-8 h-8 rounded-full hover:bg-white/20 flex items-center justify-center"><i className="fa-solid fa-times"></i></button></div>
                                        <div className="p-4 space-y-3">
                                            <div className="flex gap-2"><div className="w-24"><label className="block text-xs font-bold mb-1">رقم</label><input type="text" className="w-full p-2 border rounded-lg" value={editingBoqItem.itemCode} onChange={(e) => setEditingBoqItem({...editingBoqItem, itemCode: e.target.value})} /></div><div className="w-20"><label className="block text-xs font-bold mb-1">الوحدة</label><input type="text" className="w-full p-2 border rounded-lg" value={editingBoqItem.unit} onChange={(e) => setEditingBoqItem({...editingBoqItem, unit: e.target.value})} /></div><div className="flex-1"><label className="block text-xs font-bold mb-1">الفئة</label><input type="number" className="w-full p-2 border rounded-lg" value={editingBoqItem.unitPrice} onChange={(e) => setEditingBoqItem({...editingBoqItem, unitPrice: Number(e.target.value)})} /></div></div>
                                            <div><label className="block text-xs font-bold mb-1">بيان الأعمال</label><textarea className="w-full p-3 border rounded-lg h-24 resize-none text-sm" value={editingBoqItem.description} onChange={(e) => setEditingBoqItem({...editingBoqItem, description: e.target.value})}></textarea></div>
                                            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100"><div className="bg-slate-50 p-2 rounded-lg"><label className="block text-xs font-bold text-center">الكمية التعاقدية</label><input type="number" className="w-full p-2 border rounded-lg text-center" value={editingBoqItem.quantity} onChange={(e) => setEditingBoqItem({...editingBoqItem, quantity: Number(e.target.value)})} /></div><div className="bg-green-50 p-2 rounded-lg"><label className="block text-xs font-bold text-green-700 text-center">الكمية المنفذة</label><input type="number" className="w-full p-2 border rounded-lg text-center font-bold text-green-800" value={isNaN(Number(editingBoqItem.executedQuantity)) ? 0 : editingBoqItem.executedQuantity} onChange={(e) => setEditingBoqItem({...editingBoqItem, executedQuantity: Number(e.target.value)})} /></div></div>
                                        </div>
                                        <div className="p-4 bg-slate-50 border-t flex justify-between gap-2"><button type="button" onClick={() => setShowBoqDeleteConfirm(true)} className="px-4 py-2 bg-red-100 text-red-600 rounded-xl font-bold"><i className="fa-solid fa-trash"></i></button><button type="button" onClick={addItemBelow} className="px-4 py-2 bg-yellow-100 text-yellow-700 rounded-xl font-bold"><i className="fa-solid fa-plus"></i> إضافة أسفل</button><button type="button" onClick={saveBOQItemEdit} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-xl font-bold">حفظ التعديلات</button></div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'soil' && (
                        // NEW MULTI-REPORT INTERFACE
                        <div className="p-0 pb-20 flex flex-col h-full relative">
                            {/* ... (Keep existing soil logic) ... */}
                            <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 flex justify-between items-center shrink-0 mb-3 mx-1 mt-1 sticky top-0 z-20 shadow-sm">
                                <div>
                                    <h4 className="font-bold text-orange-900 text-sm flex items-center gap-2">
                                        <i className="fa-solid fa-microscope text-orange-500"></i>
                                        تقارير 
                                    </h4>
                                    <p className="text-[8px] text-orange-700 opacity-80">جسات - اختبارات  - تقارير </p>
                                </div>
                                <button 
                                    onClick={() => setSourceModal({ type: 'soil', title: 'رفع تقرير هندسي جديد' })} 
                                    disabled={isAnalyzingSoil} 
                                    className="bg-orange-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg hover:bg-orange-700 transition flex items-center gap-2 disabled:opacity-50"
                                >
                                    {isAnalyzingSoil ? <i className="fa-solid fa-circle-notch fa-spin"></i> : <i className="fa-solid fa-plus"></i>} 
                                    تحليل
                                </button>
                            </div>
                            
                            {/* Reports Grid */}
                            <div className="flex-1 overflow-y-auto px-1">
                                {masterData.engineeringReports.length === 0 && !masterData.soilReport ? (
                                    <div className="flex flex-col items-center justify-center h-64 text-slate-400 opacity-60">
                                        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-3">
                                            <i className="fa-solid fa-layer-group text-2xl"></i>
                                        </div>
                                        <p className="text-sm font-bold">لا توجد تقارير محفوظة</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {/* Backward Compatibility: Show Old Single Soil Report if exists and not in array */}
                                        {masterData.soilReport && !masterData.engineeringReports.some(r => r.type === 'soil' && r.content === masterData.soilReport) && (
                                            <div className="bg-white p-4 rounded-2xl shadow-sm border border-orange-100 hover:shadow-md transition cursor-pointer group relative overflow-hidden" onClick={() => openReportFullScreen({id: 'legacy', type: 'soil', title: 'تقرير الجسات الأساسي', content: masterData.soilReport, date: new Date().toISOString()})}>
                                                <div className="absolute top-0 right-0 w-16 h-16 bg-orange-50 rounded-bl-full -mr-8 -mt-8 z-0"></div>
                                                <div className="relative z-10">
                                                    <div className="flex justify-between items-start mb-2">
                                                        <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center text-lg font-bold"><i className="fa-solid fa-file-contract"></i></div>
                                                        <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-bold">قديم</span>
                                                    </div>
                                                    <h3 className="font-bold text-slate-800 text-sm mb-1">تقرير الجسات الأساسي</h3>
                                                    <p className="text-[10px] text-slate-400 line-clamp-2">التقرير المحفوظ سابقاً في بيانات المشروع.</p>
                                                </div>
                                            </div>
                                        )}

                                        {masterData.engineeringReports.map((report) => (
                                            <div 
                                                key={report.id} 
                                                onClick={() => openReportFullScreen(report)}
                                                className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 hover:border-blue-300 hover:shadow-md transition cursor-pointer group relative overflow-hidden"
                                            >
                                                <div className="flex justify-between items-start mb-3">
                                                    {/* Report Icon & Date */}
                                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold shrink-0 ${report.type === 'soil' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'}`}>
                                                        <i className={`fa-solid ${report.type === 'soil' ? 'fa-mountain-sun' : 'fa-flask'}`}></i>
                                                    </div>
                                                    
                                                    {/* Actions or Edit Mode */}
                                                    {renamingReportId === report.id ? (
                                                        <div className="flex items-center gap-2 flex-1 mr-3" onClick={(e) => e.stopPropagation()}>
                                                            <input 
                                                                type="text" 
                                                                value={tempReportTitle} 
                                                                onChange={(e) => setTempReportTitle(e.target.value)} 
                                                                className="w-full p-1 border border-blue-300 rounded text-xs font-bold"
                                                                autoFocus
                                                            />
                                                            <button 
                                                                onClick={(e) => saveReportRename(e, report.id)}
                                                                className="w-6 h-6 bg-green-500 text-white rounded flex items-center justify-center"
                                                            >
                                                                <i className="fa-solid fa-check text-[10px]"></i>
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-1">
                                                            <button 
                                                                onClick={(e) => handleStartRenameReport(e, report)}
                                                                className="w-7 h-7 rounded-full hover:bg-blue-50 text-slate-300 hover:text-blue-600 flex items-center justify-center transition border border-transparent hover:border-blue-100"
                                                                title="تعديل العنوان"
                                                            >
                                                                <i className="fa-solid fa-pen text-[10px]"></i>
                                                            </button>
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); setReportToDeleteId(report.id); }}
                                                                className="w-7 h-7 rounded-full hover:bg-red-50 text-slate-300 hover:text-red-500 flex items-center justify-center transition border border-transparent hover:border-red-100"
                                                                title="حذف التقرير"
                                                            >
                                                                <i className="fa-solid fa-trash text-[10px]"></i>
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Report Title */}
                                                {renamingReportId !== report.id && (
                                                    <h3 className="font-bold text-slate-800 text-sm mb-1 line-clamp-1">{report.title}</h3>
                                                )}
                                                
                                                <p className="text-[10px] text-slate-500 line-clamp-2 leading-relaxed">
                                                    {report.summary || "انقر لعرض التفاصيل الكاملة للتقرير والتحليل الهندسي..."}
                                                </p>
                                                
                                                <div className="mt-3 pt-2 border-t border-slate-50 flex justify-between items-center">
                                                    <span className="text-[9px] text-slate-400 font-mono">{new Date(report.date).toLocaleDateString('ar-EG')}</span>
                                                    <span className="text-[10px] font-bold text-blue-600 group-hover:underline flex items-center gap-1">عرض التفاصيل <i className="fa-solid fa-arrow-left"></i></span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Full Screen Report Overlay */}
                            {selectedReport && (
                                <div className="fixed inset-0 z-[1700] bg-white animate-scale-in flex flex-col">
                                    <div className="bg-slate-900 text-white p-4 flex justify-between items-center shadow-md shrink-0">
                                        <div className="flex items-center gap-3">
                                            <button onClick={() => setSelectedReport(null)} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition"><i className="fa-solid fa-arrow-right rtl:rotate-180"></i></button>
                                            <h3 className="font-bold text-sm sm:text-base truncate max-w-[200px] sm:max-w-md">{selectedReport.title}</h3>
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={() => handleEditReport(selectedReport)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-sm flex items-center gap-2">
                                                <i className="fa-solid fa-pen-to-square"></i> <span className="hidden sm:inline">تعديل كخطاب</span>
                                            </button>
                                        </div>
                                    </div>
                                    {/* UPDATED: FULL WIDTH CONTAINER WITH DYNAMIC TABLE STYLES */}
                                    <div className="flex-1 overflow-y-auto bg-white p-0">
                                        <div className="w-full min-h-full p-0 md:p-4">
                                            <style>{`
                                                .report-content table { width: 100% !important; display: table !important; table-layout: auto !important; }
                                                .report-content td, .report-content th { word-wrap: break-word; white-space: normal !important; overflow-wrap: break-word; max-width: 100%; }
                                                .report-content img { max-width: 100% !important; height: auto !important; }
                                            `}</style>
                                            <div 
                                                className="prose prose-sm max-w-none text-slate-800 leading-relaxed w-full report-content"
                                                dangerouslySetInnerHTML={{ __html: selectedReport.content }}
                                            ></div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Delete Confirmation */}
                            {reportToDeleteId && (
                                <div className="fixed inset-0 z-[1800] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
                                    <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-xs text-center animate-scale-in">
                                        <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-3 text-xl"><i className="fa-solid fa-trash"></i></div>
                                        <h4 className="font-bold mb-2 text-slate-800">حذف التقرير؟</h4>
                                        <p className="text-xs text-slate-500 mb-4">لا يمكن التراجع عن هذا الإجراء.</p>
                                        <div className="flex gap-3">
                                            <button onClick={confirmDeleteReport} className="flex-1 bg-red-600 text-white py-2 rounded-xl font-bold hover:bg-red-700 transition">حذف</button>
                                            <button onClick={() => setReportToDeleteId(null)} className="flex-1 bg-slate-100 text-slate-700 py-2 rounded-xl font-bold hover:bg-slate-200 transition">إلغاء</button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* --- MODALS FOR DCS & QHSE REMOVED --- */}
                </div>

                {/* Footer REMOVED */}

                {/* Confirm Delete Log Modal */}
                <ConfirmModal 
                    isOpen={!!logToDeleteId}
                    title="حذف اليومية"
                    message="هل أنت متأكد من حذف هذا السجل؟"
                    onConfirm={confirmDeleteLog}
                    onCancel={() => setLogToDeleteId(null)}
                    type="danger"
                />

                {/* Confirm Delete Payment Modal */}
                <ConfirmModal 
                    isOpen={!!paymentToDeleteId}
                    title="حذف المستخلص"
                    message="هل أنت متأكد؟ سيتم حذف بيانات هذا المستخلص نهائياً."
                    onConfirm={confirmDeletePayment}
                    onCancel={() => setPaymentToDeleteId(null)}
                    type="danger"
                />

                {/* Confirm Delete Document Modal */}
                <ConfirmModal 
                    isOpen={!!itemToDelete}
                    title="حذف المستند"
                    message="هل أنت متأكد من حذف هذا المستند؟ لا يمكن التراجع عن هذا الإجراء."
                    onConfirm={confirmDeleteItem}
                    onCancel={() => setItemToDelete(null)}
                    type="danger"
                />

                {/* Report Modal */}
                <ProjectReportModal
                    isOpen={showReportModal}
                    onClose={() => setShowReportModal(false)}
                    project={initialProjectData || null}
                    onGenerate={handleGenerateReport}
                    isGenerating={isGeneratingReport}
                />

                {/* ... (Modals remain unchanged) ... */}
                {sourceModal && (
                    <div className="fixed inset-0 z-[1600] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
                        <div className="bg-white w-full max-w-xs rounded-2xl shadow-2xl p-4 animate-scale-in border border-slate-200 text-center">
                            <h3 className="text-slate-800 font-bold mb-4 text-sm">{sourceModal.title}</h3>
                            <div className="grid grid-cols-1 gap-2">
                                <button onClick={() => handleSourceChoice('camera')} className="bg-blue-50 text-blue-700 p-3 rounded-xl hover:bg-blue-100 transition flex items-center justify-center gap-2 font-bold text-xs border border-blue-100">
                                    <i className="fa-solid fa-camera"></i> التقاط صورة (الكاميرا)
                                </button>
                                <button onClick={() => handleSourceChoice('device')} className="bg-slate-50 text-slate-700 p-3 rounded-xl hover:bg-slate-100 transition flex items-center justify-center gap-2 font-bold text-xs border border-slate-200">
                                    <i className="fa-regular fa-image"></i> من معرض الجهاز
                                </button>
                                <button onClick={() => handleSourceChoice('app')} className="bg-indigo-50 text-indigo-700 p-3 rounded-xl hover:bg-indigo-100 transition flex items-center justify-center gap-2 font-bold text-xs border border-indigo-200">
                                    <i className="fa-solid fa-folder-open"></i> من ملفات المشروع
                                </button>
                            </div>
                            <button onClick={() => setSourceModal(null)} className="mt-4 text-slate-400 text-xs font-bold hover:text-red-500">إلغاء</button>
                        </div>
                    </div>
                )}

                {/* App File Picker Modal */}
                {showAppFilePicker && (
                    <div className="fixed inset-0 z-[1700] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
                        {/* ... (Keep existing App Picker) ... */}
                        <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl flex flex-col max-h-[80vh] animate-scale-in border border-slate-200 overflow-hidden">
                            <div className="p-3 bg-slate-100 border-b border-slate-200 flex justify-between items-center shrink-0">
                                <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm"><i className="fa-solid fa-folder-tree text-orange-500"></i> اختر صور من المشروع</h3>
                                <button onClick={() => setShowAppFilePicker(false)} className="w-8 h-8 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-500 transition"><i className="fa-solid fa-times"></i></button>
                            </div>
                            <div className="px-3 py-2 bg-white border-b border-slate-100 flex items-center gap-1 overflow-x-auto text-xs whitespace-nowrap">
                                {pickerBreadcrumbs.length > 1 && <button onClick={navigatePickerBack} className="w-6 h-6 flex items-center justify-center bg-slate-100 rounded-full hover:bg-slate-200 mr-1"><i className="fa-solid fa-arrow-right text-[10px] text-slate-600"></i></button>}
                                {pickerBreadcrumbs.map((crumb, idx) => (<div key={crumb.id} className="flex items-center">{idx > 0 && <span className="text-slate-300 mx-1">/</span>}<span className={`font-bold ${idx === pickerBreadcrumbs.length - 1 ? 'text-orange-600' : 'text-slate-500'}`}>{crumb.name}</span></div>))}
                            </div>
                            <div className="flex-1 overflow-y-auto p-2 bg-slate-50">
                                {loadingPickerFiles ? <div className="text-center py-10"><div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div><p className="text-xs text-slate-400">جاري التحميل...</p></div> : pickerItems.length === 0 ? <div className="text-center py-10 text-slate-400"><i className="fa-solid fa-folder-open text-3xl mb-2 opacity-30"></i><p className="text-xs font-bold">فارغ</p></div> : (
                                    <div className="space-y-1">
                                        {pickerItems.map(item => {
                                            const isFolder = item.type === ItemType.FOLDER;
                                            const isSelected = selectedPickerItems.has(item.id);
                                            // Filter logic if needed
                                            if (!isFolder && pickerContext !== 'soil' && !item.mimeType?.match(/(image|pdf|text|word)/)) return null;
                                            
                                            return (
                                                <div key={item.id} onClick={() => isFolder ? navigatePickerFolder(item) : togglePickerSelection(item.id)} className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition ${isFolder ? 'bg-white border-slate-100 hover:bg-yellow-50' : isSelected ? 'bg-blue-50 border-blue-300' : 'bg-white border-transparent hover:bg-slate-50'}`}>
                                                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${isFolder ? 'bg-yellow-100 text-yellow-600' : 'bg-slate-100 text-slate-500 overflow-hidden'}`}>
                                                        {isFolder ? <i className="fa-solid fa-folder text-sm"></i> : item.previewUrl ? <img src={item.previewUrl} alt="" className="w-full h-full object-cover" /> : <i className="fa-solid fa-image text-sm"></i>}
                                                    </div>
                                                    <div className="flex-1 min-w-0"><h4 className={`text-xs font-bold truncate ${isSelected ? 'text-blue-800' : 'text-slate-700'}`}>{item.name}</h4></div>
                                                    {isFolder ? <i className="fa-solid fa-chevron-left text-slate-300 text-xs"></i> : <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition ${isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300'}`}><i className="fa-solid fa-check text-[10px]"></i></div>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                            <div className="p-3 bg-white border-t border-slate-200 shrink-0">
                                <button onClick={confirmPickerSelection} disabled={selectedPickerItems.size === 0 || isProcessingPicker} className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition shadow-lg flex items-center justify-center gap-2 disabled:opacity-50">{isProcessingPicker ? <i className="fa-solid fa-circle-notch fa-spin"></i> : <i className="fa-solid fa-check-double"></i>} {isProcessingPicker ? 'جاري التحميل...' : `إضافة ${selectedPickerItems.size} ملفات`}</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
