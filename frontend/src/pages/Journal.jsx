// pages/Journal.jsx - Modern Soft UI Attendance Journal
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTtlLocalStorage } from '../hooks/useTtlLocalStorage';
import { Calendar, Clock, UserCheck, UserX, AlertTriangle, Info, UserRound, Briefcase, UserRoundCheck, UserRoundX, ChevronLeft, ChevronRight, LayoutGrid, List } from 'lucide-react';
import { getEmployees, getAttendanceJournal, updateAttendance, createAttendance, deleteAttendance } from '../api/client';
import GridView from '../components/GridView';
import TableView from '../components/TableView';
import EmployeeCard from '../components/EmployeeCard';
import AttendanceModal from '../components/AttendanceModal';
import toast from 'react-hot-toast';


const Journal = () => {
  const [employees, setEmployees] = useState([]);
  const [attendanceData, setAttendanceData] = useState({});
  const [draftTimes, setDraftTimes] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useTtlLocalStorage('app_shared_month', new Date().toISOString().slice(0, 7));
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'table'
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEmployeeForModal, setSelectedEmployeeForModal] = useState(null);

  // ref-зеркало attendanceData — нужно потому что внутри async commit нам нужен
  // АКТУАЛЬНЫЙ стейт, а не зафиксированный замыканием на момент вызова
  const attendanceDataRef = useRef({});
  // Счётчик коммитов в полёте — пока он > 0, polling не перезатирает локальный стейт
  // (это убирает мигание и "пропадающие у другого" значения)
  const pendingSavesRef = useRef(0);

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

      // Если в этот момент идут несохранённые коммиты — НЕ перезатираем локальный стейт.
      // Иначе свежий запрос с сервера вернёт промежуточное состояние и затрёт
      // ещё-не-долетевшие изменения соседних строк ("пропадает у другого").
      if (pendingSavesRef.current > 0 && isPolling) return;

      attendanceDataRef.current = grouped;
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
    // ВАЖНО: читаем актуальный стейт через ref, а не из замыкания, потому что
    // несколько коммитов могут идти параллельно и closure протухает
    const existingRecord = attendanceDataRef.current[key];

    const normalized = normalizeTimeValue(value);
    // Если осталось неполное значение ("18", "18:3") - не сохраняем
    if (normalized && !isValidHHMM(normalized)) return;

    const timeValue = normalized ? normalized : null;
    let currentInTime = existingRecord?.in_time || null;
    let currentOutTime = existingRecord?.out_time || null;
    if (field === 'in') currentInTime = timeValue;
    else currentOutTime = timeValue;

    // Если ничего не поменялось — нечего сохранять
    const before = field === 'in' ? (existingRecord?.in_time || null) : (existingRecord?.out_time || null);
    if (before === timeValue) {
      // Просто очищаем черновик и выходим
      setDraftTimes((prev) => {
        const copy = { ...prev };
        delete copy[getDraftKey(dateStr, employee.id, field)];
        return copy;
      });
      return;
    }

    const inTimeISO = currentInTime ? `${dateStr}T${currentInTime}:00` : null;
    const outTimeISO = currentOutTime ? `${dateStr}T${currentOutTime}:00` : null;

    // ===== ОПТИМИСТИЧНОЕ ОБНОВЛЕНИЕ =====
    // Сразу обновляем локальный стейт, чтобы UI не "мигал" пока летит запрос на сервер.
    const optimisticRecord = !currentInTime && !currentOutTime
      ? null  // удаление
      : {
          ...(existingRecord || {}),
          id: existingRecord?.id ?? `temp-${Date.now()}-${Math.random()}`,
          date: dateStr,
          employee_name: employee.name,
          in_time: currentInTime,
          out_time: currentOutTime,
        };

    setAttendanceData((prev) => {
      const next = { ...prev };
      if (optimisticRecord === null) delete next[key];
      else next[key] = optimisticRecord;
      attendanceDataRef.current = next;
      return next;
    });

    // Чёрновик можно очистить СРАЗУ — оптимистический record покажет наше значение
    setDraftTimes((prev) => {
      const copy = { ...prev };
      delete copy[getDraftKey(dateStr, employee.id, field)];
      return copy;
    });

    // ===== ОТПРАВКА НА СЕРВЕР =====
    pendingSavesRef.current += 1;
    try {
      if (existingRecord && existingRecord.id && !String(existingRecord.id).startsWith('temp-')) {
        if (!currentInTime && !currentOutTime) {
          await deleteAttendance(existingRecord.id);
        } else {
          await updateAttendance(existingRecord.id, inTimeISO, outTimeISO);
        }
      } else if (inTimeISO || outTimeISO) {
        const created = await createAttendance({
          employee_id: employee.id,
          date: dateStr,
          in_time: inTimeISO,
          out_time: outTimeISO,
        });
        // подменяем temp-id на реальный
        if (created && created.id) {
          setAttendanceData((prev) => {
            const next = { ...prev };
            if (next[key]) {
              next[key] = { ...next[key], id: created.id };
              attendanceDataRef.current = next;
            }
            return next;
          });
        }
      }
    } catch (error) {
      console.error('Ошибка сохранения:', error);
      toast.error('Ошибка сохранения: ' + (error.response?.data?.detail || error.message));
      // Откатываемся: запрашиваем актуальное состояние с сервера
      await loadAttendance();
    } finally {
      pendingSavesRef.current = Math.max(0, pendingSavesRef.current - 1);
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

  // Get avatar color based on name (delegate to shared util)
  const getAvatarColor = (name) => {
    const colors = ['bg-blue-500', 'bg-indigo-500', 'bg-violet-500', 'bg-emerald-500', 'bg-teal-500', 'bg-cyan-500'];
    const charCode = name?.charCodeAt(0) ?? 0;
    return colors[charCode % colors.length];
  };

  if (loading && employees.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-slate-200 border-t-slate-900 mx-auto mb-2"></div>
          <p className="text-sm text-slate-500">Загрузка...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-3 sm:px-6 md:px-8 py-4 md:py-6 pt-16 lg:pt-6">
      {/* Header */}
      <div className="mb-4 md:mb-5 flex items-end justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 md:gap-4 flex-wrap">
          <div>
            <h1 className="text-xl md:text-2xl font-semibold text-slate-900 tracking-tight">Журнал</h1>
            <p className="text-xs md:text-sm text-slate-500 mt-0.5">Посещаемость по дням</p>
          </div>

          {/* Month selector */}
          <div className="flex items-center bg-white border border-slate-200 rounded-md h-9">
            <button onClick={handlePrevMonth} className="px-2 h-full text-slate-500 hover:text-slate-900 hover:bg-slate-50 rounded-l-md transition-colors">
              <ChevronLeft size={16} />
            </button>
            <span className="px-3 text-sm font-medium text-slate-900 capitalize min-w-[120px] sm:min-w-[140px] text-center">
              {new Date(selectedMonth).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}
            </span>
            <button onClick={handleNextMonth} className="px-2 h-full text-slate-500 hover:text-slate-900 hover:bg-slate-50 rounded-r-md transition-colors">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* View switcher */}
        <div className="flex bg-white border border-slate-200 rounded-md p-0.5">
          <button
            onClick={() => setViewMode('grid')}
            className={`flex items-center gap-1.5 px-2.5 h-8 rounded text-xs font-medium transition-colors ${viewMode === 'grid' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <LayoutGrid size={14} />
            <span className="hidden xs:inline">Карточки</span>
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`flex items-center gap-1.5 px-2.5 h-8 rounded text-xs font-medium transition-colors ${viewMode === 'table' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <List size={14} />
            <span className="hidden xs:inline">Таблица</span>
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

    </div>
  );
};
export default Journal;
