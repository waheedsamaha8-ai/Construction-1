
/**
 * @fileoverview CENTRALIZED REPORT GENERATOR - UNIFIED CONSULTANT IDENTITY
 * Controls the design, layout, and formatting for ALL reports in the application.
 */

import { Project, ProjectLog } from "../types";

// --- 1. VISUAL IDENTITY CONFIGURATION ---
const THEME = {
    colors: {
        headerBg: '#f8fafc',      // Very Light Slate (Clean)
        headerText: '#1e3a8a',    // Dark Blue
        footerBg: '#ffffff',      // White
        footerText: '#334155',    // Slate 700
        bodyBg: '#ffffff',
        primary: '#1e3a8a',       // Dark Blue for Titles
        accent: '#3b82f6',        // Blue for accents
        border: '#000000',        // Black for high contrast
    }
};

// --- 2. CSS STYLES (Unified for Editor & Print) ---
export const REPORT_CSS = `
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@600;700;800;900&display=swap');
    
    /* GLOBAL RESET & FONTS */
    * { 
        -webkit-print-color-adjust: exact !important; 
        print-color-adjust: exact !important; 
        box-sizing: border-box;
    }

    .report-container {
        display: flex;
        flex-direction: column;
        min-height: 100%; 
        width: 100% !important;
        max-width: 100% !important;
        background: white;
        position: relative;
        margin: 0 !important;
        padding: 0 !important;
        border: none !important;
        font-family: 'Cairo', sans-serif;
        direction: rtl;
        font-size: 13.5px;
        font-weight: 700;
        line-height: 1.65;
        color: #0f172a;
    }

    /* 1. REPORT HEADER (Used in LetterEditor / خطاب) */
    .report-header {
        background-color: ${THEME.colors.primary} !important;
        color: #ffffff !important;
        padding: 12px 14px !important;
        border-radius: 10px 10px 0 0;
        display: flex !important;
        flex-direction: row !important;
        justify-content: space-between !important;
        align-items: center !important;
        gap: 12px;
        width: 100% !important;
        border-bottom: 3px solid #3b82f6;
        margin-bottom: 14px;
        direction: rtl !important;
    }

    .report-header-title {
        text-align: right !important;
        flex: 1 1 auto;
        min-width: 0;
        color: #ffffff !important;
    }

    .report-header-title h1, .report-header h1, .report-header h2 {
        margin: 0 !important;
        padding: 0 !important;
        font-size: 15px;
        font-weight: 800;
        color: #ffffff !important;
        border: none !important;
        line-height: 1.4 !important;
        text-shadow: none !important;
        text-align: right !important;
    }

    .report-header-subtitle, .report-header p {
        margin: 3px 0 0 0 !important;
        font-size: 11.5px;
        font-weight: 700;
        color: #e2e8f0 !important;
        line-height: 1.4 !important;
        text-align: right !important;
    }

    .report-header-meta {
        text-align: left !important;
        direction: rtl;
        font-size: 11px;
        color: #f1f5f9 !important;
        font-weight: 700;
        line-height: 1.45;
        min-width: 110px;
        flex-shrink: 0;
        margin-right: auto;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        padding: 6px 10px;
        border-radius: 8px;
    }

    .report-header-meta * {
        color: #f1f5f9 !important;
    }

    /* 2. REPORT BODY - MINIMUM SIDE MARGINS FOR FULL SCREEN */
    .report-body {
        width: 100% !important;
        max-width: 100% !important;
        flex: 1 1 auto !important;
        padding: 0 4px;
        background: white;
        min-height: 400px;
        direction: rtl;
        text-align: right;
        color: #0f172a;
        border: none !important;
        box-sizing: border-box !important;
    }

    .report-body p {
        margin-top: 0;
        margin-bottom: 8px;
        line-height: 1.65;
        text-align: right;
        word-spacing: normal;
        letter-spacing: normal;
    }

    /* 3. REPORT FOOTER */
    .report-footer {
        background-color: ${THEME.colors.footerBg} !important;
        color: ${THEME.colors.footerText} !important;
        padding: 10px 12px;
        text-align: center;
        width: 100%;
        border-top: 1.5px solid #e2e8f0;
        margin-top: auto !important;
        margin-bottom: 0 !important;
        font-size: 12px;
        font-weight: 700;
        direction: rtl;
    }

    /* --- UNIFIED TYPOGRAPHY & HIERARCHY --- */

    .report-body h1 {
        font-size: 15px !important;
        font-weight: 800 !important;
        color: #1e3a8a !important;
        text-align: center !important;
        background: transparent !important;
        border: none !important;
        border-bottom: 2px solid #1e3a8a !important;
        border-radius: 0 !important;
        padding: 0 0 8px 0 !important;
        margin: 6px 0 12px 0 !important;
        width: 100% !important;
        display: block !important;
        page-break-after: avoid;
    }

    .report-body h2 {
        font-size: 14px !important;
        font-weight: 800 !important;
        color: #1e3a8a !important;
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
        page-break-after: avoid;
    }

    .report-body h3, .report-body h4 {
        font-size: 13px !important;
        font-weight: 800 !important;
        color: #1e3a8a !important;
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
        page-break-after: avoid;
    }

    .report-body p, .report-body li, .report-body div {
        text-align: right;
        margin-bottom: 6px;
        font-size: 13px;
        font-weight: 600;
        line-height: 1.65;
    }

    /* COLORED CALLOUT BOXES */
    .info-box { 
        background-color: #eff6ff !important; 
        border: 1px solid #bfdbfe !important;
        border-right: 4px solid #2563eb !important; 
        color: #1e3a8a !important; 
        padding: 10px 12px !important; margin: 10px 0 !important; border-radius: 8px !important; 
        font-weight: 700 !important;
    }
    
    .success-box { 
        background-color: #f0fdf4 !important; 
        border: 1px solid #bbf7d0 !important;
        border-right: 4px solid #16a34a !important;
        color: #14532d !important; 
        padding: 10px 12px !important; margin: 10px 0 !important; border-radius: 8px !important; 
        font-weight: 700 !important;
    }
    
    .warning-box { 
        background-color: #fef2f2 !important; 
        border: 1px solid #fecaca !important;
        border-right: 4px solid #dc2626 !important;
        color: #7f1d1d !important; 
        padding: 10px 12px !important; margin: 10px 0 !important; border-radius: 8px !important; 
        font-weight: 700 !important;
    }
    
    .cost-box, .highlight-box { 
        background-color: #fffbeb !important; 
        border: 1px solid #fde68a !important;
        border-right: 4px solid #d97706 !important;
        color: #78350f !important; 
        padding: 10px 12px !important; margin: 10px 0 !important; border-radius: 8px !important; 
        font-weight: 700 !important;
    }

    /* --- TABLES DISPLAYED AT PRINT-READY WIDTH WITH SMOOTH HORIZONTAL SCROLL ON SCREEN --- */
    .table-responsive-wrapper {
        width: 100% !important;
        max-width: 100% !important;
        overflow-x: auto !important;
        overflow-y: hidden !important;
        -webkit-overflow-scrolling: touch !important;
        touch-action: pan-x pan-y !important;
        margin: 12px 0 !important;
        display: block !important;
        box-sizing: border-box !important;
        border: none !important;
        border-radius: 0 !important;
        background: transparent !important;
        padding: 0 0 6px 0 !important;
        box-shadow: none !important;
        scrollbar-width: thin !important;
        scrollbar-color: #2563eb #e2e8f0 !important;
    }

    .table-responsive-wrapper::-webkit-scrollbar {
        height: 8px !important;
        display: block !important;
        background-color: #e2e8f0 !important;
        border-radius: 6px !important;
    }

    .table-responsive-wrapper::-webkit-scrollbar-track {
        background: #e2e8f0 !important;
        border-radius: 6px !important;
    }

    .table-responsive-wrapper::-webkit-scrollbar-thumb {
        background: #2563eb !important;
        border-radius: 6px !important;
    }

    table, .editable-table { 
        width: 100% !important; 
        min-width: 580px !important; 
        border-collapse: collapse !important; 
        margin: 0 !important; 
        direction: rtl !important; 
        border: 1px solid #cbd5e1 !important;
        table-layout: auto !important; 
        display: table !important;
        background: #ffffff !important;
    }
    
    th { 
        background-color: #f1f5f9 !important; 
        color: #1e3a8a !important; 
        padding: 8px 10px !important; 
        border: 1px solid #cbd5e1 !important; 
        font-weight: 800 !important; 
        font-size: 12.5px !important; 
        text-align: center !important; 
        min-width: 90px !important;
        white-space: normal !important;
        word-break: normal !important;
        overflow-wrap: normal !important;
        word-wrap: normal !important;
        hyphens: none !important;
        line-height: 1.55 !important;
    }

    th * {
        color: #1e3a8a !important;
        white-space: normal !important;
        word-break: normal !important;
        overflow-wrap: normal !important;
    }
    
    td { 
        padding: 8px 10px !important; 
        border: 1px solid #cbd5e1 !important; 
        vertical-align: middle !important; 
        font-size: 12.5px !important; 
        font-weight: 600 !important; 
        color: #0f172a !important; 
        text-align: right !important;
        min-width: 85px !important;
        white-space: normal !important;
        word-break: normal !important;
        overflow-wrap: normal !important;
        word-wrap: normal !important;
        hyphens: none !important;
        line-height: 1.55 !important;
    }

    tr:nth-child(even) td { 
        background-color: #f8fafc !important; 
    }

    table.boq-summary-mini-table {
        min-width: 420px !important;
        margin: 0 !important;
    }
    table.boq-summary-mini-table th {
        padding: 5px 6px !important;
        font-size: 11px !important;
        font-weight: 800 !important;
        text-align: center !important;
        min-width: 50px !important;
        line-height: 1.35 !important;
    }
    table.boq-summary-mini-table td {
        padding: 5px 6px !important;
        font-size: 11.5px !important;
        font-weight: 700 !important;
        text-align: center !important;
        min-width: 50px !important;
        line-height: 1.35 !important;
        background-color: #ffffff !important;
    }

    /* PHOTO GRID */
    .photo-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 10px;
        margin-top: 14px;
        page-break-inside: auto;
    }
    .photo-item {
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        padding: 4px;
        background: #fff;
        page-break-inside: avoid;
        break-inside: avoid;
        width: 100%;
        box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .photo-item img {
        width: 100%;
        height: 200px;
        object-fit: cover;
        border-radius: 4px;
        display: block;
    }

    /* MOBILE RESPONSIVE DISCIPLINE */
    @media screen and (max-width: 768px) {
        .report-header {
            padding: 10px 12px !important;
            flex-direction: row !important;
            justify-content: space-between !important;
            align-items: center !important;
            gap: 10px;
        }
        th, td {
            padding: 7px 8px !important; 
            font-size: 12.5px !important;
        }
        .photo-grid {
            grid-template-columns: 1fr;
        }
    }

    @media print {
        .table-responsive-wrapper {
            overflow-x: visible !important;
        }
        table, .editable-table {
            width: 100% !important;
            min-width: 100% !important;
        }
    }
`;

