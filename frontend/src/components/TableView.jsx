// components/TableView.jsx
import React from 'react';
import { Calendar, Clock, UserCheck, UserX, Info, UserRound } from 'lucide-react';

const TableView = ({
  employees,
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
  getAvatarColor,
  selectedMonth,
}) => {
  return (
    <div className="bg-white rounded-2xl shadow-soft overflow-hidden">
      <div className="overflow-auto max-h-[calc(100vh-200px)]">
        <table className="w-full border-collapse text-xs">
          {/* Header - Employees */}
          <thead className="bg-slate-50 sticky top-0 z-20">
            <tr>
              <th className="sticky left-0 bg-slate-50 z-30 px-3 py-3 text-left font-semibold text-slate-700 border-b-2 border-r border-slate-200 min-w-[80px]">
                <div className="flex items-center gap-1.5">
                  <Calendar size={14} className="text-blue-600" />
                  Дата
                </div>
              </th>

              {employees.map((emp, empIndex) => (
                <th key={emp.id} colSpan={3} className={`px-2 py-3 text-center font-semibold text-slate-700 border-b-2 border-l border-slate-200 min-w-[170px] ${empIndex % 2 === 0 ? 'bg-slate-50' : 'bg-blue-50'}`}>
                  <div className="flex flex-col items-center gap-1">
                    <div className={`w-6 h-6 ${getAvatarColor(emp.name)} rounded-full flex items-center justify-center text-white text-xs font-bold`}>
                      {emp.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                    </div>
                    <div className="truncate text-xs font-medium" title={emp.name}>{emp.name}</div>
                    <div className="text-xs text-slate-500 truncate max-w-[120px]">{emp.position}</div>
                  </div>
                </th>
              ))}
            </tr>

            {/* Subheader - In | Out | Time */}
            <tr className="bg-slate-50">
              <th className="sticky left-0 bg-slate-50 z-30 px-3 py-2 text-left font-medium text-slate-600 border-b border-r border-slate-200"></th>
              {employees.map((emp, empIndex) => (
                <React.Fragment key={`${emp.id}-sub`}>
                  <th className={`px-1 py-2 text-center text-xs font-medium text-emerald-700 border-b border-l border-slate-200 ${empIndex % 2 === 0 ? 'bg-slate-50' : 'bg-blue-50'}`}>
                    <div className="flex flex-col items-center">
                      <UserCheck size={12} />
                      <span>Вход</span>
                    </div>
                  </th>
                  <th className={`px-1 py-2 text-center text-xs font-medium text-rose-700 border-b border-slate-200 ${empIndex % 2 === 0 ? 'bg-slate-50' : 'bg-blue-50'}`}>
                    <div className="flex flex-col items-center">
                      <UserX size={12} />
                      <span>Выход</span>
                    </div>
                  </th>
                  <th className={`px-1 py-2 text-center text-xs font-medium text-indigo-700 border-b border-slate-200 ${empIndex % 2 === 0 ? 'bg-slate-50' : 'bg-blue-50'}`}>
                    <div className="flex flex-col items-center">
                      <Clock size={12} />
                      <span>Часы</span>
                    </div>
                  </th>
                </React.Fragment>
              ))}
            </tr>
          </thead>

          <tbody>
            {getDaysInMonth.map(({ date, dayNum, isWeekend }) => (
              <tr key={date}>
                {/* Date Cell */}
                <td className={`sticky left-0 z-10 px-3 py-2.5 font-medium border-r border-slate-200 text-sm ${isWeekend ? 'bg-rose-100 text-rose-800' : 'bg-white text-slate-900'}`}>
                  <div className="flex flex-col items-center">
                    <span className="font-bold">{dayNum}</span>
                    <span className="text-xs text-slate-500 mt-0.5">
                      {new Date(date).toLocaleDateString('ru-RU', { weekday: 'short' })}
                    </span>
                  </div>
                </td>

                {/* Cells for each employee */}
                {employees.map((emp, empIndex) => {
                  const record = getRecord(date, emp.name);

                  const draftInTime = draftTimes[getDraftKey(date, emp.id, 'in')];
                  const draftOutTime = draftTimes[getDraftKey(date, emp.id, 'out')];

                  const inTime = draftInTime !== undefined ? draftInTime : (record?.in_time || '');
                  const outTime = draftOutTime !== undefined ? draftOutTime : (record?.out_time || '');

                  // Ensure time is valid HH:MM for calculation
                  const validInTime = isValidHHMM(inTime) ? inTime : null;
                  const validOutTime = isValidHHMM(outTime) ? outTime : null;

                  const duration = calculateDuration(validInTime, validOutTime);

                  // Background color for employee column
                  const colBg = empIndex % 2 === 0
                    ? (isWeekend ? 'bg-rose-50' : 'bg-white')
                    : (isWeekend ? 'bg-rose-100' : 'bg-blue-50');

                  return (
                    <React.Fragment key={`${date}-${emp.id}`}>
                      {/* In - Check-in */}
                      <td className={`px-1 py-1 border-l border-slate-200 text-center ${colBg}`}>
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="HHMM"
                          value={draftTimes[getDraftKey(date, emp.id, 'in')] ?? (record?.in_time || '')}
                          onChange={(e) => handleTimeInputChange(date, emp, 'in', e.target.value)}
                          onBlur={(e) => commitTimeChange(date, emp, 'in', e.target.value)}
                          onKeyDown={(e) => handleTimeKeyDown(e, date, emp, 'in')}
                          onPaste={(e) => handlePaste(e, date, emp, 'in')}
                          className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 text-center bg-white shadow-soft focus:shadow-soft-lg transition-soft"
                          step="60"
                        />
                      </td>

                      {/* Out - Check-out */}
                      <td className={`px-1 py-1 border-l border-slate-200 text-center ${colBg}`}>
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="HHMM"
                          value={draftTimes[getDraftKey(date, emp.id, 'out')] ?? (record?.out_time || '')}
                          onChange={(e) => handleTimeInputChange(date, emp, 'out', e.target.value)}
                          onBlur={(e) => commitTimeChange(date, emp, 'out', e.target.value)}
                          onKeyDown={(e) => handleTimeKeyDown(e, date, emp, 'out')}
                          onPaste={(e) => handlePaste(e, date, emp, 'out')}
                          className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-rose-500 focus:border-rose-500 text-center bg-white shadow-soft focus:shadow-soft-lg transition-soft"
                          step="60"
                        />
                      </td>

                      {/* Time - Duration */}
                      <td className={`px-1 py-1 border-l border-slate-200 text-center ${colBg}`}>
                        <div className={`text-xs font-medium rounded-lg p-1.5 ${duration ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-400'}`}>
                          {duration || '—'}
                        </div>
                      </td>
                    </React.Fragment>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Info Footer - Modern Soft UI */}
      <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap justify-between items-center gap-3 text-sm">
        <div className="flex items-center gap-2 text-slate-600 font-medium">
          <Calendar size={16} className="text-blue-600" />
          <span>{new Date(selectedMonth).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</span>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <span className="flex items-center gap-1.5 text-slate-600">
            <UserRound size={14} className="text-slate-500" />
            <span className="font-medium">{employees.length}</span> сотрудников
          </span>

          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full"></span>
            <span className="text-slate-600">Вход</span>
          </span>

          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-rose-500 rounded-full"></span>
            <span className="text-slate-600">Выход</span>
          </span>

          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-indigo-500 rounded-full"></span>
            <span className="text-slate-600">Часы</span>
          </span>

          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-rose-200 rounded-full"></span>
            <span className="text-slate-600">Выходной</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Info size={16} className="text-blue-500" />
          <span className="text-slate-500 text-xs">
            Нажмите Enter после ввода времени или вставьте 4 цифры (1518 → 15:18)
          </span>
        </div>
      </div>
    </div>
  );
};

export default TableView;