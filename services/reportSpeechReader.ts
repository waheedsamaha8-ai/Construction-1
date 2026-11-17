// Zero-Quota Bilingual (Arabic + English) Report Text-to-Speech Reader
// Uses the browser's built-in Web Speech API with intelligent Arabic/English voice switching
// and engineering unit/abbreviation pronunciation normalization.

export interface SpeechSegment {
    text: string;
    lang: 'ar' | 'en';
}

export interface SpokenBlock {
    preview: string;
    segments: SpeechSegment[];
}

export interface ReportReaderCallbacks {
    onStart?: () => void;
    onProgress?: (blockIndex: number, totalBlocks: number, preview: string) => void;
    onPauseChange?: (paused: boolean) => void;
    onEnd?: () => void;
    onError?: (message: string) => void;
}

const normalizeEngineeringTextForSpeech = (raw: string): string => {
    if (!raw) return '';
    return raw
        // Normalize Arabic-Indic digits just in case & clean invisible marks
        .replace(/[\u200B-\u200F\u202A-\u202E]/g, ' ')
        // Replace currency & engineering units with natural spoken Arabic
        .replace(/(\d[\d,.]*)\s*ج\.?\s*م\.?(?=\s|$|[،.])/g, '$1 جنيه مصري')
        .replace(/(^|\s)ج\.?\s*م\.?(?=\s|$|[،.])/g, '$1 جنيه مصري')
        .replace(/(\d[\d,.]*)\s*م\s*[3³]/g, '$1 متر مكعب')
        .replace(/(^|\s)م\s*[3³](?=\s|$|[،.])/g, '$1 متر مكعب')
        .replace(/(\d[\d,.]*)\s*م\s*[2²]/g, '$1 متر مربع')
        .replace(/(^|\s)م\s*[2²](?=\s|$|[،.])/g, '$1 متر مربع')
        .replace(/(\d[\d,.]*)\s*م\.?\s*ط(?=\s|$|[،.])/g, '$1 متر طولي')
        .replace(/(\d[\d,.]*)\s*كجم(?=\s|$|[،.])/g, '$1 كيلوجرام')
        .replace(/(\d[\d,.]*)\s*%/g, '$1 في المائة')
        .replace(/(\d[\d,.]*)\s*\/\s*يوم/g, '$1 في اليوم')
        // Remove numbers formatting commas so TTS reads "25299" naturally instead of pausing at commas
        .replace(/(\d),(\d{3})/g, '$1$2')
        .replace(/(\d),(\d{3})/g, '$1$2')
        // Strip decorative bullets, pipes, repeated dots/dashes, emojis
        .replace(/[•▪▫◆◇★☆✔✖❌✅⚠📋📌📊🔍💰📝✨•]/g, ' ')
        .replace(/\.{3,}|_{2,}|-{3,}|={2,}/g, ' ')
        .replace(/\|/g, ' ، ')
        .replace(/\s+/g, ' ')
        .trim();
};

/**
 * Splits a clean sentence into sequential Arabic and English segments
 * so each language is pronounced by a matching voice.
 */
const splitBilingualSegments = (text: string): SpeechSegment[] => {
    if (!text) return [];
    // Match English words/acronyms/phrases (at least 2 Latin letters) possibly joined by spaces or hyphens
    const englishPhraseRegex = /([A-Za-z][A-Za-z0-9]*(?:[\s\-/&]+[A-Za-z0-9]+)*)/g;
    const segments: SpeechSegment[] = [];
    let lastIdx = 0;
    let match: RegExpExecArray | null;

    while ((match = englishPhraseRegex.exec(text)) !== null) {
        const idx = match.index;
        const matchedStr = match[1].trim();
        // Keep single stray letters in current flow unless meaningful
        if (matchedStr.replace(/[^A-Za-z]/g, '').length < 2) {
            continue;
        }
        if (idx > lastIdx) {
            const arPart = text.slice(lastIdx, idx).trim();
            if (arPart) segments.push({ text: arPart, lang: 'ar' });
        }
        segments.push({ text: matchedStr, lang: 'en' });
        lastIdx = idx + match[0].length;
    }

    if (lastIdx < text.length) {
        const tail = text.slice(lastIdx).trim();
        if (tail) segments.push({ text: tail, lang: 'ar' });
    }

    return segments.length > 0 ? segments : [{ text, lang: 'ar' }];
};

