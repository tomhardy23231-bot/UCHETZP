// components/EmployeeCard.jsx — карточка сотрудника в журнале (Linear)
import React, { useMemo } from 'react';
import { Briefcase, CheckCircle, XCircle } from 'lucide-react';
import Avatar from './ui/Avatar';

const EmployeeCard = ({
  employee,
  attendanceData,
  draftTimes,
  getDraftKey,
  handleTimeInputChange,
  commitTimeChange,
  handleTimeKeyDown,
  handlePaste,
  isValidHHMM,
  calculateDuration,
  getDaysInMonth,
  getRecord,
  onCardClick,
}) => {
  const today = new Date().toISOString().slice(0, 10);

  const { monthlyTotalHours, dailyChart } = useMemo(() => {
    let totalMinutes = 0;
    const chart = [];
    getDaysInMonth.forEach(({ date, dayNum, isWeekend }) => {
      const draftIn = draftTimes[getDraftKey(date, employee.id, 'in')];
      const draftOut = draftTimes[getDraftKey(date, employee.id, 'out')];
      const record = getRecord(date, employee.name);

      const inTime = draftIn !== undefined ? draftIn : record?.in_time;
      const outTime = draftOut !== undefined ? draftOut : record?.out_time;

      let dayHours = 0;
      if (isValidHHMM(inTime) && isValidHHMM(outTime)) {
        const duration = calculateDuration(inTime, outTime);
        if (duration) {
          const [h, m] = duration.split(':').map(Number);
          dayHours = h + m / 60;
          totalMinutes += h * 60 + m;
        }
      }
      chart.push({ date, dayNum, hours: dayHours, isWeekend });
    });
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return { monthlyTotalHours: hours + minutes / 60, dailyChart: chart };
  }, [getDaysInMonth, attendanceData, draftTimes, employee.id, employee.name, calculateDuration, getDraftKey, getRecord, isValidHHMM]);

  const todayRecord = getRecord(today, employee.name);
  const draftTodayIn = draftTimes[getDraftKey(today, employee.id, 'in')];
  const draftTodayOut = draftTimes[getDraftKey(today, employee.id, 'out')];
  const todayInTime = draftTodayIn !== undefined ? draftTodayIn : todayRecord?.in_time;
  const todayOutTime = draftTodayOut !== undefined ? draftTodayOut : todayRecord?.out_time;
  const isPresent = todayInTime && !todayOutTime;
  const nowHour = new Date().getHours();
  const isUnclosedLate = isPresent && nowHour >= 21;

  return (
    <div
      onClick={() => onCardClick(employee)}
      className="bg-white border border-slate-200 rounded-lg hover:border-slate-300 transition-colors cursor-pointer flex flex-col"
    >
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-2.5 border-b border-slate-100">
        <Avatar name={employee.name} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-slate-900 truncate">{employee.name}</div>
          <div className="text-xs text-slate-500 truncate flex items-center gap-1">
            <Briefcase size={11} />
            {employee.position}
          </div>
        </div>
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
          isUnclosedLate ? 'bg-rose-500 animate-pulse' :
          isPresent ? 'bg-emerald-500 animate-pulse' :
          'bg-slate-300'
        }`} />
      </div>

      {/* Total hours */}
      <div className="px-4 py-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-slate-500 uppercase tracking-wider font-medium">Часов за месяц</span>
          <span className="text-2xl font-semibold text-slate-900 font-mono tabular-nums">
            {monthlyTotalHours.toFixed(1)}
            <span className="text-sm text-slate-400 ml-0.5">ч</span>
          </span>
        </div>

        {/* Mini bar chart */}
        <div className="mt-2.5">
          <div className="flex items-end gap-[1.5px] h-7">
            {dailyChart.map(({ date, hours, isWeekend }) => {
              const heightPct = Math.min(100, (hours / 12) * 100);
              const isToday = date === today;
              let bar = 'bg-slate-200';
              if (hours > 0) bar = isWeekend ? 'bg-rose-300' : 'bg-slate-700';
              return (
                <div
                  key={date}
                  className="flex-1 flex flex-col justify-end h-full"
                  title={`${date}: ${hours > 0 ? hours.toFixed(2) + ' ч' : 'нет'}`}
                >
                  <div
                    className={`w-full rounded-sm ${bar} ${isToday ? 'ring-1 ring-blue-500' : ''}`}
                    style={{ height: hours > 0 ? `${heightPct}%` : '4%', minHeight: '2px' }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Today input */}
      <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/40">
        <div className="text-[11px] text-slate-500 font-medium mb-1.5">
          Сегодня · {new Date(today).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
        </div>
        <div className="flex gap-1.5">
          <div className="flex-1 relative">
            <CheckCircle size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-emerald-500" />
            <input
              type="text" inputMode="numeric" placeholder="HHMM"
              value={draftTimes[getDraftKey(today, employee.id, 'in')] ?? (todayRecord?.in_time || '')}
              onChange={(e) => handleTimeInputChange(today, employee, 'in', e.target.value)}
              onBlur={(e) => commitTimeChange(today, employee, 'in', e.target.value)}
              onKeyDown={(e) => handleTimeKeyDown(e, today, employee, 'in')}
              onPaste={(e) => handlePaste(e, today, employee, 'in')}
              className="w-full pl-6 pr-1.5 h-7 text-xs font-mono border border-slate-200 rounded bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-center"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div className="flex-1 relative">
            <XCircle size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-rose-500" />
            <input
              type="text" inputMode="numeric" placeholder="HHMM"
              value={draftTimes[getDraftKey(today, employee.id, 'out')] ?? (todayRecord?.out_time || '')}
              onChange={(e) => handleTimeInputChange(today, employee, 'out', e.target.value)}
              onBlur={(e) => commitTimeChange(today, employee, 'out', e.target.value)}
              onKeyDown={(e) => handleTimeKeyDown(e, today, employee, 'out')}
              onPaste={(e) => handlePaste(e, today, employee, 'out')}
              className="w-full pl-6 pr-1.5 h-7 text-xs font-mono border border-slate-200 rounded bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-center"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmployeeCard;
