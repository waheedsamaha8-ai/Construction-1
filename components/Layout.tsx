
// @ts-nocheck
import React, { ReactNode, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useMobileBack } from '../hooks/useMobileBack';
import { GOOGLE_DRIVE_TARGET_ID, api } from '../services/api';
import ConfirmModal from './ConfirmModal'; // Import the new modal

interface LayoutProps {
  children: ReactNode;
  title?: ReactNode; // Changed from string to ReactNode to allow Breadcrumbs
  actions?: ReactNode; // Secondary header actions
  navActions?: ReactNode; // Top Navbar actions (New)
  showBack?: boolean;
  onBack?: () => void; // New prop for custom back navigation
}

const Layout: React.FC<LayoutProps> = ({ children, title, actions, navActions, showBack = false, onBack }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const isHomePage = location.pathname === '/' || location.pathname === '';
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingSyncs, setPendingSyncs] = useState(0);
  const [showSyncTroubleshoot, setShowSyncTroubleshoot] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(!!document.fullscreenElement);
  const [showConfirmClear, setShowConfirmClear] = useState(false); // State for confirm modal
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showAiRotationModal, setShowAiRotationModal] = useState(false);
  const [aiRotationStatus, setAiRotationStatus] = useState<{
    smartRotationEnabled: boolean;
    totalConfiguredKeys: number;
    healthyKeysCount: number;
    cooldownKeysCount: number;
    deadKeysCount: number;
  } | null>(null);
  const [loadingAiStatus, setLoadingAiStatus] = useState(false);
  
  // PWA Install State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBtn, setShowInstallBtn] = useState(false);

  // Handle Mobile Back Button
  useMobileBack(() => {
    if (onBack) {
      onBack();
    } else if (showBack) {
      navigate(-1);
    }
  }, showBack || !!onBack);

  // Determine if we need extra padding for the secondary header
  const hasSecondaryHeader = !!(title || actions);

  useEffect(() => {
      const handleStatus = () => {
          setIsOnline(navigator.onLine);
          if (navigator.onLine) {
              api.sync.processQueue().catch(() => {});
          }
      };
      window.addEventListener('online', handleStatus);
      window.addEventListener('offline', handleStatus);
      
      // Check Pending Syncs and trigger instant processing
      const checkQueue = async () => {
          if (navigator.onLine) {
              await api.sync.processQueue();
          }
          const count = await api.sync.getPendingCount();
          setPendingSyncs(count);
      };

      const handleAppSyncEvent = (e: Event) => {
          const detail = (e as CustomEvent).detail;
          if (detail?.type === 'SYNC_QUEUE_UPDATED') {
              api.sync.getPendingCount().then(setPendingSyncs).catch(() => {});
              if (navigator.onLine) {
                  api.sync.processQueue().catch(() => {});
              }
          }
      };
      window.addEventListener('app_sync_event', handleAppSyncEvent);
      
      const interval = setInterval(checkQueue, 6000); // Fallback safety check
      checkQueue();

      // Check Fullscreen state strictly
      const checkFullScreen = () => {
          setIsFullScreen(!!document.fullscreenElement);
      };
      
      document.addEventListener('fullscreenchange', checkFullScreen);
      document.addEventListener('webkitfullscreenchange', checkFullScreen);
      
      // Initial Check
      checkFullScreen();

      // PWA Install Prompt Listener
      const handleBeforeInstallPrompt = (e: any) => {
          e.preventDefault();
          setDeferredPrompt(e);
          setShowInstallBtn(true);
      };
      window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

      return () => {
          window.removeEventListener('online', handleStatus);
          window.removeEventListener('offline', handleStatus);
          window.removeEventListener('app_sync_event', handleAppSyncEvent);
          document.removeEventListener('fullscreenchange', checkFullScreen);
          document.removeEventListener('webkitfullscreenchange', checkFullScreen);
          window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
          clearInterval(interval);
      };
  }, []);

  const toggleFullScreen = () => {
      if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().then(() => {
              setIsFullScreen(true);
          }).catch(err => {
              console.error(`Error attempting to enable full-screen mode: ${err.message}`);
          });
      } else {
          if (document.exitFullscreen) {
              document.exitFullscreen().then(() => {
                  setIsFullScreen(false);
              });
          }
      }
  };

  const handleInstallClick = async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
          setShowInstallBtn(false);
      }
      setDeferredPrompt(null);
  };

  const handleBackClick = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  };

  const handleSyncIndicatorClick = () => {
      if (pendingSyncs > 0) {
          setShowSyncTroubleshoot(true);
      }
  };

  const confirmClearQueue = async () => {
      await api.sync.clearQueue();
      setShowConfirmClear(false);
      setShowSyncTroubleshoot(false);
  };

  const openAiRotationStatusModal = async () => {
      setShowSettingsMenu(false);
      setShowAiRotationModal(true);
      setLoadingAiStatus(true);
      try {
          const res = await fetch('/api/gemini/rotation-status');
          if (res.ok) {
              const data = await res.json();
              setAiRotationStatus(data);
          }
      } catch (e) {
          console.warn('Could not fetch AI rotation status:', e);
      } finally {
          setLoadingAiStatus(false);
      }
  };

  return (
    // MAIN ARCHITECTURE CHANGE: Fixed height container (100dvh) with Flex Column.
    // The main content area scrolls internally (overflow-y-auto).
    // This prevents the "Body" from scrolling, stopping all layout jumps.
    <div className="h-[100dvh] w-full bg-slate-100 flex flex-col overflow-hidden relative">
      
      {/* Navbar - Shown only on Home Page so Folders open in a full window */}
      {isHomePage && (
        <nav className="h-[60px] bg-gradient-to-r from-slate-900 to-slate-800 text-white shadow-md z-50 shrink-0 safe-top no-print">
          <div className="w-full px-3 h-full flex justify-between items-center">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
              <div className="bg-yellow-500 p-1.5 rounded-lg text-slate-900 shadow-lg hover:scale-105 transition-transform">
                <i className="fa-solid fa-helmet-safety text-lg"></i>
              </div>
              <div>
                <h1 className="text-sm font-bold leading-tight">مدير المشروعات</h1>
                <p className="text-[9px] text-slate-400 font-normal">Construction Manager Pro</p>
              </div>
            </div>
            
            {/* Settings Icon-Only Button */}
            <div className="relative flex items-center">
              <button
                onClick={() => setShowSettingsMenu(prev => !prev)}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition shadow-sm border relative ${showSettingsMenu ? 'bg-blue-600 text-white border-blue-500' : 'bg-white/10 text-white hover:bg-white/20 border-white/10'}`}
                title="الإعدادات"
              >
                <i className="fa-solid fa-gear text-sm"></i>
                {(!isOnline || pendingSyncs > 0) ? (
                  <span className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border border-slate-900 ${!isOnline ? 'bg-red-500' : 'bg-yellow-400 animate-pulse'}`}></span>
                ) : null}
              </button>

              {showSettingsMenu && (
                <>
                  <div
                    className="fixed inset-0 z-[90]"
                    onClick={() => setShowSettingsMenu(false)}
                  ></div>
                  <div className="absolute left-0 top-12 w-64 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-2 z-[100] space-y-1.5 text-white animate-scale-in">
                    <div className="px-3 py-1.5 border-b border-slate-800 flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-400">إعدادات النظام والأدوات</span>
                      <i className="fa-solid fa-sliders text-[10px] text-slate-500"></i>
                    </div>

                    {/* Full Screen Toggle */}
                    <button
                      onClick={() => {
                        toggleFullScreen();
                        setShowSettingsMenu(false);
                      }}
                      className="w-full px-3 py-2.5 rounded-xl flex items-center justify-between hover:bg-white/10 transition text-xs font-bold"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isFullScreen ? 'bg-blue-600 text-white' : 'bg-slate-800 text-blue-400'}`}>
                          <i className={`fa-solid ${isFullScreen ? 'fa-compress' : 'fa-expand'} text-xs`}></i>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-bold text-white">{isFullScreen ? 'إنهاء ملء الشاشة' : 'وضع ملء الشاشة'}</div>
                          <div className="text-[10px] text-slate-400">عرض التطبيق بكامل الشاشة</div>
                        </div>
                      </div>
                    </button>

                    {/* AI Smart Rotation Server Status (Read-Only, Zero Client Secrets) */}
                    <button
                      onClick={openAiRotationStatusModal}
                      className="w-full px-3 py-2.5 rounded-xl flex items-center justify-between hover:bg-white/10 transition text-xs font-bold"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-indigo-600/80 text-amber-300 flex items-center justify-center">
                          <i className="fa-solid fa-arrows-spin text-xs"></i>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-bold text-white">التدوير الذكي للذكاء الاصطناعي</div>
                          <div className="text-[10px] text-slate-400">حالة الخادم وتوزيع المفاتيح الآمن</div>
                        </div>
                      </div>
                    </button>

                    {/* PWA Install Button */}
                    {showInstallBtn && (
                      <button
                        onClick={() => {
                          setShowSettingsMenu(false);
                          handleInstallClick();
                        }}
                        className="w-full px-3 py-2.5 rounded-xl flex items-center justify-between bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 transition text-xs font-bold text-emerald-300"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
                            <i className="fa-solid fa-download text-xs"></i>
                          </div>
                          <div className="text-right">
                            <div className="text-xs font-bold text-white">تثبيت التطبيق</div>
                            <div className="text-[10px] text-emerald-300">تثبيت على الشاشة الرئيسية</div>
                          </div>
                        </div>
                      </button>
                    )}

                    {/* Sync & Connection Status */}
                    {(!isOnline || pendingSyncs > 0) && (
                      <button
                        onClick={() => {
                          setShowSettingsMenu(false);
                          handleSyncIndicatorClick();
                        }}
                        className={`w-full px-3 py-2.5 rounded-xl flex items-center justify-between transition text-xs font-bold ${!isOnline ? 'bg-red-500/20 text-red-200 border border-red-500/30' : 'bg-yellow-500/20 text-yellow-200 border border-yellow-500/30'}`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${!isOnline ? 'bg-red-600 text-white' : 'bg-yellow-600 text-white'}`}>
                            <i className={`fa-solid ${!isOnline ? 'fa-wifi-slash' : 'fa-rotate'} text-xs`}></i>
                          </div>
                          <div className="text-right">
                            <div className="text-xs font-bold">{!isOnline ? 'غير متصل (Offline)' : `مزامنة معلقة (${pendingSyncs})`}</div>
                            <div className="text-[10px] opacity-80">اضغط لإدارة طابور المزامنة</div>
                          </div>
                        </div>
                      </button>
                    )}

                    {/* Extra Navbar Actions (Add Project, Export, Import, Sign Out) */}
                    {navActions && (
                      <div
                        className="pt-1.5 border-t border-slate-800 space-y-1.5"
                        onClick={() => setShowSettingsMenu(false)}
                      >
                        <div className="px-3 py-1 flex items-center justify-between">
                          <span className="text-[11px] font-bold text-slate-400">إدارة المشروعات والحساب</span>
                          <i className="fa-solid fa-folder-gear text-[10px] text-slate-500"></i>
                        </div>
                        {navActions}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </nav>
      )}

      {/* Secondary Header/Breadcrumb - Flex Item */}
      {hasSecondaryHeader && (
        <header className="bg-white shadow-sm border-b border-slate-200 z-40 shrink-0 safe-top no-print">
          <div className="w-full px-3 py-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 overflow-hidden flex-1">
                 {/* Only show default back button if specifically requested and NO title component handling it */}
                 {showBack && typeof title === 'string' && (
                   <button 
                    onClick={handleBackClick} 
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 hover:bg-slate-200 text-black transition shadow-sm border border-slate-100 shrink-0"
                    title="رجوع"
                   >
                     <i className="fa-solid fa-arrow-right rtl:rotate-180 text-xs"></i>
                   </button>
                 )}
                 <div className="flex-1 overflow-hidden">
                   {typeof title === 'string' ? (
                       <h2 className="text-sm font-bold text-slate-800 truncate">{title}</h2>
                   ) : (
                       title
                   )}
                 </div>
              </div>
              <div className="flex gap-2 shrink-0 items-center">
                {actions}
              </div>
            </div>
          </div>
        </header>
      )}

      {/* Main Content - SCROLLABLE AREA */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden w-full px-2 sm:px-4 py-4 custom-scrollbar">
        {children}
        {/* Safe bottom spacing for mobile gestures */}
        <div className="h-10 w-full shrink-0"></div> 
      </main>

      {/* Sync Troubleshoot Modal */}
      {showSyncTroubleshoot && (
          <div className="fixed inset-0 bg-slate-900/60 z-[1000] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
              <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-sm animate-scale-in border border-slate-200 text-center">
                  <div className="w-16 h-16 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-yellow-200 shadow-sm">
                      <i className="fa-solid fa-triangle-exclamation text-3xl"></i>
                  </div>
                  <h3 className="text-lg font-bold text-slate-800 mb-2">مشكلة في المزامنة</h3>
                  <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                      هناك {pendingSyncs} عمليات معلقة لم يتم إرسالها للسحابة بسبب أخطاء (غالباً حجم الصور كبير جداً).
                      <br/>
                      هل تريد تنظيف الطابور وإعادة ضبط المزامنة؟
                  </p>
                  
                  <div className="flex gap-3">
                      <button onClick={() => setShowConfirmClear(true)} className="flex-1 bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 transition shadow-lg text-xs">
                          نعم، حذف العمليات العالقة
                      </button>
                      <button onClick={() => setShowSyncTroubleshoot(false)} className="flex-1 bg-slate-100 text-slate-700 py-3 rounded-xl font-bold hover:bg-slate-200 transition text-xs">
                          إلغاء
                      </button>
                  </div>
                  <p className="text-[9px] text-slate-400 mt-3 font-bold">
                      ملاحظة: البيانات المحفوظة محلياً لن تتأثر، ولكن التعديلات الأخيرة التي لم ترفع للسحابة قد لا تظهر للمستخدمين الآخرين.
                  </p>
              </div>
          </div>
      )}

      {/* AI Smart Rotation Status Modal (No API Keys Exposed/Entered in UI) */}
      {showAiRotationModal && (
          <div className="fixed inset-0 bg-slate-900/65 z-[1000] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in" onClick={() => setShowAiRotationModal(false)}>
              <div className="bg-white rounded-3xl shadow-2xl p-5 w-full max-w-md animate-scale-in border border-slate-200" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                      <div className="flex items-center gap-2.5">
                          <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center border border-indigo-200">
                              <i className="fa-solid fa-shield-halved text-lg"></i>
                          </div>
                          <div>
                              <h3 className="text-sm font-black text-slate-900">التدوير الذكي للذكاء الاصطناعي</h3>
                              <p className="text-[10px] font-bold text-slate-500">مراقبة وتوزيع الطلبات على مستوى الخادم الآمن</p>
                          </div>
                      </div>
                      <button
                          onClick={() => setShowAiRotationModal(false)}
                          className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition"
                      >
                          <i className="fa-solid fa-times text-xs"></i>
                      </button>
                  </div>

                  {loadingAiStatus ? (
                      <div className="py-8 flex flex-col items-center justify-center text-slate-500 gap-2">
                          <i className="fa-solid fa-circle-notch fa-spin text-2xl text-indigo-600"></i>
                          <span className="text-xs font-bold">جاري فحص حالة الخادم...</span>
                      </div>
                  ) : (
                      <div className="space-y-3">
                          <div className="grid grid-cols-3 gap-2 text-center">
                              <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-3">
                                  <span className="text-[10px] font-bold text-indigo-700 block">إجمالي المنافذ</span>
                                  <span className="font-mono font-black text-xl text-indigo-900">{aiRotationStatus?.totalConfiguredKeys ?? '-'}</span>
                              </div>
                              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3">
                                  <span className="text-[10px] font-bold text-emerald-700 block">نشط وجاهز</span>
                                  <span className="font-mono font-black text-xl text-emerald-800">{aiRotationStatus?.healthyKeysCount ?? '-'}</span>
                              </div>
                              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3">
                                  <span className="text-[10px] font-bold text-amber-700 block">تهدئة مؤقتة</span>
                                  <span className="font-mono font-black text-xl text-amber-800">{aiRotationStatus?.cooldownKeysCount ?? 0}</span>
                              </div>
                          </div>

                          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 text-xs text-slate-700 leading-relaxed space-y-1.5">
                              <div className="font-black text-slate-900 flex items-center gap-1.5">
                                  <i className="fa-solid fa-circle-check text-emerald-600"></i>
                                  <span>التدوير التلقائي (Round-Robin + Cooldown) مفعّل بالخادم</span>
                              </div>
                              <p className="text-[11px] font-semibold text-slate-600">
                                  لحماية مفاتيحك من التسريب، لا تُخزَّن أو تُدخل مفاتيح API داخل المتصفح. يمكنك إضافة أكثر من مفتاح بشكل آمن في إعدادات بيئة الخادم ضمن المتغير <span dir="ltr" className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200 text-indigo-700">GEMINI_API_KEY</span> (مفصولة بفاصلة <span className="font-mono">,</span>)، وسيقوم الخادم تلقائياً بتوزيع الأحمال وتبديل أي مفتاح يصل للحد الأقصى فوراً.
                              </p>
                          </div>

                          <div className="flex gap-2">
                              <button
                                  type="button"
                                  onClick={openAiRotationStatusModal}
                                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5"
                              >
                                  <i className="fa-solid fa-rotate text-[11px]"></i>
                                  <span>تحديث الحالة</span>
                              </button>
                              <button
                                  type="button"
                                  onClick={() => setShowAiRotationModal(false)}
                                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2.5 rounded-xl font-bold text-xs transition"
                              >
                                  إغلاق
                              </button>
                          </div>
                      </div>
                  )}
              </div>
          </div>
      )}

      {/* Confirm Clear Queue Modal */}
      <ConfirmModal
        isOpen={showConfirmClear}
        title="تأكيد التنظيف"
        message="هل أنت متأكد تماماً؟ سيتم إلغاء التغييرات المعلقة التي لم يتم حفظها على السحابة، ولكن سيستعيد التطبيق استقراره."
        onConfirm={confirmClearQueue}
        onCancel={() => setShowConfirmClear(false)}
        type="warning"
        confirmText="نعم، نظف القائمة"
      />
    </div>
  );
};

export default Layout;
