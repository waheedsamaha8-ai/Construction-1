
import { safeGenerateContent, MODEL_SMART, fileToPart, cleanNumber, Type } from './core';
import { MarketItem, MaterialDetailData, MarketCategory } from '../../types';

// In-memory cache for this module
const materialCache = new Map<string, any>();

// --- OFFLINE FALLBACK DATABASE (Pricing Safety Net) ---
// Expanded to cover 50+ categories to prevent empty lists
const OFFLINE_MARKET_DATA: Partial<Record<MarketCategory, any[]>> = {
    // 1. Structural
    steel: [{ name: 'حديد تسليح عز', price: 49500, unit: 'طن' }, { name: 'حديد استثماري', price: 48000, unit: 'طن' }],
    cement: [{ name: 'أسمنت بورتلاندي عادي', price: 2450, unit: 'طن' }, { name: 'أسمنت مقاوم', price: 2650, unit: 'طن' }],
    concrete: [{ name: 'خرسانة جاهزة جهد 250', price: 1450, unit: 'م3' }, { name: 'خرسانة جاهزة جهد 350', price: 1650, unit: 'م3' }],
    bricks: [{ name: 'طوب أحمر طفلي 24×11×6', price: 1650, unit: 'ألف' }, { name: 'طوب أسمنتي مصمت 25×12×6', price: 2300, unit: 'ألف' }],
    blocks: [{ name: 'بلوك خفاف 40×20×20', price: 14000, unit: 'ألف' }, { name: 'بلوك أسمنتي مفرغ', price: 9000, unit: 'ألف' }],
    aggregates: [{ name: 'رمل أصفر (حرش)', price: 180, unit: 'م3' }, { name: 'سن فينو (زلط)', price: 380, unit: 'م3' }],
    additives: [{ name: 'إضافات سيكا (مؤخر شك)', price: 45, unit: 'لتر' }, { name: 'أديبوند 65', price: 120, unit: 'كجم' }],
    
    // 2. Insulation & Chemicals
    insulation_water: [{ name: 'بيتومين مؤكسد ساخن', price: 22000, unit: 'طن' }, { name: 'لفائف ممبرين 4مم', price: 180, unit: 'م2' }],
    insulation_thermal: [{ name: 'فوم أزرق كثافة 36', price: 2200, unit: 'م3' }, { name: 'صوف صخري', price: 150, unit: 'م2' }],
    insulation_sound: [{ name: 'ألواح عزل صوتي', price: 350, unit: 'م2' }],
    chemicals_flooring: [{ name: 'إيبوكسي أرضيات 3D', price: 650, unit: 'كجم' }],
    chemicals_repair: [{ name: 'جراوت غير منكمش', price: 25, unit: 'كجم' }],

    // 3. Finishing
    ceramics: [{ name: 'سيراميك أرضيات فرز أول', price: 220, unit: 'م2' }, { name: 'سيراميك حوائط', price: 190, unit: 'م2' }],
    porcelain: [{ name: 'بورسلين مستورد 60×60', price: 550, unit: 'م2' }, { name: 'بورسلين محلي', price: 400, unit: 'م2' }],
    marble: [{ name: 'رخام جلالة (ترابيع)', price: 450, unit: 'م2' }, { name: 'رخام امبرادور', price: 1800, unit: 'م2' }],
    granite: [{ name: 'جرانيت جندولا', price: 650, unit: 'م2' }, { name: 'جرانيت أسواني', price: 850, unit: 'م2' }],
    parquet: [{ name: 'باركيه أرو مسمار', price: 2500, unit: 'م2' }, { name: 'باركيه HDF', price: 450, unit: 'م2' }],
    hdl_flooring: [{ name: 'HDF ألماني', price: 450, unit: 'م2' }, { name: 'HDF تركي', price: 350, unit: 'م2' }],
    paints_interior: [{ name: 'بلاستيك مط (جوتن)', price: 1100, unit: 'بستلة' }, { name: 'سيلر مائي', price: 550, unit: 'بستلة' }],
    paints_exterior: [{ name: 'غرافيتو واجهات', price: 850, unit: 'بستلة' }],
    wallpaper: [{ name: 'ورق حائط فينيل', price: 1200, unit: 'رول' }],
    gypsum_board: [{ name: 'ألواح جبس بورد كناوف', price: 280, unit: 'لوح' }, { name: 'شاسيه صاج', price: 45, unit: 'م.ط' }],
    cornices: [{ name: 'كرانيش فيوتك', price: 65, unit: 'عود' }],

    // 4. Openings
    aluminum: [{ name: 'قطاع PS كبير', price: 4500, unit: 'م2' }, { name: 'قطاع تانجو', price: 3800, unit: 'م2' }],
    upvc: [{ name: 'قطاعات UPVC تركي', price: 4200, unit: 'م2' }],
    wood_doors: [{ name: 'باب خشب سويد (حلق وضلفة)', price: 3500, unit: 'باب' }],
    glass: [{ name: 'زجاج سيكوريت 10مم', price: 950, unit: 'م2' }],
    accessories_door: [{ name: 'كالون باب (أهرام)', price: 350, unit: 'قطعة' }],

    // 5. MEP
    plumbing_pipes: [{ name: 'مواسير تغذية 3/4 بوصة', price: 180, unit: 'قطعة' }, { name: 'مواسير صرف 4 بوصة', price: 650, unit: 'قطعة' }],
    plumbing_fittings: [{ name: 'جلبة وكوع 3/4 بوصة', price: 25, unit: 'قطعة' }],
    sanitary_ware: [{ name: 'طقم حمام (مرحاض+حوض)', price: 4500, unit: 'طقم' }, { name: 'خلاط مياه', price: 1500, unit: 'قطعة' }],
    water_tanks: [{ name: 'خزان مياه 1000 لتر', price: 3500, unit: 'قطعة' }],
    pumps: [{ name: 'موتور مياه 1 حصان', price: 4500, unit: 'قطعة' }],
    cables_wires: [{ name: 'سلك نحاس 2مم', price: 1800, unit: 'لفة' }, { name: 'سلك نحاس 4مم', price: 3200, unit: 'لفة' }],
    conduits: [{ name: 'خراطيم سوستة 16مم', price: 450, unit: 'لفة' }],
    lighting_units: [{ name: 'سبوت لايت ليد', price: 120, unit: 'قطعة' }, { name: 'شريط ليد', price: 45, unit: 'متر' }],
    switches_sockets: [{ name: 'لقمة مفتاح/بريزة', price: 35, unit: 'قطعة' }],
    panels_breakers: [{ name: 'قاطع أوتوماتيك 63A', price: 450, unit: 'قطعة' }],
    low_current: [{ name: 'كابل Cat6', price: 3500, unit: 'لفة' }],
    hvac_units: [{ name: 'تكييف 1.5 حصان', price: 22000, unit: 'جهاز' }, { name: 'تكييف 3 حصان', price: 38000, unit: 'جهاز' }],
    ducts: [{ name: 'صاج مجلفن', price: 65000, unit: 'طن' }],
    fire_fighting: [{ name: 'رشاش حريق (Sprinkler)', price: 250, unit: 'قطعة' }],
    fire_alarm: [{ name: 'حساس دخان', price: 650, unit: 'قطعة' }],

    // 6. External
    interlock: [{ name: 'إنترلوك 6سم', price: 280, unit: 'م2' }, { name: 'بردورة رصيف', price: 60, unit: 'قطعة' }],
    basalt: [{ name: 'بازلت أسود', price: 350, unit: 'م2' }],
    artificial_grass: [{ name: 'نجيل صناعي لاندسكيب', price: 250, unit: 'م2' }],
    fences: [{ name: 'شبك حديد مجلفن', price: 180, unit: 'م2' }],

    // 7. Labor & Equip
    labor_daily: [
        { name: 'يومية عامل عادي', price: 250, unit: 'يوم' }, 
        { name: 'يومية صنايعي ماهر', price: 450, unit: 'يوم' },
        { name: 'يومية مبلط سيراميك', price: 500, unit: 'يوم' },
        { name: 'يومية مبيض محارة', price: 500, unit: 'يوم' },
        { name: 'يومية مساعد (صنايعي)', price: 300, unit: 'يوم' },
        { name: 'مصنعية سيراميك أرضيات', price: 65, unit: 'م2' },
        { name: 'مصنعية سيراميك حوائط', price: 75, unit: 'م2' },
        { name: 'مصنعية محارة داخلية', price: 45, unit: 'م2' },
        { name: 'مصنعية دهانات (كامل)', price: 50, unit: 'م2' },
        { name: 'مصنعية مباني', price: 400, unit: 'ألف' },
        { name: 'مصنعية خرسانة (نجارة+حدادة)', price: 350, unit: 'م3' }
    ],
    equipment_rental: [{ name: 'إيجار لودر', price: 2500, unit: 'يوم' }, { name: 'إيجار حفار', price: 3000, unit: 'يوم' }],
    scaffolding: [{ name: 'إيجار سقالة معدنية', price: 50, unit: 'م2/شهر' }],
    
    // Tools (New)
    tools_hardware: [{ name: 'صاروخ 9 بوصة (بوش)', price: 4500, unit: 'قطعة' }, { name: 'شنيور هيلتي', price: 3500, unit: 'قطعة' }],

    // 8. Other
    elevators: [{ name: 'مصعد 6 أفراد (إيطالي)', price: 450000, unit: 'مصعد' }],
    other: [{ name: 'نثريات ومواد مساعدة', price: 1000, unit: 'مقطوعية' }],
    
    // 9. Ministry Bulletin (Placeholder)
    ministry_bulletin: []
};

