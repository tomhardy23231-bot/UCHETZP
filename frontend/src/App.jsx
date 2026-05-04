// App.jsx - Главный компонент приложения
import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Journal from './pages/Journal';
import Employees from './pages/Employees';
import Payroll from './pages/Payroll';
import Logs from './pages/Logs';
import Login from './pages/Login';
import NotificationManager from './components/NotificationManager';
import ProtectedRoute from './components/ProtectedRoute';
import { TodayAttendanceProvider } from './context/TodayAttendanceContext';
import { Toaster } from 'react-hot-toast';
import CabinetLayout from './pages/cabinet/CabinetLayout';

// Layout админки — сайдбар + основной контент. Только для роли admin.
function AdminLayout() {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <TodayAttendanceProvider>
      <div className="flex min-h-screen bg-slate-50">
        <NotificationManager />
        <Sidebar isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} />
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
