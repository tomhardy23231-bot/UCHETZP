// pages/cabinet/CabinetCalendar.jsx — календарь посещаемости (mobile-first)
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Clock, X, BarChart3, TrendingUp, Sparkles } from 'lucide-react';
import { getMyAttendance } from '../../api/client';
import { useCountUp } from '../../hooks/useCountUp';

const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const formatMonth = (m) => {
  const [year, month] = m.split('-').map(Number);
  return new Date(year, month - 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
};

const CabinetCalendar = () => {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);

  const loadMonth = useCallback(async () => {
    setLoading(true);
    try {
      const [year, mm] = month.split('-');
      const lastDay = new Date(Number(year), Number(mm), 0).getDate();
      const data = await getMyAttendance(`${year}-${mm}-01`, `${year}-${mm}-${String(lastDay).padStart(2, '0')}`);
      setRecords(data);
    } catch (error) {
      console.error('Не удалось загрузить календарь:', error);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    loadMonth();
  }, [loadMonth]);

  // Сетка дней: с понедельничного выравнивания, с padding-ячейками до и после
  const grid = useMemo(() => {
    const [year, mm] = month.split('-').map(Number);
    const first = new Date(year, mm - 1, 1);
    const lastDay = new Date(year, mm, 0).getDate();
    // JS: Sun=0, Mon=1 ... Sat=6. Хотим Пн=0 ... Вс=6.
    const firstWeekday = (first.getDay() + 6) % 7;

    const recordsByDate = {};
    records.forEach((r) => { recordsByDate[r.date] = r; });

    const cells = [];
    // padding до 1-го числа
    for (let i = 0; i < firstWeekday; i++) cells.push({ kind: 'pad', key: `pad-pre-${i}` });
    // дни месяца
    for (let d = 1; d <= lastDay; d++) {
      const dateStr = `${year}-${String(mm).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dow = new Date(year, mm - 1, d).getDay(); // 0=Sun, 6=Sat
      const isWeekend = dow === 0 || dow === 6;
      cells.push({
        kind: 'day',
        key: dateStr,
        date: dateStr,
        dayNum: d,
        isWeekend,
        record: recordsByDate[dateStr],
      });
    }
    // выравниваем хвост до полной недели
    while (cells.length % 7 !== 0) cells.push({ kind: 'pad', key: `pad-post-${cells.length}` });
    return cells;
  }, [month, records]);

  const selected = useMemo(
    () => (selectedDate ? records.find((r) => r.date === selectedDate) : null),
    [selectedDate, records]
  );

  const totalHours = useMemo(
    () => records.reduce((sum, r) => sum + (r.total_hours || 0), 0),
    [records]
  );

  // Метрики для барчарта: только дни с закрытой сменой (есть total_hours)
  const closedShifts = useMemo(
    () => records.filter((r) => r.total_hours != null && r.total_hours > 0),
    [records]
  );

  const stats = useMemo(() => {
    if (closedShifts.length === 0) return { avg: 0, max: 0, maxDate: null };
    const values = closedShifts.map((r) => r.total_hours);
    const max = Math.max(...values);
    const maxRecord = closedShifts.find((r) => r.total_hours === max);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    return { avg, max, maxDate: maxRecord?.date };
  }, [closedShifts]);

  const today = new Date().toISOString().slice(0, 10);

  const changeMonth = (delta) => {
    const [year, mm] = month.split('-').map(Number);
    const next = new Date(year, mm - 1 + delta, 1);
    setMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
    setSelectedDate(null);
  };

  return (
    <div className="space-y-4">
      {/* Месяц-навигация */}
      <div className="flex items-center justify-between bg-white rounded-2xl p-2 shadow-soft border border-slate-100">
        <button
          onClick={() => changeMonth(-1)}
          className="w-11 h-11 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 active:bg-slate-200 transition-soft"
          aria-label="Предыдущий месяц"
        >
          <ChevronLeft size={22} />
        </button>
        <div className="text-center">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Месяц</p>
          <p className="text-base font-black text-slate-800 capitalize">{formatMonth(month)}</p>
        </div>
        <button
          onClick={() => changeMonth(1)}
          className="w-11 h-11 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 active:bg-slate-200 transition-soft"
          aria-label="Следующий месяц"
        >
          <ChevronRight size={22} />
        </button>
      </div>

      {/* График часов по дням */}
      <HoursBarChart
        grid={grid}
        today={today}
        selectedDate={selectedDate}
        onSelectDate={(d) => setSelectedDate(d === selectedDate ? null : d)}
        stats={stats}
        totalHours={totalHours}
        loading={loading}
      />

      {/* Сетка календаря */}
      <div className="bg-white rounded-2xl p-3 shadow-soft border border-slate-100">
        {/* Заголовки дней недели */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {WEEKDAY_LABELS.map((d, i) => (
            <div
              key={d}
              className={`text-center text-[10px] font-black uppercase tracking-widest py-1 ${
                i >= 5 ? 'text-rose-400' : 'text-slate-400'
              }`}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Дни */}
        <div className="grid grid-cols-7 gap-1">
          {grid.map((cell) => {
            if (cell.kind === 'pad') return <div key={cell.key} />;

            const { date, dayNum, isWeekend, record } = cell;
            const isToday = date === today;
            const isSelected = date === selectedDate;
            const hasShift = !!record;
            const isOpenShift = hasShift && record.in_time && !record.out_time;

            return (
              <button
                key={cell.key}
                onClick={() => setSelectedDate(isSelected ? null : date)}
                className={`
                  relative aspect-square rounded-xl flex flex-col items-center justify-center
                  transition-soft active:scale-95
                  ${isSelected
                    ? 'bg-blue-600 text-white shadow-lg ring-2 ring-blue-300'
                    : isToday
                    ? 'bg-blue-50 text-blue-700 ring-2 ring-blue-300'
                    : hasShift && !isOpenShift
                    ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    : isOpenShift
                    ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                    : isWeekend
                    ? 'text-slate-400 hover:bg-slate-50'
                    : 'text-slate-700 hover:bg-slate-50'
                  }
                `}
              >
                <span className="text-sm font-bold">{dayNum}</span>
                {hasShift && (
                  <span className={`mt-0.5 w-1.5 h-1.5 rounded-full ${
                    isSelected ? 'bg-white' : isOpenShift ? 'bg-amber-500' : 'bg-emerald-500'
                  }`} />
                )}
              </button>
            );
          })}
        </div>

        {/* Итог за месяц */}
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
          <span className="font-bold text-slate-400 uppercase tracking-widest">Всего за месяц</span>
          <span className="font-black text-slate-800 text-base">
            {totalHours.toFixed(1)} <span className="text-xs font-bold text-slate-400">ч</span>
          </span>
        </div>
      </div>

      {/* Легенда */}
      <div className="flex flex-wrap gap-3 text-[11px] font-bold text-slate-500 px-2">
        <Legend dotClass="bg-emerald-500" label="Смена закрыта" />
        <Legend dotClass="bg-amber-500" label="Открытая смена" />
        <span className="opacity-60">— нет данных</span>
      </div>

      {/* Детали выбранного дня */}
      {selected && (
        <div className="bg-white rounded-2xl p-4 shadow-soft border border-slate-100 relative">
          <button
            onClick={() => setSelectedDate(null)}
            className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50"
            aria-label="Закрыть"
          >
            <X size={18} />
          </button>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">
            {new Date(selected.date).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <div className="grid grid-cols-3 gap-2 mt-3">
            <DayStat label="Приход" value={selected.in_time || '—'} color="emerald" />
            <DayStat label="Уход" value={selected.out_time || '—'} color="rose" />
            <DayStat label="Часов" value={selected.total_hours != null ? selected.total_hours.toFixed(1) : '—'} color="blue" />
          </div>
        </div>
      )}

      {/* Если ничего нет за месяц */}
      {!loading && records.length === 0 && (
        <div className="bg-white rounded-2xl p-8 shadow-soft border border-slate-100 text-center">
          <Clock size={36} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium text-sm">За этот месяц записей нет</p>
        </div>
      )}
    </div>
  );
};

const Legend = ({ dotClass, label }) => (
  <span className="inline-flex items-center gap-1.5">
    <span className={`w-2 h-2 rounded-full ${dotClass}`} />
    {label}
  </span>
);

const COLOR_TXT = {
  emerald: 'text-emerald-600 bg-emerald-50',
  rose: 'text-rose-600 bg-rose-50',
  blue: 'text-blue-600 bg-blue-50',
};

const DayStat = ({ label, value, color }) => (
  <div className={`rounded-xl p-2.5 ${COLOR_TXT[color]}`}>
    <p className="text-[10px] font-bold uppercase tracking-widest opacity-70">{label}</p>
    <p className="text-base font-black mt-0.5">{value}</p>
  </div>
);

// ============ Барчарт часов по дням ============

const HoursBarChart = ({ grid, today, selectedDate, onSelectDate, stats, totalHours, loading }) => {
  const days = grid.filter((c) => c.kind === 'day');
  // База для нормализации — макс из реальных + 8ч floor (чтоб 9-часовые смены не выглядели "max")
  const scaleMax = Math.max(8, stats.max || 0);

  // Анимированные значения в шапке
  const animAvg = useCountUp(stats.avg || 0);
  const animMax = useCountUp(stats.max || 0);
  const animTotal = useCountUp(totalHours || 0);

  return (
    <div className="bg-white rounded-2xl p-4 shadow-soft border border-slate-100">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BarChart3 size={16} className="text-blue-500" />
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Часы по дням</p>
        </div>
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          макс {scaleMax.toFixed(0)}ч
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <BarStat
          icon={<Sparkles size={12} />}
          label="Среднее"
          value={stats.avg ? animAvg.toFixed(1) : '—'}
          unit="ч/день"
          tone="blue"
        />
        <BarStat
          icon={<TrendingUp size={12} />}
          label="Максимум"
          value={stats.max ? animMax.toFixed(1) : '—'}
          unit={stats.maxDate ? new Date(stats.maxDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : ''}
          tone="emerald"
        />
        <BarStat
          icon={<Clock size={12} />}
          label="Всего"
          value={animTotal.toFixed(1)}
          unit="часов"
          tone="indigo"
        />
      </div>

      {/* Bars */}
      {loading && days.length === 0 ? (
        <div className="h-32 flex items-end gap-[3px] px-1">
          {Array.from({ length: 30 }).map((_, i) => (
            <div key={i} className="flex-1 skeleton" style={{ height: `${30 + (i * 7) % 60}%` }} />
          ))}
        </div>
      ) : (
        <>
          <div className="flex items-end gap-[3px] h-32 px-1">
            {days.map((day) => {
              const hrs = day.record?.total_hours || 0;
              const isOpen = day.record?.in_time && !day.record?.out_time;
              // Открытая смена показывается как полупрозрачный 50%-бар (закроется потом)
              const visualHrs = isOpen ? Math.max(2, scaleMax * 0.4) : hrs;
              const heightPct = (visualHrs / scaleMax) * 100;
              const isToday = day.date === today;
              const isSelected = day.date === selectedDate;
              const hasShift = !!day.record;

              const barClass = isSelected
                ? 'bg-gradient-to-t from-blue-700 to-blue-500'
                : isOpen
                ? 'bg-gradient-to-t from-amber-500 to-amber-300 opacity-70'
                : hasShift
                ? 'bg-gradient-to-t from-emerald-500 to-emerald-300 group-hover:from-emerald-600 group-hover:to-emerald-400'
                : 'bg-slate-200 group-hover:bg-slate-300';

              return (
                <button
                  key={day.key}
                  onClick={() => onSelectDate(day.date)}
                  className="group relative flex-1 flex flex-col justify-end h-full min-w-0 active:scale-95 transition-soft"
                  title={`${day.dayNum}: ${hasShift ? hrs.toFixed(1) + 'ч' : 'нет данных'}`}
                >
                  {/* Сам бар */}
                  <div
                    className={`w-full rounded-t transition-all duration-300 ${barClass} ${
                      isToday && !isSelected ? 'ring-1 ring-blue-400 ring-offset-1' : ''
                    }`}
                    style={{ height: `${Math.max(heightPct, hasShift || isOpen ? 4 : 6)}%` }}
                  />
                  {/* Метка дня снизу — каждый 5-й + 1-й + последний */}
                  {(day.dayNum === 1 || day.dayNum % 5 === 0 || day.dayNum === days.length) && (
                    <span className={`absolute -bottom-4 left-1/2 -translate-x-1/2 text-[9px] font-bold ${
                      isSelected || isToday ? 'text-blue-600' : 'text-slate-400'
                    }`}>
                      {day.dayNum}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {/* Spacer for day labels */}
          <div className="h-5" />
        </>
      )}

      {/* Hint */}
      <p className="text-[10px] text-slate-400 text-center pt-1 border-t border-slate-100 mt-1">
        Тапни столбик — увидишь детали смены
      </p>
    </div>
  );
};

const BAR_STAT_TONES = {
  blue: 'bg-blue-50 text-blue-700 border-blue-100',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-100',
};

const BarStat = ({ icon, label, value, unit, tone }) => (
  <div className={`rounded-xl px-2.5 py-2 border ${BAR_STAT_TONES[tone]}`}>
    <div className="flex items-center gap-1 opacity-70 mb-0.5">
      {icon}
      <span className="text-[9px] font-bold uppercase tracking-widest">{label}</span>
    </div>
    <p className="text-base font-black leading-none">
      {value}
      {unit && <span className="text-[10px] font-medium opacity-70 ml-1">{unit}</span>}
    </p>
  </div>
);

export default CabinetCalendar;
