
// @ts-nocheck
import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { aiHelper } from '../services/aiHelper';
import { printService } from '../services/printService';
import { imageUtils } from '../services/imageUtils'; 
import { Project, BOQItem, ProjectLog, ScheduleResult, MaterialCalculationResult, PricingCalculationResult, FileItem, ItemType } from '../types';

interface ProjectAIProps {
  projectId: string;
  folderId: string;
  onClose: () => void;
}

// CONSOLIDATED AGENT TYPES (4 Power Agents)
type AgentType = 'general' | 'commercial' | 'technical' | 'site';

interface Message {
  role: 'user' | 'model';
  content: string | ScheduleResult | MaterialCalculationResult | PricingCalculationResult; 
  type?: 'text' | 'schedule' | 'calc_material' | 'calc_pricing';
  isSaved?: boolean;
  savedFileId?: string;
}

// MERGED CONFIGURATION
const AGENT_CONFIG: Record<AgentType, { title: string, icon: string, color: string, prompts: string[], desc: string }> = {
    general: { 
        title: "المدير العام (General Manager)", 
        icon: "fa-user-tie", 
        color: "blue", 
        desc: "المسؤول الأول. يربط بين الموقف المالي والتنفيذي. اطلب منه: تقارير تنفيذية، خطابات للمالك، تقييم الأداء العام.", 
        prompts: [
            "تقرير الموقف التنفيذي (Executive Report)",
            "تحليل التأخير وأسبابه (Delay Analysis)",
            "صياغة خطاب للمالك بخصوص الدفعات",
            "تقييم أداء المقاول العام",
            "خطة استدراك الجدول الزمني (Recovery Plan)"
        ] 
    },
    commercial: { 
        title: "مدير التكاليف والعقود (Commercial)", 
        icon: "fa-scale-balanced", 
        color: "emerald", 
        desc: "المرجع المالي. اطلب منه: مراجعة المستخلصات، فروق الأسعار، المطالبات (Claims)، وتحليل التدفق النقدي.", 
        prompts: [
            "تحليل التدفق النقدي (Cash Flow)", 
            "مراجعة نسبة الصرف مقابل الإنجاز",
            "صياغة مطالبة فروق أسعار",
            "موقف غرامات التأخير تعاقدياً",
            "تحليل بنود المقايسة الأكثر تكلفة"
        ] 
    },
    technical: {
        title: "مدير المكتب الفني (Technical & QC)",
        icon: "fa-compass-drafting", 
        color: "indigo",
        desc: "المرجع الهندسي. اطلب منه: اشتراطات الكود، مراجعة المواصفات، حل المشاكل الفنية، ومراجعة تقارير التربة.",
        prompts: [
            "تحليل تقرير التربة والتوصيات",
            "اشتراطات الكود المصري لهذا البند",
            "صياغة تقرير عدم مطابقة (NCR)",
            "طريقة التنفيذ القياسية (Method Statement)",
            "قائمة الفحص والاستلام (Checklist)"
        ]
    },
    site: {
        title: "مدير الموقع (Site & Safety)",
        icon: "fa-helmet-safety",
        color: "orange",
        desc: "المسؤول الميداني. اطلب منه: تقارير اليوميات، متابعة الأعمال اليومية، وتقارير السلامة من واقع الصور.",
        prompts: [
            "تقرير زيارة موقع مصور (Site Report)",
            "تحليل سجلات اليوميات للأسبوع الماضي",
            "تحليل مخاطر السلامة (Risk Assessment)",
            "تقرير بالموارد والعمالة في الموقع",
            "خطة تنظيم الموقع (Site Logistics)"
        ]
    }
};