export const AI_REPORT_INSTRUCTION = `
    **STRICT REPORT GENERATION STANDARDS:**
    1.  **Output Format:** Return ONLY clean, valid HTML. Do NOT use Markdown code blocks (\`\`\`html).
    2.  **Language:** Arabic (Professional Technical Consultant).
    3.  **Layout:** Full Width (100%). Do NOT generate any blue header box or \`.report-header\` div.
    4.  **Spacing:** Do NOT use \`<br>\` for spacing. Rely on CSS classes (margin/padding).
    5.  **Hierarchy:**
        - **H1:** Main Report Title at the very top (Use once, plain \`<h1>Title</h1>\` without any surrounding div or background color).
        - **H2:** Major Section Titles (\`<h2>Section</h2>\` outside any box).
        - **H3:** Subsections (\`<h3>Subsection</h3>\` outside any box).
    6.  **Tables:** Use \`<table>\` directly in the report body (NEVER place a \`<table>\` inside an \`info-box\` or any text box). Do not set fixed pixel widths or \`nowrap\`. Both column headers (\`<th>\`) and cells (\`<td>\`) must allow natural text wrapping.
    7.  **Boxes:** Use specific classes for text callouts only:
        - \`<div class="info-box editable-box">\` for Executive Summary / General Info.
        - \`<div class="success-box editable-box">\` for Recommendations.
        - \`<div class="warning-box editable-box">\` for Risks/Warnings.
        - \`<div class="cost-box editable-box">\` for Financials/Quality.
    8.  **Clean HTML:** No \`<html>\`, \`<head>\`, or \`<body>\` tags. Return the inner body content only.
`;

