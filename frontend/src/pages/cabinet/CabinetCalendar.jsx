// pages/cabinet/CabinetCalendar.jsx — календарь посещаемости (mobile-first)
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Clock, X } from 'lucide-react';
import { getMyAttendance } from '../../api/client';

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

export default CabinetCalendar;
