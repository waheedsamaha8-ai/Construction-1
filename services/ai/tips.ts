
import { safeGenerateContent, MODEL_SMART, getAiFooter, CONSULTANT_STYLE_INSTRUCTION, getStaticFallbackReport } from './core';

export const tipsService = {
    async explainEngineeringConcept(tip: string): Promise<{html: string}> {
        const prompt = `
            **ACT AS:** 
            A Senior Engineering Consultant (استشاري هندسي خبير) with 25+ years of experience.
            You value **Quality over Quantity**. You hate filler content.

            **THE TOPIC:**
            "${tip}"

            **TASK:**
            Create a **Dynamic Professional Engineering Brief** explaining this topic.

            **ADAPTIVE STRUCTURE STRATEGY (المبدأ الديناميكي):**
            1.  **Do NOT** force a fixed list. 
            2.  **ANALYZE** the topic first. What does a Site Engineer or Project Manager *really* need to know about it?
            3.  **SELECT** only the relevant sections from the "Engineering Arsenal" below.
            4.  **OMIT** any section that is not directly useful or relevant to this specific topic.
            5.  **ADD CUSTOM SECTIONS:** You have full authority to create NEW sections (e.g., "Mix Design", "Wiring Diagram", "Calculations") if this specific topic needs it.

            **THE ENGINEERING ARSENAL (Menu of Potential Sections):**
            *   *Definition:* Brief technical definition.
            *   *Execution:* Practical steps (How to do it?).
            *   *Standards & Codes:* Specific ECP/ASTM/ACI limits (Values, not just names).
            *   *Common Mistakes:* What goes wrong? How to detect it? (\`warning-box\`).
            *   *QC/Inspection:* How to hand it over?
            *   *Cost/Rates:* Consumption rates or Rules of Thumb (\`cost-box\`).
            *   *Safety:* HSE risks associated with this specific task.
            *   *Design:* Design considerations (only if relevant).
            *   *Contract:* FIDIC implications (only if relevant).
            *   *Pro Tips:* Consultant's secrets (\`success-box\`).

            **FORMATTING RULES:**
            - **Output:** Clean HTML only (No Markdown).
            - **Layout:** Full Width.
            - **Style:** Use the following classes for sections you choose to include:
                - \`<div class="info-box editable-box">...</div>\`
                - \`<div class="highlight-box editable-box">...</div>\`
                - \`<div class="warning-box editable-box">...</div>\`
                - \`<div class="success-box editable-box">...</div>\`
                - \`<div class="cost-box editable-box">...</div>\`
                - Headers: \`<h2 style="color: #1e3a8a; border-bottom: 2px solid #3b82f6; padding-bottom: 10px; margin-top: 30px; font-size: 1.4rem;">Title</h2>\`

            **GOAL:**
            A powerful, concise, and expert-level reference document. Not a generic textbook entry.
        `;

        try {
            // Use safeGenerateContent which implements the Waterfall Strategy (Flash -> Lite -> Legacy)
            const result = await safeGenerateContent(MODEL_SMART, { 
                contents: prompt, 
                config: { 
                    systemInstruction: CONSULTANT_STYLE_INSTRUCTION 
                } 
            });
            return { html: result.text + getAiFooter(result.usedModel) };
        } catch (e: any) { 
            console.error("Tip Generation Error (Waterfall Failed):", e);
            // Fallback to offline static report instead of error message
            const fallbackHtml = getStaticFallbackReport(tip, "Engineering Concept");
            return { html: fallbackHtml }; 
        }
    },

    async generateEngineeringTip(): Promise<{category: string, tip: string, key: string} | null> {
        const prompt = `أنت خبير هندسي استشاري (Consultant Engineer).
قم بتوليد "معلومة هندسية" واحدة فقط، جديدة ومفيدة جداً وعملية، في أحد المجالات الهندسية التالية (مدني، عمارة، كهرباء، ميكانيكا، إدارة مشروعات، عقود، سلامة وصحة مهنية، مساحة، ديكور، أو أكواد).
يجب أن تكون المعلومة دقيقة، مركزة، ولا تزيد عن 3 أسطر.
قم بإرجاع النتيجة بصيغة JSON فقط كالتالي:
{
  "category": "اسم المجال الهندسي (مثال: هندسة مدنية وخرسانات)",
  "tip": "نص المعلومة الهندسية هنا",
  "key": "civil_concrete" // أو أي مفتاح مناسب بالإنجليزية
}`;
        try {
            const result = await safeGenerateContent(MODEL_SMART, {
                contents: prompt,
                config: {
                    responseMimeType: "application/json"
                }
            });
            const parsed = JSON.parse(result.text);
            return parsed;
        } catch (e) {
            console.error("Error generating tip:", e);
            return null;
        }
    }
};
