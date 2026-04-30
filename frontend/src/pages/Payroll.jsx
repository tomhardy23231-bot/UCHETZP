// pages/Payroll.jsx - Modern Professional Payslip Design
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import { useTtlLocalStorage } from '../hooks/useTtlLocalStorage';
import {
  Calculator, Plus, TrendingUp, TrendingDown, Wallet, Target, Clock, X,
  ArrowLeft, UserRound, Briefcase, DollarSign, Timer, UserCheck, AlertTriangle,
  Info, Trash2, UserRoundCheck, UserRoundX, Search, Banknote, ReceiptText,
  History, Percent, Printer, FileSpreadsheet
} from 'lucide-react';
import { downloadCsv } from '../utils/exportCsv';
import { getEmployees, calculatePayroll, createTransaction, getEmployeeTransactions, deleteTransaction, adjustHours, adjustPoints } from '../api/client';
import PayslipTemplate from '../components/PayslipTemplate';
import TransactionModal from '../components/payroll/TransactionModal';
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

  // Состояния для модалок корректировки часов/очков
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

  const getAvatarColor = (name) => {
    // delegate to shared util to avoid duplication
    const colors = ['bg-blue-500', 'bg-indigo-500', 'bg-violet-500', 'bg-emerald-500', 'bg-teal-500', 'bg-cyan-500'];
    const charCode = name?.charCodeAt(0) ?? 0;
    return colors[charCode % colors.length];
  };

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
      ['Очков', payrollData.total_points?.toFixed(2)],
      ['Цена очка (грн)', selectedEmployee.point_val?.toFixed(2)],
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
        'База (грн)', 'Очков', 'Сдельная (грн)',
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
  }, [loadEmployees]);

  useEffect(() => {
    if (employees.length > 0) {
      loadTotalPayroll();
    }
  }, [loadTotalPayroll]);

  const filteredEmployees = employees.filter(emp =>
    emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.position.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectEmployee = useCallback(async (employee) => {
    setSelectedEmployee(employee);
    try {
      const [payroll, trans] = await Promise.all([
        calculatePayroll(employee.id, selectedMonth),
        getEmployeeTransactions(employee.id, selectedMonth)
      ]);
      setPayrollData(payroll);
      setTransactions(trans);
      setTargetHours(payroll.total_hours_worked.toString());
      setTargetPoints(payroll.total_points?.toString() || '0');
    } catch (error) {
      console.error('Ошибка загрузки данных:', error);
    }
  }, [selectedMonth]);

  const backToList = useCallback(() => {
    setSelectedEmployee(null);
    setPayrollData(null);
    setTransactions([]);
  }, []);

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
      await selectEmployee(selectedEmployee);
      loadTotalPayroll();
      closeAllModals();
      toast.success('Сохранено');
    } catch (error) {
      toast.error('Ошибка: ' + (error.response?.data?.detail || error.message));
    }
  }, [transactionModalType, selectedEmployee, selectEmployee, closeAllModals, loadTotalPayroll]);

  const handleDeleteTransaction = useCallback(async (id) => {
    if (confirm('Удалить эту запись?')) {
      try {
        await deleteTransaction(id);
        await selectEmployee(selectedEmployee);
        loadTotalPayroll();
        toast.success('Запись удалена');
      } catch (error) {
        toast.error('Ошибка удаления: ' + (error.response?.data?.detail || error.message));
      }
    }
  }, [selectEmployee, selectedEmployee, loadTotalPayroll]);

  const handleAdjustHours = useCallback(async (e) => {
    e.preventDefault();
    try {
      const result = await adjustHours(selectedEmployee.id, selectedMonth, parseFloat(targetHours));
      await selectEmployee(selectedEmployee);
      loadTotalPayroll();
      closeAllModals();
      toast.success(result.message);
    } catch (error) {
      toast.error('Ошибка: ' + (error.response?.data?.detail || error.message));
    }
  }, [selectedEmployee, selectedMonth, targetHours, selectEmployee, closeAllModals, loadTotalPayroll]);

  const handleAdjustPoints = useCallback(async (e) => {
    e.preventDefault();
    try {
      const result = await adjustPoints(selectedEmployee.id, selectedMonth, parseFloat(targetPoints));
      await selectEmployee(selectedEmployee);
      loadTotalPayroll();
      closeAllModals();
      toast.success(result.message);
    } catch (error) {
      toast.error('Ошибка: ' + (error.response?.data?.detail || error.message));
    }
  }, [selectedEmployee, selectedMonth, targetPoints, selectEmployee, closeAllModals, loadTotalPayroll]);

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

  const HoursModal = useMemo(() => {
    if (!showHoursModal) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeAllModals} />
        <div className="relative bg-white rounded-2xl shadow-soft-xl w-full max-w-md scale-in">
          <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Clock size={20} className="text-blue-600" />
              Корректировка часов
            </h2>
            <button onClick={closeAllModals} className="p-2 hover:bg-slate-100 rounded-lg transition-soft"><X size={20} className="text-slate-400" /></button>
          </div>
          <form onSubmit={handleAdjustHours} className="p-5 space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800 flex items-center gap-2">
              <Clock size={16} /> <span>Текущее: <strong>{payrollData?.total_hours_worked?.toFixed(2) || '0.00'} ч</strong></span>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Целевые часы *</label>
              <input type="number" step="0.01" min="0" required value={targetHours} onChange={(e) => setTargetHours(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="168.00" />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={closeAllModals} className="px-6 py-3 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 font-medium">Отмена</button>
              <button type="submit" className="px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-medium shadow-soft">Применить</button>
            </div>
          </form>
        </div>
      </div>
    );
  }, [showHoursModal, targetHours, payrollData, closeAllModals, handleAdjustHours]);

  const AdjustPointsModal = useMemo(() => {
    if (!showAdjustPointsModal) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeAllModals} />
        <div className="relative bg-white rounded-2xl shadow-soft-xl w-full max-w-md scale-in">
          <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Target size={20} className="text-purple-600" />
              Корректировка очков
            </h2>
            <button onClick={closeAllModals} className="p-2 hover:bg-slate-100 rounded-lg transition-soft"><X size={20} className="text-slate-400" /></button>
          </div>
          <form onSubmit={handleAdjustPoints} className="p-5 space-y-4">
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-sm text-purple-800 flex items-center gap-2">
              <Target size={16} /> <span>Текущее: <strong>{payrollData?.total_points?.toFixed(2) || '0.00'} очков</strong></span>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Целевые очки *</label>
              <input type="number" step="0.01" min="0" required value={targetPoints} onChange={(e) => setTargetPoints(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent" placeholder="1000.00" />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={closeAllModals} className="px-6 py-3 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 font-medium">Отмена</button>
              <button type="submit" className="px-6 py-3 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-xl font-medium shadow-soft">Применить</button>
            </div>
          </form>
        </div>
      </div>
    );
  }, [showAdjustPointsModal, targetPoints, payrollData, closeAllModals, handleAdjustPoints]);

  const BonusesListModal = useMemo(() => {
    if (!showBonusesListModal) return null;
    const bonusTransactions = transactions.filter(t => t.type === 'bonus' || t.type === 'fine');
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeAllModals} />
        <div className="relative bg-white rounded-2xl shadow-soft-xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col scale-in">
          <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <ReceiptText size={20} className="text-slate-600" />
              Детализация: Премии и Штрафы
            </h2>
            <button onClick={closeAllModals} className="p-2 hover:bg-slate-100 rounded-lg transition-soft"><X size={20} className="text-slate-400" /></button>
          </div>
          <div className="p-5 overflow-y-auto flex-1">
            {bonusTransactions.length === 0 ? (
              <div className="text-center py-8">
                <AlertTriangle size={48} className="mx-auto mb-4 text-slate-300" />
                <p className="text-slate-500 font-medium">Нет записей</p>
              </div>
            ) : (
              <div className="space-y-3">
                {bonusTransactions.map((trans) => (
                  <div key={trans.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl shadow-soft hover:shadow-soft-lg transition-soft">
                    <div className="flex items-center gap-3">
                      {getTransactionIcon(trans.type)}
                      <div>
                        <div className="font-medium text-slate-800">{getTransactionLabel(trans.type)}</div>
                        <div className="text-sm text-slate-500 truncate max-w-[200px]">{trans.comment || '—'}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{trans.date}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className={`font-bold text-lg font-mono ${trans.type === 'fine' ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {trans.type === 'fine' ? '-' : '+'}{trans.amount.toFixed(2)}
                      </div>
                      <button onClick={() => handleDeleteTransaction(trans.id)} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-soft"><Trash2 size={16} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }, [showBonusesListModal, transactions, closeAllModals, handleDeleteTransaction]);

  // ==================== VIEW 1: MASTER LIST ====================
  if (!selectedEmployee) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-4xl font-black text-slate-800 mb-2 flex items-center gap-3">
              <Calculator size={32} className="text-blue-600" />
              Расчёт зарплаты
            </h1>
            <p className="text-slate-500">Управление начислениями и выплатами</p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full md:w-auto">
            <div className="relative w-full sm:w-80">
              <Search size={18} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Поиск сотрудников..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-white rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-soft focus:shadow-soft-lg transition-soft"
              />
            </div>
            <div className="bg-white rounded-xl p-3 shadow-soft">
              <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="text-slate-800 font-medium focus:outline-none" />
            </div>
            <button
              onClick={exportAllPayroll}
              disabled={employees.length === 0}
              className="flex items-center gap-2 px-4 py-3 bg-emerald-600 text-white rounded-xl shadow-soft hover:bg-emerald-700 transition-soft font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              title="Скачать таблицу всех сотрудников за месяц"
            >
              <FileSpreadsheet size={18} />
              Excel
            </button>
          </div>
        </div>

        {!totalPayroll.loading && employees.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="bg-gradient-to-br from-white to-blue-50 rounded-2xl p-6 shadow-soft hover:shadow-soft-lg transition-soft border border-blue-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-600/80 text-sm font-bold uppercase tracking-wide mb-2">Начислено всего</p>
                  <p className="text-4xl font-black text-slate-800">{totalPayroll.totalBase.toFixed(2)} <span className="text-2xl text-slate-400">₴</span></p>
                </div>
                <div className="w-14 h-14 bg-blue-500 rounded-2xl shadow-lg shadow-blue-500/30 flex items-center justify-center text-white">
                  <TrendingUp size={28} />
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-6 shadow-soft-xl hover:shadow-soft-2xl transition-soft text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-emerald-100 text-sm font-bold uppercase tracking-wide mb-2">К выплате всего</p>
                  <p className="text-4xl font-black text-white">{totalPayroll.toPay.toFixed(2)} <span className="text-2xl text-emerald-200">₴</span></p>
                </div>
                <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center text-white">
                  <Wallet size={28} />
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {loading ? (
            <div className="col-span-full text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-slate-500">Загрузка...</p>
            </div>
          ) : filteredEmployees.length === 0 ? (
             <div className="col-span-full text-center py-12">
              <UserRound size={48} className="mx-auto mb-4 text-slate-300" />
              <p className="text-slate-500 font-medium">Сотрудники не найдены</p>
            </div>
          ) : (
            filteredEmployees.map((emp) => (
              <button key={emp.id} onClick={() => selectEmployee(emp)} className="group bg-white rounded-2xl p-6 shadow-soft hover:shadow-soft-xl transition-all duration-300 text-left border border-transparent hover:border-blue-100 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-2 group-hover:translate-x-0">
                   <ArrowLeft className="text-blue-500 rotate-180" size={24} />
                </div>
                <div className="flex items-center gap-4 mb-4">
                  <div className={`w-14 h-14 ${getAvatarColor(emp.name)} rounded-2xl flex items-center justify-center text-white font-bold text-xl shadow-md group-hover:scale-110 transition-transform`}>
                    {emp.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-slate-800 truncate text-lg">{emp.name}</div>
                    <div className="text-sm text-slate-500 flex items-center gap-1.5"><Briefcase size={14} /> {emp.position}</div>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Ставка</div>
                    <div className="font-mono font-bold text-slate-700">{emp.rate.toFixed(0)} ₴</div>
                </div>
              </button>
            ))
          )}
        </div>
        {transactionModal}{HoursModal}{AdjustPointsModal}{BonusesListModal}
      </div>
    );
  }

  // ==================== VIEW 2: PROFESSIONAL DETAIL VIEW ====================
  
  const totalAccrued = (payrollData?.base_rate || 0) + (payrollData?.piecework_sum || 0) + (payrollData?.bonuses_total || 0);
  const totalDeducted = (payrollData?.advances_total || 0) + (payrollData?.fines_total || 0);

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      {/* 1. Header Navigation & Info */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8">
         <div className="flex items-center gap-4">
            <button onClick={backToList} className="p-3 bg-white hover:bg-slate-100 text-slate-600 rounded-xl shadow-soft transition-soft">
                <ArrowLeft size={20} />
            </button>
            <div>
                <h1 className="text-2xl font-black text-slate-800">{selectedEmployee.name}</h1>
                <p className="text-slate-500 text-sm flex items-center gap-2">
                    <Briefcase size={14} /> {selectedEmployee.position}
                    <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                    <span>ID: {selectedEmployee.id}</span>
                </p>
            </div>
         </div>
         <div className="flex items-center gap-3">
            <button
                onClick={handlePrint}
                className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-600 rounded-xl shadow-soft transition-soft"
            >
                <Printer size={20} />
                Печать / PDF
            </button>
            <button
                onClick={exportCurrentPayslip}
                className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-soft transition-soft"
                title="Скачать в Excel"
            >
                <FileSpreadsheet size={20} />
                Excel
            </button>
            <div className="bg-white px-4 py-2 rounded-xl shadow-soft font-bold text-slate-700 flex items-center gap-3">
                <span className="text-slate-400 font-normal">Период:</span>
                <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="bg-transparent focus:outline-none cursor-pointer" />
            </div>
         </div>
      </div>

      {!payrollData ? (
        <div className="h-64 flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      ) : (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            
            {/* 2. Top Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Accrued */}
                <div className="bg-white p-6 rounded-2xl shadow-soft border-l-4 border-blue-500">
                    <div className="flex justify-between items-start mb-2">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Начислено</p>
                        <TrendingUp size={20} className="text-blue-500" />
                    </div>
                    <p className="text-3xl font-mono font-bold text-slate-800">{totalAccrued.toFixed(2)}</p>
                    <p className="text-xs text-slate-400 mt-1">Оклад + Сдельная + Премии</p>
                </div>

                {/* Deducted */}
                <div className="bg-white p-6 rounded-2xl shadow-soft border-l-4 border-rose-500">
                    <div className="flex justify-between items-start mb-2">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Удержано</p>
                        <TrendingDown size={20} className="text-rose-500" />
                    </div>
                    <p className="text-3xl font-mono font-bold text-slate-800">-{totalDeducted.toFixed(2)}</p>
                    <p className="text-xs text-slate-400 mt-1">Авансы + Штрафы</p>
                </div>

                {/* Net Pay */}
                <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-6 rounded-2xl shadow-soft-xl text-white transform hover:scale-[1.02] transition-transform">
                    <div className="flex justify-between items-start mb-2">
                        <p className="text-xs font-bold text-emerald-100 uppercase tracking-wider">К выдаче на руки</p>
                        <Wallet size={20} className="text-white" />
                    </div>
                    <p className="text-4xl font-mono font-black">{payrollData.to_pay.toFixed(2)} <span className="text-2xl opacity-70">₴</span></p>
                    <p className="text-xs text-emerald-100/70 mt-1">Итоговая сумма за {formatMonth(selectedMonth)}</p>
                </div>
            </div>

            {/* 3. Main Split View */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* Left Column: Detailed Payslip (8 cols) */}
                <div className="lg:col-span-8 space-y-6">
                    <div className="bg-white rounded-2xl shadow-soft overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
                            <ReceiptText className="text-slate-400" size={20} />
                            <h2 className="font-bold text-slate-800">Расчетный лист</h2>
                        </div>
                        
                        <div className="p-6 grid gap-8">
                            {/* Section: Earnings */}
                            <div>
                                <h3 className="text-sm font-bold text-emerald-600 uppercase tracking-wide mb-4 flex items-center gap-2">
                                    <Plus size={16} /> Начисления
                                </h3>
                                <div className="space-y-4">
                                    {/* Base Salary Row */}
                                    <div className="flex items-center justify-between p-4 bg-slate-50/50 rounded-xl hover:bg-slate-50 transition-colors group">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center"><Clock size={20} /></div>
                                            <div>
                                                <div className="font-bold text-slate-700">Оплата по часам</div>
                                                <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                                                    <span className="bg-white px-1.5 py-0.5 rounded border border-slate-200">{payrollData.total_hours_worked.toFixed(2)} ч</span>
                                                    <span className="text-slate-400">×</span>
                                                    <span>{payrollData.hourly_rate.toFixed(2)} ₴/ч</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                             <div className="font-mono font-bold text-lg text-slate-800">{payrollData.base_rate.toFixed(2)} ₴</div>
                                             <button onClick={() => setShowHoursModal(true)} className="text-xs text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity font-medium">Изменить часы</button>
                                        </div>
                                    </div>

                                    {/* Piecework Row */}
                                    <div className="flex items-center justify-between p-4 bg-slate-50/50 rounded-xl hover:bg-slate-50 transition-colors group">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 bg-purple-100 text-purple-600 rounded-lg flex items-center justify-center"><Target size={20} /></div>
                                            <div>
                                                <div className="font-bold text-slate-700">Сдельная работа</div>
                                                <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                                                    <span className="bg-white px-1.5 py-0.5 rounded border border-slate-200">{payrollData.total_points.toFixed(0)} б</span>
                                                    <span className="text-slate-400">×</span>
                                                    <span>{selectedEmployee.point_val.toFixed(2)} ₴/б</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="font-mono font-bold text-lg text-slate-800">{payrollData.piecework_sum.toFixed(2)} ₴</div>
                                            <button onClick={() => setShowAdjustPointsModal(true)} className="text-xs text-purple-500 opacity-0 group-hover:opacity-100 transition-opacity font-medium">Корректировать</button>
                                        </div>
                                    </div>

                                    {/* Bonuses Row */}
                                    <div className="flex items-center justify-between p-4 bg-slate-50/50 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => setShowBonusesListModal(true)}>
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center"><TrendingUp size={20} /></div>
                                            <div>
                                                <div className="font-bold text-slate-700">Премии</div>
                                                <div className="text-xs text-slate-500 mt-0.5">Дополнительные поощрения</div>
                                            </div>
                                        </div>
                                        <div className="font-mono font-bold text-lg text-emerald-600">+{payrollData.bonuses_total.toFixed(2)} ₴</div>
                                    </div>
                                </div>
                            </div>

                            <div className="border-t border-slate-100"></div>

                            {/* Section: Deductions */}
                            <div>
                                <h3 className="text-sm font-bold text-rose-600 uppercase tracking-wide mb-4 flex items-center gap-2">
                                    <TrendingDown size={16} /> Удержания
                                </h3>
                                <div className="space-y-4">
                                     {/* Advances Row */}
                                     <div className="flex items-center justify-between p-4 bg-slate-50/50 rounded-xl hover:bg-slate-50 transition-colors">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 bg-orange-100 text-orange-600 rounded-lg flex items-center justify-center"><Wallet size={20} /></div>
                                            <div>
                                                <div className="font-bold text-slate-700">Авансы</div>
                                                <div className="text-xs text-slate-500 mt-0.5">Выплачено ранее</div>
                                            </div>
                                        </div>
                                        <div className="font-mono font-bold text-lg text-rose-600">-{payrollData.advances_total.toFixed(2)} ₴</div>
                                    </div>

                                    {/* Fines Row */}
                                    <div className="flex items-center justify-between p-4 bg-slate-50/50 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => setShowBonusesListModal(true)}>
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 bg-rose-100 text-rose-600 rounded-lg flex items-center justify-center"><AlertTriangle size={20} /></div>
                                            <div>
                                                <div className="font-bold text-slate-700">Штрафы</div>
                                                <div className="text-xs text-slate-500 mt-0.5">Дисциплинарные взыскания</div>
                                            </div>
                                        </div>
                                        <div className="font-mono font-bold text-lg text-rose-600">-{payrollData.fines_total.toFixed(2)} ₴</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        {/* Footer Totals */}
                         <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-between items-center text-sm">
                            <div className="flex gap-6">
                                <div>
                                    <span className="text-slate-500">Ставка:</span> <span className="font-bold text-slate-700">{selectedEmployee.rate.toFixed(0)}</span>
                                </div>
                                <div>
                                    <span className="text-slate-500">Цена очка:</span> <span className="font-bold text-slate-700">{selectedEmployee.point_val.toFixed(2)}</span>
                                </div>
                            </div>
                            <div className="text-slate-400 font-mono text-xs">Generated: {new Date().toLocaleTimeString()}</div>
                         </div>
                    </div>
                </div>

                {/* Right Column: Actions & History (4 cols) */}
                <div className="lg:col-span-4 space-y-6">
                    
                    {/* Quick Actions Panel */}
                    <div className="bg-white rounded-2xl shadow-soft p-5">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Действия</h3>
                        <div className="grid grid-cols-2 gap-3">
                            <button onClick={() => openTransactionModal('POINTS')} className="flex flex-col items-center justify-center p-4 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-xl transition-soft gap-2 border border-purple-100">
                                <Target size={24} />
                                <span className="font-bold text-sm">Сдельная</span>
                            </button>
                            <button onClick={() => openTransactionModal('BONUS')} className="flex flex-col items-center justify-center p-4 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl transition-soft gap-2 border border-emerald-100">
                                <TrendingUp size={24} />
                                <span className="font-bold text-sm">Премия</span>
                            </button>
                             <button onClick={() => openTransactionModal('ADVANCE')} className="flex flex-col items-center justify-center p-4 bg-orange-50 hover:bg-orange-100 text-orange-700 rounded-xl transition-soft gap-2 border border-orange-100">
                                <Banknote size={24} />
                                <span className="font-bold text-sm">Аванс</span>
                            </button>
                             <button onClick={() => openTransactionModal('FINE')} className="flex flex-col items-center justify-center p-4 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl transition-soft gap-2 border border-rose-100">
                                <AlertTriangle size={24} />
                                <span className="font-bold text-sm">Штраф</span>
                            </button>
                        </div>
                    </div>

                    {/* Transaction History Feed */}
                    <div className="bg-white rounded-2xl shadow-soft flex flex-col max-h-[500px]">
                        <div className="p-5 border-b border-slate-100 sticky top-0 bg-white z-10 rounded-t-2xl">
                             <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                <History size={14} /> История операций
                             </h3>
                        </div>
                        <div className="overflow-y-auto p-4 space-y-3 custom-scrollbar">
                            {transactions.length === 0 ? (
                                <div className="text-center py-8 text-slate-400">
                                    <p className="text-sm">История пуста</p>
                                </div>
                            ) : (
                                transactions.map((trans) => (
                                    <div key={trans.id} className="flex gap-3 group">
                                        <div className="mt-1">{getTransactionIcon(trans.type)}</div>
                                        <div className="flex-1 pb-3 border-b border-slate-50 last:border-0 relative">
                                            <div className="flex justify-between items-start">
                                                <div className="font-bold text-sm text-slate-700">{getTransactionLabel(trans.type)}</div>
                                                <div className={`font-mono font-bold text-sm ${['advance', 'fine'].includes(trans.type) ? 'text-rose-600' : 'text-emerald-600'}`}>
                                                    {['advance', 'fine'].includes(trans.type) ? '-' : '+'}{trans.amount.toFixed(0)}
                                                </div>
                                            </div>
                                            <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">{trans.comment || 'Без комментария'}</div>
                                            <div className="text-[10px] text-slate-300 mt-1 flex justify-between items-center">
                                                <span>{trans.date}</span>
                                                <button onClick={() => handleDeleteTransaction(trans.id)} className="text-rose-400 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-opacity p-1"><Trash2 size={12} /></button>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                </div>
            </div>
        </div>
      )}

      {/* Modals remain the same */}
      {transactionModal}{HoursModal}{AdjustPointsModal}{BonusesListModal}

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