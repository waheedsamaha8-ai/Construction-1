
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { aiHelper } from '../services/aiHelper';
import { api } from '../services/api';
import { ReportGenerator } from '../services/reportGenerator';
import { PricingCalculationResult } from '../types';

interface PricingCalculatorProps {
    onClose: () => void;
}

const PricingCalculator: React.FC<PricingCalculatorProps> = ({ onClose }) => {
    const navigate = useNavigate();
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<PricingCalculationResult | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const handleCalculate = async () => {
        if (!input.trim()) return;
        setLoading(true);
        setResult(null);
        try {
            const data = await aiHelper.calculatePricing(input);
            setResult(data);
        } catch (error) {
            alert("حدث خطأ أثناء تحليل السعر. يرجى المحاولة مرة أخرى.");
        } finally {
            setLoading(false);
        }
    };

    const getTypeColor = (type: string) => {
        switch(type) {
            case 'Material': return 'text-blue-600 bg-blue-50';
            case 'Labor': return 'text-orange-600 bg-orange-50';
            case 'Equipment': return 'text-purple-600 bg-purple-50';
            default: return 'text-slate-600 bg-slate-50';
        }
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', { style: 'decimal', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
    };

    const generateHTML = () => {
        if (!result) return '';
        
        const direct = result.directCost;
        const indirectVal = direct * (result.indirectCostPercent / 100);
        const subTotal = direct + indirectVal;
        const profitVal = subTotal * (result.profitPercent / 100);
        const finalPrice = direct + indirectVal + profitVal;

        const bodyHtml = `
            <h2>تحليل سعر هندسي</h2>
            <div class="highlight-box">
                <p><strong>البند:</strong> ${result.itemName}</p>
                <p><strong>الوحدة:</strong> ${result.unit}</p>
                <p><strong>السعر النهائي:</strong> ${formatCurrency(finalPrice)} ${result.currency}</p>
            </div>
            
            <table>
                <thead>
                    <tr>
                        <th>النوع</th>
                        <th>البيان</th>
                        <th>الوحدة</th>
                        <th>السعر</th>
                        <th>الاستهلاك</th>
                        <th>التكلفة</th>
                    </tr>
                </thead>
                <tbody>
                    ${result.breakdown.map(item => `
                        <tr>
                            <td>${item.type === 'Material' ? 'خامات' : item.type === 'Labor' ? 'مصنعية' : item.type === 'Equipment' ? 'معدات' : 'أخرى'}</td>
                            <td>${item.description}</td>
                            <td>${item.unit}</td>
                            <td>${formatCurrency(item.rate)}</td>
                            <td>${item.consumption}</td>
                            <td>${formatCurrency(item.cost)}</td>
                        </tr>
                    `).join('')}
                    <tr><td colspan="5" style="font-weight:bold;">التكلفة المباشرة</td><td style="font-weight:bold;">${formatCurrency(result.directCost)}</td></tr>
                    <tr><td colspan="5">مصاريف إدارية ومخاطر (${result.indirectCostPercent}%)</td><td>+${formatCurrency(indirectVal)}</td></tr>
                    <tr><td colspan="5">أرباح (${result.profitPercent}%)</td><td>+${formatCurrency(profitVal)}</td></tr>
                    <tr style="background-color: #f1f5f9;"><td colspan="5" style="font-weight:bold;">سعر الوحدة النهائي</td><td style="font-weight:bold; font-size:1.1em;">${formatCurrency(finalPrice)}</td></tr>
                </tbody>
            </table>

            <div class="success-box">
                <strong>أسس التسعير:</strong>
                <p>${result.pricingBasis || 'طبقاً لأسعار السوق الحالية'}</p>
            </div>
        `;
        return ReportGenerator.buildReport(`تحليل سعر - ${result.itemName.substring(0, 30)}`, bodyHtml);
    };

    const handleSaveToArchive = async () => {
        if (!result) return;
        setIsSaving(true);
        try {
            const html = generateHTML();
            await api.saveToArchive(`تحليل سعر - ${result.itemName.substring(0, 30)}`, html, 'تحليل الأسعار والمقايسات');
            alert("تم حفظ التحليل في الأرشيف الهندسي.");
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
                     state: { initialContent: html, filename: `تحليل_سعر_${result.itemName.substring(0, 20)}` } 
                 });
                 onClose();
             });
        });
    };

    // Calculate dynamic values for display
    const indirectVal = result ? result.directCost * (result.indirectCostPercent / 100) : 0;
    const profitVal = result ? (result.directCost + indirectVal) * (result.profitPercent / 100) : 0;
    const finalPrice = result ? result.directCost + indirectVal + profitVal : 0;

    return (
        <div className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-scale-in border border-slate-200">
                <div className="bg-gradient-to-r from-emerald-900 to-emerald-700 p-6 text-white flex justify-between items-start">
                    <div>
                        <h3 className="text-xl font-bold flex items-center gap-2">
                            <i className="fa-solid fa-tags text-yellow-400"></i>
                            حاسبة التسعير الفوري (Unit Price)
                        </h3>
                        <p className="text-xs text-emerald-100 mt-1">
                            تحليل سعر شامل (خامات، مصنعيات، معدات) باستخدام الذكاء الاصطناعي.
                        </p>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition">
                        <i className="fa-solid fa-times"></i>
                    </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1 bg-slate-50">
                    <div className="mb-6">
                        <label className="block text-sm font-bold text-slate-700 mb-2">وصف البند المراد تسعيره</label>
                        <div className="relative">
                            <textarea 
                                className="w-full p-4 h-28 rounded-xl border border-slate-300 focus:border-emerald-500 outline-none shadow-sm text-slate-900 resize-none transition focus:ring-4 focus:ring-emerald-500/10"
                                placeholder="مثال: توريد وتركيب سيراميك أرضيات فرز أول مقاس 60×60 سم..."
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                            ></textarea>
                            <button 
                                onClick={handleCalculate}
                                disabled={loading || !input.trim()}
                                className="absolute bottom-4 left-4 bg-emerald-600 text-white px-6 py-2 rounded-lg font-bold shadow-lg hover:bg-emerald-700 transition disabled:opacity-50 flex items-center gap-2"
                            >
                                {loading ? <i className="fa-solid fa-circle-notch fa-spin"></i> : <i className="fa-solid fa-coins"></i>}
                                تحليل السعر
                            </button>
                        </div>
                    </div>

                    {result && (
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-slide-up">
                            <div className="p-4 bg-emerald-50 border-b border-emerald-100 flex justify-between items-center">
                                <div>
                                    <h4 className="font-bold text-emerald-900">{result.itemName}</h4>
                                    <p className="text-xs text-emerald-700 font-bold">وحدة القياس: {result.unit}</p>
                                </div>
                                <div className="text-left flex items-center gap-2">
                                    <button 
                                        className="bg-white text-emerald-700 px-3 py-1.5 rounded-lg text-xs font-bold border border-emerald-200 hover:bg-emerald-50 transition flex items-center gap-2" 
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
                                <table className="w-full text-xs sm:text-sm text-right">
                                    <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                                        <tr><th className="p-3">النوع</th><th className="p-3 w-1/3">البيان</th><th className="p-3">الوحدة</th><th className="p-3">السعر</th><th className="p-3">استهلاك</th><th className="p-3 bg-slate-100">التكلفة</th></tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {result.breakdown.map((item, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50 transition">
                                                <td className="p-3"><span className={`px-2 py-1 rounded text-[10px] font-bold ${getTypeColor(item.type)}`}>{item.type === 'Material' ? 'خامات' : item.type === 'Labor' ? 'مصنعية' : item.type === 'Equipment' ? 'معدات' : 'أخرى'}</span></td>
                                                <td className="p-3 font-medium text-slate-800">{item.description}</td>
                                                <td className="p-3 text-slate-500">{item.unit}</td>
                                                <td className="p-3 font-mono">{formatCurrency(item.rate)}</td>
                                                <td className="p-3 font-mono text-slate-500">{item.consumption}</td>
                                                <td className="p-3 bg-slate-50/50 font-bold text-slate-800 font-mono">{formatCurrency(item.cost)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="bg-slate-50 border-t border-slate-200 text-slate-700">
                                        <tr><td colSpan={5} className="p-2 text-left font-bold">إجمالي التكلفة المباشرة:</td><td className="p-2 font-mono font-bold">{formatCurrency(result.directCost)}</td></tr>
                                        <tr><td colSpan={5} className="p-2 text-left text-xs">مصاريف إدارية ومخاطر ({result.indirectCostPercent}%):</td><td className="p-2 font-mono text-xs text-red-600">+{formatCurrency(indirectVal)}</td></tr>
                                        <tr><td colSpan={5} className="p-2 text-left text-xs">أرباح ({result.profitPercent}%):</td><td className="p-2 font-mono text-xs text-green-600">+{formatCurrency(profitVal)}</td></tr>
                                        <tr className="bg-emerald-50 border-t border-emerald-200 text-emerald-900">
                                            <td colSpan={5} className="p-2 text-left font-bold">سعر الوحدة النهائي:</td>
                                            <td className="p-2 font-mono font-bold text-base">{formatCurrency(finalPrice)}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PricingCalculator;
