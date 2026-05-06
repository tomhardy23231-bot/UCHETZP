// components/MobileBottomNav.jsx — нижняя навигация в стиле нативного
// мобильного приложения. На lg+ скрыта (там обычный сайдбар).
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, BookUser, Users, Calculator, BarChart3, ScrollText,
} from 'lucide-react';

const TABS = [
  { path: '/',           icon: LayoutDashboard, label: 'Главная' },
  { path: '/journal',    icon: BookUser,        label: 'Журнал' },
  { path: '/employees',  icon: Users,           label: 'Кадры' },
  { path: '/payroll',    icon: Calculator,      label: 'Зарплата' },
  { path: '/analytics',  icon: BarChart3,       label: 'Аналитика' },
  { path: '/logs',       icon: ScrollText,      label: 'Логи' },
];

const MobileBottomNav = () => {
  const location = useLocation();
  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 grid grid-cols-6 h-[60px] pb-[env(safe-area-inset-bottom)]"
      aria-label="Основная навигация"
    >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const active = location.pathname === tab.path;
        return (
          <Link
            key={tab.path}
            to={tab.path}
            className={`flex flex-col items-center justify-center gap-0.5 transition-colors ${
              active ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600 active:text-slate-700'
            }`}
          >
            <div className={`flex items-center justify-center w-full h-6 ${
              active ? 'relative' : ''
            }`}>
              {active && (
                <span className="absolute -top-[1px] left-1/2 -translate-x-1/2 w-8 h-0.5 bg-slate-900 rounded-full" />
              )}
              <Icon size={20} strokeWidth={active ? 2.25 : 2} />
            </div>
            <span className={`text-[9px] leading-tight tracking-tight ${active ? 'font-semibold' : 'font-medium'}`}>
              {tab.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
};

export default MobileBottomNav;