// Helper to handle potential AI formatting issues in JSON (Robust Parser)
const cleanAndParseJSON = (text: string): any => {
    if (!text) return [];
    try {
        return JSON.parse(text);
    } catch (e) {
        // Attempt to clean Markdown wrappers
        let clean = text.replace(/```json/gi, '').replace(/```/g, '').trim();
        try { return JSON.parse(clean); } catch(e2) {}
        // Attempt to find the array or object
        const startArr = clean.indexOf('[');
        const endArr = clean.lastIndexOf(']');
        const startObj = clean.indexOf('{');
        const endObj = clean.lastIndexOf('}');
        let targetSubstring = clean;
        if (startArr !== -1 && endArr !== -1 && (startObj === -1 || startArr < startObj)) {
             targetSubstring = clean.substring(startArr, endArr + 1);
        } else if (startObj !== -1 && endObj !== -1) {
             targetSubstring = clean.substring(startObj, endObj + 1);
        }
        try { return JSON.parse(targetSubstring); } catch (finalError) { return []; }
    }
};

export const marketService = {
    
    // EXPOSE OFFLINE DATA FOR SEEDING
    getOfflineMarketPrices(): MarketItem[] {
        let items: MarketItem[] = [];
        Object.keys(OFFLINE_MARKET_DATA).forEach(key => {
            const cat = key as MarketCategory;
            const catItems = OFFLINE_MARKET_DATA[cat] || [];
            catItems.forEach(item => {
                items.push({
                    id: `seed_${Math.random()}`,
                    name: item.name,
                    price: item.price,
                    unit: item.unit,
                    category: cat,
                    lastUpdated: new Date().toISOString(),
                    trend: 'stable',
                    source: 'نظام (Offline Seed)'
                });
            });
        });
        return items;
    },

    // 1. MAIN MARKET OVERVIEW (General Refresh)
    async getMarketPrices(): Promise<MarketItem[]> {
        const prompt = `
            Act as a Construction Market Analyst in Egypt.
            Search for the LATEST TODAY'S prices (EGP) for these specific items:
            1. Rebar Steel (Ezz, Beshay).
            2. Portland Cement (El Sewedy).
            3. Red Bricks.
            4. Sand.
            5. Electric Cables.
            
            Return a purely JSON Array (No Markdown).
            Format: [{ "name": string, "price": number, "unit": string, "category": string, "source": string }]
        `;
        try {
            const result = await safeGenerateContent(MODEL_SMART, { 
                contents: prompt, 
                config: { 
                    tools: [{ googleSearch: {} }] 
                } 
            });
            const data = cleanAndParseJSON(result.text || '[]');
            
            if (Array.isArray(data) && data.length > 0) {
                return data.map((item: any) => ({ 
                    ...item, 
                    id: item.id || `m_${Math.random().toString(36).substr(2, 9)}`, 
                    lastUpdated: new Date().toISOString(),
                    trend: 'stable'
                }));
            }
            throw new Error("Empty Data");
        } catch (e: any) { 
            console.warn("Market Overview Fallback Triggered");
            // Use the comprehensive offline data instead of hardcoded few items
            return this.getOfflineMarketPrices();
        }
    },

    // 2. CATEGORY UPDATE (Refresh prices + Fetch Specs)
    async fetchCategoryPrices(categoryLabel: string, categoryKey: MarketCategory, existingItems: MarketItem[] = []): Promise<MarketItem[]> {
        const existingNames = existingItems.map(i => i.name).join(', ');
        const prompt = `
            Act as a Procurement Engineer in Egypt.
            Search for the LATEST TODAY'S prices (EGP) and technical specs for the following existing items in category "${categoryLabel}":
            ${existingNames ? `[${existingNames}]` : 'Find 5-8 POPULAR products.'}
            
            Also, find 2-3 NEW popular products in this category that are not in the list above.
            
            Output strictly valid JSON Array (No Markdown).
            JSON Format:
            [
                {
                    "name": "Product Name (Arabic)",
                    "price": 100,
                    "unit": "Unit",
                    "details": { 
                        "description": "Short desc",
                        "specifications": ["Spec 1", "Spec 2"],
                        "usageSteps": ["Step 1", "Step 2"],
                        "consumptionRates": "Rate info",
                        "technicalTips": ["Tip 1"],
                        "safetyPrecautions": "Safety info"
                    },
                    "source": "Source Name"
                }
            ]
        `;

        try {
            const result = await safeGenerateContent(MODEL_SMART, { 
                contents: prompt, 
                config: { tools: [{ googleSearch: {} }] } 
            });
            
            const data = cleanAndParseJSON(result.text || '[]');
            if (!Array.isArray(data) || data.length === 0) throw new Error("Empty Data");

            return data.map((item: any) => ({ 
                id: `live_${categoryKey}_${Math.random().toString(36).substr(2, 9)}`, 
                name: item.name, 
                price: typeof item.price === 'number' ? item.price : 0, 
                unit: item.unit || 'وحدة', 
                category: categoryKey, 
                lastUpdated: new Date().toISOString(),
                trend: 'stable', 
                source: item.source || 'بحث مباشر',
                details: item.details // This ensures specs are saved
            }));

        } catch (e) {
            console.warn(`Market Category Fallback Triggered for ${categoryKey}`);
            
            let fallbackData = OFFLINE_MARKET_DATA[categoryKey];
            
            if (!fallbackData) {
                fallbackData = [{ 
                    name: `${categoryLabel} (سعر تقديري)`, 
                    price: 100, 
                    unit: 'وحدة' 
                }];
            }
            
            return fallbackData.map((item: any) => ({
                id: `offline_${categoryKey}_${Math.random().toString(36).substr(2, 9)}`,
                name: item.name,
                price: item.price,
                unit: item.unit,
                category: categoryKey,
                lastUpdated: new Date().toISOString(),
                trend: 'stable',
                source: 'نظام (Offline Mode)',
                details: {
                    description: `توصيف هندسي قياسي لـ ${item.name}`,
                    specifications: ["مطابق للكود المصري", "خامات معتمدة"],
                    usageSteps: ["يتم التنفيذ طبقاً لأصول الصناعة"],
                    consumptionRates: "حسب الرسومات والمقايسة",
                    technicalTips: ["يرجى مراجعة تاريخ الصلاحية", "التأكد من التخزين الجيد"],
                    safetyPrecautions: "ارتداء مهمات الوقاية الشخصية"
                }
            }));
        }
    },

    // 3. HOUSING BULLETIN ANALYSIS (NEW - Multi File Support)
    async analyzeHousingBulletin(files: File[]): Promise<MarketItem[]> {
        // Convert all files to parts
        const fileParts = await Promise.all(files.map(f => fileToPart(f, true)));
        
        const schema = {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    name: { type: Type.STRING },
                    price: { type: Type.NUMBER },
                    unit: { type: Type.STRING },
                    category: { type: Type.STRING } 
                }
            }
        };

        const prompt = `
            **ROLE:** Senior Quantity Surveyor.
            **TASK:** Analyze the attached "Price Bulletin" files/images (نشرة أسعار).
            
            **INSTRUCTIONS:**
            1. Extract material prices found in the tables across ALL attached files.
            2. Extract Item Name (Arabic), Unit, and Price.
            3. **CRITICAL:** For 'category', identify the *Trade/Section* of the item (e.g., 'Steel', 'Cement', 'Paints', 'Plumbing', 'Electrical', 'Wood'). If unknown, use 'General'.
            4. Ignore general text/headers.
            
            **OUTPUT:** JSON Array only.
        `;

        try {
            const result = await safeGenerateContent(MODEL_SMART, {
                contents: { parts: [...fileParts, { text: prompt }] },
                config: { 
                    responseMimeType: "application/json",
                    responseSchema: schema
                }
            });

            const data = cleanAndParseJSON(result.text || '[]');
            
            if (!Array.isArray(data)) return [];

            return data.map((item: any) => {
                const tradeCategory = item.category || 'بنود عامة';

                return {
                    id: `gov_${Math.random().toString(36).substr(2, 9)}`,
                    name: item.name || "بند نشرة",
                    price: cleanNumber(item.price),
                    unit: item.unit || "وحدة",
                    category: 'ministry_bulletin', 
                    lastUpdated: new Date().toISOString(),
                    trend: 'stable',
                    source: tradeCategory, 
                    details: {
                        description: `سعر رسمي طبقاً للنشرة - قسم ${tradeCategory}`,
                        specifications: ["مواصفات قياسية"],
                        usageSteps: [],
                        consumptionRates: "",
                        technicalTips: [],
                        safetyPrecautions: ""
                    }
                };
            });

        } catch (e) {
            console.error("Bulletin Analysis Failed", e);
            throw new Error("فشل تحليل النشرة");
        }
    },

    // 4. LOAD MORE (Pagination / Discovery)
    async fetchMoreCategoryItems(categoryLabel: string, categoryKey: MarketCategory, existingNames: string[]): Promise<MarketItem[]> {
        const exclusions = existingNames.slice(0, 30).join(', '); 
        const prompt = `
            Act as an Expert Construction Supplier in Egypt.
            Find 3-5 DIFFERENT products for category: "${categoryLabel}" that are commonly used in Egyptian market.
            
            CRITICAL: DO NOT include these items: ${exclusions}.
            
            Provide CURRENT market prices in EGP and basic specs.
            
            Output strictly JSON Array:
            [
                {
                    "name": "Arabic Name", 
                    "price": 100, 
                    "unit": "Unit", 
                    "source": "Search",
                    "details": { "description": "...", "specifications": ["..."] }
                }
            ]
        `;

        try {
            const result = await safeGenerateContent(MODEL_SMART, { 
                contents: prompt, 
                config: { 
                    tools: [{ googleSearch: {} }] 
                } 
            });
            
            const data = cleanAndParseJSON(result.text || '[]');
            
            if (!Array.isArray(data) || data.length === 0) throw new Error("Empty response");

            return data.map((item: any) => ({ 
                id: `more_${categoryKey}_${Math.random().toString(36).substr(2, 9)}`, 
                name: item.name, 
                price: typeof item.price === 'number' ? item.price : 0, 
                unit: item.unit || 'وحدة', 
                category: categoryKey, 
                lastUpdated: new Date().toISOString(),
                trend: 'stable',
                source: 'توسع (AI)',
                details: item.details
            }));

        } catch (e) {
            console.error(`Failed to fetch more for ${categoryLabel}`, e);
            return [];
        }
    },

    // 5. SEARCH SPECIFIC ITEM
    async findMaterialPrice(query: string): Promise<MarketItem | null> {
        const prompt = `
            Get current price for "${query}" in Egypt (EGP). 
            Return JSON: {name, price, unit, category, source, details: {description...}}.
            Output strictly valid JSON string.
        `;
        try {
            const result = await safeGenerateContent(MODEL_SMART, { 
                contents: prompt, 
                config: { tools: [{ googleSearch: {} }] } 
            });
            const data = cleanAndParseJSON(result.text || '{}');
            if (data.name && data.price) {
                return { 
                    id: `s_${Date.now()}`, 
                    name: data.name, 
                    price: data.price, 
                    unit: data.unit || 'Unit', 
                    category: data.category || 'other', 
                    lastUpdated: new Date().toISOString(), 
                    trend: 'stable', 
                    source: data.source || 'بحث أونلاين',
                    details: data.details
                };
            }
            throw new Error("Invalid Data");
        } catch (e) { 
            return {
                id: `s_offline_${Date.now()}`,
                name: query,
                price: 0,
                unit: 'وحدة',
                category: 'other',
                lastUpdated: new Date().toISOString(),
                trend: 'stable',
                source: 'بحث (غير متصل)',
                details: { 
                    description: "تعذر البحث المباشر. يرجى المحاولة لاحقاً.",
                    specifications: [],
                    usageSteps: [],
                    consumptionRates: "",
                    technicalTips: [],
                    safetyPrecautions: ""
                }
            };
        }
    },

    // 6. MATERIAL TECHNICAL DETAILS
    async getMaterialDetails(materialName: string): Promise<{ details: MaterialDetailData, price: number, unit: string }> {
        const cacheKey = materialName.trim().toLowerCase();
        if (materialCache.has(cacheKey)) {
            return materialCache.get(cacheKey);
        }

        const prompt = `
            Technical Data Sheet for: "${materialName}" in Egypt (Arabic).
            Output JSON: { "price": number, "unit": string, "details": { "description", "specifications"[], "usageSteps"[], "consumptionRates", "technicalTips"[], "safetyPrecautions" } }
        `;
        
        try {
            const result = await safeGenerateContent(MODEL_SMART, { 
                contents: prompt, 
                config: { 
                    responseMimeType: "application/json"
                } 
            });
            
            const data = cleanAndParseJSON(result.text || '{}');
            
            const ensureArray = (val: any) => {
                if (Array.isArray(val)) return val;
                if (typeof val === 'string' && val.trim() !== '') return [val];
                return [];
            };

            const finalResult = {
                details: {
                    description: data.details?.description || `توصيف فني: ${materialName}`,
                    specifications: ensureArray(data.details?.specifications).length > 0 ? ensureArray(data.details?.specifications) : ["مطابق للمواصفات القياسية"],
                    usageSteps: ensureArray(data.details?.usageSteps).length > 0 ? ensureArray(data.details?.usageSteps) : ["التنفيذ طبقاً لأصول الهندسية"],
                    consumptionRates: data.details?.consumptionRates || "حسب المقايسة",
                    technicalTips: ensureArray(data.details?.technicalTips).length > 0 ? ensureArray(data.details?.technicalTips) : ["مراجعة الصلاحية"],
                    safetyPrecautions: data.details?.safetyPrecautions || "الالتزام بمهمات السلامة"
                },
                price: typeof data.price === 'number' ? data.price : 0,
                unit: data.unit || "وحدة"
            };

            materialCache.set(cacheKey, finalResult);
            return finalResult;

        } catch (finalError) {
            return {
                details: {
                    description: "جاري تحديث البيانات (وضع غير متصل)",
                    specifications: ["مطابق للكود"],
                    usageSteps: [],
                    consumptionRates: "حسب الاستخدام",
                    technicalTips: [],
                    safetyPrecautions: "مهمات الوقاية"
                },
                price: 0,
                unit: "وحدة"
            };
        }
    }
};
