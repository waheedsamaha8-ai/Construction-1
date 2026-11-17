// Excel-like Automatic Calculation Engine for Interactive Engineering Reports

const ARABIC_DIGITS: Record<string, string> = {
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
    '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
    '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
    '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
};

export const normalizeDigits = (str: string): string => {
    if (!str) return '';
    return str
        .replace(/[٠-٩۰-۹]/g, (d) => ARABIC_DIGITS[d] ?? d)
        .replace(/٬/g, ',')
        .replace(/٫/g, '.');
};

/**
 * Parses a numeric table cell string cleanly while ignoring dates, multi-word sentences,
 * or numbered list labels like "1. تكلفة الخامات والمواد".
 */
export const parseReportNumber = (raw: string | null | undefined): number | null => {
    if (!raw) return null;
    const text = normalizeDigits(raw).replace(/\u00A0/g, ' ').trim();
    if (!text) return null;

    // Reject dates (e.g. 2026-11-15, 15/11/2026)
    if (/\d{2,4}[-/]\d{1,2}[-/]\d{1,4}/.test(text)) return null;

    // Reject numbered sentence prefixes like "1. تكلفة الخامات" or "4. مصاريف غير مباشرة"
    if (/^\d+\.\s+[\u0600-\u06FFa-zA-Z]{2,}/.test(text)) return null;

    // Strip known units/currency words so we verify the cell is predominantly numeric
    const strippedUnits = text
        .replace(/(?:ج\.?\s*م|جنيه(?:\s*مصري)?|ريال|دولار|SAR|EGP|USD|%|\+|\/|\s)+/gi, ' ')
        .replace(/(?:ألف|مليون|طن|كجم|كيلو|م3|م2|م\.?ط|شكارة|شيكارة|بستلة|لتر|جالون|لوح|قطعة|وحدة|يوم(?:ية)?|ساعة|عامل|معدة|شامل|تقريباً|فقط)/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    // If remaining text still contains words (Arabic or Latin letters), it's a descriptive text cell
    if (/[\u0600-\u06FFa-zA-Z]/.test(strippedUnits)) {
        return null;
    }

    const match = text.match(/([+-]?\s*\d[\d,]*(?:\.\d+)?|\([+-]?\s*\d[\d,]*(?:\.\d+)?\))/);
    if (!match) return null;

    let numStr = match[1].replace(/\s+/g, '').replace(/,/g, '');
    const isParenNeg = numStr.startsWith('(') && numStr.endsWith(')');
    if (isParenNeg) {
        numStr = '-' + numStr.slice(1, -1);
    }

    const parsed = parseFloat(numStr);
    return Number.isFinite(parsed) ? parsed : null;
};

const extractPercentFromText = (raw: string): number | null => {
    const text = normalizeDigits(raw);
    const match = text.match(/(\d+(?:\.\d+)?)\s*%/);
    if (match) {
        const n = parseFloat(match[1]);
        return Number.isFinite(n) ? n : null;
    }
    return null;
};

interface FormatCellOptions {
    decimals?: number;
    defaultSuffix?: string;
    preservePlus?: boolean;
}

const formatNumberByPrecision = (value: number, decimals: number): string => {
    const safeVal = Number.isFinite(value) ? value : 0;
    const rounded = decimals === 0 ? Math.round(safeVal) : Number(safeVal.toFixed(decimals));
    if (decimals === 2) {
        return rounded.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    }
    return rounded.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: decimals,
    });
};

const extractCellPrefixAndSuffix = (originalText: string): { prefix: string; suffix: string; hadDecimals: number | null } => {
    const normalized = normalizeDigits(originalText).trim();
    const numMatch = normalized.match(/^([+-]?)\s*(\d[\d,]*(?:\.(\d+))?)(.*)$/);
    if (!numMatch) {
        return { prefix: '', suffix: '', hadDecimals: null };
    }
    const prefix = numMatch[1] === '+' ? '+' : '';
    const decPart = numMatch[3];
    const suffix = numMatch[4] || '';
    return {
        prefix,
        suffix,
        hadDecimals: decPart !== undefined ? decPart.length : 0,
    };
};

const setCellNumericDisplay = (
    cell: HTMLElement | null | undefined,
    value: number,
    editedCell: HTMLElement | null | undefined,
    options: FormatCellOptions = {}
): boolean => {
    if (!cell) return false;
    if (editedCell && (cell === editedCell || cell.contains(editedCell))) return false;

    const currentText = cell.textContent || '';
    const { prefix, suffix, hadDecimals } = extractCellPrefixAndSuffix(currentText);
    const usePlus = options.preservePlus !== undefined ? options.preservePlus : prefix === '+';

    let decimals = options.decimals;
    if (decimals === undefined) {
        if (currentText.includes('ج.م') || hadDecimals === 2) decimals = 2;
        else if (currentText.includes('%')) decimals = Number.isInteger(Number(value.toFixed(1))) ? 0 : 1;
        else if (hadDecimals !== null && hadDecimals > 0) decimals = Math.min(3, Math.max(2, hadDecimals));
        else decimals = Number.isInteger(value) ? 0 : 2;
    }

    const finalSuffix = suffix || options.defaultSuffix || '';
    const signPrefix = usePlus && value >= 0 ? '+' : '';
    const formatted = `${signPrefix}${formatNumberByPrecision(value, decimals)}${finalSuffix}`;

    if (cell.textContent?.trim() === formatted.trim()) {
        return false;
    }

    // Preserve bold inner wrapper if present and single child
    const strongChild = cell.children.length === 1 && cell.children[0].tagName === 'STRONG'
        ? (cell.children[0] as HTMLElement)
        : null;

    if (strongChild) {
        strongChild.textContent = formatted;
    } else {
        cell.textContent = formatted;
    }

    cell.classList.remove('calc-recalc-flash');
    // Force reflow to restart CSS flash animation reliably
    void cell.offsetWidth;
    cell.classList.add('calc-recalc-flash');
    return true;
};

/** Strips transient highlight classes before persisting HTML */
export const cleanTransientCalcHtml = (html: string): string => {
    if (!html) return '';
    return html
        .replace(/\s*calc-recalc-flash\b/g, '')
        .replace(/\sclass="\s*"/g, '');
};

/** Reads header texts for a table */
const getTableHeaders = (table: HTMLTableElement): string[] => {
    const theadRow = table.querySelector('thead tr');
    const firstRow = theadRow || table.querySelector('tr');
    if (!firstRow) return [];
    const headers: string[] = [];
    Array.from(firstRow.children).forEach((cell) => {
        const el = cell as HTMLElement;
        const span = Math.max(1, parseInt(el.getAttribute('colspan') || '1', 10) || 1);
        const text = normalizeDigits(el.textContent || '').replace(/\s+/g, ' ').trim();
        for (let i = 0; i < span; i++) {
            headers.push(text);
        }
    });
    return headers;
};