/**
 * Extracts natural spoken blocks from a rendered HTML report container,
 * turning tables and bullet lists into clear readable phrases.
 */
export const extractSpokenBlocksFromElement = (rootEl: HTMLElement): SpokenBlock[] => {
    const blocks: SpokenBlock[] = [];
    if (!rootEl) return blocks;

    const pushLine = (rawLine: string) => {
        const cleaned = normalizeEngineeringTextForSpeech(rawLine);
        if (!cleaned || cleaned.length < 2) return;
        // Skip signature dots/empty placeholders
        if (/^(?:التوقيع|الاسم)\s*[:：]?$/.test(cleaned)) return;

        // Split overly long paragraphs at Arabic/English sentence punctuation to prevent browser TTS stalls
        const subSentences = cleaned.split(/(?<=[.،؛!\n])\s+/).filter((s) => s.trim().length > 0);
        if (subSentences.length <= 1 && cleaned.length <= 220) {
            blocks.push({
                preview: cleaned,
                segments: splitBilingualSegments(cleaned),
            });
            return;
        }

        let buffer = '';
        for (const sent of subSentences) {
            if ((buffer + ' ' + sent).length > 180 && buffer.trim()) {
                const b = buffer.trim();
                blocks.push({ preview: b, segments: splitBilingualSegments(b) });
                buffer = sent;
            } else {
                buffer = buffer ? `${buffer} ${sent}` : sent;
            }
        }
        if (buffer.trim()) {
            const b = buffer.trim();
            blocks.push({ preview: b, segments: splitBilingualSegments(b) });
        }
    };

    const readTable = (table: HTMLTableElement) => {
        if (table.classList.contains('qc-signatures-table') || table.classList.contains('qc-photos-table')) {
            return;
        }
        const headerRow = table.querySelector('thead tr') || table.querySelector('tr');
        const headers = headerRow
            ? Array.from(headerRow.children).map((c) => normalizeEngineeringTextForSpeech(c.textContent || ''))
            : [];

        const rows = Array.from(table.querySelectorAll('tr')).filter((r) => r !== headerRow && !r.closest('thead'));
        for (const row of rows) {
            const cells = Array.from(row.children) as HTMLElement[];
            if (cells.length === 0) continue;

            // Summary / spanned rows
            if (cells.some((c) => parseInt(c.getAttribute('colspan') || '1', 10) > 1)) {
                const line = cells
                    .map((c) => normalizeEngineeringTextForSpeech(c.textContent || ''))
                    .filter(Boolean)
                    .join(' : ');
                pushLine(line);
                continue;
            }

            const parts: string[] = [];
            cells.forEach((c, idx) => {
                const val = normalizeEngineeringTextForSpeech(c.textContent || '');
                if (!val || val === '-' || val === '...') return;
                const hdr = headers[idx];
                if (idx === 0) {
                    parts.push(val);
                } else if (hdr && hdr.length < 30 && !hdr.includes('البيان') && !hdr.includes('البند')) {
                    parts.push(`${hdr} ${val}`);
                } else {
                    parts.push(val);
                }
            });
            if (parts.length > 0) {
                pushLine(parts.join(' ، '));
            }
        }
    };

    const walk = (node: Node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const el = node as HTMLElement;
        const tag = el.tagName;

        if (el.classList.contains('no-print') || tag === 'STYLE' || tag === 'SCRIPT') return;

        if (tag === 'TABLE') {
            readTable(el as HTMLTableElement);
            return;
        }
        if (tag === 'H1' || tag === 'H2' || tag === 'H3' || tag === 'H4' || tag === 'P' || tag === 'LI') {
            pushLine(el.textContent || '');
            return;
        }
        // Generic div/section with direct text & no block children
        const hasBlockChildren = Array.from(el.children).some((ch) =>
            ['H1', 'H2', 'H3', 'H4', 'P', 'UL', 'OL', 'LI', 'TABLE', 'DIV'].includes(ch.tagName)
        );
        if (!hasBlockChildren) {
            pushLine(el.textContent || '');
            return;
        }
        Array.from(el.childNodes).forEach(walk);
    };

    Array.from(rootEl.childNodes).forEach(walk);
    return blocks;
};

