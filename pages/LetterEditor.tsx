
// @ts-nocheck
import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import { api } from '../services/api';
import { printService } from '../services/printService';
import { aiHelper } from '../services/aiHelper';
import { REPORT_CSS, ReportGenerator } from '../services/reportGenerator';

// Default Content (Body Only)
const DEFAULT_BODY_CONTENT = `
<p><strong>السيد المهندس / ................................. المحترم</strong></p>
<p>تحية طيبة وبعد ،،،</p>
<br>
<p>نود الإحاطة بأنه ....................</p>
<br><br><br>
<div style="text-align: center; margin-bottom: 40px;">
    <p>وتفضلوا بقبول فائق الاحترام والتقدير ،،،</p>
</div>
<table style="width: 100%; border: none; text-align: center;">
    <tr>
        <td style="border: none;"><strong>مقدمه لسيادتكم</strong><br><br>......................</td>
        <td style="border: none;"><strong>مدير المشروع</strong><br><br>......................</td>
    </tr>
</table>
`;

// Margin Options Configuration
const MARGIN_OPTIONS = [
    { label: '0 سم', value: '0cm' },
    { label: '0.5 سم (افتراضي)', value: '0.5cm' },
    { label: '1 سم', value: '1cm' },
    { label: '1.5 سم', value: '1.5cm' },
    { label: '2 سم', value: '2cm' },
    { label: '2.5 سم', value: '2.5cm' },
];