/** Reads direct cells of a row along with their logical column start indices */
const getRowCellsWithCols = (row: HTMLTableRowElement): { cell: HTMLTableCellElement; colStart: number; colSpan: number }[] => {
    const result: { cell: HTMLTableCellElement; colStart: number; colSpan: number }[] = [];
    let colIdx = 0;
    Array.from(row.children).forEach((c) => {
        if (c.tagName !== 'TD' && c.tagName !== 'TH') return;
        const cell = c as HTMLTableCellElement;
        const span = Math.max(1, parseInt(cell.getAttribute('colspan') || '1', 10) || 1);
        result.push({ cell, colStart: colIdx, colSpan: span });
        colIdx += span;
    });
    return result;
};

const isSummaryLabelText = (text: string): boolean => {
    const t = normalizeDigits(text).toLowerCase();
    return (
        t.includes('إجمالي') ||
        t.includes('اجمالي') ||
        t.includes('الإجماليات') ||
        t.includes('المجموع') ||
        t.includes('جملة') ||
        t.includes('الصافي') ||
        t.includes('صافي') ||
        t.includes('السعر النهائي') ||
        t.includes('total') ||
        t.includes('subtotal') ||
        t.includes('grand total')
    );
};

const detectPricingQuantity = (rootEl: HTMLElement): number | null => {
    // 1. Explicit data attribute
    const explicit = rootEl.querySelector('[data-calc-qty]');
    if (explicit) {
        const q = parseFloat(explicit.getAttribute('data-calc-qty') || '');
        if (Number.isFinite(q) && q > 0) return q;
    }

    // 2. From Summary table header: e.g., "الإجمالي (100 م3)" or "إجمالي قيمة البند بسعر السوق (100 م3)"
    const headers = Array.from(rootEl.querySelectorAll('table th'));
    for (const th of headers) {
        const t = normalizeDigits(th.textContent || '');
        if (t.includes('الإجمالي') || t.includes('إجمالي قيمة البند')) {
            const m = t.match(/\(\s*(\d[\d,]*(?:\.\d+)?)\s*[^\d)]+\)/);
            if (m) {
                const q = parseFloat(m[1].replace(/,/g, ''));
                if (Number.isFinite(q) && q > 0) return q;
            }
        }
    }

    // 3. From info-box / subtitle text: "الكمية: (100 م3)" or "الكمية الإجمالية: 100"
    const allBoxes = Array.from(rootEl.querySelectorAll('.info-box, p, div'));
    for (const el of allBoxes) {
        const txt = normalizeDigits(el.textContent || '');
        if (txt.length > 500) continue;
        const m = txt.match(/الكمية(?:\s+الإجمالية)?\s*[:：]\s*\(?\s*(\d[\d,]*(?:\.\d+)?)/);
        if (m) {
            const q = parseFloat(m[1].replace(/,/g, ''));
            if (Number.isFinite(q) && q > 0) return q;
        }
    }

    return null;
};

interface PricingTableSet {
    summaryTable: HTMLTableElement | null;
    summaryType: 'professional_7row' | 'boq_1row' | null;
    breakdownTable: HTMLTableElement | null;
    materialsTable: HTMLTableElement | null;
    laborTable: HTMLTableElement | null;
    equipmentTable: HTMLTableElement | null;
}

const classifyPricingTables = (rootEl: HTMLElement): PricingTableSet => {
    const tables = Array.from(rootEl.querySelectorAll('table')) as HTMLTableElement[];
    const set: PricingTableSet = {
        summaryTable: null,
        summaryType: null,
        breakdownTable: null,
        materialsTable: null,
        laborTable: null,
        equipmentTable: null,
    };

    for (const table of tables) {
        const role = table.getAttribute('data-calc-table');
        if (role === 'summary-7row') { set.summaryTable = table; set.summaryType = 'professional_7row'; continue; }
        if (role === 'summary-boq') { set.summaryTable = table; set.summaryType = 'boq_1row'; continue; }
        if (role === 'breakdown') { set.breakdownTable = table; continue; }
        if (role === 'materials') { set.materialsTable = table; continue; }
        if (role === 'labor') { set.laborTable = table; continue; }
        if (role === 'equipment') { set.equipmentTable = table; continue; }

        const headersText = getTableHeaders(table).join(' | ');
        const bodyText = normalizeDigits(table.textContent || '');

        if (
            headersText.includes('عنصر التكلفة') &&
            headersText.includes('للوحدة') &&
            bodyText.includes('التكلفة المباشرة')
        ) {
            set.summaryTable = table;
            set.summaryType = 'professional_7row';
        } else if (
            headersText.includes('التكلفة المباشرة للوحدة') &&
            headersText.includes('السعر العادل')
        ) {
            set.summaryTable = table;
            set.summaryType = 'boq_1row';
        } else if (
            headersText.includes('معدل الاستهلاك للوحدة') &&
            headersText.includes('التكلفة للوحدة')
        ) {
            set.breakdownTable = table;
        } else if (
            (headersText.includes('الهالك') || headersText.includes('نسبة الهالك')) &&
            (headersText.includes('المعدل') || headersText.includes('معدل الفرد')) &&
            (headersText.includes('التكلفة الكلية') || headersText.includes('التكلفة الإجمالية'))
        ) {
            set.materialsTable = table;
        } else if (
            headersText.includes('يومية الطاقم') &&
            headersText.includes('الإنتاجية') &&
            headersText.includes('إجمالي المصنعية')
        ) {
            set.laborTable = table;
        } else if (
            headersText.includes('المعدة') &&
            headersText.includes('تكلفة الوحدة') &&
            headersText.includes('إجمالي المعدات')
        ) {
            set.equipmentTable = table;
        }
    }

    return set;
};

/**
 * Recalculates multi-table Pricing & Material Analysis reports
 */
