// components/ui/Modal.jsx — единая модалка с backdrop, ESC-закрытием и заголовком.
import React, { useEffect } from 'react';
import ReactDOM from 'react-dom';
import { X } from 'lucide-react';

const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
};

const Modal = ({ open, onClose, title, icon: Icon, size = 'md', children }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        className={`relative bg-white rounded-lg border border-slate-200 shadow-xl w-full ${SIZES[size] || SIZES.md} flex flex-col max-h-[90vh] scale-in`}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || onClose) && (
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
            <div className="flex items-center gap-2 text-slate-900 font-semibold">
              {Icon && <Icon size={18} className="text-slate-500" />}
              {title}
            </div>
            <button
              onClick={onClose}
              className="p-1.5 -mr-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        )}
        <div className="overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body
  );
};

export default Modal;
