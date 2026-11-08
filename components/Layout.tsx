
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
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingSyncs, setPendingSyncs] = useState(0);
  const [showSyncTroubleshoot, setShowSyncTroubleshoot] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(!!document.fullscreenElement);
  const [showConfirmClear, setShowConfirmClear] = useState(false); // State for confirm modal
  
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
      const handleStatus = () => setIsOnline(navigator.onLine);
      window.addEventListener('online', handleStatus);
      window.addEventListener('offline', handleStatus);
      
      // Check Pending Syncs
      const checkQueue = async () => {
          const count = await api.sync.getPendingCount();
          setPendingSyncs(count);
      };
      
      const interval = setInterval(checkQueue, 2000); // Poll every 2s
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

  return (
    // MAIN ARCHITECTURE CHANGE: Fixed height container (100dvh) with Flex Column.
    // The main content area scrolls internally (overflow-y-auto).
    // This prevents the "Body" from scrolling, stopping all layout jumps.
    <div className="h-[100dvh] w-full bg-slate-100 flex flex-col overflow-hidden relative">
      
      {/* Navbar - Fixed Height Flex Item */}
      <nav className="h-[60px] bg-gradient-to-r from-slate-900 to-slate-800 text-white shadow-md z-50 shrink-0 safe-top no-print">
        <div className="container mx-auto px-2 h-full flex justify-between items-center">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
            <div className="bg-yellow-500 p-1.5 rounded-lg text-slate-900 shadow-lg hover:scale-105 transition-transform">
              <i className="fa-solid fa-helmet-safety text-lg"></i>
            </div>
            <div>
              <h1 className="text-sm font-bold leading-tight">مدير المشروعات</h1>
              <p className="text-[9px] text-slate-400 font-normal">Construction Manager Pro</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 md:gap-3">
            {/* PWA Install Button (Only shows if installable) */}
            {showInstallBtn && (
                <button 
                    onClick={handleInstallClick}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold shadow-lg transition flex items-center gap-2 animate-pulse"
                >
                    <i className="fa-solid fa-download"></i> تثبيت التطبيق
                </button>
            )}

            {/* Sync & Connection Status - ONLY SHOW IF OFFLINE OR ERRORS */}
            {(!isOnline || pendingSyncs > 0) && (
                <div 
                    className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] transition-all duration-300 cursor-pointer ${!isOnline ? 'bg-red-500/20 text-red-200 border border-red-500/30' : 'bg-yellow-500/20 text-yellow-200 border border-yellow-500/30 hover:bg-yellow-500/30'}`}
                    onClick={handleSyncIndicatorClick}
                >
                    {!isOnline ? (
                        <>
                            <i className="fa-solid fa-wifi-slash text-red-400"></i>
                            <span className="font-bold">غير متصل (Offline)</span>
                            {pendingSyncs > 0 && <span className="bg-red-500 text-white px-1.5 rounded-full text-[9px]">{pendingSyncs}</span>}
                        </>
                    ) : (
                        <>
                        <i className="fa-solid fa-rotate text-yellow-400"></i>
                        <span className="font-mono">مزامنة معلقة ({pendingSyncs})</span>
                        </>
                    )}
                    <div className={`w-1.5 h-1.5 rounded-full ${!isOnline ? 'bg-red-500' : 'bg-yellow-400 animate-ping'}`}></div>
                </div>
            )}

            {/* Full Screen Toggle */}
            <button 
                onClick={toggleFullScreen} 
                className={`w-9 h-9 rounded-xl flex items-center justify-center transition shadow-sm border ${isFullScreen ? 'bg-blue-600 text-white border-blue-500' : 'bg-white/10 text-white hover:bg-white/20 border-white/5'}`}
                title={isFullScreen ? "إنهاء ملء الشاشة" : "وضع ملء الشاشة"}
            >
                <i className={`fa-solid ${isFullScreen ? 'fa-compress' : 'fa-expand'} text-xs`}></i>
            </button>

            {/* Top Bar Actions (Like Add Project) */}
            {navActions}
            
            {/* Mobile Connection Dot - Only Red or Yellow */}
            {(!isOnline || pendingSyncs > 0) && (
                <div 
                    className={`w-3 h-3 rounded-full shadow-[0_0_8px] border-2 border-slate-800 transition-colors duration-500 cursor-pointer ${!isOnline ? 'bg-red-500 shadow-red-500' : 'bg-yellow-400 shadow-yellow-400 animate-pulse'}`} 
                    title="تنبيه اتصال"
                    onClick={handleSyncIndicatorClick}
                ></div>
            )}
          </div>
        </div>
      </nav>

      {/* Secondary Header/Breadcrumb - Flex Item */}
      {hasSecondaryHeader && (
        <header className="bg-white shadow-sm border-b border-slate-200 z-40 shrink-0 no-print">
          <div className="container mx-auto px-2 py-2">
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
      <main className="flex-1 overflow-y-auto overflow-x-hidden container mx-auto px-2 py-4 animate-fade-in custom-scrollbar">
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
