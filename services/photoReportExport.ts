import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { printService } from './printService';

export interface SitePhotoInspectionData {
    detectedWork: string;
    workStage: string;
    qualityStatus: 'مطابق' | 'مقبول بملاحظات' | 'يحتاج معالجة';
    qualityAssessment: string;
    safetyStatus: 'آمن' | 'تحذير متوسط' | 'خطر - يلزم تدخل';
    safetyAssessment: string;
    suggestedBoqItemId?: string;
    suggestedBoqCode?: string;
    suggestedBoqDescription?: string;
    suggestedWorkCategory?: string;
    recommendations: string[];
    conciseNote?: string;
}

export interface PhotoNoteExportPayload {
    imageSrcOrBlob: string | Blob | File;
    fileName: string;
    noteText: string;
    inspection?: SitePhotoInspectionData | null;
    projectName?: string;
    contractorName?: string;
    dateStr?: string;
}

function sanitizeFileName(name: string, fallback = 'site_photo_report'): string {
    const base = (name || '').replace(/\.[^/.]+$/, '');
    const cleaned = base
        .replace(/[\\/:*?"<>|\u0000-\u001F]/g, '_')
        .replace(/\s+/g, '_')
        .trim();
    return cleaned || fallback;
}

function escapeHtml(value: string): string {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 1000);
}

async function resolveNormalizedJpeg(
    input: string | Blob | File,
    maxWidth = 1000
): Promise<{ dataUrl: string; base64: string; width: number; height: number }> {
    let sourceUrl = '';
    let shouldRevoke = false;

    if (typeof input === 'string') {
        if (!input.startsWith('data:') && !input.startsWith('blob:')) {
            const resp = await fetch(input);
            const fetchedBlob = await resp.blob();
            sourceUrl = URL.createObjectURL(fetchedBlob);
            shouldRevoke = true;
        } else {
            sourceUrl = input;
        }
    } else {
        sourceUrl = URL.createObjectURL(input);
        shouldRevoke = true;
    }

    return new Promise((resolve, reject) => {
        const img = new Image();
        if (!sourceUrl.startsWith('data:') && !sourceUrl.startsWith('blob:')) {
            img.crossOrigin = 'anonymous';
        }
        img.onload = () => {
            try {
                const natW = img.naturalWidth || img.width || 800;
                const natH = img.naturalHeight || img.height || 600;
                const scale = natW > maxWidth ? maxWidth / natW : 1;
                const w = Math.max(1, Math.round(natW * scale));
                const h = Math.max(1, Math.round(natH * scale));

                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                if (!ctx) throw new Error('Canvas context unavailable');
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, w, h);
                ctx.drawImage(img, 0, 0, w, h);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
                const base64 = dataUrl.split(',')[1] || '';
                if (shouldRevoke) URL.revokeObjectURL(sourceUrl);
                resolve({ dataUrl, base64, width: w, height: h });
            } catch (err) {
                if (shouldRevoke) URL.revokeObjectURL(sourceUrl);
                reject(err);
            }
        };
        img.onerror = (err) => {
            if (shouldRevoke) URL.revokeObjectURL(sourceUrl);
            reject(err);
        };
        img.src = sourceUrl;
    });
}

function getStatusColors(status?: string): { bg: string; border: string; text: string; excelBg: string; excelText: string } {
    if (!status) {
        return { bg: '#F1F5F9', border: '#CBD5E1', text: '#334155', excelBg: 'FFF1F5F9', excelText: 'FF334155' };
    }
    if (status === 'مطابق' || status === 'آمن') {
        return { bg: '#DCFCE7', border: '#86EFAC', text: '#065F46', excelBg: 'FFDCFCE7', excelText: 'FF065F46' };
    }
    if (status === 'يحتاج معالجة' || status.includes('خطر')) {
        return { bg: '#FEE2E2', border: '#FCA5A5', text: '#991B1B', excelBg: 'FFFEE2E2', excelText: 'FF991B1B' };
    }
    return { bg: '#FEF3C7', border: '#FCD34D', text: '#92400E', excelBg: 'FFFEF3C7', excelText: 'FF92400E' };
}

