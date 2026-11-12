
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { aiHelper } from '../services/aiHelper';
import { api } from '../services/api';
import { printService } from '../services/printService';
import { ReportGenerator, wrapTablesInHtml } from '../services/reportGenerator';
import InteractiveReportViewer from './InteractiveReportViewer';

interface InstantExpertProps {
    onClose: () => void;
}

interface ChatMessage {
    role: 'user' | 'expert';
    content: string;
    isSaved?: boolean;
    savedFileId?: string;
}

const InstantExpert: React.FC<InstantExpertProps> = ({ onClose }) => {
    const navigate = useNavigate();
    const [messages, setMessages] = useState<ChatMessage[]>([
        { role: 'expert', content: `
            <div class="info-box editable-box">
                <strong>أهلاً بك يا هندسة. أنا المستشار الهندسي الشامل (مكتبة هندسية متكاملة).</strong><br>
                أنا جاهز للإجابة بدقة استشارية عن:<br>
                <ul style="margin-top:5px; margin-bottom:5px;">
                    <li>🏗️ <strong>الأكواد والمعايير:</strong> الكود المصري (ECP)، الأمريكي (ACI)، الحريق (NFPA).</li>
                    <li>📐 <strong>التصميم المعماري:</strong> أبعاد نويفرت (Neufert)، تخطيط المساحات، وقوانين البناء (119).</li>
                    <li>⚖️ <strong>العقود والقانون:</strong> عقود الفيديك (FIDIC)، المطالبات، وفض النزاعات.</li>
                    <li>🎨 <strong>التصميم الداخلي:</strong> تنسيق الألوان، الإضاءة، وطاقة المكان (Feng Shui).</li>
                    <li>⚙️ <strong>الإلكتروميكانيكل (MEP):</strong> تكييف، حريق، صحي، وكهرباء.</li>
                    <li>🚧 <strong>التنفيذ والموقع:</strong> معدلات الأداء، استلام الأعمال، واشتراطات السلامة.</li>
                </ul>
                <strong>تفضل بطرح سؤالك أو ارفق صورة/مستند للتحليل.</strong>
            </div>
        ` }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [attachment, setAttachment] = useState<File | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [activeMenuMessageIdx, setActiveMenuMessageIdx] = useState<number | null>(null);
    const [directEditingMessageIdx, setDirectEditingMessageIdx] = useState<number | null>(null);
    
    const fileInputRef = useRef<HTMLInputElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isLoading]);

    const handleSend = async () => {
        if (!input.trim() && !attachment) return;

        const userMsg = input;
        const fileToSend = attachment;
        
        // Add User Message
        setMessages(prev => [...prev, { 
            role: 'user', 
            content: fileToSend ? `[مرفق: ${fileToSend.name}] ${userMsg}` : userMsg 
        }]);
        
        setInput('');
        setAttachment(null);
        setIsLoading(true);

        try {
            const response = await aiHelper.askGeneralExpert(userMsg, fileToSend || undefined);
            setMessages(prev => [...prev, { role: 'expert', content: response }]);
        } catch (error) {
            setMessages(prev => [...prev, { role: 'expert', content: '<div class="warning-box editable-box">عذراً، حدث خطأ في الاتصال.</div>' }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // --- Save Logic ---
    const handleSaveResponse = async (index: number, content: string) => {
        setIsSaving(true);
        try {
            const title = `استشارة هندسية - ${new Date().toLocaleDateString('ar-EG').replace(/\//g, '-')}-${Math.floor(Math.random()*1000)}`;
            
            // Build Full Report Wrapper
            const fullReport = ReportGenerator.buildReport(title, content, {
                subtitle: "تقرير الخبير الهندسي (قوانين وأكواد)",
                footerText: "تم الحفظ من الخبير الفوري"
            });

            // Save to "الخبير الهندسي" Section
            // api.saveToArchive automatically handles finding/creating the folder by name
            const fileId = await api.saveToArchive(title, fullReport, 'الخبير الهندسي');
            
            setMessages(prev => prev.map((msg, i) => i === index ? { ...msg, isSaved: true, savedFileId: fileId } : msg));
            alert("تم حفظ الاستشارة بنجاح في قسم 'الخبير الهندسي' بالأرشيف.");
        } catch (e) {
            alert("فشل الحفظ في الأرشيف.");
            console.error(e);
        } finally {
            setIsSaving(false);
        }
    };

    const handleEditResponse = async (content: string, savedFileId?: string) => {
        try {
            const rootId = await api.ensureRootFolder();
            const archiveId = await api.getArchiveFolderId();
            
            if (savedFileId) {
                // If already saved, open that specific file
                // We need to find the parent folder of the saved file (which is the Expert Section Folder)
                const meta = await api.getFileMetadata(savedFileId);
                if (meta) {
                    navigate(`/editor/${rootId}/${meta.parentId}?fileId=${savedFileId}`);
                    onClose();
                    return;
                }
            }

            // If not saved yet, create a draft in memory and open editor
            // We'll target the Archive Root temporarily, user can save to Expert section from Editor
            const draftTitle = `مسودة_استشارة_${Date.now()}`;
            const fullReport = ReportGenerator.buildReport(draftTitle, content, { subtitle: "مسودة من الخبير الفوري" });
            
            navigate(`/editor/${rootId}/${archiveId}`, { 
                state: { initialContent: fullReport, filename: draftTitle } 
            });
            onClose();

        } catch (e) {
            alert("حدث خطأ أثناء فتح المحرر.");
        }
    };

    // Quick Prompts
    const quickPrompts = [
        "اشتراطات كود الحريق للمباني الإدارية",
        "نسب البناء في قانون 119 ولائحته",
        "توزيع الفرش المكتبي (Neufert Standards)",
        "المطالبات الزمنية في عقود الفيديك",
        "قواعد الفينج شوي لغرف النوم"
    ];

    return (
        // Full screen fixed container
        <div className="fixed inset-0 z-[2000] bg-white flex flex-col animate-fade-in no-print">
            
            {/* Header - Full Width */}
            <div className="bg-slate-900 p-4 flex justify-between items-center text-white shrink-0 shadow-md">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-500 to-teal-700 flex items-center justify-center border-2 border-slate-700 shadow-inner">
                        <i className="fa-solid fa-user-graduate text-white text-lg"></i>
                    </div>
                    <div>
                        <h3 className="font-bold text-lg text-white">الخبير الهندسي الفوري</h3>
                        <p className="text-[11px] text-slate-300 opacity-90 font-medium">أكواد • فيديك • نويفرت • تصميم</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={onClose} className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition">
                        <i className="fa-solid fa-times text-lg"></i>
                    </button>
                </div>
            </div>

            {/* Chat Area - Full Width & Height */}
            <div className="flex-1 overflow-y-auto p-2 sm:p-4 bg-slate-50 space-y-6">
                {messages.map((msg, idx) => {
                    const isDirectEditingThis = directEditingMessageIdx === idx;
                    const isMenuOpenForThis = activeMenuMessageIdx === idx;
                    return (
                        <div key={idx} className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`w-full p-4 rounded-xl shadow-sm border ${
                                msg.role === 'user' 
                                ? 'bg-white border-slate-200 text-slate-800'
                                : 'bg-white border-slate-200 p-3 sm:p-5'
                            }`}>
                                {msg.role === 'user' && <div className="font-bold text-slate-900 mb-1 flex items-center gap-2"><i className="fa-solid fa-user text-slate-400"></i> أنت:</div>}
                                
                                {msg.role === 'expert' && idx > 0 && (
                                    <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-100">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <div className="w-7 h-7 rounded-lg bg-teal-600 text-white flex items-center justify-center shrink-0">
                                                <i className="fa-solid fa-user-graduate text-xs"></i>
                                            </div>
                                            <span className="font-bold text-xs sm:text-sm text-slate-800 truncate !bg-transparent !border-0 !p-0 !m-0">تقرير المستشار الهندسي</span>
                                            {msg.isSaved && (
                                                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                                                    <i className="fa-solid fa-check text-[9px]"></i> محفوظ في الأرشيف
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-1.5 relative shrink-0">
                                            {isDirectEditingThis && (
                                                <button
                                                    type="button"
                                                    onClick={() => setDirectEditingMessageIdx(null)}
                                                    className="w-8 h-8 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center transition text-xs shadow-sm"
                                                    title="إنهاء التعديل المباشر"
                                                >
                                                    <i className="fa-solid fa-check"></i>
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => setActiveMenuMessageIdx(isMenuOpenForThis ? null : idx)}
                                                className={`w-8 h-8 rounded-xl flex items-center justify-center transition text-xs border ${
                                                    isMenuOpenForThis
                                                        ? 'bg-indigo-600 text-white border-indigo-400 shadow-md'
                                                        : isDirectEditingThis
                                                            ? 'bg-indigo-100 text-indigo-700 border-indigo-300'
                                                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                                                }`}
                                                title="خيارات التقرير"
                                            >
                                                <i className="fa-solid fa-ellipsis-vertical text-sm"></i>
                                            </button>

                                            {isMenuOpenForThis && (
                                                <>
                                                    <div className="fixed inset-0 z-[2100]" onClick={() => setActiveMenuMessageIdx(null)}></div>
                                                    <div className="absolute left-0 top-9 w-60 bg-slate-900/95 backdrop-blur-xl border border-slate-700 rounded-2xl shadow-2xl p-2 z-[2150] space-y-1.5 text-white animate-scale-in origin-top-left">
                                                        <div className="px-2.5 py-1 border-b border-slate-800 flex items-center justify-between">
                                                            <span className="text-[10px] font-bold text-slate-400">إجراءات التقرير</span>
                                                            <i className="fa-solid fa-file-lines text-[10px] text-indigo-400"></i>
                                                        </div>

                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setActiveMenuMessageIdx(null);
                                                                setDirectEditingMessageIdx(isDirectEditingThis ? null : idx);
                                                            }}
                                                            className={`w-full px-3 py-2.5 rounded-xl text-white flex items-center gap-2.5 transition text-xs font-bold text-right ${
                                                                isDirectEditingThis
                                                                    ? 'bg-emerald-600 hover:bg-emerald-500 shadow-md ring-1 ring-emerald-400'
                                                                    : 'bg-indigo-600 hover:bg-indigo-500 shadow-sm'
                                                            }`}
                                                        >
                                                            <div className="w-6 h-6 rounded-lg bg-white/20 text-white flex items-center justify-center shrink-0">
                                                                <i className={`fa-solid ${isDirectEditingThis ? 'fa-check' : 'fa-file-pen'} text-xs`}></i>
                                                            </div>
                                                            <div className="flex-1 text-right">
                                                                <div>{isDirectEditingThis ? 'إنهاء التعديل المباشر' : 'التعديل المباشر'}</div>
                                                                <div className="text-[10px] text-indigo-200 font-normal">حفظ تلقائي على التقرير</div>
                                                            </div>
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setActiveMenuMessageIdx(null);
                                                                handleEditResponse(msg.content, msg.savedFileId);
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
                                                                setActiveMenuMessageIdx(null);
                                                                printService.printReport(msg.content, 'تقرير المستشار الهندسي', 'EXP-AI');
                                                            }}
                                                            className="w-full px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-emerald-600 text-white flex items-center gap-2.5 transition text-xs font-bold text-right"
                                                        >
                                                            <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-300 flex items-center justify-center shrink-0">
                                                                <i className="fa-solid fa-print text-xs"></i>
                                                            </div>
                                                            <span>طباعة المستند</span>
                                                        </button>

                                                        {!msg.isSaved && (
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setActiveMenuMessageIdx(null);
                                                                    handleSaveResponse(idx, msg.content);
                                                                }}
                                                                disabled={isSaving}
                                                                className="w-full px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-teal-600 text-white flex items-center gap-2.5 transition text-xs font-bold text-right disabled:opacity-50"
                                                            >
                                                                <div className="w-6 h-6 rounded-lg bg-teal-500/20 text-teal-300 flex items-center justify-center shrink-0">
                                                                    {isSaving ? <i className="fa-solid fa-circle-notch fa-spin text-xs"></i> : <i className="fa-solid fa-box-archive text-xs"></i>}
                                                                </div>
                                                                <span>حفظ في الأرشيف الهندسي</span>
                                                            </button>
                                                        )}

                                                        <button
                                                            type="button"
                                                            onClick={async () => {
                                                                setActiveMenuMessageIdx(null);
                                                                if (!window.confirm('هل أنت متأكد من حذف هذا التقرير؟')) return;
                                                                if (msg.savedFileId) {
                                                                    try { await api.deleteItem(msg.savedFileId); } catch (e) {}
                                                                }
                                                                if (isDirectEditingThis) setDirectEditingMessageIdx(null);
                                                                setMessages(prev => prev.filter((_, i) => i !== idx));
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
                                )}

                                {/* Render HTML Content with InteractiveReportViewer for expert reports */}
                                {msg.role === 'expert' && idx > 0 ? (
                                    <InteractiveReportViewer
                                        htmlContent={msg.content}
                                        showFloatingEditBar={false}
                                        isDirectEditing={isDirectEditingThis}
                                        onDirectEditChange={(val) => setDirectEditingMessageIdx(val ? idx : null)}
                                        onContentChange={(updatedHtml) => {
                                            setMessages(prev => prev.map((m, i) => i === idx ? { ...m, content: updatedHtml } : m));
                                            if (msg.savedFileId) {
                                                const title = `استشارة هندسية - ${new Date().toLocaleDateString('ar-EG').replace(/\//g, '-')}`;
                                                const fullReport = ReportGenerator.buildReport(title, updatedHtml, {
                                                    subtitle: "تقرير الخبير الهندسي (قوانين وأكواد)",
                                                    footerText: "تم الحفظ من الخبير الفوري"
                                                });
                                                api.updateFileContent(msg.savedFileId, fullReport).catch(() => {});
                                            }
                                        }}
                                    />
                                ) : (
                                    <div className={`prose prose-lg max-w-none text-slate-800 leading-relaxed ${msg.role === 'user' ? 'text-base' : ''}`} dangerouslySetInnerHTML={{ __html: wrapTablesInHtml(msg.content) }}></div>
                                )}
                            </div>
                        </div>
                    );
                })}
                
                {isLoading && (
                    <div className="w-full flex justify-center py-8">
                        <div className="bg-white px-6 py-3 rounded-full shadow-md border border-slate-200 flex items-center gap-3">
                            <div className="w-5 h-5 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
                            <span className="text-sm font-bold text-teal-800">جاري استشارة المكتبة الهندسية والأكواد...</span>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Quick Prompts (Only if no interaction yet) */}
            {messages.length === 1 && (
                <div className="px-4 py-3 bg-slate-100 border-t border-slate-200 overflow-x-auto whitespace-nowrap hide-scrollbar flex gap-2 shrink-0">
                    {quickPrompts.map((p, i) => (
                        <button key={i} onClick={() => { setInput(p); setTimeout(handleSend, 100); }} className="px-4 py-2 bg-white border border-teal-200 text-teal-800 rounded-full text-sm font-bold shadow-sm hover:bg-teal-50 transition">
                            {p}
                        </button>
                    ))}
                </div>
            )}

            {/* Input Area */}
            <div className="p-4 bg-white border-t border-slate-200 shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                {attachment && (
                    <div className="flex items-center gap-3 mb-3 bg-teal-50 p-3 rounded-xl text-sm text-teal-800 border border-teal-100">
                        <i className="fa-solid fa-paperclip text-lg"></i>
                        <span className="truncate flex-1 font-bold">{attachment.name}</span>
                        <button onClick={() => setAttachment(null)} className="text-red-500 hover:text-red-700 p-1"><i className="fa-solid fa-times"></i></button>
                    </div>
                )}
                <div className="flex gap-3 items-end">
                    <button onClick={() => fileInputRef.current?.click()} className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center justify-center transition border border-slate-200 shrink-0">
                        <i className="fa-solid fa-camera text-xl"></i>
                    </button>
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={(e) => e.target.files && setAttachment(e.target.files[0])} 
                        className="hidden" 
                        accept="image/*"
                    />
                    <textarea 
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="اسأل في الكود، القانون، أو التصميم..."
                        className="flex-1 bg-slate-50 border border-slate-300 rounded-2xl p-4 text-base outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition resize-none max-h-40 min-h-[50px] font-medium"
                        rows={1}
                    />
                    <button onClick={handleSend} disabled={(!input.trim() && !attachment) || isLoading} className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center transition hover:bg-slate-800 disabled:opacity-50 shadow-lg shrink-0 hover:scale-105">
                        <i className="fa-solid fa-paper-plane rtl:rotate-180 text-xl"></i>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default InstantExpert;
