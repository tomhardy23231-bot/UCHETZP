// App.jsx - Главный компонент приложения
import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Journal from './pages/Journal';
import Employees from './pages/Employees';
import Payroll from './pages/Payroll';
import Logs from './pages/Logs';
import NotificationManager from './components/NotificationManager';
import { TodayAttendanceProvider } from './context/TodayAttendanceContext';
import { Toaster } from 'react-hot-toast';

function App() {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <Router>
      <TodayAttendanceProvider>
      <Toaster position="bottom-right" />
      <div className="flex min-h-screen bg-slate-50">
        <NotificationManager />
        {/* Боковая панель */}
        <Sidebar isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} />

        {/* Основной контент - с учётом сворачиваемой боковой панели */}
        <main className={`flex-1 transition-all duration-200 ${isCollapsed ? 'lg:ml-14' : 'lg:ml-56'}`}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/journal" element={<Journal />} />
            <Route path="/employees" element={<Employees />} />
            <Route path="/payroll" element={<Payroll />} />
            <Route path="/logs" element={<Logs />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
      </TodayAttendanceProvider>
    </Router>
  );
}

export default App;
