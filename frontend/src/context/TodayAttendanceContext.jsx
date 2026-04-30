// context/TodayAttendanceContext.jsx
// Один общий polling для всех компонентов, которым нужны "сегодняшние" посещения.
// Раньше Dashboard и NotificationManager независимо опрашивали /api/attendance/today
// каждые 3 секунды -> 2 запроса каждые 3 сек. Теперь — один.
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { getTodayAttendance } from '../api/client';

const TodayAttendanceContext = createContext(null);

export const TodayAttendanceProvider = ({ children }) => {
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  const prevAttendanceRef = useRef([]);

  const refresh = useCallback(async () => {
    try {
      const data = await getTodayAttendance();
      // Сортировка: новые приходы сверху
      const sorted = data.sort((a, b) => new Date(b.in_time) - new Date(a.in_time));
      setAttendance((prev) => {
        prevAttendanceRef.current = prev;
        return sorted;
      });
    } catch (e) {
      console.error('Не удалось получить посещения за сегодня:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [refresh]);

  return (
    <TodayAttendanceContext.Provider
      value={{
        attendance,
        prevAttendance: prevAttendanceRef.current,
        loading,
        refresh,
      }}
    >
      {children}
    </TodayAttendanceContext.Provider>
  );
};

export const useTodayAttendance = () => {
  const ctx = useContext(TodayAttendanceContext);
  if (!ctx) throw new Error('useTodayAttendance должен быть внутри TodayAttendanceProvider');
  return ctx;
};
