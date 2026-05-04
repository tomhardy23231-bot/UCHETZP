// api/client.js - Axios клиент для API запросов
import axios from 'axios';

// Базовый URL API (используем относительный путь в продакшене и localhost в разработке)
const API_BASE_URL = import.meta.env.DEV ? 'http://localhost:8000' : '';

// Создаём инстанс axios с базовыми настройками
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Подставляем JWT-токен в каждый запрос (если есть в localStorage)
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// При 401 — выкидываем на /login (токен истёк или невалиден)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const onLogin = window.location.pathname === '/login';
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (!onLogin) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// ========== АУТЕНТИФИКАЦИЯ ==========

export const login = async (username, password) => {
  const response = await api.post('/api/auth/login', { username, password });
  return response.data;
};

export const getMe = async () => {
  const response = await api.get('/api/auth/me');
  return response.data;
};

// ========== СОТРУДНИКИ ==========

export const getEmployees = async () => {
  const response = await api.get('/api/employees');
  return response.data;
};

export const getEmployee = async (id) => {
  const response = await api.get(`/api/employees/${id}`);
  return response.data;
};

export const createEmployee = async (employee) => {
  const response = await api.post('/api/employees', employee);
  return response.data;
};

export const updateEmployee = async (id, employee) => {
  const response = await api.put(`/api/employees/${id}`, employee);
  return response.data;
};

export const deleteEmployee = async (id) => {
  const response = await api.delete(`/api/employees/${id}`);
  return response.data;
};

// ========== ПОСЕЩАЕМОСТЬ ==========

export const getTodayAttendance = async () => {
  const response = await api.get('/api/attendance/today');
  return response.data;
};

export const getAttendanceJournal = async (startDate, endDate) => {
  const params = new URLSearchParams();
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);

  const response = await api.get(`/api/attendance/journal?${params}`);
  return response.data;
};

export const updateAttendance = async (id, inTime, outTime) => {
  const payload = {};
  // Проверяем именно на undefined, чтобы null (удаление) тоже попадал в payload
  if (inTime !== undefined) payload.in_time = inTime;
  if (outTime !== undefined) payload.out_time = outTime;

  const response = await api.put(`/api/attendance/${id}`, payload);
  return response.data;
};

export const deleteAttendance = async (id) => {
  const response = await api.delete(`/api/attendance/${id}`);
  return response.data;
};

export const getLatestAttendance = async () => {
  const response = await api.get('/api/attendance/latest');
  return response.data;
};

export const createAttendance = async (attendance) => {
  const response = await api.post('/api/attendance', attendance);
  return response.data;
};

// ========== ЗАРПЛАТА ==========

export const calculatePayroll = async (employeeId, month) => {
  const params = month ? `?month=${month}` : '';
  const response = await api.get(`/api/payroll/${employeeId}${params}`);
  return response.data;
};

// ========== ТРАНЗАКЦИИ ==========

export const createTransaction = async (transaction) => {
  const response = await api.post('/api/transactions', transaction);
  return response.data;
};

export const getEmployeeTransactions = async (employeeId, month = null) => {
  const params = month ? { params: { month } } : {};
  const response = await api.get(`/api/transactions/employee/${employeeId}`, params);
  return response.data;
};

export const deleteTransaction = async (id) => {
  const response = await api.delete(`/api/transactions/${id}`);
  return response.data;
};

// ========== СМАРТ-НАСТРОЙКА ==========

export const adjustHours = async (employeeId, month, targetHours) => {
  const response = await api.post('/api/payroll/adjust-hours', {
    employee_id: employeeId,
    month: month,
    target_total_hours: targetHours
  });
  return response.data;
};

export const adjustPoints = async (employeeId, month, targetPoints) => {
  const response = await api.post('/api/payroll/adjust-points', {
    employee_id: employeeId,
    month: month,
    target_points: targetPoints
  });
  return response.data;
};

// ========== ЛОГИ СКАНИРОВАНИЙ ==========

export const getScanLogs = async (result = null, limit = 200) => {
  const params = new URLSearchParams();
  if (result) params.append('result', result);
  params.append('limit', limit);
  const response = await api.get(`/api/scan-logs?${params}`);
  return response.data;
};

export const clearScanLogs = async (olderThanDays = null) => {
  const params = new URLSearchParams();
  if (olderThanDays !== null) params.append('older_than_days', olderThanDays);
  const response = await api.delete(`/api/scan-logs?${params}`);
  return response.data;
};

// ========== ЛОГ АКТИВНОСТИ КАБИНЕТА ==========

export const getCabinetActivity = async ({ eventType = null, employeeId = null, role = null, limit = 300 } = {}) => {
  const params = new URLSearchParams();
  if (eventType) params.append('event_type', eventType);
  if (employeeId != null) params.append('employee_id', employeeId);
  if (role) params.append('role', role);
  params.append('limit', limit);
  const response = await api.get(`/api/cabinet-activity?${params}`);
  return response.data;
};

export const clearCabinetActivity = async (olderThanDays = null) => {
  const params = new URLSearchParams();
  if (olderThanDays !== null) params.append('older_than_days', olderThanDays);
  const response = await api.delete(`/api/cabinet-activity?${params}`);
  return response.data;
};

// ========== УПРАВЛЕНИЕ КАБИНЕТАМИ СОТРУДНИКОВ (для админа) ==========

export const createEmployeeAccount = async (employeeId, username, password) => {
  const response = await api.post(`/api/employees/${employeeId}/account`, { username, password });
  return response.data;
};

export const updateEmployeeAccount = async (employeeId, { username, password }) => {
  const payload = {};
  if (username) payload.username = username;
  if (password) payload.password = password;
  const response = await api.put(`/api/employees/${employeeId}/account`, payload);
  return response.data;
};

export const deleteEmployeeAccount = async (employeeId) => {
  const response = await api.delete(`/api/employees/${employeeId}/account`);
  return response.data;
};

// ========== ЛИЧНЫЙ КАБИНЕТ СОТРУДНИКА (для роли employee) ==========

export const getMyProfile = async () => {
  const response = await api.get('/api/me/profile');
  return response.data;
};

export const getMyAttendance = async (startDate, endDate) => {
  const params = new URLSearchParams();
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  const response = await api.get(`/api/me/attendance?${params}`);
  return response.data;
};

export const getMyPayroll = async (month) => {
  const params = month ? `?month=${month}` : '';
  const response = await api.get(`/api/me/payroll${params}`);
  return response.data;
};

export const getMyTransactions = async (month = null) => {
  const params = month ? `?month=${month}` : '';
  const response = await api.get(`/api/me/transactions${params}`);
  return response.data;
};

export default api;