const recalculatePricingReport = (
    rootEl: HTMLElement,
    set: PricingTableSet,
    editedCell?: HTMLElement | null
): { handledTables: Set<HTMLTableElement>; changed: boolean } => {
    const handledTables = new Set<HTMLTableElement>();
    let changed = false;

    let itemQty = detectPricingQuantity(rootEl);
    if (!itemQty && set.summaryTable && set.summaryType === 'professional_7row') {
        const rows = Array.from(set.summaryTable.querySelectorAll('tbody tr')) as HTMLTableRowElement[];
        for (const r of rows) {
            const cells = Array.from(r.children) as HTMLElement[];
            if (cells.length >= 4) {
                const u = parseReportNumber(cells[2]?.textContent);
                const tot = parseReportNumber(cells[3]?.textContent);
                if (u && u > 0 && tot && tot > 0) {
                    itemQty = Math.round((tot / u) * 1000) / 1000;
                    break;
                }
            }
        }
    }
    const qty = itemQty && itemQty > 0 ? itemQty : 1;

    let computedMaterialsTotal: number | null = null;
    let computedMaterialsPerUnit: number | null = null;
    let computedLaborTotal: number | null = null;
    let computedLaborPerUnit: number | null = null;
    let computedEquipTotal: number | null = null;
    let computedEquipPerUnit: number | null = null;

    // 1. Materials Table
    if (set.materialsTable) {
        handledTables.add(set.materialsTable);
        const headers = getTableHeaders(set.materialsTable);
        const rateIdx = headers.findIndex((h) => h.includes('المعدل') || h.includes('معدل الفرد'));
        const netQtyIdx = headers.findIndex((h) => h.includes('الكمية الصافية'));
        const wasteIdx = headers.findIndex((h) => h.includes('الهالك'));
        const totalQtyIdx = headers.findIndex((h) => h.includes('الكمية الكلية') || h.includes('إجمالي الكمية'));
        const unitPriceIdx = headers.findIndex((h) => h.includes('سعر الوحدة') || h.includes('سعر السوق'));
        const totalCostIdx = headers.findIndex((h) => h.includes('التكلفة الكلية') || h.includes('التكلفة الإجمالية'));

        const rows = Array.from(set.materialsTable.querySelectorAll('tbody tr, tfoot tr')) as HTMLTableRowElement[];
        let sumMaterialCost = 0;
        let summaryRow: HTMLTableRowElement | null = null;

        for (const row of rows) {
            const cells = Array.from(row.children) as HTMLTableCellElement[];
            const rowText = normalizeDigits(row.textContent || '');
            if (cells.length < 4 || isSummaryLabelText(rowText)) {
                if (isSummaryLabelText(rowText)) summaryRow = row;
                continue;
            }

            const rateCell = rateIdx >= 0 ? cells[rateIdx] : null;
            const netQtyCell = netQtyIdx >= 0 ? cells[netQtyIdx] : null;
            const wasteCell = wasteIdx >= 0 ? cells[wasteIdx] : null;
            const totalQtyCell = totalQtyIdx >= 0 ? cells[totalQtyIdx] : null;
            const unitPriceCell = unitPriceIdx >= 0 ? cells[unitPriceIdx] : null;
            const totalCostCell = totalCostIdx >= 0 ? cells[totalCostIdx] : null;

            const isEditingTotalQty = Boolean(editedCell && totalQtyCell && (editedCell === totalQtyCell || totalQtyCell.contains(editedCell)));
            const isEditingNetQty = Boolean(editedCell && netQtyCell && (editedCell === netQtyCell || netQtyCell.contains(editedCell)));
            const isEditingTotalCost = Boolean(editedCell && totalCostCell && (editedCell === totalCostCell || totalCostCell.contains(editedCell)));

            const rate = parseReportNumber(rateCell?.textContent);
            const waste = parseReportNumber(wasteCell?.textContent) ?? 0;
            const unitPrice = parseReportNumber(unitPriceCell?.textContent) ?? 0;
            let grossQty = parseReportNumber(totalQtyCell?.textContent);
            let netQty = parseReportNumber(netQtyCell?.textContent);

            if (isEditingTotalCost) {
                const editedCost = parseReportNumber(totalCostCell?.textContent) ?? 0;
                sumMaterialCost += editedCost;
                continue;
            }

            if (!isEditingTotalQty) {
                if (isEditingNetQty && netQty !== null) {
                    grossQty = netQty * (1 + waste / 100);
                    if (setCellNumericDisplay(totalQtyCell, grossQty, editedCell, { decimals: 3 })) changed = true;
                } else if (rate !== null) {
                    netQty = rate * qty;
                    if (netQtyCell && setCellNumericDisplay(netQtyCell, netQty, editedCell, { decimals: 3 })) changed = true;
                    grossQty = netQty * (1 + waste / 100);
                    if (setCellNumericDisplay(totalQtyCell, grossQty, editedCell, { decimals: 3 })) changed = true;
                }
            }

            const finalQtyForCost = grossQty ?? 0;
            const rowCost = Math.round(finalQtyForCost * unitPrice * 100) / 100;
            if (setCellNumericDisplay(totalCostCell, rowCost, editedCell, { decimals: 2, defaultSuffix: ' ج.م' })) {
                changed = true;
            }
            sumMaterialCost += rowCost;
        }

        computedMaterialsTotal = Math.round(sumMaterialCost * 100) / 100;
        computedMaterialsPerUnit = Math.round((computedMaterialsTotal / qty) * 100) / 100;

        if (summaryRow) {
            const sumCells = Array.from(summaryRow.children) as HTMLTableCellElement[];
            if (sumCells.length >= 2) {
                const labelCell = sumCells[0];
                const lastCell = sumCells[sumCells.length - 1];
                if (labelCell && !(editedCell && labelCell.contains(editedCell))) {
                    const labelTxt = labelCell.textContent || '';
                    if (/للوحدة\s*[:：]/.test(labelTxt)) {
                        const updatedLabel = labelTxt.replace(
                            /(للوحدة\s*[:：]\s*)[\d,٠-٩۰-۹.]+(\s*ج\.?\s*م)?/,
                            `$1${formatNumberByPrecision(computedMaterialsPerUnit, 2)}$2`
                        );
                        if (updatedLabel !== labelTxt) {
                            labelCell.textContent = updatedLabel;
                            changed = true;
                        }
                    }
                }
                if (setCellNumericDisplay(lastCell, computedMaterialsTotal, editedCell, { decimals: 2, defaultSuffix: ' ج.م' })) {
                    changed = true;
                }
            }
        }
    }

    // 2. Labor Table
    if (set.laborTable) {
        handledTables.add(set.laborTable);
        const headers = getTableHeaders(set.laborTable);
        const dailyIdx = headers.findIndex((h) => h.includes('يومية'));
        const prodIdx = headers.findIndex((h) => h.includes('الإنتاجية'));
        const unitCostIdx = headers.findIndex((h) => h.includes('تكلفة الوحدة'));
        const totalIdx = headers.findIndex((h) => h.includes('إجمالي المصنعية') || h.includes('الإجمالي'));

        const rows = Array.from(set.laborTable.querySelectorAll('tbody tr, tfoot tr')) as HTMLTableRowElement[];
        let sumUnitCost = 0;
        let sumTotalCost = 0;
        let summaryRow: HTMLTableRowElement | null = null;

        for (const row of rows) {
            const cells = Array.from(row.children) as HTMLTableCellElement[];
            const rowText = normalizeDigits(row.textContent || '');
            if (cells.length < 4 || isSummaryLabelText(rowText)) {
                if (isSummaryLabelText(rowText)) summaryRow = row;
                continue;
            }

            const dailyCell = dailyIdx >= 0 ? cells[dailyIdx] : null;
            const prodCell = prodIdx >= 0 ? cells[prodIdx] : null;
            const unitCostCell = unitCostIdx >= 0 ? cells[unitCostIdx] : null;
            const totalCell = totalIdx >= 0 ? cells[totalIdx] : null;

            const isEditingUnitCost = Boolean(editedCell && unitCostCell && (editedCell === unitCostCell || unitCostCell.contains(editedCell)));
            const isEditingTotal = Boolean(editedCell && totalCell && (editedCell === totalCell || totalCell.contains(editedCell)));

            if (isEditingTotal) {
                const rowTotal = parseReportNumber(totalCell?.textContent) ?? 0;
                const rowUnit = parseReportNumber(unitCostCell?.textContent) ?? (rowTotal / qty);
                sumUnitCost += rowUnit;
                sumTotalCost += rowTotal;
                continue;
            }

            let rowUnitCost = parseReportNumber(unitCostCell?.textContent) ?? 0;
            if (!isEditingUnitCost && dailyCell && prodCell) {
                const daily = parseReportNumber(dailyCell.textContent) ?? 0;
                const prod = parseReportNumber(prodCell.textContent);
                if (prod && prod > 0) {
                    rowUnitCost = Math.round((daily / prod) * 100) / 100;
                    if (setCellNumericDisplay(unitCostCell, rowUnitCost, editedCell, { decimals: 2 })) changed = true;
                }
            }

            const rowTotalCost = Math.round(rowUnitCost * qty * 100) / 100;
            if (setCellNumericDisplay(totalCell, rowTotalCost, editedCell, { decimals: 2, defaultSuffix: ' ج.م' })) {
                changed = true;
            }
            sumUnitCost += rowUnitCost;
            sumTotalCost += rowTotalCost;
        }

        computedLaborPerUnit = Math.round(sumUnitCost * 100) / 100;
        computedLaborTotal = Math.round(sumTotalCost * 100) / 100;

        if (summaryRow) {
            const sumCells = Array.from(summaryRow.children) as HTMLTableCellElement[];
            if (sumCells.length >= 3) {
                if (setCellNumericDisplay(sumCells[sumCells.length - 2], computedLaborPerUnit, editedCell, { decimals: 2, defaultSuffix: ' ج.م' })) changed = true;
                if (setCellNumericDisplay(sumCells[sumCells.length - 1], computedLaborTotal, editedCell, { decimals: 2, defaultSuffix: ' ج.م' })) changed = true;
            }
        }
    }

    // 3. Equipment Table
    if (set.equipmentTable) {
        handledTables.add(set.equipmentTable);
        const headers = getTableHeaders(set.equipmentTable);
        const prodIdx = headers.findIndex((h) => h.includes('الإنتاجية'));
        const unitCostIdx = headers.findIndex((h) => h.includes('تكلفة الوحدة'));
        const totalIdx = headers.findIndex((h) => h.includes('إجمالي المعدات') || h.includes('الإجمالي'));

        const rows = Array.from(set.equipmentTable.querySelectorAll('tbody tr, tfoot tr')) as HTMLTableRowElement[];
        let sumUnitCost = 0;
        let sumTotalCost = 0;
        let summaryRow: HTMLTableRowElement | null = null;

        for (const row of rows) {
            const cells = Array.from(row.children) as HTMLTableCellElement[];
            const rowText = normalizeDigits(row.textContent || '');
            if (cells.length < 3 || isSummaryLabelText(rowText)) {
                if (isSummaryLabelText(rowText)) summaryRow = row;
                continue;
            }

            const prodCell = prodIdx >= 0 ? cells[prodIdx] : null;
            const unitCostCell = unitCostIdx >= 0 ? cells[unitCostIdx] : null;
            const totalCell = totalIdx >= 0 ? cells[totalIdx] : null;

            const isEditingTotal = Boolean(editedCell && totalCell && (editedCell === totalCell || totalCell.contains(editedCell)));
            const isEditingUnitCost = Boolean(editedCell && unitCostCell && (editedCell === unitCostCell || unitCostCell.contains(editedCell)));

            if (isEditingTotal) {
                const rowTotal = parseReportNumber(totalCell?.textContent) ?? 0;
                const rowUnit = parseReportNumber(unitCostCell?.textContent) ?? (rowTotal / qty);
                sumUnitCost += rowUnit;
                sumTotalCost += rowTotal;
                continue;
            }

            let rowUnitCost = parseReportNumber(unitCostCell?.textContent) ?? 0;
            const dailyAttr = row.getAttribute('data-daily-rate');
            if (!isEditingUnitCost && dailyAttr && prodCell) {
                const dailyRate = parseFloat(dailyAttr);
                const prod = parseReportNumber(prodCell.textContent);
                if (Number.isFinite(dailyRate) && prod && prod > 0) {
                    rowUnitCost = Math.round((dailyRate / prod) * 100) / 100;
                    if (setCellNumericDisplay(unitCostCell, rowUnitCost, editedCell, { decimals: 2, defaultSuffix: ' ج.م' })) changed = true;
                }
            }

            const rowTotalCost = Math.round(rowUnitCost * qty * 100) / 100;
            if (setCellNumericDisplay(totalCell, rowTotalCost, editedCell, { decimals: 2, defaultSuffix: ' ج.م' })) {
                changed = true;
            }
            sumUnitCost += rowUnitCost;
            sumTotalCost += rowTotalCost;
        }

        computedEquipPerUnit = Math.round(sumUnitCost * 100) / 100;
        computedEquipTotal = Math.round(sumTotalCost * 100) / 100;

        if (summaryRow) {
            const sumCells = Array.from(summaryRow.children) as HTMLTableCellElement[];
            if (sumCells.length >= 3) {
                if (setCellNumericDisplay(sumCells[sumCells.length - 2], computedEquipPerUnit, editedCell, { decimals: 2, defaultSuffix: ' ج.م' })) changed = true;
                if (setCellNumericDisplay(sumCells[sumCells.length - 1], computedEquipTotal, editedCell, { decimals: 2, defaultSuffix: ' ج.م' })) changed = true;
            }
        }
    }

    // 4. Comprehensive Unit-Rate Breakdown Table (analyzeBoqItemComprehensive Table 2)
    let breakdownSumPerUnit: number | null = null;
    if (set.breakdownTable) {
        handledTables.add(set.breakdownTable);
        const headers = getTableHeaders(set.breakdownTable);
        const consIdx = headers.findIndex((h) => h.includes('معدل الاستهلاك'));
        const rateIdx = headers.findIndex((h) => h.includes('سعر الوحدة'));
        const costIdx = headers.findIndex((h) => h.includes('التكلفة للوحدة'));

        const rows = Array.from(set.breakdownTable.querySelectorAll('tbody tr')) as HTMLTableRowElement[];
        let total = 0;
        for (const row of rows) {
            const cells = Array.from(row.children) as HTMLTableCellElement[];
            const consCell = consIdx >= 0 ? cells[consIdx] : null;
            const rateCell = rateIdx >= 0 ? cells[rateIdx] : null;
            const costCell = costIdx >= 0 ? cells[costIdx] : null;
            const isEditingCost = Boolean(editedCell && costCell && (editedCell === costCell || costCell.contains(editedCell)));
            let rowCost = parseReportNumber(costCell?.textContent) ?? 0;

            if (!isEditingCost && consCell && rateCell) {
                const c = parseReportNumber(consCell.textContent) ?? 0;
                const r = parseReportNumber(rateCell.textContent) ?? 0;
                rowCost = Math.round(c * r * 100) / 100;
                if (setCellNumericDisplay(costCell, rowCost, editedCell, { decimals: 2, defaultSuffix: ' ج.م' })) changed = true;
            }
            total += rowCost;
        }
        breakdownSumPerUnit = Math.round(total * 100) / 100;
    }

    // 5. Master Summary Table
    if (set.summaryTable && set.summaryType === 'professional_7row') {
        handledTables.add(set.summaryTable);
        const rows = Array.from(set.summaryTable.querySelectorAll('tbody tr')) as HTMLTableRowElement[];
        if (rows.length >= 6) {
            // Identify rows by label semantics or row order
            const findRow = (keyword: string, fallbackIdx: number) =>
                rows.find((r) => normalizeDigits(r.children[0]?.textContent || '').includes(keyword)) || rows[fallbackIdx];

            const rMat = findRow('الخامات', 0);
            const rLab = findRow('العمالة', 1);
            const rEq = findRow('المعدات', 2);
            const rDirect = findRow('التكلفة المباشرة', 3);
            const rIndirect = findRow('مصاريف غير مباشرة', 4);
            const rProfit = findRow('هامش الربح', 5);
            const rFinal = findRow('السعر النهائي', 6);

            const isInRow = (row: HTMLTableRowElement | undefined) =>
                Boolean(row && editedCell && row.contains(editedCell));

            const syncCostRow = (
                row: HTMLTableRowElement | undefined,
                detailPerUnit: number | null,
                detailTotal: number | null
            ): { perUnit: number; total: number } => {
                if (!row) return { perUnit: 0, total: 0 };
                const cells = Array.from(row.children) as HTMLTableCellElement[];
                const unitCell = cells[2];
                const totalCell = cells[3];
                const editingUnit = Boolean(editedCell && unitCell && (editedCell === unitCell || unitCell.contains(editedCell)));
                const editingTot = Boolean(editedCell && totalCell && (editedCell === totalCell || totalCell.contains(editedCell)));

                let perUnit = parseReportNumber(unitCell?.textContent) ?? 0;
                let tot = parseReportNumber(totalCell?.textContent) ?? 0;

                if (editingUnit) {
                    tot = Math.round(perUnit * qty * 100) / 100;
                    if (setCellNumericDisplay(totalCell, tot, editedCell, { decimals: 2, defaultSuffix: ' ج.م' })) changed = true;
                } else if (editingTot) {
                    perUnit = Math.round((tot / qty) * 100) / 100;
                    if (setCellNumericDisplay(unitCell, perUnit, editedCell, { decimals: 2, defaultSuffix: ' ج.م' })) changed = true;
                } else if (detailPerUnit !== null && detailTotal !== null) {
                    perUnit = detailPerUnit;
                    tot = detailTotal;
                    if (setCellNumericDisplay(unitCell, perUnit, editedCell, { decimals: 2, defaultSuffix: ' ج.م' })) changed = true;
                    if (setCellNumericDisplay(totalCell, tot, editedCell, { decimals: 2, defaultSuffix: ' ج.م' })) changed = true;
                }
                return { perUnit, total: tot };
            };

            const matVals = syncCostRow(rMat, computedMaterialsPerUnit, computedMaterialsTotal);
            const labVals = syncCostRow(rLab, computedLaborPerUnit, computedLaborTotal);
            const eqVals = syncCostRow(rEq, computedEquipPerUnit, computedEquipTotal);

            // Direct Cost Row
            let directPerUnit = Math.round((matVals.perUnit + labVals.perUnit + eqVals.perUnit) * 100) / 100;
            let directTotal = Math.round((matVals.total + labVals.total + eqVals.total) * 100) / 100;

            if (rDirect) {
                const dCells = Array.from(rDirect.children) as HTMLTableCellElement[];
                const dUnitCell = dCells[2];
                const dTotCell = dCells[3];
                const editingDirectUnit = Boolean(editedCell && dUnitCell && (editedCell === dUnitCell || dUnitCell.contains(editedCell)));
                const editingDirectTot = Boolean(editedCell && dTotCell && (editedCell === dTotCell || dTotCell.contains(editedCell)));

                if (editingDirectUnit) {
                    directPerUnit = parseReportNumber(dUnitCell?.textContent) ?? directPerUnit;
                    directTotal = Math.round(directPerUnit * qty * 100) / 100;
                    if (setCellNumericDisplay(dTotCell, directTotal, editedCell, { decimals: 2, defaultSuffix: ' ج.م' })) changed = true;
                } else if (editingDirectTot) {
                    directTotal = parseReportNumber(dTotCell?.textContent) ?? directTotal;
                    directPerUnit = Math.round((directTotal / qty) * 100) / 100;
                    if (setCellNumericDisplay(dUnitCell, directPerUnit, editedCell, { decimals: 2, defaultSuffix: ' ج.م' })) changed = true;
                } else {
                    if (setCellNumericDisplay(dUnitCell, directPerUnit, editedCell, { decimals: 2, defaultSuffix: ' ج.م' })) changed = true;
                    if (setCellNumericDisplay(dTotCell, directTotal, editedCell, { decimals: 2, defaultSuffix: ' ج.م' })) changed = true;
                }
            }

            // Update direct share % on rows 1, 2, 3
            if (directPerUnit > 0) {
                if (rMat?.children[1]) setCellNumericDisplay(rMat.children[1] as HTMLElement, (matVals.perUnit / directPerUnit) * 100, editedCell, { decimals: 1, defaultSuffix: '%' });
                if (rLab?.children[1]) setCellNumericDisplay(rLab.children[1] as HTMLElement, (labVals.perUnit / directPerUnit) * 100, editedCell, { decimals: 1, defaultSuffix: '%' });
                if (rEq?.children[1]) setCellNumericDisplay(rEq.children[1] as HTMLElement, (eqVals.perUnit / directPerUnit) * 100, editedCell, { decimals: 1, defaultSuffix: '%' });
            }

            // Indirect Cost Row (row 4)
            let indirectPerUnit = 0;
            let indirectTotal = 0;
            if (rIndirect) {
                const iCells = Array.from(rIndirect.children) as HTMLTableCellElement[];
                const pctCell = iCells[1];
                const uCell = iCells[2];
                const tCell = iCells[3];
                const pct = parseReportNumber(pctCell?.textContent) ?? 0;
                const editingUnitVal = Boolean(editedCell && uCell && (editedCell === uCell || uCell.contains(editedCell)));
                const editingTotVal = Boolean(editedCell && tCell && (editedCell === tCell || tCell.contains(editedCell)));

                if (editingUnitVal) {
                    indirectPerUnit = Math.abs(parseReportNumber(uCell?.textContent) ?? 0);
                    indirectTotal = Math.round(indirectPerUnit * qty * 100) / 100;
                    if (directPerUnit > 0) {
                        setCellNumericDisplay(pctCell, (indirectPerUnit / directPerUnit) * 100, editedCell, { decimals: 1, defaultSuffix: '%' });
                    }
                    if (setCellNumericDisplay(tCell, indirectTotal, editedCell, { decimals: 2, defaultSuffix: ' ج.م', preservePlus: true })) changed = true;
                } else if (editingTotVal) {
                    indirectTotal = Math.abs(parseReportNumber(tCell?.textContent) ?? 0);
                    indirectPerUnit = Math.round((indirectTotal / qty) * 100) / 100;
                    if (directPerUnit > 0) {
                        setCellNumericDisplay(pctCell, (indirectPerUnit / directPerUnit) * 100, editedCell, { decimals: 1, defaultSuffix: '%' });
                    }
                    if (setCellNumericDisplay(uCell, indirectPerUnit, editedCell, { decimals: 2, defaultSuffix: ' ج.م', preservePlus: true })) changed = true;
                } else {
                    indirectPerUnit = Math.round(directPerUnit * (pct / 100) * 100) / 100;
                    indirectTotal = Math.round(indirectPerUnit * qty * 100) / 100;
                    if (setCellNumericDisplay(uCell, indirectPerUnit, editedCell, { decimals: 2, defaultSuffix: ' ج.م', preservePlus: true })) changed = true;
                    if (setCellNumericDisplay(tCell, indirectTotal, editedCell, { decimals: 2, defaultSuffix: ' ج.م', preservePlus: true })) changed = true;
                }
            }

            // Profit Row (row 5): profit = (direct + indirect) * profitPct / 100
            let profitPerUnit = 0;
            let profitTotal = 0;
            if (rProfit) {
                const pCells = Array.from(rProfit.children) as HTMLTableCellElement[];
                const pctCell = pCells[1];
                const uCell = pCells[2];
                const tCell = pCells[3];
                const pct = parseReportNumber(pctCell?.textContent) ?? 0;
                const baseUnit = directPerUnit + indirectPerUnit;
                const editingUnitVal = Boolean(editedCell && uCell && (editedCell === uCell || uCell.contains(editedCell)));
                const editingTotVal = Boolean(editedCell && tCell && (editedCell === tCell || tCell.contains(editedCell)));

                if (editingUnitVal) {
                    profitPerUnit = Math.abs(parseReportNumber(uCell?.textContent) ?? 0);
                    profitTotal = Math.round(profitPerUnit * qty * 100) / 100;
                    if (baseUnit > 0) {
                        setCellNumericDisplay(pctCell, (profitPerUnit / baseUnit) * 100, editedCell, { decimals: 1, defaultSuffix: '%' });
                    }
                    if (setCellNumericDisplay(tCell, profitTotal, editedCell, { decimals: 2, defaultSuffix: ' ج.م', preservePlus: true })) changed = true;
                } else if (editingTotVal) {
                    profitTotal = Math.abs(parseReportNumber(tCell?.textContent) ?? 0);
                    profitPerUnit = Math.round((profitTotal / qty) * 100) / 100;
                    if (baseUnit > 0) {
                        setCellNumericDisplay(pctCell, (profitPerUnit / baseUnit) * 100, editedCell, { decimals: 1, defaultSuffix: '%' });
                    }
                    if (setCellNumericDisplay(uCell, profitPerUnit, editedCell, { decimals: 2, defaultSuffix: ' ج.م', preservePlus: true })) changed = true;
                } else {
                    profitPerUnit = Math.round(baseUnit * (pct / 100) * 100) / 100;
                    profitTotal = Math.round(profitPerUnit * qty * 100) / 100;
                    if (setCellNumericDisplay(uCell, profitPerUnit, editedCell, { decimals: 2, defaultSuffix: ' ج.م', preservePlus: true })) changed = true;
                    if (setCellNumericDisplay(tCell, profitTotal, editedCell, { decimals: 2, defaultSuffix: ' ج.م', preservePlus: true })) changed = true;
                }
            }

            // Final Price Row (row 6)
            if (rFinal && !isInRow(rFinal)) {
                const fCells = Array.from(rFinal.children) as HTMLTableCellElement[];
                const finalUnitPrice = Math.round((directPerUnit + indirectPerUnit + profitPerUnit) * 100) / 100;
                const totalItemPrice = Math.round(finalUnitPrice * qty * 100) / 100;
                if (setCellNumericDisplay(fCells[2], finalUnitPrice, editedCell, { decimals: 2, defaultSuffix: ' ج.م' })) changed = true;
                if (setCellNumericDisplay(fCells[3], totalItemPrice, editedCell, { decimals: 2, defaultSuffix: ' ج.م' })) changed = true;
            }
        }
    } else if (set.summaryTable && set.summaryType === 'boq_1row') {
        handledTables.add(set.summaryTable);
        const headers = getTableHeaders(set.summaryTable);
        const dataRow = set.summaryTable.querySelector('tbody tr') as HTMLTableRowElement | null;
        if (dataRow) {
            const cells = Array.from(dataRow.children) as HTMLTableCellElement[];
            if (cells.length >= 5) {
                const directCell = cells[0];
                const indirectCell = cells[1];
                const profitCell = cells[2];
                const finalCell = cells[3];
                const totalCell = cells[4];

                const editingDirect = Boolean(editedCell && directCell.contains(editedCell));
                let directCost = parseReportNumber(directCell.textContent) ?? 0;
                if (!editingDirect && breakdownSumPerUnit !== null) {
                    directCost = breakdownSumPerUnit;
                    if (setCellNumericDisplay(directCell, directCost, editedCell, { decimals: 2, defaultSuffix: ' ج.م' })) changed = true;
                }

                const indPct = extractPercentFromText(headers[1] || '') ?? 15;
                const profPct = extractPercentFromText(headers[2] || '') ?? 15;

                const indVal = Math.round(directCost * (indPct / 100) * 100) / 100;
                const profVal = Math.round(directCost * (profPct / 100) * 100) / 100;
                const finalUnit = Math.round((directCost + indVal + profVal) * 100) / 100;
                const totalMarket = Math.round(finalUnit * qty);

                if (setCellNumericDisplay(indirectCell, indVal, editedCell, { decimals: 2, defaultSuffix: ' ج.م' })) changed = true;
                if (setCellNumericDisplay(profitCell, profVal, editedCell, { decimals: 2, defaultSuffix: ' ج.م' })) changed = true;
                if (setCellNumericDisplay(finalCell, finalUnit, editedCell, { decimals: 2, defaultSuffix: ' ج.م' })) changed = true;
                if (setCellNumericDisplay(totalCell, totalMarket, editedCell, { decimals: 2, defaultSuffix: ' ج.م' })) changed = true;
            }
        }
    }

    return { handledTables, changed };
};

