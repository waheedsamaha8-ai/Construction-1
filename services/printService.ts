/**
 * @fileoverview Centralized Printing Service for Construction Manager Pro
 * Unified 1:1 with REPORT_CSS, InteractiveReportViewer, and LetterEditor Print Preview.
 */

import { REPORT_CSS, wrapTablesInHtml } from './reportGenerator';
import { formatInteractiveReportHtml } from '../components/InteractiveReportViewer';

// Sanitize REPORT_CSS for print so it matches screen/A4 preview 1:1 without oversized fonts or !important lockouts
const getUnifiedPrintReportCSS = (): string => {
    let css = REPORT_CSS;
    // Strip mobile-only viewport overrides so A4 print always uses the exact unified print layout
    css = css.replace(/@media\s+screen\s+and\s*\(max-width:\s*768px\)\s*\{[\s\S]*?\n\s*\}/gi, '');
    // Allow user-customized inline font sizes, weights, colors, and alignments (e.g. from LetterEditor)
    css = css.replace(/font-size:\s*[^;]+!important;/g, (m) => m.replace('!important', ''));
    css = css.replace(/font-weight:\s*[^;]+!important;/g, (m) => m.replace('!important', ''));
    return css;
};

// Helper to generate dynamic styles matching InteractiveReportViewer & LetterEditor A4 Print Preview
const getPrintStyles = (marginCm: number = 0.5) => {
    return `
        @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@600;700;800;900&display=swap');

        @page {
            size: A4 portrait;
            margin: ${marginCm}cm;
        }

        * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
            box-sizing: border-box;
        }

        html, body {
            width: 100%;
            margin: 0;
            padding: 0;
            background: #ffffff;
            font-family: 'Cairo', 'Tajawal', sans-serif;
            direction: rtl;
            font-size: 13px;
            font-weight: 600;
            line-height: 1.65;
            color: #0f172a;
            -webkit-text-size-adjust: 100%;
            text-size-adjust: 100%;
            height: auto !important;
            overflow: visible !important;
        }

        ${getUnifiedPrintReportCSS()}

        .print-wrapper {
            width: 100% !important;
            min-height: 96vh !important;
            border: none !important;
            margin: 0 !important;
            padding: 0 !important;
            display: flex !important;
            flex-direction: column !important;
            background: #ffffff !important;
        }

        .report-container {
            width: 100% !important;
            max-width: 100% !important;
            min-height: 96vh !important;
            display: flex !important;
            flex-direction: column !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            background: #ffffff !important;
        }

        .report-body {
            width: 100% !important;
            max-width: 100% !important;
            flex: 1 1 auto !important;
            min-height: 0 !important;
            font-size: 13px;
            line-height: 1.65;
            color: #0f172a;
            direction: rtl;
            text-align: right;
        }

        .report-body p,
        .report-body li,
        .report-body div {
            font-size: 13px;
            line-height: 1.65;
            word-spacing: normal;
            letter-spacing: normal;
            orphans: 3;
            widows: 3;
        }

        .report-body ul {
            list-style-type: disc;
            margin: 6px 0;
            padding-right: 1.5rem;
        }

        .report-body ol {
            list-style-type: decimal;
            margin: 6px 0;
            padding-right: 1.5rem;
        }

        .report-body h1,
        .report-body h2,
        .report-body h3,
        .report-body h4 {
            page-break-after: avoid;
            break-after: avoid;
        }

        .info-box, .warning-box, .success-box, .cost-box, .highlight-box {
            page-break-inside: auto;
            break-inside: auto;
        }

        .table-responsive-wrapper {
            width: 100% !important;
            max-width: 100% !important;
            overflow: visible !important;
            margin: 10px 0 !important;
            padding: 0 !important;
        }

        table, .editable-table {
            width: 100% !important;
            min-width: 0 !important;
            max-width: 100% !important;
            border-collapse: collapse !important;
            table-layout: auto;
            page-break-inside: auto !important;
        }

        table.boq-summary-mini-table,
        table.pricing-compact-table {
            width: 100% !important;
            min-width: 0 !important;
            max-width: 100% !important;
        }

        thead { display: table-header-group !important; }
        tfoot { display: table-footer-group !important; }
        tr { page-break-inside: avoid !important; break-inside: avoid !important; }

        img {
            max-width: 100%;
            height: auto;
            margin: 8px auto;
            display: block;
            page-break-inside: avoid;
            break-inside: avoid;
        }

        .report-footer {
            margin-top: auto !important;
            margin-bottom: 0 !important;
            page-break-inside: avoid;
            break-inside: avoid;
        }

        .no-print { display: none !important; }
        .hidden-element { display: none !important; }
    `;
};