export async function exportPhotoNoteToPdf(payload: PhotoNoteExportPayload): Promise<void> {
    const imgData = await resolveNormalizedJpeg(payload.imageSrcOrBlob, 1200);
    const dateDisplay = payload.dateStr || new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit' });
    const insp = payload.inspection;
    const qColors = getStatusColors(insp?.qualityStatus);
    const sColors = getStatusColors(insp?.safetyStatus);
    const noteHtml = escapeHtml(payload.noteText || insp?.conciseNote || 'لا توجد ملاحظات مسجلة.').replace(/\n/g, '<br/>');

    const boqDisplay = insp?.suggestedBoqDescription
        ? `${insp.suggestedBoqCode ? `[بند ${escapeHtml(insp.suggestedBoqCode)}] ` : ''}${escapeHtml(insp.suggestedBoqDescription)}`
        : 'غير محدد';

    const html = `
        <div style="direction:rtl; font-family:'Cairo','Tajawal',Arial,sans-serif; color:#0f172a; background:#ffffff; padding:6px 4px;">
            <div style="background:linear-gradient(135deg,#0f172a 0%,#1e3a8a 100%); color:#ffffff; padding:16px 20px; border-radius:12px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <div style="font-size:18px; font-weight:800; margin-bottom:3px;">بطاقة الفحص البصري وتوثيق صورة الموقع</div>
                    <div style="font-size:12px; color:#cbd5e1;">تقرير المعاينة الفنية والجودة والسلامة المهنية</div>
                </div>
                <div style="text-align:left; font-size:11px; background:rgba(255,255,255,0.12); padding:7px 12px; border-radius:8px; border:1px solid rgba(255,255,255,0.2);">
                    <div><strong>التاريخ:</strong> ${escapeHtml(dateDisplay)}</div>
                    ${payload.projectName ? `<div><strong>المشروع:</strong> ${escapeHtml(payload.projectName)}</div>` : ''}
                </div>
            </div>

            <table style="width:100%; border-collapse:collapse; margin-bottom:14px; font-size:12px;">
                <tr>
                    <td style="width:18%; background:#e2e8f0; font-weight:700; padding:8px 10px; border:1px solid #cbd5e1;">اسم الملف</td>
                    <td style="width:32%; background:#f8fafc; font-weight:600; padding:8px 10px; border:1px solid #cbd5e1; word-break:break-word;">${escapeHtml(payload.fileName)}</td>
                    <td style="width:18%; background:#e2e8f0; font-weight:700; padding:8px 10px; border:1px solid #cbd5e1;">المشروع</td>
                    <td style="width:32%; background:#f8fafc; font-weight:600; padding:8px 10px; border:1px solid #cbd5e1;">${escapeHtml(payload.projectName || '—')}</td>
                </tr>
                <tr>
                    <td style="background:#e2e8f0; font-weight:700; padding:8px 10px; border:1px solid #cbd5e1;">المقاول</td>
                    <td style="background:#f8fafc; font-weight:600; padding:8px 10px; border:1px solid #cbd5e1;">${escapeHtml(payload.contractorName || '—')}</td>
                    <td style="background:#e2e8f0; font-weight:700; padding:8px 10px; border:1px solid #cbd5e1;">بند المقايسة</td>
                    <td style="background:#f8fafc; font-weight:600; padding:8px 10px; border:1px solid #cbd5e1;">${boqDisplay}</td>
                </tr>
            </table>

            <div style="border:2px solid #cbd5e1; border-radius:12px; background:#f8fafc; padding:10px; margin-bottom:14px; text-align:center;">
                <img src="${imgData.dataUrl}" alt="${escapeHtml(payload.fileName)}" style="max-width:100%; max-height:370px; width:auto; height:auto; border-radius:8px; margin:0 auto; display:block; object-fit:contain;" />
            </div>

            <div style="background:#eff6ff; border:1px solid #bfdbfe; border-right:5px solid #1e3a8a; border-radius:10px; padding:12px 14px; margin-bottom:14px;">
                <div style="font-size:13px; font-weight:800; color:#1e3a8a; margin-bottom:6px;">الملاحظات والتوثيق المعتمد على الصورة</div>
                <div style="font-size:12.5px; line-height:1.75; color:#0f172a; font-weight:600;">${noteHtml}</div>
            </div>

            ${insp ? `
            <table style="width:100%; border-collapse:collapse; margin-bottom:14px; font-size:12px;">
                <thead>
                    <tr style="background:#1e3a8a; color:#ffffff;">
                        <th style="padding:9px 10px; text-align:right; width:24%; border:1px solid #1e3a8a;">محور الفحص</th>
                        <th style="padding:9px 10px; text-align:center; width:18%; border:1px solid #1e3a8a;">التقييم</th>
                        <th style="padding:9px 10px; text-align:right; width:58%; border:1px solid #1e3a8a;">التفاصيل الهندسية والمطابقة</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td style="padding:9px 10px; font-weight:700; background:#f8fafc; border:1px solid #cbd5e1;">العمل المرصود</td>
                        <td style="padding:9px 10px; text-align:center; font-weight:700; background:#e0e7ff; color:#1e1b4b; border:1px solid #cbd5e1;">${escapeHtml(insp.workStage || 'قيد التنفيذ')}</td>
                        <td style="padding:9px 10px; border:1px solid #cbd5e1;">${escapeHtml(insp.detectedWork)}</td>
                    </tr>
                    <tr>
                        <td style="padding:9px 10px; font-weight:700; background:#f8fafc; border:1px solid #cbd5e1;">الجودة الفنية (ECP)</td>
                        <td style="padding:9px 10px; text-align:center; font-weight:800; background:${qColors.bg}; color:${qColors.text}; border:1px solid #cbd5e1;">${escapeHtml(insp.qualityStatus)}</td>
                        <td style="padding:9px 10px; border:1px solid #cbd5e1;">${escapeHtml(insp.qualityAssessment)}</td>
                    </tr>
                    <tr>
                        <td style="padding:9px 10px; font-weight:700; background:#f8fafc; border:1px solid #cbd5e1;">السلامة المهنية (HSE)</td>
                        <td style="padding:9px 10px; text-align:center; font-weight:800; background:${sColors.bg}; color:${sColors.text}; border:1px solid #cbd5e1;">${escapeHtml(insp.safetyStatus)}</td>
                        <td style="padding:9px 10px; border:1px solid #cbd5e1;">${escapeHtml(insp.safetyAssessment)}</td>
                    </tr>
                </tbody>
            </table>
            ${insp.recommendations && insp.recommendations.length > 0 ? `
            <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-right:5px solid #15803d; border-radius:10px; padding:11px 14px; margin-bottom:14px;">
                <div style="font-size:13px; font-weight:800; color:#166534; margin-bottom:5px;">التوصيات والإجراءات التصحيحية</div>
                <ul style="margin:0; padding-right:18px; font-size:12px; color:#14532d; line-height:1.7;">
                    ${insp.recommendations.map(rec => `<li>${escapeHtml(rec)}</li>`).join('')}
                </ul>
            </div>` : ''}
            ` : ''}

            <table style="width:100%; border-collapse:collapse; margin-top:16px; font-size:11.5px;">
                <tr>
                    <td style="width:33.3%; text-align:center; padding:10px; border:1px solid #cbd5e1; background:#f8fafc;">
                        <div style="font-weight:800; color:#1e293b; margin-bottom:24px;">مهندس الموقع</div>
                        <div style="border-top:1px dashed #94a3b8; width:75%; margin:0 auto; padding-top:4px; color:#64748b;">التوقيع</div>
                    </td>
                    <td style="width:33.3%; text-align:center; padding:10px; border:1px solid #cbd5e1; background:#f8fafc;">
                        <div style="font-weight:800; color:#1e293b; margin-bottom:24px;">استشاري ضبط الجودة / HSE</div>
                        <div style="border-top:1px dashed #94a3b8; width:75%; margin:0 auto; padding-top:4px; color:#64748b;">التوقيع</div>
                    </td>
                    <td style="width:33.3%; text-align:center; padding:10px; border:1px solid #cbd5e1; background:#f8fafc;">
                        <div style="font-weight:800; color:#1e293b; margin-bottom:24px;">مدير المشروع</div>
                        <div style="border-top:1px dashed #94a3b8; width:75%; margin:0 auto; padding-top:4px; color:#64748b;">الاعتماد</div>
                    </td>
                </tr>
            </table>
        </div>
    `;

    printService.printHTML(html, `توثيق_بصري_${sanitizeFileName(payload.fileName)}`);
}

