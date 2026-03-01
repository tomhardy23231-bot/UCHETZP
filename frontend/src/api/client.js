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
  if (inTime) payload.in_time = inTime;
  if (outTime) payload.out_time = outTime;

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

export default api;
