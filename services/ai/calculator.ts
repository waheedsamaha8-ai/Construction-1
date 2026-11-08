
import { safeGenerateContent, MODEL_SMART, MODEL_COMPLEX, cleanNumber, Type } from './core';
import { MaterialCalculationResult, PricingCalculationResult, MarketItem } from '../../types';
import { ENGINEERING_SPECS } from '../engineeringConstants';

// --- HELPERS ---

const extractQuantity = (text: string): number => {
    const match = text.match(/(\d+(\.\d+)?)/);
    return match ? parseFloat(match[0]) : 1;
};

// --- CONSTANTS ---
const BASELINE_MARKET_PRICES = `
    **REFERENCE MARKET PRICES (EGYPT - 2024/2025):**
    - Rebar Steel: ~48,000 - 52,000 EGP/Ton
    - Cement: ~2,600 - 2,800 EGP/Ton
    - Red Bricks: ~1,800 - 2,000 EGP/1000 Bricks
    - Sand: ~180 - 220 EGP/m3
    - Aggregates (Dolomite/Zalat): ~350 - 450 EGP/m3
    - Ceramics (Avg): ~250 - 400 EGP/m2
    - Porcelain: ~500 - 900 EGP/m2
    - Paints (Latex/Plastic): ~1,200 - 1,800 EGP/Drum (High Quality)
    - Gypsum Board: ~300 EGP/Sheet
    - Labor (Skilled): ~450-600 EGP/Day
    - Labor (Helper): ~250-350 EGP/Day
`;

// --- OFFLINE/HYBRID CALCULATOR ENGINES (MATERIALS ONLY) ---

// 1. Material Estimation (Hybrid: Best Match > AI > Fallback)
const calculateLocalMaterials = (input: string): MaterialCalculationResult | null => {
    const lowerInput = input.toLowerCase();
    const qty = extractQuantity(input);

    // BEST MATCH LOGIC (Scoring System)
    let bestMatchKey: string | null = null;
    let maxScore = 0;

    for (const [key, spec] of Object.entries(ENGINEERING_SPECS)) {
        const score = spec.keywords.reduce((acc, keyword) => {
            return lowerInput.includes(keyword) ? acc + 1 : acc;
        }, 0);

        if (score > maxScore) {
            maxScore = score;
            bestMatchKey = key;
        }
    }

    if (!bestMatchKey) return null;

    const spec = ENGINEERING_SPECS[bestMatchKey];
    const materials = spec.materials.map(mat => {
        const required = qty * mat.rate;
        const withWaste = required * (1 + (mat.waste / 100));
        return {
            materialName: mat.name,
            unit: mat.unit,
            quantityPerUnit: mat.rate,
            totalQuantity: parseFloat(required.toFixed(3)),
            wastePercentage: mat.waste,
            totalWithWaste: parseFloat(withWaste.toFixed(3))
        };
    });

    return {
        itemName: input, 
        inputQuantity: `${qty} ${spec.unit}`,
        notes: "تم الحساب باستخدام معدلات الاستهلاك الهندسية القياسية (مكتبة الكود المصري).",
        calculationBasis: `
            <strong>المرجع الهندسي:</strong> ${spec.basis}
            <br>
            <strong>منهجية الحساب:</strong> تم تطبيق معدلات الفقد (الهالك) الموضحة بالجدول لضمان دقة الطلب.
        `,
        materials: materials
    };
};

