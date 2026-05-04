// pages/cabinet/CabinetHome.jsx — главная кабинета (mobile-first)
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Clock, Timer, Target, Wallet, UserRound, Phone, CreditCard, CheckCircle2, CircleDashed } from 'lucide-react';
import { getMyProfile, getMyAttendance, getMyPayroll } from '../../api/client';

const formatTimeStr = (t) => t || '—';

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

  const today = new Date().toISOString().slice(0, 10);
  const todayRecord = useMemo(() => attendance.find((r) => r.date === today), [attendance, today]);

  const status = useMemo(() => {
    if (!todayRecord) return { kind: 'absent', label: 'Не отмечен сегодня', color: 'slate' };
    if (todayRecord.in_time && !todayRecord.out_time) return { kind: 'working', label: 'На работе', color: 'emerald' };
    return { kind: 'left', label: 'Смена закрыта', color: 'blue' };
  }, [todayRecord]);

  if (loading && !profile) {
    return (
      <div className="flex flex-col items-center justify-center pt-20 text-slate-400">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mb-4"></div>
        <p className="text-sm">Загружаем данные...</p>
      </div>
    );
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
      <div className={`rounded-3xl p-5 text-white shadow-lg bg-gradient-to-br ${
        status.kind === 'working' ? 'from-emerald-500 to-teal-600'
        : status.kind === 'left' ? 'from-blue-500 to-indigo-600'
        : 'from-slate-500 to-slate-700'
      }`}>
        <p className="text-xs font-bold uppercase tracking-widest opacity-80">
          {new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
        <h1 className="text-2xl font-black tracking-tight mt-1 mb-3">
          Привет, {profile.name.split(' ')[1] || profile.name}!
        </h1>

        <div className="flex items-center gap-2 mb-4">
          {status.kind === 'working' ? (
            <CheckCircle2 size={18} className="flex-shrink-0" />
          ) : (
            <CircleDashed size={18} className="flex-shrink-0" />
          )}
          <span className="font-bold text-sm">{status.label}</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white/15 rounded-xl p-3 backdrop-blur">
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">Приход</p>
            <p className="text-xl font-black">{formatTimeStr(todayRecord?.in_time)}</p>
          </div>
          <div className="bg-white/15 rounded-xl p-3 backdrop-blur">
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">Уход</p>
            <p className="text-xl font-black">{formatTimeStr(todayRecord?.out_time)}</p>
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
            value={(payroll?.total_hours_worked ?? 0).toFixed(1)}
            unit="ч"
          />
          <StatCard
            icon={<Target size={18} />}
            color="indigo"
            label="Очков"
            value={(payroll?.total_points ?? 0).toFixed(1)}
            unit=""
          />
          <StatCard
            icon={<Clock size={18} />}
            color="amber"
            label="Смен"
            value={String(attendance.length)}
            unit=""
          />
          <StatCard
            icon={<Wallet size={18} />}
            color="emerald"
            label="К выплате"
            value={Math.round(payroll?.to_pay ?? 0).toLocaleString('ru-RU')}
            unit="₴"
          />
        </div>
      </div>

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
    <p className="text-2xl font-black tracking-tight">
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

export default CabinetHome;
