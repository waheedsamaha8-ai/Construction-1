
import React, { useState, useEffect } from 'react';
import { Project } from '../types';

interface ProjectReportModalProps {
    isOpen: boolean;
    onClose: () => void;
    project: Project | null;
    onGenerate: (startDate: string, endDate: string, reportType: string, title: string) => void;
    isGenerating: boolean;
}

type ReportType = 'daily' | 'weekly' | 'monthly' | 'final';

const ProjectReportModal: React.FC<ProjectReportModalProps> = ({ isOpen, onClose, project, onGenerate, isGenerating }) => {
    const [reportType, setReportType] = useState<ReportType>('daily');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [customTitle, setCustomTitle] = useState('');

    // Auto-calculate dates based on type
    useEffect(() => {
        if (!isOpen) return;
        
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        
        // Default End Date is Today
        let end = todayStr;
        let start = new Date();
        let title = '';

        switch (reportType) {
            case 'daily':
                start = today;
                title = 'التقرير الفني اليومي المصور';
                break;
            case 'weekly':
                start.setDate(today.getDate() - 7);
                title = 'تقرير الموقف التنفيذي الأسبوعي';
                break;
            case 'monthly':
                start.setDate(today.getDate() - 30);
                title = 'التقرير الشهري وقياس الأداء';
                break;
            case 'final':
                title = 'التقرير الختامي للمشروع (Final Report)';
                // Logic: Find the very first log date
                if (project?.executionLogs && project.executionLogs.length > 0) {
                    // Sort logs ascending to find the oldest
                    const sortedLogs = [...project.executionLogs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                    start = new Date(sortedLogs[0].date); // First action date
                    
                    // Update End Date to last action date (optional, or keep today)
                    const lastLogDate = sortedLogs[sortedLogs.length - 1].date;
                    end = lastLogDate > todayStr ? lastLogDate : todayStr;
                } else if (project?.createdAt) {
                    start = new Date(project.createdAt);
                } else {
                    // Fallback if no data at all
                    start.setFullYear(today.getFullYear() - 1);
                }
                break;
        }
        
        setEndDate(end);
        setStartDate(start.toISOString().split('T')[0]);
        setCustomTitle(title);

    }, [reportType, isOpen, project]);

    if (!isOpen) return null;

    const handleSubmit = () => {
        onGenerate(startDate, endDate, reportType, customTitle);
    };

    return (
        <div className="fixed inset-0 z-[1600] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-scale-in border border-slate-200">
                
                {/* Header */}
                <div className="bg-gradient-to-r from-rose-700 to-pink-800 p-3 text-white flex justify-between items-center shrink-0">
                    <h3 className="font-bold flex items-center gap-2 text-sm">
                        <i className="fa-solid fa-file-invoice text-yellow-300"></i>
                        إصدار تقرير مشروع مصور
                    </h3>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={handleSubmit} 
                            disabled={isGenerating}
                            className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition shadow-lg transform active:scale-90 disabled:opacity-50"
                            title="إنشاء التقرير الآن"
                        >
                            {isGenerating ? <i className="fa-solid fa-circle-notch fa-spin text-sm"></i> : <i className="fa-solid fa-wand-magic-sparkles text-sm"></i>}
                        </button>
                        <button onClick={onClose} disabled={isGenerating} className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition transform active:scale-90">
                            <i className="fa-solid fa-times text-sm"></i>
                        </button>
                    </div>
                </div>

                <div className="p-3 space-y-4 bg-slate-50 overflow-y-auto">
                    
                    {/* Report Type Selection */}
                    <div>
                        <div className="grid grid-cols-2 gap-2">
                            <button 
                                onClick={() => setReportType('daily')}
                                className={`p-3 rounded-xl border text-[10px] font-bold transition flex items-center justify-center gap-2 ${reportType === 'daily' ? 'bg-rose-50 border-rose-500 text-rose-700 ring-1 ring-rose-500' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                            >
                                <i className="fa-solid fa-calendar-day"></i> يومي
                            </button>
                            <button 
                                onClick={() => setReportType('weekly')}
                                className={`p-3 rounded-xl border text-[10px] font-bold transition flex items-center justify-center gap-2 ${reportType === 'weekly' ? 'bg-rose-50 border-rose-500 text-rose-700 ring-1 ring-rose-500' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                            >
                                <i className="fa-solid fa-calendar-week"></i> أسبوعي
                            </button>
                            <button 
                                onClick={() => setReportType('monthly')}
                                className={`p-3 rounded-xl border text-[10px] font-bold transition flex items-center justify-center gap-2 ${reportType === 'monthly' ? 'bg-rose-50 border-rose-500 text-rose-700 ring-1 ring-rose-500' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                            >
                                <i className="fa-regular fa-calendar-days"></i> شهري
                            </button>
                            <button 
                                onClick={() => setReportType('final')}
                                className={`p-3 rounded-xl border text-[10px] font-bold transition flex items-center justify-center gap-2 ${reportType === 'final' ? 'bg-rose-50 border-rose-500 text-rose-700 ring-1 ring-rose-500' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                            >
                                <i className="fa-solid fa-flag-checkered"></i> ختامي (كامل)
                            </button>
                        </div>
                    </div>

                    {/* Date Range & Title */}
                    <div className="space-y-3 p-3 bg-white rounded-xl border border-slate-200 shadow-sm">
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-1">عنوان التقرير</label>
                            <input 
                                type="text" 
                                value={customTitle} 
                                onChange={(e) => setCustomTitle(e.target.value)} 
                                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 outline-none focus:border-rose-500"
                            />
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 mb-1">من تاريخ</label>
                                <input 
                                    type="date" 
                                    value={startDate} 
                                    onChange={(e) => setStartDate(e.target.value)} 
                                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-mono font-bold text-slate-800 outline-none focus:border-rose-500"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 mb-1">إلى تاريخ</label>
                                <input 
                                    type="date" 
                                    value={endDate} 
                                    onChange={(e) => setEndDate(e.target.value)} 
                                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-mono font-bold text-slate-800 outline-none focus:border-rose-500"
                                />
                            </div>
                        </div>
                    </div>

                    {isGenerating && (
                        <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-center animate-pulse">
                            <p className="text-[10px] font-bold text-rose-700">جاري استدعاء الاستشاري وكتابة التقرير...</p>
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
};

export default ProjectReportModal;
