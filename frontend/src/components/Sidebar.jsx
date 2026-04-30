// components/Sidebar.jsx — Linear-минимализм: серый фон, тонкие границы,
// плотная типографика, один акцентный цвет.
import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Menu, X, LayoutDashboard, BookUser, Users, Calculator,
  ScrollText, ChevronLeft, ChevronRight,
} from 'lucide-react';

const Sidebar = ({ isCollapsed, setIsCollapsed }) => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  const menuItems = [
    { path: '/',          icon: LayoutDashboard, label: 'Дашборд' },
    { path: '/journal',   icon: BookUser,        label: 'Журнал' },
    { path: '/employees', icon: Users,           label: 'Сотрудники' },
    { path: '/payroll',   icon: Calculator,      label: 'Зарплата' },
    { path: '/logs',      icon: ScrollText,      label: 'Логи' },
  ];

  const isActive = (path) => location.pathname === path;

  return (
    <>
      {/* Mobile burger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white border border-slate-200 rounded-md text-slate-700 shadow-sm"
      >
        {isOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-slate-900/30 z-30"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside
        className={`
          fixed top-0 left-0 h-full z-40 bg-white border-r border-slate-200
          transform transition-all duration-200 ease-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0
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

          {/* Collapse */}
          <div className="px-2 py-2 border-t border-slate-100">
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
