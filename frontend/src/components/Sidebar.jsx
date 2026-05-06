// components/Sidebar.jsx — Linear-минимализм: серый фон, тонкие границы,
// плотная типографика, один акцентный цвет.
// На мобильном этот сайдбар не виден — вместо него MobileBottomNav снизу.
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, BookUser, Users, Calculator,
  ScrollText, ChevronLeft, ChevronRight, LogOut, BarChart3,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Sidebar = ({ isCollapsed, setIsCollapsed }) => {
  const location = useLocation();
  const { user, logout } = useAuth();

  const menuItems = [
    { path: '/',           icon: LayoutDashboard, label: 'Дашборд' },
    { path: '/journal',    icon: BookUser,        label: 'Журнал' },
    { path: '/employees',  icon: Users,           label: 'Сотрудники' },
    { path: '/payroll',    icon: Calculator,      label: 'Зарплата' },
    { path: '/analytics',  icon: BarChart3,       label: 'Аналитика' },
    { path: '/logs',       icon: ScrollText,      label: 'Логи' },
  ];

  const isActive = (path) => location.pathname === path;

  return (
    <aside
      className={`
        hidden lg:block fixed top-0 left-0 h-full z-40 bg-white border-r border-slate-200
        transition-all duration-200 ease-out
        ${isCollapsed ? 'w-14' : 'w-56'}
      `}
    >
      <div className="h-full flex flex-col">
        {/* Logo */}
        <div className="px-3 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-slate-900 rounded-md flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
              УЗ
            </div>
            {!isCollapsed && (
              <div className="text-sm font-semibold text-slate-900 truncate">
                Учёт ЗП
              </div>
            )}
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 overflow-y-auto">
          <ul className="space-y-0.5">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);
              return (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    className={`
                      flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm
                      transition-colors
                      ${active
                        ? 'bg-slate-100 text-slate-900 font-medium'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}
                    `}
                    title={isCollapsed ? item.label : ''}
                  >
                    <Icon size={16} className="flex-shrink-0" />
                    {!isCollapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* User + actions */}
        <div className="px-2 py-2 border-t border-slate-100 space-y-1">
          {user && !isCollapsed && (
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-md">
              <div className="w-6 h-6 bg-slate-900 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                {user.username.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-slate-700 truncate">{user.username}</div>
                <div className="text-[10px] text-slate-400">{user.role === 'admin' ? 'Администратор' : 'Сотрудник'}</div>
              </div>
            </div>
          )}
          <button
            onClick={logout}
            title={isCollapsed ? 'Выйти' : ''}
            className="w-full flex items-center justify-center gap-2 px-2 py-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600 rounded-md text-xs transition-colors"
          >
            <LogOut size={14} />
            {!isCollapsed && <span>Выйти</span>}
          </button>
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="w-full flex items-center justify-center gap-2 px-2 py-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-700 rounded-md text-xs transition-colors"
          >
            {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
            {!isCollapsed && <span>Свернуть</span>}
          </button>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
