
// @ts-nocheck
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { aiHelper } from '../services/aiHelper';
import { MarketItem, MarketCategory, MaterialDetailData } from '../types';

interface MarketPricesModalProps {
    onClose: () => void;
}

// 60+ CATEGORIES CONFIGURATION (Expanded & Balanced)
const CATEGORY_CONFIG: Record<MarketCategory, { label: string, icon: string, gradient: string }> = {
    // 0. Ministry Bulletin (RENAMED)
    ministry_bulletin: { label: 'نشرات أسعار (Bulletins)', icon: 'fa-book-journal-whills', gradient: 'from-slate-800 to-black' },

    // 1. Structural
    steel: { label: 'حديد تسليح', icon: 'fa-cube', gradient: 'from-slate-700 to-slate-900' },
    cement: { label: 'أسمنت', icon: 'fa-cubes', gradient: 'from-gray-400 to-gray-600' },
    concrete: { label: 'خرسانة جاهزة', icon: 'fa-truck-mixer', gradient: 'from-stone-500 to-stone-700' },
    bricks: { label: 'طوب (أحمر/أسمنتي)', icon: 'fa-border-all', gradient: 'from-orange-700 to-red-800' },
    blocks: { label: 'بلوك (خفاف/مفرغ)', icon: 'fa-shapes', gradient: 'from-stone-300 to-stone-500' },
    aggregates: { label: 'رمل وسن', icon: 'fa-mound', gradient: 'from-yellow-500 to-yellow-700' },
    additives: { label: 'إضافات خرسانة', icon: 'fa-flask', gradient: 'from-purple-600 to-purple-800' },
    
    // 2. Insulation & Chemicals
    insulation_water: { label: 'عزل مائي (بيتومين)', icon: 'fa-droplet-slash', gradient: 'from-gray-800 to-black' },
    insulation_thermal: { label: 'عزل حراري (فوم)', icon: 'fa-temperature-low', gradient: 'from-blue-200 to-blue-400' },
    insulation_sound: { label: 'عزل صوتي', icon: 'fa-volume-xmark', gradient: 'from-indigo-300 to-indigo-500' },
    chemicals_flooring: { label: 'إيبوكسي أرضيات', icon: 'fa-paint-roller', gradient: 'from-emerald-600 to-emerald-800' },
    chemicals_repair: { label: 'موي وجراوت', icon: 'fa-trowel-bricks', gradient: 'from-stone-600 to-stone-800' },

    // 3. Finishing (Floors/Walls)
    ceramics: { label: 'سيراميك', icon: 'fa-layer-group', gradient: 'from-orange-400 to-orange-600' },
    porcelain: { label: 'بورسلين', icon: 'fa-gem', gradient: 'from-slate-200 to-slate-400' },
    marble: { label: 'رخام وجرانيت', icon: 'fa-monument', gradient: 'from-stone-200 to-stone-400' },
    granite: { label: 'جرانيت أرضيات', icon: 'fa-hill-rockslide', gradient: 'from-red-900 to-red-950' },
    parquet: { label: 'باركيه خشب', icon: 'fa-tree', gradient: 'from-amber-700 to-amber-900' },
    hdl_flooring: { label: 'أرضيات HDF', icon: 'fa-table-cells', gradient: 'from-amber-600 to-amber-800' },
    paints_interior: { label: 'دهانات داخلية', icon: 'fa-paint-roller', gradient: 'from-rose-400 to-rose-600' },
    paints_exterior: { label: 'دهانات واجهات', icon: 'fa-building', gradient: 'from-stone-400 to-stone-600' },
    wallpaper: { label: 'ورق حائط', icon: 'fa-scroll', gradient: 'from-pink-300 to-pink-500' },
    gypsum_board: { label: 'جبس بورد', icon: 'fa-star-of-david', gradient: 'from-slate-100 to-slate-300' },
    cornices: { label: 'كرانيش (فيوتك)', icon: 'fa-archway', gradient: 'from-gray-100 to-gray-300' },

    // 4. Openings & Cladding
    aluminum: { label: 'ألومنيوم (PS)', icon: 'fa-window-maximize', gradient: 'from-gray-300 to-gray-500' },
    upvc: { label: 'قطاعات UPVC', icon: 'fa-window-restore', gradient: 'from-green-100 to-green-300' },
    wood_doors: { label: 'أبواب خشبية', icon: 'fa-door-closed', gradient: 'from-orange-800 to-orange-950' },
    glass: { label: 'زجاج ومرايا', icon: 'fa-wine-glass', gradient: 'from-cyan-200 to-cyan-400' },
    accessories_door: { label: 'إكسسوار (كوالين)', icon: 'fa-key', gradient: 'from-yellow-600 to-yellow-800' },

    // 5. MEP - Plumbing
    plumbing_pipes: { label: 'مواسير تغذية', icon: 'fa-faucet', gradient: 'from-green-500 to-green-700' },
    plumbing_fittings: { label: 'قطع تغذية وصرف', icon: 'fa-puzzle-piece', gradient: 'from-gray-500 to-gray-700' },
    sanitary_ware: { label: 'أطقم صحي', icon: 'fa-bath', gradient: 'from-cyan-600 to-cyan-800' },
    water_tanks: { label: 'خزانات مياه', icon: 'fa-database', gradient: 'from-blue-600 to-blue-800' },
    pumps: { label: 'طلمبات ومواتير', icon: 'fa-cog', gradient: 'from-red-700 to-red-900' },
    swimming_pools: { label: 'حمامات سباحة', icon: 'fa-water-ladder', gradient: 'from-cyan-500 to-blue-600' }, 

    // 5. MEP - Electrical & Tech
    cables_wires: { label: 'كابلات وأسلاك', icon: 'fa-bolt', gradient: 'from-yellow-400 to-orange-500' },
    conduits: { label: 'خراطيم كهرباء', icon: 'fa-ring', gradient: 'from-orange-300 to-orange-500' },
    lighting_units: { label: 'وحدات إضاءة', icon: 'fa-lightbulb', gradient: 'from-yellow-200 to-yellow-400' },
    switches_sockets: { label: 'مفاتيح وبرايز', icon: 'fa-toggle-on', gradient: 'from-gray-200 to-gray-400' },
    panels_breakers: { label: 'لوحات وقواطع', icon: 'fa-server', gradient: 'from-slate-600 to-slate-800' },
    low_current: { label: 'تيار خفيف (داتا)', icon: 'fa-wifi', gradient: 'from-indigo-500 to-indigo-700' },
    smart_home: { label: 'سمارت هوم', icon: 'fa-mobile-screen-button', gradient: 'from-purple-500 to-indigo-600' }, 
    solar_energy: { label: 'طاقة شمسية', icon: 'fa-solar-panel', gradient: 'from-orange-400 to-yellow-500' }, 

    // 5. MEP - HVAC
    hvac_units: { label: 'تكييفات', icon: 'fa-fan', gradient: 'from-sky-500 to-sky-700' },
    ducts: { label: 'صاج تكييف', icon: 'fa-sheet-plastic', gradient: 'from-zinc-400 to-zinc-600' },
    fire_fighting: { label: 'رشاشات حريق', icon: 'fa-faucet-drip', gradient: 'from-red-500 to-red-700' },
    fire_alarm: { label: 'إنذار حريق', icon: 'fa-bell', gradient: 'from-red-600 to-red-800' },

    // 6. External & Others
    interlock: { label: 'إنترلوك وبردورة', icon: 'fa-border-none', gradient: 'from-orange-600 to-red-700' },
    basalt: { label: 'بازلت ودبش', icon: 'fa-cubes-stacked', gradient: 'from-gray-800 to-black' },
    artificial_grass: { label: 'نجيل صناعي', icon: 'fa-seedling', gradient: 'from-green-500 to-green-700' },
    fences: { label: 'أسوار وشبك', icon: 'fa-bars', gradient: 'from-emerald-700 to-emerald-900' },
    landscape_soft: { label: 'لاندسكيب ونباتات', icon: 'fa-tree', gradient: 'from-green-600 to-emerald-800' }, 
    
    // Labor & Tools (Even Count)
    labor_daily: { label: 'يوميات ومصنعيات', icon: 'fa-users-gear', gradient: 'from-blue-500 to-blue-700' },
    equipment_rental: { label: 'إيجار معدات', icon: 'fa-truck-field', gradient: 'from-yellow-600 to-yellow-800' },
    scaffolding: { label: 'سقالات وشدات', icon: 'fa-dungeon', gradient: 'from-orange-400 to-orange-600' },
    tools_hardware: { label: 'عدد وأدوات يدوية', icon: 'fa-hammer', gradient: 'from-slate-500 to-slate-700' }, // NEW: Makes it even
    
    elevators: { label: 'مصاعد', icon: 'fa-elevator', gradient: 'from-zinc-700 to-zinc-900' },
    other: { label: 'أخرى', icon: 'fa-box-open', gradient: 'from-slate-400 to-slate-600' }
};