export interface PrintOptions {
    date?: string;
    subtitle?: string;
    footerText?: string;
    margins?: { x: string; y: string };
    pageMargin?: number;
    labels?: { date: string; ref: string };
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
    preserveUserStyles?: boolean;
}

const isLightColor = (hex?: string): boolean => {
    if (!hex || !hex.startsWith('#')) return false;
    const clean = hex.replace('#', '');
    const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
    if (full.length !== 6) return false;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 >= 165;
};

const extractPrintableBody = (rawHtml: string): string => {
    if (!rawHtml) return '';
    try {
        if (typeof window !== 'undefined' && window.DOMParser) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(rawHtml, 'text/html');

            // Remove embedded <style>, <script>, settings block, and duplicate headers/footers
            doc.querySelectorAll('style, script, #saved-page-settings, .report-header, .report-footer, .print-header, .print-footer').forEach(el => el.remove());

            const reportBody = doc.querySelector('.report-body');
            if (reportBody) {
                return reportBody.innerHTML;
            }
            const contentBody = doc.querySelector('.content-body');
            if (contentBody) {
                return contentBody.innerHTML;
            }
            return doc.body.innerHTML || rawHtml;
        }
    } catch {}
    return rawHtml
        .replace(/<!DOCTYPE[^>]*>/gi, '')
        .replace(/<\/?(?:html|head|body)[^>]*>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '');
};

