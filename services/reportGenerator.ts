
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

    html, body {
        margin: 0; padding: 0;
        background: #fff; 
        font-family: 'Cairo', sans-serif; 
        direction: rtl; 
        font-size: 17px; 
        font-weight: 700; 
        line-height: 1.7;
        color: #0f172a; 
        width: 100%;
        max-width: 100%;
        overflow-x: hidden;
    }

    /* --- PAGE LAYOUT (FULL SCREEN 100% WIDTH) --- */
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
    }

    /* 1. REPORT HEADER */
    .report-header {
        background-color: ${THEME.colors.primary} !important;
        color: #ffffff !important;
        padding: 20px 8px !important;
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        width: 100% !important;
        border-bottom: 4px solid #3b82f6;
        margin-bottom: 16px;
        direction: rtl;
    }

    .report-header-title {
        text-align: right;
        flex: 1;
        color: #ffffff !important;
    }

    /* REPORT TITLE (H1) - Crisp Light Text on Header */
    .report-header-title h1, .report-header h1 {
        margin: 0;
        padding: 0;
        font-size: 28px;
        font-weight: 900;
        color: #ffffff !important;
        border: none !important;
        line-height: 1.3;
        text-shadow: none !important;
    }

    .report-header-subtitle {
        margin: 6px 0 0 0;
        font-size: 16px;
        font-weight: 800 !important;
        color: #e2e8f0 !important;
    }

    .report-header-meta {
        text-align: left;
        direction: rtl;
        font-size: 14px;
        color: #ffffff !important;
        font-weight: 800;
        line-height: 1.5;
        min-width: 140px;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
    }

    .report-header-meta * {
        color: #ffffff !important;
    }

    /* 2. REPORT BODY - MINIMUM SIDE MARGINS FOR FULL SCREEN */
    .report-body {
        width: 100% !important;
        max-width: 100% !important;
        flex: 1;
        padding: 0 6px; /* ALLOW DYNAMIC PADDING FROM INLINE STYLES */
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
        line-height: 1.7;
        text-align: right;
        word-spacing: normal;
        letter-spacing: normal;
    }

    /* 3. REPORT FOOTER */
    .report-footer {
        background-color: ${THEME.colors.footerBg} !important;
        color: ${THEME.colors.footerText} !important;
        padding: 14px 8px;
        text-align: center;
        width: 100%;
        border-top: 2px solid #e2e8f0;
        margin-top: 24px;
        font-size: 13px;
        font-weight: 800;
        direction: rtl;
    }

    /* --- TYPOGRAPHY & HIERARCHY --- */

    .report-body h1, h1 {
        font-size: 26px;
        font-weight: 900;
        color: #1e3a8a !important;
        border-bottom: 3px solid #1e3a8a;
        padding-bottom: 8px;
        margin-top: 20px;
        margin-bottom: 14px;
        width: 100%;
        display: block;
        page-break-after: avoid;
    }

    .report-body h2, h2 {
        font-size: 22px;
        font-weight: 900;
        color: #1e3a8a !important;
        border-bottom: 2px solid #cbd5e1;
        padding-bottom: 4px;
        margin-top: 18px;
        margin-bottom: 12px;
        width: 100%;
        display: block;
        page-break-after: avoid;
    }

    .report-body h3, h3, .report-body h4, h4 {
        font-size: 18px;
        font-weight: 800;
        color: #0f172a !important;
        background-color: #f1f5f9;
        border-right: 5px solid #3b82f6;
        padding: 6px 10px;
        margin-top: 16px;
        margin-bottom: 10px;
        display: block;
        border-radius: 4px;
        page-break-after: avoid;
    }

    .report-body p, .report-body li, .report-body div {
        text-align: right;
        margin-bottom: 6px;
        font-size: 16px;
        font-weight: 700;
        line-height: 1.7;
    }

    /* --- DARK BACKGROUND CONTRAST ENFORCEMENT --- */
    /* Force white text on any element with a dark background */
    [style*="background-color: #0"],
    [style*="background-color: #1"],
    [style*="background-color: #2"],
    [style*="background-color: #3"],
    [style*="background-color: rgb(30"],
    [style*="background-color: rgb(15"],
    [style*="background-color: rgb(0"],
    .bg-slate-900,
    .bg-blue-900,
    .bg-indigo-900,
    .bg-slate-800,
    .bg-blue-800 {
        color: #ffffff !important;
    }

    [style*="background-color: #0"] *,
    [style*="background-color: #1"] *,
    [style*="background-color: #2"] *,
    [style*="background-color: #3"] *,
    [style*="background-color: rgb(30"] *,
    [style*="background-color: rgb(15"] *,
    [style*="background-color: rgb(0"] *,
    .bg-slate-900 *,
    .bg-blue-900 *,
    .bg-indigo-900 *,
    .bg-slate-800 *,
    .bg-blue-800 * {
        color: #ffffff !important;
    }

    /* COLORED BOXES */
    .info-box { 
        background-color: #eff6ff !important; 
        border-right: 5px solid #2563eb !important; 
        color: #1e40af !important; 
        padding: 10px 12px; margin: 10px 0; border-radius: 8px; 
        font-weight: 700 !important;
    }
    
    .success-box { 
        background-color: #f0fdf4 !important; 
        border-right: 5px solid #16a34a !important;
        color: #15803d !important; 
        padding: 10px 12px; margin: 10px 0; border-radius: 8px; 
        font-weight: 700 !important;
    }
    
    .warning-box { 
        background-color: #fef2f2 !important; 
        border-right: 5px solid #dc2626 !important;
        color: #991b1b !important; 
        padding: 10px 12px; margin: 10px 0; border-radius: 8px; 
        font-weight: 700 !important;
    }
    
    .cost-box, .highlight-box { 
        background-color: #fffbeb !important; 
        border-right: 5px solid #d97706 !important;
        color: #92400e !important; 
        padding: 10px 12px; margin: 10px 0; border-radius: 8px; 
        font-weight: 700 !important;
    }

    /* --- RESPONSIVE TABLES & HORIZONTAL SCROLL --- */
    .table-responsive-wrapper {
        width: 100% !important;
        max-width: 100% !important;
        overflow-x: auto !important;
        overflow-y: hidden !important;
        -webkit-overflow-scrolling: touch !important;
        touch-action: pan-x pan-y !important;
        margin: 14px 0 !important;
        display: block !important;
        box-sizing: border-box !important;
        scrollbar-width: thin !important;
        scrollbar-color: #2563eb #e2e8f0 !important;
        padding-bottom: 8px !important;
    }

    .table-responsive-wrapper::-webkit-scrollbar {
        height: 10px !important;
        display: block !important;
        background-color: #e2e8f0 !important;
        border-radius: 6px !important;
    }

    .table-responsive-wrapper::-webkit-scrollbar-track {
        background: #e2e8f0 !important;
        border-radius: 6px !important;
        border: 1px solid #cbd5e1 !important;
        margin: 0 4px !important;
    }

    .table-responsive-wrapper::-webkit-scrollbar-thumb {
        background: #2563eb !important;
        border-radius: 6px !important;
        border: 2px solid #e2e8f0 !important;
    }

    .table-responsive-wrapper::-webkit-scrollbar-thumb:hover {
        background: #1d4ed8 !important;
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
    }
    
    /* Table Header: Dark Blue Background with Crisp White Text */
    th { 
        background-color: #1e3a8a !important; 
        color: #ffffff !important; 
        padding: 10px 12px !important; 
        border: 1px solid #94a3b8 !important; 
        font-weight: 900 !important; 
        font-size: 15px !important; 
        text-align: center !important; 
        min-width: 100px !important;
        white-space: normal !important;
        word-break: normal !important;
    }

    th * {
        color: #ffffff !important;
    }
    
    td { 
        padding: 8px 10px !important; 
        border: 1px solid #cbd5e1 !important; 
        vertical-align: middle !important; 
        font-size: 14px !important; 
        font-weight: 700 !important; 
        color: #0f172a !important; 
        text-align: center !important;
        min-width: 90px !important;
        word-break: normal !important;
    }

    tr:nth-child(even) td { 
        background-color: #f8fafc !important; 
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
        .report-body {
            /* allow dynamic padding */
        }
        .report-header {
            padding: 14px 6px !important;
            flex-direction: column;
            align-items: flex-start;
            gap: 8px;
        }
        .report-header-title h1 {
            font-size: 22px !important;
        }
        th, td {
            padding: 6px 8px !important; 
            font-size: 14px !important;
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
            min-width: 100% !important;
        }
    }
