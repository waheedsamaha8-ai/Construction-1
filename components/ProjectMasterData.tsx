
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
import { Project, ProjectLog, ProjectPayment, BOQItem, BOQItemReportType, BOQItemSavedReport, PaymentItem, FileItem, ItemType, EngineeringReportItem, RFI, Submittal, Correspondence, Checklist, NCR } from '../types';
import html2canvas from 'html2canvas';
import InteractiveReportViewer, { formatInteractiveReportHtml, applyTableColumnWidthToHtml } from './InteractiveReportViewer';

interface ProjectMasterDataProps {
    projectId: string;
    isOpen: boolean;
    onClose: () => void;
    onReportGenerated?: () => void;
    initialProjectData?: Project | null; // NEW PROP FOR INSTANT LOAD
    onProjectUpdated?: (project: Project) => void;
    onOpenAI: () => void;
}

const normalizeBoqList = (items: any[] = []): BOQItem[] => {
    if (!Array.isArray(items)) return [];
    return items.filter(Boolean).map((b, idx) => {
        const code = b.itemCode !== undefined ? String(b.itemCode) : (b.itemNumber !== undefined ? String(b.itemNumber) : String(idx + 1));
        const qty = Number(b.quantity) || 0;
        const price = Number(b.unitPrice) || 0;
        const execQty = Number(b.executedQuantity) || 0;
        return {
            ...b,
            id: b.id || `boq_${b.batchId || 'default'}_${idx}_${code.replace(/\s+/g, '_')}`,
            itemCode: code,
            quantity: qty,
            unitPrice: price,
            total: b.total !== undefined && !isNaN(Number(b.total)) && Number(b.total) > 0 ? Number(b.total) : (qty * price),
            executedQuantity: execQty
        };
    });
};

const normalizePaymentsList = (payments: any[] = []): ProjectPayment[] => {
    if (!Array.isArray(payments)) return [];
    return payments.filter(Boolean).map((p, idx) => {
        const cum = Number(p.cumulativeAmount) || Number(p.amount) || Number(p.netAmount) || 0;
        const net = p.netAmount !== undefined ? Number(p.netAmount) : (Number(p.amount) || cum);
        return {
            ...p,
            id: p.id || `pay_${p.date || 'nodate'}_${p.invoiceNumber || p.number || idx}`,
            cumulativeAmount: cum,
            netAmount: net,
            amount: net,
            note: p.note !== undefined ? p.note : (p.notes || '')
        };
    });
};

const enhanceReportHtml = (rawHtml: string): string => {
    return formatInteractiveReportHtml(rawHtml);
};