/**
 * Generic Excel-like table recalculation for ANY HTML table in any engineering report:
 * - Contract vs Executed vs Remaining (BOQ tables)
 * - Prev + Current = Cumulative
 * - Quantity × Unit Price = Total (with optional waste % / discount %)
 * - Column totals in summary rows / <tfoot> (including subtotal -> tax/VAT % -> grand total)
 */
const recalculateGenericTable = (table: HTMLTableElement, editedCell?: HTMLElement | null): boolean => {
    let changed = false;
    const headers = getTableHeaders(table);
    const hasHeaders = headers.length > 0;

    // Classify header column roles
    const findCol = (patterns: RegExp[]): number => {
        if (!hasHeaders) return -1;
        for (const p of patterns) {
            const idx = headers.findIndex((h) => p.test(h));
            if (idx !== -1) return idx;
        }
        return -1;
    };

    const contractCol = findCol([/التعاقدي/, /الكمية التعاقدية/]);
    const execCol = findCol([/المنفذ(?:ة)?/, /الكمية المنفذة/]);
    const remCol = findCol([/المتبقي(?:ة)?/, /الكمية المتبقية/]);

    const prevCol = findCol([/سابق(?:ة)?/, /السابق(?:ة)?/]);
    const currCol = findCol([/حالي(?:ة)?/, /الحالي(?:ة)?/]);
    const cumCol = findCol([/تراكمي/, /جملة الكمية/, /إجمالي الكمية/]);

    const wasteCol = findCol([/هالك/, /نسبة الهالك/]);
    const discCol = findCol([/خصم/, /نسبة الخصم/, /استقطاع/]);

    const qtyCol = findCol([
        /الكمية الكلية/, /إجمالي الكمية/, /الكمية المطلوبة/, /الكمية الصافية/,
        /الكمية/, /كمية/, /العدد/, /عدد/, /الأيام/, /عدد الأيام/, /المدة/, /معدل/, /qty/i, /quantity/i
    ]);
    const priceCol = findCol([
        /سعر الوحدة/, /فئة البند/, /الفئة/, /سعر السوق/, /السعر/, /سعر/,
        /التكلفة للوحدة/, /تكلفة الوحدة/, /يومية/, /unit\s*price/i, /rate/i, /price/i
    ]);
    const totalCol = findCol([
        /التكلفة الكلية/, /التكلفة الإجمالية/, /إجمالي السعر/, /إجمالي القيمة/, /الإجمالي الكلي/,
        /الإجمالي/, /إجمالي/, /القيمة/, /المبلغ/, /المجموع/, /التكلفة/, /الصافي/, /total/i, /amount/i
    ]);

    const allRows = Array.from(table.querySelectorAll('tr')) as HTMLTableRowElement[];
    const headerRow = table.querySelector('thead tr') || (allRows.length > 0 && allRows[0].querySelector('th') ? allRows[0] : null);
    const dataAndSummaryRows = allRows.filter((r) => r !== headerRow && !r.closest('thead'));

    const colSums: Record<number, number> = {};
    const colNumericCounts: Record<number, number> = {};
    let lastSumRowValues: Record<number, number> = {};
    let lastSubtotalValue = 0;
    let adjustmentAccum = 0;

    const resetSectionSums = () => {
        Object.keys(colSums).forEach((k) => delete colSums[Number(k)]);
        Object.keys(colNumericCounts).forEach((k) => delete colNumericCounts[Number(k)]);
    };

    for (const row of dataAndSummaryRows) {
        const mappedCells = getRowCellsWithCols(row);
        if (mappedCells.length === 0) continue;

        const firstText = normalizeDigits(mappedCells[0].cell.textContent || '');
        const fullRowText = normalizeDigits(row.textContent || '');
        const isInTfoot = Boolean(row.closest('tfoot'));
        const isPercentRow =
            (firstText.includes('%') || /ضريبة|قيمة مضافة|مصاريف|هامش|ربح|خصم|استقطاع|تأمين/.test(firstText)) &&
            mappedCells.length <= 4 &&
            isSummaryLabelText(fullRowText) === false;

        const isGrandTotalRow = /الإجمالي النهائي|الإجمالي الكلي|الصافي المستحق|صافي المستحق|grand total/i.test(firstText);
        const isSummaryRow = isInTfoot || isSummaryLabelText(firstText) || (mappedCells[0].colSpan > 1 && isSummaryLabelText(fullRowText));

        if (isSummaryRow || isPercentRow) {
            if (isPercentRow && lastSubtotalValue !== 0) {
                const targetCell = mappedCells[mappedCells.length - 1].cell;
                const pct =
                    extractPercentFromText(firstText) ??
                    (mappedCells.length >= 2 ? parseReportNumber(mappedCells[mappedCells.length - 2].cell.textContent) : null);
                if (pct !== null && !(editedCell && targetCell.contains(editedCell))) {
                    const isDeduct = /خصم|استقطاع/.test(firstText);
                    const val = Math.round(lastSubtotalValue * (pct / 100) * 100) / 100;
                    const signedVal = isDeduct ? -Math.abs(val) : val;
                    adjustmentAccum += signedVal;
                    if (setCellNumericDisplay(targetCell, Math.abs(val), editedCell, { decimals: 2 })) changed = true;
                } else {
                    const rawVal = parseReportNumber(targetCell.textContent) ?? 0;
                    adjustmentAccum += /خصم|استقطاع/.test(firstText) ? -Math.abs(rawVal) : rawVal;
                }
                continue;
            }

            if (isGrandTotalRow && lastSubtotalValue !== 0 && adjustmentAccum !== 0) {
                const targetCell = mappedCells[mappedCells.length - 1].cell;
                const grand = Math.round((lastSubtotalValue + adjustmentAccum) * 100) / 100;
                if (setCellNumericDisplay(targetCell, grand, editedCell, { decimals: 2 })) changed = true;
                lastSubtotalValue = grand;
                adjustmentAccum = 0;
                resetSectionSums();
                continue;
            }

            // Standard column-sum summary row
            if (mappedCells.length === 2 && mappedCells[0].colSpan > 1) {
                // Single summary cell covering remaining columns -> sum the totalCol or last numeric column
                const targetCol =
                    totalCol >= 0 && (colNumericCounts[totalCol] || 0) > 0
                        ? totalCol
                        : Math.max(...Object.keys(colNumericCounts).map(Number).filter((c) => (colNumericCounts[c] || 0) > 0), -1);
                if (targetCol >= 0 && colSums[targetCol] !== undefined) {
                    const val = Math.round(colSums[targetCol] * 100) / 100;
                    if (setCellNumericDisplay(mappedCells[1].cell, val, editedCell, { decimals: 2 })) changed = true;
                    lastSubtotalValue = val;
                    lastSumRowValues[targetCol] = val;
                }
            } else {
                mappedCells.forEach(({ cell, colStart, colSpan }, idx) => {
                    if (idx === 0 && colStart === 0) return; // Skip label column
                    const targetCol = colSpan === 1 ? colStart : colStart + colSpan - 1;
                    // Don't sum unit price columns or percentage columns in totals!
                    if (targetCol === priceCol || targetCol === wasteCol || targetCol === discCol) return;
                    if ((colNumericCounts[targetCol] || 0) > 0 && colSums[targetCol] !== undefined) {
                        const existing = parseReportNumber(cell.textContent);
                        if (existing !== null || cell.textContent?.trim() === '' || cell.textContent?.trim() === '-') {
                            const val = Math.round(colSums[targetCol] * 100) / 100;
                            if (setCellNumericDisplay(cell, val, editedCell, { decimals: 2 })) changed = true;
                            lastSumRowValues[targetCol] = val;
                            if (targetCol === totalCol || idx === mappedCells.length - 1) {
                                lastSubtotalValue = val;
                            }
                        }
                    }
                });
            }
            adjustmentAccum = 0;
            resetSectionSums();
            continue;
        }

        // Regular Data Row: compute horizontal formulas
        const cellByCol: Record<number, HTMLTableCellElement> = {};
        mappedCells.forEach(({ cell, colStart, colSpan }) => {
            if (colSpan === 1) cellByCol[colStart] = cell;
        });

        // Formula 1: Remaining = Contract - Executed
        if (contractCol >= 0 && execCol >= 0 && remCol >= 0 && contractCol !== remCol && execCol !== remCol) {
            const cCell = cellByCol[contractCol];
            const eCell = cellByCol[execCol];
            const rCell = cellByCol[remCol];
            const editingRem = Boolean(editedCell && rCell && (editedCell === rCell || rCell.contains(editedCell)));
            if (!editingRem && cCell && eCell && rCell) {
                const cVal = parseReportNumber(cCell.textContent);
                const eVal = parseReportNumber(eCell.textContent);
                if (cVal !== null && eVal !== null) {
                    const rem = Math.max(0, Math.round((cVal - eVal) * 1000) / 1000);
                    if (setCellNumericDisplay(rCell, rem, editedCell, { decimals: Number.isInteger(rem) ? 0 : 2 })) changed = true;
                }
            }
        }

        // Formula 2: Cumulative = Prev + Current
        if (prevCol >= 0 && currCol >= 0 && cumCol >= 0 && prevCol !== cumCol && currCol !== cumCol) {
            const pCell = cellByCol[prevCol];
            const cCell = cellByCol[currCol];
            const cumCell = cellByCol[cumCol];
            const editingCum = Boolean(editedCell && cumCell && (editedCell === cumCell || cumCell.contains(editedCell)));
            if (!editingCum && pCell && cCell && cumCell) {
                const pVal = parseReportNumber(pCell.textContent);
                const cVal = parseReportNumber(cCell.textContent);
                if (pVal !== null && cVal !== null) {
                    const cum = Math.round((pVal + cVal) * 1000) / 1000;
                    if (setCellNumericDisplay(cumCell, cum, editedCell, { decimals: Number.isInteger(cum) ? 0 : 2 })) changed = true;
                }
            }
        }

        // Formula 3: Total = Quantity * UnitPrice (with optional discount or waste)
        if (qtyCol >= 0 && priceCol >= 0 && totalCol >= 0 && qtyCol !== totalCol && priceCol !== totalCol) {
            const qCell = cellByCol[qtyCol];
            const pCell = cellByCol[priceCol];
            const tCell = cellByCol[totalCol];
            const editingTotal = Boolean(editedCell && tCell && (editedCell === tCell || tCell.contains(editedCell)));
            if (!editingTotal && qCell && pCell && tCell) {
                const qVal = parseReportNumber(qCell.textContent);
                const pVal = parseReportNumber(pCell.textContent);
                if (qVal !== null && pVal !== null) {
                    let rowTotal = qVal * pVal;
                    if (discCol >= 0 && cellByCol[discCol]) {
                        const dVal = parseReportNumber(cellByCol[discCol].textContent);
                        if (dVal !== null && dVal >= 0 && dVal <= 100) {
                            rowTotal = rowTotal * (1 - dVal / 100);
                        }
                    }
                    rowTotal = Math.round(rowTotal * 100) / 100;
                    if (setCellNumericDisplay(tCell, rowTotal, editedCell, { decimals: 2 })) changed = true;
                }
            }
        }

        // Accumulate column values for vertical sums
        mappedCells.forEach(({ cell, colStart, colSpan }) => {
            if (colSpan !== 1) return;
            const num = parseReportNumber(cell.textContent);
            if (num !== null) {
                colSums[colStart] = (colSums[colStart] || 0) + num;
                colNumericCounts[colStart] = (colNumericCounts[colStart] || 0) + 1;
            }
        });
    }

    return changed;
};

