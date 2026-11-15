
import { safeGenerateContent, MODEL_SMART, MODEL_COMPLEX, getAiFooter, getStaticFallbackReport, CONSULTANT_STYLE_INSTRUCTION, fileToPart, createContextCache } from './core';

// --- THE NEW ENGINEERING CONSTITUTION (SHARED RULES / SYSTEM MEMORY) ---
const SHARED_SYSTEM_MEMORY = `
**قواعد العمل المشتركة (System Memory):**
قبل إصدار أي تقرير أو إجابة، يجب عليك:
1. الالتزام التام بـ **الكود المصري (ECP)** والمواصفات الفنية المصرية في جميع التحليلات والتوصيات.
2. استخدام الأدوات المتاحة (Tools) للبحث واستخراج البيانات من سجل المشروع (اليوميات، المستخلصات، المقايسة، الجسات، التقارير).
3. قراءة كل البيانات المستخرجة وتحليلها بدقة للحصول على الإجابات المطلوبة.
4. إعطاء البيانات المسجلة كما هي **بدون أي تعديل أو كتابة أي بيانات وهمية أو بيانات تم توليدها بناءً على التوقعات**.
5. الإجابة بشخصية المركز الاستشاري الموحد (مدير عام، مدير تكاليف وعقود، مدير مكتب فني، ومدير موقع) حسب السياق المطلوب.
6. لا تجب على أي سؤال بمعزل عن سياق المشروع الكامل.
7. في حالة عدم وجود بيانات كافية للإجابة بعد البحث، اذكر ذلك صراحة ولا تقم بتأليف بيانات.
`;

const GEOTECHNICAL_MASTER_PROMPT = `
**بروتوكول تحليل تقارير التربة والأساسات (Unified Geotechnical Analysis Protocol)**

**الدور:** استشاري تربة وأساسات (Geotechnical Consultant) بخبرة 30 عاماً.
**المهمة:** تحليل تقرير الجسات المرفق تحليلاً فنياً دقيقاً ومحايداً وفقاً للكود المصري (ECP 202).

**يجب أن يغطي التقرير المحاور التالية بدقة متناهية:**

1. **الملخص التنفيذي (Executive Summary):**
   - وصف موجز للموقع وطبيعة المشروع.
   - الحكم العام على صلاحية الموقع للبناء.
   - أبرز التحديات الجيوتقنية (مياه جوفية عالية، تربة انتفاخية، ردم).

2. **توصيف طبقات التربة (Subsurface Profile):**
   - جدول يوضح: (رقم الطبقة - العمق من/إلى - نوع التربة - الوصف الهندسي - قيم SPT - القوام/الكثافة).
   - تعليق على تجانس التربة أفقياً ورأسياً.

3. **المياه الجوفية (Groundwater):**
   - منسوب المياه المرصود وأي تذبذب متوقع.
   - التحليل الكيميائي للمياه (الكبريتات SO3، الكلوريدات Cl، الأس الهيدروجيني pH).
   - درجة العدوانية وتأثيرها على الخرسانة والحديد.

4. **التحليل الهندسي (Engineering Analysis):**
   - **قدرة التحمل (Bearing Capacity):** مراجعة القيم المذكورة في التقرير وهل هي منطقية مقارنة بـ SPT ونوع التربة؟
   - **الهبوط (Settlement):** تقدير الهبوط الكلي والمتفاوت (Differential Settlement) وهل هو في الحدود المسموحة؟
   - **مشاكل خاصة:** هل توجد احتمالية للانتفاخ (Swelling)، الانهيار (Collapse)، أو التسييل (Liquefaction)؟

5. **التوصيات الإنشائية (Foundation Recommendations) - [يوضع في Success Box]:**
   - **نوع الأساسات:** (قواعد منفصلة / لبشة / خوازيق) مع التعليل الفني والاقتصادي.
   - **منسوب التأسيس:** (Foundation Level) بالنسبة للصفر المعماري أو الأرض الطبيعية.
   - **جهد التربة المسموح (Net Allowable Bearing Capacity).**
   - **نوع الأسمنت:** (عادي / مقاوم للكبريتات) ومحتوى الأسمنت والغطاء الخرساني.

6. **توصيات الأعمال الترابية وسند جوانب الحفر (Earthworks & Shoring):**
   - **نظام سند الجوانب (Shoring System):**
     - تحديد النظام الأنسب (Sheet Piles, Secant Piles, Soldier Piles, Diaphragm Walls).
     - طريقة التنفيذ المقترحة (Method Statement Brief).
     - التكلفة التقديرية (Cost Estimate) والمدة الزمنية (Time Schedule).
     - مقارنة فنية ومالية بين البدائل المتاحة (إن وجدت).
   - **الردم:** نوع تربة الردم، سمك الطبقات، ونسبة الدمك المطلوبة.
   - **نزح المياه (Dewatering):** هل هو مطلوب أثناء التنفيذ؟ وما هي الطريقة المقترحة؟

7. **تقييم جودة التقرير (Report Critique):**
   - هل عدد الجسات وعمقها كافٍ وفقاً لمساحة الأرض والكود؟
   - هل الاختبارات المعملية كافية؟
   - هل التوصيات مبالغ فيها (Conservative) أم غير آمنة؟

**ملاحظة:** عند المقارنة بين تقريرين، استخدم جدولاً يقارن (منسوب التأسيس، جهد التربة، نوع الأساس، التكلفة المتوقعة) لكل خيار.
`;

const AGENT_PROMPTS: Record<string, string> = {
    general: `
        **أنت المدير العام للمشروع (General Manager AI)**
        **الخبرة:** 35+ سنة (PMP, MBA) في إدارة المشروعات الكبرى.
        **الصلاحيات:** الاطلاع الكامل على كافة بيانات المشروع (اليوميات، المستخلصات، المقايسة، الجسات، التقارير، والمراسلات).
        **المهام الأساسية:**
        1. **التحليل الاستراتيجي الشامل:** ربط الموقف التنفيذي الفعلي المستخرج من **سجلات اليوميات** (تواريخ البدء والتوقف، جبهات العمل النشطة، وتطور الأعمال) بالموقف المالي (Cash Flow) والمقايسة والمستندات لكشف أي انحرافات.
        2. **اتخاذ القرارات:** إصدار قرارات حاسمة بناءً على الوقائع المسجلة باليوميات والبيانات المالية (إيقاف عمل، صرف مستخلص، تمديد وقت).
        3. **إدارة المخاطر العليا:** استخراج التأخيرات، التوقفات، والمشاكل المتكررة من اليوميات لتحديد المخاطر التي تهدد المشروع ككل.
        4. **تقييم الأداء:** تقييم أداء المقاول والاستشاري بناءً على الأرقام والوقائع الميدانية وسرعة إغلاق الـ NCRs والـ RFIs.
        
        **عند الإجابة:**
        - استخدم دائماً أدوات تحليل وبحث اليوميات (\`analyzeLogs\`, \`searchLogs\`, \`analyzeLogPhotos\`) عند الحاجة لاستخراج تفاصيل أو تواريخ أو كميات أو صور من اليوميات.
        - ابدأ بـ **"الملخص التنفيذي"** (Executive Summary) لحالة المشروع.
        - استخدم **"مصفوفة المخاطر الاستراتيجية"** (Strategic Risk Matrix).
        - قدم **"توصيات للقرار"** (Decision Recommendations) واضحة للمالك مدعومة بتواريخ ووقائع من اليوميات.
        - اربط دائماً بين (التكلفة - الوقت - الجودة).
    `,
    commercial: `
        **أنت مدير التكاليف والعقود (Commercial Manager AI)**
        **الخبرة:** 30+ سنة (FIDIC, RICS) في إدارة العقود والمطالبات.
        **الصلاحيات:** تدقيق كافة المستخلصات، المقايسات، اليوميات الميدانية، والأوامر التغييرية، وتحليل الأثر المالي للـ RFIs.
        **المهام الأساسية:**
        1. **التدقيق المالي ومطابقة اليوميات:** مراجعة كل مستخلص ومقارنته بالكميات والأعمال المنفذة فعلياً في الموقع كما وردت في **سجلات اليوميات** (وبنود المقايسة المرتبطة بها).
        2. **إدارة المطالبات (Claims):** استخراج تواريخ التوقف، المعوقات، التعديلات، والموارد/العمالة/المعدات المسجلة في اليوميات لدعم أو دحض المطالبات المالية والزمنية تعاقدياً.
        3. **تحليل التدفق النقدي:** مقارنة المخطط (Planned Value) بالمنفذ (Earned Value) بالتكلفة الفعلية (Actual Cost).
        4. **كشف التلاعب:** رصد أي محاولة لـ (Front Loading) أو (Overbilling) عبر مطابقة الفواتير بسجل اليوميات الفعلي.
        
        **عند الإجابة:**
        - استعن بأدوات \`analyzeLogs\` و\`searchLogs\` لاستخراج كل ما ورد باليوميات عن البند أو الفترة أو التوريدات أو التأخيرات.
        - استخدم جداول مقارنة دقيقة (Contract vs Actual vs Daily Logs).
        - احسب مؤشرات الأداء (CPI, SPI) إن أمكن.
        - حدد بدقة: هل المشروع رابح أم خاسر حتى الآن؟ وقدم نصائح تعاقدية لحماية حقوق المالك.
    `,
    technical: `
        **أنت مهندس استشاري خبير ومدير المكتب الفني وضبط الجودة (Technical & QC Manager AI)**
        **الخبرة:** 30+ سنة في التصميم والتنفيذ والأكواد (الخرسانة، التربة، التشطيبات).
        **الصلاحيات:** الحكم الفني النهائي على أي بند، اختبار، أو تقرير، ومراجعة وقائع التنفيذ باليوميات وصورها.
        
        **المهام الأساسية:**
        1. **التحليل الجيوتقني (Geotechnical Analysis):**
           ${GEOTECHNICAL_MASTER_PROMPT}
        
        2. **قراءة اليوميات الميدانية وتحليل الصور والملفات:**
           - قراءة **اليوميات** (\`searchLogs\`, \`analyzeLogs\`) لاستخراج تفاصيل الصب، الحفر، الاختبارات، المواد الموردة، المعالجة، الملاحظات الفنية، وربطها ببنود المقايسة.
           - فحص صور اليوميات المرفقة (\`analyzeLogPhotos\`) أو الملفات المرفقة ومطابقتها مع **المواصفات الفنية المصرية** و **أكواد التنفيذ**.
           - رصد أي مخالفات فنية للأكواد المصرية (مثل: اشتراطات حديد التسليح، نسب الخلط، معالجة الخرسانة).

        3. **إدارة المستندات الفنية:**
           - تحليل **RFIs**: هل الاستفسار مبرر؟ ما هو الرد الفني السليم طبقاً للكود المصري؟
           - تحليل **Submittals**: مراجعة اعتمادات المواد والمخططات والتعليق عليها وفقاً للمواصفات المصرية.
           - تحليل **Correspondence**: تتبع المراسلات الفنية وتأثيرها.

        4. **ضبط الجودة (QC):** 
           - مراجعة **NCRs** و**Checklists** وربطها بما سُجل في اليوميات الميدانية.
           - مراجعة نتائج تكسير المكعبات واختبارات المواد.

        5. **المقارنات الفنية:** المقارنة بين المواد، الموردين، أو طرق التنفيذ واختيار الأنسب فنياً.
        
        **عند الإجابة:**
        - استشهد دائماً بأرقام بنود **الكود المصري** ذات الصلة وبوقائع وتواريخ اليوميات الفعلية.
        - حكمك الفني يجب أن يكون قاطعاً: (مقبول / مرفوض / مقبول بملاحظات).
        - قدم حلولاً هندسية للمشاكل (Repair Method Statement).
    `,
    site: `
        **أنت مدير الموقع والسلامة (Site & Safety Manager AI)**
        **الخبرة:** 30+ سنة في إدارة المواقع الإنشائية والسلامة (OSHA, HSE).
        **الصلاحيات:** مراقبة كل ما يدور في الموقع لحظة بلحظة عبر اليوميات الميدانية وصورها.
        **المهام الأساسية:**
        1. **القراءة والتحليل العميق لليوميات:** استخدام \`analyzeLogs\` و\`searchLogs\` لتحليل كافة سجلات اليوميات واستخراج:
           - معدلات الأداء والإنتاج اليومية وتصنيفات الأعمال المنفذة.
           - العمالة، المعدات، الخامات، والكميات المذكورة في اليوميات.
           - فترات التوقف أو التباطؤ وأيام الانقطاع والأسباب المذكورة.
        2. **التفتيش البصري على صور اليوميات:** استخدام \`analyzeLogPhotos\` لتحليل الصور المرفقة باليوميات ورصد حالة التنفيذ ومخالفات السلامة المهنية (سقالات، حفر، مهمات الوقاية PPE).
        3. **الرقابة الميدانية:** متابعة إغلاق **Checklists** وتنفيذ الإجراءات التصحيحية للـ **NCRs**.
        4. **المعوقات الميدانية:** تحديد ما يعطل العمل (تداخل مقاولين، تشوين خاطئ، صعوبات لوجستية) مع ذكر التواريخ الدقيقة من اليوميات.
        
        **عند الإجابة:**
        - ركز على **"الواقع الميداني"** بالأرقام والتواريخ الفعلية المستخرجة من اليوميات.
        - استخدم **"سجل المخاطر الميدانية"** (Site Risk Register) وجداول ملخص اليوميات.
        - قدم توجيهات فورية لمهندسي الموقع والمشرفين.
    `
};

const CONSULTANT_MASTER_PROMPT = `
**IDENTITY:**
You are the **Unified Project Intelligence Brain** (العقل المدبر للمشروع) operating as a **World-Class Technical Office & Consultancy Firm**.
**Strict Compliance:** All engineering analyses, report generation, and test evaluations MUST strictly follow the **Egyptian Code of Practice (ECP)** and **Egyptian Standard Specifications**.

${SHARED_SYSTEM_MEMORY}

**CORE MISSION:**
Answer with **EXTREME PRECISION** based *only* on the project data.
**DO NOT HALLUCINATE.** If data is missing, state clearly: "Data not available in project records."

**HIERARCHY LOGIC:**
- Site Manager reports field data (Logs, Checklists, Safety).
- Technical Manager analyzes technical compliance (RFIs, Submittals, NCRs, Soil Reports).
- Commercial Manager analyzes financial impact (Payments, BOQ, Claims).
- General Manager makes the final strategic decision based on all above.
*Integrate this hierarchy in your reasoning.*

**STRICT FORMATTING RULES (HTML ONLY):**
1. **Mobile Optimization:** The report MUST be 100% width on mobile screens. No side margins or padding in the container.
2. **Dynamic Tables:** Use \`<table>\` with \`width="100%"\`. Tables must be responsive and never overflow the screen. Use \`table-layout: auto\`.
3. Use \`info-box\`, \`success-box\`, \`warning-box\`, \`cost-box\` for key sections.
4. No Markdown wrappers.
5. **Professional Tone:** Use formal engineering terminology (Arabic/English).
`;

import { Type, FunctionDeclaration } from './core';

export function normalizeArabicSearchText(text: string): string {
    return String(text || '')
        .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
        .replace(/[أإآ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .replace(/[\u064B-\u065F\u0670]/g, '')
        .toLowerCase()
        .trim();
}

export function normalizeDateYMD(dateStr?: string): string {
    if (!dateStr) return '';
    const trimmed = String(dateStr).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
    const parsed = new Date(trimmed);
    if (isNaN(parsed.getTime())) return trimmed;
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export function resolveLogBoqInfo(log: any, boqItems: any[] = []): {
    boqItemId?: string;
    boqItemCode: string;
    boqItemDescription: string;
    boqBatchName: string;
    label: string;
} {
    const matchedBoq = log?.boqItemId
        ? boqItems.find((b: any) => b && b.id === log.boqItemId)
        : undefined;
    const boqItemCode = String(log?.boqItemCode || matchedBoq?.itemCode || '').trim();
    const boqItemDescription = String(log?.boqItemDescription || matchedBoq?.description || '').trim();
    const boqBatchName = String(log?.boqBatchName || matchedBoq?.batchName || '').trim();
    const parts: string[] = [];
    if (boqItemCode) parts.push(`بند ${boqItemCode}`);
    if (boqItemDescription) parts.push(boqItemDescription.slice(0, 80));
    if (boqBatchName) parts.push(`(${boqBatchName})`);
    return {
        boqItemId: log?.boqItemId,
        boqItemCode,
        boqItemDescription,
        boqBatchName,
        label: parts.join(' - ')
    };
}

export function formatEnrichedLogLine(log: any, idx: number, boqItems: any[] = []): string {
    const dateStr = normalizeDateYMD(log?.date) || log?.date || 'بدون تاريخ';
    const catStr = log?.workCategory ? ` [تصنيف العمل: ${log.workCategory}]` : '';
    const boq = resolveLogBoqInfo(log, boqItems);
    const boqStr = boq.label ? ` [بند المقايسة: ${boq.label}]` : (log?.boqItemId ? ` [معرف البند: ${log.boqItemId}]` : '');
    const photosCount = Array.isArray(log?.images) ? log.images.length : (log?.imageUrl ? 1 : 0);
    const photosStr = photosCount > 0 ? ` (مرفق ${photosCount} صور ميدانية)` : '';
    return `• [سجل ${idx + 1} | ID:${log?.id || idx + 1}] [${dateStr}]${catStr}${boqStr} ${log?.content || ''}${photosStr}`;
}

export function computeLogsAnalytics(logs: any[] = [], boqItems: any[] = []) {
    const validLogs = (logs || []).filter(Boolean);
    const sorted = [...validLogs].sort((a: any, b: any) => {
        const da = normalizeDateYMD(a.date);
        const db = normalizeDateYMD(b.date);
        return da.localeCompare(db);
    });

    const uniqueDates = Array.from(new Set(sorted.map(l => normalizeDateYMD(l.date)).filter(Boolean))).sort();
    const gaps: { fromDate: string; toDate: string; gapDays: number }[] = [];
    for (let i = 1; i < uniqueDates.length; i++) {
        const prev = new Date(`${uniqueDates[i - 1]}T00:00:00Z`).getTime();
        const curr = new Date(`${uniqueDates[i]}T00:00:00Z`).getTime();
        const diffDays = Math.round((curr - prev) / (1000 * 60 * 60 * 24));
        if (diffDays >= 3) {
            gaps.push({ fromDate: uniqueDates[i - 1], toDate: uniqueDates[i], gapDays: diffDays - 1 });
        }
    }

    const catMap = new Map<string, { category: string; count: number; photosCount: number; firstDate: string; lastDate: string }>();
    const monthMap = new Map<string, { month: string; count: number; categories: Set<string>; photosCount: number }>();
    const boqMap = new Map<string, { boqItemId: string; boqItemCode: string; boqItemDescription: string; count: number }>();

    let totalPhotos = 0;
    let logsWithPhotosCount = 0;

    sorted.forEach((l: any) => {
        const dateYmd = normalizeDateYMD(l.date);
        const photos = Array.isArray(l.images) ? l.images.length : (l.imageUrl ? 1 : 0);
        totalPhotos += photos;
        if (photos > 0) logsWithPhotosCount += 1;

        const cat = String(l.workCategory || 'أعمال عامة / غير مصنف').trim();
        const prevCat = catMap.get(cat);
        if (!prevCat) {
            catMap.set(cat, { category: cat, count: 1, photosCount: photos, firstDate: dateYmd, lastDate: dateYmd });
        } else {
            prevCat.count += 1;
            prevCat.photosCount += photos;
            if (dateYmd && (!prevCat.firstDate || dateYmd < prevCat.firstDate)) prevCat.firstDate = dateYmd;
            if (dateYmd && (!prevCat.lastDate || dateYmd > prevCat.lastDate)) prevCat.lastDate = dateYmd;
        }

        if (dateYmd && dateYmd.length >= 7) {
            const ym = dateYmd.slice(0, 7);
            const prevMonth = monthMap.get(ym);
            if (!prevMonth) {
                monthMap.set(ym, { month: ym, count: 1, categories: new Set(cat ? [cat] : []), photosCount: photos });
            } else {
                prevMonth.count += 1;
                prevMonth.photosCount += photos;
                if (cat) prevMonth.categories.add(cat);
            }
        }

        const boqInfo = resolveLogBoqInfo(l, boqItems);
        if (l.boqItemId || boqInfo.boqItemCode || boqInfo.boqItemDescription) {
            const key = l.boqItemId || `${boqInfo.boqItemCode}|${boqInfo.boqItemDescription}`;
            const prevBoq = boqMap.get(key);
            if (!prevBoq) {
                boqMap.set(key, {
                    boqItemId: l.boqItemId || '',
                    boqItemCode: boqInfo.boqItemCode,
                    boqItemDescription: boqInfo.boqItemDescription,
                    count: 1
                });
            } else {
                prevBoq.count += 1;
            }
        }
    });

    const totalLogs = sorted.length;
    const byWorkCategory = Array.from(catMap.values())
        .sort((a, b) => b.count - a.count)
        .map(c => ({
            ...c,
            percentage: totalLogs > 0 ? Number(((c.count / totalLogs) * 100).toFixed(1)) : 0
        }));

    const byMonth = Array.from(monthMap.values())
        .sort((a, b) => a.month.localeCompare(b.month))
        .map(m => ({
            month: m.month,
            count: m.count,
            categories: Array.from(m.categories),
            photosCount: m.photosCount
        }));

    const byBoqItem = Array.from(boqMap.values()).sort((a, b) => b.count - a.count);

    return {
        totalLogs,
        uniqueActiveDays: uniqueDates.length,
        firstDate: uniqueDates[0] || null,
        lastDate: uniqueDates[uniqueDates.length - 1] || null,
        totalPhotos,
        logsWithPhotosCount,
        gaps,
        byWorkCategory,
        byMonth,
        byBoqItem
    };
}

async function imageSourceToPart(src: string): Promise<{ inlineData: { data: string; mimeType: string } } | null> {
    if (!src || typeof src !== 'string') return null;

    if (src.startsWith('data:image/')) {
        // Compress on canvas to keep payload light when sending multiple log photos
        if (typeof document !== 'undefined' && typeof Image !== 'undefined') {
            try {
                const compressedBase64 = await new Promise<string>((resolve, reject) => {
                    const img = new Image();
                    const timer = setTimeout(() => reject(new Error('Image load timeout')), 4000);
                    img.onload = () => {
                        clearTimeout(timer);
                        try {
                            const canvas = document.createElement('canvas');
                            const ctx = canvas.getContext('2d');
                            const MAX_W = 800;
                            const scale = img.width > MAX_W ? MAX_W / img.width : 1;
                            canvas.width = Math.max(1, Math.round(img.width * scale));
                            canvas.height = Math.max(1, Math.round(img.height * scale));
                            ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
                            const out = canvas.toDataURL('image/jpeg', 0.68);
                            resolve(out.split(',')[1] || '');
                        } catch (err) {
                            reject(err);
                        }
                    };
                    img.onerror = (err) => {
                        clearTimeout(timer);
                        reject(err);
                    };
                    img.src = src;
                });
                if (compressedBase64) {
                    return { inlineData: { data: compressedBase64, mimeType: 'image/jpeg' } };
                }
            } catch {}
        }

        const match = src.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
        if (match && match[2]) {
            return { inlineData: { mimeType: match[1], data: match[2] } };
        }
        return null;
    }

    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('blob:')) {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 5000);
            const resp = await fetch(src, { signal: controller.signal });
            clearTimeout(timer);
            if (!resp.ok) return null;
            const blob = await resp.blob();
            const file = new File([blob], 'log_photo.jpg', { type: blob.type || 'image/jpeg' });
            const part = await fileToPart(file, true);
            if (part?.inlineData?.data) return part;
        } catch {}
    }

    return null;
}

function buildLiveProjectDossier(project: any): string {
    if (!project) return "لا توجد بيانات متاحة للمشروع في سجل المشروع حالياً.";

    const boq: any[] = project.boqItems || [];
    const payments: any[] = project.payments || [];
    const logs: any[] = project.executionLogs || [];
    const reports: any[] = project.engineeringReports || [];
    const soilReport = project.soilReport || project.soilReportAnalysis || '';

    const boqTotalValue = boq.reduce((sum: number, item: any) => sum + ((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)), 0);
    const boqExecutedValue = boq.reduce((sum: number, item: any) => sum + ((Number(item.executedQuantity) || 0) * (Number(item.unitPrice) || 0)), 0);
    const paymentsTotalNet = payments.reduce((sum: number, p: any) => sum + (Number(p.netAmount) || Number(p.amount) || 0), 0);
    const progressPct = boqTotalValue > 0 ? ((boqExecutedValue / boqTotalValue) * 100).toFixed(1) : '0';

    // 1. BOQ detailed list
    const boqFormatted = boq.length > 0
        ? boq.map((b, idx) => {
            const code = b.itemCode !== undefined ? b.itemCode : (b.itemNumber !== undefined ? b.itemNumber : idx + 1);
            const desc = b.description || 'بدون بيان';
            const unit = b.unit || 'م3';
            const qty = Number(b.quantity) || 0;
            const exec = Number(b.executedQuantity) || 0;
            const rem = Math.max(0, qty - exec);
            const price = Number(b.unitPrice) || 0;
            const total = qty * price;
            return `• [بند ${code}] ${desc} | الوحدة: ${unit} | التعاقدي: ${qty} | المنفذ: ${exec} | المتبقي: ${rem} | الفئة: ${price.toLocaleString()} ج.م | الإجمالي: ${total.toLocaleString()} ج.م`;
        }).join('\n')
        : "لا توجد بنود مقايسة مدخلة.";

    // 2. Payments detailed list
    const paymentsFormatted = payments.length > 0
        ? payments.map((p, idx) => {
            const inv = p.invoiceNumber || p.number || (idx + 1);
            const date = p.date || 'بدون تاريخ';
            const gross = Number(p.grossAmount) || Number(p.currentWorkValue) || Number(p.grossCurrentWork) || 0;
            const net = Number(p.netAmount) || Number(p.amount) || 0;
            const cum = Number(p.cumulativeAmount) || net;
            const ret = Number(p.retentionDeduction) || Number(p.retentionAmount) || Number(p.retention) || 0;
            const adv = Number(p.advanceDeduction) || Number(p.advanceDeductionAmount) || Number(p.advancePayment) || 0;
            const tax = Number(p.taxDeduction) || Number(p.taxesAndOtherAmount) || Number(p.taxes) || 0;
            const note = p.note || p.notes || '';
            const itemsStr = Array.isArray(p.items) && p.items.length > 0
                ? ` | البنود المشمولة: [${p.items.map((it: any) => `بند ${it.itemCode || it.itemNumber || ''}: ك.حالية ${it.currQuantity ?? it.currentQuantity ?? 0} / إجمالي ${it.totalQuantity ?? 0}`).join(', ')}]`
                : '';
            return `• [مستخلص ${inv}] بتاريخ: ${date} | إجمالي الأعمال: ${gross.toLocaleString()} ج.م | استقطاع ضمان أعمال: ${ret.toLocaleString()} | استقطاع دفعة مقدمة: ${adv.toLocaleString()} | ضرائب وتأمينات: ${tax.toLocaleString()} | الصافي المستحق: ${net.toLocaleString()} ج.م | التراكمي: ${cum.toLocaleString()} ج.م | ملاحظات: ${note}${itemsStr}`;
        }).join('\n')
        : "لا توجد مستخلصات مسجلة.";

    // 3. Execution logs with rich metadata + analytics summary
    const sortedLogs = [...logs].sort((a: any, b: any) => normalizeDateYMD(a.date).localeCompare(normalizeDateYMD(b.date)));
    const logsAnalytics = computeLogsAnalytics(sortedLogs, boq);
    const logsAnalyticsText = sortedLogs.length > 0
        ? [
            `- إجمالي السجلات: ${logsAnalytics.totalLogs} سجل عبر ${logsAnalytics.uniqueActiveDays} يوم عمل فعلي (من ${logsAnalytics.firstDate || '-'} إلى ${logsAnalytics.lastDate || '-'})`,
            `- إجمالي الصور الميدانية باليوميات: ${logsAnalytics.totalPhotos} صورة (في ${logsAnalytics.logsWithPhotosCount} يومية)`,
            `- توزيع أنواع الأعمال: ${logsAnalytics.byWorkCategory.map(c => `${c.category}: ${c.count} (${c.percentage}%)`).join(' | ')}`,
            logsAnalytics.byBoqItem.length > 0
                ? `- البنود المرتبطة بالمقايسة: ${logsAnalytics.byBoqItem.map(b => `${b.boqItemCode ? `بند ${b.boqItemCode}` : ''} ${b.boqItemDescription.slice(0, 40)} (${b.count} سجل)`).join(' | ')}`
                : `- البنود المرتبطة بالمقايسة: لا يوجد ربط مباشر ببنود مقايسة`,
            logsAnalytics.gaps.length > 0
                ? `- فترات التوقف / الانقطاع (>= 3 أيام بدون يوميات): ${logsAnalytics.gaps.map(g => `من ${g.fromDate} إلى ${g.toDate} (${g.gapDays} يوم)`).join(' | ')}`
                : `- فترات التوقف / الانقطاع: لا توجد فترات انقطاع >= 3 أيام`
        ].join('\n')
        : "لا توجد إحصائيات يوميات مسجلة.";

    const logsFormatted = sortedLogs.length > 0
        ? sortedLogs.map((l, idx) => formatEnrichedLogLine(l, idx, boq)).join('\n')
        : "لا توجد يوميات مسجلة.";

    // 4. Soil report
    const soilSummary = soilReport && soilReport.trim().length > 0
        ? soilReport
        : "لم يتم حفظ تقرير فحص تربة وتوصيات جسات مفصل.";

    // 5. Engineering reports
    const reportsFormatted = reports.length > 0
        ? reports.map((r, idx) => {
            const snippet = r.content ? r.content.replace(/<[^>]*>/g, ' ').substring(0, 800) : '';
            return `• [تقرير ${idx + 1}] [${r.date || 'تاريخ غير محدد'}] نوع: [${r.type || 'تقرير هندسي'}] "${r.title}": ${snippet}`;
        }).join('\n')
        : "لا توجد تقارير هندسية سابقة.";

    return `
=== ملف سجل المشروع الحي الشامل (LIVE PROJECT REGISTER DOSSIER) ===
اسم المشروع: ${project.name || 'بدون اسم'}
الموقع: ${project.location || 'غير محدد'}
المقاول العام: ${project.contractor || 'غير محدد'}
الاستشاري: ${project.consultant || 'غير محدد'}
حالة المشروع: ${project.status || 'ساري'}
القيمة التعاقدية الإجمالية للمقايسة: ${boqTotalValue.toLocaleString()} جنيه مصري
إجمالي قيمة الأعمال المنفذة بالمقايسة: ${boqExecutedValue.toLocaleString()} جنيه مصري
نسبة الإنجاز المالي: ${progressPct}%
إجمالي المنصرف بالمستخلصات: ${paymentsTotalNet.toLocaleString()} جنيه مصري

--- [1. تبويب المقايسة التراكمي (BOQ ITEMS)] ---
(عدد بنود المقايسة: ${boq.length})
${boqFormatted}

--- [2. تبويب المستخلصات والشهادات المالية (PAYMENTS HISTORY)] ---
(عدد المستخلصات: ${payments.length})
${paymentsFormatted}

--- [3. تبويب اليوميات الميدانية وسير الأعمال (DAILY EXECUTION LOGS)] ---
(ملخص تحليلي لليوميات):
${logsAnalyticsText}

(السجل الكامل لليوميات):
${logsFormatted}

--- [4. تبويب الجسات وفحص التربة الأساسي (SOIL REPORT)] ---
${soilSummary}

--- [5. تبويب التقارير الهندسية والأرشيفية المعتمدة (ENGINEERING REPORTS)] ---
(عدد التقارير: ${reports.length})
${reportsFormatted}

=== نهاية ملف سجل المشروع الحي ===
`;
}

