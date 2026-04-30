// components/TableView.jsx — табличный вид журнала (Linear)
import React from 'react';
import { Calendar, Info } from 'lucide-react';
import Avatar from './ui/Avatar';

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
  selectedMonth,
}) => {
  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="overflow-auto max-h-[calc(100vh-220px)]">
        <table className="w-full border-collapse text-xs">
          {/* Header */}
          <thead className="bg-slate-50 sticky top-0 z-20">
            <tr>
              <th className="sticky left-0 bg-slate-50 z-30 px-2 py-2 text-left font-medium text-slate-500 uppercase tracking-wider border-b border-r border-slate-200 min-w-[64px]">
                День
              </th>
              {employees.map((emp) => (
                <th key={emp.id} colSpan={3} className="px-2 py-2 text-center border-b border-l border-slate-200 min-w-[160px]">
                  <div className="flex flex-col items-center gap-1">
                    <Avatar name={emp.name} size="xs" />
                    <div className="text-[11px] font-medium text-slate-900 truncate max-w-[140px]" title={emp.name}>
                      {emp.name.split(' ').slice(0, 2).join(' ')}
                    </div>
                  </div>
                </th>
              ))}
            </tr>

            {/* Subheader */}
            <tr className="bg-slate-50">
              <th className="sticky left-0 bg-slate-50 z-30 px-2 py-1 border-b border-r border-slate-200" />
              {employees.map((emp) => (
                <React.Fragment key={`${emp.id}-sub`}>
                  <th className="px-1 py-1 text-center text-[10px] font-medium text-emerald-700 uppercase tracking-wider border-b border-l border-slate-200">вход</th>
                  <th className="px-1 py-1 text-center text-[10px] font-medium text-rose-700 uppercase tracking-wider border-b border-slate-200">выход</th>
                  <th className="px-1 py-1 text-center text-[10px] font-medium text-slate-500 uppercase tracking-wider border-b border-slate-200">часы</th>
                </React.Fragment>
              ))}
            </tr>
          </thead>

          <tbody>
            {getDaysInMonth.map(({ date, dayNum, isWeekend }) => (
              <tr key={date}>
                <td className={`sticky left-0 z-10 px-2 py-1.5 border-r border-slate-200 ${isWeekend ? 'bg-rose-50 text-rose-700' : 'bg-white text-slate-700'}`}>
                  <div className="flex flex-col items-center">
                    <span className="font-semibold tabular-nums">{dayNum}</span>
                    <span className="text-[10px] text-slate-400">
                      {new Date(date).toLocaleDateString('ru-RU', { weekday: 'short' })}
                    </span>
                  </div>
                </td>

                {employees.map((emp) => {
                  const record = getRecord(date, emp.name);
                  const draftInTime = draftTimes[getDraftKey(date, emp.id, 'in')];
                  const draftOutTime = draftTimes[getDraftKey(date, emp.id, 'out')];
                  const inTime = draftInTime !== undefined ? draftInTime : (record?.in_time || '');
                  const outTime = draftOutTime !== undefined ? draftOutTime : (record?.out_time || '');
                  const validInTime = isValidHHMM(inTime) ? inTime : null;
                  const validOutTime = isValidHHMM(outTime) ? outTime : null;
                  const duration = calculateDuration(validInTime, validOutTime);
                  const colBg = isWeekend ? 'bg-rose-50/30' : '';

                  return (
                    <React.Fragment key={`${date}-${emp.id}`}>
                      <td className={`px-1 py-0.5 border-l border-slate-200 ${colBg}`}>
                        <input
                          type="text" inputMode="numeric" placeholder="HHMM"
                          value={inTime}
                          onChange={(e) => handleTimeInputChange(date, emp, 'in', e.target.value)}
                          onBlur={(e) => commitTimeChange(date, emp, 'in', e.target.value)}
                          onKeyDown={(e) => handleTimeKeyDown(e, date, emp, 'in')}
                          onPaste={(e) => handlePaste(e, date, emp, 'in')}
                          className="w-full h-6 px-1 text-[11px] font-mono text-center border border-slate-200 rounded bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        />
                      </td>
                      <td className={`px-1 py-0.5 border-l border-slate-200 ${colBg}`}>
                        <input
                          type="text" inputMode="numeric" placeholder="HHMM"
                          value={outTime}
                          onChange={(e) => handleTimeInputChange(date, emp, 'out', e.target.value)}
                          onBlur={(e) => commitTimeChange(date, emp, 'out', e.target.value)}
                          onKeyDown={(e) => handleTimeKeyDown(e, date, emp, 'out')}
                          onPaste={(e) => handlePaste(e, date, emp, 'out')}
                          className="w-full h-6 px-1 text-[11px] font-mono text-center border border-slate-200 rounded bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        />
                      </td>
                      <td className={`px-1 py-0.5 border-l border-slate-200 text-center ${colBg}`}>
                        <div className={`text-[11px] font-mono py-0.5 ${duration ? 'text-emerald-700 font-semibold' : 'text-slate-300'}`}>
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

      <div className="px-3 py-2 border-t border-slate-200 bg-slate-50/60 flex items-center justify-between text-[11px] text-slate-500">
        <div className="flex items-center gap-2">
          <Calendar size={12} />
          <span className="capitalize">{new Date(selectedMonth).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</span>
          <span className="text-slate-300">·</span>
          <span>{employees.length} сотрудников</span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-400">
          <Info size={11} />
          Enter / 4 цифры подряд → автоформат
        </div>
      </div>
    </div>
  );
};

export default TableView;
