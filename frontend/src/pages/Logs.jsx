// pages/Logs.jsx - Журнал сканирований (что приняли, что нет и почему)
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ScrollText, CheckCircle2, AlertTriangle, XCircle, RefreshCw,
  Trash2, Clock, CreditCard, UserRound, Inbox, ServerCrash, Search, Calendar
} from 'lucide-react';
import { getScanLogs, clearScanLogs } from '../api/client';

const TABS = [
  { key: 'success', label: 'Принятые', icon: CheckCircle2, color: 'emerald' },
  { key: 'error',   label: 'Ошибки',   icon: XCircle,      color: 'rose' },
  { key: 'warning', label: 'Игнор/прочее', icon: AlertTriangle, color: 'amber' },
];

const STATUS_LABELS = {
  checked_in:     'Приход',
  checked_out:    'Уход',
  re_checked_out: 'Уход (перезаписан)',
  duplicate:      'Дубликат',
  debounced:      'Игнор (дебаунс)',
  unknown_card:   'Неизвестная карта',
  error:          'Ошибка обработки',
};

const Logs = () => {
  const [activeTab, setActiveTab] = useState('error');
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [todayOnly, setTodayOnly] = useState(false);

  const loadLogs = useCallback(async (resultFilter) => {
    setLoading(true);
    try {
      const data = await getScanLogs(resultFilter, 300);
      setLogs(data);
    } catch (error) {
      console.error('Не удалось загрузить логи:', error);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLogs(activeTab);
    const interval = setInterval(() => loadLogs(activeTab), 5000);
    return () => clearInterval(interval);
  }, [activeTab, loadLogs]);

  // Применяем фильтры на клиенте: поиск по ФИО/карте/тексту + "только сегодня"
  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const todayStr = new Date().toISOString().slice(0, 10);
    return logs.filter((log) => {
      if (todayOnly) {
        const logDate = new Date(log.received_at).toISOString().slice(0, 10);
        if (logDate !== todayStr) return false;
      }
      if (q) {
        const haystack = [
          log.employee_name || '',
          log.card_id || '',
          log.message || '',
        ].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [logs, searchQuery, todayOnly]);

  const handleClear = async () => {
    if (!confirm('Удалить логи старше 30 дней?')) return;
    try {
      const res = await clearScanLogs(30);
      alert(`Удалено записей: ${res.deleted}`);
      loadLogs(activeTab);
    } catch (e) {
      alert('Ошибка: ' + (e.response?.data?.detail || e.message));
    }
  };

  const formatDateTime = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  };

  const getRowColors = (result) => {
    switch (result) {
      case 'success': return { bar: 'bg-emerald-500', tint: 'bg-emerald-50/40', icon: 'text-emerald-600 bg-emerald-100' };
      case 'error':   return { bar: 'bg-rose-500',    tint: 'bg-rose-50/40',    icon: 'text-rose-600 bg-rose-100' };
      case 'warning': return { bar: 'bg-amber-500',   tint: 'bg-amber-50/40',   icon: 'text-amber-600 bg-amber-100' };
      default:        return { bar: 'bg-slate-300',   tint: 'bg-white',         icon: 'text-slate-500 bg-slate-100' };
    }
  };

  const getStatusIcon = (result) => {
    switch (result) {
      case 'success': return <CheckCircle2 size={18} />;
      case 'error':   return <ServerCrash size={18} />;
      case 'warning': return <AlertTriangle size={18} />;
      default:        return <ScrollText size={18} />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black text-slate-800 flex items-center gap-3">
            <ScrollText size={32} className="text-blue-600" />
            Логи сканирований
          </h1>
          <p className="text-slate-500 mt-1">Все попытки отметки: что приняли, что отклонили и почему</p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => loadLogs(activeTab)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white text-slate-600 rounded-xl shadow-soft hover:bg-slate-100 transition-soft"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            Обновить
          </button>
          <button
            onClick={handleClear}
            className="flex items-center gap-2 px-4 py-2.5 bg-white text-rose-600 rounded-xl shadow-soft hover:bg-rose-50 transition-soft"
            title="Удалить логи старше 30 дней"
          >
            <Trash2 size={18} />
            Очистить старые
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Поиск по ФИО, карте или тексту..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-soft transition-soft"
          />
        </div>
        <button
          onClick={() => setTodayOnly((v) => !v)}
          className={`
            flex items-center gap-2 px-4 py-3 rounded-xl font-medium shadow-soft transition-soft
            ${todayOnly
              ? 'bg-blue-500 text-white'
              : 'bg-white text-slate-600 hover:bg-slate-50'}
          `}
        >
          <Calendar size={18} />
          Только сегодня
        </button>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl p-2 shadow-soft inline-flex gap-1 mb-6">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`
                flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-soft
                ${isActive
                  ? `bg-${t.color}-500 text-white shadow-soft-lg`
                  : 'text-slate-500 hover:bg-slate-100'}
              `}
            >
              <Icon size={18} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl shadow-soft overflow-hidden">
        {loading && logs.length === 0 ? (
          <div className="p-16 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-slate-500">Загрузка...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-16 text-center">
            <Inbox size={64} className="mx-auto mb-4 text-slate-300" />
            <p className="text-xl font-bold text-slate-700 mb-1">
              {logs.length === 0 ? 'Логов нет' : 'Ничего не найдено'}
            </p>
            <p className="text-slate-500">
              {logs.length === 0
                ? (activeTab === 'success' ? 'Принятых отметок ещё не было'
                  : activeTab === 'error' ? 'Отлично — ошибок нет!'
                  : 'Игнорируемых сканов не зафиксировано')
                : 'Попробуй убрать фильтры'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredLogs.map((log) => {
              const colors = getRowColors(log.result);
              return (
                <div
                  key={log.id}
                  className={`relative p-5 hover:bg-slate-50/70 transition-colors ${colors.tint}`}
                >
                  {/* левая цветная полоска */}
                  <div className={`absolute left-0 top-0 bottom-0 w-1 ${colors.bar}`}></div>

                  <div className="flex items-start gap-4 pl-3">
                    {/* Icon */}
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colors.icon}`}>
                      {getStatusIcon(log.result)}
                    </div>

                    {/* Body */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-1">
                        <span className="font-black text-slate-800">
                          {STATUS_LABELS[log.status] || log.status}
                        </span>
                        {log.employee_name && (
                          <span className="flex items-center gap-1.5 text-slate-700 font-medium text-sm">
                            <UserRound size={14} className="text-slate-400" />
                            {log.employee_name}
                          </span>
                        )}
                        <span className="flex items-center gap-1.5 text-slate-500 text-sm font-mono">
                          <CreditCard size={14} />
                          {log.card_id}
                        </span>
                      </div>

                      {log.message && (
                        <p className="text-sm text-slate-600 mb-2 break-words">
                          {log.message}
                        </p>
                      )}

                      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-400 font-medium">
                        <span className="flex items-center gap-1">
                          <Clock size={12} />
                          Получено сервером: {formatDateTime(log.received_at)}
                        </span>
                        {log.scan_timestamp && (
                          <span className="flex items-center gap-1">
                            <Clock size={12} className="text-blue-400" />
                            Время скана: {formatDateTime(log.scan_timestamp)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer hint */}
      <div className="mt-4 text-xs text-slate-400 text-center">
        Найдено: <span className="font-bold text-slate-500">{filteredLogs.length}</span>
        {' '}из {logs.length} записей. Обновляется каждые 5 секунд.
      </div>
    </div>
  );
};

export default Logs;