`;

export const AI_REPORT_INSTRUCTION = `
    **STRICT REPORT GENERATION STANDARDS:**
    1.  **Output Format:** Return ONLY clean, valid HTML. Do NOT use Markdown code blocks (\`\`\`html).
    2.  **Language:** Arabic (Professional Technical Consultant).
    3.  **Layout:** Full Width (100%).
    4.  **Spacing:** Do NOT use \`<br>\` for spacing. Rely on CSS classes (margin/padding).
    5.  **Hierarchy:**
        - **H1:** Main Title (Use once).
        - **H2:** Major Section Titles.
        - **H3:** Subsections.
    6.  **Tables:** Use \`<table>\` with \`width="100%"\` for ALL numerical data.
    7.  **Boxes:** Use specific classes for content types:
        - \`<div class="info-box editable-box">\` for General Info.
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
    // Fallback regex wrapping any table not already in table-responsive-wrapper
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
        flags: { showHeader?: boolean, showTitle?: boolean, showSubtitle?: boolean, showDate?: boolean, showRef?: boolean, headerColor?: string }
    ) => {
        const { showHeader = true, showTitle = true, showSubtitle = true, showDate = true, showRef = true, headerColor } = flags;
        
        if (!showHeader) return '';
        if (!showTitle && !showSubtitle && !showDate && !showRef) return '';

        const bg = headerColor || THEME.colors.primary;
        const isLight = isLightHexColor(bg);
        const textColor = isLight ? '#0f172a' : '#ffffff';
        const subColor = isLight ? '#334155' : '#e2e8f0';

        let titleBlock = '';
        if (showTitle || showSubtitle) {
            titleBlock = `
                <div class="report-header-title" style="color: ${textColor} !important;">
                    ${showTitle ? `<h1 style="color: ${textColor} !important;">${title}</h1>` : ''}
                    ${showSubtitle ? `<p class="report-header-subtitle" style="color: ${subColor} !important;">${subtitle}</p>` : ''}
                </div>
            `;
        }

        let metaBlock = '';
        if (showDate || showRef) {
            metaBlock = `
                <div class="report-header-meta" style="color: ${textColor} !important;">
                    ${showDate ? `<div style="color: ${textColor} !important;"><strong style="color: ${textColor} !important;">${labels.date}</strong> <span style="color: ${textColor} !important;">${date}</span></div>` : ''}
                    ${showRef ? `<div style="color: ${textColor} !important;"><strong style="color: ${textColor} !important;">${labels.ref}</strong> <span style="color: ${textColor} !important;">${ref}</span></div>` : ''}
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
    getFooterHTML: (text: string, visible: boolean = true, footerColor?: string) => {
        if (!visible) return '';
        const bg = footerColor || THEME.colors.footerBg;
        const isLight = isLightHexColor(bg);
        const textColor = isLight ? '#334155' : '#ffffff';
        return `
            <div class="report-footer" style="background-color: ${bg} !important; color: ${textColor} !important;">
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
                            headerColor: metadata.headerColor
                        }
                    )}
                    <div class="report-body">${processedBody}</div>
                    ${ReportGenerator.getFooterHTML(footerText, metadata.showFooter, metadata.footerColor)}
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
