
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { aiHelper } from '../services/aiHelper';
import { api } from '../services/api';
import { ReportGenerator, wrapTablesInHtml } from '../services/reportGenerator';

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
                {messages.map((msg, idx) => (
                    <div key={idx} className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        {/* 
                           Message Bubble Styling:
                           - w-full: Full width usage
                           - text-base: Larger font size for reading 
                           - No generic styling constraints, let HTML content drive layout
                        */}
                        <div className={`w-full p-4 rounded-xl shadow-sm border ${
                            msg.role === 'user' 
                            ? 'bg-white border-slate-200 text-slate-800' // User message simple white box
                            : 'bg-transparent border-none p-0' // Expert message is transparent container for Boxes
                        }`}>
                            {msg.role === 'user' && <div className="font-bold text-slate-900 mb-1 flex items-center gap-2"><i className="fa-solid fa-user text-slate-400"></i> أنت:</div>}
                            
                            {/* Render HTML Content with Prose for proper typography */}
                            <div className={`prose prose-lg max-w-none text-slate-800 leading-relaxed ${msg.role === 'user' ? 'text-base' : ''}`} dangerouslySetInnerHTML={{ __html: wrapTablesInHtml(msg.content) }}></div>

                            {/* Expert Action Buttons */}
                            {msg.role === 'expert' && idx > 0 && (
                                <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-slate-200/50">
                                    <button 
                                        onClick={() => handleEditResponse(msg.content, msg.savedFileId)}
                                        className="text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition flex items-center gap-1 border border-indigo-200"
                                    >
                                        <i className="fa-solid fa-pen-to-square"></i> تعديل كخطاب
                                    </button>
                                    
                                    {!msg.isSaved ? (
                                        <button 
                                            onClick={() => handleSaveResponse(idx, msg.content)}
                                            disabled={isSaving}
                                            className="text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 px-3 py-1.5 rounded-lg transition flex items-center gap-1 border border-teal-200 disabled:opacity-50"
                                        >
                                            {isSaving ? <i className="fa-solid fa-circle-notch fa-spin"></i> : <i className="fa-solid fa-box-archive"></i>} حفظ في الأرشيف
                                        </button>
                                    ) : (
                                        <span className="text-xs font-bold text-green-600 bg-green-50 px-3 py-1.5 rounded-lg border border-green-200 flex items-center gap-1 cursor-default">
                                            <i className="fa-solid fa-check"></i> تم الحفظ
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
                
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
