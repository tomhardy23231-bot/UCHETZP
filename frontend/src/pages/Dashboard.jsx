// pages/Dashboard.jsx — Linear-минимализм
import React, { useState, useEffect, useMemo } from 'react';
import {
  Clock, UserRoundCheck, UserRoundX, UsersRound, Timer,
  AlertTriangle, AlarmClock, ChevronDown,
} from 'lucide-react';
import { useTodayAttendance } from '../context/TodayAttendanceContext';
import { getAttendanceJournal } from '../api/client';
import Avatar from '../components/ui/Avatar';

const LATE_THRESHOLD_HOUR = 9;
const LATE_THRESHOLD_MIN = 0;
const UNCLOSED_SHIFT_ALERT_HOUR = 21;

const Dashboard = () => {
  const { attendance } = useTodayAttendance();
  const [weekJournal, setWeekJournal] = useState([]);
  const [now, setNow] = useState(() => new Date());
  const [expandedLate, setExpandedLate] = useState(null); // имя или null

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 6);
    const fmt = (d) => d.toISOString().slice(0, 10);
    getAttendanceJournal(fmt(start), fmt(end))
      .then(setWeekJournal)
      .catch((e) => console.error('Не удалось загрузить журнал недели:', e));
  }, []);

  const topLate = useMemo(() => {
    const counter = new Map();
    weekJournal.forEach((r) => {
      if (!r.in_time) return;
      const [h, m] = r.in_time.split(':').map(Number);
      const isLate =
        h > LATE_THRESHOLD_HOUR ||
        (h === LATE_THRESHOLD_HOUR && m > LATE_THRESHOLD_MIN);
      if (!isLate) return;
      const minutesLate = (h * 60 + m) - (LATE_THRESHOLD_HOUR * 60 + LATE_THRESHOLD_MIN);
      const cur = counter.get(r.employee_name) || {
        name: r.employee_name,
        count: 0,
        totalMinutes: 0,
        incidents: [],
      };
      cur.count += 1;
      cur.totalMinutes += minutesLate;
      cur.incidents.push({
        date: r.date,
        inTime: r.in_time,
        outTime: r.out_time,
        totalHours: r.total_hours,
        minutesLate,
      });
      counter.set(r.employee_name, cur);
    });
    // Сортируем инциденты у каждого сотрудника — свежие сверху
    counter.forEach((v) => {
      v.incidents.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    });
    return Array.from(counter.values())
      .sort((a, b) => b.count - a.count || b.totalMinutes - a.totalMinutes)
      .slice(0, 3);
  }, [weekJournal]);

  const formatLateDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  const formatHoursDecimal = (h) => {
    if (h == null) return '—';
    const totalMin = Math.round(Number(h) * 60);
    const hh = Math.floor(totalMin / 60);
    const mm = totalMin % 60;
    return `${hh}ч ${mm.toString().padStart(2, '0')}м`;
  };

  const formatTime = (dateString) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  };

  const calculateDuration = (inTime, outTime) => {
    if (!outTime) return null;
    const diff = new Date(outTime) - new Date(inTime);
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    return `${hours}ч ${minutes}м`;
  };

  const stats = useMemo(() => {
    const total = attendance.length;
    const working = attendance.filter((r) => !r.out_time).length;
    const left = attendance.filter((r) => r.out_time).length;
    const closed = attendance.filter((r) => r.out_time);
    const avgHours = closed.length > 0
      ? (closed.reduce((s, r) => s + (new Date(r.out_time) - new Date(r.in_time)) / 3600000, 0) / closed.length).toFixed(1)
      : '—';
    return { total, working, left, avgHours };
  }, [attendance]);

  return (
    <div className="min-h-screen px-3 sm:px-6 md:px-8 py-4 md:py-6 pt-16 lg:pt-6">
      {/* Header */}
      <div className="mb-5 md:mb-6 flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold text-slate-900 tracking-tight">Дашборд</h1>
          <p className="text-xs md:text-sm text-slate-500 mt-0.5">
            {new Date().toLocaleDateString('ru-RU', {
              weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
            })}
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Обновляется в реальном времени
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Всего',       value: stats.total,    icon: UsersRound,     hint: 'отметок сегодня' },
          { label: 'На работе',   value: stats.working,  icon: UserRoundCheck, hint: 'сейчас в офисе', accent: 'text-emerald-600' },
          { label: 'Ушли',        value: stats.left,     icon: UserRoundX,     hint: 'завершили смену' },
          { label: 'Средняя смена', value: stats.avgHours + (stats.avgHours !== '—' ? 'ч' : ''), icon: Timer, hint: 'на закрытых сменах' },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">{s.label}</span>
                <Icon size={14} className="text-slate-400" />
              </div>
              <div className={`text-2xl font-semibold ${s.accent || 'text-slate-900'}`}>{s.value}</div>
              <div className="text-xs text-slate-400 mt-1">{s.hint}</div>
            </div>
          );
        })}
      </div>

      {/* Top late */}
      {topLate.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg mb-6">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
            <AlarmClock size={15} className="text-amber-500" />
            <h2 className="text-sm font-semibold text-slate-900">
              Топ опоздавших · 7 дней
            </h2>
            <span className="text-xs text-slate-400 ml-1">
              после {String(LATE_THRESHOLD_HOUR).padStart(2,'0')}:{String(LATE_THRESHOLD_MIN).padStart(2,'0')}
            </span>
          </div>
          <div className="divide-y divide-slate-100">
            {topLate.map((p, idx) => {
              const totalH = Math.floor(p.totalMinutes / 60);
              const totalM = p.totalMinutes % 60;
              const isOpen = expandedLate === p.name;
              return (
                <div key={p.name}>
                  <button
                    type="button"
                    onClick={() => setExpandedLate(isOpen ? null : p.name)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50/60 transition-colors text-left"
                  >
                    <div className="w-6 text-center text-sm font-semibold text-slate-400">
                      {idx + 1}
                    </div>
                    <Avatar name={p.name} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">{p.name}</div>
                    </div>
                    <div className="text-xs text-slate-500 font-mono">
                      <span className="text-rose-600 font-semibold">{p.count}</span> опозданий ·{' '}
                      {totalH > 0 ? `${totalH}ч ` : ''}{totalM}м
                    </div>
                    <ChevronDown
                      size={14}
                      className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {isOpen && (
                    <div className="bg-slate-50/60 border-t border-slate-100 overflow-x-auto">
                      <table className="w-full text-xs min-w-[480px]">
                        <thead>
                          <tr className="text-[10px] text-slate-400 uppercase tracking-wider">
                            <th className="text-left font-medium px-3 py-2 pl-3 md:pl-[3.25rem]">Когда</th>
                            <th className="text-left font-medium px-2 py-2">Пришёл</th>
                            <th className="text-left font-medium px-2 py-2">Опоздал</th>
                            <th className="text-left font-medium px-2 py-2">Ушёл</th>
                            <th className="text-left font-medium px-3 py-2">Отработал</th>
                          </tr>
                        </thead>
                        <tbody>
                          {p.incidents.map((inc, i) => {
                            const lateH = Math.floor(inc.minutesLate / 60);
                            const lateM = inc.minutesLate % 60;
                            return (
                              <tr key={i} className="border-t border-slate-100">
                                <td className="px-3 py-2 pl-3 md:pl-[3.25rem] text-slate-700 capitalize whitespace-nowrap">
                                  {formatLateDate(inc.date)}
                                </td>
                                <td className="px-2 py-2 text-slate-700 font-mono whitespace-nowrap">
                                  {inc.inTime}
                                </td>
                                <td className="px-2 py-2 font-mono text-rose-600 whitespace-nowrap">
                                  +{lateH > 0 ? `${lateH}ч ` : ''}{lateM}м
                                </td>
                                <td className="px-2 py-2 text-slate-700 font-mono whitespace-nowrap">
                                  {inc.outTime || <span className="text-slate-300">—</span>}
                                </td>
                                <td className="px-3 py-2 text-slate-700 whitespace-nowrap">
                                  {inc.totalHours != null ? formatHoursDecimal(inc.totalHours) : <span className="text-slate-400">не закрыта</span>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Attendance table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Посещения сегодня</h2>
          <span className="text-xs text-slate-400">{attendance.length} записей</span>
        </div>

        {attendance.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <UserRoundCheck size={28} className="mx-auto mb-2 text-slate-300" />
            <p className="text-sm text-slate-500">Ещё никто не отметился</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <table className="w-full text-sm hidden md:table">
              <thead>
                <tr className="text-xs text-slate-500 uppercase tracking-wider bg-slate-50/60">
                  <th className="text-left font-medium px-4 py-2">Сотрудник</th>
                  <th className="text-left font-medium px-4 py-2">Приход</th>
                  <th className="text-left font-medium px-4 py-2">Уход</th>
                  <th className="text-left font-medium px-4 py-2">Длительность</th>
                  <th className="text-left font-medium px-4 py-2">Статус</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {attendance.map((record) => {
                  const unclosed = !record.out_time && now.getHours() >= UNCLOSED_SHIFT_ALERT_HOUR;
                  return (
                    <tr key={record.id} className={unclosed ? 'bg-rose-50/40' : 'hover:bg-slate-50/60'}>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={record.employee_name} size="sm" />
                          <span className={`font-medium ${unclosed ? 'text-rose-700' : 'text-slate-900'}`}>
                            {record.employee_name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 font-mono">
                        {formatTime(record.in_time)}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 font-mono">
                        {record.out_time ? formatTime(record.out_time) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {calculateDuration(record.in_time, record.out_time) || (
                          <span className="text-slate-400">в процессе</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {unclosed ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-rose-100 text-rose-700 border border-rose-200">
                            <AlertTriangle size={11} /> не закрыта
                          </span>
                        ) : !record.out_time ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-700 border border-emerald-200">
                            <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                            на работе
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                            ушёл
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-slate-100">
              {attendance.map((record) => {
                const unclosed = !record.out_time && now.getHours() >= UNCLOSED_SHIFT_ALERT_HOUR;
                const dur = calculateDuration(record.in_time, record.out_time);
                return (
                  <div key={record.id} className={`px-4 py-3 ${unclosed ? 'bg-rose-50/40' : ''}`}>
                    <div className="flex items-center gap-2.5 mb-2">
                      <Avatar name={record.employee_name} size="sm" />
                      <span className={`font-medium text-sm flex-1 truncate ${unclosed ? 'text-rose-700' : 'text-slate-900'}`}>
                        {record.employee_name}
                      </span>
                      {unclosed ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-rose-100 text-rose-700 border border-rose-200">
                          <AlertTriangle size={10} /> не закрыта
                        </span>
                      ) : !record.out_time ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-700 border border-emerald-200">
                          <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                          на работе
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                          ушёл
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 pl-9 text-xs text-slate-600">
                      <span className="font-mono">
                        <span className="text-slate-400">пришёл</span> {formatTime(record.in_time)}
                      </span>
                      <span className="font-mono">
                        <span className="text-slate-400">ушёл</span> {record.out_time ? formatTime(record.out_time) : <span className="text-slate-300">—</span>}
                      </span>
                      {dur && (
                        <span className="ml-auto font-medium text-slate-700">{dur}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
