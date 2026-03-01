// pages/Employees.jsx - Modern Soft UI Employees Management
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { UserPlus, Edit2, Trash2, X, CreditCard, Search, UserRound, Briefcase, Phone, DollarSign, Target, Loader2, Signal } from 'lucide-react';
import { getEmployees, createEmployee, updateEmployee, deleteEmployee, getLatestAttendance, deleteAttendance } from '../api/client';

const Employees = () => {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'table'

  // Form state
  const [name, setName] = useState('');
  const [position, setPosition] = useState('');
  const [phone, setPhone] = useState('');
  const [bankAcc, setBankAcc] = useState('');
  const [rate, setRate] = useState('');
  const [pointVal, setPointVal] = useState('');
  const [cardId, setCardId] = useState('');
  
  // Card Input Mode state
  const [isPolling, setIsPolling] = useState(false);
  const pollingRef = useRef(null);

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

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setIsPolling(false);
  }, []);

  const startPolling = useCallback(() => {
    if (isPolling) {
      stopPolling();
      return;
    }

    setIsPolling(true);

    pollingRef.current = setInterval(async () => {
      try {
        const data = await getLatestAttendance();
        if (data && data.card_id) {
          setCardId(data.card_id);
          stopPolling();
        }
      } catch (error) {
        // Игнорируем 404 ошибки опроса
        if (error.response?.status !== 404) {
          console.error('Ошибка опроса карт:', error);
        }
      }
    }, 2000);
  }, [isPolling, stopPolling]);

  const openAddModal = useCallback(() => {
    setEditingEmployee(null);
    setName('');
    setPosition('');
    setPhone('');
    setBankAcc('');
    setRate('');
    setPointVal('');
    setCardId('');
    setShowModal(true);
  }, []);

  const openEditModal = useCallback((employee) => {
    setEditingEmployee(employee);
    setName(employee.name);
    setPosition(employee.position);
    setPhone(employee.phone || '');
    setBankAcc(employee.bank_acc || '');
    setRate(employee.rate.toString());
    setPointVal(employee.point_val.toString());
    setCardId(employee.card_id || '');
    setShowModal(true);
  }, []);

  const closeModal = useCallback(() => {
    stopPolling();
    setShowModal(false);
    setEditingEmployee(null);
  }, [stopPolling]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    try {
      const data = {
        name,
        position,
        phone: phone || null,
        bank_acc: bankAcc || null,
        rate: parseFloat(rate) || 0,
        point_val: parseFloat(pointVal) || 0,
        card_id: cardId || null
      };

      if (editingEmployee) {
        await updateEmployee(editingEmployee.id, data);
      } else {
        await createEmployee(data);
      }

      await loadEmployees();
      closeModal();
    } catch (error) {
      alert('Ошибка: ' + (error.response?.data?.detail || error.message));
    }
  }, [name, position, phone, bankAcc, rate, pointVal, cardId, editingEmployee, loadEmployees, closeModal]);

  const handleDelete = useCallback(async (id) => {
    if (confirm('Удалить сотрудника? Все связанные данные также будут удалены.')) {
      try {
        await deleteEmployee(id);
        await loadEmployees();
      } catch (error) {
        alert('Ошибка удаления: ' + (error.response?.data?.detail || error.message));
      }
    }
  }, [loadEmployees]);

  // Filter employees by search query
  const filteredEmployees = employees.filter(emp =>
    emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.position.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Get avatar background color based on name
  const getAvatarColor = (name) => {
    const colors = [
      'bg-blue-500', 'bg-indigo-500', 'bg-purple-500',
      'bg-emerald-500', 'bg-teal-500', 'bg-cyan-500'
    ];
    const charCode = name.charCodeAt(0);
    return colors[charCode % colors.length];
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      {/* Header - Modern Soft UI */}
      <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-black text-slate-800 mb-2">Сотрудники</h1>
          <p className="text-slate-500">Управление списком сотрудников</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          {/* Search Bar - Modern Soft UI */}
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

          {/* Add Button - Modern Soft UI */}
          <button
            onClick={openAddModal}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl hover:shadow-soft-xl transition-soft font-medium shadow-soft"
          >
            <UserPlus size={20} />
            Добавить
          </button>
        </div>
      </div>

      {/* View Toggle - Modern Soft UI */}
      <div className="mb-6 flex justify-end">
        <div className="bg-white rounded-xl p-1 shadow-soft inline-flex">
          <button
            onClick={() => setViewMode('grid')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-soft ${viewMode === 'grid' ? 'bg-blue-100 text-blue-600' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            Карточки
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-soft ${viewMode === 'table' ? 'bg-blue-100 text-blue-600' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            Таблица
          </button>
        </div>
      </div>

      {/* Grid View - Modern Soft UI */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {loading ? (
            <div className="col-span-full text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-slate-500">Загрузка...</p>
            </div>
          ) : filteredEmployees.length === 0 ? (
            <div className="col-span-full text-center py-12">
              <UserPlus size={48} className="mx-auto mb-4 text-slate-300" />
              <p className="text-slate-500 font-medium">Нет сотрудников</p>
              <p className="text-slate-400 text-sm mt-2">Добавьте первого сотрудника</p>
            </div>
          ) : (
            filteredEmployees.map((emp) => (
              <div key={emp.id} className="bg-white rounded-2xl p-6 shadow-soft hover:shadow-soft-lg transition-soft">
                <div className="flex flex-col items-center text-center">
                  {/* Avatar */}
                  <div className="relative mb-4">
                    <div className={`w-16 h-16 ${getAvatarColor(emp.name)} rounded-full flex items-center justify-center text-white font-bold text-xl shadow-soft`}>
                      {emp.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                    </div>
                    {emp.card_id && (
                        <div className="absolute -bottom-1 -right-1 bg-green-500 rounded-full p-1.5 border-2 border-white" title={`Карта: ${emp.card_id}`}>
                          <CreditCard size={12} className="text-white" />
                        </div>
                    )}
                  </div>

                  {/* Name */}
                  <h3 className="text-lg font-bold text-slate-800 mb-1">{emp.name}</h3>

                  {/* Position */}
                  <p className="text-slate-500 text-sm flex items-center gap-1.5 mb-4">
                    <Briefcase size={14} className="text-slate-400" />
                    {emp.position}
                  </p>

                  {/* Stats */}
                  <div className="w-full grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-emerald-50 rounded-lg p-2">
                      <div className="text-slate-500 mb-1">Ставка</div>
                      <div className="text-emerald-600 font-bold">{emp.rate.toFixed(0)} ₴/мес</div>
                    </div>
                    <div className="bg-indigo-50 rounded-lg p-2">
                      <div className="text-slate-500 mb-1">Очко</div>
                      <div className="text-indigo-600 font-bold">{emp.point_val.toFixed(2)} ₴</div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="w-full mt-4 pt-4 border-t border-slate-100 flex gap-2">
                    <button
                      onClick={() => openEditModal(emp)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 transition-soft text-sm font-medium"
                      title="Редактировать"
                    >
                      <Edit2 size={16} />
                      Редакт.
                    </button>
                    <button
                      onClick={() => handleDelete(emp.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-soft text-sm font-medium"
                      title="Удалить"
                    >
                      <Trash2 size={16} />
                      Удалить
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Table View - Modern Soft UI */}
      {viewMode === 'table' && (
        <div className="bg-white rounded-2xl shadow-soft overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-600 uppercase tracking-wider">
                    Сотрудник
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-600 uppercase tracking-wider">
                    Должность
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-600 uppercase tracking-wider">
                    Телефон
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-600 uppercase tracking-wider">
                    Карта
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-600 uppercase tracking-wider">
                    Ставка
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-600 uppercase tracking-wider">
                    Очко
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-600 uppercase tracking-wider">
                    Действия
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan="7" className="px-6 py-12 text-center text-slate-400">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
                      Загрузка...
                    </td>
                  </tr>
                ) : filteredEmployees.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="px-6 py-12 text-center text-slate-400">
                      <UserPlus size={48} className="mx-auto mb-4 opacity-50" />
                      <p className="font-medium">Нет сотрудников</p>
                      <p className="text-sm mt-2">Добавьте первого сотрудника</p>
                    </td>
                  </tr>
                ) : (
                  filteredEmployees.map((emp) => (
                    <tr key={emp.id} className="hover:bg-slate-50 transition-soft">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 ${getAvatarColor(emp.name)} rounded-full flex items-center justify-center text-white font-bold text-sm`}>
                            {emp.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                          </div>
                          <div className="font-medium text-slate-800">{emp.name}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-600">{emp.position}</td>
                      <td className="px-6 py-4 text-slate-600">{emp.phone || '—'}</td>
                      <td className="px-6 py-4 text-slate-600">
                        {emp.card_id ? (
                          <div className="flex items-center gap-2" title={emp.card_id}>
                            <CreditCard size={16} className="text-green-500" />
                            <span>Есть</span>
                          </div>
                        ) : (
                          <span className='text-slate-400'>Нет</span>
                        )}
                      </td>
                      <td className="px-6 py-4 font-medium text-emerald-600">
                        {emp.rate.toFixed(0)} ₴
                      </td>
                      <td className="px-6 py-4 font-medium text-indigo-600">
                        {emp.point_val.toFixed(2)} ₴
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => openEditModal(emp)}
                            className="p-2.5 bg-blue-100 text-blue-600 hover:bg-blue-200 rounded-lg transition-soft"
                            title="Редактировать"
                          >
                            <Edit2 size={18} />
                          </button>
                          <button
                            onClick={() => handleDelete(emp.id)}
                            className="p-2.5 bg-red-100 text-red-600 hover:bg-red-200 rounded-lg transition-soft"
                            title="Удалить"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal - Modern Soft UI */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative bg-white rounded-2xl shadow-soft-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white px-6 py-5 border-b border-slate-100 flex justify-between items-center z-10">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                {editingEmployee ? (
                  <>
                    <Edit2 size={20} className="text-blue-600" />
                    Редактировать сотрудника
                  </>
                ) : (
                  <>
                    <UserPlus size={20} className="text-blue-600" />
                    Добавить сотрудника
                  </>
                )}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="p-2 hover:bg-slate-100 rounded-lg transition-soft"
              >
                <X size={24} className="text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Name */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-1.5">
                    <UserRound size={16} className="text-slate-500" />
                    ФИО сотрудника *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-soft focus:shadow-soft-lg transition-soft"
                    placeholder="Иванов Иван Иванович"
                  />
                </div>

                {/* Position */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-1.5">
                    <Briefcase size={16} className="text-slate-500" />
                    Должность *
                  </label>
                  <input
                    type="text"
                    required
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-soft focus:shadow-soft-lg transition-soft"
                    placeholder="Менеджер"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-1.5">
                    <Phone size={16} className="text-slate-500" />
                    Телефон
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-soft focus:shadow-soft-lg transition-soft"
                    placeholder="+380 XX XXX XX XX"
                  />
                </div>

                {/* Card ID */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <CreditCard size={16} className="text-slate-500" />
                      Номер карты
                    </span>
                    <button
                      type="button"
                      onClick={startPolling}
                      className={`text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-md transition-all flex items-center gap-1 ${
                        isPolling 
                        ? 'bg-amber-100 text-amber-600 animate-pulse' 
                        : 'bg-slate-100 text-slate-600 hover:bg-blue-100 hover:text-blue-600'
                      }`}
                    >
                      {isPolling ? (
                        <>
                          <Loader2 size={10} className="animate-spin" />
                          Ожидание...
                        </>
                      ) : (
                        <>
                          <Signal size={10} />
                          Режим ввода
                        </>
                      )}
                    </button>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={cardId}
                      onChange={(e) => setCardId(e.target.value)}
                      className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-soft focus:shadow-soft-lg transition-soft ${
                        isPolling ? 'border-amber-300 bg-amber-50/30' : 'border-slate-200'
                      }`}
                      placeholder={isPolling ? "Поднесите карту к сканеру..." : "ID карты доступа"}
                      readOnly={isPolling}
                    />
                    {isPolling && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <div className="flex gap-1">
                          <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                          <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                          <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce"></span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Rate */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-1.5">
                    <DollarSign size={16} className="text-slate-500" />
                    Базовая ставка (грн/мес)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-soft focus:shadow-soft-lg transition-soft"
                    placeholder="10000.00"
                  />
                </div>
                
                {/* Point Value */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-1.5">
                    <Target size={16} className="text-slate-500" />
                    Цена очка (грн)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={pointVal}
                    onChange={(e) => setPointVal(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-soft focus:shadow-soft-lg transition-soft"
                    placeholder="5.00"
                  />
                </div>

                {/* Bank Account */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-1.5">
                    <CreditCard size={16} className="text-slate-500" />
                    Номер счёта (16 цифр)
                  </label>
                  <input
                    type="text"
                    pattern="\d{16}"
                    value={bankAcc}
                    onChange={(e) => setBankAcc(e.target.value.replace(/\D/g, '').slice(0, 16))}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono shadow-soft focus:shadow-soft-lg transition-soft"
                    placeholder="0000 0000 0000 0000"
                    maxLength={16}
                  />
                </div>
              </div>

              {/* Form Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-6 py-3 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-soft font-medium"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl hover:shadow-soft-xl transition-soft font-medium"
                >
                  {editingEmployee ? 'Сохранить' : 'Добавить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Employees;