export const consultantService = {
    async specializedConsultation(project: any, agentType: string, prompt: string, prevContent: string = '', files: File[] = []): Promise<string> {
        
        const modelName = MODEL_SMART; 
        const agentPrompt = AGENT_PROMPTS[agentType] || AGENT_PROMPTS['general'];

        // Only pass a valid Google GenAI server-created cachedContents resource if one exists
        const cachedContentName = (project.aiCacheName && String(project.aiCacheName).startsWith('cachedContents/'))
            ? project.aiCacheName
            : undefined;

        // Define Tools (Function Declarations)
        const getProjectInventory: FunctionDeclaration = {
            name: "getProjectInventory",
            description: "Get a high-level summary of available project data (total logs, date ranges, report types, financial summary). Use this FIRST to understand the project scope.",
            parameters: { type: Type.OBJECT, properties: {} }
        };
        const readDocument: FunctionDeclaration = {
            name: "readDocument",
            description: "Read the full content of a specific document (Log, Report, or BOQ item) by its ID or Title.",
            parameters: {
                type: Type.OBJECT,
                properties: {
                    type: { type: Type.STRING, description: "Type of document: 'log', 'report', 'boq', or 'payment'." },
                    id: { type: Type.STRING, description: "The ID or Title of the document to read." }
                },
                required: ["type", "id"]
            }
        };
        const searchLogs: FunctionDeclaration = {
            name: "searchLogs",
            description: "Search execution logs (اليوميات) by keywords, workCategory (تصنيف العمل), linked BOQ item, date range, or photo presence. Searches content, categories, BOQ descriptions, and dates using normalized Arabic matching.",
            parameters: {
                type: Type.OBJECT,
                properties: {
                    keyword: { type: Type.STRING, description: "Keywords to search for across log content, category, BOQ description, and date (comma-separated for OR logic)." },
                    startDate: { type: Type.STRING, description: "Start date (YYYY-MM-DD)." },
                    endDate: { type: Type.STRING, description: "End date (YYYY-MM-DD)." },
                    workCategory: { type: Type.STRING, description: "Filter by work category (نوع العمل / البند مثل: أعمال المحارة، خرسانة، حدادة)." },
                    boqKeyword: { type: Type.STRING, description: "Filter by linked BOQ item code or description." },
                    hasPhotosOnly: { type: Type.BOOLEAN, description: "If true, return only logs that have attached site photos." }
                }
            }
        };
        const analyzeLogs: FunctionDeclaration = {
            name: "analyzeLogs",
            description: "Read and deeply analyze project daily logs (اليوميات) to compute exact statistics, active days, idle/stoppage gaps (>=3 days), breakdown by workCategory, monthly timeline, linked BOQ items, photo counts, and return full enriched log records for extracting specific data (quantities, labor, equipment, materials, issues).",
            parameters: {
                type: Type.OBJECT,
                properties: {
                    startDate: { type: Type.STRING, description: "Optional start date filter (YYYY-MM-DD)." },
                    endDate: { type: Type.STRING, description: "Optional end date filter (YYYY-MM-DD)." },
                    workCategory: { type: Type.STRING, description: "Optional work category filter." },
                    boqKeyword: { type: Type.STRING, description: "Optional linked BOQ item filter." },
                    includeEntries: { type: Type.BOOLEAN, description: "Whether to include full enriched log entries (default true)." }
                }
            }
        };
        const analyzeLogPhotos: FunctionDeclaration = {
            name: "analyzeLogPhotos",
            description: "Visually inspect and analyze the actual site photos attached inside daily execution logs (صور اليوميات) to extract construction progress, workmanship quality, materials, safety violations, or answer specific questions about the photos.",
            parameters: {
                type: Type.OBJECT,
                properties: {
                    logId: { type: Type.STRING, description: "Specific log ID to inspect photos from." },
                    date: { type: Type.STRING, description: "Specific date (YYYY-MM-DD) of the daily log." },
                    startDate: { type: Type.STRING, description: "Start date (YYYY-MM-DD) for filtering logs with photos." },
                    endDate: { type: Type.STRING, description: "End date (YYYY-MM-DD) for filtering logs with photos." },
                    workCategory: { type: Type.STRING, description: "Filter logs by work category." },
                    keyword: { type: Type.STRING, description: "Keyword filter in log content." },
                    question: { type: Type.STRING, description: "Specific engineering, progress, quality, or safety question to inspect in the photos." }
                }
            }
        };
        const searchReports: FunctionDeclaration = {
            name: "searchReports",
            description: "Search engineering reports by keywords or type. Returns titles and summaries.",
            parameters: {
                type: Type.OBJECT,
                properties: {
                    keyword: { type: Type.STRING, description: "Keywords to search for (comma-separated for OR logic)." },
                    type: { type: Type.STRING, description: "Type of report (e.g., 'soil', 'concrete', 'rfi', 'ncr')." }
                }
            }
        };
        const searchBOQ: FunctionDeclaration = {
            name: "searchBOQ",
            description: "Search Bill of Quantities (المقايسة) by keywords. Returns item details, quantities, and prices.",
            parameters: {
                type: Type.OBJECT,
                properties: {
                    keyword: { type: Type.STRING, description: "Keywords to search for (comma-separated for OR logic)." }
                }
            }
        };
        const searchOtherDocs: FunctionDeclaration = {
            name: "searchOtherDocs",
            description: "Search other project documents like RFIs, Submittals, NCRs, Checklists, and Correspondence.",
            parameters: {
                type: Type.OBJECT,
                properties: {
                    docType: { type: Type.STRING, description: "Type of document: 'rfi', 'submittal', 'ncr', 'checklist', or 'correspondence'." },
                    keyword: { type: Type.STRING, description: "Keywords to search for (comma-separated for OR logic)." }
                },
                required: ["docType"]
            }
        };
        const getPayments: FunctionDeclaration = {
            name: "getPayments",
            description: "Get the history of payments and invoices (المستخلصات).",
            parameters: { type: Type.OBJECT, properties: {} }
        };

        const tools = [{ functionDeclarations: [getProjectInventory, readDocument, searchLogs, analyzeLogs, analyzeLogPhotos, searchReports, searchBOQ, searchOtherDocs, getPayments] }];

        // Build live dossier from the in-memory project register
        const liveDossier = buildLiveProjectDossier(project);

        // Merge the Master Prompt with Data Context
        const systemInstruction = `
            ${CONSULTANT_MASTER_PROMPT}
            ${SHARED_SYSTEM_MEMORY}
            
            **المركز الاستشاري الموحد للمشروع (UNIFIED PROJECT CONSULTING CENTER)**
            أنت عقل المركز الاستشاري الموحد للمشروع، وتعمل حالياً بالكامل داخل هذا المشروع وسجل بياناته الحي:
            [اسم المشروع: ${project?.name || 'المشروع الحالي'}]
            
            **AGENT SPECIFIC ROLE:**
            ${agentPrompt}

            **LIVE PROJECT REGISTER DOSSIER (ملف بيانات سجل المشروع الحي الكامل):**
            تم تزويدك بالبيانات الحية المباشرة لسجل المشروع بجميع أقسامه (اليوميات، المستخلصات، المقايسة، الجسات والتقارير):
            ${liveDossier}

            **إرشادات العمل والتكامل الاستشاري:**
            1. أنت مطلع على كافة تفاصيل سجل المشروع المذكورة أعلاه بنسبة 100%.
            2. استخدم هذه البيانات الحقيقية فقط (الأرقام، النسب، التواريخ، البنود، المستخلصات، كميات التربة، اليوميات).
            3. يمنع اختلاق أو افتراض بيانات من خارج السجل (No Hallucination).
            4. الأدوات التفاعلية (Tools) متاحة لك دائماً: استخدم \`analyzeLogs\` و\`searchLogs\` لقراءة وتحليل **اليوميات** واستخراج أي بيانات أو إحصائيات أو فترات توقف أو عمالة أو كميات منها، واستخدم \`analyzeLogPhotos\` لتحليل الصور الميدانية المرفقة داخل اليوميات، بالإضافة إلى أدوات البحث في التقارير والمقايسة والمستخلصات.
            5. قدم مخرجات هندسية راقية مبهرة، جداول منسقة بعرض 100% مع التفاف النص، وصناديق ملونة واضحة (info-box, success-box, warning-box, cost-box).
            6. ابدأ الرد مباشرة بعنوان رئيسي <h1> ثم متن التحليل الاستشاري دون أي هيدر أزرق.

            **USER REQUEST:**
            ${prompt}
            `;

        try {
            let contents: any[] = [];
            let initialParts: any[] = [];
            if (files && files.length > 0) {
                const filesProcess = (files.length > 5) ? files.slice(0, 5) : files;
                for (const file of filesProcess) {
                    const part = await fileToPart(file, true);
                    initialParts.push(part);
                }
            }
            initialParts.push({ text: `Previous Context (Conversation): ${prevContent}\n\nUser Question: ${prompt}` });
            
            contents.push({ role: 'user', parts: initialParts });

            let currentModel = modelName;
            
            // Tool Loop (Max 7 iterations)
            for (let i = 0; i < 7; i++) {
                if (i > 0) {
                    // Small delay between tool calls to prevent hitting burst rate limits (429)
                    await new Promise(resolve => setTimeout(resolve, 600));
                }

                const result = await safeGenerateContent(currentModel, {
                    contents: contents,
                    cachedContent: cachedContentName,
                    config: {
                        systemInstruction: systemInstruction,
                        tools: tools
                    }
                });

                currentModel = result.usedModel;

                if (result.functionCalls && result.functionCalls.length > 0) {
                    // Add model's turn (containing function calls) to history
                    if (result.response?.candidates?.[0]?.content) {
                        contents.push(result.response.candidates[0].content);
                    } else {
                        // Fallback if response structure is different
                        contents.push({ role: 'model', parts: result.functionCalls.map((fc: any) => ({ functionCall: fc })) });
                    }

                    const functionResponses: any[] = [];
                    for (const call of result.functionCalls) {
                        const args = call.args || {};
                        let responseData: any = { error: "Function not found" };

                        if (call.name === "getProjectInventory") {
                            const logs = project.executionLogs || [];
                            const reports = project.engineeringReports || [];
                            const boq = project.boqItems || [];
                            const payments = project.payments || [];
                            
                            // Calculate BOQ totals
                            const boqTotalValue = boq.reduce((sum: number, item: any) => sum + (item.quantity * item.unitPrice), 0);
                            const boqExecutedValue = boq.reduce((sum: number, item: any) => sum + (item.executedQuantity * item.unitPrice), 0);
                            const paymentsTotal = payments.reduce((sum: number, p: any) => sum + (p.netAmount || p.amount || 0), 0);

                            // Sort logs to find date range
                            const sortedLogs = [...logs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

                            responseData = {
                                projectInfo: { name: project.name, status: project.status, location: project.location },
                                summary: {
                                    totalLogs: logs.length,
                                    firstLogDate: sortedLogs.length > 0 ? sortedLogs[0].date : null,
                                    lastLogDate: sortedLogs.length > 0 ? sortedLogs[sortedLogs.length - 1].date : null,
                                    totalReports: reports.length,
                                    reportTypes: [...new Set(reports.map((r: any) => r.type))],
                                    boqSections: [...new Set(boq.map((i: any) => i.category || 'General'))],
                                    totalPayments: payments.length,
                                    otherDocsCount: {
                                        rfis: (project.rfis || []).length,
                                        submittals: (project.submittals || []).length,
                                        ncrs: (project.ncrs || []).length,
                                        checklists: (project.checklists || []).length,
                                        correspondence: (project.correspondence || []).length
                                    }
                                },
                                financials: {
                                    boqTotalValue,
                                    boqExecutedValue,
                                    paymentsTotal,
                                    financialProgress: boqTotalValue > 0 ? (boqExecutedValue / boqTotalValue) * 100 : 0
                                }
                            };
                        } else if (call.name === "readDocument") {
                            const { type, id } = args;
                            if (type === 'log') {
                                const logsArr = project.executionLogs || [];
                                const boqArr = project.boqItems || [];
                                const targetNorm = normalizeArabicSearchText(id || '');
                                const idxNum = Number(id);
                                const found = logsArr.find((l: any) => l.id === id || normalizeDateYMD(l.date) === normalizeDateYMD(id))
                                    || (!isNaN(idxNum) && idxNum >= 1 && idxNum <= logsArr.length ? logsArr[idxNum - 1] : undefined)
                                    || logsArr.find((l: any) => normalizeArabicSearchText(l.content || '').includes(targetNorm));
                                if (found) {
                                    const boqInfo = resolveLogBoqInfo(found, boqArr);
                                    responseData = {
                                        id: found.id,
                                        date: normalizeDateYMD(found.date) || found.date,
                                        workCategory: found.workCategory || '',
                                        boqItemId: found.boqItemId || '',
                                        boqItemCode: boqInfo.boqItemCode,
                                        boqItemDescription: boqInfo.boqItemDescription,
                                        boqBatchName: boqInfo.boqBatchName,
                                        photosCount: Array.isArray(found.images) ? found.images.length : (found.imageUrl ? 1 : 0),
                                        content: found.content
                                    };
                                } else {
                                    responseData = { error: "Log not found" };
                                }
                            } else if (type === 'report') {
                                responseData = (project.engineeringReports || []).find((r: any) => r.id === id || r.title === id) || { error: "Report not found" };
                                if (responseData.error && (id === 'soil' || id.includes('تربة'))) {
                                    responseData = { title: 'تقرير الجسات الأساسي', content: project.soilReport || project.soilReportAnalysis };
                                }
                            } else if (type === 'boq') {
                                responseData = (project.boqItems || []).filter((i: any) => i.category === id || i.itemCode === id || i.id === id) || { error: "BOQ items not found" };
                            } else if (type === 'payment') {
                                responseData = (project.payments || []).find((p: any) => p.id === id || String(p.invoiceNumber) === String(id)) || { error: "Payment not found" };
                            }
                        } else if (call.name === "searchLogs") {
                            const boqArr = project.boqItems || [];
                            let logs = [...(project.executionLogs || [])].sort((a: any, b: any) => normalizeDateYMD(b.date).localeCompare(normalizeDateYMD(a.date)));
                            const startYmd = normalizeDateYMD(args.startDate);
                            const endYmd = normalizeDateYMD(args.endDate);
                            if (startYmd) {
                                logs = logs.filter((l: any) => normalizeDateYMD(l.date) >= startYmd);
                            }
                            if (endYmd) {
                                logs = logs.filter((l: any) => normalizeDateYMD(l.date) <= endYmd);
                            }
                            if (args.workCategory) {
                                const catNorm = normalizeArabicSearchText(args.workCategory);
                                logs = logs.filter((l: any) => normalizeArabicSearchText(l.workCategory || '').includes(catNorm));
                            }
                            if (args.boqKeyword) {
                                const boqNorm = normalizeArabicSearchText(args.boqKeyword);
                                logs = logs.filter((l: any) => {
                                    const bInfo = resolveLogBoqInfo(l, boqArr);
                                    const combinedBoq = normalizeArabicSearchText(`${bInfo.boqItemCode} ${bInfo.boqItemDescription} ${bInfo.boqBatchName} ${l.boqItemId || ''}`);
                                    return combinedBoq.includes(boqNorm);
                                });
                            }
                            if (args.hasPhotosOnly) {
                                logs = logs.filter((l: any) => (Array.isArray(l.images) && l.images.length > 0) || Boolean(l.imageUrl));
                            }
                            if (args.keyword) {
                                const keywords = String(args.keyword).split(',').map((k: string) => normalizeArabicSearchText(k)).filter((k: string) => k.length > 0);
                                logs = logs.filter((l: any) => {
                                    const bInfo = resolveLogBoqInfo(l, boqArr);
                                    const searchable = normalizeArabicSearchText(`${l.date || ''} ${l.workCategory || ''} ${bInfo.boqItemCode} ${bInfo.boqItemDescription} ${bInfo.boqBatchName} ${l.content || ''}`);
                                    return keywords.some((k: string) => searchable.includes(k));
                                });
                            }

                            const limit = (args.keyword || args.workCategory || args.boqKeyword || startYmd || endYmd) ? 500 : 150;

                            responseData = {
                                totalFound: logs.length,
                                showing: Math.min(logs.length, limit),
                                hint: logs.length > limit ? `Showing top ${limit} results. Please refine date range or keywords.` : "",
                                logs: logs.slice(0, limit).map((l: any) => {
                                    const bInfo = resolveLogBoqInfo(l, boqArr);
                                    return {
                                        id: l.id,
                                        date: normalizeDateYMD(l.date) || l.date,
                                        workCategory: l.workCategory || '',
                                        boqItemId: l.boqItemId || '',
                                        boqItemCode: bInfo.boqItemCode,
                                        boqItemDescription: bInfo.boqItemDescription,
                                        boqBatchName: bInfo.boqBatchName,
                                        photosCount: Array.isArray(l.images) ? l.images.length : (l.imageUrl ? 1 : 0),
                                        content: l.content
                                    };
                                })
                            };
                        } else if (call.name === "analyzeLogs") {
                            const boqArr = project.boqItems || [];
                            let logs = [...(project.executionLogs || [])].sort((a: any, b: any) => normalizeDateYMD(a.date).localeCompare(normalizeDateYMD(b.date)));
                            const startYmd = normalizeDateYMD(args.startDate);
                            const endYmd = normalizeDateYMD(args.endDate);
                            if (startYmd) {
                                logs = logs.filter((l: any) => normalizeDateYMD(l.date) >= startYmd);
                            }
                            if (endYmd) {
                                logs = logs.filter((l: any) => normalizeDateYMD(l.date) <= endYmd);
                            }
                            if (args.workCategory) {
                                const catNorm = normalizeArabicSearchText(args.workCategory);
                                logs = logs.filter((l: any) => normalizeArabicSearchText(l.workCategory || '').includes(catNorm));
                            }
                            if (args.boqKeyword) {
                                const boqNorm = normalizeArabicSearchText(args.boqKeyword);
                                logs = logs.filter((l: any) => {
                                    const bInfo = resolveLogBoqInfo(l, boqArr);
                                    return normalizeArabicSearchText(`${bInfo.boqItemCode} ${bInfo.boqItemDescription} ${bInfo.boqBatchName}`).includes(boqNorm);
                                });
                            }

                            const analytics = computeLogsAnalytics(logs, boqArr);
                            const includeEntries = args.includeEntries !== false;
                            const entriesLimit = 300;

                            responseData = {
                                analytics,
                                entriesIncluded: includeEntries ? Math.min(logs.length, entriesLimit) : 0,
                                logs: includeEntries
                                    ? logs.slice(0, entriesLimit).map((l: any) => {
                                        const bInfo = resolveLogBoqInfo(l, boqArr);
                                        return {
                                            id: l.id,
                                            date: normalizeDateYMD(l.date) || l.date,
                                            workCategory: l.workCategory || '',
                                            boqItemCode: bInfo.boqItemCode,
                                            boqItemDescription: bInfo.boqItemDescription,
                                            photosCount: Array.isArray(l.images) ? l.images.length : (l.imageUrl ? 1 : 0),
                                            content: l.content
                                        };
                                    })
                                    : []
                            };
                        } else if (call.name === "analyzeLogPhotos") {
                            const boqArr = project.boqItems || [];
                            let logs = [...(project.executionLogs || [])]
                                .filter((l: any) => (Array.isArray(l?.images) && l.images.length > 0) || Boolean(l?.imageUrl))
                                .sort((a: any, b: any) => normalizeDateYMD(b.date).localeCompare(normalizeDateYMD(a.date)));

                            if (args.logId) {
                                logs = logs.filter((l: any) => l.id === args.logId);
                            }
                            if (args.date) {
                                const targetDate = normalizeDateYMD(args.date);
                                logs = logs.filter((l: any) => normalizeDateYMD(l.date) === targetDate);
                            }
                            if (args.startDate) {
                                const sYmd = normalizeDateYMD(args.startDate);
                                logs = logs.filter((l: any) => normalizeDateYMD(l.date) >= sYmd);
                            }
                            if (args.endDate) {
                                const eYmd = normalizeDateYMD(args.endDate);
                                logs = logs.filter((l: any) => normalizeDateYMD(l.date) <= eYmd);
                            }
                            if (args.workCategory) {
                                const catNorm = normalizeArabicSearchText(args.workCategory);
                                logs = logs.filter((l: any) => normalizeArabicSearchText(l.workCategory || '').includes(catNorm));
                            }
                            if (args.keyword) {
                                const kws = String(args.keyword).split(',').map((k: string) => normalizeArabicSearchText(k)).filter(Boolean);
                                logs = logs.filter((l: any) => {
                                    const bInfo = resolveLogBoqInfo(l, boqArr);
                                    const text = normalizeArabicSearchText(`${l.content || ''} ${l.workCategory || ''} ${bInfo.boqItemDescription}`);
                                    return kws.some(k => text.includes(k));
                                });
                            }

                            const photoEntries: { logId: string; date: string; workCategory: string; content: string; src: string; photoIndex: number }[] = [];
                            for (const l of logs) {
                                const imgs: string[] = Array.isArray(l.images) && l.images.length > 0
                                    ? l.images
                                    : (l.imageUrl ? [l.imageUrl] : []);
                                imgs.forEach((src, i) => {
                                    if (photoEntries.length < 6) {
                                        photoEntries.push({
                                            logId: l.id,
                                            date: normalizeDateYMD(l.date) || l.date,
                                            workCategory: l.workCategory || '',
                                            content: l.content || '',
                                            src,
                                            photoIndex: i + 1
                                        });
                                    }
                                });
                                if (photoEntries.length >= 6) break;
                            }

                            if (photoEntries.length === 0) {
                                responseData = {
                                    matchedLogsCount: logs.length,
                                    analyzedPhotosCount: 0,
                                    message: "لا توجد صور ميدانية مرفقة في اليوميات المطابقة لمعايير البحث."
                                };
                            } else {
                                const visionParts: any[] = [];
                                const convertedLabels: string[] = [];
                                for (const entry of photoEntries) {
                                    const part = await imageSourceToPart(entry.src);
                                    if (part) {
                                        visionParts.push({ text: `[صورة ${convertedLabels.length + 1} | تاريخ اليومية: ${entry.date} | التصنيف: ${entry.workCategory || 'عام'} | وصف اليومية: ${entry.content.slice(0, 150)}]` });
                                        visionParts.push(part);
                                        convertedLabels.push(`${entry.date} (#${entry.photoIndex})`);
                                    }
                                }

                                if (convertedLabels.length === 0) {
                                    responseData = {
                                        matchedLogsCount: logs.length,
                                        totalPhotosMatched: photoEntries.length,
                                        analyzedPhotosCount: 0,
                                        message: "تم العثور على صور مرتبطة باليوميات ولكن تعذر تحميلها للتحليل البصري حالياً."
                                    };
                                } else {
                                    const visionPrompt = `
أنت مهندس استشاري وخبير ضبط جودة وسلامة مهنية. حلّل صور اليوميات الميدانية المرفقة بدقة وموضوعية طبقاً للكود المصري (ECP) واشتراطات السلامة (OSHA).
${args.question ? `السؤال المطلوب الإجابة عليه من الصور: "${args.question}"` : 'استخرج لكل صورة: الأعمال المنفذة الظاهرة، الخامات والمعدات، جودة التنفيذ والملاحظات الفنية، وأي ملاحظات سلامة أو عيوب إن وجدت.'}
اذكر رقم الصورة وتاريخ اليومية بوضوح ولا تفترض تفاصيل غير ظاهرة في الصور.`;
                                    visionParts.push({ text: visionPrompt });
                                    try {
                                        const visionRes = await safeGenerateContent(MODEL_SMART, {
                                            contents: [{ role: 'user', parts: visionParts }]
                                        });
                                        responseData = {
                                            matchedLogsCount: logs.length,
                                            analyzedPhotosCount: convertedLabels.length,
                                            analyzedPhotoTags: convertedLabels,
                                            visualAnalysis: visionRes.text
                                        };
                                    } catch (visionErr) {
                                        responseData = {
                                            matchedLogsCount: logs.length,
                                            analyzedPhotosCount: 0,
                                            error: "تعذر إتمام التحليل البصري لصور اليوميات حالياً."
                                        };
                                    }
                                }
                            }
                        } else if (call.name === "searchReports") {
                            let reports = [...(project.engineeringReports || [])].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
                            if (args.type) reports = reports.filter((r: any) => r.type === args.type);
                            if (args.keyword) {
                                const keywords = args.keyword.toLowerCase().split(',').map((k: string) => k.trim()).filter((k: string) => k.length > 0);
                                reports = reports.filter((r: any) => {
                                    const title = (r.title || '').toLowerCase();
                                    const content = (r.content || '').toLowerCase();
                                    return keywords.some((k: string) => title.includes(k) || content.includes(k));
                                });
                            }
                            
                            const limit = args.keyword ? 500 : 50;

                            responseData = { 
                                totalFound: reports.length,
                                showing: Math.min(reports.length, limit),
                                hint: reports.length > limit ? `Showing top ${limit} reports. Please refine search.` : "",
                                reports: reports.slice(0, limit).map((r: any) => ({ 
                                    id: r.id, 
                                    date: r.date,
                                    title: r.title, 
                                    type: r.type, 
                                    content: r.content.substring(0, 4000) // Increased snippet size for better context
                                })) 
                            };
                        } else if (call.name === "searchBOQ") {
                            let items = project.boqItems || [];
                            if (args.keyword) {
                                const keywords = args.keyword.toLowerCase().split(',').map((k: string) => k.trim()).filter((k: string) => k.length > 0);
                                items = items.filter((i: any) => {
                                    const desc = (i.description || '').toLowerCase();
                                    const code = (i.itemCode || '').toLowerCase();
                                    return keywords.some((k: string) => desc.includes(k) || code.includes(k));
                                });
                            }
                            
                            const limit = args.keyword ? 500 : 100;

                            responseData = { 
                                totalFound: items.length,
                                showing: Math.min(items.length, limit),
                                hint: items.length > limit ? `Showing top ${limit} items.` : "",
                                items: items.slice(0, limit).map((i: any) => ({ 
                                    id: i.id, 
                                    code: i.itemCode, 
                                    desc: i.description,
                                    qty: i.quantity,
                                    executedQty: i.executedQuantity,
                                    unitPrice: i.unitPrice
                                })) 
                            };
                        } else if (call.name === "searchOtherDocs") {
                            let docs: any[] = [];
                            if (args.docType === 'rfi') docs = project.rfis || [];
                            else if (args.docType === 'submittal') docs = project.submittals || [];
                            else if (args.docType === 'ncr') docs = project.ncrs || [];
                            else if (args.docType === 'checklist') docs = project.checklists || [];
                            else if (args.docType === 'correspondence') docs = project.correspondence || [];
                            
                            docs = [...docs].sort((a: any, b: any) => new Date(b.date || b.submissionDate || b.issueDate).getTime() - new Date(a.date || a.submissionDate || a.issueDate).getTime());

                            if (args.keyword) {
                                const keywords = args.keyword.toLowerCase().split(',').map((k: string) => k.trim()).filter((k: string) => k.length > 0);
                                docs = docs.filter((d: any) => {
                                    const json = JSON.stringify(d).toLowerCase();
                                    return keywords.some((k: string) => json.includes(k));
                                });
                            }
                            
                            const limit = args.keyword ? 500 : 100;
                            
                            responseData = {
                                totalFound: docs.length,
                                showing: Math.min(docs.length, limit),
                                hint: docs.length > limit ? `Showing top ${limit} documents.` : "",
                                docs: docs.slice(0, limit)
                            };
                        } else if (call.name === "getPayments") {
                            let payments = [...(project.payments || [])].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
                            responseData = { 
                                totalPayments: payments.length,
                                payments: payments.map((p: any, idx: number) => ({ 
                                    id: p.id, 
                                    invoiceNumber: p.invoiceNumber || p.number || (idx + 1),
                                    date: p.date, 
                                    grossAmount: p.grossAmount || p.currentWorkValue || 0,
                                    retentionDeduction: p.retentionDeduction || p.retention || 0,
                                    advanceDeduction: p.advanceDeduction || p.advancePayment || 0,
                                    taxDeduction: p.taxDeduction || p.taxes || 0,
                                    amount: p.netAmount || p.amount, 
                                    netAmount: p.netAmount || p.amount,
                                    cumulative: p.cumulativeAmount,
                                    status: p.status,
                                    note: p.note || p.notes || '',
                                    items: p.items || []
                                })) 
                            };
                        }

                        functionResponses.push({
                            functionResponse: {
                                name: call.name,
                                response: responseData
                            }
                        });
                    }
                    
                    // Add user's turn (containing function responses) to history
                    contents.push({ role: 'user', parts: functionResponses });
                } else {
                    // No more function calls, we have the final text
                    let finalText = (result.text || '').replace(/^```html/i, '').replace(/^```/i, '').replace(/```$/i, '');
                    finalText += getAiFooter(result.usedModel);
                    return finalText;
                }
            }

            // Final synthesis call without tools if loop reached max turns
            contents.push({
                role: 'user',
                parts: [{ text: 'بناءً على جميع البيانات المستخرجة أعلاه، قم بإصدار التقرير الاستشاري النهائي بصيغة HTML الآن دون استدعاء أي أدوات إضافية.' }]
            });
            const finalSynthesis = await safeGenerateContent(currentModel, {
                contents,
                config: {
                    systemInstruction
                }
            });
            let synthesizedText = (finalSynthesis.text || '').replace(/^```html/i, '').replace(/^```/i, '').replace(/```$/i, '');
            synthesizedText += getAiFooter(finalSynthesis.usedModel);
            return synthesizedText;

        } catch (error) {
            return `
                <div class="warning-box editable-box">
                    <strong><i class="fa-solid fa-triangle-exclamation"></i> عذراً، الاستشاري مشغول جداً</strong><br>
                    نواجه ضغطاً شديداً على الخوادم. يرجى إعادة المحاولة بعد قليل.
                </div>
            `;
        }
    },

    async generateSchedule(prompt: string): Promise<string> {
        const systemInstruction = `Planning Engineer. ${CONSULTANT_STYLE_INSTRUCTION}
        **Output:** Full-width HTML Table schedule. No Markdown. Use light styling for headers.`;
        try {
            const result = await safeGenerateContent(MODEL_SMART, { contents: prompt, config: { systemInstruction } });
            return result.text + getAiFooter(result.usedModel);
        } catch (e: any) { return getStaticFallbackReport("جدول زمني", "Time Schedule"); }
    },

    async askGeneralExpert(prompt: string, file?: File): Promise<string> {
        // Reuse the Master Prompt for the General Expert too to ensure consistency
        const systemInstruction = `
            ${CONSULTANT_MASTER_PROMPT}
            **ROLE:** General Engineering Expert (Instant Consultant).
            **TASK:** Answer the user's specific technical question or analyze the attached file.
            **FOCUS:** Codes, Standards (ECP), Best Practices.
            
            **أنت مهندس استشاري خبير ومدير المكتب الفني وضبط الجودة (Technical & QC Manager AI)**
            **الخبرة:** تتجاوز 30 عامًا في الإشراف الفني، تحليل التقارير الجيوتقنية، اختبارات المواد، ضبط الجودة، تحليل صور التنفيذ، إدارة المخاطر، وتحليل التأخيرات.
            **المرجعية الفنية:** إلمام كامل بالأكواد المصرية (المركز القومي لبحوث الإسكان والبناء، الهيئة المصرية العامة للمواصفات والجودة)، وخاصة: الكود المصري لتصميم وتنفيذ المنشآت الخرسانية المسلحة، الكود المصري لميكانيكا التربة وأعمال الأساسات، والكود المصري لأعمال المباني.
            **المنهجية:** تحليل شامل لكافة بيانات المشروع المخزنة وربط المعلومات تاريخيًا وتحليليًا قبل إصدار أي تقرير. كتابة تقارير بلغة استشارية احترافية تحليلية وليست وصفية، مركزة على تقييم المطابقة، تحليل المخاطر، ربط التنفيذ بالكود، وتقديم توصيات تنفيذية واضحة.
            
            **تنسيق إلزامي:**
            -  لا تستخدم أي سطور فارغة.
            - التقرير مهيأ للعرض على شاشة الموبايل Responsive.
            - العناوين الرئيسية واضحة ومميزة، والفرعية متدرجة (H1 / H2 / H3).
            -عناوين الفقرات يجب ان تكون خارج مربعات النص للفقرات بمعني ان يتم كتابة العنوان و بعدة مربع النص الذي يشرح الموضوع
            -  استخدم جداول ديناميكية لأي بيانات رقمية أو مقارنةاو اي بيانات تحتاج للعرض في جدول .
            - النقاط الحرجة أو التحذيرات داخل مربع تحذيري ملون (استخدم class="warning-box editable-box").
            - التوصيات المهمة داخل مربع توصيات ملون (استخدم class="success-box editable-box").
            - الملخص التنفيذي داخل مربع مميز (استخدم class="info-box editable-box").
            - لا تكرر البيانات ولا تكتب أي نص خارج إطار التقرير.
            - اجعل التقرير ديناميكياً (اختر النقاط التي تخدم التقرير بدون حشو).

            **تعليمات خاصة لتحليل تقارير الجسات (Geotechnical Reports):**
            عند تحليل تقرير تربة أو المقارنة بين تقارير، يجب تغطية المحاور التالية بدقة استشارية:
            1) **ملخص تنفيذي:** طبيعة الموقع، صلاحية التربة، المخاطر الجيوتقنية.
            2) **توصيف طبقات التربة:** وصف الطبقات، تفسير SPT N-Value، تصنيف USCS، التجانس.
            3) **المياه الجوفية:** التأثير على قدرة التحمل والهبوط، مخاطر الطفو (Uplift).
            4) **الخواص الهندسية:** (φ, C, γ, PI, Cc)، الانضغاطية، الانتفاخ.
            5) **قدرة التحمل:** حساب تقديري، مقارنة الأساسات (سطحية vs عميقة)، الأنسب فنياً واقتصادياً.
            6) **تحليل الهبوط:** فوري، متدرج، تفاوت الهبوط (Differential Settlement).
            7) **المخاطر الجيوتقنية:** Liquefaction, Expansive/Collapsible Soil.
            8) **التوصيات:** نوع الأساس، منسوب التأسيس، الإحلال، الحفر والدعم (Shoring)، احتياطات المياه.
            9) **ملاحظات نقدية:** كفاية الجسات، العمق، الاختبارات، هل التقرير محافظ أم متفائل؟
            *عند المقارنة:* قارن بدقة بين التوصيات، الإحلال، جهد التربة، ومنسوب المياه في جدول مقارنة واضح.

            **هيكل التقرير الإلزامي (اختر ما يناسب السياق ليكون ديناميكياً):**
            1️⃣ عنوان التقرير: احترافي يعكس نوع التحليل بدقة.
            2️⃣ بيانات المشروع: في جدول (اسم المشروع، المالك، الاستشاري، تاريخ التقرير، مرحلة المشروع، نوع التقرير).
            3️⃣ الملخص التنفيذي: (داخل info-box) يتضمن الحالة العامة، أهم نتيجة تحليلية، أخطر نقطة إن وجدت، التوصية الجوهرية.
            4️⃣ التحليل الفني التفصيلي: يختلف حسب الإدخال (جسات، اختبارات، صور تنفيذ، تقرير دوري، سؤال هندسي).
            5️⃣ جدول التقييم الفني: (البند، الحالة، درجة الخطورة، التأثير الزمني، التأثير المالي، التأثير على الجودة).
            6️⃣ المخاطر والتحذيرات: كل بند داخل warning-box (وصف المشكلة، سببها، أثرها، درجة الخطورة).
            7️⃣ التوصيات الاستشارية: داخل success-box (مرتبة حسب الأولوية، إجراءات تصحيحية ووقائية).
            8️⃣ الخلاصة الفنية: تقييم نهائي واضح (آمن/يحتاج تدخل، خطر محتمل، يتطلب قرار إداري).
            9️⃣ مرجع كودي داعم: أضف دائماً اقتباس فقرة من الكود المصري ذات الصلة بالموضوع مع شرح لها .
        `;

        try {
            const parts: any[] = [];
            if (file) {
                const part = await fileToPart(file, true);
                parts.push(part);
            }
            parts.push({ text: prompt });

            const result = await safeGenerateContent(MODEL_SMART, {
                contents: [{ role: 'user', parts }],
                config: { 
                    systemInstruction
                }
            });
            return result.text + getAiFooter(result.usedModel);
        } catch (e: any) {
            console.warn("Instant Expert AI call failed, providing code-based consultation:", e);
            return `
                <div class="info-box editable-box">
                    <strong><i class="fa-solid fa-user-graduate"></i> استشارة هندسية استرشادية (طبقاً للأكواد والمواصفات المصرية):</strong><br/>
                    بخصوص استفسارك: <strong>${prompt || 'الاستشارة الهندسية'}</strong>
                </div>
                <div class="prose text-slate-800 leading-relaxed">
                    <h3>أصول الصناعة والاشتراطات الفنية المعتمدة:</h3>
                    <p>1. <strong>الكود المصري لميكانيكا التربة وتصميم الأساسات (ECP 202):</strong> يُلزم بمطابقة تقارير الجسات وأخذ عينات دورية والتأكد من منسوب المياه الجوفية وتأثيرها على الأساسات وسحب المياه بحرص لتجنب هبوط المباني المجاورة.</p>
                    <p>2. <strong>الكود المصري لتصميم وتنفيذ المنشآت الخرسانية (ECP 203):</strong> يحدد الغطاء الخرساني (Concrete Cover) بحد أدنى 2.5 سم للبلاطات والكمرات و5 سم للعناصر الملامسة للتربة والمعزولة، و7.5 سم للعناصر الملامسة للتربة مباشرة بدون عزل.</p>
                    <p>3. <strong>قانون البناء الموحد رقم 119 ولائحته التنفيذية:</strong> يوجب إشراف مهندس نقابي معتمد وتوثيق دفاتر الموقع اليومية واعتماد استلام حديد التسليح والخرسانة المسلحة بمحاضر استلام رسمية.</p>
                </div>
                <div class="success-box editable-box">
                    <strong><i class="fa-solid fa-check-circle"></i> التوصيات التنفيذية:</strong>
                    <ul>
                        <li>مراجعة بنود المقايسة والمواصفات الفنية المعتمدة قبل التوريد أو التنفيذ.</li>
                        <li>إجراء اختبارات الجودة الموقعية (Slump Test واختبارات كسر المكعبات بعد 7 و 28 يوماً).</li>
                        <li>توثيق أي تغييرات في أوامر تعديل وتدوينها في دفاتر الموقع الفنية.</li>
                    </ul>
                </div>
                <div class="warning-box editable-box">
                    <strong>ملاحظة هامة:</strong> تعذر الاتصال الفوري بالخدمة الذكية حالياً، يتم عرض الإرشادات الهندسية القياسية لحين استعادة الاتصال.
                </div>
                ${getAiFooter('ECP-Consultant-Offline')}
            `;
        }
    },

    async refineSelectedText(selectedText: string, instruction: string): Promise<string> {
        const systemInstruction = `
            **ROLE:** Senior Engineering Editor.
            **TASK:** Refine text based on user instruction.
            **OUTPUT:** HTML Only. Maintain professional formatting.
        `;
        const prompt = `Text: "${selectedText}"\nInstruction: ${instruction}`;
        try {
            const result = await safeGenerateContent(MODEL_SMART, { contents: prompt, config: { systemInstruction } });
            return result.text;
        } catch (e) { return selectedText; }
    }
};