export async function exportPhotoNoteToExcel(payload: PhotoNoteExportPayload): Promise<void> {
    const imgData = await resolveNormalizedJpeg(payload.imageSrcOrBlob, 900);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'مهندس مصر';
    wb.created = new Date();

    const ws = wb.addWorksheet('توثيق وفحص الصورة', {
        views: [{ rightToLeft: true }],
        pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
    });

    ws.columns = [
        { width: 22 },
        { width: 24 },
        { width: 22 },
        { width: 22 },
        { width: 22 },
    ];

    const thinBorder: Partial<ExcelJS.Borders> = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };

    // Row 1: Main Navy Banner
    ws.mergeCells('A1:E1');
    const titleCell = ws.getCell('A1');
    titleCell.value = 'بطاقة الفحص البصري وتوثيق صورة الموقع الهندسي';
    titleCell.font = { name: 'Arial', size: 15, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 36;

    // Row 2: Spacer
    ws.getRow(2).height = 8;

    const dateDisplay = payload.dateStr || new Date().toLocaleDateString('ar-EG');
    const insp = payload.inspection;
    const boqDisplay = insp?.suggestedBoqDescription
        ? `${insp.suggestedBoqCode ? `[بند ${insp.suggestedBoqCode}] ` : ''}${insp.suggestedBoqDescription}`
        : '—';

    // Metadata Rows 3-5
    const metaRows: [string, string, string, string][] = [
        ['اسم الملف', payload.fileName, 'التاريخ', dateDisplay],
        ['المشروع', payload.projectName || '—', 'المقاول', payload.contractorName || '—'],
    ];

    let r = 3;
    for (const [l1, v1, l2, v2] of metaRows) {
        ws.getCell(r, 1).value = l1;
        ws.mergeCells(r, 2, r, 3);
        ws.getCell(r, 2).value = v1;
        ws.getCell(r, 4).value = l2;
        ws.getCell(r, 5).value = v2;
        for (let c = 1; c <= 5; c++) {
            const cell = ws.getCell(r, c);
            const isLabel = c === 1 || c === 4;
            cell.font = { name: 'Arial', size: 10.5, bold: isLabel, color: { argb: 'FF0F172A' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isLabel ? 'FFE2E8F0' : 'FFF8FAFC' } };
            cell.alignment = { horizontal: 'right', vertical: 'middle', wrapText: true };
            cell.border = thinBorder;
        }
        ws.getRow(r).height = 24;
        r++;
    }

    // BOQ Row
    ws.getCell(r, 1).value = 'بند المقايسة المقترح';
    ws.mergeCells(r, 2, r, 5);
    ws.getCell(r, 2).value = boqDisplay;
    for (let c = 1; c <= 5; c++) {
        const cell = ws.getCell(r, c);
        const isLabel = c === 1;
        cell.font = { name: 'Arial', size: 10.5, bold: isLabel, color: { argb: 'FF0F172A' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isLabel ? 'FFE2E8F0' : 'FFF8FAFC' } };
        cell.alignment = { horizontal: 'right', vertical: 'middle', wrapText: true };
        cell.border = thinBorder;
    }
    ws.getRow(r).height = 24;
    r += 2; // blank row before image

    // Image Section Header
    ws.mergeCells(r, 1, r, 5);
    const imgHdr = ws.getCell(r, 1);
    imgHdr.value = 'الصورة الميدانية المرصودة';
    imgHdr.font = { name: 'Arial', size: 11.5, bold: true, color: { argb: 'FFFFFFFF' } };
    imgHdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    imgHdr.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(r).height = 26;
    r++;

    // Image Frame (rows r .. r+14)
    const imgStartRowZeroBased = r - 1;
    const frameRows = 15;
    ws.mergeCells(r, 1, r + frameRows - 1, 5);
    for (let rr = r; rr < r + frameRows; rr++) {
        ws.getRow(rr).height = 22;
        for (let cc = 1; cc <= 5; cc++) {
            const cell = ws.getCell(rr, cc);
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
            cell.border = thinBorder;
        }
    }

    const imageId = wb.addImage({
        base64: imgData.base64,
        extension: 'jpeg',
    });

    const maxFrameW = 540;
    const maxFrameH = 310;
    const ratio = Math.min(maxFrameW / imgData.width, maxFrameH / imgData.height);
    const drawW = Math.round(imgData.width * ratio);
    const drawH = Math.round(imgData.height * ratio);

    ws.addImage(imageId, {
        tl: { col: 0.7, row: imgStartRowZeroBased + 0.4 } as any,
        ext: { width: drawW, height: drawH },
    });

    r += frameRows + 1;

    // Notes Section
    ws.mergeCells(r, 1, r, 5);
    const noteHdr = ws.getCell(r, 1);
    noteHdr.value = 'الملاحظات والتوثيق المعتمد على الصورة';
    noteHdr.font = { name: 'Arial', size: 11.5, bold: true, color: { argb: 'FFFFFFFF' } };
    noteHdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    noteHdr.alignment = { horizontal: 'right', vertical: 'middle' };
    ws.getRow(r).height = 26;
    r++;

    const finalNote = payload.noteText || insp?.conciseNote || 'لا توجد ملاحظات مسجلة.';
    ws.mergeCells(r, 1, r, 5);
    const noteCell = ws.getCell(r, 1);
    noteCell.value = finalNote;
    noteCell.font = { name: 'Arial', size: 10.5, bold: true, color: { argb: 'FF0F172A' } };
    noteCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
    noteCell.alignment = { horizontal: 'right', vertical: 'top', wrapText: true };
    for (let c = 1; c <= 5; c++) ws.getCell(r, c).border = thinBorder;
    const noteLines = Math.max(2, finalNote.split('\n').reduce((acc, ln) => acc + Math.max(1, Math.ceil(ln.length / 85)), 0));
    ws.getRow(r).height = Math.max(40, noteLines * 18 + 12);
    r += 2;

    // Structured Visual Inspection Table if present
    if (insp) {
        ws.getCell(r, 1).value = 'محور الفحص';
        ws.getCell(r, 2).value = 'التقييم / الحالة';
        ws.mergeCells(r, 3, r, 5);
        ws.getCell(r, 3).value = 'التفاصيل الهندسية والمطابقة';
        for (let c = 1; c <= 5; c++) {
            const cell = ws.getCell(r, c);
            cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            cell.border = thinBorder;
        }
        ws.getRow(r).height = 26;
        r++;

        const qColors = getStatusColors(insp.qualityStatus);
        const sColors = getStatusColors(insp.safetyStatus);

        const inspRows: { label: string; status: string; detail: string; bg: string; fg: string }[] = [
            { label: 'العمل المرصود', status: insp.workStage || 'قيد التنفيذ', detail: insp.detectedWork, bg: 'FFE0E7FF', fg: 'FF1E1B4B' },
            { label: 'الجودة الفنية (ECP)', status: insp.qualityStatus, detail: insp.qualityAssessment, bg: qColors.excelBg, fg: qColors.excelText },
            { label: 'السلامة المهنية (HSE)', status: insp.safetyStatus, detail: insp.safetyAssessment, bg: sColors.excelBg, fg: sColors.excelText },
            {
                label: 'التوصيات الهندسية',
                status: `${insp.recommendations?.length || 0} توصية`,
                detail: (insp.recommendations || []).map((rec, i) => `${i + 1}. ${rec}`).join('\n') || '—',
                bg: 'FFF0FDF4',
                fg: 'FF166534',
            },
        ];

        for (const item of inspRows) {
            ws.getCell(r, 1).value = item.label;
            ws.getCell(r, 1).font = { name: 'Arial', size: 10.5, bold: true, color: { argb: 'FF0F172A' } };
            ws.getCell(r, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
            ws.getCell(r, 1).alignment = { horizontal: 'right', vertical: 'middle', wrapText: true };

            ws.getCell(r, 2).value = item.status;
            ws.getCell(r, 2).font = { name: 'Arial', size: 10.5, bold: true, color: { argb: item.fg } };
            ws.getCell(r, 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: item.bg } };
            ws.getCell(r, 2).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

            ws.mergeCells(r, 3, r, 5);
            ws.getCell(r, 3).value = item.detail;
            ws.getCell(r, 3).font = { name: 'Arial', size: 10, color: { argb: 'FF0F172A' } };
            ws.getCell(r, 3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
            ws.getCell(r, 3).alignment = { horizontal: 'right', vertical: 'middle', wrapText: true };

            for (let c = 1; c <= 5; c++) ws.getCell(r, c).border = thinBorder;
            const detailLines = Math.max(1, (item.detail || '').split('\n').reduce((a, b) => a + Math.max(1, Math.ceil(b.length / 55)), 0));
            ws.getRow(r).height = Math.max(28, detailLines * 17 + 10);
            r++;
        }
    }

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    triggerDownload(blob, `${sanitizeFileName(payload.fileName)}_توثيق_بصري.xlsx`);
}

function escapeXml(value: string): string {
    return String(value || '')
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function base64ToUint8Array(base64: string): Uint8Array {
    const clean = (base64 || '').replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, '');
    const binary = atob(clean);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

export async function exportPhotoNoteToWord(payload: PhotoNoteExportPayload): Promise<void> {
    const imgData = await resolveNormalizedJpeg(payload.imageSrcOrBlob, 900);
    const maxDocW = 460;
    const maxDocH = 320;
    const scale = Math.min(1, maxDocW / imgData.width, maxDocH / imgData.height);
    const wordW = Math.max(120, Math.round(imgData.width * scale));
    const wordH = Math.max(90, Math.round(imgData.height * scale));
    // 1 pixel at 96 DPI = 9525 EMUs in OpenXML DrawingML
    const cxEmu = wordW * 9525;
    const cyEmu = wordH * 9525;

    const dateDisplay = payload.dateStr || new Date().toLocaleDateString('ar-EG');
    const insp = payload.inspection;
    const qColors = getStatusColors(insp?.qualityStatus);
    const sColors = getStatusColors(insp?.safetyStatus);
    const rawNote = payload.noteText || insp?.conciseNote || 'لا توجد ملاحظات مسجلة.';
    const noteLines = rawNote.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const boqDisplay = insp?.suggestedBoqDescription
        ? `${insp.suggestedBoqCode ? `[بند ${insp.suggestedBoqCode}] ` : ''}${insp.suggestedBoqDescription}`
        : '—';

    const cleanHex = (c: string) => c.replace(/^#/, '').toUpperCase();

    const makeParagraph = (
        text: string,
        opts: {
            bold?: boolean;
            sizePt?: number;
            colorHex?: string;
            align?: 'right' | 'center' | 'left';
            spaceAfter?: number;
            spaceBefore?: number;
        } = {}
    ) => {
        const halfPts = Math.round((opts.sizePt || 11) * 2);
        const color = cleanHex(opts.colorHex || '0F172A');
        const jc = opts.align || 'right';
        const after = opts.spaceAfter ?? 80;
        const before = opts.spaceBefore ?? 40;
        return `
        <w:p>
          <w:pPr>
            <w:bidi/>
            <w:spacing w:before="${before}" w:after="${after}" w:line="300" w:lineRule="auto"/>
            <w:jc w:val="${jc}"/>
            <w:rPr>
              <w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>
              ${opts.bold ? '<w:b/><w:bCs/>' : ''}
              <w:color w:val="${color}"/>
              <w:sz w:val="${halfPts}"/>
              <w:szCs w:val="${halfPts}"/>
            </w:rPr>
          </w:pPr>
          <w:r>
            <w:rPr>
              <w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>
              ${opts.bold ? '<w:b/><w:bCs/>' : ''}
              <w:color w:val="${color}"/>
              <w:sz w:val="${halfPts}"/>
              <w:szCs w:val="${halfPts}"/>
              <w:rtl/>
            </w:rPr>
            <w:t xml:space="preserve">${escapeXml(text)}</w:t>
          </w:r>
        </w:p>`;
    };

    const makeCell = (
        innerXml: string,
        opts: {
            widthPct?: number;
            bgHex?: string;
            gridSpan?: number;
            borderHex?: string;
            vAlign?: 'center' | 'top';
        } = {}
    ) => {
        const wFiftieths = Math.round((opts.widthPct || 25) * 50);
        const bg = cleanHex(opts.bgHex || 'FFFFFF');
        const bdr = cleanHex(opts.borderHex || 'CBD5E1');
        return `
        <w:tc>
          <w:tcPr>
            <w:tcW w:w="${wFiftieths}" w:type="pct"/>
            ${opts.gridSpan && opts.gridSpan > 1 ? `<w:gridSpan w:val="${opts.gridSpan}"/>` : ''}
            <w:tcBorders>
              <w:top w:val="single" w:sz="6" w:space="0" w:color="${bdr}"/>
              <w:left w:val="single" w:sz="6" w:space="0" w:color="${bdr}"/>
              <w:bottom w:val="single" w:sz="6" w:space="0" w:color="${bdr}"/>
              <w:right w:val="single" w:sz="6" w:space="0" w:color="${bdr}"/>
            </w:tcBorders>
            <w:shd w:val="clear" w:color="auto" w:fill="${bg}"/>
            <w:tcMar>
              <w:top w:w="110" w:type="dxa"/>
              <w:bottom w:w="110" w:type="dxa"/>
              <w:left w:w="140" w:type="dxa"/>
              <w:right w:w="140" w:type="dxa"/>
            </w:tcMar>
            <w:vAlign w:val="${opts.vAlign || 'center'}"/>
          </w:tcPr>
          ${innerXml}
        </w:tc>`;
    };

    const drawingXml = `
    <w:p>
      <w:pPr>
        <w:spacing w:before="80" w:after="80"/>
        <w:jc w:val="center"/>
      </w:pPr>
      <w:r>
        <w:drawing>
          <wp:inline distT="0" distB="0" distL="0" distR="0">
            <wp:extent cx="${cxEmu}" cy="${cyEmu}"/>
            <wp:effectExtent l="0" t="0" r="0" b="0"/>
            <wp:docPr id="1" name="SitePhoto" descr="${escapeXml(payload.fileName)}"/>
            <wp:cNvGraphicFramePr>
              <a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/>
            </wp:cNvGraphicFramePr>
            <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
              <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
                  <pic:nvPicPr>
                    <pic:cNvPr id="1" name="${escapeXml(payload.fileName)}"/>
                    <pic:cNvPicPr/>
                  </pic:nvPicPr>
                  <pic:blipFill>
                    <a:blip r:embed="rIdImg1"/>
                    <a:stretch>
                      <a:fillRect/>
                    </a:stretch>
                  </pic:blipFill>
                  <pic:spPr>
                    <a:xfrm>
                      <a:off x="0" y="0"/>
                      <a:ext cx="${cxEmu}" cy="${cyEmu}"/>
                    </a:xfrm>
                    <a:prstGeom prst="rect">
                      <a:avLst/>
                    </a:prstGeom>
                  </pic:spPr>
                </pic:pic>
              </a:graphicData>
            </a:graphic>
          </wp:inline>
        </w:drawing>
      </w:r>
    </w:p>`;

    const noteParagraphsXml = [
        makeParagraph('الملاحظات والتوثيق المعتمد على الصورة', { bold: true, sizePt: 12, colorHex: '1E3A8A', align: 'right', spaceAfter: 60 }),
        ...(noteLines.length > 0
            ? noteLines.map(ln => makeParagraph(ln, { bold: false, sizePt: 11, colorHex: '0F172A', align: 'right', spaceAfter: 45 }))
            : [makeParagraph('لا توجد ملاحظات مسجلة.', { sizePt: 11, colorHex: '0F172A', align: 'right' })]),
    ].join('');

    const inspectionTableXml = insp ? `
    <w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr></w:p>
    <w:tbl>
      <w:tblPr>
        <w:bidiVisual/>
        <w:tblW w:w="5000" w:type="pct"/>
      </w:tblPr>
      <w:tr>
        ${makeCell(makeParagraph('محور الفحص', { bold: true, sizePt: 11, colorHex: 'FFFFFF', align: 'right' }), { widthPct: 24, bgHex: '1E3A8A', borderHex: '1E3A8A' })}
        ${makeCell(makeParagraph('التقييم', { bold: true, sizePt: 11, colorHex: 'FFFFFF', align: 'center' }), { widthPct: 18, bgHex: '1E3A8A', borderHex: '1E3A8A' })}
        ${makeCell(makeParagraph('التفاصيل الهندسية والمطابقة', { bold: true, sizePt: 11, colorHex: 'FFFFFF', align: 'right' }), { widthPct: 58, bgHex: '1E3A8A', borderHex: '1E3A8A' })}
      </w:tr>
      <w:tr>
        ${makeCell(makeParagraph('العمل المرصود', { bold: true, sizePt: 10.5, colorHex: '0F172A', align: 'right' }), { widthPct: 24, bgHex: 'F8FAFC' })}
        ${makeCell(makeParagraph(insp.workStage || 'قيد التنفيذ', { bold: true, sizePt: 10.5, colorHex: '1E1B4B', align: 'center' }), { widthPct: 18, bgHex: 'E0E7FF' })}
        ${makeCell(makeParagraph(insp.detectedWork || '—', { sizePt: 10.5, colorHex: '0F172A', align: 'right' }), { widthPct: 58, bgHex: 'FFFFFF' })}
      </w:tr>
      <w:tr>
        ${makeCell(makeParagraph('الجودة الفنية (ECP)', { bold: true, sizePt: 10.5, colorHex: '0F172A', align: 'right' }), { widthPct: 24, bgHex: 'F8FAFC' })}
        ${makeCell(makeParagraph(insp.qualityStatus, { bold: true, sizePt: 10.5, colorHex: qColors.text, align: 'center' }), { widthPct: 18, bgHex: qColors.bg })}
        ${makeCell(makeParagraph(insp.qualityAssessment || '—', { sizePt: 10.5, colorHex: '0F172A', align: 'right' }), { widthPct: 58, bgHex: 'FFFFFF' })}
      </w:tr>
      <w:tr>
        ${makeCell(makeParagraph('السلامة المهنية (HSE)', { bold: true, sizePt: 10.5, colorHex: '0F172A', align: 'right' }), { widthPct: 24, bgHex: 'F8FAFC' })}
        ${makeCell(makeParagraph(insp.safetyStatus, { bold: true, sizePt: 10.5, colorHex: sColors.text, align: 'center' }), { widthPct: 18, bgHex: sColors.bg })}
        ${makeCell(makeParagraph(insp.safetyAssessment || '—', { sizePt: 10.5, colorHex: '0F172A', align: 'right' }), { widthPct: 58, bgHex: 'FFFFFF' })}
      </w:tr>
    </w:tbl>
    ${insp.recommendations && insp.recommendations.length > 0 ? `
    <w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr></w:p>
    <w:tbl>
      <w:tblPr>
        <w:bidiVisual/>
        <w:tblW w:w="5000" w:type="pct"/>
      </w:tblPr>
      <w:tr>
        ${makeCell(
            [
                makeParagraph('التوصيات والإجراءات التصحيحية', { bold: true, sizePt: 11.5, colorHex: '166534', align: 'right', spaceAfter: 50 }),
                ...insp.recommendations.map((rec, i) => makeParagraph(`${i + 1}. ${rec}`, { sizePt: 10.5, colorHex: '14532D', align: 'right', spaceAfter: 40 })),
            ].join(''),
            { widthPct: 100, bgHex: 'F0FDF4', borderHex: '86EFAC', vAlign: 'top' }
        )}
      </w:tr>
    </w:tbl>` : ''}
    ` : '';

    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
  <w:body>
    <!-- Header Banner Table -->
    <w:tbl>
      <w:tblPr>
        <w:bidiVisual/>
        <w:tblW w:w="5000" w:type="pct"/>
      </w:tblPr>
      <w:tr>
        ${makeCell(
            [
                makeParagraph('بطاقة الفحص البصري وتوثيق صورة الموقع', { bold: true, sizePt: 15, colorHex: 'FFFFFF', align: 'right', spaceAfter: 40 }),
                makeParagraph('تقرير المعاينة الفنية والجودة والسلامة المهنية', { sizePt: 10, colorHex: 'CBD5E1', align: 'right', spaceAfter: 20 }),
            ].join(''),
            { widthPct: 68, bgHex: '0F172A', borderHex: '0F172A' }
        )}
        ${makeCell(
            [
                makeParagraph(`التاريخ: ${dateDisplay}`, { bold: true, sizePt: 10, colorHex: 'FFFFFF', align: 'left', spaceAfter: 30 }),
                ...(payload.projectName ? [makeParagraph(`المشروع: ${payload.projectName}`, { bold: true, sizePt: 10, colorHex: 'E2E8F0', align: 'left', spaceAfter: 20 })] : []),
            ].join(''),
            { widthPct: 32, bgHex: '1E3A8A', borderHex: '1E3A8A' }
        )}
      </w:tr>
    </w:tbl>

    <w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr></w:p>

    <!-- Metadata Table -->
    <w:tbl>
      <w:tblPr>
        <w:bidiVisual/>
        <w:tblW w:w="5000" w:type="pct"/>
      </w:tblPr>
      <w:tr>
        ${makeCell(makeParagraph('اسم الملف', { bold: true, sizePt: 10.5, colorHex: '0F172A', align: 'right' }), { widthPct: 18, bgHex: 'E2E8F0' })}
        ${makeCell(makeParagraph(payload.fileName, { sizePt: 10, colorHex: '0F172A', align: 'right' }), { widthPct: 32, bgHex: 'F8FAFC' })}
        ${makeCell(makeParagraph('المقاول', { bold: true, sizePt: 10.5, colorHex: '0F172A', align: 'right' }), { widthPct: 18, bgHex: 'E2E8F0' })}
        ${makeCell(makeParagraph(payload.contractorName || '—', { sizePt: 10, colorHex: '0F172A', align: 'right' }), { widthPct: 32, bgHex: 'F8FAFC' })}
      </w:tr>
      <w:tr>
        ${makeCell(makeParagraph('بند المقايسة', { bold: true, sizePt: 10.5, colorHex: '0F172A', align: 'right' }), { widthPct: 18, bgHex: 'E2E8F0' })}
        ${makeCell(makeParagraph(boqDisplay, { sizePt: 10, colorHex: '0F172A', align: 'right' }), { widthPct: 82, bgHex: 'F8FAFC', gridSpan: 3 })}
      </w:tr>
    </w:tbl>

    <w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr></w:p>

    <!-- Embedded Photo Frame Table -->
    <w:tbl>
      <w:tblPr>
        <w:bidiVisual/>
        <w:tblW w:w="5000" w:type="pct"/>
      </w:tblPr>
      <w:tr>
        ${makeCell(drawingXml, { widthPct: 100, bgHex: 'F8FAFC', borderHex: 'CBD5E1' })}
      </w:tr>
    </w:tbl>

    <w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr></w:p>

    <!-- Saved Photo Note Table -->
    <w:tbl>
      <w:tblPr>
        <w:bidiVisual/>
        <w:tblW w:w="5000" w:type="pct"/>
      </w:tblPr>
      <w:tr>
        ${makeCell(noteParagraphsXml, { widthPct: 100, bgHex: 'EFF6FF', borderHex: '93C5FD', vAlign: 'top' })}
      </w:tr>
    </w:tbl>

    ${inspectionTableXml}

    <w:p><w:pPr><w:spacing w:before="80" w:after="80"/></w:pPr></w:p>

    <!-- Signatures Table -->
    <w:tbl>
      <w:tblPr>
        <w:bidiVisual/>
        <w:tblW w:w="5000" w:type="pct"/>
      </w:tblPr>
      <w:tr>
        ${makeCell(
            [
                makeParagraph('مهندس الموقع', { bold: true, sizePt: 10.5, colorHex: '1E293B', align: 'center', spaceAfter: 240 }),
                makeParagraph('التوقيع: .......................', { sizePt: 9.5, colorHex: '64748B', align: 'center', spaceAfter: 20 }),
            ].join(''),
            { widthPct: 33, bgHex: 'F8FAFC' }
        )}
        ${makeCell(
            [
                makeParagraph('استشاري ضبط الجودة / HSE', { bold: true, sizePt: 10.5, colorHex: '1E293B', align: 'center', spaceAfter: 240 }),
                makeParagraph('التوقيع: .......................', { sizePt: 9.5, colorHex: '64748B', align: 'center', spaceAfter: 20 }),
            ].join(''),
            { widthPct: 34, bgHex: 'F8FAFC' }
        )}
        ${makeCell(
            [
                makeParagraph('مدير المشروع', { bold: true, sizePt: 10.5, colorHex: '1E293B', align: 'center', spaceAfter: 240 }),
                makeParagraph('الاعتماد: .......................', { sizePt: 9.5, colorHex: '64748B', align: 'center', spaceAfter: 20 }),
            ].join(''),
            { widthPct: 33, bgHex: 'F8FAFC' }
        )}
      </w:tr>
    </w:tbl>

    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="450" w:footer="450" w:gutter="0"/>
      <w:bidi/>
    </w:sectPr>
  </w:body>
</w:document>`;

    const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

    const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

    const docRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdImg1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.jpeg"/>
</Relationships>`;

    const zip = new JSZip();
    zip.file('[Content_Types].xml', contentTypesXml);
    zip.file('_rels/.rels', rootRelsXml);
    zip.file('word/document.xml', documentXml);
    zip.file('word/_rels/document.xml.rels', docRelsXml);
    zip.file('word/media/image1.jpeg', base64ToUint8Array(imgData.base64));

    const docxBlob = await zip.generateAsync({
        type: 'blob',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        compression: 'DEFLATE',
    });

    triggerDownload(docxBlob, `${sanitizeFileName(payload.fileName)}_توثيق_بصري.docx`);
}