// Helper function to ensure arrays for rendering
const ensureArray = (val: any): string[] => {
    if (Array.isArray(val)) return val;
    if (typeof val === 'string' && val.trim() !== '') return [val];
    return [];
};

export default function MarketPricesModal({ onClose }: MarketPricesModalProps) {
    const navigate = useNavigate();
    const [prices, setPrices] = useState<MarketItem[]>([]);
    const [viewMode, setViewMode] = useState<'categories' | 'items' | 'detail'>('categories');
    const [selectedCategory, setSelectedCategory] = useState<MarketCategory | null>(null);
    const [selectedMaterial, setSelectedMaterial] = useState<MarketItem | null>(null); 
    const [materialDetails, setMaterialDetails] = useState<MaterialDetailData | null>(null); 
    const [loadingDetails, setLoadingDetails] = useState(false); 
    const [loadingCategory, setLoadingCategory] = useState(false); 
    const [loadingMore, setLoadingMore] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // --- Editing State ---
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<{ name: string, price: string }>({ name: '', price: '' });

    // --- Bulletin Upload State ---
    const bulletinInputRef = useRef<HTMLInputElement>(null);
    const [isAnalyzingBulletin, setIsAnalyzingBulletin] = useState(false);
    const [expandedBulletins, setExpandedBulletins] = useState<Set<string>>(new Set());

    // --- ADD ITEM MANUALLY STATE (NEW) ---
    const [showAddModal, setShowAddModal] = useState(false);
    const [addForm, setAddForm] = useState<{ name: string, price: string, unit: string, category?: MarketCategory, bulletinId: string }>({ name: '', price: '', unit: '', bulletinId: '' });

    useEffect(() => {
        // 1. Initial local load
        api.getMarketPrices([]).then(data => {
            if (data && data.length > 0) setPrices(data);
        });

        // 2. Instant real-time Firestore synchronization across all users
        const unsubscribe = api.subscribeToMarketPrices((liveItems) => {
            if (liveItems && Array.isArray(liveItems)) {
                setPrices(liveItems);
            }
        });

        return () => {
            unsubscribe();
        };
    }, []);

    useEffect(() => {
        if (selectedMaterial && viewMode === 'detail') {
            if (selectedMaterial.details) {
                setMaterialDetails(selectedMaterial.details);
            } else {
                // If details missing, fetch and save
                const fetchMissingDetails = async () => {
                    setLoadingDetails(true);
                    try {
                        const result = await aiHelper.getMaterialDetails(selectedMaterial.name);
                        setMaterialDetails(result.details);
                        
                        // Update item in state and save
                        const updatedPrices = prices.map(p => p.id === selectedMaterial.id ? { ...p, details: result.details, price: result.price > 0 ? result.price : p.price } : p);
                        setPrices(updatedPrices);
                        await api.saveMarketPrices(updatedPrices); // Sync to Firestore
                    } finally { setLoadingDetails(false); }
                };
                fetchMissingDetails();
            }
        }
    }, [selectedMaterial?.id, viewMode]);

    // Update Price Logic (Calls AI to get LIVE prices + specs)
    const handleUpdateCategory = async () => {
        if (!selectedCategory) return;
        setLoadingCategory(true);
        try {
            const label = CATEGORY_CONFIG[selectedCategory].label;
            const existingItems = prices.filter(p => p.category === selectedCategory);
            const newItems = await aiHelper.fetchCategoryPrices(label, selectedCategory, existingItems);
            
            if (newItems.length > 0) {
                // Smart Merge via API Service (Syncs with Firestore)
                await api.mergeAndSaveMarketPrices(newItems, prices);
                
                // Refresh local state
                const updated = await api.getMarketPrices([]);
                setPrices(updated);
            }
        } catch (e) {
            console.error("Failed to update category", e);
        } finally {
            setLoadingCategory(false);
        }
    };

    // Load More Logic (Find NEW items)
    const handleLoadMoreItems = async () => {
        if (!selectedCategory) return;
        setLoadingMore(true);
        try {
            const label = CATEGORY_CONFIG[selectedCategory].label;
            // Send existing names to exclude them
            const existingNames = prices
                .filter(p => p.category === selectedCategory)
                .map(p => p.name);

            const newItems = await aiHelper.fetchMoreCategoryItems(label, selectedCategory, existingNames);
            
            if (newItems.length > 0) {
                await api.mergeAndSaveMarketPrices(newItems, prices);
                const updated = await api.getMarketPrices([]);
                setPrices(updated);
            } else {
                alert("لم يتم العثور على خامات جديدة.");
            }
        } finally {
            setLoadingMore(false);
        }
    };

    const handleCategoryClick = (cat: MarketCategory) => { 
        setSelectedCategory(cat); 
        setViewMode('items'); 
        setSearchQuery('');
        
        // Auto-fetch logic (Skipped for bulletin)
        if (cat === 'ministry_bulletin') return;

        const hasItems = prices.some(p => p.category === cat);
        if (!hasItems) {
            (async () => {
                setLoadingCategory(true);
                try {
                    const label = CATEGORY_CONFIG[cat].label;
                    const newItems = await aiHelper.fetchCategoryPrices(label, cat);
                    if(newItems.length > 0) {
                        await api.mergeAndSaveMarketPrices(newItems, prices);
                        setPrices(await api.getMarketPrices([]));
                    }
                } finally { setLoadingCategory(false); }
            })();
        }
    };

    const handleItemClickInternal = (e: React.MouseEvent, item: MarketItem) => { 
        // Prevent opening detail if we are in edit mode or clicked actions
        if (editingId) return;
        setSelectedMaterial(item); 
        setViewMode('detail'); 
    };

    const handleBack = () => { if (viewMode === 'detail') { setViewMode('items'); setSelectedMaterial(null); } else if (viewMode === 'items') { setViewMode('categories'); setSelectedCategory(null); setSearchQuery(''); } };

    // --- BULLETIN UPLOAD HANDLER ---
    const handleBulletinUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        
        // Convert FileList to Array
        const fileList = Array.from(files);

        // Prompt for bulletin name
        const suggestedName = `نشرة ${new Date().toLocaleDateString('ar-EG', {month: 'long', year: 'numeric'})}`;
        const bulletinName = prompt("من فضلك أدخل اسم النشرة (مثال: نشرة مايو 2024):", suggestedName);
        
        if (!bulletinName) {
            if (bulletinInputRef.current) bulletinInputRef.current.value = '';
            return;
        }

        setIsAnalyzingBulletin(true);
        try {
            // New logic: Pass bulletin info to analysis
            const newBulletinId = `bull_${Date.now()}`;
            // Handle multiple files
            const items = await aiHelper.analyzeHousingBulletin(fileList);
            
            if (items.length > 0) {
                // Tag items with Bulletin ID and Name
                const taggedItems = items.map(item => ({
                    ...item,
                    bulletinId: newBulletinId,
                    bulletinName: bulletinName
                }));

                await api.mergeAndSaveMarketPrices(taggedItems, prices);
                setPrices(await api.getMarketPrices([]));
                
                // Expand this new bulletin immediately
                setExpandedBulletins(prev => new Set(prev).add(newBulletinId));
                
                alert(`تم إضافة النشرة "${bulletinName}" بنجاح (${taggedItems.length} بند) من ${fileList.length} ملف.`);
            } else {
                alert("لم يتم العثور على بنود واضحة في الملفات.");
            }
        } catch (e) {
            console.error(e);
            alert("حدث خطأ أثناء تحليل النشرة.");
        } finally {
            setIsAnalyzingBulletin(false);
            if (bulletinInputRef.current) bulletinInputRef.current.value = '';
        }
    };

    const toggleBulletin = (id: string) => {
        const newSet = new Set(expandedBulletins);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setExpandedBulletins(newSet);
    };

    // --- ITEM ACTION HANDLERS ---
    const handleStartEdit = (e: React.MouseEvent, item: MarketItem) => {
        e.stopPropagation();
        setEditingId(item.id);
        setEditForm({ name: item.name, price: item.price.toString() });
    };

    const handleCancelEdit = (e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingId(null);
        setEditForm({ name: '', price: '' });
    };

    const handleSaveEdit = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        const newPrice = parseFloat(editForm.price);
        if (!editForm.name || isNaN(newPrice)) return;

        const updatedPrices = prices.map(p => 
            p.id === id 
            ? { ...p, name: editForm.name, price: newPrice, lastUpdated: new Date().toISOString(), updatedBy: 'user' } 
            : p
        );
        
        setPrices(updatedPrices);
        await api.saveMarketPrices(updatedPrices);
        setEditingId(null);
    };

    const handleDeleteMaterial = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (!window.confirm("هل أنت متأكد من حذف هذه الخامة؟")) return;

        const originalPrices = [...prices];
        const updatedPrices = prices.filter(p => p.id !== id);
        
        // Optimistic update
        setPrices(updatedPrices);
        
        try {
            await api.saveMarketPrices(updatedPrices);
        } catch (err) {
            console.error("Delete failed", err);
            alert("فشل حذف الخامة. يرجى المحاولة مرة أخرى.");
            setPrices(originalPrices); // Revert
        }
    };

    // --- BULLETIN ACTION HANDLER (NEW) ---
    const handleDeleteBulletin = async (e: React.MouseEvent, bulletinId: string) => {
        e.stopPropagation();
        if (!window.confirm("هل أنت متأكد من حذف النشرة بالكامل؟ سيتم حذف جميع البنود داخلها.")) return;
        
        // Filter out all items with this bulletinId
        const updatedPrices = prices.filter(p => p.bulletinId !== bulletinId);
        setPrices(updatedPrices);
        await api.saveMarketPrices(updatedPrices);
        
        // Remove from expanded set if present
        const newExpanded = new Set(expandedBulletins);
        newExpanded.delete(bulletinId);
        setExpandedBulletins(newExpanded);
    };

    // --- ADD MANUAL ITEM HANDLERS (NEW) ---
    const openAddModal = (bulletinId: string = '') => {
        setAddForm({ name: '', price: '', unit: '', category: selectedCategory || 'steel', bulletinId: bulletinId });
        setShowAddModal(true);
    };

    const confirmAddItem = async () => {
        const cat = selectedCategory || addForm.category || 'steel';
        if (!addForm.name.trim() || !addForm.price) return;
        
        const newItem: MarketItem = {
            id: `man_${Date.now()}`,
            name: addForm.name.trim(),
            price: parseFloat(addForm.price),
            unit: addForm.unit.trim() || 'وحدة',
            category: cat,
            bulletinId: addForm.bulletinId || undefined,
            bulletinName: addForm.bulletinId ? prices.find(p => p.bulletinId === addForm.bulletinId)?.bulletinName : undefined,
            lastUpdated: new Date().toISOString(),
            source: 'إضافة يدوية',
            trend: 'stable'
        };

        setShowAddModal(false);
        await api.mergeAndSaveMarketPrices([newItem], prices);
    };

    // Grouping Logic for Bulletin View
    const bulletinGroups = useMemo(() => {
        if (selectedCategory !== 'ministry_bulletin') return null;
        
        const groups: Record<string, MarketItem[]> = {};
        prices.filter(p => p.category === 'ministry_bulletin' || p.bulletinId).forEach(item => {
            const bId = item.bulletinId || 'legacy';
            if (!groups[bId]) groups[bId] = [];
            groups[bId].push(item);
        });
        
        // Sort groups by latest first (heuristic: bulletinId timestamp or creation)
        return Object.entries(groups).sort((a, b) => {
            if (a[0] === 'legacy') return 1;
            if (b[0] === 'legacy') return -1;
            return b[0].localeCompare(a[0]); // Simple sort by ID assuming timestamp
        });
    }, [prices, selectedCategory]);

    const filteredItems = searchQuery.trim() ? prices.filter(p => p.name.includes(searchQuery.trim())) : selectedCategory ? prices.filter(p => p.category === selectedCategory) : [];
    
    // UI Logic
    const isSearching = searchQuery.trim().length > 0;
    const showCategories = !isSearching && viewMode === 'categories';
    const showItems = (isSearching || viewMode === 'items') && viewMode !== 'detail';
    const showDetail = viewMode === 'detail' && selectedMaterial;

    return (
        <div className="fixed inset-0 z-[2000] bg-slate-50 flex flex-col animate-fade-in no-print overflow-hidden">
            
            {/* Header */}
            <div className="bg-white p-4 shrink-0 border-b border-slate-100 shadow-sm z-30">
                <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center gap-3">
                        {(viewMode === 'items' || viewMode === 'detail') && !isSearching ? (
                            <button onClick={handleBack} className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition text-slate-600 shadow-sm"><i className="fa-solid fa-arrow-right rtl:rotate-180"></i></button>
                        ) : (
                            <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center shadow-sm"><i className="fa-solid fa-sack-dollar text-xl"></i></div>
                        )}
                        <div>
                            <h3 className="text-lg font-black text-slate-800 truncate max-w-[150px] sm:max-w-none">
                                {viewMode === 'detail' && selectedMaterial ? selectedMaterial.name : (isSearching ? 'بحث...' : (selectedCategory ? CATEGORY_CONFIG[selectedCategory].label : 'بورصة مواد البناء'))}
                            </h3>
                            <p className="text-[10px] text-slate-400 font-bold hidden sm:block">تحديثات لحظية للسوق المصري</p>
                        </div>
                    </div>
                    
                    <div className="flex gap-2">
                        {/* Global Add Material Button on Categories view */}
                        {viewMode === 'categories' && !isSearching && (
                            <button onClick={() => openAddModal()} className="bg-green-600 text-white px-3 py-2 rounded-xl font-bold hover:bg-green-700 transition flex items-center gap-2 text-[10px] shadow-lg">
                                <i className="fa-solid fa-plus"></i>
                                <span className="hidden sm:inline">إضافة خامة</span>
                            </button>
                        )}

                        {/* Bulletin Upload Button - Only visible inside Ministry Category */}
                        {viewMode === 'items' && selectedCategory === 'ministry_bulletin' && (
                            <>
                                <button onClick={() => bulletinInputRef.current?.click()} disabled={isAnalyzingBulletin} className="bg-slate-900 text-white px-3 py-2 rounded-xl font-bold hover:bg-slate-800 transition flex items-center gap-2 text-[10px] shadow-lg disabled:opacity-70">
                                    {isAnalyzingBulletin ? <i className="fa-solid fa-circle-notch fa-spin"></i> : <i className="fa-solid fa-plus"></i>}
                                    <span className="hidden sm:inline">إضافة نشرة جديدة</span>
                                </button>
                                {/* Added 'multiple' attribute here */}
                                <input type="file" ref={bulletinInputRef} onChange={handleBulletinUpload} accept="application/pdf,image/*" multiple className="hidden" />
                            </>
                        )}

                        {/* Action Buttons for Normal Categories */}
                        {viewMode === 'items' && selectedCategory && selectedCategory !== 'ministry_bulletin' && !isSearching && (
                            <>
                                {/* ADD MANUAL ITEM BUTTON (For Categories) */}
                                <button onClick={() => openAddModal()} className="bg-green-600 text-white px-3 py-2 rounded-xl font-bold hover:bg-green-700 transition flex items-center gap-2 text-[10px] shadow-lg">
                                    <i className="fa-solid fa-plus"></i>
                                    <span className="hidden sm:inline">إضافة يدوية</span>
                                </button>

                                <button onClick={handleUpdateCategory} disabled={loadingCategory} className="bg-blue-600 text-white px-3 py-2 rounded-xl font-bold hover:bg-blue-700 transition flex items-center gap-2 text-[10px] shadow-lg disabled:opacity-70">
                                    {loadingCategory ? <i className="fa-solid fa-circle-notch fa-spin"></i> : <i className="fa-solid fa-rotate"></i>}
                                    <span className="hidden sm:inline">تحديث الأسعار</span>
                                </button>
                                <button onClick={handleLoadMoreItems} disabled={loadingMore} className="bg-indigo-600 text-white px-3 py-2 rounded-xl font-bold hover:bg-indigo-700 transition flex items-center gap-2 text-[10px] shadow-lg disabled:opacity-70">
                                    {loadingMore ? <i className="fa-solid fa-circle-notch fa-spin"></i> : <i className="fa-solid fa-magnifying-glass-plus"></i>}
                                    <span className="hidden sm:inline">المزيد</span>
                                </button>
                            </>
                        )}
                        <button onClick={onClose} className="w-10 h-10 rounded-xl bg-red-50 text-red-500 hover:bg-red-100 flex items-center justify-center transition shadow-sm"><i className="fa-solid fa-times"></i></button>
                    </div>
                </div>

                {viewMode !== 'detail' && (
                    <div className="relative">
                        <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="بحث عن خامة..." className="w-full bg-slate-100 border-none rounded-xl py-3 pr-10 pl-4 outline-none focus:ring-2 focus:ring-indigo-500 transition text-slate-700 font-bold placeholder:font-normal text-sm" />
                        <div className="absolute right-3 top-1/2 -translate-x-1/2 -translate-y-1/2 text-slate-400"><i className="fa-solid fa-search"></i></div>
                    </div>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 bg-slate-50 relative custom-scrollbar">
                
                {/* Categories Grid (Expanded 60+) */}
                {showCategories && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 pb-20">
                        {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
                            <div key={key} onClick={() => handleCategoryClick(key as MarketCategory)} className={`relative h-28 sm:h-32 rounded-2xl overflow-hidden cursor-pointer group shadow-sm hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 bg-gradient-to-br ${config.gradient}`}>
                                <i className={`fa-solid ${config.icon} absolute -bottom-4 -left-4 text-6xl text-white opacity-10 group-hover:scale-110 transition-transform duration-500 rotate-12`}></i>
                                <div className="absolute inset-0 p-3 flex flex-col justify-between z-10">
                                    <div className="flex justify-between items-start">
                                        <div className="w-8 h-8 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center text-white border border-white/10 shadow-inner"><i className={`fa-solid ${config.icon} text-xs`}></i></div>
                                        {prices.filter(p => p.category === key).length > 0 && <span className="bg-black/20 text-white text-[8px] px-2 py-0.5 rounded-full backdrop-blur-sm font-bold border border-white/5">{prices.filter(p => p.category === key).length}</span>}
                                    </div>
                                    <h3 className="text-white font-bold text-xs sm:text-sm leading-tight tracking-wide drop-shadow-sm">{config.label}</h3>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Items List (Mobile Optimized Vertical Cards) */}
                {showItems && (
                    <div className="flex flex-col gap-3 pb-20 max-w-4xl mx-auto animate-slide-up">
                        
                        {/* SPECIAL VIEW: BULLETINS ACCORDION */}
                        {selectedCategory === 'ministry_bulletin' && !isSearching && bulletinGroups ? (
                            <>
                                {bulletinGroups.length === 0 && (
                                    <div className="text-center py-12 flex flex-col items-center">
                                        <i className="fa-solid fa-file-invoice text-4xl text-slate-300 mb-4"></i>
                                        <h3 className="text-sm font-bold text-slate-600">لا توجد نشرات محفوظة</h3>
                                        <p className="text-xs text-slate-400 mt-2 max-w-xs">
                                            اضغط "إضافة نشرة جديدة" أعلاه لرفع ملفات PDF أو صور وتحليلها.
                                        </p>
                                    </div>
                                )}

                                {bulletinGroups.map(([bId, bItems]) => {
                                    const bName = bItems[0]?.bulletinName || 'نشرة عامة';
                                    const isExpanded = expandedBulletins.has(bId);
                                    
                                    // Group items inside bulletin by category logic (or source as fallback)
                                    // Here we simulate divisions by their actual material type detected by AI or fallback 'other'
                                    // We can reuse the CATEGORY_CONFIG keys if AI mapped them, or just list them.
                                    
                                    // Group by sub-category for display inside card
                                    const subGroups: Record<string, MarketItem[]> = {};
                                    bItems.forEach(i => {
                                        // Use 'source' field as subcategory holder if available, else generic
                                        const subKey = i.source !== 'نشرة وزارة الإسكان' ? i.source : 'بنود عامة';
                                        if(!subKey) return;
                                        if(!subGroups[subKey]) subGroups[subKey] = [];
                                        subGroups[subKey].push(i);
                                    });

                                    return (
                                        <div key={bId} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden transition-all duration-300">
                                            <div 
                                                onClick={() => toggleBulletin(bId)}
                                                className={`p-4 flex justify-between items-center cursor-pointer transition-colors ${isExpanded ? 'bg-slate-50' : 'bg-white hover:bg-slate-50'}`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white shadow-sm transition-transform ${isExpanded ? 'bg-blue-600 rotate-90' : 'bg-slate-800'}`}>
                                                        <i className={`fa-solid ${isExpanded ? 'fa-folder-open' : 'fa-folder'} text-sm`}></i>
                                                    </div>
                                                    <div>
                                                        <h3 className="font-bold text-slate-800 text-sm">{bName}</h3>
                                                        <p className="text-[10px] text-slate-500 font-bold">{bItems.length} بند • {new Date(bItems[0].lastUpdated).toLocaleDateString('ar-EG')}</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    {/* DELETE BULLETIN BUTTON */}
                                                    <button 
                                                        onClick={(e) => handleDeleteBulletin(e, bId)}
                                                        className="w-8 h-8 rounded-full bg-white hover:bg-red-50 text-slate-400 hover:text-red-500 border border-slate-200 flex items-center justify-center transition"
                                                        title="حذف النشرة بالكامل"
                                                    >
                                                        <i className="fa-solid fa-trash-can text-xs"></i>
                                                    </button>
                                                    <div className="text-slate-400">
                                                        <i className={`fa-solid fa-chevron-down transition-transform duration-300 ${isExpanded ? 'rotate-180 text-blue-600' : ''}`}></i>
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            {isExpanded && (
                                                <div className="p-2 border-t border-slate-100 bg-slate-50/50">
                                                    {/* ADD ITEM TO BULLETIN BUTTON (Inside Expanded) */}
                                                    <div className="px-2 pb-2">
                                                        <button 
                                                            onClick={() => openAddModal(bId)}
                                                            className="w-full bg-blue-50 text-blue-600 py-2 rounded-xl font-bold text-xs border border-blue-200 hover:bg-blue-100 transition flex items-center justify-center gap-2 border-dashed"
                                                        >
                                                            <i className="fa-solid fa-plus"></i> إضافة بند لهذه النشرة يدوياً
                                                        </button>
                                                    </div>

                                                    {Object.entries(subGroups).map(([subKey, subItems]) => (
                                                        <div key={subKey} className="mb-3 last:mb-0">
                                                            {/* Sub-Header if distinct groups exist */}
                                                            {Object.keys(subGroups).length > 1 && (
                                                                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2 px-2 mt-2">{subKey}</h4>
                                                            )}
                                                            <div className="grid grid-cols-1 gap-2">
                                                                {subItems.map(item => (
                                                                    <div key={item.id} onClick={(e) => handleItemClickInternal(e, item)} className="bg-white p-3 rounded-xl border border-slate-100 cursor-pointer hover:border-blue-300 shadow-sm group">
                                                                        {editingId === item.id ? (
                                                                            <div className="w-full flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
                                                                                <input 
                                                                                    type="text" 
                                                                                    value={editForm.name} 
                                                                                    onChange={(e) => setEditForm({...editForm, name: e.target.value})} 
                                                                                    className="w-full p-2 border border-blue-300 rounded-lg text-sm font-bold bg-blue-50 outline-none"
                                                                                    placeholder="اسم الخامة"
                                                                                    autoFocus
                                                                                />
                                                                                <div className="flex items-center gap-2">
                                                                                    <input 
                                                                                        type="number" 
                                                                                        value={editForm.price} 
                                                                                        onChange={(e) => setEditForm({...editForm, price: e.target.value})} 
                                                                                        className="w-32 p-2 border border-blue-300 rounded-lg text-sm font-bold bg-blue-50 outline-none"
                                                                                        placeholder="السعر"
                                                                                    />
                                                                                    <span className="text-xs text-slate-500 font-bold">{item.unit}</span>
                                                                                    <div className="flex-1"></div>
                                                                                    <button onClick={(e) => handleSaveEdit(e, item.id)} className="bg-green-600 text-white p-2 rounded-lg text-xs hover:bg-green-700 transition"><i className="fa-solid fa-check"></i> حفظ</button>
                                                                                    <button onClick={handleCancelEdit} className="bg-slate-200 text-slate-600 p-2 rounded-lg text-xs hover:bg-slate-300 transition"><i className="fa-solid fa-times"></i></button>
                                                                                </div>
                                                                            </div>
                                                                        ) : (
                                                                            <div className="flex justify-between items-center">
                                                                                <div>
                                                                                    <h5 className="font-bold text-slate-800 text-xs">{item.name}</h5>
                                                                                    <span className="text-[9px] text-slate-400">{item.unit}</span>
                                                                                </div>
                                                                                <div className="flex items-center gap-3">
                                                                                    <div className="text-left">
                                                                                        <span className="font-black text-slate-900 font-mono text-sm block">{item.price.toLocaleString()}</span>
                                                                                        <span className="text-[8px] text-slate-500">ج.م</span>
                                                                                    </div>
                                                                                    <div className="flex gap-1">
                                                                                        <button 
                                                                                            onClick={(e) => handleStartEdit(e, item)} 
                                                                                            className="w-7 h-7 rounded-full bg-slate-50 text-slate-400 hover:bg-blue-100 hover:text-blue-600 transition flex items-center justify-center border border-slate-100"
                                                                                            title="تعديل"
                                                                                        >
                                                                                            <i className="fa-solid fa-pen text-[10px]"></i>
                                                                                        </button>
                                                                                        <button 
                                                                                            onClick={(e) => handleDeleteMaterial(e, item.id)} 
                                                                                            className="w-7 h-7 rounded-full bg-slate-50 text-slate-400 hover:bg-red-100 hover:text-red-600 transition flex items-center justify-center border border-slate-100"
                                                                                            title="حذف"
                                                                                        >
                                                                                            <i className="fa-solid fa-trash text-[10px]"></i>
                                                                                        </button>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </>
                        ) : (
                            /* STANDARD ITEM LIST VIEW */
                            <>
                                {loadingCategory && filteredItems.length === 0 ? (
                                    <div className="text-center py-12 flex flex-col items-center">
                                        <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                                        <h3 className="text-sm font-bold text-slate-700 mb-1">جاري البحث في السوق...</h3>
                                        <p className="text-[10px] text-slate-400">يتم جلب أحدث الأسعار والمواصفات من الإنترنت.</p>
                                    </div>
                                ) : (
                                    <>
                                        {filteredItems.map(item => (
                                            <div key={item.id} onClick={(e) => handleItemClickInternal(e, item)} className="bg-white p-3 rounded-xl shadow-sm border border-slate-100 cursor-pointer hover:border-blue-300 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 group relative overflow-hidden">
                                                
                                                {/* EDIT MODE */}
                                                {editingId === item.id ? (
                                                    <div className="w-full flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
                                                        <input 
                                                            type="text" 
                                                            value={editForm.name} 
                                                            onChange={(e) => setEditForm({...editForm, name: e.target.value})} 
                                                            className="w-full p-2 border border-blue-300 rounded-lg text-sm font-bold bg-blue-50 outline-none"
                                                            placeholder="اسم الخامة"
                                                            autoFocus
                                                        />
                                                        <div className="flex items-center gap-2">
                                                            <input 
                                                                type="number" 
                                                                value={editForm.price} 
                                                                onChange={(e) => setEditForm({...editForm, price: e.target.value})} 
                                                                className="w-32 p-2 border border-blue-300 rounded-lg text-sm font-bold bg-blue-50 outline-none"
                                                                placeholder="السعر"
                                                            />
                                                            <span className="text-xs text-slate-500 font-bold">{item.unit}</span>
                                                            <div className="flex-1"></div>
                                                            <button onClick={(e) => handleSaveEdit(e, item.id)} className="bg-green-600 text-white p-2 rounded-lg text-xs hover:bg-green-700 transition"><i className="fa-solid fa-check"></i> حفظ</button>
                                                            <button onClick={handleCancelEdit} className="bg-slate-200 text-slate-600 p-2 rounded-lg text-xs hover:bg-slate-300 transition"><i className="fa-solid fa-times"></i></button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    /* DISPLAY MODE */
                                                    <>
                                                        <div className={`absolute top-0 right-0 w-1 h-full ${item.trend === 'up' ? 'bg-red-500' : item.trend === 'down' ? 'bg-emerald-500' : 'bg-slate-300'}`}></div>
                                                        
                                                        <div className="flex items-start gap-3 pl-2 sm:pl-0 w-full sm:w-auto">
                                                            <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400 text-sm shrink-0 border border-slate-100 group-hover:bg-blue-50 group-hover:text-blue-600 transition">
                                                                <i className={`fa-solid ${item.trend === 'up' ? 'fa-arrow-trend-up text-red-500' : item.trend === 'down' ? 'fa-arrow-trend-down text-emerald-500' : 'fa-minus'}`}></i>
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <h4 className="font-bold text-slate-800 text-sm truncate leading-tight group-hover:text-blue-700 transition">{item.name}</h4>
                                                                <div className="flex items-center gap-2 mt-1">
                                                                    <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200 truncate max-w-[100px]">{item.source || 'محلي'}</span>
                                                                    <span className="text-[9px] text-slate-400 font-mono">{new Date(item.lastUpdated).toLocaleDateString('ar-EG')}</span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Price Section & Actions */}
                                                        <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto mt-2 sm:mt-0 pt-2 sm:pt-0 border-t sm:border-none border-slate-50">
                                                            <div className="text-left">
                                                                <span className="font-black text-slate-800 text-lg font-mono tracking-tight block sm:inline">{item.price.toLocaleString()}</span>
                                                                <span className="text-[10px] text-slate-500 font-bold mr-1">ج.م / {item.unit}</span>
                                                            </div>
                                                            
                                                            {/* Actions Row */}
                                                            <div className="flex gap-1">
                                                                <button 
                                                                    onClick={(e) => handleStartEdit(e, item)} 
                                                                    className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-blue-100 hover:text-blue-600 transition flex items-center justify-center border border-slate-200"
                                                                    title="تعديل"
                                                                >
                                                                    <i className="fa-solid fa-pen text-xs"></i>
                                                                </button>
                                                                <button 
                                                                    onClick={(e) => handleDeleteMaterial(e, item.id)} 
                                                                    className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-red-100 hover:text-red-600 transition flex items-center justify-center border border-slate-200"
                                                                    title="حذف"
                                                                >
                                                                    <i className="fa-solid fa-trash text-xs"></i>
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        ))}
                                        
                                        {loadingMore && (
                                            <div className="text-center py-4 flex flex-col items-center animate-fade-in">
                                                <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-1"></div>
                                                <span className="text-[10px] text-slate-500 font-bold">جاري جلب المزيد...</span>
                                            </div>
                                        )}

                                        {filteredItems.length === 0 && !loadingCategory && (
                                            <div className="text-center py-12 flex flex-col items-center">
                                                <i className="fa-solid fa-file-circle-question text-4xl text-slate-300 mb-4"></i>
                                                <h3 className="text-sm font-bold text-slate-600">القائمة فارغة</h3>
                                                <p className="text-xs text-slate-400 mt-2 max-w-xs">
                                                    اضغط "تحديث" للبحث عن الأسعار الحالية.
                                                </p>
                                            </div>
                                        )}
                                    </>
                                )}
                            </>
                        )}
                    </div>
                )}

                {/* Detail View */}
                {showDetail && selectedMaterial && (
                    <div className="max-w-2xl mx-auto animate-scale-in pb-20">
                        {/* Header Card */}
                        <div className="bg-white rounded-2xl p-5 shadow-lg border border-slate-100 mb-4 flex flex-col items-center text-center relative overflow-hidden">
                            <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${selectedCategory ? CATEGORY_CONFIG[selectedCategory].gradient : 'from-slate-700 to-slate-900'} opacity-5 rounded-bl-full pointer-events-none`}></div>
                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl text-white shadow-lg mb-3 ${selectedCategory ? `bg-gradient-to-br ${CATEGORY_CONFIG[selectedCategory].gradient}` : 'bg-slate-800'}`}>
                                <i className={`fa-solid ${selectedCategory ? CATEGORY_CONFIG[selectedCategory].icon : 'fa-cube'}`}></i>
                            </div>
                            <h2 className="text-xl font-black text-slate-800 mb-1 leading-snug">{selectedMaterial.name}</h2>
                            <div className="bg-slate-50 px-6 py-2 rounded-xl border border-slate-200 mt-2 shadow-inner">
                                <span className="text-2xl font-black text-slate-900 font-mono">{selectedMaterial.price.toLocaleString()}</span>
                                <span className="text-xs font-bold text-slate-500 ml-1">ج.م / {selectedMaterial.unit}</span>
                            </div>
                        </div>

                        {loadingDetails ? (
                            <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-slate-100">
                                <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                                <h3 className="text-sm font-bold text-slate-700 mb-1">جاري جلب المواصفات...</h3>
                                <p className="text-[10px] text-slate-400">يتم الاتصال بالاستشاري الذكي لتجهيز البيانات الفنية.</p>
                            </div>
                        ) : materialDetails ? (
                            <div className="space-y-3">
                                {/* Specs */}
                                <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                                    <h3 className="flex items-center gap-2 text-sm font-bold text-indigo-800 mb-3 border-b border-indigo-50 pb-2"><i className="fa-solid fa-circle-info text-indigo-500"></i> الوصف والمواصفات</h3>
                                    <p className="text-slate-600 text-xs font-medium leading-relaxed mb-3">{materialDetails.description}</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {ensureArray(materialDetails.specifications).map((spec, i) => (
                                            <span key={i} className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded-lg text-[10px] font-bold border border-indigo-100 leading-tight">{spec}</span>
                                        ))}
                                    </div>
                                </div>

                                {/* Usage */}
                                <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                                    <h3 className="flex items-center gap-2 text-sm font-bold text-teal-800 mb-3 border-b border-teal-50 pb-2"><i className="fa-solid fa-list-check text-teal-500"></i> طريقة التنفيذ/الاستخدام</h3>
                                    <ul className="space-y-2">
                                        {ensureArray(materialDetails.usageSteps).map((step, i) => (
                                            <li key={i} className="flex gap-2 items-start text-xs text-slate-700 font-medium">
                                                <span className="w-4 h-4 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center font-bold text-[9px] shrink-0 mt-0.5">{i+1}</span>
                                                <span className="leading-relaxed">{step}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                {/* Consumption & Tips */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div className="bg-amber-50 p-3 rounded-2xl border border-amber-100">
                                        <h3 className="flex items-center gap-2 text-xs font-bold text-amber-900 mb-2"><i className="fa-solid fa-scale-balanced text-amber-500"></i> معدل الاستهلاك</h3>
                                        <p className="text-amber-800 text-xs font-bold leading-relaxed">{materialDetails.consumptionRates || "حسب أصول الصناعة"}</p>
                                    </div>
                                    <div className="bg-blue-50 p-3 rounded-2xl border border-blue-100">
                                        <h3 className="flex items-center gap-2 text-xs font-bold text-blue-900 mb-2"><i className="fa-solid fa-lightbulb text-blue-500"></i> نصيحة فنية</h3>
                                        <ul className="space-y-1">
                                            {ensureArray(materialDetails.technicalTips).slice(0, 3).map((tip, i) => (
                                                <li key={i} className="text-[10px] text-blue-800 font-medium flex gap-1.5"><i className="fa-solid fa-check text-blue-400 mt-0.5"></i>{tip}</li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-10 text-slate-400 text-xs"><p>لا تتوفر بيانات تفصيلية لهذا العنصر.</p></div>
                        )}
                    </div>
                )}
            </div>

            {/* ADD MANUAL ITEM MODAL */}
            {showAddModal && (
                <div className="fixed inset-0 z-[2100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 animate-scale-in border border-slate-200">
                        <div className="text-center mb-4">
                            <h3 className="font-bold text-slate-800 text-lg">إضافة بند جديد يدوياً</h3>
                            {addForm.bulletinId && <p className="text-[10px] text-slate-500 mt-1">يتم الإضافة إلى النشرة المحددة</p>}
                        </div>
                        
                        <div className="space-y-3">
                            {!selectedCategory && !addForm.bulletinId && (
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1">القسم / التصنيف</label>
                                    <select 
                                        value={addForm.category || 'steel'} 
                                        onChange={(e) => setAddForm({...addForm, category: e.target.value as MarketCategory})} 
                                        className="w-full p-2.5 border border-slate-300 rounded-xl outline-none focus:border-green-500 text-sm font-bold bg-slate-50 cursor-pointer"
                                    >
                                        {Object.entries(CATEGORY_CONFIG).map(([catKey, catCfg]) => (
                                            <option key={catKey} value={catKey}>{catCfg.label}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">اسم البند/الخامة</label>
                                <input 
                                    type="text" 
                                    value={addForm.name} 
                                    onChange={(e) => setAddForm({...addForm, name: e.target.value})} 
                                    className="w-full p-2.5 border border-slate-300 rounded-xl outline-none focus:border-green-500 text-sm font-bold bg-slate-50"
                                    placeholder="مثال: أسمنت بورتلاندي..."
                                    autoFocus
                                />
                            </div>
                            
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1">السعر (ج.م)</label>
                                    <input 
                                        type="number" 
                                        value={addForm.price} 
                                        onChange={(e) => setAddForm({...addForm, price: e.target.value})} 
                                        className="w-full p-2.5 border border-slate-300 rounded-xl outline-none focus:border-green-500 text-sm font-bold bg-slate-50"
                                        placeholder="0.00"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1">الوحدة</label>
                                    <input 
                                        type="text" 
                                        value={addForm.unit} 
                                        onChange={(e) => setAddForm({...addForm, unit: e.target.value})} 
                                        className="w-full p-2.5 border border-slate-300 rounded-xl outline-none focus:border-green-500 text-sm font-bold bg-slate-50"
                                        placeholder="طن، متر، عدد..."
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-2 mt-6">
                            <button onClick={confirmAddItem} className="flex-1 bg-green-600 text-white py-2.5 rounded-xl font-bold hover:bg-green-700 transition shadow-lg text-sm">حفظ وإضافة</button>
                            <button onClick={() => setShowAddModal(false)} className="flex-1 bg-slate-100 text-slate-600 py-2.5 rounded-xl font-bold hover:bg-slate-200 transition text-sm">إلغاء</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