export default function ProjectMasterData({ projectId, isOpen, onClose, onReportGenerated, initialProjectData, onProjectUpdated, onOpenAI }: ProjectMasterDataProps) {
    const navigate = useNavigate();
    
    // --- State Management ---
    const [activeTab, setActiveTab] = useState<'logs' | 'payments' | 'boq' | 'soil'>('logs');
    const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    
    // Report Modal State
    const [showReportModal, setShowReportModal] = useState(false);
    const [isGeneratingReport, setIsGeneratingReport] = useState(false);
    
    const seedProject = useMemo(() => {
        if (initialProjectData && ((initialProjectData.boqItems && initialProjectData.boqItems.length > 0) || (initialProjectData.payments && initialProjectData.payments.length > 0) || (initialProjectData.executionLogs && initialProjectData.executionLogs.length > 0))) {
            return initialProjectData;
        }
        const cached = api.getCachedProjects()?.find(p => p.id === projectId) || api.getSyncProjects()?.find(p => p.id === projectId);
        return cached || initialProjectData || null;
    }, [initialProjectData, projectId]);

    const [loading, setLoading] = useState(!seedProject);
    const [isRefreshing, setIsRefreshing] = useState(false);

    // --- LAZY LOAD STATE ---
    const [visibleLogsCount, setVisibleLogsCount] = useState(10);

    // CRITICAL FIX: Refs to track local saving and last edit timestamp so stale snapshots never overwrite user edits
    const isSavingRef = useRef(false);
    const lastLocalEditRef = useRef<number>(0);

    // Helper to sort logs descending (Date DESC -> Creation Time DESC)
    const sortLogs = (logs: ProjectLog[]) => {
        if (!logs) return [];
        return [...logs].sort((a, b) => {
            const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
            if (dateDiff !== 0) return dateDiff;
            const timeA = parseInt((a.id || '').split('_')[1] || '0');
            const timeB = parseInt((b.id || '').split('_')[1] || '0');
            return timeB - timeA;
        });
    };

    // Data State
    const [masterData, setMasterData] = useState<{ 
        projectName: string;
        projectContractor: string;
        fullDescription: string; 
        logs: ProjectLog[]; 
        payments: ProjectPayment[]; 
        boqItems: BOQItem[]; 
        engineeringReports: EngineeringReportItem[];
        soilReport: string;
        newLog: string; 
        logDate: string; 
        newPaymentCumulative: string;
        newPaymentNote: string; 
        newInvoiceNumber: string;
        rfis: RFI[];
        submittals: Submittal[];
        correspondence: Correspondence[];
        checklists: Checklist[];
        ncrs: NCR[];
    }>({ 
        projectName: seedProject?.name || initialProjectData?.name || '',
        projectContractor: seedProject?.contractor || initialProjectData?.contractor || '',
        fullDescription: seedProject?.fullDescription || '', 
        logs: sortLogs(seedProject?.executionLogs || []),
        payments: normalizePaymentsList(seedProject?.payments || []), 
        boqItems: normalizeBoqList(seedProject?.boqItems || []), 
        engineeringReports: seedProject?.engineeringReports || [],
        soilReport: seedProject?.soilReportAnalysis || '', 
        newLog: '', 
        logDate: new Date().toISOString().split('T')[0], 
        newPaymentCumulative: '', 
        newPaymentNote: '',
        newInvoiceNumber: '',
        rfis: seedProject?.rfis || [],
        submittals: seedProject?.submittals || [],
        correspondence: seedProject?.correspondence || [],
        checklists: seedProject?.checklists || [],
        ncrs: seedProject?.ncrs || []
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
    const [tempEditLogBoqItemId, setTempEditLogBoqItemId] = useState<string>('');
    const [selectedLogBoqItemId, setSelectedLogBoqItemId] = useState<string>('');
    const [viewingBoqLogsItem, setViewingBoqLogsItem] = useState<BOQItem | null>(null);
    const [logToDeleteId, setLogToDeleteId] = useState<string | null>(null);
    
    // Specific States (Payments)
    const [newPaymentDate, setNewPaymentDate] = useState(new Date().toISOString().split('T')[0]);
    const [newPaymentFile, setNewPaymentFile] = useState<string | null>(null);
    const [newPaymentItems, setNewPaymentItems] = useState<PaymentItem[]>([]);
    const [isAnalyzingPayment, setIsAnalyzingPayment] = useState(false);
    const [editingPayId, setEditingPayId] = useState<string | null>(null);
    const [tempEditPayCumulative, setTempEditPayCumulative] = useState('');
    const [tempEditPayAmount, setTempEditPayAmount] = useState('');
    const [tempEditPayNote, setTempEditPayNote] = useState('');
    const [tempEditPayDate, setTempEditPayDate] = useState('');
    const [expandedPaymentId, setExpandedPaymentId] = useState<string | null>(null);
    const [paymentToDeleteId, setPaymentToDeleteId] = useState<string | null>(null);
    
    // NEW: Item Editing State inside Payment
    const [editingPaymentItemIndex, setEditingPaymentItemIndex] = useState<{paymentId: string, itemIndex: number} | null>(null);
    const [tempPaymentItem, setTempPaymentItem] = useState<PaymentItem | null>(null);

    // NEW: Smart IPC / Automatic Payment Generator State
    const [showSmartPaymentModal, setShowSmartPaymentModal] = useState(false);
    const [smartIpcInvoiceNumber, setSmartIpcInvoiceNumber] = useState('');
    const [smartIpcDate, setSmartIpcDate] = useState(new Date().toISOString().split('T')[0]);
    const [smartIpcNote, setSmartIpcNote] = useState('');
    const [smartIpcShowAllBoq, setSmartIpcShowAllBoq] = useState(false);
    const [smartIpcRetentionPercent, setSmartIpcRetentionPercent] = useState<number>(5);
    const [smartIpcAdvancePercent, setSmartIpcAdvancePercent] = useState<number>(0);
    const [smartIpcTaxesPercent, setSmartIpcTaxesPercent] = useState<number>(0);
    const [smartIpcDraftItems, setSmartIpcDraftItems] = useState<PaymentItem[]>([]);

    // Specific States (BOQ)
    const [isAnalyzingBOQ, setIsAnalyzingBOQ] = useState(false);
    const [editingBoqItem, setEditingBoqItem] = useState<BOQItem | null>(null);
    const [showBoqDeleteConfirm, setShowBoqDeleteConfirm] = useState(false);
    const [generatingBoqReportInfo, setGeneratingBoqReportInfo] = useState<{ itemId: string; type: BOQItemReportType } | null>(null);
    const [viewingBoqReport, setViewingBoqReport] = useState<BOQItemSavedReport | null>(null);
    const [viewingBoqReportItem, setViewingBoqReportItem] = useState<BOQItem | null>(null);
    const [isBoqReportMenuOpen, setIsBoqReportMenuOpen] = useState(false);
    const [isDirectEditingReport, setIsDirectEditingReport] = useState(false);
    const [reportAutoSaveStatus, setReportAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    const reportEditableContentRef = useRef<HTMLDivElement>(null);
    const reportAutoSaveTimeoutRef = useRef<any>(null);
    const [editingColumnModal, setEditingColumnModal] = useState<{
        tableIndex: number;
        columnIndex: number;
        columnTitle: string;
        currentPercent: number;
    } | null>(null);
    const [customPercentInput, setCustomPercentInput] = useState<number>(25);
    const reportContainerRef = useRef<HTMLDivElement>(null);
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
    const [isSelectedReportMenuOpen, setIsSelectedReportMenuOpen] = useState(false);
    const [isDirectEditingSelectedReport, setIsDirectEditingSelectedReport] = useState(false);
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
        if (!initialProjectData) return;
        // Never overwrite active local edits in the modal
        if (isSavingRef.current || (Date.now() - lastLocalEditRef.current < 2000)) {
            setLoading(false);
            return;
        }
        setMasterData(prev => ({
            ...prev,
            fullDescription: initialProjectData.fullDescription || prev.fullDescription || '',
            logs: (initialProjectData.executionLogs && initialProjectData.executionLogs.length > 0) 
                ? sortLogs(initialProjectData.executionLogs) 
                : prev.logs,
            payments: (initialProjectData.payments && initialProjectData.payments.length > 0) 
                ? normalizePaymentsList(initialProjectData.payments) 
                : prev.payments,
            boqItems: (initialProjectData.boqItems && initialProjectData.boqItems.length > 0) 
                ? normalizeBoqList(initialProjectData.boqItems) 
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
    }, [initialProjectData]);

    const applyProjectDataToState = (proj: Project, isInitialLocal = false) => {
        if (!proj) return;
        const isCurrentlyEditing = !isInitialLocal && (isSavingRef.current || (Date.now() - lastLocalEditRef.current < 15000));

        setMasterData(prev => {
            // If user is actively editing, only backfill tabs that are currently empty in state
            if (isCurrentlyEditing) {
                const remoteBoq = normalizeBoqList(proj.boqItems || []);
                const remotePayments = normalizePaymentsList(proj.payments || []);
                const remoteLogs = sortLogs(proj.executionLogs || []);
                return {
                    ...prev,
                    boqItems: prev.boqItems.length === 0 && remoteBoq.length > 0 ? remoteBoq : prev.boqItems,
                    payments: prev.payments.length === 0 && remotePayments.length > 0 ? remotePayments : prev.payments,
                    logs: prev.logs.length === 0 && remoteLogs.length > 0 ? remoteLogs : prev.logs,
                    engineeringReports: prev.engineeringReports.length === 0 && (proj.engineeringReports || []).length > 0 ? (proj.engineeringReports || []) : prev.engineeringReports
                };
            }

            const remoteLogs = proj.executionLogs || [];
            const logMap = new Map<string, ProjectLog>();
            remoteLogs.forEach(l => { if (l && l.id) logMap.set(l.id, l); });
            (prev.logs || []).forEach(l => {
                if (l && l.id) {
                    const rem = logMap.get(l.id);
                    const images = (l.images && l.images.length > 0) ? l.images : (rem?.images || []);
                    logMap.set(l.id, { ...(rem || {}), ...l, images });
                }
            });
            const mergedLogs = sortLogs(Array.from(logMap.values()));

            const remotePayments = normalizePaymentsList(proj.payments || []);
            const prevPayments = normalizePaymentsList(prev.payments || []);
            let mergedPayments: ProjectPayment[] = [];
            if (remotePayments.length > 0 && prevPayments.length === 0) {
                mergedPayments = remotePayments;
            } else {
                const paymentMap = new Map<string, ProjectPayment>();
                prevPayments.forEach(p => { if (p && p.id) paymentMap.set(p.id, p); });
                remotePayments.forEach(p => { if (p && p.id) paymentMap.set(p.id, p); });
                mergedPayments = Array.from(paymentMap.values()).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            }

            const remoteBoq = normalizeBoqList(proj.boqItems || []);
            const prevBoq = normalizeBoqList(prev.boqItems || []);
            let mergedBoq: BOQItem[] = [];
            if (remoteBoq.length > 0 && prevBoq.length === 0) {
                mergedBoq = remoteBoq;
            } else {
                const boqMap = new Map<string, BOQItem>();
                prevBoq.forEach(b => {
                    if (b) {
                        const key = b.id || `${b.batchId || 'default'}_${b.itemCode || ''}_${b.description || ''}`;
                        boqMap.set(key, b);
                    }
                });
                remoteBoq.forEach(b => {
                    if (b) {
                        const key = b.id || `${b.batchId || 'default'}_${b.itemCode || ''}_${b.description || ''}`;
                        const existing = boqMap.get(key);
                        const mergedSavedReports = (existing?.savedReports || b.savedReports)
                            ? { ...(existing?.savedReports || {}), ...(b.savedReports || {}) }
                            : undefined;
                        boqMap.set(key, mergedSavedReports ? { ...b, savedReports: mergedSavedReports } : b);
                    }
                });
                mergedBoq = Array.from(boqMap.values());
            }

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
                projectName: proj.name || prev.projectName || '',
                projectContractor: proj.contractor || prev.projectContractor || '',
                fullDescription: proj.fullDescription || prev.fullDescription || '',
                logs: mergedLogs,
                payments: mergedPayments,
                boqItems: mergedBoq.length > 0 ? mergedBoq : prevBoq,
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
        if (initialProjectData && isOpen) {
            applyProjectDataToState(initialProjectData, false);
        }
    }, [initialProjectData?.updatedAt]);

    useEffect(() => {
        if (isOpen && projectId) {
            let isCancelled = false;
            const load = async () => {
                // 1. Instant local load (0ms response)
                try {
                    const localProj = await api.getProjectById(projectId, false);
                    if (localProj && !isCancelled) {
                        applyProjectDataToState(localProj, true);
                        setLoading(false);
                    }
                } catch(e) {}

                const hasExistingData = Boolean(initialProjectData || masterData.logs.length > 0 || masterData.boqItems.length > 0 || masterData.payments.length > 0 || masterData.fullDescription);
                if (hasExistingData) {
                    setIsRefreshing(true);
                    setLoading(false);
                } else {
                    setLoading(true);
                }

                const refreshSafety = setTimeout(() => {
                    if (!isCancelled) {
                        setIsRefreshing(false);
                        setLoading(false);
                    }
                }, 1000);

                try {
                    const currentProject = await api.getProjectById(projectId, true);
                    if (currentProject && !isCancelled) {
                        applyProjectDataToState(currentProject, false);
                        if (onProjectUpdated) onProjectUpdated(currentProject);
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
                    if (isSavingRef.current || (Date.now() - lastLocalEditRef.current < 2000)) {
                        return;
                    }
                    if (updatedProject) {
                        applyProjectDataToState(updatedProject, false);
                        if (onProjectUpdated) onProjectUpdated(updatedProject);
                    }
                });

                // Listen to BroadcastChannel for instant cross-tab / cross-component sync
                let bc: BroadcastChannel | null = null;
                if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
                    bc = new BroadcastChannel('construction_app_sync_channel');
                    bc.onmessage = (ev) => {
                        if (isSavingRef.current || (Date.now() - lastLocalEditRef.current < 2000)) return;
                        if (ev.data?.type === 'PROJECTS_UPDATED' && Array.isArray(ev.data.projects)) {
                            const matched = ev.data.projects.find((p: Project) => p.id === projectId);
                            if (matched) {
                                applyProjectDataToState(matched, false);
                                if (onProjectUpdated) onProjectUpdated(matched);
                            }
                        }
                    };
                }

                return () => {
                    isCancelled = true;
                    unsubscribe();
                    if (bc) bc.close();
                };
            }
            return () => { isCancelled = true; };
        }
    }, [isOpen, projectId]);

    const triggerAutoSave = async (newData: any, flags?: { _allowEmptyBoq?: boolean; _allowEmptyPayments?: boolean; _allowEmptyLogs?: boolean; _allowEmptyReports?: boolean }) => {
        if (!projectId) return;
        const now = Date.now();
        lastLocalEditRef.current = now;
        isSavingRef.current = true;
        setAutoSaveStatus('saving');
        
        try {
            const normalizedPayments = normalizePaymentsList(newData.payments !== undefined ? newData.payments : masterData.payments);
            const normalizedBoq = normalizeBoqList(newData.boqItems !== undefined ? newData.boqItems : masterData.boqItems);

            const savedProject = await api.updateProjectMasterData(projectId, { 
                fullDescription: newData.fullDescription !== undefined ? newData.fullDescription : (masterData.fullDescription || ''), 
                executionLogs: newData.logs !== undefined ? newData.logs : (masterData.logs || []),
                payments: normalizedPayments, 
                boqItems: normalizedBoq, 
                engineeringReports: newData.engineeringReports !== undefined ? newData.engineeringReports : (masterData.engineeringReports || []), 
                soilReportAnalysis: newData.soilReport !== undefined ? newData.soilReport : (masterData.soilReport || ''), 
                rfis: newData.rfis !== undefined ? newData.rfis : (masterData.rfis || []),
                submittals: newData.submittals !== undefined ? newData.submittals : (masterData.submittals || []),
                correspondence: newData.correspondence !== undefined ? newData.correspondence : (masterData.correspondence || []),
                checklists: newData.checklists !== undefined ? newData.checklists : (masterData.checklists || []),
                ncrs: newData.ncrs !== undefined ? newData.ncrs : (masterData.ncrs || []),
                updatedAt: now,
                ...(flags || {})
            });
            // Immediately flush sync queue for instant cloud synchronization
            api.sync.processQueue().catch(() => {});
            if (savedProject && onProjectUpdated) {
                onProjectUpdated(savedProject);
            }
            setAutoSaveStatus('saved');
            setTimeout(() => setAutoSaveStatus('idle'), 1500);
        } catch (e) {
            console.error("Auto save failed", e);
            api.sync.processQueue().catch(() => {});
            setAutoSaveStatus('saved');
            setTimeout(() => setAutoSaveStatus('idle'), 1500);
        } finally {
            setTimeout(() => {
                isSavingRef.current = false;
            }, 800);
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
        
        const linkedBoq = selectedLogBoqItemId
            ? masterData.boqItems.find(b => b.id === selectedLogBoqItemId)
            : undefined;

        // --- OPTIMISTIC UPDATE: UPDATE UI IMMEDIATELY ---
        const newLogItem: ProjectLog = { 
            id: `log_${Date.now()}`, 
            date: masterData.logDate || new Date().toISOString().split('T')[0], 
            content: masterData.newLog,
            images: logImages,
            ...(linkedBoq ? {
                boqItemId: linkedBoq.id,
                boqItemCode: linkedBoq.itemCode,
                boqItemDescription: linkedBoq.description,
                boqBatchName: linkedBoq.batchName
            } : {})
        };

        // 1. Update State First (Instant Feedback)
        // Sort descending so the new log appears at the top if date is today
        const updatedLogs = sortLogs([newLogItem, ...masterData.logs]);
        const newData = { ...masterData, logs: updatedLogs, newLog: '' };
        setMasterData(newData);
        setLogImages([]); 
        setSelectedLogBoqItemId('');
        
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

    const getShortBoqText = (desc?: string, maxLen: number = 72): string => {
        if (!desc) return '';
        const clean = desc.replace(/\s+/g, ' ').trim();
        if (clean.length <= maxLen) return clean;
        const sliced = clean.slice(0, maxLen);
        const lastSpace = sliced.lastIndexOf(' ');
        return (lastSpace > 35 ? sliced.slice(0, lastSpace) : sliced).trim() + '...';
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
                backgroundColor: '#ffffff',
                onclone: (clonedDoc) => {
                    const clonedEl = clonedDoc.getElementById(elementId);
                    if (!clonedEl) return;

                    // 1. Prevent html2canvas from clipping bottom of Arabic characters inside badges/containers
                    const truncatedEls = clonedEl.querySelectorAll('.truncate, .line-clamp-2');
                    truncatedEls.forEach((el) => {
                        const htmlEl = el as HTMLElement;
                        htmlEl.style.overflow = 'visible';
                        htmlEl.style.textOverflow = 'clip';
                        htmlEl.style.whiteSpace = 'normal';
                        htmlEl.style.webkitLineClamp = 'unset';
                    });

                    // 2. Lift all Arabic text & date text upward to compensate for html2canvas baseline shift
                    const liftEls = clonedEl.querySelectorAll('.share-text-lift');
                    liftEls.forEach((el) => {
                        const htmlEl = el as HTMLElement;
                        htmlEl.style.transform = 'translateY(-6px)';
                        if (htmlEl.tagName.toLowerCase() === 'span') {
                            htmlEl.style.display = 'inline-block';
                        }
                    });

                    const shareHideIcons = clonedEl.querySelectorAll('.share-hide-icon');
                    shareHideIcons.forEach((el) => {
                        (el as HTMLElement).style.display = 'none';
                    });

                    const boqBadge = clonedEl.querySelector('.log-boq-badge') as HTMLElement | null;
                    if (boqBadge) {
                        boqBadge.style.paddingTop = '8px';
                        boqBadge.style.paddingBottom = '10px';
                        boqBadge.style.overflow = 'visible';
                    }
                }
            });
            
            if (actionsDiv) actionsDiv.classList.remove('hidden');
            if (projectNameHeader) projectNameHeader.classList.add('hidden');

            const projTitle = masterData.projectName || seedProject?.name || initialProjectData?.name || '';
            const contractorTitle = masterData.projectContractor || seedProject?.contractor || initialProjectData?.contractor || '';

            canvas.toBlob(async (blob) => {
                if (!blob) return;
                
                const file = new File([blob], `log_${log.date}.png`, { type: 'image/png' });
                
                // Try Web Share API (Mobile native sharing)
                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    try {
                        await navigator.share({
                            title: `يومية مشروع: ${projTitle}`,
                            text: `يومية مشروع: ${projTitle}${contractorTitle ? `\nالمقاول: ${contractorTitle}` : ''}\nالتاريخ: ${log.date}`,
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
                const text = `*يومية مشروع: ${projTitle}*${contractorTitle ? `\n*المقاول:* ${contractorTitle}` : ''}\n*التاريخ:* ${log.date}\n*البيان:* ${log.content}`;
                window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                
            }, 'image/png');
        } catch (error) {
            console.error("Error generating image:", error);
            alert("حدث خطأ أثناء تجهيز الصورة للمشاركة.");
        }
    };

    const confirmDeleteLog = async () => { 
        if (logToDeleteId) { 
            const newLogs = masterData.logs.filter(l => l.id !== logToDeleteId);
            const newData = { ...masterData, logs: newLogs };
            
            setMasterData(newData); 
            
            const idToDelete = logToDeleteId;
            setLogToDeleteId(null);
            
            setAutoSaveStatus('saving');
            isSavingRef.current = true;

            try {
                await api.deleteProjectLog(projectId, idToDelete);
                await triggerAutoSave(newData, { _allowEmptyLogs: true });
                setAutoSaveStatus('saved');
            } catch(e) {
                console.error("Failed to delete log", e);
                await triggerAutoSave(newData, { _allowEmptyLogs: true });
            } finally {
                setTimeout(() => {
                    isSavingRef.current = false;
                    setAutoSaveStatus('idle');
                }, 800);
            }
        } 
    };
    
    const saveEditLog = async (id: string) => { 
        if (!tempEditLogContent.trim() && tempEditLogImages.length === 0) return; 
        
        const linkedBoq = tempEditLogBoqItemId
            ? masterData.boqItems.find(b => b.id === tempEditLogBoqItemId)
            : undefined;

        const updatedLogItem: ProjectLog = {
            id,
            content: tempEditLogContent,
            date: tempEditLogDate,
            images: tempEditLogImages,
            boqItemId: linkedBoq ? linkedBoq.id : undefined,
            boqItemCode: linkedBoq ? linkedBoq.itemCode : undefined,
            boqItemDescription: linkedBoq ? linkedBoq.description : undefined,
            boqBatchName: linkedBoq ? linkedBoq.batchName : undefined
        };

        // Optimistic Update
        const updatedLogs = sortLogs(masterData.logs.map(l => l.id === id ? updatedLogItem : l)); 
        const newData = { ...masterData, logs: updatedLogs };
        setMasterData(newData); 
        setEditingLogId(null); 
        setTempEditLogBoqItemId('');
        
        setAutoSaveStatus('saving');
        try {
            await api.updateProjectLog(projectId, updatedLogItem);
            triggerAutoSave(newData);
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
        const parsedNet = parseFloat(String(tempEditPayAmount || '0').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString()).replace(/,/g, '')) || 0;
        const parsedCum = parseFloat(String(tempEditPayCumulative || '0').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString()).replace(/,/g, '')) || parsedNet;
        const updatedPayments = masterData.payments.map(p => p.id === id ? {
            ...p,
            cumulativeAmount: parsedCum > 0 ? parsedCum : parsedNet,
            netAmount: parsedNet,
            amount: parsedNet,
            note: tempEditPayNote,
            date: tempEditPayDate
        } : p).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const newData = { ...masterData, payments: updatedPayments };
        setMasterData(newData);
        setEditingPayId(null);
        triggerAutoSave(newData);
    };

    const confirmDeletePayment = () => { 
        if (paymentToDeleteId) { 
            const newData = { ...masterData, payments: masterData.payments.filter(p => p.id !== paymentToDeleteId) };
            setMasterData(newData);
            setPaymentToDeleteId(null);
            triggerAutoSave(newData, { _allowEmptyPayments: true });
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
        
        // 2. Recalculate Payment Totals (Cumulative & Gross Current Work)
        const newCumulative = newItems.reduce((sum, item) => sum + (item.totalValue || 0), 0);
        payment.cumulativeAmount = newCumulative;
        
        const newGrossCurrent = newItems.reduce((sum, item) => {
            const currVal = (item.currQuantity || 0) * (item.unitPrice || 0) * ((item.completionRatio || 100) / 100);
            return sum + Math.round(currVal);
        }, 0);
        
        payment.grossCurrentWork = newGrossCurrent;
        const retAmt = Math.round(newGrossCurrent * ((payment.retentionPercent || 0) / 100));
        const advAmt = Math.round(newGrossCurrent * ((payment.advanceDeductionPercent || 0) / 100));
        const taxAmt = Math.round(newGrossCurrent * ((payment.taxesAndOtherPercent || 0) / 100));
        const totalDed = retAmt + advAmt + taxAmt;
        const netAfterDed = Math.max(0, newGrossCurrent - totalDed);

        payment.retentionAmount = retAmt;
        payment.advanceDeductionAmount = advAmt;
        payment.taxesAndOtherAmount = taxAmt;
        payment.netPayableAfterDeductions = netAfterDed;
        payment.netAmount = netAfterDed;
        
        updatedPayments[targetPaymentIndex] = payment;

        // Also sync executedQuantity to BOQ if linked
        const updatedBoqItems = masterData.boqItems.map(b => {
            if (tempPaymentItem.boqItemId && b.id === tempPaymentItem.boqItemId) {
                return { ...b, executedQuantity: Math.max(Number(b.executedQuantity) || 0, Number(tempPaymentItem.totalQuantity) || 0) };
            }
            return b;
        });
        
        const newData = { ...masterData, payments: updatedPayments, boqItems: updatedBoqItems };
        setMasterData(newData);
        setEditingPaymentItemIndex(null);
        setTempPaymentItem(null);
        triggerAutoSave(newData);
    };

    // --- QUANTITY VALIDATION COLOR HELPER ---
    const getQuantityStatusColor = (totalQty: number, contractQty: number) => {
        if (!contractQty || contractQty === 0) return '';
        const ratio = totalQty / contractQty;
        
        if (ratio > 1.25) return 'bg-red-100 text-red-900 border-red-200'; // Critical (> 125%)
        if (ratio > 1.0) return 'bg-yellow-100 text-yellow-900 border-yellow-200'; // Warning (> 100% to 125%)
        return 'bg-white';
    };

    // Calculated Previous Payment Total for Cumulative Logic
    const previousTotalPayments = useMemo(() => {
        if (masterData.payments.length === 0) return 0;
        return Math.max(...masterData.payments.map(p => p.cumulativeAmount || 0), 0);
    }, [masterData.payments]);

    // Map each BOQ item ID to its linked daily logs
    const logsByBoqItemId = useMemo(() => {
        const map = new Map<string, ProjectLog[]>();
        masterData.logs.forEach(log => {
            if (log.boqItemId) {
                const list = map.get(log.boqItemId) || [];
                list.push(log);
                map.set(log.boqItemId, list);
            }
        });
        return map;
    }, [masterData.logs]);

    // Filterable BOQ items that can be linked to logs (non-note items)
    const linkableBoqItems = useMemo(() => {
        return masterData.boqItems.filter(item => Boolean(item.quantity || item.unitPrice));
    }, [masterData.boqItems]);

    // --- SMART IPC / AUTOMATIC PAYMENT GENERATOR LOGIC ---
    const openSmartPaymentGenerator = () => {
        if (linkableBoqItems.length === 0) {
            alert("لا توجد بنود مقايسة مسجلة في هذا المشروع حتى الآن. يرجى إضافة أو تحليل المقايسة أولاً من تبويب (مقايسة).");
            setActiveTab('boq');
            return;
        }

        const nextInvoiceNum = String(masterData.payments.length + 1);
        const latestPayment = masterData.payments.length > 0 ? masterData.payments[0] : null;

        // Build lookup map of previous quantities from the latest payment
        const prevQtyByBoqId = new Map<string, number>();
        const prevQtyByCode = new Map<string, number>();
        if (latestPayment && Array.isArray(latestPayment.items)) {
            latestPayment.items.forEach(pItem => {
                const pq = Number(pItem.totalQuantity) || 0;
                if (pItem.boqItemId) prevQtyByBoqId.set(pItem.boqItemId, pq);
                if (pItem.itemCode) prevQtyByCode.set(`${String(pItem.itemCode).trim()}_${(pItem.description || '').slice(0, 25)}`, pq);
            });
        }

        const draftItems: PaymentItem[] = linkableBoqItems.map(bItem => {
            const codeKey = `${String(bItem.itemCode).trim()}_${(bItem.description || '').slice(0, 25)}`;
            const prevQty = prevQtyByBoqId.has(bItem.id)
                ? prevQtyByBoqId.get(bItem.id)!
                : (prevQtyByCode.get(codeKey) || 0);
            const boqExecQty = Number(bItem.executedQuantity) || 0;
            const totalQty = Math.max(boqExecQty, prevQty);
            const currQty = Math.max(0, Number((totalQty - prevQty).toFixed(3)));
            const price = Number(bItem.unitPrice) || 0;
            const ratio = 100;
            const totalVal = Math.round(totalQty * price * (ratio / 100));

            return {
                boqItemId: bItem.id,
                batchName: bItem.batchName || '',
                itemCode: bItem.itemCode,
                description: bItem.description,
                unit: bItem.unit || 'م',
                contractQuantity: Number(bItem.quantity) || 0,
                prevQuantity: prevQty,
                currQuantity: currQty,
                totalQuantity: totalQty,
                unitPrice: price,
                completionRatio: ratio,
                totalValue: totalVal
            };
        });

        const hasActiveOrLinkedItems = draftItems.some(
            d => (d.totalQuantity || 0) > 0 || (d.currQuantity || 0) > 0 || (d.boqItemId && (logsByBoqItemId.get(d.boqItemId)?.length || 0) > 0)
        );

        setSmartIpcDraftItems(draftItems);
        setSmartIpcShowAllBoq(!hasActiveOrLinkedItems);
        setSmartIpcInvoiceNumber(nextInvoiceNum);
        setSmartIpcDate(new Date().toISOString().split('T')[0]);
        setSmartIpcNote(`مستخلص جاري رقم (${nextInvoiceNum}) - مولد تلقائياً من المقايسة واليوميات`);
        setShowSmartPaymentModal(true);
    };

    const handleSmartDraftItemChange = (index: number, field: 'currQuantity' | 'totalQuantity' | 'completionRatio' | 'prevQuantity', rawVal: any) => {
        setSmartIpcDraftItems(prev => {
            const next = [...prev];
            const item = { ...next[index] };
            const numVal = Math.max(0, parseFloat(String(rawVal || '0')) || 0);

            let prevQ = Number(item.prevQuantity) || 0;
            let currQ = Number(item.currQuantity) || 0;
            let totalQ = Number(item.totalQuantity) || 0;
            let ratio = Number(item.completionRatio) || 100;
            const price = Number(item.unitPrice) || 0;

            if (field === 'prevQuantity') {
                prevQ = numVal;
                totalQ = Number((prevQ + currQ).toFixed(3));
            } else if (field === 'currQuantity') {
                currQ = numVal;
                totalQ = Number((prevQ + currQ).toFixed(3));
            } else if (field === 'totalQuantity') {
                totalQ = numVal;
                currQ = Math.max(0, Number((totalQ - prevQ).toFixed(3)));
            } else if (field === 'completionRatio') {
                ratio = Math.min(100, Math.max(0, numVal));
            }

            item.prevQuantity = prevQ;
            item.currQuantity = currQ;
            item.totalQuantity = totalQ;
            item.completionRatio = ratio;
            item.totalValue = Math.round(totalQ * price * (ratio / 100));

            next[index] = item;
            return next;
        });
    };

    const smartIpcCalculations = useMemo(() => {
        const itemsCumulativeValue = smartIpcDraftItems.reduce((sum, item) => sum + (Number(item.totalValue) || 0), 0);
        const itemsCurrentPeriodValue = smartIpcDraftItems.reduce((sum, item) => {
            const currQ = Number(item.currQuantity) || 0;
            const price = Number(item.unitPrice) || 0;
            const ratio = Number(item.completionRatio) || 100;
            return sum + Math.round(currQ * price * (ratio / 100));
        }, 0);

        const cumulativeAmount = Math.max(itemsCumulativeValue, previousTotalPayments + itemsCurrentPeriodValue);
        const grossCurrentWork = itemsCurrentPeriodValue > 0
            ? itemsCurrentPeriodValue
            : Math.max(0, cumulativeAmount - previousTotalPayments);

        const retentionAmount = Math.round(grossCurrentWork * ((Number(smartIpcRetentionPercent) || 0) / 100));
        const advanceDeductionAmount = Math.round(grossCurrentWork * ((Number(smartIpcAdvancePercent) || 0) / 100));
        const taxesAndOtherAmount = Math.round(grossCurrentWork * ((Number(smartIpcTaxesPercent) || 0) / 100));
        const totalDeductions = retentionAmount + advanceDeductionAmount + taxesAndOtherAmount;
        const netPayableAfterDeductions = Math.max(0, grossCurrentWork - totalDeductions);

        const activeItemsCount = smartIpcDraftItems.filter(i => (i.totalQuantity || 0) > 0 || (i.currQuantity || 0) > 0).length;
        const linkedLogsCount = smartIpcDraftItems.reduce((acc, i) => {
            if ((i.totalQuantity || 0) > 0 || (i.currQuantity || 0) > 0) {
                return acc + (i.boqItemId ? (logsByBoqItemId.get(i.boqItemId)?.length || 0) : 0);
            }
            return acc;
        }, 0);

        return {
            cumulativeAmount,
            grossCurrentWork,
            retentionAmount,
            advanceDeductionAmount,
            taxesAndOtherAmount,
            totalDeductions,
            netPayableAfterDeductions,
            activeItemsCount,
            linkedLogsCount
        };
    }, [smartIpcDraftItems, previousTotalPayments, smartIpcRetentionPercent, smartIpcAdvancePercent, smartIpcTaxesPercent, logsByBoqItemId]);

    const handlePrintPaymentIPC = (pay: ProjectPayment) => {
        const projName = masterData.projectName || seedProject?.name || initialProjectData?.name || 'مشروع هندسي';
        const contractorName = masterData.projectContractor || seedProject?.contractor || initialProjectData?.contractor || 'المقاول العام';
        const itemsList = (pay.items || []).filter(i => (i.totalQuantity || 0) > 0 || (i.currQuantity || 0) > 0);
        const grossWork = pay.grossCurrentWork ?? pay.netAmount ?? 0;
        const retAmt = pay.retentionAmount || 0;
        const advAmt = pay.advanceDeductionAmount || 0;
        const taxAmt = pay.taxesAndOtherAmount || 0;
        const netPayable = pay.netPayableAfterDeductions ?? pay.netAmount ?? 0;

        // Collect linked daily logs for items included in this payment
        const relatedLogs: { itemCode: string; log: ProjectLog }[] = [];
        itemsList.forEach(it => {
            if (it.boqItemId) {
                const lList = logsByBoqItemId.get(it.boqItemId) || [];
                lList.forEach(l => relatedLogs.push({ itemCode: it.itemCode || '-', log: l }));
            }
        });

        // Group items by BOQ (طبقا للمقايسات) for official print
        const groupedForPrint = new Map<string, PaymentItem[]>();
        itemsList.forEach(it => {
            const matchedBoq = it.boqItemId
                ? masterData.boqItems.find(b => b.id === it.boqItemId)
                : masterData.boqItems.find(b => String(b.itemCode).trim() === String(it.itemCode).trim());
            const bName = (it.batchName || matchedBoq?.batchName || (matchedBoq as any)?.category || 'المقايسة الأساسية').trim() || 'المقايسة الأساسية';
            const arr = groupedForPrint.get(bName) || [];
            arr.push(it);
            groupedForPrint.set(bName, arr);
        });

        let serialCounter = 1;
        const rowsHtml = itemsList.length > 0 ? Array.from(groupedForPrint.entries()).map(([batchName, groupItems]) => {
            const groupSubtotal = groupItems.reduce((s, i) => s + (Number(i.totalValue) || 0), 0);
            const groupHeaderRow = `
                <tbody style="page-break-inside: avoid; break-inside: avoid;">
                    <tr style="background:#e0e7ff !important; color:#1e1b4b !important; font-weight:900;">
                        <td colspan="4" style="text-align:right !important; padding:6px 10px !important; font-size:12.5px !important; border:1.5px solid #000 !important;">
                            📂 ${batchName} (${groupItems.length} بند)
                        </td>
                        <td colspan="3" style="text-align:left !important; padding:6px 10px !important; font-size:12px !important; border:1.5px solid #000 !important;">
                            إجمالي المقايسة: ${groupSubtotal.toLocaleString()} ج.م
                        </td>
                    </tr>
                </tbody>
            `;
            const itemBlocks = groupItems.map((it) => {
                const idx = serialCounter++;
                return `
                    <tbody class="ipc-item-block" style="page-break-inside: avoid !important; break-inside: avoid !important;">
                        <tr class="ipc-item-desc-row">
                            <td colspan="7" style="text-align:right !important; padding:6px 10px !important; background:#f1f5f9 !important; font-size:12.5px !important; font-weight:800 !important; line-height:1.5 !important; border:1.5px solid #000 !important; border-bottom:1px dashed #475569 !important; word-break:normal !important; overflow-wrap:break-word !important;">
                                <span style="display:inline-block; background:#1e3a8a !important; color:#ffffff !important; padding:1px 8px; border-radius:4px; font-size:11.5px; font-weight:900; margin-left:6px;">
                                    م(${idx}) - بند (${it.itemCode || '-'})
                                </span>
                                ${it.unit ? `<span style="display:inline-block; background:#e2e8f0 !important; color:#0f172a !important; padding:1px 6px; border-radius:4px; font-size:11px; font-weight:800; margin-left:6px;">الوحدة: ${it.unit}</span>` : ''}
                                <span style="color:#000 !important; font-weight:800;">${it.description || '-'}</span>
                            </td>
                        </tr>
                        <tr class="ipc-item-nums-row">
                            <td style="padding:5px 4px !important; text-align:center !important; border:1px solid #000 !important; border-bottom:2px solid #000 !important; background:#ffffff !important;">
                                <div style="font-size:9.5px !important; color:#334155 !important; font-weight:800 !important; margin-bottom:2px !important; text-align:center !important;">الكمية التعاقدية</div>
                                <div style="font-size:11.5px !important; font-weight:900 !important; color:#000 !important; text-align:center !important;">${(it.contractQuantity || 0).toLocaleString()} ${it.unit || ''}</div>
                            </td>
                            <td style="padding:5px 4px !important; text-align:center !important; border:1px solid #000 !important; border-bottom:2px solid #000 !important; background:#ffffff !important;">
                                <div style="font-size:9.5px !important; color:#334155 !important; font-weight:800 !important; margin-bottom:2px !important; text-align:center !important;">السابقة</div>
                                <div style="font-size:11.5px !important; font-weight:800 !important; color:#000 !important; text-align:center !important;">${(it.prevQuantity || 0).toLocaleString()}</div>
                            </td>
                            <td style="padding:5px 4px !important; text-align:center !important; border:1px solid #000 !important; border-bottom:2px solid #000 !important; background:#f0fdf4 !important;">
                                <div style="font-size:9.5px !important; color:#166534 !important; font-weight:800 !important; margin-bottom:2px !important; text-align:center !important;">الحالية</div>
                                <div style="font-size:11.5px !important; font-weight:900 !important; color:#166534 !important; text-align:center !important;">${(it.currQuantity || 0).toLocaleString()}</div>
                            </td>
                            <td style="padding:5px 4px !important; text-align:center !important; border:1px solid #000 !important; border-bottom:2px solid #000 !important; background:#eff6ff !important;">
                                <div style="font-size:9.5px !important; color:#1e40af !important; font-weight:800 !important; margin-bottom:2px !important; text-align:center !important;">الإجمالية</div>
                                <div style="font-size:11.5px !important; font-weight:900 !important; color:#1e40af !important; text-align:center !important;">${(it.totalQuantity || 0).toLocaleString()}</div>
                            </td>
                            <td style="padding:5px 4px !important; text-align:center !important; border:1px solid #000 !important; border-bottom:2px solid #000 !important; background:#ffffff !important;">
                                <div style="font-size:9.5px !important; color:#334155 !important; font-weight:800 !important; margin-bottom:2px !important; text-align:center !important;">الفئة</div>
                                <div style="font-size:11.5px !important; font-weight:800 !important; color:#000 !important; text-align:center !important;">${(it.unitPrice || 0).toLocaleString()}</div>
                            </td>
                            <td style="padding:5px 4px !important; text-align:center !important; border:1px solid #000 !important; border-bottom:2px solid #000 !important; background:#ffffff !important;">
                                <div style="font-size:9.5px !important; color:#334155 !important; font-weight:800 !important; margin-bottom:2px !important; text-align:center !important;">النسبة</div>
                                <div style="font-size:11.5px !important; font-weight:800 !important; color:#000 !important; text-align:center !important;">${it.completionRatio || 100}%</div>
                            </td>
                            <td style="padding:5px 4px !important; text-align:center !important; border:1px solid #000 !important; border-bottom:2px solid #000 !important; background:#fefce8 !important;">
                                <div style="font-size:9.5px !important; color:#713f12 !important; font-weight:800 !important; margin-bottom:2px !important; text-align:center !important;">الإجمالي</div>
                                <div style="font-size:12px !important; font-weight:900 !important; color:#000 !important; text-align:center !important;">${(it.totalValue || 0).toLocaleString()} ج.م</div>
                            </td>
                        </tr>
                    </tbody>
                `;
            }).join('');
            return groupHeaderRow + itemBlocks;
        }).join('') : `<tbody><tr><td colspan="7" style="padding:8px; font-size:13px;">مستخلص إجمالي بدون تفصيل بنود</td></tr></tbody>`;

        const logsEvidenceHtml = relatedLogs.length > 0 ? `
            <h3 style="margin-top: 18px; font-size: 15px !important;">📸 بيان توثيق الأعمال من سجل اليوميات المرتبطة ببنود المستخلص (${relatedLogs.length} يومية)</h3>
            <table class="ipc-a4-table" style="width:100% !important; max-width:100% !important; table-layout:fixed !important; border-collapse:collapse !important;">
                <thead>
                    <tr>
                        <th style="width: 14%; font-size:11.5px !important; padding:6px 4px !important;">رقم البند</th>
                        <th style="width: 16%; font-size:11.5px !important; padding:6px 4px !important;">تاريخ اليومية</th>
                        <th style="width: 55%; font-size:11.5px !important; padding:6px 6px !important;">بيان الأعمال المنفذة بالموقع</th>
                        <th style="width: 15%; font-size:11.5px !important; padding:6px 4px !important;">المرفقات</th>
                    </tr>
                </thead>
                <tbody>
                    ${relatedLogs.slice(0, 20).map(r => `
                        <tr>
                            <td style="font-size:11.5px !important; padding:5px 4px !important;">بند (${r.itemCode})</td>
                            <td style="font-size:11.5px !important; padding:5px 4px !important;">${r.log.date}</td>
                            <td style="text-align: right !important; font-size:11.5px !important; padding:5px 6px !important; word-break:normal; overflow-wrap:break-word;">${r.log.content}</td>
                            <td style="font-size:11.5px !important; padding:5px 4px !important;">${r.log.images?.length ? `${r.log.images.length} صورة موقع` : 'سجل نصي'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        ` : '';

        const bodyHtml = `
            <style>
                .ipc-print-root {
                    width: 100% !important;
                    max-width: 100% !important;
                    box-sizing: border-box !important;
                    overflow: hidden !important;
                }
                .ipc-a4-table {
                    width: 100% !important;
                    max-width: 100% !important;
                    min-width: 0 !important;
                    table-layout: fixed !important;
                    border-collapse: collapse !important;
                    margin: 8px 0 14px 0 !important;
                    border: 1.5px solid #000 !important;
                }
                .ipc-a4-table th, .ipc-a4-table td {
                    box-sizing: border-box !important;
                    word-break: normal !important;
                    overflow-wrap: break-word !important;
                }
            </style>
            <div class="ipc-print-root">
                <div class="info-box" style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:10px; margin-bottom:12px; padding:8px 12px !important; font-size:13px !important;">
                    <div>
                        <div style="margin-bottom:2px;"><strong>اسم المشروع:</strong> ${projName}</div>
                        <div style="margin-bottom:0;"><strong>المقاول المنفذ:</strong> ${contractorName}</div>
                    </div>
                    <div>
                        <div style="margin-bottom:2px;"><strong>رقم المستخلص:</strong> مستخلص جاري رقم (${pay.invoiceNumber || '-'})</div>
                        <div style="margin-bottom:0;"><strong>تاريخ المستخلص:</strong> ${pay.date}</div>
                    </div>
                </div>

                <h3 style="font-size:15px !important; margin:10px 0 6px 0 !important;">1. جدول حصر كميات وقيم البنود المنفذة</h3>
                <table class="ipc-a4-table">
                    <colgroup>
                        <col style="width: 15%;" />
                        <col style="width: 12%;" />
                        <col style="width: 12%;" />
                        <col style="width: 13%;" />
                        <col style="width: 14%;" />
                        <col style="width: 11%;" />
                        <col style="width: 23%;" />
                    </colgroup>
                    <thead>
                        <tr style="background:#cbd5e1 !important;">
                            <th style="padding:6px 4px !important; font-size:11.5px !important; font-weight:900 !important;">الكمية التعاقدية</th>
                            <th style="padding:6px 4px !important; font-size:11.5px !important; font-weight:900 !important;">السابقة</th>
                            <th style="padding:6px 4px !important; font-size:11.5px !important; font-weight:900 !important;">الحالية</th>
                            <th style="padding:6px 4px !important; font-size:11.5px !important; font-weight:900 !important;">الإجمالية</th>
                            <th style="padding:6px 4px !important; font-size:11.5px !important; font-weight:900 !important;">الفئة</th>
                            <th style="padding:6px 4px !important; font-size:11.5px !important; font-weight:900 !important;">النسبة</th>
                            <th style="padding:6px 4px !important; font-size:11.5px !important; font-weight:900 !important;">الإجمالي</th>
                        </tr>
                    </thead>
                    ${rowsHtml}
                </table>

                <h3 style="font-size:15px !important; margin:14px 0 6px 0 !important;">2. الملخص المالي وحساب الاستقطاعات والصافي المستحق</h3>
                <table class="ipc-a4-table">
                    <tbody>
                        <tr>
                            <td style="text-align:right !important; width:65%; padding:6px 10px !important; font-size:13px !important; background:#f8fafc !important;"><strong>إجمالي قيمة الأعمال التراكمية حتى تاريخه</strong></td>
                            <td style="width:35%; padding:6px 10px !important; font-size:14px !important;"><strong>${(pay.cumulativeAmount || 0).toLocaleString()} ج.م</strong></td>
                        </tr>
                        <tr>
                            <td style="text-align:right !important; padding:6px 10px !important; font-size:13px !important; background:#f8fafc !important;"><strong>إجمالي أعمال المستخلص الجاري (قبل الاستقطاعات)</strong></td>
                            <td style="padding:6px 10px !important; font-size:14px !important; color:#1e40af !important;"><strong>${grossWork.toLocaleString()} ج.م</strong></td>
                        </tr>
                        ${retAmt > 0 ? `
                        <tr>
                            <td style="text-align:right !important; padding:6px 10px !important; font-size:12.5px !important; color:#991b1b !important;">(-) خصم تأمين ضمان أعمال (${pay.retentionPercent || 0}%)</td>
                            <td style="padding:6px 10px !important; font-size:13px !important; color:#991b1b !important;">- ${retAmt.toLocaleString()} ج.م</td>
                        </tr>` : ''}
                        ${advAmt > 0 ? `
                        <tr>
                            <td style="text-align:right !important; padding:6px 10px !important; font-size:12.5px !important; color:#991b1b !important;">(-) استرداد دفعة مقدمة (${pay.advanceDeductionPercent || 0}%)</td>
                            <td style="padding:6px 10px !important; font-size:13px !important; color:#991b1b !important;">- ${advAmt.toLocaleString()} ج.م</td>
                        </tr>` : ''}
                        ${taxAmt > 0 ? `
                        <tr>
                            <td style="text-align:right !important; padding:6px 10px !important; font-size:12.5px !important; color:#991b1b !important;">(-) ضرائب ودمغات واستقطاعات أخرى (${pay.taxesAndOtherPercent || 0}%)</td>
                            <td style="padding:6px 10px !important; font-size:13px !important; color:#991b1b !important;">- ${taxAmt.toLocaleString()} ج.م</td>
                        </tr>` : ''}
                        <tr style="background:#dcfce7 !important;">
                            <td style="text-align:right !important; padding:8px 10px !important; font-size:14px !important; color:#14532d !important;"><strong>صافي المستحق للصرف للمقاول في هذا المستخلص</strong></td>
                            <td style="padding:8px 10px !important; font-size:16px !important; font-weight:900 !important; color:#14532d !important;"><strong>${netPayable.toLocaleString()} ج.م</strong></td>
                        </tr>
                    </tbody>
                </table>

                ${pay.note ? `<div class="highlight-box" style="font-size:12.5px !important; padding:8px 10px !important;"><strong>ملاحظات المستخلص:</strong> ${pay.note}</div>` : ''}
                ${logsEvidenceHtml}

                <div style="margin-top:28px; display:grid; grid-template-columns: repeat(4, 1fr); gap:12px; text-align:center; page-break-inside:avoid; font-size:12.5px !important;">
                    <div style="border-top:2px solid #000; padding-top:8px; text-align:center !important;"><strong>المقاول المنفذ</strong><br/><span style="font-size:11.5px;">${contractorName}</span></div>
                    <div style="border-top:2px solid #000; padding-top:8px; text-align:center !important;"><strong>مهندس التنفيذ / الحصر</strong></div>
                    <div style="border-top:2px solid #000; padding-top:8px; text-align:center !important;"><strong>المكتب الفني / المراجعة</strong></div>
                    <div style="border-top:2px solid #000; padding-top:8px; text-align:center !important;"><strong>اعتماد الاستشاري / المدير</strong></div>
                </div>
            </div>
        `;

        printService.printReport(
            bodyHtml,
            `مستخلص جاري رقم (${pay.invoiceNumber || '-'})`,
            `IPC-${pay.invoiceNumber || '1'}-${pay.date}`,
            { subtitle: `مشروع: ${projName} | المقاول: ${contractorName}` }
        );
    };

    const saveSmartGeneratedPayment = (andPrint: boolean = false) => {
        const activeItems = smartIpcDraftItems.filter(i => (i.totalQuantity || 0) > 0 || (i.currQuantity || 0) > 0);
        if (activeItems.length === 0 && smartIpcCalculations.cumulativeAmount <= 0) {
            alert("يرجى إدخال الكمية المنفذة لبند واحد على الأقل لتوليد المستخلص.");
            return;
        }

        const newPay: ProjectPayment = {
            id: `pay_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            invoiceNumber: smartIpcInvoiceNumber.trim() || String(masterData.payments.length + 1),
            date: smartIpcDate || new Date().toISOString().split('T')[0],
            cumulativeAmount: smartIpcCalculations.cumulativeAmount,
            grossCurrentWork: smartIpcCalculations.grossCurrentWork,
            retentionPercent: Number(smartIpcRetentionPercent) || 0,
            retentionAmount: smartIpcCalculations.retentionAmount,
            advanceDeductionPercent: Number(smartIpcAdvancePercent) || 0,
            advanceDeductionAmount: smartIpcCalculations.advanceDeductionAmount,
            taxesAndOtherPercent: Number(smartIpcTaxesPercent) || 0,
            taxesAndOtherAmount: smartIpcCalculations.taxesAndOtherAmount,
            netPayableAfterDeductions: smartIpcCalculations.netPayableAfterDeductions,
            netAmount: smartIpcCalculations.netPayableAfterDeductions,
            note: smartIpcNote.trim() || `مستخلص جاري رقم (${smartIpcInvoiceNumber || (masterData.payments.length + 1)})`,
            items: activeItems,
            isAutoGenerated: true
        };

        // Sync updated totalQuantity back to masterData.boqItems so BOQ executed quantities are always up-to-date
        const draftQtyByBoqId = new Map<string, number>();
        activeItems.forEach(item => {
            if (item.boqItemId && (item.totalQuantity || 0) > 0) {
                draftQtyByBoqId.set(item.boqItemId, Number(item.totalQuantity));
            }
        });

        const updatedBoqItems = masterData.boqItems.map(b => {
            if (draftQtyByBoqId.has(b.id)) {
                const newExec = Math.max(Number(b.executedQuantity) || 0, draftQtyByBoqId.get(b.id)!);
                return { ...b, executedQuantity: newExec };
            }
            return b;
        });

        const updatedPayments = [newPay, ...masterData.payments].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const newData = {
            ...masterData,
            payments: updatedPayments,
            boqItems: updatedBoqItems
        };

        setMasterData(newData);
        setShowSmartPaymentModal(false);
        setExpandedPaymentId(newPay.id);
        triggerAutoSave(newData);

        if (andPrint) {
            setTimeout(() => handlePrintPaymentIPC(newPay), 150);
        }
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
    const confirmDeleteBOQItem = () => {
        if (!editingBoqItem) return;
        const newData = { ...masterData, boqItems: masterData.boqItems.filter(item => item.id !== editingBoqItem.id) };
        setMasterData(newData);
        setEditingBoqItem(null);
        setShowBoqDeleteConfirm(false);
        triggerAutoSave(newData, { _allowEmptyBoq: true });
    };
    const saveBOQItemEdit = () => {
        if (!editingBoqItem) return;
        const qty = Number(editingBoqItem.quantity) || 0;
        const price = Number(editingBoqItem.unitPrice) || 0;
        const execQty = Number(editingBoqItem.executedQuantity) || 0;
        const updatedItem: BOQItem = {
            ...editingBoqItem,
            quantity: qty,
            unitPrice: price,
            executedQuantity: execQty,
            total: qty * price
        };
        const newData = {
            ...masterData,
            boqItems: masterData.boqItems.map(item => item.id === updatedItem.id ? updatedItem : item)
        };
        setMasterData(newData);
        setEditingBoqItem(null);
        triggerAutoSave(newData);
    };
    const addItemBelow = () => {
        if (!editingBoqItem) return;
        const currentIndex = masterData.boqItems.findIndex(i => i.id === editingBoqItem.id);
        if (currentIndex === -1) return;
        const newItem: BOQItem = {
            id: `boq_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            itemCode: String(currentIndex + 2),
            description: 'بند جديد',
            unit: editingBoqItem.unit || 'عدد',
            quantity: 1,
            unitPrice: 0,
            total: 0,
            executedQuantity: 0,
            batchId: editingBoqItem.batchId,
            batchName: editingBoqItem.batchName
        };
        const newItems = [...masterData.boqItems];
        newItems.splice(currentIndex + 1, 0, newItem);
        const newData = { ...masterData, boqItems: newItems };
        setMasterData(newData);
        setEditingBoqItem(newItem);
        triggerAutoSave(newData);
    };

    const BOQ_ITEM_REPORT_BUTTONS: {
        type: BOQItemReportType;
        label: string;
        reportTitle: string;
        icon: string;
        activeBg: string;
        defaultBg: string;
    }[] = [
        {
            type: 'materials',
            label: 'تحليل خامات ومواد البند',
            reportTitle: 'تقرير تحليل خامات ومواد البند',
            icon: 'fa-cubes-stacked',
            activeBg: 'bg-indigo-100 border-indigo-400 text-indigo-900 ring-2 ring-indigo-200',
            defaultBg: 'bg-slate-50 hover:bg-indigo-50 border-slate-200 hover:border-indigo-300 text-slate-600 hover:text-indigo-700'
        },
        {
            type: 'method_specs',
            label: 'طريقة تنفيذ البند والمواصفات الفنية',
            reportTitle: 'تقرير طريقة تنفيذ البند والمواصفات الفنية',
            icon: 'fa-compass-drafting',
            activeBg: 'bg-teal-100 border-teal-400 text-teal-900 ring-2 ring-teal-200',
            defaultBg: 'bg-slate-50 hover:bg-teal-50 border-slate-200 hover:border-teal-300 text-slate-600 hover:text-teal-700'
        },
        {
            type: 'productivity_labor',
            label: 'تحليل معدلات الإنتاج والعمالة والمعدات',
            reportTitle: 'تقرير تحليل معدلات الإنتاج والعمالة والمعدات للبند',
            icon: 'fa-users-gear',
            activeBg: 'bg-amber-100 border-amber-400 text-amber-900 ring-2 ring-amber-200',
            defaultBg: 'bg-slate-50 hover:bg-amber-50 border-slate-200 hover:border-amber-300 text-slate-600 hover:text-amber-700'
        },
        {
            type: 'inspection_quality',
            label: 'نموذج فحص واستلام واشتراطات الجودة',
            reportTitle: 'نموذج فحص واستلام واشتراطات الجودة للبند',
            icon: 'fa-clipboard-check',
            activeBg: 'bg-purple-100 border-purple-400 text-purple-900 ring-2 ring-purple-200',
            defaultBg: 'bg-slate-50 hover:bg-purple-50 border-slate-200 hover:border-purple-300 text-slate-600 hover:text-purple-700'
        }
    ];

    const isEmergencyFallbackReport = (html?: string): boolean => {
        if (!html) return true;
        return (
            html.includes('Emergency-Quota-Protection') ||
            html.includes('Emergency-Static-Brain') ||
            html.includes('وضع الاستمرارية الهندسية') ||
            html.includes('وضع الطوارئ (Offline Mode)') ||
            html.includes('تعذر توليد التقرير حالياً')
        );
    };

    const handleBoqItemReportButtonClick = async (targetItem: BOQItem, reportType: BOQItemReportType, forceRegenerate: boolean = false) => {
        if (!targetItem || generatingBoqReportInfo) return;

        const existingSaved = targetItem.savedReports?.[reportType];
        if (existingSaved && existingSaved.content && !isEmergencyFallbackReport(existingSaved.content) && !forceRegenerate) {
            setViewingBoqReportItem(targetItem);
            setViewingBoqReport(existingSaved);
            return;
        }

        const btnMeta = BOQ_ITEM_REPORT_BUTTONS.find(b => b.type === reportType);
        const fullTitle = `${btnMeta?.reportTitle || 'تقرير هندسي للبند'} - بند (${targetItem.itemCode || '-'})`;

        setGeneratingBoqReportInfo({ itemId: targetItem.id, type: reportType });
        try {
            const htmlContent = await aiHelper.generateBOQItemSubReport(reportType, targetItem, {
                projectName: masterData.projectName || initialProjectData?.name || '',
                contractor: masterData.projectContractor || initialProjectData?.contractor || '',
                location: initialProjectData?.location || ''
            });

            if (isEmergencyFallbackReport(htmlContent)) {
                window.dispatchEvent(new CustomEvent('open_gemini_key_modal'));
                return;
            }

            const savedReportObj: BOQItemSavedReport = {
                type: reportType,
                title: fullTitle,
                content: htmlContent,
                updatedAt: new Date().toISOString()
            };

            const updatedBoqItem: BOQItem = {
                ...targetItem,
                savedReports: {
                    ...(targetItem.savedReports || {}),
                    [reportType]: savedReportObj
                }
            };

            setViewingBoqReportItem(updatedBoqItem);
            setViewingBoqReport(savedReportObj);

            if (editingBoqItem && editingBoqItem.id === targetItem.id) {
                setEditingBoqItem(updatedBoqItem);
            }

            const newData = {
                ...masterData,
                boqItems: masterData.boqItems.map(item => item.id === updatedBoqItem.id ? updatedBoqItem : item)
            };
            setMasterData(newData);
            triggerAutoSave(newData);
        } catch (err) {
            console.error("Failed to generate BOQ item report:", err);
            alert("حدث خطأ أثناء توليد التقرير. يرجى المحاولة مرة أخرى.");
        } finally {
            setGeneratingBoqReportInfo(null);
        }
    };

    const handleUpdateReportContent = (newHtml: string) => {
        if (!viewingBoqReport) return;
        const targetItem = viewingBoqReportItem || editingBoqItem;
        if (!targetItem) return;

        const updatedReport: BOQItemSavedReport = {
            ...viewingBoqReport,
            content: newHtml,
            updatedAt: new Date().toISOString()
        };

        const updatedItem: BOQItem = {
            ...targetItem,
            savedReports: {
                ...(targetItem.savedReports || {}),
                [viewingBoqReport.type]: updatedReport
            }
        };

        setViewingBoqReport(updatedReport);
        setViewingBoqReportItem(updatedItem);
        if (editingBoqItem && editingBoqItem.id === targetItem.id) {
            setEditingBoqItem(updatedItem);
        }

        const newData = {
            ...masterData,
            boqItems: masterData.boqItems.map(item => item.id === updatedItem.id ? updatedItem : item)
        };
        setMasterData(newData);
        triggerAutoSave(newData);
    };

    const handleDeleteBoqItemReport = () => {
        if (!viewingBoqReport) return;
        const targetItem = viewingBoqReportItem || editingBoqItem;
        if (!targetItem) return;

        const updatedSavedReports = { ...(targetItem.savedReports || {}) };
        delete updatedSavedReports[viewingBoqReport.type];

        const updatedItem: BOQItem = {
            ...targetItem,
            savedReports: updatedSavedReports
        };

        if (editingBoqItem && editingBoqItem.id === targetItem.id) {
            setEditingBoqItem(updatedItem);
        }

        const newData = {
            ...masterData,
            boqItems: masterData.boqItems.map(item => item.id === updatedItem.id ? updatedItem : item)
        };
        setMasterData(newData);
        triggerAutoSave(newData);

        setIsBoqReportMenuOpen(false);
        setIsDirectEditingReport(false);
        setViewingBoqReport(null);
        setViewingBoqReportItem(null);
    };

    const applyColumnWidth = (tableIdx: number, colIdx: number, percent: number | 'auto') => {
        if (!viewingBoqReport) return;
        const currentHtml = reportEditableContentRef.current ? reportEditableContentRef.current.innerHTML : viewingBoqReport.content;
        const updatedHtml = applyTableColumnWidthToHtml(currentHtml, tableIdx, colIdx, percent);
        handleUpdateReportContent(updatedHtml);
        setEditingColumnModal(null);
    };

    const handleReportContentClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (isDirectEditingReport) return;
        const target = e.target as HTMLElement;
        const th = target.closest('th');
        if (!th) return;
        const table = th.closest('table');
        if (!table) return;

        const row = th.parentElement;
        if (!row) return;

        const thElements = Array.from(row.children) as HTMLElement[];
        const colIndex = thElements.indexOf(th);
        if (colIndex === -1) return;

        const container = reportContainerRef.current;
        if (!container) return;
        const allTables = Array.from(container.querySelectorAll('table'));
        const tableIdx = allTables.indexOf(table);
        if (tableIdx === -1) return;

        let currentPercent = 25;
        const styleWidth = th.style.width || '';
        const match = styleWidth.match(/(\d+)%/);
        if (match) {
            currentPercent = parseInt(match[1], 10);
        } else {
            const tableRect = table.getBoundingClientRect();
            const thRect = th.getBoundingClientRect();
            if (tableRect.width > 0) {
                currentPercent = Math.max(5, Math.min(80, Math.round((thRect.width / tableRect.width) * 100)));
            }
        }

        setEditingColumnModal({
            tableIndex: tableIdx,
            columnIndex: colIndex,
            columnTitle: th.innerText?.replace('⚙', '').trim() || `العمود ${colIndex + 1}`,
            currentPercent
        });
        setCustomPercentInput(currentPercent);
    };

    const handleReportDirectInput = () => {
        if (!reportEditableContentRef.current || !viewingBoqReport) return;
        setReportAutoSaveStatus('saving');

        if (reportAutoSaveTimeoutRef.current) {
            clearTimeout(reportAutoSaveTimeoutRef.current);
        }

        reportAutoSaveTimeoutRef.current = setTimeout(() => {
            const currentHtml = reportEditableContentRef.current?.innerHTML;
            if (!currentHtml) return;

            const targetItem = viewingBoqReportItem || editingBoqItem;
            if (!targetItem) return;

            const updatedReport: BOQItemSavedReport = {
                ...viewingBoqReport,
                content: currentHtml,
                updatedAt: new Date().toISOString()
            };

            const updatedItem: BOQItem = {
                ...targetItem,
                savedReports: {
                    ...(targetItem.savedReports || {}),
                    [viewingBoqReport.type]: updatedReport
                }
            };

            setViewingBoqReport(updatedReport);
            setViewingBoqReportItem(updatedItem);
            if (editingBoqItem && editingBoqItem.id === targetItem.id) {
                setEditingBoqItem(updatedItem);
            }

            const newData = {
                ...masterData,
                boqItems: masterData.boqItems.map(item => item.id === updatedItem.id ? updatedItem : item)
            };
            setMasterData(newData);
            triggerAutoSave(newData);

            setReportAutoSaveStatus('saved');
            setTimeout(() => {
                setReportAutoSaveStatus('idle');
            }, 2500);
        }, 600);
    };

    const handleReportDirectBlur = () => {
        if (reportAutoSaveTimeoutRef.current) {
            clearTimeout(reportAutoSaveTimeoutRef.current);
        }
        const currentHtml = reportEditableContentRef.current?.innerHTML;
        if (!currentHtml || !viewingBoqReport) return;

        const targetItem = viewingBoqReportItem || editingBoqItem;
        if (!targetItem) return;

        const updatedReport: BOQItemSavedReport = {
            ...viewingBoqReport,
            content: currentHtml,
            updatedAt: new Date().toISOString()
        };

        const updatedItem: BOQItem = {
            ...targetItem,
            savedReports: {
                ...(targetItem.savedReports || {}),
                [viewingBoqReport.type]: updatedReport
            }
        };

        setViewingBoqReport(updatedReport);
        setViewingBoqReportItem(updatedItem);
        if (editingBoqItem && editingBoqItem.id === targetItem.id) {
            setEditingBoqItem(updatedItem);
        }

        const newData = {
            ...masterData,
            boqItems: masterData.boqItems.map(item => item.id === updatedItem.id ? updatedItem : item)
        };
        setMasterData(newData);
        triggerAutoSave(newData);

        setReportAutoSaveStatus('saved');
        setTimeout(() => {
            setReportAutoSaveStatus('idle');
        }, 2500);
    };

    const handlePrintBoqItemReport = (report: BOQItemSavedReport) => {
        const item = viewingBoqReportItem || editingBoqItem;
        if (!item) return;
        const projName = masterData.projectName || initialProjectData?.name || 'المشروع';
        const contractorName = masterData.projectContractor || initialProjectData?.contractor || '-';
        printService.printReport(
            enhanceReportHtml(report.content),
            report.title,
            `BOQ-${item.itemCode || '1'}-${report.type.toUpperCase()}`,
            {
                subtitle: `مشروع: ${projName} | المقاول: ${contractorName}`,
                showHeader: false,
                showFooter: false
            }
        );
    };

    const handleOpenBoqReportInLetterEditor = (report: BOQItemSavedReport) => {
        const item = viewingBoqReportItem || editingBoqItem;
        if (!item) return;
        const projName = masterData.projectName || initialProjectData?.name || 'تقرير هندسي استشاري';
        const fullHtml = ReportGenerator.buildReport(report.title, report.content, {
            subtitle: `مشروع: ${projName} | بند رقم (${item.itemCode || '-'})`,
            ref: `BOQ-${item.itemCode || '1'}-${report.type.toUpperCase()}`
        });
        setViewingBoqReport(null);
        setViewingBoqReportItem(null);
        setEditingBoqItem(null);
        onClose();
        navigate(`/editor/${projectId}/${projectId}`, {
            state: {
                initialContent: fullHtml,
                filename: report.title.replace(/\s+/g, '_'),
                boqItemId: item.id,
                boqReportType: report.type,
                returnToMasterData: true
            }
        });
    };
    
    const handleDeleteBatchClick = (batchId: string) => { setBatchToDeleteId(batchId); };
    const confirmDeleteBatch = () => { if (!batchToDeleteId) return; const newData = { ...masterData, boqItems: masterData.boqItems.filter(item => (item.batchId || 'default') !== batchToDeleteId) }; setMasterData(newData); setBatchToDeleteId(null); triggerAutoSave(newData, { _allowEmptyBoq: true }); };
    const saveBatchRename = (batchId: string) => { if (!newBatchName.trim()) return; const newData = { ...masterData, boqItems: masterData.boqItems.map(item => (item.batchId || 'default') === batchId ? { ...item, batchName: newBatchName } : item) }; setMasterData(newData); setRenamingBatchId(null); triggerAutoSave(newData); };
    
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
                          <div className="flex flex-col gap-2 w-full">
                              {/* Row 1: 4 Action Buttons at Top */}
                              <div className="flex items-center justify-between gap-2 border-b border-indigo-100/80 pb-1.5">
                                  <div className="flex items-center gap-1.5 flex-wrap">
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
                                      }} className="text-emerald-700 text-xs bg-emerald-100/80 border border-emerald-300 hover:bg-emerald-200 px-3 py-1 rounded-lg transition flex items-center gap-1 font-bold shadow-sm" title="إضافة بند لهذا الباب">
                                          <i className="fa-solid fa-plus text-[10px]"></i> بند
                                      </button>
                                      <button onClick={(e) => { e.stopPropagation(); handleEditBatchAsLetter(groupItems, groupName); }} className="text-indigo-700 text-xs bg-indigo-100/80 border border-indigo-300 hover:bg-indigo-200 px-2.5 py-1 rounded-lg transition flex items-center justify-center font-bold shadow-sm" title="تحليل وتصدير خطاب">
                                          <i className="fa-solid fa-file-signature"></i>
                                      </button>
                                      {!isDefault && !isRenaming && (
                                          <button onClick={(e) => { e.stopPropagation(); setRenamingBatchId(bId); setNewBatchName(groupName); }} className="text-blue-700 text-xs bg-blue-100/80 border border-blue-300 hover:bg-blue-200 px-2.5 py-1 rounded-lg transition flex items-center justify-center font-bold shadow-sm" title="إعادة تسمية المقايسة">
                                              <i className="fa-solid fa-pen"></i>
                                          </button>
                                      )}
                                      {!isDefault && (
                                          <button onClick={(e) => { e.stopPropagation(); handleDeleteBatchClick(bId); }} className="text-red-700 text-xs bg-red-100/80 border border-red-300 hover:bg-red-200 px-2.5 py-1 rounded-lg transition flex items-center justify-center font-bold shadow-sm" title="حذف المقايسة بالكامل">
                                              <i className="fa-solid fa-trash"></i>
                                          </button>
                                      )}
                                  </div>
                                  
                                  {/* Collapse indicator */}
                                  <button 
                                      onClick={() => { const newSet = new Set(collapsedBatches); if (newSet.has(bId)) newSet.delete(bId); else newSet.add(bId); setCollapsedBatches(newSet); }}
                                      className="text-indigo-600 hover:text-indigo-800 text-xs font-bold px-2 py-0.5 rounded bg-indigo-100/50"
                                  >
                                      <i className={`fa-solid ${isCollapsed ? 'fa-chevron-left' : 'fa-chevron-down'} text-indigo-500`}></i>
                                  </button>
                              </div>

                              {/* Row 2: Section Title & Item Count */}
                              <div className="cursor-pointer w-full" onClick={() => { const newSet = new Set(collapsedBatches); if (newSet.has(bId)) newSet.delete(bId); else newSet.add(bId); setCollapsedBatches(newSet); }}> 
                                  <div className="flex items-center gap-2"> 
                                      <i className="fa-solid fa-layer-group text-indigo-500 text-base"></i> 
                                      {isRenaming ? ( 
                                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}> 
                                              <input type="text" value={newBatchName} onChange={(e) => setNewBatchName(e.target.value)} className="text-xs p-1.5 rounded border border-indigo-300 outline-none" autoFocus /> 
                                              <button onClick={() => saveBatchRename(bId)} className="bg-green-500 text-white rounded px-2.5 py-1 text-xs font-bold"><i className="fa-solid fa-check"></i></button> 
                                          </div> 
                                      ) : ( 
                                          <span className="font-extrabold text-indigo-950 text-sm sm:text-base">{groupName} <span className="text-xs text-indigo-500 font-normal">({groupItems.length} بند)</span></span> 
                                      )} 
                                  </div> 
                              </div> 

                              {/* Row 3: Total & Executed Financial Stats */}
                              <div className="flex items-center gap-2 pt-1"> 
                                  <div className="text-[10px] bg-white px-2 py-1 rounded-md border border-indigo-200 text-indigo-900 font-bold shadow-sm"> <span className="text-indigo-400 font-normal ml-0.5">إجمالي:</span> {batchTotal.toLocaleString()} ج.م </div> 
                                  <div className="text-[10px] bg-white px-2 py-1 rounded-md border border-green-200 text-green-900 font-bold shadow-sm"> <span className="text-green-600 font-normal ml-0.5">منفذ:</span> {batchExecutedTotal.toLocaleString()} ج.م </div> 
                              </div>
                          </div> 
                      </td> 
                  </tr> 
                  {!isCollapsed && groupItems.map((item) => {
                      const isNote = !item.quantity && !item.unitPrice;
                      const linkedLogs = logsByBoqItemId.get(item.id) || [];
                      const linkedPhotosCount = linkedLogs.reduce((sum, l) => sum + ((l.images || []).length), 0);
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
                                      <>
                                          {/* 4 AI Engineering Report Icon Buttons for BOQ Item */}
                                          <div className="flex items-center gap-2 pt-1 pb-0.5 flex-wrap" onClick={(e) => e.stopPropagation()}>
                                              {BOQ_ITEM_REPORT_BUTTONS.map((btn) => {
                                                  const savedContent = item.savedReports?.[btn.type]?.content;
                                                  const isSaved = Boolean(savedContent && !isEmergencyFallbackReport(savedContent));
                                                  const isGeneratingThis = generatingBoqReportInfo?.itemId === item.id && generatingBoqReportInfo?.type === btn.type;
                                                  return (
                                                      <button
                                                          key={btn.type}
                                                          type="button"
                                                          disabled={Boolean(generatingBoqReportInfo)}
                                                          onClick={(e) => {
                                                              e.stopPropagation();
                                                              handleBoqItemReportButtonClick(item, btn.type, false);
                                                          }}
                                                          className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition border shadow-xs relative ${
                                                              isSaved ? btn.activeBg : btn.defaultBg
                                                          } ${generatingBoqReportInfo && !isGeneratingThis ? 'opacity-50' : 'hover:scale-105 active:scale-95'}`}
                                                          title={isSaved ? `${btn.label} (محفوظ - اضغط للعرض)` : `${btn.label} (اضغط لإنشاء التقرير بالذكاء الاصطناعي)`}
                                                      >
                                                          {isSaved && (
                                                              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-600 text-white rounded-full flex items-center justify-center text-[8px] font-bold shadow-xs">
                                                                  ✓
                                                              </span>
                                                          )}
                                                          {isGeneratingThis ? (
                                                              <i className="fa-solid fa-circle-notch fa-spin text-xs text-indigo-600"></i>
                                                          ) : (
                                                              <i className={`fa-solid ${btn.icon} text-sm ${isSaved ? 'text-current' : 'text-slate-600'}`}></i>
                                                          )}
                                                      </button>
                                                  );
                                              })}
                                          </div>
                                          <div className="grid grid-cols-4 gap-1.5 sm:gap-2 text-center bg-slate-50 p-2 rounded-xl border border-slate-200 mt-1"> 
                                              <div className="flex flex-col border-l border-slate-200"><span className="text-xs text-slate-500 font-bold">الوحدة</span><span className="text-sm sm:text-base font-bold">{item.unit}</span></div> 
                                              <div className="flex flex-col border-l border-slate-200"><span className="text-xs text-slate-500 font-bold">الكمية</span><span className="text-sm sm:text-base font-bold font-mono">{item.quantity}</span></div> 
                                              <div className="flex flex-col border-l border-slate-200"><span className="text-xs text-slate-500 font-bold">الفئة</span><span className="text-sm sm:text-base font-bold font-mono">{item.unitPrice}</span></div> 
                                              <div className="flex flex-col"><span className="text-xs text-slate-500 font-bold">الإجمالي</span><span className="text-sm sm:text-base font-bold font-mono">{Math.round(item.quantity * item.unitPrice)}</span></div> 
                                          </div>
                                          <div className="flex items-center justify-between gap-2 pt-1">
                                              {linkedLogs.length > 0 ? (
                                                  <button
                                                      type="button"
                                                      onClick={(e) => {
                                                          e.stopPropagation();
                                                          setViewingBoqLogsItem(item);
                                                      }}
                                                      className="bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
                                                  >
                                                      <i className="fa-solid fa-clipboard-check text-indigo-600"></i>
                                                      <span>{linkedLogs.length} يومية مرتبطة</span>
                                                      {linkedPhotosCount > 0 && (
                                                          <span className="bg-indigo-600 text-white text-[10px] px-1.5 py-0.2 rounded-full font-mono flex items-center gap-1">
                                                              <i className="fa-solid fa-camera text-[8px]"></i> {linkedPhotosCount}
                                                          </span>
                                                      )}
                                                  </button>
                                              ) : (
                                                  <span className="text-[11px] text-slate-400 font-bold flex items-center gap-1">
                                                      <i className="fa-regular fa-clipboard"></i> لا توجد يوميات مرتبطة بهذا البند
                                                  </span>
                                              )}
                                              <button
                                                  type="button"
                                                  onClick={(e) => {
                                                      e.stopPropagation();
                                                      setSelectedLogBoqItemId(item.id);
                                                      setActiveTab('logs');
                                                  }}
                                                  className="bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-2.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-xs shrink-0"
                                              >
                                                  <i className="fa-solid fa-plus text-[10px]"></i>
                                                  <span>تسجيل يومية للبند</span>
                                              </button>
                                          </div>
                                      </>
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
                    <div className="flex items-center gap-1.5">
                        <h3 className="font-bold flex items-center gap-2 text-xs whitespace-nowrap">
                            <i className="fa-solid fa-clipboard-list text-yellow-400 text-sm"></i>
                            <span>سجل المشروع</span>
                        </h3>
                        <button
                            type="button"
                            onClick={() => triggerAutoSave(masterData)}
                            className={`w-6 h-6 rounded-full border transition flex items-center justify-center shrink-0 ${
                                autoSaveStatus === 'saving' || isRefreshing
                                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
                                    : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30'
                            }`}
                            title={autoSaveStatus === 'saving' ? 'جاري الحفظ والمزامنة...' : 'حفظ ومزامنة فورية مفعلة'}
                        >
                            <i className={`fa-solid ${autoSaveStatus === 'saving' || isRefreshing ? 'fa-arrows-rotate fa-spin' : 'fa-check'} text-[10px]`}></i>
                        </button>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex gap-2">
                            <button onClick={() => { triggerAutoSave(masterData); onClose(); }} className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition transform active:scale-90" title="إغلاق وحفظ"><i className="fa-solid fa-times text-sm"></i></button>
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

                                {/* BOQ Item Link Selector */}
                                {linkableBoqItems.length > 0 && (
                                    <div className="mb-2 flex items-center gap-1.5">
                                        <div className="relative flex-1">
                                            <select
                                                value={selectedLogBoqItemId}
                                                onChange={(e) => setSelectedLogBoqItemId(e.target.value)}
                                                className="w-full bg-indigo-50/70 border border-indigo-200 text-indigo-950 text-[11px] font-bold rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500"
                                            >
                                                <option value="">🔗 ربط اليومية ببند من المقايسة (اختياري)...</option>
                                                {linkableBoqItems.map(bItem => (
                                                    <option key={bItem.id} value={bItem.id}>
                                                        {bItem.batchName ? `[${bItem.batchName}] ` : ''}بند ({bItem.itemCode}): {(bItem.description || '').slice(0, 65)}{(bItem.description || '').length > 65 ? '...' : ''}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        {selectedLogBoqItemId && (
                                            <button
                                                type="button"
                                                onClick={() => setSelectedLogBoqItemId('')}
                                                className="w-7 h-7 rounded-lg bg-red-50 text-red-600 border border-red-200 flex items-center justify-center hover:bg-red-100 transition shrink-0"
                                                title="إلغاء ربط البند"
                                            >
                                                <i className="fa-solid fa-times text-xs"></i>
                                            </button>
                                        )}
                                    </div>
                                )}

                                {isUploadingImages && (
                                    <div className="mb-2 text-xs text-blue-600 font-bold flex items-center gap-2 bg-blue-50 p-2 rounded-lg">
                                        <i className="fa-solid fa-gear fa-spin"></i> جاري ضغط الصور وتجهيزها للحفظ...
                                    </div>
                                )}
                                {logImages.length > 0 && <div className="flex gap-2 overflow-x-auto py-1 mb-2">{logImages.map((img, idx) => <div key={idx} className="relative w-12 h-12 shrink-0"><img src={img} alt="" className="w-full h-full object-cover rounded-lg border border-blue-200" /><button onClick={() => setLogImages(prev => prev.filter((_, i) => i !== idx))} className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center text-[8px]"><i className="fa-solid fa-times"></i></button></div>)}</div>}
                                <textarea className="w-full p-2 text-xs rounded-lg border border-blue-200 outline-none focus:ring-2 focus:ring-blue-500 transition text-slate-900 resize-y min-h-[60px]" placeholder="ماذا تم إنجازه؟" value={masterData.newLog} onChange={(e) => setMasterData({...masterData, newLog: e.target.value})} rows={2} />
                            </div>
                            
                            <div className="space-y-2 pr-1">
                                {visibleLogs.map((log, idx) => {
                                    const matchedBoqItem = log.boqItemId ? masterData.boqItems.find(b => b.id === log.boqItemId) : undefined;
                                    return (
                                    <div key={log.id} className="relative group">
                                        {editingLogId === log.id ? (
                                            <div className="bg-blue-50 p-2 rounded-xl border-2 border-blue-300 shadow-md">
                                                <input type="date" className="w-full p-2 text-xs bg-white border border-blue-200 rounded-lg mb-2" value={tempEditLogDate} onChange={(e) => setTempEditLogDate(e.target.value)} />
                                                {linkableBoqItems.length > 0 && (
                                                    <select
                                                        value={tempEditLogBoqItemId}
                                                        onChange={(e) => setTempEditLogBoqItemId(e.target.value)}
                                                        className="w-full p-2 text-xs bg-white border border-indigo-200 rounded-lg mb-2 font-bold text-indigo-950"
                                                    >
                                                        <option value="">🔗 بدون ربط ببند مقايسة</option>
                                                        {linkableBoqItems.map(bItem => (
                                                            <option key={bItem.id} value={bItem.id}>
                                                                {bItem.batchName ? `[${bItem.batchName}] ` : ''}بند ({bItem.itemCode}): {(bItem.description || '').slice(0, 65)}
                                                            </option>
                                                        ))}
                                                    </select>
                                                )}
                                                <textarea className="w-full p-2 text-xs bg-white border border-blue-200 rounded-lg mb-2 min-h-[80px]" value={tempEditLogContent} onChange={(e) => setTempEditLogContent(e.target.value)} />
                                                <div className="flex gap-2 flex-wrap mb-2">{tempEditLogImages.map((img, i) => <div key={i} className="relative w-16 h-16"><img src={img} alt="" className="w-full h-full object-cover rounded-lg" /><button onClick={() => setTempEditLogImages(prev => prev.filter((_, idx) => idx !== i))} className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-[10px]"><i className="fa-solid fa-times"></i></button></div>)}</div>
                                                <div className="flex justify-between"><button onClick={() => setSourceModal({ type: 'editLog', title: 'إضافة صورة' })} className="text-[10px] text-blue-600 bg-blue-100 px-2 py-1 rounded">إضافة صورة</button><div className="flex gap-2"><button onClick={() => saveEditLog(log.id)} className="text-xs bg-blue-600 text-white px-3 py-1 rounded">حفظ</button><button onClick={() => setEditingLogId(null)} className="text-xs bg-white border px-3 py-1 rounded">إلغاء</button></div></div>
                                            </div>
                                        ) : (
                                            <div id={`log-card-${log.id}`} className={`p-3 rounded-2xl shadow-sm border-4 hover:shadow-md transition relative flex flex-col gap-2 ${getCardColor(idx)}`}>
                                                {/* Hidden project name & contractor for sharing */}
                                                <div className="hidden share-only-project-name flex items-start gap-2.5 mb-1.5 pb-2.5 border-b-2 border-black/10">
                                                    <div className="w-9 h-9 rounded-xl bg-blue-600/10 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                                                        <i className="fa-solid fa-building text-base"></i>
                                                    </div>
                                                    <div className="flex flex-col flex-1 min-w-0">
                                                        <span className="share-text-lift text-base font-extrabold text-slate-800 leading-snug block">
                                                            مشروع: {masterData.projectName || seedProject?.name || initialProjectData?.name || 'بدون اسم'}
                                                        </span>
                                                        <span className="share-text-lift text-[11px] font-bold text-slate-500 leading-snug block mt-0.5">
                                                            المقاول: {masterData.projectContractor || seedProject?.contractor || initialProjectData?.contractor || 'المقاول العام'}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="flex justify-between items-center border-b border-black/5 pb-2">
                                                    <div className="flex items-center gap-2"><div className="w-8 h-8 rounded-full bg-white/50 text-slate-700 flex items-center justify-center shadow-sm"><i className="fa-solid fa-calendar-day text-xs"></i></div><span className="font-bold text-slate-800 text-base font-mono bg-white/50 px-3 h-8 flex items-center justify-center rounded border border-black/5 leading-none"><span className="share-text-lift">{log.date}</span></span></div>
                                                    <div className="flex gap-1 log-actions-container">
                                                        <button onClick={() => shareLogToWhatsApp(log)} className="w-7 h-7 rounded-full bg-white/50 text-slate-500 hover:text-green-600 transition flex items-center justify-center" title="مشاركة واتساب"><i className="fa-brands fa-whatsapp text-[12px]"></i></button>
                                                        <button onClick={() => { setEditingLogId(log.id); setTempEditLogContent(log.content); setTempEditLogDate(log.date); setTempEditLogImages(log.images || []); setTempEditLogBoqItemId(log.boqItemId || ''); }} className="w-7 h-7 rounded-full bg-white/50 text-slate-500 hover:text-blue-600 transition flex items-center justify-center"><i className="fa-solid fa-pen text-[10px]"></i></button>
                                                        <button onClick={() => setLogToDeleteId(log.id)} className="w-7 h-7 rounded-full bg-white/50 text-slate-500 hover:text-red-600 transition flex items-center justify-center"><i className="fa-solid fa-trash text-[10px]"></i></button>
                                                    </div>
                                                </div>
                                                {(log.boqItemId || log.boqItemCode) && (
                                                    <div
                                                        onClick={() => {
                                                            if (matchedBoqItem) {
                                                                setViewingBoqLogsItem(matchedBoqItem);
                                                            } else {
                                                                setActiveTab('boq');
                                                            }
                                                        }}
                                                        className="log-boq-badge bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-300 text-indigo-950 px-2.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition flex items-start justify-between gap-2"
                                                    >
                                                        <div className="flex items-start gap-1.5 flex-1 min-w-0 text-right">
                                                            <i className="fa-solid fa-link text-indigo-600 text-[10px] shrink-0 mt-1"></i>
                                                            <p className="share-text-lift text-xs font-bold text-indigo-950 leading-relaxed flex-1 min-w-0 line-clamp-2 break-words">
                                                                <span className="font-mono font-extrabold text-indigo-800 ml-1">
                                                                    بند ({log.boqItemCode || matchedBoqItem?.itemCode || '-'}):
                                                                </span>
                                                                <span>{getShortBoqText(log.boqItemDescription || matchedBoqItem?.description || '', 72)}</span>
                                                            </p>
                                                        </div>
                                                        <i className="share-hide-icon fa-solid fa-arrow-up-right-from-square text-[10px] text-indigo-600 shrink-0 mt-1"></i>
                                                    </div>
                                                )}
                                                <p className="share-text-lift text-slate-900 text-lg leading-relaxed font-bold whitespace-pre-wrap mb-0.5">{log.content}</p>
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
                                )})}
                                
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
                            {/* Smart One-Click IPC Generator Banner */}
                            <div className="bg-gradient-to-r from-emerald-700 via-teal-700 to-indigo-800 rounded-xl p-3 text-white shadow-md flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 shrink-0 border border-emerald-500/30">
                                <div className="flex items-start gap-2.5">
                                    <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-xs border border-white/25 flex items-center justify-center shrink-0 text-amber-300 shadow-inner">
                                        <i className="fa-solid fa-wand-magic-sparkles text-lg"></i>
                                    </div>
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <h4 className="font-extrabold text-xs sm:text-sm text-white">مُنشئ المستخلص التلقائي الذكي (IPC)</h4>
                                            <span className="bg-amber-400/20 text-amber-200 border border-amber-300/30 text-[9px] font-bold px-2 py-0.5 rounded-md">
                                                من المقايسة واليوميات
                                            </span>
                                        </div>
                                        <p className="text-[10px] text-emerald-100 font-bold mt-0.5 leading-snug">
                                            يحسب تلقائياً الكميات السابقة والحالية والفئات والاستقطاعات ويربط البنود بإثباتات اليوميات المصورة
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={openSmartPaymentGenerator}
                                    className="bg-white text-emerald-900 hover:bg-emerald-50 px-3.5 py-2 rounded-xl text-xs font-black shadow-md transition flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                                >
                                    <i className="fa-solid fa-bolt text-amber-500"></i>
                                    <span>توليد مستخلص ذكي الآن</span>
                                </button>
                            </div>

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
                                {masterData.payments.map((pay, idx) => {
                                    const hasDeductions = Boolean((pay.retentionAmount || 0) > 0 || (pay.advanceDeductionAmount || 0) > 0 || (pay.taxesAndOtherAmount || 0) > 0);
                                    const totalDeductions = (pay.retentionAmount || 0) + (pay.advanceDeductionAmount || 0) + (pay.taxesAndOtherAmount || 0);
                                    return (
                                    <div key={pay.id} className="relative group animate-scale-in">
                                        {editingPayId === pay.id ? (
                                            <div className="bg-green-50 p-4 rounded-xl border-2 border-green-300 shadow-md flex flex-col gap-2">
                                                <div className="grid grid-cols-3 gap-2">
                                                    <div className="flex flex-col">
                                                        <label className="text-[9px] font-bold text-slate-500 mb-0.5">التاريخ</label>
                                                        <input type="date" className="w-full p-2 text-xs rounded-lg border bg-white font-bold" value={tempEditPayDate} onChange={(e) => setTempEditPayDate(e.target.value)} />
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <label className="text-[9px] font-bold text-slate-500 mb-0.5">إجمالي الأعمال</label>
                                                        <input type="number" className="w-full p-2 text-xs rounded-lg border bg-white font-bold" value={tempEditPayCumulative} onChange={(e) => { setTempEditPayCumulative(e.target.value); setTempEditPayAmount(e.target.value); }} />
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <label className="text-[9px] font-bold text-green-700 mb-0.5">صافي المستخلص</label>
                                                        <input type="number" className="w-full p-2 text-xs rounded-lg border bg-white font-bold text-green-800" value={tempEditPayAmount} onChange={(e) => setTempEditPayAmount(e.target.value)} />
                                                    </div>
                                                </div>
                                                <textarea className="w-full p-2 text-xs rounded-lg border bg-white font-bold" value={tempEditPayNote} onChange={(e) => setTempEditPayNote(e.target.value)} placeholder="البيان..." />
                                                <div className="flex justify-end gap-2"><button onClick={() => saveEditPayment(pay.id)} className="text-xs font-bold bg-green-600 text-white px-4 py-1.5 rounded-lg shadow-sm">حفظ التعديل</button><button onClick={() => setEditingPayId(null)} className="text-xs font-bold bg-white border px-4 py-1.5 rounded-lg">إلغاء</button></div>
                                            </div>
                                        ) : (
                                            <div className={`p-3 rounded-2xl shadow-sm border-4 hover:shadow-md transition relative flex flex-col gap-2 ${getCardColor(idx)}`}>
                                                <div className="flex justify-between items-center border-b border-black/5 pb-2">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <div className="w-8 h-8 rounded-full bg-white/50 text-green-700 flex items-center justify-center shadow-sm"><i className="fa-solid fa-file-invoice text-xs"></i></div>
                                                        <span className="font-bold text-slate-800 text-base font-mono bg-white/50 px-3 h-8 flex items-center justify-center rounded border border-black/5 leading-none pt-1">{pay.date} | #{pay.invoiceNumber || '-'}</span>
                                                        {pay.isAutoGenerated && (
                                                            <span className="bg-emerald-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 shadow-xs">
                                                                <i className="fa-solid fa-wand-magic-sparkles text-[8px] text-amber-300"></i>
                                                                مستخلص ذكي
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex gap-1">
                                                        <button onClick={() => handlePrintPaymentIPC(pay)} title="طباعة / تصدير المستخلص الرسمي" className="w-7 h-7 rounded-full bg-white/70 text-emerald-700 hover:bg-emerald-600 hover:text-white transition flex items-center justify-center shadow-xs"><i className="fa-solid fa-print text-[10px]"></i></button>
                                                        <button onClick={() => { setEditingPayId(pay.id); setTempEditPayCumulative((pay.cumulativeAmount || pay.netAmount || (pay as any).amount || 0).toString()); setTempEditPayAmount((pay.netAmount || (pay as any).amount || pay.cumulativeAmount || 0).toString()); setTempEditPayNote(pay.note || ''); setTempEditPayDate(pay.date); }} className="w-7 h-7 rounded-full bg-white/50 text-slate-500 hover:text-blue-600 transition flex items-center justify-center"><i className="fa-solid fa-pen text-[10px]"></i></button>
                                                        <button onClick={() => setPaymentToDeleteId(pay.id)} className="w-7 h-7 rounded-full bg-white/50 text-slate-500 hover:text-red-600 transition flex items-center justify-center"><i className="fa-solid fa-trash text-[10px]"></i></button>
                                                    </div>
                                                </div>
                                                <div className="bg-white/40 p-2.5 rounded-lg border border-black/5 flex flex-col gap-1">
                                                    <div className="flex justify-between items-center border-b border-black/5 pb-1 mb-1">
                                                        <span className="text-[10px] text-slate-500 font-bold">إجمالي الأعمال التراكمي</span>
                                                        <span className="font-bold text-slate-900 font-mono text-base">{(pay.cumulativeAmount || 0).toLocaleString()} ج.م</span>
                                                    </div>
                                                    {hasDeductions && (
                                                        <div className="flex flex-col gap-0.5 border-b border-black/5 pb-1 mb-1 text-[10px]">
                                                            <div className="flex justify-between items-center text-slate-600 font-bold">
                                                                <span>أعمال الفترة الجارية (قبل الخصم):</span>
                                                                <span className="font-mono">{(pay.grossCurrentWork || 0).toLocaleString()} ج.م</span>
                                                            </div>
                                                            <div className="flex justify-between items-center text-red-700 font-bold">
                                                                <span>إجمالي الاستقطاعات ({[
                                                                    pay.retentionPercent ? `ضمان ${pay.retentionPercent}%` : '',
                                                                    pay.advanceDeductionPercent ? `دفعة مقدمة ${pay.advanceDeductionPercent}%` : '',
                                                                    pay.taxesAndOtherPercent ? `ضرائب ${pay.taxesAndOtherPercent}%` : ''
                                                                ].filter(Boolean).join(' + ')}):</span>
                                                                <span className="font-mono">- {totalDeductions.toLocaleString()} ج.م</span>
                                                            </div>
                                                        </div>
                                                    )}
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-[10px] text-slate-500 font-bold">صافي المستحق للصرف</span>
                                                        <span className="font-black text-green-800 font-mono text-lg">{(pay.netPayableAfterDeductions ?? pay.netAmount ?? 0).toLocaleString()} ج.م</span>
                                                    </div>
                                                    <p className="text-slate-900 text-sm leading-relaxed font-bold whitespace-pre-wrap mt-1 opacity-80">{pay.note}</p>
                                                </div>
                                                {pay.items && pay.items.length > 0 && <button onClick={() => setExpandedPaymentId(expandedPaymentId === pay.id ? null : pay.id)} className="w-full bg-white/30 hover:bg-white/60 p-1 rounded-lg transition flex items-center justify-center gap-1 text-[10px] font-bold text-slate-600 mt-1">{expandedPaymentId === pay.id ? 'إخفاء التفاصيل' : `عرض البنود (${pay.items.length} بند)`}</button>}
                                                {expandedPaymentId === pay.id && pay.items && (() => {
                                                    // Group payment items by BOQ (تقسيم البنود في المستخلص طبقا للمقايسات)
                                                    const groupedPaymentItems: {
                                                        batchName: string;
                                                        entries: { item: PaymentItem; index: number; matchedBoq?: BOQItem }[];
                                                        subtotalValue: number;
                                                    }[] = [];
                                                    const groupIndexMap = new Map<string, number>();

                                                    pay.items.forEach((item, i) => {
                                                        const matchedBoq = item.boqItemId
                                                            ? masterData.boqItems.find(b => b.id === item.boqItemId)
                                                            : masterData.boqItems.find(b =>
                                                                String(b.itemCode).trim() === String(item.itemCode).trim() &&
                                                                (!item.description || (b.description || '').trim().slice(0, 20) === (item.description || '').trim().slice(0, 20))
                                                              ) || masterData.boqItems.find(b => String(b.itemCode).trim() === String(item.itemCode).trim());

                                                        const batchName = (item.batchName || matchedBoq?.batchName || (matchedBoq as any)?.category || 'المقايسة الأساسية').trim() || 'المقايسة الأساسية';
                                                        if (!groupIndexMap.has(batchName)) {
                                                            groupIndexMap.set(batchName, groupedPaymentItems.length);
                                                            groupedPaymentItems.push({
                                                                batchName,
                                                                entries: [],
                                                                subtotalValue: 0
                                                            });
                                                        }
                                                        const gIdx = groupIndexMap.get(batchName)!;
                                                        groupedPaymentItems[gIdx].entries.push({ item, index: i, matchedBoq });
                                                        groupedPaymentItems[gIdx].subtotalValue += Number(item.totalValue) || 0;
                                                    });

                                                    return (
                                                        <div className="mt-2 space-y-3">
                                                            {groupedPaymentItems.map((group, gIdx) => (
                                                                <div key={gIdx} className="bg-white rounded-xl border-2 border-indigo-200/80 overflow-hidden shadow-xs">
                                                                    {/* BOQ Group Header */}
                                                                    <div className="bg-gradient-to-r from-indigo-50 via-blue-50 to-indigo-50 px-3 py-2 border-b border-indigo-200 flex flex-wrap items-center justify-between gap-2">
                                                                        <div className="flex items-center gap-2 min-w-0">
                                                                            <div className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                                                                                <i className="fa-solid fa-layer-group text-[10px]"></i>
                                                                            </div>
                                                                            <span className="font-black text-indigo-950 text-xs sm:text-sm truncate">
                                                                                {group.batchName}
                                                                            </span>
                                                                            <span className="bg-indigo-100 text-indigo-800 border border-indigo-200 px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0">
                                                                                {group.entries.length} بند
                                                                            </span>
                                                                        </div>
                                                                        <div className="bg-white px-2.5 py-1 rounded-lg border border-indigo-200 text-[10px] font-bold text-indigo-900 shadow-2xs shrink-0">
                                                                            <span className="text-slate-500 ml-1">إجمالي المقايسة:</span>
                                                                            <span className="font-mono font-black text-indigo-800">{group.subtotalValue.toLocaleString()} ج.م</span>
                                                                        </div>
                                                                    </div>

                                                                    {/* Items in this BOQ Group */}
                                                                    <div className="p-1.5 space-y-2 bg-slate-50/50">
                                                                        {group.entries.map(({ item, index: i, matchedBoq }) => {
                                                                            const isEditingThisItem = editingPaymentItemIndex && editingPaymentItemIndex.paymentId === pay.id && editingPaymentItemIndex.itemIndex === i;
                                                                            const quantityColorClass = getQuantityStatusColor(item.totalQuantity || 0, item.contractQuantity || 0);
                                                                            const itemLinkedLogs = matchedBoq ? (logsByBoqItemId.get(matchedBoq.id) || []) : [];

                                                                            return (
                                                                                <div key={i} className={`rounded-xl border p-2 text-[10px] transition ${isEditingThisItem ? 'bg-yellow-50 border-yellow-300 shadow-md' : 'bg-white border-slate-200 shadow-2xs'}`}>
                                                                                    {isEditingThisItem ? (
                                                                                        <div className="flex flex-col gap-2">
                                                                                            <div className="flex justify-between items-center bg-white p-1.5 rounded-lg border border-yellow-200">
                                                                                                <span className="font-bold text-slate-700">تعديل البند ({group.batchName})</span>
                                                                                                <input type="text" className="w-20 p-1 border rounded font-mono text-center text-xs" value={tempPaymentItem.itemCode} onChange={(e) => handleTempItemChange('itemCode', e.target.value)} placeholder="الكود" />
                                                                                            </div>
                                                                                            <input type="text" className="w-full p-1.5 border rounded-lg" value={tempPaymentItem.description} onChange={(e) => handleTempItemChange('description', e.target.value)} />
                                                                                            
                                                                                            <div className="grid grid-cols-2 gap-2 text-center bg-slate-100 p-1.5 rounded-lg border border-slate-200 mb-1">
                                                                                                <div className="flex flex-col"><label className="text-[8px] text-slate-500">التعاقدية</label><input type="number" className="w-full p-1 border rounded text-center font-bold" value={tempPaymentItem.contractQuantity} onChange={(e) => handleTempItemChange('contractQuantity', e.target.value)} /></div>
                                                                                                <div className="flex flex-col"><label className="text-[8px] text-slate-500">السابقة</label><input type="number" className="w-full p-1 border rounded text-center font-bold" value={tempPaymentItem.prevQuantity} onChange={(e) => handleTempItemChange('prevQuantity', e.target.value)} /></div>
                                                                                            </div>

                                                                                            <div className="grid grid-cols-3 gap-1 text-center">
                                                                                                <div className="flex flex-col"><label className="text-[8px] text-blue-600 font-bold">الإجمالية (تلقائي)</label><input type="number" className="w-full p-1 border rounded text-center font-black text-blue-700 border-blue-200 bg-blue-50" value={tempPaymentItem.totalQuantity} onChange={(e) => handleTempItemChange('totalQuantity', e.target.value)} /></div>
                                                                                                <div className="flex flex-col"><label className="text-[8px] text-slate-400">الفئة</label><input type="number" className="w-full p-1 border rounded text-center font-bold" value={tempPaymentItem.unitPrice} onChange={(e) => handleTempItemChange('unitPrice', e.target.value)} /></div>
                                                                                                <div className="flex flex-col"><label className="text-[8px] text-slate-400">نسبة %</label><input type="number" className="w-full p-1 border rounded text-center font-bold" value={tempPaymentItem.completionRatio} onChange={(e) => handleTempItemChange('completionRatio', e.target.value)} /></div>
                                                                                            </div>
                                                                                            
                                                                                            <div className="flex justify-between items-center bg-white p-1.5 rounded-lg border border-slate-200 mt-1">
                                                                                                <span className="text-[9px] text-slate-400">الحالية (ناتج): {tempPaymentItem.currQuantity?.toLocaleString()}</span>
                                                                                                <span className="font-black text-blue-800 font-mono">{(tempPaymentItem.totalValue || 0).toLocaleString()}</span>
                                                                                            </div>

                                                                                            <div className="flex gap-2 mt-1">
                                                                                                <button onClick={saveItemEdit} className="flex-1 bg-green-600 text-white py-1.5 rounded-lg font-bold hover:bg-green-700">حفظ فوري</button>
                                                                                                <button onClick={() => { setEditingPaymentItemIndex(null); setTempPaymentItem(null); }} className="flex-1 bg-slate-200 text-slate-700 py-1.5 rounded-lg font-bold hover:bg-slate-300">إلغاء</button>
                                                                                            </div>
                                                                                        </div>
                                                                                    ) : (
                                                                                        <div onClick={() => handleStartEditItem(pay.id, item, i)} className="cursor-pointer hover:bg-blue-50/40 transition p-1 rounded-lg">
                                                                                            {/* Row 1: Code & Desc */}
                                                                                            <div className="flex gap-2 items-center font-bold text-slate-800 mb-1.5">
                                                                                                <span className="bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200 font-mono text-sm shrink-0">{item.itemCode || '-'}</span>
                                                                                                <span className="truncate text-sm flex-1">{item.description}</span>
                                                                                                {matchedBoq && itemLinkedLogs.length > 0 && (
                                                                                                    <button
                                                                                                        type="button"
                                                                                                        onClick={(e) => {
                                                                                                            e.stopPropagation();
                                                                                                            setViewingBoqLogsItem(matchedBoq);
                                                                                                        }}
                                                                                                        className="bg-indigo-100 hover:bg-indigo-200 text-indigo-800 border border-indigo-200 px-1.5 py-0.5 rounded-md text-[9px] font-bold flex items-center gap-1 shrink-0"
                                                                                                        title="عرض يوميات وصور إثبات هذا البند"
                                                                                                    >
                                                                                                        <i className="fa-solid fa-camera text-[8px]"></i>
                                                                                                        <span>{itemLinkedLogs.length} يومية</span>
                                                                                                    </button>
                                                                                                )}
                                                                                                <i className="fa-solid fa-pen text-[8px] text-slate-300 shrink-0"></i>
                                                                                            </div>
                                                                                            {/* Row 2: Quantities */}
                                                                                            <div className="grid grid-cols-4 gap-1 text-center bg-slate-50 rounded-lg border border-slate-100 p-1.5 mb-1.5">
                                                                                                <div className="flex flex-col"><span className="text-[8px] text-slate-400">التعاقدية</span><span className="font-mono font-bold text-sm">{item.contractQuantity || 0}</span></div>
                                                                                                <div className="flex flex-col"><span className="text-[8px] text-slate-400">السابقة</span><span className="font-mono font-bold text-sm">{item.prevQuantity || 0}</span></div>
                                                                                                <div className="flex flex-col"><span className="text-[8px] text-green-600 font-bold">الحالية</span><span className="font-mono font-black text-green-700 text-sm">{item.currQuantity || 0}</span></div>
                                                                                                <div className={`flex flex-col rounded ${quantityColorClass}`}><span className="text-[8px] text-slate-600 font-bold">الإجمالية</span><span className="font-mono font-bold text-sm">{item.totalQuantity || 0}</span></div>
                                                                                            </div>
                                                                                            {/* Row 3: Financials */}
                                                                                            <div className="grid grid-cols-3 gap-1 text-center bg-blue-50/50 rounded-lg p-1.5 border border-blue-100">
                                                                                                <div className="flex flex-col items-center">
                                                                                                    <span className="text-slate-500 text-[9px] font-bold">الفئة</span>
                                                                                                    <span className="font-mono font-bold text-sm text-slate-800">{item.unitPrice?.toLocaleString()}</span>
                                                                                                </div>
                                                                                                <div className="flex flex-col items-center border-x border-blue-100/80">
                                                                                                    <span className="text-slate-500 text-[9px] font-bold">النسبة</span>
                                                                                                    <span className="font-mono font-bold text-sm text-slate-800">{item.completionRatio || 100}%</span>
                                                                                                </div>
                                                                                                <div className="flex flex-col items-center">
                                                                                                    <span className="text-blue-700 text-[9px] font-bold">الإجمالي</span>
                                                                                                    <span className="font-mono font-black text-blue-800 text-sm">{item.totalValue?.toLocaleString()}</span>
                                                                                                </div>
                                                                                            </div>
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        )}
                                    </div>
                                )})}
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
                                <div className="fixed inset-0 z-[1600] bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
                                    <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-scale-in relative max-h-[94vh] flex flex-col">
                                        {showBoqDeleteConfirm && <div className="absolute inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-6 rounded-2xl"><div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-xs text-center"><h4 className="font-bold mb-2">حذف البند؟</h4><div className="flex gap-3"><button onClick={confirmDeleteBOQItem} className="flex-1 bg-red-600 text-white py-2 rounded-xl">حذف</button><button onClick={() => setShowBoqDeleteConfirm(false)} className="flex-1 bg-slate-100 text-slate-700 py-2 rounded-xl">إلغاء</button></div></div></div>}
                                        <div className="bg-slate-900 text-white p-4 flex justify-between items-center shrink-0"><h3 className="font-bold text-white">تعديل البند</h3><button onClick={() => { setViewingBoqReport(null); setEditingBoqItem(null); }} className="w-8 h-8 rounded-full hover:bg-white/20 flex items-center justify-center"><i className="fa-solid fa-times"></i></button></div>
                                        <div className="p-4 space-y-3 overflow-y-auto flex-1">
                                            <div className="flex gap-2"><div className="w-24"><label className="block text-xs font-bold mb-1">رقم</label><input type="text" className="w-full p-2 border rounded-lg" value={editingBoqItem.itemCode} onChange={(e) => setEditingBoqItem({...editingBoqItem, itemCode: e.target.value})} /></div><div className="w-20"><label className="block text-xs font-bold mb-1">الوحدة</label><input type="text" className="w-full p-2 border rounded-lg" value={editingBoqItem.unit} onChange={(e) => setEditingBoqItem({...editingBoqItem, unit: e.target.value})} /></div><div className="flex-1"><label className="block text-xs font-bold mb-1">الفئة</label><input type="number" className="w-full p-2 border rounded-lg" value={editingBoqItem.unitPrice} onChange={(e) => setEditingBoqItem({...editingBoqItem, unitPrice: Number(e.target.value)})} /></div></div>
                                            <div><label className="block text-xs font-bold mb-1">بيان الأعمال</label><textarea className="w-full p-3 border rounded-lg h-24 resize-none text-sm" value={editingBoqItem.description} onChange={(e) => setEditingBoqItem({...editingBoqItem, description: e.target.value})}></textarea></div>
                                            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100"><div className="bg-slate-50 p-2 rounded-lg"><label className="block text-xs font-bold text-center">الكمية التعاقدية</label><input type="number" className="w-full p-2 border rounded-lg text-center" value={editingBoqItem.quantity} onChange={(e) => setEditingBoqItem({...editingBoqItem, quantity: Number(e.target.value)})} /></div><div className="bg-green-50 p-2 rounded-lg"><label className="block text-xs font-bold text-green-700 text-center">الكمية المنفذة</label><input type="number" className="w-full p-2 border rounded-lg text-center font-bold text-green-800" value={isNaN(Number(editingBoqItem.executedQuantity)) ? 0 : editingBoqItem.executedQuantity} onChange={(e) => setEditingBoqItem({...editingBoqItem, executedQuantity: Number(e.target.value)})} /></div></div>
                                        </div>
                                        <div className="p-4 bg-slate-50 border-t flex justify-between gap-2 shrink-0"><button type="button" onClick={() => setShowBoqDeleteConfirm(true)} className="px-4 py-2 bg-red-100 text-red-600 rounded-xl font-bold"><i className="fa-solid fa-trash"></i></button><button type="button" onClick={addItemBelow} className="px-4 py-2 bg-yellow-100 text-yellow-700 rounded-xl font-bold"><i className="fa-solid fa-plus"></i> إضافة أسفل</button><button type="button" onClick={saveBOQItemEdit} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-xl font-bold">حفظ التعديلات</button></div>
                                    </div>
                                </div>
                            )}

                            {/* Saved BOQ Item Sub-Report Viewer Modal (FULL SCREEN + Interactive Column Widths) */}
                            {viewingBoqReport && (viewingBoqReportItem || editingBoqItem) && (
                                <div className="fixed inset-0 z-[1750] bg-slate-900 flex flex-col w-screen h-screen overflow-hidden animate-fade-in">
                                    {/* Modal Header */}
                                    <div className="bg-slate-900 text-white px-3.5 py-2.5 flex items-center justify-between gap-2.5 shrink-0 relative border-b border-slate-800 shadow-md">
                                        {/* Right side: Icon + Title + Status */}
                                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                            <div className="w-7 h-7 rounded-lg bg-teal-600 flex items-center justify-center shrink-0">
                                                <i className="fa-solid fa-file-contract text-xs text-white"></i>
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="font-bold text-[11px] sm:text-xs text-white truncate leading-tight !bg-transparent !border-0 !p-0 !m-0">{viewingBoqReport.title}</div>
                                                <div className="flex items-center gap-1.5 mt-0.5 truncate">
                                                    <span className="text-[9.5px] sm:text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                                                        <i className="fa-solid fa-cloud-arrow-up text-[9px]"></i> محفوظ في زر البند
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Left side: Icon buttons (Auto-Save Status + Finish Edit + 3-dots + Close) */}
                                        <div className="flex items-center gap-1.5 sm:gap-2 relative shrink-0">
                                            {/* Auto-Save & Direct Edit Status Icon */}
                                            {isDirectEditingReport && (
                                                <>
                                                    {reportAutoSaveStatus === 'saving' && (
                                                        <div 
                                                            className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 flex items-center justify-center shrink-0 transition"
                                                            title="جاري الحفظ تلقائياً..."
                                                        >
                                                            <i className="fa-solid fa-circle-notch fa-spin text-xs"></i>
                                                        </div>
                                                    )}
                                                    {reportAutoSaveStatus === 'saved' && (
                                                        <div 
                                                            className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 flex items-center justify-center shrink-0 transition"
                                                            title="تم الحفظ تلقائياً ✓"
                                                        >
                                                            <i className="fa-solid fa-check-double text-xs"></i>
                                                        </div>
                                                    )}
                                                    {reportAutoSaveStatus === 'idle' && (
                                                        <div 
                                                            className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 flex items-center justify-center shrink-0 transition"
                                                            title="وضع التعديل المباشر مفعّل (انقر على أي نص أو خلية للتعديل)"
                                                        >
                                                            <i className="fa-solid fa-pen-ruler text-xs"></i>
                                                        </div>
                                                    )}

                                                    {/* Finish Edit Button (Icon Only) */}
                                                    <button
                                                        type="button"
                                                        onClick={() => { setIsDirectEditingReport(false); handleReportDirectBlur(); }}
                                                        className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center transition border border-emerald-400 shadow-sm shrink-0"
                                                        title="إنهاء وضع التعديل والعودة للقراءة"
                                                    >
                                                        <i className="fa-solid fa-check text-sm font-bold"></i>
                                                    </button>
                                                </>
                                            )}

                                            {/* 3-dots button */}
                                            <button
                                                type="button"
                                                onClick={() => setIsBoqReportMenuOpen(!isBoqReportMenuOpen)}
                                                className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center transition text-xs border ${
                                                    isBoqReportMenuOpen 
                                                        ? 'bg-indigo-600 text-white border-indigo-400 shadow-lg ring-2 ring-indigo-400/50' 
                                                        : isDirectEditingReport
                                                            ? 'bg-indigo-500/30 border-indigo-400 text-indigo-200'
                                                            : 'bg-white/10 hover:bg-white/20 text-white border-white/10'
                                                }`}
                                                title="خيارات وإجراءات التقرير"
                                            >
                                                {generatingBoqReportInfo?.type === viewingBoqReport.type ? (
                                                    <i className="fa-solid fa-circle-notch fa-spin text-xs text-yellow-300"></i>
                                                ) : (
                                                    <i className="fa-solid fa-ellipsis-vertical text-base"></i>
                                                )}
                                            </button>

                                            {/* Close button */}
                                            <button
                                                type="button"
                                                onClick={() => { 
                                                    setViewingBoqReport(null); 
                                                    setViewingBoqReportItem(null); 
                                                    setIsBoqReportMenuOpen(false); 
                                                    setEditingColumnModal(null); 
                                                    setIsDirectEditingReport(false);
                                                    setReportAutoSaveStatus('idle');
                                                }}
                                                className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-white/10 hover:bg-red-500/80 text-white flex items-center justify-center transition text-xs border border-white/10 shrink-0"
                                                title="إغلاق التقرير"
                                            >
                                                <i className="fa-solid fa-times text-sm"></i>
                                            </button>

                                            {/* Dropdown Menu */}
                                            {isBoqReportMenuOpen && (
                                                <>
                                                    <div
                                                        className="fixed inset-0 z-[1800]"
                                                        onClick={() => setIsBoqReportMenuOpen(false)}
                                                    ></div>
                                                    <div className="absolute left-0 top-12 w-64 bg-slate-900/95 backdrop-blur-xl border border-slate-700 rounded-2xl shadow-2xl p-2 z-[1850] space-y-1.5 text-white animate-scale-in origin-top-left">
                                                        <div className="px-2.5 py-1 border-b border-slate-800 flex items-center justify-between">
                                                            <span className="text-[10px] font-bold text-slate-400">خيارات التقرير</span>
                                                            <i className="fa-solid fa-file-lines text-[10px] text-indigo-400"></i>
                                                        </div>

                                                        {/* Direct In-Place Edit Button */}
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setIsBoqReportMenuOpen(false);
                                                                setIsDirectEditingReport(!isDirectEditingReport);
                                                            }}
                                                            disabled={Boolean(generatingBoqReportInfo)}
                                                            className={`w-full px-3 py-2.5 rounded-xl text-white flex items-center gap-2.5 transition text-xs font-bold disabled:opacity-50 text-right ${
                                                                isDirectEditingReport 
                                                                    ? 'bg-emerald-600 hover:bg-emerald-500 shadow-md ring-1 ring-emerald-400' 
                                                                    : 'bg-indigo-600 hover:bg-indigo-500 shadow-sm'
                                                            }`}
                                                        >
                                                            <div className="w-6 h-6 rounded-lg bg-white/20 text-white flex items-center justify-center shrink-0">
                                                                <i className={`fa-solid ${isDirectEditingReport ? 'fa-check' : 'fa-file-pen'} text-xs`}></i>
                                                            </div>
                                                            <div className="flex-1 text-right">
                                                                <div>{isDirectEditingReport ? 'إنهاء التعديل المباشر' : 'التعديل المباشر'}</div>
                                                                <div className="text-[10px] text-indigo-200 font-normal">
                                                                    {isDirectEditingReport ? 'العودة لوضع القراءة' : 'تعديل فوري وحفظ تلقائي على التقرير'}
                                                                </div>
                                                            </div>
                                                        </button>

                                                        {/* Open in Letter Editor */}
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setIsBoqReportMenuOpen(false);
                                                                handleOpenBoqReportInLetterEditor(viewingBoqReport);
                                                            }}
                                                            disabled={Boolean(generatingBoqReportInfo)}
                                                            className="w-full px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-indigo-600 text-white flex items-center gap-2.5 transition text-xs font-bold disabled:opacity-50 text-right"
                                                        >
                                                            <div className="w-6 h-6 rounded-lg bg-indigo-500/20 text-indigo-300 flex items-center justify-center shrink-0">
                                                                <i className="fa-solid fa-pen-to-square text-xs"></i>
                                                            </div>
                                                            <span>تعديل المستند</span>
                                                        </button>

                                                        {/* Print Button */}
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setIsBoqReportMenuOpen(false);
                                                                handlePrintBoqItemReport(viewingBoqReport);
                                                            }}
                                                            disabled={Boolean(generatingBoqReportInfo)}
                                                            className="w-full px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-emerald-600 text-white flex items-center gap-2.5 transition text-xs font-bold disabled:opacity-50 text-right"
                                                        >
                                                            <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-300 flex items-center justify-center shrink-0">
                                                                <i className="fa-solid fa-print text-xs"></i>
                                                            </div>
                                                            <span>طباعة المستند</span>
                                                        </button>

                                                        {/* Regenerate Button */}
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setIsBoqReportMenuOpen(false);
                                                                const currentItem = viewingBoqReportItem || editingBoqItem;
                                                                if (currentItem) handleBoqItemReportButtonClick(currentItem, viewingBoqReport.type, true);
                                                            }}
                                                            disabled={Boolean(generatingBoqReportInfo)}
                                                            className="w-full px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-amber-600 text-white flex items-center gap-2.5 transition text-xs font-bold disabled:opacity-50 text-right"
                                                        >
                                                            <div className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-300 flex items-center justify-center shrink-0">
                                                                {generatingBoqReportInfo?.type === viewingBoqReport.type ? (
                                                                    <i className="fa-solid fa-circle-notch fa-spin text-xs"></i>
                                                                ) : (
                                                                    <i className="fa-solid fa-rotate text-xs"></i>
                                                                )}
                                                            </div>
                                                            <span>إعادة توليد بالذكاء الاصطناعي</span>
                                                        </button>

                                                        {/* Delete Report Button */}
                                                        <button
                                                            type="button"
                                                            onClick={handleDeleteBoqItemReport}
                                                            className="w-full px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-red-600 text-red-300 hover:text-white flex items-center gap-2.5 transition text-xs font-bold text-right border-t border-slate-700/60 mt-1"
                                                        >
                                                            <div className="w-6 h-6 rounded-lg bg-red-500/20 text-red-400 flex items-center justify-center shrink-0">
                                                                <i className="fa-solid fa-trash-can text-xs"></i>
                                                            </div>
                                                            <span>حذف التقرير</span>
                                                        </button>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    {/* Modal Full-Screen Content */}
                                    <div 
                                        ref={reportContainerRef}
                                        onClick={handleReportContentClick}
                                        className="flex-1 overflow-y-auto p-3 sm:p-8 bg-slate-100 relative"
                                    >
                                        {generatingBoqReportInfo?.type === viewingBoqReport.type && (
                                            <div className="absolute inset-0 z-20 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
                                                <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                                                <p className="text-xs font-bold text-slate-700">جاري إعادة توليد التقرير الهندسي وحفظه في البند...</p>
                                            </div>
                                        )}

                                        {isDirectEditingReport && (
                                            <div className="max-w-5xl mx-auto mb-3 bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-indigo-500/10 border border-indigo-200 rounded-xl p-3 flex items-center justify-between gap-3 text-xs text-indigo-900 shadow-sm animate-fade-in">
                                                <div className="flex items-center gap-2.5">
                                                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping shrink-0"></span>
                                                    <span className="font-bold">وضع التعديل المباشر مفعّل:</span>
                                                    <span className="text-slate-700">انقر على أي نص، رقم، أو خلية داخل أي جدول لتعديلها بحرية، ويتم حفظ التعديلات تلقائياً.</span>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => { setIsDirectEditingReport(false); handleReportDirectBlur(); }}
                                                    className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition shrink-0"
                                                >
                                                    إنهاء التعديل
                                                </button>
                                            </div>
                                        )}

                                        <div 
                                            ref={reportEditableContentRef}
                                            contentEditable={isDirectEditingReport}
                                            suppressContentEditableWarning={true}
                                            onInput={handleReportDirectInput}
                                            onBlur={handleReportDirectBlur}
                                            className={`bg-white rounded-2xl shadow p-4 sm:p-10 max-w-5xl mx-auto prose prose-sm text-slate-800 leading-relaxed report-content transition-all ${
                                                isDirectEditingReport 
                                                    ? 'is-editable ring-4 ring-indigo-500/20 border-2 border-indigo-400 bg-white cursor-text' 
                                                    : 'border border-slate-200'
                                            }`}
                                        >
                                            <style>{`
                                                .report-content { font-size: 13px !important; color: #1e293b !important; line-height: 1.65 !important; width: 100% !important; max-width: 100% !important; }
                                                .report-content .report-container, .report-content .report-body { width: 100% !important; max-width: 100% !important; padding: 0 !important; margin: 0 !important; border: none !important; }
                                                .report-content .report-header { display: none !important; }
                                                .report-content p, .report-content li, .report-content div { font-size: 13px !important; line-height: 1.65 !important; }
                                                .report-content .table-responsive-wrapper { width: 100% !important; max-width: 100% !important; overflow-x: auto !important; overflow-y: hidden !important; -webkit-overflow-scrolling: touch !important; touch-action: pan-x pan-y !important; margin: 12px 0 !important; border: none !important; border-radius: 0 !important; background: transparent !important; padding: 0 0 6px 0 !important; box-shadow: none !important; display: block !important; }
                                                .report-content table, .report-content .editable-table { width: 100% !important; min-width: 580px !important; table-layout: auto !important; border-collapse: collapse !important; margin: 0 !important; font-size: 12.5px !important; border: 1px solid #cbd5e1 !important; background: #ffffff !important; }
                                                .report-content th, .report-content td { border: 1px solid #cbd5e1 !important; padding: 8px 10px !important; line-height: 1.55 !important; vertical-align: middle !important; white-space: normal !important; word-break: normal !important; overflow-wrap: normal !important; word-wrap: normal !important; hyphens: none !important; }
                                                .report-content th { background-color: #f1f5f9 !important; color: #1e3a8a !important; font-weight: 800 !important; font-size: 12.5px !important; text-align: center !important; cursor: pointer !important; position: relative !important; user-select: none !important; transition: all 0.15s ease !important; }
                                                .report-content th * { color: #1e3a8a !important; white-space: normal !important; word-break: normal !important; overflow-wrap: normal !important; }
                                                .report-content th:hover { background-color: #e0e7ff !important; color: #3730a3 !important; }
                                                .report-content td { text-align: right !important; font-size: 12.5px !important; color: #0f172a !important; }
                                                .report-content td * { white-space: normal !important; word-break: normal !important; overflow-wrap: normal !important; }
                                                .report-content tr:nth-child(even) td { background-color: #f8fafc !important; }
                                                .report-content table.boq-summary-mini-table { min-width: 420px !important; margin: 0 !important; }
                                                .report-content table.boq-summary-mini-table th { padding: 5px 6px !important; font-size: 11px !important; font-weight: 800 !important; text-align: center !important; min-width: 50px !important; line-height: 1.35 !important; }
                                                .report-content table.boq-summary-mini-table td { padding: 5px 6px !important; font-size: 11.5px !important; font-weight: 700 !important; text-align: center !important; min-width: 50px !important; line-height: 1.35 !important; background-color: #ffffff !important; }
                                                .report-content h1 { color: #1e3a8a !important; font-size: 15px !important; font-weight: 800 !important; line-height: 1.45 !important; text-align: center !important; background: transparent !important; border: none !important; border-bottom: 2px solid #1e3a8a !important; border-radius: 0 !important; padding: 0 0 8px 0 !important; margin: 6px 0 12px 0 !important; width: 100% !important; display: block !important; }
                                                .report-content h2 { color: #1e3a8a !important; font-size: 14px !important; font-weight: 800 !important; line-height: 1.45 !important; text-align: right !important; background: transparent !important; border: none !important; border-bottom: 1.5px solid #cbd5e1 !important; border-right: 4px solid #1e3a8a !important; border-radius: 0 !important; padding: 2px 8px 6px 0 !important; margin: 14px 0 8px 0 !important; width: 100% !important; display: block !important; }
                                                .report-content h3,
                                                .report-content h4 { color: #1e3a8a !important; font-size: 13px !important; font-weight: 800 !important; line-height: 1.45 !important; text-align: right !important; background: transparent !important; border: none !important; border-bottom: 1px solid #e2e8f0 !important; border-right: 3px solid #3b82f6 !important; border-radius: 0 !important; padding: 2px 8px 4px 0 !important; margin: 10px 0 6px 0 !important; width: 100% !important; display: block !important; }
                                                .report-content .info-box { background-color: #eff6ff !important; border: 1px solid #bfdbfe !important; border-right: 4px solid #2563eb !important; color: #1e3a8a !important; padding: 10px 12px !important; margin: 10px 0 !important; border-radius: 8px !important; }
                                                .report-content .success-box { background-color: #f0fdf4 !important; border: 1px solid #bbf7d0 !important; border-right: 4px solid #16a34a !important; color: #14532d !important; padding: 10px 12px !important; margin: 10px 0 !important; border-radius: 8px !important; }
                                                .report-content .warning-box { background-color: #fef2f2 !important; border: 1px solid #fecaca !important; border-right: 4px solid #dc2626 !important; color: #7f1d1d !important; padding: 10px 12px !important; margin: 10px 0 !important; border-radius: 8px !important; }
                                                .report-content .cost-box, .report-content .highlight-box { background-color: #fffbeb !important; border: 1px solid #fde68a !important; border-right: 4px solid #d97706 !important; color: #78350f !important; padding: 10px 12px !important; margin: 10px 0 !important; border-radius: 8px !important; }
                                                .report-content.is-editable td:focus,
                                                .report-content.is-editable th:focus,
                                                .report-content.is-editable p:focus,
                                                .report-content.is-editable h2:focus,
                                                .report-content.is-editable h3:focus,
                                                .report-content.is-editable h4:focus,
                                                .report-content.is-editable div:focus {
                                                    outline: 2px dashed #6366f1 !important;
                                                    background-color: #f5f3ff !important;
                                                    border-radius: 4px;
                                                }
                                            `}</style>
                                            <div dangerouslySetInnerHTML={{ __html: enhanceReportHtml(viewingBoqReport.content) }} />
                                        </div>
                                    </div>

                                    {/* Modal to adjust column width percentage */}
                                    {editingColumnModal && (
                                        <div className="fixed inset-0 z-[1900] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
                                            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-scale-in text-slate-800">
                                                {/* Header */}
                                                <div className="bg-slate-900 text-white p-4 flex justify-between items-center">
                                                    <div className="flex items-center gap-2.5">
                                                        <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                                                            <i className="fa-solid fa-table-columns text-sm"></i>
                                                        </div>
                                                        <div>
                                                            <h4 className="font-bold text-sm text-white">تعديل عرض العمود</h4>
                                                            <p className="text-[11px] text-slate-400 truncate max-w-[220px]">
                                                                العمود: <span className="text-amber-300 font-bold">{editingColumnModal.columnTitle}</span>
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditingColumnModal(null)}
                                                        className="w-8 h-8 rounded-full hover:bg-white/20 flex items-center justify-center text-white transition"
                                                    >
                                                        <i className="fa-solid fa-times"></i>
                                                    </button>
                                                </div>

                                                {/* Body */}
                                                <div className="p-5 space-y-4">
                                                    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 flex items-center justify-between">
                                                        <span className="text-xs font-bold text-indigo-900">نسبة عرض العمود من الجدول:</span>
                                                        <span className="text-lg font-black text-indigo-700 bg-white px-3 py-1 rounded-lg border border-indigo-300 shadow-sm">
                                                            {customPercentInput}%
                                                        </span>
                                                    </div>

                                                    {/* Range Slider */}
                                                    <div>
                                                        <div className="flex justify-between text-xs text-slate-500 font-bold mb-1">
                                                            <span>5% (ضيق)</span>
                                                            <span>تمرير لتغيير النسبة</span>
                                                            <span>80% (عريض جداً)</span>
                                                        </div>
                                                        <input
                                                            type="range"
                                                            min="5"
                                                            max="80"
                                                            step="1"
                                                            value={customPercentInput}
                                                            onChange={(e) => setCustomPercentInput(Number(e.target.value))}
                                                            className="w-full accent-indigo-600 cursor-pointer h-2 bg-slate-200 rounded-lg"
                                                        />
                                                    </div>

                                                    {/* Direct Number Input */}
                                                    <div className="flex items-center gap-2">
                                                        <label className="text-xs font-bold text-slate-700 shrink-0">أو كتابة النسبة يدوياً:</label>
                                                        <div className="flex items-center gap-1 border border-slate-300 rounded-lg px-2 py-1 bg-white flex-1">
                                                            <input
                                                                type="number"
                                                                min="5"
                                                                max="80"
                                                                value={customPercentInput}
                                                                onChange={(e) => setCustomPercentInput(Math.max(5, Math.min(80, Number(e.target.value))))}
                                                                className="w-full text-center font-bold text-slate-900 outline-none text-sm"
                                                            />
                                                            <span className="text-xs font-bold text-slate-500">%</span>
                                                        </div>
                                                    </div>

                                                    {/* Quick Presets */}
                                                    <div>
                                                        <label className="block text-xs font-bold text-slate-600 mb-1.5">نسب مقترحة سريعة:</label>
                                                        <div className="grid grid-cols-4 gap-1.5">
                                                            {[
                                                                { label: '8% (أرقام)', val: 8 },
                                                                { label: '12% (وحدات)', val: 12 },
                                                                { label: '20% (عادي)', val: 20 },
                                                                { label: '30% (متوسط)', val: 30 },
                                                                { label: '40% (توصيف)', val: 40 },
                                                                { label: '50% (نص عريض)', val: 50 },
                                                                { label: '60% (بيان كبير)', val: 60 },
                                                                { label: 'تلقائي Auto', val: 0 },
                                                            ].map((preset, idx) => (
                                                                <button
                                                                    key={idx}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        if (preset.val === 0) {
                                                                            applyColumnWidth(editingColumnModal.tableIndex, editingColumnModal.columnIndex, 'auto');
                                                                        } else {
                                                                            setCustomPercentInput(preset.val);
                                                                        }
                                                                    }}
                                                                    className={`py-1.5 px-2 rounded-lg text-[11px] font-bold border transition ${
                                                                        customPercentInput === preset.val
                                                                            ? 'bg-indigo-600 text-white border-indigo-600'
                                                                            : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                                                                    }`}
                                                                >
                                                                    {preset.label}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-[11px] text-amber-800 flex items-start gap-2">
                                                        <i className="fa-solid fa-lightbulb text-amber-600 mt-0.5"></i>
                                                        <span>سيتم تطبيق هذه النسبة على هذا العمود في كامل الجدول وحفظها تلقائياً في التقرير.</span>
                                                    </div>
                                                </div>

                                                {/* Footer */}
                                                <div className="p-4 bg-slate-50 border-t flex justify-end gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditingColumnModal(null)}
                                                        className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-200 text-slate-700 hover:bg-slate-300 transition"
                                                    >
                                                        إلغاء
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            applyColumnWidth(editingColumnModal.tableIndex, editingColumnModal.columnIndex, customPercentInput);
                                                        }}
                                                        className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition shadow flex items-center gap-1.5"
                                                    >
                                                        <i className="fa-solid fa-check"></i>
                                                        <span>تطبيق وحفظ ({customPercentInput}%)</span>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
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
                                    <div className="bg-slate-900 text-white px-3.5 py-2.5 flex justify-between items-center shadow-md shrink-0 relative border-b border-slate-800">
                                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                            <div className="w-7 h-7 rounded-lg bg-teal-600 flex items-center justify-center shrink-0">
                                                <i className="fa-solid fa-file-contract text-xs text-white"></i>
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="font-bold text-[11px] sm:text-xs text-white truncate leading-tight !bg-transparent !border-0 !p-0 !m-0">{selectedReport.title}</div>
                                                <div className="text-[9.5px] sm:text-[10px] font-medium text-emerald-400 flex items-center gap-1 mt-0.5 truncate">
                                                    <i className="fa-solid fa-cloud-arrow-up text-[9px]"></i>
                                                    <span>حفظ تلقائي للتعديلات وعروض الأعمدة</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 relative shrink-0">
                                            {isDirectEditingSelectedReport && (
                                                <button
                                                    type="button"
                                                    onClick={() => setIsDirectEditingSelectedReport(false)}
                                                    className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center transition border border-emerald-400 shadow-sm shrink-0"
                                                    title="إنهاء التعديل المباشر"
                                                >
                                                    <i className="fa-solid fa-check text-sm font-bold"></i>
                                                </button>
                                            )}

                                            {/* 3-dots menu button */}
                                            <button
                                                type="button"
                                                onClick={() => setIsSelectedReportMenuOpen(!isSelectedReportMenuOpen)}
                                                className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center transition text-xs border ${
                                                    isSelectedReportMenuOpen
                                                        ? 'bg-indigo-600 text-white border-indigo-400 shadow-lg'
                                                        : isDirectEditingSelectedReport
                                                            ? 'bg-indigo-500/30 border-indigo-400 text-indigo-200'
                                                            : 'bg-white/10 hover:bg-white/20 text-white border-white/10'
                                                }`}
                                                title="خيارات التقرير"
                                            >
                                                <i className="fa-solid fa-ellipsis-vertical text-base"></i>
                                            </button>

                                            {/* Close button */}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setSelectedReport(null);
                                                    setIsSelectedReportMenuOpen(false);
                                                    setIsDirectEditingSelectedReport(false);
                                                }}
                                                className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-white/10 hover:bg-red-500/80 text-white flex items-center justify-center transition text-xs border border-white/10"
                                                title="إغلاق"
                                            >
                                                <i className="fa-solid fa-times text-sm"></i>
                                            </button>

                                            {isSelectedReportMenuOpen && (
                                                <>
                                                    <div className="fixed inset-0 z-[1750]" onClick={() => setIsSelectedReportMenuOpen(false)}></div>
                                                    <div className="absolute left-0 top-11 w-60 bg-slate-900/95 backdrop-blur-xl border border-slate-700 rounded-2xl shadow-2xl p-2 z-[1800] space-y-1.5 text-white animate-scale-in origin-top-left">
                                                        <div className="px-2.5 py-1 border-b border-slate-800 flex items-center justify-between">
                                                            <span className="text-[10px] font-bold text-slate-400">إجراءات التقرير</span>
                                                            <i className="fa-solid fa-file-lines text-[10px] text-indigo-400"></i>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setIsSelectedReportMenuOpen(false);
                                                                setIsDirectEditingSelectedReport(!isDirectEditingSelectedReport);
                                                            }}
                                                            className={`w-full px-3 py-2.5 rounded-xl text-white flex items-center gap-2.5 transition text-xs font-bold text-right ${
                                                                isDirectEditingSelectedReport
                                                                    ? 'bg-emerald-600 hover:bg-emerald-500 shadow-md ring-1 ring-emerald-400'
                                                                    : 'bg-indigo-600 hover:bg-indigo-500 shadow-sm'
                                                            }`}
                                                        >
                                                            <div className="w-6 h-6 rounded-lg bg-white/20 text-white flex items-center justify-center shrink-0">
                                                                <i className={`fa-solid ${isDirectEditingSelectedReport ? 'fa-check' : 'fa-file-pen'} text-xs`}></i>
                                                            </div>
                                                            <div className="flex-1 text-right">
                                                                <div>{isDirectEditingSelectedReport ? 'إنهاء التعديل المباشر' : 'التعديل المباشر'}</div>
                                                                <div className="text-[10px] text-indigo-200 font-normal">حفظ تلقائي على نفس التقرير</div>
                                                            </div>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setIsSelectedReportMenuOpen(false);
                                                                handleEditReport(selectedReport);
                                                            }}
                                                            className="w-full px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-indigo-600 text-white flex items-center gap-2.5 transition text-xs font-bold text-right"
                                                        >
                                                            <div className="w-6 h-6 rounded-lg bg-indigo-500/20 text-indigo-300 flex items-center justify-center shrink-0">
                                                                <i className="fa-solid fa-pen-to-square text-xs"></i>
                                                            </div>
                                                            <span>تعديل المستند</span>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setIsSelectedReportMenuOpen(false);
                                                                printService.printReport(
                                                                    enhanceReportHtml(selectedReport.content),
                                                                    selectedReport.title,
                                                                    'GEO-REP',
                                                                    { showHeader: false, showFooter: false }
                                                                );
                                                            }}
                                                            className="w-full px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-emerald-600 text-white flex items-center gap-2.5 transition text-xs font-bold text-right"
                                                        >
                                                            <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-300 flex items-center justify-center shrink-0">
                                                                <i className="fa-solid fa-print text-xs"></i>
                                                            </div>
                                                            <span>طباعة المستند</span>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                const idToDelete = selectedReport.id;
                                                                setIsSelectedReportMenuOpen(false);
                                                                setSelectedReport(null);
                                                                setReportToDeleteId(idToDelete);
                                                            }}
                                                            className="w-full px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-red-600 text-red-300 hover:text-white flex items-center gap-2.5 transition text-xs font-bold text-right border-t border-slate-700/60 mt-1"
                                                        >
                                                            <div className="w-6 h-6 rounded-lg bg-red-500/20 text-red-400 flex items-center justify-center shrink-0">
                                                                <i className="fa-solid fa-trash-can text-xs"></i>
                                                            </div>
                                                            <span>حذف التقرير</span>
                                                        </button>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    {/* UPDATED: FULL WIDTH CONTAINER WITH INTERACTIVE REPORT VIEWER */}
                                    <div className="flex-1 overflow-y-auto bg-slate-50 p-2 sm:p-6">
                                        <div className="max-w-5xl mx-auto bg-white rounded-2xl shadow border border-slate-200 p-4 sm:p-8">
                                            <InteractiveReportViewer
                                                htmlContent={selectedReport.content}
                                                showFloatingEditBar={false}
                                                isDirectEditing={isDirectEditingSelectedReport}
                                                onDirectEditChange={setIsDirectEditingSelectedReport}
                                                onContentChange={(updatedHtml) => {
                                                    const updatedReport = { ...selectedReport, content: updatedHtml };
                                                    setSelectedReport(updatedReport);
                                                    const newData = {
                                                        ...masterData,
                                                        engineeringReports: (masterData.engineeringReports || []).map(r => r.id === updatedReport.id ? updatedReport : r)
                                                    };
                                                    setMasterData(newData);
                                                    triggerAutoSave(newData);
                                                }}
                                            />
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

                {/* Smart IPC / Payment Generator Modal - Full Screen & Fully Scrollable */}
                {showSmartPaymentModal && (
                    <div className="fixed inset-0 z-[1720] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-0 animate-fade-in">
                        <div className="bg-white w-full h-full flex flex-col overflow-hidden animate-scale-in">
                            {/* Slim Fixed Modal Header */}
                            <div className="bg-gradient-to-r from-emerald-800 via-teal-800 to-indigo-900 text-white px-4 py-3 flex justify-between items-center shrink-0 shadow-md">
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center text-amber-300 border border-white/20 shrink-0">
                                        <i className="fa-solid fa-wand-magic-sparkles text-base"></i>
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="font-black text-sm sm:text-base text-white truncate">
                                            مُنشئ المستخلص التلقائي الذكي (Smart IPC)
                                        </h3>
                                        <p className="text-[10px] text-emerald-100 font-bold truncate">
                                            ربط آلي بين الكميات المنفذة بالمقايسة، سجل اليوميات، وحساب الاستقطاعات
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setShowSmartPaymentModal(false)}
                                    className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition shrink-0 mr-2"
                                    title="إغلاق"
                                >
                                    <i className="fa-solid fa-times text-base"></i>
                                </button>
                            </div>

                            {/* Unified Full-Screen Scrollable Body (Metadata + Items + Stacked Deductions + Totals + Buttons) */}
                            <div
                                className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-4 bg-slate-100 pb-28 custom-scrollbar"
                                style={{ WebkitOverflowScrolling: 'touch' }}
                            >
                                {/* 1. Metadata & Filter Controls Card */}
                                <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex flex-col gap-3">
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                                        <div className="flex flex-col">
                                            <label className="text-[10px] font-bold text-slate-600 mb-1">رقم المستخلص</label>
                                            <input
                                                type="text"
                                                value={smartIpcInvoiceNumber}
                                                onChange={(e) => setSmartIpcInvoiceNumber(e.target.value)}
                                                className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-black text-slate-900 outline-none focus:border-emerald-600 focus:bg-white"
                                                placeholder="1"
                                            />
                                        </div>
                                        <div className="flex flex-col">
                                            <label className="text-[10px] font-bold text-slate-600 mb-1">تاريخ المستخلص</label>
                                            <input
                                                type="date"
                                                value={smartIpcDate}
                                                onChange={(e) => setSmartIpcDate(e.target.value)}
                                                className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 outline-none focus:border-emerald-600 focus:bg-white"
                                            />
                                        </div>
                                        <div className="col-span-2 flex flex-col">
                                            <label className="text-[10px] font-bold text-slate-600 mb-1">البيان / ملاحظات المستخلص</label>
                                            <input
                                                type="text"
                                                value={smartIpcNote}
                                                onChange={(e) => setSmartIpcNote(e.target.value)}
                                                className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 outline-none focus:border-emerald-600 focus:bg-white"
                                                placeholder="مستخلص جاري..."
                                            />
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
                                        <div className="flex items-center gap-2 flex-wrap text-[11px] font-bold">
                                            <span className="bg-emerald-50 text-emerald-800 px-2.5 py-1 rounded-xl border border-emerald-200">
                                                بنود ذات تنفيذ: <strong>{smartIpcCalculations.activeItemsCount}</strong> من {smartIpcDraftItems.length}
                                            </span>
                                            {smartIpcCalculations.linkedLogsCount > 0 && (
                                                <span className="bg-indigo-50 text-indigo-800 px-2.5 py-1 rounded-xl border border-indigo-200 flex items-center gap-1">
                                                    <i className="fa-solid fa-camera text-[10px]"></i>
                                                    <span>موثق بـ <strong>{smartIpcCalculations.linkedLogsCount}</strong> يومية موقع</span>
                                                </span>
                                            )}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setSmartIpcShowAllBoq(!smartIpcShowAllBoq)}
                                            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 shadow-2xs ${
                                                smartIpcShowAllBoq
                                                    ? 'bg-indigo-600 text-white border-indigo-600'
                                                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                                            }`}
                                        >
                                            <i className="fa-solid fa-filter text-[10px]"></i>
                                            <span>{smartIpcShowAllBoq ? 'عرض البنود المنفذة فقط' : `عرض جميع بنود المقايسة (${smartIpcDraftItems.length})`}</span>
                                        </button>
                                    </div>
                                </div>

                                {/* 2. BOQ Items List - Grouped by BOQ (مقسمة طبقا للمقايسات) */}
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between px-1">
                                        <h4 className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                                            <i className="fa-solid fa-list-check text-emerald-600"></i>
                                            <span>بنود الأعمال والكميات المنفذة (مقسمة طبقاً للمقايسات)</span>
                                        </h4>
                                        <span className="text-[10px] font-bold text-slate-500">يمكنك تعديل الكمية الحالية أو الإجمالية لأي بند</span>
                                    </div>

                                    {(() => {
                                        const groupedDrafts: {
                                            batchName: string;
                                            entries: { item: PaymentItem; idx: number; matchedBoq?: BOQItem; itemLogs: ProjectLog[] }[];
                                            subtotalValue: number;
                                        }[] = [];
                                        const draftGroupIdx = new Map<string, number>();

                                        smartIpcDraftItems.forEach((item, idx) => {
                                            const itemLogs = item.boqItemId ? (logsByBoqItemId.get(item.boqItemId) || []) : [];
                                            const isVisibleInFilter = smartIpcShowAllBoq || (item.totalQuantity || 0) > 0 || (item.currQuantity || 0) > 0 || itemLogs.length > 0;
                                            if (!isVisibleInFilter) return;

                                            const matchedBoq = item.boqItemId ? masterData.boqItems.find(b => b.id === item.boqItemId) : undefined;
                                            const batchName = (item.batchName || matchedBoq?.batchName || 'المقايسة الأساسية').trim() || 'المقايسة الأساسية';

                                            if (!draftGroupIdx.has(batchName)) {
                                                draftGroupIdx.set(batchName, groupedDrafts.length);
                                                groupedDrafts.push({
                                                    batchName,
                                                    entries: [],
                                                    subtotalValue: 0
                                                });
                                            }
                                            const gIndex = draftGroupIdx.get(batchName)!;
                                            groupedDrafts[gIndex].entries.push({ item, idx, matchedBoq, itemLogs });
                                            groupedDrafts[gIndex].subtotalValue += Number(item.totalValue) || 0;
                                        });

                                        return groupedDrafts.map((group, gIdx) => (
                                            <div key={gIdx} className="bg-slate-200/60 rounded-2xl border-2 border-indigo-200 overflow-hidden shadow-xs">
                                                {/* BOQ Group Header */}
                                                <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 text-white px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <div className="w-7 h-7 rounded-lg bg-white/15 text-amber-300 flex items-center justify-center shrink-0">
                                                            <i className="fa-solid fa-layer-group text-xs"></i>
                                                        </div>
                                                        <span className="font-black text-xs sm:text-sm text-white truncate">
                                                            {group.batchName}
                                                        </span>
                                                        <span className="bg-white/15 text-indigo-100 px-2.5 py-0.5 rounded-full text-[10px] font-bold shrink-0">
                                                            {group.entries.length} بند
                                                        </span>
                                                    </div>
                                                    <div className="bg-white/10 border border-white/20 px-3 py-1 rounded-xl text-[11px] font-bold text-white shrink-0">
                                                        <span className="text-indigo-200 ml-1">إجمالي المقايسة:</span>
                                                        <span className="font-mono font-black text-amber-300">{group.subtotalValue.toLocaleString()} ج.م</span>
                                                    </div>
                                                </div>

                                                {/* Group Items */}
                                                <div className="p-2.5 space-y-2.5">
                                                    {group.entries.map(({ item, idx, matchedBoq, itemLogs }) => {
                                                        const isOverContract = (item.contractQuantity || 0) > 0 && (item.totalQuantity || 0) > (item.contractQuantity || 0);

                                                        return (
                                                            <div
                                                                key={item.boqItemId || idx}
                                                                className={`bg-white rounded-2xl p-3 border-2 transition shadow-xs ${
                                                                    (item.currQuantity || 0) > 0
                                                                        ? 'border-emerald-400 bg-emerald-50/15'
                                                                        : (item.totalQuantity || 0) > 0
                                                                        ? 'border-blue-200'
                                                                        : 'border-slate-200'
                                                                }`}
                                                            >
                                                                <div className="flex flex-col gap-2 mb-2.5 border-b border-slate-100 pb-2.5">
                                                                    {/* Row 1: Item Number & BOQ Name on one row + Quick Actions */}
                                                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                                                        <div className="flex items-center gap-1.5 min-w-0">
                                                                            <span className="bg-slate-900 text-white font-mono font-bold text-[11px] px-2.5 py-1 rounded-lg shrink-0">
                                                                                بند {item.itemCode}
                                                                            </span>
                                                                            <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200 truncate">
                                                                                {group.batchName}
                                                                            </span>
                                                                        </div>

                                                                        <div className="flex items-center gap-1.5 shrink-0">
                                                                            {matchedBoq && itemLogs.length > 0 && (
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => setViewingBoqLogsItem(matchedBoq)}
                                                                                    className="bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-900 border border-indigo-300 px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 transition"
                                                                                >
                                                                                    <i className="fa-solid fa-camera text-indigo-600"></i>
                                                                                    <span>إثبات اليوميات ({itemLogs.length})</span>
                                                                                </button>
                                                                            )}
                                                                            {(item.contractQuantity || 0) > 0 && (
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => handleSmartDraftItemChange(idx, 'totalQuantity', item.contractQuantity)}
                                                                                    className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-lg text-[10px] font-bold transition"
                                                                                    title="تعيين الإجمالي التراكمي = 100% من الكمية التعاقدية"
                                                                                >
                                                                                    100% تنفيذ
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    </div>

                                                                    {/* Row 2: Full Item Description (منطوق البند) in its own row */}
                                                                    <div className="w-full text-xs sm:text-sm font-bold text-slate-800 leading-relaxed bg-slate-50/80 px-3 py-2 rounded-xl border border-slate-100 break-words">
                                                                        {item.description}
                                                                    </div>
                                                                </div>

                                                                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 items-center text-center">
                                                                    <div className="bg-slate-50 rounded-xl p-1.5 border border-slate-200">
                                                                        <span className="text-[9px] font-bold text-slate-500 block mb-0.5">التعاقدية ({item.unit})</span>
                                                                        <span className="font-mono font-bold text-xs text-slate-800">{(item.contractQuantity || 0).toLocaleString()}</span>
                                                                    </div>
                                                                    <div className="bg-slate-50 rounded-xl p-1.5 border border-slate-200">
                                                                        <span className="text-[9px] font-bold text-slate-500 block mb-0.5">السابقة</span>
                                                                        <input
                                                                            type="number"
                                                                            step="any"
                                                                            value={item.prevQuantity ?? 0}
                                                                            onChange={(e) => handleSmartDraftItemChange(idx, 'prevQuantity', e.target.value)}
                                                                            className="w-full bg-white border border-slate-300 rounded-lg text-center font-mono font-bold text-xs text-slate-800 py-1 outline-none focus:border-blue-500"
                                                                        />
                                                                    </div>
                                                                    <div className="bg-emerald-50 rounded-xl p-1.5 border border-emerald-300">
                                                                        <span className="text-[9px] font-black text-emerald-800 block mb-0.5">الحالية (الفترة)</span>
                                                                        <input
                                                                            type="number"
                                                                            step="any"
                                                                            value={item.currQuantity ?? 0}
                                                                            onChange={(e) => handleSmartDraftItemChange(idx, 'currQuantity', e.target.value)}
                                                                            className="w-full bg-white border border-emerald-400 rounded-lg text-center font-mono font-black text-xs text-emerald-900 py-1 outline-none focus:ring-1 focus:ring-emerald-500"
                                                                        />
                                                                    </div>
                                                                    <div className={`rounded-xl p-1.5 border ${isOverContract ? 'bg-amber-50 border-amber-300' : 'bg-blue-50 border-blue-200'}`}>
                                                                        <span className="text-[9px] font-black text-blue-800 block mb-0.5">الإجمالية التراكمية</span>
                                                                        <input
                                                                            type="number"
                                                                            step="any"
                                                                            value={item.totalQuantity ?? 0}
                                                                            onChange={(e) => handleSmartDraftItemChange(idx, 'totalQuantity', e.target.value)}
                                                                            className="w-full bg-white border border-blue-300 rounded-lg text-center font-mono font-black text-xs text-blue-900 py-1 outline-none focus:ring-1 focus:ring-blue-500"
                                                                        />
                                                                    </div>
                                                                    <div className="bg-slate-50 rounded-xl p-1.5 border border-slate-200">
                                                                        <span className="text-[9px] font-bold text-slate-600 block mb-0.5">نسبة الصرف %</span>
                                                                        <input
                                                                            type="number"
                                                                            min={0}
                                                                            max={100}
                                                                            value={item.completionRatio ?? 100}
                                                                            onChange={(e) => handleSmartDraftItemChange(idx, 'completionRatio', e.target.value)}
                                                                            className="w-full bg-white border border-slate-300 rounded-lg text-center font-mono font-bold text-xs text-slate-800 py-1 outline-none focus:border-indigo-500"
                                                                        />
                                                                    </div>
                                                                    <div className="bg-indigo-950 text-white rounded-xl p-1.5 border border-indigo-900 flex flex-col justify-center h-full">
                                                                        <span className="text-[8px] text-indigo-300 block mb-0.5">القيمة ({item.unitPrice?.toLocaleString()} ج)</span>
                                                                        <span className="font-mono font-black text-xs text-amber-300">{(item.totalValue || 0).toLocaleString()}</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ));
                                    })()}
                                </div>

                                {/* 3. Stacked Deductions, Discounts & Taxes Section (توحيد التنسيق والشكل) */}
                                <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs space-y-2.5">
                                    <h4 className="text-xs font-black text-slate-800 flex items-center gap-1.5 border-b border-slate-100 pb-2">
                                        <i className="fa-solid fa-calculator text-rose-600"></i>
                                        <span>حساب الخصومات والاستقطاعات والضرائب</span>
                                    </h4>

                                    <div className="flex flex-col gap-2.5">
                                        {/* Row 1: Retention (تأمين ضمان أعمال) */}
                                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-col gap-2">
                                            <div className="flex items-center justify-between gap-2">
                                                <label className="text-xs font-black text-slate-800">1. تأمين ضمان أعمال</label>
                                                <div className="flex items-center gap-1.5 bg-red-50 px-2.5 py-0.5 rounded-lg border border-red-100">
                                                    <span className="text-[10px] font-bold text-red-400">قيمة الخصم:</span>
                                                    <span className="text-xs font-mono font-black text-red-600">
                                                        - {smartIpcCalculations.retentionAmount.toLocaleString()} ج.م
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between gap-2 bg-white p-2 rounded-xl border border-slate-200">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    {[0, 5, 10].map(v => (
                                                        <button
                                                            key={v}
                                                            type="button"
                                                            onClick={() => setSmartIpcRetentionPercent(v)}
                                                            className={`px-3 py-1.5 rounded-lg text-xs font-black transition ${
                                                                smartIpcRetentionPercent === v
                                                                    ? 'bg-emerald-600 text-white shadow-xs'
                                                                    : 'bg-slate-50 border border-slate-300 text-slate-700 hover:bg-slate-100'
                                                            }`}
                                                        >
                                                            {v}%
                                                        </button>
                                                    ))}
                                                </div>
                                                <div className="flex items-center gap-1 shrink-0">
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        max={100}
                                                        step="any"
                                                        value={smartIpcRetentionPercent}
                                                        onChange={(e) => setSmartIpcRetentionPercent(parseFloat(e.target.value) || 0)}
                                                        className="w-16 bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-sm font-mono font-black text-center text-slate-900 outline-none focus:border-emerald-500"
                                                    />
                                                    <span className="text-xs font-black text-slate-500">%</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Row 2: Advance Payment Deduction (خصم دفعة مقدمة) */}
                                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-col gap-2">
                                            <div className="flex items-center justify-between gap-2">
                                                <label className="text-xs font-black text-slate-800">2. خصم دفعة مقدمة</label>
                                                <div className="flex items-center gap-1.5 bg-red-50 px-2.5 py-0.5 rounded-lg border border-red-100">
                                                    <span className="text-[10px] font-bold text-red-400">قيمة الخصم:</span>
                                                    <span className="text-xs font-mono font-black text-red-600">
                                                        - {smartIpcCalculations.advanceDeductionAmount.toLocaleString()} ج.م
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between gap-2 bg-white p-2 rounded-xl border border-slate-200">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    {[0, 10, 20].map(v => (
                                                        <button
                                                            key={v}
                                                            type="button"
                                                            onClick={() => setSmartIpcAdvancePercent(v)}
                                                            className={`px-3 py-1.5 rounded-lg text-xs font-black transition ${
                                                                smartIpcAdvancePercent === v
                                                                    ? 'bg-emerald-600 text-white shadow-xs'
                                                                    : 'bg-slate-50 border border-slate-300 text-slate-700 hover:bg-slate-100'
                                                            }`}
                                                        >
                                                            {v}%
                                                        </button>
                                                    ))}
                                                </div>
                                                <div className="flex items-center gap-1 shrink-0">
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        max={100}
                                                        step="any"
                                                        value={smartIpcAdvancePercent}
                                                        onChange={(e) => setSmartIpcAdvancePercent(parseFloat(e.target.value) || 0)}
                                                        className="w-16 bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-sm font-mono font-black text-center text-slate-900 outline-none focus:border-emerald-500"
                                                    />
                                                    <span className="text-xs font-black text-slate-500">%</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Row 3: Taxes & Other Deductions (ضرائب واستقطاعات أخرى) */}
                                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-col gap-2">
                                            <div className="flex items-center justify-between gap-2">
                                                <label className="text-xs font-black text-slate-800">3. ضرائب واستقطاعات أخرى</label>
                                                <div className="flex items-center gap-1.5 bg-red-50 px-2.5 py-0.5 rounded-lg border border-red-100">
                                                    <span className="text-[10px] font-bold text-red-400">قيمة الخصم:</span>
                                                    <span className="text-xs font-mono font-black text-red-600">
                                                        - {smartIpcCalculations.taxesAndOtherAmount.toLocaleString()} ج.م
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between gap-2 bg-white p-2 rounded-xl border border-slate-200">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    {[0, 1, 3, 5].map(v => (
                                                        <button
                                                            key={v}
                                                            type="button"
                                                            onClick={() => setSmartIpcTaxesPercent(v)}
                                                            className={`px-3 py-1.5 rounded-lg text-xs font-black transition ${
                                                                smartIpcTaxesPercent === v
                                                                    ? 'bg-emerald-600 text-white shadow-xs'
                                                                    : 'bg-slate-50 border border-slate-300 text-slate-700 hover:bg-slate-100'
                                                            }`}
                                                        >
                                                            {v}%
                                                        </button>
                                                    ))}
                                                </div>
                                                <div className="flex items-center gap-1 shrink-0">
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        max={100}
                                                        step="any"
                                                        value={smartIpcTaxesPercent}
                                                        onChange={(e) => setSmartIpcTaxesPercent(parseFloat(e.target.value) || 0)}
                                                        className="w-16 bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-sm font-mono font-black text-center text-slate-900 outline-none focus:border-emerald-500"
                                                    />
                                                    <span className="text-xs font-black text-slate-500">%</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* 4. Financial Summary Cards */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
                                    <div className="bg-white rounded-2xl p-3 border border-slate-200 shadow-2xs">
                                        <span className="text-[10px] font-bold text-slate-500 block mb-1">إجمالي الأعمال التراكمي</span>
                                        <span className="font-mono font-black text-base text-slate-900">{smartIpcCalculations.cumulativeAmount.toLocaleString()} ج.م</span>
                                    </div>
                                    <div className="bg-blue-50 rounded-2xl p-3 border border-blue-200 shadow-2xs">
                                        <span className="text-[10px] font-bold text-blue-700 block mb-1">أعمال المستخلص الجاري</span>
                                        <span className="font-mono font-black text-base text-blue-900">{smartIpcCalculations.grossCurrentWork.toLocaleString()} ج.م</span>
                                    </div>
                                    <div className="bg-red-50 rounded-2xl p-3 border border-red-200 shadow-2xs">
                                        <span className="text-[10px] font-bold text-red-700 block mb-1">إجمالي الاستقطاعات</span>
                                        <span className="font-mono font-black text-base text-red-700">- {smartIpcCalculations.totalDeductions.toLocaleString()} ج.م</span>
                                    </div>
                                    <div className="bg-emerald-600 text-white rounded-2xl p-3 shadow-md">
                                        <span className="text-[10px] font-bold text-emerald-100 block mb-1">الصافي المستحق للصرف</span>
                                        <span className="font-mono font-black text-lg text-white">{smartIpcCalculations.netPayableAfterDeductions.toLocaleString()} ج.م</span>
                                    </div>
                                </div>

                                {/* 5. Action Buttons inside Scrollable Area */}
                                <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                                    <button
                                        type="button"
                                        onClick={() => saveSmartGeneratedPayment(false)}
                                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-3.5 px-5 rounded-2xl font-black text-sm shadow-lg transition flex items-center justify-center gap-2 cursor-pointer"
                                    >
                                        <i className="fa-solid fa-check-circle text-base"></i>
                                        <span>اعتماد وحفظ المستخلص وتحديث المقايسة</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => saveSmartGeneratedPayment(true)}
                                        className="bg-indigo-700 hover:bg-indigo-800 text-white py-3.5 px-5 rounded-2xl font-black text-sm shadow-lg transition flex items-center justify-center gap-2 cursor-pointer"
                                    >
                                        <i className="fa-solid fa-print text-base"></i>
                                        <span>حفظ وطباعة المستخلص الرسمي</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setShowSmartPaymentModal(false)}
                                        className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 py-3 px-5 rounded-2xl font-bold text-sm transition flex items-center justify-center gap-2 cursor-pointer"
                                    >
                                        <span>إلغاء</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* BOQ Item Linked Logs & Photos Modal */}
                {viewingBoqLogsItem && (
                    <div className="fixed inset-0 z-[1750] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
                        <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-200 flex flex-col max-h-[85vh] overflow-hidden animate-scale-in">
                            <div className="bg-gradient-to-r from-indigo-800 to-slate-900 text-white p-4 flex justify-between items-center shrink-0">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="bg-indigo-500/30 border border-indigo-400/40 text-indigo-100 text-xs font-mono font-bold px-2.5 py-0.5 rounded-lg">
                                            بند رقم: {viewingBoqLogsItem.itemCode}
                                        </span>
                                        {viewingBoqLogsItem.batchName && (
                                            <span className="text-[11px] text-indigo-200 truncate">
                                                ({viewingBoqLogsItem.batchName})
                                            </span>
                                        )}
                                    </div>
                                    <h3 className="font-bold text-sm sm:text-base mt-1 line-clamp-2 text-white">
                                        {viewingBoqLogsItem.description}
                                    </h3>
                                </div>
                                <button
                                    onClick={() => setViewingBoqLogsItem(null)}
                                    className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition shrink-0 mr-2"
                                >
                                    <i className="fa-solid fa-times"></i>
                                </button>
                            </div>

                            <div className="bg-indigo-50/70 px-4 py-2.5 border-b border-indigo-100 flex flex-wrap justify-between items-center gap-2 shrink-0 text-xs font-bold">
                                <div className="flex items-center gap-3">
                                    <span className="text-slate-600">الكمية التعاقدية: <strong className="font-mono text-slate-900">{viewingBoqLogsItem.quantity} {viewingBoqLogsItem.unit}</strong></span>
                                    <span className="text-green-700">المنفذ: <strong className="font-mono text-green-800">{viewingBoqLogsItem.executedQuantity || 0} {viewingBoqLogsItem.unit}</strong></span>
                                </div>
                                <button
                                    onClick={() => {
                                        const itemId = viewingBoqLogsItem.id;
                                        setViewingBoqLogsItem(null);
                                        setShowSmartPaymentModal(false);
                                        setSelectedLogBoqItemId(itemId);
                                        setActiveTab('logs');
                                    }}
                                    className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
                                >
                                    <i className="fa-solid fa-plus"></i>
                                    <span>إضافة يومية جديدة لهذا البند</span>
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
                                {(logsByBoqItemId.get(viewingBoqLogsItem.id) || []).length === 0 ? (
                                    <div className="text-center py-12 text-slate-400">
                                        <i className="fa-regular fa-clipboard text-3xl mb-2 opacity-40"></i>
                                        <p className="text-xs font-bold">لا توجد يوميات مسجلة لهذا البند حتى الآن.</p>
                                    </div>
                                ) : (
                                    (logsByBoqItemId.get(viewingBoqLogsItem.id) || []).map((log, i) => (
                                        <div key={log.id} className={`p-3 rounded-2xl border-2 shadow-xs bg-white border-indigo-100 flex flex-col gap-2`}>
                                            <div className="flex justify-between items-center border-b border-slate-100 pb-1.5">
                                                <span className="font-mono font-bold text-xs text-indigo-900 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100">
                                                    <i className="fa-solid fa-calendar-day ml-1.5 text-indigo-500"></i>
                                                    {log.date}
                                                </span>
                                                <span className="text-[10px] text-slate-400 font-bold">سجل #{i + 1}</span>
                                            </div>
                                            <p className="text-slate-800 text-sm font-bold leading-relaxed whitespace-pre-wrap">{log.content}</p>
                                            {log.images && log.images.length > 0 && (
                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                                                    {log.images.map((img, imgIdx) => (
                                                        <div
                                                            key={imgIdx}
                                                            onClick={() => setSelectedFullScreenImage(img)}
                                                            className="aspect-square rounded-xl overflow-hidden border border-slate-200 cursor-pointer hover:opacity-90 transition"
                                                        >
                                                            <img src={img} alt="" className="w-full h-full object-cover" />
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
