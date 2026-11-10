
import React, { useState } from 'react';
import { Project, ProjectStatus } from '../types';

interface ProjectCardProps {
  project: Project;
  onClick: () => void;
  onEdit: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
}

const ProjectCard: React.FC<ProjectCardProps> = ({ project, onClick, onEdit, onDelete }) => {
  const [showMenu, setShowMenu] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Updated Colors: Stronger, more vibrant gradients for "Colorful" look
  const getStatusStyle = (status: ProjectStatus) => {
    switch (status) {
      case ProjectStatus.ONGOING: 
        return { 
            // Vibrant Amber/Orange
            cardBg: 'bg-gradient-to-br from-amber-100 via-orange-50 to-amber-200 border-amber-300', 
            badge: 'bg-amber-600 text-white shadow-sm', 
            iconColor: 'text-amber-700 bg-white/60',
            icon: 'fa-person-digging',
            progressColor: 'bg-amber-600',
            textColor: 'text-amber-950',
            subTextColor: 'text-amber-800'
        };
      case ProjectStatus.COMPLETED: 
        return { 
            // Vibrant Emerald/Green
            cardBg: 'bg-gradient-to-br from-emerald-100 via-green-50 to-emerald-200 border-emerald-300', 
            badge: 'bg-emerald-600 text-white shadow-sm', 
            iconColor: 'text-emerald-700 bg-white/60',
            icon: 'fa-check-double',
            progressColor: 'bg-emerald-600',
            textColor: 'text-emerald-950',
            subTextColor: 'text-emerald-800'
        };
      case ProjectStatus.DESIGN: 
        return { 
            // Vibrant Violet/Purple
            cardBg: 'bg-gradient-to-br from-violet-100 via-purple-50 to-indigo-200 border-violet-300', 
            badge: 'bg-violet-600 text-white shadow-sm', 
            iconColor: 'text-violet-700 bg-white/60',
            icon: 'fa-pen-ruler',
            progressColor: 'bg-violet-600',
            textColor: 'text-violet-950',
            subTextColor: 'text-violet-800'
        };
      case ProjectStatus.PAUSED: 
        return { 
            // Vibrant Rose/Red
            cardBg: 'bg-gradient-to-br from-rose-100 via-red-50 to-rose-200 border-rose-300', 
            badge: 'bg-rose-600 text-white shadow-sm', 
            iconColor: 'text-rose-700 bg-white/60',
            icon: 'fa-pause',
            progressColor: 'bg-rose-600',
            textColor: 'text-rose-950',
            subTextColor: 'text-rose-800'
        };
      default: 
        return { 
            // Vibrant Slate/Blue-Gray
            cardBg: 'bg-gradient-to-br from-slate-200 via-gray-100 to-slate-300 border-slate-400', 
            badge: 'bg-slate-700 text-white shadow-sm', 
            iconColor: 'text-slate-700 bg-white/60',
            icon: 'fa-circle-question',
            progressColor: 'bg-slate-600',
            textColor: 'text-slate-900',
            subTextColor: 'text-slate-700'
        };
    }
  };

  const style = getStatusStyle(project.status);
  const progress = project.calculatedProgress || 0;

  const toggleExpand = (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsExpanded(!isExpanded);
  };

  const handleAction = (e: React.MouseEvent, action: (e: React.MouseEvent) => void) => {
      e.stopPropagation(); 
      setShowMenu(false); 
      setTimeout(() => { action(e); }, 50); 
  };

  return (
    <div 
      onClick={onClick}
      className={`rounded-3xl shadow-md border-2 cursor-pointer group relative overflow-visible transition-all duration-300 ${style.cardBg} ${isExpanded ? 'p-5 ring-2 ring-black/10 shadow-xl scale-[1.02]' : 'p-4 hover:shadow-lg hover:-translate-y-1'} ${showMenu ? 'z-50' : ''}`}
    >
      {/* Header Row (Always Visible) */}
      <div className="flex justify-between items-start gap-2">
        <div className="flex items-start gap-3 overflow-hidden flex-1">
             {/* Icon & Status Badge Stacked Vertically */}
            <div className="flex flex-col items-center gap-1.5 shrink-0">
                <div className={`rounded-2xl flex items-center justify-center shadow-inner transition-all shrink-0 ${style.iconColor} ${isExpanded ? 'w-14 h-14 text-2xl' : 'w-12 h-12 text-xl'}`}>
                    <i className={`fa-solid ${style.icon}`}></i>
                </div>
                <span className={`text-[8px] font-bold px-1.5 py-0.2 rounded-full whitespace-nowrap shadow-xs ${style.badge}`}>
                    {project.status}
                </span>
            </div>
            
            {/* Title, Location & Financial Progress */}
            <div className="min-w-0 pt-0.5 flex-1">
                 <h3 className={`font-black ${style.textColor} leading-tight truncate transition-all ${isExpanded ? 'text-lg mb-1' : 'text-base'}`}>
                    {project.name}
                 </h3>
                 
                 {project.location && (
                     <div className={`text-[10px] ${style.subTextColor} truncate font-bold mt-1`}>
                         <i className="fa-solid fa-location-dot ml-1 opacity-75"></i>
                         {project.location}
                     </div>
                 )}

                 {!isExpanded && (
                     <div className="w-full mt-2">
                         <div className="flex justify-between items-center text-[10px] font-bold mb-0.5">
                             <span className={`${style.subTextColor} opacity-90`}>الإنجاز المالي:</span>
                             <span className="font-mono text-[10px] font-extrabold text-slate-900 bg-white/80 px-1.5 py-0.2 rounded border border-black/10">
                                 {progress}%
                             </span>
                         </div>
                         <div className="w-full bg-black/10 h-2 rounded-full overflow-hidden shadow-inner">
                             <div className={`h-full rounded-full transition-all duration-500 ${style.progressColor}`} style={{width: `${Math.min(Math.max(progress, 0), 100)}%`}}></div>
                         </div>
                     </div>
                 )}
            </div>
        </div>

        {/* Controls: 3 Dots Menu on Top, Arrow Button Directly Underneath */}
        <div className="flex flex-col items-center gap-1 shrink-0 -mt-1 -ml-1">
             {/* Menu Button (Top) */}
            <div className="relative z-10">
                <button 
                    onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
                    className="w-8 h-8 rounded-full hover:bg-white/40 flex items-center justify-center text-slate-600 hover:text-slate-900 transition"
                    title="خيارات"
                >
                    <i className="fa-solid fa-ellipsis-vertical text-sm"></i>
                </button>
                {showMenu && (
                    <>
                    <div 
                        className="fixed inset-0 z-10" 
                        onClick={(e) => { e.stopPropagation(); setShowMenu(false); }}
                    ></div>
                    <div className="absolute left-0 top-full mt-1 w-36 bg-white rounded-xl shadow-2xl border border-slate-100 z-20 py-1 overflow-hidden animate-scale-in ring-1 ring-black/5">
                        <button 
                            onClick={(e) => handleAction(e, onEdit)}
                            className="w-full text-right px-4 py-3 text-xs font-bold text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-3 border-b border-slate-50"
                        >
                            <i className="fa-solid fa-pen text-blue-500"></i> تعديل
                        </button>
                        <button 
                            onClick={(e) => handleAction(e, onDelete)}
                            className="w-full text-right px-4 py-3 text-xs font-bold text-red-600 hover:bg-red-50 flex items-center gap-3"
                        >
                            <i className="fa-solid fa-trash text-red-500"></i> حذف
                        </button>
                    </div>
                    </>
                )}
            </div>

             {/* Toggle Arrow (Bottom: Under 3-dots button) */}
            <button 
                onClick={toggleExpand}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isExpanded ? 'bg-black/10 text-slate-800 rotate-180' : 'hover:bg-white/40 text-slate-600 hover:text-slate-900'}`}
                title={isExpanded ? "إخفاء التفاصيل" : "عرض التفاصيل"}
            >
                <i className="fa-solid fa-chevron-down text-xs"></i>
            </button>
        </div>
      </div>
      
      {/* Expanded Content */}
      {isExpanded && (
        <div className="mt-4 animate-fade-in border-t border-black/10 pt-4">
            {/* Auto Status Reason */}
            {project.autoStatusReason && (
                <div className="mb-4 bg-white/70 p-3 rounded-xl text-[11px] text-slate-800 border border-white/50 shadow-sm flex items-start gap-2 backdrop-blur-sm">
                    <i className="fa-solid fa-robot mt-0.5 text-blue-600"></i>
                    <div>
                        <span className="font-bold text-blue-800">تحليل الذكاء الاصطناعي: </span>
                        {project.autoStatusReason}
                    </div>
                </div>
            )}

            {/* Location if expanded */}
            <div className={`flex items-center gap-2 text-xs ${style.subTextColor} mb-4 font-bold`}>
                <div className="w-6 h-6 rounded-full bg-white/50 flex items-center justify-center"><i className="fa-solid fa-location-dot"></i></div>
                <span>{project.location || 'الموقع غير محدد'}</span>
            </div>

            {/* Real Progress */}
            <div className="mb-5">
                <div className={`flex justify-between text-xs font-bold ${style.textColor} mb-1.5`}>
                    <span>نسبة الإنجاز المالي</span>
                    <span className="font-mono text-sm">{progress}%</span>
                </div>
                <div className="w-full bg-white/50 h-3 rounded-full overflow-hidden border border-black/5 shadow-inner">
                    <div 
                        className={`h-full rounded-full transition-all duration-1000 ${style.progressColor} shadow-sm relative`} 
                        style={{width: `${Math.min(progress, 100)}%`}}
                    >
                        <div className="absolute top-0 left-0 right-0 h-[1px] bg-white/30"></div>
                    </div>
                </div>
            </div>

            {/* Dates & Info */}
            <div className="space-y-2.5">
                <div className="grid grid-cols-2 gap-2.5 text-xs">
                    <div className="bg-white/60 p-2.5 rounded-xl border border-black/5 shadow-sm">
                        <div className="text-[10px] text-slate-500 mb-1 font-bold">تاريخ الاستلام</div>
                        <div className="font-bold text-slate-800 font-mono text-xs">{project.handoverDate || '-'}</div>
                    </div>
                    <div className="bg-white/60 p-2.5 rounded-xl border border-black/5 shadow-sm">
                        <div className="text-[10px] text-slate-500 mb-1 font-bold">تاريخ النهو</div>
                        <div className="font-bold text-slate-800 font-mono text-xs">{project.completionDate || '-'}</div>
                    </div>
                </div>

                <div className="flex justify-between items-center text-xs pt-3 border-t border-black/10 mt-3">
                    <div className="flex items-center gap-2 text-slate-600 font-bold">
                        <i className="fa-solid fa-hard-hat text-slate-400"></i>
                        <span className="truncate max-w-[120px]" title={project.contractor}>{project.contractor || '---'}</span>
                    </div>
                    <div className="font-mono font-black text-slate-800 bg-white/80 px-3 py-1 rounded-lg border border-black/5 shadow-sm">
                        {new Intl.NumberFormat('en-US', { style: 'decimal', maximumFractionDigits: 0 }).format(parseFloat(project.value || '0'))} ج.م
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default ProjectCard;