const pickBestVoice = (voices: SpeechSynthesisVoice[], targetLang: 'ar' | 'en'): SpeechSynthesisVoice | null => {
    if (!voices || voices.length === 0) return null;
    if (targetLang === 'ar') {
        const arVoices = voices.filter((v) => v.lang.toLowerCase().startsWith('ar'));
        if (arVoices.length === 0) return null;
        return (
            arVoices.find((v) => /natural|neural|online|salma|shakir|hoda|naayf|tarik|laila|google/i.test(v.name)) ||
            arVoices.find((v) => v.lang.toLowerCase().includes('eg')) ||
            arVoices.find((v) => v.lang.toLowerCase().includes('sa')) ||
            arVoices[0]
        );
    }
    const enVoices = voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
    if (enVoices.length === 0) return null;
    return (
        enVoices.find((v) => /natural|neural|online|aria|jenny|guy|google us|samantha/i.test(v.name)) ||
        enVoices.find((v) => v.lang.toLowerCase() === 'en-us') ||
        enVoices[0]
    );
};

class ReportSpeechController {
    private isStopped = true;
    private isPausedState = false;
    private rate = 1.0;
    private blocks: SpokenBlock[] = [];
    private currentBlockIdx = 0;
    private currentSegIdx = 0;
    private callbacks: ReportReaderCallbacks = {};
    private activeUtterance: SpeechSynthesisUtterance | null = null;

    public isSupported(): boolean {
        return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
    }

    public setRate(newRate: number) {
        this.rate = Math.max(0.7, Math.min(1.6, newRate));
    }

    public getRate(): number {
        return this.rate;
    }

    public start(rootEl: HTMLElement, callbacks: ReportReaderCallbacks, rate: number = 1.0) {
        this.stop(true);
        if (!this.isSupported()) {
            callbacks.onError?.('المتصفح الحالي لا يدعم القراءة الصوتية للنصوص.');
            return;
        }

        const blocks = extractSpokenBlocksFromElement(rootEl);
        if (blocks.length === 0) {
            callbacks.onError?.('لا يوجد نص مقروء في هذا التقرير.');
            return;
        }

        this.blocks = blocks;
        this.callbacks = callbacks;
        this.rate = rate;
        this.isStopped = false;
        this.isPausedState = false;
        this.currentBlockIdx = 0;
        this.currentSegIdx = 0;

        // Ensure voices are loaded (Chrome loads asynchronously first time)
        const begin = () => {
            if (this.isStopped) return;
            this.callbacks.onStart?.();
            this.speakNextSegment();
        };

        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
            begin();
        } else {
            let started = false;
            const handleVoices = () => {
                if (started) return;
                started = true;
                window.speechSynthesis.removeEventListener('voiceschanged', handleVoices);
                begin();
            };
            window.speechSynthesis.addEventListener('voiceschanged', handleVoices);
            // Fallback timeout in case voiceschanged doesn't fire
            setTimeout(handleVoices, 250);
        }
    }

    private speakNextSegment() {
        if (this.isStopped || !this.isSupported()) return;

        if (this.currentBlockIdx >= this.blocks.length) {
            this.stop(false);
            return;
        }

        const block = this.blocks[this.currentBlockIdx];
        if (this.currentSegIdx === 0) {
            this.callbacks.onProgress?.(this.currentBlockIdx, this.blocks.length, block.preview);
        }

        if (this.currentSegIdx >= block.segments.length) {
            this.currentBlockIdx += 1;
            this.currentSegIdx = 0;
            this.speakNextSegment();
            return;
        }

        const seg = block.segments[this.currentSegIdx];
        const voices = window.speechSynthesis.getVoices();
        const utterance = new SpeechSynthesisUtterance(seg.text);
        utterance.lang = seg.lang === 'en' ? 'en-US' : 'ar-EG';
        utterance.rate = seg.lang === 'en' ? Math.max(0.85, this.rate * 0.95) : this.rate;
        utterance.pitch = 1.0;

        const chosenVoice = pickBestVoice(voices, seg.lang);
        if (chosenVoice) {
            utterance.voice = chosenVoice;
            utterance.lang = chosenVoice.lang;
        }

        utterance.onend = () => {
            if (this.isStopped) return;
            this.currentSegIdx += 1;
            this.speakNextSegment();
        };

        utterance.onerror = (ev: any) => {
            // 'interrupted' or 'canceled' happens naturally during stop()
            if (this.isStopped || ev?.error === 'interrupted' || ev?.error === 'canceled') return;
            this.currentSegIdx += 1;
            this.speakNextSegment();
        };

        this.activeUtterance = utterance;
        window.speechSynthesis.speak(utterance);
    }

    public pause() {
        if (!this.isSupported() || this.isStopped || this.isPausedState) return;
        window.speechSynthesis.pause();
        this.isPausedState = true;
        this.callbacks.onPauseChange?.(true);
    }

    public resume() {
        if (!this.isSupported() || this.isStopped || !this.isPausedState) return;
        window.speechSynthesis.resume();
        this.isPausedState = false;
        this.callbacks.onPauseChange?.(false);
    }

    public stop(silent: boolean = false) {
        const wasActive = !this.isStopped;
        this.isStopped = true;
        this.isPausedState = false;
        this.activeUtterance = null;
        if (this.isSupported()) {
            try {
                window.speechSynthesis.cancel();
            } catch {}
        }
        if (!silent && wasActive) {
            this.callbacks.onEnd?.();
        }
    }
}

