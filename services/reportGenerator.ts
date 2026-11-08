
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
        font-size: 18px; /* INCREASED BASE SIZE (Was 16px) */
        font-weight: 700; /* FORCE BOLD GLOBALLY */
        line-height: 1.8;
        color: #000; /* PURE BLACK TEXT */
        width: 100%;
        overflow-x: hidden;
    }

    /* --- PAGE LAYOUT (A4 SIMULATION) --- */
    .report-container {
        display: flex;
        flex-direction: column;
        min-height: 100%; 
        width: 100%;
        background: white;
        position: relative;
        border: none !important; /* NO EXTERNAL BORDERS */
    }

    /* 1. REPORT HEADER */
    .report-header {
        background-color: ${THEME.colors.headerBg} !important;
        color: ${THEME.colors.headerText} !important;
        padding: 25px 0.5cm; /* More Breathing Room */
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        width: 100%;
        border-bottom: 4px solid ${THEME.colors.primary};
        margin-bottom: 30px;
        direction: rtl;
    }

    .report-header-title {
        text-align: right;
        flex: 1;
    }

    /* REPORT TITLE (H1) - DISTINCT & LARGE */
    .report-header-title h1 {
        margin: 0;
        padding: 0;
        font-size: 36px; /* VERY LARGE (Was 32px) */
        font-weight: 900;
        color: ${THEME.colors.primary} !important;
        border: none !important;
        line-height: 1.2;
        text-shadow: 1px 1px 0px #e2e8f0;
    }

    .report-header-subtitle {
        margin: 10px 0 0 0;
        font-size: 18px; /* Was 16px */
        font-weight: 800 !important;
        color: #334155 !important;
    }

    .report-header-meta {
        text-align: left;
        direction: rtl;
        font-size: 15px; /* Was 14px */
        color: #000;
        font-weight: 800;
        line-height: 1.6;
        min-width: 160px;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
    }

    /* 2. REPORT BODY */
    .report-body {
        width: 100%;
        flex: 1;
        padding: 0 0.5cm !important; /* STRICT 0.5cm MARGIN */
        background: white;
        min-height: 500px;
        direction: rtl;
        text-align: justify;
        color: #000;
        border: none !important;
    }

    .report-body p {
        margin-top: 0;
        margin-bottom: 4px !important; /* Very small margin between paragraphs */
    }

    /* 3. REPORT FOOTER */
    .report-footer {
        background-color: ${THEME.colors.footerBg} !important;
        color: ${THEME.colors.footerText} !important;
        padding: 20px 0.5cm;
        text-align: center;
        width: 100%;
        border-top: 2px solid #e2e8f0;
        margin-top: 40px;
        font-size: 14px; /* Was 13px */
        font-weight: 800;
        direction: rtl;
    }

    /* --- TYPOGRAPHY & HIERARCHY --- */

    /* H1: Main Section Title */
    .report-body h1, h1 {
        font-size: 32px; /* Was 28px */
        font-weight: 900;
        color: ${THEME.colors.primary} !important; /* Dark Blue */
        border-bottom: 3px solid ${THEME.colors.primary};
        padding-bottom: 10px;
        margin-top: 30px;
        margin-bottom: 20px;
        width: 100%;
        display: block;
        page-break-after: avoid;
    }

    /* H2: Sub Section Title */
    .report-body h2, h2 {
        font-size: 28px; /* Was 24px */
        font-weight: 900;
        color: #1e3a8a !important; /* Dark Blue */
        border-bottom: 1px solid #94a3b8;
        padding-bottom: 5px;
        margin-top: 25px;
        margin-bottom: 15px;
        width: 100%;
        display: block;
        page-break-after: avoid;
    }

    /* H3: Minor Section / Item Title */
    /* Light Background -> Dark Text */
    .report-body h3, h3, .report-body h4, h4 {
        font-size: 24px; /* Was 20px */
        font-weight: 800;
        color: #0f172a !important; /* Very Dark Slate */
        background-color: #f1f5f9; /* Light Gray Background */
        border-right: 6px solid ${THEME.colors.accent};
        padding: 8px 12px;
        margin-top: 20px;
        margin-bottom: 10px;
        display: block;
        border-radius: 4px;
        page-break-after: avoid;
    }

    /* PARAGRAPHS - CLEAR & BOLD */
    .report-body p, .report-body li, .report-body td, .report-body div {
        text-align: justify;
        margin-bottom: 4px;
        font-size: 18px; /* STRICT 18px */
        font-weight: 700; /* STRICT BOLD */
        line-height: 1.5;
        color: #000 !important;
    }

    /* COLORED BOXES - ATTRACTIVE STYLING */
    .info-box { 
        background-color: #eff6ff !important; 
        border-right: 6px solid #1d4ed8 !important; 
        color: #1e3a8a !important; 
        padding: 2px 10px; margin: 4px 0; border-radius: 6px; 
        font-weight: 700 !important;
    }
    
    .success-box { 
        background-color: #f0fdf4 !important; 
        border-right: 6px solid #15803d !important;
        color: #14532d !important; 
        padding: 2px 10px; margin: 4px 0; border-radius: 6px; 
        font-weight: 700 !important;
    }
    
    .warning-box { 
        background-color: #fef2f2 !important; 
        border-right: 6px solid #b91c1c !important;
        color: #7f1d1d !important; 
        padding: 2px 10px; margin: 4px 0; border-radius: 6px; 
        font-weight: 700 !important;
    }
    
    .cost-box, .highlight-box { 
        background-color: #fffbeb !important; 
        border-right: 6px solid #b45309 !important;
        color: #78350f !important; 
        padding: 2px 10px; margin: 4px 0; border-radius: 6px; 
        font-weight: 700 !important;
    }

    .glass-box {
        background: rgba(255, 255, 255, 0.7) !important;
        backdrop-filter: blur(4px);
        border: 1px solid rgba(203, 213, 225, 0.5) !important;
        padding: 2px 10px; margin: 4px 0; border-radius: 12px;
        box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.05);
    }

    .gradient-blue-box {
        background: linear-gradient(to left, #eff6ff, #dbeafe) !important;
        border-right: 6px solid #2563eb !important;
        padding: 2px 10px; margin: 4px 0; border-radius: 6px;
        color: #1e40af !important;
    }

    /* TABLES - FULL WIDTH */
    table { 
        width: 100% !important; 
        min-width: 100% !important; 
        border-collapse: collapse; 
        margin: 6px 0; 
        direction: rtl; 
        border: 2px solid #000;
        table-layout: auto !important; 
    }
    
    /* Table Header: Dark Background -> Light Text */
    th { 
        background-color: ${THEME.colors.primary} !important; 
        color: #ffffff !important; /* White Text */
        padding: 4px 6px; 
        border: 1px solid #000; 
        font-weight: 900; 
        font-size: 18px; /* Was 16px */
        text-align: center; 
        white-space: nowrap;
    }
    
    td { 
        padding: 2px 6px; 
        border: 1px solid #000; 
        vertical-align: middle; 
        font-size: 18px; /* Was 16px */
        font-weight: 700; 
        color: #000; 
        text-align: center;
    }
    tr:nth-child(even) { background-color: #f8fafc !important; }

    /* PHOTO GRID */
    .photo-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 15px;
        margin-top: 20px;
        page-break-inside: auto;
    }
    .photo-item {
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        padding: 5px;
        background: #fff;
        page-break-inside: avoid;
        break-inside: avoid;
        width: 100%;
        box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    }
    .photo-item img {
        width: 100%;
        height: 240px; /* Slightly larger images */
        object-fit: cover;
        border-radius: 4px;
        display: block;
    }

    /* MOBILE RESPONSIVE TWEAKS */
    @media screen and (max-width: 768px) {
        .report-body {
            padding: 0 0.5cm !important; 
        }
        .report-header {
            padding: 20px 0.5cm !important;
            flex-direction: column;
            align-items: flex-start;
            gap: 10px;
        }
        .report-header-title h1 {
            font-size: 28px !important;
        }
        th, td {
            padding: 6px !important; 
            font-size: 16px !important;
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
}

export const ReportGenerator = {
    getHeaderHTML: (title: string, ref: string, date: string, subtitle: string, labels: { date: string, ref: string }, flags: {showHeader?: boolean, showTitle?: boolean, showSubtitle?: boolean, showDate?: boolean, showRef?: boolean}) => {
        const { showHeader = true, showTitle = true, showSubtitle = true, showDate = true, showRef = true } = flags;
        
        if (!showHeader) return '';
        if (!showTitle && !showSubtitle && !showDate && !showRef) return '';

        let titleBlock = '';
        if (showTitle || showSubtitle) {
            titleBlock = `
                <div class="report-header-title">
                    ${showTitle ? `<h1>${title}</h1>` : ''}
                    ${showSubtitle ? `<p class="report-header-subtitle">${subtitle}</p>` : ''}
                </div>
            `;
        }

        let metaBlock = '';
        if (showDate || showRef) {
            metaBlock = `
                <div class="report-header-meta">
                    ${showDate ? `<div><strong>${labels.date}</strong> <span>${date}</span></div>` : ''}
                    ${showRef ? `<div><strong>${labels.ref}</strong> <span>${ref}</span></div>` : ''}
                </div>
            `;
        }

        return `
            <div class="report-header">
                ${titleBlock}
                ${metaBlock}
            </div>
        `;
    },
    getFooterHTML: (text: string, visible: boolean = true) => {
        if (!visible) return '';
        return `
            <div class="report-footer">
                ${text}
            </div>
        `;
    },
    buildReport: (title: string, bodyHTML: string, metadata: ReportMetadata = {}) => {
        const dateStr = metadata.date || new Date().toLocaleDateString('en-CA'); 
        const refStr = metadata.ref || `REF-${Date.now().toString().slice(-6)}`;
        const subtitle = metadata.subtitle || "نظام مدير مشروعات التشييد برو - تقرير استشاري";
        const footerText = metadata.footerText || "تم إعداد التقرير بواسطة الذكاء الاصطناعي تحت إشراف المهندس وحيد سماحة | مهندس_مصر";
        
        const dateLabel = metadata.labels?.date || "التاريخ:";
        const refLabel = metadata.labels?.ref || "المرجع:";

        const paddingStyle = metadata.margins 
            ? `padding: ${metadata.margins.y} ${metadata.margins.x} !important;` 
            : 'padding: 0 0.5cm !important;'; // Default 0.5cm

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
                            showRef: metadata.showRef 
                        }
                    )}
                    <div class="report-body">${bodyHTML}</div>
                    ${ReportGenerator.getFooterHTML(footerText, metadata.showFooter)}
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
