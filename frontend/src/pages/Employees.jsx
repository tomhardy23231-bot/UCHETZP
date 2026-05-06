// pages/Employees.jsx — Linear-минимализм
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  UserPlus, Edit2, Trash2, X, CreditCard, Search, UserRound, Briefcase,
  Phone, DollarSign, Target, Loader2, Signal, LayoutGrid, List,
  KeyRound, UserCog, Eye, EyeOff, Copy, Check,
} from 'lucide-react';
import {
  getEmployees, createEmployee, updateEmployee, deleteEmployee,
  getLatestAttendance,
  createEmployeeAccount, updateEmployeeAccount, deleteEmployeeAccount,
} from '../api/client';
import toast from 'react-hot-toast';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Avatar from '../components/ui/Avatar';

const Employees = () => {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  // На мобильном дефолт — карточки (таблица всё равно не влезет)
  const [viewMode, setViewMode] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'grid' : 'table'
  );

  const [name, setName] = useState('');
  const [position, setPosition] = useState('');
  const [phone, setPhone] = useState('');
  const [bankAcc, setBankAcc] = useState('');
  const [rate, setRate] = useState('');
  const [pointVal, setPointVal] = useState('');
  const [cardId, setCardId] = useState('');

  const [isPolling, setIsPolling] = useState(false);
  const pollingRef = useRef(null);

  // Управление личным кабинетом сотрудника
  const [accountTarget, setAccountTarget] = useState(null);
  const [accountUsername, setAccountUsername] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [accountShowPwd, setAccountShowPwd] = useState(false);
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountCopied, setAccountCopied] = useState(false);

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getEmployees();
      setEmployees(data);
    } catch (e) {
      console.error('Не удалось загрузить сотрудников:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadEmployees(); }, [loadEmployees]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = null;
    setIsPolling(false);
  }, []);

  const startPolling = useCallback(() => {
    if (isPolling) { stopPolling(); return; }
    setIsPolling(true);
    pollingRef.current = setInterval(async () => {
      try {
        const data = await getLatestAttendance();
        if (data && data.card_id) { setCardId(data.card_id); stopPolling(); }
      } catch (e) {
        if (e.response?.status !== 404) console.error('Опрос карт:', e);
      }
    }, 2000);
  }, [isPolling, stopPolling]);

  const openAddModal = () => {
    setEditingEmployee(null);
    setName(''); setPosition(''); setPhone(''); setBankAcc('');
    setRate(''); setPointVal(''); setCardId('');
    setShowModal(true);
  };

  const openEditModal = (employee) => {
    setEditingEmployee(employee);
    setName(employee.name);
    setPosition(employee.position);
    setPhone(employee.phone || '');
    setBankAcc(employee.bank_acc || '');
    setRate(employee.rate.toString());
    setPointVal(employee.point_val.toString());
    setCardId(employee.card_id || '');
    setShowModal(true);
  };

  const closeModal = () => {
    stopPolling();
    setShowModal(false);
    setEditingEmployee(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = {
        name, position,
        phone: phone || null,
        bank_acc: bankAcc || null,
        rate: parseFloat(rate) || 0,
        point_val: parseFloat(pointVal) || 0,
        card_id: cardId || null,
      };
      if (editingEmployee) await updateEmployee(editingEmployee.id, data);
      else await createEmployee(data);
      await loadEmployees();
      closeModal();
      toast.success(editingEmployee ? 'Сохранено' : 'Сотрудник добавлен');
    } catch (e) {
      toast.error('Ошибка: ' + (e.response?.data?.detail || e.message));
    }
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`Удалить «${name}»? Все связанные данные удалятся тоже.`)) return;
    try {
      await deleteEmployee(id);
      await loadEmployees();
      toast.success('Сотрудник удалён');
    } catch (e) {
      toast.error('Ошибка удаления: ' + (e.response?.data?.detail || e.message));
    }
  };

  const openAccountModal = (employee) => {
    setAccountTarget(employee);
    setAccountUsername(employee.account_username || '');
    // Если кабинет уже создан и пароль сохранён в открытом виде — пред-заполняем,
    // чтоб админ его видел/копировал. Если кабинета нет или пароль не сохранён — пусто.
    setAccountPassword(employee.account_password || '');
    setAccountShowPwd(false);
    setAccountCopied(false);
  };

  const closeAccountModal = () => {
    setAccountTarget(null);
    setAccountUsername('');
    setAccountPassword('');
    setAccountSaving(false);
    setAccountCopied(false);
  };

  const copyAccountPassword = async () => {
    if (!accountPassword) return;
    try {
      await navigator.clipboard.writeText(accountPassword);
      setAccountCopied(true);
      toast.success('Пароль скопирован');
      setTimeout(() => setAccountCopied(false), 2000);
    } catch {
      toast.error('Не удалось скопировать');
    }
  };

  const submitAccount = async (e) => {
    e.preventDefault();
    if (!accountTarget) return;
    const hasAccount = !!accountTarget.account_username;
    setAccountSaving(true);
    try {
      if (hasAccount) {
        const payload = {};
        if (accountUsername && accountUsername !== accountTarget.account_username) payload.username = accountUsername;
        // Меняем пароль только если он отличается от текущего сохранённого
        if (accountPassword && accountPassword !== (accountTarget.account_password || '')) {
          payload.password = accountPassword;
        }
        if (Object.keys(payload).length === 0) { closeAccountModal(); return; }
        await updateEmployeeAccount(accountTarget.id, payload);
        toast.success('Кабинет обновлён');
      } else {
        if (!accountUsername || !accountPassword) {
          toast.error('Введите логин и пароль');
          setAccountSaving(false);
          return;
        }
        await createEmployeeAccount(accountTarget.id, accountUsername, accountPassword);
        toast.success('Кабинет создан');
      }
      await loadEmployees();
      closeAccountModal();
    } catch (err) {
      toast.error('Ошибка: ' + (err.response?.data?.detail || err.message));
      setAccountSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!accountTarget) return;
    if (!confirm(`Удалить личный кабинет «${accountTarget.name}»? Сотрудник останется, удалится только доступ.`)) return;
    setAccountSaving(true);
    try {
      await deleteEmployeeAccount(accountTarget.id);
      toast.success('Кабинет удалён');
      await loadEmployees();
      closeAccountModal();
    } catch (err) {
      toast.error('Ошибка: ' + (err.response?.data?.detail || err.message));
      setAccountSaving(false);
    }
  };

  const filteredEmployees = employees.filter((emp) =>
    emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.position.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen px-3 sm:px-6 md:px-8 py-4 md:py-6 pt-16 lg:pt-6">
      {/* Header */}
      <div className="mb-4 md:mb-5 flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold text-slate-900 tracking-tight">Сотрудники</h1>
          <p className="text-xs md:text-sm text-slate-500 mt-0.5">{employees.length} человек в системе</p>
        </div>
        <Button variant="primary" icon={UserPlus} onClick={openAddModal}>
          Добавить
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex gap-2 mb-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Поиск..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 pl-8 pr-3 bg-white border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>
        <div className="flex bg-white border border-slate-200 rounded-md p-0.5">
          <button
            onClick={() => setViewMode('table')}
            className={`flex items-center gap-1.5 px-2.5 h-8 rounded text-xs font-medium transition-colors ${viewMode === 'table' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <List size={14} />
            Таблица
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`flex items-center gap-1.5 px-2.5 h-8 rounded text-xs font-medium transition-colors ${viewMode === 'grid' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <LayoutGrid size={14} />
            Карточки
          </button>
        </div>
      </div>

      {/* Table view */}
      {viewMode === 'table' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
          {loading ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-slate-200 border-t-slate-900 mx-auto mb-3"></div>
              <p className="text-sm text-slate-500">Загрузка...</p>
            </div>
          ) : filteredEmployees.length === 0 ? (
            <div className="p-12 text-center">
              <UserPlus size={32} className="mx-auto mb-2 text-slate-300" />
              <p className="text-sm font-semibold text-slate-700">Нет сотрудников</p>
              <p className="text-xs text-slate-500 mt-0.5">Добавьте первого</p>
            </div>
          ) : (
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="text-xs text-slate-500 uppercase tracking-wider bg-slate-50/60">
                  <th className="text-left font-medium px-4 py-2">Сотрудник</th>
                  <th className="text-left font-medium px-4 py-2">Должность</th>
                  <th className="text-left font-medium px-4 py-2">Телефон</th>
                  <th className="text-left font-medium px-4 py-2">Карта</th>
                  <th className="text-left font-medium px-4 py-2">Кабинет</th>
                  <th className="text-right font-medium px-4 py-2">Ставка</th>
                  <th className="text-right font-medium px-4 py-2">Очко</th>
                  <th className="w-24"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEmployees.map((emp) => (
                  <tr key={emp.id} className="group hover:bg-slate-50/60">
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={emp.name} size="sm" />
                        <span className="font-medium text-slate-900 truncate">{emp.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-slate-600">{emp.position}</td>
                    <td className="px-4 py-2 text-slate-600">{emp.phone || <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-2">
                      {emp.card_id ? (
                        <span className="inline-flex items-center gap-1 text-xs font-mono text-slate-600">
                          <CreditCard size={12} className="text-emerald-500" />
                          {emp.card_id.slice(0, 8)}...
                        </span>
                      ) : <span className="text-slate-300 text-xs">не привязана</span>}
                    </td>
                    <td className="px-4 py-2">
                      <button
                        onClick={() => openAccountModal(emp)}
                        className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded transition-colors ${
                          emp.account_username
                            ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
                        }`}
                        title={emp.account_username ? `Логин: ${emp.account_username}` : 'Создать кабинет'}
                      >
                        {emp.account_username ? <KeyRound size={12} /> : <UserCog size={12} />}
                        {emp.account_username || 'нет'}
                      </button>
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-slate-700">{emp.rate.toFixed(0)}</td>
                    <td className="px-4 py-2 text-right font-mono text-slate-700">{emp.point_val.toFixed(2)}</td>
                    <td className="px-2 py-2">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEditModal(emp)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Редактировать">
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => handleDelete(emp.id, emp.name)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors" title="Удалить">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Grid view */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {loading ? (
            <div className="col-span-full p-8 text-center text-slate-500">Загрузка...</div>
          ) : filteredEmployees.length === 0 ? (
            <div className="col-span-full p-8 text-center text-slate-500">Нет сотрудников</div>
          ) : filteredEmployees.map((emp) => (
            <div key={emp.id} className="bg-white border border-slate-200 rounded-lg p-4 hover:border-slate-300 transition-colors">
              <div className="flex items-start gap-3 mb-3">
                <Avatar name={emp.name} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-900 truncate">{emp.name}</div>
                  <div className="text-xs text-slate-500 truncate">{emp.position}</div>
                </div>
                {emp.card_id && <CreditCard size={14} className="text-emerald-500 flex-shrink-0 mt-1" title={emp.card_id} />}
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
                <div>
                  <div className="text-slate-400">Ставка</div>
                  <div className="font-mono text-slate-700">{emp.rate.toFixed(0)} ₴</div>
                </div>
                <div>
                  <div className="text-slate-400">Очко</div>
                  <div className="font-mono text-slate-700">{emp.point_val.toFixed(2)} ₴</div>
                </div>
              </div>
              <button
                onClick={() => openAccountModal(emp)}
                className={`w-full mb-3 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  emp.account_username
                    ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                    : 'bg-slate-50 text-slate-500 hover:bg-slate-100 border border-dashed border-slate-300'
                }`}
                title={emp.account_username ? `Логин: ${emp.account_username}` : 'Создать кабинет'}
              >
                {emp.account_username ? <KeyRound size={12} /> : <UserCog size={12} />}
                <span className="truncate">{emp.account_username ? `Кабинет: ${emp.account_username}` : 'Создать кабинет'}</span>
              </button>
              <div className="flex gap-1.5 pt-3 border-t border-slate-100">
                <Button variant="secondary" size="xs" icon={Edit2} onClick={() => openEditModal(emp)} className="flex-1">
                  Изменить
                </Button>
                <Button variant="ghost" size="xs" icon={Trash2} onClick={() => handleDelete(emp.id, emp.name)}>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      <Modal
        open={showModal}
        onClose={closeModal}
        title={editingEmployee ? 'Изменить сотрудника' : 'Новый сотрудник'}
        icon={editingEmployee ? Edit2 : UserPlus}
        size="2xl"
      >
        <form onSubmit={handleSubmit} className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-600 uppercase tracking-wider mb-1.5">ФИО *</label>
            <input
              required value={name} onChange={(e) => setName(e.target.value)}
              className="w-full h-9 px-3 bg-white border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="Иванов Иван Иванович"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-600 uppercase tracking-wider mb-1.5">Должность *</label>
            <input
              required value={position} onChange={(e) => setPosition(e.target.value)}
              className="w-full h-9 px-3 bg-white border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="Менеджер"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 uppercase tracking-wider mb-1.5">Телефон</label>
            <input
              type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
              className="w-full h-9 px-3 bg-white border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="+380..."
            />
          </div>

          <div>
            <label className="flex items-center justify-between text-xs font-medium text-slate-600 uppercase tracking-wider mb-1.5">
              <span>Номер карты</span>
              <button
                type="button"
                onClick={startPolling}
                className={`text-[10px] tracking-wider font-semibold px-2 py-0.5 rounded transition-colors flex items-center gap-1 ${
                  isPolling ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600 hover:bg-blue-100 hover:text-blue-700'
                }`}
              >
                {isPolling ? <Loader2 size={10} className="animate-spin" /> : <Signal size={10} />}
                {isPolling ? 'Ожидание...' : 'Считать с сканера'}
              </button>
            </label>
            <input
              value={cardId} onChange={(e) => setCardId(e.target.value)}
              readOnly={isPolling}
              className={`w-full h-9 px-3 bg-white border rounded-md text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none ${
                isPolling ? 'border-amber-300 bg-amber-50/30' : 'border-slate-200'
              }`}
              placeholder={isPolling ? 'Поднесите карту к сканеру...' : 'ID карты'}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 uppercase tracking-wider mb-1.5">Ставка (грн/мес)</label>
            <input
              type="number" step="0.01" min="0"
              value={rate} onChange={(e) => setRate(e.target.value)}
              className="w-full h-9 px-3 bg-white border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="10000"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 uppercase tracking-wider mb-1.5">Цена очка (грн)</label>
            <input
              type="number" step="0.01" min="0"
              value={pointVal} onChange={(e) => setPointVal(e.target.value)}
              className="w-full h-9 px-3 bg-white border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="5.00"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-600 uppercase tracking-wider mb-1.5">Номер счёта (16 цифр)</label>
            <input
              pattern="\d{16}" maxLength={16}
              value={bankAcc}
              onChange={(e) => setBankAcc(e.target.value.replace(/\D/g, '').slice(0, 16))}
              className="w-full h-9 px-3 bg-white border border-slate-200 rounded-md text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="0000 0000 0000 0000"
            />
          </div>

          <div className="md:col-span-2 flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="secondary" onClick={closeModal}>Отмена</Button>
            <Button type="submit" variant="primary">{editingEmployee ? 'Сохранить' : 'Добавить'}</Button>
          </div>
        </form>
      </Modal>

      {/* Модалка управления личным кабинетом сотрудника */}
      <Modal
        open={!!accountTarget}
        onClose={accountSaving ? undefined : closeAccountModal}
        title={accountTarget?.account_username ? 'Кабинет сотрудника' : 'Создать кабинет'}
        icon={accountTarget?.account_username ? KeyRound : UserCog}
        size="md"
      >
        {accountTarget && (
          <form onSubmit={submitAccount} className="p-5 space-y-4">
            <div className="bg-slate-50 rounded-md px-3 py-2.5 border border-slate-100">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Сотрудник</p>
              <p className="text-sm font-semibold text-slate-900">{accountTarget.name}</p>
              <p className="text-xs text-slate-500">{accountTarget.position}</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 uppercase tracking-wider mb-1.5">
                Логин {!accountTarget.account_username && <span className="text-rose-500">*</span>}
              </label>
              <input
                type="text"
                value={accountUsername}
                onChange={(e) => setAccountUsername(e.target.value.trim())}
                required={!accountTarget.account_username}
                minLength={3}
                maxLength={50}
                autoComplete="off"
                className="w-full h-10 px-3 bg-white border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="ivanov"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 uppercase tracking-wider mb-1.5">
                Пароль {!accountTarget.account_username && <span className="text-rose-500">*</span>}
                {accountTarget.account_username && accountPassword && (
                  <span className="text-slate-400 normal-case font-normal ml-1">(можно менять)</span>
                )}
              </label>
              <div className="relative">
                <input
                  type={accountShowPwd ? 'text' : 'password'}
                  value={accountPassword}
                  onChange={(e) => setAccountPassword(e.target.value)}
                  required={!accountTarget.account_username}
                  minLength={4}
                  maxLength={100}
                  autoComplete="new-password"
                  className="w-full h-10 pl-3 pr-20 bg-white border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="••••••••"
                />
                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center">
                  {accountTarget.account_username && accountPassword && (
                    <button
                      type="button"
                      onClick={copyAccountPassword}
                      title="Скопировать пароль"
                      className="p-1.5 text-slate-400 hover:text-blue-600"
                    >
                      {accountCopied ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setAccountShowPwd((s) => !s)}
                    title={accountShowPwd ? 'Скрыть' : 'Показать'}
                    className="p-1.5 text-slate-400 hover:text-slate-700"
                  >
                    {accountShowPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              {accountTarget.account_username && !accountPassword && (
                <p className="mt-1.5 text-[11px] text-amber-600">
                  Пароль не сохранён в открытом виде (создан до этого обновления). Введи новый чтобы перезаписать.
                </p>
              )}
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2 pt-3 border-t border-slate-100">
              {accountTarget.account_username ? (
                <Button
                  type="button"
                  variant="danger"
                  size="md"
                  icon={Trash2}
                  onClick={handleDeleteAccount}
                  disabled={accountSaving}
                >
                  Удалить кабинет
                </Button>
              ) : <span className="hidden sm:block" />}

              <div className="flex gap-2 sm:ml-auto">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={closeAccountModal}
                  disabled={accountSaving}
                  className="flex-1 sm:flex-none"
                >
                  Отмена
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={accountSaving}
                  className="flex-1 sm:flex-none"
                >
                  {accountSaving ? <Loader2 className="animate-spin" size={16} /> : (accountTarget.account_username ? 'Сохранить' : 'Создать')}
                </Button>
              </div>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};

export default Employees;
