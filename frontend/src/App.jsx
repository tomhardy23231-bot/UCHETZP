// App.jsx - Главный компонент приложения
import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Journal from './pages/Journal';
import Employees from './pages/Employees';
import Payroll from './pages/Payroll';
import AdminPanel from './pages/AdminPanel';
import Login from './pages/Login';
import NotificationManager from './components/NotificationManager';
import ProtectedRoute from './components/ProtectedRoute';
import SubscriptionGuard from './components/SubscriptionGuard';
import { AuthProvider } from './context/AuthContext';

function App() {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          
          <Route path="/*" element={
            <ProtectedRoute>
              <SubscriptionGuard>
                <div className="flex min-h-screen bg-gray-100">
                  <NotificationManager />
                  <Sidebar isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} />

                  <main className={`flex-1 transition-all duration-300 ${isCollapsed ? 'lg:ml-16' : 'lg:ml-64'}`}>
                    <Routes>
                      <Route path="/" element={<Dashboard />} />
                      <Route path="/journal" element={<Journal />} />
                      <Route path="/employees" element={<Employees />} />
                      <Route path="/payroll" element={<Payroll />} />
                      <Route path="/admin" element={
                        <ProtectedRoute adminOnly={true}>
                          <AdminPanel />
                        </ProtectedRoute>
                      } />
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                  </main>
                </div>
              </SubscriptionGuard>
            </ProtectedRoute>
          } />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
