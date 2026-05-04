// pages/cabinet/CabinetHome.jsx — главная кабинета (mobile-first)
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Clock, Timer, Target, Wallet, UserRound, Phone, CreditCard,
  CheckCircle2, CircleDashed, Activity, Lightbulb, CalendarDays, Sunrise, Trophy,
} from 'lucide-react';
import { getMyProfile, getMyAttendance, getMyPayroll } from '../../api/client';
import { useCountUp } from '../../hooks/useCountUp';

const formatTimeStr = (t) => t || '—';

// Парсит "HH:MM" в количество минут с начала дня
const hmToMinutes = (hm) => {
  if (!hm) return null;
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
};

// Длительность смены в формате "Xч Yм" по строкам HH:MM (open shift = до текущего времени)
const formatShiftDuration = (inTime, outTime) => {
  const inM = hmToMinutes(inTime);
  if (inM == null) return null;
  let outM;
  if (outTime) {
    outM = hmToMinutes(outTime);
  } else {
    const now = new Date();
    outM = now.getHours() * 60 + now.getMinutes();
  }
  let diff = outM - inM;
  if (diff < 0) diff += 24 * 60; // через полночь
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return { hours: h, minutes: m, totalHours: diff / 60 };
};

const minutesToHM = (mins) => {
  const m = Math.round(mins);
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `${String(h).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
};

const WEEKDAYS_GENITIVE = ['воскресеньям', 'понедельникам', 'вторникам', 'средам', 'четвергам', 'пятницам', 'субботам'];

// Считает 1-3 инсайта на основе attendance за месяц
const computeInsights = (attendance, todayRecord) => {
  const closed = attendance.filter((r) => r.total_hours != null && r.total_hours > 0);
  if (closed.length === 0) return [];

  const insights = [];

  // 1) Чаще всего работаешь по таким-то дням недели
  const dayCounts = [0, 0, 0, 0, 0, 0, 0];
  closed.forEach((r) => {
    const d = new Date(r.date);
    dayCounts[d.getDay()]++;
  });
  const max = Math.max(...dayCounts);
  if (max >= 2) {
    const topDays = dayCounts
      .map((c, i) => ({ c, i }))
      .filter((x) => x.c === max)
      .map((x) => WEEKDAYS_GENITIVE[x.i]);
    insights.push({
      icon: CalendarDays,
      tone: 'indigo',
      text: topDays.length === 1
        ? `Чаще всего работаешь по ${topDays[0]} — ${max} раз`
        : `Чаще всего работаешь по ${topDays.slice(0, 2).join(' и ')}`,
    });
  }

  // 2) Обычное время прихода + сравнение с сегодня
  const arrivalsMin = closed.map((r) => hmToMinutes(r.in_time)).filter((x) => x != null);
  if (arrivalsMin.length >= 2) {
    const avg = arrivalsMin.reduce((a, b) => a + b, 0) / arrivalsMin.length;
    const avgStr = minutesToHM(avg);
    const todayIn = todayRecord ? hmToMinutes(todayRecord.in_time) : null;
    if (todayIn != null) {
      const diff = todayIn - avg; // мин: + = позже, − = раньше
      const absDiff = Math.abs(Math.round(diff));
      if (absDiff < 5) {
        insights.push({
          icon: Sunrise,
          tone: 'amber',
          text: `Обычно приходишь в ${avgStr}, сегодня — ${todayRecord.in_time} (точно вовремя)`,
        });
      } else {
        insights.push({
          icon: Sunrise,
          tone: 'amber',
          text: `Обычно приходишь в ${avgStr}, сегодня — ${todayRecord.in_time} (${diff > 0 ? `+${absDiff}` : `−${absDiff}`} мин)`,
        });
      }
    } else {
      insights.push({
        icon: Sunrise,
        tone: 'amber',
        text: `Обычно приходишь в ${avgStr}`,
      });
    }
  }

  // 3) Самая длинная смена за месяц
  const longest = closed.reduce((best, r) => (r.total_hours > (best?.total_hours || 0) ? r : best), null);
  if (longest && longest.total_hours >= 1) {
    const h = Math.floor(longest.total_hours);
    const m = Math.round((longest.total_hours - h) * 60);
    const dateStr = new Date(longest.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
    insights.push({
      icon: Trophy,
      tone: 'emerald',
      text: `Самая длинная смена — ${h}ч ${m > 0 ? String(m).padStart(2, '0') + 'м' : ''} (${dateStr})`,
    });
  }

  return insights;
};

const CabinetHome = () => {
  const [profile, setProfile] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [payroll, setPayroll] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [p, a, pr] = await Promise.all([
        getMyProfile(),
        getMyAttendance(),
        getMyPayroll(),
      ]);
      setProfile(p);
      setAttendance(a);
      setPayroll(pr);
    } catch (error) {
      console.error('Не удалось загрузить кабинет:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
    const interval = setInterval(loadAll, 30000); // обновляем раз в 30 сек
    return () => clearInterval(interval);
  }, [loadAll]);

  // Тикер на 1 минуту — для живой длительности смены пока сотрудник на работе
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const todayRecord = useMemo(() => attendance.find((r) => r.date === today), [attendance, today]);

  const status = useMemo(() => {
    if (!todayRecord) return { kind: 'absent', label: 'Не отмечен сегодня', color: 'slate' };
    if (todayRecord.in_time && !todayRecord.out_time) return { kind: 'working', label: 'На работе', color: 'emerald' };
    return { kind: 'left', label: 'Смена закрыта', color: 'blue' };
  }, [todayRecord]);

  // Длительность сегодняшней смены — пересчитываем на каждом рендере чтоб тикер обновлял
  const shiftDuration = todayRecord
    ? formatShiftDuration(todayRecord.in_time, todayRecord.out_time)
    : null;

  const insights = useMemo(
    () => computeInsights(attendance, todayRecord),
    [attendance, todayRecord]
  );

  // Анимированные счётчики
  const animHours = useCountUp(payroll?.total_hours_worked ?? 0);
  const animPoints = useCountUp(payroll?.total_points ?? 0);
  const animShifts = useCountUp(attendance.length);
  const animPay = useCountUp(payroll?.to_pay ?? 0);

  // Skeleton при первой загрузке
  if (loading && !profile) {
    return <HomeSkeleton />;
  }

  if (!profile) {
    return (
      <div className="text-center pt-20">
        <p className="text-slate-500 font-medium">Не удалось загрузить профиль</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Привет + сегодняшний статус */}
      <div className={`relative overflow-hidden rounded-3xl p-5 text-white shadow-xl bg-gradient-to-br ${
        status.kind === 'working' ? 'from-emerald-500 via-emerald-600 to-teal-700'
        : status.kind === 'left' ? 'from-blue-500 via-indigo-600 to-indigo-700'
        : 'from-slate-600 via-slate-700 to-slate-800'
      }`}>
        {/* Декоративные блобы */}
        <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-16 -left-12 w-48 h-48 rounded-full bg-white/5 blur-3xl" />

        <div className="relative">
          <p className="text-xs font-bold uppercase tracking-widest opacity-80">
            {new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <h1 className="text-2xl font-black tracking-tight mt-1 mb-3">
            Привет, {profile.name.split(' ')[1] || profile.name}!
          </h1>

          <div className="flex items-center gap-2 mb-4">
            {status.kind === 'working' ? (
              <span className="relative flex w-2.5 h-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
              </span>
            ) : status.kind === 'left' ? (
              <CheckCircle2 size={18} className="flex-shrink-0" />
            ) : (
              <CircleDashed size={18} className="flex-shrink-0" />
            )}
            <span className="font-bold text-sm">{status.label}</span>
            {shiftDuration && status.kind === 'working' && (
              <span className="ml-auto inline-flex items-center gap-1 bg-white/20 px-2.5 py-1 rounded-lg backdrop-blur text-xs font-black tabular-nums">
                <Activity size={12} />
                {shiftDuration.hours}ч {String(shiftDuration.minutes).padStart(2, '0')}м
              </span>
            )}
            {shiftDuration && status.kind === 'left' && (
              <span className="ml-auto bg-white/20 px-2.5 py-1 rounded-lg backdrop-blur text-xs font-black tabular-nums">
                Отработано {shiftDuration.hours}ч {String(shiftDuration.minutes).padStart(2, '0')}м
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white/15 rounded-xl p-3 backdrop-blur border border-white/10">
              <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">Приход</p>
              <p className="text-xl font-black tabular-nums">{formatTimeStr(todayRecord?.in_time)}</p>
            </div>
            <div className="bg-white/15 rounded-xl p-3 backdrop-blur border border-white/10">
              <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">Уход</p>
              <p className="text-xl font-black tabular-nums">{formatTimeStr(todayRecord?.out_time)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Сводка за месяц — 4 карточки 2×2 на мобиле */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2 ml-2">
          {new Date().toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            icon={<Timer size={18} />}
            color="blue"
            label="Часов"
            value={animHours.toFixed(1)}
            unit="ч"
          />
          <StatCard
            icon={<Target size={18} />}
            color="indigo"
            label="Очков"
            value={animPoints.toFixed(1)}
            unit=""
          />
          <StatCard
            icon={<Clock size={18} />}
            color="amber"
            label="Смен"
            value={Math.round(animShifts).toString()}
            unit=""
          />
          <StatCard
            icon={<Wallet size={18} />}
            color="emerald"
            label="К выплате"
            value={Math.round(animPay).toLocaleString('ru-RU')}
            unit="₴"
          />
        </div>
      </div>

      {/* Smart-инсайты */}
      {insights.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-soft border border-slate-100">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb size={16} className="text-amber-500" />
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Инсайты</p>
          </div>
          <div className="space-y-2.5">
            {insights.map((ins, i) => (
              <InsightRow key={i} icon={<ins.icon size={14} />} tone={ins.tone} text={ins.text} />
            ))}
          </div>
        </div>
      )}

      {/* Профиль — компактная плашка */}
      <div className="bg-white rounded-2xl p-4 shadow-soft border border-slate-100">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Профиль</p>
        <div className="space-y-2.5">
          <ProfileRow icon={<UserRound size={16} />} label="ФИО" value={profile.name} />
          {profile.phone && <ProfileRow icon={<Phone size={16} />} label="Телефон" value={profile.phone} />}
          {profile.bank_acc && (
            <ProfileRow
              icon={<CreditCard size={16} />}
              label="Счёт"
              value={profile.bank_acc.replace(/(.{4})/g, '$1 ').trim()}
              mono
            />
          )}
        </div>
      </div>
    </div>
  );
};

const COLOR_CLASSES = {
  blue: 'bg-blue-50 text-blue-600 border-blue-100',
  indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
  amber: 'bg-amber-50 text-amber-600 border-amber-100',
  emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
};

const StatCard = ({ icon, color, label, value, unit }) => (
  <div className={`rounded-2xl p-4 border ${COLOR_CLASSES[color]}`}>
    <div className="flex items-center gap-1.5 mb-2 opacity-80">
      {icon}
      <span className="text-[11px] font-bold uppercase tracking-widest">{label}</span>
    </div>
    <p className="text-2xl font-black tracking-tight tabular-nums">
      {value}
      {unit && <span className="text-base font-bold opacity-70 ml-1">{unit}</span>}
    </p>
  </div>
);

const ProfileRow = ({ icon, label, value, mono }) => (
  <div className="flex items-center gap-3">
    <div className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center text-slate-500 flex-shrink-0">
      {icon}
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-tight">{label}</p>
      <p className={`text-sm font-bold text-slate-800 truncate ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  </div>
);