const ProjectAI: React.FC<ProjectAIProps> = ({ projectId, folderId, onClose }) => {
  const navigate = useNavigate();
  const [activeAgent, setActiveAgent] = useState<AgentType | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [fullProjectData, setFullProjectData] = useState<Project | null>(null); 
  
  // Archiving State
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const [contentToArchive, setContentToArchive] = useState('');
  const [archiveTitle, setArchiveTitle] = useState('');
  const [targetMessageIndex, setTargetMessageIndex] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Chat Attachment State
  const chatFileRef = useRef<HTMLInputElement>(null);
  const chatCameraRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<File[]>([]); 
  
  // App File Picker State
  const [showSourceModal, setShowSourceModal] = useState(false);
  const [showAppFilePicker, setShowAppFilePicker] = useState(false);
  const [pickerCurrentFolderId, setPickerCurrentFolderId] = useState<string>(projectId);
  const [pickerBreadcrumbs, setPickerBreadcrumbs] = useState<{id: string, name: string}[]>([{id: projectId, name: 'الرئيسية'}]);
  const [pickerItems, setPickerItems] = useState<FileItem[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [selectedPickerItems, setSelectedPickerItems] = useState<Set<string>>(new Set());
  const [isProcessingPicker, setIsProcessingPicker] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const contentAreaRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
    const loadData = async () => {
        setIsLoading(true);
        try {
            // CRITICAL: Use getProjectById to fetch FULL data (Log sub-collection + Main Doc)
            const project = await api.getProjectById(projectId);
            
            if (project) {
                setFullProjectData(project); 
            }
        } catch (e) { console.error("Context Load Error", e); } finally { setIsLoading(false); }
    };
    loadData();
  }, [projectId, folderId]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, activeAgent, isLoading]);

  const handleAgentSelect = (agent: AgentType) => {
      setActiveAgent(agent);
      setAttachments([]);
      let welcomeMsg = `أهلاً بك. أنا ${AGENT_CONFIG[agent].title}.\nلقد اطلعت على كافة بيانات المشروع (اليوميات، المستخلصات، المقايسة، والتقارير). كيف يمكنني مساعدتك الآن؟`;
      setMessages([{ role: 'model', content: welcomeMsg, type: 'text' }]);
  };

  const handleSend = async (manualInput?: string) => {
      const userInput = manualInput || input;
      if ((!userInput.trim() && attachments.length === 0) || !activeAgent) return;
      
      let userDisplayContent = userInput;
      if (attachments.length > 0) userDisplayContent = `[مرفق ${attachments.length} ملفات] ${userInput}`;
      
      setMessages(prev => [...prev, { role: 'user', content: userDisplayContent, type: 'text' }]);
      setInput('');
      const uploadedFiles = [...attachments];
      setAttachments([]);
      setIsLoading(true);

      const lastModelMsg = [...messages].reverse().find(m => m.role === 'model');
      const prevContent = lastModelMsg ? (lastModelMsg.content as string) : '';

      try {
          // --- CONSULTANT LOGIC ---
          const response = await aiHelper.specializedConsultation(
              fullProjectData, 
              activeAgent, 
              userInput, 
              prevContent, 
              uploadedFiles
          );
          setMessages(prev => [...prev, { role: 'model', content: response, type: 'text' }]);
      } catch (err) {
          setMessages(prev => [...prev, { role: 'model', content: "عذراً، حدث خطأ أثناء المعالجة.", type: 'text' }]);
      } finally { setIsLoading(false); }
  };

  // ... (Keep existing handlers for files, archive, etc.)
  const handleChatFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
          setAttachments(prev => [...prev, ...Array.from(e.target.files!)]);
          setShowSourceModal(false);
      }
      if (chatFileRef.current) chatFileRef.current.value = '';
      if (chatCameraRef.current) chatCameraRef.current.value = ''; 
  };

  const removeAttachment = (index: number) => { setAttachments(prev => prev.filter((_, i) => i !== index)); };

  const handleOpenAppPicker = async () => { setShowSourceModal(false); setShowAppFilePicker(true); setPickerCurrentFolderId(projectId); setPickerBreadcrumbs([{id: projectId, name: 'الرئيسية'}]); setSelectedPickerItems(new Set()); await fetchPickerContents(projectId); };
  const fetchPickerContents = async (folderId: string) => { setLoadingFiles(true); try { const contents = await api.getContents(folderId); setPickerItems(contents); } catch(e) { setPickerItems([]); } finally { setLoadingFiles(false); } };
  const navigatePickerFolder = async (folder: FileItem) => { setPickerCurrentFolderId(folder.id); setPickerBreadcrumbs(prev => [...prev, { id: folder.id, name: folder.name }]); setSelectedPickerItems(new Set()); await fetchPickerContents(folder.id); };
  const navigatePickerBack = async () => { if (pickerBreadcrumbs.length <= 1) return; const newBreadcrumbs = [...pickerBreadcrumbs]; newBreadcrumbs.pop(); const parent = newBreadcrumbs[newBreadcrumbs.length - 1]; setPickerBreadcrumbs(newBreadcrumbs); setPickerCurrentFolderId(parent.id); setSelectedPickerItems(new Set()); await fetchPickerContents(parent.id); };
  const togglePickerSelection = (fileId: string) => { const next = new Set(selectedPickerItems); if (next.has(fileId)) next.delete(fileId); else next.add(fileId); setSelectedPickerItems(next); };
  const confirmPickerSelection = async () => { if (selectedPickerItems.size === 0) return; setIsProcessingPicker(true); const newFiles: File[] = []; try { const selectedFileItems = pickerItems.filter(i => selectedPickerItems.has(i.id) && i.type === ItemType.FILE); for (const item of selectedFileItems) { const blob = await api.downloadFileBlob(item.id); const file = new File([blob], item.name, { type: item.mimeType }); newFiles.push(file); } setAttachments(prev => [...prev, ...newFiles]); setShowAppFilePicker(false); } catch(e) { alert("خطأ تحميل"); } finally { setIsProcessingPicker(false); } };

  const handleOpenArchiveModal = (content: string, index: number) => { setContentToArchive(content); setArchiveTitle(`استشارة - ${new Date().toLocaleDateString('ar-EG')}`); setTargetMessageIndex(index); setArchiveModalOpen(true); };
  const confirmArchive = async () => { if (!contentToArchive) return; setIsSaving(true); try { const cat = await aiHelper.classifyArchiveCategory(contentToArchive); const fileId = await api.saveToArchive(archiveTitle, contentToArchive, cat); if (targetMessageIndex !== null) { setMessages(prev => prev.map((m, i) => i === targetMessageIndex ? { ...m, isSaved: true, savedFileId: fileId } : m)); } alert(`تم الحفظ في: ${cat}`); setArchiveModalOpen(false); } catch(e) { alert("فشل الحفظ."); } finally { setIsSaving(false); } };
  const handleEditAsLetter = (content: string, fileId?: string) => { if (fileId) { api.getFileMetadata(fileId).then(meta => { if (meta) { navigate(`/editor/${projectId}/${meta.parentId}?fileId=${fileId}`); } else { const draftName = `تقرير_استشاري_${new Date().toLocaleDateString('ar-EG').replace(/\//g, '-')}`; navigate(`/editor/${projectId}/${folderId}`, { state: { initialContent: content, filename: draftName } }); } }).catch(() => { const draftName = `تقرير_استشاري_${new Date().toLocaleDateString('ar-EG').replace(/\//g, '-')}`; navigate(`/editor/${projectId}/${folderId}`, { state: { initialContent: content, filename: draftName } }); }); } else { const draftName = `تقرير_استشاري_${new Date().toLocaleDateString('ar-EG').replace(/\//g, '-')}`; navigate(`/editor/${projectId}/${folderId}`, { state: { initialContent: content, filename: draftName } }); } };
  const handlePrintResponse = (content: string, type: string) => { printService.printReport(content, "تقرير استشاري", "PROJ-AI"); };
  const handleCopyText = (content: string) => { const tempDiv = document.createElement("div"); tempDiv.innerHTML = content; navigator.clipboard.writeText(tempDiv.textContent || ""); alert("تم النسخ"); };

  return (
    <div className="fixed inset-0 z-[2000] bg-slate-50 flex flex-col animate-fade-in no-print">
        <div className="w-full h-full bg-slate-50 flex flex-col relative overflow-hidden">
            <div className="bg-slate-900 p-4 text-white flex justify-between items-center shrink-0 shadow-lg z-10">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg border-2 border-slate-700"><i className="fa-solid fa-brain text-white"></i></div>
                    <div><h3 className="font-bold text-lg">المركز الاستشاري الموحد (AI Pro)</h3><p className="text-[10px] text-slate-400">Gemini 3 Powered | Data Engine</p></div>
                </div>
                <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center transition"><i className="fa-solid fa-times"></i></button>
            </div>

            {!activeAgent ? (
                <div className="flex-1 overflow-y-auto p-4 bg-slate-100">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {Object.entries(AGENT_CONFIG).map(([key, config]) => (
                            <div key={key} onClick={() => handleAgentSelect(key as AgentType)} className={`bg-white p-5 rounded-2xl shadow-sm border border-slate-200 cursor-pointer hover:shadow-xl hover:-translate-y-1 transition flex items-start gap-4 group`}>
                                <div className={`w-14 h-14 bg-${config.color}-100 text-${config.color}-600 rounded-2xl flex items-center justify-center text-2xl shrink-0 group-hover:scale-110 transition`}><i className={`fa-solid ${config.icon}`}></i></div>
                                <div className="flex-1">
                                    <div className="flex justify-between items-center mb-1">
                                        <h3 className="font-bold text-slate-900 text-base">{config.title}</h3>
                                        <i className="fa-solid fa-arrow-left text-slate-300 group-hover:text-blue-500 transition -rotate-45 group-hover:rotate-0"></i>
                                    </div>
                                    <p className="text-[11px] text-slate-500 leading-relaxed font-medium">{config.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <>
                    <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shadow-sm z-10 shrink-0">
                        <div className="flex items-center gap-3">
                            <button onClick={() => setActiveAgent(null)} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition text-slate-600"><i className="fa-solid fa-arrow-right rtl:rotate-180"></i></button>
                            <span className={`text-sm font-bold text-${AGENT_CONFIG[activeAgent].color}-700`}>{AGENT_CONFIG[activeAgent].title}</span>
                        </div>
                        {messages.length > 0 && <button onClick={() => setMessages([])} className="text-[10px] text-slate-400 hover:text-red-500"><i className="fa-solid fa-trash"></i> مسح</button>}
                    </div>

                    <div className="flex-1 overflow-y-auto p-0 bg-slate-50 relative" ref={contentAreaRef}>
                        {messages.length === 0 ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center opacity-60">
                                <i className={`fa-solid ${AGENT_CONFIG[activeAgent].icon} text-4xl mb-4 text-${AGENT_CONFIG[activeAgent].color}-400`}></i>
                                <h3 className="font-bold text-slate-700">كيف يمكنني مساعدتك؟</h3>
                            </div>
                        ) : (
                            <div className="w-full pb-4">
                                {messages.map((msg, idx) => {
                                    return (
                                        <div key={idx} className="w-full animate-scale-in mb-4">
                                            <div className={`flex items-center gap-2 mb-1 px-2 mt-4 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                                                <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 shadow-sm ${msg.role === 'user' ? 'bg-slate-700 text-white' : `bg-${AGENT_CONFIG[activeAgent].color}-100 text-${AGENT_CONFIG[activeAgent].color}-600`}`}><i className={`fa-solid ${msg.role === 'user' ? 'fa-user' : AGENT_CONFIG[activeAgent].icon} text-[10px]`}></i></div>
                                                <span className="text-[10px] font-bold text-slate-400">{msg.role === 'model' ? AGENT_CONFIG[activeAgent].title : 'أنت'}</span>
                                            </div>
                                            <div className={`w-full overflow-hidden overflow-x-auto p-1 sm:p-2 ${msg.role === 'user' ? 'bg-white text-slate-800' : 'bg-slate-50 text-slate-900'}`}>
                                                <div className="">
                                                    <div className={`prose prose-sm max-w-none text-inherit w-full px-2`} dangerouslySetInnerHTML={{__html: msg.content as string}}></div>
                                                    {msg.role === 'model' && idx > 0 && (
                                                        <div className="flex gap-2 mt-4 pt-3 border-t border-slate-200 justify-end no-print opacity-90 w-full px-2 flex-wrap">
                                                            <button onClick={() => handleCopyText(msg.content as string)} className="text-[10px] bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 px-3 py-1.5 rounded transition flex items-center gap-1 shadow-sm"><i className="fa-solid fa-copy"></i> نسخ</button>
                                                            <button onClick={() => handlePrintResponse(msg.content as string, msg.type || 'text')} className="text-[10px] bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 px-3 py-1.5 rounded transition flex items-center gap-1 shadow-sm"><i className="fa-solid fa-print"></i> طباعة</button>
                                                            <button onClick={() => handleEditAsLetter(msg.content as string, msg.savedFileId)} className="text-[10px] bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-3 py-1.5 rounded transition flex items-center gap-1 font-bold shadow-sm"><i className="fa-solid fa-pen-to-square"></i> تعديل</button>
                                                            {!msg.isSaved ? (
                                                                <button onClick={() => handleOpenArchiveModal(msg.content as string, idx)} className="text-[10px] bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded transition flex items-center gap-1 font-bold shadow-md"><i className="fa-solid fa-box-archive"></i> حفظ</button>
                                                            ) : (
                                                                <button disabled className="text-[10px] bg-teal-50 text-teal-600 border border-teal-200 px-3 py-1.5 rounded transition flex items-center gap-1 font-bold opacity-70"><i className="fa-solid fa-check"></i> تم الحفظ</button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                                <div ref={messagesEndRef} />
                            </div>
                        )}
                    </div>

                    <div className="p-3 bg-white border-t border-slate-200 shrink-0 z-20">
                        {attachments.length > 0 && (
                            <div className="flex gap-2 overflow-x-auto pb-2 mb-1 px-1">
                                {attachments.map((file, idx) => (
                                    <div key={idx} className="relative flex items-center bg-slate-50 border border-slate-200 rounded-lg p-1.5 pr-6 min-w-[120px] max-w-[200px] shrink-0">
                                        <div className="w-8 h-8 rounded bg-white flex items-center justify-center border border-slate-100 shrink-0 text-slate-500">
                                            {file.type.startsWith('image/') ? <img src={URL.createObjectURL(file)} className="w-full h-full object-cover rounded" alt="" /> : <i className="fa-solid fa-file"></i>}
                                        </div>
                                        <div className="flex flex-col ml-2 overflow-hidden">
                                            <span className="text-[9px] font-bold text-slate-700 truncate block w-full">{file.name}</span>
                                            <span className="text-[8px] text-slate-400">{(file.size / 1024).toFixed(0)} KB</span>
                                        </div>
                                        <button onClick={() => removeAttachment(idx)} className="absolute top-1 right-1 w-4 h-4 bg-red-100 text-red-500 rounded-full flex items-center justify-center text-[8px] hover:bg-red-200"><i className="fa-solid fa-times"></i></button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="flex gap-2 overflow-x-auto pb-3 mb-1 custom-scrollbar">
                            {AGENT_CONFIG[activeAgent].prompts.map((prompt, idx) => (
                                <button key={idx} onClick={() => handleSend(prompt)} className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-bold border transition whitespace-nowrap bg-slate-50 border-slate-200 text-slate-600 hover:bg-${AGENT_CONFIG[activeAgent].color}-50`}>{prompt}</button>
                            ))}
                        </div>
                        <div className="w-full relative flex gap-2 items-center">
                            <input type="file" multiple ref={chatFileRef} onChange={handleChatFileSelect} accept="image/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" />
                            <input type="file" ref={chatCameraRef} onChange={handleChatFileSelect} accept="image/*" capture="environment" className="hidden" />
                            <button onClick={() => setShowSourceModal(true)} className={`w-10 h-10 border border-slate-200 rounded-xl flex items-center justify-center hover:bg-slate-50 hover:text-indigo-600 transition shrink-0 ${attachments.length > 0 ? 'bg-indigo-50 text-indigo-600 border-indigo-200' : 'bg-white text-slate-500'}`} title="إرفاق ملفات"><i className="fa-solid fa-paperclip"></i>{attachments.length > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] w-4 h-4 flex items-center justify-center rounded-full border border-white">{attachments.length}</span>}</button>
                            <div className="flex-1 relative"><input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()} placeholder={attachments.length > 0 ? `تم إرفاق ${attachments.length} ملفات...` : "اكتب طلبك..."} disabled={isLoading} className="w-full pl-4 pr-4 py-3 bg-slate-50 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition text-sm shadow-inner border border-slate-200 text-slate-900" /></div>
                            <button onClick={() => handleSend()} disabled={(!input.trim() && attachments.length === 0) || isLoading} className={`w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center disabled:opacity-50 hover:scale-105 transition shadow-lg shrink-0`}>{isLoading ? <i className="fa-solid fa-circle-notch fa-spin text-xs"></i> : <i className="fa-solid fa-paper-plane rtl:rotate-180 text-xs"></i>}</button>
                        </div>
                    </div>
                </>
            )}
        </div>

        {/* Source Selection Modal & App File Picker (Same as before) */}
        {showSourceModal && (
            <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
                <div className="bg-white w-full max-w-xs rounded-2xl shadow-2xl p-4 animate-scale-in border border-slate-200 text-center">
                    <h3 className="text-slate-800 font-bold mb-4 text-sm">مصدر المرفقات</h3>
                    <div className="grid grid-cols-1 gap-3">
                        <button onClick={() => { setShowSourceModal(false); chatCameraRef.current?.click(); }} className="bg-blue-50 text-blue-700 p-3 rounded-xl hover:bg-blue-100 transition flex items-center justify-center gap-2 font-bold text-xs border border-blue-100"><i className="fa-solid fa-camera"></i> التقاط صورة</button>
                        <button onClick={() => { setShowSourceModal(false); chatFileRef.current?.click(); }} className="bg-slate-50 text-slate-700 p-3 rounded-xl hover:bg-slate-100 transition flex items-center justify-center gap-2 font-bold text-xs border border-slate-200"><i className="fa-regular fa-image"></i> من الجهاز</button>
                        <button onClick={handleOpenAppPicker} className="bg-indigo-50 text-indigo-700 p-3 rounded-xl hover:bg-indigo-100 transition flex items-center justify-center gap-2 font-bold text-xs border border-indigo-200"><i className="fa-solid fa-folder-open"></i> من ملفات المشروع</button>
                    </div>
                    <button onClick={() => setShowSourceModal(false)} className="mt-4 text-slate-400 text-xs font-bold hover:text-red-500">إلغاء</button>
                </div>
            </div>
        )}
        {showAppFilePicker && (
            <div className="fixed inset-0 z-[1700] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
                <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl flex flex-col max-h-[80vh] animate-scale-in border border-slate-200 overflow-hidden">
                    <div className="p-3 bg-slate-100 border-b border-slate-200 flex justify-between items-center shrink-0">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm"><i className="fa-solid fa-folder-tree text-orange-500"></i> اختر ملفات من المشروع</h3>
                        <button onClick={() => setShowAppFilePicker(false)} className="w-8 h-8 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-500 transition"><i className="fa-solid fa-times"></i></button>
                    </div>
                    <div className="px-3 py-2 bg-white border-b border-slate-100 flex items-center gap-1 overflow-x-auto text-xs whitespace-nowrap">
                        {pickerBreadcrumbs.length > 1 && <button onClick={navigatePickerBack} className="w-6 h-6 flex items-center justify-center bg-slate-100 rounded-full hover:bg-slate-200 mr-1"><i className="fa-solid fa-arrow-right text-[10px] text-slate-600"></i></button>}
                        {pickerBreadcrumbs.map((crumb, idx) => (<div key={crumb.id} className="flex items-center">{idx > 0 && <span className="text-slate-300 mx-1">/</span>}<span className={`font-bold ${idx === pickerBreadcrumbs.length - 1 ? 'text-orange-600' : 'text-slate-500'}`}>{crumb.name}</span></div>))}
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 bg-slate-50">
                        {loadingFiles ? <div className="text-center py-10"><div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div><p className="text-xs text-slate-400">جاري التحميل...</p></div> : pickerItems.length === 0 ? <div className="text-center py-10 text-slate-400"><i className="fa-solid fa-folder-open text-3xl mb-2 opacity-30"></i><p className="text-xs font-bold">فارغ</p></div> : (
                            <div className="space-y-1">
                                {pickerItems.map(item => {
                                    const isFolder = item.type === ItemType.FOLDER;
                                    const isSelected = selectedPickerItems.has(item.id);
                                    if (!isFolder && !item.mimeType?.match(/(image|pdf|text|word)/)) return null;
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
  );
};

export default ProjectAI;
