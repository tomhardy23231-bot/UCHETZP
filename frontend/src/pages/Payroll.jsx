// pages/Payroll.jsx - Modern Professional Payslip Design
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import { useTtlLocalStorage } from '../hooks/useTtlLocalStorage';
import {
  TrendingUp, TrendingDown, Wallet, Target, Clock,
  ArrowLeft, UserRound, AlertTriangle, Trash2, Search,
  Banknote, ReceiptText, History, Printer, FileSpreadsheet,
  Eye, EyeOff, ChevronLeft, ChevronRight, Lock, LockOpen,
} from 'lucide-react';

const RATES_REVEAL_TIMEOUT_MS = 20000;
import { downloadCsv } from '../utils/exportCsv';
import {
  getEmployees, calculatePayroll, createTransaction, getEmployeeTransactions,
  deleteTransaction, adjustHours, adjustPoints,
  getClosedMonths, closePayrollMonth, reopenPayrollMonth,
} from '../api/client';
import PayslipTemplate from '../components/PayslipTemplate';
import TransactionModal from '../components/payroll/TransactionModal';
import Modal from '../components/ui/Modal';
import Button from '../components/ui/Button';
import Avatar from '../components/ui/Avatar';
import toast from 'react-hot-toast';

const Payroll = () => {
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [payrollData, setPayrollData] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useTtlLocalStorage('app_shared_month', new Date().toISOString().slice(0, 7));
  const [totalPayroll, setTotalPayroll] = useState({ totalBase: 0, toPay: 0, loading: false });
  const [searchQuery, setSearchQuery] = useState('');

  // Универсальная модалка транзакций — null когда закрыта, иначе 'BONUS' | 'ADVANCE' | 'FINE' | 'POINTS'
  const [transactionModalType, setTransactionModalType] = useState(null);
  const [showHoursModal, setShowHoursModal] = useState(false);
  const [showAdjustPointsModal, setShowAdjustPointsModal] = useState(false);
  const [showBonusesListModal, setShowBonusesListModal] = useState(false);

  // Закрытые расчётные месяцы (Set из YYYY-MM). Подгружается при маунте и
  // обновляется после успешного close/reopen.
  const [closedMonths, setClosedMonths] = useState(() => new Set());
  const isCurrentMonthClosed = closedMonths.has(selectedMonth);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showReopenConfirm, setShowReopenConfirm] = useState(false);

  const refreshClosedMonths = useCallback(async () => {
    try {
      const data = await getClosedMonths();
      setClosedMonths(new Set(data.map((c) => c.month)));
    } catch (e) {
      console.error('Не удалось загрузить список закрытых месяцев:', e);
    }
  }, []);

  // Приватность: ставки скрыты, пока админ не тапнет глаз. Авто-скрытие через 20с.
  const [ratesRevealed, setRatesRevealed] = useState(false);
  useEffect(() => {
    if (!ratesRevealed) return;
    const t = setTimeout(() => setRatesRevealed(false), RATES_REVEAL_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [ratesRevealed]);

  // Состояния для модалок корректировки часов/баллов
  const [targetHours, setTargetHours] = useState('');
  const [targetPoints, setTargetPoints] = useState('');

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getEmployees();
      setEmployees(data);
    } catch (error) {
      console.error('Ошибка загрузки сотрудников:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTotalPayroll = useCallback(async () => {
    setTotalPayroll(prev => ({ ...prev, loading: true }));
    try {
      const payrolls = await Promise.all(
        employees.map(emp => calculatePayroll(emp.id, selectedMonth))
      );
      const totalBase = payrolls.reduce((sum, p) => sum + (p.base_rate || 0) + (p.piecework_sum || 0) + (p.bonuses_total || 0), 0);
      const toPay = payrolls.reduce((sum, p) => sum + (p.to_pay || 0), 0);
      setTotalPayroll({ totalBase, toPay, loading: false });
    } catch (error) {
      console.error('Ошибка расчёта общей суммы:', error);
      setTotalPayroll({ totalBase: 0, toPay: 0, loading: false });
    }
  }, [employees, selectedMonth]);

  const formatMonth = (monthStr) => {
    const [year, month] = monthStr.split('-');
    const date = new Date(year, month - 1);
    return date.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  };

  const printRef = useRef(null);
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Payslip - ${selectedEmployee?.name} - ${formatMonth(selectedMonth)}`,
  });

  // Экспорт расчётного листа одного сотрудника
  const exportCurrentPayslip = useCallback(() => {
    if (!selectedEmployee || !payrollData) return;
    const rows = [
      ['Сотрудник', selectedEmployee.name],
      ['Должность', selectedEmployee.position],
      ['Месяц', formatMonth(selectedMonth)],
      ['', ''],
      ['Часов отработано', payrollData.total_hours_worked?.toFixed(2)],
      ['Часовая ставка (грн)', payrollData.hourly_rate?.toFixed(2)],
      ['Базовая зарплата (грн)', payrollData.base_rate?.toFixed(2)],
      ['Баллов', payrollData.total_points?.toFixed(2)],
      ['Цена балла (грн)', selectedEmployee.point_val?.toFixed(2)],
      ['Сдельная (грн)', payrollData.piecework_sum?.toFixed(2)],
      ['Премии (грн)', payrollData.bonuses_total?.toFixed(2)],
      ['Авансы (грн)', payrollData.advances_total?.toFixed(2)],
      ['Штрафы (грн)', payrollData.fines_total?.toFixed(2)],
      ['К ВЫПЛАТЕ (грн)', payrollData.to_pay?.toFixed(2)],
    ];
    downloadCsv(
      `Payslip_${selectedEmployee.name}_${selectedMonth}`,
      ['Параметр', 'Значение'],
      rows
    );
    toast.success('Файл скачан');
  }, [selectedEmployee, payrollData, selectedMonth]);

  // Экспорт всех сотрудников за месяц одной таблицей
  const exportAllPayroll = useCallback(async () => {
    try {
      toast.loading('Готовим файл...', { id: 'csv' });
      const payrolls = await Promise.all(
        employees.map((emp) => calculatePayroll(emp.id, selectedMonth))
      );
      const headers = [
        'ФИО', 'Должность', 'Часов', 'Часовая ставка (грн)',
        'База (грн)', 'Баллов', 'Сдельная (грн)',
        'Премии (грн)', 'Авансы (грн)', 'Штрафы (грн)',
        'К ВЫПЛАТЕ (грн)', 'Номер счёта',
      ];
      const rows = payrolls.map((p, idx) => {
        const emp = employees[idx];
        return [
          p.employee_name,
          emp.position,
          p.total_hours_worked?.toFixed(2),
          p.hourly_rate?.toFixed(2),
          p.base_rate?.toFixed(2),
          p.total_points?.toFixed(2),
          p.piecework_sum?.toFixed(2),
          p.bonuses_total?.toFixed(2),
          p.advances_total?.toFixed(2),
          p.fines_total?.toFixed(2),
          p.to_pay?.toFixed(2),
          emp.bank_acc || '',
        ];
      });
      // Итог
      const totalToPay = payrolls.reduce((s, p) => s + (p.to_pay || 0), 0);
      rows.push([]);
      rows.push(['ИТОГО К ВЫПЛАТЕ', '', '', '', '', '', '', '', '', '', totalToPay.toFixed(2), '']);

      downloadCsv(`Payroll_${selectedMonth}`, headers, rows);
      toast.success('Файл скачан', { id: 'csv' });
    } catch (e) {
      toast.error('Не удалось сделать экспорт: ' + e.message, { id: 'csv' });
    }
  }, [employees, selectedMonth]);

  useEffect(() => {
    loadEmployees();
    refreshClosedMonths();
  }, [loadEmployees, refreshClosedMonths]);

  useEffect(() => {
    if (employees.length > 0) {
      loadTotalPayroll();
    }
  }, [loadTotalPayroll]);

  const filteredEmployees = employees.filter(emp =>
    emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.position.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Загрузка расчёта и транзакций сотрудника за конкретный месяц
  const loadEmployeeData = useCallback(async (employee, month) => {
    if (!employee) return;
    try {
      const [payroll, trans] = await Promise.all([
        calculatePayroll(employee.id, month),
        getEmployeeTransactions(employee.id, month)
      ]);
      setPayrollData(payroll);
      setTransactions(trans);
      setTargetHours(payroll.total_hours_worked.toString());
      setTargetPoints(payroll.total_points?.toString() || '0');
    } catch (error) {
      console.error('Ошибка загрузки данных:', error);
    }
  }, []);

  const selectEmployee = useCallback((employee) => {
    setSelectedEmployee(employee);
  }, []);

  // Перезагружаем данные при выборе сотрудника или смене месяца внутри карточки
  useEffect(() => {
    if (!selectedEmployee) return;
    loadEmployeeData(selectedEmployee, selectedMonth);
  }, [selectedEmployee, selectedMonth, loadEmployeeData]);

  const backToList = useCallback(() => {
    setSelectedEmployee(null);
    setPayrollData(null);
    setTransactions([]);
  }, []);

  const handlePrevMonth = useCallback(() => {
    const d = new Date(selectedMonth + '-02');
    d.setMonth(d.getMonth() - 1);
    setSelectedMonth(d.toISOString().slice(0, 7));
  }, [selectedMonth, setSelectedMonth]);

  const handleNextMonth = useCallback(() => {
    const d = new Date(selectedMonth + '-02');
    d.setMonth(d.getMonth() + 1);
    setSelectedMonth(d.toISOString().slice(0, 7));
  }, [selectedMonth, setSelectedMonth]);

  const handleCloseMonth = useCallback(async () => {
    try {
      await closePayrollMonth(selectedMonth);
      await refreshClosedMonths();
      setShowCloseConfirm(false);
      // Обновим текущие данные, чтобы is_closed подтянулся
      if (selectedEmployee) {
        await loadEmployeeData(selectedEmployee, selectedMonth);
      }
      loadTotalPayroll();
      toast.success('Месяц закрыт. Редактирование заблокировано.');
    } catch (e) {
      toast.error('Не удалось закрыть месяц: ' + (e.response?.data?.detail || e.message));
    }
  }, [selectedMonth, refreshClosedMonths, selectedEmployee, loadEmployeeData, loadTotalPayroll]);

  const handleReopenMonth = useCallback(async () => {
    try {
      await reopenPayrollMonth(selectedMonth);
      await refreshClosedMonths();
      setShowReopenConfirm(false);
      if (selectedEmployee) {
        await loadEmployeeData(selectedEmployee, selectedMonth);
      }
      loadTotalPayroll();
      toast.success('Закрытие снято. Редактирование разблокировано.');
    } catch (e) {
      toast.error('Не удалось снять закрытие: ' + (e.response?.data?.detail || e.message));
    }
  }, [selectedMonth, refreshClosedMonths, selectedEmployee, loadEmployeeData, loadTotalPayroll]);

  // Стрелочный селектор месяца — общий для master- и detail-видов.
  // Когда месяц закрыт, селектор подкрашивается янтарём и слева появляется замок.
  const monthSelector = (
    <div className={`flex items-center rounded-md h-9 border transition-colors ${
      isCurrentMonthClosed
        ? 'bg-amber-50 border-amber-200'
        : 'bg-white border-slate-200'
    }`}>
      <button
        type="button"
        onClick={handlePrevMonth}
        className="px-2 h-full text-slate-500 hover:text-slate-900 hover:bg-white/50 rounded-l-md transition-colors"
        aria-label="Предыдущий месяц"
      >
        <ChevronLeft size={16} />
      </button>
      <span className={`px-3 text-sm font-medium capitalize min-w-[140px] text-center inline-flex items-center justify-center gap-1.5 ${
        isCurrentMonthClosed ? 'text-amber-800' : 'text-slate-900'
      }`}>
        {isCurrentMonthClosed && <Lock size={12} className="text-amber-600 flex-shrink-0" />}
        {formatMonth(selectedMonth)}
      </span>
      <button
        type="button"
        onClick={handleNextMonth}
        className="px-2 h-full text-slate-500 hover:text-slate-900 hover:bg-white/50 rounded-r-md transition-colors"
        aria-label="Следующий месяц"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );

  // Кнопка «Закрыть/Открыть месяц» — общая для обоих видов
  const closureButton = isCurrentMonthClosed ? (
    <Button
      variant="secondary"
      size="sm"
      icon={LockOpen}
      onClick={() => setShowReopenConfirm(true)}
      title="Снять закрытие месяца"
      className="flex-shrink-0"
    >
      <span className="hidden sm:inline">Открыть</span>
    </Button>
  ) : (
    <Button
      variant="secondary"
      size="sm"
      icon={Lock}
      onClick={() => setShowCloseConfirm(true)}
      title="Закрыть расчётный месяц — заблокирует редактирование"
      className="flex-shrink-0"
    >
      <span className="hidden sm:inline">Закрыть</span>
    </Button>
  );

  const openTransactionModal = useCallback((type) => {
    setTransactionModalType(type);
  }, []);

  const closeAllModals = useCallback(() => {
    setTransactionModalType(null);
    setShowHoursModal(false);
    setShowAdjustPointsModal(false);
    setShowBonusesListModal(false);
  }, []);

  const handleTransactionSubmit = useCallback(async (data) => {
    try {
      await createTransaction({
        employee_id: selectedEmployee.id,
        type: transactionModalType,
        ...data,
      });
      await loadEmployeeData(selectedEmployee, selectedMonth);
      loadTotalPayroll();
      closeAllModals();
      toast.success('Сохранено');
    } catch (error) {
      toast.error('Ошибка: ' + (error.response?.data?.detail || error.message));
    }
  }, [transactionModalType, selectedEmployee, selectedMonth, loadEmployeeData, closeAllModals, loadTotalPayroll]);

  const handleDeleteTransaction = useCallback(async (id) => {
    if (confirm('Удалить эту запись?')) {
      try {
        await deleteTransaction(id);
        await loadEmployeeData(selectedEmployee, selectedMonth);
        loadTotalPayroll();
        toast.success('Запись удалена');
      } catch (error) {
        toast.error('Ошибка удаления: ' + (error.response?.data?.detail || error.message));
      }
    }
  }, [loadEmployeeData, selectedEmployee, selectedMonth, loadTotalPayroll]);

  const handleAdjustHours = useCallback(async (e) => {
    e.preventDefault();
    try {
      const result = await adjustHours(selectedEmployee.id, selectedMonth, parseFloat(targetHours));
      await loadEmployeeData(selectedEmployee, selectedMonth);
      loadTotalPayroll();
      closeAllModals();
      toast.success(result.message);
    } catch (error) {
      toast.error('Ошибка: ' + (error.response?.data?.detail || error.message));
    }
  }, [selectedEmployee, selectedMonth, targetHours, loadEmployeeData, closeAllModals, loadTotalPayroll]);

  const handleAdjustPoints = useCallback(async (e) => {
    e.preventDefault();
    try {
      const result = await adjustPoints(selectedEmployee.id, selectedMonth, parseFloat(targetPoints));
      await loadEmployeeData(selectedEmployee, selectedMonth);
      loadTotalPayroll();
      closeAllModals();
      toast.success(result.message);
    } catch (error) {
      toast.error('Ошибка: ' + (error.response?.data?.detail || error.message));
    }
  }, [selectedEmployee, selectedMonth, targetPoints, loadEmployeeData, closeAllModals, loadTotalPayroll]);

  const getTransactionIcon = (type) => {
    switch (type) {
      case 'bonus': return <TrendingUp size={16} className="text-emerald-500" />;
      case 'advance': return <Wallet size={16} className="text-orange-500" />;
      case 'fine': return <TrendingDown size={16} className="text-rose-500" />;
      case 'points': return <Target size={16} className="text-purple-500" />;
      default: return null;
    }
  };

  const getTransactionLabel = (type) => {
    switch (type) {
      case 'bonus': return 'Премия';
      case 'advance': return 'Аванс';
      case 'fine': return 'Штраф';
      case 'points': return 'Сдельная';
      default: return type;
    }
  };

  // Фактическая дата создания (created_at) — момент, когда админ нажал «Добавить».
  // Поле trans.date теперь несёт месяц-бакет (всегда 1-е число) и для UI
  // не показательно. Если по какой-то причине created_at нет — фоллбек на date.
  const formatTransactionDate = (trans) => {
    const raw = trans.created_at || trans.date;
    if (!raw) return '';
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  // --- MODALS ---
  // Универсальная модалка транзакций (Премия / Аванс / Штраф / Сдельная) — один компонент
  const transactionModal = (
    <TransactionModal
      open={transactionModalType !== null}
      type={transactionModalType}
      onClose={closeAllModals}
      defaultDate={`${selectedMonth}-01`}
      pointValue={selectedEmployee?.point_val}
      onSubmit={handleTransactionSubmit}
    />
  );

  const HoursModal = useMemo(() => (
    <Modal open={showHoursModal} onClose={closeAllModals} title="Корректировка часов" icon={Clock}>
      <form onSubmit={handleAdjustHours} className="p-5 space-y-4">
        <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-sm text-slate-600">
          Текущее: <span className="font-mono font-semibold text-slate-900">{payrollData?.total_hours_worked?.toFixed(2) || '0.00'}</span> ч
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 uppercase tracking-wider mb-1.5">Целевые часы *</label>
          <input type="number" step="0.01" min="0" required value={targetHours} onChange={(e) => setTargetHours(e.target.value)} className="w-full h-9 px-3 bg-white border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" placeholder="168.00" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={closeAllModals}>Отмена</Button>
          <Button type="submit" variant="primary">Применить</Button>
        </div>
      </form>
    </Modal>
  ), [showHoursModal, targetHours, payrollData, closeAllModals, handleAdjustHours]);

  const AdjustPointsModal = useMemo(() => (
    <Modal open={showAdjustPointsModal} onClose={closeAllModals} title="Корректировка баллов" icon={Target}>
      <form onSubmit={handleAdjustPoints} className="p-5 space-y-4">
        <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-sm text-slate-600">
          Текущее: <span className="font-mono font-semibold text-slate-900">{payrollData?.total_points?.toFixed(2) || '0.00'}</span> баллов
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 uppercase tracking-wider mb-1.5">Целевые баллы *</label>
          <input type="number" step="0.01" min="0" required value={targetPoints} onChange={(e) => setTargetPoints(e.target.value)} className="w-full h-9 px-3 bg-white border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" placeholder="1000.00" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={closeAllModals}>Отмена</Button>
          <Button type="submit" variant="primary">Применить</Button>
        </div>
      </form>
    </Modal>
  ), [showAdjustPointsModal, targetPoints, payrollData, closeAllModals, handleAdjustPoints]);

  const BonusesListModal = useMemo(() => {
    const bonusTransactions = transactions.filter(t => t.type === 'bonus' || t.type === 'fine');
    return (
      <Modal open={showBonusesListModal} onClose={closeAllModals} title="Премии и штрафы" icon={ReceiptText} size="lg">
        {bonusTransactions.length === 0 ? (
          <div className="p-12 text-center">
            <AlertTriangle size={28} className="mx-auto mb-2 text-slate-300" />
            <p className="text-sm text-slate-500">Нет записей</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {bonusTransactions.map((trans) => (
              <li key={trans.id} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50/60">
                <div className="flex items-center gap-2.5 min-w-0">
                  {getTransactionIcon(trans.type)}
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900">{getTransactionLabel(trans.type)}</div>
                    <div className="text-xs text-slate-500 truncate max-w-[260px]">{trans.comment || '—'}</div>
                    <div className="text-[11px] text-slate-400 font-mono mt-0.5">{formatTransactionDate(trans)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`font-mono font-semibold text-sm ${trans.type === 'fine' ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {trans.type === 'fine' ? '-' : '+'}{trans.amount.toFixed(2)} ₴
                  </div>
                  {!isCurrentMonthClosed && (
                    <button onClick={() => handleDeleteTransaction(trans.id)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    );
  }, [showBonusesListModal, transactions, closeAllModals, handleDeleteTransaction, isCurrentMonthClosed]);

  const CloseMonthConfirmModal = useMemo(() => (
    <Modal open={showCloseConfirm} onClose={() => setShowCloseConfirm(false)} title="Закрыть месяц" icon={Lock} size="md">
      <div className="p-5 space-y-4">
        <p className="text-sm text-slate-700 leading-relaxed">
          Закроется месяц <span className="font-semibold capitalize text-slate-900">{formatMonth(selectedMonth)}</span>.
          Все расчёты по нему будут зафиксированы:
        </p>
        <ul className="text-xs text-slate-600 space-y-1 list-disc pl-5">
          <li>Ставки сотрудников на этот месяц замораживаются (изменение в карточке не повлияет на прошлый расчёт)</li>
          <li>Нельзя добавлять, удалять или править премии/авансы/штрафы/сдельную</li>
          <li>Нельзя пересчитать часы и баллы</li>
        </ul>
        <p className="text-xs text-slate-500">
          В любой момент можно снять закрытие кнопкой «Открыть».
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={() => setShowCloseConfirm(false)}>Отмена</Button>
          <Button type="button" variant="primary" icon={Lock} onClick={handleCloseMonth}>Закрыть месяц</Button>
        </div>
      </div>
    </Modal>
  ), [showCloseConfirm, selectedMonth, handleCloseMonth]);

  const ReopenMonthConfirmModal = useMemo(() => (
    <Modal open={showReopenConfirm} onClose={() => setShowReopenConfirm(false)} title="Снять закрытие" icon={LockOpen} size="md">
      <div className="p-5 space-y-4">
        <p className="text-sm text-slate-700 leading-relaxed">
          Снять закрытие с месяца <span className="font-semibold capitalize text-slate-900">{formatMonth(selectedMonth)}</span>?
          После этого можно будет снова править все суммы.
        </p>
        <p className="text-xs text-slate-500">
          Зафиксированные ставки в snapshot не удаляются — расчёт остаётся стабильным
          до тех пор, пока ты сам не начнёшь править данные.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={() => setShowReopenConfirm(false)}>Отмена</Button>
          <Button type="button" variant="primary" icon={LockOpen} onClick={handleReopenMonth}>Открыть</Button>
        </div>
      </div>
    </Modal>
  ), [showReopenConfirm, selectedMonth, handleReopenMonth]);

  // ==================== VIEW 1: MASTER LIST ====================
  if (!selectedEmployee) {
    return (
      <div className="min-h-screen px-3 sm:px-6 md:px-8 py-4 md:py-6">
        {/* Header */}
        <div className="mb-4 md:mb-5 flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl md:text-2xl font-semibold text-slate-900 tracking-tight">Зарплата</h1>
            <p className="text-xs md:text-sm text-slate-500 mt-0.5 capitalize">Расчёт за {formatMonth(selectedMonth)}</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap w-full md:w-auto">
            <div className="relative flex-1 md:flex-none min-w-0">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Поиск..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 pl-8 pr-3 bg-white border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none w-full md:w-56"
              />
            </div>
            {monthSelector}
            <button
              type="button"
              onClick={() => setRatesRevealed(v => !v)}
              title={ratesRevealed ? 'Скрыть ставки' : 'Показать ставки'}
              className={`h-9 px-2.5 inline-flex items-center gap-1.5 rounded-md border text-sm font-medium transition-colors ${
                ratesRevealed
                  ? 'bg-slate-900 text-white border-slate-900 hover:bg-slate-800'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {ratesRevealed ? <Eye size={14} /> : <EyeOff size={14} />}
              <span className="hidden sm:inline">Ставки</span>
            </button>
            {closureButton}
            <Button variant="success" size="sm" icon={FileSpreadsheet} onClick={exportAllPayroll} disabled={employees.length === 0}>
              Excel
            </Button>
          </div>
        </div>

        {/* Closed-month banner */}
        {isCurrentMonthClosed && (
          <div className="mb-4 flex items-center gap-2.5 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            <Lock size={16} className="text-amber-600 flex-shrink-0" />
            <span className="flex-1">
              <span className="font-semibold capitalize">{formatMonth(selectedMonth)}</span> закрыт.
              Все суммы зафиксированы, редактирование заблокировано.
            </span>
            <button
              onClick={() => setShowReopenConfirm(true)}
              className="text-xs font-semibold text-amber-700 hover:text-amber-900 underline-offset-2 hover:underline"
            >
              Открыть
            </button>
          </div>
        )}

        {/* Stats */}
        {!totalPayroll.loading && employees.length > 0 && (
          <div className="grid grid-cols-2 gap-2 md:gap-3 mb-4 md:mb-5">
            <div className="bg-white border border-slate-200 rounded-lg p-3 md:p-4 min-w-0">
              <div className="text-[10px] md:text-xs text-slate-500 uppercase tracking-wider font-medium mb-1 truncate">Начислено всего</div>
              <div className="text-lg md:text-2xl font-semibold text-slate-900 font-mono break-all">
                {totalPayroll.totalBase.toFixed(2)} <span className="text-xs md:text-sm text-slate-400">₴</span>
              </div>
            </div>
            <div className="bg-slate-900 text-white border border-slate-900 rounded-lg p-3 md:p-4 min-w-0">
              <div className="text-[10px] md:text-xs text-slate-400 uppercase tracking-wider font-medium mb-1 truncate">К выплате всего</div>
              <div className="text-lg md:text-2xl font-semibold font-mono break-all">
                {totalPayroll.toPay.toFixed(2)} <span className="text-xs md:text-sm text-slate-400">₴</span>
              </div>
            </div>
          </div>
        )}

        {/* Employee list */}
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-slate-200 border-t-slate-900 mx-auto mb-3"></div>
              <p className="text-sm text-slate-500">Загрузка...</p>
            </div>
          ) : filteredEmployees.length === 0 ? (
            <div className="p-12 text-center">
              <UserRound size={32} className="mx-auto mb-2 text-slate-300" />
              <p className="text-sm text-slate-500">Сотрудники не найдены</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {filteredEmployees.map((emp) => (
                <li key={emp.id}>
                  <button
                    onClick={() => selectEmployee(emp)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50/60 transition-colors text-left"
                  >
                    <Avatar name={emp.name} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">{emp.name}</div>
                      <div className="text-xs text-slate-500 truncate">{emp.position}</div>
                    </div>
                    <div className="text-xs text-slate-500 font-mono hidden sm:block tabular-nums">
                      ставка{' '}
                      {ratesRevealed ? (
                        <span className="font-semibold text-slate-700">{emp.rate.toFixed(0)} ₴</span>
                      ) : (
                        <span className="font-semibold text-slate-300 tracking-wider select-none">••••• ₴</span>
                      )}
                    </div>
                    <ArrowLeft className="text-slate-300 rotate-180" size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {transactionModal}{HoursModal}{AdjustPointsModal}{BonusesListModal}{CloseMonthConfirmModal}{ReopenMonthConfirmModal}
      </div>
    );
  }

  // ==================== VIEW 2: PROFESSIONAL DETAIL VIEW ====================

  const totalAccrued = (payrollData?.base_rate || 0) + (payrollData?.piecework_sum || 0) + (payrollData?.bonuses_total || 0);
  const totalDeducted = (payrollData?.advances_total || 0) + (payrollData?.fines_total || 0);
  // Месяц закрыт — все мутирующие действия в карточке отключены
  const editLocked = isCurrentMonthClosed || payrollData?.is_closed === true;

  return (
    <div className="min-h-screen px-3 sm:px-6 md:px-8 py-4 md:py-6">
      {/* Header */}
      <div className="mb-4 md:mb-5">
        {/* Назад на отдельной строке на мобильном для удобного тапа */}
        <div className="flex items-center gap-2 mb-3 md:mb-0 md:hidden">
          <Button variant="secondary" size="sm" icon={ArrowLeft} onClick={backToList}>Назад</Button>
        </div>
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <Button variant="secondary" size="sm" icon={ArrowLeft} onClick={backToList} className="hidden md:inline-flex">Назад</Button>
            <Avatar name={selectedEmployee.name} size="md" />
            <div className="min-w-0 flex-1">
              <h1 className="text-base md:text-xl font-semibold text-slate-900 truncate leading-tight">{selectedEmployee.name}</h1>
              <p className="text-[11px] md:text-xs text-slate-500 truncate">{selectedEmployee.position}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {monthSelector}
            {closureButton}
            <Button variant="secondary" size="sm" icon={Printer} onClick={handlePrint}>PDF</Button>
            <Button variant="success" size="sm" icon={FileSpreadsheet} onClick={exportCurrentPayslip}>Excel</Button>
          </div>
        </div>
      </div>

      {/* Closed-month banner inside employee card */}
      {isCurrentMonthClosed && (
        <div className="mb-4 flex items-center gap-2.5 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <Lock size={16} className="text-amber-600 flex-shrink-0" />
          <span className="flex-1">
            <span className="font-semibold capitalize">{formatMonth(selectedMonth)}</span> закрыт.
            Суммы зафиксированы, кнопки редактирования заблокированы.
          </span>
        </div>
      )}

      {!payrollData ? (
        <div className="py-20 text-center">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-slate-200 border-t-slate-900 mx-auto"></div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Top numbers */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="flex items-center justify-between text-xs text-slate-500 uppercase tracking-wider font-medium mb-1">
                <span>Начислено</span>
                <TrendingUp size={14} className="text-slate-400" />
              </div>
              <div className="text-2xl font-semibold text-slate-900 font-mono">
                {totalAccrued.toFixed(2)} <span className="text-sm text-slate-400">₴</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">оклад + сдельная + премии</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="flex items-center justify-between text-xs text-slate-500 uppercase tracking-wider font-medium mb-1">
                <span>Удержано</span>
                <TrendingDown size={14} className="text-slate-400" />
              </div>
              <div className="text-2xl font-semibold text-slate-900 font-mono">
                −{totalDeducted.toFixed(2)} <span className="text-sm text-slate-400">₴</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">авансы + штрафы</div>
            </div>
            <div className="bg-slate-900 text-white border border-slate-900 rounded-lg p-4">
              <div className="flex items-center justify-between text-xs text-slate-400 uppercase tracking-wider font-medium mb-1">
                <span>К выдаче</span>
                <Wallet size={14} />
              </div>
              <div className="text-2xl font-semibold font-mono">
                {payrollData.to_pay.toFixed(2)} <span className="text-sm text-slate-400">₴</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">{formatMonth(selectedMonth)}</div>
            </div>
          </div>

          {/* Split */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {/* Payslip lines */}
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
                <ReceiptText size={14} className="text-slate-400" />
                <h2 className="text-sm font-semibold text-slate-900">Расчётный лист</h2>
              </div>

              <ul className="divide-y divide-slate-100">
                {/* Hours */}
                <li className="group flex items-center justify-between px-4 py-3 hover:bg-slate-50/60">
                  <div className="flex items-center gap-3 min-w-0">
                    <Clock size={16} className="text-slate-400" />
                    <div>
                      <div className="text-sm font-medium text-slate-900">Оплата по часам</div>
                      <div className="text-xs text-slate-500 font-mono">
                        {payrollData.total_hours_worked.toFixed(2)} ч × {payrollData.hourly_rate.toFixed(2)} ₴/ч
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!editLocked && (
                      <button onClick={() => setShowHoursModal(true)} className="text-xs text-slate-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                        изменить
                      </button>
                    )}
                    <div className="font-mono font-semibold text-slate-900 text-right w-24">{payrollData.base_rate.toFixed(2)} ₴</div>
                  </div>
                </li>

                {/* Piecework */}
                <li className="group flex items-center justify-between px-4 py-3 hover:bg-slate-50/60">
                  <div className="flex items-center gap-3 min-w-0">
                    <Target size={16} className="text-slate-400" />
                    <div>
                      <div className="text-sm font-medium text-slate-900">Сдельная работа</div>
                      <div className="text-xs text-slate-500 font-mono">
                        {payrollData.total_points.toFixed(0)} б × {selectedEmployee.point_val.toFixed(2)} ₴/б
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!editLocked && (
                      <button onClick={() => setShowAdjustPointsModal(true)} className="text-xs text-slate-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                        изменить
                      </button>
                    )}
                    <div className="font-mono font-semibold text-slate-900 text-right w-24">{payrollData.piecework_sum.toFixed(2)} ₴</div>
                  </div>
                </li>

                {/* Bonuses */}
                <li className="flex items-center justify-between px-4 py-3 hover:bg-slate-50/60 cursor-pointer" onClick={() => setShowBonusesListModal(true)}>
                  <div className="flex items-center gap-3">
                    <TrendingUp size={16} className="text-emerald-500" />
                    <div>
                      <div className="text-sm font-medium text-slate-900">Премии</div>
                      <div className="text-xs text-slate-500">поощрения</div>
                    </div>
                  </div>
                  <div className="font-mono font-semibold text-emerald-700 w-24 text-right">+{payrollData.bonuses_total.toFixed(2)} ₴</div>
                </li>

                {/* Advances */}
                <li className="flex items-center justify-between px-4 py-3 hover:bg-slate-50/60">
                  <div className="flex items-center gap-3">
                    <Wallet size={16} className="text-amber-500" />
                    <div>
                      <div className="text-sm font-medium text-slate-900">Авансы</div>
                      <div className="text-xs text-slate-500">выплачено ранее</div>
                    </div>
                  </div>
                  <div className="font-mono font-semibold text-rose-600 w-24 text-right">−{payrollData.advances_total.toFixed(2)} ₴</div>
                </li>

                {/* Fines */}
                <li className="flex items-center justify-between px-4 py-3 hover:bg-slate-50/60 cursor-pointer" onClick={() => setShowBonusesListModal(true)}>
                  <div className="flex items-center gap-3">
                    <AlertTriangle size={16} className="text-rose-500" />
                    <div>
                      <div className="text-sm font-medium text-slate-900">Штрафы</div>
                      <div className="text-xs text-slate-500">взыскания</div>
                    </div>
                  </div>
                  <div className="font-mono font-semibold text-rose-600 w-24 text-right">−{payrollData.fines_total.toFixed(2)} ₴</div>
                </li>
              </ul>

              <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between text-xs text-slate-500">
                <div className="flex gap-4 font-mono">
                  <span>ставка <span className="text-slate-700 font-semibold">{selectedEmployee.rate.toFixed(0)}</span></span>
                  <span>балл <span className="text-slate-700 font-semibold">{selectedEmployee.point_val.toFixed(2)}</span></span>
                </div>
                <span className="text-slate-300 font-mono">id {selectedEmployee.id}</span>
              </div>
            </div>

            {/* Right: actions + history */}
            <div className="space-y-3">
              {/* Actions */}
              <div className="bg-white border border-slate-200 rounded-lg p-3">
                <div className="text-xs text-slate-500 uppercase tracking-wider font-medium px-1 mb-2 flex items-center gap-1.5">
                  Добавить
                  {editLocked && <Lock size={11} className="text-amber-500" />}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <Button variant="secondary" size="sm" icon={Target}        onClick={() => openTransactionModal('POINTS')}  className="justify-start" disabled={editLocked}>Сдельная</Button>
                  <Button variant="secondary" size="sm" icon={TrendingUp}    onClick={() => openTransactionModal('BONUS')}   className="justify-start" disabled={editLocked}>Премия</Button>
                  <Button variant="secondary" size="sm" icon={Banknote}      onClick={() => openTransactionModal('ADVANCE')} className="justify-start" disabled={editLocked}>Аванс</Button>
                  <Button variant="secondary" size="sm" icon={AlertTriangle} onClick={() => openTransactionModal('FINE')}    className="justify-start" disabled={editLocked}>Штраф</Button>
                </div>
                {editLocked && (
                  <p className="mt-2 text-[10px] text-amber-700 leading-snug">
                    Месяц закрыт. Открой его, чтобы вносить изменения.
                  </p>
                )}
              </div>

              {/* History */}
              <div className="bg-white border border-slate-200 rounded-lg flex flex-col max-h-[460px]">
                <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
                  <History size={14} className="text-slate-400" />
                  <h3 className="text-sm font-semibold text-slate-900">История</h3>
                  <span className="text-xs text-slate-400 ml-auto">{transactions.length}</span>
                </div>
                <div className="overflow-y-auto">
                  {transactions.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400">пусто</div>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {transactions.map((trans) => {
                        const isNeg = ['advance', 'fine'].includes(trans.type);
                        return (
                          <li key={trans.id} className="px-3 py-2 group hover:bg-slate-50/60">
                            <div className="flex items-start gap-2">
                              {getTransactionIcon(trans.type)}
                              <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-baseline gap-2">
                                  <span className="text-xs font-medium text-slate-900">{getTransactionLabel(trans.type)}</span>
                                  <span className={`text-sm font-mono font-semibold ${isNeg ? 'text-rose-600' : 'text-emerald-700'}`}>
                                    {isNeg ? '−' : '+'}{trans.amount.toFixed(0)}
                                  </span>
                                </div>
                                {trans.comment && (
                                  <div className="text-[11px] text-slate-500 truncate">{trans.comment}</div>
                                )}
                                <div className="flex items-center justify-between mt-0.5">
                                  <span className="text-[10px] text-slate-400 font-mono">{formatTransactionDate(trans)}</span>
                                  {!editLocked && (
                                    <button onClick={() => handleDeleteTransaction(trans.id)} className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-600 transition-colors">
                                      <Trash2 size={11} />
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modals remain the same */}
      {transactionModal}{HoursModal}{AdjustPointsModal}{BonusesListModal}{CloseMonthConfirmModal}{ReopenMonthConfirmModal}

      {/* Hidden Payslip Template for printing */}
      <div className="hidden">
        {selectedEmployee && payrollData && (
          <PayslipTemplate
            ref={printRef}
            employee={selectedEmployee}
            payrollData={payrollData}
            transactions={transactions}
          />
        )}
      </div>
    </div>
  );
};

export default Payroll;