export const reportSpeechReader = new ReportSpeechController();

/**
 * Generates 8 smart, tailored question & edit prompt cards dynamically from the report HTML
 * with ZERO AI quota consumption.
 */
export const generateContextualReportPrompts = (html: string): { label: string; icon: string }[] => {
    if (!html) return [];
    const plain = html
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const isPricing =
        plain.includes('تحليل السعر') ||
        plain.includes('ملخص التسعير') ||
        plain.includes('هامش الربح') ||
        plain.includes('الهالك') ||
        plain.includes('يومية الطاقم');

    const isBoqOrMaterials =
        plain.includes('المقايسة') ||
        plain.includes('التعاقدي') ||
        plain.includes('المنفذ') ||
        plain.includes('حصر الخامات') ||
        plain.includes('معدلات الإنتاج');

    const isPaymentOrFinance =
        plain.includes('مستخلص') ||
        plain.includes('الموقف المالي') ||
        plain.includes('صافي مستحق') ||
        plain.includes('ضمان الأعمال') ||
        plain.includes('المصرف');

    const isQcOrSoilOrInspection =
        plain.includes('فحص') ||
        plain.includes('استلام') ||
        plain.includes('مطابق') ||
        plain.includes('التربة') ||
        plain.includes('جسات') ||
        plain.includes('اختبار') ||
        plain.includes('معاينة');

    const isDailyLogs =
        plain.includes('اليوميات') ||
        plain.includes('سير العمل') ||
        plain.includes('المعوقات') ||
        plain.includes('فترات التوقف');

    if (isPricing) {
        return [
            { label: 'اشرح ملخص السعر النهائي', icon: 'fa-coins' },
            { label: 'عدّل هامش الربح إلى 20%', icon: 'fa-percent' },
            { label: 'عدّل غير المباشر إلى 12%', icon: 'fa-sliders' },
            { label: 'كيف نخفض تكلفة الخامات والهالك؟', icon: 'fa-arrow-trend-down' },
            { label: 'هل معدلات العمالة واقعية؟', icon: 'fa-users-gear' },
            { label: 'أضف مقارنة بدائل موفرة للسوق', icon: 'fa-scale-balanced' },
            { label: 'أضف ملاحظات تعاقدية للتسعير', icon: 'fa-file-signature' },
            { label: 'لخّص التقرير في 4 نقاط للمالك', icon: 'fa-list-check' },
        ];
    }

    if (isPaymentOrFinance) {
        return [
            { label: 'لخّص الموقف المالي ونسبة الصرف', icon: 'fa-chart-pie' },
            { label: 'راجع الأرقام والجمع والاستقطاعات', icon: 'fa-calculator' },
            { label: 'هل توجد بنود متأخرة أو مخاطر مالية؟', icon: 'fa-triangle-exclamation' },
            { label: 'أضف جدول توصيات للإدارة المالية', icon: 'fa-table' },
            { label: 'حلّل الفجوة بين المنفذ والمنصرف', icon: 'fa-magnifying-glass-chart' },
            { label: 'أضف خطة تسريع الإنجاز والصرف', icon: 'fa-rocket' },
            { label: 'صِغ ملخصاً تنفيذياً للعرض على المالك', icon: 'fa-user-tie' },
            { label: 'أضف بند حفظ الحقوق التعاقدية', icon: 'fa-shield-halved' },
        ];
    }

    if (isQcOrSoilOrInspection) {
        return [
            { label: 'ما أهم الملاحظات ومخالفات الكود؟', icon: 'fa-clipboard-check' },
            { label: 'أضف خطوات المعالجة والإصلاح الفني', icon: 'fa-wrench' },
            { label: 'اذكر نصوص الكود المصري المرجعية', icon: 'fa-book-open' },
            { label: 'أضف اختبارات ضبط الجودة المطلوبة', icon: 'fa-flask-vial' },
            { label: 'أضف نقاط فحص إضافية للجدول', icon: 'fa-plus-circle' },
            { label: 'حدّد قرار الاستشاري النهائي بوضوح', icon: 'fa-gavel' },
            { label: 'اكتب صيغة توجيه رسمي للمقاول', icon: 'fa-envelope-open-text' },
            { label: 'لخّص نتائج الفحص في 5 نقاط', icon: 'fa-list-ul' },
        ];
    }

    if (isBoqOrMaterials) {
        return [
            { label: 'راجع الكميات والحسابات بالتقرير', icon: 'fa-calculator' },
            { label: 'ما البنود المتبقية والأكثر أولوية؟', icon: 'fa-bars-progress' },
            { label: 'أضف جدولاً زمنياً لتوريد الخامات', icon: 'fa-truck-ramp-box' },
            { label: 'أضف اشتراطات التشوين ومنع الفاقد', icon: 'fa-boxes-stacked' },
            { label: 'احسب الاحتياج لإنهاء الكمية المتبقية', icon: 'fa-cubes' },
            { label: 'أضف توصيات رفع إنتاجية الأطقم', icon: 'fa-helmet-safety' },
            { label: 'حوّل الخلاصة لمذكرة فنية مختصرة', icon: 'fa-file-lines' },
            { label: 'لخّص أهم أرقام التقرير', icon: 'fa-list-check' },
        ];
    }

    if (isDailyLogs) {
        return [
            { label: 'استخرج أهم إنجازات الفترة', icon: 'fa-calendar-check' },
            { label: 'حلّل أسباب التوقف والمعوقات', icon: 'fa-clock-rotate-left' },
            { label: 'أضف توصيات لزيادة معدل الأداء', icon: 'fa-gauge-high' },
            { label: 'أضف اشتراطات السلامة المهنية', icon: 'fa-hard-hat' },
            { label: 'قيّم توزيع العمالة والأنشطة', icon: 'fa-people-group' },
            { label: 'أضف توجيهات حازمة لمدير الموقع', icon: 'fa-bullhorn' },
            { label: 'أضف جدولاً بالخطوات القادمة', icon: 'fa-table-list' },
            { label: 'لخّص الموقف للاجتماع الأسبوعي', icon: 'fa-briefcase' },
        ];
    }

    return [
        { label: 'لخّص أهم نقاط التقرير', icon: 'fa-list-check' },
        { label: 'أضف توصيات هندسية وعملية', icon: 'fa-lightbulb' },
        { label: 'راجع الأرقام والحسابات بدقة', icon: 'fa-calculator' },
        { label: 'ما المخاطر والنقاط الحرجة هنا؟', icon: 'fa-triangle-exclamation' },
        { label: 'أضف المرجعية وفق الكود المصري', icon: 'fa-book' },
        { label: 'أضف جدول ملخص للخطوات المطلوبة', icon: 'fa-table' },
        { label: 'حسّن الصياغة لتكون رسمية وأقوى', icon: 'fa-pen-nib' },
        { label: 'اشرح التقرير بأسلوب مبسط', icon: 'fa-comments' },
    ];
};