const LetterEditor: React.FC = () => {
  const { projectId, folderId } = useParams<{ projectId: string; folderId: string }>();
  const [searchParams] = useSearchParams();
  const fileId = searchParams.get('fileId');
  const navigate = useNavigate();
  const location = useLocation(); 
  
  // Refs
  const editorRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const boxImageInputRef = useRef<HTMLInputElement>(null); 
  const colorInputRef = useRef<HTMLInputElement>(null); 
  const borderColorInputRef = useRef<HTMLInputElement>(null);
  const textColorInputRef = useRef<HTMLInputElement>(null); 
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  
  // Mobile Selection Logic
  const savedRange = useRef<Range | null>(null);
  
  const [filename, setFilename] = useState('خطاب جديد');
  
  // PAGE DATA & VISIBILITY STATES
  const [showHeader, setShowHeader] = useState(true); // Master Toggle for Header
  const [reportTitle, setReportTitle] = useState('الموضوع: .......................................');
  const [showTitle, setShowTitle] = useState(true);

  const [headerSubtitle, setHeaderSubtitle] = useState("نظام مدير مشروعات التشييد برو - تقرير استشاري");
  const [showSubtitle, setShowSubtitle] = useState(true);

  const [metaRef, setMetaRef] = useState(`REF-${Date.now().toString().slice(-6)}`);
  const [refLabel, setRefLabel] = useState('المرجع:');
  const [showRef, setShowRef] = useState(true);

  const [metaDate, setMetaDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [dateLabel, setDateLabel] = useState('التاريخ:');
  const [showDate, setShowDate] = useState(true);

  const [footerText, setFooterText] = useState("تم إعداد التقرير بواسطة الذكاء الاصطناعي تحت إشراف المهندس وحيد سماحة | مهندس_مصر");
  const [showFooter, setShowFooter] = useState(true);

  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  
  // Scaling State
  const [scale, setScale] = useState(1);
  const [visualWidth, setVisualWidth] = useState(794);
  const [visualHeight, setVisualHeight] = useState(1123);
  const [contentHeight, setContentHeight] = useState(1123);
  // Default isMobileZoom to TRUE on small screens for full-width mobile experience
  const [isMobileZoom, setIsMobileZoom] = useState(window.innerWidth < 640);
  
  // MARGIN STATE (Inner Padding) - DEFAULT SET TO 0.5cm
  const [marginConfig, setMarginConfig] = useState({ x: '0.5cm', y: '0cm' });
  
  // PRINT PAGE MARGIN STATE
  const [printPageMargin, setPrintPageMargin] = useState(0.5);

  // Settings Modal State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Selection & Toolbar State
  const [activeElement, setActiveElement] = useState<HTMLElement | null>(null);
  const [formats, setFormats] = useState({
      bold: false,
      italic: false,
      underline: false,
      align: 'right', 
      blockType: 'p', 
      fontSize: '2', 
      list: false,
      color: '#000000',
      hasSelection: false // New: Track if text is selected
  });

  const [showTableTools, setShowTableTools] = useState(false);
  const [showImageTools, setShowImageTools] = useState(false);
  const [showBoxTools, setShowBoxTools] = useState(false);
  const [showQuoteTools, setShowQuoteTools] = useState(false); 
  const [showSpacingTools, setShowSpacingTools] = useState(false); 
  const [showMarginTools, setShowMarginTools] = useState(false); 

  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);

  // --- SMART REFINE STATE ---
  const [refineModalOpen, setRefineModalOpen] = useState(false);
  const [refinePrompt, setRefinePrompt] = useState('');
  const [selectedTextForRefine, setSelectedTextForRefine] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const [isAnalyzingDraft, setIsAnalyzingDraft] = useState(false);
  const [currentRowHeight, setCurrentRowHeight] = useState('30');

  const draftInputRef = useRef<HTMLInputElement>(null);
  const A4_WIDTH_PX = 794; 

  const calculateSize = useCallback(() => {
        if (!containerRef.current) return;
        const containerW = containerRef.current.clientWidth;
        if (containerW === 0) return;
        
        if (isMobileZoom) {
            // Fluid Mobile View
            setScale(1);
            setVisualWidth(0); // 100% width
            setVisualHeight(0);
        } else {
            // Exact Print Preview Scale (A4)
            // Even on mobile (e.g. 360px), we want to shrink 794px to fit
            const availableWidth = Math.max(containerW - 10, 300); // Reduce gutter for more space
            // Calculate scale to fit A4 width into available screen
            let newScale = availableWidth / A4_WIDTH_PX;
            
            // Limit scale so it's not too huge on desktop
            if (newScale > 1.5) newScale = 1.5; 
            
            setScale(newScale);
            setVisualWidth(A4_WIDTH_PX * newScale);
            setVisualHeight(contentHeight * newScale);
        }
  }, [isMobileZoom, contentHeight]);

  useEffect(() => {
    calculateSize();
    const handleResize = () => requestAnimationFrame(calculateSize);
    
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    const contentObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
            const newHeight = Math.max(entry.target.scrollHeight, 1123);
            if (Math.abs(newHeight - contentHeight) > 10) setContentHeight(newHeight);
        }
    });
    const paper = document.getElementById('paper-container');
    if (paper) contentObserver.observe(paper);
    
    return () => { 
        window.removeEventListener('resize', handleResize); 
        window.removeEventListener('orientationchange', handleResize);
        contentObserver.disconnect(); 
    };
  }, [calculateSize, contentHeight]);

  useEffect(() => {
      if (!isMobileZoom) {
          const vW = A4_WIDTH_PX * scale;
          const vH = contentHeight * scale;
          setVisualWidth(vW);
          setVisualHeight(vH);
      }
  }, [scale, contentHeight, isMobileZoom]);

  // Sanitize REPORT_CSS to allow editing (remove !important from fonts and scope global styles)
  const sanitizedCSS = useMemo(() => {
      let css = REPORT_CSS;
      // 1. Replace html, body with .report-container to prevent global pollution but keep defaults
      css = css.replace(/html,\s*body/g, '.report-container');
      // 2. Remove !important from font-size and font-weight to allow user editing
      css = css.replace(/font-size:\s*[^;]+!important;/g, (match) => match.replace('!important', ''));
      css = css.replace(/font-weight:\s*[^;]+!important;/g, (match) => match.replace('!important', ''));
      return css;
  }, []);

  // --- Format Checking ---
  const checkFormats = useCallback(() => {
      if (!document || !editorRef.current) return;
      const sel = window.getSelection();
      let hasSelection = false;

      if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          if (editorRef.current.contains(range.commonAncestorContainer)) {
              savedRange.current = range.cloneRange();
              hasSelection = !sel.isCollapsed && sel.toString().trim().length > 0;
          }
      }
      const isBold = document.queryCommandState('bold');
      const isItalic = document.queryCommandState('italic');
      const isUnderline = document.queryCommandState('underline');
      const isUl = document.queryCommandState('insertUnorderedList');
      
      let align = 'right';
      if (document.queryCommandState('justifyLeft')) align = 'left';
      if (document.queryCommandState('justifyCenter')) align = 'center';
      if (document.queryCommandState('justifyRight')) align = 'right';
      if (document.queryCommandState('justifyFull')) align = 'justify';
      
      let blockType = 'p';
      let currentFontSize = '2';
      let colorHex = '#000000';

      if (sel && sel.anchorNode) {
          const element = (sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode) as HTMLElement;
          if (element) {
              const style = window.getComputedStyle(element);
              const blockEl = element.closest('h1, h2, h3, p, div, blockquote, li, td, th');
              if (blockEl) blockType = blockEl.tagName.toLowerCase();
              
              const fontSizePx = parseFloat(style.fontSize);
              if (!isNaN(fontSizePx)) {
                  // Align with sizeMap: 1:10px, 2:12px, 3:14px, 4:16px, 5:18px, 6:24px, 7:36px
                  if (fontSizePx <= 11) currentFontSize = '1';      // 10px
                  else if (fontSizePx <= 13) currentFontSize = '2'; // 12px
                  else if (fontSizePx <= 15) currentFontSize = '3'; // 14px
                  else if (fontSizePx <= 17) currentFontSize = '4'; // 16px
                  else if (fontSizePx <= 21) currentFontSize = '5'; // 18px (Default)
                  else if (fontSizePx <= 30) currentFontSize = '6'; // 24px
                  else currentFontSize = '7';                       // 36px
              }
              const color = style.color;
              if (color && color.startsWith('rgb')) {
                  const rgb = color.match(/\d+/g);
                  if (rgb) colorHex = '#' + ((1 << 24) + (parseInt(rgb[0]) << 16) + (parseInt(rgb[1]) << 8) + parseInt(rgb[2])).toString(16).slice(1);
              }
          }
      }
      setFormats({ bold: isBold, italic: isItalic, underline: isUnderline, align: align, blockType: blockType, fontSize: currentFontSize, list: isUl, color: colorHex, hasSelection });
  }, []);

  useEffect(() => {
      const handleSelectionChange = () => checkFormats();
      document.addEventListener('selectionchange', handleSelectionChange);
      return () => { document.removeEventListener('selectionchange', handleSelectionChange); };
  }, [checkFormats]);

  const handleEditorClick = (e: React.MouseEvent | React.TouchEvent) => {
      checkFormats(); 
      const target = e.target as HTMLElement;
      
      // Remove previous active class
      if (editorRef.current) {
          editorRef.current.querySelectorAll('.active-editing-element').forEach(el => el.classList.remove('active-editing-element'));
      }

      const box = target.closest('.editable-box') as HTMLElement;
      if (box) { 
          setActiveElement(box); 
          box.classList.add('active-editing-element');
          setShowBoxTools(true); setShowTableTools(false); setShowImageTools(false); setShowQuoteTools(false); e.stopPropagation(); return; 
      }
      
      const quote = target.closest('.editable-quote') as HTMLElement || target.closest('blockquote') as HTMLElement;
      if (quote) { 
          setActiveElement(quote); 
          quote.classList.add('active-editing-element');
          setShowQuoteTools(true); setShowBoxTools(false); setShowTableTools(false); setShowImageTools(false); e.stopPropagation(); return; 
      }
      
      setActiveElement(target); setShowBoxTools(false); setShowQuoteTools(false);
      
      if (target.tagName === 'IMG') { 
          setShowImageTools(true); setShowTableTools(false); 
          target.classList.add('active-editing-element');
      } 
      else if (target.closest('table')) { 
          const table = target.closest('table') as HTMLElement;
          table.classList.add('active-editing-element');
          setShowTableTools(true); 
          setShowImageTools(false); 
          const row = target.closest('tr');
          if (row) {
              const h = row.style.height || '30px';
              setCurrentRowHeight(h.replace('px', ''));
          }
      } 
      else { setShowTableTools(false); setShowImageTools(false); }
  };

  const handleKeyUp = () => { checkFormats(); };
  const handleInput = () => { checkFormats(); };
  
  const execCmd = (command: string, value: string = '') => { 
      if (!editorRef.current) return;
      const sel = window.getSelection();
      
      // Restore saved range if available
      if (savedRange.current && sel) {
          sel.removeAllRanges();
          sel.addRange(savedRange.current);
      } else if (!sel?.rangeCount) {
          editorRef.current.focus();
      }
      
      // Special handling for Font Size to apply to current block if no selection
      if (command === 'fontSize') {
          const sel = window.getSelection();
          if (sel && sel.rangeCount > 0) {
              const range = sel.getRangeAt(0);
              const hasSelection = !sel.isCollapsed && sel.toString().trim().length > 0;
              
              const sizeMap: any = {
                  '1': '10px', '2': '12px', '3': '14px', '4': '16px', '5': '18px', '6': '24px', '7': '36px'
              };
              const pixelSize = sizeMap[value] || '16px';

              if (!hasSelection) {
                  // Apply to current block element
                  let target = range.commonAncestorContainer as HTMLElement;
                  if (target.nodeType === 3) target = target.parentElement as HTMLElement;
                  
                  const blockEl = target.closest('p, div, h1, h2, h3, li, td, th, blockquote') as HTMLElement;
                  if (blockEl && editorRef.current.contains(blockEl)) {
                      blockEl.style.fontSize = pixelSize;
                      
                      // If it's a table cell, also ensure line-height is tight
                      if (blockEl.tagName === 'TD' || blockEl.tagName === 'TH') {
                          blockEl.style.lineHeight = '1.2';
                          // Also apply to any paragraphs inside to ensure immediate visual change
                          const innerPs = blockEl.querySelectorAll('p');
                          innerPs.forEach((p: any) => p.style.fontSize = pixelSize);
                      }
                      
                      checkFormats();
                      return;
                  }
              } else {
                  // If selection, use styleWithCSS to ensure inline styles are used
                  document.execCommand('styleWithCSS', false, 'true');
                  document.execCommand('fontSize', false, value);
                  
                  // Post-process selection to ensure it's applied correctly
                  // Find any <font> tags created and convert them to spans with inline styles
                  if (editorRef.current) {
                      const fonts = editorRef.current.querySelectorAll('font[size]');
                      fonts.forEach((f: any) => {
                          const size = f.getAttribute('size');
                          if (sizeMap[size]) {
                              f.style.fontSize = sizeMap[size];
                              f.removeAttribute('size');
                          }
                      });
                      
                      // Also check spans with font-size style that might need normalization
                      // (Optional, but good for consistency)
                  }
                  
                  document.execCommand('styleWithCSS', false, 'false');
                  checkFormats();
                  return;
              }
          }
      }

      // Special handling for alignment inside table cells
      if (['justifyRight', 'justifyCenter', 'justifyLeft', 'justifyFull'].includes(command)) {
          const sel = window.getSelection();
          if (sel && sel.rangeCount > 0) {
              const range = sel.getRangeAt(0);
              const container = range.commonAncestorContainer;
              const cell = (container.nodeType === 3 ? container.parentElement : container) as HTMLElement;
              const tableCell = cell.closest('td, th') as HTMLElement;
              
              if (tableCell) {
                  const alignMap: any = {
                      'justifyRight': 'right',
                      'justifyCenter': 'center',
                      'justifyLeft': 'left',
                      'justifyFull': 'justify'
                  };
                  tableCell.style.textAlign = alignMap[command];
                  
                  // Also apply to any block elements inside the cell to ensure immediate visual change
                  const blocks = tableCell.querySelectorAll('p, div, h1, h2, h3');
                  blocks.forEach((b: any) => b.style.textAlign = alignMap[command]);
                  
                  checkFormats();
                  return;
              }
          }
      }

      document.execCommand('styleWithCSS', false, 'true');
      document.execCommand(command, false, value); 
      document.execCommand('styleWithCSS', false, 'false'); 
      
      // Update saved range after command to keep selection active
      const newSel = window.getSelection();
      if (newSel && newSel.rangeCount > 0) {
          savedRange.current = newSel.getRangeAt(0).cloneRange();
      }
      
      checkFormats(); 
  };

  // --- SMART REFINE LOGIC ---
  const handleSmartRefineClick = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // Ensure we have selection
      if (!savedRange.current || !formats.hasSelection) {
          alert("الرجاء تحديد النص المراد تعديله أولاً.");
          return;
      }
      const text = savedRange.current.toString();
      setSelectedTextForRefine(text);
      setRefinePrompt('');
      setRefineModalOpen(true);
  };

  const confirmSmartRefine = async () => {
      if (!refinePrompt.trim()) return;
      setIsRefining(true);
      try {
          let newText = await aiHelper.refineSelectedText(selectedTextForRefine, refinePrompt);
          
          // Clean markdown wrappers
          newText = newText.replace(/^```html/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
          
          // Restore Selection to replace it
          if (savedRange.current) {
              const sel = window.getSelection();
              if (sel) {
                  sel.removeAllRanges();
                  sel.addRange(savedRange.current);
                  // Execute Insert HTML to replace selection
                  document.execCommand('insertHTML', false, newText);
                  setRefineModalOpen(false);
              }
          }
      } catch (e) {
          alert("حدث خطأ أثناء المعالجة.");
      } finally {
          setIsRefining(false);
      }
  };

  const handleBlockChange = (type: string) => {
      execCmd('formatBlock', type);
      if (type === 'h1') { execCmd('fontSize', '5'); if (!document.queryCommandState('bold')) execCmd('bold'); execCmd('foreColor', '#000000'); } 
      else if (type === 'h2') { execCmd('fontSize', '4'); if (!document.queryCommandState('bold')) execCmd('bold'); execCmd('foreColor', '#000000'); }
      else if (type === 'h3') { execCmd('fontSize', '3'); if (!document.queryCommandState('bold')) execCmd('bold'); execCmd('foreColor', '#000000'); }
      else if (type === 'p') { execCmd('fontSize', '2'); if (document.queryCommandState('bold')) execCmd('bold'); execCmd('foreColor', '#000000'); }
  };
  
  // Helpers (Keep existing helpers: unwrapElement, insertTextBox, etc.)
  const unwrapElement = (element: HTMLElement) => { if (!element || !element.parentNode) return; const parent = element.parentNode; while (element.firstChild) parent.insertBefore(element.firstChild, element); parent.removeChild(element); editorRef.current?.focus(); };
  const insertTextBox = () => { 
      const boxId = `box-${Date.now()}`; 
      const html = `<div class="box-row" style="display: flex; gap: 8px; width: 100%; margin: 5px 0; align-items: stretch; box-sizing: border-box;"><div id="${boxId}" class="editable-box info-box active-editing-element" style="flex: 1; min-width: 0; border: 1px solid #cbd5e1; padding: 4px 10px; background-color: #f8fafc; min-height: 30px; box-sizing: border-box; word-break: break-word; overflow-wrap: break-word; font-size: 14px; border-radius: 8px;"><p>&nbsp;</p></div></div><p><br></p>`; 
      execCmd('insertHTML', html); 
      setTimeout(() => {
          const el = document.getElementById(boxId);
          if (el) {
              setActiveElement(el);
              setShowBoxTools(true);
          }
      }, 50);
  };
  const updateTextBoxStyle = (style: 'bg' | 'border' | 'borderColor' | 'reset' | 'shadow' | 'rounded' | 'glass' | 'gradient', value: string) => { 
      if (!activeElement) return; 
      const target = activeElement.classList.contains('editable-box') ? activeElement : activeElement.closest('.editable-box') as HTMLElement; 
      if (!target) return; 
      
      // Clear special classes first
      target.classList.remove('info-box', 'success-box', 'warning-box', 'cost-box', 'highlight-box', 'glass-box', 'gradient-blue-box');

      if (style === 'bg') { 
          target.style.backgroundColor = value; 
      } else if (style === 'border') { 
          target.style.borderWidth = value; 
          if (value === '0px') { 
              target.style.borderStyle = 'none'; 
          } else { 
              target.style.borderStyle = 'solid'; 
              if (!target.style.borderColor) target.style.borderColor = '#cbd5e1'; 
          } 
      } else if (style === 'borderColor') { 
          target.style.borderColor = value; 
          target.style.borderStyle = 'solid'; 
          if (!target.style.borderWidth || target.style.borderWidth === '0px') { 
              target.style.borderWidth = '1px'; 
          } 
      } else if (style === 'shadow') {
          target.style.boxShadow = value === 'none' ? 'none' : '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)';
      } else if (style === 'rounded') {
          target.style.borderRadius = value;
      } else if (style === 'glass') {
          target.classList.add('glass-box');
      } else if (style === 'gradient') {
          target.classList.add('gradient-blue-box');
      } else if (style === 'reset') { 
          target.style.backgroundColor = 'transparent'; 
          target.style.borderWidth = '1px'; 
          target.style.borderStyle = 'solid'; 
          target.style.borderColor = '#cbd5e1'; 
          target.style.boxShadow = 'none';
          target.style.borderRadius = '8px';
      } 
  };
  const addSiblingBox = (position: 'left' | 'right' | 'top' | 'bottom') => { if (!activeElement) return; const currentBox = activeElement.classList.contains('editable-box') ? activeElement : activeElement.closest('.editable-box') as HTMLElement; if (!currentBox) return; const currentRow = currentBox.closest('.box-row') as HTMLElement; if (!currentRow) return; const newBox = document.createElement('div'); newBox.className = 'editable-box'; newBox.style.cssText = currentBox.style.cssText; newBox.style.flex = '1'; newBox.style.minWidth = '0'; newBox.style.wordBreak = 'break-word'; newBox.style.overflowWrap = 'break-word'; newBox.innerHTML = ''; newBox.id = `box-${Date.now()}`; if (position === 'top' || position === 'bottom') { const newRow = document.createElement('div'); newRow.className = 'box-row'; newRow.style.cssText = "display: flex; gap: 8px; width: 100%; margin: 1px 0; align-items: stretch; box-sizing: border-box;"; newRow.appendChild(newBox); if (position === 'top') { currentRow.before(newRow); } else { currentRow.after(newRow); } } else { if (position === 'right') { currentBox.after(newBox); } else { currentBox.before(newBox); } } };
  const deleteTextBox = () => { if (!activeElement) return; const target = activeElement.classList.contains('editable-box') ? activeElement : activeElement.closest('.editable-box') as HTMLElement; if (!target) return; const row = target.closest('.box-row'); target.remove(); if (row && row.children.length === 0) { row.remove(); } setShowBoxTools(false); setActiveElement(null); };
  const unwrapTextBox = () => { if (!activeElement) return; const target = activeElement.classList.contains('editable-box') ? activeElement : activeElement.closest('.editable-box') as HTMLElement; if (!target) return; const row = target.closest('.box-row'); unwrapElement(target); if (row && row.children.length === 0) row.remove(); else if (row) unwrapElement(row as HTMLElement); setShowBoxTools(false); };
  const insertQuote = () => { const html = `<div class="editable-quote" style="border-right: 4px solid #0d9488; background: #f0fdfa; padding: 4px 12px; margin: 8px 0; color: #115e59; font-style: italic; border-radius: 4px; display: block; width: 100%; box-sizing: border-box; font-size: 14px;">اكتب الاقتباس هنا...</div><p><br></p>`; execCmd('insertHTML', html); };
  const updateQuoteStyle = (colorTheme: 'teal' | 'blue' | 'red' | 'orange') => { if (!activeElement) return; const themeMap = { teal: { border: '#0d9488', bg: '#f0fdfa', text: '#115e59' }, blue: { border: '#2563eb', bg: '#eff6ff', text: '#1e40af' }, red: { border: '#dc2626', bg: '#fef2f2', text: '#991b1b' }, orange: { border: '#f97316', bg: '#fff7ed', text: '#9a3412' } }; const theme = themeMap[colorTheme]; activeElement.style.borderRight = `4px solid ${theme.border}`; activeElement.style.backgroundColor = theme.bg; activeElement.style.color = theme.text; };
  const deleteQuote = () => { if (activeElement) unwrapElement(activeElement); setShowQuoteTools(false); };
  const triggerBoxImageUpload = () => boxImageInputRef.current?.click();
  const handleBoxImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file && activeElement && activeElement.classList.contains('editable-box')) { const reader = new FileReader(); reader.onload = (event) => { if (event.target?.result) { const img = document.createElement('img'); img.src = event.target.result as string; img.style.maxWidth = '100%'; img.style.height = 'auto'; img.style.display = 'block'; img.style.margin = '5px auto'; activeElement.appendChild(img); } }; reader.readAsDataURL(file); } if (boxImageInputRef.current) boxImageInputRef.current.value = ''; };
  const startRecording = async () => { try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); const mediaRecorder = new MediaRecorder(stream); mediaRecorderRef.current = mediaRecorder; audioChunksRef.current = []; mediaRecorder.ondataavailable = (event) => { if (event.data.size > 0) audioChunksRef.current.push(event.data); }; mediaRecorder.onstop = async () => { const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/mp3' }); setIsProcessingVoice(true); try { const text = await aiHelper.transcribeAndRefineLetterText(audioBlob); if (text) { execCmd('insertHTML', text); } } catch (error) { alert("تعذر تحويل الصوت إلى نص."); } finally { setIsProcessingVoice(false); } stream.getTracks().forEach(track => track.stop()); }; mediaRecorder.start(); setIsRecording(true); } catch (err) { alert("لا يمكن الوصول للميكروفون."); } };
  const stopRecording = () => { if (mediaRecorderRef.current && isRecording) { mediaRecorderRef.current.stop(); setIsRecording(false); } };
  const triggerImageUpload = () => imageInputRef.current?.click();
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file) { const reader = new FileReader(); reader.onload = (event) => { if (event.target?.result) { execCmd('insertImage', event.target.result as string); } }; reader.readAsDataURL(file); } };
  const handleImageResize = (widthPercent: string) => { if (activeElement && activeElement.tagName === 'IMG') { activeElement.style.width = widthPercent; activeElement.style.height = 'auto'; } };
  const handleImageAlign = (align: string) => { if (activeElement && activeElement.tagName === 'IMG') { activeElement.style.display = 'block'; if (align === 'center') { activeElement.style.marginLeft = 'auto'; activeElement.style.marginRight = 'auto'; } else if (align === 'right') { activeElement.style.marginLeft = 'auto'; activeElement.style.marginRight = '0'; } else { activeElement.style.marginLeft = '0'; activeElement.style.marginRight = 'auto'; } } };
  const deleteImage = () => { if (activeElement && activeElement.tagName === 'IMG') { activeElement.remove(); setActiveElement(null); setShowImageTools(false); } };
  const deleteTable = () => { if (!activeElement) return; const table = activeElement.closest('table'); if (table) { table.remove(); setShowTableTools(false); setActiveElement(null); } };
  const modifyTable = (action: string) => { if (!activeElement) return; const cell = activeElement.closest('td') || activeElement.closest('th'); if (!cell) return; const row = cell.closest('tr') as HTMLTableRowElement; const table = row.closest('table') as HTMLTableElement; if (!table || !row) return; if (action === 'addRow') { const newRow = table.insertRow(row.rowIndex + 1); for (let i = 0; i < row.cells.length; i++) { const newCell = newRow.insertCell(i); const refCell = row.cells[i]; newCell.style.cssText = refCell.style.cssText; newCell.innerHTML = '&nbsp;'; } } else if (action === 'delRow') { if (table.rows.length > 1) { table.deleteRow(row.rowIndex); } else { activeElement.closest('table')?.remove(); setShowTableTools(false); } } else if (action === 'addCol') { const cellIndex = (cell as HTMLTableCellElement).cellIndex; for (let i = 0; i < table.rows.length; i++) { const row = table.rows[i]; const newCell = row.insertCell(cellIndex + 1); const refCell = row.cells[cellIndex]; newCell.style.cssText = refCell.style.cssText; newCell.innerHTML = '&nbsp;'; } } else if (action === 'delCol') { const cellIndex = (cell as HTMLTableCellElement).cellIndex; for (let i = 0; i < table.rows.length; i++) { if (table.rows[i].cells.length > 1) { table.rows[i].deleteCell(cellIndex); } } } };
  const applyTableTheme = (theme: 'professional' | 'striped' | 'simple' | 'elegant' | 'modern' | 'dark' | 'minimal') => { 
      if (!activeElement) return; 
      const table = activeElement.closest('table'); 
      if (!table) return; 
      
      table.style.width = '100%'; 
      table.style.borderCollapse = 'collapse'; 
      table.style.fontFamily = 'inherit'; 
      table.style.margin = '10px 0';
      
      const rows = table.rows; 
      for (let i = 0; i < rows.length; i++) { 
          const row = rows[i]; 
          const isHeader = i === 0; 
          // Reset row styles
          row.style.backgroundColor = 'transparent'; 
          row.style.color = 'inherit';
          row.style.fontWeight = 'inherit';
          
          for (let j = 0; j < row.cells.length; j++) { 
              const cell = row.cells[j]; 
              // Reset cell styles
              cell.style.backgroundColor = 'transparent';
              cell.style.color = 'inherit';
              cell.style.fontWeight = 'normal';
              cell.style.border = 'none';
              cell.style.padding = '6px 10px'; 
              cell.style.textAlign = cell.style.textAlign || 'center'; 
              cell.style.fontSize = cell.style.fontSize || '14px';
              
              if (theme === 'professional') { 
                  cell.style.border = '1px solid #cbd5e1'; 
                  if (isHeader) { 
                      cell.style.backgroundColor = '#1e3a8a'; 
                      cell.style.color = 'white'; 
                      cell.style.fontWeight = 'bold'; 
                  } else { 
                      cell.style.backgroundColor = i % 2 === 0 ? '#f8fafc' : 'white'; 
                      cell.style.color = '#1e293b'; 
                  } 
              } else if (theme === 'striped') { 
                  cell.style.border = 'none'; 
                  cell.style.borderBottom = '1px solid #e2e8f0'; 
                  if (isHeader) { 
                      cell.style.backgroundColor = '#334155'; 
                      cell.style.color = 'white'; 
                      cell.style.fontWeight = 'bold'; 
                  } else { 
                      cell.style.backgroundColor = i % 2 === 0 ? '#f1f5f9' : 'white'; 
                      cell.style.color = '#334155'; 
                  } 
              } else if (theme === 'simple') { 
                  cell.style.border = '1px solid #e2e8f0'; 
                  cell.style.backgroundColor = 'white'; 
                  cell.style.color = '#475569'; 
                  if (isHeader) { 
                      cell.style.fontWeight = 'bold'; 
                      cell.style.backgroundColor = '#f8fafc'; 
                  } 
              } else if (theme === 'elegant') {
                  cell.style.border = 'none';
                  cell.style.borderBottom = '2px solid #1e3a8a';
                  cell.style.padding = '8px';
                  if (isHeader) {
                      cell.style.backgroundColor = 'white';
                      cell.style.color = '#1e3a8a';
                      cell.style.fontWeight = 'bold';
                      cell.style.borderBottom = '3px solid #1e3a8a';
                  } else {
                      cell.style.backgroundColor = 'white';
                      cell.style.color = '#334155';
                  }
              } else if (theme === 'modern') {
                  cell.style.border = '1px solid #e2e8f0';
                  if (isHeader) {
                      cell.style.backgroundColor = '#0f172a';
                      cell.style.color = 'white';
                      cell.style.fontWeight = 'bold';
                  } else {
                      cell.style.backgroundColor = '#ffffff';
                      cell.style.color = '#334155';
                  }
              } else if (theme === 'dark') {
                  cell.style.border = '1px solid #475569';
                  cell.style.backgroundColor = isHeader ? '#0f172a' : '#1e293b';
                  cell.style.color = 'white';
                  if (isHeader) cell.style.fontWeight = 'bold';
              } else if (theme === 'minimal') {
                  cell.style.border = 'none';
                  cell.style.borderBottom = '1px solid #cbd5e1';
                  cell.style.backgroundColor = 'white';
                  cell.style.color = '#334155';
                  if (isHeader) {
                      cell.style.fontWeight = 'bold';
                      cell.style.color = '#000000';
                  }
              }
          } 
      } 
  };
  const insertTable = () => { 
      const tableId = `table-${Date.now()}`;
      // Simpler HTML structure that is easier to theme
      const html = `
        <table id="${tableId}" class="editable-table active-editing-element" style="width:100%; border-collapse: collapse; margin: 10px 0; font-size: 14px;">
          <thead>
            <tr>
              <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">&nbsp;</th>
              <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">&nbsp;</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">&nbsp;</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">&nbsp;</td>
            </tr>
          </tbody>
        </table>
        <p><br></p>
      `; 
      execCmd('insertHTML', html); 
      setTimeout(() => {
          const el = document.getElementById(tableId);
          if (el) {
              const firstCell = el.querySelector('td, th') as HTMLElement;
              setActiveElement(firstCell || el);
              setShowTableTools(true);
              // Apply default theme immediately to ensure it's fully modifiable
              applyTableTheme('professional');
          }
      }, 50);
  };
  const updateTableRowHeight = (height: string) => {
      if (!activeElement) return;
      const cell = activeElement.closest('td, th') as HTMLElement;
      const row = cell?.closest('tr') as HTMLElement;
      if (row) {
          const numericHeight = parseFloat(height);
          if (!isNaN(numericHeight)) {
              row.style.height = `${numericHeight}px`;
              // Force cells to respect the height
              const cells = row.querySelectorAll('td, th');
              cells.forEach((c: any) => {
                  c.style.height = `${numericHeight}px`;
                  c.style.lineHeight = '1.1';
                  c.style.paddingTop = '1px';
                  c.style.paddingBottom = '1px';
                  // Also check for inner paragraphs
                  const innerPs = c.querySelectorAll('p');
                  innerPs.forEach((p: any) => {
                      p.style.margin = '0';
                      p.style.padding = '0';
                  });
              });
              setCurrentRowHeight(height);
          }
      }
  };
  const updateSpacing = (type: 'lineHeight' | 'marginBottom', value: string) => { if (!activeElement || !editorRef.current) return; let target = activeElement; while (target && target !== editorRef.current && !['P','DIV','H1','H2','H3','BLOCKQUOTE','LI','TD'].includes(target.tagName)) { target = target.parentElement as HTMLElement; } if (target && target !== editorRef.current) { if (type === 'lineHeight') { target.style.lineHeight = value; } else if (type === 'marginBottom') { target.style.marginBottom = value; } } else { execCmd('formatBlock', 'div'); } };

  // Parse Content: Separate Body from Full Report if possible
  const parseAndLoadContent = (rawContent: string) => {
      if (!editorRef.current) return;
      try {
          const parser = new DOMParser();
          const doc = parser.parseFromString(rawContent, 'text/html');
          
          // --- RESTORE SETTINGS IF EXIST ---
          const settingsEl = doc.getElementById('saved-page-settings');
          if (settingsEl && settingsEl.dataset.config) {
              try {
                  const savedConfig = JSON.parse(decodeURIComponent(settingsEl.dataset.config));
                  setShowHeader(savedConfig.showHeader ?? true);
                  setShowTitle(savedConfig.showTitle ?? true);
                  setShowSubtitle(savedConfig.showSubtitle ?? true);
                  setShowDate(savedConfig.showDate ?? true);
                  setShowRef(savedConfig.showRef ?? true);
                  setShowFooter(savedConfig.showFooter ?? true);
                  if (savedConfig.printPageMargin !== undefined) setPrintPageMargin(savedConfig.printPageMargin);
                  if (savedConfig.marginConfig) setMarginConfig(savedConfig.marginConfig);
              } catch(e) { console.warn("Failed to parse settings", e); }
          }

          const reportBody = doc.querySelector('.report-body');
          if (reportBody) {
              editorRef.current.innerHTML = reportBody.innerHTML;
              
              // Fallback to inline style parsing if config block is missing
              if (!settingsEl) {
                  const style = reportBody.getAttribute('style');
                  if (style && style.includes('padding:')) {
                      const match = style.match(/padding:\s*([\w.]+cm|[\w.]+px)\s+([\w.]+cm|[\w.]+px)/);
                      if (match && match.length >= 3) {
                          setMarginConfig({ y: match[1], x: match[2] });
                      }
                  }
              }
          } else {
              const bodyContent = doc.body.innerHTML;
              editorRef.current.innerHTML = bodyContent.trim() ? bodyContent : rawContent;
          }

          // Extract Metadata if available
          const reportTitleEl = doc.querySelector('.report-header-title h1');
          if (reportTitleEl) setReportTitle(reportTitleEl.textContent || "الموضوع: .......................................");

          const subtitleEl = doc.querySelector('.report-header-subtitle');
          if (subtitleEl) setHeaderSubtitle(subtitleEl.textContent || "");

          const footerEl = doc.querySelector('.report-footer');
          if (footerEl) setFooterText(footerEl.textContent?.trim() || "");

          const metaDivs = doc.querySelectorAll('.report-header-meta div');
          if (metaDivs.length >= 2) {
              const dateStrong = metaDivs[0].querySelector('strong');
              const refStrong = metaDivs[1].querySelector('strong');
              
              if (dateStrong) setDateLabel(dateStrong.textContent?.trim() || 'التاريخ:');
              if (refStrong) setRefLabel(refStrong.textContent?.trim() || 'المرجع:');
          }

      } catch (e) { editorRef.current.innerHTML = rawContent; }
      setTimeout(calculateSize, 100);
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
        if (fileId && folderId) {
            setIsLoadingContent(true);
            try {
                const meta = await api.getFileMetadata(fileId);
                if (active && meta) setFilename(meta.name.replace('.html', ''));
            } catch(e) {}
            let content = '';
            try { content = await api.getFileContent(fileId); } catch(e) {}
            if (active) {
                if (content) parseAndLoadContent(content);
                else if (editorRef.current && !editorRef.current.innerHTML) editorRef.current.innerHTML = DEFAULT_BODY_CONTENT;
                setIsLoadingContent(false);
            }
        } else if (location.state && location.state.initialContent) {
            parseAndLoadContent(location.state.initialContent);
            setFilename(location.state.filename || "تقرير_استشاري_مسودة");
        } else {
            if (editorRef.current) editorRef.current.innerHTML = DEFAULT_BODY_CONTENT;
        }
    };
    load();
    return () => { active = false; };
  }, [fileId, folderId, location.state]);

  const handleDraftUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      setIsAnalyzingDraft(true);
      try {
          const content = await aiHelper.analyzeDraftToLetter(file);
          if (editorRef.current) {
              editorRef.current.innerHTML = content;
              // Also try to extract a title if possible
              const parser = new DOMParser();
              const doc = parser.parseFromString(content, 'text/html');
              const h1 = doc.querySelector('h1');
              if (h1) setReportTitle(h1.innerText);
              
              // Set default margins to 0.5cm from all sides
              setMarginConfig({ x: '0.5cm', y: '0.5cm' });
              setPrintPageMargin(0.5);
          }
      } catch (err) {
          alert("فشل تحليل المسودة.");
      } finally {
          setIsAnalyzingDraft(false);
          if (draftInputRef.current) draftInputRef.current.value = '';
      }
  };

  const handleSave = async () => {
    if (!folderId || !editorRef.current) return;
    setIsSaving(true);
    
    const bodyContent = editorRef.current.innerHTML;
    
    // Pass flags to build report
    const fullReport = ReportGenerator.buildReport(reportTitle, bodyContent, { 
        ref: metaRef, 
        date: metaDate,
        subtitle: headerSubtitle,
        footerText: footerText,
        margins: marginConfig,
        labels: { date: dateLabel, ref: refLabel },
        // Flags
        showHeader, showTitle, showSubtitle, showDate, showRef, showFooter
    });

    // Create Settings Block (Hidden DIV) to persist visibility/config state
    const currentSettings = {
        showHeader, showTitle, showSubtitle, showDate, showRef, showFooter,
        printPageMargin, marginConfig
    };
    const settingsHTML = `<div id="saved-page-settings" data-config="${encodeURIComponent(JSON.stringify(currentSettings))}" style="display:none;"></div>`;
    
    // Inject settings into the body of the generated HTML (before closing body)
    const finalContent = fullReport.replace('</body>', `${settingsHTML}</body>`);

    try {
        const result = await api.saveLetter(folderId, filename, finalContent, fileId || undefined);
        
        // NEW: Update Project Card if this was generated from one
        const cardId = location.state?.cardId;
        const cardType = location.state?.cardType;
        if (cardId && cardType && projectId) {
            try {
                const project = await api.getProjectById(projectId);
                if (project) {
                    let updated = false;
                    const cardMap: any = {
                        rfi: 'rfis',
                        submittal: 'submittals',
                        correspondence: 'correspondence',
                        checklist: 'checklists',
                        ncr: 'ncrs'
                    };
                    const key = cardMap[cardType];
                    if (key && project[key]) {
                        project[key] = project[key].map((item: any) => 
                            item.id === cardId ? { ...item, htmlContent: finalContent } : item
                        );
                        updated = true;
                    }
                    if (updated) {
                        await api.updateProjectMasterData(projectId, project);
                    }
                }
            } catch (cardErr) {
                console.warn("Failed to update project card", cardErr);
            }
        }

        alert("تم حفظ المستند بنجاح.");
        if (!fileId && result.id) { navigate(`/editor/${projectId}/${folderId}?fileId=${result.id}`, { replace: true }); }
    } catch (e) { alert("حدث خطأ أثناء الحفظ."); } finally { setIsSaving(false); }
  };

  const handlePrint = () => { 
      if (!editorRef.current) return; 
      printService.printReport(editorRef.current.innerHTML, reportTitle, metaRef, { 
          subtitle: headerSubtitle, 
          footerText: footerText,
          margins: marginConfig, 
          pageMargin: printPageMargin, 
          labels: { date: dateLabel, ref: refLabel },
          // Pass flags to print service (which uses ReportGenerator internally in many cases)
          showHeader, showTitle, showSubtitle, showDate, showRef, showFooter
      }); 
  };
  const handleBack = () => { 
      if (location.state?.returnToMasterData) {
          navigate(`/project/${projectId}/${folderId}`, { state: { returnToMasterData: true }, replace: true });
      } else if (folderId && projectId) { 
          navigate(`/project/${projectId}/${folderId}`, { replace: true }); 
      } else { 
          navigate(-1); 
      } 
  };

  // Visual Wrapper Styles (A4 Paper)
  const wrapperStyle: React.CSSProperties = isMobileZoom
    ? { width: '100%', maxWidth: 'none', minHeight: '60vh', margin: '0', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }
    : { width: `${visualWidth}px`, height: `${visualHeight}px`, margin: '0 auto', position: 'relative', transition: 'width 0.2s, height 0.2s' };

  // The "Paper" Container style
  const paperStyle: React.CSSProperties = isMobileZoom
    ? { width: '100%', flex: 1, backgroundColor: 'white', boxShadow: 'none', borderRadius: '0', outline: 'none', direction: 'rtl', fontFamily: "'Cairo', sans-serif", display: 'flex', flexDirection: 'column', overflow: 'hidden' }
    : { width: `${A4_WIDTH_PX}px`, minHeight: '1123px', backgroundColor: 'white', boxShadow: '0 10px 40px -5px rgba(0, 0, 0, 0.15)', position: 'absolute', top: 0, left: 0, transform: `scale(${scale})`, transformOrigin: 'top left', outline: 'none', direction: 'rtl', fontFamily: "'Cairo', sans-serif", display: 'flex', flexDirection: 'column', overflow: 'hidden' };

  return (
    <div className="h-[100dvh] w-full bg-slate-50 flex flex-col font-sans fixed inset-0 overflow-hidden">
       {/* Inject Unified Styles */}
       <style>{sanitizedCSS}</style>
        <style>{`
            #letter-content-area ul { list-style-type: disc !important; margin-right: 2rem !important; padding-right: 1rem !important; }
            #letter-content-area ol { list-style-type: decimal !important; margin-right: 2rem !important; padding-right: 1rem !important; }
            #letter-content-area li { margin-bottom: 0.25rem; }
            #letter-content-area p { margin-bottom: 6px; }
            .editable-box:hover, .editable-quote:hover, 
            .highlight-box.editable-box:hover, .success-box.editable-box:hover, .warning-box.editable-box:hover { 
                outline: 2px dashed #3b82f6; 
                cursor: text; 
            }
            .active-editing-element {
                outline: 2px solid #3b82f6 !important;
                outline-offset: 2px;
                box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1);
            }
            .box-row { display: flex; gap: 5px; margin: 1px 0; width: 100%; }
            #letter-content-area { cursor: text; outline: none; }
            .hide-scrollbar::-webkit-scrollbar { display: none; }
            .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            
            /* Print Preview Specifics */
            .report-header, .report-footer { user-select: none; pointer-events: none; }
            
            /* Hidden Elements for Editing */
            .hidden-element { display: none !important; }
       `}</style>

       <div className="bg-slate-900 border-b border-slate-700 px-4 py-3 flex justify-between items-center shadow-md shrink-0 z-50 no-print text-white overflow-x-auto hide-scrollbar">
            <div className="flex items-center gap-3 shrink-0">
                 <button onClick={handleBack} className="text-slate-400 hover:text-white transition"><i className="fa-solid fa-arrow-right rtl:rotate-180"></i></button>
                 <div className="flex flex-col">
                    <span className="text-[10px] text-slate-400">اسم الملف</span>
                    <input type="text" value={filename} onChange={(e) => setFilename(e.target.value)} className="font-bold text-white text-sm bg-transparent outline-none border-b border-transparent hover:border-slate-500 focus:border-blue-500 w-32 sm:w-48" />
                 </div>
            </div>
            <div className="flex gap-2 items-center shrink-0">
                
                {/* Settings Button */}
                <button 
                    onClick={() => setIsSettingsOpen(true)}
                    className="bg-slate-800 text-slate-300 px-3 py-2 rounded-lg hover:bg-slate-700 hover:text-white transition flex items-center gap-2 border border-slate-700"
                    title="إعدادات الصفحة (الهيدر والفوتر)"
                >
                    <i className="fa-solid fa-gear"></i> <span className="hidden sm:inline text-xs font-bold">إعدادات الصفحة</span>
                </button>

                <button onClick={handleSave} disabled={isSaving || isLoadingContent} className="bg-blue-600 text-white px-3 sm:px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-500 shadow-lg flex items-center gap-2 transition disabled:opacity-50">
                    {isSaving ? <i className="fa-solid fa-circle-notch fa-spin"></i> : <i className="fa-solid fa-save"></i>} <span className="hidden sm:inline">حفظ</span>
                </button>
                <button onClick={handlePrint} disabled={isLoadingContent} className="bg-slate-700 text-white px-3 py-2 rounded-lg hover:bg-slate-600 transition font-bold flex items-center gap-2 disabled:opacity-50" title="طباعة PDF احترافي">
                    <i className="fa-solid fa-print"></i> <span className="hidden sm:inline">طباعة</span>
                </button>
            </div>
        </div>

        {/* SETTINGS MODAL */}
        {isSettingsOpen && (
            <div className="fixed inset-0 z-[2000] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in no-print">
                <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[90vh] animate-scale-in border border-slate-200 overflow-hidden">
                    <div className="bg-slate-100 p-4 border-b border-slate-200 flex justify-between items-center">
                        <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2"><i className="fa-solid fa-gear text-blue-600"></i> إعدادات الصفحة</h3>
                        <button onClick={() => setIsSettingsOpen(false)} className="w-8 h-8 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-500 transition"><i className="fa-solid fa-times"></i></button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-6 bg-white space-y-6">
                        {/* Settings content same as before */}
                        {/* Section 1: Header Titles */}
                        <div className="space-y-4">
                            <h4 className="font-bold text-sm text-slate-500 border-b pb-1">رأس الصفحة (Header)</h4>
                            
                            <div className="flex items-center gap-3 mb-2 p-2 bg-blue-50 rounded-lg border border-blue-100">
                                <input type="checkbox" checked={showHeader} onChange={(e) => setShowHeader(e.target.checked)} className="w-5 h-5 accent-blue-600" />
                                <label className="text-sm font-bold text-blue-900 cursor-pointer flex-1" onClick={() => setShowHeader(!showHeader)}>
                                    إظهار رأس الصفحة (للطباعة على ورق أبيض)
                                </label>
                            </div>

                            <div className={`space-y-4 transition-opacity ${!showHeader ? 'opacity-50 pointer-events-none' : ''}`}>
                                <div className="flex items-center gap-3">
                                    <input type="checkbox" checked={showTitle} onChange={(e) => setShowTitle(e.target.checked)} className="w-5 h-5 accent-blue-600" disabled={!showHeader} />
                                    <div className="flex-1">
                                        <label className="block text-xs font-bold text-slate-700 mb-1">العنوان الرئيسي</label>
                                        <input type="text" value={reportTitle} onChange={(e) => setReportTitle(e.target.value)} className="w-full p-2 border rounded-lg text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500" disabled={!showTitle || !showHeader} />
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <input type="checkbox" checked={showSubtitle} onChange={(e) => setShowSubtitle(e.target.checked)} className="w-5 h-5 accent-blue-600" disabled={!showHeader} />
                                    <div className="flex-1">
                                        <label className="block text-xs font-bold text-slate-700 mb-1">العنوان الفرعي</label>
                                        <input type="text" value={headerSubtitle} onChange={(e) => setHeaderSubtitle(e.target.value)} className="w-full p-2 border rounded-lg text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500" disabled={!showSubtitle || !showHeader} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Section 2: Meta Data (Date/Ref) */}
                        <div className={`space-y-4 transition-opacity ${!showHeader ? 'opacity-50 pointer-events-none' : ''}`}>
                            <h4 className="font-bold text-sm text-slate-500 border-b pb-1">البيانات (يمين/يسار)</h4>
                            <div className="flex items-center gap-3">
                                <input type="checkbox" checked={showDate} onChange={(e) => setShowDate(e.target.checked)} className="w-5 h-5 accent-blue-600" disabled={!showHeader} />
                                <div className="flex-1 grid grid-cols-2 gap-2">
                                    <input type="text" value={dateLabel} onChange={(e) => setDateLabel(e.target.value)} className="w-full p-2 border rounded-lg text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500" disabled={!showDate || !showHeader} />
                                    <input type="text" value={metaDate} onChange={(e) => setMetaDate(e.target.value)} className="w-full p-2 border rounded-lg text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500 ltr" disabled={!showDate || !showHeader} />
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <input type="checkbox" checked={showRef} onChange={(e) => setShowRef(e.target.checked)} className="w-5 h-5 accent-blue-600" disabled={!showHeader} />
                                <div className="flex-1 grid grid-cols-2 gap-2">
                                    <input type="text" value={refLabel} onChange={(e) => setRefLabel(e.target.value)} className="w-full p-2 border rounded-lg text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500" disabled={!showRef || !showHeader} />
                                    <input type="text" value={metaRef} onChange={(e) => setMetaRef(e.target.value)} className="w-full p-2 border rounded-lg text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500 ltr" disabled={!showRef || !showHeader} />
                                </div>
                            </div>
                        </div>

                        {/* Section 3: Footer */}
                        <div className="space-y-4">
                            <h4 className="font-bold text-sm text-slate-500 border-b pb-1">تذييل الصفحة (الفوتر)</h4>
                            <div className="flex items-center gap-3">
                                <input type="checkbox" checked={showFooter} onChange={(e) => setShowFooter(e.target.checked)} className="w-5 h-5 accent-blue-600" />
                                <div className="flex-1">
                                    <textarea value={footerText} onChange={(e) => setFooterText(e.target.value)} className="w-full p-2 border rounded-lg text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500 h-20 resize-none" disabled={!showFooter}></textarea>
                                </div>
                            </div>
                        </div>

                        {/* Section 4: Print Margins */}
                        <div className="space-y-4">
                            <h4 className="font-bold text-sm text-slate-500 border-b pb-1">تخطيط الطباعة</h4>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-2">هامش الصفحة الكلي (عند الطباعة)</label>
                                <select value={printPageMargin} onChange={(e) => setPrintPageMargin(parseFloat(e.target.value))} className="w-full p-2 border rounded-lg text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500">
                                    <option value="0">0 سم</option>
                                    <option value="0.5">0.5 سم (افتراضي)</option>
                                    <option value="1">1 سم</option>
                                    <option value="1.5">1.5 سم</option>
                                    <option value="2">2 سم</option>
                                    <option value="2.5">2.5 سم</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
                        <button onClick={() => setIsSettingsOpen(false)} className="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-blue-700 transition">إغلاق وتطبيق</button>
                    </div>
                </div>
            </div>
        )}

        {/* 3. Simplified Toolbar - Focusing on Block Format */}
        <div className="sticky top-0 bg-white border-b border-slate-200 p-1 flex flex-nowrap gap-1 no-print items-center shadow-sm shrink-0 overflow-x-auto hide-scrollbar z-40 backdrop-blur-sm bg-white/95 w-full">
             <div className="flex items-center gap-1 p-0.5 bg-slate-50 rounded-md border border-slate-200 shrink-0">
                <select 
                    value={formats.blockType} 
                    onChange={(e) => handleBlockChange(e.target.value)} 
                    className="h-7 bg-transparent text-xs font-bold text-slate-800 outline-none w-32 cursor-pointer border-none"
                    onMouseDown={(e) => { if(savedRange.current) {} }}
                >
                    <option value="p">نص (13px)</option>
                    <option value="h1">عنوان 1 (24px)</option>
                    <option value="h2">عنوان 2 (18px)</option>
                    <option value="h3">عنوان 3 (16px)</option>
                </select>
                <div className="w-[1px] h-3 bg-slate-300"></div>
                <select 
                    value={formats.fontSize} 
                    onChange={(e) => execCmd('fontSize', e.target.value)} 
                    className="h-7 bg-transparent text-xs font-bold text-slate-800 outline-none w-12 cursor-pointer border-none text-center"
                >
                    <option value="1">10</option>
                    <option value="2">12</option>
                    <option value="3">14</option>
                    <option value="4">16</option>
                    <option value="5">18</option>
                    <option value="6">24</option>
                    <option value="7">36</option>
                </select>
            </div>

            {/* AI REFINE BUTTON (Only enabled when text is selected) */}
            <div className="flex items-center gap-1 shrink-0">
                <button 
                    onMouseDown={handleSmartRefineClick} 
                    disabled={!formats.hasSelection}
                    className={`h-7 px-2 flex items-center gap-1.5 rounded-md border transition font-bold text-[10px] whitespace-nowrap ${formats.hasSelection ? 'bg-indigo-600 text-white border-indigo-700 shadow-md hover:bg-indigo-700 cursor-pointer animate-pulse' : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'}`}
                    title="تعديل النص المحدد بالذكاء الاصطناعي"
                >
                    <i className="fa-solid fa-wand-magic-sparkles"></i> تنقيح ذكي
                </button>

                <button 
                    onMouseDown={(e) => { e.preventDefault(); draftInputRef.current?.click(); }} 
                    disabled={isAnalyzingDraft}
                    className={`h-7 px-2 flex items-center gap-1.5 rounded-md border transition font-bold text-[10px] whitespace-nowrap bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 cursor-pointer shadow-sm`}
                    title="رفع مسودة (صورة/PDF) لتحويلها لخطاب رسمي"
                >
                    {isAnalyzingDraft ? <i className="fa-solid fa-circle-notch fa-spin"></i> : <i className="fa-solid fa-file-arrow-up"></i>}
                    تحويل مسودة
                </button>
                <input type="file" ref={draftInputRef} onChange={handleDraftUpload} accept="image/*,application/pdf" className="hidden" />
            </div>

            <div className="flex gap-0.5 p-0.5 bg-slate-50 rounded-md border border-slate-200 text-slate-600 items-center shrink-0">
                <button onMouseDown={(e) => {e.preventDefault(); execCmd('undo')}} className="w-8 h-8 rounded flex items-center justify-center transition hover:bg-white hover:shadow-sm" title="تراجع"><i className="fa-solid fa-rotate-left text-[11px]"></i></button>
                <button onMouseDown={(e) => {e.preventDefault(); execCmd('redo')}} className="w-8 h-8 rounded flex items-center justify-center transition hover:bg-white hover:shadow-sm" title="إعادة"><i className="fa-solid fa-rotate-right text-[11px]"></i></button>
                <div className="w-[1px] h-3 bg-slate-300 mx-0.5"></div>
                <button onMouseDown={(e) => {e.preventDefault(); execCmd('removeFormat')}} className="w-8 h-8 rounded flex items-center justify-center transition hover:bg-white hover:shadow-sm text-red-500" title="مسح التنسيق"><i className="fa-solid fa-eraser text-[11px]"></i></button>
                <div className="w-[1px] h-3 bg-slate-300 mx-0.5"></div>
                <button onMouseDown={(e) => {e.preventDefault(); execCmd('bold')}} className={`w-8 h-8 rounded flex items-center justify-center font-bold transition hover:shadow-sm ${formats.bold ? 'bg-blue-100 text-blue-600' : 'hover:bg-white'}`} title="غامق"><i className="fa-solid fa-bold text-[11px]"></i></button>
                <button onMouseDown={(e) => {e.preventDefault(); execCmd('italic')}} className={`w-8 h-8 rounded flex items-center justify-center italic transition hover:shadow-sm ${formats.italic ? 'bg-blue-100 text-blue-600' : 'hover:bg-white'}`} title="مائل"><i className="fa-solid fa-italic text-[11px]"></i></button>
                <button onMouseDown={(e) => {e.preventDefault(); execCmd('underline')}} className={`w-8 h-8 rounded flex items-center justify-center underline transition hover:shadow-sm ${formats.underline ? 'bg-blue-100 text-blue-600' : 'hover:bg-white'}`} title="تسطير"><i className="fa-solid fa-underline text-[11px]"></i></button>
                <div className="w-[1px] h-3 bg-slate-300 mx-0.5"></div>
                <div className="relative group">
                    <button onMouseDown={(e) => { e.preventDefault(); textColorInputRef.current?.click(); }} className="w-8 h-8 hover:bg-white rounded flex items-center justify-center transition hover:shadow-sm" title="لون النص"><i className="fa-solid fa-font text-[11px] text-red-500 border-b-2 border-red-500 pb-[1px]"></i></button>
                    <input type="color" ref={textColorInputRef} onChange={(e) => execCmd('foreColor', e.target.value)} className="absolute opacity-0 w-0 h-0 overflow-hidden" />
                </div>
            </div>

            <div className="flex gap-0.5 p-0.5 bg-slate-50 rounded-md border border-slate-200 text-slate-600 shrink-0">
                <button onMouseDown={(e) => {e.preventDefault(); execCmd('justifyRight')}} className={`w-8 h-8 rounded flex items-center justify-center transition hover:shadow-sm ${formats.align === 'right' ? 'bg-blue-100 text-blue-600' : 'hover:bg-white'}`} title="محاذاة يمين"><i className="fa-solid fa-align-right text-[11px]"></i></button>
                <button onMouseDown={(e) => {e.preventDefault(); execCmd('justifyCenter')}} className={`w-8 h-8 rounded flex items-center justify-center transition hover:shadow-sm ${formats.align === 'center' ? 'bg-blue-100 text-blue-600' : 'hover:bg-white'}`} title="توسط"><i className="fa-solid fa-align-center text-[11px]"></i></button>
                <button onMouseDown={(e) => {e.preventDefault(); execCmd('justifyLeft')}} className={`w-8 h-8 rounded flex items-center justify-center transition hover:shadow-sm ${formats.align === 'left' ? 'bg-blue-100 text-blue-600' : 'hover:bg-white'}`} title="محاذاة يسار"><i className="fa-solid fa-align-left text-[11px]"></i></button>
                <div className="w-[1px] h-3 bg-slate-300 my-auto mx-0.5"></div>
                
                <button onMouseDown={(e) => {e.preventDefault(); setShowSpacingTools(!showSpacingTools); setShowTableTools(false); setShowImageTools(false); setShowBoxTools(false); setShowQuoteTools(false); setShowMarginTools(false);}} className={`w-8 h-8 rounded flex items-center justify-center transition hover:shadow-sm ${showSpacingTools ? 'bg-blue-100 text-blue-600' : 'hover:bg-white text-slate-600'}`} title="تباعد الأسطر والفقرات"><i className="fa-solid fa-text-height text-[11px]"></i></button>
                
                <button onMouseDown={(e) => {e.preventDefault(); setShowMarginTools(!showMarginTools); setShowSpacingTools(false); setShowTableTools(false); setShowImageTools(false); setShowBoxTools(false); setShowQuoteTools(false);}} className={`w-8 h-8 rounded flex items-center justify-center transition hover:shadow-sm ${showMarginTools ? 'bg-blue-100 text-blue-600' : 'hover:bg-white text-slate-600'}`} title="هوامش النص الداخلية"><i className="fa-solid fa-expand text-[11px]"></i></button>

                <button onMouseDown={(e) => {e.preventDefault(); setIsMobileZoom(!isMobileZoom);}} className={`w-8 h-8 rounded flex items-center justify-center transition hover:shadow-sm ${isMobileZoom ? 'bg-blue-600 text-white shadow-md' : 'hover:bg-white text-slate-600'}`} title={isMobileZoom ? "العودة لتخطيط الطباعة (A4)" : "وضع التحرير السهل (تعبئة الشاشة)"}>
                    <i className={`fa-solid ${isMobileZoom ? 'fa-book-open' : 'fa-mobile-screen-button'} text-[11px]`}></i>
                </button>
                
                <button onMouseDown={(e) => {e.preventDefault(); execCmd('insertUnorderedList')}} className={`w-8 h-8 rounded flex items-center justify-center transition hover:shadow-sm ${formats.list ? 'bg-blue-100 text-blue-600' : 'hover:bg-white'}`} title="قائمة نقطية"><i className="fa-solid fa-list-ul text-[11px]"></i></button>
                <button onMouseDown={(e) => {e.preventDefault(); insertQuote()}} className="w-8 h-8 hover:bg-white hover:text-teal-600 rounded flex items-center justify-center transition hover:shadow-sm" title="اقتباس"><i className="fa-solid fa-quote-right text-[11px]"></i></button>
            </div>

            <div className="flex gap-1.5 items-center shrink-0">
                <button onMouseDown={(e) => { e.preventDefault(); if (isProcessingVoice) return; isRecording ? stopRecording() : startRecording(); }} className={`flex items-center gap-1.5 px-2 py-1 border rounded-md text-[10px] font-bold transition shadow-sm h-7 whitespace-nowrap ${isRecording ? 'bg-red-50 border-red-200 text-red-600 animate-pulse' : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'}`} title="تحويل الصوت إلى نص">{isProcessingVoice ? <i className="fa-solid fa-circle-notch fa-spin"></i> : <i className={`fa-solid ${isRecording ? 'fa-stop' : 'fa-microphone'}`}></i>}<span className="hidden sm:inline">{isRecording ? 'إيقاف' : 'إملاء'}</span></button>
                <button onMouseDown={(e) => {e.preventDefault(); insertTable()}} className="flex items-center gap-1.5 px-2 py-1 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-md text-[10px] font-bold text-indigo-700 transition shadow-sm h-7 whitespace-nowrap"><i className="fa-solid fa-table"></i> <span className="hidden sm:inline">جدول</span></button>
                <button onMouseDown={(e) => {e.preventDefault(); insertTextBox()}} className="flex items-center gap-1.5 px-2 py-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md text-[10px] font-bold text-emerald-700 transition shadow-sm h-7 whitespace-nowrap"><i className="fa-regular fa-square-plus"></i> <span className="hidden sm:inline">مربع</span></button>
                <button onMouseDown={(e) => {e.preventDefault(); triggerImageUpload()}} className="flex items-center gap-1.5 px-2 py-1 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-md text-[10px] font-bold text-slate-700 transition shadow-sm h-7 whitespace-nowrap"><i className="fa-regular fa-image"></i> <span className="hidden sm:inline">صورة</span></button>
                <input type="file" ref={imageInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
            </div>
        </div>

        {/* ... Context Tools ... */}
        {(showTableTools || showImageTools || showBoxTools || showQuoteTools || showSpacingTools || showMarginTools) && (
             <div className="bg-yellow-50 border-b border-yellow-200 p-1.5 flex gap-2 overflow-x-auto hide-scrollbar no-print items-center animate-fade-in text-[10px] text-slate-900 z-30 relative w-full shrink-0 whitespace-nowrap shadow-inner">
                {/* MARGIN TOOLS (Inner Content Padding) */}
                {showMarginTools && (
                    <>
                        <span className="font-bold text-slate-800 ml-1 hidden sm:inline">الهوامش الداخلية:</span>
                        
                        {/* Side Margins (X) */}
                        <div className="flex gap-2 items-center border-l border-yellow-300 pl-2 ml-1 shrink-0">
                            <span className="text-[9px] text-slate-500 hidden sm:inline">جوانب (يمين/يسار):</span>
                            <select 
                                value={marginConfig.x} 
                                onChange={(e) => setMarginConfig(prev => ({...prev, x: e.target.value}))}
                                className="bg-white border border-yellow-300 text-slate-800 text-[10px] rounded h-6 px-1 outline-none font-bold"
                            >
                                {MARGIN_OPTIONS.map(opt => (
                                    <option key={`x-${opt.value}`} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>
                        
                        <div className="w-[1px] h-3 bg-yellow-300 mx-0.5"></div>
                        
                        {/* Vertical Margins (Y) */}
                        <div className="flex gap-2 items-center shrink-0">
                            <span className="text-[9px] text-slate-500 hidden sm:inline">رأسي (أعلى/أسفل):</span>
                            <select 
                                value={marginConfig.y} 
                                onChange={(e) => setMarginConfig(prev => ({...prev, y: e.target.value}))}
                                className="bg-white border border-yellow-300 text-slate-800 text-[10px] rounded h-6 px-1 outline-none font-bold"
                            >
                                {MARGIN_OPTIONS.map(opt => (
                                    <option key={`y-${opt.value}`} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>
                    </>
                )}

                {showSpacingTools && (<><span className="font-bold text-slate-800 ml-1 hidden sm:inline">التباعد:</span><div className="flex gap-1 items-center border-l border-yellow-300 pl-1 ml-1 shrink-0"><span className="text-[9px] text-slate-500 hidden sm:inline">ارتفاع السطر:</span><button onMouseDown={(e) => {e.preventDefault(); updateSpacing('lineHeight', '1.0')}} className="px-1.5 py-0.5 rounded bg-white border hover:bg-slate-50">1.0</button><button onMouseDown={(e) => {e.preventDefault(); updateSpacing('lineHeight', '1.5')}} className="px-1.5 py-0.5 rounded bg-white border hover:bg-slate-50">1.5</button><button onMouseDown={(e) => {e.preventDefault(); updateSpacing('lineHeight', '2.0')}} className="px-1.5 py-0.5 rounded bg-white border hover:bg-slate-50">2.0</button></div><div className="w-[1px] h-3 bg-yellow-300 mx-0.5"></div><div className="flex gap-1 items-center shrink-0"><span className="text-[9px] text-slate-500 hidden sm:inline">مسافة الفقرة:</span><button onMouseDown={(e) => {e.preventDefault(); updateSpacing('marginBottom', '5px')}} className="px-1.5 py-0.5 rounded bg-white border hover:bg-slate-50">ضيق</button><button onMouseDown={(e) => {e.preventDefault(); updateSpacing('marginBottom', '15px')}} className="px-1.5 py-0.5 rounded bg-white border hover:bg-slate-50">وسط</button><button onMouseDown={(e) => {e.preventDefault(); updateSpacing('marginBottom', '30px')}} className="px-1.5 py-0.5 rounded bg-white border hover:bg-slate-50">واسع</button></div></>)}
                {showTableTools && (
                    <>
                        <span className="font-bold text-yellow-800 ml-1 hidden sm:inline">الجدول:</span>
                        
                        {/* Mobile Theme Selector */}
                        <div className="flex gap-1 items-center border-l border-yellow-300 pl-1 ml-1 shrink-0 sm:hidden">
                            <select 
                                onChange={(e) => { if(e.target.value) applyTableTheme(e.target.value as any); }}
                                className="h-7 bg-white border border-yellow-300 text-[10px] rounded px-1 font-bold outline-none"
                            >
                                <option value="">النمط...</option>
                                <option value="professional">احترافي</option>
                                <option value="striped">مخطط</option>
                                <option value="elegant">أنيق</option>
                                <option value="dark">داكن</option>
                                <option value="minimal">بسيط</option>
                            </select>
                        </div>

                        {/* Desktop Theme Buttons */}
                        <div className="hidden sm:flex gap-1 items-center border-l border-yellow-300 pl-1 ml-1 shrink-0">
                            <button onClick={() => applyTableTheme('professional')} className="px-1.5 py-0.5 rounded bg-blue-900 text-white border border-blue-950 shadow-sm" title="احترافي أزرق">أزرق</button>
                            <button onClick={() => applyTableTheme('striped')} className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-800 border border-slate-300 shadow-sm" title="مخطط رمادي">مخطط</button>
                            <button onClick={() => applyTableTheme('elegant')} className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-sm" title="أنيق">أنيق</button>
                            <button onClick={() => applyTableTheme('dark')} className="px-1.5 py-0.5 rounded bg-slate-900 text-white border border-slate-950 shadow-sm" title="داكن">داكن</button>
                            <button onClick={() => applyTableTheme('minimal')} className="px-1.5 py-0.5 rounded bg-white text-slate-600 border border-slate-300 shadow-sm" title="بسيط">بسيط</button>
                        </div>

                        <div className="w-[1px] h-3 bg-yellow-300 mx-0.5"></div>
                        
                        {/* Cell Alignment */}
                        <div className="flex gap-1 items-center shrink-0">
                            <button onClick={() => execCmd('justifyRight')} className="w-6 h-6 bg-white border border-yellow-300 rounded flex items-center justify-center hover:bg-yellow-100" title="محاذاة يمين"><i className="fa-solid fa-align-right text-[10px]"></i></button>
                            <button onClick={() => execCmd('justifyCenter')} className="w-6 h-6 bg-white border border-yellow-300 rounded flex items-center justify-center hover:bg-yellow-100" title="توسط"><i className="fa-solid fa-align-center text-[10px]"></i></button>
                            <button onClick={() => execCmd('justifyLeft')} className="w-6 h-6 bg-white border border-yellow-300 rounded flex items-center justify-center hover:bg-yellow-100" title="محاذاة يسار"><i className="fa-solid fa-align-left text-[10px]"></i></button>
                        </div>

                        <div className="w-[1px] h-3 bg-yellow-300 mx-0.5"></div>
                        <div className="flex gap-1 items-center shrink-0">
                            <span className="text-[9px] text-slate-500 hidden sm:inline">ارتفاع الصف (px):</span>
                            <input 
                                type="number" 
                                step="1"
                                value={currentRowHeight}
                                onChange={(e) => updateTableRowHeight(e.target.value)}
                                className="w-12 h-6 bg-white border border-yellow-300 rounded text-[10px] px-1 font-bold outline-none focus:ring-1 focus:ring-yellow-500"
                            />
                        </div>
                        <div className="w-[1px] h-3 bg-yellow-300 mx-0.5"></div>
                        <div className="flex gap-1 items-center shrink-0">
                            <span className="text-[9px] text-slate-500 hidden sm:inline">هوامش:</span>
                            <button onMouseDown={(e) => { e.preventDefault(); if(activeElement) { const cell = activeElement.closest('td, th') as HTMLElement; if(cell) cell.style.padding = '1px 4px'; } }} className="px-1 py-0.5 bg-white border border-yellow-300 rounded text-[8px] hover:bg-yellow-50" title="هوامش ضيقة">ضيق</button>
                            <button onMouseDown={(e) => { e.preventDefault(); if(activeElement) { const cell = activeElement.closest('td, th') as HTMLElement; if(cell) cell.style.padding = '8px 12px'; } }} className="px-1 py-0.5 bg-white border border-yellow-300 rounded text-[8px] hover:bg-yellow-50" title="هوامش واسعة">واسع</button>
                        </div>
                        <div className="w-[1px] h-3 bg-yellow-300 mx-0.5"></div>
                        <div className="flex gap-1 items-center shrink-0">
                            <span className="text-[9px] text-slate-500 hidden sm:inline">لون الخلية:</span>
                            <button onMouseDown={(e) => { e.preventDefault(); if(activeElement) { const cell = activeElement.closest('td, th') as HTMLElement; if(cell) cell.style.backgroundColor = '#ffffff'; } }} className="w-4 h-4 border border-slate-300 bg-white rounded" title="أبيض"></button>
                            <button onMouseDown={(e) => { e.preventDefault(); if(activeElement) { const cell = activeElement.closest('td, th') as HTMLElement; if(cell) cell.style.backgroundColor = '#f1f5f9'; } }} className="w-4 h-4 border border-slate-300 bg-slate-100 rounded" title="رمادي"></button>
                            <button onMouseDown={(e) => { e.preventDefault(); if(activeElement) { const cell = activeElement.closest('td, th') as HTMLElement; if(cell) cell.style.backgroundColor = '#dbeafe'; } }} className="w-4 h-4 border border-blue-300 bg-blue-100 rounded" title="أزرق"></button>
                            <button onMouseDown={(e) => { e.preventDefault(); if(activeElement) { const cell = activeElement.closest('td, th') as HTMLElement; if(cell) cell.style.backgroundColor = '#dcfce7'; } }} className="w-4 h-4 border border-green-300 bg-green-100 rounded" title="أخضر"></button>
                        </div>
                        <div className="w-[1px] h-3 bg-yellow-300 mx-0.5"></div>
                        <button onClick={() => modifyTable('addRow')} className="px-2 py-0.5 bg-white border border-yellow-400 rounded hover:bg-yellow-200 font-bold text-green-700 shadow-sm flex items-center gap-1"><i className="fa-solid fa-plus"></i> <span className="hidden sm:inline">صف</span></button>
                        <button onClick={() => modifyTable('delRow')} className="px-2 py-0.5 bg-white border border-red-300 rounded hover:bg-red-50 text-red-700 font-bold shadow-sm flex items-center gap-1"><i className="fa-solid fa-minus"></i> <span className="hidden sm:inline">صف</span></button>
                        <div className="w-[1px] h-3 bg-yellow-300 mx-0.5"></div>
                        <button onClick={() => modifyTable('addCol')} className="px-2 py-0.5 bg-white border border-yellow-400 rounded hover:bg-yellow-200 font-bold text-green-700 shadow-sm flex items-center gap-1"><i className="fa-solid fa-plus"></i> <span className="hidden sm:inline">عمود</span></button>
                        <button onClick={() => modifyTable('delCol')} className="px-2 py-0.5 bg-white border border-red-300 rounded hover:bg-red-50 text-red-700 font-bold shadow-sm flex items-center gap-1"><i className="fa-solid fa-minus"></i> <span className="hidden sm:inline">عمود</span></button>
                        <div className="w-[1px] h-3 bg-yellow-300 mx-0.5"></div>
                        <button onClick={deleteTable} className="px-2 py-0.5 bg-red-600 text-white border border-red-700 rounded hover:bg-red-700 font-bold shadow-sm flex items-center gap-1"><i className="fa-solid fa-trash"></i> <span className="hidden sm:inline">حذف</span></button>
                    </>
                )}
                {showImageTools && (<><span className="font-bold text-indigo-800 ml-1 hidden sm:inline">الصورة:</span><div className="flex gap-1 shrink-0"><button onClick={() => handleImageAlign('right')} className="w-6 h-6 hover:bg-indigo-100 rounded flex items-center justify-center border border-indigo-200 bg-white" title="يمين"><i className="fa-solid fa-align-right"></i></button><button onClick={() => handleImageAlign('center')} className="w-6 h-6 hover:bg-indigo-100 rounded flex items-center justify-center border border-indigo-200 bg-white" title="وسط"><i className="fa-solid fa-align-center"></i></button><button onClick={() => handleImageAlign('left')} className="w-6 h-6 hover:bg-indigo-100 rounded flex items-center justify-center border border-indigo-200 bg-white" title="يسار"><i className="fa-solid fa-align-left"></i></button></div><div className="w-[1px] h-3 bg-indigo-300 mx-0.5"></div><div className="flex gap-1 font-mono font-bold shrink-0"><button onClick={() => handleImageResize('25%')} className="px-1 py-0.5 bg-white border rounded hover:bg-indigo-50">25%</button><button onClick={() => handleImageResize('50%')} className="px-1 py-0.5 bg-white border rounded hover:bg-indigo-50">50%</button><button onClick={() => handleImageResize('75%')} className="px-1 py-0.5 bg-white border rounded hover:bg-indigo-50">75%</button><button onClick={() => handleImageResize('100%')} className="px-1 py-0.5 bg-white border rounded hover:bg-indigo-50">100%</button></div><div className="w-[1px] h-3 bg-indigo-300 mx-0.5"></div><button onClick={deleteImage} className="px-2 py-0.5 bg-red-100 text-red-600 rounded hover:bg-red-200 border border-red-200 font-bold flex items-center gap-1" title="حذف الصورة"><i className="fa-solid fa-trash"></i> <span className="hidden sm:inline">حذف</span></button></>)}
                {showBoxTools && (
                    <>
                        <span className="font-bold text-slate-800 ml-1 hidden sm:inline">المربع:</span>
                        <div className="flex gap-1 border-l border-slate-300 pl-1 ml-1 items-center bg-white/50 p-0.5 rounded-lg shrink-0">
                            <span className="text-[9px] text-slate-500 font-bold hidden sm:inline">خلفية:</span>
                            <button onMouseDown={(e) => { e.preventDefault(); updateTextBoxStyle('bg', '#ffffff'); }} className="w-4 h-4 border border-slate-200 bg-white rounded hover:scale-110 transition" title="أبيض"></button>
                            <button onMouseDown={(e) => { e.preventDefault(); updateTextBoxStyle('bg', '#f1f5f9'); }} className="w-4 h-4 border border-slate-300 bg-slate-100 rounded hover:scale-110 transition" title="رمادي فاتح"></button>
                            <button onMouseDown={(e) => { e.preventDefault(); updateTextBoxStyle('bg', '#bfdbfe'); }} className="w-4 h-4 border border-blue-300 bg-blue-200 rounded hover:scale-110 transition" title="أزرق"></button>
                            <button onMouseDown={(e) => { e.preventDefault(); updateTextBoxStyle('bg', '#bbf7d0'); }} className="w-4 h-4 border border-green-300 bg-green-200 rounded hover:scale-110 transition" title="أخضر"></button>
                            <button onMouseDown={(e) => { e.preventDefault(); updateTextBoxStyle('bg', '#fecaca'); }} className="w-4 h-4 border border-red-300 bg-red-200 rounded hover:scale-110 transition" title="أحمر فاتح"></button>
                            <div className="w-[1px] h-3 bg-slate-300 mx-0.5"></div>
                            <button onMouseDown={(e) => { e.preventDefault(); updateTextBoxStyle('glass', ''); }} className="px-1.5 py-0.5 bg-white/50 border border-slate-300 rounded text-[8px] font-bold" title="زجاجي">زجاج</button>
                            <button onMouseDown={(e) => { e.preventDefault(); updateTextBoxStyle('gradient', ''); }} className="px-1.5 py-0.5 bg-gradient-to-l from-blue-100 to-blue-200 border border-blue-300 rounded text-[8px] font-bold" title="تدرج">تدرج</button>
                            <div className="w-[1px] h-3 bg-slate-300 mx-0.5"></div>
                            <button onMouseDown={(e) => { e.preventDefault(); colorInputRef.current?.click(); }} className="w-4 h-4 border border-slate-300 bg-gradient-to-br from-red-400 via-green-400 to-blue-400 rounded hover:scale-110 transition flex items-center justify-center"><i className="fa-solid fa-palette text-[6px] text-white drop-shadow-md"></i></button>
                            <input type="color" ref={colorInputRef} className="hidden" onChange={(e) => updateTextBoxStyle('bg', e.target.value)} />
                            <div className="w-[1px] h-3 bg-slate-300 mx-0.5"></div>
                            <button onMouseDown={(e) => { e.preventDefault(); updateTextBoxStyle('reset', ''); }} className="text-[9px] text-red-500 px-1 border border-red-200 bg-white rounded hover:bg-red-50" title="إزالة اللون (شفاف)">X</button>
                        </div>
                        <div className="flex gap-1 border-l border-slate-300 pl-1 ml-1 items-center shrink-0">
                            <span className="text-[9px] text-slate-500 font-bold hidden sm:inline">إطار:</span>
                            <button onMouseDown={(e) => { e.preventDefault(); updateTextBoxStyle('border', '0px'); }} className="px-1.5 py-0.5 bg-white border border-dashed rounded text-[9px] text-slate-400 hover:text-slate-600">بدون</button>
                            <button onMouseDown={(e) => { e.preventDefault(); updateTextBoxStyle('border', '1px'); }} className="px-1.5 py-0.5 bg-white border rounded text-[9px] hover:bg-slate-50">رفيع</button>
                            <button onMouseDown={(e) => { e.preventDefault(); updateTextBoxStyle('border', '4px'); }} className="px-1.5 py-0.5 bg-white border rounded text-[9px] font-bold border-black hover:bg-slate-50">سميك</button>
                            <div className="w-[1px] h-3 bg-slate-300 mx-0.5"></div>
                            <button onMouseDown={(e) => { e.preventDefault(); updateTextBoxStyle('shadow', 'true'); }} className="px-1.5 py-0.5 bg-white border rounded text-[9px] hover:bg-slate-50 shadow-sm" title="إضافة ظل">ظل</button>
                            <button onMouseDown={(e) => { e.preventDefault(); updateTextBoxStyle('rounded', '24px'); }} className="px-1.5 py-0.5 bg-white border rounded text-[9px] hover:bg-slate-50" title="حواف دائرية">دائري</button>
                        </div>
                        <div className="flex gap-1 border-l border-slate-300 pl-1 ml-1 items-center shrink-0">
                            <span className="text-[9px] text-slate-500 font-bold hidden sm:inline">إضافة:</span>
                            <button onMouseDown={(e) => { e.preventDefault(); addSiblingBox('right'); }} className="px-2 py-0.5 bg-white border rounded hover:bg-blue-50 text-blue-600" title="مربع يمين"><i className="fa-solid fa-arrow-right"></i></button>
                            <button onMouseDown={(e) => { e.preventDefault(); addSiblingBox('left'); }} className="px-2 py-0.5 bg-white border rounded hover:bg-blue-50 text-blue-600" title="مربع يسار"><i className="fa-solid fa-arrow-left"></i></button>
                            <div className="w-[1px] h-3 bg-slate-300 mx-0.5"></div>
                            <button onMouseDown={(e) => { e.preventDefault(); addSiblingBox('top'); }} className="px-2 py-0.5 bg-white border rounded hover:bg-slate-50 text-slate-600" title="صف جديد أعلى"><i className="fa-solid fa-arrow-up"></i></button>
                            <button onMouseDown={(e) => { e.preventDefault(); addSiblingBox('bottom'); }} className="px-2 py-0.5 bg-white border rounded hover:bg-slate-50 text-slate-600" title="صف جديد أسفل"><i className="fa-solid fa-arrow-down"></i></button>
                        </div>
                        <div className="flex gap-1 border-l border-slate-300 pl-1 ml-1 shrink-0">
                            <button onMouseDown={(e) => { e.preventDefault(); triggerBoxImageUpload(); }} className="px-1.5 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded flex items-center gap-1 hover:bg-indigo-100"><i className="fa-regular fa-image"></i> <span className="hidden sm:inline">صورة</span></button>
                            <input type="file" ref={boxImageInputRef} onChange={handleBoxImageUpload} accept="image/*" className="hidden" />
                        </div>
                        <div className="flex gap-1 border-l border-slate-300 pl-1 ml-1 shrink-0">
                            <button onMouseDown={(e) => { e.preventDefault(); unwrapTextBox(); }} className="px-2 py-0.5 bg-orange-50 border border-orange-200 text-orange-600 rounded hover:bg-orange-100 font-bold flex items-center gap-1" title="إلغاء المربع مع الحفاظ على النص"><i className="fa-solid fa-box-open"></i> تفريغ</button>
                            <button onMouseDown={(e) => { e.preventDefault(); deleteTextBox(); }} className="px-2 py-0.5 bg-red-50 border border-red-200 text-red-600 rounded hover:bg-red-100 font-bold"><i className="fa-solid fa-trash"></i> <span className="hidden sm:inline">حذف</span></button>
                        </div>
                    </>
                )}
                {showQuoteTools && (<><span className="font-bold text-teal-800 ml-1 hidden sm:inline">الاقتباس:</span><div className="flex gap-1 border-l border-teal-300 pl-1 ml-1 items-center bg-white/50 p-0.5 rounded-lg shrink-0"><span className="text-[9px] text-teal-600 font-bold hidden sm:inline">لون:</span><button onClick={() => updateQuoteStyle('teal')} className="w-4 h-4 bg-teal-100 border border-teal-500 rounded hover:scale-110 transition"></button><button onClick={() => updateQuoteStyle('blue')} className="w-4 h-4 bg-blue-100 border border-blue-500 rounded hover:scale-110 transition"></button><button onClick={() => updateQuoteStyle('red')} className="w-4 h-4 bg-red-100 border border-red-500 rounded hover:scale-110 transition"></button><button onClick={() => updateQuoteStyle('orange')} className="w-4 h-4 bg-orange-100 border border-orange-500 rounded hover:scale-110 transition"></button></div><div className="w-[1px] h-3 bg-teal-300 mx-0.5"></div><button onClick={deleteQuote} className="px-2 py-0.5 bg-orange-50 border border-orange-200 text-orange-600 rounded hover:bg-orange-100 font-bold flex items-center gap-1" title="إلغاء الاقتباس مع الحفاظ على النص"><i className="fa-solid fa-eraser"></i> إلغاء الاقتباس</button></>)}
             </div>
        )}

        {/* Mobile Quick Tools - Floating at bottom */}
        {(showTableTools || showBoxTools || showQuoteTools || showImageTools) && (
            <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex gap-2 bg-white/90 backdrop-blur-md p-2 rounded-2xl shadow-2xl border border-slate-200 sm:hidden animate-bounce-subtle">
                {showTableTools && (
                    <>
                        <button onClick={() => modifyTable('addRow')} className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center shadow-lg" title="إضافة صف"><i className="fa-solid fa-plus"></i></button>
                        <button onClick={() => modifyTable('addCol')} className="w-10 h-10 bg-blue-500 text-white rounded-full flex items-center justify-center shadow-lg" title="إضافة عمود"><i className="fa-solid fa-columns"></i></button>
                    </>
                )}
                {showBoxTools && (
                    <>
                        <button onClick={() => addSiblingBox('bottom')} className="w-10 h-10 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-lg" title="إضافة مربع"><i className="fa-solid fa-plus"></i></button>
                    </>
                )}
                <button onMouseDown={(e) => {e.preventDefault(); window.scrollTo({top: 0, behavior: 'smooth'})}} className="w-10 h-10 bg-slate-800 text-white rounded-full flex items-center justify-center shadow-lg" title="الأدوات العلوية"><i className="fa-solid fa-chevron-up"></i></button>
            </div>
        )}

        <div 
            className={`flex-1 bg-slate-50 ${isMobileZoom ? 'pt-0' : 'pt-2'} pb-12 relative w-full ${isMobileZoom ? '' : 'flex justify-center'}`} 
            style={{ overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}
            ref={containerRef} 
            onClick={() => {setShowTableTools(false); setShowImageTools(false); setShowBoxTools(false); setShowSpacingTools(false); setShowQuoteTools(false); setShowMarginTools(false);}}
        >
             {isLoadingContent && (
                 <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm">
                     <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                     <p className="text-slate-600 font-bold text-sm">جاري تحميل المستند...</p>
                 </div>
             )}
             
             <div id="paper-container" className="shadow-2xl relative transition-all duration-300 origin-top-center" style={wrapperStyle}>
                <div 
                    style={{
                        ...paperStyle,
                        // Override padding in Mobile Zoom Mode to minimal
                        padding: undefined 
                    }} 
                    className="report-container"
                >
                     {/* 1. Visual Header (Matches Print Preview) */}
                     <div className={`report-header ${!showHeader ? 'hidden-element' : (!showTitle && !showSubtitle && !showDate && !showRef ? 'hidden-element' : '')}`}>
                        <div className="report-header-title">
                            {showTitle && <h1 contentEditable suppressContentEditableWarning onInput={(e) => setReportTitle(e.currentTarget.innerText)} dir="auto">{reportTitle}</h1>}
                            {showSubtitle && <p className="report-header-subtitle" contentEditable suppressContentEditableWarning onInput={(e) => setHeaderSubtitle(e.currentTarget.innerText)} dir="auto">{headerSubtitle}</p>}
                        </div>
                        <div className="report-header-meta">
                            {(showDate || showRef) && (
                                <>
                                    {showDate && (
                                        <div>
                                            <span contentEditable suppressContentEditableWarning onInput={(e) => setDateLabel(e.currentTarget.innerText)}>{dateLabel}</span>
                                            <span contentEditable suppressContentEditableWarning onInput={(e) => setMetaDate(e.currentTarget.innerText)}>{metaDate}</span>
                                        </div>
                                    )}
                                    {showRef && (
                                        <div>
                                            <span contentEditable suppressContentEditableWarning onInput={(e) => setRefLabel(e.currentTarget.innerText)}>{refLabel}</span>
                                            <span contentEditable suppressContentEditableWarning onInput={(e) => setMetaRef(e.currentTarget.innerText)}>{metaRef}</span>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                     </div>

                     {/* 2. Editable Body (Applied Dynamic Margins via Padding) */}
                     <div 
                        ref={editorRef} 
                        id="letter-content-area" 
                        className={`report-body w-full outline-none text-slate-900 leading-relaxed text-base ${!isMobileZoom ? 'visual-page-break' : ''}`} 
                        contentEditable={!isLoadingContent} 
                        // Fix: Apply user margins even in Mobile Zoom mode so they can adjust them freely
                        style={{ padding: `${marginConfig.y} ${marginConfig.x}`, transition: 'padding 0.3s ease' }}
                        onClick={(e) => { e.stopPropagation(); handleEditorClick(e); }} 
                        onTouchEnd={checkFormats} 
                        onKeyUp={handleKeyUp}
                        onInput={handleInput}
                        onMouseUp={checkFormats}
                     ></div>

                     {/* 3. Visual Footer (Matches Print Preview) */}
                     <div 
                        className={`report-footer ${!showFooter ? 'hidden-element' : ''}`}
                        contentEditable={true}
                        suppressContentEditableWarning={true}
                        onInput={(e) => setFooterText(e.currentTarget.innerText)}
                        dir="auto"
                     >
                        {footerText}
                     </div>
                </div>
             </div>
        </div>

        {/* SMART REFINE MODAL */}
        {refineModalOpen && (
            <div className="fixed inset-0 z-[3000] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in no-print">
                <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-5 animate-scale-in border border-slate-200">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2"><i className="fa-solid fa-wand-magic-sparkles text-indigo-600"></i> تنقيح ذكي بالذكاء الاصطناعي</h3>
                        <button onClick={() => setRefineModalOpen(false)} className="text-slate-400 hover:text-slate-600"><i className="fa-solid fa-times"></i></button>
                    </div>
                    
                    <div className="mb-4">
                        <label className="block text-xs font-bold text-slate-500 mb-2">النص المحدد:</label>
                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 text-xs text-slate-600 italic max-h-32 overflow-y-auto">
                            "{selectedTextForRefine}"
                        </div>
                    </div>

                    <div className="mb-5">
                        <label className="block text-xs font-bold text-slate-700 mb-2">ماذا تريد أن تفعل بهذا النص؟</label>
                        <textarea 
                            value={refinePrompt} 
                            onChange={(e) => setRefinePrompt(e.target.value)}
                            placeholder="مثال: اجعله أكثر احترافية، صحح الأخطاء اللغوية، لخصه في نقاط..."
                            className="w-full p-3 border rounded-xl text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-500 h-24 resize-none"
                            autoFocus
                        ></textarea>
                    </div>

                    <div className="flex gap-3">
                        <button 
                            onClick={confirmSmartRefine} 
                            disabled={isRefining || !refinePrompt.trim()}
                            className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {isRefining ? <i className="fa-solid fa-circle-notch fa-spin"></i> : <i className="fa-solid fa-check"></i>}
                            {isRefining ? 'جاري المعالجة...' : 'تطبيق التعديلات'}
                        </button>
                        <button 
                            onClick={() => setRefineModalOpen(false)}
                            className="px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition"
                        >
                            إلغاء
                        </button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default LetterEditor;
