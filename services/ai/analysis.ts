
import { safeGenerateContent, MODEL_SMART, MODEL_COMPLEX, cleanNumber, fileToPart, getAiFooter, Type } from './core';
import { Project, ProjectLog, BOQItem, ProjectPayment, BOQItemReportType } from '../../types';
import { computeLogsAnalytics, formatEnrichedLogLine, normalizeDateYMD } from './consultant';

export const analysisService = {
    async parsePaymentDocument(file: File, projectBoq: BOQItem[] = []): Promise<any> {
        try {
            const filePart = await fileToPart(file, true);
            const boqContext = projectBoq.map(b => 
                `ID: ${b.id} | Code: ${b.itemCode} | Desc: ${b.description} | Unit: ${b.unit} | ContractQty: ${b.quantity} | UnitPrice: ${b.unitPrice}`
            ).join('\n');

            const prompt = `
                **ROLE:** Senior Quantity Surveyor (Construction).
                **TASK:** Analyze the attached Payment Certificate (مستخلص أعمال) from PDF, Excel, Word, or Image.
                **OFFICIAL BOQ (Reference):**
                ${boqContext || 'No reference BOQ provided'}
                
                **INSTRUCTIONS:**
                Extract the payment certificate header data and line items into a JSON object with this exact structure:
                {
                  "invoiceNumber": "string (invoice/IPC number, e.g. '1', '2')",
                  "date": "YYYY-MM-DD (if found, else empty string)",
                  "cumulativeAmount": number (total cumulative value of works up to this payment),
                  "netAmount": number (net current payment amount if stated),
                  "items": [
                    {
                      "boqItemId": "matching ID from OFFICIAL BOQ if matched, else empty string",
                      "itemCode": "string",
                      "description": "string",
                      "unit": "string",
                      "contractQuantity": number,
                      "prevQuantity": number,
                      "currQuantity": number,
                      "totalQuantity": number,
                      "unitPrice": number,
                      "completionRatio": number (default 100),
                      "totalValue": number
                    }
                  ]
                }
                **OUTPUT:** Valid JSON Only.
            `;

            const result = await safeGenerateContent(MODEL_SMART, { 
                contents: { parts: [filePart, { text: prompt }] }, 
                config: { responseMimeType: "application/json" } 
            });
            
            const raw = (result.text || '{}').replace(/```json/gi, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(raw || '{}');
            if (parsed && Array.isArray(parsed.items)) {
                parsed.items = parsed.items.map((it: any, idx: number) => {
                    const prevQ = cleanNumber(it.prevQuantity);
                    const currQ = cleanNumber(it.currQuantity);
                    const totQ = cleanNumber(it.totalQuantity) || (prevQ + currQ);
                    const price = cleanNumber(it.unitPrice);
                    const ratio = cleanNumber(it.completionRatio) || 100;
                    const totVal = cleanNumber(it.totalValue) || Math.round(totQ * price * (ratio / 100));
                    return {
                        boqItemId: it.boqItemId || undefined,
                        itemCode: String(it.itemCode || (idx + 1)),
                        description: String(it.description || '').trim(),
                        unit: String(it.unit || 'م').trim(),
                        contractQuantity: cleanNumber(it.contractQuantity) || totQ,
                        prevQuantity: prevQ,
                        currQuantity: currQ,
                        totalQuantity: totQ,
                        unitPrice: price,
                        completionRatio: ratio,
                        totalValue: totVal
                    };
                });
                if (!parsed.cumulativeAmount && parsed.items.length > 0) {
                    parsed.cumulativeAmount = parsed.items.reduce((s: number, i: any) => s + (Number(i.totalValue) || 0), 0);
                } else if (parsed.cumulativeAmount) {
                    parsed.cumulativeAmount = cleanNumber(parsed.cumulativeAmount);
                }
            }
            return parsed;
        } catch (e) { return null; }
    },

    async analyzeSiteImage(file: Blob | File): Promise<string> {
        try {
            const filePart = await fileToPart(file, true);
            const prompt = `
                **IDENTITY:** Expert Technical Office Engineer (30+ Years Experience) - Multi-disciplinary (Civil/Arch/MEP).
                **TASK:** Generate a comprehensive **Site Inspection Report** based on the image.
                **LANGUAGE:** Professional Arabic (Technical Engineering Terms).
                
                **REQUIREMENTS:**
                1. **Mobile Optimization:** The report MUST be 100% width on mobile screens. No side margins or padding in the container.
                2. **Dynamic Tables:** Use HTML tables with \`width="100%"\`. Tables must be responsive and never overflow the screen. Use \`table-layout: auto\`.
                3. **Code References:** You MUST cite relevant **Egyptian Code of Practice (ECP)** clauses or Technical Specifications.
                4. **Consultant Recommendation:** Provide a clear, actionable recommendation at the end.
                
                **STRICT REPORT STRUCTURE (HTML):**
                
                <h1>تقرير معاينة فنية (Technical Inspection Report)</h1>

                <h3>1. وصف الأعمال والملاحظات (Observations)</h3>
                <div class="info-box editable-box">
                    <p>وصف دقيق للعنصر الظاهر في الصورة، المرحلة التنفيذية، وحالة العمل.</p>
                </div>

                <h3>2. فحص الجودة والمطابقة (Quality & Compliance)</h3>
                <div class="table-responsive">
                    <table style="width:100%; border-collapse: collapse; margin: 10px 0; font-size: 0.9em;">
                        <thead>
                            <tr style="background-color: #f8f9fa; border-bottom: 2px solid #dee2e6;">
                                <th style="padding: 8px; text-align: right;">البند (Item)</th>
                                <th style="padding: 8px; text-align: right;">الحالة (Status)</th>
                                <th style="padding: 8px; text-align: right;">الملاحظات (Notes)</th>
                            </tr>
                        </thead>
                        <tbody>
                            <!-- Generate rows based on image analysis -->
                            <tr>
                                <td style="padding: 8px; border-bottom: 1px solid #dee2e6;">جودة التنفيذ (Workmanship)</td>
                                <td style="padding: 8px; border-bottom: 1px solid #dee2e6;">...</td>
                                <td style="padding: 8px; border-bottom: 1px solid #dee2e6;">...</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px; border-bottom: 1px solid #dee2e6;">السلامة (Safety)</td>
                                <td style="padding: 8px; border-bottom: 1px solid #dee2e6;">...</td>
                                <td style="padding: 8px; border-bottom: 1px solid #dee2e6;">...</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <h3>3. المرجعية الكودية (Code References)</h3>
                <div class="highlight-box editable-box">
                    <p><strong>طبقاً للكود المصري (ECP):</strong></p>
                    <ul>
                        <li>اذكر رقم البند ونص الكود المتعلق بهذه الأعمال (مثلاً: كود الخرسانة 203، أو كود التشطيبات).</li>
                    </ul>
                </div>

                <h3>4. التوصية الاستشارية (Consultant Recommendation)</h3>
                <div class="success-box editable-box">
                    <p><strong>التوجيه الفني:</strong> ... (مثلاً: قبول الأعمال / رفض الأعمال وإعادة التنفيذ / معالجة العيوب).</p>
                    <p><strong>الإجراء المطلوب:</strong> ...</p>
                </div>
            `;
            const result = await safeGenerateContent(MODEL_SMART, {
                contents: { parts: [filePart, { text: prompt }] }
            });
            return result.text + getAiFooter(result.usedModel);
        } catch (e) { return "فشل تحليل الصورة."; }
    },

    async analyzePdfDocument(file: Blob | File): Promise<string> {
        try {
            const filePart = await fileToPart(file);
            const prompt = `
                **IDENTITY:** Senior Technical Office Manager (30+ Years Experience).
                **TASK:** Technical Review & Analysis of the attached document (Contract, Specs, Report, or Letter).
                **LANGUAGE:** Professional Arabic.

                **REQUIREMENTS:**
                1. **Mobile Optimization:** The report MUST be 100% width on mobile screens. No side margins or padding in the container.
                2. بصفتك خبير مكتب فني محترف، قم بتحديد نقاط التحليل بناءً على نوع التقرير المرفق.
                3. ركز بشكل أساسي على **النتائج والتوصيات**.
                4. **الجداول الديناميكية:** استخدم جداول HTML مع \`width="100%"\` لعرض البيانات والنتائج الهامة بشكل منظم. يجب أن تكون الجداول مرنة وتتلائم مع عرض الشاشة.
                5. في نهاية التقرير، يجب تقديم **التوصيات والتحذيرات** بوضوح.
                6. **الاقتباسات الكودية:** يجب دعم كلامك باقتباسات نصية من الأكواد الهندسية (مثل الكود المصري ECP أو FIDIC) كلما أمكن.

                **STRICT REPORT STRUCTURE (HTML):**

                <h1>تحليل فني للمستند (Technical Document Analysis)</h1>

                <h3>1. ملخص المستند (Executive Summary)</h3>
                <div class="info-box editable-box">
                    <p>نوع المستند، الغرض منه، وأهم النقاط الواردة فيه.</p>
                </div>

                <h3>2. التحليل الفني والنتائج (Technical Analysis & Results)</h3>
                <div class="table-responsive">
                    <table style="width:100%; border-collapse: collapse; margin: 10px 0; font-size: 0.9em;">
                        <thead>
                            <tr style="background-color: #f8f9fa; border-bottom: 2px solid #dee2e6;">
                                <th style="padding: 8px; text-align: right;">البند / نقطة التحليل</th>
                                <th style="padding: 8px; text-align: right;">النتيجة / الملاحظة</th>
                                <th style="padding: 8px; text-align: right;">التأثير (Impact)</th>
                            </tr>
                        </thead>
                        <tbody>
                            <!-- Extract key points into rows dynamically -->
                        </tbody>
                    </table>
                </div>

                <h3>3. المخاطر والتحذيرات (Risks & Warnings)</h3>
                <div class="warning-box editable-box">
                    <ul>
                        <li>حدد أي مخاطر فنية أو مالية أو قانونية.</li>
                        <li>اذكر أي تعارض مع المواصفات أو الكود.</li>
                    </ul>
                </div>

                <h3>4. التوصية الاستشارية والدعم الكودي (Recommendations & Code References)</h3>
                <div class="success-box editable-box">
                    <p><strong>التوصيات الفنية:</strong> ...</p>
                    <p><strong>المرجعية الكودية (الاقتباسات):</strong> ... (مثال: طبقاً للكود المصري رقم كذا، بند كذا ينص على...)</p>
                </div>
            `;
            const result = await safeGenerateContent(MODEL_COMPLEX, {
                contents: { parts: [filePart, { text: prompt }] }
            });
            return result.text + getAiFooter(result.usedModel);
        } catch (e) { return "فشل تحليل المستند."; }
    },

    async transcribeAndRefineLetterText(audioBlob: Blob, mode: 'paragraph' | 'full_letter' = 'paragraph', fallbackTranscript: string = ''): Promise<string> {
        try {
            const filePart = await fileToPart(audioBlob);
            const prompt = mode === 'full_letter' ? `
                **ROLE:** Senior Engineering Consultant & Technical Office Director.
                **TASK:** Listen carefully to the attached voice recording (and optional speech transcript: "${fallbackTranscript}") and convert it into a complete, formal, well-structured Arabic Engineering Letter in clean HTML.
                **OUTPUT REQUIREMENTS:**
                - Return clean HTML ONLY (no markdown fences).
                - Include a formal greeting, clear technical paragraphs (<p>), bullet points if appropriate (<ul><li>), and a formal closing.
                - Use clear, authoritative Arabic engineering terminology.
            ` : `
                **ROLE:** Senior Engineering Consultant.
                **TASK:** Transcribe the attached voice recording (and optional speech transcript: "${fallbackTranscript}") into a well-phrased, professional Arabic engineering paragraph or text block ready to be inserted directly at the cursor inside an engineering letter.
                **OUTPUT REQUIREMENTS:**
                - Return clean Arabic HTML paragraph(s) (<p>...</p>) ONLY (no markdown fences, no full letter header/footer).
                - Keep the exact technical meaning dictated by the engineer while refining grammar and professional phrasing.
            `;
            const result = await safeGenerateContent(MODEL_SMART, {
                contents: { parts: [filePart, { text: prompt }] }
            });
            const cleaned = (result.text || '').replace(/```html/gi, '').replace(/```/g, '').trim();
            return cleaned || (fallbackTranscript ? `<p>${fallbackTranscript}</p>` : '');
        } catch (e) {
            return fallbackTranscript ? `<p>${fallbackTranscript}</p>` : "";
        }
    },

    async transcribeAudioLog(audioBlob: Blob): Promise<string> {
        try {
            const filePart = await fileToPart(audioBlob);
            const prompt = `Transcribe to clear Arabic text for Site Log.`;
            const result = await safeGenerateContent(MODEL_SMART, {
                contents: { parts: [filePart, { text: prompt }] }
            });
            return result.text;
        } catch (e) { return ""; }
    },

    async analyzeAudioRecording(audioBlob: Blob, type: 'report' | 'letter' | 'memo'): Promise<string> {
        try {
            const filePart = await fileToPart(audioBlob, true);
            const prompt = `
                **ROLE:** Senior Engineering Consultant & Technical Office Manager.
                **TASK:** Analyze the attached audio recording (Meeting, Site Visit, or Voice Memo).
                **OUTPUT TYPE:** ${type === 'report' ? 'Technical Site Report' : type === 'letter' ? 'Formal Engineering Letter' : 'Internal Technical Memo'}.
                **LANGUAGE:** Professional Arabic.
                
                **REQUIREMENTS:**
                1. **Mobile Optimization:** The report MUST be 100% width on mobile screens. No side margins or padding in the container.
                2. **Transcription:** Extract all technical details, decisions, and observations.
                3. **Formatting:** Use HTML with professional styling.
                4. **Structure:**
                   - Header with Title and Date.
                   - Structured Body (use tables with \`width="100%"\` for any lists or quantities).
                   - Action Items / Recommendations section.
                5. **Style:** Use <div class="info-box editable-box"> for main content and <div class="success-box editable-box"> for recommendations.
            `;

            const result = await safeGenerateContent(MODEL_SMART, {
                contents: { parts: [filePart, { text: prompt }] }
            });
            
            return result.text + getAiFooter(result.usedModel);
        } catch (e) {
            return "فشل التحليل الذكي للتسجيل الصوتي.";
        }
    },

    async analyzeSoilReport(file: Blob | File): Promise<string> {
        try {
            const filePart = await fileToPart(file);
            const prompt = `
                **IDENTITY:** Senior Geotechnical Consultant (30+ Years Experience).
                **TASK:** Detailed Technical Analysis of Soil Investigation Report.
                **REFERENCE:** Egyptian Code of Practice for Soil Mechanics (ECP 202).
                **LANGUAGE:** Professional Arabic.

                **REQUIREMENTS:**
                1. **Mobile Optimization:** The report MUST be 100% width on mobile screens. No side margins or padding in the container.
                2. **Dynamic Tables:** MANDATORY for Soil Profile and Chemical Analysis. Use \`width="100%"\` and ensure they fit mobile screens.
                3. **Code References:** Cite ECP 202 clauses for bearing capacity, settlement, and chemical limits.
                4. **Consultant Recommendation:** Clear foundation decision.

                **STRICT REPORT STRUCTURE (HTML):**
                
                <h1>تقرير مراجعة أبحاث التربة (Geotechnical Report Review)</h1>

                <h3>1. وصف الموقع والجسات (Site & Boreholes)</h3>
                <div class="info-box editable-box">
                    <p>عدد الجسات، عمق الجسات، ومنسوب المياه الجوفية.</p>
                </div>

                <h3>2. قطاع التربة (Subsurface Profile)</h3>
                <div class="table-responsive">
                    <table style="width:100%; border-collapse: collapse; margin: 10px 0; font-size: 0.9em;">
                        <thead>
                            <tr style="background-color: #f8f9fa; border-bottom: 2px solid #dee2e6;">
                                <th style="padding: 8px; text-align: right;">العمق (م)</th>
                                <th style="padding: 8px; text-align: right;">نوع التربة (Soil Type)</th>
                                <th style="padding: 8px; text-align: right;">التوصيف (Description)</th>
                                <th style="padding: 8px; text-align: right;">SPT / القوام</th>
                            </tr>
                        </thead>
                        <tbody>
                            <!-- Generate rows for each layer -->
                            <tr>
                                <td style="padding: 8px; border-bottom: 1px solid #dee2e6;">0.0 - ...</td>
                                <td style="padding: 8px; border-bottom: 1px solid #dee2e6;">...</td>
                                <td style="padding: 8px; border-bottom: 1px solid #dee2e6;">...</td>
                                <td style="padding: 8px; border-bottom: 1px solid #dee2e6;">...</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <h3>3. التحليل الكيميائي والعدوانية (Chemical Analysis)</h3>
                <div class="table-responsive">
                    <table style="width:100%; border-collapse: collapse; margin: 10px 0; font-size: 0.9em;">
                        <thead>
                            <tr style="background-color: #f8f9fa; border-bottom: 2px solid #dee2e6;">
                                <th style="padding: 8px; text-align: right;">العنصر</th>
                                <th style="padding: 8px; text-align: right;">النتيجة</th>
                                <th style="padding: 8px; text-align: right;">الحدود المسموحة (ECP)</th>
                                <th style="padding: 8px; text-align: right;">التقييم</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td style="padding: 8px; border-bottom: 1px solid #dee2e6;">الكبريتات (SO3)</td>
                                <td style="padding: 8px; border-bottom: 1px solid #dee2e6;">...</td>
                                <td style="padding: 8px; border-bottom: 1px solid #dee2e6;">...</td>
                                <td style="padding: 8px; border-bottom: 1px solid #dee2e6;">...</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px; border-bottom: 1px solid #dee2e6;">الكلوريدات (Cl)</td>
                                <td style="padding: 8px; border-bottom: 1px solid #dee2e6;">...</td>
                                <td style="padding: 8px; border-bottom: 1px solid #dee2e6;">...</td>
                                <td style="padding: 8px; border-bottom: 1px solid #dee2e6;">...</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <h3>4. التوصيات الإنشائية (Foundation Recommendations)</h3>
                <table style="width:100%; border-collapse: collapse; margin: 10px 0;">
                    <thead>
                        <tr><th>البند الهندسي</th><th>التوصية المعتمدة</th></tr>
                    </thead>
                    <tbody>
                        <tr><td>نوع الأساسات</td><td>...</td></tr>
                        <tr><td>منسوب التأسيس</td><td>...</td></tr>
                        <tr><td>جهد التربة المسموح (Net Allowable)</td><td>...</td></tr>
                        <tr><td>نوع الأسمنت</td><td>...</td></tr>
                    </tbody>
                </table>

                <h3>5. المرجع الكودي (Code Reference)</h3>
                <div class="highlight-box editable-box">
                    <p>تمت المراجعة طبقاً للكود المصري لميكانيكا التربة والأساسات (ECP 202 - الجزء الثالث/الرابع).</p>
                </div>
            `;
            const result = await safeGenerateContent(MODEL_COMPLEX, {
                contents: { parts: [filePart, { text: prompt }] }
            });
            return result.text + getAiFooter(result.usedModel);
        } catch (e) { return "فشل تحليل تقرير التربة."; }
    },

    async analyzeUniversalProjectDocument(file: Blob | File): Promise<{ title: string; type: string; summary: string; content: string }> {
        try {
            const filePart = await fileToPart(file);
            const prompt = `
                **IDENTITY:** Senior Engineering Consultant & Technical Office Director (35+ Years Experience in Egyptian Codes ECP, FIDIC Contracts, and Project Documentation).
                **TASK:** Analyze the attached project document. It can be ANY document from the project:
                - تقارير أبحاث التربة والجسات (Soil & Geotechnical Reports).
                - تقارير ونتائج اختبارات المعامل (Lab Tests: Concrete cubes, Steel, Compaction, Asphalt, Materials).
                - عقود المقاولات والاتفاقيات والشروط والمطالبات (Construction Contracts, Agreements, FIDIC, Claims).
                - محاضر الاستلام وطلبات الفحص (Site Handover, Inspection Requests / RFIs, Checklists, NCRs).
                - المواصفات الفنية والتقارير الدورية والمراسلات (Specifications, Periodic Engineering Reports, Technical Memos).

                **REQUIREMENTS:**
                1. Detect the document type automatically: 'soil' | 'test' | 'contract' | 'report' | 'doc'.
                2. Extract a concise, formal Arabic Title (عنوان دقيق ورسمي للمستند، مثل: "تقرير اختبار تكسير مكعبات الخرسانة عمر 28 يوم" أو "عقد مقاولة أعمال..." أو "تقرير أبحاث وتوصيات تربة الأساسات").
                3. Provide a clear 1-2 sentence executive summary (ملخص موجز) in Arabic.
                4. Provide the full technical and analytical report in HTML:
                   - Start directly with <h1>عنوان التقرير أو المستند</h1> without any blue header div.
                   - Clear KPI boxes (info-box, success-box, warning-box, cost-box).
                   - Responsive HTML tables (width="100%") with natural word wrapping in all cells.
                   - Strict compliance with Egyptian Code of Practice (ECP) or standard construction contract rules.
                   - Concrete findings, test results table, contractual clauses analysis, or engineering directives.

                **OUTPUT FORMAT (STRICT JSON ONLY):**
                Return ONLY a JSON object with this exact shape:
                {
                    "title": "عنوان المستند الدقيق",
                    "type": "soil" or "test" or "contract" or "report" or "doc",
                    "summary": "ملخص تنفيذي مكثف من سطرين يوضح خلاصة المستند وأهم نتائجه",
                    "content": "<h1>عنوان المستند</h1> ... محتوى التقرير الفني والتحليل الهندسي الشامل بصيغة HTML ..."
                }
            `;
            const result = await safeGenerateContent(MODEL_COMPLEX, {
                contents: { parts: [filePart, { text: prompt }] },
                config: { responseMimeType: "application/json" }
            });
            const parsed = JSON.parse(result.text);
            return {
                title: parsed.title || "مستند مشروع معتمد",
                type: parsed.type || "doc",
                summary: parsed.summary || "تم تحليل وتوثيق المستند بالذكاء الاصطناعي.",
                content: (parsed.content || `<p>${parsed.summary || ''}</p>`) + getAiFooter(result.usedModel)
            };
        } catch (e) {
            console.warn("Universal document analysis fallback", e);
            const fallbackHtml = await this.analyzePdfDocument(file);
            return {
                title: `مستند مشروع - ${new Date().toLocaleDateString('ar-EG')}`,
                type: 'doc',
                summary: 'مستند هندسي تم تحليله وتوثيقه بسجل المشروع.',
                content: fallbackHtml
            };
        }
    },

    async analyzeProjectMasterData(data: any): Promise<string> {
        const rawLogs = Array.isArray(data?.executionLogs) ? data.executionLogs : (Array.isArray(data?.logs) ? data.logs : []);
        const logsAnalytics = computeLogsAnalytics(rawLogs, data?.boqItems || []);
        const safeLogs = rawLogs.slice(0, 120).map((l: any, idx: number) => formatEnrichedLogLine(l, idx, data?.boqItems || []));
        const sanitizedData = {
            ...(data || {}),
            executionLogs: undefined,
            logs: undefined,
            logsAnalytics,
            logsSummaryLines: safeLogs
        };
        const context = JSON.stringify(sanitizedData);
        const prompt = `
            **IDENTITY:** Project Director (30+ Years Experience).
            **TASK:** Generate a High-Level Executive Dashboard Summary (Arabic HTML) including insights extracted from Daily Logs, BOQ, and Payments.
            
            **REQUIREMENTS:**
            1. **Mobile Optimization:** The dashboard MUST be 100% width on mobile screens. No side margins.
            2. **Financial Table:** Summarize Contract Value vs. Executed vs. Paid using \`width="100%"\`.
            3. **Status Assessment:** Clear statement on project health (Time/Cost/Quality) grounded in daily logs and progress data.
            4. **Strategic Recommendation:** One key advice for the owner.

            **STRUCTURE:**
            <h1>لوحة القيادة التنفيذية (Executive Dashboard)</h1>

            <h3>1. الموقف المالي والتعاقدي (Financial Status)</h3>
            <div class="table-responsive">
                <table style="width:100%; border-collapse: collapse; margin: 10px 0; font-size: 0.9em;">
                    <tr style="background-color: #f8f9fa;"><th style="padding:8px; text-align:right;">البيان</th><th style="padding:8px; text-align:right;">القيمة (ج.م)</th></tr>
                    <tr><td style="padding:8px; border-bottom:1px solid #dee2e6;">إجمالي المقايسة (Contract)</td><td style="padding:8px; border-bottom:1px solid #dee2e6;">...</td></tr>
                    <tr><td style="padding:8px; border-bottom:1px solid #dee2e6;">إجمالي المستخلصات (Billed)</td><td style="padding:8px; border-bottom:1px solid #dee2e6;">...</td></tr>
                    <tr><td style="padding:8px; border-bottom:1px solid #dee2e6;">نسبة الصرف المالي (%)</td><td style="padding:8px; border-bottom:1px solid #dee2e6;">...</td></tr>
                </table>
            </div>

            <h3>2. تقييم الأداء وتحليل اليوميات (Performance & Daily Logs Evaluation)</h3>
            <div class="info-box editable-box">
                <p>تقييم عام لسير العمل وتوزيع الأعمال باليوميات بناءً على البيانات المتاحة.</p>
            </div>

            <h3>3. التوصية الاستراتيجية (Strategic Recommendation)</h3>
            <div class="success-box editable-box">
                <p><strong>التوجيه:</strong> ...</p>
            </div>
        `;
        try {
            const result = await safeGenerateContent(MODEL_COMPLEX, { contents: `Data: ${context}\n\n${prompt}` });
            return result.text + getAiFooter(result.usedModel);
        } catch (e) { return data.fullDescription || ""; }
    },

    async generateDailyReport(projectName: string, logs: ProjectLog[], projectContext: string = ''): Promise<string> {
        const sortedLogs = [...(logs || [])].sort((a, b) => normalizeDateYMD(a.date).localeCompare(normalizeDateYMD(b.date)));
        const logsAnalytics = computeLogsAnalytics(sortedLogs);
        const formattedLogs = sortedLogs.slice(0, 150).map((l, idx) => formatEnrichedLogLine(l, idx)).join('\n');
        const analyticsSummary = sortedLogs.length > 0
            ? `إجمالي السجلات: ${logsAnalytics.totalLogs} | أيام العمل النشطة: ${logsAnalytics.uniqueActiveDays} | الفترة: ${logsAnalytics.firstDate} إلى ${logsAnalytics.lastDate} | الصور المرفقة: ${logsAnalytics.totalPhotos} | توزيع الأعمال: ${logsAnalytics.byWorkCategory.map(c => `${c.category} (${c.count})`).join('، ')} | فترات الانقطاع >= 3 أيام: ${logsAnalytics.gaps.length > 0 ? logsAnalytics.gaps.map(g => `${g.fromDate} إلى ${g.toDate} (${g.gapDays} يوم)`).join('، ') : 'لا يوجد'}`
            : 'لا توجد يوميات مسجلة.';
        
        const prompt = `
            **IDENTITY:** Site Supervision Consultant Engineer (مهندس استشاري مشرف على التنفيذ).
            **EXPERIENCE:** 25+ Years in Construction Supervision & Site Management.
            **PROJECT:** ${projectName}
            
            **INPUT DATA (SOURCE OF TRUTH):**
            1. **Project Context:** ${projectContext}
            2. **Daily Logs Analytics Summary:** ${analyticsSummary}
            3. **Site Diaries (Logs - Full Details):** 
            ${formattedLogs || 'لا توجد يوميات مسجلة.'}

            **STRICT INSTRUCTIONS:**
            1. **Mobile Optimization:** The report MUST be 100% width on mobile screens. No side margins.
            2. **FACT-BASED ONLY:** You must ONLY use the provided "Site Diaries" and "Project Context". DO NOT invent dates, events, or completion percentages not mentioned.
            3. **DEEP LOG ANALYSIS:** Extract work categories, linked BOQ items, execution rates, delays/gaps, resources/manpower/materials mentioned in the logs, and timeline trends.
            4. **LANGUAGE:** Professional Arabic Engineering Report.
            5. **Tables:** Use \`width="100%"\` for all tables and ensure they are responsive.

            **REQUIRED REPORT STRUCTURE (HTML):**
            
            <h1>تقرير الموقف التنفيذي (Site Progress Report)</h1>

            <h3>1. حالة المشروع الحالية (Current Status)</h3>
            <div class="table-responsive">
                <table style="width:100%; border-collapse: collapse; margin: 10px 0; font-size: 0.9em;">
                    <tr>
                        <td style="padding:8px; background-color:#f8f9fa; font-weight:bold; width:30%;">مرحلة التنفيذ</td>
                        <td style="padding:8px; border-bottom:1px solid #dee2e6;">...</td>
                    </tr>
                    <tr>
                        <td style="padding:8px; background-color:#f8f9fa; font-weight:bold;">آخر نشاط مسجل</td>
                        <td style="padding:8px; border-bottom:1px solid #dee2e6;">...</td>
                    </tr>
                </table>
            </div>
        
            <h3>2. تحليل سير العمل (Workflow Analysis)</h3>
            <div class="info-box editable-box">
                <p>تحليل التسلسل الزمني ومعدلات الأداء (هل العمل متصل أم متقطع؟).</p>
            </div>
        
            <h3>3. المعوقات والتأخيرات (Delays & Issues)</h3>
            <div class="warning-box editable-box">
                <ul>
                    <li>المشاكل المرصودة في اليوميات.</li>
                    <li>فترات التوقف غير المبررة.</li>
                </ul>
            </div>
        
            <h3>4. الخطوات القادمة والتوصيات (Next Steps & Recommendations)</h3>
            <div class="success-box editable-box">
                <p><strong>الأنشطة المتوقعة:</strong> ...</p>
                <p><strong>توصيات الاستشاري:</strong> ...</p>
            </div>

            <div class="report-footer">
                تم إعداد التقرير بناءً على سجلات المشروع المعتمدة
            </div>
        `;
        try {
            const result = await safeGenerateContent(MODEL_COMPLEX, { contents: prompt });
            return result.text + getAiFooter(result.usedModel);
        } catch (e) { return "فشل إنشاء التقرير."; }
    },

    async generateCustomProjectReport(project: Project, logs: ProjectLog[], title: string, start: string, end: string): Promise<string> {
        const projAny: any = project || {};
        const boqItems = project.boqItems || [];
        const boqTotalValue = boqItems.reduce((sum, item) => sum + ((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)), 0);
        const boqExecutedValue = boqItems.reduce((sum, item) => sum + ((Number(item.executedQuantity) || 0) * (Number(item.unitPrice) || 0)), 0);
        const financialProgress = boqTotalValue > 0 ? (boqExecutedValue / boqTotalValue) * 100 : 0;

        const payments = (project.payments || []) as any[];
        const paymentsTotal = payments.reduce((acc, p) => acc + (Number(p.netAmount) || Number(p.amount) || 0), 0);
        
        const sortedPeriodLogs = [...(logs || [])].sort((a, b) => normalizeDateYMD(a.date).localeCompare(normalizeDateYMD(b.date)));
        const logsAnalytics = computeLogsAnalytics(sortedPeriodLogs, boqItems);
        const logsStatsText = sortedPeriodLogs.length > 0
            ? [
                `• عدد السجلات بالفترة: ${logsAnalytics.totalLogs} سجل (${logsAnalytics.uniqueActiveDays} يوم عمل فعلي) | الصور المرفقة: ${logsAnalytics.totalPhotos}`,
                `• توزيع تصنيفات الأعمال: ${logsAnalytics.byWorkCategory.map(c => `${c.category}: ${c.count} (${c.percentage}%)`).join(' | ')}`,
                logsAnalytics.byBoqItem.length > 0
                    ? `• البنود المرتبطة بالمقايسة: ${logsAnalytics.byBoqItem.map(b => `${b.boqItemCode ? `بند ${b.boqItemCode}` : ''} ${b.boqItemDescription.slice(0, 40)} (${b.count})`).join(' | ')}`
                    : '',
                logsAnalytics.gaps.length > 0
                    ? `• فترات توقف/انقطاع (>= 3 أيام): ${logsAnalytics.gaps.map(g => `من ${g.fromDate} إلى ${g.toDate} (${g.gapDays} يوم)`).join(' | ')}`
                    : '• فترات التوقف: لا توجد فترات انقطاع >= 3 أيام'
            ].filter(Boolean).join('\n')
            : "لا توجد إحصائيات يوميات خلال الفترة.";

        const logsContext = sortedPeriodLogs.length > 0 
            ? sortedPeriodLogs.map((l, idx) => formatEnrichedLogLine(l, idx, boqItems)).join('\n')
            : "لا توجد يوميات مسجلة خلال هذه الفترة المحددة.";

        const boqContext = boqItems.length > 0
            ? boqItems.map((b, i) => `• [بند ${b.itemCode || i+1}] ${b.description}: تعاقدي ${b.quantity} ${b.unit || 'م3'} | منفذ ${b.executedQuantity || 0} | متبقي ${Math.max(0, (b.quantity || 0) - (b.executedQuantity || 0))} | فئة ${(b.unitPrice || 0).toLocaleString()} ج.م | إجمالي ${((b.quantity || 0) * (b.unitPrice || 0)).toLocaleString()} ج.م`).join('\n')
            : "لا توجد بنود مقايسة مسجلة.";

        const paymentsContext = payments.length > 0
            ? payments.map((p, i) => `• [مستخلص ${p.invoiceNumber || p.number || i+1}] بتاريخ: ${p.date} | إجمالي أعمال: ${(p.grossAmount || p.currentWorkValue || p.grossCurrentWork || 0).toLocaleString()} ج.م | خصم ضمان: ${(p.retentionDeduction || p.retentionAmount || p.retention || 0).toLocaleString()} | خصم دفعة مقدمة: ${(p.advanceDeduction || p.advanceDeductionAmount || p.advancePayment || 0).toLocaleString()} | استقطاعات وضرائب: ${(p.taxDeduction || p.taxesAndOtherAmount || p.taxes || 0).toLocaleString()} | صافي مستحق: ${(p.netAmount || p.amount || 0).toLocaleString()} ج.م | تراكمي: ${(p.cumulativeAmount || p.netAmount || 0).toLocaleString()} ج.م | بيان: ${p.note || ''}`).join('\n')
            : "لا توجد مستخلصات مسجلة.";
            
        const soilContext = (projAny.soilReport || projAny.soilReportAnalysis) && String(projAny.soilReport || projAny.soilReportAnalysis).trim().length > 0 
            ? String(projAny.soilReport || projAny.soilReportAnalysis) 
            : "لم يتم إدخال تقرير فحص تربة وتوصيات جسات مفصل.";

        const reportsContext = (project.engineeringReports || []).length > 0
            ? project.engineeringReports.map(r => `• [${r.date || 'تاريخ غير محدد'}] [${r.type}] ${r.title}`).join('\n')
            : "لا توجد تقارير هندسية سابقة.";

        const rfisContext = (project.rfis || []).map(r => `• [${r.date}] ${r.subject} - حالة: ${r.status}`).join('\n');
        const ncrsContext = (project.ncrs || []).map(n => `• [${n.issueDate}] ${n.description} - حالة: ${n.status}`).join('\n');

        const prompt = `
            **ROLE:** Unified Engineering Consultant Center (المركز الاستشاري الموحد للمشروع - يضم المدير العام، مدير التكاليف والعقود، مدير المكتب الفني وضبط الجودة، ومدير الموقع والسلامة).
            **TASK:** Generate a Dazzling, Comprehensive, Publication-Grade Executive Report: "${title}" for the period (${start} to ${end}).
            **LANGUAGE:** Professional Arabic (المصطلحات الهندسية الرسمية واللغة العربية الفصحى).
            
            **PROJECT DATA (SOURCE OF TRUTH - DO NOT HALLUCINATE OR INVENT DATA):**
            - اسم المشروع: ${project.name || 'بدون اسم'}
            - المقاول العام: ${project.contractor || 'غير محدد'}
            - الاستشاري: ${projAny.consultant || 'غير محدد'}
            - حالة المشروع: ${project.status || 'ساري'}
            - نسبة الإنجاز المالي: ${financialProgress.toFixed(1)}%
            - القيمة التعاقدية الإجمالية للمقايسة: ${boqTotalValue.toLocaleString()} جنيه مصري
            - إجمالي قيمة الأعمال المنفذة: ${boqExecutedValue.toLocaleString()} جنيه مصري
            - إجمالي المنصرف بالمستخلصات: ${paymentsTotal.toLocaleString()} جنيه مصري
            
            **سجل المقايسة التفصيلي:**
            ${boqContext}

            **سجل المستخلصات والدفعات المعتمدة:**
            ${paymentsContext}

            **تقرير فحص التربة والجسات:**
            ${soilContext}

            **ملخص وتحليل إحصائي لليوميات خلال الفترة:**
            ${logsStatsText}

            **سجل اليوميات الميدانية خلال فترة التقرير (شامل التصنيفات والبنود المرتبطة والصور):**
            ${logsContext}
            
            **سجل التقارير الهندسية والأرشيف:**
            ${reportsContext}
            
            **طلبات المعلومات وملاحظات الجودة (RFIs & NCRs):**
            ${rfisContext || 'لا توجد طلبات معلومات'}
            ${ncrsContext || 'لا توجد تقارير عدم مطابقة'}

            **REQUIREMENTS:**
            1. **Mobile & Print Optimization:** Report must be 100% width, fully responsive, and look gorgeous on screen and in print.
            2. **Dynamic Tables:** All tables must have \`width="100%"\` with natural word wrapping in all table cells and column headers. Never wrap tables inside an \`info-box\` or text block.
            3. **Pure Project Truth:** Deliver factual analysis based 100% on the live project register above. Do not invent items or numbers.
            4. **Visual Hierarchy:** Use clean sections, stat cards, clear tables, and colored alert boxes (\`info-box\`, \`success-box\`, \`warning-box\`, \`cost-box\`).
            5. **Direct Title:** Start directly with \`<h1>${title}</h1>\` without any blue header bar.
            
            **STRICT REPORT STRUCTURE (HTML):**
            <h1>${title} (${start} - ${end})</h1>

            <div class="cost-box editable-box">
                <p><strong>موجز المؤشرات القياسية للمشروع:</strong> القيمة التعاقدية: <strong>${boqTotalValue.toLocaleString()} ج.م</strong> | المنفذ بالمقايسة: <strong>${boqExecutedValue.toLocaleString()} ج.م (${financialProgress.toFixed(1)}%)</strong> | المنصرف بالمستخلصات: <strong>${paymentsTotal.toLocaleString()} ج.م</strong></p>
            </div>

            <h3>1. الموقف التنفيذي والمالي المتكامل (Executive & Financial Status)</h3>
            <div class="info-box editable-box">
                <p>تحليل استراتيجي يربط بين سير الأعمال الميدانية ونسب الصرف المالي والجدول الزمني، وتقييم أداء المقاول من واقع اليوميات والمستخلصات.</p>
            </div>

            <h3>2. جدول مطابقة الأعمال المنفذة بالمستخلصات والمقايسة (Reconciliation Table)</h3>
            <div class="table-responsive">
                <table style="width:100%; border-collapse: collapse; margin: 10px 0; font-size: 0.9em;">
                    <thead>
                        <tr style="background-color: #f8f9fa; border-bottom: 2px solid #dee2e6;">
                            <th style="padding: 8px; text-align: right;">التاريخ / المرجع</th>
                            <th style="padding: 8px; text-align: right;">البيان وسجل الأعمال</th>
                            <th style="padding: 8px; text-align: right;">الأثر المالي والتنفيذي</th>
                            <th style="padding: 8px; text-align: right;">تحليل وتقييم الاستشاري</th>
                        </tr>
                    </thead>
                    <tbody>
                        <!-- Summarize actual logs and payments into clean rows based on real data -->
                    </tbody>
                </table>
            </div>

            <h3>3. تقييم الجودة والتربة والأعمال الميدانية (Quality, Soil & Field Analysis)</h3>
            <div class="info-box editable-box">
                <p>تحليل فني يغطي مطابقة الأعمال للكود المصري، وحالة التربة والتوصيات الجيوتقنية ومستوى المياه الجوفية إن وجد.</p>
            </div>

            <h3>4. مصفوفة المخاطر المتوقعة والإجراءات الوقائية (Risk Matrix)</h3>
            <div class="warning-box editable-box">
                <p>رصد أدق المخاطر (الزمنية، التمويلية، الفنية، أو السلامة) وسبل تفاديها قبل تفاقمها.</p>
            </div>

            <h3>5. توجيهات وقرارات المركز الاستشاري الموحد (Consultant Directives)</h3>
            <div class="success-box editable-box">
                <ul>
                    <li><strong>توجيهات المدير العام:</strong> قرارات عليا لحسم مسار المشروع وحماية المالك.</li>
                    <li><strong>توجيهات مدير التكاليف والعقود:</strong> تعليمات تدقيق المستخلصات، حفظ الحقوق التعاقدية، وضبط التدفق النقدي.</li>
                    <li><strong>توجيهات مدير المكتب الفني:</strong> اشتراطات الكود المصري، اعتماد المواد، وإغلاق أي ملاحظات فنية.</li>
                    <li><strong>توجيهات مدير الموقع والسلامة:</strong> ضوابط التنفيذ الميداني، معدلات الإنجاز اليومية، وإجراءات السلامة المهنية.</li>
                </ul>
            </div>
        `;
        try {
            const result = await safeGenerateContent(MODEL_COMPLEX, { contents: prompt });
            return result.text + getAiFooter(result.usedModel);
        } catch (e) { return "فشل إنشاء الملخص."; }
    },

    async parseBOQ(file: File): Promise<BOQItem[]> {
        try {
            const filePart = await fileToPart(file);
            const prompt = `
                **ROLE:** Expert Quantity Surveyor (مهندس حصر ومكتب فني).
                **TASK:** Extract all Bill of Quantities (BOQ / مقايسة) items from the attached file (Excel, Word, PDF, or Image) into a JSON Array.
                **SCHEMA:**
                [
                  {
                    "itemCode": "string (رقم البند أو الكود)",
                    "description": "string (بيان الأعمال بالتفصيل كما ورد بالمقايسة)",
                    "unit": "string (الوحدة: م3، م2، م.ط، طن، عدد، مقطوعية، إلخ)",
                    "quantity": number (الكمية),
                    "unitPrice": number (فئة البند / السعر)
                  }
                ]
                **RULES:**
                - Extract every single BOQ item accurately.
                - Convert any Arabic-Indic numerals (٠١٢٣٤٥٦٧٨٩) to standard numbers.
                - Output valid JSON array ONLY.
            `;
            const result = await safeGenerateContent(MODEL_SMART, {
                contents: { parts: [filePart, { text: prompt }] },
                config: { responseMimeType: "application/json" } 
            });
            const rawText = (result.text || '[]').replace(/```json/gi, '').replace(/```/g, '').trim();
            const data = JSON.parse(rawText || '[]');
            if (!Array.isArray(data)) return [];
            return data.map((it: any, idx: number) => ({
                id: `boq_${Date.now()}_${idx}`,
                itemCode: String(it.itemCode ?? (idx + 1)),
                description: String(it.description || '').trim(),
                unit: String(it.unit || 'عدد').trim(),
                quantity: cleanNumber(it.quantity),
                unitPrice: cleanNumber(it.unitPrice),
                total: cleanNumber(it.quantity) * cleanNumber(it.unitPrice),
                executedQuantity: 0
            })).filter(it => it.description.length > 0);
        } catch (e) { return []; }
    },

    async extractItemDescriptionFromImage(file: Blob | File): Promise<string> {
        try {
            const filePart = await fileToPart(file, true);
            const prompt = `Identify construction item for QS. Output Arabic description only.`;
            const result = await safeGenerateContent(MODEL_SMART, {
                contents: { parts: [filePart, { text: prompt }] }
            });
            return result.text.trim();
        } catch (e) { return ""; }
    },

    async classifyArchiveCategory(content: string): Promise<string> {
        const prompt = `Classify engineering text into category (e.g. 'التنفيذ والإنشاءات', 'العقود'). Output category name only.`;
        try {
            const result = await safeGenerateContent(MODEL_SMART, { contents: prompt });
            return result.text.trim();
        } catch (e) { return 'تقارير عامة'; }
    },

    async generateEngineeringDocument(type: 'rfi' | 'checklist' | 'submittal' | 'correspondence' | 'ncr', data: any, projectContext: string = ''): Promise<string> {
        const prompt = `
            **IDENTITY:** Senior Technical Office Engineer (30+ Years Experience).
            **TASK:** Generate a professional engineering document of type: "${type.toUpperCase()}".
            
            **PROJECT CONTEXT:**
            ${projectContext}

            **DOCUMENT DATA:** 
            ${JSON.stringify(data)}
            
            **LANGUAGE:** Professional Arabic.
            
            **REQUIREMENTS:**
            1. **Mobile Optimization:** The document MUST be 100% width on mobile screens. No side margins.
            2. **Format:** HTML Only. Use professional tables (\`width="100%"\`) and boxes.
            3. **Content:** Be detailed, technical, and include references to Egyptian Code (ECP) where applicable.
            4. **Structure:** Include Header (Project Name, Contractor, Ref, Date, Subject), Body (Technical Details), and Footer (Recommendations/Signatures).
            5. **Styling:** Use class="info-box editable-box", "success-box editable-box", "warning-box editable-box" for sections.
            6. **Printable:** Ensure it looks like an official company document.
            
            **DOCUMENT SPECIFIC INSTRUCTIONS:**
            - If RFI: Focus on technical clarification and impact on work.
            - If Checklist: Create a detailed point-by-step inspection table.
            - If NCR: Detail the violation, root cause, and corrective action.
            - If Submittal: Focus on technical specs and compliance.
            - If Correspondence: Professional formal letter style.
        `;
        try {
            const result = await safeGenerateContent(MODEL_COMPLEX, { contents: prompt });
            let text = result.text.replace(/^```html/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
            return text;
        } catch (e) { return "فشل توليد المستند."; }
    },

    async analyzeDraftToLetter(file: Blob | File): Promise<{ title?: string; bodyHtml: string }> {
        try {
            const filePart = await fileToPart(file, true);
            const prompt = `
                أنت مدير مكتب فني واستشاري عقود ومراسلات هندسية محترف في مصر.
                المهمة: قراءة وتحليل صورة أو ملف المسودة المرفقة (سواء كانت مكتوبة بخط اليد أو مطبوعة أو ملاحظات سريعة) وتحويلها إلى **خطاب هندسي رسمي كامل ومنسق واحترافي جداً** باللغة العربية الفصحى الرصينة.

                المتطلبات:
                1. استخرج عنوان أو موضوع الخطاب بدقة وضعه في الحقل "title" (مثال: "الموضوع: طلب استلام أعمال حدادة سقف الدور الأول...").
                2. صِغ نص الخطاب الكامل في الحقل "bodyHtml" بصيغة HTML متوافقة تماماً مع المحرر، بحيث يشمل:
                   - التوجيه الرسمي (السيد المهندس / ................. المحترم، الجهة / .................).
                   - تحية طيبة وبعد،،،
                   - فقرات الخطاب مصاغة بأسلوب هندسي وتعاقدي قوي وواضح ومرتب، مع تصحيح أي أخطاء إملائية أو صياغية في المسودة واستكمال الديباجة الرسمية المناسبة.
                   - إذا كانت المسودة تحتوي على بنود أو كميات أو نقاط متعددة، نظمها في قائمة منسقة (<ul><li>...</li></ul>) أو جدول احترافي (<div class="table-responsive-wrapper"><table style="width:100%; border-collapse: collapse;">...</table></div>) أو مربع مميز (<div class="editable-box info-box">...</div>) عند الحاجة.
                   - الخاتمة الرسمية وجدول التوقيعات (مقدمه لسيادتكم / التوقيع والاعتماد).
                3. أخرج النتيجة بصيغة JSON صالحة فقط كالتالي:
                {
                  "title": "الموضوع: ...",
                  "bodyHtml": "<p><strong>السيد / ...</strong></p>..."
                }
            `;
            const result = await safeGenerateContent(MODEL_SMART, {
                contents: { parts: [filePart, { text: prompt }] },
                config: { responseMimeType: "application/json" }
            });
            const raw = (result.text || '').trim();
            try {
                const parsed = JSON.parse(raw.replace(/```json/gi, '').replace(/```/g, '').trim());
                if (parsed && parsed.bodyHtml) {
                    return {
                        title: parsed.title || undefined,
                        bodyHtml: parsed.bodyHtml
                    };
                }
            } catch (_) {}
            const cleanHtml = raw.replace(/^```html/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
            return { bodyHtml: cleanHtml || "فشل تحليل المسودة." };
        } catch (e) {
            return { bodyHtml: "فشل تحليل المسودة." };
        }
    },

    async refineSelectedLetterText(selectedText: string, surroundingContext: string = '', customInstruction: string = ''): Promise<string> {
        const cleanText = selectedText.trim();
        if (!cleanText) return selectedText;

        const instructionBlock = customInstruction.trim()
            ? `المطلوب تنفيذه على النص المحدد بناءً على توجيه المستخدم:\n"${customInstruction.trim()}"\nمع الالتزام بأسلوب هندسي ورسمي رصين باللغة العربية الفصحى.`
            : `المطلوب: إعادة صياغة وتنقيح النص المحدد ليصبح بأسلوب هندسي ورسمي رصين وأكثر احترافية ودقة وبلاغة تعاقدية وهندسية، مع تصحيح أي أخطاء لغوية أو إملائية والحفاظ على المعنى المقصود.`;

        const prompt = `
            أنت خبير صياغة خطابات وتقارير ومراسلات هندسية وتعاقدية ورسمية باللغة العربية.
            ${instructionBlock}
            - إذا كان النص المحدد كلمة واحدة أو مصطلحاً قصيراً وطلب تنقيحه: استبدله بالمصطلح الهندسي/الرسمي الأدق والأقوى في نفس السياق.
            - إذا كان النص المحدد جملة أو عبارة أو سطراً: نفذ المطلوب وأعد صياغته بأسلوب رسمي رصين ومباشر مناسب للخطابات والتقارير الهندسية.
            - مهم جداً: أرجع النص الجديد المنقح فقط بدون أي مقدمات أو علامات تنصيص أو شرح إضافي.

            النص المحدد:
            "${cleanText}"

            ${surroundingContext ? `سياق الخطاب للاسترشاد:\n${surroundingContext.slice(0, 600)}` : ''}
        `;

        try {
            const result = await safeGenerateContent(MODEL_SMART, {
                contents: prompt
            });
            const refined = (result.text || '')
                .replace(/^```[a-z]*\n?/i, '')
                .replace(/```$/i, '')
                .replace(/^["«]|["»]$/g, '')
                .trim();
            return refined || selectedText;
        } catch (e) {
            return selectedText;
        }
    },

    async generateBOQItemSubReport(
        reportType: BOQItemReportType,
        item: BOQItem,
        projectContext?: { projectName?: string; contractor?: string; location?: string }
    ): Promise<string> {
        const contractQty = Number(item.quantity) || 0;
        const execQty = Number(item.executedQuantity) || 0;
        const remainingQty = Math.max(0, contractQty - execQty);
        const unitPrice = Number(item.unitPrice) || 0;

        const itemHeaderSummaryHtml = `
            <div class="table-responsive-wrapper" style="width:100%; overflow-x:auto; margin:0 0 10px 0; padding:0;">
                <table class="boq-summary-mini-table" style="width:100%; min-width:420px; border-collapse:collapse; margin:0; border:1px solid #cbd5e1; background:#ffffff;">
                    <thead>
                        <tr>
                            <th style="background:#f1f5f9; color:#1e3a8a; font-size:11px; font-weight:800; padding:5px 6px; text-align:center; border:1px solid #cbd5e1;">البند / القسم</th>
                            <th style="background:#f1f5f9; color:#1e3a8a; font-size:11px; font-weight:800; padding:5px 6px; text-align:center; border:1px solid #cbd5e1;">الوحدة</th>
                            <th style="background:#f1f5f9; color:#1e3a8a; font-size:11px; font-weight:800; padding:5px 6px; text-align:center; border:1px solid #cbd5e1;">التعاقدي</th>
                            <th style="background:#f1f5f9; color:#1e3a8a; font-size:11px; font-weight:800; padding:5px 6px; text-align:center; border:1px solid #cbd5e1;">المنفذ</th>
                            <th style="background:#f1f5f9; color:#1e3a8a; font-size:11px; font-weight:800; padding:5px 6px; text-align:center; border:1px solid #cbd5e1;">المتبقي</th>
                            <th style="background:#f1f5f9; color:#1e3a8a; font-size:11px; font-weight:800; padding:5px 6px; text-align:center; border:1px solid #cbd5e1;">الفئة</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style="font-size:11.5px; font-weight:800; color:#1e3a8a; padding:5px 6px; text-align:center; border:1px solid #cbd5e1;">بند (${item.itemCode || '-'}) - ${item.batchName || 'المقايسة العامة'}</td>
                            <td style="font-size:11.5px; font-weight:700; color:#0f172a; padding:5px 6px; text-align:center; border:1px solid #cbd5e1;">${item.unit || '-'}</td>
                            <td style="font-size:11.5px; font-weight:700; color:#0f172a; padding:5px 6px; text-align:center; border:1px solid #cbd5e1;">${contractQty.toLocaleString()}</td>
                            <td style="font-size:11.5px; font-weight:700; color:#166534; padding:5px 6px; text-align:center; border:1px solid #cbd5e1;">${execQty.toLocaleString()}</td>
                            <td style="font-size:11.5px; font-weight:700; color:#92400e; padding:5px 6px; text-align:center; border:1px solid #cbd5e1;">${remainingQty.toLocaleString()}</td>
                            <td style="font-size:11.5px; font-weight:800; color:#1e3a8a; padding:5px 6px; text-align:center; border:1px solid #cbd5e1;">${unitPrice.toLocaleString()} ج.م</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        `;

        let specificInstructions = '';
        if (reportType === 'materials') {
            specificInstructions = `
                المطلوب إعداد: **تقرير تحليل الخامات والمواد التفصيلي للبند (Materials & Raw Materials Breakdown Report)**
                يجب أن يشمل التقرير الأقسام التالية بتنسيق HTML احترافي وجداول دقيقة ومختصرة دون تكرار منطوق البند:
                1. **جدول معدلات استهلاك الخامات لكل (1 ${item.unit || 'وحدة'}) ولإجمالي الكمية التعاقدية (${contractQty} ${item.unit || ''}) والكمية المنفذة (${execQty} ${item.unit || ''}) والكمية المتبقية (${remainingQty} ${item.unit || ''}):**
                   - الأعمدة: (م | اسم الخامة / المادة | الوحدة | المعدل لكل 1 ${item.unit || 'وحدة'} | الهالك % | المطلوب للتعاقدي | المستهلك للمنفذ | المطلوب للمتبقي).
                2. **المواصفات الفنية للخامات والمواد الموردة للموقع (وفق الكود المصري ECP):**
                   - اشتراطات القبول والفحص الظاهري والمعملية لكل خامة داخلة في البند.
                3. **اشتراطات التشوين والتخزين السليم في الموقع:**
                   - كيفية حفظ الخامات لتجنب التلف أو الهالك الزائد.
            `;
        } else if (reportType === 'method_specs') {
            specificInstructions = `
                المطلوب إعداد: **تقرير طريقة تنفيذ البند والمواصفات الفنية (Method Statement & Technical Specifications)**
                يجب أن يشمل التقرير الأقسام التالية بتنسيق HTML احترافي ومباشر دون إعادة كتابة منطوق البند:
                1. **الاشتراطات الفنية المرجعية للبند (طبقاً للكود المصري ECP وأصول الصناعة):**
                   - المتطلبات الفنية الدقيقة ومواصفات المواد والمصنعية.
                2. **التحضيرات والتجهيزات المسبقة قبل البدء (Pre-Execution Requirements):**
                   - تجهيز الموقع، الاعتمادات، المساحة، الشدات أو المناسيب، والمعدات اللازمة.
                3. **خطوات وطريقة التنفيذ التفصيلية (Step-by-Step Execution Procedure):**
                   - خطوات مرتبة ومرقمة بوضوح من البداية حتى نهو البند بالكامل.
                4. **أعمال الحماية والمعالجة (Curing & Protection) والأخطاء الشائعة التي يجب تلافيها في الموقع.**
            `;
        } else if (reportType === 'productivity_labor') {
            specificInstructions = `
                المطلوب إعداد: **تقرير تحليل معدلات الإنتاج والعمالة والمعدات للبند (Productivity, Labor & Equipment Analysis)**
                يجب أن يشمل التقرير الأقسام التالية بتنسيق HTML احترافي وجداول واضحة ومباشرة دون تكرار منطوق البند:
                1. **تشكيل طاقم العمل القياسي (Standard Crew Composition) ومعدل الإنتاج اليومي:**
                   - جدول يوضح: (المهنة / التخصص | العدد بالطاقم | المهام الأساسية | إنتاجية الطاقم في اليوم بالوحدة ${item.unit || ''}).
                2. **تحليل المعدات والآلات والأدوات المطلوبة للبند:**
                   - جدول يوضح: (المعدة / الآلة | القدرة / المواصفة | معدل الإنتاج اليومي | ملاحظات التشغيل).
                3. **حساب المدة الزمنية واليوميات المطلوبة لإنجاز البند:**
                   - جدول يحسب عدد أيام العمل (لطاقم واحد، أو لطاقمين، أو 3 أطقم) لإنهاء الكمية التعاقدية (${contractQty} ${item.unit || ''}) والكمية المتبقية (${remainingQty} ${item.unit || ''}).
                4. **توصيات رفع كفاءة الإنتاج وتقليل الفاقد الزمني في الموقع.**
            `;
        } else if (reportType === 'inspection_quality') {
            specificInstructions = `
                المطلوب إعداد: **نموذج فحص واستلام واشتراطات الجودة للبند (Inspection Request / ITP & QC Checklist)**
                يجب أن يشمل التقرير الأقسام التالية بتنسيق HTML رسمي قابل للطباعة والتوقيع دون تكرار منطوق البند:
                1. **جدول قائمة الفحص والاستلام الموقعي (Site Inspection Checklist):**
                   - الأعمدة: (م | عنصر الفحص والاشتراط الفني طبقاً للكود المصري | التفاوت المسموح به (Tolerance) | طريقة الفحص / القياس | النتيجة: مطابق / غير مطابق / ملاحظات).
                   - يشمل الفحص قبل التنفيذ (التحضير والخامات)، والفحص أثناء التنفيذ، والفحص النهائي عند الاستلام.
                2. **الاختبارات المعملية والموقعية المطلوبة لاعتماد البند (Required Tests & Sampling):**
                   - نوع الاختبار، معدل أخذ العينات، وحدود القبول والرفض الكودية.
                3. **محضر الاستلام والتوقيعات الرسمية:**
                   - جدول توقيعات رسمي في نهاية النموذج (مهندس التنفيذ - المقاول | مهندس ضبط الجودة QC | مهندس الاستشاري المشرف | قرار الاستلام والاعتماد).
            `;
        }

        const prompt = `
            أنت استشاري هندسي ومدير مكتب فني وضبط جودة (30+ سنة خبرة في المشروعات الهندسية والكود المصري ECP).
            بيانات استرشادية لك فقط لفهم طبيعة البند (لا تكررها ولا تعد كتابتها في التقرير):
            - المشروع: ${projectContext?.projectName || 'المشروع الهندسي'} | المقاول: ${projectContext?.contractor || '-'}
            - رقم البند: ${item.itemCode || '-'} (${item.batchName || '-'})
            - منطوق البند للاسترشاد فقط: "${item.description}"
            - الوحدة: ${item.unit} | الكمية التعاقدية: ${contractQty} | الكمية المنفذة: ${execQty} | الكمية المتبقية: ${remainingQty} | الفئة: ${unitPrice} ج.م

            ${specificInstructions}

            قواعد صارمة وإلزامية (لمنع الإطالة والتكرار وتشوه الجداول):
            1. **ممنوع منعاً باتاً إعادة كتابة منطوق البند الكامل أو نص بيان الأعمال في أي مكان بالتقرير** (لا في العنوان، ولا في المقدمة، ولا داخل الفقرات، ولا داخل الجداول). اكتفِ عند الحاجة بالإشارة المختصرة جداً لنوع العمل في كلمتين أو ثلاث (مثل: "بند رقم ${item.itemCode || '-'}" أو اسم العملية المختصر فقط) حتى لا يطول التقرير بدون فائدة.
            2. لا تضع جدولاً لبيانات البند التعاقدية، لأن الترويسة المختصرة معروضة بالفعل أعلى التقرير. ادخل في صلب التحليل الهندسي مباشرة.
            3. أخرج كود HTML نظيف فقط (بدون \`\`\`html أو \`\`\`).
            4. تناسب عروض أعمدة الجداول:
               - ضع كل جدول داخل: <div class="table-responsive-wrapper" style="width:100%; overflow-x:auto; margin:14px 0;"><table style="width:100%; border-collapse:collapse;">...</table></div>
               - لا تضع خاصية white-space: nowrap أو min-width كبيرة على خلايا الجداول حتى تستجيب الجمل للتكسير التلقائي عند تعديل عروض الأعمدة.
            5. استخدم صناديق تنبيه وملاحظات أنيقة (<div class="info-box editable-box">, <div class="success-box editable-box">, <div class="warning-box editable-box">).
            6. اجعل جميع الأرقام والمعدلات والحسابات دقيقة ومبنية على الكميات الفعلية للبند.
        `;

        try {
            const result = await safeGenerateContent(MODEL_SMART, { contents: prompt });
            const cleanBody = (result.text || '')
                .replace(/^```html/i, '')
                .replace(/^```/i, '')
                .replace(/```$/i, '')
                .trim();
            return `${itemHeaderSummaryHtml}\n${cleanBody}\n${getAiFooter(result.usedModel)}`;
        } catch (e) {
            return `${itemHeaderSummaryHtml}<div class="warning-box editable-box">تعذر توليد التقرير حالياً، يرجى المحاولة مرة أخرى.</div>`;
        }
    },

    async discussOrModifyReportHtml(params: {
        reportHtml: string;
        instruction?: string;
        audioBlob?: Blob;
        mode?: 'auto' | 'edit' | 'discuss';
        history?: { role: 'user' | 'assistant'; text: string }[];
    }): Promise<{
        action: 'discuss' | 'edit';
        transcript: string;
        reply: string;
        updatedHtml?: string;
    }> {
        const cleanInstruction = (params.instruction || '').trim();
        if (!cleanInstruction && !params.audioBlob) {
            return {
                action: 'discuss',
                transcript: '',
                reply: 'يرجى كتابة أمر أو تسجيل رسالة صوتية أولاً.',
            };
        }

        const modeInstruction =
            params.mode === 'edit'
                ? 'المستخدم يطلب **تعديلاً أو إضافة** على التقرير نفسه (`action: "edit"`). قم بتنفيذ التعديل المطلوب وإرجاع كامل كود HTML المحدّث للتقرير في `updatedHtml`.'
                : params.mode === 'discuss'
                    ? 'المستخدم يطلب **مناقشة أو استفساراً أو شرحاً** حول التقرير (`action: "discuss"`). لا تعدّل التقرير واجعل `updatedHtml` فارغاً، وقدّم إجابة واضحة ومفصلة في `reply`.'
                    : 'حدد تلقائياً: إذا كان الطلب يتضمن تعديل رقم/نسبة/نص/جدول أو إضافة بند/نقاط/توصيات/فقرة/صف أو حذف أو إعادة صياغة جزئية من التقرير، اختر `action: "edit"` وأرجع كامل كود HTML المحدّث في `updatedHtml`. أما إذا كان سؤالاً أو نقاشاً أو طلباً للشرح/المراجعة دون تعديل جسم التقرير، فاختر `action: "discuss"`.';

        const historyBlock =
            params.history && params.history.length > 0
                ? `\nسجل النقاش السابق حول هذا التقرير:\n${params.history
                      .slice(-6)
                      .map((h) => `${h.role === 'user' ? 'المهندس' : 'الاستشاري'}: ${h.text}`)
                      .join('\n')}\n`
                : '';

        const prompt = `
            **ROLE:** كبير الاستشاريين الهندسيين ومحرر تقارير المكتب الفني والأسعار (Senior Engineering Consultant & Technical Report Editor - Egypt).
            **TASK:** معالجة أمر المستخدم (${params.audioBlob ? 'أمر صوتي مسجل' : 'أمر كتابي'}) بخصوص التقرير الهندسي التالي.

            ${modeInstruction}
            ${historyBlock}
            ${cleanInstruction ? `**أمر المستخدم الكتابي:**\n"${cleanInstruction}"\n` : '**ملاحظة:** استمع بدقة للتسجيل الصوتي المرفق واستخرج نص الأمر كاملاً في الحقل `transcript` باللغة العربية، ثم نفّذه.'}

            **التقرير الحالي (HTML):**
            \`\`\`html
            ${params.reportHtml}
            \`\`\`

            **قواعد صارمة جداً عند اختيار \`action: "edit"\`:**
            1. أرجع **كامل كود HTML للتقرير** بعد تطبيق التعديل أو الإضافة المطلوبة في \`updatedHtml\`، بحيث لا يضيع أي قسم أو جدول أو تنسيق من الأجزاء غير المطلوب تعديلها.
            2. حافظ على نفس الفئات والعناصر الموجودة (\`table-responsive-wrapper\`, \`pricing-compact-table\`, \`boq-summary-mini-table\`, \`info-box\`, \`success-box\`, \`warning-box\`, \`cost-box\`, \`editable-box\`, سمات \`data-calc-*\`).
            3. إذا تم تعديل أسعار أو كميات أو نسب هالك أو مصاريف غير مباشرة أو أرباح أو إضافة صفوف بجداول حسابات، حدّث الحسابات والإجماليات المرتبطة بدقة متناهية.
            4. إذا طلب إضافة نقاط أو فقرة أو ملاحظات في جزئية معينة، أدرجها في الموضع الهندسي المناسب بنفس تنسيق التقرير.
            5. لا تضع علامات \`\`\`html داخل \`updatedHtml\`.

            **OUTPUT FORMAT (STRICT JSON ONLY):**
            {
              "action": "edit" | "discuss",
              "transcript": "نص الطلب كما فهمته (أو تفريغ الصوت بالعربية)",
              "reply": "رد موجز وواضح للمستخدم يشرح ما تم تعديله أو يجيب عن سؤاله بالتفصيل",
              "updatedHtml": "كود HTML الكامل المحدّث في حالة edit فقط، أو نص فارغ في حالة discuss"
            }
        `;

        const schema = {
            type: Type.OBJECT,
            properties: {
                action: { type: Type.STRING, enum: ['discuss', 'edit'] },
                transcript: { type: Type.STRING },
                reply: { type: Type.STRING },
                updatedHtml: { type: Type.STRING },
            },
            required: ['action', 'transcript', 'reply'],
        };

        try {
            const parts: any[] = [];
            if (params.audioBlob) {
                const audioPart = await fileToPart(params.audioBlob);
                parts.push(audioPart);
            }
            parts.push({ text: prompt });

            const result = await safeGenerateContent(MODEL_SMART, {
                contents: { parts },
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: schema,
                },
            });

            const rawText = (result.text || '').replace(/```json/gi, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(rawText);

            const resolvedAction: 'discuss' | 'edit' =
                params.mode === 'discuss'
                    ? 'discuss'
                    : params.mode === 'edit' && parsed.updatedHtml
                        ? 'edit'
                        : parsed.action === 'edit' && parsed.updatedHtml && String(parsed.updatedHtml).trim().length > 20
                            ? 'edit'
                            : 'discuss';

            const cleanedHtml =
                resolvedAction === 'edit' && parsed.updatedHtml
                    ? String(parsed.updatedHtml)
                          .replace(/^```html/i, '')
                          .replace(/^```/i, '')
                          .replace(/```$/i, '')
                          .trim()
                    : undefined;

            return {
                action: resolvedAction,
                transcript: String(parsed.transcript || cleanInstruction || 'أمر صوتي').trim(),
                reply: String(parsed.reply || (resolvedAction === 'edit' ? 'تم تنفيذ التعديل المطلوب على التقرير.' : 'تمت مراجعة التقرير.')).trim(),
                updatedHtml: cleanedHtml,
            };
        } catch (err) {
            console.error('discussOrModifyReportHtml failed:', err);
            throw new Error('تعذر معالجة الأمر على التقرير حالياً، يرجى المحاولة مرة أخرى.');
        }
    },

    async inspectSitePhoto(
        imageInput: Blob | File | string,
        boqItems: BOQItem[] = [],
        projectName: string = ''
    ): Promise<{
        detectedWork: string;
        workStage: string;
        qualityStatus: 'مطابق' | 'مقبول بملاحظات' | 'يحتاج معالجة';
        qualityAssessment: string;
        safetyStatus: 'آمن' | 'تحذير متوسط' | 'خطر - يلزم تدخل';
        safetyAssessment: string;
        suggestedBoqItemId: string;
        suggestedBoqCode: string;
        suggestedBoqDescription: string;
        suggestedWorkCategory: string;
        recommendations: string[];
        conciseNote: string;
    }> {
        const fastCompressToInlinePart = async (input: Blob | File | string, maxDim = 512, quality = 0.65) => {
            let srcUrl = '';
            let revoke = false;
            try {
                if (typeof input === 'string') {
                    if (input.startsWith('data:') || input.startsWith('blob:')) {
                        srcUrl = input;
                    } else {
                        const resp = await fetch(input);
                        const b = await resp.blob();
                        srcUrl = URL.createObjectURL(b);
                        revoke = true;
                    }
                } else {
                    srcUrl = URL.createObjectURL(input);
                    revoke = true;
                }

                return await new Promise<{ inlineData: { data: string; mimeType: string } }>((resolve, reject) => {
                    const img = new Image();
                    img.onload = () => {
                        try {
                            let w = img.naturalWidth || img.width || 512;
                            let h = img.naturalHeight || img.height || 384;
                            if (w > maxDim || h > maxDim) {
                                if (w >= h) {
                                    h = Math.max(1, Math.round((h * maxDim) / w));
                                    w = maxDim;
                                } else {
                                    w = Math.max(1, Math.round((w * maxDim) / h));
                                    h = maxDim;
                                }
                            }
                            const canvas = document.createElement('canvas');
                            canvas.width = w;
                            canvas.height = h;
                            const ctx = canvas.getContext('2d');
                            if (!ctx) throw new Error('Canvas unavailable');
                            ctx.fillStyle = '#FFFFFF';
                            ctx.fillRect(0, 0, w, h);
                            ctx.drawImage(img, 0, 0, w, h);
                            const dataUrl = canvas.toDataURL('image/jpeg', quality);
                            if (revoke) URL.revokeObjectURL(srcUrl);
                            resolve({
                                inlineData: {
                                    data: dataUrl.split(',')[1] || '',
                                    mimeType: 'image/jpeg',
                                },
                            });
                        } catch (e) {
                            if (revoke) URL.revokeObjectURL(srcUrl);
                            reject(e);
                        }
                    };
                    img.onerror = (e) => {
                        if (revoke) URL.revokeObjectURL(srcUrl);
                        reject(e);
                    };
                    img.src = srcUrl;
                });
            } catch {
                if (revoke && srcUrl) URL.revokeObjectURL(srcUrl);
                if (typeof input === 'string' && input.startsWith('data:')) {
                    const [header, b64] = input.split(',');
                    const m = header.match(/data:([^;]+)/i);
                    return { inlineData: { data: b64 || '', mimeType: m ? m[1] : 'image/jpeg' } };
                }
                const fObj = input instanceof File
                    ? input
                    : input instanceof Blob
                        ? new File([input], 'photo.jpg', { type: input.type || 'image/jpeg' })
                        : new File([], 'photo.jpg', { type: 'image/jpeg' });
                return await fileToPart(fObj, true);
            }
        };

        const boqList = (boqItems || []).slice(0, 40);
        const boqContext = boqList.length > 0
            ? boqList.map(b => `${b.id}|${b.itemCode || '-'}|${(b.description || '').slice(0, 75)}`).join('\n')
            : 'لا توجد مقايسة مسجلة — اقترح توصيف البند القياسي.';

        const prompt = `افحص صورة الموقع الإنشائي للمشروع (${projectName || 'إنشائي'}) بدقة وسرعة وفق الكود المصري (ECP) وأرجع JSON فقط:
بنود المقايسة (ID|Code|Desc):
${boqContext}

المطلوب باختصار واحترافية:
1. detectedWork: وصف العمل المرصود والمعدات/العناصر الظاهرة.
2. workStage: المرحلة (مثل: حفر، حدادة، نجارة، صب، مباني، تشطيبات).
3. qualityStatus: ("مطابق" | "مقبول بملاحظات" | "يحتاج معالجة") + qualityAssessment (تقييم فني موجز).
4. safetyStatus: ("آمن" | "تحذير متوسط" | "خطر - يلزم تدخل") + safetyAssessment (تقييم السلامة ومهمات الوقاية).
5. suggestedBoqItemId: معرف البند المطابق من القائمة أعلاه أو ""، مع suggestedBoqCode و suggestedBoqDescription.
6. recommendations: 2 إلى 3 توصيات عملية قصيرة.
7. conciseNote: ملاحظة هندسية موجزة (سطر أول ملخص + نقاط مختصرة) لحفظها على الصورة.`;

        const schema = {
            type: Type.OBJECT,
            properties: {
                detectedWork: { type: Type.STRING },
                workStage: { type: Type.STRING },
                qualityStatus: { type: Type.STRING, enum: ['مطابق', 'مقبول بملاحظات', 'يحتاج معالجة'] },
                qualityAssessment: { type: Type.STRING },
                safetyStatus: { type: Type.STRING, enum: ['آمن', 'تحذير متوسط', 'خطر - يلزم تدخل'] },
                safetyAssessment: { type: Type.STRING },
                suggestedBoqItemId: { type: Type.STRING },
                suggestedBoqCode: { type: Type.STRING },
                suggestedBoqDescription: { type: Type.STRING },
                suggestedWorkCategory: { type: Type.STRING },
                recommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
                conciseNote: { type: Type.STRING },
            },
            required: [
                'detectedWork',
                'workStage',
                'qualityStatus',
                'qualityAssessment',
                'safetyStatus',
                'safetyAssessment',
                'suggestedBoqDescription',
                'recommendations',
                'conciseNote',
            ],
        };

        try {
            const imagePart = await fastCompressToInlinePart(imageInput, 512, 0.65);
            const result = await safeGenerateContent(MODEL_SMART, {
                contents: { parts: [imagePart, { text: prompt }] },
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: schema,
                    thinkingConfig: { thinkingLevel: 'LOW' },
                } as any,
            });

            const raw = (result.text || '{}').replace(/```json/gi, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(raw || '{}');

            const matchedBoq = parsed.suggestedBoqItemId
                ? boqList.find(b => b.id === parsed.suggestedBoqItemId)
                : undefined;

            const qualityStatus = (['مطابق', 'مقبول بملاحظات', 'يحتاج معالجة'].includes(parsed.qualityStatus)
                ? parsed.qualityStatus
                : 'مقبول بملاحظات') as 'مطابق' | 'مقبول بملاحظات' | 'يحتاج معالجة';

            const safetyStatus = (['آمن', 'تحذير متوسط', 'خطر - يلزم تدخل'].includes(parsed.safetyStatus)
                ? parsed.safetyStatus
                : 'تحذير متوسط') as 'آمن' | 'تحذير متوسط' | 'خطر - يلزم تدخل';

            return {
                detectedWork: String(parsed.detectedWork || 'أعمال موقع إنشائية').trim(),
                workStage: String(parsed.workStage || 'قيد التنفيذ').trim(),
                qualityStatus,
                qualityAssessment: String(parsed.qualityAssessment || '').trim(),
                safetyStatus,
                safetyAssessment: String(parsed.safetyAssessment || '').trim(),
                suggestedBoqItemId: matchedBoq ? matchedBoq.id : '',
                suggestedBoqCode: matchedBoq ? (matchedBoq.itemCode || '') : String(parsed.suggestedBoqCode || '').trim(),
                suggestedBoqDescription: matchedBoq
                    ? matchedBoq.description
                    : String(parsed.suggestedBoqDescription || '').trim(),
                suggestedWorkCategory: String(parsed.suggestedWorkCategory || '').trim(),
                recommendations: Array.isArray(parsed.recommendations)
                    ? parsed.recommendations.map((r: any) => String(r).trim()).filter(Boolean)
                    : [],
                conciseNote: String(parsed.conciseNote || '').trim(),
            };
        } catch (err) {
            console.error('inspectSitePhoto failed:', err);
            throw new Error('تعذر إتمام الفحص البصري للصورة حالياً. يرجى التأكد من الاتصال والمحاولة مرة أخرى.');
        }
    },

    async analyzeLogPhotoForEntry(
        images: (string | Blob | File)[],
        boqItems: BOQItem[] = [],
        workCategories: string[] = [],
        projectName: string = ''
    ): Promise<{
        logDescription: string;
        matchedBoqItemId: string;
        matchedBoqCode: string;
        matchedWorkCategory: string;
        matchReason: string;
    }> {
        if (!images || images.length === 0) {
            throw new Error('يرجى إرفاق صورة واحدة على الأقل قبل التحليل.');
        }

        const toFastPart = async (input: string | Blob | File) => {
            let srcUrl = '';
            let revoke = false;
            try {
                if (typeof input === 'string') {
                    if (input.startsWith('data:') || input.startsWith('blob:')) {
                        srcUrl = input;
                    } else {
                        const resp = await fetch(input);
                        const b = await resp.blob();
                        srcUrl = URL.createObjectURL(b);
                        revoke = true;
                    }
                } else {
                    srcUrl = URL.createObjectURL(input);
                    revoke = true;
                }
                return await new Promise<{ inlineData: { data: string; mimeType: string } }>((resolve, reject) => {
                    const img = new Image();
                    img.onload = () => {
                        try {
                            let w = img.naturalWidth || img.width || 512;
                            let h = img.naturalHeight || img.height || 384;
                            const maxDim = 512;
                            if (w > maxDim || h > maxDim) {
                                if (w >= h) {
                                    h = Math.max(1, Math.round((h * maxDim) / w));
                                    w = maxDim;
                                } else {
                                    w = Math.max(1, Math.round((w * maxDim) / h));
                                    h = maxDim;
                                }
                            }
                            const canvas = document.createElement('canvas');
                            canvas.width = w;
                            canvas.height = h;
                            const ctx = canvas.getContext('2d');
                            if (!ctx) throw new Error('Canvas unavailable');
                            ctx.fillStyle = '#FFFFFF';
                            ctx.fillRect(0, 0, w, h);
                            ctx.drawImage(img, 0, 0, w, h);
                            const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
                            if (revoke) URL.revokeObjectURL(srcUrl);
                            resolve({
                                inlineData: {
                                    data: dataUrl.split(',')[1] || '',
                                    mimeType: 'image/jpeg',
                                },
                            });
                        } catch (e) {
                            if (revoke) URL.revokeObjectURL(srcUrl);
                            reject(e);
                        }
                    };
                    img.onerror = (e) => {
                        if (revoke) URL.revokeObjectURL(srcUrl);
                        reject(e);
                    };
                    img.src = srcUrl;
                });
            } catch {
                if (revoke && srcUrl) URL.revokeObjectURL(srcUrl);
                const fileObj = input instanceof File
                    ? input
                    : input instanceof Blob
                        ? new File([input], 'log_photo.jpg', { type: input.type || 'image/jpeg' })
                        : new File([], 'log_photo.jpg', { type: 'image/jpeg' });
                return await fileToPart(fileObj, true);
            }
        };

        const boqList = (boqItems || []).slice(0, 45);
        const boqContext = boqList.length > 0
            ? boqList.map(b => `${b.id}|${b.itemCode || '-'}|${(b.description || '').slice(0, 75)}`).join('\n')
            : 'لا توجد بنود مقايسة مسجلة حالياً.';

        const categoriesContext = workCategories.length > 0
            ? workCategories.join(' | ')
            : 'أعمال حفر وردم | أعمال خرسانات | أعمال مباني | أعمال تشطيبات ودهانات | أعمال كهرباء وإنارة | أعمال سباكة وصحي';

        const prompt = `حلل صور الموقع للمشروع (${projectName || 'إنشائي'}) لملء يومية الموقع الميدانية وأرجع JSON فقط:
1. logDescription: بيان يومية هندسي عربي رسمي موجز (3 إلى 4 جمل) يصف الأعمال الجارية والمعدات/العناصر وملاحظات الجودة والسلامة.
2. matchedBoqItemId: معرف البند المطابق من قائمة المقايسة أدناه أو "".
3. matchedWorkCategory: التصنيف المطابق من قائمة التصنيفات أدناه.
4. matchReason: جملة قصيرة توضح سبب الربط.

التصنيفات المتاحة:
${categoriesContext}

بنود المقايسة (ID|Code|Desc):
${boqContext}`;

        const schema = {
            type: Type.OBJECT,
            properties: {
                logDescription: { type: Type.STRING },
                matchedBoqItemId: { type: Type.STRING },
                matchedBoqCode: { type: Type.STRING },
                matchedWorkCategory: { type: Type.STRING },
                matchReason: { type: Type.STRING },
            },
            required: ['logDescription', 'matchedBoqItemId', 'matchedWorkCategory', 'matchReason'],
        };

        try {
            const parts: any[] = [];
            for (const img of images.slice(0, 3)) {
                parts.push(await toFastPart(img));
            }
            parts.push({ text: prompt });

            const result = await safeGenerateContent(MODEL_SMART, {
                contents: { parts },
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: schema,
                    thinkingConfig: { thinkingLevel: 'LOW' },
                } as any,
            });

            const raw = (result.text || '{}').replace(/```json/gi, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(raw || '{}');

            const matchedBoq = parsed.matchedBoqItemId
                ? boqList.find(b => b.id === parsed.matchedBoqItemId)
                : undefined;

            const exactCat = workCategories.find(c => c.trim() === String(parsed.matchedWorkCategory || '').trim()) || '';

            return {
                logDescription: String(parsed.logDescription || '').trim(),
                matchedBoqItemId: matchedBoq ? matchedBoq.id : '',
                matchedBoqCode: matchedBoq ? (matchedBoq.itemCode || '') : String(parsed.matchedBoqCode || '').trim(),
                matchedWorkCategory: exactCat || String(parsed.matchedWorkCategory || '').trim(),
                matchReason: String(parsed.matchReason || '').trim(),
            };
        } catch (err) {
            console.error('analyzeLogPhotoForEntry failed:', err);
            throw new Error('تعذر تحليل الصورة لملء بيان اليومية حالياً. يرجى المحاولة مرة أخرى.');
        }
    }
};
