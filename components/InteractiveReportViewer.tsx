import React, { useState, useRef, useEffect } from 'react';

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
        targetTable.style.setProperty('table-layout', 'auto', 'important');

        const rows = Array.from(targetTable.querySelectorAll('tr'));
        const headerRow = targetTable.querySelector('thead tr') || rows[0];
        const colCount = headerRow ? headerRow.children.length : 0;

        // Calculate proportional widths for remaining columns if total > 100%
        let adjustedOtherWidths: Record<number, string> = {};
        if (typeof percent === 'number' && headerRow && colCount > 1) {
            const remainingBudget = Math.max(10, 100 - percent);
            const otherCols: { idx: number; currentW: number }[] = [];
            let sumOtherExplicit = 0;

            Array.from(headerRow.children).forEach((c, idx) => {
                if (idx === colIdx) return;
                const el = c as HTMLElement;
                const m = (el.style.width || '').match(/(\d+(?:\.\d+)?)%/);
                if (m) {
                    const w = parseFloat(m[1]);
                    otherCols.push({ idx, currentW: w });
                    sumOtherExplicit += w;
                }
            });

            if (sumOtherExplicit > remainingBudget && sumOtherExplicit > 0) {
                otherCols.forEach((col) => {
                    const scaled = Math.max(5, Math.round((col.currentW / sumOtherExplicit) * remainingBudget));
                    adjustedOtherWidths[col.idx] = `${scaled}%`;
                });
            }
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

                if (idx === colIdx) {
                    if (percent === 'auto') {
                        cell.style.removeProperty('width');
                    } else {
                        cell.style.width = `${percent}%`;
                    }
                } else if (adjustedOtherWidths[idx]) {
                    cell.style.width = adjustedOtherWidths[idx];
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
    className?: string;
}

export const InteractiveReportViewer: React.FC<InteractiveReportViewerProps> = ({
    htmlContent,
    onContentChange,
    isDirectEditing: controlledEditing,
    onDirectEditChange,
    showFloatingEditBar = false,
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

    const containerRef = useRef<HTMLDivElement>(null);
    const editableRef = useRef<HTMLDivElement>(null);
    const saveTimerRef = useRef<any>(null);

    const formattedHtml = formatInteractiveReportHtml(htmlContent);

    // Sync external htmlContent into editableRef ONLY when not actively focused & typing
    useEffect(() => {
        if (!editableRef.current) return;
        if (document.activeElement !== editableRef.current) {
            editableRef.current.innerHTML = formattedHtml;
        }
    }, [formattedHtml, isDirectEditing]);

    const commitHtmlChange = (newHtml: string) => {
        if (!onContentChange) return;
        setAutoSaveStatus('saving');
        onContentChange(newHtml);
        setAutoSaveStatus('saved');
        setTimeout(() => setAutoSaveStatus('idle'), 2000);
    };

    const handleDirectInput = () => {
        if (!editableRef.current || !onContentChange) return;
        setAutoSaveStatus('saving');
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
            const currentHtml = editableRef.current?.innerHTML;
            if (currentHtml !== undefined) {
                commitHtmlChange(currentHtml);
            }
        }, 500);
    };

    const handleDirectBlur = () => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        if (!editableRef.current || !onContentChange) return;
        commitHtmlChange(editableRef.current.innerHTML);
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
                        <span className="text-slate-700 text-[11px]">انقر على أي نص أو جدول للتعديل، ويتم الحفظ التلقائي على نفس التقرير.</span>
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
                .interactive-report-body { font-size: 13px !important; color: #1e293b !important; line-height: 1.65 !important; width: 100% !important; max-width: 100% !important; }
                .interactive-report-body .report-container, .interactive-report-body .report-body { width: 100% !important; max-width: 100% !important; padding: 0 !important; margin: 0 !important; border: none !important; }
                .interactive-report-body p, .interactive-report-body li, .interactive-report-body div { font-size: 13px !important; line-height: 1.65 !important; }
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
            `}</style>

            <div
                ref={editableRef}
                onClick={handleTableClick}
                contentEditable={isDirectEditing}
                suppressContentEditableWarning={true}
                onInput={handleDirectInput}
                onBlur={handleDirectBlur}
                className={`interactive-report-body prose prose-sm max-w-none text-slate-800 leading-relaxed w-full transition-all ${
                    isDirectEditing ? 'is-editable cursor-text p-2' : ''
                }`}
                dangerouslySetInnerHTML={{ __html: formattedHtml }}
            />

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
