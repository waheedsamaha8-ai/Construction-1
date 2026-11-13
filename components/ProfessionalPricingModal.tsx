import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { aiHelper } from '../services/aiHelper';
import { api } from '../services/api';
import { ReportGenerator } from '../services/reportGenerator';
import { printService } from '../services/printService';
import { imageUtils } from '../services/imageUtils';
import InteractiveReportViewer from './InteractiveReportViewer';
import { MarketItem } from '../types';

interface ProfessionalPricingModalProps {
    onClose: () => void;
    initialDescription?: string;
    initialUnit?: string;
    initialQuantity?: number;
    initialCategory?: string;
}

interface PresetItem {
    id: string;
    category: string;
    title: string;
    unit: string;
    defaultQty: number;
    description: string;
}

const PRESET_ITEMS: PresetItem[] = [
    {
        id: 'rc_columns_slabs',
        category: 'خرسانة مسلحة',
        title: 'خرسانة مسلحة للأعمدة والأسقف',
        unit: 'م3',
        defaultQty: 50,
        description: 'بالمتر المكعب توريد وصب خرسانة مسلحة للأسقف والكمرات والأعمدة بجهد لا يقل عن 300 كجم/سم2 ومحتوى أسمنت بورتلاندي عادي 350 كجم/م3 شاملة حديد التسليح والشدات الخشبية والفرمجة والرش والمعالجة طبقاً للكود المصري.'
    },
    {
        id: 'rc_foundations',
        category: 'خرسانة مسلحة',
        title: 'خرسانة مسلحة للقواعد والسمالت',
        unit: 'م3',
        defaultQty: 100,
        description: 'بالمتر المكعب توريد وصب خرسانة مسلحة للقواعد المنفصلة والمشتركة والميد والسمالت بمحتوى أسمنت 350 كجم/م3 شاملة حديد التسليح والنجارة والفرمجة والمعالجة.'
    },
    {
        id: 'pc_blinding',
        category: 'خرسانة عادية',
        title: 'خرسانة عادية للأساسات والنظافة',
        unit: 'م3',
        defaultQty: 60,
        description: 'بالمتر المكعب توريد وصب خرسانة عادية لزوم الأساسات وفرشة النظافة والأرضيات بمحتوى أسمنت 250 كجم/م3 شاملة النجارة والدمك والفرمجة والمعالجة بالمياه.'
    },
    {
        id: 'excavation_replace',
        category: 'حفر وإحلال',
        title: 'حفر للأساسات ونقل ناتج الحفر',
        unit: 'م3',
        defaultQty: 250,
        description: 'بالمتر المكعب حفر للأساسات في التربة العادية والرملية حتى المناسيب التصميمية شاملة سند الجوانب وتحميل ونقل ناتج الحفر إلى المقالب العمومية.'
    },
    {
        id: 'soil_replacement',
        category: 'حفر وإحلال',
        title: 'توريد ودمك تربة إحلال',
        unit: 'م3',
        defaultQty: 150,
        description: 'بالمتر المكعب توريد وفرش ودمك تربة إحلال على طبقات سمك 25 سم مع الرش بالمياه والدمك الميكانيكي حتى الوصول لأقصى كثافة جافة.'
    },
    {
        id: 'brick_red_12',
        category: 'مباني',
        title: 'مباني طوب أحمر سمك 12 سم',
        unit: 'م2',
        defaultQty: 200,
        description: 'بالمتر المسطح توريد وعمل مباني من الطوب الأحمر الطفلي سمك نصف طوبة (12 سم) بمونة 300 كجم أسمنت/م3 رمل شاملة السقالات والرش بالمياه.'
    },
    {
        id: 'brick_cement_25',
        category: 'مباني',
        title: 'مباني طوب أسمنتي سمك 25 سم',
        unit: 'م3',
        defaultQty: 40,
        description: 'بالمتر المكعب توريد وعمل مباني من الطوب الأسمنتي المصمت مقاس 25×12×6 سم بمونة 350 كجم أسمنت/م3 رمل شاملة التشوين والسقالات والرش.'
    },
    {
        id: 'plaster_internal',
        category: 'بياض ومحارة',
        title: 'بياض تخشين داخلي للحوائط والأسقف',
        unit: 'م2',
        defaultQty: 300,
        description: 'بالمتر المسطح عمل بياض تخشين داخلي بسمك متوسط 2 سم يشمل الطرطشة العمومية بمونة 450 كجم أسمنت/م3 رمل والبؤج والأوتار والملء بمونة 300 كجم أسمنت/م3 رمل.'
    },
    {
        id: 'waterproofing_membrane',
        category: 'عزل',
        title: 'عزل رطوبة بشرائح الممبرين 4 مم',
        unit: 'م2',
        defaultQty: 120,
        description: 'بالمتر المسطح توريد وتنفيذ عزل للمياه والرطوبة من لفائف البيتومين المعدل (ممبرين) سمك 4 مم بعد دهان البرايمر البيتوميني وعمل رقبة الزجاجة والاختبار.'
    },
    {
        id: 'ceramic_flooring',
        category: 'أرضيات وسيراميك',
        title: 'تركيب سيراميك أو بورسلين أرضيات',
        unit: 'م2',
        defaultQty: 150,
        description: 'بالمتر المسطح توريد وتركيب بلاط سيراميك أو بورسلين فرز أول للأرضيات على فرشة رمل سمك 6 سم ومونة لصق أسمنتية 300 كجم أسمنت/م3 رمل شاملة الوزرات والسقية.'
    },
    {
        id: 'painting_acrylic',
        category: 'دهانات',
        title: 'دهانات بلاستيك أكريليك داخلي',
        unit: 'م2',
        defaultQty: 350,
        description: 'بالمتر المسطح توريد وعمل دهانات داخلية للحوائط والأسقف يشمل الصنفرة ووجه سيلر مائي وسكينتين معجون أكريليك ووجه بطانة ووجهين تشطيب نهائي.'
    },
    {
        id: 'gypsum_board',
        category: 'أسقف معلقة',
        title: 'تركيب أسقف معلقة جبس بورد',
        unit: 'م2',
        defaultQty: 100,
        description: 'بالمتر المسطح توريد وتركيب أسقف معلقة من ألواح الجبس بورد سمك 12.5 مم محملة على شبكة معدنية من الصاج المجلفن شاملة المعجون وشريط الفواصل.'
    }
];

