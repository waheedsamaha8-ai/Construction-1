import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Checklist } from '../types';
import {
    QC_TEMPLATES,
    QC_DOC_TYPES,
    QC_STATUS_META,
    QCChecklistItemData,
    QCItemResult,
    QCDocType,
    QCTemplate,
    getQCDocTypeDefinition,
    buildOfficialInspectionReportHtml
} from '../services/qcChecklistsData';
import InteractiveReportViewer from './InteractiveReportViewer';
import { printService } from '../services/printService';
import { imageUtils } from '../services/imageUtils';

interface ProjectQCTabProps {
    projectId: string;
    projectName: string;
    contractorName: string;
    checklists: Checklist[];
    onUpdateChecklists: (updated: Checklist[], allowEmpty?: boolean) => void;
    onCloseMasterData: () => void;
}

const QC_CATEGORIES = [
    'الكل',
    'الأعمال المساحية وتجهيز الموقع',
    'أعمال الحفر والإحلال والأساسات',
    'أعمال الخرسانة المسلحة',
    'أعمال المنشآت المعدنية (Steel)',
    'أعمال المباني والقواطيع',
    'أعمال العزل',
    'أعمال البياض والمحارة',
    'أعمال الأرضيات والرخام',
    'أعمال الدهانات',
    'أعمال الأسقف المعلقة',
    'أعمال النجارة والألوميتال والكريتال',
    'أعمال السباكة والصرف والحريق',
    'أعمال الكهرباء والتيار الخفيف والتكييف',
    'أعمال الموقع العام والطرق',
    'توريدات ومواد إنشائية ومعمارية'
];

const DEFAULT_ITEMS_BY_DOC_TYPE: Record<QCDocType, { activityName: string; items: { criterion: string; ecpStandard: string }[] }> = {
    IR: {
        activityName: QC_TEMPLATES[0].title,
        items: QC_TEMPLATES[0].defaultItems
    },
    MIR: {
        activityName: 'فحص واستلام توريد حديد التسليح بالموقع (Rebar Steel MIR)',
        items: QC_TEMPLATES.find(t => t.id === 'mir_rebar_steel')?.defaultItems || []
    },
    NCR: {
        activityName: 'تقرير عدم مطابقة أعمال خرسانية / تشطيبات / مواد موردة',
        items: [
            { criterion: 'تحديد وحصر الجزء المخالف بالموقع وعزله أو إيقاف العمل به مؤقتاً', ecpStandard: 'منع البناء أو التغطية على الجزء المخالف' },
            { criterion: 'تقديم المقاول لطريقة الإصلاح المعتمدة (Method Statement for Repair)', ecpStandard: 'مطابق لاشتراطات الكود المصري والكيماويات المعتمدة' },
            { criterion: 'تنفيذ الإجراء التصحيحي تحت إشراف مهندس ضبط الجودة والاستشاري', ecpStandard: 'إزالة أسباب المخالفة جذرياً' },
            { criterion: 'إعادة الفحص والاختبار بعد الإصلاح للتأكد من كفاءة المعالجة وإغلاق الـ NCR', ecpStandard: 'تحقيق القبول الفني الكامل' }
        ]
    },
    CPP: {
        activityName: 'تصريح صب خرسانة مسلحة للسقف / الأعمدة / الأساسات',
        items: [
            { criterion: 'اكتمال استلام النجارة والأبعاد والمناسيب ومتانة التقويات والشدة', ecpStandard: 'مطابق للوحات التنفيذية المعتمدة' },
            { criterion: 'اكتمال استلام الحدادة والأقطار والكانات والكراسي وبسكوت الغطاء الخرساني', ecpStandard: 'مطابق للكود المصري ECP 203' },
            { criterion: 'انتهاء واستلام تمديدات الكهرباء والسباكة والفتحات الميكانيكية (MEP Clearance)', ecpStandard: 'عدم وجود تعارض وموافقة مهندس الكهروميكانيكا' },
            { criterion: 'نظافة الشدة والحديد تماماً ورش المياه وتوفر الهزازات الميكانيكية والإضاءة', ecpStandard: 'جاهزية كاملة للصب الآمن' },
            { criterion: 'تجهيز مكعبات الاختبار القياسية ومخروط الهبوط (Slump Cone) وميزان الحرارة بالموقع', ecpStandard: 'جاهزية معمل ضبط الجودة بالموقع' }
        ]
    },
    ITR: {
        activityName: 'محضر اختبار معملي / ميداني (دمك تربة / تكسير مكعبات / كبس مواسير / غمر عزل)',
        items: [
            { criterion: 'التأكد من معايرة الأجهزة المستخدمة في الاختبار وسريان شهادة المعايرة', ecpStandard: 'أجهزة قياس معايرة ومعتمدة' },
            { criterion: 'أخذ العينات أو تنفيذ الاختبار بحضور مهندس ضبط الجودة والاستشاري', ecpStandard: 'طبقاً لطريقة الاختبار القياسية بالكود المصري' },
            { criterion: 'تحقيق القيم المسجلة للحدود التصميمية المطلوبة بالمواصفات الفنية', ecpStandard: 'نجاح الاختبار بنسبة ≥ الحد الأدنى المسموح' }
        ]
    },
    SI: {
        activityName: 'أمر موقع بتلافي ملاحظات تنفيذية والالتزام بالمواصفات الفنية',
        items: [
            { criterion: 'الالتزام الفوري بتنفيذ التوجيه الفني الوارد بأمر الموقع في الموعد المحدد', ecpStandard: 'طبقاً لتعليمات الإشراف وشروط العقد' },
            { criterion: 'توفير العمالة والمعدات والخامات المعتمدة اللازمة لتنفيذ البند', ecpStandard: 'أصول الصناعة والمواصفات الفنية' },
            { criterion: 'تقديم طلب استلام (IR) للاستشاري فور الانتهاء من تنفيذ أمر الموقع', ecpStandard: 'اعتماد إغلاق الملاحظات ميدانياً' }
        ]
    },
    MOM: {
        activityName: 'محضر الاجتماع الفني الدوري لمتابعة تقدم الأعمال وضبط الجودة بالموقع',
        items: [
            { criterion: 'مراجعة الموقف التنفيذي الحالي ومعدلات الإنجاز مقارنة بالبرنامج الزمني المعتمد', ecpStandard: 'الالتزام بالمسار الحرج للمشروع' },
            { criterion: 'موقف الاعتمادات الفنية للمواد (MAR) والرسومات التنفيذية (Shop Drawings)', ecpStandard: 'سرعة استكمال التقديمات الفنية قبل التنفيذ' },
            { criterion: 'موقف محاضر الاستلام المفتوحة (IRs) وتقارير عدم المطابقة (NCRs) وإجراءات إغلاقها', ecpStandard: 'تحقيق معايير الجودة الكودية' },
            { criterion: 'متابعة توافر الخامات والعمالة والمعدات واشتراطات السلامة المهنية بالموقع', ecpStandard: 'تأمين تدفق الأعمال بدون توقف' }
        ]
    },
    RFI: {
        activityName: 'استفسار فني عن تفصيلة تنفيذية / مطابقة اللوحات المعمارية والإنشائية',
        items: [
            { criterion: 'مراجعة اللوحات المعمارية والإنشائية والكهروميكانيكية محل الاستفسار', ecpStandard: 'تنسيق كامل بين التخصصات (Coordination)' },
            { criterion: 'دراسة الحل الفني المقترح ومدى مطابقته للكود المصري وعدم تأثيره على الأمان الإنشائي', ecpStandard: 'مطابق للكود المصري وأصول الصناعة' },
            { criterion: 'تعميم الرد المعتمد من الاستشاري على طاقم التنفيذ وتحديث لوحات الـ As-Built', ecpStandard: 'التنفيذ بموجب الرد الرسمي المعتمد' }
        ]
    },
    SAM: {
        activityName: 'محضر فحص واعتماد عينة مواد / نموذج تشطيب مرجعي (Mock-up Approval)',
        items: [
            { criterion: 'مطابقة العينة / النموذج المرجعي للمواصفات الفنية وجدول التشطيبات المعتمد', ecpStandard: 'الفرز الأول ومطابقة اللون والمقاس والمنشأ' },
            { criterion: 'تقديم الكتالوجات الفنية وشهادات الاختبار والضمان الخاصة بالمنتج المعتمد', ecpStandard: 'مورد ومصنع معتمد بالمشروع' },
            { criterion: 'حفظ عينة مرجعية مختومة بمكتب الاستشاري بالموقع للمطابقة عليها عند التوريد', ecpStandard: 'مرجع قياسي للاستلامات اللاحقة (MIR)' }
        ]
    }
};