export interface ReportMetadata {
    ref?: string;
    date?: string;
    subtitle?: string;
    footerText?: string;
    margins?: { x: string; y: string; }; 
    labels?: { date: string, ref: string }; 
    showHeader?: boolean;
    showTitle?: boolean;
    showSubtitle?: boolean;
    showDate?: boolean;
    showRef?: boolean;
    showFooter?: boolean;
    headerColor?: string;
    footerColor?: string;
    fontSizes?: {
        title?: string;
        subtitle?: string;
        meta?: string;
        footer?: string;
    };
}

const isLightHexColor = (hex?: string): boolean => {
    if (!hex || !hex.startsWith('#')) return false;
    const clean = hex.replace('#', '');
    const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
    if (full.length !== 6) return false;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 165;
};

export const wrapTablesInHtml = (html: string): string => {
    if (!html) return '';
    try {
        if (typeof window !== 'undefined' && window.DOMParser) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const tables = doc.querySelectorAll('table');
            tables.forEach((table) => {
                const parent = table.parentElement;
                if (!parent || !parent.classList.contains('table-responsive-wrapper')) {
                    const wrapper = doc.createElement('div');
                    wrapper.className = 'table-responsive-wrapper';
                    if (parent) {
                        parent.insertBefore(wrapper, table);
                    } else {
                        doc.body.appendChild(wrapper);
                    }
                    wrapper.appendChild(table);
                }
            });
            return doc.body.innerHTML;
        }
    } catch (e) {}
    return html.replace(/(<table[\s\S]*?<\/table>)/gi, (match) => {
        return `<div class="table-responsive-wrapper">${match}</div>`;
    });
};

