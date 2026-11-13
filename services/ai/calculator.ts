
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
    },

    // --- COMPREHENSIVE BOQ ITEM PRICE & MATERIAL EXECUTION RATE ANALYZER (EGYPTIAN MARKET) ---
    async analyzeBoqItemComprehensive(params: {
        itemCode?: string;
        batchName?: string;
        description: string;
        unit: string;
        quantity: number;
        contractUnitPrice?: number;
        indirectCostPercent?: number;
        profitPercent?: number;
        marketPrices?: MarketItem[];
    }) {
        const qty = Math.max(0.01, cleanNumber(params.quantity) || 1);
        const unit = (params.unit || 'وحدة').trim();
        const desc = (params.description || '').trim();
        const customIndirect = params.indirectCostPercent !== undefined ? cleanNumber(params.indirectCostPercent) : undefined;
        const customProfit = params.profitPercent !== undefined ? cleanNumber(params.profitPercent) : undefined;
        const marketList = params.marketPrices || [];

        let marketContext = marketList
            .slice(0, 120)
            .map(m => `${m.name} (${m.category}): ${m.price} ج.م/${m.unit}`)
            .join(' | ');

        if (!marketContext || marketContext.length < 40) {
            marketContext = BASELINE_MARKET_PRICES;
        }

        const schema = {
            type: Type.OBJECT,
            properties: {
                itemName: { type: Type.STRING },
                unit: { type: Type.STRING },
                engineeringBasis: { type: Type.STRING },
                indirectCostPercent: { type: Type.NUMBER },
                profitPercent: { type: Type.NUMBER },
                breakdown: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            type: { type: Type.STRING, enum: ["Material", "Labor", "Equipment", "Tools"] },
                            description: { type: Type.STRING },
                            unit: { type: Type.STRING },
                            consumption: { type: Type.NUMBER },
                            rate: { type: Type.NUMBER },
                            cost: { type: Type.NUMBER }
                        }
                    }
                },
                materials: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            materialName: { type: Type.STRING },
                            unit: { type: Type.STRING },
                            consumptionPerUnit: { type: Type.NUMBER },
                            wastePercentage: { type: Type.NUMBER },
                            marketUnitPrice: { type: Type.NUMBER }
                        }
                    }
                }
            },
            required: ["itemName", "engineeringBasis", "breakdown", "materials"]
        };

        const prompt = `
            **ROLE:** كبير مهندسي التسعير والمكتب الفني والحصر (Senior Cost Estimation & QS Consultant - Egypt).
            **TASK:** قم بإجراء تحليل فني ومالي شامل لسعر البند التالي طبقاً لأسعار السوق المصري الحالية ومعدلات الفرد والاستهلاك القياسية بالكود المصري (ECP):
            
            - **رقم البند:** ${params.itemCode || 'غير محدد'}
            - **اسم المقايسة:** ${params.batchName || 'المقايسة العامة'}
            - **منطوق البند:** "${desc}"
            - **وحدة القياس:** "${unit}"
            - **كمية البند بالمقايسة:** ${qty} ${unit}
            ${params.contractUnitPrice ? `- **فئة البند الحالية بالمقايسة:** ${params.contractUnitPrice} ج.م` : ''}
            ${customIndirect !== undefined ? `- **نسبة المصاريف غير المباشرة المطلوبة:** ${customIndirect}%` : '- **نسبة المصاريف غير المباشرة القياسية:** 15%'}
            ${customProfit !== undefined ? `- **نسبة الربح المطلوبة:** ${customProfit}%` : '- **نسبة الربح القياسية:** 15%'}

            **مرجع أسعار السوق المصري الحالية (Egyptian Market Prices Reference):**
            ${marketContext}

            **القواعد الإلزامية للتحليل (MANDATORY RULES):**
            1. **تحليل الفئة للوحدة الواحدة (breakdown):**
               - حلل تكلفة تنفيذ (1 ${unit}) فقط من البند إلى: خامات أساسية ومساعدة (Material)، مصنعيات وعمالة (Labor)، معدات (Equipment)، عدد وأدوات ومستهلكات (Tools).
               - لكل عنصر حدد: معدل الاستهلاك للوحدة الواحدة (consumption)، وسعر الوحدة بالسوق المصري (rate)، والتكلفة للوحدة الواحدة من البند (cost = consumption * rate).
            2. **تحليل كميات المواد والخامات طبقاً لمعدلات التنفيذ (materials):**
               - اذكر كافة المواد والخامات اللازمة لتنفيذ هذا البند مع وحدة قياس الشراء/التوريد في السوق المصري (مثل: طن، م3، ألف طوبة، شكارة، بستلة، م2، كجم، متر طولي).
               - حدد بدقة: معدل استهلاك الخامة لكل (1 ${unit}) من البند (consumptionPerUnit)، ونسبة الهالك الهندسي الطبيعي بالموقع % (wastePercentage) طبقاً للكود المصري، وسعر وحدة الخامة في السوق المصري بالجنيه (marketUnitPrice).
            3. **الأسس الهندسية والكود المصري (engineeringBasis):**
               - اشرح بالتفصيل باللغة العربية معدلات الفرد والاستهلاك المستخدمة (مثل نسب الخلطة، سمك الطبقات، إنتاجية طاقم العمل اليومية، ومبررات نسب الهالك).

            **OUTPUT:** JSON only in Arabic.
        `;

        let parsedData: any = null;
        let usedModel = MODEL_COMPLEX;

        try {
            const response = await safeGenerateContent(MODEL_COMPLEX, {
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: schema,
                }
            });
            usedModel = response.usedModel || MODEL_COMPLEX;
            if (response.text && !response.text.includes('Emergency-Quota-Protection') && !response.text.includes('Emergency-Static-Brain')) {
                const cleanedJson = response.text.replace(/```json|```/g, '').trim();
                parsedData = JSON.parse(cleanedJson);
            }
        } catch (err) {
            console.warn("AI comprehensive BOQ analysis fallback triggered:", err);
        }

        // Helper to find best market price from marketList
        const findPriceInMarket = (name: string, defaultPrice: number): number => {
            const lower = name.toLowerCase();
            const found = marketList.find(m => lower.includes(m.name.toLowerCase()) || m.name.toLowerCase().includes(lower));
            if (found && found.price > 0) return found.price;
            if (lower.includes('حديد')) return 40500;
            if (lower.includes('أسمنت') || lower.includes('اسمنت')) return 2950;
            if (lower.includes('رمل')) return 210;
            if (lower.includes('سن') || lower.includes('زلط')) return 440;
            if (lower.includes('طوب أحمر') || lower.includes('طفلي')) return 1950;
            if (lower.includes('طوب أسمنتي')) return 2400;
            if (lower.includes('سيراميك')) return 340;
            if (lower.includes('بورسلين')) return 680;
            if (lower.includes('بلاستيك') || lower.includes('دهان')) return 1450;
            if (lower.includes('سيلر')) return 850;
            if (lower.includes('معجون')) return 45;
            if (lower.includes('جبس بورد') || lower.includes('ألواح')) return 320;
            return defaultPrice;
        };

        // Engineering Fallback if AI JSON was not returned
        if (!parsedData || !Array.isArray(parsedData.materials) || parsedData.materials.length === 0) {
            const lowerDesc = desc.toLowerCase();
            let matchedSpec = ENGINEERING_SPECS['reinforced_concrete'];
            let maxScore = 0;
            for (const spec of Object.values(ENGINEERING_SPECS)) {
                const score = spec.keywords.reduce((acc, kw) => lowerDesc.includes(kw) ? acc + 1 : acc, 0);
                if (score > maxScore) {
                    maxScore = score;
                    matchedSpec = spec;
                }
            }

            const fallbackMaterials = matchedSpec.materials.map(m => {
                const marketUnitPrice = findPriceInMarket(m.name, 250);
                return {
                    materialName: m.name,
                    unit: m.unit,
                    consumptionPerUnit: m.rate,
                    wastePercentage: m.waste,
                    marketUnitPrice
                };
            });

            const fallbackBreakdown: any[] = fallbackMaterials.map(m => {
                const effConsumption = parseFloat((m.consumptionPerUnit * (1 + m.wastePercentage / 100)).toFixed(4));
                return {
                    type: 'Material',
                    description: `${m.materialName} (شامل ${m.wastePercentage}% هالك)`,
                    unit: m.unit,
                    consumption: effConsumption,
                    rate: m.marketUnitPrice,
                    cost: Math.round(effConsumption * m.marketUnitPrice * 100) / 100
                };
            });

            if (matchedSpec.labor) {
                matchedSpec.labor.forEach(l => {
                    const unitLaborCost = Math.round((l.dailyRate / Math.max(1, l.productivity)) * 100) / 100;
                    fallbackBreakdown.push({
                        type: 'Labor',
                        description: `${l.description} (إنتاجية ${l.productivity} ${unit}/يوم)`,
                        unit: 'يوم/وحدة',
                        consumption: parseFloat((1 / Math.max(1, l.productivity)).toFixed(3)),
                        rate: l.dailyRate,
                        cost: unitLaborCost
                    });
                });
            }

            if (matchedSpec.equipment) {
                matchedSpec.equipment.forEach(eq => {
                    fallbackBreakdown.push({
                        type: 'Equipment',
                        description: eq.description,
                        unit: unit,
                        consumption: 1,
                        rate: eq.rate,
                        cost: eq.rate
                    });
                });
            }

            parsedData = {
                itemName: desc,
                unit,
                engineeringBasis: matchedSpec.basis,
                indirectCostPercent: customIndirect !== undefined ? customIndirect : 15,
                profitPercent: customProfit !== undefined ? customProfit : 15,
                breakdown: fallbackBreakdown,
                materials: fallbackMaterials
            };
        }

        // Normalize Materials Schedule for total BOQ quantity
        const materialsSchedule = (parsedData.materials || []).map((m: any) => {
            const consumptionPerUnit = cleanNumber(m.consumptionPerUnit) || 0;
            const wastePercentage = cleanNumber(m.wastePercentage) || 0;
            const marketUnitPrice = cleanNumber(m.marketUnitPrice) || findPriceInMarket(m.materialName || '', 100);
            const netQuantity = parseFloat((consumptionPerUnit * qty).toFixed(3));
            const totalQuantityWithWaste = parseFloat((netQuantity * (1 + wastePercentage / 100)).toFixed(3));
            const unitCostWithWaste = parseFloat((consumptionPerUnit * (1 + wastePercentage / 100) * marketUnitPrice).toFixed(2));
            const totalCost = Math.round(totalQuantityWithWaste * marketUnitPrice);

            return {
                materialName: m.materialName || 'خامة',
                unit: m.unit || 'وحدة',
                consumptionPerUnit,
                netQuantity,
                wastePercentage,
                totalQuantityWithWaste,
                marketUnitPrice,
                unitCostWithWaste,
                totalCost
            };
        });

        // Normalize Unit Rate Breakdown (per 1 unit)
        const breakdown = (parsedData.breakdown || []).map((b: any) => {
            const consumption = cleanNumber(b.consumption) || 1;
            const rate = cleanNumber(b.rate) || 0;
            const cost = cleanNumber(b.cost) || Math.round(consumption * rate * 100) / 100;
            return {
                type: (['Material', 'Labor', 'Equipment', 'Tools'].includes(b.type) ? b.type : 'Material') as 'Material' | 'Labor' | 'Equipment' | 'Tools',
                description: b.description || '',
                unit: b.unit || unit,
                consumption,
                rate,
                cost
            };
        });

        const materialsCostPerUnit = breakdown
            .filter((b: any) => b.type === 'Material')
            .reduce((sum: number, b: any) => sum + b.cost, 0);
        const laborCostPerUnit = breakdown
            .filter((b: any) => b.type === 'Labor')
            .reduce((sum: number, b: any) => sum + b.cost, 0);
        const equipmentCostPerUnit = breakdown
            .filter((b: any) => b.type === 'Equipment' || b.type === 'Tools')
            .reduce((sum: number, b: any) => sum + b.cost, 0);

        const directCost = Math.round((materialsCostPerUnit + laborCostPerUnit + equipmentCostPerUnit) * 100) / 100;
        const indirectCostPercent = customIndirect !== undefined ? customIndirect : (cleanNumber(parsedData.indirectCostPercent) || 15);
        const profitPercent = customProfit !== undefined ? customProfit : (cleanNumber(parsedData.profitPercent) || 15);

        const indirectCostValue = Math.round(directCost * (indirectCostPercent / 100) * 100) / 100;
        const profitValue = Math.round(directCost * (profitPercent / 100) * 100) / 100;
        const finalUnitPrice = Math.round((directCost + indirectCostValue + profitValue) * 100) / 100;
        const totalMarketValue = Math.round(finalUnitPrice * qty);
        const totalMaterialsCostAllQty = materialsSchedule.reduce((s: number, m: any) => s + m.totalCost, 0);

        const contractUnitPrice = cleanNumber(params.contractUnitPrice) || 0;
        const priceDiffPerUnit = contractUnitPrice > 0 ? Math.round((finalUnitPrice - contractUnitPrice) * 100) / 100 : 0;
        const priceDiffPercent = contractUnitPrice > 0 ? parseFloat((((finalUnitPrice - contractUnitPrice) / contractUnitPrice) * 100).toFixed(1)) : 0;

        const typeLabels: Record<string, string> = {
            Material: 'خامات ومواد',
            Labor: 'مصنعيات وعمالة',
            Equipment: 'معدات وآلات',
            Tools: 'عدد وأدوات'
        };

        // Build printable / archivable HTML report
        const reportHtml = `
            <div dir="rtl" style="font-family: 'Cairo', sans-serif;">
                <h2>تحليل فئة البند ومعدلات استهلاك الخامات طبقاً للسوق المصري</h2>
                <div class="info-box editable-box">
                    <strong>بيانات البند محل الدراسة:</strong><br/>
                    • <strong>المقايسة:</strong> ${params.batchName || 'المقايسة العامة'} ${params.itemCode ? `| <strong>رقم البند:</strong> (${params.itemCode})` : ''}<br/>
                    • <strong>منطوق البند:</strong> ${desc}<br/>
                    • <strong>الكمية الإجمالية:</strong> ${qty.toLocaleString()} ${unit}
                    ${contractUnitPrice > 0 ? ` | <strong>فئة المقايسة الحالية:</strong> ${contractUnitPrice.toLocaleString()} ج.م/${unit}` : ''}
                </div>

                <h3>أولاً: الملخص المالي لتحليل سعر الوحدة (${unit})</h3>
                <table width="100%" border="1" style="border-collapse: collapse; width: 100%; text-align: center;">
                    <thead>
                        <tr style="background-color: #0f172a; color: #ffffff;">
                            <th>التكلفة المباشرة للوحدة</th>
                            <th>مصاريف غير مباشرة (${indirectCostPercent}%)</th>
                            <th>هامش الربح (${profitPercent}%)</th>
                            <th>السعر العادل بالسوق المصري للوحدة</th>
                            <th>إجمالي قيمة البند بسعر السوق (${qty} ${unit})</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><strong>${directCost.toLocaleString()} ج.م</strong></td>
                            <td>${indirectCostValue.toLocaleString()} ج.م</td>
                            <td>${profitValue.toLocaleString()} ج.م</td>
                            <td style="background-color: #ecfdf5; color: #047857; font-weight: bold;">${finalUnitPrice.toLocaleString()} ج.م / ${unit}</td>
                            <td style="background-color: #eff6ff; color: #1d4ed8; font-weight: bold;">${totalMarketValue.toLocaleString()} ج.م</td>
                        </tr>
                    </tbody>
                </table>

                <h3>ثانياً: جدول تحليل الفئة التفصيلي للوحدة الواحدة (1 ${unit})</h3>
                <table width="100%" border="1" style="border-collapse: collapse; width: 100%; text-align: right;">
                    <thead>
                        <tr style="background-color: #1e293b; color: #ffffff;">
                            <th>التصنيف</th>
                            <th>البيان / العنصر</th>
                            <th>الوحدة</th>
                            <th>معدل الاستهلاك للوحدة</th>
                            <th>سعر الوحدة بالسوق (ج.م)</th>
                            <th>التكلفة للوحدة (ج.م)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${breakdown.map((b: any) => `
                            <tr>
                                <td>${typeLabels[b.type] || b.type}</td>
                                <td><strong>${b.description}</strong></td>
                                <td>${b.unit}</td>
                                <td>${b.consumption}</td>
                                <td>${b.rate.toLocaleString()}</td>
                                <td><strong>${b.cost.toLocaleString()} ج.م</strong></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>

                <h3>ثالثاً: حصر كميات المواد والخامات المطلوبة لتنفيذ (${qty.toLocaleString()} ${unit}) طبقاً لمعدلات التنفيذ</h3>
                <table width="100%" border="1" style="border-collapse: collapse; width: 100%; text-align: right;">
                    <thead>
                        <tr style="background-color: #065f46; color: #ffffff;">
                            <th>الخامة / المادة</th>
                            <th>وحدة التوريد</th>
                            <th>معدل الفرد للوحدة (1 ${unit})</th>
                            <th>الكمية الصافية</th>
                            <th>نسبة الهالك (%)</th>
                            <th>إجمالي الكمية المطلوبة شاملة الهالك</th>
                            <th>سعر السوق المصري (ج.م)</th>
                            <th>التكلفة الإجمالية للخامة (ج.م)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${materialsSchedule.map((m: any) => `
                            <tr>
                                <td><strong>${m.materialName}</strong></td>
                                <td>${m.unit}</td>
                                <td>${m.consumptionPerUnit}</td>
                                <td>${m.netQuantity.toLocaleString()}</td>
                                <td>${m.wastePercentage}%</td>
                                <td style="background-color: #f0fdf4; font-weight: bold;">${m.totalQuantityWithWaste.toLocaleString()} ${m.unit}</td>
                                <td>${m.marketUnitPrice.toLocaleString()}</td>
                                <td><strong>${m.totalCost.toLocaleString()} ج.م</strong></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>

                <div class="highlight-box editable-box" style="margin-top: 12px;">
                    <strong>الأسس الهندسية ومعدلات الكود المصري (ECP Basis):</strong><br/>
                    ${parsedData.engineeringBasis || 'تم التحليل طبقاً لمعدلات الفرد القياسية بالكود المصري وأسعار السوق السائدة.'}
                </div>
            </div>
        `;

        return {
            itemName: parsedData.itemName || desc,
            itemCode: params.itemCode || '',
            batchName: params.batchName || '',
            unit,
            quantity: qty,
            contractUnitPrice,
            directCost,
            materialsCostPerUnit: Math.round(materialsCostPerUnit * 100) / 100,
            laborCostPerUnit: Math.round(laborCostPerUnit * 100) / 100,
            equipmentCostPerUnit: Math.round(equipmentCostPerUnit * 100) / 100,
            indirectCostPercent,
            indirectCostValue,
            profitPercent,
            profitValue,
            finalUnitPrice,
            totalMarketValue,
            totalMaterialsCostAllQty,
            priceDiffPerUnit,
            priceDiffPercent,
            breakdown,
            materialsSchedule,
            engineeringBasis: parsedData.engineeringBasis || '',
            usedModel,
            reportHtml
        };
    },

    // --- PROFESSIONAL ITEM PRICING, MATERIAL TAKE-OFF & EXECUTION RATES REPORT ---
    async generateProfessionalItemPricingReport(params: {
        description: string;
        category?: string;
        unit: string;
        quantity: number;
        indirectCostPercent?: number;
        profitPercent?: number;
        notes?: string;
        marketPrices?: MarketItem[];
    }) {
        const desc = (params.description || '').trim();
        const category = (params.category || 'أعمال إنشائية ومعمارية').trim();
        const unit = (params.unit || 'م3').trim();
        const qty = Math.max(0.01, cleanNumber(params.quantity) || 1);
        const indirectCostPercent = params.indirectCostPercent !== undefined ? cleanNumber(params.indirectCostPercent) : 15;
        const profitPercent = params.profitPercent !== undefined ? cleanNumber(params.profitPercent) : 15;
        const marketList = params.marketPrices || [];

        let marketContext = marketList
            .slice(0, 120)
            .map(m => `${m.name} (${m.category}): ${m.price} ج.م/${m.unit}`)
            .join(' | ');

        if (!marketContext || marketContext.length < 40) {
            marketContext = BASELINE_MARKET_PRICES;
        }

        const schema = {
            type: Type.OBJECT,
            properties: {
                itemTitle: { type: Type.STRING },
                ecpReference: { type: Type.STRING },
                technicalSummary: { type: Type.STRING },
                materials: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            materialName: { type: Type.STRING },
                            specification: { type: Type.STRING },
                            unit: { type: Type.STRING },
                            netRatePerUnit: { type: Type.NUMBER },
                            wastePercent: { type: Type.NUMBER },
                            wasteReason: { type: Type.STRING },
                            unitMarketPrice: { type: Type.NUMBER }
                        }
                    }
                },
                laborRates: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            crewDescription: { type: Type.STRING },
                            crewComposition: { type: Type.STRING },
                            dailyCrewCost: { type: Type.NUMBER },
                            dailyProductivity: { type: Type.NUMBER },
                            productivityUnit: { type: Type.STRING },
                            notes: { type: Type.STRING }
                        }
                    }
                },
                equipmentRates: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            equipmentName: { type: Type.STRING },
                            usageRole: { type: Type.STRING },
                            dailyCostOrRate: { type: Type.NUMBER },
                            dailyProductivity: { type: Type.NUMBER },
                            costPerUnit: { type: Type.NUMBER }
                        }
                    }
                },
                ratesExplanation: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                },
                executionRecommendations: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                },
                qualityAndContractNotes: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                }
            },
            required: ["itemTitle", "ecpReference", "materials", "laborRates", "equipmentRates", "ratesExplanation", "executionRecommendations"]
        };

        const prompt = `
            **ROLE:** كبير استشاريي التسعير والمكتب الفني وإدارة التكاليف (Senior Cost Estimation & QS Director - Egypt).
            **TASK:** قم بإعداد دراسة تسعير احترافية شاملة وتحليل فئة تفصيلي وحصر خامات ومعدلات تنفيذ للبند الإنشائي التالي طبقاً للكود المصري (ECP) وأسعار السوق المصري الحالية:

            - **منطوق البند:** "${desc}"
            - **التصنيف الهندسي:** "${category}"
            - **وحدة القياس:** "${unit}"
            - **الكمية المطلوبة للدراسة والحصر:** ${qty} ${unit}
            - **نسبة المصاريف غير المباشرة والإدارية والضرائب:** ${indirectCostPercent}%
            - **نسبة الربح والمخاطر:** ${profitPercent}%
            ${params.notes ? `- **مواصفات وملاحظات إضافية:** ${params.notes}` : ''}

            **مرجع أسعار السوق المصري الحالية (Egyptian Market Prices Reference):**
            ${marketContext}

            **المطلوب بدقة هندسية استشارية (MANDATORY):**
            1. **حصر الخامات والمواد ومعدلات الاستهلاك (materials):**
               - اذكر كافة المواد الأساسية والمساعدة اللازمة لتنفيذ (1 ${unit}) من البند.
               - لكل خامة: اسم الخامة، المواصفة الفنية، وحدة التوريد بالسوق (طن، م3، ألف طوبة، شكارة، كجم، بستلة، م2، م.ط)، المعدل الصافي للوحدة (netRatePerUnit)، نسبة الهالك القياسية بالموقع % (wastePercent)، سبب الهالك هندسياً (wasteReason)، وسعر وحدة التوريد بالسوق المصري بالجنيه (unitMarketPrice).
            2. **معدلات التنفيذ والإنتاجية للعمالة والمصنعيات (laborRates):**
               - فصل أطقم العمالة اللازمة لتنفيذ البند (مثلاً: فرقة نجارة مسلحة، فرقة حدادة مسلحة، فرقة صب وفرمجة، أو مبيض محارة ومساعد، إلخ).
               - لكل طاقم: اسم الفرقة (crewDescription)، تشكيل الطاقم بالتفصيل (crewComposition مثل: 1 معلم + 1 صنايعي + 2 مساعد)، تكلفة يومية الطاقم بالجنيه (dailyCrewCost)، معدل الإنتاجية اليومي القياسي للطاقم بـ (${unit}/يوم) (dailyProductivity)، وملاحظات الأداء (notes).
            3. **معدلات التشغيل والاستهلاك للمعدات والآلات والعدد (equipmentRates):**
               - اذكر المعدات والآلات والشدات والسقالات والعدد المستهلكة اللازمة للبند.
               - لكل معدة: اسم المعدة (equipmentName)، دورها في التنفيذ (usageRole)، التكلفة اليومية أو الإيجار (dailyCostOrRate)، معدل إنتاجيتها اليومي (dailyProductivity)، وتكلفة المعدة المحملة على الوحدة الواحدة (1 ${unit}) بالجنيه (costPerUnit).
            4. **شرح تفاصيل المعدلات وأسس الحصر (ratesExplanation):**
               - نقاط تفصيلية تشرح كيف تم حساب معدلات المواد والخلطات وإنتاجية العمالة والمعدات طبقاً للكود المصري.
            5. **توصيات التنفيذ الفني وضبط الجودة (executionRecommendations):**
               - خطوات وتوصيات التنفيذ والتركيب والاستلام الهندسي طبقاً للكود المصري وأصول الصناعة.
            6. **ملاحظات التسعير التعاقدية وضبط التكلفة (qualityAndContractNotes):**
               - نصائح للمهندس عند تسعير البند وتقديم العطاء لتجنب الخسائر أو فروق الأسعار.

            **OUTPUT:** JSON only in Arabic.
        `;

        let parsed: any = null;
        try {
            const response = await safeGenerateContent(MODEL_COMPLEX, {
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: schema,
                }
            });
            if (response.text && !response.text.includes('Emergency-Quota-Protection') && !response.text.includes('Emergency-Static-Brain')) {
                const cleanedJson = response.text.replace(/```json|```/g, '').trim();
                parsed = JSON.parse(cleanedJson);
            }
        } catch (err) {
            console.warn("AI Professional Pricing fallback triggered:", err);
        }

        const findPriceInMarket = (name: string, defaultPrice: number): number => {
            const lower = name.toLowerCase();
            const found = marketList.find(m => lower.includes(m.name.toLowerCase()) || m.name.toLowerCase().includes(lower));
            if (found && found.price > 0) return found.price;
            if (lower.includes('حديد')) return 40500;
            if (lower.includes('أسمنت') || lower.includes('اسمنت')) return 2950;
            if (lower.includes('رمل')) return 210;
            if (lower.includes('سن') || lower.includes('زلط')) return 440;
            if (lower.includes('طوب أحمر') || lower.includes('طفلي')) return 1950;
            if (lower.includes('طوب أسمنتي')) return 2400;
            if (lower.includes('سيراميك')) return 340;
            if (lower.includes('بورسلين')) return 680;
            if (lower.includes('بلاستيك') || lower.includes('دهان')) return 1450;
            if (lower.includes('سيلر')) return 850;
            if (lower.includes('معجون')) return 45;
            if (lower.includes('جبس بورد') || lower.includes('ألواح')) return 320;
            if (lower.includes('بيتومين') || lower.includes('عزل')) return 1850;
            return defaultPrice;
        };

        // Fallback if offline or AI failed
        if (!parsed || !Array.isArray(parsed.materials) || parsed.materials.length === 0) {
            const lowerDesc = `${desc} ${category}`.toLowerCase();
            let matchedSpec = ENGINEERING_SPECS['reinforced_concrete'];
            let maxScore = 0;
            for (const spec of Object.values(ENGINEERING_SPECS)) {
                const score = spec.keywords.reduce((acc, kw) => lowerDesc.includes(kw) ? acc + 1 : acc, 0);
                if (score > maxScore) {
                    maxScore = score;
                    matchedSpec = spec;
                }
            }

            parsed = {
                itemTitle: desc,
                ecpReference: 'الكود المصري لتصميم وتنفيذ المنشآت والمواصفات القياسية المصرية (ECP)',
                technicalSummary: matchedSpec.basis,
                materials: matchedSpec.materials.map(m => ({
                    materialName: m.name,
                    specification: 'مطابق للمواصفات القياسية المصرية والكود المصري',
                    unit: m.unit,
                    netRatePerUnit: m.rate,
                    wastePercent: m.waste,
                    wasteReason: 'هالك قص وتشوين ومناولة طبيعي بالموقع',
                    unitMarketPrice: findPriceInMarket(m.name, 300)
                })),
                laborRates: (matchedSpec.labor || [{ description: 'طاقم فني متخصص ومساعدين', dailyRate: 1800, productivity: 12 }]).map(l => ({
                    crewDescription: l.description,
                    crewComposition: 'فنيين متخصصين + عمالة مساعدة للإمداد والمناولة',
                    dailyCrewCost: l.dailyRate,
                    dailyProductivity: l.productivity,
                    productivityUnit: `${unit}/يوم`,
                    notes: `إنتاجية قياسية بمعدل ${l.productivity} ${unit} في اليومية الواحدة (8 ساعات عمل)`
                })),
                equipmentRates: (matchedSpec.equipment || [{ description: 'معدات خلط وتشغيل وسقالات', rate: 80 }]).map(eq => ({
                    equipmentName: eq.description,
                    usageRole: 'التشغيل الميكانيكي والمناولة والرفع بالموقع',
                    dailyCostOrRate: eq.rate * 12,
                    dailyProductivity: 12,
                    costPerUnit: eq.rate
                })),
                ratesExplanation: [
                    matchedSpec.basis,
                    'تم احتساب معدلات الاستهلاك الصافية بناءً على الخلطات والأبعاد الهندسية القياسية ثم إضافة نسب الهالك الفعلي بالموقع.',
                    'تم احتساب تكلفة المصنعيات بقسمة إجمالي يومية طاقم العمل المتخصص على معدل الإنتاج اليومي القياسي بالموقع.',
                    'تم تحميل استهلاك وإيجار المعدات والعدد الصغيرة والسقالات على كل وحدة قياس من البند.'
                ],
                executionRecommendations: [
                    'التأكد من مطابقة جميع الخامات الموردة للموقع للمواصفات القياسية المصرية وإجراء الاختبارات المعملية اللازمة قبل الاستخدام.',
                    'ضبط المناسيب والأبعاد والوزنات الهندسية (أفقية ورأسية) باستخدام ميزان القامة أو الخيط والشرب قبل وأثناء التنفيذ.',
                    'الالتزام التام بمعالجة الأعمال (مثل الرش بالمياه للخرسانات والمباني والبياض) للمدة المحددة بالكود المصري.',
                    'تجهيز محضر استلام أعمال (Inspection Request) مع الاستشاري المشرف لكل مرحلة قبل البدء في المرحلة التالية.'
                ],
                qualityAndContractNotes: [
                    'يجب مراجعة منطوق البند بالمقايسة للتأكد مما إذا كان السعر محملاً عليه أية بنود مكملة (مثل الإكسسوارات أو السقالات أو النقل والتشوين).',
                    'يوصى بتثبيت أسعار الخامات الرئيسية مع الموردين عند التعاقد لتفادي تقلبات السوق.',
                    'يتم الحصر الهندسي الفعلي في المستخلصات طبقاً للرسومات التنفيذية المعتمدة وطرق القياس بالكود المصري.'
                ]
            };
        }

        // 1. Process Materials Table
        const materialsRows = (parsed.materials || []).map((m: any) => {
            const netRatePerUnit = cleanNumber(m.netRatePerUnit) || 0.01;
            const wastePercent = cleanNumber(m.wastePercent) || 0;
            const grossRatePerUnit = parseFloat((netRatePerUnit * (1 + wastePercent / 100)).toFixed(4));
            const netTotalQty = parseFloat((netRatePerUnit * qty).toFixed(3));
            const grossTotalQty = parseFloat((grossRatePerUnit * qty).toFixed(3));
            const unitMarketPrice = cleanNumber(m.unitMarketPrice) || findPriceInMarket(m.materialName || '', 250);
            const costPerItemUnit = parseFloat((grossRatePerUnit * unitMarketPrice).toFixed(2));
            const totalMaterialCost = Math.round(grossTotalQty * unitMarketPrice * 100) / 100;

            return {
                materialName: m.materialName || 'خامة أساسية',
                specification: m.specification || 'مطابق للمواصفات القياسية',
                unit: m.unit || 'وحدة',
                netRatePerUnit,
                wastePercent,
                wasteReason: m.wasteReason || 'هالك تشغيل ومناولة',
                grossRatePerUnit,
                netTotalQty,
                grossTotalQty,
                unitMarketPrice,
                costPerItemUnit,
                totalMaterialCost
            };
        });

        // 2. Process Labor Rates Table
        const laborRows = (parsed.laborRates || []).map((l: any) => {
            const dailyCrewCost = cleanNumber(l.dailyCrewCost) || 1200;
            const dailyProductivity = Math.max(0.1, cleanNumber(l.dailyProductivity) || 10);
            const costPerItemUnit = parseFloat((dailyCrewCost / dailyProductivity).toFixed(2));
            const totalCrewDaysRequired = parseFloat((qty / dailyProductivity).toFixed(2));
            const totalLaborCost = Math.round(costPerItemUnit * qty * 100) / 100;

            return {
                crewDescription: l.crewDescription || 'طاقم عمالة فنية',
                crewComposition: l.crewComposition || 'صنايعي + مساعد',
                dailyCrewCost,
                dailyProductivity,
                productivityUnit: l.productivityUnit || `${unit}/يوم`,
                costPerItemUnit,
                totalCrewDaysRequired,
                totalLaborCost,
                notes: l.notes || ''
            };
        });

        // 3. Process Equipment Rates Table
        const equipmentRows = (parsed.equipmentRates || []).map((eq: any) => {
            const dailyCostOrRate = cleanNumber(eq.dailyCostOrRate) || 500;
            const dailyProductivity = Math.max(0.1, cleanNumber(eq.dailyProductivity) || 10);
            const costPerItemUnit = cleanNumber(eq.costPerUnit) || parseFloat((dailyCostOrRate / dailyProductivity).toFixed(2));
            const totalEquipmentCost = Math.round(costPerItemUnit * qty * 100) / 100;

            return {
                equipmentName: eq.equipmentName || 'معدات وعدد تشغيل',
                usageRole: eq.usageRole || 'تشغيل ومناولة',
                dailyCostOrRate,
                dailyProductivity,
                costPerItemUnit,
                totalEquipmentCost
            };
        });

        // 4. Financial Totals
        const materialsCostPerUnit = parseFloat(materialsRows.reduce((s: number, r: any) => s + r.costPerItemUnit, 0).toFixed(2));
        const laborCostPerUnit = parseFloat(laborRows.reduce((s: number, r: any) => s + r.costPerItemUnit, 0).toFixed(2));
        const equipmentCostPerUnit = parseFloat(equipmentRows.reduce((s: number, r: any) => s + r.costPerItemUnit, 0).toFixed(2));

        const directCostPerUnit = parseFloat((materialsCostPerUnit + laborCostPerUnit + equipmentCostPerUnit).toFixed(2));
        const indirectCostPerUnit = parseFloat((directCostPerUnit * (indirectCostPercent / 100)).toFixed(2));
        const profitPerUnit = parseFloat(((directCostPerUnit + indirectCostPerUnit) * (profitPercent / 100)).toFixed(2));
        const finalUnitPrice = parseFloat((directCostPerUnit + indirectCostPerUnit + profitPerUnit).toFixed(2));

        const totalDirectCost = Math.round(directCostPerUnit * qty * 100) / 100;
        const totalIndirectCost = Math.round(indirectCostPerUnit * qty * 100) / 100;
        const totalProfit = Math.round(profitPerUnit * qty * 100) / 100;
        const totalItemPrice = Math.round(finalUnitPrice * qty * 100) / 100;

        const matSharePercent = directCostPerUnit > 0 ? parseFloat(((materialsCostPerUnit / directCostPerUnit) * 100).toFixed(1)) : 0;
        const laborSharePercent = directCostPerUnit > 0 ? parseFloat(((laborCostPerUnit / directCostPerUnit) * 100).toFixed(1)) : 0;
        const eqSharePercent = directCostPerUnit > 0 ? parseFloat(((equipmentCostPerUnit / directCostPerUnit) * 100).toFixed(1)) : 0;

        const fmt = (n: number) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        // 5. Build Comprehensive Consultant HTML Report (Compact & Unified Font Size)
        const bodyHtml = `
            <h1>تقرير التسعير وتحليل الفئة ومعدلات التنفيذ</h1>

            <div class="info-box editable-box" style="font-size: 11px !important; line-height: 1.5 !important; padding: 8px 10px !important;">
                <strong>بيانات البند:</strong> ${desc}<br/>
                <strong>التصنيف:</strong> ${category} | <strong>الوحدة:</strong> (${unit}) | <strong>الكمية:</strong> (${qty.toLocaleString()} ${unit}) | <strong>المرجع:</strong> ${parsed.ecpReference || 'الكود المصري (ECP)'}
                ${params.notes ? `<br/><strong>ملاحظات:</strong> ${params.notes}` : ''}
            </div>

            <h2>أولاً: الملخص المالي لتحليل السعر</h2>
            <table class="pricing-compact-table">
                <thead>
                    <tr>
                        <th style="width: 44%; background-color: #1e3a8a !important; color: #ffffff !important;">عنصر التكلفة</th>
                        <th style="width: 16%; background-color: #1e3a8a !important; color: #ffffff !important;">النسبة</th>
                        <th style="width: 20%; background-color: #1e3a8a !important; color: #ffffff !important;">للوحدة (1 ${unit})</th>
                        <th style="width: 20%; background-color: #1e3a8a !important; color: #ffffff !important;">الإجمالي (${qty.toLocaleString()} ${unit})</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>1. تكلفة الخامات والمواد (شامل الهالك)</td>
                        <td style="text-align: center;">${matSharePercent}%</td>
                        <td style="text-align: center;">${fmt(materialsCostPerUnit)} ج.م</td>
                        <td style="text-align: center;">${fmt(materialsCostPerUnit * qty)} ج.م</td>
                    </tr>
                    <tr>
                        <td>2. تكلفة العمالة والمصنعيات</td>
                        <td style="text-align: center;">${laborSharePercent}%</td>
                        <td style="text-align: center;">${fmt(laborCostPerUnit)} ج.م</td>
                        <td style="text-align: center;">${fmt(laborCostPerUnit * qty)} ج.م</td>
                    </tr>
                    <tr>
                        <td>3. تكلفة المعدات والعدد والشدات</td>
                        <td style="text-align: center;">${eqSharePercent}%</td>
                        <td style="text-align: center;">${fmt(equipmentCostPerUnit)} ج.م</td>
                        <td style="text-align: center;">${fmt(equipmentCostPerUnit * qty)} ج.م</td>
                    </tr>
                    <tr style="background-color: #eff6ff !important;">
                        <td style="background-color: #eff6ff !important; color: #1e3a8a !important;">إجمالي التكلفة المباشرة (1 + 2 + 3)</td>
                        <td style="background-color: #eff6ff !important; text-align: center; color: #1e3a8a !important;">100%</td>
                        <td style="background-color: #eff6ff !important; text-align: center; color: #1e3a8a !important;">${fmt(directCostPerUnit)} ج.م</td>
                        <td style="background-color: #eff6ff !important; text-align: center; color: #1e3a8a !important;">${fmt(totalDirectCost)} ج.م</td>
                    </tr>
                    <tr>
                        <td>4. مصاريف غير مباشرة وإدارية وضرائب</td>
                        <td style="text-align: center;">${indirectCostPercent}%</td>
                        <td style="text-align: center;">+${fmt(indirectCostPerUnit)} ج.م</td>
                        <td style="text-align: center;">+${fmt(totalIndirectCost)} ج.م</td>
                    </tr>
                    <tr>
                        <td>5. هامش الربح والمخاطر</td>
                        <td style="text-align: center;">${profitPercent}%</td>
                        <td style="text-align: center;">+${fmt(profitPerUnit)} ج.م</td>
                        <td style="text-align: center;">+${fmt(totalProfit)} ج.م</td>
                    </tr>
                    <tr style="background-color: #ecfdf5 !important;">
                        <td style="background-color: #ecfdf5 !important; color: #065f46 !important;">السعر النهائي المعتمد للبند</td>
                        <td style="background-color: #ecfdf5 !important; text-align: center; color: #065f46 !important;">شامل</td>
                        <td style="background-color: #ecfdf5 !important; text-align: center; color: #047857 !important;">${fmt(finalUnitPrice)} ج.م</td>
                        <td style="background-color: #ecfdf5 !important; text-align: center; color: #047857 !important;">${fmt(totalItemPrice)} ج.م</td>
                    </tr>
                </tbody>
            </table>

            <h2>ثانياً: جدول حصر الخامات ومعدلات الاستهلاك والهالك</h2>
            <table class="pricing-compact-table">
                <thead>
                    <tr>
                        <th style="width: 24%;">الخامة / المادة</th>
                        <th style="width: 10%;">الوحدة</th>
                        <th style="width: 11%;">المعدل/وحدة</th>
                        <th style="width: 9%;">الهالك</th>
                        <th style="width: 15%;">الكمية الكلية</th>
                        <th style="width: 14%;">سعر الوحدة</th>
                        <th style="width: 17%;">التكلفة الكلية</th>
                    </tr>
                </thead>
                <tbody>
                    ${materialsRows.map((m: any) => `
                        <tr>
                            <td>${m.materialName}</td>
                            <td style="text-align: center;">${m.unit}</td>
                            <td style="text-align: center;">${m.netRatePerUnit}</td>
                            <td style="text-align: center; color: #dc2626 !important;">${m.wastePercent}%</td>
                            <td style="text-align: center; background-color: #f0fdf4 !important; color: #065f46 !important;">${m.grossTotalQty.toLocaleString()} ${m.unit}</td>
                            <td style="text-align: center;">${fmt(m.unitMarketPrice)}</td>
                            <td style="text-align: center;">${fmt(m.totalMaterialCost)} ج.م</td>
                        </tr>
                    `).join('')}
                    <tr style="background-color: #f1f5f9 !important;">
                        <td colspan="5" style="background-color: #f1f5f9 !important; color: #1e3a8a !important;">إجمالي تكلفة الخامات (للوحدة: ${fmt(materialsCostPerUnit)} ج.م)</td>
                        <td colspan="2" style="background-color: #f1f5f9 !important; text-align: center; color: #1e3a8a !important;">${fmt(materialsCostPerUnit * qty)} ج.م</td>
                    </tr>
                </tbody>
            </table>

            <h2>ثالثاً: جدول معدلات التنفيذ والإنتاجية للعمالة والمصنعيات</h2>
            <table class="pricing-compact-table">
                <thead>
                    <tr>
                        <th style="width: 24%;">طاقم العمل</th>
                        <th style="width: 24%;">تشكيل الفرقة</th>
                        <th style="width: 13%;">يومية الطاقم</th>
                        <th style="width: 13%;">الإنتاجية/يوم</th>
                        <th style="width: 12%;">تكلفة الوحدة</th>
                        <th style="width: 14%;">إجمالي المصنعية</th>
                    </tr>
                </thead>
                <tbody>
                    ${laborRows.map((l: any) => `
                        <tr>
                            <td>${l.crewDescription}</td>
                            <td>${l.crewComposition}</td>
                            <td style="text-align: center;">${fmt(l.dailyCrewCost)}</td>
                            <td style="text-align: center; color: #0f766e !important;">${l.dailyProductivity} ${unit}/يوم</td>
                            <td style="text-align: center;">${fmt(l.costPerItemUnit)}</td>
                            <td style="text-align: center;">${fmt(l.totalLaborCost)} ج.م</td>
                        </tr>
                    `).join('')}
                    <tr style="background-color: #fff7ed !important;">
                        <td colspan="4" style="background-color: #fff7ed !important; color: #9a3412 !important;">إجمالي تكلفة العمالة والمصنعيات</td>
                        <td style="background-color: #fff7ed !important; text-align: center; color: #9a3412 !important;">${fmt(laborCostPerUnit)} ج.م</td>
                        <td style="background-color: #fff7ed !important; text-align: center; color: #9a3412 !important;">${fmt(laborCostPerUnit * qty)} ج.م</td>
                    </tr>
                </tbody>
            </table>

            <h2>رابعاً: جدول معدلات تشغيل واستهلاك المعدات والعدد</h2>
            <table class="pricing-compact-table">
                <thead>
                    <tr>
                        <th style="width: 26%;">المعدة / الآلة</th>
                        <th style="width: 26%;">طبيعة الاستخدام</th>
                        <th style="width: 16%;">الإنتاجية/يوم</th>
                        <th style="width: 15%;">تكلفة الوحدة</th>
                        <th style="width: 17%;">إجمالي المعدات</th>
                    </tr>
                </thead>
                <tbody>
                    ${equipmentRows.map((eq: any) => `
                        <tr>
                            <td>${eq.equipmentName}</td>
                            <td>${eq.usageRole}</td>
                            <td style="text-align: center;">${eq.dailyProductivity} ${unit}/يوم</td>
                            <td style="text-align: center;">${fmt(eq.costPerItemUnit)} ج.م</td>
                            <td style="text-align: center;">${fmt(eq.totalEquipmentCost)} ج.م</td>
                        </tr>
                    `).join('')}
                    <tr style="background-color: #f5f3ff !important;">
                        <td colspan="3" style="background-color: #f5f3ff !important; color: #5b21b6 !important;">إجمالي تكلفة المعدات والعدد</td>
                        <td style="background-color: #f5f3ff !important; text-align: center; color: #5b21b6 !important;">${fmt(equipmentCostPerUnit)} ج.م</td>
                        <td style="background-color: #f5f3ff !important; text-align: center; color: #5b21b6 !important;">${fmt(equipmentCostPerUnit * qty)} ج.م</td>
                    </tr>
                </tbody>
            </table>

            <h2>خامساً: تفاصيل المعدلات الهندسية وأسس الحصر والتسعير</h2>
            <div class="cost-box editable-box" style="font-size: 11px !important; line-height: 1.5 !important; padding: 8px 10px !important;">
                <ul style="margin: 0; padding-right: 16px;">
                    ${(parsed.ratesExplanation || []).map((item: string) => `<li style="font-size: 11px !important; margin-bottom: 4px;">${item}</li>`).join('')}
                </ul>
            </div>

            <h2>سادساً: توصيات التنفيذ الفني وضبط الجودة (طبقاً للكود المصري)</h2>
            <div class="success-box editable-box" style="font-size: 11px !important; line-height: 1.5 !important; padding: 8px 10px !important;">
                <ul style="margin: 0; padding-right: 16px;">
                    ${(parsed.executionRecommendations || []).map((item: string) => `<li style="font-size: 11px !important; margin-bottom: 4px;">${item}</li>`).join('')}
                </ul>
            </div>

            ${Array.isArray(parsed.qualityAndContractNotes) && parsed.qualityAndContractNotes.length > 0 ? `
                <h2>سابعاً: توصيات التسعير التعاقدية وإدارة المخاطر</h2>
                <div class="warning-box editable-box" style="font-size: 11px !important; line-height: 1.5 !important; padding: 8px 10px !important;">
                    <ul style="margin: 0; padding-right: 16px;">
                        ${parsed.qualityAndContractNotes.map((item: string) => `<li style="font-size: 11px !important; margin-bottom: 4px;">${item}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}
        `;

        return {
            itemTitle: parsed.itemTitle || desc,
            category,
            unit,
            quantity: qty,
            ecpReference: parsed.ecpReference || 'الكود المصري لتصميم وتنفيذ المنشآت (ECP)',
            materialsRows,
            laborRows,
            equipmentRows,
            materialsCostPerUnit,
            laborCostPerUnit,
            equipmentCostPerUnit,
            directCostPerUnit,
            indirectCostPercent,
            indirectCostPerUnit,
            profitPercent,
            profitPerUnit,
            finalUnitPrice,
            totalDirectCost,
            totalIndirectCost,
            totalProfit,
            totalItemPrice,
            ratesExplanation: parsed.ratesExplanation || [],
            executionRecommendations: parsed.executionRecommendations || [],
            qualityAndContractNotes: parsed.qualityAndContractNotes || [],
            bodyHtml
        };
    }
};