export const printService = {
    printHTML: (contentHTML: string, title: string = 'مستند هندسي', options: { marginCm?: number } = {}) => {
        const { marginCm = 0.5 } = options;
        const existingFrames = document.querySelectorAll('iframe[id^="print-frame-"]');
        existingFrames.forEach(frame => frame.remove());

        const iframe = document.createElement('iframe');
        iframe.id = `print-frame-${Date.now()}`;
        iframe.style.position = 'fixed';
        iframe.style.top = '0';
        iframe.style.left = '-9999px';
        iframe.style.width = '794px';
        iframe.style.height = '1123px';
        iframe.style.border = 'none';
        iframe.style.opacity = '0';
        iframe.style.pointerEvents = 'none';

        document.body.appendChild(iframe);

        const doc = iframe.contentWindow?.document;
        if (!doc) return;

        const styleToUse = getPrintStyles(marginCm);

        const fullHTML = `
            <!DOCTYPE html>
            <html dir="rtl" lang="ar">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${title}</title>
                <style>${styleToUse}</style>
            </head>
            <body>
                <div class="print-wrapper">
                    ${contentHTML}
                </div>
                <script>
                    (function() {
                        var printed = false;
                        function notifyReady() {
                            if (printed) return;
                            printed = true;
                            window.parent.postMessage({ type: 'PRINT_READY', id: '${iframe.id}' }, '*');
                        }
                        function waitFontsAndNotify() {
                            if (document.fonts && document.fonts.ready) {
                                Promise.race([
                                    document.fonts.ready,
                                    new Promise(function(r) { setTimeout(r, 700); })
                                ]).then(notifyReady).catch(notifyReady);
                            } else {
                                notifyReady();
                            }
                        }
                        function checkImages() {
                            var images = document.getElementsByTagName('img');
                            var loaded = 0;
                            if (images.length === 0) {
                                waitFontsAndNotify();
                            } else {
                                for (var i = 0; i < images.length; i++) {
                                    if (images[i].complete) {
                                        loaded++;
                                    } else {
                                        images[i].onload = function() {
                                            loaded++;
                                            if (loaded === images.length) waitFontsAndNotify();
                                        };
                                        images[i].onerror = function() {
                                            loaded++;
                                            if (loaded === images.length) waitFontsAndNotify();
                                        };
                                    }
                                }
                                if (loaded === images.length) waitFontsAndNotify();
                            }
                        }
                        window.onload = checkImages;
                        setTimeout(checkImages, 400);
                    })();
                </script>
            </body>
            </html>
        `;

        const handleMessage = (event: MessageEvent) => {
            if (event.data && event.data.type === 'PRINT_READY' && event.data.id === iframe.id) {
                window.removeEventListener('message', handleMessage);
                setTimeout(() => {
                    try {
                        iframe.contentWindow?.focus();
                        iframe.contentWindow?.print();
                    } catch (e) {
                        console.error('Print execution failed', e);
                    } finally {
                        setTimeout(() => {
                            if (document.body.contains(iframe)) {
                                document.body.removeChild(iframe);
                            }
                        }, 60000);
                    }
                }, 250);
            }
        };
        window.addEventListener('message', handleMessage);

        doc.open();
        doc.write(fullHTML);
        doc.close();
    },

    printHtmlContent: (contentHTML: string, title: string = 'مستند هندسي', options: PrintOptions = {}) => {
        printService.printReport(contentHTML, title, undefined, {
            showHeader: false,
            showFooter: false,
            ...options
        });
    },

    printReport: (bodyContent: string, reportTitle: string, projectRef?: string, options: PrintOptions = {}) => {
        const dateStr = options.date || new Date().toLocaleDateString('en-CA');
        const refStr = projectRef || `AI-${Date.now().toString().slice(-6)}`;
        const subtitle = options.subtitle || 'تقرير هندسي استشاري';
        const footerText = options.footerText || 'تم إعداد التقرير بواسطة الذكاء الاصطناعي تحت إشراف المهندس وحيد سماحة | مهندس_مصر';
        const dateLabel = options.labels?.date || 'التاريخ:';
        const refLabel = options.labels?.ref || 'المرجع:';

        const {
            showHeader = true,
            showTitle = true,
            showSubtitle = true,
            showDate = true,
            showRef = true,
            showFooter = true,
            headerColor = '#1e3a8a',
            footerColor = '#ffffff',
            fontSizes,
            preserveUserStyles
        } = options;

        const paddingStyle = options.margins
            ? `padding: ${options.margins.y} ${options.margins.x};`
            : (showHeader ? 'padding: 0 4px;' : 'padding: 0;');

        const isHeaderLight = isLightColor(headerColor);
        const headerTextColor = isHeaderLight ? '#0f172a' : '#ffffff';
        const headerSubTextColor = isHeaderLight ? '#334155' : '#e2e8f0';
        const headerMetaBg = isHeaderLight ? 'rgba(15, 23, 42, 0.06)' : 'rgba(255, 255, 255, 0.1)';
        const headerMetaBorder = isHeaderLight ? 'rgba(15, 23, 42, 0.15)' : 'rgba(255, 255, 255, 0.2)';

        const isFooterLight = isLightColor(footerColor);
        const footerTextColor = isFooterLight ? '#334155' : '#ffffff';

        const titleFs = fontSizes?.title || '15px';
        const subtitleFs = fontSizes?.subtitle || '11.5px';
        const metaFs = fontSizes?.meta || '11px';
        const footerFs = fontSizes?.footer || '12px';

        let headerHTML = '';
        if (showHeader && (showTitle || showSubtitle || showDate || showRef)) {
            let titleBlock = '';
            if (showTitle || showSubtitle) {
                titleBlock = `
                    <div class="report-header-title" style="color: ${headerTextColor} !important;">
                        ${showTitle ? `<h1 style="margin:0; font-size: ${titleFs}; text-align: right; color: ${headerTextColor} !important;">${reportTitle}</h1>` : ''}
                        ${showSubtitle ? `<p class="report-header-subtitle" style="margin:3px 0 0 0; font-size: ${subtitleFs}; text-align: right; color: ${headerSubTextColor} !important;">${subtitle}</p>` : ''}
                    </div>
                `;
            }
            let metaBlock = '';
            if (showDate || showRef) {
                metaBlock = `
                    <div class="report-header-meta" style="font-size: ${metaFs}; color: ${headerTextColor} !important; background-color: ${headerMetaBg} !important; border: 1px solid ${headerMetaBorder} !important;">
                        ${showDate ? `<div style="text-align: left; direction: rtl; font-size: ${metaFs}; color: ${headerTextColor} !important;"><strong style="color: ${headerTextColor} !important;">${dateLabel}</strong> <span style="color: ${headerTextColor} !important;">${dateStr}</span></div>` : ''}
                        ${showRef ? `<div style="text-align: left; direction: rtl; font-size: ${metaFs}; color: ${headerTextColor} !important;"><strong style="color: ${headerTextColor} !important;">${refLabel}</strong> <span style="color: ${headerTextColor} !important;">${refStr}</span></div>` : ''}
                    </div>
                `;
            }
            headerHTML = `<div class="report-header" style="background-color: ${headerColor} !important; color: ${headerTextColor} !important;">${titleBlock}${metaBlock}</div>`;
        }

        const footerHTML = showFooter
            ? `<div class="report-footer" style="background-color: ${footerColor} !important; color: ${footerTextColor} !important; font-size: ${footerFs};" dir="auto">${footerText}</div>`
            : '';

        const extractedBody = extractPrintableBody(bodyContent);
        const shouldPreserveUserStyles = preserveUserStyles ?? showHeader;
        const normalizedBody = shouldPreserveUserStyles
            ? wrapTablesInHtml(extractedBody)
            : formatInteractiveReportHtml(extractedBody);

        const wrappedHTML = `
            <div class="report-container">
                ${headerHTML}
                <div class="report-body" style="width: 100%; ${paddingStyle}">
                    ${normalizedBody}
                </div>
                ${footerHTML}
            </div>
        `;

        printService.printHTML(wrappedHTML, reportTitle, {
            marginCm: options.pageMargin !== undefined ? options.pageMargin : 0.5
        });
    }
};
