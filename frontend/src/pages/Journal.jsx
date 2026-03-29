// pages/Journal.jsx - Modern Soft UI Attendance Journal
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTtlLocalStorage } from '../hooks/useTtlLocalStorage';
import { Calendar, Clock, UserCheck, UserX, AlertTriangle, Info, UserRound, Briefcase, UserRoundCheck, UserRoundX, ChevronLeft, ChevronRight, LayoutGrid, List } from 'lucide-react';
import { getEmployees, getAttendanceJournal, updateAttendance, createAttendance, deleteAttendance } from '../api/client';
import GridView from '../components/GridView';
import TableView from '../components/TableView';
import EmployeeCard from '../components/EmployeeCard';
import AttendanceModal from '../components/AttendanceModal';


const Journal = () => {
  const [employees, setEmployees] = useState([]);
  const [attendanceData, setAttendanceData] = useState({});
  const [draftTimes, setDraftTimes] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useTtlLocalStorage('app_shared_month', new Date().toISOString().slice(0, 7));
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'table'
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEmployeeForModal, setSelectedEmployeeForModal] = useState(null);
  const [photoModalUrl, setPhotoModalUrl] = useState(null);

  const handleCardClick = (employee) => {
    setSelectedEmployeeForModal(employee);
    setIsModalOpen(true);
  };


  // Load employees
  const loadEmployees = useCallback(async () => {
    try {
      const data = await getEmployees();
      setEmployees(data);
    } catch (error) {
      console.error('Ошибка загрузки сотрудников:', error);
    }
  }, []);

  // Load attendance data for selected month
  const loadAttendance = useCallback(async (isPolling = false) => {
    if (!selectedMonth) return;

    if (!isPolling) setLoading(true);
    try {
      const [year, month] = selectedMonth.split('-');
      const startDate = `${year}-${month}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${month}-${lastDay.toString().padStart(2, '0')}`;

      const data = await getAttendanceJournal(startDate, endDate);

      // Group data by date and employee for quick access
      const grouped = {};
      data.forEach((record) => {
        const key = `${record.date}-${record.employee_name}`;
        grouped[key] = record;
      });
      setAttendanceData(grouped);
    } catch (error) {
      console.error('Ошибка загрузки журнала:', error);
    } finally {
      if (!isPolling) setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  useEffect(() => {
    loadAttendance();
    // 3-second polling for real-time updates
    const interval = setInterval(() => loadAttendance(true), 3000);
    return () => clearInterval(interval);
  }, [loadAttendance]);

  // Get all days in month
  const getDaysInMonth = useMemo(() => {
    if (!selectedMonth) return [];
    const [year, month] = selectedMonth.split('-');
    const daysInMonth = new Date(year, month, 0).getDate();
    return Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const dateStr = `${year}-${month}-${day.toString().padStart(2, '0')}`;
      const date = new Date(year, month - 1, day);
      const dayOfWeek = date.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      return {
        date: dateStr,
        dayNum: day,
        isWeekend: isWeekend
      };
    });
  }, [selectedMonth]);

  const handlePrevMonth = () => {
    const currentDate = new Date(selectedMonth + '-02'); // Use day 2 to avoid timezone issues
    currentDate.setMonth(currentDate.getMonth() - 1);
    setSelectedMonth(currentDate.toISOString().slice(0, 7));
  };

  const handleNextMonth = () => {
    const currentDate = new Date(selectedMonth + '-02'); // Use day 2 to avoid timezone issues
    currentDate.setMonth(currentDate.getMonth() + 1);
    setSelectedMonth(currentDate.toISOString().slice(0, 7));
  };

  const normalizeTimeValue = (raw) => {
    if (raw == null) return '';
    const str = String(raw).trim();
    if (!str) return '';
    const digits = str.replace(/\D/g, '').slice(0, 4);

    if (digits.length <= 2) return digits;
    if (digits.length === 3) return `${digits.slice(0, 2)}:${digits.slice(2, 3)}`;
    return `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
  };

  const isValidHHMM = (value) => {
    if (!value) return true;
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  };

  const getDraftKey = (dateStr, employeeId, field) => `${dateStr}-${employeeId}-${field}`;

  // Commit time to server (save on blur/enter)
  const commitTimeChange = async (dateStr, employee, field, value) => {
    const key = `${dateStr}-${employee.name}`;
    const existingRecord = attendanceData[key];

    try {
      const normalized = normalizeTimeValue(value);

      // If user left incomplete value (e.g. "18" or "18:3") - do not save
      if (normalized && !isValidHHMM(normalized)) return;

      const timeValue = normalized ? normalized : null;

      let currentInTime = existingRecord?.in_time || null;
      let currentOutTime = existingRecord?.out_time || null;

      if (field === 'in') currentInTime = timeValue;
      else currentOutTime = timeValue;

      const inTimeISO = currentInTime ? `${dateStr}T${currentInTime}:00` : null;
      const outTimeISO = currentOutTime ? `${dateStr}T${currentOutTime}:00` : null;

      if (existingRecord) {
        // If both fields are empty, physically delete the record
        if (!currentInTime && !currentOutTime) {
          await deleteAttendance(existingRecord.id);
        } else {
          await updateAttendance(existingRecord.id, inTimeISO, outTimeISO);
        }
      } else if (inTimeISO || outTimeISO) {
        await createAttendance({
          employee_id: employee.id,
          date: dateStr,
          in_time: inTimeISO,
          out_time: outTimeISO
        });
      }

      // Clear draft for this field after save
      setDraftTimes((prev) => {
        const copy = { ...prev };
        delete copy[getDraftKey(dateStr, employee.id, field)];
        return copy;
      });

      await loadAttendance();
    } catch (error) {
      console.error('Ошибка сохранения:', error);
      alert('Ошибка сохранения: ' + (error.response?.data?.detail || error.message));
    }
  };

  // Handle paste from clipboard
  const handlePaste = (e, dateStr, employee, field) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    const normalized = normalizeTimeValue(pastedText);

    setDraftTimes((prev) => ({
      ...prev,
      [getDraftKey(dateStr, employee.id, field)]: normalized
    }));

    if (!normalized || isValidHHMM(normalized)) {
      commitTimeChange(dateStr, employee, field, normalized);
    }
  };

  const handleTimeInputChange = (dateStr, employee, field, raw) => {
    const normalized = normalizeTimeValue(raw);
    setDraftTimes((prev) => ({
      ...prev,
      [getDraftKey(dateStr, employee.id, field)]: normalized
    }));
  };

  const handleTimeKeyDown = (e, dateStr, employee, field) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    }
    if (e.key === 'Escape') {
      // revert draft
      setDraftTimes((prev) => {
        const copy = { ...prev };
        delete copy[getDraftKey(dateStr, employee.id, field)];
        return copy;
      });
      e.currentTarget.blur();
    }
  };

  // Calculate duration
  const calculateDuration = (inTimeStr, outTimeStr) => {
    if (!inTimeStr || !outTimeStr) return null;

    try {
      const [inH, inM] = inTimeStr.split(':').map(Number);
      const [outH, outM] = outTimeStr.split(':').map(Number);

      const inMinutes = inH * 60 + inM;
      const outMinutes = outH * 60 + outM;

      if (outMinutes < inMinutes) return null;

      const diffMinutes = outMinutes - inMinutes;
      const hours = Math.floor(diffMinutes / 60);
      const minutes = diffMinutes % 60;

      return `${hours}:${minutes.toString().padStart(2, '0')}`;
    } catch {
      return null;
    }
  };

  // Get record for specific date and employee
  const getRecord = (dateStr, employeeName) => {
    return attendanceData[`${dateStr}-${employeeName}`];
  };

  // Get avatar color based on name
  const getAvatarColor = (name) => {
    const colors = [
      'bg-blue-500', 'bg-indigo-500', 'bg-purple-500',
      'bg-emerald-500', 'bg-teal-500', 'bg-cyan-500'
    ];
    const charCode = name.charCodeAt(0);
    return colors[charCode % colors.length];
  };

  if (loading && employees.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-slate-500 font-medium">Загрузка данных...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      {/* Header - Modern Soft UI */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <h1 className="text-4xl font-black text-slate-800 flex items-center gap-3 shrink-0">
            <Calendar size={32} className="text-blue-600" />
            Журнал
          </h1>

          {/* New Month Selector */}
          <div className="flex items-center gap-2 bg-white rounded-2xl p-2 shadow-soft">
            <button onClick={handlePrevMonth} className="p-2 rounded-lg hover:bg-slate-100 active:bg-slate-200 transition-colors">
              <ChevronLeft size={20} className="text-slate-600" />
            </button>
            <span className="text-slate-800 font-bold text-lg w-32 text-center">
              {new Date(selectedMonth).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}
            </span>
            <button onClick={handleNextMonth} className="p-2 rounded-lg hover:bg-slate-100 active:bg-slate-200 transition-colors">
              <ChevronRight size={20} className="text-slate-600" />
            </button>
          </div>
        </div>

        {/* View Switcher */}
        <div className="flex items-center gap-2 bg-white rounded-2xl p-2 shadow-soft">
          <button
            onClick={() => setViewMode('grid')}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg transition-soft font-semibold
              ${viewMode === 'grid' ? 'bg-blue-500 text-white shadow-soft-lg' : 'text-slate-600 hover:bg-slate-100'}
            `}
          >
            <LayoutGrid size={18} />
            <span>Карточки</span>
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg transition-soft font-semibold
              ${viewMode === 'table' ? 'bg-blue-500 text-white shadow-soft-lg' : 'text-slate-600 hover:bg-slate-100'}
            `}
          >
            <List size={18} />
            <span>Таблица</span>
          </button>
        </div>
      </div>

      {viewMode === 'table' && (
        <TableView
          employees={employees}
          getDaysInMonth={getDaysInMonth}
          getRecord={getRecord}
          draftTimes={draftTimes}
          getDraftKey={getDraftKey}
          handleTimeInputChange={handleTimeInputChange}
          commitTimeChange={commitTimeChange}
          handleTimeKeyDown={handleTimeKeyDown}
          handlePaste={handlePaste}
          isValidHHMM={isValidHHMM}
          calculateDuration={calculateDuration}
          getAvatarColor={getAvatarColor}
          selectedMonth={selectedMonth}
          onPhotoClick={setPhotoModalUrl}
        />
      )}

      {viewMode === 'grid' && (
        <GridView
          employees={employees}
          attendanceData={attendanceData}
          draftTimes={draftTimes}
          getDraftKey={getDraftKey}
          handleTimeInputChange={handleTimeInputChange}
          commitTimeChange={commitTimeChange}
          handleTimeKeyDown={handleTimeKeyDown}
          handlePaste={handlePaste}
          isValidHHMM={isValidHHMM}
          calculateDuration={calculateDuration}
          getAvatarColor={getAvatarColor}
          selectedMonth={selectedMonth}
          getDaysInMonth={getDaysInMonth}
          getRecord={getRecord}
          onCardClick={handleCardClick}
          onPhotoClick={setPhotoModalUrl}
        />
      )}

      {isModalOpen && selectedEmployeeForModal && (
        <AttendanceModal
          employee={selectedEmployeeForModal}
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          getDaysInMonth={getDaysInMonth}
          getRecord={getRecord}
          draftTimes={draftTimes}
          getDraftKey={getDraftKey}
          handleTimeInputChange={handleTimeInputChange}
          commitTimeChange={commitTimeChange}
          handleTimeKeyDown={handleTimeKeyDown}
          handlePaste={handlePaste}
          isValidHHMM={isValidHHMM}
          calculateDuration={calculateDuration}
        />
      )}

      {/* Lightbox for Photos */}
      {photoModalUrl && (
        <div 
          className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setPhotoModalUrl(null)}
        >
          <img 
            src={photoModalUrl} 
            alt="Фото с камеры" 
            className="max-w-[95vw] max-h-[95vh] object-contain rounded-2xl shadow-2xl border-4 border-white transform scale-100 transition-transform duration-300"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
};
export default Journal;
