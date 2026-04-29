// components/Sidebar.jsx - Modern Soft UI Sidebar
import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, LayoutDashboard, BookUser, Users, Calculator, ScrollText, ChevronLeft, ChevronRight, Building2, LogOut } from 'lucide-react';

const Sidebar = ({ isCollapsed, setIsCollapsed }) => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  const menuItems = [
    { path: '/', icon: LayoutDashboard, label: 'Дашборд' },
    { path: '/journal', icon: BookUser, label: 'Журнал' },
    { path: '/employees', icon: Users, label: 'Сотрудники' },
    { path: '/payroll', icon: Calculator, label: 'Зарплата' },
    { path: '/logs', icon: ScrollText, label: 'Логи' },
  ];

  const isActive = (path) => location.pathname === path;

  return (
    <>
      {/* Mobile Menu Button - Modern Soft UI */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-3 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl text-white shadow-soft-lg hover:shadow-soft-xl transition-soft"
      >
        {isOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/30 backdrop-blur-sm z-30"
          onClick={() => setIsOpen(false)}
        />
      )}


      {/* Sidebar - Modern Soft UI Design */}
      <aside
        className={`
          fixed top-0 left-0 h-full z-40 transform transition-all duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0
          ${isCollapsed ? 'w-16' : 'w-64'}
        `}
      >
        {/* Sidebar Background with Gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-50 to-blue-50 opacity-90"></div>
        <div className="absolute inset-0 bg-white/50 backdrop-blur-sm"></div>

        {/* Sidebar Content */}
        <div className="relative h-full flex flex-col">
          {/* Logo Header with Gradient Box */}
          <div className="p-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-soft-lg">
                <Building2 size={20} className="text-white" />
              </div>
              {!isCollapsed && (
                <div>
                  <h1 className="text-lg font-black text-slate-800">Учёт ЗП</h1>
                  <p className="text-slate-500 text-xs font-medium">Payroll System</p>
                </div>
              )}
              {isCollapsed && (
                <div className="w-full text-center">
                  <span className="text-xl font-black text-slate-800">УЗ</span>
                </div>
              )}
            </div>
          </div>

          {/* Navigation */}
          <nav className="p-2 flex-1 overflow-y-auto">
            <ul className="space-y-1">
              {menuItems.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.path}>
                    <Link
                      to={item.path}
                      onClick={() => setIsOpen(false)}
                      className={`
                        flex items-center gap-3 px-3 py-3 rounded-xl transition-soft
                        ${isActive(item.path)
                          ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-soft-lg hover:shadow-soft-xl'
                          : 'text-slate-500 hover:bg-white hover:text-blue-600 hover:shadow-soft'
                        }
                      `}
                      title={isCollapsed ? item.label : ''}
                    >
                      <Icon size={20} className="flex-shrink-0" />
                      {!isCollapsed && <span className="font-medium text-sm">{item.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Collapse Button */}
          <div className="p-2 border-t border-slate-100">
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-slate-500 hover:bg-white hover:text-blue-600 rounded-xl transition-soft shadow-soft hover:shadow-soft-lg"
            >
              {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
              {!isCollapsed && <span className="text-xs font-medium">Свернуть</span>}
            </button>
          </div>

          {/* Logout Button */}
          <div className="p-2">
            <button
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-slate-500 hover:bg-red-50 hover:text-red-600 rounded-xl transition-soft shadow-soft hover:shadow-soft-lg"
            >
              <LogOut size={18} />
              {!isCollapsed && <span className="text-xs font-medium">Выйти</span>}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
