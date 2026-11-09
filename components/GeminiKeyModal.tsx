import React, { useState, useEffect } from 'react';

interface GeminiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const STORAGE_KEYS_LIST = 'CUSTOM_GEMINI_API_KEYS';
const STORAGE_SINGLE_KEY = 'CUSTOM_GEMINI_API_KEY';

export const loadStoredGeminiKeys = (): string[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS_LIST);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map(k => String(k).trim()).filter(Boolean);
      }
    }
  } catch (e) {
    console.warn("Failed to parse stored gemini keys:", e);
  }

  const single = localStorage.getItem(STORAGE_SINGLE_KEY);
  if (single && single.trim()) {
    return [single.trim()];
  }

  return [];
};

export const saveStoredGeminiKeys = (keys: string[]) => {
  if (typeof window === 'undefined') return;
  const cleaned = keys.map(k => k.trim()).filter(Boolean);
  if (cleaned.length > 0) {
    localStorage.setItem(STORAGE_KEYS_LIST, JSON.stringify(cleaned));
    localStorage.setItem(STORAGE_SINGLE_KEY, cleaned[0]);
  } else {
    localStorage.removeItem(STORAGE_KEYS_LIST);
    localStorage.removeItem(STORAGE_SINGLE_KEY);
  }
};

const GeminiKeyModal: React.FC<GeminiKeyModalProps> = ({ isOpen, onClose }) => {
  const [keysList, setKeysList] = useState<string[]>([]);
  const [inputKey, setInputKey] = useState('');
  const [showKeys, setShowKeys] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  useEffect(() => {
    if (isOpen) {
      const loaded = loadStoredGeminiKeys();
      setKeysList(loaded);
      setInputKey('');
      setMessage(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAddKeys = () => {
    const raw = inputKey.trim();
    if (!raw) {
      setMessage({ text: 'يرجى إدخال أو لصق مفتاح Gemini واحد على الأقل', type: 'error' });
      return;
    }

    // Support single key or multiple keys pasted line by line or comma-separated
    const separated = raw
      .split(/[\n,;]+/)
      .map(k => k.trim())
      .filter(k => k.length > 5);

    if (separated.length === 0) {
      setMessage({ text: 'المفتاح المدخل غير صالح، يرجى التأكد من نسخه بشكل صحيح', type: 'error' });
      return;
    }

    // Merge without duplicates
    const updated = [...keysList];
    let addedCount = 0;

    for (const k of separated) {
      if (!updated.includes(k)) {
        updated.push(k);
        addedCount++;
      }
    }

    if (addedCount === 0) {
      setMessage({ text: 'المفتاح (أو المفاتيح) مضافة بالفعل مسبقاً!', type: 'info' });
      return;
    }

    saveStoredGeminiKeys(updated);
    setKeysList(updated);
    setInputKey('');
    setMessage({ 
      text: addedCount === 1 
        ? 'تمت إضافة المفتاح بنجاح! سيتم استخدامه في الاستجابات والتحليلات.' 
        : `تمت إضافة ${addedCount} مفاتيح بنجاح! سيتم التدوير التلقائي بينها.`, 
      type: 'success' 
    });
  };

  const handleRemoveKey = (indexToRemove: number) => {
    const updated = keysList.filter((_, idx) => idx !== indexToRemove);
    saveStoredGeminiKeys(updated);
    setKeysList(updated);
    setMessage({ text: 'تم حذف المفتاح من القائمة.', type: 'info' });
  };

  const handleClearAll = () => {
    if (window.confirm('هل تريد بالتأكيد إزالة جميع مفاتيح Gemini الخاصة بك؟')) {
      saveStoredGeminiKeys([]);
      setKeysList([]);
      setMessage({ text: 'تمت إزالة جميع المفاتيح. سيرجع التطبيق لمفاتيح الخادم الافتراضية.', type: 'info' });
    }
  };

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key).then(() => {
      setMessage({ text: 'تم نسخ المفتاح للحافظة.', type: 'success' });
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 z-[1000] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in rtl">
      <div className="bg-white rounded-3xl shadow-2xl p-5 sm:p-6 w-full max-w-lg animate-scale-in border border-slate-100 relative max-h-[92vh] flex flex-col">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 left-4 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition"
          title="إغلاق"
        >
          <i className="fa-solid fa-xmark text-sm"></i>
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-4 shrink-0">
          <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-md">
            <i className="fa-solid fa-key text-xl"></i>
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              مفاتيح Gemini الذكية
              {keysList.length > 0 && (
                <span className="bg-purple-100 text-purple-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-purple-200">
                  {keysList.length} {keysList.length === 1 ? 'مفتاح' : 'مفاتيح'}
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-500">حفظ وتدوير مفاتيحك الخاصة لضمان عمل الذكاء الاصطناعي بلا انقطاع</p>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1 pl-1 hide-scrollbar">
          {/* Explanation Banner */}
          <div className="bg-gradient-to-l from-indigo-50 to-blue-50 border border-indigo-100 rounded-2xl p-3 text-indigo-950 text-xs leading-relaxed">
            <div className="flex items-start gap-2">
              <i className="fa-solid fa-shield-halved text-indigo-600 text-sm mt-0.5"></i>
              <div>
                <strong className="block font-bold mb-0.5">ميزة التدوير التلقائي الذكي (Multi-Key Rotation):</strong>
                يمكنك إضافة عدة مفاتيح مجانية من Google AI Studio؛ إذا استنفد أي مفتاح حصته (Rate Limit 429)، يقوم التطبيق تلقائياً بالتحويل للمفتاح التالي دون أي توقف أو رسائل خطأ.
              </div>
            </div>
          </div>

          {/* List of Active Keys */}
          {keysList.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <i className="fa-solid fa-list-check text-purple-600"></i>
                  المفاتيح النشطة في النظام:
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowKeys(!showKeys)}
                    className="text-[11px] text-slate-500 hover:text-slate-800 font-semibold flex items-center gap-1"
                  >
                    <i className={`fa-solid ${showKeys ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                    {showKeys ? 'إخفاء' : 'إظهار'}
                  </button>
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="text-[11px] text-red-500 hover:text-red-700 font-semibold"
                  >
                    حذف الكل
                  </button>
                </div>
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto border border-slate-100 rounded-2xl p-2 bg-slate-50">
                {keysList.map((key, idx) => (
                  <div
                    key={idx}
                    className="bg-white border border-slate-200 rounded-xl p-2.5 flex items-center justify-between gap-2 shadow-sm hover:border-purple-300 transition"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-mono font-bold shrink-0 ${
                        idx === 0 ? 'bg-purple-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          {idx === 0 && (
                            <span className="text-[9px] bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.2 rounded font-bold">
                              الأساسي
                            </span>
                          )}
                          <span className="font-mono text-xs text-slate-700 truncate block">
                            {showKeys
                              ? key
                              : `${key.substring(0, 8)}...${key.substring(key.length - 4)}`}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleCopyKey(key)}
                        className="w-7 h-7 rounded-lg text-slate-400 hover:text-purple-600 hover:bg-purple-50 flex items-center justify-center transition"
                        title="نسخ المفتاح"
                      >
                        <i className="fa-regular fa-copy text-xs"></i>
                      </button>
                      <button
                        onClick={() => handleRemoveKey(idx)}
                        className="w-7 h-7 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition"
                        title="حذف هذا المفتاح"
                      >
                        <i className="fa-solid fa-trash-can text-xs"></i>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-4 bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
              <i className="fa-solid fa-key text-slate-300 text-2xl mb-1"></i>
              <p className="text-xs text-slate-500 font-semibold">لم تتم إضافة أي مفتاح خاص بعد</p>
              <p className="text-[11px] text-slate-400">التطبيق يستخدم حالياً الخادم الاحتياطي المجاني</p>
            </div>
          )}

          {/* Add New Key Input */}
          <div className="space-y-2 pt-2">
            <label className="block text-xs font-bold text-slate-700">
              إضافة مفتاح جديد (أو لصق عدة مفاتيح معاً):
            </label>
            <div className="relative">
              <textarea
                value={inputKey}
                onChange={(e) => setInputKey(e.target.value)}
                placeholder="الصق مفتاح أو أكثر هنا (AIzaSy...)... يمكنك لصق مفتاح في كل سطر"
                rows={2}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none font-mono resize-none"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleAddKeys}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-md transition flex items-center gap-1.5"
              >
                <i className="fa-solid fa-plus text-xs"></i>
                إضافة للقائمة
              </button>
            </div>
          </div>

          {/* Status Message */}
          {message && (
            <div
              className={`p-3 rounded-xl text-xs ${
                message.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : message.type === 'error'
                  ? 'bg-red-50 text-red-800 border border-red-200'
                  : 'bg-blue-50 text-blue-800 border border-blue-200'
              }`}
            >
              {message.text}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 justify-between items-center border-t border-slate-100 pt-4 mt-3 shrink-0">
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="text-purple-600 hover:text-purple-800 text-xs font-bold flex items-center gap-1"
          >
            <i className="fa-solid fa-arrow-up-right-from-square text-[10px]"></i>
            إنشاء مفاتيح مجانية من AI Studio
          </a>

          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 transition shadow-sm"
          >
            تم وحفظ
          </button>
        </div>
      </div>
    </div>
  );
};

export default GeminiKeyModal;