/**
 * Main entry point: runs Excel-like recalculations across all tables inside rootEl.
 * Safe to invoke on every `input` event: never overwrites `editedCell`.
 */
export const recalculateReportTables = (
    rootEl: HTMLElement,
    editedCell?: HTMLElement | null
): boolean => {
    if (!rootEl) return false;
    let anyChanged = false;

    // Pass 1: Pricing & Cost Analysis linked tables
    const pricingSet = classifyPricingTables(rootEl);
    const { handledTables, changed: pricingChanged } = recalculatePricingReport(rootEl, pricingSet, editedCell);
    if (pricingChanged) anyChanged = true;

    // Pass 2: Generic tables (BOQ, Invoices, Payments, Take-off sheets, etc.)
    const allTables = Array.from(rootEl.querySelectorAll('table')) as HTMLTableElement[];
    for (const table of allTables) {
        if (handledTables.has(table)) continue;
        if (table.classList.contains('qc-signatures-table') || table.classList.contains('qc-photos-table')) continue;
        if (recalculateGenericTable(table, editedCell)) {
            anyChanged = true;
        }
    }

    return anyChanged;
};

/**
 * Runs recalculation on a raw HTML string via an offscreen container (useful after AI edits).
 */
export const recalculateReportHtmlString = (rawHtml: string): string => {
    if (!rawHtml) return '';
    try {
        const container = document.createElement('div');
        container.innerHTML = rawHtml;
        recalculateReportTables(container, null);
        return cleanTransientCalcHtml(container.innerHTML);
    } catch {
        return rawHtml;
    }
};

/**
 * Extracts live KPI summary values from a Pricing Report HTML so external KPI strips
 * (e.g. ProfessionalPricingModal top cards) stay synced when tables are edited.
 */
export const extractPricingSummaryFromHtml = (html: string): {
    materialsCostPerUnit?: number;
    laborCostPerUnit?: number;
    equipmentCostPerUnit?: number;
    directCostPerUnit?: number;
    finalUnitPrice?: number;
    totalItemPrice?: number;
} | null => {
    if (!html) return null;
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const set = classifyPricingTables(doc.body);
        if (!set.summaryTable || set.summaryType !== 'professional_7row') return null;

        const rows = Array.from(set.summaryTable.querySelectorAll('tbody tr')) as HTMLTableRowElement[];
        const findRow = (keyword: string, fallbackIdx: number) =>
            rows.find((r) => normalizeDigits(r.children[0]?.textContent || '').includes(keyword)) || rows[fallbackIdx];

        const rMat = findRow('الخامات', 0);
        const rLab = findRow('العمالة', 1);
        const rEq = findRow('المعدات', 2);
        const rDirect = findRow('التكلفة المباشرة', 3);
        const rFinal = findRow('السعر النهائي', 6);

        return {
            materialsCostPerUnit: parseReportNumber(rMat?.children[2]?.textContent) ?? undefined,
            laborCostPerUnit: parseReportNumber(rLab?.children[2]?.textContent) ?? undefined,
            equipmentCostPerUnit: parseReportNumber(rEq?.children[2]?.textContent) ?? undefined,
            directCostPerUnit: parseReportNumber(rDirect?.children[2]?.textContent) ?? undefined,
            finalUnitPrice: parseReportNumber(rFinal?.children[2]?.textContent) ?? undefined,
            totalItemPrice: parseReportNumber(rFinal?.children[3]?.textContent) ?? undefined,
        };
    } catch {
        return null;
    }
};
