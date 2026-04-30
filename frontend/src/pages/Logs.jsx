// pages/Logs.jsx — Linear-минимализм
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ScrollText, CheckCircle2, AlertTriangle, XCircle, RefreshCw,
  Trash2, CreditCard, Inbox, ServerCrash, Search, Calendar,
} from 'lucide-react';
import { getScanLogs, clearScanLogs } from '../api/client';
import toast from 'react-hot-toast';
import Button from '../components/ui/Button';

const TABS = [
  { key: 'error',   label: 'Ошибки',         icon: XCircle,        dot: 'bg-rose-500' },
  { key: 'warning', label: 'Игнор/прочее',   icon: AlertTriangle,  dot: 'bg-amber-500' },
  { key: 'success', label: 'Принятые',       icon: CheckCircle2,   dot: 'bg-emerald-500' },
];

const STATUS_LABELS = {
  checked_in:     'Приход',
  checked_out:    'Уход',
  re_checked_out: 'Уход (перезаписан)',
  duplicate:      'Дубликат',
  debounced:      'Игнор',
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

  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const todayStr = new Date().toISOString().slice(0, 10);
    return logs.filter((log) => {
      if (todayOnly) {
        const logDate = new Date(log.received_at).toISOString().slice(0, 10);
        if (logDate !== todayStr) return false;
      }
      if (q) {
        const haystack = [log.employee_name || '', log.card_id || '', log.message || ''].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [logs, searchQuery, todayOnly]);

  const handleClear = async () => {
    if (!confirm('Удалить логи старше 30 дней?')) return;
    try {
      const res = await clearScanLogs(30);
      toast.success(`Удалено записей: ${res.deleted}`);
      loadLogs(activeTab);
    } catch (e) {
      toast.error('Ошибка: ' + (e.response?.data?.detail || e.message));
    }
  };

  const formatDateTime = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  };

  const getResultStyles = (result) => {
    switch (result) {
      case 'success': return { dot: 'bg-emerald-500', text: 'text-emerald-700', icon: CheckCircle2 };
      case 'error':   return { dot: 'bg-rose-500',    text: 'text-rose-700',    icon: ServerCrash };
      case 'warning': return { dot: 'bg-amber-500',   text: 'text-amber-700',   icon: AlertTriangle };
      default:        return { dot: 'bg-slate-300',   text: 'text-slate-600',   icon: ScrollText };
    }
  };

  return (
    <div className="min-h-screen px-6 md:px-8 py-6">
      {/* Header */}
      <div className="mb-5 flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Логи сканирований</h1>
          <p className="text-sm text-slate-500 mt-0.5">Каждая попытка отметки: что приняли, что отклонили и почему</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => loadLogs(activeTab)}>
            Обновить
          </Button>
          <Button variant="secondary" size="sm" icon={Trash2} onClick={handleClear}>
            Очистить старые
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Поиск по ФИО, карте или тексту..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 pl-8 pr-3 bg-white border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>
        <Button
          variant={todayOnly ? 'primary' : 'secondary'}
          size="sm"
          icon={Calendar}
          onClick={() => setTodayOnly((v) => !v)}
        >
          Только сегодня
        </Button>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 mb-4 flex gap-0 overflow-x-auto">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`
                flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px transition-colors
                ${isActive
                  ? 'border-slate-900 text-slate-900 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-700 font-medium'}
              `}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${t.dot}`} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* List */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {loading && logs.length === 0 ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-slate-200 border-t-slate-900 mx-auto mb-3"></div>
            <p className="text-sm text-slate-500">Загрузка...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center">
            <Inbox size={32} className="mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-semibold text-slate-700 mb-0.5">
              {logs.length === 0 ? 'Логов нет' : 'Ничего не найдено'}
            </p>
            <p className="text-xs text-slate-500">
              {logs.length === 0
                ? (activeTab === 'success' ? 'Принятых отметок ещё не было'
                  : activeTab === 'error' ? 'Отлично — ошибок нет'
                  : 'Игнорируемых сканов не зафиксировано')
                : 'Попробуй убрать фильтры'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filteredLogs.map((log) => {
              const styles = getResultStyles(log.result);
              const Icon = styles.icon;
              return (
                <li key={log.id} className="px-4 py-3 hover:bg-slate-50/60">
                  <div className="flex items-start gap-3">
                    <Icon size={15} className={`${styles.text} mt-0.5 flex-shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap mb-0.5">
                        <span className={`text-sm font-semibold ${styles.text}`}>
                          {STATUS_LABELS[log.status] || log.status}
                        </span>
                        {log.employee_name && (
                          <span className="text-sm text-slate-700 truncate">{log.employee_name}</span>
                        )}
                        <span className="inline-flex items-center gap-1 text-xs text-slate-400 font-mono">
                          <CreditCard size={11} />
                          {log.card_id}
                        </span>
                      </div>
                      {log.message && (
                        <p className="text-xs text-slate-600 mb-1 break-words">{log.message}</p>
                      )}
                      <div className="text-[11px] text-slate-400 font-mono">
                        получено {formatDateTime(log.received_at)}
                        {log.scan_timestamp && (
                          <> · скан {formatDateTime(log.scan_timestamp)}</>
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

      <div className="mt-3 text-xs text-slate-400">
        Найдено: <span className="font-semibold text-slate-600">{filteredLogs.length}</span> из {logs.length}. Обновление каждые 5 сек.
      </div>
    </div>
  );
};

export default Logs;
