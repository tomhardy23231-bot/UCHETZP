// components/AttendanceModal.jsx — модалка с месячной таблицей сотрудника (Linear)
import React from 'react';
import Modal from './ui/Modal';
import Avatar from './ui/Avatar';
import { Briefcase } from 'lucide-react';

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
  if (!employee) return null;

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      size="2xl"
      title={
        <div className="flex items-center gap-2.5">
          <Avatar name={employee.name} size="sm" />
          <div>
            <div className="text-sm font-semibold">{employee.name}</div>
            <div className="text-[11px] text-slate-500 flex items-center gap-1 font-normal">
              <Briefcase size={10} /> {employee.position}
            </div>
          </div>
        </div>
      }
    >
      <div className="p-3">
        <ul className="divide-y divide-slate-100">
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
              <li
                key={date}
                className={`flex items-center gap-3 py-1.5 px-2 ${isWeekend ? 'bg-rose-50/40' : ''}`}
              >
                <div className={`w-12 text-center flex-shrink-0 ${isWeekend ? 'text-rose-600' : 'text-slate-700'}`}>
                  <div className="text-sm font-semibold tabular-nums">{dayNum}</div>
                  <div className="text-[10px] text-slate-400">
                    {new Date(date).toLocaleDateString('ru-RU', { weekday: 'short' })}
                  </div>
                </div>
                <input
                  type="text" inputMode="numeric" placeholder="вход"
                  value={inTime}
                  onChange={(e) => handleTimeInputChange(date, employee, 'in', e.target.value)}
                  onBlur={(e) => commitTimeChange(date, employee, 'in', e.target.value)}
                  onKeyDown={(e) => handleTimeKeyDown(e, date, employee, 'in')}
                  onPaste={(e) => handlePaste(e, date, employee, 'in')}
                  className="w-20 h-8 px-2 text-sm font-mono text-center border border-slate-200 rounded bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
                <input
                  type="text" inputMode="numeric" placeholder="выход"
                  value={outTime}
                  onChange={(e) => handleTimeInputChange(date, employee, 'out', e.target.value)}
                  onBlur={(e) => commitTimeChange(date, employee, 'out', e.target.value)}
                  onKeyDown={(e) => handleTimeKeyDown(e, date, employee, 'out')}
                  onPaste={(e) => handlePaste(e, date, employee, 'out')}
                  className="w-20 h-8 px-2 text-sm font-mono text-center border border-slate-200 rounded bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
                <div className={`flex-1 text-right text-sm font-mono ${duration ? 'text-emerald-700 font-semibold' : 'text-slate-300'}`}>
                  {duration || '—'}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </Modal>
  );
};

export default AttendanceModal;
