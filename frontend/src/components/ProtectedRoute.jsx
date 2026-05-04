// components/ProtectedRoute.jsx
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute = ({ children, adminOnly = false, employeeOnly = false }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center font-bold text-slate-400">Загрузка...</div>;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Админка — только для админа. Сотрудника отправляем в его кабинет.
  if (adminOnly && user.role !== 'admin') {
    return <Navigate to="/cabinet" replace />;
  }

  // Кабинет — только для сотрудника. Админа отправляем в админку.
  if (employeeOnly && user.role !== 'employee') {
    return <Navigate to="/" replace />;
  }

  return children;
};

export default ProtectedRoute;