export const ReportGenerator = {
    getHeaderHTML: (
        title: string,
        ref: string,
        date: string,
        subtitle: string,
        labels: { date: string, ref: string },
        flags: { showHeader?: boolean, showTitle?: boolean, showSubtitle?: boolean, showDate?: boolean, showRef?: boolean, headerColor?: string, fontSizes?: { title?: string, subtitle?: string, meta?: string } }
    ) => {
        // Default showHeader to false so AI reports do not render the blue header box; only LetterEditor explicitly passes showHeader: true
        const { showHeader = false, showTitle = true, showSubtitle = true, showDate = true, showRef = true, headerColor, fontSizes } = flags;
        
        if (!showHeader) return '';
        if (!showTitle && !showSubtitle && !showDate && !showRef) return '';

        const bg = headerColor || THEME.colors.primary;
        const isLight = isLightHexColor(bg);
        const textColor = isLight ? '#0f172a' : '#ffffff';
        const subColor = isLight ? '#334155' : '#e2e8f0';
        const titleFs = fontSizes?.title || '15px';
        const subtitleFs = fontSizes?.subtitle || '11.5px';
        const metaFs = fontSizes?.meta || '11px';

        let titleBlock = '';
        if (showTitle || showSubtitle) {
            titleBlock = `
                <div class="report-header-title" style="color: ${textColor} !important;">
                    ${showTitle ? `<h1 style="color: ${textColor} !important; font-size: ${titleFs};">${title}</h1>` : ''}
                    ${showSubtitle ? `<p class="report-header-subtitle" style="color: ${subColor} !important; font-size: ${subtitleFs};">${subtitle}</p>` : ''}
                </div>
            `;
        }

        let metaBlock = '';
        if (showDate || showRef) {
            metaBlock = `
                <div class="report-header-meta" style="color: ${textColor} !important; font-size: ${metaFs};">
                    ${showDate ? `<div style="color: ${textColor} !important; font-size: ${metaFs};"><strong style="color: ${textColor} !important;">${labels.date}</strong> <span style="color: ${textColor} !important;">${date}</span></div>` : ''}
                    ${showRef ? `<div style="color: ${textColor} !important; font-size: ${metaFs};"><strong style="color: ${textColor} !important;">${labels.ref}</strong> <span style="color: ${textColor} !important;">${ref}</span></div>` : ''}
                </div>
            `;
        }

        return `
            <div class="report-header" style="background-color: ${bg} !important; color: ${textColor} !important;">
                ${titleBlock}
                ${metaBlock}
            </div>
        `;
    },
    getFooterHTML: (text: string, visible: boolean = true, footerColor?: string, footerFontSize?: string) => {
        if (!visible) return '';
        const bg = footerColor || THEME.colors.footerBg;
        const isLight = isLightHexColor(bg);
        const textColor = isLight ? '#334155' : '#ffffff';
        const fs = footerFontSize || '12px';
        return `
            <div class="report-footer" style="background-color: ${bg} !important; color: ${textColor} !important; font-size: ${fs};">
                ${text}
            </div>
        `;
    },
    buildReport: (title: string, bodyHTML: string, metadata: ReportMetadata = {}) => {
        const dateStr = metadata.date || new Date().toLocaleDateString('en-CA'); 
        const refStr = metadata.ref || `REF-${Date.now().toString().slice(-6)}`;
        const subtitle = metadata.subtitle || "تقرير هندسي استشاري";
        const footerText = metadata.footerText || "تم إعداد التقرير بواسطة الذكاء الاصطناعي تحت إشراف المهندس وحيد سماحة | مهندس_مصر";
        
        const dateLabel = metadata.labels?.date || "التاريخ:";
        const refLabel = metadata.labels?.ref || "المرجع:";

        const paddingStyle = metadata.margins 
            ? `padding: ${metadata.margins.y} ${metadata.margins.x} !important;` 
            : 'padding: 0 4px !important;';

        const processedBody = wrapTablesInHtml(bodyHTML || '');

        return `
            <!DOCTYPE html>
            <html dir="rtl" lang="ar">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    ${REPORT_CSS}
                    .report-body {
                        ${paddingStyle}
                    }
                </style>
            </head>
            <body>
                <div class="report-container">
                    ${ReportGenerator.getHeaderHTML(
                        title, refStr, dateStr, subtitle, 
                        { date: dateLabel, ref: refLabel },
                        { 
                            showHeader: metadata.showHeader,
                            showTitle: metadata.showTitle, 
                            showSubtitle: metadata.showSubtitle, 
                            showDate: metadata.showDate, 
                            showRef: metadata.showRef,
                            headerColor: metadata.headerColor,
                            fontSizes: metadata.fontSizes
                        }
                    )}
                    <div class="report-body">${processedBody}</div>
                    ${ReportGenerator.getFooterHTML(footerText, metadata.showFooter, metadata.footerColor, metadata.fontSizes?.footer)}
                </div>
            </body>
            </html>
        `;
    },
    
    buildPhotoReport: (
        title: string, 
        aiSummaryHtml: string, 
        logs: ProjectLog[], 
        project: Project,
        reportPeriod: { start: string, end: string },
        metadata: ReportMetadata = {}
    ) => {
        const logRows = logs.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime()).map(log => `
            <tr>
                <td style="width: 120px; text-align: center; font-weight: bold;">${log.date}</td>
                <td>${log.content}</td>
            </tr>
        `).join('');

        const logTableHtml = logRows ? `
            <h2>جدول الأعمال اليومية (Daily Logs)</h2>
            <table>
                <thead>
                    <tr><th>التاريخ</th><th>وصف الأعمال والملاحظات</th></tr>
                </thead>
                <tbody>${logRows}</tbody>
            </table>
        ` : '';

        const images: string[] = [];
        logs.forEach(log => {
            if (log.images && log.images.length > 0) {
                log.images.forEach(img => images.push(img));
            }
        });

        const photoGridHtml = images.length > 0 ? `
            <h2>التوثيق المصور (Site Photos)</h2>
            <div class="photo-grid">
                ${images.map(img => `
                    <div class="photo-item">
                        <img src="${img}" alt="Site Photo" />
                    </div>
                `).join('')}
            </div>
        ` : '';

        const signaturesHtml = `
            <table class="signatures-table" style="margin-top: 40px; border: none;">
                <tr style="background: white !important;">
                    <td style="border: none; padding-top: 30px;"><strong>مهندس الموقع</strong><br><br>.........................</td>
                    <td style="border: none; padding-top: 30px;"><strong>مدير المشروع</strong><br><br>.........................</td>
                    <td style="border: none; padding-top: 30px;"><strong>الاستشاري المشرف</strong><br><br>.........................</td>
                </tr>
            </table>
        `;

        let mixedContent = aiSummaryHtml;
        let tableInserted = false;
        // Try to insert table after the first info/summary box
        const infoBoxRegex = /(<div class="info-box[^>]*>[\s\S]*?<\/div>)/i;
        
        if (logTableHtml && infoBoxRegex.test(mixedContent)) {
            mixedContent = mixedContent.replace(infoBoxRegex, `$1\n<br>\n${logTableHtml}\n<br>`);
            tableInserted = true;
        }

        const fullBody = `
            ${mixedContent}
            ${!tableInserted ? `<br>${logTableHtml}` : ''}
            <br>
            ${photoGridHtml}
            <br>
            ${signaturesHtml}
        `;

        const uniqueTitle = `${title} - مشروع ${project.name || '---'} - مقاول ${project.contractor || '---'} - ${new Date().toLocaleDateString('ar-EG')}`;

        const subtitle = `فترة التقرير: من ${reportPeriod.start} إلى ${reportPeriod.end}`;
        const enhancedMetadata = {
            ...metadata,
            subtitle: subtitle,
            ref: `RPT-${new Date().getFullYear()}-${Math.floor(Math.random()*1000)}`
        };

        return ReportGenerator.buildReport(uniqueTitle, fullBody, enhancedMetadata);
    },

    getCSS: () => REPORT_CSS
};