const ProjectQCTab: React.FC<ProjectQCTabProps> = ({
    projectId,
    projectName,
    contractorName,
    checklists,
    onUpdateChecklists,
    onCloseMasterData
}) => {
    const navigate = useNavigate();

    // Plus Menu state (Quality Control Models Selector)
    const [isPlusMenuOpen, setIsPlusMenuOpen] = useState(false);

    // Full-screen report viewer state
    const [selectedChecklist, setSelectedChecklist] = useState<Checklist | null>(null);
    const [isReportMenuOpen, setIsReportMenuOpen] = useState(false);
    const [isDirectEditing, setIsDirectEditing] = useState(false);
    const [checklistToDeleteId, setChecklistToDeleteId] = useState<string | null>(null);

    // Create / Edit Checklist Modal state
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [docType, setDocType] = useState<QCDocType>('IR');
    const [docFields, setDocFields] = useState<Record<string, string>>({});
    const [filterCat, setFilterCat] = useState('الكل');
    const [templateSearch, setTemplateSearch] = useState('');

    const [refNumber, setRefNumber] = useState('');
    const [activityName, setActivityName] = useState('');
    const [category, setCategory] = useState('أعمال الخرسانة المسلحة');
    const [ecpCode, setEcpCode] = useState('الكود المصري للخرسانة المسلحة ECP 203');
    const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [location, setLocation] = useState('');
    const [contractorEngineer, setContractorEngineer] = useState('');
    const [consultantEngineer, setConsultantEngineer] = useState('');
    const [status, setStatus] = useState<string>('Approved');
    const [generalNotes, setGeneralNotes] = useState('');
    const [qcItems, setQcItems] = useState<QCChecklistItemData[]>([]);
    const [photos, setPhotos] = useState<string[]>([]);
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
    const [newItemCriterion, setNewItemCriterion] = useState('');
    const [newItemStandard, setNewItemStandard] = useState('');

    const photoInputRef = useRef<HTMLInputElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);

    const updateDocField = (key: string, val: string) => {
        setDocFields(prev => ({ ...prev, [key]: val }));
    };

    const applyTemplate = (tpl: QCTemplate) => {
        setActivityName(tpl.title);
        setCategory(tpl.category);
        setEcpCode(tpl.ecpCode);
        setQcItems(
            tpl.defaultItems.map((item, idx) => ({
                id: `qci_${Date.now()}_${idx}`,
                criterion: item.criterion,
                ecpStandard: item.ecpStandard,
                result: 'pass',
                notes: ''
            }))
        );
    };

    const openCreateModalWithType = (selectedType: QCDocType) => {
        setIsPlusMenuOpen(false);
        const docDef = getQCDocTypeDefinition(selectedType);
        const sameTypeCount = (checklists || []).filter(c => (c.docType || 'IR') === selectedType).length;
        const nextNum = String(sameTypeCount + 1).padStart(3, '0');

        setEditingId(null);
        setDocType(selectedType);
        setDocFields({});
        setRefNumber(`${docDef.codePrefix}-${nextNum}`);
        setDate(new Date().toISOString().split('T')[0]);
        setLocation('');
        setContractorEngineer('');
        setConsultantEngineer('');
        setStatus(selectedType === 'NCR' ? 'Rejected' : selectedType === 'SI' || selectedType === 'MOM' || selectedType === 'RFI' ? 'Open' : 'Approved');
        setGeneralNotes('');
        setPhotos([]);
        setTemplateSearch('');

        if (selectedType === 'IR') {
            setFilterCat('الكل');
            applyTemplate(QC_TEMPLATES[0]);
        } else if (selectedType === 'MIR') {
            setFilterCat('توريدات ومواد إنشائية ومعمارية');
            const firstMir = QC_TEMPLATES.find(t => t.docType === 'MIR') || QC_TEMPLATES[0];
            applyTemplate(firstMir);
        } else {
            const preset = DEFAULT_ITEMS_BY_DOC_TYPE[selectedType];
            setActivityName(preset.activityName);
            setCategory(docDef.defaultCategory);
            setEcpCode(docDef.defaultEcpCode);
            setQcItems(
                preset.items.map((item, idx) => ({
                    id: `qci_${Date.now()}_${idx}`,
                    criterion: item.criterion,
                    ecpStandard: item.ecpStandard,
                    result: selectedType === 'NCR' && idx === 0 ? 'fail' : 'pass',
                    notes: ''
                }))
            );
        }

        setIsFormOpen(true);
    };

    const openEditModal = (chk: Checklist) => {
        const type = (chk.docType as QCDocType) || 'IR';
        setEditingId(chk.id);
        setDocType(type);
        setDocFields(chk.docFields || {});
        setRefNumber(chk.refNumber || `${type}-001`);
        setActivityName(chk.activityName || '');
        setCategory(chk.category || 'أعمال الخرسانة المسلحة');
        setEcpCode(chk.ecpCode || 'الكود المصري لتصميم وتنفيذ المنشآت (ECP)');
        setDate(chk.date || new Date().toISOString().split('T')[0]);
        setLocation(chk.location || '');
        setContractorEngineer(chk.contractorEngineer || '');
        setConsultantEngineer(chk.consultantEngineer || chk.inspectorName || '');
        setStatus(chk.status || 'Approved');
        setGeneralNotes(chk.generalNotes || '');
        setPhotos(chk.photos || []);
        setTemplateSearch('');

        if (chk.items && chk.items.length > 0) {
            setQcItems(
                chk.items.map((it, idx) => ({
                    id: it.id || `qci_${idx}`,
                    criterion: it.text || '',
                    ecpStandard: it.ecpStandard || 'مطابق للكود المصري',
                    result: it.result || (it.isChecked ? 'pass' : 'fail'),
                    notes: it.notes || ''
                }))
            );
        } else {
            applyTemplate(QC_TEMPLATES[0]);
        }
        setIsFormOpen(true);
    };

    const fileToDataUrl = (file: File): Promise<string> =>
        new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });

    const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        setIsUploadingPhoto(true);
        try {
            const added: string[] = [];
            for (let i = 0; i < files.length; i++) {
                const compressed = await imageUtils.compressImage(files[i], 0.65, 1000);
                if (compressed) {
                    const dataUrl = await fileToDataUrl(compressed);
                    if (dataUrl) added.push(dataUrl);
                }
            }
            setPhotos(prev => [...prev, ...added]);
        } catch (err) {
            console.error(err);
        } finally {
            setIsUploadingPhoto(false);
            if (photoInputRef.current) photoInputRef.current.value = '';
            if (cameraInputRef.current) cameraInputRef.current.value = '';
        }
    };

    const handleAddCustomItem = () => {
        if (!newItemCriterion.trim()) return;
        setQcItems(prev => [
            ...prev,
            {
                id: `qci_${Date.now()}`,
                criterion: newItemCriterion.trim(),
                ecpStandard: newItemStandard.trim() || 'مطابق للكود المصري وأصول الصناعة',
                result: 'pass',
                notes: ''
            }
        ]);
        setNewItemCriterion('');
        setNewItemStandard('');
    };

    const handleSaveInspection = (e: React.FormEvent) => {
        e.preventDefault();
        if (!activityName.trim()) return;

        const id = editingId || `chk_${Date.now()}`;
        const htmlContent = buildOfficialInspectionReportHtml({
            docType,
            docFields,
            refNumber: refNumber.trim() || `${docType}-001`,
            projectName: projectName || 'المشروع',
            contractorName: contractorName || 'المقاول العام',
            activityName: activityName.trim(),
            category,
            ecpCode,
            date,
            location: location.trim() || 'الموقع العام',
            contractorEngineer: contractorEngineer.trim(),
            consultantEngineer: consultantEngineer.trim(),
            status,
            generalNotes: generalNotes.trim(),
            items: qcItems,
            photos
        });

        const newChecklist: Checklist = {
            id,
            docType,
            docFields,
            refNumber: refNumber.trim() || `${docType}-001`,
            activityName: activityName.trim(),
            category,
            ecpCode,
            date,
            location: location.trim() || 'الموقع العام',
            contractorEngineer: contractorEngineer.trim(),
            consultantEngineer: consultantEngineer.trim(),
            inspectorName: consultantEngineer.trim(),
            status,
            generalNotes: generalNotes.trim(),
            photos,
            items: qcItems.map(it => ({
                id: it.id,
                text: it.criterion,
                ecpStandard: it.ecpStandard,
                result: it.result,
                isChecked: it.result === 'pass',
                notes: it.notes
            })),
            htmlContent
        };

        const updatedList = editingId
            ? checklists.map(c => (c.id === editingId ? newChecklist : c))
            : [newChecklist, ...(checklists || [])];

        onUpdateChecklists(updatedList);
        setIsFormOpen(false);
        setSelectedChecklist(newChecklist);
    };

    const getChecklistHtml = (chk: Checklist): string => {
        if (chk.htmlContent && chk.htmlContent.trim().length > 20) {
            return chk.htmlContent;
        }
        return buildOfficialInspectionReportHtml({
            docType: chk.docType || 'IR',
            docFields: chk.docFields || {},
            refNumber: chk.refNumber || 'IR-001',
            projectName: projectName || 'المشروع',
            contractorName: contractorName || 'المقاول العام',
            activityName: chk.activityName || 'استلام أعمال',
            category: chk.category || 'أعمال هندسية',
            ecpCode: chk.ecpCode || 'الكود المصري (ECP)',
            date: chk.date || new Date().toISOString().split('T')[0],
            location: chk.location || 'الموقع العام',
            contractorEngineer: chk.contractorEngineer || '',
            consultantEngineer: chk.consultantEngineer || chk.inspectorName || '',
            status: chk.status || 'Approved',
            generalNotes: chk.generalNotes || '',
            items: (chk.items || []).map((it, idx) => ({
                id: it.id || `qci_${idx}`,
                criterion: it.text || '',
                ecpStandard: it.ecpStandard || 'مطابق للكود المصري',
                result: it.result || (it.isChecked ? 'pass' : 'fail'),
                notes: it.notes || ''
            })),
            photos: chk.photos || []
        });
    };

    const handleOpenInLetterEditor = (chk: Checklist) => {
        const html = getChecklistHtml(chk);
        setIsReportMenuOpen(false);
        setSelectedChecklist(null);
        onCloseMasterData();
        navigate(`/editor/${projectId}/${projectId}`, {
            state: {
                initialContent: html,
                filename: `نموذج_${chk.refNumber || 'QC'}_${chk.activityName.replace(/\s+/g, '_')}`,
                cardId: chk.id,
                cardType: 'checklist',
                returnToMasterData: true
            }
        });
    };

    const handlePrintChecklist = (chk: Checklist) => {
        const html = getChecklistHtml(chk);
        const docDef = getQCDocTypeDefinition(chk.docType);
        setIsReportMenuOpen(false);
        printService.printReport(
            html,
            `${docDef.shortTitle} (${chk.refNumber}) - ${chk.activityName}`,
            chk.refNumber || 'IR-001',
            { showHeader: false, showFooter: false }
        );
    };

    const confirmDeleteChecklist = () => {
        if (!checklistToDeleteId) return;
        const remaining = (checklists || []).filter(c => c.id !== checklistToDeleteId);
        onUpdateChecklists(remaining, remaining.length === 0);
        if (selectedChecklist?.id === checklistToDeleteId) {
            setSelectedChecklist(null);
        }
        setChecklistToDeleteId(null);
    };

    const filteredTemplates = QC_TEMPLATES.filter(t => {
        const matchesCat = filterCat === 'الكل' || t.category === filterCat;
        const q = templateSearch.trim().toLowerCase();
        const matchesSearch = !q || t.title.toLowerCase().includes(q) || t.category.toLowerCase().includes(q);
        return matchesCat && matchesSearch;
    });

    const displayedChecklists = checklists || [];

    const currentDocDef = getQCDocTypeDefinition(docType);

    return (
        <div className="p-0 pb-20 flex flex-col h-full relative">
            {/* Compact Top Sticky Header in QC Tab (Icon-Only + Button with Dropdown Menu of QC Models) */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 flex justify-between items-center gap-2 shrink-0 mb-2.5 mx-1 mt-1 sticky top-0 z-30 shadow-xs">
                <h4 className="font-bold text-emerald-950 text-[11px] sm:text-xs flex items-center gap-1.5 truncate">
                    <i className="fa-solid fa-clipboard-check text-emerald-600 text-xs"></i>
                    <span>مستندات ضبط الجودة</span>
                    <span className="bg-emerald-600 text-white text-[9.5px] px-1.5 py-0.5 rounded-full font-mono leading-none">
                        {checklists?.length || 0}
                    </span>
                </h4>

                {/* Plus (+) Button with Dropdown List of Quality Control Models */}
                <div className="relative shrink-0">
                    <button
                        type="button"
                        onClick={() => setIsPlusMenuOpen(!isPlusMenuOpen)}
                        className="w-8 h-8 rounded-xl bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 transition flex items-center justify-center shrink-0"
                        title="إصدار نموذج استلام أو ضبط جودة جديد"
                    >
                        <i className={`fa-solid ${isPlusMenuOpen ? 'fa-times' : 'fa-plus'} text-xs transition-transform`}></i>
                    </button>

                    {isPlusMenuOpen && (
                        <>
                            <div
                                className="fixed inset-0 z-[1500]"
                                onClick={() => setIsPlusMenuOpen(false)}
                            ></div>
                            <div className="absolute left-0 top-10 w-68 sm:w-76 bg-white border border-slate-200 rounded-2xl shadow-2xl p-2 z-[1550] space-y-1 animate-scale-in origin-top-left max-h-[78vh] overflow-y-auto">
                                <div className="px-2.5 py-1.5 border-b border-slate-100 flex items-center justify-between">
                                    <span className="text-[10.5px] font-black text-slate-800">اختر نموذج الاستلام وضبط الجودة</span>
                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">9 نماذج</span>
                                </div>

                                {QC_DOC_TYPES.map((model) => (
                                    <button
                                        key={model.type}
                                        type="button"
                                        onClick={() => openCreateModalWithType(model.type)}
                                        className="w-full p-2 rounded-xl hover:bg-slate-50 active:bg-slate-100 transition flex items-start gap-2.5 text-right border border-transparent hover:border-slate-200 group"
                                    >
                                        <div className={`w-7 h-7 rounded-lg ${model.iconBg} text-white flex items-center justify-center shrink-0 mt-0.5 shadow-2xs`}>
                                            <i className={`fa-solid ${model.icon} text-[11px]`}></i>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center justify-between gap-1">
                                                <span className="text-[10.5px] font-bold text-slate-800 group-hover:text-emerald-700 truncate">
                                                    {model.shortTitle}
                                                </span>
                                                <span className="text-[8.5px] font-black font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 shrink-0">
                                                    {model.codePrefix}
                                                </span>
                                            </div>
                                            <p className="text-[9px] text-slate-500 font-medium line-clamp-1 mt-0.5">
                                                {model.subtitle}
                                            </p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Saved Inspection & QC Models Cards Grid */}
            <div className="flex-1 overflow-y-auto px-1">
                {displayedChecklists.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-56 text-slate-400 bg-white/60 rounded-2xl border border-dashed border-slate-200 mx-1 p-4 text-center">
                        <div className="w-11 h-11 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mb-2 text-lg shadow-xs">
                            <i className="fa-solid fa-clipboard-check"></i>
                        </div>
                        <p className="text-[11px] font-bold text-slate-700 mb-1">لا توجد نماذج أو محاضر مسجلة</p>
                        <p className="text-[10px] text-slate-500 max-w-xs mb-3">
                            اضغط على زر «+» لاختيار نموذج فحص أعمال (IR)، فحص مواد (MIR)، تقرير عدم مطابقة (NCR)، أمر موقع، أو محضر اجتماع.
                        </p>
                        <button
                            type="button"
                            onClick={() => setIsPlusMenuOpen(true)}
                            className="w-9 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow transition flex items-center justify-center"
                            title="إضافة نموذج ضبط جودة"
                        >
                            <i className="fa-solid fa-plus text-xs"></i>
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {displayedChecklists.map((chk) => {
                            const statusMeta = QC_STATUS_META[chk.status] || QC_STATUS_META.Approved;
                            const modelDef = getQCDocTypeDefinition(chk.docType);
                            const totalItems = chk.items?.length || 0;
                            const passItems = (chk.items || []).filter(i => (i.result ? i.result === 'pass' : i.isChecked)).length;

                            return (
                                <div
                                    key={chk.id}
                                    onClick={() => {
                                        const withHtml = { ...chk, htmlContent: getChecklistHtml(chk) };
                                        setSelectedChecklist(withHtml);
                                    }}
                                    className="bg-white p-2.5 rounded-xl shadow-xs border border-slate-200 hover:border-emerald-400 hover:shadow-sm transition cursor-pointer group relative overflow-hidden"
                                >
                                    <div className="flex justify-between items-start gap-1.5 mb-1.5">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <div className={`w-7 h-7 rounded-lg ${modelDef.iconBg} text-white flex items-center justify-center text-xs font-black shrink-0`}>
                                                <i className={`fa-solid ${modelDef.icon}`}></i>
                                            </div>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-1 flex-wrap">
                                                    <span className="text-[9px] font-black font-mono px-1.5 py-0.5 rounded bg-slate-900 text-white">
                                                        {chk.refNumber || modelDef.codePrefix}
                                                    </span>
                                                    <span
                                                        className="text-[8.5px] font-bold px-1.5 py-0.5 rounded"
                                                        style={{
                                                            backgroundColor: modelDef.badgeBg,
                                                            color: modelDef.badgeText
                                                        }}
                                                    >
                                                        {modelDef.shortTitle.replace(/\s*\(.*?\)/, '')}
                                                    </span>
                                                    <span
                                                        className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                                                        style={{
                                                            backgroundColor: statusMeta.bg,
                                                            color: statusMeta.text,
                                                            border: `1px solid ${statusMeta.border}`
                                                        }}
                                                    >
                                                        {statusMeta.label}
                                                    </span>
                                                </div>
                                                <h3 className="font-bold text-slate-800 text-[11px] mt-0.5 truncate">
                                                    {chk.activityName}
                                                </h3>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                                            <button
                                                type="button"
                                                onClick={() => openEditModal(chk)}
                                                className="w-6 h-6 rounded-full hover:bg-blue-50 text-slate-400 hover:text-blue-600 flex items-center justify-center transition"
                                                title="تعديل النموذج"
                                            >
                                                <i className="fa-solid fa-pen text-[9.5px]"></i>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setChecklistToDeleteId(chk.id)}
                                                className="w-6 h-6 rounded-full hover:bg-red-50 text-slate-400 hover:text-red-500 flex items-center justify-center transition"
                                                title="حذف المحضر"
                                            >
                                                <i className="fa-solid fa-trash text-[9.5px]"></i>
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-1.5 text-[9.5px] text-slate-500 font-semibold">
                                        {chk.location && (
                                            <span className="flex items-center gap-1 bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 truncate max-w-[140px]">
                                                <i className="fa-solid fa-location-dot text-emerald-600 text-[8.5px]"></i>
                                                <span className="truncate">{chk.location}</span>
                                            </span>
                                        )}
                                        {totalItems > 0 && (
                                            <span className="flex items-center gap-1 bg-emerald-50 text-emerald-800 px-1.5 py-0.5 rounded font-bold">
                                                <i className="fa-solid fa-check-double text-[8.5px]"></i>
                                                {passItems}/{totalItems} مطابق
                                            </span>
                                        )}
                                        {chk.photos && chk.photos.length > 0 && (
                                            <span className="flex items-center gap-1 bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-bold">
                                                <i className="fa-solid fa-camera text-[8.5px]"></i>
                                                {chk.photos.length}
                                            </span>
                                        )}
                                        <span className="mr-auto text-[9px] text-slate-400 font-mono">{chk.date}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Full-Screen Official Inspection Document Viewer with Sticky Top Bar & 3-Dots Menu */}
            {selectedChecklist && (
                <div className="fixed inset-0 z-[1700] bg-white animate-scale-in flex flex-col">
                    <div className="bg-slate-900 text-white px-3.5 py-2.5 flex justify-between items-center shadow-md shrink-0 relative border-b border-slate-800">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1 ml-2">
                            <div className={`w-7 h-7 rounded-lg ${getQCDocTypeDefinition(selectedChecklist.docType).iconBg} flex items-center justify-center shrink-0`}>
                                <i className={`fa-solid ${getQCDocTypeDefinition(selectedChecklist.docType).icon} text-xs text-white`}></i>
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="font-bold text-[11px] sm:text-xs text-white truncate leading-tight">
                                    {selectedChecklist.refNumber} • {selectedChecklist.activityName}
                                </div>
                                <div className="text-[9.5px] sm:text-[10px] font-medium text-emerald-400 truncate mt-0.5">
                                    {getQCDocTypeDefinition(selectedChecklist.docType).shortTitle} • {selectedChecklist.location || 'الموقع العام'} • {selectedChecklist.date}
                                </div>
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

                            {/* 3-Dots Menu Button */}
                            <button
                                type="button"
                                onClick={() => setIsReportMenuOpen(!isReportMenuOpen)}
                                className={`w-8 h-8 rounded-xl flex items-center justify-center transition text-xs border ${
                                    isReportMenuOpen
                                        ? 'bg-indigo-600 text-white border-indigo-400 shadow-lg'
                                        : isDirectEditing
                                            ? 'bg-indigo-500/30 border-indigo-400 text-indigo-200'
                                            : 'bg-white/10 hover:bg-white/20 text-white border-white/15'
                                }`}
                                title="خيارات المحضر"
                            >
                                <i className="fa-solid fa-ellipsis-vertical text-sm"></i>
                            </button>

                            {/* Close Button */}
                            <button
                                type="button"
                                onClick={() => {
                                    setSelectedChecklist(null);
                                    setIsReportMenuOpen(false);
                                    setIsDirectEditing(false);
                                }}
                                className="w-8 h-8 rounded-xl bg-white/10 hover:bg-red-500/80 text-white flex items-center justify-center transition text-xs border border-white/10"
                                title="إغلاق"
                            >
                                <i className="fa-solid fa-times text-xs"></i>
                            </button>

                            {/* 3-Dots Dropdown Menu */}
                            {isReportMenuOpen && (
                                <>
                                    <div className="fixed inset-0 z-[1750]" onClick={() => setIsReportMenuOpen(false)}></div>
                                    <div className="absolute left-0 top-10 w-56 bg-slate-900/95 backdrop-blur-xl border border-slate-700 rounded-2xl shadow-2xl p-2 z-[1800] space-y-1.5 text-white animate-scale-in origin-top-left">
                                        <div className="px-2.5 py-1 border-b border-slate-800 flex items-center justify-between">
                                            <span className="text-[10px] font-bold text-slate-400">إجراءات المستند</span>
                                            <i className="fa-solid fa-clipboard-check text-[10px] text-emerald-400"></i>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => handlePrintChecklist(selectedChecklist)}
                                            className="w-full px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-2.5 transition text-xs font-bold text-right shadow-sm"
                                        >
                                            <div className="w-6 h-6 rounded-lg bg-white/20 text-white flex items-center justify-center shrink-0">
                                                <i className="fa-solid fa-file-pdf text-xs"></i>
                                            </div>
                                            <span>طباعة PDF</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => handleOpenInLetterEditor(selectedChecklist)}
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
                                            <span>{isDirectEditing ? 'إنهاء التعديل المباشر' : 'تعديل مباشر'}</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => {
                                                const target = selectedChecklist;
                                                setIsReportMenuOpen(false);
                                                setSelectedChecklist(null);
                                                openEditModal(target);
                                            }}
                                            className="w-full px-3 py-2 rounded-xl bg-slate-800 hover:bg-teal-600 text-white flex items-center gap-2.5 transition text-xs font-bold text-right"
                                        >
                                            <div className="w-6 h-6 rounded-lg bg-teal-500/20 text-teal-300 flex items-center justify-center shrink-0">
                                                <i className="fa-solid fa-list-check text-xs"></i>
                                            </div>
                                            <span>تعديل بيانات النموذج</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => {
                                                const idToDelete = selectedChecklist.id;
                                                setIsReportMenuOpen(false);
                                                setSelectedChecklist(null);
                                                setChecklistToDeleteId(idToDelete);
                                            }}
                                            className="w-full px-3 py-2 rounded-xl bg-slate-800 hover:bg-red-600 text-red-300 hover:text-white flex items-center gap-2.5 transition text-xs font-bold text-right border-t border-slate-700/60 mt-1"
                                        >
                                            <div className="w-6 h-6 rounded-lg bg-red-500/20 text-red-400 flex items-center justify-center shrink-0">
                                                <i className="fa-solid fa-trash-can text-xs"></i>
                                            </div>
                                            <span>حذف المحضر</span>
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Interactive Report Content */}
                    <div className="flex-1 overflow-y-auto bg-slate-50 p-2 sm:p-6">
                        <div className="max-w-5xl mx-auto bg-white rounded-2xl shadow border border-slate-200 p-3 sm:p-6">
                            <InteractiveReportViewer
                                htmlContent={getChecklistHtml(selectedChecklist)}
                                showFloatingEditBar={false}
                                isDirectEditing={isDirectEditing}
                                onDirectEditChange={setIsDirectEditing}
                                onContentChange={(updatedHtml) => {
                                    const updatedItem: Checklist = {
                                        ...selectedChecklist,
                                        htmlContent: updatedHtml
                                    };
                                    setSelectedChecklist(updatedItem);
                                    const updatedList = (checklists || []).map(c =>
                                        c.id === updatedItem.id ? updatedItem : c
                                    );
                                    onUpdateChecklists(updatedList);
                                }}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Create / Edit Interactive QC Model Modal */}
            {isFormOpen && (
                <div className="fixed inset-0 z-[1750] bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-0 sm:p-3 animate-fade-in">
                    <div className="bg-white w-full h-full sm:h-[95vh] sm:max-w-5xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col border border-slate-200 animate-scale-in">
                        {/* Modal Sticky Header */}
                        <div className="bg-slate-900 px-3 py-2 text-white flex justify-between items-center shrink-0 border-b border-slate-800">
                            <div className="flex items-center gap-2 min-w-0">
                                <div className={`w-6 h-6 rounded-lg ${currentDocDef.iconBg} flex items-center justify-center shrink-0`}>
                                    <i className={`fa-solid ${currentDocDef.icon} text-[11px]`}></i>
                                </div>
                                <div className="min-w-0">
                                    <div className="text-[11px] font-bold text-white truncate">
                                        {editingId ? `تعديل ${currentDocDef.shortTitle}` : currentDocDef.fullTitle}
                                    </div>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => setIsFormOpen(false)}
                                className="w-7 h-7 rounded-lg bg-white/10 hover:bg-red-500/80 text-white flex items-center justify-center transition text-xs"
                            >
                                <i className="fa-solid fa-times"></i>
                            </button>
                        </div>

                        <form onSubmit={handleSaveInspection} className="flex-1 overflow-y-auto bg-slate-50 p-2 sm:p-3.5 space-y-2.5">
                            {/* 1. Ready ECP Templates Selector (Shown for IR & MIR or when browsing checklists) */}
                            {(docType === 'IR' || docType === 'MIR' || docType === 'CPP') && (
                                <div className="bg-white p-2.5 rounded-2xl border border-slate-200 shadow-xs">
                                    <div className="flex flex-wrap items-center justify-between gap-1.5 mb-2">
                                        <span className="text-[11px] font-black text-slate-800 flex items-center gap-1">
                                            <i className="fa-solid fa-book-bookmark text-emerald-600 text-[10px]"></i>
                                            <span>قوائم الفحص الكودية الجاهزة ({filteredTemplates.length})</span>
                                        </span>

                                        <div className="flex items-center gap-1.5 flex-1 sm:flex-initial justify-end">
                                            <input
                                                type="text"
                                                value={templateSearch}
                                                onChange={(e) => setTemplateSearch(e.target.value)}
                                                placeholder="بحث في 50+ بند أعمال..."
                                                className="w-28 sm:w-44 px-2 py-1 rounded-lg bg-slate-50 border border-slate-200 text-[10px] font-bold text-slate-800 outline-none focus:border-emerald-500"
                                            />
                                            <select
                                                value={filterCat}
                                                onChange={(e) => setFilterCat(e.target.value)}
                                                className="max-w-[135px] sm:max-w-[190px] px-2 py-1 rounded-lg bg-slate-100 border border-slate-200 text-[10px] font-bold text-slate-800 outline-none truncate"
                                            >
                                                {QC_CATEGORIES.map(c => (
                                                    <option key={c} value={c}>{c}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 max-h-40 overflow-y-auto p-0.5">
                                        {filteredTemplates.map(tpl => (
                                            <button
                                                type="button"
                                                key={tpl.id}
                                                onClick={() => applyTemplate(tpl)}
                                                className={`text-right px-2 py-1.5 rounded-xl border transition flex items-center justify-between gap-1.5 ${
                                                    activityName === tpl.title
                                                        ? 'bg-emerald-50 border-emerald-500 ring-1 ring-emerald-500'
                                                        : 'bg-slate-50/80 hover:bg-emerald-50/40 border-slate-200'
                                                }`}
                                            >
                                                <span className="text-[10px] font-bold text-slate-800 truncate">{tpl.title}</span>
                                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white border border-slate-200 text-emerald-700 shrink-0">
                                                    {tpl.defaultItems.length} بند
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* 2. Metadata Fields */}
                            <div className="bg-white p-2.5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-600 mb-0.5">رقم النموذج ({currentDocDef.codePrefix}) *</label>
                                        <input
                                            type="text"
                                            required
                                            value={refNumber}
                                            onChange={(e) => setRefNumber(e.target.value)}
                                            className="w-full p-1.5 rounded-xl bg-slate-50 border border-slate-300 text-[10.5px] font-black text-slate-900 font-mono text-center"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-600 mb-0.5">التاريخ *</label>
                                        <input
                                            type="date"
                                            required
                                            value={date}
                                            onChange={(e) => setDate(e.target.value)}
                                            className="w-full p-1.5 rounded-xl bg-slate-50 border border-slate-300 text-[10.5px] font-bold text-slate-900 font-mono"
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        <label className="block text-[10px] font-black text-slate-600 mb-0.5">عنوان / بيان النموذج *</label>
                                        <input
                                            type="text"
                                            required
                                            value={activityName}
                                            onChange={(e) => setActivityName(e.target.value)}
                                            placeholder="بيان الأعمال أو المواد أو الموضوع..."
                                            className="w-full p-1.5 rounded-xl bg-slate-50 border border-slate-300 text-[10.5px] font-bold text-slate-900"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-600 mb-0.5">المكان / العنصر الإنشائي</label>
                                        <input
                                            type="text"
                                            value={location}
                                            onChange={(e) => setLocation(e.target.value)}
                                            placeholder="مثال: الدور الأول - محور أ-د"
                                            className="w-full p-1.5 rounded-xl bg-slate-50 border border-slate-300 text-[10.5px] font-bold text-slate-900"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-600 mb-0.5">الحالة / القرار</label>
                                        <select
                                            value={status}
                                            onChange={(e) => setStatus(e.target.value)}
                                            className="w-full p-1.5 rounded-xl bg-slate-50 border border-slate-300 text-[10.5px] font-bold text-slate-900"
                                        >
                                            <option value="Approved">معتمد (Code A)</option>
                                            <option value="ApprovedWithNotes">معتمد بملاحظات (Code B)</option>
                                            <option value="Rejected">مرفوض ويعاد التقديم (Code C)</option>
                                            <option value="Open">قيد الفحص والمتابعة</option>
                                            <option value="Closed">تم الإغلاق وتلافي الملاحظات ✓</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-600 mb-0.5">مهندس التنفيذ (المقاول)</label>
                                        <input
                                            type="text"
                                            value={contractorEngineer}
                                            onChange={(e) => setContractorEngineer(e.target.value)}
                                            placeholder="اسم مهندس التنفيذ"
                                            className="w-full p-1.5 rounded-xl bg-slate-50 border border-slate-300 text-[10.5px] font-bold text-slate-900"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-black text-slate-600 mb-0.5">المهندس الاستشاري المشرف</label>
                                        <input
                                            type="text"
                                            value={consultantEngineer}
                                            onChange={(e) => setConsultantEngineer(e.target.value)}
                                            placeholder="اسم المهندس الاستشاري"
                                            className="w-full p-1.5 rounded-xl bg-slate-50 border border-slate-300 text-[10.5px] font-bold text-slate-900"
                                        />
                                    </div>
                                </div>

                                {/* Specialized Extra Inputs depending on QC Model Type */}
                                {docType === 'NCR' && (
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-100">
                                        <div>
                                            <label className="block text-[10px] font-black text-red-700 mb-0.5">السبب الجذري لعدم المطابقة (Root Cause)</label>
                                            <input
                                                type="text"
                                                value={docFields.rootCause || ''}
                                                onChange={(e) => updateDocField('rootCause', e.target.value)}
                                                placeholder="مثال: عدم استخدام هزاز ميكانيكي / مخالفة اللوحة..."
                                                className="w-full p-1.5 rounded-xl bg-red-50/40 border border-red-200 text-[10px] font-bold text-slate-900"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-emerald-700 mb-0.5">الإجراء التصحيحي المطلوب (Corrective Action)</label>
                                            <input
                                                type="text"
                                                value={docFields.correctiveAction || ''}
                                                onChange={(e) => updateDocField('correctiveAction', e.target.value)}
                                                placeholder="مثال: تكسير الجزء المعشش والمعالجة بجراوت معتمد..."
                                                className="w-full p-1.5 rounded-xl bg-emerald-50/40 border border-emerald-200 text-[10px] font-bold text-slate-900"
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-1.5">
                                            <div>
                                                <label className="block text-[10px] font-black text-slate-600 mb-0.5">درجة الخطورة</label>
                                                <select
                                                    value={docFields.severity || 'جوهرية (Major)'}
                                                    onChange={(e) => updateDocField('severity', e.target.value)}
                                                    className="w-full p-1.5 rounded-xl bg-slate-50 border border-slate-300 text-[10px] font-bold text-slate-900"
                                                >
                                                    <option value="جوهرية (Major)">جوهرية (Major)</option>
                                                    <option value="حرجة (Critical)">حرجة (Critical)</option>
                                                    <option value="بسيطة (Minor)">بسيطة (Minor)</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-black text-slate-600 mb-0.5">مهلة التلافي</label>
                                                <input
                                                    type="text"
                                                    value={docFields.dueDate || ''}
                                                    onChange={(e) => updateDocField('dueDate', e.target.value)}
                                                    placeholder="مثال: 48 ساعة"
                                                    className="w-full p-1.5 rounded-xl bg-slate-50 border border-slate-300 text-[10px] font-bold text-slate-900"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {docType === 'MIR' && (
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-100">
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-600 mb-0.5">اسم المورد / المصنع</label>
                                            <input
                                                type="text"
                                                value={docFields.supplierName || ''}
                                                onChange={(e) => updateDocField('supplierName', e.target.value)}
                                                placeholder="مثال: حديد عز / السويدي / سيكا..."
                                                className="w-full p-1.5 rounded-xl bg-slate-50 border border-slate-300 text-[10px] font-bold text-slate-900"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-600 mb-0.5">الكمية الموردة ورقم التشغيلة (Batch)</label>
                                            <input
                                                type="text"
                                                value={docFields.batchQuantity || ''}
                                                onChange={(e) => updateDocField('batchQuantity', e.target.value)}
                                                placeholder="مثال: 30 طن قطر 16 مم - لوط #452"
                                                className="w-full p-1.5 rounded-xl bg-slate-50 border border-slate-300 text-[10px] font-bold text-slate-900"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-600 mb-0.5">رقم اعتماد المادة (MAR Ref)</label>
                                            <input
                                                type="text"
                                                value={docFields.marRef || ''}
                                                onChange={(e) => updateDocField('marRef', e.target.value)}
                                                placeholder="مثال: MAR-012"
                                                className="w-full p-1.5 rounded-xl bg-slate-50 border border-slate-300 text-[10px] font-bold text-slate-900"
                                            />
                                        </div>
                                    </div>
                                )}

                                {docType === 'CPP' && (
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-100">
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-600 mb-0.5">رتبة الخرسانة ونوع الأسمنت</label>
                                            <input
                                                type="text"
                                                value={docFields.concreteGrade || ''}
                                                onChange={(e) => updateDocField('concreteGrade', e.target.value)}
                                                placeholder="مثال: 350 كجم/سم2 - أسمنت عادي CEM I"
                                                className="w-full p-1.5 rounded-xl bg-slate-50 border border-slate-300 text-[10px] font-bold text-slate-900"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-600 mb-0.5">الكمية التقديرية للصب (م3)</label>
                                            <input
                                                type="text"
                                                value={docFields.pourVolume || ''}
                                                onChange={(e) => updateDocField('pourVolume', e.target.value)}
                                                placeholder="مثال: 125 م3"
                                                className="w-full p-1.5 rounded-xl bg-slate-50 border border-slate-300 text-[10px] font-bold text-slate-900"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-600 mb-0.5">محطة الخرسانة الجاهزة وطريقة الصب</label>
                                            <input
                                                type="text"
                                                value={docFields.batchPlant || ''}
                                                onChange={(e) => updateDocField('batchPlant', e.target.value)}
                                                placeholder="اسم المحطة + مضخة 42 متر"
                                                className="w-full p-1.5 rounded-xl bg-slate-50 border border-slate-300 text-[10px] font-bold text-slate-900"
                                            />
                                        </div>
                                    </div>
                                )}

                                {docType === 'ITR' && (
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-100">
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-600 mb-0.5">جهة الاختبار / المعمل / الجهاز</label>
                                            <input
                                                type="text"
                                                value={docFields.labName || ''}
                                                onChange={(e) => updateDocField('labName', e.target.value)}
                                                placeholder="مثال: معمل كلية الهندسة / Sand Cone..."
                                                className="w-full p-1.5 rounded-xl bg-slate-50 border border-slate-300 text-[10px] font-bold text-slate-900"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-600 mb-0.5">القيمة القياسية المطلوبة بالكود</label>
                                            <input
                                                type="text"
                                                value={docFields.requiredValue || ''}
                                                onChange={(e) => updateDocField('requiredValue', e.target.value)}
                                                placeholder="مثال: دمك ≥ 95% / ضغط 10 بار / 350 كجم/سم2"
                                                className="w-full p-1.5 rounded-xl bg-slate-50 border border-slate-300 text-[10px] font-bold text-slate-900"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-emerald-700 mb-0.5">النتيجة الفعلية المسجلة</label>
                                            <input
                                                type="text"
                                                value={docFields.actualValue || ''}
                                                onChange={(e) => updateDocField('actualValue', e.target.value)}
                                                placeholder="مثال: 97.4% (ناجح ومطابق)"
                                                className="w-full p-1.5 rounded-xl bg-emerald-50/40 border border-emerald-200 text-[10px] font-bold text-slate-900"
                                            />
                                        </div>
                                    </div>
                                )}

                                {docType === 'SI' && (
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-100">
                                        <div className="sm:col-span-2">
                                            <label className="block text-[10px] font-black text-amber-800 mb-0.5">نص أمر الموقع / التعليمات التنفيذية الصادرة للمقاول</label>
                                            <input
                                                type="text"
                                                value={docFields.instructionDetails || ''}
                                                onChange={(e) => updateDocField('instructionDetails', e.target.value)}
                                                placeholder="اكتب التوجيه الفني أو التعديل المطلوب تنفيذه بالموقع..."
                                                className="w-full p-1.5 rounded-xl bg-amber-50/40 border border-amber-200 text-[10px] font-bold text-slate-900"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-600 mb-0.5">المهلة المحددة للتنفيذ</label>
                                            <input
                                                type="text"
                                                value={docFields.dueDate || ''}
                                                onChange={(e) => updateDocField('dueDate', e.target.value)}
                                                placeholder="مثال: خلال 72 ساعة"
                                                className="w-full p-1.5 rounded-xl bg-slate-50 border border-slate-300 text-[10px] font-bold text-slate-900"
                                            />
                                        </div>
                                    </div>
                                )}

                                {docType === 'MOM' && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-600 mb-0.5">الحاضرون في الاجتماع</label>
                                            <input
                                                type="text"
                                                value={docFields.attendees || ''}
                                                onChange={(e) => updateDocField('attendees', e.target.value)}
                                                placeholder="ممثل المالك، الاستشاري، مدير المشروع، مهندسو التنفيذ..."
                                                className="w-full p-1.5 rounded-xl bg-slate-50 border border-slate-300 text-[10px] font-bold text-slate-900"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-600 mb-0.5">جدول أعمال الاجتماع</label>
                                            <input
                                                type="text"
                                                value={docFields.agenda || ''}
                                                onChange={(e) => updateDocField('agenda', e.target.value)}
                                                placeholder="متابعة البرنامج الزمني، الاعتمادات، معوقات التنفيذ..."
                                                className="w-full p-1.5 rounded-xl bg-slate-50 border border-slate-300 text-[10px] font-bold text-slate-900"
                                            />
                                        </div>
                                    </div>
                                )}

                                {docType === 'RFI' && (
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-100">
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-600 mb-0.5">نص الاستفسار الفني / التعارض</label>
                                            <input
                                                type="text"
                                                value={docFields.rfiQuestion || ''}
                                                onChange={(e) => updateDocField('rfiQuestion', e.target.value)}
                                                placeholder="تفاصيل الاستفسار أو التعارض بين اللوحات..."
                                                className="w-full p-1.5 rounded-xl bg-slate-50 border border-slate-300 text-[10px] font-bold text-slate-900"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-600 mb-0.5">الحل المقترح من المقاول</label>
                                            <input
                                                type="text"
                                                value={docFields.proposedSolution || ''}
                                                onChange={(e) => updateDocField('proposedSolution', e.target.value)}
                                                placeholder="الاقتراح الفني للتنفيذ..."
                                                className="w-full p-1.5 rounded-xl bg-slate-50 border border-slate-300 text-[10px] font-bold text-slate-900"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-emerald-700 mb-0.5">رد وقرار المهندس الاستشاري</label>
                                            <input
                                                type="text"
                                                value={docFields.consultantReply || ''}
                                                onChange={(e) => updateDocField('consultantReply', e.target.value)}
                                                placeholder="الرد الهندسي المعتمد..."
                                                className="w-full p-1.5 rounded-xl bg-emerald-50/40 border border-emerald-200 text-[10px] font-bold text-slate-900"
                                            />
                                        </div>
                                    </div>
                                )}

                                {docType === 'SAM' && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-600 mb-0.5">الشركة المنتجة / الماركة التجارية</label>
                                            <input
                                                type="text"
                                                value={docFields.brandName || ''}
                                                onChange={(e) => updateDocField('brandName', e.target.value)}
                                                placeholder="مثال: كليوباترا / جوتن / سيكا / السويدي..."
                                                className="w-full p-1.5 rounded-xl bg-slate-50 border border-slate-300 text-[10px] font-bold text-slate-900"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-600 mb-0.5">مواصفات العينة / رقم الكود واللون</label>
                                            <input
                                                type="text"
                                                value={docFields.sampleSpecs || ''}
                                                onChange={(e) => updateDocField('sampleSpecs', e.target.value)}
                                                placeholder="مثال: بورسلين 60×60 سم فرز أول - كود #204"
                                                className="w-full p-1.5 rounded-xl bg-slate-50 border border-slate-300 text-[10px] font-bold text-slate-900"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* 3. Interactive Checklist Items (Status Buttons Strictly in One Row) */}
                            <div className="bg-white p-2.5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="text-[11px] font-black text-slate-800 flex items-center gap-1">
                                        <i className="fa-solid fa-list-check text-emerald-600 text-[10px]"></i>
                                        <span>
                                            {docType === 'MOM'
                                                ? `جدول القرارات والتكليفات (${qcItems.length})`
                                                : `بنود الفحص والمطابقة الكودية (${qcItems.length})`}
                                        </span>
                                    </span>

                                    <button
                                        type="button"
                                        onClick={() => setQcItems(prev => prev.map(i => ({ ...i, result: 'pass' })))}
                                        className="px-2 py-0.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-[9.5px] font-bold transition"
                                    >
                                        تحديد الكل مطابق ✓
                                    </button>
                                </div>

                                <div className="space-y-1.5 max-h-80 overflow-y-auto pr-0.5">
                                    {qcItems.map((item, idx) => (
                                        <div
                                            key={item.id}
                                            className="p-2 rounded-xl border border-slate-200 bg-slate-50/70 space-y-1.5"
                                        >
                                            {/* Row 1: Item Number + Criterion + ECP Standard + Delete Icon */}
                                            <div className="flex items-start justify-between gap-1.5">
                                                <div className="flex items-start gap-1.5 flex-1 min-w-0">
                                                    <span className="w-4 h-4 rounded bg-slate-200 text-slate-700 text-[9.5px] font-black flex items-center justify-center shrink-0 mt-0.5">
                                                        {idx + 1}
                                                    </span>
                                                    <div className="flex-1 min-w-0">
                                                        <input
                                                            type="text"
                                                            value={item.criterion}
                                                            onChange={(e) => {
                                                                const val = e.target.value;
                                                                setQcItems(prev => prev.map((it, i) => i === idx ? { ...it, criterion: val } : it));
                                                            }}
                                                            className="w-full bg-transparent text-[10.5px] font-bold text-slate-900 outline-none focus:bg-white focus:px-1 rounded"
                                                        />
                                                        <div className="text-[9px] text-slate-500 font-semibold">
                                                            المعيار: {item.ecpStandard}
                                                        </div>
                                                    </div>
                                                </div>

                                                <button
                                                    type="button"
                                                    onClick={() => setQcItems(prev => prev.filter((_, i) => i !== idx))}
                                                    className="w-5 h-5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 flex items-center justify-center text-[9.5px] shrink-0"
                                                    title="حذف البند"
                                                >
                                                    <i className="fa-solid fa-times"></i>
                                                </button>
                                            </div>

                                            {/* Row 2: The 4 Status Buttons Strictly in ONE Single Row + Compact Note Input */}
                                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5">
                                                <div className="grid grid-cols-4 gap-1 flex-1">
                                                    {(
                                                        [
                                                            { key: 'pass', label: 'مطابق ✓', activeClass: 'bg-emerald-600 text-white border-emerald-600' },
                                                            { key: 'note', label: 'بملاحظة ⚠', activeClass: 'bg-amber-500 text-white border-amber-500' },
                                                            { key: 'fail', label: 'مرفوض ✗', activeClass: 'bg-red-600 text-white border-red-600' },
                                                            { key: 'na', label: 'لا ينطبق', activeClass: 'bg-slate-600 text-white border-slate-600' }
                                                        ] as { key: QCItemResult; label: string; activeClass: string }[]
                                                    ).map(opt => (
                                                        <button
                                                            type="button"
                                                            key={opt.key}
                                                            onClick={() =>
                                                                setQcItems(prev =>
                                                                    prev.map((it, i) => (i === idx ? { ...it, result: opt.key } : it))
                                                                )
                                                            }
                                                            className={`py-1 px-1 rounded-lg text-[9.5px] font-bold border transition whitespace-nowrap text-center flex items-center justify-center ${
                                                                item.result === opt.key
                                                                    ? opt.activeClass
                                                                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                                                            }`}
                                                        >
                                                            {opt.label}
                                                        </button>
                                                    ))}
                                                </div>

                                                <input
                                                    type="text"
                                                    value={item.notes}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        setQcItems(prev => prev.map((it, i) => i === idx ? { ...it, notes: val } : it));
                                                    }}
                                                    placeholder="ملاحظة البند (اختياري)..."
                                                    className="w-full sm:w-44 px-2 py-1 rounded-lg bg-white border border-slate-200 text-[9.5px] font-bold text-slate-800 outline-none focus:border-emerald-500"
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Add Custom Checklist Row */}
                                <div className="flex flex-col sm:flex-row gap-1.5 pt-1.5 border-t border-slate-100">
                                    <input
                                        type="text"
                                        value={newItemCriterion}
                                        onChange={(e) => setNewItemCriterion(e.target.value)}
                                        placeholder="إضافة بند فحص أو قرار إضافي مخصص..."
                                        className="flex-1 p-1.5 rounded-xl bg-slate-50 border border-slate-200 text-[10px] font-bold text-slate-900 outline-none"
                                    />
                                    <input
                                        type="text"
                                        value={newItemStandard}
                                        onChange={(e) => setNewItemStandard(e.target.value)}
                                        placeholder="المعيار الكودي / الجهة المسؤولة..."
                                        className="sm:w-48 p-1.5 rounded-xl bg-slate-50 border border-slate-200 text-[10px] font-bold text-slate-900 outline-none"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleAddCustomItem}
                                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-[10px] font-bold shrink-0"
                                    >
                                        + إضافة بند
                                    </button>
                                </div>
                            </div>

                            {/* 4. Photos & General Consultant Notes */}
                            <div className="bg-white p-2.5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
                                <div className="flex items-center justify-between">
                                    <label className="text-[10.5px] font-black text-slate-700">التوصيات والقرار النهائي (اختياري)</label>
                                    <div className="flex items-center gap-1.5">
                                        <button
                                            type="button"
                                            onClick={() => cameraInputRef.current?.click()}
                                            disabled={isUploadingPhoto}
                                            className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 border border-slate-200 text-[9.5px] font-bold flex items-center gap-1"
                                        >
                                            <i className="fa-solid fa-camera"></i>
                                            <span>تصوير</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => photoInputRef.current?.click()}
                                            disabled={isUploadingPhoto}
                                            className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 border border-slate-200 text-[9.5px] font-bold flex items-center gap-1"
                                        >
                                            <i className="fa-regular fa-image"></i>
                                            <span>صور ({photos.length})</span>
                                        </button>
                                        <input type="file" ref={photoInputRef} onChange={handlePhotoSelect} accept="image/*" multiple className="hidden" />
                                        <input type="file" ref={cameraInputRef} onChange={handlePhotoSelect} accept="image/*" capture="environment" className="hidden" />
                                    </div>
                                </div>

                                <input
                                    type="text"
                                    value={generalNotes}
                                    onChange={(e) => setGeneralNotes(e.target.value)}
                                    placeholder="ملاحظات عامة أو توصيات الاعتماد..."
                                    className="w-full p-1.5 rounded-xl bg-slate-50 border border-slate-300 text-[10.5px] font-bold text-slate-900 outline-none"
                                />

                                {photos.length > 0 && (
                                    <div className="flex gap-2 overflow-x-auto py-1">
                                        {photos.map((img, i) => (
                                            <div key={i} className="relative w-14 h-14 rounded-xl overflow-hidden border border-slate-200 shrink-0">
                                                <img src={img} alt="" className="w-full h-full object-cover" />
                                                <button
                                                    type="button"
                                                    onClick={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))}
                                                    className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-red-600 text-white text-[8px] flex items-center justify-center"
                                                >
                                                    <i className="fa-solid fa-times"></i>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    className="w-full py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-md transition flex items-center justify-center gap-1.5"
                                >
                                    <i className="fa-solid fa-file-circle-check"></i>
                                    <span>حفظ وإصدار {currentDocDef.shortTitle}</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {checklistToDeleteId && (
                <div className="fixed inset-0 z-[1850] bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white p-5 rounded-2xl shadow-xl w-full max-w-xs text-center animate-scale-in">
                        <div className="w-11 h-11 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-2.5 text-lg">
                            <i className="fa-solid fa-trash"></i>
                        </div>
                        <h4 className="font-bold text-sm mb-1 text-slate-800">حذف المستند؟</h4>
                        <p className="text-[11px] text-slate-500 mb-4">سيتم حذف المستند نهائياً من سجل المشروع.</p>
                        <div className="flex gap-2.5">
                            <button
                                type="button"
                                onClick={confirmDeleteChecklist}
                                className="flex-1 bg-red-600 text-white py-2 rounded-xl text-xs font-bold hover:bg-red-700 transition"
                            >
                                حذف
                            </button>
                            <button
                                type="button"
                                onClick={() => setChecklistToDeleteId(null)}
                                className="flex-1 bg-slate-100 text-slate-700 py-2 rounded-xl text-xs font-bold hover:bg-slate-200 transition"
                            >
                                إلغاء
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProjectQCTab;
