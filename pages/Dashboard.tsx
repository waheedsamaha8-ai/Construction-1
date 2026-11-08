
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
import InstantExpert from '../components/InstantExpert'; // IMPORT NEW COMPONENT
import { api } from '../services/api';
import { aiHelper } from '../services/aiHelper';
import { printService } from '../services/printService';
import { Project, ProjectStatus, FileItem, ProjectLog } from '../types';
import { ENGINEERING_TIPS_DB, getCategoryLabel, getArchiveSectionForCategory } from '../services/tipsData';

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
  
  const [isGeneratingFreshTip, setIsGeneratingFreshTip] = useState(false);
  const [isOpeningArchive, setIsOpeningArchive] = useState(false);
  const [isSavingToArchive, setIsSavingToArchive] = useState(false);
  
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');
  
  // --- NEW TOOLS STATE ---
  const [showMarket, setShowMarket] = useState(false);
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
              await fetchData(); 
          } else { 
              setLoading(false); 
          }
      };

      checkAuth();

      // Guaranteed safety timeout to remove skeleton cards after 1.5s max
      const safetyTimer = setTimeout(() => {
          setLoading(false);
      }, 1500);

      return () => clearTimeout(safetyTimer);
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

  const handleSaveProject = async (e: React.FormEvent) => { e.preventDefault(); if (!projectForm.name) return; setIsModalOpen(false); if (modalMode === 'create') { try { await api.createProject(projectForm); fetchData(); } catch (err) { alert("حدث خطأ"); } } else if (modalMode === 'edit' && editingProjectId) { try { await api.updateProject(editingProjectId, projectForm); fetchData(); } catch (err) { alert("تعذر تحديث البيانات"); } } };
  
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

  // Check if tip is saved
  const checkTipStatus = useCallback(async () => {
      if (!tipOfTheDay) return;
      const title = tipOfTheDay.length > 50 ? tipOfTheDay.substring(0, 50) + "..." : tipOfTheDay;
      const fileName = `شرح معلومة: ${title}`;
      const found = await api.findFileByName(fileName);
      if (found) {
          setIsTipSaved(true);
          setSavedTipFile(found);
      } else {
          setIsTipSaved(false);
          setSavedTipFile(null);
      }
  }, [tipOfTheDay]);

  useEffect(() => {
      checkTipStatus();
      const interval = setInterval(checkTipStatus, 5000); // Check every 5s for updates (e.g. deletion)
      return () => clearInterval(interval);
  }, [checkTipStatus]);

  const handleExplainTip = async () => { 
      if (isTipSaved && savedTipFile) {
          navigate(`/editor/${savedTipFile.parentId}?fileId=${savedTipFile.id}`);
          return;
      }
      setIsExplainModalOpen(true); 
      setIsExplaining(true); 
      setExplainContent(''); 
      try { 
          const result = await aiHelper.explainEngineeringConcept(tipOfTheDay); 
          setExplainContent(result.html); 
      } catch (e) { 
          setExplainContent("حدث خطأ أثناء تحميل الشرح."); 
      } finally { 
          setIsExplaining(false); 
      } 
  };
  
  const handleSaveTipToArchive = async () => { 
      if (!explainContent) return; 
      setIsSavingToArchive(true); 
      try { 
          const title = tipOfTheDay.length > 50 ? tipOfTheDay.substring(0, 50) + "..." : tipOfTheDay; 
          const section = getArchiveSectionForCategory(tipKey);
          const fileId = await api.saveToArchive(`شرح معلومة: ${title}`, explainContent, section); 
          alert(`تم حفظ الشرح بنجاح في قسم: ${section}`); 
          checkTipStatus(); // Update status immediately
      } catch(e) { 
          alert("حدث خطأ أثناء الحفظ."); 
      } finally { 
          setIsSavingToArchive(false); 
      } 
  };
  
  const handleGenerateFreshTip = async () => { 
      setIsGeneratingFreshTip(true); 
      try { 
          // Use AI to generate a fresh, unique engineering tip
          const result = await aiHelper.generateEngineeringTip();
          if (result && result.tip && result.category) {
              setTipOfTheDay(result.tip); 
              setTipCategory(result.category); 
              setTipKey(result.key || 'general');
          } else {
              // Fallback to local DB if AI fails
              const selected = getRandomUniqueTip(ENGINEERING_TIPS_DB); 
              setTipOfTheDay(selected.tip); 
              setTipCategory(selected.category); 
              setTipKey(selected.key);
          }
      } catch(e) { 
          // Fallback to local DB
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
                  const count = await api.importProjectsBackup(content);
                  const updated = await api.getLocalProjects();
                  setProjects(updated);
                  alert(`تم استيراد ${count} مشروع بنجاح!`);
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
    <Layout navActions={<div className="flex gap-2"><button onClick={() => api.signOut()} className="bg-white/10 text-white px-3 py-1.5 rounded-lg text-xs hover:bg-white/20 transition" title="تسجيل الخروج"><i className="fa-solid fa-sign-out-alt"></i></button></div>}>
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
                        {!searchQuery && (
                            <div className="flex items-center gap-1.5">
                                <button 
                                    onClick={openCreateModal} 
                                    className="bg-blue-600 text-white hover:bg-blue-700 transition-colors rounded-xl px-3 py-1.5 text-[10px] font-bold shadow-md flex items-center gap-1.5"
                                    title="إضافة مشروع جديد"
                                >
                                    <i className="fa-solid fa-plus"></i> إضافة مشروع جديد
                                </button>
                                <button 
                                    onClick={handleExportBackup} 
                                    className="bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors rounded-xl px-2.5 py-1.5 text-[10px] font-bold border border-slate-200 shadow-sm flex items-center gap-1"
                                    title="تصدير نسخة احتياطية من جميع المشروعات"
                                >
                                    <i className="fa-solid fa-file-export text-blue-600"></i> تصدير
                                </button>
                                <button 
                                    onClick={handleImportBackup} 
                                    className="bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors rounded-xl px-2.5 py-1.5 text-[10px] font-bold border border-slate-200 shadow-sm flex items-center gap-1"
                                    title="استيراد نسخة احتياطية من ملف"
                                >
                                    <i className="fa-solid fa-file-import text-teal-600"></i> استيراد
                                </button>
                            </div>
                        )}
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
                     <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-3xl p-4 text-white shadow-lg animate-slide-up relative overflow-hidden group">
                         <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10"></div>
                         <div className="flex justify-between items-start mb-3 relative z-10">
                             <h3 className="font-bold text-sm flex items-center gap-2">
                                 <i className="fa-solid fa-lightbulb text-yellow-300"></i> معلومة هندسية
                                 {isTipSaved && (
                                     <span className="bg-green-500/20 text-green-300 border border-green-500/30 text-[9px] px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse cursor-pointer hover:bg-green-500/30 transition" onClick={handleExplainTip} title="اضغط لعرض التفاصيل المحفوظة">
                                         <i className="fa-solid fa-check-circle"></i> محفوظة
                                     </span>
                                 )}
                             </h3>
                             <span className="bg-white/20 text-[10px] px-2 py-0.5 rounded-full">{tipCategory}</span>
                         </div>
                         <p className="text-xs font-medium leading-relaxed mb-4 min-h-[50px] opacity-90 relative z-10">{tipOfTheDay}</p>
                         <div className="flex gap-2 relative z-10">
                             <button onClick={handleGenerateFreshTip} disabled={isGeneratingFreshTip} className="flex-1 bg-white/10 hover:bg-white/20 text-white font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-1 transition"><i className={`fa-solid ${isGeneratingFreshTip ? 'fa-circle-notch fa-spin' : 'fa-rotate'}`}></i> معلومة جديدة</button>
                             <button onClick={handleExplainTip} className={`flex-1 font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-1 transition ${isTipSaved ? 'bg-green-500/20 hover:bg-green-500/30 text-green-100 border border-green-500/30' : 'bg-white/20 hover:bg-white/30 text-white'}`}>
                                 <i className={`fa-solid ${isTipSaved ? 'fa-file-lines' : 'fa-book-open'}`}></i> {isTipSaved ? 'عرض التقرير' : 'تفاصيل شاملة'}
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
              {/* Full Width Modal Container without Margins */}
              <div className="bg-white w-full h-full md:w-[98vw] md:h-[98vh] md:rounded-xl shadow-2xl overflow-hidden flex flex-col animate-scale-in border border-slate-200">
                  <div className="bg-gradient-to-r from-indigo-900 to-purple-900 p-4 text-white flex justify-between items-center shrink-0">
                      <div><h3 className="text-lg font-bold flex items-center gap-2"><i className="fa-solid fa-book-open text-yellow-400"></i> خبير المعلومات الهندسية</h3><p className="text-[10px] text-indigo-200 mt-0.5 opacity-90 hidden sm:block">{tipOfTheDay}</p></div><button onClick={() => setIsExplainModalOpen(false)} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition"><i className="fa-solid fa-times"></i></button>
                  </div>
                  {/* Content Area with P-0 to allow full width HTML */}
                  <div className="flex-1 overflow-y-auto p-0 bg-white">
                      {isExplaining ? (
                          <div className="flex flex-col items-center justify-center h-full gap-4">
                              <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                              <div className="text-center">
                                <p className="text-slate-700 font-bold text-lg mb-1">جاري استشارة الخبير الاستشاري...</p>
                                <p className="text-slate-500 text-xs">يتم الآن إعداد تقرير فني شامل يتضمن أسرار الموقع والأخطاء الشائعة.</p>
                              </div>
                          </div>
                      ) : (
                          <>
                            {/* Full Width Wrapper for injected HTML with visible padding */}
                            <div className="prose prose-sm max-w-none text-slate-800 leading-relaxed w-full px-6 py-8 md:px-12 md:py-10" dangerouslySetInnerHTML={{ __html: explainContent }}></div>
                          </>
                      )}
                  </div>
                  <div className="p-3 bg-white border-t border-slate-200 flex justify-end shrink-0 gap-2">
                      {!isExplaining && (
                          <>
                            <button onClick={handleSaveTipToArchive} disabled={isSavingToArchive} className="bg-teal-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-teal-700 transition flex items-center gap-2 shadow-sm disabled:opacity-50 text-[10px] sm:text-xs">
                                {isSavingToArchive ? <i className="fa-solid fa-circle-notch fa-spin"></i> : <i className="fa-solid fa-box-archive"></i>} حفظ
                            </button>
                            <button onClick={async () => { if (!explainContent) return; try { const archiveId = await api.getArchiveFolderId(); const rootId = await api.ensureRootFolder(); if (archiveId && rootId) { navigate(`/editor/${rootId}/${archiveId}`, { state: { initialContent: explainContent } }); } } catch (e) { alert("حدث خطأ."); } }} className="bg-blue-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-blue-700 transition flex items-center gap-2 shadow-sm text-[10px] sm:text-xs">
                                <i className="fa-solid fa-pen-to-square"></i> تعديل
                            </button>
                            <button onClick={() => handlePrint(explainContent)} className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-indigo-700 transition flex items-center gap-2 shadow-sm text-[10px] sm:text-xs"><i className="fa-solid fa-print"></i> طباعة</button>
                          </>
                      )}
                      <button onClick={() => setIsExplainModalOpen(false)} className="bg-slate-100 text-slate-700 px-6 py-2 rounded-xl font-bold hover:bg-slate-200 transition text-[10px] sm:text-xs">إغلاق</button>
                  </div>
              </div>
          </div>
      )}

      {showMarket && <MarketPricesModal onClose={() => setShowMarket(false)} />}
      {showInstantExpert && <InstantExpert onClose={() => setShowInstantExpert(false)} />} {/* RENDER INSTANT EXPERT */}

      {previewItem && <FileViewer item={previewItem} siblings={previewItem.mimeType?.startsWith('image/') ? items.filter(i => i.mimeType?.startsWith('image/')) : []} onClose={() => setPreviewItem(null)} />
      }
    </Layout>
  );
};
export default Dashboard;
