import { safeGenerateContent, MODEL_SMART, getAiFooter, CONSULTANT_STYLE_INSTRUCTION, getStaticFallbackReport, isEmergencyFallbackText } from './core';
import { db } from '../firebaseConfig';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getCategoryLabel } from '../tipsData';

export interface StoredAiTip {
    id: string;
    key: string;
    category: string;
    tip: string;
    generatedAt: number;
    isAiGenerated: true;
}

interface AiTipsLocalState {
    tips: StoredAiTip[];
    lastGeneratedAt: number;
    lastAttemptAt?: number;
}

const AI_TIPS_LOCAL_KEY = 'construction_pro_ai_tips_v1';
const AUTO_TIP_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000; // Every 3 days to protect free quota
const AUTO_TIP_RETRY_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6-hour backoff if API unavailable
const MAX_STORED_AI_TIPS = 150;

const VALID_TIP_KEYS = [
    'civil_concrete',
    'architecture_finishing',
    'interior_design_rules',
    'space_planning',
    'mep_systems',
    'project_management',
    'contract_claims',
    'hse_safety',
    'surveying_geotech',
    'codes_standards',
];

let inFlightPeriodicPromise: Promise<{ tips: StoredAiTip[]; newTip: StoredAiTip | null }> | null = null;

const readLocalAiTipsState = (): AiTipsLocalState => {
    if (typeof window === 'undefined') return { tips: [], lastGeneratedAt: 0, lastAttemptAt: 0 };
    try {
        const raw = localStorage.getItem(AI_TIPS_LOCAL_KEY);
        if (!raw) return { tips: [], lastGeneratedAt: 0, lastAttemptAt: 0 };
        const parsed = JSON.parse(raw);
        const tips = Array.isArray(parsed?.tips)
            ? parsed.tips.filter((t: any) => t && typeof t.tip === 'string' && t.tip.trim().length > 10)
            : [];
        return {
            tips,
            lastGeneratedAt: Number(parsed?.lastGeneratedAt) || 0,
            lastAttemptAt: Number(parsed?.lastAttemptAt) || 0,
        };
    } catch {
        return { tips: [], lastGeneratedAt: 0, lastAttemptAt: 0 };
    }
};

const writeLocalAiTipsState = (state: AiTipsLocalState) => {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(AI_TIPS_LOCAL_KEY, JSON.stringify({
            tips: state.tips.slice(0, MAX_STORED_AI_TIPS),
            lastGeneratedAt: state.lastGeneratedAt || 0,
            lastAttemptAt: state.lastAttemptAt || 0,
        }));
    } catch {}
};

const mergeAiTipsLists = (listA: StoredAiTip[], listB: StoredAiTip[]): StoredAiTip[] => {
    const seen = new Set<string>();
    const combined = [...listA, ...listB]
        .filter((item) => item && typeof item.tip === 'string' && item.tip.trim().length > 10)
        .sort((a, b) => (b.generatedAt || 0) - (a.generatedAt || 0));

    const result: StoredAiTip[] = [];
    for (const item of combined) {
        const norm = item.tip.trim().replace(/\s+/g, ' ');
        if (seen.has(norm)) continue;
        seen.add(norm);
        result.push({
            id: item.id || `ai_${item.generatedAt || Date.now()}_${result.length}`,
            key: VALID_TIP_KEYS.includes(item.key) ? item.key : 'codes_standards',
            category: item.category || getCategoryLabel(item.key || 'codes_standards'),
            tip: item.tip.trim(),
            generatedAt: Number(item.generatedAt) || Date.now(),
            isAiGenerated: true,
        });
        if (result.length >= MAX_STORED_AI_TIPS) break;
    }
    return result;
};