const INSIGHT_TONES = {
  indigo: 'bg-indigo-50 text-indigo-600',
  amber: 'bg-amber-50 text-amber-600',
  emerald: 'bg-emerald-50 text-emerald-600',
};

const InsightRow = ({ icon, tone, text }) => (
  <div className="flex items-start gap-3">
    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${INSIGHT_TONES[tone]}`}>
      {icon}
    </div>
    <p className="text-sm text-slate-700 leading-snug pt-0.5">{text}</p>
  </div>
);

// ============ Skeleton при первой загрузке ============

const HomeSkeleton = () => (
  <div className="space-y-4">
    {/* Hero */}
    <div className="relative overflow-hidden rounded-3xl p-5 shadow-xl bg-gradient-to-br from-slate-300 via-slate-400 to-slate-500">
      <div className="space-y-3">
        <div className="skeleton-dark h-3 w-32" />
        <div className="skeleton-dark h-7 w-2/3" />
        <div className="skeleton-dark h-4 w-1/2" />
        <div className="grid grid-cols-2 gap-2 pt-2">
          <div className="skeleton-dark h-16 rounded-xl" />
          <div className="skeleton-dark h-16 rounded-xl" />
        </div>
      </div>
    </div>
    {/* Stats grid */}
    <div>
      <div className="skeleton h-3 w-24 mb-2 ml-2" />
      <div className="grid grid-cols-2 gap-3">
        <div className="skeleton h-24 rounded-2xl" />
        <div className="skeleton h-24 rounded-2xl" />
        <div className="skeleton h-24 rounded-2xl" />
        <div className="skeleton h-24 rounded-2xl" />
      </div>
    </div>
    {/* Insights placeholder */}
    <div className="skeleton h-32 rounded-2xl" />
    {/* Profile */}
    <div className="skeleton h-36 rounded-2xl" />
  </div>
);

export default CabinetHome;
