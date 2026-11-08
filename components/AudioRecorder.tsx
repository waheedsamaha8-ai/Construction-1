
import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Play, Trash2, Send, Loader2, FileAudio, FileText, FileSignature, ClipboardList } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../services/api';
import { aiHelper } from '../services/aiHelper';
import { useNavigate } from 'react-router-dom';

interface AudioRecorderProps {
    projectId: string;
    folderId: string;
    onUploadComplete: () => void;
}

const AudioRecorder: React.FC<AudioRecorderProps> = ({ projectId, folderId, onUploadComplete }) => {
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [showOptions, setShowOptions] = useState(false);
    const [analysisType, setAnalysisType] = useState<'report' | 'letter' | 'memo' | 'none'>('none');
    
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const navigate = useNavigate();

    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            chunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };

            mediaRecorder.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
                setAudioBlob(blob);
                setShowOptions(true);
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            setIsRecording(true);
            setRecordingTime(0);
            timerRef.current = setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);
        } catch (err) {
            alert("لا يمكن الوصول للميكروفون. تأكد من الصلاحيات.");
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            if (timerRef.current) clearInterval(timerRef.current);
        }
    };

    const handleUploadOnly = async () => {
        if (!audioBlob) return;
        setIsUploading(true);
        try {
            const file = new File([audioBlob], `Recording_${new Date().toISOString().replace(/[:.]/g, '-')}.webm`, { type: 'audio/webm' });
            await api.uploadFile(folderId, file);
            onUploadComplete();
            reset();
        } catch (e) {
            alert("فشل الرفع");
        } finally {
            setIsUploading(false);
        }
    };

    const handleAnalyze = async (type: 'report' | 'letter' | 'memo') => {
        if (!audioBlob) return;
        setIsAnalyzing(true);
        setAnalysisType(type);
        try {
            // 1. Upload the audio file first
            const fileName = `Audio_${type}_${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
            const file = new File([audioBlob], fileName, { type: 'audio/webm' });
            const uploadedFile = await api.uploadFile(folderId, file);
            
            // 2. Analyze with AI
            const analysis = await aiHelper.analyzeAudioRecording(audioBlob, type);
            
            // 3. Navigate to editor with the analysis
            navigate(`/editor/${projectId}/${folderId}`, { 
                state: { 
                    initialContent: analysis, 
                    filename: `تحليل_${type}_${new Date().toLocaleDateString('ar-EG').replace(/\//g, '-')}` 
                } 
            });
            
            reset();
        } catch (e) {
            alert("فشل التحليل الذكي");
        } finally {
            setIsAnalyzing(false);
            setAnalysisType('none');
        }
    };

    const reset = () => {
        setAudioBlob(null);
        setShowOptions(false);
        setRecordingTime(0);
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="fixed bottom-6 left-6 z-[100] flex flex-col items-start gap-4">
            <AnimatePresence>
                {showOptions && (
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.8, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.8, y: 20 }}
                        className="bg-white rounded-3xl shadow-2xl border border-slate-200 p-6 w-72 space-y-4"
                    >
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="font-bold text-slate-800 text-sm">تم التسجيل ({formatTime(recordingTime)})</h3>
                            <button onClick={reset} className="text-slate-400 hover:text-red-500 transition">
                                <Trash2 size={18} />
                            </button>
                        </div>

                        <div className="grid grid-cols-1 gap-2">
                            <button 
                                onClick={handleUploadOnly}
                                disabled={isUploading || isAnalyzing}
                                className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 hover:bg-slate-100 transition text-slate-700 text-xs font-bold border border-slate-100 disabled:opacity-50"
                            >
                                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                                    {isUploading ? <Loader2 size={16} className="animate-spin" /> : <FileAudio size={18} />}
                                </div>
                                حفظ كملف صوتي فقط
                            </button>

                            <div className="pt-2 border-t border-slate-100">
                                <p className="text-[10px] text-slate-400 font-bold mb-2">تحليل بالذكاء الاصطناعي إلى:</p>
                                <div className="grid grid-cols-3 gap-2">
                                    <button 
                                        onClick={() => handleAnalyze('report')}
                                        disabled={isUploading || isAnalyzing}
                                        className="flex flex-col items-center gap-1 p-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 transition text-indigo-700 text-[10px] font-bold border border-indigo-100 disabled:opacity-50"
                                    >
                                        <FileText size={18} />
                                        تقرير
                                    </button>
                                    <button 
                                        onClick={() => handleAnalyze('letter')}
                                        disabled={isUploading || isAnalyzing}
                                        className="flex flex-col items-center gap-1 p-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 transition text-emerald-700 text-[10px] font-bold border border-emerald-100 disabled:opacity-50"
                                    >
                                        <FileSignature size={18} />
                                        خطاب
                                    </button>
                                    <button 
                                        onClick={() => handleAnalyze('memo')}
                                        disabled={isUploading || isAnalyzing}
                                        className="flex flex-col items-center gap-1 p-2 rounded-xl bg-amber-50 hover:bg-amber-100 transition text-amber-700 text-[10px] font-bold border border-amber-100 disabled:opacity-50"
                                    >
                                        <ClipboardList size={18} />
                                        مذكرة
                                    </button>
                                </div>
                            </div>
                        </div>

                        {isAnalyzing && (
                            <div className="flex items-center justify-center gap-2 text-indigo-600 animate-pulse py-2">
                                <Loader2 size={16} className="animate-spin" />
                                <span className="text-[10px] font-bold">جاري التحليل الذكي...</span>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            <button 
                onClick={isRecording ? stopRecording : startRecording}
                className={clsx(
                    "w-16 h-16 rounded-full shadow-2xl flex items-center justify-center transition-all transform active:scale-90",
                    isRecording ? "bg-red-500 text-white animate-pulse" : "bg-indigo-600 text-white hover:bg-indigo-700"
                )}
            >
                {isRecording ? (
                    <div className="flex flex-col items-center">
                        <Square size={24} fill="white" />
                        <span className="text-[10px] font-bold mt-1">{formatTime(recordingTime)}</span>
                    </div>
                ) : (
                    <Mic size={28} />
                )}
            </button>
        </div>
    );
};

export default AudioRecorder;

function clsx(...classes: any[]) {
    return classes.filter(Boolean).join(' ');
}
