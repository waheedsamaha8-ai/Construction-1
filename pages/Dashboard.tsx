
// @ts-nocheck
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import ProjectCard from '../components/ProjectCard';
import FileItemRow from '../components/FileItemRow';
import FileViewer from '../components/FileViewer';
import ProjectMap from '../components/ProjectMap'; 
import ConfirmModal from '../components/ConfirmModal'; 
import MarketPricesModal from '../components/MarketPricesModal';
import ProfessionalPricingModal from '../components/ProfessionalPricingModal';
import InstantExpert from '../components/InstantExpert'; // IMPORT NEW COMPONENT
import InteractiveReportViewer from '../components/InteractiveReportViewer';
import { api } from '../services/api';
import { aiHelper } from '../services/aiHelper';
import { printService } from '../services/printService';
import { Project, ProjectStatus, FileItem, ProjectLog } from '../types';
import { ENGINEERING_TIPS_DB, getCategoryLabel, getArchiveSectionForCategory } from '../services/tipsData';

const SAVED_TIPS_STORAGE_KEY = 'construction_pro_saved_tips_v1';
const getSavedTipsMap = (): Record<string, string> => {
    try {
        const raw = localStorage.getItem(SAVED_TIPS_STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
};
const saveTipToLocalMap = (tipText: string, html: string) => {
    try {
        const map = getSavedTipsMap();
        map[tipText] = html;
        localStorage.setItem(SAVED_TIPS_STORAGE_KEY, JSON.stringify(map));
    } catch {}
};

const SkeletonCard = () => (
    <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 h-[80px] animate-pulse flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-slate-200"></div>
        <div className="flex-1 space-y-2">
            <div className="h-4 w-1/2 bg-slate-200 rounded"></div>
        </div>
    </div>
);

const getRandomUniqueTip = (availableTips: Record<string, string[]>) => {
    const keys = Object.keys(availableTips);
    if (keys.length === 0) return { tip: "مرحباً بك في مدير المشروعات", category: "عام", key: "general" };

    const randomKey = keys[Math.floor(Math.random() * keys.length)];
    const tipsList = availableTips[randomKey];
    const randomTip = tipsList[Math.floor(Math.random() * tipsList.length)];
    
    return { tip: randomTip, category: getCategoryLabel(randomKey), key: randomKey };
};

const Dashboard: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(() => api.isAuthenticated());
  const [projects, setProjects] = useState<Project[]>(() => api.getSyncProjects());
  const [currentTip, setCurrentTip] = useState(() => getRandomUniqueTip(ENGINEERING_TIPS_DB));
  
  const [loading, setLoading] = useState(() => {
      const hasData = api.getSyncProjects().length > 0;
      return !hasData;
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();
  const [foundFiles, setFoundFiles] = useState<FileItem[]>([]);
  const [isSearchingFiles, setIsSearchingFiles] = useState(false);
  const [previewItem, setPreviewItem] = useState<FileItem | null>(null);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  
  // Delete States
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);

  const [tipOfTheDay, setTipOfTheDay] = useState(currentTip.tip);
  const [tipCategory, setTipCategory] = useState(currentTip.category);
  const [tipKey, setTipKey] = useState(currentTip.key);

  const [isExplainModalOpen, setIsExplainModalOpen] = useState(false);
  const [explainContent, setExplainContent] = useState<string>('');
  const [isExplaining, setIsExplaining] = useState(false);
  const [isDirectEditingTip, setIsDirectEditingTip] = useState(false);
  const [isTipReportMenuOpen, setIsTipReportMenuOpen] = useState(false);
  
  const [isGeneratingFreshTip, setIsGeneratingFreshTip] = useState(false);
  const [isOpeningArchive, setIsOpeningArchive] = useState(false);
  const [isSavingToArchive, setIsSavingToArchive] = useState(false);
  
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');
  
  // --- NEW TOOLS STATE ---
  const [showMarket, setShowMarket] = useState(false);
  const [showProfessionalPricing, setShowProfessionalPricing] = useState(false);
  const [showInstantExpert, setShowInstantExpert] = useState(false); // NEW STATE

  const isIframe = typeof window !== 'undefined' ? window.self !== window.top : false;

  const initialProjectState = {
    name: '',
    location: '',
    contractor: '',
    value: '',
    status: ProjectStatus.ONGOING,
    handoverDate: '',
    completionDate: '',
    durationDays: '',   
  };
  const [projectForm, setProjectForm] = useState(initialProjectState);

  const handleLogin = () => { 
      try {
          api.signIn(); 
      } catch (e) {
          api.signInGuest();
      }
  };

  const fetchData = async () => {
    try {
        const localData = await api.getLocalProjects();
        setProjects(localData);
        setLoading(false); 
    } catch(e) { 
        setLoading(false); 
    }

    try {
      const projectsData = await api.getProjects();
      if (projectsData && projectsData.length > 0) {
          setProjects(projectsData);
      }
    } catch (error) { 
        console.error("Fetch Error:", error); 
    } finally { 
        setLoading(false); 
    }
  };

  useEffect(() => {
      let unsubProjects: (() => void) | null = null;

      const checkAuth = async () => {
          if (typeof google !== 'undefined') { api.initAuth(); }
          
          const interval = setInterval(() => {
              if (typeof google !== 'undefined') {
                  api.initAuth();
                  clearInterval(interval);
              }
          }, 500);

          const isAuth = api.isAuthenticated();
          setIsAuthenticated(isAuth);
          
          if (isAuth) { 
              // 1. Subscribe to instant real-time synchronization across all tabs and devices
              unsubProjects = api.subscribeToProjectsList((updatedProjects) => {
                  if (updatedProjects && updatedProjects.length > 0) {
                      setProjects(updatedProjects);
                      setLoading(false);
                  }
              });
              // 2. Fetch fresh data in parallel
              fetchData(); 
          } else { 
              setLoading(false); 
          }
      };

      checkAuth();

      // Guaranteed safety timeout to remove skeleton cards after 600ms max
      const safetyTimer = setTimeout(() => {
          setLoading(false);
      }, 600);

      return () => {
          clearTimeout(safetyTimer);
          if (unsubProjects) unsubProjects();
      };
  }, []);

  useEffect(() => {
      if (!isAuthenticated) return;
      const doSearch = async () => {
          if (!searchQuery.trim()) { setFoundFiles([]); return; }
          setIsSearchingFiles(true);
          try { const files = await api.searchFiles(searchQuery); setFoundFiles(files); } catch (e) { console.error(e); } finally { setIsSearchingFiles(false); }
      };
      const debounce = setTimeout(doSearch, 300);
      return () => clearTimeout(debounce);
  }, [searchQuery, isAuthenticated]);

  const openCreateModal = () => { setModalMode('create'); setProjectForm(initialProjectState); setIsModalOpen(true); };
  
  const openEditModal = (e: React.MouseEvent, project: Project) => { 
      e.stopPropagation(); 
      setModalMode('edit'); 
      setEditingProjectId(project.id); 
      let durationDays = '';
      if (project.handoverDate && project.completionDate) {
          const start = new Date(project.handoverDate);
          const end = new Date(project.completionDate);
          const diffTime = Math.abs(end.getTime() - start.getTime());
          const totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
          durationDays = totalDays.toString();
      }
      setProjectForm({ 
          name: project.name, 
          location: project.location, 
          contractor: project.contractor, 
          value: project.value, 
          status: project.status, 
          handoverDate: project.handoverDate || '', 
          completionDate: project.completionDate || '',
          durationDays: durationDays
      }); 
      setIsModalOpen(true); 
  };

  const safeEval = (str: string): number => {
      try {
          if (!str) return 0;
          if (/[^0-9+\-*/.() ]/.test(str)) return parseFloat(str) || 0;
          // eslint-disable-next-line no-new-func
          const result = new Function('return ' + str)();
          return Math.round(Number(result));
      } catch {
          return 0;
      }
  };

  const calculateDate = (startStr: string, daysStr: string) => {
      if (!startStr) return '';
      const start = new Date(startStr);
      const days = safeEval(daysStr);
      if (isNaN(days)) return '';
      start.setDate(start.getDate() + days);
      return start.toISOString().split('T')[0];
  };

  const handleHandoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newHandoverDate = e.target.value;
      setProjectForm(prev => {
          const completion = calculateDate(newHandoverDate, prev.durationDays);
          return { ...prev, handoverDate: newHandoverDate, completionDate: completion };
      });
  };

  const handleDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setProjectForm(prev => ({ ...prev, durationDays: val }));
      if (!isNaN(Number(val)) && val.trim() !== '') {
           setProjectForm(prev => {
              const completion = calculateDate(prev.handoverDate, val);
              return { ...prev, durationDays: val, completionDate: completion };
           });
      }
  };

  const handleDurationBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      const val = e.target.value;
      const result = safeEval(val);
      if (!isNaN(result) && result > 0) {
          setProjectForm(prev => {
             const completion = calculateDate(prev.handoverDate, result.toString());
             return { ...prev, durationDays: result.toString(), completionDate: completion };
          });
      }
  };

  const handleSaveProject = async (e: React.FormEvent) => { 
      e.preventDefault(); 
      if (!projectForm.name) return; 
      setIsModalOpen(false); 
      if (modalMode === 'create') { 
          try { 
              const newProj = await api.createProject(projectForm); 
              if (newProj) {
                  setProjects(prev => {
                      const exists = prev.some(p => p.id === newProj.id);
                      return exists ? prev : [newProj, ...prev];
                  });
              }
          } catch (err) { alert("حدث خطأ"); } 
      } else if (modalMode === 'edit' && editingProjectId) { 
          try { 
              const updated = await api.updateProject(editingProjectId, projectForm); 
              if (updated) {
                  setProjects(prev => prev.map(p => p.id === editingProjectId ? { ...p, ...updated } : p));
              }
          } catch (err) { alert("تعذر تحديث البيانات"); } 
      } 
  };
  
  // Updated Handler to trigger Modal
  const handleDeleteProjectClick = (e: React.MouseEvent, project: Project) => { 
      e.stopPropagation(); 
      setProjectToDelete(project);
  };

  const confirmDeleteProject = async () => {
      if (!projectToDelete) return;
      const id = projectToDelete.id;
      const backup = [...projects]; 
      setProjects(prev => prev.filter(p => p.id !== id)); 
      try { 
          await api.deleteProject(id); 
      } catch (err) { 
          alert("فشل الحذف"); 
          setProjects(backup); 
      } finally {
          setProjectToDelete(null);
      }
  };

  const handleFileClick = (item: FileItem) => { if (item.mimeType === 'text/html' || item.name.endsWith('.html')) navigate(`/editor/${item.parentId}?fileId=${item.id}`); else setPreviewItem(item); };

  const [isTipSaved, setIsTipSaved] = useState(false);
  const [savedTipFile, setSavedTipFile] = useState<{id: string, parentId: string} | null>(null);

  // Check if tip is saved (in local saved map or in Archive)
  const checkTipStatus = useCallback(async () => {
      if (!tipOfTheDay) return;
      const localMap = getSavedTipsMap();
      const hasLocal = Boolean(localMap[tipOfTheDay]);
      const title = tipOfTheDay.length > 50 ? tipOfTheDay.substring(0, 50) + "..." : tipOfTheDay;
      const fileName = `شرح معلومة: ${title}`;
      const found = await api.findFileByName(fileName);
      if (found) {
          setIsTipSaved(true);
          setSavedTipFile(found);
      } else if (hasLocal) {
          setIsTipSaved(true);
          setSavedTipFile(null);
      } else {
          setIsTipSaved(false);
          setSavedTipFile(null);
      }
  }, [tipOfTheDay]);

  useEffect(() => {
      checkTipStatus();
      const interval = setInterval(checkTipStatus, 5000);
      return () => clearInterval(interval);
  }, [checkTipStatus]);

  const handleExplainTip = async () => { 
      setIsExplainModalOpen(true); 
      setIsDirectEditingTip(false);
      const localMap = getSavedTipsMap();
      if (localMap[tipOfTheDay]) {
          setExplainContent(localMap[tipOfTheDay]);
          setIsExplaining(false);
          return;
      }
      if (isTipSaved && savedTipFile) {
          setIsExplaining(true);
          try {
              const fileHtml = await api.getFileContent(savedTipFile.id);
              if (fileHtml) {
                  saveTipToLocalMap(tipOfTheDay, fileHtml);
                  setExplainContent(fileHtml);
                  setIsExplaining(false);
                  return;
              }
          } catch (e) {}
      }
      setIsExplaining(true); 
      setExplainContent(''); 
      try { 
          const result = await aiHelper.explainEngineeringConcept(tipOfTheDay); 
          setExplainContent(result.html); 
          if (result.html && !result.html.includes('Emergency-Static-Brain') && !result.html.includes('Emergency-Quota-Protection')) {
              saveTipToLocalMap(tipOfTheDay, result.html);
              setIsTipSaved(true);
          }
      } catch (e) { 
          setExplainContent("حدث خطأ أثناء تحميل الشرح."); 
      } finally { 
          setIsExplaining(false); 
      } 
  };

  const handleUpdateTipContent = (newHtml: string) => {
      setExplainContent(newHtml);
      if (tipOfTheDay && newHtml) {
          saveTipToLocalMap(tipOfTheDay, newHtml);
          setIsTipSaved(true);
      }
      if (savedTipFile?.id) {
          api.updateFileContent(savedTipFile.id, newHtml).catch(() => {});
      }
  };
  
  const handleSaveTipToArchive = async () => { 
      if (!explainContent) return; 
      setIsSavingToArchive(true); 
      try { 
          saveTipToLocalMap(tipOfTheDay, explainContent);
          setIsTipSaved(true);
          const title = tipOfTheDay.length > 50 ? tipOfTheDay.substring(0, 50) + "..." : tipOfTheDay; 
          const section = getArchiveSectionForCategory(tipKey);
          await api.saveToArchive(`شرح معلومة: ${title}`, explainContent, section); 
          alert(`تم حفظ المعلومة الهندسية بنجاح في قسم: ${section}`); 
          checkTipStatus();
      } catch(e) { 
          alert("حدث خطأ أثناء الحفظ."); 
      } finally { 
          setIsSavingToArchive(false); 
      } 
  };

  const handleDeleteSavedTip = async () => {
      if (!window.confirm('هل أنت متأكد من حذف تقرير هذه المعلومة الهندسية؟')) return;
      try {
          if (tipOfTheDay) {
              const map = getSavedTipsMap();
              delete map[tipOfTheDay];
              localStorage.setItem(SAVED_TIPS_STORAGE_KEY, JSON.stringify(map));
          }
          if (savedTipFile?.id) {
              await api.deleteItem(savedTipFile.id);
          }
          setIsTipSaved(false);
          setSavedTipFile(null);
          setExplainContent('');
          setIsTipReportMenuOpen(false);
          setIsDirectEditingTip(false);
          setIsExplainModalOpen(false);
      } catch (e) {
          console.error(e);
      }
  };
  
  const handleGenerateFreshTip = async () => { 
      setIsGeneratingFreshTip(true); 
      try { 
          const selected = getRandomUniqueTip(ENGINEERING_TIPS_DB); 
          setTipOfTheDay(selected.tip); 
          setTipCategory(selected.category); 
          setTipKey(selected.key);
          const localMap = getSavedTipsMap();
          setIsTipSaved(Boolean(localMap[selected.tip]));
          setSavedTipFile(null);
      } catch(e) { 
          const selected = getRandomUniqueTip(ENGINEERING_TIPS_DB); 
          setTipOfTheDay(selected.tip); 
          setTipCategory(selected.category); 
          setTipKey(selected.key);
      } finally { 
          setIsGeneratingFreshTip(false); 
      } 
  };
  
  const handleExportBackup = async () => {
      try {
          await api.exportProjectsBackup();
      } catch(e) {
          alert("حدث خطأ أثناء تصدير المشروعات.");
      }
  };

  const handleImportBackup = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = async (e: any) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = async (evt) => {
              try {
                  const content = evt.target?.result as string;
                  const res = await api.importProjectsBackup(content);
                  const updated = await api.getLocalProjects();
                  setProjects(updated);
                  
                  let summary = 'تم استيراد النسخة الاحتياطية الشاملة بنجاح!\n\n';
                  if (typeof res === 'object' && res !== null) {
                      summary += `• عدد المشروعات: ${res.projectsCount || 0}\n`;
                      summary += `• مواد وخامات البورصة: ${res.marketCount || 0}\n`;
                      summary += `• المهام والتنبيهات: ${res.tasksCount || 0}\n`;
                      summary += `• المستندات والملفات: ${res.filesCount || 0}`;
                  } else {
                      summary += `• عدد المشروعات: ${res}`;
                  }
                  alert(summary);
              } catch(err: any) {
                  alert("خطأ أثناء استيراد الملف: " + (err.message || 'تعذر القراءة'));
              }
          };
          reader.readAsText(file);
      };
      input.click();
  };

  const handleOpenArchive = async () => { 
      if (isOpeningArchive) return; 
      setIsOpeningArchive(true); 
      try { 
          const archiveId = await api.getArchiveFolderId(); 
          if (archiveId) { 
              navigate(`/archive/${archiveId}`, { state: { folderName: 'الأرشيف الهندسي' } }); 
          } 
      } catch(e) { console.error(e); } finally { setIsOpeningArchive(false); } 
  };

  const filteredProjects = useMemo(() => { if (!searchQuery) return projects; return projects.filter(p => (p.name || '').includes(searchQuery) || (p.contractor || '').includes(searchQuery) || (p.location || '').includes(searchQuery)); }, [projects, searchQuery]);
  const handlePrint = (content: string) => { printService.printReport(content, "تقرير مرجع هندسي", "TIP-REF"); };

  if (!isAuthenticated && !loading) { 
      return ( 
        <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 relative overflow-hidden">
            {/* ... Login Screen ... */}
            <div className="bg-white rounded-[2.5rem] p-10 max-w-lg w-full shadow-2xl text-center space-y-8 relative z-10 border border-white/20">
                <div className="w-24 h-24 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-3xl mx-auto flex items-center justify-center text-slate-900 text-4xl shadow-xl"><i className="fa-solid fa-helmet-safety"></i></div>
                <div className="space-y-2">
                    <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">مدير المشروعات</h1>
                    <p className="text-slate-500 font-medium">نظام التشييد المتكامل (Cloud Only)</p>
                </div>
                <div className="space-y-3">
                    <button onClick={handleLogin} className="w-full bg-slate-900 text-white font-bold py-4 px-6 rounded-2xl flex items-center justify-center gap-4 transition shadow-xl hover:bg-slate-800">
                        <i className="fa-brands fa-google"></i><span className="text-base">الدخول بواسطة Google Drive</span>
                    </button>
                    <button onClick={() => api.signInGuest()} className="w-full bg-white text-slate-900 border-2 border-slate-200 font-bold py-4 px-6 rounded-2xl flex items-center justify-center gap-4 transition shadow-md hover:bg-slate-50">
                        <i className="fa-solid fa-user-secret"></i><span className="text-base">الدخول كزائر (تجربة سريعة)</span>
                    </button>
                </div>
            </div>
        </div> 
      ); 
  }

  return (
    <Layout
      navActions={
        <div className="space-y-1.5">
          <button
            onClick={openCreateModal}
            className="w-full px-3 py-2.5 rounded-xl flex items-center justify-between bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 transition text-xs font-bold text-white"
            title="إضافة مشروع جديد"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center">
                <i className="fa-solid fa-plus text-xs"></i>
              </div>
              <div className="text-right">
                <div className="text-xs font-bold text-white">إضافة مشروع جديد</div>
                <div className="text-[10px] text-blue-300">إنشاء ملف مشروع هندسي جديد</div>
              </div>
            </div>
          </button>

          <button
            onClick={handleExportBackup}
            className="w-full px-3 py-2.5 rounded-xl flex items-center justify-between hover:bg-white/10 transition text-xs font-bold text-white"
            title="تصدير نسخة احتياطية من جميع المشروعات"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-slate-800 text-blue-400 flex items-center justify-center">
                <i className="fa-solid fa-file-export text-xs"></i>
              </div>
              <div className="text-right">
                <div className="text-xs font-bold text-white">تصدير نسخة احتياطية</div>
                <div className="text-[10px] text-slate-400">حفظ بيانات جميع المشروعات</div>
              </div>
            </div>
          </button>

          <button
            onClick={handleImportBackup}
            className="w-full px-3 py-2.5 rounded-xl flex items-center justify-between hover:bg-white/10 transition text-xs font-bold text-white"
            title="استيراد نسخة احتياطية من ملف"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-slate-800 text-teal-400 flex items-center justify-center">
                <i className="fa-solid fa-file-import text-xs"></i>
              </div>
              <div className="text-right">
                <div className="text-xs font-bold text-white">استيراد نسخة احتياطية</div>
                <div className="text-[10px] text-slate-400">استعادة مشروعات من ملف خارجي</div>
              </div>
            </div>
          </button>

          <button
            onClick={() => api.signOut()}
            className="w-full px-3 py-2.5 rounded-xl flex items-center justify-between hover:bg-red-500/20 text-red-300 transition text-xs font-bold"
            title="تسجيل الخروج"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-slate-800 text-red-400 flex items-center justify-center">
                <i className="fa-solid fa-sign-out-alt text-xs"></i>
              </div>
              <div className="text-right">
                <div className="text-xs font-bold text-red-300">تسجيل الخروج</div>
                <div className="text-[10px] text-slate-400">إنهاء الجلسة الحالية</div>
              </div>
            </div>
          </button>
        </div>
      }
    >
      {/* Full Screen Map Overlay - Rendered when viewMode is 'map' */}
      {viewMode === 'map' && (
          <div className="fixed inset-0 z-[2000] bg-slate-900 animate-fade-in flex flex-col">
              <div className="flex-1 w-full h-full relative">
                  <ProjectMap 
                    projects={filteredProjects} 
                    onProjectClick={(id) => navigate(`/project/${id}`)} 
                    isFullScreen={true}
                    onClose={() => setViewMode('grid')}
                  />
              </div>
          </div>
      )}

      <div className="mb-4 relative animate-fade-in z-20 mt-1 flex gap-2 items-center">
          {/* Map View Toggle */}
          <button 
            onClick={() => setViewMode('map')} 
            className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transition transform hover:-translate-y-1 bg-white text-slate-700 hover:bg-slate-50`}
            title="عرض الخريطة (ملء الشاشة)"
          >
              <i className={`fa-solid fa-map-location-dot text-lg`}></i>
          </button>

          {/* Expert Toggle (MOVED HERE) */}
          <button 
            onClick={() => setShowInstantExpert(true)} 
            className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transition transform hover:-translate-y-1 bg-teal-600 text-white hover:bg-teal-700`}
            title="الخبير الهندسي الفوري"
          >
              <i className={`fa-solid fa-user-graduate text-lg`}></i>
          </button>

          <div className="relative flex-1">
              <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none"><i className="fa-solid fa-search text-slate-400"></i></div>
              <input type="text" placeholder="بحث شامل..." className="w-full pr-10 pl-4 py-3 rounded-2xl border-none shadow-sm focus:ring-2 focus:ring-blue-500 outline-none transition bg-white text-slate-900 font-bold" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              {isSearchingFiles && <div className="absolute inset-y-0 left-0 pl-4 flex items-center"><i className="fa-solid fa-circle-notch fa-spin text-blue-500"></i></div>}
          </div>

          {/* Professional Construction Item Pricing Tool */}
          <button 
            onClick={() => setShowProfessionalPricing(true)} 
            className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transition transform hover:-translate-y-1 bg-gradient-to-br from-amber-500 to-orange-600 text-white hover:from-amber-600 hover:to-orange-700"
            title="التسعير الاحترافي وتحليل أسعار البنود الإنشائية"
          >
              <i className="fa-solid fa-file-invoice-dollar text-lg"></i>
          </button>
          
          {/* Market Tool */}
          <button 
            onClick={() => setShowMarket(true)} 
            className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transition transform hover:-translate-y-1 bg-gradient-to-br from-rose-500 to-pink-600 text-white"
            title="بورصة الأسعار"
          >
              <i className="fa-solid fa-sack-dollar text-lg"></i>
          </button>
          
      </div>

      <div className={`grid grid-cols-1 ${searchQuery ? 'gap-2' : 'lg:grid-cols-3 gap-4'}`}>
            {/* Main Projects Section */}
            <div className={searchQuery ? '' : 'lg:col-span-2'}>
                {/* Title and Archive Link Row */}
                <div className="flex flex-col mb-3">
                    {!searchQuery && (
                        <div onClick={handleOpenArchive} className={`bg-gradient-to-br from-teal-700 to-teal-900 rounded-3xl shadow-lg border border-teal-600 cursor-pointer group relative overflow-visible transition-all duration-300 p-4 hover:shadow-xl hover:-translate-y-1 mb-4 ${isOpeningArchive ? 'opacity-80' : ''}`}>
                            <div className="flex justify-between items-center relative z-10">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-teal-600 text-white text-xl shadow-inner border border-teal-500">
                                        {isOpeningArchive ? <i className="fa-solid fa-circle-notch fa-spin"></i> : <i className="fa-solid fa-box-archive"></i>}
                                    </div>
                                    <div>
                                        <h3 className="font-extrabold text-white text-base mb-0.5">الأرشيف الهندسي</h3>
                                        <p className="text-teal-200 text-[10px] font-medium">المكتبة الفنية، الكود المصري، والمستندات المحفوظة</p>
                                    </div>
                                </div>
                                <div className="w-8 h-8 rounded-full flex items-center justify-center bg-teal-800 text-teal-200 group-hover:bg-white group-hover:text-teal-700 transition">
                                    <i className="fa-solid fa-arrow-left rtl:rotate-180 text-xs"></i>
                                </div>
                            </div>
                            <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full blur-3xl -mr-8 -mt-8"></div>
                        </div>
                    )}

                    <div className="flex justify-between items-center mb-2 flex-wrap gap-2">
                        <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                            <i className="fa-solid fa-building-columns text-blue-600"></i>
                            {searchQuery ? 'نتائج البحث' : 'مشاريعك الحالية'}
                        </h3>
                    </div>
                </div>

                <div className="animate-fade-in mb-4">
                    {loading && projects.length === 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {filteredProjects.map(project => (<ProjectCard key={project.id} project={project} onClick={() => navigate(`/project/${project.id}`)} onEdit={(e) => openEditModal(e, project)} onDelete={(e) => handleDeleteProjectClick(e, project)} />))}
                            {filteredProjects.length === 0 && !loading && (<div onClick={openCreateModal} className="col-span-1 sm:col-span-2 border-2 border-dashed border-slate-200 rounded-3xl p-10 flex flex-col items-center justify-center text-slate-400 hover:border-blue-400 cursor-pointer bg-white/50"><i className="fa-solid fa-plus-circle text-4xl mb-3"></i><p className="font-bold">ابدأ بإضافة أول مشروع لمجلداتك</p></div>)}
                        </div>
                    )}
                </div>
                
                {searchQuery && (<div className="animate-fade-in space-y-2"><h3 className="text-sm font-black text-black mb-2 pt-4 border-t border-slate-200 flex items-center gap-2">المستندات المتطابقة ({foundFiles.length})</h3>{foundFiles.length > 0 ? foundFiles.map(file => <FileItemRow key={file.id} item={file} onClick={() => handleFileClick(file)} onDelete={() => {}} />) : <div className="p-10 text-center text-slate-400 bg-white rounded-3xl border border-dashed border-slate-200">لا توجد مستندات تطابق بحثك</div>}</div>)}
            </div>

            {!searchQuery && (
                <div className="lg:col-span-1 space-y-4 mt-4 lg:mt-0">
                     {/* Tip Card */}
                     <div className={`rounded-3xl p-4 text-white shadow-lg animate-slide-up relative overflow-hidden group transition-colors duration-300 ${
                         isTipSaved
                             ? 'bg-gradient-to-br from-emerald-600 via-emerald-700 to-green-800 border border-emerald-400/40'
                             : 'bg-gradient-to-br from-indigo-600 to-purple-700'
                     }`}>
                         <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10"></div>
                         <div className="flex justify-between items-start mb-3 relative z-10">
                             <h3 className="font-bold text-sm flex items-center gap-2">
                                 <i className="fa-solid fa-lightbulb text-yellow-300"></i> معلومة هندسية
                             </h3>
                             <span className="bg-white/20 text-[10px] px-2 py-0.5 rounded-full">{tipCategory}</span>
                         </div>
                         <p className="text-xs font-medium leading-relaxed mb-4 min-h-[50px] opacity-90 relative z-10">{tipOfTheDay}</p>
                         <div className="flex gap-2 relative z-10">
                             <button onClick={handleGenerateFreshTip} disabled={isGeneratingFreshTip} className="flex-1 bg-white/15 hover:bg-white/25 text-white font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-1 transition"><i className={`fa-solid ${isGeneratingFreshTip ? 'fa-circle-notch fa-spin' : 'fa-rotate'}`}></i> معلومة جديدة</button>
                             <button
                                 onClick={handleExplainTip}
                                 className={`flex-1 font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 transition ${
                                     isTipSaved
                                         ? 'bg-white text-emerald-800 hover:bg-emerald-50 shadow-md'
                                         : 'bg-white/20 hover:bg-white/30 text-white'
                                 }`}
                             >
                                 <i className={`fa-solid ${isTipSaved ? 'fa-book-open-reader' : 'fa-book-open'}`}></i>
                                 <span>{isTipSaved ? 'فتح المعلومة' : 'تفاصيل شاملة'}</span>
                             </button>
                         </div>
                     </div>
                </div>
            )}
        </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 z-[200] flex items-center justify-center backdrop-blur-sm p-4 animate-fade-in"><div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-scale-in"><div className="px-6 py-4 border-b bg-white flex justify-between items-center"><h3 className="font-bold text-lg text-slate-800">{modalMode === 'create' ? 'إضافة مشروع جديد' : 'تعديل بيانات المشروع'}</h3><button onClick={() => setIsModalOpen(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-red-50 hover:text-red-500 transition"><i className="fa-solid fa-times"></i></button></div><form onSubmit={handleSaveProject} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto"><div><label className="block text-xs font-bold text-slate-500 mb-2">اسم المشروع *</label><input type="text" required className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 outline-none focus:border-blue-500 transition text-slate-900" value={projectForm.name} onChange={e => setProjectForm({...projectForm, name: e.target.value})} placeholder="مثال: إنشاء برج سكني" /></div><div><label className="block text-xs font-bold text-slate-500 mb-2">الموقع</label><input type="text" className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 outline-none focus:border-blue-500 transition text-slate-900" value={projectForm.location} onChange={e => setProjectForm({...projectForm, location: e.target.value})} /></div>
        <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-xs font-bold text-slate-500 mb-2">تاريخ استلام الأرض</label><input type="date" className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 outline-none focus:border-blue-500 transition text-slate-900 font-mono text-sm" value={projectForm.handoverDate} onChange={handleHandoverChange} /></div>
            <div>
                <label className="block text-xs font-bold text-slate-500 mb-2">مدة المشروع (أيام)</label>
                <div className="relative">
                    <input 
                        type="text" 
                        className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 outline-none focus:border-blue-500 transition text-slate-900 font-mono text-sm text-center ltr" 
                        placeholder="أدخل الأيام أو معادلة (مثال: 12*30)" 
                        value={projectForm.durationDays} 
                        onChange={handleDurationChange}
                        onBlur={handleDurationBlur}
                        dir="ltr"
                    />
                    <div className="absolute left-3 top-3 text-slate-400 text-xs pointer-events-none">
                        <i className="fa-solid fa-calculator"></i>
                    </div>
                </div>
            </div>
        </div>
        <div><label className="block text-xs font-bold text-slate-500 mb-2">تاريخ النهو المتوقع (محسوب تلقائياً)</label><input type="date" className="w-full p-3 bg-slate-100 rounded-xl border border-slate-200 outline-none text-slate-600 font-mono text-sm cursor-not-allowed" value={projectForm.completionDate} readOnly /></div>
        <div className="grid grid-cols-2 gap-4"><div><label className="block text-xs font-bold text-slate-500 mb-2">المقاول</label><input type="text" className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 outline-none focus:border-blue-500 transition text-slate-900" value={projectForm.contractor} onChange={e => setProjectForm({...projectForm, contractor: e.target.value})} /></div><div><label className="block text-xs font-bold text-slate-500 mb-2">القيمة (ج.م)</label><input type="text" className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 outline-none focus:border-blue-500 transition text-slate-900" value={projectForm.value} onChange={e => setProjectForm({...projectForm, value: e.target.value})} /></div></div><button type="submit" className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold shadow-lg hover:bg-slate-800 transition transform active:scale-95 flex justify-center gap-2"><i className="fa-solid fa-save"></i> {modalMode === 'create' ? 'حفظ وبدء المشروع' : 'حفظ التعديلات'}</button></form></div></div>
      )}

      {/* Confirm Delete Modals */}
      <ConfirmModal 
        isOpen={!!projectToDelete}
        title="حذف المشروع"
        message={`تحذير هام! هل أنت متأكد من حذف مشروع "${projectToDelete?.name}"؟ سيتم حذف جميع الملفات والبيانات نهائياً.`}
        onConfirm={confirmDeleteProject}
        onCancel={() => setProjectToDelete(null)}
        type="danger"
        confirmText="نعم، حذف المشروع"
      />

      {isExplainModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center backdrop-blur-sm p-0 animate-fade-in">
              <div className="bg-white w-full h-full flex flex-col animate-scale-in">
                  <div className="bg-slate-900 px-3.5 py-2.5 text-white flex justify-between items-center shrink-0 relative shadow-md border-b border-slate-800">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1 ml-2">
                          <div className="w-7 h-7 rounded-lg bg-teal-600 flex items-center justify-center shrink-0">
                              <i className="fa-solid fa-book-open text-xs text-white"></i>
                          </div>
                          <div className="min-w-0 flex-1">
                              <div className="text-[11px] sm:text-xs font-bold text-white truncate leading-tight !bg-transparent !border-0 !p-0 !m-0">
                                  خبير المعلومات الهندسية
                              </div>
                              <p className="text-[9.5px] sm:text-[10px] text-emerald-400 font-medium mt-0.5 truncate">{tipOfTheDay}</p>
                          </div>
                      </div>
                      <div className="flex items-center gap-2 relative shrink-0">
                          {isDirectEditingTip && (
                              <button
                                  type="button"
                                  onClick={() => setIsDirectEditingTip(false)}
                                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center transition border border-emerald-400 shadow-sm shrink-0"
                                  title="إنهاء التعديل المباشر"
                              >
                                  <i className="fa-solid fa-check text-sm font-bold"></i>
                              </button>
                          )}
                          {!isExplaining && explainContent && (
                              <button
                                  type="button"
                                  onClick={() => setIsTipReportMenuOpen(!isTipReportMenuOpen)}
                                  className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center transition text-xs border ${
                                      isTipReportMenuOpen
                                          ? 'bg-indigo-600 text-white border-indigo-400 shadow-lg'
                                          : isDirectEditingTip
                                              ? 'bg-indigo-500/30 border-indigo-400 text-indigo-200'
                                              : 'bg-white/10 hover:bg-white/20 text-white border-white/20'
                                  }`}
                                  title="خيارات التقرير"
                              >
                                  <i className="fa-solid fa-ellipsis-vertical text-base"></i>
                              </button>
                          )}
                          <button
                              type="button"
                              onClick={() => {
                                  setIsExplainModalOpen(false);
                                  setIsTipReportMenuOpen(false);
                                  setIsDirectEditingTip(false);
                              }}
                              className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-white/10 hover:bg-red-500/80 text-white flex items-center justify-center transition border border-white/10"
                              title="إغلاق"
                          >
                              <i className="fa-solid fa-times"></i>
                          </button>

                          {isTipReportMenuOpen && !isExplaining && explainContent && (
                              <>
                                  <div className="fixed inset-0 z-[100]" onClick={() => setIsTipReportMenuOpen(false)}></div>
                                  <div className="absolute left-0 top-11 w-60 bg-slate-900/95 backdrop-blur-xl border border-slate-700 rounded-2xl shadow-2xl p-2 z-[110] space-y-1.5 text-white animate-scale-in origin-top-left">
                                      <div className="px-2.5 py-1 border-b border-slate-800 flex items-center justify-between">
                                          <span className="text-[10px] font-bold text-slate-400">إجراءات التقرير</span>
                                          <i className="fa-solid fa-file-lines text-[10px] text-indigo-400"></i>
                                      </div>

                                      <button
                                          type="button"
                                          onClick={() => {
                                              setIsTipReportMenuOpen(false);
                                              setIsDirectEditingTip(!isDirectEditingTip);
                                          }}
                                          className={`w-full px-3 py-2.5 rounded-xl text-white flex items-center gap-2.5 transition text-xs font-bold text-right ${
                                              isDirectEditingTip
                                                  ? 'bg-emerald-600 hover:bg-emerald-500 shadow-md ring-1 ring-emerald-400'
                                                  : 'bg-indigo-600 hover:bg-indigo-500 shadow-sm'
                                          }`}
                                      >
                                          <div className="w-6 h-6 rounded-lg bg-white/20 text-white flex items-center justify-center shrink-0">
                                              <i className={`fa-solid ${isDirectEditingTip ? 'fa-check' : 'fa-file-pen'} text-xs`}></i>
                                          </div>
                                          <div className="flex-1 text-right">
                                              <div>{isDirectEditingTip ? 'إنهاء التعديل المباشر' : 'التعديل المباشر'}</div>
                                              <div className="text-[10px] text-indigo-200 font-normal">حفظ تلقائي على التقرير</div>
                                          </div>
                                      </button>

                                      <button
                                          type="button"
                                          onClick={async () => {
                                              setIsTipReportMenuOpen(false);
                                              if (!explainContent) return;
                                              try {
                                                  const archiveId = await api.getArchiveFolderId();
                                                  const rootId = await api.ensureRootFolder();
                                                  if (archiveId && rootId) {
                                                      navigate(`/editor/${rootId}/${archiveId}`, { state: { initialContent: explainContent } });
                                                  }
                                              } catch (e) {
                                                  alert("حدث خطأ.");
                                              }
                                          }}
                                          className="w-full px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-indigo-600 text-white flex items-center gap-2.5 transition text-xs font-bold text-right"
                                      >
                                          <div className="w-6 h-6 rounded-lg bg-indigo-500/20 text-indigo-300 flex items-center justify-center shrink-0">
                                              <i className="fa-solid fa-pen-to-square text-xs"></i>
                                          </div>
                                          <span>تعديل المستند</span>
                                      </button>

                                      <button
                                          type="button"
                                          onClick={() => {
                                              setIsTipReportMenuOpen(false);
                                              handlePrint(explainContent);
                                          }}
                                          className="w-full px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-emerald-600 text-white flex items-center gap-2.5 transition text-xs font-bold text-right"
                                      >
                                          <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-300 flex items-center justify-center shrink-0">
                                              <i className="fa-solid fa-print text-xs"></i>
                                          </div>
                                          <span>طباعة المستند</span>
                                      </button>

                                      <button
                                          type="button"
                                          onClick={() => {
                                              setIsTipReportMenuOpen(false);
                                              handleSaveTipToArchive();
                                          }}
                                          disabled={isSavingToArchive}
                                          className="w-full px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-teal-600 text-white flex items-center gap-2.5 transition text-xs font-bold text-right disabled:opacity-50"
                                      >
                                          <div className="w-6 h-6 rounded-lg bg-teal-500/20 text-teal-300 flex items-center justify-center shrink-0">
                                              {isSavingToArchive ? <i className="fa-solid fa-circle-notch fa-spin text-xs"></i> : <i className="fa-solid fa-box-archive text-xs"></i>}
                                          </div>
                                          <span>حفظ في الأرشيف الهندسي</span>
                                      </button>

                                      <button
                                          type="button"
                                          onClick={handleDeleteSavedTip}
                                          className="w-full px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-red-600 text-red-300 hover:text-white flex items-center gap-2.5 transition text-xs font-bold text-right border-t border-slate-700/60 mt-1"
                                      >
                                          <div className="w-6 h-6 rounded-lg bg-red-500/20 text-red-400 flex items-center justify-center shrink-0">
                                              <i className="fa-solid fa-trash-can text-xs"></i>
                                          </div>
                                          <span>حذف التقرير</span>
                                      </button>
                                  </div>
                              </>
                          )}
                      </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 sm:p-6 bg-slate-50">
                      {isExplaining ? (
                          <div className="flex flex-col items-center justify-center h-full gap-4">
                              <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                              <div className="text-center">
                                <p className="text-slate-700 font-bold text-lg mb-1">جاري استشارة الخبير الاستشاري...</p>
                                <p className="text-slate-500 text-xs">يتم الآن إعداد تقرير فني شامل يتضمن أسرار الموقع والأخطاء الشائعة.</p>
                              </div>
                          </div>
                      ) : (
                          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-3 sm:p-6 max-w-5xl mx-auto">
                              <InteractiveReportViewer
                                  htmlContent={explainContent}
                                  onContentChange={handleUpdateTipContent}
                                  isDirectEditing={isDirectEditingTip}
                                  onDirectEditChange={setIsDirectEditingTip}
                                  showFloatingEditBar={false}
                              />
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}

      {showMarket && <MarketPricesModal onClose={() => setShowMarket(false)} />}
      {showProfessionalPricing && <ProfessionalPricingModal onClose={() => setShowProfessionalPricing(false)} />}
      {showInstantExpert && <InstantExpert onClose={() => setShowInstantExpert(false)} />} {/* RENDER INSTANT EXPERT */}

      {previewItem && <FileViewer item={previewItem} siblings={previewItem.mimeType?.startsWith('image/') ? items.filter(i => i.mimeType?.startsWith('image/')) : []} onClose={() => setPreviewItem(null)} />
      }
    </Layout>
  );
};
export default Dashboard;
