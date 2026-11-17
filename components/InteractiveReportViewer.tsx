import React, { useState, useRef, useEffect, useMemo } from 'react';
import { aiHelper } from '../services/aiHelper';
import {
    recalculateReportTables,
    recalculateReportHtmlString,
    cleanTransientCalcHtml,
} from '../services/reportCalculationEngine';
import {
    reportSpeechReader,
    generateContextualReportPrompts,
} from '../services/reportSpeechReader';

export const formatInteractiveReportHtml = (rawHtml: string): string => {
    if (!rawHtml) return '';
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(rawHtml, 'text/html');

        // Sanitize embedded <style> tags so legacy rules never break layout
        const styleTags = doc.querySelectorAll('style');
        styleTags.forEach((styleEl) => {
            if (styleEl.textContent) {
                styleEl.textContent = styleEl.textContent
                    .replace(/html\s*,\s*body\s*\{[^}]*\}/gi, '')
                    .replace(/body\s*\{[^}]*\}/gi, '')
                    .replace(/\.bg-slate-900\s*\*/g, '.report-body .bg-slate-900 *')
                    .replace(/\.bg-blue-900\s*\*/g, '.report-body .bg-blue-900 *')
                    .replace(/\.bg-indigo-900\s*\*/g, '.report-body .bg-indigo-900 *')
                    .replace(/\.bg-slate-800\s*\*/g, '.report-body .bg-slate-800 *')
                    .replace(/\.bg-blue-800\s*\*/g, '.report-body .bg-blue-800 *')
                    .replace(/\.report-container\s+h1/g, '.report-body h1')
                    .replace(/\.report-container\s+h2/g, '.report-body h2')
                    .replace(/\.report-container\s+h3/g, '.report-body h3')
                    .replace(/\.report-container\s+h4/g, '.report-body h4')
                    .replace(/\.report-body\s+h1\s*,\s*h1\b/g, '.report-body h1')
                    .replace(/\.report-body\s+h2\s*,\s*h2\b/g, '.report-body h2')
                    .replace(/\.report-body\s+h3\s*,\s*h3\s*,\s*\.report-body\s+h4\s*,\s*h4\b/g, '.report-body h3, .report-body h4')
                    .replace(/h1\s*,\s*h2\s*,\s*h3\b/g, '.report-body h1, .report-body h2, .report-body h3')
                    .replace(/strong\s*\{\s*color:\s*#0f172a\s*;?\s*\}/g, '.report-body strong { color: inherit; }');
            }
        });

        // Helper to detect if a background color string represents a dark/blue color
        const isDarkOrBlueBg = (bgStr: string): boolean => {
            const s = bgStr.toLowerCase().trim();
            if (!s || s === 'transparent' || s === 'none' || s === 'inherit' || s === 'initial') return false;
            if (
                s.includes('#1e3a8a') ||
                s.includes('#1e40af') ||
                s.includes('#1d4ed8') ||
                s.includes('#2563eb') ||
                s.includes('#3b82f6') ||
                s.includes('#0f172a') ||
                s.includes('#1e293b') ||
                s.includes('#312e81') ||
                s.includes('#3730a3') ||
                s.includes('#111827') ||
                s.includes('#0284c7') ||
                s.includes('#0369a1') ||
                s.includes('#075985') ||
                s.includes('#0c4a6e') ||
                s.includes('navy') ||
                s.includes('darkblue') ||
                s.includes('linear-gradient')
            ) {
                if (s.includes('linear-gradient') && (s.includes('#f8fafc') || s.includes('#eff6ff') || s.includes('#ffffff') || s.includes('#f0fdf4'))) {
                    return false;
                }
                return true;
            }
            const hexMatch = s.match(/#([0-9a-f]{3,6})\b/i);
            if (hexMatch) {
                const raw = hexMatch[1];
                const full = raw.length === 3 ? raw.split('').map(c => c + c).join('') : raw;
                if (full.length === 6) {
                    const r = parseInt(full.slice(0, 2), 16);
                    const g = parseInt(full.slice(2, 4), 16);
                    const b = parseInt(full.slice(4, 6), 16);
                    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
                    return yiq < 165;
                }
            }
            const rgbMatch = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
            if (rgbMatch) {
                const r = parseInt(rgbMatch[1], 10);
                const g = parseInt(rgbMatch[2], 10);
                const b = parseInt(rgbMatch[3], 10);
                const yiq = (r * 299 + g * 587 + b * 114) / 1000;
                return yiq < 165;
            }
            return false;
        };

        // 1. Check if this document is a saved Letter (خطاب) from LetterEditor with showHeader explicitly enabled
        const settingsEl = doc.getElementById('saved-page-settings');
        let isLetterWithHeader = false;
        if (settingsEl && settingsEl.dataset?.config) {
            try {
                const cfg = JSON.parse(decodeURIComponent(settingsEl.dataset.config));
                if (cfg && cfg.showHeader === true) {
                    isLetterWithHeader = true;
                }
            } catch {}
        }

        // Remove .report-header boxes across all AI reports (preserving main title as a clean <h1> only if the body has no main title)
        if (!isLetterWithHeader) {
            const reportHeaders = Array.from(doc.querySelectorAll('.report-header'));
            const bodyHeadingsOutsideHeader = Array.from(doc.querySelectorAll('h1, h2')).filter(
                (h) => !h.closest('.report-header')
            );
            reportHeaders.forEach((headerEl) => {
                const titleCandidate = headerEl.querySelector('h1, h2');
                const titleText = titleCandidate?.textContent?.trim() || '';
                const isGenericArchiveTitle =
                    !titleText ||
                    titleText.startsWith('استشارة هندسية') ||
                    titleText.startsWith('مسودة_') ||
                    titleText.includes('....');

                if (bodyHeadingsOutsideHeader.length === 0 && !isGenericArchiveTitle && headerEl.parentNode) {
                    const cleanH1 = doc.createElement('h1');
                    cleanH1.textContent = titleText;
                    headerEl.parentNode.insertBefore(cleanH1, headerEl);
                    bodyHeadingsOutsideHeader.push(cleanH1);
                }
                headerEl.remove();
            });
        }

        // 2. Strip any dark/blue header banners generated inline by AI so no blue header box ever appears in reports
        const darkBgElements = doc.querySelectorAll('[style*="background"]');
        darkBgElements.forEach((node) => {
            const el = node as HTMLElement;
            if (isLetterWithHeader && el.closest('.report-header')) return;
            if (el.tagName === 'TH' || el.tagName === 'TD' || el.tagName === 'TR' || el.tagName === 'TABLE') return;
            const inlineStyle = el.getAttribute('style') || '';
            const bgMatch = inlineStyle.match(/background(?:-color)?\s*:\s*([^;]+)/i);
            const bgValue = bgMatch ? bgMatch[1] : '';
            if (isDarkOrBlueBg(bgValue)) {
                const text = el.textContent?.trim() || '';
                if (text.includes('REF-') && text.includes('التاريخ')) {
                    el.remove();
                    return;
                }
                el.style.removeProperty('background');
                el.style.removeProperty('background-color');
                el.style.removeProperty('border');
                el.style.removeProperty('border-radius');
                el.style.removeProperty('padding');
                el.style.removeProperty('box-shadow');
                el.style.setProperty('background', 'transparent', 'important');
                el.style.setProperty('color', '#0f172a', 'important');
                el.querySelectorAll('*').forEach((child) => {
                    (child as HTMLElement).style.removeProperty('color');
                });
            }
        });

        // 3. Clean inline box styles from all headings (h1, h2, h3, h4) so they share a unified, clean visual hierarchy
        doc.querySelectorAll('h1, h2, h3, h4').forEach((hNode) => {
            const h = hNode as HTMLElement;
            h.style.removeProperty('background');
            h.style.removeProperty('background-color');
            h.style.removeProperty('border');
            h.style.removeProperty('border-radius');
            h.style.removeProperty('box-shadow');
            h.style.removeProperty('display');
            h.style.removeProperty('width');
        });

        // 4. Convert any legacy BOQ item summary box (.boq-item-summary-card or .info-box containing BOQ item pills) into a compact, organized small table at the top of the report
        const candidateSummaryBoxes = doc.querySelectorAll('.boq-item-summary-card, .info-box');
        candidateSummaryBoxes.forEach((box) => {
            const text = (box.textContent || '').replace(/\s+/g, ' ').trim();
            if (text.includes('الوحدة:') && (text.includes('التعاقدي:') || text.includes('الكمية التعاقدية:')) && (text.includes('المنفذ:') || text.includes('الكمية المنفذة:'))) {
                const titleMatch = text.match(/بند\s*\([^)]+\)\s*-\s*[^|]+?(?=\s*الوحدة:|$)/);
                const rawTitle = titleMatch
                    ? titleMatch[0].replace('📋', '').trim()
                    : (box.querySelector('div div')?.textContent || 'بند المقايسة').replace('📋', '').trim();
                const unitMatch = text.match(/الوحدة:\s*([^\s|]+)/);
                const contractMatch = text.match(/(?:التعاقدي|الكمية التعاقدية):\s*([^\s|]+)/);
                const execMatch = text.match(/(?:المنفذ|الكمية المنفذة):\s*([^\s|]+)/);
                const remMatch = text.match(/(?:المتبقي|الكمية المتبقية):\s*([^\s|]+)/);
                const priceMatch = text.match(/(?:الفئة|فئة البند):\s*([0-9.,]+\s*(?:ج\.م)?)/);

                const miniWrapper = doc.createElement('div');
                miniWrapper.className = 'table-responsive-wrapper';
                miniWrapper.innerHTML = `
                    <table class="boq-summary-mini-table">
                        <thead>
                            <tr>
                                <th>البند / القسم</th>
                                <th>الوحدة</th>
                                <th>التعاقدي</th>
                                <th>المنفذ</th>
                                <th>المتبقي</th>
                                <th>الفئة</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>${rawTitle}</td>
                                <td>${unitMatch ? unitMatch[1] : '-'}</td>
                                <td>${contractMatch ? contractMatch[1] : '0'}</td>
                                <td>${execMatch ? execMatch[1] : '0'}</td>
                                <td>${remMatch ? remMatch[1] : '0'}</td>
                                <td>${priceMatch ? priceMatch[1].trim() : '-'}</td>
                            </tr>
                        </tbody>
                    </table>
                `;
                box.replaceWith(miniWrapper);
            }
        });

        // 5. Ensure tables are NEVER trapped inside a text box (.info-box, .editable-box, etc.), are displayed at a suitable print-like width, and scroll horizontally on screen
        const tables = doc.querySelectorAll('table');
        tables.forEach((table) => {
            const isMiniSummaryTable = table.classList.contains('boq-summary-mini-table');

            // If table was placed inside a callout text box (.info-box, .warning-box, .success-box, .cost-box, .highlight-box, .editable-box), unwrap it out of the box
            const parentBox = table.closest('.info-box, .warning-box, .success-box, .cost-box, .highlight-box, .editable-box');
            if (parentBox && parentBox.parentNode) {
                parentBox.parentNode.insertBefore(table, parentBox.nextSibling);
                if (!parentBox.textContent?.trim()) {
                    parentBox.remove();
                }
            }

            // Wrap table in a clean horizontal scroll container (without any outer text-box border)
            let wrapper = table.parentElement?.classList.contains('table-responsive-wrapper')
                ? (table.parentElement as HTMLElement)
                : null;
            if (!wrapper) {
                wrapper = doc.createElement('div');
                wrapper.className = 'table-responsive-wrapper';
                table.parentNode?.insertBefore(wrapper, table);
                wrapper.appendChild(table);
            }
            wrapper.removeAttribute('style');
            wrapper.style.setProperty('width', '100%', 'important');
            wrapper.style.setProperty('max-width', '100%', 'important');
            wrapper.style.setProperty('overflow-x', 'auto', 'important');
            (wrapper.style as any).webkitOverflowScrolling = 'touch';
            wrapper.style.setProperty('border', 'none', 'important');
            wrapper.style.setProperty('border-radius', '0', 'important');
            wrapper.style.setProperty('background', 'transparent', 'important');
            wrapper.style.setProperty('padding', isMiniSummaryTable ? '0 0 4px 0' : '0 0 6px 0', 'important');
            wrapper.style.setProperty('margin', isMiniSummaryTable ? '0 0 10px 0' : '12px 0', 'important');

            table.style.setProperty('width', '100%', 'important');
            table.style.setProperty('min-width', isMiniSummaryTable ? '420px' : '580px', 'important');
            table.style.setProperty('table-layout', 'auto', 'important');
            table.style.setProperty('border-collapse', 'collapse', 'important');

            // Ensure all cells and column headers wrap sentences naturally at spaces WITHOUT breaking words mid-word
            const allCells = table.querySelectorAll('th, td');
            allCells.forEach((c) => {
                const cell = c as HTMLElement;
                cell.removeAttribute('nowrap');
                cell.style.removeProperty('max-width');
                if (!isMiniSummaryTable) {
                    cell.style.removeProperty('background');
                    cell.style.removeProperty('background-color');
                    cell.style.removeProperty('color');
                }
                cell.style.setProperty('white-space', 'normal', 'important');
                cell.style.setProperty('word-break', 'normal', 'important');
                cell.style.setProperty('overflow-wrap', 'normal', 'important');
                (cell.style as any).setProperty('word-wrap', 'normal', 'important');
            });
        });

        return doc.body.innerHTML;
    } catch (e) {
        return rawHtml;
    }
};

