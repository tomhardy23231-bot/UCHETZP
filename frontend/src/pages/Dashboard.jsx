// pages/Dashboard.jsx - Sleek Dark Mode / Glassmorphism
import React, { useState, useEffect, useMemo } from 'react';
import { Clock, UserCheck, UserX, LogOut, UserRoundCheck, UserRoundX, UsersRound, Timer, CheckCheck, AlertTriangle, AlarmClock } from 'lucide-react';
import { useTodayAttendance } from '../context/TodayAttendanceContext';
import { getAttendanceJournal } from '../api/client';

// Стандартное время начала рабочего дня — после которого считаем опозданием.
// Если у тебя другое — поменяй здесь.
const LATE_THRESHOLD_HOUR = 9;
const LATE_THRESHOLD_MIN = 0;

// Если у сотрудника есть приход без ухода и уже позже этого часа — подсвечиваем красным
const UNCLOSED_SHIFT_ALERT_HOUR = 21;

const Dashboard = () => {
  const { attendance } = useTodayAttendance();
  const [weekJournal, setWeekJournal] = useState([]);
  const [now, setNow] = useState(() => new Date());

  // обновляем "текущее время" раз в минуту, чтобы подсветка незакрытых смен реагировала на 21:00
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Подгружаем последние 7 дней для топа опоздавших
  useEffect(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 6);
    const fmt = (d) => d.toISOString().slice(0, 10);
    getAttendanceJournal(fmt(start), fmt(end))
      .then(setWeekJournal)
      .catch((e) => console.error('Не удалось загрузить журнал недели:', e));
  }, []);

  // Топ-3 опоздавших за неделю
  const topLate = useMemo(() => {
    const counter = new Map();
    weekJournal.forEach((r) => {
      if (!r.in_time) return;
      const [h, m] = r.in_time.split(':').map(Number);
      const isLate =
        h > LATE_THRESHOLD_HOUR ||
        (h === LATE_THRESHOLD_HOUR && m > LATE_THRESHOLD_MIN);
      if (!isLate) return;
      const key = r.employee_name;
      const minutesLate = (h * 60 + m) - (LATE_THRESHOLD_HOUR * 60 + LATE_THRESHOLD_MIN);
      const cur = counter.get(key) || { name: key, count: 0, totalMinutes: 0 };
      cur.count += 1;
      cur.totalMinutes += minutesLate;
      counter.set(key, cur);
    });
    return Array.from(counter.values())
      .sort((a, b) => b.count - a.count || b.totalMinutes - a.totalMinutes)
      .slice(0, 3);
  }, [weekJournal]);

  // Format time
  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  };

  // Calculate shift duration
  const calculateDuration = (inTime, outTime) => {
    if (!outTime) return null;
    const diff = new Date(outTime) - new Date(inTime);
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    return `${hours}ч ${minutes}м`;
  };

  // Get status icon
  const getStatusIcon = (record) => {
    if (!record.out_time) {
      return <UserRoundCheck size={20} className="text-emerald-400" />;
    }
    return <UserRoundX size={20} className="text-slate-500" />;
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 text-slate-800">
      {/* Background Ambient Glows - Subtle for light theme */}
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-500/5 rounded-full blur-[120px]" />
      </div>

      {/* Header - Modern Minimalist */}
      <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-5xl font-black text-slate-900 tracking-tight mb-2">
            Дашборд <span className="text-blue-600 text-lg font-medium align-top ml-1">Live</span>
          </h1>
          <p className="text-slate-500 flex items-center gap-2 font-medium">
            <Clock size={18} className="text-blue-500" />
            {new Date().toLocaleDateString('ru-RU', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          </p>
        </div>
      </div>

      {/* Stats Cards Grid - Soft UI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        {/* Total Records */}
        <div className="relative group overflow-hidden bg-white border border-slate-100 rounded-2xl p-6 transition-soft shadow-soft hover:shadow-soft-lg">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <UsersRound size={64} className="text-blue-500" />
          </div>
          <div className="relative">
            <p className="text-slate-500 text-sm font-semibold uppercase tracking-wider mb-1">Всего записей</p>
            <p className="text-4xl font-black text-slate-900 mb-2">{attendance.length}</p>
            <div className="flex items-center gap-1.5 text-xs text-blue-600 font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
              АКТИВНОСТЬ
            </div>
          </div>
        </div>

        {/* Currently Working */}
        <div className="relative group overflow-hidden bg-white border border-slate-100 rounded-2xl p-6 transition-soft shadow-soft hover:shadow-soft-lg">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <UserRoundCheck size={64} className="text-emerald-500" />
          </div>
          <div className="relative">
            <p className="text-slate-500 text-sm font-semibold uppercase tracking-wider mb-1">На работе</p>
            <p className="text-4xl font-black text-emerald-600 mb-2">{attendance.filter(r => !r.out_time).length}</p>
            <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              В ОФИСЕ
            </div>
          </div>
        </div>

        {/* Left Work */}
        <div className="relative group overflow-hidden bg-white border border-slate-100 rounded-2xl p-6 transition-soft shadow-soft hover:shadow-soft-lg">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <UserRoundX size={64} className="text-slate-400" />
          </div>
          <div className="relative">
            <p className="text-slate-500 text-sm font-semibold uppercase tracking-wider mb-1">Ушли</p>
            <p className="text-4xl font-black text-slate-700 mb-2">{attendance.filter(r => r.out_time).length}</p>
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-bold">
              ЗАВЕРШЕНО
            </div>
          </div>
        </div>

        {/* Average Duration */}
        <div className="relative group overflow-hidden bg-white border border-slate-100 rounded-2xl p-6 transition-soft shadow-soft hover:shadow-soft-lg">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Timer size={64} className="text-indigo-500" />
          </div>
          <div className="relative">
            <p className="text-slate-500 text-sm font-semibold uppercase tracking-wider mb-1">Средняя смена</p>
            <p className="text-4xl font-black text-indigo-600 mb-2">
              {attendance.filter(r => r.out_time).length > 0
                ? (() => {
                    const durations = attendance.filter(r => r.out_time).map(r => {
                      const diff = new Date(r.out_time) - new Date(r.in_time);
                      return diff / 3600000;
                    });
                    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
                    return avg.toFixed(1) + 'ч';
                  })()
                : '—'}
            </p>
            <div className="flex items-center gap-1.5 text-xs text-indigo-600 font-bold">
              ЭФФЕКТИВНОСТЬ
            </div>
          </div>
        </div>
      </div>

      {/* Топ-3 опоздавших за неделю */}
      {topLate.length > 0 && (
        <div className="bg-white border border-slate-100 rounded-2xl p-6 mb-6 shadow-soft">
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <AlarmClock size={20} className="text-amber-500" />
            Топ опоздавших за 7 дней
            <span className="text-xs font-medium text-slate-400 ml-1">
              (опоздание = после {String(LATE_THRESHOLD_HOUR).padStart(2,'0')}:{String(LATE_THRESHOLD_MIN).padStart(2,'0')})
            </span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {topLate.map((p, idx) => {
              const palette = ['from-amber-500 to-orange-600', 'from-slate-400 to-slate-500', 'from-orange-400 to-amber-500'];
              const totalH = Math.floor(p.totalMinutes / 60);
              const totalM = p.totalMinutes % 60;
              return (
                <div key={p.name} className="relative bg-slate-50 rounded-2xl p-4 flex items-center gap-4 overflow-hidden">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${palette[idx]} text-white font-black text-xl flex items-center justify-center shadow-soft`}>
                    {idx + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-slate-800 truncate">{p.name}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      <span className="font-bold text-rose-500">{p.count}</span> опозданий • суммарно{' '}
                      <span className="font-bold">{totalH > 0 ? `${totalH}ч ` : ''}{totalM}м</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Attendance Table Container - Soft UI Card */}
      <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-soft">
        <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-3">
            <span className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center border border-blue-200">
              <CheckCheck size={22} className="text-blue-600" />
            </span>
            Посещаемость сегодня
          </h2>
          <div className="text-xs font-bold text-slate-400 tracking-[0.2em] uppercase">
            Обновлено: {new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-8 py-5 text-left text-xs font-bold text-slate-500 uppercase tracking-[0.1em]">
                  Сотрудник
                </th>
                <th className="px-8 py-5 text-left text-xs font-bold text-slate-500 uppercase tracking-[0.1em]">
                  Приход
                </th>
                <th className="px-8 py-5 text-left text-xs font-bold text-slate-500 uppercase tracking-[0.1em]">
                  Уход
                </th>
                <th className="px-8 py-5 text-left text-xs font-bold text-slate-500 uppercase tracking-[0.1em]">
                  Длительность
                </th>
                <th className="px-8 py-5 text-left text-xs font-bold text-slate-500 uppercase tracking-[0.1em]">
                  Статус
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {attendance.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-8 py-20 text-center">
                    <div className="inline-flex flex-col items-center">
                      <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6 border border-slate-100">
                        <UserRoundCheck size={36} className="text-slate-300" />
                      </div>
                      <p className="text-xl font-bold text-slate-900 mb-2">Ещё никто не пришёл</p>
                      <p className="text-slate-500 max-w-[200px] text-sm">Ожидайте первых отметок в системе журнала</p>
                    </div>
                  </td>
                </tr>
              ) : (
                attendance.map((record) => {
                  const isUnclosedLate =
                    !record.out_time && now.getHours() >= UNCLOSED_SHIFT_ALERT_HOUR;
                  return (
                  <tr
                    key={record.id}
                    className={`
                      group transition-soft
                      ${isUnclosedLate
                        ? 'bg-rose-50 ring-1 ring-rose-200'
                        : !record.out_time
                          ? 'bg-emerald-50/50'
                          : 'hover:bg-slate-50'}
                    `}
                  >
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center border font-bold text-sm transition-soft ${
                          isUnclosedLate
                          ? 'bg-rose-100 border-rose-300 text-rose-600 shadow-soft'
                          : !record.out_time
                          ? 'bg-emerald-100 border-emerald-200 text-emerald-600 shadow-soft'
                          : 'bg-slate-100 border-slate-200 text-slate-500'
                        }`}>
                          {record.employee_name.charAt(0).toUpperCase()}
                        </div>
                        <div className={`font-bold transition-colors ${isUnclosedLate ? 'text-rose-700' : 'text-slate-800 group-hover:text-blue-600'}`}>
                          {record.employee_name}
                          {isUnclosedLate && (
                            <span className="block text-xs font-bold text-rose-500 uppercase tracking-wider mt-0.5">
                              ⚠ смена не закрыта
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-2.5 text-slate-600 font-medium">
                        <Clock size={16} className="text-blue-500/70" />
                        {formatTime(record.in_time)}
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      {record.out_time ? (
                        <div className="flex items-center gap-2.5 text-slate-600 font-medium">
                          <Clock size={16} className="text-slate-400" />
                          {formatTime(record.out_time)}
                        </div>
                      ) : (
                        <span className="text-slate-300 tracking-widest">---</span>
                      )}
                    </td>
                    <td className="px-8 py-5">
                      <span className={`px-3 py-1 rounded-lg text-sm font-bold ${
                        record.out_time ? 'bg-slate-100 text-slate-600' : 'text-slate-500'
                      }`}>
                        {calculateDuration(record.in_time, record.out_time) || 'В процессе'}
                      </span>
                    </td>
                    <td className="px-8 py-5">
                      {isUnclosedLate ? (
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-rose-100 border border-rose-300 text-rose-600 rounded-full text-xs font-black uppercase tracking-wider">
                          <AlertTriangle size={14} className="text-rose-500" />
                          Не закрыта
                        </div>
                      ) : !record.out_time ? (
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-emerald-100 border border-emerald-200 text-emerald-600 rounded-full text-xs font-black uppercase tracking-wider">
                          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.3)]"></span>
                          На работе
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-slate-100 border border-slate-200 text-slate-500 rounded-full text-xs font-black uppercase tracking-wider">
                          <CheckCheck size={14} className="text-slate-400" />
                          Ушёл
                        </div>
                      )}
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Statistics Footer */}
        {attendance.length > 0 && (
          <div className="px-8 py-5 bg-slate-50/50 border-t border-slate-100">
            <div className="flex flex-wrap gap-8 text-[11px] font-black uppercase tracking-[0.2em]">
              <div className="flex items-center gap-2.5 text-blue-600">
                <UsersRound size={16} className="opacity-70" />
                <span className="text-slate-900 text-sm">{attendance.length}</span> записей
              </div>
              <div className="flex items-center gap-2.5 text-emerald-600">
                <UserRoundCheck size={16} className="opacity-70" />
                <span className="text-slate-900 text-sm">{attendance.filter(r => !r.out_time).length}</span> на работе
              </div>
              <div className="flex items-center gap-2.5 text-slate-400">
                <UserRoundX size={16} className="opacity-70" />
                <span className="text-slate-900 text-sm">{attendance.filter(r => r.out_time).length}</span> ушло
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;

