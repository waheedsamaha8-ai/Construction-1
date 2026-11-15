import XLSX from 'xlsx-js-style';
import ExcelJS from 'exceljs';
import { BOQItem, ProjectPayment, PaymentItem, ProjectLog, LogImageAspectMode } from '../types';

function sanitizeFileName(name: string, fallback = 'export'): string {
  const cleaned = (name || '')
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, '_')
    .replace(/\s+/g, '_')
    .trim();
  return cleaned || fallback;
}

function sanitizeSheetName(name: string, fallback = 'Sheet1'): string {
  const cleaned = (name || '')
    .replace(/[\\/?*[\]:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 31);
  return cleaned || fallback;
}

// Reusable Excel Cell Styles (Arabic RTL Engineering Theme)
const BORDER_THIN = { style: 'thin', color: { rgb: 'CBD5E1' } };
const BORDER_MED_DARK = { style: 'medium', color: { rgb: '1E293B' } };
const ALL_THIN_BORDERS = {
  top: BORDER_THIN,
  bottom: BORDER_THIN,
  left: BORDER_THIN,
  right: BORDER_THIN,
};

const STYLES = {
  banner: {
    font: { name: 'Arial', sz: 15, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '0F172A' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: { top: BORDER_MED_DARK, bottom: BORDER_MED_DARK, left: BORDER_MED_DARK, right: BORDER_MED_DARK },
  },
  metaLabel: {
    font: { name: 'Arial', sz: 10, bold: true, color: { rgb: '1E293B' } },
    fill: { fgColor: { rgb: 'E2E8F0' } },
    alignment: { horizontal: 'right', vertical: 'center', wrapText: true },
    border: ALL_THIN_BORDERS,
  },
  metaValue: {
    font: { name: 'Arial', sz: 10, bold: true, color: { rgb: '0F172A' } },
    fill: { fgColor: { rgb: 'F8FAFC' } },
    alignment: { horizontal: 'right', vertical: 'center', wrapText: true },
    border: ALL_THIN_BORDERS,
  },
  tableHeader: {
    font: { name: 'Arial', sz: 10.5, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '1E3A8A' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: {
      top: BORDER_MED_DARK,
      bottom: BORDER_MED_DARK,
      left: { style: 'thin', color: { rgb: '93C5FD' } },
      right: { style: 'thin', color: { rgb: '93C5FD' } },
    },
  },
  groupHeader: {
    font: { name: 'Arial', sz: 11, bold: true, color: { rgb: '1E1B4B' } },
    fill: { fgColor: { rgb: 'E0E7FF' } },
    alignment: { horizontal: 'right', vertical: 'center', wrapText: true },
    border: {
      top: { style: 'thin', color: { rgb: '818CF8' } },
      bottom: { style: 'thin', color: { rgb: '818CF8' } },
      left: BORDER_THIN,
      right: BORDER_THIN,
    },
  },
  noteRow: {
    font: { name: 'Arial', sz: 10, bold: true, italic: true, color: { rgb: '92400E' } },
    fill: { fgColor: { rgb: 'FEF3C7' } },
    alignment: { horizontal: 'right', vertical: 'center', wrapText: true },
    border: ALL_THIN_BORDERS,
  },
  cellTextRight: (zebra: boolean) => ({
    font: { name: 'Arial', sz: 10, bold: false, color: { rgb: '0F172A' } },
    fill: { fgColor: { rgb: zebra ? 'F8FAFC' : 'FFFFFF' } },
    alignment: { horizontal: 'right', vertical: 'center', wrapText: true },
    border: ALL_THIN_BORDERS,
  }),
  cellCenter: (zebra: boolean, bold = false, colorRgb = '1E293B', bgRgb?: string) => ({
    font: { name: 'Arial', sz: 10, bold, color: { rgb: colorRgb } },
    fill: { fgColor: { rgb: bgRgb || (zebra ? 'F8FAFC' : 'FFFFFF') } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: ALL_THIN_BORDERS,
  }),
  cellNumber: (zebra: boolean, numFmt: string, bold = false, colorRgb = '0F172A', bgRgb?: string) => ({
    font: { name: 'Arial', sz: 10, bold, color: { rgb: colorRgb } },
    fill: { fgColor: { rgb: bgRgb || (zebra ? 'F8FAFC' : 'FFFFFF') } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: ALL_THIN_BORDERS,
    numFmt,
  }),
  totalLabel: {
    font: { name: 'Arial', sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '1E293B' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: { top: BORDER_MED_DARK, bottom: BORDER_MED_DARK, left: BORDER_MED_DARK, right: BORDER_MED_DARK },
  },
  totalMoneyBlue: {
    font: { name: 'Arial', sz: 11, bold: true, color: { rgb: '1E3A8A' } },
    fill: { fgColor: { rgb: 'DBEAFE' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: { top: BORDER_MED_DARK, bottom: BORDER_MED_DARK, left: BORDER_THIN, right: BORDER_THIN },
    numFmt: '#,##0.00" ج.م"',
  },
  totalMoneyGreen: {
    font: { name: 'Arial', sz: 11, bold: true, color: { rgb: '065F46' } },
    fill: { fgColor: { rgb: 'DCFCE7' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: { top: BORDER_MED_DARK, bottom: BORDER_MED_DARK, left: BORDER_THIN, right: BORDER_THIN },
    numFmt: '#,##0.00" ج.م"',
  },
  totalQtyGreen: {
    font: { name: 'Arial', sz: 11, bold: true, color: { rgb: '065F46' } },
    fill: { fgColor: { rgb: 'DCFCE7' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: { top: BORDER_MED_DARK, bottom: BORDER_MED_DARK, left: BORDER_THIN, right: BORDER_THIN },
    numFmt: '#,##0.##',
  },
  totalPercent: {
    font: { name: 'Arial', sz: 11, bold: true, color: { rgb: '0F172A' } },
    fill: { fgColor: { rgb: 'E2E8F0' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: { top: BORDER_MED_DARK, bottom: BORDER_MED_DARK, left: BORDER_THIN, right: BORDER_THIN },
    numFmt: '0.0%',
  },
};

function calcRowHeight(text: string, colWidthChars: number, minHeight = 24): number {
  const safeText = String(text || '');
  if (!safeText) return minHeight;
  const lines = safeText.split('\n');
  let totalLines = 0;
  const effectiveChars = Math.max(12, colWidthChars - 4);
  for (const line of lines) {
    totalLines += Math.max(1, Math.ceil(line.length / effectiveChars));
  }
  return Math.max(minHeight, totalLines * 16 + 8);
}

function setCell(
  ws: any,
  r: number,
  c: number,
  v: string | number,
  s: any,
  formula?: string
) {
  const ref = XLSX.utils.encode_cell({ r, c });
  if (typeof v === 'number') {
    const cell: any = { t: 'n', v, s };
    if (formula) cell.f = formula;
    ws[ref] = cell;
  } else {
    ws[ref] = { t: 's', v: String(v ?? ''), s };
  }
}

function styleMergedRange(
  ws: any,
  merges: any[],
  r1: number,
  c1: number,
  r2: number,
  c2: number,
  v: string | number,
  s: any,
  formula?: string
) {
  if (r1 !== r2 || c1 !== c2) {
    merges.push({ s: { r: r1, c: c1 }, e: { r: r2, c: c2 } });
  }
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      if (r === r1 && c === c1) {
        setCell(ws, r, c, v, s, formula);
      } else {
        setCell(ws, r, c, '', s);
      }
    }
  }
}

function finalizeSheet(
  ws: any,
  maxRowIdx: number,
  maxColIdx: number,
  colWidths: number[],
  rowHeights: { [rowIdx: number]: number },
  merges: any[],
  freezeRows = 5
) {
  ws['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: maxRowIdx, c: maxColIdx },
  });
  ws['!cols'] = colWidths.map((wch) => ({ wch }));
  const rowsArr: any[] = [];
  for (let r = 0; r <= maxRowIdx; r++) {
    rowsArr[r] = rowHeights[r] ? { hpt: rowHeights[r] } : { hpt: 22 };
  }
  ws['!rows'] = rowsArr;
  if (merges.length > 0) ws['!merges'] = merges;
  ws['!views'] = [
    {
      rightToLeft: true,
      state: 'frozen',
      ySplit: freezeRows,
      xSplit: 0,
    },
  ];
  ws['!pageSetup'] = {
    orientation: 'landscape',
    paperSize: 9,
    fitToWidth: 1,
    fitToHeight: 0,
  };
  ws['!margins'] = {
    left: 0.3,
    right: 0.3,
    top: 0.4,
    bottom: 0.4,
    header: 0.2,
    footer: 0.2,
  };
}

export function exportBoqBatchToExcel(params: {
  projectName: string;
  contractorName: string;
  batchName: string;
  items: BOQItem[];
}) {
  const { projectName, contractorName, batchName, items } = params;
  const today = new Date().toISOString().split('T')[0];

  const ws: any = {};
  const merges: any[] = [];
  const rowHeights: { [r: number]: number } = {};
  const colWidths = [12, 54, 11, 16, 15, 20, 16, 20, 13];

  const pricedCount = items.filter(
    (it) => (Number(it.quantity) || 0) > 0 || (Number(it.unitPrice) || 0) > 0
  ).length;

  // Row 0: Title Banner
  styleMergedRange(ws, merges, 0, 0, 0, 8, `مقايسة أعمال هندسية — ${batchName || 'المقايسة'}`, STYLES.banner);
  rowHeights[0] = 34;

  // Row 1-2: Project Metadata Cards
  setCell(ws, 1, 0, 'اسم المشروع', STYLES.metaLabel);
  styleMergedRange(ws, merges, 1, 1, 1, 5, projectName || 'مشروع هندسي', STYLES.metaValue);
  setCell(ws, 1, 6, 'تاريخ التصدير', STYLES.metaLabel);
  styleMergedRange(ws, merges, 1, 7, 1, 8, today, { ...STYLES.metaValue, alignment: { horizontal: 'center', vertical: 'center' } });
  rowHeights[1] = 24;

  setCell(ws, 2, 0, 'المقاول المنفذ', STYLES.metaLabel);
  styleMergedRange(ws, merges, 2, 1, 2, 5, contractorName || 'المقاول العام', STYLES.metaValue);
  setCell(ws, 2, 6, 'عدد البنود', STYLES.metaLabel);
  styleMergedRange(ws, merges, 2, 7, 2, 8, `${pricedCount} بند`, { ...STYLES.metaValue, alignment: { horizontal: 'center', vertical: 'center' } });
  rowHeights[2] = 24;

  // Row 3: Spacer
  rowHeights[3] = 10;

  // Row 4: Table Headers
  const headers = [
    'رقم البند',
    'بيان الأعمال والمواصفات',
    'الوحدة',
    'الكمية التعاقدية',
    'الفئة (ج.م)',
    'الإجمالي التعاقدي (ج.م)',
    'الكمية المنفذة',
    'قيمة المنفذ (ج.م)',
    'نسبة التنفيذ',
  ];
  headers.forEach((h, c) => setCell(ws, 4, c, h, STYLES.tableHeader));
  rowHeights[4] = 30;

  let r = 5;
  const firstDataRow1Based = 6;
  let totalContract = 0;
  let totalExecuted = 0;
  let zebraIdx = 0;

  // Breakdown sheet data collector
  const breakdownEntries: {
    itemCode: string;
    itemDesc: string;
    workDesc: string;
    unit: string;
    qty: number;
    val: number;
  }[] = [];

  for (const item of items) {
    const codeStr = String(item.itemCode || '').trim();
    const unitStr = String(item.unit || '').trim();
    const descStr = String(item.description || '').trim();
    const qty = Number(item.quantity) || 0;
    const price = Number(item.unitPrice) || 0;
    const execQty = Number(item.executedQuantity) || 0;
    const isNonPriced = qty === 0 && price === 0;
    const isNote =
      /note/i.test(codeStr) ||
      /note/i.test(unitStr) ||
      (isNonPriced && /^(ملحوظ|ملاحظ|تنبيه|شرط)/.test(descStr));
    const isHeader =
      /header/i.test(codeStr) ||
      /header/i.test(unitStr) ||
      (isNonPriced && !isNote);

    if (isNote) {
      setCell(ws, r, 0, 'ملاحظة', { ...STYLES.noteRow, alignment: { horizontal: 'center', vertical: 'center' } });
      styleMergedRange(ws, merges, r, 1, r, 8, descStr, STYLES.noteRow);
      rowHeights[r] = calcRowHeight(descStr, 110, 24);
      r++;
      continue;
    }

    if (isHeader) {
      const displayHeader = !/header/i.test(codeStr) && codeStr ? `${codeStr} - ${descStr}` : descStr;
      styleMergedRange(ws, merges, r, 0, r, 8, displayHeader, STYLES.groupHeader);
      rowHeights[r] = calcRowHeight(displayHeader, 120, 26);
      r++;
      continue;
    }

    const excelRow = r + 1;
    const contractVal = Math.round(qty * price * 100) / 100;
    const execVal = Math.round(execQty * price * 100) / 100;
    const ratio = qty > 0 ? execQty / qty : 0;
    const zebra = zebraIdx % 2 === 1;
    zebraIdx++;

    totalContract += contractVal;
    totalExecuted += execVal;

    setCell(ws, r, 0, codeStr || '-', STYLES.cellCenter(zebra, true, '1E3A8A'));
    setCell(ws, r, 1, descStr, STYLES.cellTextRight(zebra));
    setCell(ws, r, 2, unitStr, STYLES.cellCenter(zebra, false, '475569'));
    setCell(ws, r, 3, qty, STYLES.cellNumber(zebra, '#,##0.##', true, '0F172A'));
    setCell(ws, r, 4, price, STYLES.cellNumber(zebra, '#,##0.00', false, '0F172A'));
    setCell(
      ws,
      r,
      5,
      contractVal,
      STYLES.cellNumber(zebra, '#,##0.00', true, '0F172A', zebra ? 'EEF2FF' : 'F8FAFC'),
      `ROUND(D${excelRow}*E${excelRow},2)`
    );
    setCell(
      ws,
      r,
      6,
      execQty,
      STYLES.cellNumber(zebra, '#,##0.##', true, '065F46', 'ECFDF5')
    );
    setCell(
      ws,
      r,
      7,
      execVal,
      STYLES.cellNumber(zebra, '#,##0.00', true, '065F46', 'ECFDF5'),
      `ROUND(G${excelRow}*E${excelRow},2)`
    );
    setCell(
      ws,
      r,
      8,
      ratio,
      STYLES.cellNumber(zebra, '0.0%', true, '1E3A8A'),
      `IF(D${excelRow}>0,G${excelRow}/D${excelRow},0)`
    );

    rowHeights[r] = calcRowHeight(descStr, colWidths[1], 24);
    r++;

    if (Array.isArray(item.executionBreakdown) && item.executionBreakdown.length > 0) {
      for (const bRow of item.executionBreakdown) {
        breakdownEntries.push({
          itemCode: codeStr || '-',
          itemDesc: descStr,
          workDesc: bRow.workDescription || '',
          unit: unitStr,
          qty: Number(bRow.executedQuantity) || 0,
          val: Number(bRow.executedValue) || 0,
        });
      }
    }
  }

  const lastDataRow1Based = Math.max(firstDataRow1Based, r);
  const totalExcelRow = r + 1;

  // Totals Row
  styleMergedRange(ws, merges, r, 0, r, 4, 'الإجمالي العام للمقايسة', STYLES.totalLabel);
  setCell(
    ws,
    r,
    5,
    Math.round(totalContract * 100) / 100,
    STYLES.totalMoneyBlue,
    `SUM(F${firstDataRow1Based}:F${lastDataRow1Based})`
  );
  setCell(ws, r, 6, '-', STYLES.totalLabel);
  setCell(
    ws,
    r,
    7,
    Math.round(totalExecuted * 100) / 100,
    STYLES.totalMoneyGreen,
    `SUM(H${firstDataRow1Based}:H${lastDataRow1Based})`
  );
  setCell(
    ws,
    r,
    8,
    totalContract > 0 ? totalExecuted / totalContract : 0,
    STYLES.totalPercent,
    `IF(F${totalExcelRow}>0,H${totalExcelRow}/F${totalExcelRow},0)`
  );
  rowHeights[r] = 28;

  finalizeSheet(ws, r, 8, colWidths, rowHeights, merges, 5);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(batchName, 'المقايسة'));

  // Sheet 2: Execution Breakdown Sheet (if present)
  if (breakdownEntries.length > 0) {
    const wsBk: any = {};
    const bkMerges: any[] = [];
    const bkRowHeights: { [r: number]: number } = {};
    const bkColWidths = [12, 42, 42, 11, 16, 22];

    styleMergedRange(wsBk, bkMerges, 0, 0, 0, 5, `بيان حصر الأعمال المنفذة — ${batchName || 'المقايسة'}`, STYLES.banner);
    bkRowHeights[0] = 34;

    setCell(wsBk, 1, 0, 'اسم المشروع', STYLES.metaLabel);
    styleMergedRange(wsBk, bkMerges, 1, 1, 1, 3, projectName || 'مشروع هندسي', STYLES.metaValue);
    setCell(wsBk, 1, 4, 'تاريخ التصدير', STYLES.metaLabel);
    setCell(wsBk, 1, 5, today, { ...STYLES.metaValue, alignment: { horizontal: 'center', vertical: 'center' } });
    bkRowHeights[1] = 24;

    bkRowHeights[2] = 10;

    const bkHeaders = ['رقم البند', 'بيان البند بالمقايسة', 'وصف الأعمال المنفذة (الحصر)', 'الوحدة', 'الكمية المنفذة', 'قيمة الأعمال المنفذة (ج.م)'];
    bkHeaders.forEach((h, c) => setCell(wsBk, 3, c, h, STYLES.tableHeader));
    bkRowHeights[3] = 28;

    let br = 4;
    let sumBkQty = 0;
    let sumBkVal = 0;

    breakdownEntries.forEach((entry, idx) => {
      const zebra = idx % 2 === 1;
      sumBkQty += entry.qty;
      sumBkVal += entry.val;

      setCell(wsBk, br, 0, entry.itemCode, STYLES.cellCenter(zebra, true, '1E3A8A'));
      setCell(wsBk, br, 1, entry.itemDesc, STYLES.cellTextRight(zebra));
      setCell(wsBk, br, 2, entry.workDesc, STYLES.cellTextRight(zebra));
      setCell(wsBk, br, 3, entry.unit, STYLES.cellCenter(zebra, false, '475569'));
      setCell(wsBk, br, 4, entry.qty, STYLES.cellNumber(zebra, '#,##0.##', true, '065F46', 'ECFDF5'));
      setCell(wsBk, br, 5, entry.val, STYLES.cellNumber(zebra, '#,##0.00', true, '1E3A8A', 'EFF6FF'));
      bkRowHeights[br] = Math.max(
        calcRowHeight(entry.itemDesc, bkColWidths[1], 24),
        calcRowHeight(entry.workDesc, bkColWidths[2], 24)
      );
      br++;
    });

    const lastBkExcelRow = br;
    styleMergedRange(wsBk, bkMerges, br, 0, br, 3, 'إجمالي حصر الأعمال المنفذة', STYLES.totalLabel);
    setCell(wsBk, br, 4, Math.round(sumBkQty * 1000) / 1000, STYLES.totalQtyGreen, `SUM(E5:E${lastBkExcelRow})`);
    setCell(wsBk, br, 5, Math.round(sumBkVal * 100) / 100, STYLES.totalMoneyBlue, `SUM(F5:F${lastBkExcelRow})`);
    bkRowHeights[br] = 28;

    finalizeSheet(wsBk, br, 5, bkColWidths, bkRowHeights, bkMerges, 4);
    XLSX.utils.book_append_sheet(wb, wsBk, 'بيان حصر الأعمال');
  }

  const fileName = `مقايسة_${sanitizeFileName(batchName, 'BOQ')}_${sanitizeFileName(projectName, 'project')}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

export function exportPaymentToExcel(params: {
  projectName: string;
  contractorName: string;
  payment: ProjectPayment;
  boqItems: BOQItem[];
}) {
  const { projectName, contractorName, payment, boqItems } = params;
  const itemsList = (payment.items || []).filter(
    (i) => (Number(i.totalQuantity) || 0) > 0 || (Number(i.currQuantity) || 0) > 0
  );

  const grossWork = Number(payment.grossCurrentWork ?? payment.netAmount ?? 0) || 0;
  const retAmt = Number(payment.retentionAmount) || 0;
  const advAmt = Number(payment.advanceDeductionAmount) || 0;
  const taxAmt = Number(payment.taxesAndOtherAmount) || 0;
  const netPayable = Number(payment.netPayableAfterDeductions ?? payment.netAmount ?? 0) || 0;

  const ws: any = {};
  const merges: any[] = [];
  const rowHeights: { [r: number]: number } = {};
  const colWidths = [6, 11, 22, 46, 10, 15, 13, 13, 14, 13, 11, 19];

  // Row 0: Banner
  styleMergedRange(
    ws,
    merges,
    0,
    0,
    0,
    11,
    `مستخلص أعمال جاري رقم (${payment.invoiceNumber || '-'})`,
    STYLES.banner
  );
  rowHeights[0] = 34;

  // Row 1-2: Metadata Info Block
  styleMergedRange(ws, merges, 1, 0, 1, 1, 'اسم المشروع', STYLES.metaLabel);
  styleMergedRange(ws, merges, 1, 2, 1, 6, projectName || 'مشروع هندسي', STYLES.metaValue);
  styleMergedRange(ws, merges, 1, 7, 1, 8, 'رقم المستخلص', STYLES.metaLabel);
  styleMergedRange(ws, merges, 1, 9, 1, 11, `مستخلص جاري رقم (${payment.invoiceNumber || '-'})`, {
    ...STYLES.metaValue,
    alignment: { horizontal: 'center', vertical: 'center' },
  });
  rowHeights[1] = 24;

  styleMergedRange(ws, merges, 2, 0, 2, 1, 'المقاول المنفذ', STYLES.metaLabel);
  styleMergedRange(ws, merges, 2, 2, 2, 6, contractorName || 'المقاول العام', STYLES.metaValue);
  styleMergedRange(ws, merges, 2, 7, 2, 8, 'تاريخ المستخلص', STYLES.metaLabel);
  styleMergedRange(ws, merges, 2, 9, 2, 11, payment.date || '-', {
    ...STYLES.metaValue,
    alignment: { horizontal: 'center', vertical: 'center' },
  });
  rowHeights[2] = 24;

  // Row 3: Spacer
  rowHeights[3] = 10;

  // Row 4: Table Headers
  const headers = [
    'م',
    'رقم البند',
    'المقايسة / الباب',
    'بيان الأعمال',
    'الوحدة',
    'الكمية التعاقدية',
    'السابقة',
    'الحالية',
    'الإجمالية',
    'الفئة (ج.م)',
    'النسبة',
    'الإجمالي (ج.م)',
  ];
  headers.forEach((h, c) => setCell(ws, 4, c, h, STYLES.tableHeader));
  rowHeights[4] = 30;

  // Group items by BOQ batchName
  const grouped = new Map<string, PaymentItem[]>();
  itemsList.forEach((it) => {
    const matchedBoq = it.boqItemId
      ? boqItems.find((b) => b.id === it.boqItemId)
      : boqItems.find((b) => String(b.itemCode).trim() === String(it.itemCode).trim());
    const bName =
      (
        it.batchName ||
        matchedBoq?.batchName ||
        (matchedBoq as any)?.category ||
        'المقايسة الأساسية'
      ).trim() || 'المقايسة الأساسية';
    const arr = grouped.get(bName) || [];
    arr.push(it);
    grouped.set(bName, arr);
  });

  let r = 5;
  const firstItemRow1Based = 6;
  let serial = 1;
  let itemsTotalSum = 0;

  if (itemsList.length > 0) {
    for (const [bName, groupItems] of grouped.entries()) {
      const groupSum = groupItems.reduce((s, i) => s + (Number(i.totalValue) || 0), 0);
      styleMergedRange(ws, merges, r, 0, r, 8, `📂 ${bName} (${groupItems.length} بند)`, STYLES.groupHeader);
      styleMergedRange(ws, merges, r, 9, r, 11, `إجمالي المقايسة: ${groupSum.toLocaleString('en-US')} ج.م`, {
        ...STYLES.groupHeader,
        alignment: { horizontal: 'center', vertical: 'center' },
      });
      rowHeights[r] = 24;
      r++;

      for (const it of groupItems) {
        const zebra = serial % 2 === 0;
        const excelRow = r + 1;
        const contractQ = Number(it.contractQuantity) || 0;
        const prevQ = Number(it.prevQuantity) || 0;
        const currQ = Number(it.currQuantity) || 0;
        const totalQ = Number(it.totalQuantity) || 0;
        const unitPrice = Number(it.unitPrice) || 0;
        const ratioPercent = Number(it.completionRatio ?? 100);
        const val = Number(it.totalValue) || 0;

        itemsTotalSum += val;

        setCell(ws, r, 0, serial++, STYLES.cellCenter(zebra, true, '475569'));
        setCell(ws, r, 1, it.itemCode || '-', STYLES.cellCenter(zebra, true, '1E3A8A'));
        setCell(ws, r, 2, bName, STYLES.cellCenter(zebra, false, '475569'));
        setCell(ws, r, 3, it.description || '-', STYLES.cellTextRight(zebra));
        setCell(ws, r, 4, it.unit || '', STYLES.cellCenter(zebra, false, '475569'));
        setCell(ws, r, 5, contractQ, STYLES.cellNumber(zebra, '#,##0.##', false, '0F172A'));
        setCell(ws, r, 6, prevQ, STYLES.cellNumber(zebra, '#,##0.##', false, '0F172A'));
        setCell(ws, r, 7, currQ, STYLES.cellNumber(zebra, '#,##0.##', true, '166534', 'ECFDF5'));
        setCell(ws, r, 8, totalQ, STYLES.cellNumber(zebra, '#,##0.##', true, '1E40AF', 'EFF6FF'));
        setCell(ws, r, 9, unitPrice, STYLES.cellNumber(zebra, '#,##0.00', false, '0F172A'));
        setCell(ws, r, 10, ratioPercent / 100, STYLES.cellNumber(zebra, '0%', true, '334155'));
        setCell(
          ws,
          r,
          11,
          val,
          STYLES.cellNumber(zebra, '#,##0.00', true, '0F172A', 'FEFCE8'),
          `ROUND(I${excelRow}*J${excelRow}*K${excelRow},2)`
        );

        rowHeights[r] = calcRowHeight(it.description || '-', colWidths[3], 24);
        r++;
      }
    }

    const lastItemRow1Based = r;
    styleMergedRange(ws, merges, r, 0, r, 10, 'إجمالي قيمة بنود المستخلص', STYLES.totalLabel);
    setCell(
      ws,
      r,
      11,
      Math.round(itemsTotalSum * 100) / 100,
      STYLES.totalMoneyBlue,
      `SUM(L${firstItemRow1Based}:L${lastItemRow1Based})`
    );
    rowHeights[r] = 28;
    r++;
  } else {
    styleMergedRange(ws, merges, r, 0, r, 10, 'مستخلص إجمالي بدون تفصيل بنود', STYLES.cellTextRight(false));
    setCell(ws, r, 11, grossWork, STYLES.cellNumber(false, '#,##0.00', true, '0F172A', 'FEFCE8'));
    rowHeights[r] = 26;
    r++;
  }

  // Spacer
  rowHeights[r] = 12;
  r++;

  // Financial Summary Table
  styleMergedRange(
    ws,
    merges,
    r,
    0,
    r,
    11,
    'الملخص المالي وحساب الاستقطاعات والصافي المستحق',
    {
      ...STYLES.tableHeader,
      font: { name: 'Arial', sz: 11.5, bold: true, color: { rgb: 'FFFFFF' } },
    }
  );
  rowHeights[r] = 28;
  r++;

  const addSummaryRow = (label: string, amount: number, styleLabel: any, styleAmt: any) => {
    styleMergedRange(ws, merges, r, 0, r, 8, label, styleLabel);
    styleMergedRange(ws, merges, r, 9, r, 11, amount, styleAmt);
    rowHeights[r] = 25;
    r++;
  };

  addSummaryRow(
    'إجمالي قيمة الأعمال التراكمية حتى تاريخه',
    Number(payment.cumulativeAmount) || 0,
    STYLES.metaValue,
    { ...STYLES.cellNumber(false, '#,##0.00" ج.م"', true, '0F172A', 'F8FAFC') }
  );

  addSummaryRow(
    'إجمالي أعمال المستخلص الجاري (قبل الاستقطاعات)',
    grossWork,
    STYLES.metaValue,
    { ...STYLES.cellNumber(false, '#,##0.00" ج.م"', true, '1E40AF', 'EFF6FF') }
  );

  const deductLabelStyle = {
    font: { name: 'Arial', sz: 10, bold: true, color: { rgb: '991B1B' } },
    fill: { fgColor: { rgb: 'FEF2F2' } },
    alignment: { horizontal: 'right', vertical: 'center', wrapText: true },
    border: ALL_THIN_BORDERS,
  };
  const deductAmtStyle = {
    font: { name: 'Arial', sz: 10, bold: true, color: { rgb: '991B1B' } },
    fill: { fgColor: { rgb: 'FEF2F2' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: ALL_THIN_BORDERS,
    numFmt: '#,##0.00" ج.م"',
  };

  if (retAmt > 0) {
    addSummaryRow(`(-) خصم تأمين ضمان أعمال (${payment.retentionPercent || 0}%)`, -retAmt, deductLabelStyle, deductAmtStyle);
  }
  if (advAmt > 0) {
    addSummaryRow(`(-) استرداد دفعة مقدمة (${payment.advanceDeductionPercent || 0}%)`, -advAmt, deductLabelStyle, deductAmtStyle);
  }
  if (taxAmt > 0) {
    addSummaryRow(`(-) ضرائب ودمغات واستقطاعات أخرى (${payment.taxesAndOtherPercent || 0}%)`, -taxAmt, deductLabelStyle, deductAmtStyle);
  }

  styleMergedRange(ws, merges, r, 0, r, 8, 'صافي المستحق للصرف للمقاول في هذا المستخلص', {
    font: { name: 'Arial', sz: 11.5, bold: true, color: { rgb: '14532D' } },
    fill: { fgColor: { rgb: 'DCFCE7' } },
    alignment: { horizontal: 'right', vertical: 'center', wrapText: true },
    border: { top: BORDER_MED_DARK, bottom: BORDER_MED_DARK, left: BORDER_THIN, right: BORDER_MED_DARK },
  });
  styleMergedRange(ws, merges, r, 9, r, 11, netPayable, {
    font: { name: 'Arial', sz: 12, bold: true, color: { rgb: '14532D' } },
    fill: { fgColor: { rgb: 'DCFCE7' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: { top: BORDER_MED_DARK, bottom: BORDER_MED_DARK, left: BORDER_MED_DARK, right: BORDER_THIN },
    numFmt: '#,##0.00" ج.م"',
  });
  rowHeights[r] = 30;
  r++;

  if (payment.note) {
    rowHeights[r] = 10;
    r++;
    styleMergedRange(ws, merges, r, 0, r, 11, `ملاحظات المستخلص: ${payment.note}`, STYLES.noteRow);
    rowHeights[r] = calcRowHeight(payment.note, 130, 26);
    r++;
  }

  // Signature Block
  rowHeights[r] = 14;
  r++;
  const sigStyle = {
    font: { name: 'Arial', sz: 10, bold: true, color: { rgb: '1E293B' } },
    fill: { fgColor: { rgb: 'F1F5F9' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: ALL_THIN_BORDERS,
  };
  styleMergedRange(ws, merges, r, 0, r, 2, `المقاول المنفذ\n${contractorName || ''}`, sigStyle);
  styleMergedRange(ws, merges, r, 3, r, 5, 'مهندس التنفيذ / الحصر', sigStyle);
  styleMergedRange(ws, merges, r, 6, r, 8, 'المكتب الفني / المراجعة', sigStyle);
  styleMergedRange(ws, merges, r, 9, r, 11, 'اعتماد الاستشاري / المدير', sigStyle);
  rowHeights[r] = 36;

  finalizeSheet(ws, r, 11, colWidths, rowHeights, merges, 5);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(`مستخلص ${payment.invoiceNumber || '1'}`, 'المستخلص'));

  const fileName = `مستخلص_رقم_${sanitizeFileName(String(payment.invoiceNumber || '1'), '1')}_${sanitizeFileName(payment.date || '', 'ipc')}.xlsx`;
  XLSX.writeFile(wb, fileName);
}


async function loadImageAsJpegBase64(
  src: string,
  ratioMode: LogImageAspectMode = '1:1'
): Promise<{ base64: string; width: number; height: number } | null> {
  if (!src || typeof document === 'undefined') return null;

  const renderToJpeg = (imgSrc: string): Promise<{ base64: string; width: number; height: number } | null> => {
    return new Promise((resolve) => {
      const img = new Image();
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(null);
        }
      }, 6000);

      if (!/^data:|^blob:/i.test(imgSrc)) {
        img.crossOrigin = 'anonymous';
      }
      img.onload = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          const natW = img.naturalWidth || img.width || 400;
          const natH = img.naturalHeight || img.height || 300;

          let sx = 0;
          let sy = 0;
          let cropW = natW;
          let cropH = natH;

          if (ratioMode === '1:1' || ratioMode === '3:4') {
            const targetAspect = ratioMode === '1:1' ? 1 : (3 / 4);
            const srcRatio = natW / natH;
            if (Math.abs(srcRatio - targetAspect) > 0.001) {
              if (srcRatio > targetAspect) {
                cropH = natH;
                cropW = Math.max(1, Math.round(natH * targetAspect));
                sx = Math.max(0, Math.round((natW - cropW) / 2));
                sy = 0;
              } else {
                cropW = natW;
                cropH = Math.max(1, Math.round(natW / targetAspect));
                sx = 0;
                sy = Math.max(0, Math.round((natH - cropH) / 2));
              }
            }
          }

          const maxDim = 720;
          const scale = Math.min(1, maxDim / Math.max(cropW, cropH));
          const outW = Math.max(1, Math.round(cropW * scale));
          const outH = Math.max(1, Math.round(cropH * scale));

          const canvas = document.createElement('canvas');
          canvas.width = outW;
          canvas.height = outH;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(null);
            return;
          }
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, outW, outH);
          ctx.drawImage(img, sx, sy, cropW, cropH, 0, 0, outW, outH);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.86);
          const commaIdx = dataUrl.indexOf(',');
          const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
          resolve({ base64, width: outW, height: outH });
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(null);
      };
      img.src = imgSrc;
    });
  };

  const direct = await renderToJpeg(src);
  if (direct) return direct;

  // Fallback for remote or relative URLs that require fetch -> blob URL
  if (/^https?:|^\//i.test(src)) {
    try {
      const res = await fetch(src);
      if (res.ok) {
        const blob = await res.blob();
        const objUrl = URL.createObjectURL(blob);
        try {
          return await renderToJpeg(objUrl);
        } finally {
          URL.revokeObjectURL(objUrl);
        }
      }
    } catch {}
  }

  return null;
}

export async function exportLogsToExcel(params: {
  projectName: string;
  contractorName: string;
  filterSummary: string;
  logs: ProjectLog[];
  boqItems: BOQItem[];
}) {
  const { projectName, contractorName, filterSummary, logs, boqItems } = params;
  const today = new Date().toISOString().split('T')[0];

  const maxLogPhotos = Math.min(
    4,
    Math.max(1, ...logs.map((l) => (Array.isArray(l.images) ? l.images.length : 0)))
  );
  const totalCols = 6 + maxLogPhotos; // 6 text columns (A..F) + maxLogPhotos image columns

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Construction Manager Pro';
  wb.created = new Date();

  const ws = wb.addWorksheet('سجل اليوميات', {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 5 }],
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    },
  });

  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  };
  const medDarkBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'medium', color: { argb: 'FF1E293B' } },
    bottom: { style: 'medium', color: { argb: 'FF1E293B' } },
    left: { style: 'medium', color: { argb: 'FF1E293B' } },
    right: { style: 'medium', color: { argb: 'FF1E293B' } },
  };

  // Column widths
  const baseWidths = [6, 14, 20, 13, 28, 44];
  const photoColWidths = Array.from({ length: maxLogPhotos }, () => 28);
  ws.columns = [...baseWidths, ...photoColWidths].map((width) => ({ width }));

  // Row 1: Banner
  ws.mergeCells(1, 1, 1, totalCols);
  const bannerCell = ws.getCell(1, 1);
  bannerCell.value = 'تقرير مجمع لليوميات والأعمال المنفذة بالصور';
  bannerCell.font = { name: 'Arial', size: 15, bold: true, color: { argb: 'FFFFFFFF' } };
  bannerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  bannerCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  bannerCell.border = medDarkBorder;
  ws.getRow(1).height = 34;

  // Row 2-3: Metadata
  const applyMetaStyle = (cell: ExcelJS.Cell, isLabel: boolean, centered = false) => {
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: isLabel ? 'FF1E293B' : 'FF0F172A' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isLabel ? 'FFE2E8F0' : 'FFF8FAFC' } };
    cell.alignment = { horizontal: centered ? 'center' : 'right', vertical: 'middle', wrapText: true };
    cell.border = thinBorder;
  };

  ws.getCell(2, 1).value = 'المشروع';
  applyMetaStyle(ws.getCell(2, 1), true);
  ws.mergeCells(2, 2, 2, 4);
  ws.getCell(2, 2).value = projectName || 'مشروع هندسي';
  for (let c = 2; c <= 4; c++) applyMetaStyle(ws.getCell(2, c), false);

  ws.getCell(2, 5).value = 'بيان التقرير';
  applyMetaStyle(ws.getCell(2, 5), true);
  ws.mergeCells(2, 6, 2, totalCols);
  ws.getCell(2, 6).value = filterSummary || 'جميع اليوميات المسجلة';
  for (let c = 6; c <= totalCols; c++) applyMetaStyle(ws.getCell(2, c), false);
  ws.getRow(2).height = 24;

  ws.getCell(3, 1).value = 'المقاول';
  applyMetaStyle(ws.getCell(3, 1), true);
  ws.mergeCells(3, 2, 3, 4);
  ws.getCell(3, 2).value = contractorName || 'المقاول العام';
  for (let c = 2; c <= 4; c++) applyMetaStyle(ws.getCell(3, c), false);

  ws.getCell(3, 5).value = 'تاريخ التصدير';
  applyMetaStyle(ws.getCell(3, 5), true);
  ws.mergeCells(3, 6, 3, totalCols);
  ws.getCell(3, 6).value = `${today}  |  إجمالي اليوميات: ${logs.length} يومية`;
  for (let c = 6; c <= totalCols; c++) applyMetaStyle(ws.getCell(3, c), false, true);
  ws.getRow(3).height = 24;

  // Row 4: Spacer
  ws.getRow(4).height = 10;

  // Row 5: Table Header
  const headerTitles = [
    'م',
    'التاريخ',
    'نوع العمل',
    'رقم البند',
    'بند المقايسة المرتبط',
    'بيان الأعمال المنفذة بالموقع',
    ...Array.from({ length: maxLogPhotos }, (_, i) => (maxLogPhotos === 1 ? 'صورة الموقع المرفقة' : `صورة ${i + 1}`)),
  ];
  const headerRow = ws.getRow(5);
  headerRow.height = 30;
  headerTitles.forEach((title, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = title;
    cell.font = { name: 'Arial', size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF1E293B' } },
      bottom: { style: 'medium', color: { argb: 'FF1E293B' } },
      left: { style: 'thin', color: { argb: 'FF93C5FD' } },
      right: { style: 'thin', color: { argb: 'FF93C5FD' } },
    };
  });

  // Preload & convert all log images in parallel so export is fast
  const decodedLogsImages = await Promise.all(
    logs.map(async (log) => {
      const imgs = Array.isArray(log.images) ? log.images.slice(0, maxLogPhotos) : [];
      if (imgs.length === 0) return [];
      return Promise.all(
        imgs.map((src, i) => {
          const mode: LogImageAspectMode = log.imageModes?.[i] || '1:1';
          return loadImageAsJpegBase64(src, mode);
        })
      );
    })
  );

  let currentRow = 6;
  let totalPhotosCount = 0;

  logs.forEach((log, idx) => {
    const zebra = idx % 2 === 1;
    const rowBg = zebra ? 'FFF8FAFC' : 'FFFFFFFF';
    const matchedBoq = log.boqItemId ? boqItems.find((b) => b.id === log.boqItemId) : undefined;
    const boqCode = (log.boqItemCode || matchedBoq?.itemCode || '-').trim();
    const boqDesc = (log.boqItemDescription || matchedBoq?.description || '').trim();
    const extraPhotosNote =
      Array.isArray(log.images) && log.images.length > maxLogPhotos
        ? `\n[+ ${log.images.length - maxLogPhotos} صور إضافية]`
        : '';
    const contentText = ((log.content || 'توثيق مصور للأعمال المنفذة بالموقع').trim()) + extraPhotosNote;
    const rowImages = decodedLogsImages[idx] || [];
    const validImagesCount = rowImages.filter(Boolean).length;
    totalPhotosCount += Array.isArray(log.images) ? log.images.length : 0;

    const row = ws.getRow(currentRow);
    const values = [
      idx + 1,
      log.date || '-',
      log.workCategory || 'عام',
      boqCode,
      boqDesc || '-',
      contentText,
    ];

    values.forEach((val, cIdx) => {
      const cell = row.getCell(cIdx + 1);
      cell.value = val;
      cell.border = thinBorder;

      if (cIdx === 0) {
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF475569' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else if (cIdx === 1) {
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF0F172A' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else if (cIdx === 2) {
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF92400E' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: log.workCategory ? 'FFFEF3C7' : rowBg } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      } else if (cIdx === 3) {
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF1E3A8A' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: boqCode !== '-' ? 'FFEEF2FF' : rowBg } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      } else {
        cell.font = { name: 'Arial', size: 10, color: { argb: 'FF0F172A' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
        cell.alignment = { horizontal: 'right', vertical: 'middle', wrapText: true };
      }
    });

    // Style photo cells and embed actual photos inside them
    for (let p = 0; p < maxLogPhotos; p++) {
      const col1Based = 7 + p;
      const photoCell = row.getCell(col1Based);
      photoCell.border = thinBorder;
      photoCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
      photoCell.alignment = { horizontal: 'center', vertical: 'middle' };

      const imgObj = rowImages[p];
      if (imgObj && imgObj.base64) {
        const imgId = wb.addImage({
          base64: imgObj.base64,
          extension: 'jpeg',
        });
        const maxDrawW = 182;
        const maxDrawH = 160;
        const scale = Math.min(maxDrawW / imgObj.width, maxDrawH / imgObj.height);
        const drawW = Math.max(20, Math.round(imgObj.width * scale));
        const drawH = Math.max(20, Math.round(imgObj.height * scale));

        ws.addImage(imgId, {
          tl: { col: col1Based - 1 + 0.06, row: currentRow - 1 + 0.06 },
          ext: { width: drawW, height: drawH },
          editAs: 'oneCell',
        });
      } else if (p === 0 && validImagesCount === 0) {
        photoCell.value = 'بدون صور';
        photoCell.font = { name: 'Arial', size: 9.5, italic: true, color: { argb: 'FF94A3B8' } };
      }
    }

    const textHeight = Math.max(
      calcRowHeight(contentText, baseWidths[5], 28),
      calcRowHeight(boqDesc, baseWidths[4], 28)
    );
    row.height = validImagesCount > 0 ? Math.max(134, textHeight) : textHeight;
    currentRow++;
  });

  // Totals row
  ws.mergeCells(currentRow, 1, currentRow, 6);
  const totLabelCell = ws.getCell(currentRow, 1);
  totLabelCell.value = `إجمالي اليوميات المسجلة: ${logs.length} يومية`;
  for (let c = 1; c <= 6; c++) {
    const cell = ws.getCell(currentRow, c);
    cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = medDarkBorder;
  }

  if (totalCols > 7) {
    ws.mergeCells(currentRow, 7, currentRow, totalCols);
  }
  const totImgCell = ws.getCell(currentRow, 7);
  totImgCell.value = `إجمالي الصور المرفقة: ${totalPhotosCount} صورة`;
  for (let c = 7; c <= totalCols; c++) {
    const cell = ws.getCell(currentRow, c);
    cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF065F46' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = medDarkBorder;
  }
  ws.getRow(currentRow).height = 28;
  currentRow++;

  // Spacer + Signatures row
  ws.getRow(currentRow).height = 12;
  currentRow++;

  const sigSpan1End = Math.max(2, Math.floor(totalCols / 3));
  const sigSpan2End = Math.max(sigSpan1End + 1, Math.floor((totalCols * 2) / 3));

  const sigRanges: [number, number, string][] = [
    [1, sigSpan1End, `المقاول المنفذ\n${contractorName || ''}`],
    [sigSpan1End + 1, sigSpan2End, 'مهندس التنفيذ بالموقع'],
    [sigSpan2End + 1, totalCols, 'اعتماد الاستشاري / إدارة المشروع'],
  ];
  for (const [c1, c2, label] of sigRanges) {
    if (c2 > c1) ws.mergeCells(currentRow, c1, currentRow, c2);
    ws.getCell(currentRow, c1).value = label;
    for (let c = c1; c <= c2; c++) {
      const cell = ws.getCell(currentRow, c);
      cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF1E293B' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = thinBorder;
    }
  }
  ws.getRow(currentRow).height = 38;

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const fileName = `سجل_اليوميات_بالصور_${sanitizeFileName(projectName, 'project')}_${today}.xlsx`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
