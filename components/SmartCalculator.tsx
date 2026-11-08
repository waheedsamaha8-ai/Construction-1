
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { aiHelper } from '../services/aiHelper';
import { imageUtils } from '../services/imageUtils';
import { api } from '../services/api';
import { ReportGenerator } from '../services/reportGenerator';
import { MaterialCalculationResult, PricingCalculationResult, MarketItem } from '../types';

interface SmartCalculatorProps {
    onClose: () => void;
}

const SmartCalculator: React.FC<SmartCalculatorProps> = ({ onClose }) => {
    const navigate = useNavigate();
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'materials' | 'pricing'>('pricing'); // Default to pricing per user interest
    const [data, setData] = useState<{ materials: MaterialCalculationResult | null, pricing: PricingCalculationResult | null }>({ materials: null, pricing: null });
    const [isSaving, setIsSaving] = useState(false);
    const [marketPrices, setMarketPrices] = useState<MarketItem[]>([]);
    const [indirectPercent, setIndirectPercent] = useState(20);
    const [profitPercent, setProfitPercent] = useState(15);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);
    const [isProcessingImage, setIsProcessingImage] = useState(false);

    useEffect(() => {
        const loadContext = async () => {
            try {
                // Try fetching live prices first
                const prices = await api.getMarketPrices([]);
                
                // If live prices are empty or failed, seed with Offline Data
                // This ensures the AI always has a context to work with
                if (!prices || prices.length === 0) {
                    const offlineSeed = aiHelper.getOfflineMarketPrices();
                    setMarketPrices(offlineSeed);
                } else {
                    setMarketPrices(prices);
                }
            } catch(e) {
                // Fallback to offline seed on error
                const offlineSeed = aiHelper.getOfflineMarketPrices();
                setMarketPrices(offlineSeed);
            }
        };
        loadContext();
    }, []);

    // STRICT UNIT PRICE CALCULATION
    const finalUnitPrice = data.pricing ? (() => {
        const direct = data.pricing.directCost;
        const indirectVal = direct * (indirectPercent / 100);
        const subTotal = direct + indirectVal;
        const profitVal = subTotal * (profitPercent / 100); // Profit on (Direct + Indirect)
        return direct + indirectVal + profitVal;
    })() : 0;

    const handleCalculate = async () => {
        if (!input.trim()) return;
        setLoading(true);
        setData({ materials: null, pricing: null });
        try {
            const result = await aiHelper.calculateConstructionItem(input, marketPrices);
            setData(result);
            if (result.pricing) {
                setIndirectPercent(result.pricing.indirectCostPercent);
                setProfitPercent(result.pricing.profitPercent);
            }
        } catch (error: any) {
            // Enhanced Error Handling
            alert(`فشل التحليل: ${error.message || "حدث خطأ غير متوقع"}. يرجى المحاولة مرة أخرى.`);
        } finally {
            setLoading(false);
        }
    };

    const handleImageInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        setIsProcessingImage(true);
        try {
            const compressed = await imageUtils.compressImage(file, 0.5, 800);
            const text = await aiHelper.extractItemDescriptionFromImage(compressed);
            if (text) {
                setInput(text);
            } else {
                alert("لم أتمكن من قراءة النص من الصورة بوضوح.");
            }
        } catch (error) {
            alert("فشل تحليل الصورة.");
        } finally {
            setIsProcessingImage(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
            if (cameraInputRef.current) cameraInputRef.current.value = '';
        }
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', { style: 'decimal', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(amount) || 0);
    };

    // --- GENERATE REPORT HTML (Compatible with New Style) ---
    const generateCombinedHTML = () => {
        if (!data.materials && !data.pricing) return '';

        const direct = data.pricing!.directCost;
        const indirectVal = direct * (indirectPercent / 100);
        const profitVal = (direct + indirectVal) * (profitPercent / 100);
        
        let bodyHtml = ``;

        // 1. PRICING SECTION
        if (data.pricing) {
            const materials = data.pricing.breakdown.filter(i => i.type === 'Material');
            const labor = data.pricing.breakdown.filter(i => i.type === 'Labor');
            const equipment = data.pricing.breakdown.filter(i => i.type === 'Equipment');
            const tools = data.pricing.breakdown.filter(i => i.type === 'Tools' || i.type === 'Other');

            bodyHtml += `
                <h2>تحليل سعر الوحدة (Unit Price Analysis)</h2>
                
                <table>
                    <thead>
                        <tr>
                            <th>البيان</th>
                            <th>الوحدة</th>
                            <th>الفئة</th>
                            <th>الاستهلاك/معدل</th>
                            <th>التكلفة</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${materials.length > 0 ? `<tr><td colspan="5" style="background:#f0fdfa; font-weight:bold; color:#0f766e;">أولاً: الخامات والمواد (Materials)</td></tr>` : ''}
                        ${materials.map(i => `<tr><td>${i.description}</td><td>${i.unit}</td><td>${formatCurrency(i.rate)}</td><td>${i.consumption}</td><td>${formatCurrency(i.cost)}</td></tr>`).join('')}
                        
                        ${labor.length > 0 ? `<tr><td colspan="5" style="background:#fff7ed; font-weight:bold; color:#c2410c;">ثانياً: العمالة والمصنعيّات (Labor)</td></tr>` : ''}
                        ${labor.map(i => `<tr><td>${i.description}</td><td>${i.unit}</td><td>${formatCurrency(i.rate)}</td><td>${i.consumption}</td><td>${formatCurrency(i.cost)}</td></tr>`).join('')}

                        ${equipment.length > 0 ? `<tr><td colspan="5" style="background:#f5f3ff; font-weight:bold; color:#7e22ce;">ثالثاً: المعدات (Equipment)</td></tr>` : ''}
                        ${equipment.map(i => `<tr><td>${i.description}</td><td>${i.unit}</td><td>${formatCurrency(i.rate)}</td><td>${i.consumption}</td><td>${formatCurrency(i.cost)}</td></tr>`).join('')}

                        ${tools.length > 0 ? `<tr><td colspan="5" style="background:#f1f5f9; font-weight:bold; color:#334155;">رابعاً: العدد والأدوات (Tools)</td></tr>` : ''}
                        ${tools.map(i => `<tr><td>${i.description}</td><td>${i.unit}</td><td>${formatCurrency(i.rate)}</td><td>${i.consumption}</td><td>${formatCurrency(i.cost)}</td></tr>`).join('')}
                    </tbody>
                    <tfoot>
                        <tr><td colspan="4" style="text-align:left; font-weight:bold;">إجمالي التكلفة المباشرة (Direct Cost)</td><td style="font-weight:bold;">${formatCurrency(direct)}</td></tr>
                        <tr><td colspan="4" style="text-align:left;">م. غير مباشرة وإدارية (${indirectPercent}%)</td><td>+${formatCurrency(indirectVal)}</td></tr>
                        <tr><td colspan="4" style="text-align:left;">أرباح ومخاطر (${profitPercent}%)</td><td>+${formatCurrency(profitVal)}</td></tr>
                        <tr style="background-color: #ecfdf5;"><td colspan="4" style="text-align:left; font-weight:bold; border:none; font-size:1.1em; color:#065f46;">سعر الوحدة النهائي</td><td style="font-weight:bold; border:none; font-size:1.2em; color:#065f46;">${formatCurrency(finalUnitPrice)}</td></tr>
                    </tfoot>
                </table>

                <br/>
                ${data.pricing.pricingBasis}
            `;
        }

        // 2. MATERIALS SECTION
        if (data.materials) {
            bodyHtml += `
                <hr style="margin: 30px 0; border: 1px solid #eee;" />
                <h2>ملحق: تفاصيل حصر الخامات (Quantity Survey)</h2>
                
                <table>
                    <thead>
                        <tr>
                            <th>الخامة</th>
                            <th>الوحدة</th>
                            <th>المعدل</th>
                            <th>هالك</th>
                            <th>الكمية المطلوبة</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.materials.materials?.map((m, i) => `
                            <tr>
                                <td>${m.materialName}</td>
                                <td>${m.unit}</td>
                                <td>${m.quantityPerUnit}</td>
                                <td>${m.wastePercentage}%</td>
                                <td style="font-weight:bold;">${Number(m.totalWithWaste || 0).toFixed(2)}</td>
                            </tr>
                        `).join('') || ''}
                    </tbody>
                </table>
            `;
        }

        return ReportGenerator.buildReport(`تحليل سعر استشاري - ${data.materials?.itemName.substring(0, 30)}`, bodyHtml);
    };

    const handleSaveToArchive = async () => {
        if (!data.materials && !data.pricing) return;
        setIsSaving(true);
        try {
            const html = generateCombinedHTML();
            await api.saveToArchive(`تحليل سعر - ${data.materials?.itemName.substring(0, 30) || 'بند هندسي'}`, html, 'تحليل الأسعار والمقايسات');
            alert(`تم حفظ التقرير الشامل في الأرشيف.`);
            onClose();
        } catch (e) {
            alert("فشل الحفظ في الأرشيف.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleEditAsLetter = () => {
        if (!data.materials && !data.pricing) return;
        const html = generateCombinedHTML();
        api.getArchiveFolderId().then(archiveId => {
             api.ensureRootFolder().then(rootId => {
                 navigate(`/editor/${rootId}/${archiveId}`, { 
                     state: { 
                         initialContent: html,
                         filename: `تحليل_شامل_${data.materials?.itemName.substring(0, 20) || 'بند'}`
                     } 
                 });
                 onClose(); 
             });
        });
    };

    // ... (Keep existing Render Logic for UI) ...
    const { materials: pricingMaterials, labor: pricingLabor, equipment: pricingEquipment, tools: pricingTools } = data.pricing ? {
        materials: data.pricing.breakdown.filter(i => i.type === 'Material'),
        labor: data.pricing.breakdown.filter(i => i.type === 'Labor'),
        equipment: data.pricing.breakdown.filter(i => i.type === 'Equipment'),
        tools: data.pricing.breakdown.filter(i => i.type === 'Tools' || i.type === 'Other')
    } : { materials: [], labor: [], equipment: [], tools: [] };

    const isStandard = data.materials?.notes.includes("القياسية");

    return (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4 animate-fade-in">
            <div className="bg-white w-full h-full sm:h-auto sm:max-w-4xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col sm:max-h-[95vh] animate-scale-in border border-slate-200">
                <div className="bg-gradient-to-r from-emerald-800 to-teal-700 p-4 text-white flex justify-between items-start shrink-0">
                    <div>
                        <h3 className="text-lg sm:text-xl font-bold flex items-center gap-2">
                            <i className="fa-solid fa-calculator text-yellow-400"></i>
                            استشاري التسعير الهندسي (Pro)
                        </h3>
                        <p className="text-xs text-emerald-100 mt-1 opacity-90 hidden sm:block">
                            يعتمد على حصر المواد الدقيق + أسعار السوق + العمالة والمعدات
                        </p>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition"><i className="fa-solid fa-times"></i></button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 bg-slate-50 relative">
                    <div className="mb-4">
                        <label className="block text-sm font-bold text-slate-700 mb-2">وصف البند (وحدة واحدة فقط)</label>
                        <div className="relative mb-2">
                            <textarea 
                                className="w-full p-4 h-32 rounded-xl border border-slate-300 focus:border-emerald-500 outline-none shadow-sm text-slate-900 resize-none transition text-sm font-bold"
                                placeholder={isProcessingImage ? "جاري قراءة الصورة..." : "مثال: توريد وصب 1 متر مكعب خرسانة مسلحة للأعمدة..."}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                disabled={isProcessingImage}
                            ></textarea>
                            <div className="absolute bottom-3 left-3 flex gap-2">
                                <button onClick={() => cameraInputRef.current?.click()} disabled={isProcessingImage} className="w-8 h-8 bg-slate-100 text-slate-600 rounded-lg hover:bg-blue-50 transition border border-slate-200 shadow-sm"><i className="fa-solid fa-camera"></i></button>
                                <button onClick={() => fileInputRef.current?.click()} disabled={isProcessingImage} className="w-8 h-8 bg-slate-100 text-slate-600 rounded-lg hover:bg-blue-50 transition border border-slate-200 shadow-sm"><i className="fa-regular fa-image"></i></button>
                            </div>
                            <input type="file" ref={fileInputRef} onChange={handleImageInput} accept="image/*" className="hidden" />
                            <input type="file" ref={cameraInputRef} onChange={handleImageInput} accept="image/*" capture="environment" className="hidden" />
                        </div>
                    </div>

                    {data.materials && data.pricing && (
                        <div className="animate-slide-up w-full">
                            <div className={`text-xs p-2 rounded-lg mb-4 flex items-center gap-2 font-bold ${isStandard ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                                <i className={`fa-solid ${isStandard ? 'fa-check-circle' : 'fa-wand-magic-sparkles'}`}></i>
                                {isStandard ? 'تم استخدام معدلات هندسية قياسية (موثوق 100%)' : 'تم بناء التحليل بناءً على الحصر الاستشاري'}
                            </div>

                            <div className="flex bg-white rounded-xl shadow-sm p-1 mb-4 border border-slate-200">
                                <button onClick={() => setActiveTab('pricing')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition ${activeTab === 'pricing' ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}><i className="fa-solid fa-coins"></i> تحليل السعر (UPA)</button>
                                <button onClick={() => setActiveTab('materials')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition ${activeTab === 'materials' ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}><i className="fa-solid fa-cubes"></i> حصر الخامات (QS)</button>
                            </div>

                            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden w-full">
                                {activeTab === 'materials' ? (
                                    <div className="w-full p-0">
                                        <div className="bg-blue-50 border-b border-blue-100 p-4 mb-0 text-xs text-blue-900 w-full">
                                            <h5 className="font-bold mb-2 flex items-center gap-1 text-sm text-blue-800"><i className="fa-solid fa-calculator"></i> أسس الحصر الهندسي:</h5>
                                            <div className="whitespace-pre-wrap leading-relaxed opacity-90 font-medium">{data.materials.calculationBasis}</div>
                                        </div>
                                        <div className="overflow-x-auto w-full">
                                            <table className="w-full text-xs text-right table-fixed">
                                                <colgroup><col style={{width:'30%'}}/><col style={{width:'15%'}}/><col style={{width:'20%'}}/><col style={{width:'10%'}}/><col style={{width:'25%'}}/></colgroup>
                                                <thead className="bg-slate-50 text-slate-600 font-bold">
                                                    <tr><th className="p-3">الخامة</th><th className="p-3">الوحدة</th><th className="p-3">المعدل</th><th className="p-3 text-red-600">هالك %</th><th className="p-3 bg-emerald-50 text-emerald-800">الطلب</th></tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {data.materials.materials?.map((m, idx) => (
                                                        <tr key={idx}>
                                                            <td className="p-3 font-medium break-words">{m.materialName}</td>
                                                            <td className="p-3 text-slate-500">{m.unit}</td>
                                                            <td className="p-3 font-mono">{m.quantityPerUnit}</td>
                                                            <td className="p-3 text-red-500">{m.wastePercentage}%</td>
                                                            <td className="p-3 bg-emerald-50/50 font-bold text-emerald-700 font-mono">{(Number(m.totalWithWaste) || 0).toFixed(2)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="w-full p-0">
                                        <div className="bg-white border-b border-yellow-100 p-0 text-xs text-slate-900 w-full">
                                            {/* Render Rich HTML Pricing Report */}
                                            <div 
                                                className="prose prose-sm max-w-none p-4 leading-relaxed font-medium bg-white"
                                                dangerouslySetInnerHTML={{ __html: data.pricing.pricingBasis }}
                                            ></div>
                                        </div>

                                        <div className="flex flex-col bg-emerald-50 border-t border-emerald-100 w-full p-4 gap-2">
                                            <div className="flex justify-between text-xs text-slate-600 font-bold"><span>إجمالي التكلفة المباشرة (طبقا للجدول أدناه)</span><span className="font-mono">{formatCurrency(data.pricing.directCost)}</span></div>
                                            
                                            <div className="flex justify-between items-center text-xs text-red-600">
                                                <div className="flex items-center gap-1">
                                                    <span>م. إدارية ومخاطر</span>
                                                    <input 
                                                        type="number" 
                                                        value={indirectPercent} 
                                                        onChange={(e) => setIndirectPercent(Number(e.target.value))}
                                                        className="w-10 p-0.5 text-center bg-red-50 border border-red-200 rounded font-mono text-[10px]"
                                                    />
                                                    <span>%</span>
                                                </div>
                                                <span className="font-mono">+{formatCurrency(data.pricing.directCost * (indirectPercent/100))}</span>
                                            </div>

                                            <div className="flex justify-between items-center text-xs text-green-600">
                                                <div className="flex items-center gap-1">
                                                    <span>أرباح</span>
                                                    <input 
                                                        type="number" 
                                                        value={profitPercent} 
                                                        onChange={(e) => setProfitPercent(Number(e.target.value))}
                                                        className="w-10 p-0.5 text-center bg-green-50 border border-green-200 rounded font-mono text-[10px]"
                                                    />
                                                    <span>%</span>
                                                </div>
                                                {/* Profit calculated on (Direct + Indirect) */}
                                                <span className="font-mono">+{formatCurrency((data.pricing.directCost + (data.pricing.directCost * (indirectPercent/100))) * (profitPercent/100))}</span>
                                            </div>

                                            <div className="w-full h-px bg-emerald-200 my-1"></div>
                                            
                                            <div className="flex justify-between items-center">
                                                <span className="text-sm text-emerald-900 font-bold">سعر الوحدة النهائي</span>
                                                <span className="text-xl font-bold text-emerald-800 font-mono">{formatCurrency(finalUnitPrice)} <span className="text-xs">{data.pricing.currency}</span></span>
                                            </div>
                                        </div>
                                        
                                        {/* Breakdown Table (Always Visible for Clarity) */}
                                        <div className="p-2">
                                            <div className="bg-slate-50 border border-slate-200 rounded-lg">
                                                <div className="text-xs font-bold text-slate-700 p-2 bg-slate-100 border-b">تفاصيل التسعير (Breakdown)</div>
                                                <div className="overflow-x-auto mb-0 w-full p-0">
                                                    <table className="w-full text-xs text-right table-fixed">
                                                        <colgroup><col style={{width:'5%'}}/><col style={{width:'35%'}}/><col style={{width:'20%'}}/><col style={{width:'20%'}}/><col style={{width:'20%'}}/></colgroup>
                                                        <thead className="bg-white text-slate-500 font-medium border-b"><tr><th className="p-2"></th><th className="p-2">البيان</th><th className="p-2">الفئة</th><th className="p-2">استهلاك</th><th className="p-2">التكلفة</th></tr></thead>
                                                        <tbody className="divide-y divide-slate-100">
                                                            {/* Materials Section */}
                                                            {pricingMaterials.length > 0 && <><tr className="bg-teal-50/50"><td colSpan={5} className="p-2 font-bold text-teal-800 text-[10px]">أولاً: الخامات والمواد</td></tr>{pricingMaterials.map((item, idx) => (<tr key={`m-${idx}`}><td className="p-2"><i className="fa-solid fa-cube text-teal-500"></i></td><td className="p-2 font-medium break-words">{item.description}</td><td className="p-2 font-mono">{formatCurrency(item.rate)}</td><td className="p-2 font-mono">{item.consumption}</td><td className="p-2 font-bold font-mono">{formatCurrency(item.cost)}</td></tr>))}</>}
                                                            
                                                            {/* Labor Section */}
                                                            {pricingLabor.length > 0 && <><tr className="bg-orange-50/50"><td colSpan={5} className="p-2 font-bold text-orange-800 text-[10px]">ثانياً: العمالة والمصنعيّات</td></tr>{pricingLabor.map((item, idx) => (<tr key={`l-${idx}`}><td className="p-2"><i className="fa-solid fa-users text-orange-500"></i></td><td className="p-2 font-medium break-words">{item.description}</td><td className="p-2 font-mono">{formatCurrency(item.rate)}</td><td className="p-2 font-mono">{item.consumption}</td><td className="p-2 font-bold font-mono">{formatCurrency(item.cost)}</td></tr>))}</>}
                                                            
                                                            {/* Equipment Section */}
                                                            {pricingEquipment.length > 0 && <><tr className="bg-purple-50/50"><td colSpan={5} className="p-2 font-bold text-purple-800 text-[10px]">ثالثاً: المعدات</td></tr>{pricingEquipment.map((item, idx) => (<tr key={`e-${idx}`}><td className="p-2"><i className="fa-solid fa-truck text-purple-500"></i></td><td className="p-2 font-medium break-words">{item.description}</td><td className="p-2 font-mono">{formatCurrency(item.rate)}</td><td className="p-2 font-mono">{item.consumption}</td><td className="p-2 font-bold font-mono">{formatCurrency(item.cost)}</td></tr>))}</>}

                                                            {/* Tools Section */}
                                                            {pricingTools.length > 0 && <><tr className="bg-slate-100/50"><td colSpan={5} className="p-2 font-bold text-slate-800 text-[10px]">رابعاً: العدد والأدوات</td></tr>{pricingTools.map((item, idx) => (<tr key={`t-${idx}`}><td className="p-2"><i className="fa-solid fa-hammer text-slate-500"></i></td><td className="p-2 font-medium break-words">{item.description}</td><td className="p-2 font-mono">{formatCurrency(item.rate)}</td><td className="p-2 font-mono">{item.consumption}</td><td className="p-2 font-bold font-mono">{formatCurrency(item.cost)}</td></tr>))}</>}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-4 bg-white border-t border-slate-200 shrink-0 z-50">
                    {!data.materials ? (
                        <button onClick={handleCalculate} disabled={loading || (!input.trim() && !isProcessingImage)} className="w-full bg-emerald-600 text-white px-5 py-3 rounded-xl font-bold shadow-lg hover:bg-emerald-700 transition disabled:opacity-50 flex items-center justify-center gap-2 text-sm">
                            {loading || isProcessingImage ? <i className="fa-solid fa-circle-notch fa-spin"></i> : <i className="fa-solid fa-wand-magic-sparkles"></i>}
                            {isProcessingImage ? 'جاري تحليل الصورة...' : 'تحليل وتسعير البند'}
                        </button>
                    ) : (
                        <div className="flex justify-between gap-3">
                            <button onClick={handleEditAsLetter} className="flex-1 bg-indigo-50 text-indigo-700 border border-indigo-200 px-4 py-3 rounded-xl font-bold hover:bg-indigo-100 transition text-xs flex items-center justify-center gap-2 shadow-sm"><i className="fa-solid fa-pen-to-square"></i> تعديل (شامل)</button>
                            <button onClick={handleSaveToArchive} disabled={isSaving} className="flex-1 bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-emerald-700 transition text-xs flex items-center justify-center gap-2 shadow-lg disabled:opacity-50">{isSaving ? <i className="fa-solid fa-circle-notch fa-spin"></i> : <i className="fa-solid fa-box-archive"></i>} حفظ في الأرشيف</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SmartCalculator;