export const applyTableColumnWidthToHtml = (
    rawHtml: string,
    tableIdx: number,
    colIdx: number,
    percent: number | 'auto'
): string => {
    if (!rawHtml) return '';
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(rawHtml, 'text/html');
        const tables = doc.querySelectorAll('table');
        const targetTable = tables[tableIdx] as HTMLTableElement | undefined;
        if (!targetTable) return rawHtml;

        targetTable.style.setProperty('width', '100%', 'important');
        targetTable.style.setProperty('min-width', '580px', 'important');
        targetTable.style.setProperty('table-layout', percent === 'auto' ? 'auto' : 'fixed', 'important');

        const rows = Array.from(targetTable.querySelectorAll('tr'));
        const headerRow = targetTable.querySelector('thead tr') || rows[0];
        const colCount = headerRow ? headerRow.children.length : 0;

        // Calculate proportional widths for remaining columns so total equals 100%
        let adjustedOtherWidths: Record<number, string> = {};
        if (typeof percent === 'number' && headerRow && colCount > 1) {
            const remainingBudget = Math.max(10, 100 - percent);
            const otherCols: { idx: number; currentW: number }[] = [];
            let sumOtherExplicit = 0;

            Array.from(headerRow.children).forEach((c, idx) => {
                if (idx === colIdx) return;
                const el = c as HTMLElement;
                const m = (el.style.width || '').match(/(\d+(?:\.\d+)?)%/);
                const w = m ? parseFloat(m[1]) : Math.round(100 / colCount);
                otherCols.push({ idx, currentW: w });
                sumOtherExplicit += w;
            });

            if (sumOtherExplicit > 0) {
                otherCols.forEach((col) => {
                    const scaled = Math.max(4, Math.round((col.currentW / sumOtherExplicit) * remainingBudget));
                    adjustedOtherWidths[col.idx] = `${scaled}%`;
                });
            }
        }

        // Sync <colgroup> if present
        const colgroup = targetTable.querySelector('colgroup');
        if (colgroup) {
            const cols = Array.from(colgroup.querySelectorAll('col')) as HTMLElement[];
            cols.forEach((colEl, idx) => {
                if (percent === 'auto') {
                    colEl.style.removeProperty('width');
                } else if (idx === colIdx) {
                    colEl.style.setProperty('width', `${percent}%`, 'important');
                } else if (adjustedOtherWidths[idx]) {
                    colEl.style.setProperty('width', adjustedOtherWidths[idx], 'important');
                }
            });
        }

        rows.forEach((row) => {
            const cells = Array.from(row.children) as HTMLElement[];
            if (cells.length === 1 && cells[0].hasAttribute('colspan')) return;

            cells.forEach((cell, idx) => {
                cell.removeAttribute('nowrap');
                cell.style.removeProperty('min-width');
                cell.style.removeProperty('max-width');
                cell.style.setProperty('min-width', '0', 'important');
                cell.style.setProperty('max-width', 'none', 'important');
                cell.style.setProperty('white-space', 'normal', 'important');
                cell.style.setProperty('word-break', 'normal', 'important');
                cell.style.setProperty('overflow-wrap', 'normal', 'important');
                (cell.style as any).setProperty('word-wrap', 'normal', 'important');
                cell.style.setProperty('hyphens', 'none', 'important');

                cell.querySelectorAll('*').forEach((inner) => {
                    const el = inner as HTMLElement;
                    el.style.setProperty('white-space', 'normal', 'important');
                    el.style.setProperty('word-break', 'normal', 'important');
                    el.style.setProperty('overflow-wrap', 'normal', 'important');
                    (el.style as any).setProperty('word-wrap', 'normal', 'important');
                    el.style.setProperty('min-width', '0', 'important');
                });

                if (percent === 'auto') {
                    cell.style.removeProperty('width');
                } else if (idx === colIdx) {
                    cell.style.setProperty('width', `${percent}%`, 'important');
                } else if (adjustedOtherWidths[idx]) {
                    cell.style.setProperty('width', adjustedOtherWidths[idx], 'important');
                }
            });
        });

        return doc.body.innerHTML;
    } catch (e) {
        console.error('Failed to apply column width:', e);
        return rawHtml;
    }
};

