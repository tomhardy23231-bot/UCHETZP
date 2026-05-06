// App.jsx - Главный компонент приложения
import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import Sidebar from './components/Sidebar';
import MobileBottomNav from './components/MobileBottomNav';
import Dashboard from './pages/Dashboard';
import Journal from './pages/Journal';
import Employees from './pages/Employees';
import Payroll from './pages/Payroll';
import Analytics from './pages/Analytics';
import Logs from './pages/Logs';
import Login from './pages/Login';
import NotificationManager from './components/NotificationManager';
import ProtectedRoute from './components/ProtectedRoute';
import { TodayAttendanceProvider } from './context/TodayAttendanceContext';
import { useAuth } from './context/AuthContext';
import { Toaster } from 'react-hot-toast';
import CabinetLayout from './pages/cabinet/CabinetLayout';

// Заголовок текущей страницы для мобильной шапки
const PAGE_TITLES = {
  '/': 'Дашборд',
  '/journal': 'Журнал',
  '/employees': 'Сотрудники',
  '/payroll': 'Зарплата',
  '/analytics': 'Аналитика',
  '/logs': 'Логи',
};

// Мобильная шапка: лого + название текущей страницы + кнопка выхода.
// Видна только на мобильном (lg:hidden), занимает 56px и стикается к верху.
// Бургера тут больше нет — навигация переехала в MobileBottomNav.
const MobileTopBar = () => {
  const location = useLocation();
  const { user, logout } = useAuth();
  const title = PAGE_TITLES[location.pathname] || 'Учёт ЗП';
  return (
    <div className="lg:hidden sticky top-0 z-20 bg-white border-b border-slate-200 h-14 flex items-center px-3 gap-2">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <div className="w-7 h-7 bg-slate-900 rounded-md flex items-center justify-center text-white font-bold text-[10px] flex-shrink-0">
          УЗ
        </div>
        <h1 className="text-sm font-semibold text-slate-900 truncate">{title}</h1>
      </div>
      {user && (
        <button
          onClick={logout}
          aria-label="Выйти"
          title={`Выйти (${user.username})`}
          className="p-2 -mr-2 text-slate-500 hover:bg-rose-50 hover:text-rose-600 rounded-md"
        >
          <LogOut size={18} />
        </button>
      )}
    </div>
  );
};

// Layout админки — сайдбар + основной контент. Только для роли admin.
function AdminLayout() {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <TodayAttendanceProvider>
      <div className="flex min-h-screen bg-slate-50">
        <NotificationManager />
        <Sidebar
          isCollapsed={isCollapsed}
          setIsCollapsed={setIsCollapsed}
        />
        <main className={`flex-1 min-w-0 transition-all duration-200 ${isCollapsed ? 'lg:ml-14' : 'lg:ml-56'} pb-[60px] lg:pb-0`}>
          <MobileTopBar />
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/journal" element={<Journal />} />
            <Route path="/employees" element={<Employees />} />
            <Route path="/payroll" element={<Payroll />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/logs" element={<Logs />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <MobileBottomNav />
      </div>
    </TodayAttendanceProvider>
  );
}

function App() {
  return (
    <Router>
      <Toaster position="bottom-right" />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/cabinet/*"
          element={
            <ProtectedRoute employeeOnly>
              <CabinetLayout />
            </ProtectedRoute>
          }
        />
        <Route
          path="/*"
          element={
            <ProtectedRoute adminOnly>
              <AdminLayout />
            </ProtectedRoute>
          }
        />
      </Routes>
    </Router>
  );
}

export default App;