export const calculatorService = {
    // --- MATERIAL QS ENGINE ---
    async calculateMaterials(input: string): Promise<MaterialCalculationResult> {
        
        // 1. AI PATH (DEFAULT PRIORITY)
        if (navigator.onLine) {
            const schema = {
                type: Type.OBJECT,
                properties: {
                    itemName: { type: Type.STRING },
                    inputQuantity: { type: Type.STRING },
                    notes: { type: Type.STRING },
                    calculationBasis: { type: Type.STRING },
                    materials: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                materialName: { type: Type.STRING },
                                unit: { type: Type.STRING },
                                quantityPerUnit: { type: Type.NUMBER },
                                totalQuantity: { type: Type.NUMBER },
                                wastePercentage: { type: Type.NUMBER },
                                totalWithWaste: { type: Type.NUMBER }
                            }
                        }
                    }
                }
            };

            const prompt = `
                **ROLE:** Senior Quantity Surveyor & Technical Office Engineer (Egypt).
                **TASK:** Perform a highly accurate Material Quantity Survey for: "${input}".
                
                **MANDATORY ACCURACY RULES:**
                1.  **Scientific Breakdown:** Analyze the item constituents based on the **Egyptian Code of Practice (ECP)**.
                2.  **Consumption Rates:** Use standard engineering rates (e.g., Concrete m3 = 0.8m3 Gravel + 0.4m3 Sand + 350kg Cement).
                3.  **Real Waste:** Apply realistic site waste percentages (e.g., 5-10% for Mortar, 3% for Tiles).
                
                **CRITICAL - BASIS OF CALCULATION (أسس الحصر):**
                *   You MUST populate the 'calculationBasis' field with a detailed technical explanation in Arabic.
                *   **Explain the Formula:** (e.g., "Based on Mix Design for 250 kg/cm2...").
                *   **Justify Waste:** (e.g., "Added 5% waste for cutting and breakage").
                
                **OUTPUT:** JSON only.
                **LANG:** Arabic.
            `;

            try {
                const response = await safeGenerateContent(MODEL_SMART, { 
                    contents: prompt, 
                    config: { responseMimeType: "application/json", responseSchema: schema } 
                });
                const data = JSON.parse(response.text || '{}');
                return {
                    itemName: data.itemName || input,
                    inputQuantity: data.inputQuantity || "1 وحدة",
                    materials: Array.isArray(data.materials) ? data.materials.map((m: any) => ({
                        materialName: m.materialName || "خامة",
                        unit: m.unit || "وحدة",
                        quantityPerUnit: cleanNumber(m.quantityPerUnit),
                        totalQuantity: cleanNumber(m.totalQuantity),
                        wastePercentage: cleanNumber(m.wastePercentage),
                        totalWithWaste: cleanNumber(m.totalWithWaste)
                    })) : [],
                    notes: data.notes || "تم التقدير بواسطة الذكاء الاصطناعي.",
                    calculationBasis: data.calculationBasis || "تقدير هندسي استشاري."
                };
            } catch (e) {
                console.warn("AI Calc Failed, falling back to local library", e);
            }
        }

        // 2. LOCAL LIBRARY FALLBACK
        const localResult = calculateLocalMaterials(input);
        if (localResult) return localResult;

        return {
            itemName: input,
            inputQuantity: "1 وحدة",
            notes: "تعذر الاتصال بالخادم. يرجى المحاولة لاحقاً.",
            calculationBasis: "وضع غير متصل",
            materials: []
        };
    },

    // --- PRICING ENGINE (RADICAL UPDATE: AI ONLY - NO LOCAL FALLBACK) ---
    async calculatePricing(input: string, marketPrices: MarketItem[] = [], qsResult?: MaterialCalculationResult): Promise<PricingCalculationResult> {
        
        if (!navigator.onLine) {
            throw new Error("التسعير الذكي يتطلب اتصالاً بالإنترنت.");
        }

        // 1. Build Context from Market Data
        let marketContext = marketPrices
            .slice(0, 100)
            .map(m => `${m.name}: ${m.price} EGP/${m.unit}`)
            .join(' | ');
        
        // If app database is empty, inject baseline constants to ensure AI is never blind
        if (!marketContext || marketContext.length < 50) {
            marketContext = BASELINE_MARKET_PRICES;
        }
        
        // 2. Build STRICT Context from QS Result
        let qsStrictContext = "";
        if (qsResult && qsResult.materials.length > 0) {
            qsStrictContext = `
            **LOCKED MATERIAL LIST (MANDATORY):**
            You MUST use the exact materials below. DO NOT invent new materials.
            For each material, find the matching price in the Market Database or use current Egyptian Market Knowledge.
            
            ${qsResult.materials.map((m, i) => `
                ${i+1}. **${m.materialName}**
                   - Consumption (Total Qty with Waste): ${m.totalWithWaste}
                   - Unit: ${m.unit}
            `).join('\n')}
            `;
        }

        const schema = {
            type: Type.OBJECT,
            properties: {
                itemName: { type: Type.STRING },
                unit: { type: Type.STRING },
                currency: { type: Type.STRING },
                directCost: { type: Type.NUMBER },
                indirectCostPercent: { type: Type.NUMBER },
                profitPercent: { type: Type.NUMBER },
                finalUnitPrice: { type: Type.NUMBER },
                pricingBasis: { type: Type.STRING },
                breakdown: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            type: { type: Type.STRING, enum: ["Material", "Labor", "Equipment", "Tools"] },
                            description: { type: Type.STRING },
                            unit: { type: Type.STRING },
                            rate: { type: Type.NUMBER },
                            consumption: { type: Type.NUMBER },
                            cost: { type: Type.NUMBER }
                        }
                    }
                }
            },
            required: ["itemName", "finalUnitPrice", "pricingBasis", "breakdown", "directCost"]
        };

        const CONSULTANT_PROMPT = `
            **IDENTITY:** Senior Cost Control Manager (مدير التكاليف والتسعير).
            **TASK:** Generate a Detailed Unit Price Analysis (UPA) for: "${input}".
            
            **MARKET CONTEXT (SOURCE OF TRUTH):**
            ${marketContext}
            
            **METHODOLOGY (STRICT EXECUTION ORDER):**
            
            **STEP 1: MATERIALS**
            ${qsStrictContext ? qsStrictContext : "Analyze materials required."}
            *   ACTION: Use the Locked Material List. Apply prices from Market Context.
            *   If a price is missing in context, estimate based on 2024/2025 Egyptian prices.
            
            **STEP 2: LABOR (Workmanship)**
            *   ACTION: Define the crew (e.g., Carpenter + Helper).
            *   Set Daily Rate (e.g., 400-600 EGP).
            *   Set Productivity (Units/Day).
            *   Calculate: Unit Cost = Crew Cost / Productivity.
            
            **STEP 3: EQUIPMENT**
            *   ACTION: Add machinery (Mixers, Vibrators, Scaffolding).
            
            **STEP 4: TOOLS & CONSUMABLES**
            *   ACTION: Add "Tools & Sundries" (approx 3-5% of labor).
            
            **STEP 5: FINANCIALS**
            *   Direct Cost = Sum(Materials + Labor + Equipment + Tools).
            *   Indirect Cost (Overheads) ~20-25%.
            *   Profit ~15-20%.
            
            **OUTPUT:** JSON only. Language: Arabic.
        `;

        try {
            // TRY 1: Complex Model (Reasoning)
            const result = await safeGenerateContent(MODEL_COMPLEX, {
                contents: CONSULTANT_PROMPT,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: schema,
                    tools: [{ googleSearch: {} }], // Enable search for live pricing
                    temperature: 0.1
                }
            });

            const data = JSON.parse(result.text || '{}');
            
            return {
                itemName: data.itemName || input,
                unit: data.unit || "وحدة",
                directCost: cleanNumber(data.directCost),
                indirectCostPercent: cleanNumber(data.indirectCostPercent),
                profitPercent: cleanNumber(data.profitPercent),
                finalUnitPrice: cleanNumber(data.finalUnitPrice),
                breakdown: Array.isArray(data.breakdown) ? data.breakdown.map((item: any) => ({
                    type: item.type || 'Material',
                    description: item.description || '',
                    unit: item.unit || '',
                    rate: cleanNumber(item.rate),
                    consumption: cleanNumber(item.consumption),
                    cost: cleanNumber(item.cost)
                })) : [],
                currency: data.currency || "ج.م",
                pricingBasis: data.pricingBasis || `
                    <div class="success-box editable-box">
                        <strong>✨ تحليل تسعير ذكي (AI Consultant):</strong><br/>
                        تم بناء التسعير بناءً على بيانات السوق الحالية + حصر المواد الهندسي.
                    </div>
                `
            };

        } catch (e) {
            console.error("AI Pricing Failed", e);
            // DO NOT FALLBACK TO LOCAL. Throw error to UI.
            throw new Error("فشل التحليل الذكي للسعر. يرجى المحاولة مرة أخرى.");
        }
    },

    // --- SEQUENTIAL PIPELINE ---
    async calculateConstructionItem(input: string, marketPrices: MarketItem[] = []): Promise<{ materials: MaterialCalculationResult, pricing: PricingCalculationResult }> {
        // 1. Calculate Materials First
        const materials = await this.calculateMaterials(input);
        
        // 2. Pass Materials to Pricing Engine
        const pricing = await this.calculatePricing(input, marketPrices, materials);
        
        return { materials, pricing };
    }
};