const CATEGORIES = [
    'كل التصنيفات',
    'خرسانة مسلحة',
    'خرسانة عادية',
    'حفر وإحلال',
    'مباني',
    'بياض ومحارة',
    'عزل',
    'أرضيات وسيراميك',
    'دهانات',
    'أسقف معلقة',
    'سباكة وصرف',
    'كهرباء'
];

const UNITS = ['م3', 'م2', 'م.ط', 'طن', 'كجم', 'عدد', 'مقطوعية', 'نقطة'];

const ProfessionalPricingModal: React.FC<ProfessionalPricingModalProps> = ({
    onClose,
    initialDescription = '',
    initialUnit = 'م3',
    initialQuantity = 10,
    initialCategory = 'خرسانة مسلحة'
}) => {
    const navigate = useNavigate();

    // Form State
    const [description, setDescription] = useState(initialDescription);
    const [category, setCategory] = useState(initialCategory);
    const [unit, setUnit] = useState(initialUnit);
    const [quantity, setQuantity] = useState<string>(String(initialQuantity || 10));
    const [indirectPercent, setIndirectPercent] = useState<string>('15');
    const [profitPercent, setProfitPercent] = useState<string>('15');
    const [notes, setNotes] = useState('');
    const [selectedPresetCat, setSelectedPresetCat] = useState('كل التصنيفات');

    // Market & Processing State
    const [marketPrices, setMarketPrices] = useState<MarketItem[]>([]);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isProcessingImage, setIsProcessingImage] = useState(false);
    const [isSavingArchive, setIsSavingArchive] = useState(false);

    // Report View State
    const [reportData, setReportData] = useState<any | null>(null);
    const [reportHtml, setReportHtml] = useState<string>('');
    const [isDirectEditing, setIsDirectEditing] = useState(false);
    const [isReportMenuOpen, setIsReportMenuOpen] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const loadMarket = async () => {
            try {
                const live = await api.getMarketPrices([]);
                if (live && live.length > 0) {
                    setMarketPrices(live);
                } else {
                    setMarketPrices(aiHelper.getOfflineMarketPrices());
                }
            } catch {
                setMarketPrices(aiHelper.getOfflineMarketPrices());
            }
        };
        loadMarket();
    }, []);

    const handleSelectPreset = (preset: PresetItem) => {
        setDescription(preset.description);
        setCategory(preset.category);
        setUnit(preset.unit);
        setQuantity(String(preset.defaultQty));
    };

    const handleImageInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsProcessingImage(true);
        try {
            const compressed = await imageUtils.compressImage(file, 0.6, 1000);
            const extracted = await aiHelper.extractItemDescriptionFromImage(compressed);
            if (extracted) {
                setDescription(extracted);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setIsProcessingImage(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleGenerateReport = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!description.trim()) return;

        setIsAnalyzing(true);
        setIsDirectEditing(false);
        setIsReportMenuOpen(false);
        try {
            const qtyNum = Math.max(0.01, parseFloat(quantity) || 1);
            const indirectNum = Math.max(0, parseFloat(indirectPercent) || 0);
            const profitNum = Math.max(0, parseFloat(profitPercent) || 0);

            const result = await aiHelper.generateProfessionalItemPricingReport({
                description: description.trim(),
                category,
                unit,
                quantity: qtyNum,
                indirectCostPercent: indirectNum,
                profitPercent: profitNum,
                notes: notes.trim(),
                marketPrices
            });

            const fullReportHtml = ReportGenerator.buildReport(
                `تحليل سعر ومعدلات - ${result.itemTitle.substring(0, 40)}`,
                result.bodyHtml,
                {
                    subtitle: `دراسة تسعير ومعدلات تنفيذ (${qtyNum} ${unit})`,
                    ref: `UPA-${Date.now().toString().slice(-6)}`
                }
            );

            setReportData(result);
            setReportHtml(fullReportHtml);
        } catch (err: any) {
            console.error('Pricing Error:', err);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handlePrintPdf = () => {
        if (!reportHtml) return;
        setIsReportMenuOpen(false);
        const title = `تحليل_سعر_${(reportData?.itemTitle || description || 'بند_إنشائي').substring(0, 35)}`;
        printService.printReport(reportHtml, title);
    };

    const handleOpenInLetterEditor = async () => {
        if (!reportHtml) return;
        setIsReportMenuOpen(false);
        try {
            const archiveId = await api.getArchiveFolderId();
            const rootId = await api.ensureRootFolder();
            navigate(`/editor/${rootId}/${archiveId}`, {
                state: {
                    initialContent: reportHtml,
                    filename: `تحليل_سعر_${(reportData?.itemTitle || description || 'بند').substring(0, 25)}`
                }
            });
            onClose();
        } catch (err) {
            console.error(err);
        }
    };

    const handleSaveToArchive = async () => {
        if (!reportHtml) return;
        setIsReportMenuOpen(false);
        setIsSavingArchive(true);
        try {
            const title = `تحليل سعر ومعدلات - ${(reportData?.itemTitle || description).substring(0, 40)}`;
            await api.saveToArchive(title, reportHtml, 'تحليل الأسعار والمقايسات');
        } catch (err) {
            console.error(err);
        } finally {
            setIsSavingArchive(false);
        }
    };

    const filteredPresets = selectedPresetCat === 'كل التصنيفات'
        ? PRESET_ITEMS
        : PRESET_ITEMS.filter(p => p.category === selectedPresetCat);

    const fmt = (n: number) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    return (
        <div className="fixed inset-0 z-[250] bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-0 sm:p-3 animate-fade-in">
            <div className="bg-white w-full h-full sm:h-[96vh] sm:max-w-5xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col border border-slate-200 animate-scale-in">
                {/* Compact Sticky Header Bar */}
                <div className="bg-slate-900 px-3.5 py-2.5 text-white flex justify-between items-center shrink-0 relative shadow-md border-b border-slate-800">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1 ml-2">
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-orange-600 text-slate-950 flex items-center justify-center shadow-sm shrink-0">
                            <i className="fa-solid fa-file-invoice-dollar text-xs font-black"></i>
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="text-[11px] sm:text-xs font-bold text-white truncate leading-tight">
                                التسعير الاحترافي للبنود
                            </div>
                            <p className="text-[9.5px] sm:text-[10px] text-amber-400 font-medium mt-0.5 truncate">
                                {reportHtml && reportData
                                    ? `${reportData.itemTitle} (${reportData.quantity} ${reportData.unit})`
                                    : 'حصر خامات • معدلات تنفيذ • تحليل فئة'}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5 relative shrink-0">
                        {isDirectEditing && (
                            <button
                                type="button"
                                onClick={() => setIsDirectEditing(false)}
                                className="w-8 h-8 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center transition border border-emerald-400 shadow-sm shrink-0"
                                title="إنهاء التعديل المباشر"
                            >
                                <i className="fa-solid fa-check text-xs font-bold"></i>
                            </button>
                        )}

                        {reportHtml && !isAnalyzing && (
                            <button
                                type="button"
                                onClick={() => setIsReportMenuOpen(!isReportMenuOpen)}
                                className={`w-8 h-8 rounded-xl flex items-center justify-center transition text-xs border ${
                                    isReportMenuOpen
                                        ? 'bg-indigo-600 text-white border-indigo-400 shadow-lg'
                                        : isDirectEditing
                                            ? 'bg-indigo-500/30 border-indigo-400 text-indigo-200'
                                            : 'bg-white/10 hover:bg-white/20 text-white border-white/20'
                                }`}
                                title="خيارات التقرير"
                            >
                                <i className="fa-solid fa-ellipsis-vertical text-sm"></i>
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={onClose}
                            className="w-8 h-8 rounded-xl bg-white/10 hover:bg-red-500/80 text-white flex items-center justify-center transition border border-white/10"
                            title="إغلاق"
                        >
                            <i className="fa-solid fa-times text-xs"></i>
                        </button>

                        {/* 3-Dots Dropdown Menu for All Report Actions */}
                        {isReportMenuOpen && reportHtml && !isAnalyzing && (
                            <>
                                <div className="fixed inset-0 z-[100]" onClick={() => setIsReportMenuOpen(false)}></div>
                                <div className="absolute left-0 top-10 w-56 bg-slate-900/95 backdrop-blur-xl border border-slate-700 rounded-2xl shadow-2xl p-2 z-[110] space-y-1.5 text-white animate-scale-in origin-top-left">
                                    <div className="px-2.5 py-1 border-b border-slate-800 flex items-center justify-between">
                                        <span className="text-[10px] font-bold text-slate-400">إجراءات التقرير</span>
                                        <i className="fa-solid fa-file-invoice-dollar text-[10px] text-amber-400"></i>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={handlePrintPdf}
                                        className="w-full px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-2.5 transition text-xs font-bold text-right shadow-sm"
                                    >
                                        <div className="w-6 h-6 rounded-lg bg-white/20 text-white flex items-center justify-center shrink-0">
                                            <i className="fa-solid fa-file-pdf text-xs"></i>
                                        </div>
                                        <span>طباعة PDF</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={handleOpenInLetterEditor}
                                        className="w-full px-3 py-2 rounded-xl bg-slate-800 hover:bg-indigo-600 text-white flex items-center gap-2.5 transition text-xs font-bold text-right"
                                    >
                                        <div className="w-6 h-6 rounded-lg bg-indigo-500/20 text-indigo-300 flex items-center justify-center shrink-0">
                                            <i className="fa-solid fa-pen-to-square text-xs"></i>
                                        </div>
                                        <span>تعديل المستند</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsReportMenuOpen(false);
                                            setIsDirectEditing(!isDirectEditing);
                                        }}
                                        className={`w-full px-3 py-2 rounded-xl text-white flex items-center gap-2.5 transition text-xs font-bold text-right ${
                                            isDirectEditing
                                                ? 'bg-amber-600 hover:bg-amber-500'
                                                : 'bg-slate-800 hover:bg-amber-600'
                                        }`}
                                    >
                                        <div className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-300 flex items-center justify-center shrink-0">
                                            <i className={`fa-solid ${isDirectEditing ? 'fa-check' : 'fa-file-pen'} text-xs`}></i>
                                        </div>
                                        <span>{isDirectEditing ? 'إنهاء التعديل المباشر' : 'التعديل المباشر'}</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={handleSaveToArchive}
                                        disabled={isSavingArchive}
                                        className="w-full px-3 py-2 rounded-xl bg-slate-800 hover:bg-teal-600 text-white flex items-center gap-2.5 transition text-xs font-bold text-right disabled:opacity-50"
                                    >
                                        <div className="w-6 h-6 rounded-lg bg-teal-500/20 text-teal-300 flex items-center justify-center shrink-0">
                                            {isSavingArchive ? <i className="fa-solid fa-circle-notch fa-spin text-xs"></i> : <i className="fa-solid fa-box-archive text-xs"></i>}
                                        </div>
                                        <span>حفظ في الأرشيف</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsReportMenuOpen(false);
                                            setReportHtml('');
                                            setIsDirectEditing(false);
                                        }}
                                        className="w-full px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 flex items-center gap-2.5 transition text-xs font-bold text-right border-t border-slate-700/60 mt-1"
                                    >
                                        <div className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                                            <i className="fa-solid fa-sliders text-xs"></i>
                                        </div>
                                        <span>تسعير بند جديد / تعديل</span>
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Body Content */}
                <div className="flex-1 overflow-y-auto bg-slate-50 p-2.5 sm:p-4">
                    {isAnalyzing ? (
                        <div className="h-full min-h-[360px] flex flex-col items-center justify-center text-center p-4">
                            <div className="relative mb-4">
                                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white text-xl shadow-lg animate-pulse">
                                    <i className="fa-solid fa-calculator"></i>
                                </div>
                                <div className="w-18 h-18 border-4 border-amber-500 border-t-transparent rounded-full animate-spin absolute -inset-2"></div>
                            </div>
                            <h4 className="text-xs sm:text-sm font-black text-slate-900 mb-1">
                                جاري حصر الخامات وتحليل سعر ومعدلات البند...
                            </h4>
                            <p className="text-[11px] text-slate-500 max-w-xs font-semibold">
                                يتم حساب الخامات والهالك والعمالة والمعدات طبقاً للكود المصري
                            </p>
                        </div>
                    ) : reportHtml && reportData ? (
                        <div className="max-w-5xl mx-auto space-y-2.5 animate-fade-in">
                            {/* Compact Financial Highlights Strip */}
                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                                <div className="bg-white px-2.5 py-2 rounded-xl border border-slate-200 shadow-xs text-center">
                                    <div className="text-[9.5px] font-bold text-slate-500">خامات الوحدة</div>
                                    <div className="text-xs font-black text-blue-800 font-mono">
                                        {fmt(reportData.materialsCostPerUnit)} <span className="text-[9px]">ج.م</span>
                                    </div>
                                </div>
                                <div className="bg-white px-2.5 py-2 rounded-xl border border-slate-200 shadow-xs text-center">
                                    <div className="text-[9.5px] font-bold text-slate-500">عمالة ومعدات</div>
                                    <div className="text-xs font-black text-amber-700 font-mono">
                                        {fmt(reportData.laborCostPerUnit + reportData.equipmentCostPerUnit)} <span className="text-[9px]">ج.م</span>
                                    </div>
                                </div>
                                <div className="bg-white px-2.5 py-2 rounded-xl border border-slate-200 shadow-xs text-center">
                                    <div className="text-[9.5px] font-bold text-slate-500">التكلفة المباشرة</div>
                                    <div className="text-xs font-black text-slate-900 font-mono">
                                        {fmt(reportData.directCostPerUnit)} <span className="text-[9px]">ج.م</span>
                                    </div>
                                </div>
                                <div className="bg-emerald-50 px-2.5 py-2 rounded-xl border border-emerald-200 shadow-xs text-center">
                                    <div className="text-[9.5px] font-bold text-emerald-700">سعر الوحدة ({reportData.unit})</div>
                                    <div className="text-xs sm:text-sm font-black text-emerald-800 font-mono">
                                        {fmt(reportData.finalUnitPrice)} <span className="text-[9px]">ج.م</span>
                                    </div>
                                </div>
                                <div className="col-span-2 sm:col-span-1 bg-indigo-950 px-2.5 py-2 rounded-xl border border-indigo-800 shadow-xs text-center text-white">
                                    <div className="text-[9.5px] font-bold text-indigo-200">إجمالي ({reportData.quantity} {reportData.unit})</div>
                                    <div className="text-xs sm:text-sm font-black text-amber-300 font-mono">
                                        {fmt(reportData.totalItemPrice)} <span className="text-[9px]">ج.م</span>
                                    </div>
                                </div>
                            </div>

                            {/* Interactive Printable Report Container */}
                            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-2.5 sm:p-5">
                                <InteractiveReportViewer
                                    htmlContent={reportHtml}
                                    onContentChange={(newHtml) => setReportHtml(newHtml)}
                                    isDirectEditing={isDirectEditing}
                                    onDirectEditChange={setIsDirectEditing}
                                    showFloatingEditBar={false}
                                />
                            </div>
                        </div>
                    ) : (
                        <form onSubmit={handleGenerateReport} className="max-w-4xl mx-auto space-y-3">
                            {/* Compact Quick Presets Section */}
                            <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
                                <div className="flex items-center justify-between gap-2 mb-2">
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-6 h-6 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center text-[11px]">
                                            <i className="fa-solid fa-layer-group"></i>
                                        </span>
                                        <h4 className="text-xs font-black text-slate-800">بنود قياسية جاهزة</h4>
                                    </div>

                                    <select
                                        value={selectedPresetCat}
                                        onChange={(e) => setSelectedPresetCat(e.target.value)}
                                        className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-[11px] font-bold text-slate-800 outline-none focus:border-indigo-500"
                                    >
                                        {CATEGORIES.map(c => (
                                            <option key={c} value={c}>{c}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 max-h-36 overflow-y-auto p-0.5">
                                    {filteredPresets.map(preset => (
                                        <button
                                            type="button"
                                            key={preset.id}
                                            onClick={() => handleSelectPreset(preset)}
                                            className={`text-right px-2.5 py-2 rounded-xl border transition flex items-center justify-between gap-1.5 ${
                                                description === preset.description
                                                    ? 'bg-amber-50 border-amber-400 ring-1 ring-amber-400'
                                                    : 'bg-slate-50/80 hover:bg-indigo-50/50 border-slate-200 hover:border-indigo-300'
                                            }`}
                                        >
                                            <span className="text-[11px] font-bold text-slate-800 truncate">{preset.title}</span>
                                            <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-white border border-slate-200 text-indigo-700 shrink-0">
                                                {preset.unit}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Compact Item Description & Parameters */}
                            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                                <div>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <label className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                                            <i className="fa-solid fa-pen-ruler text-indigo-600 text-[11px]"></i>
                                            <span>منطوق البند *</span>
                                        </label>
                                        <button
                                            type="button"
                                            onClick={() => fileInputRef.current?.click()}
                                            disabled={isProcessingImage}
                                            className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border border-slate-200 text-[10px] font-bold flex items-center gap-1 transition"
                                            title="قراءة البند من صورة"
                                        >
                                            <i className={`fa-solid ${isProcessingImage ? 'fa-circle-notch fa-spin' : 'fa-camera'}`}></i>
                                            <span>{isProcessingImage ? 'جاري القراءة...' : 'من صورة'}</span>
                                        </button>
                                        <input
                                            type="file"
                                            ref={fileInputRef}
                                            onChange={handleImageInput}
                                            accept="image/*"
                                            className="hidden"
                                        />
                                    </div>
                                    <textarea
                                        required
                                        rows={3}
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        placeholder="اكتب منطوق البند... (مثال: توريد وصب خرسانة مسلحة للقواعد والأسقف بمحتوى أسمنت 350 كجم/م3...)"
                                        className="w-full p-2.5 rounded-xl bg-slate-50 border border-slate-300 focus:border-indigo-600 focus:bg-white outline-none text-slate-900 font-bold text-xs leading-relaxed transition"
                                    />
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                                    <div className="col-span-2 sm:col-span-1">
                                        <label className="block text-[10px] font-black text-slate-600 mb-1">التصنيف</label>
                                        <select
                                            value={category}
                                            onChange={(e) => setCategory(e.target.value)}
                                            className="w-full p-2 rounded-xl bg-slate-50 border border-slate-300 focus:border-indigo-600 outline-none text-[11px] font-bold text-slate-900"
                                        >
                                            {CATEGORIES.filter(c => c !== 'كل التصنيفات').map(c => (
                                                <option key={c} value={c}>{c}</option>
                                            ))}
                                            <option value="أعمال عامة">أعمال عامة</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-[10px] font-black text-slate-600 mb-1">الوحدة</label>
                                        <select
                                            value={unit}
                                            onChange={(e) => setUnit(e.target.value)}
                                            className="w-full p-2 rounded-xl bg-slate-50 border border-slate-300 focus:border-indigo-600 outline-none text-[11px] font-bold text-slate-900"
                                        >
                                            {UNITS.map(u => (
                                                <option key={u} value={u}>{u}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-[10px] font-black text-slate-600 mb-1">الكمية</label>
                                        <input
                                            type="number"
                                            step="any"
                                            min="0.01"
                                            value={quantity}
                                            onChange={(e) => setQuantity(e.target.value)}
                                            className="w-full p-2 rounded-xl bg-slate-50 border border-slate-300 focus:border-indigo-600 outline-none text-[11px] font-black text-slate-900 text-center font-mono"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-[10px] font-black text-slate-600 mb-1">م. غير مباشرة %</label>
                                        <input
                                            type="number"
                                            step="0.5"
                                            min="0"
                                            max="100"
                                            value={indirectPercent}
                                            onChange={(e) => setIndirectPercent(e.target.value)}
                                            className="w-full p-2 rounded-xl bg-slate-50 border border-slate-300 focus:border-indigo-600 outline-none text-[11px] font-black text-slate-900 text-center font-mono"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-[10px] font-black text-slate-600 mb-1">الربح %</label>
                                        <input
                                            type="number"
                                            step="0.5"
                                            min="0"
                                            max="100"
                                            value={profitPercent}
                                            onChange={(e) => setProfitPercent(e.target.value)}
                                            className="w-full p-2 rounded-xl bg-slate-50 border border-slate-300 focus:border-indigo-600 outline-none text-[11px] font-black text-slate-900 text-center font-mono"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-black text-slate-600 mb-1">
                                        ملاحظات خاصة (اختياري)
                                    </label>
                                    <input
                                        type="text"
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        placeholder="مثال: نسبة الحديد 120 كجم/م3 - صب بالبمب..."
                                        className="w-full p-2 rounded-xl bg-slate-50 border border-slate-300 focus:border-indigo-600 outline-none text-[11px] font-bold text-slate-900"
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={!description.trim() || isAnalyzing}
                                    className="w-full py-2.5 px-5 rounded-xl bg-gradient-to-l from-amber-500 via-orange-500 to-amber-600 hover:from-amber-600 hover:to-orange-700 text-white font-black text-xs sm:text-sm shadow-md transition flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    <i className="fa-solid fa-wand-magic-sparkles text-xs"></i>
                                    <span>تحليل وتسعير البند</span>
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ProfessionalPricingModal;
