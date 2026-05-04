// pages/cabinet/CabinetLayout.jsx — mobile-first layout кабинета сотрудника
import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, NavLink } from 'react-router-dom';
import { Home, CalendarDays, Wallet, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getMyProfile } from '../../api/client';
import CabinetHome from './CabinetHome';
import CabinetCalendar from './CabinetCalendar';
import CabinetPayroll from './CabinetPayroll';

const TABS = [
  { to: '/cabinet', label: 'Главная', icon: Home, end: true },
  { to: '/cabinet/calendar', label: 'Календарь', icon: CalendarDays, end: false },
  { to: '/cabinet/payroll', label: 'Зарплата', icon: Wallet, end: false },
];

// Извлекает фамилию + первое имя из ФИО ("Иванов Иван Иванович" → "Иванов Иван")
// чтобы в шапке не лезло три слова на узком экране.
const shortName = (fullName) => {
  if (!fullName) return null;
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 2) return fullName.trim();
  return `${parts[0]} ${parts[1]}`;
};

const CabinetLayout = () => {
  const { user, logout } = useAuth();
  const [profileName, setProfileName] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getMyProfile()
      .then((p) => { if (!cancelled) setProfileName(p?.name || null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const displayName = profileName || user?.username || '';
  const avatarLetter = (profileName || user?.username || '?').charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top header — компактный */}
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center font-black text-lg flex-shrink-0">
              {avatarLetter}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-tight">Личный кабинет</p>
              <p className="text-sm font-bold text-slate-800 truncate">{shortName(displayName)}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex items-center justify-center w-11 h-11 rounded-xl bg-slate-100 text-slate-500 hover:bg-red-50 hover:text-red-600 transition-soft"
            aria-label="Выйти"
            title="Выйти"
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {/* Контент — отступ снизу под нижний таббар */}
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 pt-4 pb-24">
        <Routes>
          <Route path="/" element={<CabinetHome />} />
          <Route path="/calendar" element={<CabinetCalendar />} />
          <Route path="/payroll" element={<CabinetPayroll />} />
          <Route path="*" element={<Navigate to="/cabinet" replace />} />
        </Routes>
      </main>

      {/* Bottom nav — основной способ навигации на телефоне */}
      <nav
        className="fixed bottom-0 inset-x-0 z-20 bg-white border-t border-slate-200"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="max-w-2xl mx-auto grid grid-cols-3">
          {TABS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-1 py-3 transition-soft ${
                  isActive ? 'text-blue-600' : 'text-slate-400'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                  <span className={`text-[11px] ${isActive ? 'font-bold' : 'font-medium'}`}>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
};

export default CabinetLayout;
