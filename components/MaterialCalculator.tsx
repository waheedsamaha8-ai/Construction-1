
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { aiHelper } from '../services/aiHelper';
import { api } from '../services/api';
import { ReportGenerator } from '../services/reportGenerator';
import { MaterialCalculationResult } from '../types';

interface MaterialCalculatorProps {
    onClose: () => void;
}

const MaterialCalculator: React.FC<MaterialCalculatorProps> = ({ onClose }) => {
    const navigate = useNavigate();
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<MaterialCalculationResult | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const handleCalculate = async () => {
        if (!input.trim()) return;
        setLoading(true);
        setResult(null);
        try {
            const data = await aiHelper.calculateMaterials(input);
            setResult(data);
        } catch (error) {
            alert("حدث خطأ أثناء الحساب. يرجى المحاولة مرة أخرى.");
        } finally {
            setLoading(false);
        }
    };

    const generateHTML = () => {
        if (!result) return '';
        const bodyHtml = `
            <h2>تقرير حصر خامات هندسي</h2>
            <div class="highlight-box">
                <p><strong>البند:</strong> ${result.itemName}</p>
                <p><strong>الكمية:</strong> ${result.inputQuantity}</p>
            </div>
            
            <table>
                <thead>
                    <tr>
                        <th>الخامة</th>
                        <th>الوحدة</th>
                        <th>المعدل</th>
                        <th>هالك %</th>
                        <th>الكمية الصافية</th>
                        <th>إجمالي الطلب</th>
                    </tr>
                </thead>
                <tbody>
                    ${result.materials.map(m => `
                        <tr>
                            <td>${m.materialName}</td>
                            <td>${m.unit}</td>
                            <td>${m.quantityPerUnit}</td>
                            <td>${m.wastePercentage}%</td>
                            <td>${Number(m.totalQuantity).toFixed(2)}</td>
                            <td style="font-weight: bold; background-color: #f0fdf4;">${Number(m.totalWithWaste).toFixed(2)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <div class="success-box">
                <strong>الأسس والملاحظات:</strong>
                <p>${result.calculationBasis || ''}</p>
                <p>${result.notes || ''}</p>
            </div>
        `;
        return ReportGenerator.buildReport(`حصر مواد - ${result.itemName.substring(0, 30)}`, bodyHtml);
    };

    const handleSaveToArchive = async () => {
        if (!result) return;
        setIsSaving(true);
        try {
            const html = generateHTML();
            await api.saveToArchive(`حصر مواد - ${result.itemName.substring(0, 30)}`, html, 'التنفيذ والإنشاءات');
            alert("تم الحفظ في الأرشيف الهندسي.");
            onClose();
        } catch (e) {
            alert("فشل الحفظ.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleEditAsLetter = () => {
        if (!result) return;
        const html = generateHTML();
        api.getArchiveFolderId().then(archiveId => {
             api.ensureRootFolder().then(rootId => {
                 navigate(`/editor/${rootId}/${archiveId}`, { 
                     state: { initialContent: html, filename: `حصر_مواد_${result.itemName.substring(0, 20)}` } 
                 });
                 onClose();
             });
        });
    };

    return (
        <div className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-scale-in border border-slate-200">
                <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-6 text-white flex justify-between items-start">
                    <div>
                        <h3 className="text-xl font-bold flex items-center gap-2">
                            <i className="fa-solid fa-calculator text-yellow-500"></i>
                            حاسبة المواد الفورية
                        </h3>
                        <p className="text-xs text-slate-400 mt-1">
                            أدخل وصف البند الهندسي وسيقوم الذكاء الاصطناعي بحساب الخامات المطلوبة بدقة.
                        </p>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition"><i className="fa-solid fa-times"></i></button>
                </div>

                <div className="p-6 overflow-y-auto flex-1 bg-slate-50">
                    <div className="mb-6">
                        <label className="block text-sm font-bold text-slate-700 mb-2">وصف البند والكمية</label>
                        <div className="relative">
                            <textarea 
                                className="w-full p-4 h-28 rounded-xl border border-slate-300 focus:border-blue-500 outline-none shadow-sm text-slate-900 resize-none transition focus:ring-4 focus:ring-blue-500/10"
                                placeholder="مثال: سقف خرسانة مسلحة مساحة 200 متر مربع وسمك 20 سم..."
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                            ></textarea>
                            <button 
                                onClick={handleCalculate}
                                disabled={loading || !input.trim()}
                                className="absolute bottom-4 left-4 bg-blue-600 text-white px-6 py-2 rounded-lg font-bold shadow-lg hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2"
                            >
                                {loading ? <i className="fa-solid fa-circle-notch fa-spin"></i> : <i className="fa-solid fa-wand-magic-sparkles"></i>}
                                احسب الآن
                            </button>
                        </div>
                    </div>

                    {result && (
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-slide-up">
                            <div className="p-4 bg-blue-50 border-b border-blue-100 flex justify-between items-center">
                                <div>
                                    <h4 className="font-bold text-blue-900">{result.itemName}</h4>
                                    <p className="text-xs text-blue-700">الكمية المحتسبة: {result.inputQuantity}</p>
                                </div>
                                <div className="flex gap-2">
                                    <button 
                                        className="bg-white text-indigo-600 px-3 py-1.5 rounded-lg text-xs font-bold border border-indigo-200 hover:bg-indigo-50 transition flex items-center gap-2" 
                                        onClick={handleEditAsLetter}
                                    >
                                        <i className="fa-solid fa-pen-to-square"></i> تعديل
                                    </button>
                                    <button 
                                        className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-emerald-500 transition flex items-center gap-2" 
                                        onClick={handleSaveToArchive}
                                        disabled={isSaving}
                                    >
                                        {isSaving ? <i className="fa-solid fa-circle-notch fa-spin"></i> : <i className="fa-solid fa-box-archive"></i>} حفظ
                                    </button>
                                </div>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-right">
                                    <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                                        <tr><th className="p-3">الخامة</th><th className="p-3">الوحدة</th><th className="p-3">المعدل</th><th className="p-3">الإجمالي</th><th className="p-3 text-red-600">هالك %</th><th className="p-3 bg-slate-100">الطلب النهائي</th></tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {result.materials.map((mat, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50 transition"><td className="p-3 font-bold text-slate-800">{mat.materialName}</td><td className="p-3 text-slate-500">{mat.unit}</td><td className="p-3 font-mono text-xs">{mat.quantityPerUnit}</td><td className="p-3 font-mono font-bold">{Number(mat.totalQuantity).toFixed(2)}</td><td className="p-3 text-red-500 font-mono text-xs">{mat.wastePercentage}%</td><td className="p-3 bg-blue-50/30 font-bold text-blue-700 font-mono text-base">{Number(mat.totalWithWaste).toFixed(2)}</td></tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            
                            {result.notes && (
                                <div className="p-4 bg-yellow-50 border-t border-yellow-100 text-xs text-yellow-800 flex gap-2 items-start"><i className="fa-solid fa-circle-info mt-0.5"></i><p>{result.notes}</p></div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MaterialCalculator;