export const getStoredAiTips = (): StoredAiTip[] => {
    return readLocalAiTipsState().tips;
};

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

    async generateEngineeringTip(recentTips: string[] = []): Promise<{category: string, tip: string, key: string} | null> {
        const avoidBlock = recentTips.length > 0
            ? `\nتجنب تكرار هذه المواضيع السابقة:\n- ${recentTips.slice(0, 6).map(t => t.slice(0, 65)).join('\n- ')}`
            : '';

        const prompt = `أنت استشاري هندسي خبير. ولّد "معلومة هندسية" واحدة جديدة وعملية ومفيدة (2 إلى 3 أسطر فقط، بأرقام أو قيم كودية دقيقة عند اللزوم) في أحد التخصصات:
مدني وخرسانات (civil_concrete)، عمارة وتشطيبات (architecture_finishing)، تصميم داخلي (interior_design_rules)، تخطيط مساحات (space_planning)، كهرباء وميكانيكا (mep_systems)، إدارة مشروعات (project_management)، عقود ومطالبات (contract_claims)، سلامة وصحة مهنية (hse_safety)، مساحة وتربة (surveying_geotech)، أو أكواد ومواصفات (codes_standards).${avoidBlock}
أرجع JSON فقط بالشكل:
{"key":"civil_concrete","category":"هندسة مدنية وخرسانات","tip":"نص المعلومة هنا"}`;

        try {
            const result = await safeGenerateContent(MODEL_SMART, {
                contents: prompt,
                config: {
                    responseMimeType: "application/json"
                }
            });

            if (!result?.text || isEmergencyFallbackText(result.text) || String(result.usedModel || '').includes('Emergency')) {
                return null;
            }

            const cleaned = result.text
                .replace(/^```(?:json)?\s*/i, '')
                .replace(/```\s*$/i, '')
                .trim();

            const parsed = JSON.parse(cleaned);
            const tipText = typeof parsed?.tip === 'string' ? parsed.tip.trim() : '';
            if (!tipText || tipText.length < 20 || tipText.includes('<div')) {
                return null;
            }

            const rawKey = typeof parsed?.key === 'string' ? parsed.key.trim() : '';
            const normalizedKey = VALID_TIP_KEYS.includes(rawKey) ? rawKey : 'codes_standards';
            const categoryLabel = typeof parsed?.category === 'string' && parsed.category.trim()
                ? parsed.category.trim()
                : getCategoryLabel(normalizedKey);

            return {
                key: normalizedKey,
                category: categoryLabel,
                tip: tipText,
            };
        } catch (e) {
            console.error("Error generating tip:", e);
            return null;
        }
    },

    async syncAndEnsurePeriodicAiTip(): Promise<{ tips: StoredAiTip[]; newTip: StoredAiTip | null }> {
        if (inFlightPeriodicPromise) return inFlightPeriodicPromise;

        inFlightPeriodicPromise = (async () => {
            let localState = readLocalAiTipsState();
            let cloudTips: StoredAiTip[] = [];
            let cloudLastGeneratedAt = 0;

            // 1. Sync existing AI tips & timestamp from Firestore (prevents multi-device duplicate quota usage)
            try {
                const snap = await Promise.race([
                    getDoc(doc(db, 'market_data', 'ai_engineering_tips')),
                    new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500))
                ]);
                if (snap && snap.exists()) {
                    const data = snap.data();
                    if (Array.isArray(data?.tips)) {
                        cloudTips = data.tips;
                    }
                    cloudLastGeneratedAt = Number(data?.lastGeneratedAt) || 0;
                }
            } catch {}

            let mergedTips = mergeAiTipsLists(localState.tips, cloudTips);
            let effectiveLastGeneratedAt = Math.max(localState.lastGeneratedAt || 0, cloudLastGeneratedAt);

            writeLocalAiTipsState({
                tips: mergedTips,
                lastGeneratedAt: effectiveLastGeneratedAt,
                lastAttemptAt: localState.lastAttemptAt || 0,
            });

            const now = Date.now();
            const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
            const intervalElapsed = now - effectiveLastGeneratedAt >= AUTO_TIP_INTERVAL_MS;
            const retryCooldownElapsed = now - (localState.lastAttemptAt || 0) >= AUTO_TIP_RETRY_COOLDOWN_MS;

            if (!isOnline || !intervalElapsed || !retryCooldownElapsed) {
                return { tips: mergedTips, newTip: null };
            }

            // 2. Lock attempt timestamp locally before calling Gemini so reloads won't repeat requests
            writeLocalAiTipsState({
                tips: mergedTips,
                lastGeneratedAt: effectiveLastGeneratedAt,
                lastAttemptAt: now,
            });

            const recentSnippets = mergedTips.slice(0, 6).map((t) => t.tip);
            const generated = await tipsService.generateEngineeringTip(recentSnippets);

            if (!generated) {
                return { tips: mergedTips, newTip: null };
            }

            const newTip: StoredAiTip = {
                id: `ai_${now}`,
                key: generated.key,
                category: generated.category,
                tip: generated.tip,
                generatedAt: now,
                isAiGenerated: true,
            };

            mergedTips = mergeAiTipsLists([newTip], mergedTips);
            effectiveLastGeneratedAt = now;

            writeLocalAiTipsState({
                tips: mergedTips,
                lastGeneratedAt: effectiveLastGeneratedAt,
                lastAttemptAt: now,
            });

            // 3. Persist back to Firestore so other devices get this tip without spending quota
            try {
                await setDoc(doc(db, 'market_data', 'ai_engineering_tips'), {
                    tips: mergedTips,
                    lastGeneratedAt: effectiveLastGeneratedAt,
                    updatedAt: new Date(now).toISOString(),
                });
            } catch {}

            return { tips: mergedTips, newTip };
        })().finally(() => {
            inFlightPeriodicPromise = null;
        });

        return inFlightPeriodicPromise;
    }
};
