
import { safeGenerateContent, MODEL_SMART, MODEL_COMPLEX, cleanNumber, fileToPart, getAiFooter, Type } from './core';
import { Project, ProjectLog, BOQItem, ProjectPayment, BOQItemReportType } from '../../types';

export const analysisService = {
    async parsePaymentDocument(file: File, projectBoq: BOQItem[] = []): Promise<any> {
        try {
            const filePart = await fileToPart(file, true);
            const boqContext = projectBoq.map(b => 
                `Code: ${b.itemCode} | Desc: ${b.description} | Unit: ${b.unit} | ContractQty: ${b.quantity} | UnitPrice: ${b.unitPrice}`
            ).join('\n');

            const prompt = `
                **ROLE:** Senior Quantity Surveyor (Construction).
                **TASK:** Analyze the attached Payment Certificate.
                **OFFICIAL BOQ (Reference):** ${boqContext}
                **OUTPUT:** JSON Format Only.
            `;

            const result = await safeGenerateContent(MODEL_SMART, { 
                contents: { parts: [filePart, { text: prompt }] }, 
                config: { responseMimeType: "application/json" } 
            });
            
            return JSON.parse(result.text || '{}');
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

    async transcribeAndRefineLetterText(audioBlob: Blob): Promise<string> {
        try {
            const filePart = await fileToPart(audioBlob);
            const prompt = `Transcribe and format as professional Engineering Letter (Arabic HTML). Use bold fonts for clarity.`;
            const result = await safeGenerateContent(MODEL_SMART, {
                contents: { parts: [filePart, { text: prompt }] }
            });
            return result.text;
        } catch (e) { return ""; }
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

    async analyzeProjectMasterData(data: any): Promise<string> {
        const context = JSON.stringify(data);
        const prompt = `
            **IDENTITY:** Project Director (30+ Years Experience).
            **TASK:** Generate a High-Level Executive Dashboard Summary (Arabic HTML).
            
            **REQUIREMENTS:**
            1. **Mobile Optimization:** The dashboard MUST be 100% width on mobile screens. No side margins.
            2. **Financial Table:** Summarize Contract Value vs. Executed vs. Paid using \`width="100%"\`.
            3. **Status Assessment:** Clear statement on project health (Time/Cost/Quality).
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

            <h3>2. تقييم الأداء (Performance Evaluation)</h3>
            <div class="info-box editable-box">
                <p>تقييم عام لسير العمل بناءً على البيانات المتاحة.</p>
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
        // Use more logs for better context, but limit to avoid token limits if too many
        const recentLogs = logs.slice(0, 30).map(l => `[${l.date}] ${l.content}`).join('\n');
        
        const prompt = `
            **IDENTITY:** Site Supervision Consultant Engineer (مهندس استشاري مشرف على التنفيذ).
            **EXPERIENCE:** 25+ Years in Construction Supervision & Site Management.
            **PROJECT:** ${projectName}
            
            **INPUT DATA (SOURCE OF TRUTH):**
            1. **Project Context:** ${projectContext}
            2. **Site Diaries (Logs):** 
            ${recentLogs}

            **STRICT INSTRUCTIONS:**
            1. **Mobile Optimization:** The report MUST be 100% width on mobile screens. No side margins.
            2. **FACT-BASED ONLY:** You must ONLY use the provided "Site Diaries" and "Project Context". DO NOT invent dates, events, or completion percentages not mentioned.
            3. **ANALYSIS:** Analyze the sequence of logs to determine the *actual* current status.
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
        const boqItems = project.boqItems || [];
        const boqTotalValue = boqItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
        const boqExecutedValue = boqItems.reduce((sum, item) => sum + (item.executedQuantity * item.unitPrice), 0);
        const financialProgress = boqTotalValue > 0 ? (boqExecutedValue / boqTotalValue) * 100 : 0;

        const paymentsTotal = project.payments?.reduce((acc, p) => acc + (p.netAmount || 0), 0) || 0;
        
        const logsContext = logs.length > 0 
            ? logs.map(l => `[${l.date}] ${l.content}`).join('\n')
            : "لا يوجد يوميات مسجلة في هذه الفترة.";

        const paymentsContext = (project.payments || []).length > 0
            ? project.payments.map(p => `[${p.date}] Net: ${p.netAmount} EGP | Note: ${p.note}`).join('\n')
            : "لا يوجد مستخلصات.";
            
        const reportsContext = (project.engineeringReports || []).length > 0
            ? project.engineeringReports.map(r => `[${new Date(r.date).toLocaleDateString()}] ${r.type}: ${r.title}`).join('\n')
            : "لا توجد تقارير.";

        const rfisContext = (project.rfis || []).map(r => `[${r.date}] ${r.subject} - Status: ${r.status}`).join('\n');
        const ncrsContext = (project.ncrs || []).map(n => `[${n.issueDate}] ${n.description} - Status: ${n.status}`).join('\n');

        const prompt = `
            **ROLE:** Unified Engineering Consultant Center (المركز الاستشاري الموحد - يضم مدير عام، مدير تكاليف وعقود، مدير مكتب فني، ومدير موقع).
            **TASK:** Generate a Comprehensive Executive Report: "${title}" for the period (${start} to ${end}).
            **LANGUAGE:** Professional Arabic.
            
            **PROJECT DATA (SOURCE OF TRUTH - DO NOT HALLUCINATE OR INVENT DATA):**
            - Project Name: ${project.name}
            - Status: ${project.status}
            - Financial Progress: ${financialProgress.toFixed(1)}%
            - Total Contract Value: ${boqTotalValue.toLocaleString()} EGP
            - Total Executed Value: ${boqExecutedValue.toLocaleString()} EGP
            - Total Paid: ${paymentsTotal.toLocaleString()} EGP
            
            **LOGS DURING THIS PERIOD:**
            ${logsContext}
            
            **PAYMENTS HISTORY:**
            ${paymentsContext}
            
            **REPORTS HISTORY:**
            ${reportsContext}
            
            **RFIs & NCRs:**
            ${rfisContext}
            ${ncrsContext}

            **REQUIREMENTS:**
            1. **Mobile Optimization:** The report MUST be 100% width on mobile screens. No side margins or padding in the container.
            2. **Dynamic Tables:** Use \`width="100%"\` for all tables. Tables must be responsive and never overflow the screen. Use \`table-layout: auto\`.
            3. يجب أن يكون التقرير بناءً على اطلاع تام وفهم تام لجميع بيانات المشروع المذكورة أعلاه.
            4. يجب أن يكون التقرير شاملاً وكاملاً ويغطي جميع التفاصيل، ويعطي الموقف ويحلل موقف المشروع ونسبة تقدمه أو تأخره.
            5. يجب إعطاء البيانات المسجلة بدون أي تعديل أو بيانات وهمية.
            6. يجب تقديم النصائح والتوجيهات وتحليل المخاطر المتوقعة.
            
            **STRICT REPORT STRUCTURE (HTML):**
            
            <h1>${title} (${start} - ${end})</h1>

            <h3>1. الموقف التنفيذي والمالي (Executive & Financial Status)</h3>
            <div class="info-box editable-box">
                <p>تحليل شامل للموقف ونسبة التقدم أو التأخير بناءً على البيانات الحقيقية للمشروع.</p>
            </div>

            <h3>2. تحليل البيانات والأعمال المنجزة (Data & Completed Works Analysis)</h3>
            <div class="table-responsive">
                <table style="width:100%; border-collapse: collapse; margin: 10px 0; font-size: 0.9em;">
                    <thead>
                        <tr style="background-color: #f8f9fa; border-bottom: 2px solid #dee2e6;">
                            <th style="padding: 8px; text-align: right;">التاريخ</th>
                            <th style="padding: 8px; text-align: right;">البيانات المسجلة (أحداث/مستخلصات)</th>
                            <th style="padding: 8px; text-align: right;">تحليل الاستشاري</th>
                        </tr>
                    </thead>
                    <tbody>
                        <!-- Summarize actual data into rows. DO NOT INVENT DATA. -->
                    </tbody>
                </table>
            </div>

            <h3>3. تحليل المخاطر المتوقعة (Risk Analysis)</h3>
            <div class="warning-box editable-box">
                <p>تحليل المخاطر بناءً على المعطيات السابقة (تأخيرات، جودة، تدفق نقدي).</p>
            </div>

            <h3>4. توجيهات المركز الاستشاري (Consultant Directives)</h3>
            <div class="success-box editable-box">
                <ul>
                    <li><strong>توجيهات الإدارة العليا:</strong> ...</li>
                    <li><strong>توجيهات إدارة العقود والتكاليف:</strong> ...</li>
                    <li><strong>توجيهات المكتب الفني:</strong> ...</li>
                    <li><strong>توجيهات إدارة الموقع:</strong> ...</li>
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
            const prompt = `Extract BOQ Items to JSON Array: [{itemCode, description, unit, quantity, unitPrice}].`;
            const result = await safeGenerateContent(MODEL_SMART, {
                contents: { parts: [filePart, { text: prompt }] },
                config: { responseMimeType: "application/json" } 
            });
            const data = JSON.parse(result.text || '[]');
            return Array.isArray(data) ? data : [];
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
    }
};
