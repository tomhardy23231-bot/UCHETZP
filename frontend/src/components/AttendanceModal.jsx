// components/AttendanceModal.jsx
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { X, Calendar, Clock, CheckCircle, XCircle, Camera } from 'lucide-react';

const AttendanceModal = ({
  employee,
  isOpen,
  onClose,
  getDaysInMonth,
  getRecord,
  draftTimes,
  getDraftKey,
  handleTimeInputChange,
  commitTimeChange,
  handleTimeKeyDown,
  handlePaste,
  isValidHHMM,
  calculateDuration,
}) => {
  const [selectedPhoto, setSelectedPhoto] = useState(null);

  useEffect(() => {
    const handleEsc = (event) => {
      if (event.keyCode === 27) {
        if (selectedPhoto) setSelectedPhoto(null);
        else onClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('keydown', handleEsc);
    };
  }, [onClose, selectedPhoto]);

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <>
      <div
        className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm z-40 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div
          className="bg-slate-50 rounded-2xl shadow-soft-xl w-full max-w-2xl max-h-[90vh] flex flex-col scale-in"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal Header */}
          <div className="p-4 sm:p-6 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-slate-800">{employee.name}</h2>
              <p className="text-slate-500">{employee.position}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-slate-200 transition-soft-fast text-slate-600"
            >
              <X size={24} />
            </button>
          </div>

          {/* Modal Body */}
          <div className="overflow-y-auto p-4 sm:p-6">
            <div className="space-y-2">
              {getDaysInMonth.map(({ date, dayNum, isWeekend }) => {
                const record = getRecord(date, employee.name);
                const draftIn = draftTimes[getDraftKey(date, employee.id, 'in')];
                const draftOut = draftTimes[getDraftKey(date, employee.id, 'out')];

                const inTime = draftIn !== undefined ? draftIn : (record?.in_time || '');
                const outTime = draftOut !== undefined ? draftOut : (record?.out_time || '');

                const validInTime = isValidHHMM(inTime) ? inTime : null;
                const validOutTime = isValidHHMM(outTime) ? outTime : null;
                const duration = calculateDuration(validInTime, validOutTime);

                return (
                  <div
                    key={date}
                    className={`
                      p-3 rounded-xl grid grid-cols-12 gap-2 items-center
                      ${isWeekend ? 'bg-rose-100/50' : 'bg-white'}
                    `}
                  >
                    <div className="col-span-2 flex flex-col items-center justify-center">
                      <p className={`font-bold text-lg ${isWeekend ? 'text-rose-600' : 'text-slate-800'}`}>{dayNum}</p>
                      <p className="text-xs text-slate-500">{new Date(date).toLocaleDateString('ru-RU', { weekday: 'short' })}</p>
                    </div>

                    <div className="col-span-7 grid grid-cols-2 gap-2">
                      <div className="relative">
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="Вход"
                          value={inTime}
                          onChange={(e) => handleTimeInputChange(date, employee, 'in', e.target.value)}
                          onBlur={(e) => commitTimeChange(date, employee, 'in', e.target.value)}
                          onKeyDown={(e) => handleTimeKeyDown(e, date, employee, 'in')}
                          onPaste={(e) => handlePaste(e, date, employee, 'in')}
                          className="w-full pl-8 pr-2 py-2 text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 text-center bg-white shadow-soft focus:shadow-soft-lg transition-soft"
                        />
                        <CheckCircle size={16} className="absolute left-2 top-1/2 -translate-y-1/2 text-emerald-500" />
                      </div>
                       <div className="relative">
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="Выход"
                          value={outTime}
                          onChange={(e) => handleTimeInputChange(date, employee, 'out', e.target.value)}
                          onBlur={(e) => commitTimeChange(date, employee, 'out', e.target.value)}
                          onKeyDown={(e) => handleTimeKeyDown(e, date, employee, 'out')}
                          onPaste={(e) => handlePaste(e, date, employee, 'out')}
                          className="w-full pl-8 pr-2 py-2 text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-rose-500 focus:border-rose-500 text-center bg-white shadow-soft focus:shadow-soft-lg transition-soft"
                        />
                        <XCircle size={16} className="absolute left-2 top-1/2 -translate-y-1/2 text-rose-500" />
                      </div>
                    </div>

                    <div className="col-span-2 flex items-center justify-center">
                      <div className={`text-sm font-bold rounded-lg p-2 w-full text-center ${duration ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-400'}`}>
                        {duration || '—'}
                      </div>
                    </div>

                    <div className="col-span-1 flex items-center justify-center">
                      {record?.photo_base64 ? (
                        <button 
                          onClick={() => setSelectedPhoto(record.photo_base64)}
                          className="w-10 h-10 rounded-lg overflow-hidden border border-slate-200 shadow-soft hover:shadow-soft-lg transition-soft"
                        >
                          <img src={record.photo_base64} alt="Scan" className="w-full h-full object-cover" />
                        </button>
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-300">
                          <Camera size={18} />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Photo Modal Preview */}
      {selectedPhoto && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-[60] flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setSelectedPhoto(null)}
        >
          <div className="relative max-w-3xl w-full">
            <button 
              className="absolute -top-12 right-0 p-2 text-white hover:text-slate-300 transition-colors"
              onClick={() => setSelectedPhoto(null)}
            >
              <X size={32} />
            </button>
            <img 
              src={selectedPhoto} 
              alt="Large scan" 
              className="w-full h-auto rounded-2xl shadow-2xl border-4 border-white/10"
            />
          </div>
        </div>
      )}
    </>,
    document.body
  );
};

export default AttendanceModal;