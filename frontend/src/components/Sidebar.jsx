// components/Sidebar.jsx — Linear-минимализм: серый фон, тонкие границы,
// плотная типографика, один акцентный цвет.
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  X, LayoutDashboard, BookUser, Users, Calculator,
  ScrollText, ChevronLeft, ChevronRight, LogOut, BarChart3,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Sidebar = ({ isCollapsed, setIsCollapsed, isMobileOpen, setIsMobileOpen }) => {
  const location = useLocation();
  const { user, logout } = useAuth();
  const isOpen = isMobileOpen;
  const setIsOpen = setIsMobileOpen;

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
    <>
      {/* Бургер для мобильного теперь живёт в MobileTopBar (App.jsx).
          Здесь только сама панель и оверлей. */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-slate-900/30 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside
        className={`
          fixed top-0 left-0 h-full z-50 bg-white border-r border-slate-200
          transform transition-all duration-200 ease-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0 lg:z-40
          ${isCollapsed ? 'w-14' : 'w-56'}
        `}
      >
        <div className="h-full flex flex-col">
          {/* Logo + close button (mobile) */}
          <div className="px-3 py-4 border-b border-slate-100 flex items-center justify-between">
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
            <button
              onClick={() => setIsOpen(false)}
              className="lg:hidden p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded"
              aria-label="Закрыть меню"
            >
              <X size={18} />
            </button>
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
                      onClick={() => setIsOpen(false)}
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
    </>
  );
};

export default Sidebar;
