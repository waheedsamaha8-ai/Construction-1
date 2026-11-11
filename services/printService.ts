
/**
 * @fileoverview Centralized Printing Service for Construction Manager Pro
 * Solves pagination, table splitting, and layout issues by isolating content in a clean iframe.
 */

// Helper to generate dynamic styles
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
            background: #fff;
            font-family: 'Cairo', sans-serif;
            direction: rtl;
            font-size: 18px; /* INCREASED BASE SIZE (Was 17px) */
            font-weight: 700; /* STRICT BOLD */
            line-height: 1.6;
            color: #000 !important;
            height: auto !important;
            overflow: visible !important;
        }

        .print-wrapper {
            width: 100% !important;
            border: none !important;
            margin: 0 !important;
            padding: 0 !important;
            display: block;
        }

        .content-body {
            width: 100% !important;
        }

        h1, h2, h3, h4, h5 { 
            color: #000 !important; 
            margin-top: 15px; 
            margin-bottom: 15px; 
            font-weight: 900 !important;
            page-break-after: avoid; 
            break-after: avoid;
        }
        h1 { font-size: 32px; border-bottom: 3px solid #000 !important; padding-bottom: 10px; }
        h2 { font-size: 28px; border-bottom: 2px solid #000 !important; padding-bottom: 8px; }
        h3 { font-size: 24px; text-decoration: underline; }
        
        p, li, div { 
            margin-bottom: 8px; 
            text-align: justify; 
            color: #000 !important;
            font-weight: 700;
            orphans: 3; 
            widows: 3;
        }

        strong { color: #000 !important; font-weight: 900 !important; }

        /* BOXES */
        .info-box, .warning-box, .success-box, .cost-box, .highlight-box, blockquote { 
            page-break-inside: auto; 
            break-inside: auto; 
            display: block;
            border: 2px solid #000 !important;
            width: 100% !important;
            font-weight: 700;
            color: #000 !important;
            padding: 12px; margin: 10px 0; border-radius: 4px;
        }
        
        .info-box { background-color: #eff6ff !important; border-color: #1e3a8a !important; }
        .warning-box { background-color: #fef2f2 !important; border-color: #991b1b !important; }
        .success-box { background-color: #f0fdf4 !important; border-color: #14532d !important; }
        .cost-box { background-color: #fffbeb !important; border-color: #d97706 !important; }
        .highlight-box { background-color: #fff9db !important; border-color: #fab005 !important; }

        img { 
            max-width: 100%; 
            height: auto; 
            margin: 10px auto; 
            display: block; 
            page-break-inside: avoid;
        }
        
        /* TABLES */
        table { 
            width: 100% !important; 
            min-width: 100% !important; 
            border-collapse: collapse; 
            margin: 15px 0; 
            table-layout: auto; 
            page-break-inside: auto !important;
            border: 2px solid #000;
        }
        
        thead { display: table-header-group !important; }
        tfoot { display: table-footer-group !important; }
        tr { page-break-inside: avoid !important; }
        
        th, td { 
            border: 1px solid #000 !important; 
            padding: 10px; 
            text-align: center; 
            font-size: 18px; /* Was 16px */
            font-weight: 700;
            vertical-align: middle; 
            color: #000 !important;
        }
        
        th { background-color: #e2e8f0 !important; font-weight: 900; }

        /* HEADER & FOOTER */
        .print-header { 
            background-color: #1e3a8a !important; 
            color: #ffffff !important; 
            border-bottom: 4px solid #3b82f6 !important; 
            padding: 18px 12px !important; 
            margin-bottom: 16px; 
            display: flex; 
            justify-content: space-between; 
            align-items: flex-start; 
            width: 100%; 
            direction: rtl;
        }

        .print-header h1 { font-size: 28px; font-weight: 900; margin: 0; padding: 0; border: none !important; color: #ffffff !important; }
        .print-header p, .print-header div, .print-header span, .print-header strong { font-weight: 800; color: #ffffff !important; }
        
        .print-footer { 
            margin-top: 30px;
            text-align: center; 
            border-top: 2px solid #e2e8f0; 
            padding-top: 15px; 
            padding-bottom: 10px;
            font-size: 14px; /* Was 13px */
            font-weight: 800; 
            color: #000 !important; 
            background: white; 
            width: 100%;
            page-break-inside: avoid;
        }
        
        /* PHOTOS */
        .photo-grid {
            display: grid !important;
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 15px !important;
            margin-top: 20px !important;
            width: 100% !important;
        }
        
        .photo-item {
            border: 2px solid #000 !important;
            border-radius: 8px !important;
            padding: 5px !important;
            background: #fff !important;
            width: 100% !important;
            display: block !important;
        }
        
        .photo-item img {
            width: 100% !important;
            height: 220px !important;
            object-fit: cover !important;
            display: block !important;
        }

        .no-print { display: none !important; }
        .hidden-element { display: none !important; }
    `;
};

export interface PrintOptions {
    subtitle?: string; 
    footerText?: string; 
    margins?: { x: string, y: string };
    pageMargin?: number;
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

export const printService = {
    printHTML: (contentHTML: string, title: string = 'مستند هندسي', options: { marginCm?: number } = {}) => {
        const { marginCm = 0.5 } = options;
        const existingFrames = document.querySelectorAll('iframe[id^="print-frame-"]');
        existingFrames.forEach(frame => frame.remove());

        const iframe = document.createElement('iframe');
        iframe.id = `print-frame-${Date.now()}`;
        iframe.style.position = 'fixed';
        iframe.style.top = '0';
        iframe.style.left = '0';
        iframe.style.width = '1px';
        iframe.style.height = '1px';
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
                <title>${title}</title>
                <style>${styleToUse}</style>
            </head>
            <body>
                <div class="print-wrapper">
                    ${contentHTML}
                </div>
                <script>
                    window.onload = function() {
                        const images = document.getElementsByTagName('img');
                        let loaded = 0;
                        if (images.length === 0) {
                            window.parent.postMessage({ type: 'PRINT_READY', id: window.frameElement.id }, '*');
                        } else {
                            for (let i = 0; i < images.length; i++) {
                                if (images[i].complete) {
                                    loaded++;
                                } else {
                                    images[i].onload = () => {
                                        loaded++;
                                        if (loaded === images.length) window.parent.postMessage({ type: 'PRINT_READY', id: window.frameElement.id }, '*');
                                    };
                                    images[i].onerror = () => {
                                        loaded++;
                                        if (loaded === images.length) window.parent.postMessage({ type: 'PRINT_READY', id: window.frameElement.id }, '*');
                                    };
                                }
                            }
                            if (loaded === images.length) window.parent.postMessage({ type: 'PRINT_READY', id: window.frameElement.id }, '*');
                        }
                    };
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
                        console.error("Print execution failed", e);
                    } finally {
                        setTimeout(() => {
                            if (document.body.contains(iframe)) {
                                document.body.removeChild(iframe);
                            }
                        }, 60000); 
                    }
                }, 500); 
            }
        };
        window.addEventListener('message', handleMessage);

        doc.open();
        doc.write(fullHTML);
        doc.close();
    },

    printReport: (bodyContent: string, reportTitle: string, projectRef?: string, options: PrintOptions = {}) => {
        const dateStr = new Date().toLocaleDateString('en-CA'); 
        const refStr = projectRef || `AI-${Date.now().toString().slice(-6)}`;
        const subtitle = options.subtitle || "تقرير هندسي استشاري";
        const footerText = options.footerText || "تم إعداد هذا التقرير بواسطة الذكاء الاصطناعي - تحت إشراف المهندس / وحيد سماحة";
        const dateLabel = options.labels?.date || "Date:";
        const refLabel = options.labels?.ref || "Ref:";

        const {
            showHeader = true,
            showTitle = true,
            showSubtitle = true,
            showDate = true,
            showRef = true,
            showFooter = true,
            headerColor = '#1e3a8a',
            footerColor = '#ffffff'
        } = options;

        const paddingStyle = options.margins ? `padding: ${options.margins.y} ${options.margins.x};` : '';
        const headerTextColor = isLightColor(headerColor) ? '#0f172a' : '#ffffff';
        const footerTextColor = isLightColor(footerColor) ? '#000000' : '#ffffff';

        let headerHTML = '';
        if (showHeader && (showTitle || showSubtitle || showDate || showRef)) {
            let titleBlock = '';
            if (showTitle || showSubtitle) {
                titleBlock = `
                    <div style="color: ${headerTextColor} !important;">
                        ${showTitle ? `<h1 style="margin:0; font-size: 32px; color: ${headerTextColor} !important;">${reportTitle}</h1>` : ''}
                        ${showSubtitle ? `<p style="margin:8px 0 0 0; font-size: 18px; color: ${headerTextColor} !important;">${subtitle}</p>` : ''}
                    </div>
                `;
            }
            let metaBlock = '';
            if (showDate || showRef) {
                metaBlock = `
                    <div style="text-align: left; font-size: 15px; color: ${headerTextColor} !important;">
                        ${showDate ? `<p style="margin:0; color: ${headerTextColor} !important;" dir="auto"><strong style="color: ${headerTextColor} !important;">${dateLabel}</strong> ${dateStr}</p>` : ''}
                        ${showRef ? `<p style="margin:0; color: ${headerTextColor} !important;" dir="auto"><strong style="color: ${headerTextColor} !important;">${refLabel}</strong> ${refStr}</p>` : ''}
                    </div>
                `;
            }
            headerHTML = `<div class="print-header" style="background-color: ${headerColor} !important; color: ${headerTextColor} !important;">${titleBlock}${metaBlock}</div>`;
        }

        const footerHTML = showFooter ? `<div class="print-footer" style="background-color: ${footerColor} !important; color: ${footerTextColor} !important;" dir="auto">${footerText}</div>` : '';

        const wrappedHTML = `
            ${headerHTML}
            <div class="content-body" style="width: 100%; ${paddingStyle}">
                ${bodyContent}
            </div>
            ${footerHTML}
        `;
        
        printService.printHTML(wrappedHTML, reportTitle, { marginCm: options.pageMargin !== undefined ? options.pageMargin : 0.5 });
    }
};