interface InteractiveReportViewerProps {
    htmlContent: string;
    onContentChange?: (updatedHtml: string) => void;
    isDirectEditing?: boolean;
    onDirectEditChange?: (editing: boolean) => void;
    showFloatingEditBar?: boolean;
    showAiCommandBar?: boolean;
    className?: string;
}

interface ReportAiMessage {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    action?: 'discuss' | 'edit';
    isVoice?: boolean;
}

export const InteractiveReportViewer: React.FC<InteractiveReportViewerProps> = ({
    htmlContent,
    onContentChange,
    isDirectEditing: controlledEditing,
    onDirectEditChange,
    showFloatingEditBar = false,
    showAiCommandBar = true,
    className = '',
}) => {
    const [internalEditing, setInternalEditing] = useState(false);
    const isDirectEditing = controlledEditing !== undefined ? controlledEditing : internalEditing;
    const setIsDirectEditing = (val: boolean) => {
        if (onDirectEditChange) onDirectEditChange(val);
        else setInternalEditing(val);
    };

    const [editingColumnModal, setEditingColumnModal] = useState<{
        tableIndex: number;
        columnIndex: number;
        columnTitle: string;
        currentPercent: number;
    } | null>(null);
    const [customPercentInput, setCustomPercentInput] = useState<number>(25);
    const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    const [autoCalcNotice, setAutoCalcNotice] = useState(false);

    // End-of-Report AI Assistant Bar (Text + Voice)
    const [aiInput, setAiInput] = useState('');
    const [aiMode, setAiMode] = useState<'auto' | 'edit' | 'discuss'>('auto');
    const [isAiProcessing, setIsAiProcessing] = useState(false);
    const [aiThread, setAiThread] = useState<ReportAiMessage[]>([]);
    const [undoStack, setUndoStack] = useState<string[]>([]);
    const [aiError, setAiError] = useState<string | null>(null);
    const [isRecordingVoice, setIsRecordingVoice] = useState(false);
    const [voiceDuration, setVoiceDuration] = useState(0);
    const [showPromptCards, setShowPromptCards] = useState(true);

    // Zero-Quota Bilingual Report Reader (TTS)
    const [isReadingAloud, setIsReadingAloud] = useState(false);
    const [isSpeechPaused, setIsSpeechPaused] = useState(false);
    const [speechRate, setSpeechRate] = useState<number>(1.0);
    const [speechProgress, setSpeechProgress] = useState<{ index: number; total: number; preview: string }>({
        index: 0,
        total: 0,
        preview: '',
    });

    const containerRef = useRef<HTMLDivElement>(null);
    const editableRef = useRef<HTMLDivElement>(null);
    const saveTimerRef = useRef<any>(null);
    const recalcNoticeTimerRef = useRef<any>(null);
    const lastEditedCellRef = useRef<HTMLElement | null>(null);
    const lastCommittedHtmlRef = useRef<string | null>(null);
    const hasInitializedDomRef = useRef<boolean>(false);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const voiceStreamRef = useRef<MediaStream | null>(null);
    const voiceTimerRef = useRef<any>(null);
    const cancelVoiceFlagRef = useRef<boolean>(false);

    const formattedHtml = useMemo(() => formatInteractiveReportHtml(htmlContent), [htmlContent]);
    const contextualPrompts = useMemo(() => generateContextualReportPrompts(htmlContent), [htmlContent]);

    // Sync external htmlContent into editableRef ONLY when external content genuinely changes and NOT during active editing
    useEffect(() => {
        if (!editableRef.current) return;
        if (hasInitializedDomRef.current && htmlContent === lastCommittedHtmlRef.current) {
            return;
        }
        if (isDirectEditing && hasInitializedDomRef.current) {
            return;
        }
        if (editableRef.current.contains(document.activeElement)) {
            return;
        }
        editableRef.current.innerHTML = formattedHtml;
        hasInitializedDomRef.current = true;
    }, [formattedHtml, htmlContent, isDirectEditing]);

    // Cleanup timers, audio stream, and speech synthesis on unmount
    useEffect(() => {
        return () => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
            if (recalcNoticeTimerRef.current) clearTimeout(recalcNoticeTimerRef.current);
            if (voiceTimerRef.current) clearInterval(voiceTimerRef.current);
            if (voiceStreamRef.current) {
                voiceStreamRef.current.getTracks().forEach((t) => t.stop());
            }
            reportSpeechReader.stop(true);
        };
    }, []);

    const getActiveEditedCell = (): HTMLElement | null => {
        const sel = window.getSelection();
        const anchor = sel?.anchorNode;
        if (anchor && editableRef.current?.contains(anchor)) {
            const el = anchor.nodeType === Node.TEXT_NODE ? anchor.parentElement : (anchor as HTMLElement);
            const cell = el?.closest('td, th') as HTMLElement | null;
            if (cell) return cell;
        }
        const active = document.activeElement as HTMLElement | null;
        if (active && editableRef.current?.contains(active)) {
            return active.closest('td, th') as HTMLElement | null;
        }
        return null;
    };

    const commitHtmlChange = (newHtml: string) => {
        const cleaned = cleanTransientCalcHtml(newHtml);
        if (!onContentChange) return;
        lastCommittedHtmlRef.current = cleaned;
        setAutoSaveStatus('saving');
        onContentChange(cleaned);
        setAutoSaveStatus('saved');
        setTimeout(() => setAutoSaveStatus('idle'), 2000);
    };

    const triggerRecalcNotice = () => {
        setAutoCalcNotice(true);
        if (recalcNoticeTimerRef.current) clearTimeout(recalcNoticeTimerRef.current);
        recalcNoticeTimerRef.current = setTimeout(() => setAutoCalcNotice(false), 1800);
    };

    const handleDirectInput = () => {
        if (!editableRef.current) return;
        const activeCell = getActiveEditedCell();
        if (activeCell) {
            lastEditedCellRef.current = activeCell;
        }
        // Excel-like live automatic recalculation across dependent cells & tables
        const didRecalc = recalculateReportTables(editableRef.current, activeCell || lastEditedCellRef.current);
        if (didRecalc) {
            triggerRecalcNotice();
        }

        if (!onContentChange) return;
        setAutoSaveStatus('saving');
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
            const currentHtml = editableRef.current?.innerHTML;
            if (currentHtml !== undefined) {
                commitHtmlChange(currentHtml);
            }
        }, 450);
    };

    const handleDirectBlur = () => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        if (!editableRef.current) return;
        const didRecalc = recalculateReportTables(editableRef.current, lastEditedCellRef.current);
        if (didRecalc) {
            triggerRecalcNotice();
        }
        lastEditedCellRef.current = null;
        if (!onContentChange) return;
        commitHtmlChange(editableRef.current.innerHTML);
    };

    const handleRunAiCommand = async (textOverride?: string, audioBlob?: Blob) => {
        const instruction = (textOverride !== undefined ? textOverride : aiInput).trim();
        if (!instruction && !audioBlob) return;
        if (isAiProcessing) return;

        setAiError(null);
        setIsAiProcessing(true);

        const currentHtml = cleanTransientCalcHtml(editableRef.current?.innerHTML || htmlContent || '');
        const optimisticUserMsgId = `u_${Date.now()}`;
        const userLabel = audioBlob
            ? (instruction || 'أمر صوتي مسجل...')
            : instruction;

        setAiThread((prev) => [
            ...prev,
            { id: optimisticUserMsgId, role: 'user', text: userLabel, isVoice: Boolean(audioBlob) },
        ]);
        if (!audioBlob && textOverride === undefined) {
            setAiInput('');
        }

        try {
            const effectiveMode: 'auto' | 'edit' | 'discuss' =
                !onContentChange && aiMode === 'auto' ? 'discuss' : aiMode;

            const result = await aiHelper.discussOrModifyReportHtml({
                reportHtml: currentHtml,
                instruction: instruction || undefined,
                audioBlob,
                mode: effectiveMode,
                history: aiThread.map((m) => ({ role: m.role, text: m.text })),
            });

            // Update transcript on voice message if Gemini transcribed it
            if (audioBlob && result.transcript) {
                setAiThread((prev) =>
                    prev.map((m) =>
                        m.id === optimisticUserMsgId ? { ...m, text: result.transcript } : m
                    )
                );
            }

            if (result.action === 'edit' && result.updatedHtml && onContentChange) {
                const formatted = formatInteractiveReportHtml(result.updatedHtml);
                const recalculated = recalculateReportHtmlString(formatted);

                setUndoStack((prev) => [...prev.slice(-9), currentHtml]);
                if (editableRef.current) {
                    editableRef.current.innerHTML = recalculated;
                }
                commitHtmlChange(recalculated);
            }

            setAiThread((prev) => [
                ...prev,
                {
                    id: `a_${Date.now()}`,
                    role: 'assistant',
                    text: result.reply,
                    action: result.action,
                },
            ]);
        } catch (err: any) {
            setAiError(err?.message || 'تعذر تنفيذ الأمر على التقرير، يرجى المحاولة مرة أخرى.');
            setAiThread((prev) => prev.filter((m) => m.id !== optimisticUserMsgId));
        } finally {
            setIsAiProcessing(false);
        }
    };

    const handleUndoAiEdit = () => {
        if (undoStack.length === 0 || !onContentChange) return;
        const previousHtml = undoStack[undoStack.length - 1];
        setUndoStack((prev) => prev.slice(0, -1));
        const formatted = formatInteractiveReportHtml(previousHtml);
        if (editableRef.current) {
            editableRef.current.innerHTML = formatted;
        }
        commitHtmlChange(previousHtml);
        setAiThread((prev) => [
            ...prev,
            {
                id: `u_undo_${Date.now()}`,
                role: 'assistant',
                text: 'تم التراجع واستعادة نسخة التقرير السابقة بنجاح.',
                action: 'edit',
            },
        ]);
    };

    const startVoiceRecording = async () => {
        if (isRecordingVoice || isAiProcessing) return;
        setAiError(null);
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                setAiError('المتصفح لا يدعم تسجيل الصوت، يرجى استخدام الأمر الكتابي.');
                return;
            }
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            voiceStreamRef.current = stream;
            audioChunksRef.current = [];
            cancelVoiceFlagRef.current = false;

            const mimeOptions = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
            const supportedMime = mimeOptions.find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m));
            const recorder = supportedMime
                ? new MediaRecorder(stream, { mimeType: supportedMime })
                : new MediaRecorder(stream);

            recorder.ondataavailable = (ev) => {
                if (ev.data && ev.data.size > 0) {
                    audioChunksRef.current.push(ev.data);
                }
            };

            recorder.onstop = () => {
                if (voiceTimerRef.current) {
                    clearInterval(voiceTimerRef.current);
                    voiceTimerRef.current = null;
                }
                if (voiceStreamRef.current) {
                    voiceStreamRef.current.getTracks().forEach((t) => t.stop());
                    voiceStreamRef.current = null;
                }
                setIsRecordingVoice(false);
                setVoiceDuration(0);

                if (cancelVoiceFlagRef.current) {
                    audioChunksRef.current = [];
                    return;
                }

                const blob = new Blob(audioChunksRef.current, {
                    type: recorder.mimeType || 'audio/webm',
                });
                audioChunksRef.current = [];
                if (blob.size > 200) {
                    handleRunAiCommand(undefined, blob);
                } else {
                    setAiError('التسجيل الصوتي قصير جداً، يرجى المحاولة مرة أخرى.');
                }
            };

            mediaRecorderRef.current = recorder;
            recorder.start(250);
            setIsRecordingVoice(true);
            setVoiceDuration(0);
            voiceTimerRef.current = setInterval(() => {
                setVoiceDuration((s) => s + 1);
            }, 1000);
        } catch (err) {
            setAiError('تعذر الوصول إلى الميكروفون. يرجى السماح بصلاحية الميكروفون أو الكتابة.');
            setIsRecordingVoice(false);
        }
    };

    const stopAndSendVoiceRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            cancelVoiceFlagRef.current = false;
            mediaRecorderRef.current.stop();
        }
    };

    const cancelVoiceRecording = () => {
        cancelVoiceFlagRef.current = true;
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        } else {
            if (voiceStreamRef.current) {
                voiceStreamRef.current.getTracks().forEach((t) => t.stop());
                voiceStreamRef.current = null;
            }
            setIsRecordingVoice(false);
            setVoiceDuration(0);
        }
    };

    const formatDuration = (sec: number) => {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    const handleToggleReadAloud = () => {
        if (isReadingAloud) {
            reportSpeechReader.stop(false);
            setIsReadingAloud(false);
            setIsSpeechPaused(false);
            return;
        }
        if (!editableRef.current) return;
        setAiError(null);
        reportSpeechReader.start(
            editableRef.current,
            {
                onStart: () => {
                    setIsReadingAloud(true);
                    setIsSpeechPaused(false);
                },
                onProgress: (index, total, preview) => {
                    setSpeechProgress({ index, total, preview });
                },
                onPauseChange: (paused) => {
                    setIsSpeechPaused(paused);
                },
                onEnd: () => {
                    setIsReadingAloud(false);
                    setIsSpeechPaused(false);
                },
                onError: (msg) => {
                    setIsReadingAloud(false);
                    setIsSpeechPaused(false);
                    setAiError(msg);
                },
            },
            speechRate
        );
    };

    const handleTogglePauseSpeech = () => {
        if (!isReadingAloud) return;
        if (isSpeechPaused) reportSpeechReader.resume();
        else reportSpeechReader.pause();
    };

    const handleCycleSpeechRate = () => {
        const rates = [1.0, 1.2, 1.4, 0.85];
        const idx = rates.indexOf(speechRate);
        const nextRate = rates[(idx + 1) % rates.length];
        setSpeechRate(nextRate);
        reportSpeechReader.setRate(nextRate);
    };

    const handleTableClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (isDirectEditing) return;
        const target = e.target as HTMLElement;
        const th = target.closest('th');
        if (!th) return;
        const table = th.closest('table');
        if (!table) return;

        const row = th.parentElement;
        if (!row) return;

        const thElements = Array.from(row.children) as HTMLElement[];
        const colIndex = thElements.indexOf(th);
        if (colIndex === -1) return;

        const container = containerRef.current;
        if (!container) return;
        const allTables = Array.from(container.querySelectorAll('table'));
        const tableIdx = allTables.indexOf(table);
        if (tableIdx === -1) return;

        let currentPercent = 25;
        const styleWidth = th.style.width || '';
        const match = styleWidth.match(/(\d+)%/);
        if (match) {
            currentPercent = parseInt(match[1], 10);
        } else {
            const tableRect = table.getBoundingClientRect();
            const thRect = th.getBoundingClientRect();
            if (tableRect.width > 0) {
                currentPercent = Math.max(5, Math.min(80, Math.round((thRect.width / tableRect.width) * 100)));
            }
        }

        setEditingColumnModal({
            tableIndex: tableIdx,
            columnIndex: colIndex,
            columnTitle: th.innerText?.replace('⚙', '').trim() || `العمود ${colIndex + 1}`,
            currentPercent,
        });
        setCustomPercentInput(currentPercent);
    };

    const handleApplyColumnWidth = (percent: number | 'auto') => {
        if (!editingColumnModal) return;
        const baseHtml = editableRef.current?.innerHTML || htmlContent;
        const updatedHtml = applyTableColumnWidthToHtml(
            baseHtml,
            editingColumnModal.tableIndex,
            editingColumnModal.columnIndex,
            percent
        );
        if (editableRef.current) {
            editableRef.current.innerHTML = updatedHtml;
        }
        commitHtmlChange(updatedHtml);
        setEditingColumnModal(null);
    };

    return (
        <div ref={containerRef} className={`w-full relative ${className}`}>
            {/* Active Direct Edit Banner when triggered from 3-dots menu */}
            {isDirectEditing && !showFloatingEditBar && (
                <div className="mb-3 bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-indigo-500/10 border border-indigo-200 rounded-xl p-2.5 flex items-center justify-between gap-2 text-xs text-indigo-900 shadow-xs animate-fade-in no-print">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping shrink-0"></span>
                        <span className="font-bold">وضع التعديل المباشر مفعّل:</span>
                        <span className="text-slate-700 text-[11px]">انقر على أي خلية أو رقم للتعديل — يتم تحديث الحسابات والإجماليات تلقائياً كملف إكسل.</span>
                        {autoCalcNotice && (
                            <span className="text-teal-700 bg-teal-100 border border-teal-200 px-2 py-0.5 rounded-full font-bold text-[10px] flex items-center gap-1">
                                <i className="fa-solid fa-calculator text-[9px]"></i> تم تحديث الحسابات تلقائياً
                            </span>
                        )}
                        {autoSaveStatus === 'saving' && (
                            <span className="text-amber-600 font-bold text-[10px] flex items-center gap-1">
                                <i className="fa-solid fa-circle-notch fa-spin"></i> جاري الحفظ...
                            </span>
                        )}
                        {autoSaveStatus === 'saved' && (
                            <span className="text-emerald-600 font-bold text-[10px] flex items-center gap-1">
                                <i className="fa-solid fa-check"></i> تم الحفظ تلقائياً
                            </span>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            handleDirectBlur();
                            setIsDirectEditing(false);
                        }}
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold transition shrink-0 flex items-center gap-1"
                    >
                        <i className="fa-solid fa-check text-[10px]"></i>
                        <span>إنهاء التعديل</span>
                    </button>
                </div>
            )}

            {/* Optional Floating Toolbar for Direct Edit */}
            {showFloatingEditBar && (
                <div className="flex items-center justify-between gap-2 mb-2 px-2 py-1.5 bg-slate-100 border border-slate-200 rounded-xl no-print">
                    <div className="flex items-center gap-2 text-[11px] text-slate-600 font-bold">
                        <i className="fa-solid fa-table-columns text-indigo-600"></i>
                        <span>اضغط على رأس أي عمود بالجدول لتعديل عرضه (%)</span>
                        {autoSaveStatus === 'saving' && (
                            <span className="text-amber-600 flex items-center gap-1">
                                <i className="fa-solid fa-circle-notch fa-spin text-[10px]"></i> جاري الحفظ...
                            </span>
                        )}
                        {autoSaveStatus === 'saved' && (
                            <span className="text-emerald-600 flex items-center gap-1">
                                <i className="fa-solid fa-check text-[10px]"></i> تم الحفظ تلقائياً
                            </span>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            if (isDirectEditing) handleDirectBlur();
                            setIsDirectEditing(!isDirectEditing);
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-xs ${
                            isDirectEditing
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                        }`}
                        title={isDirectEditing ? 'إنهاء التعديل المباشر' : 'تعديل مباشر على التقرير والجداول'}
                    >
                        <i className={`fa-solid ${isDirectEditing ? 'fa-check' : 'fa-file-pen'} text-[11px]`}></i>
                        <span>{isDirectEditing ? 'إنهاء التعديل' : 'تعديل مباشر'}</span>
                    </button>
                </div>
            )}

            <style>{`
                .interactive-report-body { font-family: 'Cairo', 'Tajawal', sans-serif; font-size: 13px; color: #0f172a; line-height: 1.65; width: 100% !important; max-width: 100% !important; direction: rtl; text-align: right; }
                .interactive-report-body .report-container, .interactive-report-body .report-body { width: 100% !important; max-width: 100% !important; padding: 0 !important; margin: 0 !important; border: none !important; }
                .interactive-report-body p, .interactive-report-body li { font-size: 13px; font-weight: 600; line-height: 1.65; margin-bottom: 6px; text-align: right; }
                .interactive-report-body ul { list-style-type: disc; margin: 6px 0; padding-right: 1.5rem; }
                .interactive-report-body ol { list-style-type: decimal; margin: 6px 0; padding-right: 1.5rem; }
                .interactive-report-body .table-responsive-wrapper {
                    width: 100% !important;
                    max-width: 100% !important;
                    overflow-x: auto !important;
                    overflow-y: hidden !important;
                    -webkit-overflow-scrolling: touch !important;
                    touch-action: pan-x pan-y !important;
                    margin: 12px 0 !important;
                    border: none !important;
                    border-radius: 0 !important;
                    background: transparent !important;
                    padding: 0 0 6px 0 !important;
                    box-shadow: none !important;
                    display: block !important;
                }
                .interactive-report-body table, .interactive-report-body .editable-table {
                    width: 100% !important;
                    min-width: 580px !important;
                    table-layout: auto !important;
                    border-collapse: collapse !important;
                    margin: 0 !important;
                    font-size: 12.5px !important;
                    border: 1px solid #cbd5e1 !important;
                    background: #ffffff !important;
                }
                .interactive-report-body th, .interactive-report-body td {
                    border: 1px solid #cbd5e1 !important;
                    padding: 8px 10px !important;
                    line-height: 1.55 !important;
                    vertical-align: middle !important;
                    white-space: normal !important;
                    word-break: normal !important;
                    overflow-wrap: normal !important;
                    word-wrap: normal !important;
                    hyphens: none !important;
                }
                .interactive-report-body th {
                    background-color: #f1f5f9 !important;
                    color: #1e3a8a !important;
                    font-weight: 800 !important;
                    font-size: 12.5px !important;
                    text-align: center !important;
                    cursor: pointer !important;
                    position: relative !important;
                    user-select: none !important;
                    transition: background-color 0.15s ease !important;
                }
                .interactive-report-body th * {
                    color: #1e3a8a !important;
                    white-space: normal !important;
                    word-break: normal !important;
                    overflow-wrap: normal !important;
                }
                .interactive-report-body th:hover {
                    background-color: #e0e7ff !important;
                    color: #3730a3 !important;
                }
                .interactive-report-body td {
                    text-align: right !important;
                    font-size: 12.5px !important;
                    color: #0f172a !important;
                }
                .interactive-report-body td * {
                    white-space: normal !important;
                    word-break: normal !important;
                    overflow-wrap: normal !important;
                }
                .interactive-report-body tr:nth-child(even) td {
                    background-color: #f8fafc !important;
                }
                /* Compact BOQ Item Summary Mini Table at Top of Report */
                .interactive-report-body table.boq-summary-mini-table {
                    min-width: 420px !important;
                    margin: 0 !important;
                }
                .interactive-report-body table.boq-summary-mini-table th {
                    padding: 5px 6px !important;
                    font-size: 11px !important;
                    font-weight: 800 !important;
                    text-align: center !important;
                    min-width: 50px !important;
                    line-height: 1.35 !important;
                }
                .interactive-report-body table.boq-summary-mini-table td {
                    padding: 5px 6px !important;
                    font-size: 11.5px !important;
                    font-weight: 700 !important;
                    text-align: center !important;
                    min-width: 50px !important;
                    line-height: 1.35 !important;
                    background-color: #ffffff !important;
                }
                .interactive-report-body table.pricing-compact-table {
                    width: 100% !important;
                    min-width: 460px !important;
                    margin: 0 !important;
                    table-layout: auto !important;
                }
                .interactive-report-body table.pricing-compact-table th,
                .interactive-report-body table.pricing-compact-table th * {
                    padding: 5px 6px !important;
                    font-size: 10.5px !important;
                    font-weight: 800 !important;
                    line-height: 1.3 !important;
                    text-align: center !important;
                }
                .interactive-report-body table.pricing-compact-table td,
                .interactive-report-body table.pricing-compact-table td * {
                    padding: 5px 6px !important;
                    font-size: 10.5px !important;
                    font-weight: 700 !important;
                    line-height: 1.3 !important;
                }
                .interactive-report-body table.qc-signatures-table,
                .interactive-report-body table.qc-photos-table {
                    width: 100% !important;
                    min-width: 100% !important;
                    table-layout: fixed !important;
                }
                .interactive-report-body table.qc-signatures-table tr td,
                .interactive-report-body table.qc-photos-table tr td {
                    background-color: #ffffff !important;
                    text-align: center !important;
                }
                .interactive-report-body table.qc-photos-table img {
                    max-width: 100% !important;
                    width: 100% !important;
                    object-fit: cover !important;
                    display: block !important;
                    margin: 0 auto !important;
                }
                /* Unified, clean executive headings across all reports */
                .interactive-report-body h1 {
                    color: #1e3a8a !important;
                    font-size: 15px !important;
                    font-weight: 800 !important;
                    line-height: 1.45 !important;
                    text-align: center !important;
                    background: transparent !important;
                    border: none !important;
                    border-bottom: 2px solid #1e3a8a !important;
                    border-radius: 0 !important;
                    padding: 0 0 8px 0 !important;
                    margin: 6px 0 12px 0 !important;
                    width: 100% !important;
                    display: block !important;
                }
                .interactive-report-body h2 {
                    color: #1e3a8a !important;
                    font-size: 14px !important;
                    font-weight: 800 !important;
                    line-height: 1.45 !important;
                    text-align: right !important;
                    background: transparent !important;
                    border: none !important;
                    border-bottom: 1.5px solid #cbd5e1 !important;
                    border-right: 4px solid #1e3a8a !important;
                    border-radius: 0 !important;
                    padding: 2px 8px 6px 0 !important;
                    margin: 14px 0 8px 0 !important;
                    width: 100% !important;
                    display: block !important;
                }
                .interactive-report-body h3,
                .interactive-report-body h4 {
                    color: #1e3a8a !important;
                    font-size: 13px !important;
                    font-weight: 800 !important;
                    line-height: 1.45 !important;
                    text-align: right !important;
                    background: transparent !important;
                    border: none !important;
                    border-bottom: 1px solid #e2e8f0 !important;
                    border-right: 3px solid #3b82f6 !important;
                    border-radius: 0 !important;
                    padding: 2px 8px 4px 0 !important;
                    margin: 10px 0 6px 0 !important;
                    width: 100% !important;
                    display: block !important;
                }
                /* Unified Callout Boxes */
                .interactive-report-body .info-box {
                    background-color: #eff6ff !important;
                    border: 1px solid #bfdbfe !important;
                    border-right: 4px solid #2563eb !important;
                    color: #1e3a8a !important;
                    padding: 10px 12px !important;
                    margin: 10px 0 !important;
                    border-radius: 8px !important;
                }
                .interactive-report-body .success-box {
                    background-color: #f0fdf4 !important;
                    border: 1px solid #bbf7d0 !important;
                    border-right: 4px solid #16a34a !important;
                    color: #14532d !important;
                    padding: 10px 12px !important;
                    margin: 10px 0 !important;
                    border-radius: 8px !important;
                }
                .interactive-report-body .warning-box {
                    background-color: #fef2f2 !important;
                    border: 1px solid #fecaca !important;
                    border-right: 4px solid #dc2626 !important;
                    color: #7f1d1d !important;
                    padding: 10px 12px !important;
                    margin: 10px 0 !important;
                    border-radius: 8px !important;
                }
                .interactive-report-body .cost-box,
                .interactive-report-body .highlight-box {
                    background-color: #fffbeb !important;
                    border: 1px solid #fde68a !important;
                    border-right: 4px solid #d97706 !important;
                    color: #78350f !important;
                    padding: 10px 12px !important;
                    margin: 10px 0 !important;
                    border-radius: 8px !important;
                }
                .interactive-report-body.is-editable {
                    outline: 2px dashed #6366f1 !important;
                    outline-offset: 4px;
                    background-color: #ffffff !important;
                    border-radius: 12px;
                }
                .interactive-report-body.is-editable td:focus,
                .interactive-report-body.is-editable th:focus {
                    background-color: #f5f3ff !important;
                    outline: 2px solid #6366f1 !important;
                }
                @keyframes calcCellFlash {
                    0% { background-color: #bbf7d0 !important; color: #065f46 !important; }
                    100% { }
                }
                .interactive-report-body td.calc-recalc-flash {
                    animation: calcCellFlash 0.75s ease-out;
                }
            `}</style>

            <div
                ref={editableRef}
                onClick={handleTableClick}
                contentEditable={isDirectEditing}
                suppressContentEditableWarning={true}
                onInput={handleDirectInput}
                onBlur={handleDirectBlur}
                className={`interactive-report-body max-w-none text-slate-900 leading-relaxed w-full ${
                    isDirectEditing ? 'is-editable cursor-text p-2' : ''
                }`}
            />

            {/* End-of-Report Interactive AI Command Bar (Text + Voice + Zero-Quota Reader) */}
            {showAiCommandBar && htmlContent && htmlContent.trim().length > 0 && (
                <div className="mt-5 pt-3 border-t border-slate-200 no-print" dir="rtl">
                    <div className="bg-slate-50/90 border border-slate-200 rounded-2xl p-2.5 sm:p-3.5 shadow-xs space-y-2.5">
                        {/* Compact Single-Line Header */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-600 to-purple-600 text-white flex items-center justify-center shadow-xs shrink-0">
                                    <i className="fa-solid fa-wand-magic-sparkles text-[11px]"></i>
                                </div>
                                <span className="text-xs font-extrabold text-slate-900">مساعد التقرير</span>

                                {/* Zero-Quota Bilingual Voice Reader Button */}
                                <button
                                    type="button"
                                    onClick={handleToggleReadAloud}
                                    className={`px-2 py-1 rounded-lg text-[10.5px] font-bold flex items-center gap-1 border transition ${
                                        isReadingAloud
                                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                                            : 'bg-white hover:bg-emerald-50 text-emerald-700 border-emerald-200'
                                    }`}
                                    title="قراءة التقرير صوتياً بالعربية والمصطلحات الإنجليزية (بدون استهلاك الكوته)"
                                >
                                    <i className={`fa-solid ${isReadingAloud ? 'fa-volume-high animate-pulse' : 'fa-volume-low'} text-[10px]`}></i>
                                    <span>{isReadingAloud ? 'إيقاف القراءة' : 'قراءة صوتية'}</span>
                                </button>
                            </div>

                            <div className="flex items-center gap-1.5">
                                {/* Mode Selector Pills */}
                                <div className="inline-flex bg-white p-0.5 rounded-xl border border-slate-200 text-[10.5px] font-bold shadow-2xs">
                                    <button
                                        type="button"
                                        onClick={() => setAiMode('auto')}
                                        className={`px-2 py-1 rounded-lg transition ${
                                            aiMode === 'auto'
                                                ? 'bg-indigo-600 text-white'
                                                : 'text-slate-600 hover:text-slate-900'
                                        }`}
                                    >
                                        تلقائي
                                    </button>
                                    {onContentChange && (
                                        <button
                                            type="button"
                                            onClick={() => setAiMode('edit')}
                                            className={`px-2 py-1 rounded-lg transition ${
                                                aiMode === 'edit'
                                                    ? 'bg-emerald-600 text-white'
                                                    : 'text-slate-600 hover:text-slate-900'
                                            }`}
                                        >
                                            تعديل
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => setAiMode('discuss')}
                                        className={`px-2 py-1 rounded-lg transition ${
                                            aiMode === 'discuss'
                                                ? 'bg-amber-600 text-white'
                                                : 'text-slate-600 hover:text-slate-900'
                                        }`}
                                    >
                                        مناقشة
                                    </button>
                                </div>

                                {/* Undo AI Edit Button */}
                                {undoStack.length > 0 && onContentChange && (
                                    <button
                                        type="button"
                                        onClick={handleUndoAiEdit}
                                        disabled={isAiProcessing}
                                        className="px-2 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[10.5px] font-bold flex items-center gap-1 transition disabled:opacity-50"
                                        title="التراجع عن آخر تعديل"
                                    >
                                        <i className="fa-solid fa-rotate-right text-[10px]"></i>
                                        <span>تراجع</span>
                                    </button>
                                )}

                                {aiThread.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setAiThread([])}
                                        className="w-7 h-7 rounded-lg bg-white hover:bg-slate-100 text-slate-500 border border-slate-200 flex items-center justify-center transition"
                                        title="مسح المحادثة"
                                    >
                                        <i className="fa-solid fa-eraser text-[10px]"></i>
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Live Zero-Quota Audio Player Strip (visible only during reading) */}
                        {isReadingAloud && (
                            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-2.5 py-2 space-y-1.5 animate-fade-in">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                        <button
                                            type="button"
                                            onClick={handleTogglePauseSpeech}
                                            className="w-7 h-7 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center shrink-0 transition"
                                            title={isSpeechPaused ? 'استئناف' : 'إيقاف مؤقت'}
                                        >
                                            <i className={`fa-solid ${isSpeechPaused ? 'fa-play' : 'fa-pause'} text-[10px]`}></i>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                reportSpeechReader.stop(false);
                                                setIsReadingAloud(false);
                                                setIsSpeechPaused(false);
                                            }}
                                            className="w-7 h-7 rounded-lg bg-white hover:bg-red-50 text-red-600 border border-red-200 flex items-center justify-center shrink-0 transition"
                                            title="إيقاف"
                                        >
                                            <i className="fa-solid fa-stop text-[10px]"></i>
                                        </button>
                                        <div className="text-[11px] font-bold text-emerald-950 truncate">
                                            {speechProgress.preview || 'جاري تجهيز قراءة التقرير...'}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        {speechProgress.total > 0 && (
                                            <span className="text-[10px] font-mono font-bold text-emerald-700 bg-white px-1.5 py-0.5 rounded border border-emerald-200">
                                                {speechProgress.index + 1}/{speechProgress.total}
                                            </span>
                                        )}
                                        <button
                                            type="button"
                                            onClick={handleCycleSpeechRate}
                                            className="text-[10px] font-mono font-bold text-emerald-800 bg-white hover:bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-200 transition"
                                            title="تغيير سرعة القراءة"
                                        >
                                            {speechRate}x
                                        </button>
                                    </div>
                                </div>
                                {speechProgress.total > 0 && (
                                    <div className="w-full h-1 bg-emerald-200/70 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-emerald-600 transition-all duration-300"
                                            style={{ width: `${Math.min(100, Math.round(((speechProgress.index + 1) / speechProgress.total) * 100))}%` }}
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Discussion / Edit Confirmation Feed */}
                        {aiThread.length > 0 && (
                            <div className="max-h-56 overflow-y-auto space-y-2 bg-white border border-slate-200 rounded-xl p-2.5">
                                {aiThread.map((msg) => (
                                    <div
                                        key={msg.id}
                                        className={`flex flex-col ${
                                            msg.role === 'user' ? 'items-start' : 'items-end'
                                        }`}
                                    >
                                        <div
                                            className={`max-w-[92%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                                                msg.role === 'user'
                                                    ? 'bg-indigo-600 text-white font-semibold'
                                                    : msg.action === 'edit'
                                                        ? 'bg-emerald-50 border border-emerald-200 text-emerald-950 font-semibold'
                                                        : 'bg-slate-100 border border-slate-200 text-slate-800 font-medium'
                                            }`}
                                        >
                                            <div className="flex items-center gap-1.5 mb-0.5 text-[10px] opacity-80 font-bold">
                                                {msg.role === 'user' ? (
                                                    <>
                                                        <i className={`fa-solid ${msg.isVoice ? 'fa-microphone' : 'fa-user'}`}></i>
                                                        <span>{msg.isVoice ? 'أمر صوتي' : 'طلبك'}</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <i className={`fa-solid ${msg.action === 'edit' ? 'fa-check-double text-emerald-600' : 'fa-comments text-indigo-600'}`}></i>
                                                        <span>{msg.action === 'edit' ? 'تم تعديل وحفظ التقرير' : 'الاستشاري'}</span>
                                                    </>
                                                )}
                                            </div>
                                            <div className="whitespace-pre-wrap">{msg.text}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Dynamic Report-Aware Quick Question & Edit Cards (8 cards) */}
                        {contextualPrompts.length > 0 && !isRecordingVoice && (
                            <div className="space-y-1.5">
                                <button
                                    type="button"
                                    onClick={() => setShowPromptCards((v) => !v)}
                                    className="flex items-center justify-between w-full text-[10.5px] font-bold text-slate-500 hover:text-indigo-700 px-0.5 transition"
                                >
                                    <span className="flex items-center gap-1.5">
                                        <i className="fa-solid fa-bolt text-amber-500"></i>
                                        <span>أسئلة وأوامر مقترحة للتقرير ({contextualPrompts.length})</span>
                                    </span>
                                    <i className={`fa-solid ${showPromptCards ? 'fa-chevron-up' : 'fa-chevron-down'} text-[9px]`}></i>
                                </button>

                                {showPromptCards && (
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                                        {contextualPrompts.map((item, i) => (
                                            <button
                                                key={i}
                                                type="button"
                                                disabled={isAiProcessing}
                                                onClick={() => handleRunAiCommand(item.label)}
                                                className="text-right px-2.5 py-2 rounded-xl bg-white hover:bg-indigo-50 text-slate-700 hover:text-indigo-800 border border-slate-200 hover:border-indigo-300 text-[10.5px] font-bold leading-snug flex items-start gap-1.5 transition shadow-2xs disabled:opacity-50"
                                            >
                                                <i className={`fa-solid ${item.icon} text-indigo-500 text-[10px] mt-0.5 shrink-0`}></i>
                                                <span className="line-clamp-2">{item.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Inline Error Banner */}
                        {aiError && (
                            <div className="bg-red-50 border border-red-200 text-red-700 text-[11px] font-bold px-3 py-2 rounded-xl flex items-center justify-between gap-2">
                                <span className="flex items-center gap-1.5">
                                    <i className="fa-solid fa-triangle-exclamation"></i>
                                    {aiError}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setAiError(null)}
                                    className="text-red-500 hover:text-red-700"
                                >
                                    <i className="fa-solid fa-times"></i>
                                </button>
                            </div>
                        )}

                        {/* Command Input or Active Voice Recording Bar */}
                        {isRecordingVoice ? (
                            <div className="flex items-center justify-between gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                                <div className="flex items-center gap-2 text-red-700 text-xs font-extrabold">
                                    <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping"></span>
                                    <span>جاري التسجيل...</span>
                                    <span className="font-mono bg-white px-2 py-0.5 rounded-md border border-red-200 text-[11px]">
                                        {formatDuration(voiceDuration)}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <button
                                        type="button"
                                        onClick={cancelVoiceRecording}
                                        className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-[11px] font-bold transition"
                                    >
                                        إلغاء
                                    </button>
                                    <button
                                        type="button"
                                        onClick={stopAndSendVoiceRecording}
                                        className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold flex items-center gap-1.5 shadow-xs transition"
                                    >
                                        <i className="fa-solid fa-paper-plane text-[10px]"></i>
                                        <span>إرسال</span>
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center gap-1.5">
                                <textarea
                                    rows={1}
                                    value={aiInput}
                                    disabled={isAiProcessing}
                                    onChange={(e) => setAiInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleRunAiCommand();
                                        }
                                    }}
                                    placeholder={
                                        aiMode === 'discuss'
                                            ? 'اكتب سؤالك لمناقشة التقرير...'
                                            : aiMode === 'edit'
                                                ? 'اكتب التعديل أو الإضافة المطلوبة...'
                                                : 'اكتب أمراً أو سؤالاً عن التقرير...'
                                    }
                                    className="flex-1 h-10 px-3 py-2.5 rounded-xl bg-white border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none text-xs font-semibold text-slate-900 resize-none leading-tight"
                                />

                                <button
                                    type="button"
                                    onClick={startVoiceRecording}
                                    disabled={isAiProcessing}
                                    className="w-10 h-10 rounded-xl bg-white hover:bg-red-50 text-slate-700 hover:text-red-600 border border-slate-300 hover:border-red-300 flex items-center justify-center transition shrink-0 disabled:opacity-50"
                                    title="أمر صوتي"
                                >
                                    <i className="fa-solid fa-microphone text-sm"></i>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => handleRunAiCommand()}
                                    disabled={isAiProcessing || !aiInput.trim()}
                                    className="h-10 px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition shrink-0 disabled:opacity-50"
                                >
                                    {isAiProcessing ? (
                                        <i className="fa-solid fa-circle-notch fa-spin text-xs"></i>
                                    ) : (
                                        <i className="fa-solid fa-paper-plane text-xs"></i>
                                    )}
                                    <span className="hidden sm:inline">{isAiProcessing ? 'جاري التنفيذ...' : 'تنفيذ'}</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Column Width Percentage Modal */}
            {editingColumnModal && (
                <div
                    className="fixed inset-0 z-[2500] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in no-print"
                    onClick={() => setEditingColumnModal(null)}
                >
                    <div
                        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-scale-in text-slate-800"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="bg-slate-900 text-white p-4 flex justify-between items-center">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                                    <i className="fa-solid fa-table-columns text-sm"></i>
                                </div>
                                <div>
                                    <h4 className="font-bold text-sm text-white">تعديل عرض العمود</h4>
                                    <p className="text-[11px] text-slate-400 truncate max-w-[220px]">
                                        العمود: <span className="text-amber-300 font-bold">{editingColumnModal.columnTitle}</span>
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setEditingColumnModal(null)}
                                className="w-8 h-8 rounded-full hover:bg-white/20 flex items-center justify-center text-white transition"
                            >
                                <i className="fa-solid fa-times"></i>
                            </button>
                        </div>

                        <div className="p-5 space-y-4">
                            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 flex items-center justify-between">
                                <span className="text-xs font-bold text-indigo-900">نسبة عرض العمود من الجدول:</span>
                                <span className="text-lg font-black text-indigo-700 bg-white px-3 py-1 rounded-lg border border-indigo-300 shadow-sm">
                                    {customPercentInput}%
                                </span>
                            </div>

                            <div>
                                <div className="flex justify-between text-xs text-slate-500 font-bold mb-1">
                                    <span>5% (ضيق)</span>
                                    <span>تمرير لتغيير النسبة</span>
                                    <span>80% (عريض جداً)</span>
                                </div>
                                <input
                                    type="range"
                                    min="5"
                                    max="80"
                                    step="1"
                                    value={customPercentInput}
                                    onChange={(e) => setCustomPercentInput(Number(e.target.value))}
                                    className="w-full accent-indigo-600 cursor-pointer h-2 bg-slate-200 rounded-lg"
                                />
                            </div>

                            <div className="flex items-center gap-2">
                                <label className="text-xs font-bold text-slate-700 shrink-0">أو كتابة النسبة يدوياً:</label>
                                <div className="flex items-center gap-1 border border-slate-300 rounded-lg px-2 py-1 bg-white flex-1">
                                    <input
                                        type="number"
                                        min="5"
                                        max="80"
                                        value={customPercentInput}
                                        onChange={(e) => setCustomPercentInput(Math.max(5, Math.min(80, Number(e.target.value))))}
                                        className="w-full text-center font-bold text-slate-900 outline-none text-sm"
                                    />
                                    <span className="text-xs font-bold text-slate-500">%</span>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1.5">نسب مقترحة سريعة:</label>
                                <div className="grid grid-cols-4 gap-1.5">
                                    {[
                                        { label: '8% (أرقام)', val: 8 },
                                        { label: '12% (وحدات)', val: 12 },
                                        { label: '20% (عادي)', val: 20 },
                                        { label: '30% (متوسط)', val: 30 },
                                        { label: '40% (توصيف)', val: 40 },
                                        { label: '50% (نص عريض)', val: 50 },
                                        { label: '60% (بيان كبير)', val: 60 },
                                        { label: 'تلقائي Auto', val: 0 },
                                    ].map((preset, idx) => (
                                        <button
                                            key={idx}
                                            type="button"
                                            onClick={() => {
                                                if (preset.val === 0) {
                                                    handleApplyColumnWidth('auto');
                                                } else {
                                                    setCustomPercentInput(preset.val);
                                                }
                                            }}
                                            className={`py-1.5 px-2 rounded-lg text-[11px] font-bold border transition ${
                                                customPercentInput === preset.val
                                                    ? 'bg-indigo-600 text-white border-indigo-600'
                                                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                                            }`}
                                        >
                                            {preset.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-[11px] text-amber-800 flex items-start gap-2">
                                <i className="fa-solid fa-lightbulb text-amber-600 mt-0.5"></i>
                                <span>يتم تلقائياً تنسيق الجمل داخل العمود لتتناسب مع العرض الجديد دون تكسير الكلمات وحفظ التعديل.</span>
                            </div>
                        </div>

                        <div className="p-4 bg-slate-50 border-t flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setEditingColumnModal(null)}
                                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-200 text-slate-700 hover:bg-slate-300 transition"
                            >
                                إلغاء
                            </button>
                            <button
                                type="button"
                                onClick={() => handleApplyColumnWidth(customPercentInput)}
                                className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition shadow flex items-center gap-1.5"
                            >
                                <i className="fa-solid fa-check"></i>
                                <span>تطبيق وحفظ ({customPercentInput}%)</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InteractiveReportViewer;
