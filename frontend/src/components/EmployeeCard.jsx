// components/EmployeeCard.jsx
import React, { useMemo } from 'react';
import { Clock, Briefcase, ChevronRight, CheckCircle, XCircle } from 'lucide-react';

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
  getAvatarColor,
  selectedMonth,
  getDaysInMonth,
  getRecord,
  onCardClick,
}) => {
  const today = new Date().toISOString().slice(0, 10);

  // Считаем общие часы за месяц + готовим данные для мини-графика по дням
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

  return (
    <div
      onClick={() => onCardClick(employee)}
      className="bg-slate-50 rounded-2xl shadow-soft hover:shadow-soft-lg transition-soft-fast cursor-pointer flex flex-col justify-between"
    >
      {/* Card Header */}
      <div className="p-4 border-b border-slate-200/60">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 ${getAvatarColor(employee.name)} rounded-full flex items-center justify-center text-white text-xl font-bold`}>
            {employee.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-slate-800 text-base truncate">{employee.name}</h3>
            <p className="text-slate-500 text-sm flex items-center gap-1.5">
              <Briefcase size={14} />
              <span className="truncate">{employee.position}</span>
            </p>
          </div>
          <div className={`w-3 h-3 rounded-full ${isPresent ? 'bg-emerald-500' : 'bg-slate-400'}`}></div>
        </div>
      </div>

      {/* Monthly Summary */}
      <div className="p-4 flex-grow flex flex-col items-center justify-center">
        <p className="text-slate-500 text-sm">Часов за месяц</p>
        <p className="text-5xl font-black text-slate-800 tracking-tighter">
          {monthlyTotalHours.toFixed(1)}<span className="text-3xl font-bold text-slate-400">h</span>
        </p>

        {/* Mini bar chart по дням месяца */}
        <div className="w-full mt-3 px-1">
          <div className="flex items-end gap-[2px] h-10">
            {dailyChart.map(({ date, hours, isWeekend }) => {
              // 12 часов = 100% высоты бара
              const heightPct = Math.min(100, (hours / 12) * 100);
              const isToday = date === today;
              let barColor = 'bg-slate-200';
              if (hours > 0) {
                barColor = isWeekend ? 'bg-rose-400' : 'bg-emerald-500';
              }
              return (
                <div
                  key={date}
                  className="flex-1 flex flex-col justify-end h-full"
                  title={`${date}: ${hours > 0 ? hours.toFixed(2) + ' ч' : 'нет данных'}`}
                >
                  <div
                    className={`w-full rounded-sm transition-all ${barColor} ${isToday ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}
                    style={{ height: hours > 0 ? `${heightPct}%` : '6%', minHeight: '2px' }}
                  ></div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium mt-1">
            <span>1</span>
            <span>{dailyChart.length}</span>
          </div>
        </div>
      </div>

      {/* Today Quick Entry */}
      <div className="bg-white/70 p-4 rounded-b-2xl border-t border-slate-200/60">
        <p className="text-sm font-bold text-slate-700 mb-2 text-center">Сегодня, {new Date(today).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</p>
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              type="text"
              inputMode="numeric"
              placeholder="Вход"
              value={draftTimes[getDraftKey(today, employee.id, 'in')] ?? (todayRecord?.in_time || '')}
              onChange={(e) => handleTimeInputChange(today, employee, 'in', e.target.value)}
              onBlur={(e) => commitTimeChange(today, employee, 'in', e.target.value)}
              onKeyDown={(e) => handleTimeKeyDown(e, today, employee, 'in')}
              onPaste={(e) => handlePaste(e, today, employee, 'in')}
              className="w-full pl-8 pr-2 py-2 text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 text-center bg-white shadow-soft focus:shadow-soft-lg transition-soft"
              onClick={(e) => e.stopPropagation()}
            />
            <CheckCircle size={16} className="absolute left-2 top-1/2 -translate-y-1/2 text-emerald-500" />
          </div>
          <div className="flex-1 relative">
            <input
              type="text"
              inputMode="numeric"
              placeholder="Выход"
              value={draftTimes[getDraftKey(today, employee.id, 'out')] ?? (todayRecord?.out_time || '')}
              onChange={(e) => handleTimeInputChange(today, employee, 'out', e.target.value)}
              onBlur={(e) => commitTimeChange(today, employee, 'out', e.target.value)}
              onKeyDown={(e) => handleTimeKeyDown(e, today, employee, 'out')}
              onPaste={(e) => handlePaste(e, today, employee, 'out')}
              className="w-full pl-8 pr-2 py-2 text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-rose-500 focus:border-rose-500 text-center bg-white shadow-soft focus:shadow-soft-lg transition-soft"
              onClick={(e) => e.stopPropagation()}
            />
            <XCircle size={16} className="absolute left-2 top-1/2 -translate-y-1/2 text-rose-500" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmployeeCard;