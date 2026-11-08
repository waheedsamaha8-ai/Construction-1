
// مكتبة المعدلات الهندسية القياسية - طبقا للكود المصري وأصول الصناعة (محدثة - مستوى استشاري)
// Standard Engineering Consumption Rates Library - Consultant Grade

export interface EngineeringSpec {
    keywords: string[]; // Keywords to match user input
    unit: string;
    basis: string; // NEW: Detailed scientific/code basis for the calculation
    materials: {
        name: string;
        unit: string;
        rate: number; // Consumption per unit
        waste: number; // Waste percentage (real site waste)
        category: 'steel' | 'cement' | 'aggregates' | 'bricks' | 'paints' | 'flooring' | 'chemicals' | 'labor' | 'other' | 'gypsum' | 'plumbing' | 'electrical';
    }[];
    labor?: {
        description: string;
        dailyRate: number; // Estimated cost per day for the crew
        productivity: number; // Production per day per unit
    }[];
    equipment?: {
        description: string;
        rate: number; // Cost per unit item
    }[];
}

export const ENGINEERING_SPECS: Record<string, EngineeringSpec> = {
    'reinforced_concrete': {
        keywords: ['خرسانة مسلحة', 'سقف', 'أعمدة', 'قواعد', 'كمرات', 'مسلحة', 'صب خرسانة'],
        unit: 'م3',
        basis: 'طبقاً للكود المصري للخرسانة (ECP 203-2020)، الخلطة التصميمية القياسية لجهد 250 كجم/سم2 تتطلب: 0.8 م3 سن + 0.4 م3 رمل + 350 كجم أسمنت. نسبة الحديد 120 كجم/م3 هي متوسط هندسي للمنشآت السكنية (شامل الهالك والوصلات).',
        materials: [
            { name: 'أسمنت بورتلاندي', unit: 'طن', rate: 0.35, waste: 3, category: 'cement' }, // 350kg standard
            { name: 'رمل', unit: 'م3', rate: 0.4, waste: 5, category: 'aggregates' },
            { name: 'سن / زلط', unit: 'م3', rate: 0.8, waste: 5, category: 'aggregates' },
            { name: 'حديد تسليح', unit: 'طن', rate: 0.12, waste: 7, category: 'steel' }, // Avg 120kg/m3 including overlap
            { name: 'مياه', unit: 'م3', rate: 0.175, waste: 10, category: 'other' },
            { name: 'سلك رباط', unit: 'كجم', rate: 4, waste: 5, category: 'steel' }, // 4kg per m3 concrete approx
            { name: 'بسكوت وإكسسوارات', unit: 'مقطوعية', rate: 1, waste: 0, category: 'other' }
        ],
        labor: [{ description: 'طاقم نجارة وحدادة وصب', dailyRate: 3500, productivity: 15 }], // ~233 EGP/m3
        equipment: [{ description: 'هزاز + خلاطة (أو بمب)', rate: 150 }]
    },
    'plain_concrete': {
        keywords: ['خرسانة عادية', 'فرشة نظافة', 'صب عادية'],
        unit: 'م3',
        basis: 'طبقاً للأصول الصناعية لفرشة النظافة (الخرسانة العادية) أسفل القواعد، بمحتوى أسمنت 250 كجم/م3 (5 شكاير) لتقليل النفاذية وتسوية التربة.',
        materials: [
            { name: 'أسمنت بورتلاندي', unit: 'طن', rate: 0.25, waste: 3, category: 'cement' }, // 250kg
            { name: 'رمل', unit: 'م3', rate: 0.4, waste: 5, category: 'aggregates' },
            { name: 'سن / زلط', unit: 'م3', rate: 0.8, waste: 5, category: 'aggregates' },
            { name: 'مياه', unit: 'م3', rate: 0.15, waste: 10, category: 'other' }
        ],
        labor: [{ description: 'صب وفرمجة', dailyRate: 2000, productivity: 20 }],
        equipment: [{ description: 'خلاطة نحلة', rate: 50 }]
    },
    'brick_cement_25': {
        keywords: ['مباني أسمنتي', 'طوب أسمنتي', 'بناء مصمت', 'حائط 25'],
        unit: 'م3', 
        basis: 'حائط سمك 25 سم (طوبة كاملة). المتر المكعب مباني يحتوي تقريباً على 450 طوبة مقاس قياسي (25×12×6). المونة الأسمنتية تملأ الفراغات وتستهلك حوالي 300 كجم أسمنت لكل 1000 طوبة.',
        materials: [
            { name: 'طوب أسمنتي مصمت 25*12*6', unit: 'ألف', rate: 0.45, waste: 5, category: 'bricks' }, // ~450 bricks
            { name: 'أسمنت', unit: 'طن', rate: 0.08, waste: 5, category: 'cement' }, // Mortar
            { name: 'رمل', unit: 'م3', rate: 0.15, waste: 5, category: 'aggregates' }
        ],
        labor: [{ description: 'بناء ومساعدين', dailyRate: 1200, productivity: 4 }], // ~300 EGP/m3
        equipment: [{ description: 'سقالات ومياه', rate: 30 }]
    },
    'brick_red_12': {
        keywords: ['طوب أحمر', 'مباني طفلي', 'حائط 12', 'قواطيع'],
        unit: 'م2',
        basis: 'حائط سمك 12 سم (نصف طوبة). المتر المسطح يحتاج 90-95 طوبة (شامل الهالك). المونة اللازمة للبناء والعراميس تقدر بـ 4 شكاير أسمنت لكل 1000 طوبة.',
        materials: [
            { name: 'طوب أحمر طفلي (24×11×6)', unit: 'ألف', rate: 0.095, waste: 5, category: 'bricks' }, // ~95 bricks/m2
            { name: 'أسمنت', unit: 'طن', rate: 0.012, waste: 10, category: 'cement' },
            { name: 'رمل', unit: 'م3', rate: 0.04, waste: 5, category: 'aggregates' }
        ],
        labor: [{ description: 'بناء ومساعدين', dailyRate: 1200, productivity: 20 }], // ~60 EGP/m2
        equipment: [{ description: 'تشوين وسقالة', rate: 10 }]
    },
    'plaster_internal': {
        // Removed generic 'داخلي' to avoid conflict with 'دهان داخلي'
        keywords: ['محارة', 'بياض', 'لياسة', 'طرطشة', 'تخشين', 'بياض داخلي'],
        unit: 'م2',
        basis: 'بياض تخشين داخلي سمك متوسط 1.5 سم - 2 سم. يشمل طرطشة عمومية (450 كجم أسمنت/م3 رمل) وبؤج وأوتار وملء (300 كجم أسمنت/م3 رمل).',
        materials: [
            { name: 'أسمنت', unit: 'طن', rate: 0.015, waste: 5, category: 'cement' }, // ~15kg (dash + plaster avg 2cm)
            { name: 'رمل', unit: 'م3', rate: 0.03, waste: 10, category: 'aggregates' },
            { name: 'مياه', unit: 'م3', rate: 0.01, waste: 10, category: 'other' }
        ],
        labor: [{ description: 'مبيض ومساعد', dailyRate: 1000, productivity: 15 }], // ~66 EGP/m2
        equipment: [{ description: 'سقالات', rate: 5 }]
    },
    'ceramic_flooring': {
        keywords: ['سيراميك', 'أرضيات', 'بلاط', 'بورسلين', 'تركيب أرضية'],
        unit: 'م2',
        basis: 'توريد وتركيب سيراميك أرضيات على فرشة رمل 5-7 سم ومونة أسمنتية 2 سم (مفلفلة). يشمل ذلك السقية بأسمنت أبيض أو جراوت.',
        materials: [
            { name: 'سيراميك أرضيات', unit: 'م2', rate: 1.05, waste: 7, category: 'flooring' }, // 7% waste for cutting
            { name: 'أسمنت', unit: 'طن', rate: 0.015, waste: 5, category: 'cement' },
            { name: 'رمل', unit: 'م3', rate: 0.04, waste: 10, category: 'aggregates' }, // Bedding sand 7-10cm
            { name: 'سقيه (أسمنت أبيض)', unit: 'كجم', rate: 0.5, waste: 5, category: 'other' }
        ],
        labor: [{ description: 'مبلط ومساعد', dailyRate: 1200, productivity: 12 }], // ~100 EGP/m2
        equipment: [{ description: 'صاروخ وقده', rate: 5 }]
    },
    'painting_internal': {
        keywords: ['دهانات', 'بلاستيك', 'تشطيب حوائط', 'نقاشة', 'دهان', 'معجون', 'دهان داخلي'],
        unit: 'م2',
        basis: 'نظام دهان متكامل: 1 وجه سيلر مائي + 2 سكينة معجون (أكريليك) + 1 وجه بطانة + 2 وجه تشطيب (بلاستيك مط/نصف لامع).',
        materials: [
            { name: 'سيلر مائي', unit: 'بستلة', rate: 0.01, waste: 2, category: 'paints' }, // 100m2 per drum approx
            { name: 'معجون حوائط', unit: 'كجم', rate: 1.5, waste: 5, category: 'paints' }, // 2-3 layers
            { name: 'بلاستيك مط', unit: 'بستلة', rate: 0.015, waste: 5, category: 'paints' }
        ],
        labor: [{ description: 'نقاش ومساعد', dailyRate: 1000, productivity: 20 }], // ~50 EGP/m2
        equipment: [{ description: 'رولات وسقالة', rate: 5 }]
    },
    'gypsum_board': {
        keywords: ['جبس', 'سقف معلق', 'جيبسوم', 'فلات', 'سقف ساقط'],
        unit: 'م2',
        basis: 'أسقف معلقة جبس بورد (Flat) شاملة الشاسية المعدني (أوميجا، زاوية، سي تشانل) كل 60 سم، مع استخدام المعجون والشريط للفواصل.',
        materials: [
            { name: 'ألواح جبس بورد', unit: 'لوح', rate: 0.35, waste: 10, category: 'gypsum' }, // 1 sheet = 2.88m2
            { name: 'قطاعات صاج (أوميجا/زاوية)', unit: 'متر طولي', rate: 2.8, waste: 10, category: 'steel' },
            { name: 'مسامير وفيشر', unit: 'علبة', rate: 0.05, waste: 5, category: 'other' },
            { name: 'معجون فواصل', unit: 'كجم', rate: 0.5, waste: 5, category: 'gypsum' }
        ],
        labor: [{ description: 'فني تركيب ومساعد', dailyRate: 1500, productivity: 10 }], // ~150 EGP/m2
        equipment: [{ description: 'سقالة وشنيور', rate: 10 }]
    }
};
