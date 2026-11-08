
import React from 'react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  type?: 'danger' | 'warning' | 'info';
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({ 
  isOpen, 
  title, 
  message, 
  confirmText = "نعم، حذف", 
  cancelText = "إلغاء", 
  onConfirm, 
  onCancel,
  type = 'danger'
}) => {
  if (!isOpen) return null;

  const colors = {
    danger: { bg: 'bg-red-50', iconBg: 'bg-red-100', iconColor: 'text-red-600', btn: 'bg-red-600 hover:bg-red-700' },
    warning: { bg: 'bg-yellow-50', iconBg: 'bg-yellow-100', iconColor: 'text-yellow-600', btn: 'bg-yellow-600 hover:bg-yellow-700' },
    info: { bg: 'bg-blue-50', iconBg: 'bg-blue-100', iconColor: 'text-blue-600', btn: 'bg-blue-600 hover:bg-blue-700' }
  };

  const style = colors[type];

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-scale-in border border-slate-200">
        <div className="p-6 text-center">
          <div className={`w-16 h-16 ${style.iconBg} ${style.iconColor} rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm text-2xl`}>
            <i className={`fa-solid ${type === 'danger' ? 'fa-trash-can' : 'fa-triangle-exclamation'}`}></i>
          </div>
          <h3 className="text-lg font-bold text-slate-800 mb-2">{title}</h3>
          <p className="text-sm text-slate-500 leading-relaxed font-medium mb-6">
            {message}
          </p>
          
          <div className="flex gap-3">
            <button 
              onClick={onConfirm} 
              className={`flex-1 ${style.btn} text-white py-3 rounded-xl font-bold shadow-lg transition transform active:scale-95 flex items-center justify-center gap-2`}
            >
              {type === 'danger' && <i className="fa-solid fa-trash"></i>}
              {confirmText}
            </button>
            <button 
              onClick={onCancel} 
              className="flex-1 bg-slate-100 text-slate-700 py-3 rounded-xl font-bold hover:bg-slate-200 transition"
            >
              {cancelText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
