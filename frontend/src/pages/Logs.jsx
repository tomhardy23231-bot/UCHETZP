// pages/Logs.jsx — Linear-минимализм. Две секции: сканирования + активность кабинетов.
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ScrollText, CheckCircle2, AlertTriangle, XCircle, RefreshCw,
  Trash2, CreditCard, Inbox, ServerCrash, Search, Calendar,
  LogIn, LogOut, Eye, Wallet, CalendarDays, ReceiptText,
  ScanLine, UserRound, Globe, Smartphone, Shield,
} from 'lucide-react';
import {
  getScanLogs, clearScanLogs,
  getCabinetActivity, clearCabinetActivity,
} from '../api/client';
import toast from 'react-hot-toast';
import Button from '../components/ui/Button';

const SCAN_TABS = [
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

const ACTIVITY_FILTERS = [
  { key: 'all',     label: 'Все события', filter: null },
  { key: 'logins',  label: 'Логины',      filter: 'login_success' },
  { key: 'failed',  label: 'Неверные',    filter: 'login_failed' },
];

const ACTIVITY_LABELS = {
  login_success:     { label: 'Вход',                   icon: LogIn,        tone: 'emerald' },
  login_failed:      { label: 'Неверный пароль',        icon: XCircle,      tone: 'rose' },
  view_profile:      { label: 'Открыл главную',         icon: Eye,          tone: 'blue' },
  view_calendar:     { label: 'Смотрел календарь',      icon: CalendarDays, tone: 'indigo' },
  view_payroll:      { label: 'Смотрел зарплату',       icon: Wallet,       tone: 'emerald' },
  view_transactions: { label: 'Смотрел начисления',     icon: ReceiptText,  tone: 'slate' },
};

const TONE_CLASSES = {
  emerald: { dot: 'bg-emerald-500', text: 'text-emerald-700' },
  rose:    { dot: 'bg-rose-500',    text: 'text-rose-700' },
  blue:    { dot: 'bg-blue-500',    text: 'text-blue-700' },
  indigo:  { dot: 'bg-indigo-500',  text: 'text-indigo-700' },
  slate:   { dot: 'bg-slate-400',   text: 'text-slate-700' },
  amber:   { dot: 'bg-amber-500',   text: 'text-amber-700' },
};

const formatDateTime = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
};

// Извлекает читаемое описание устройства из User-Agent
const parseUa = (ua) => {
  if (!ua) return null;
  const u = ua.toLowerCase();
  let device = 'ПК';
  let isMobile = false;
  if (u.includes('iphone')) { device = 'iPhone'; isMobile = true; }
  else if (u.includes('ipad')) { device = 'iPad'; isMobile = true; }
  else if (u.includes('android')) { device = 'Android'; isMobile = true; }
  else if (u.includes('mobile')) { device = 'Mobile'; isMobile = true; }
  else if (u.includes('mac os x')) device = 'Mac';
  else if (u.includes('windows')) device = 'Windows';
  else if (u.includes('linux')) device = 'Linux';

  let browser = '';
  if (u.includes('edg/')) browser = 'Edge';
  else if (u.includes('opr/') || u.includes('opera')) browser = 'Opera';
  else if (u.includes('firefox/')) browser = 'Firefox';
  else if (u.includes('chrome/') && !u.includes('edg/')) browser = 'Chrome';
  else if (u.includes('safari/')) browser = 'Safari';

  return { text: browser ? `${browser} · ${device}` : device, isMobile };
};

const Logs = () => {
  const [section, setSection] = useState('scans'); // scans | cabinet

  return (
    <div className="min-h-screen px-3 sm:px-6 md:px-8 py-4 md:py-6">
      {/* Header */}
      <div className="mb-4 md:mb-5 flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold text-slate-900 tracking-tight">Логи</h1>
          <p className="text-xs md:text-sm text-slate-500 mt-0.5">
            {section === 'scans'
              ? 'Каждая попытка отметки на сканере: что приняли и почему'
              : 'Кто и когда заходил в личный кабинет, что смотрел'}
          </p>
        </div>
      </div>

      {/* Section switcher */}
      <div className="flex gap-1 mb-5 bg-slate-100 p-0.5 rounded-md w-fit">
        <SectionButton
          active={section === 'scans'}
          onClick={() => setSection('scans')}
          icon={ScanLine}
        >
          Сканирования
        </SectionButton>
        <SectionButton
          active={section === 'cabinet'}
          onClick={() => setSection('cabinet')}
          icon={UserRound}
        >
          Кабинеты
        </SectionButton>
      </div>

      {section === 'scans' ? <ScanLogsView /> : <CabinetActivityView />}
    </div>
  );
};

const SectionButton = ({ active, onClick, icon: Icon, children }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-1.5 px-3 h-8 rounded text-sm transition-colors ${
      active
        ? 'bg-white text-slate-900 font-semibold shadow-sm'
        : 'text-slate-600 hover:text-slate-900 font-medium'
    }`}
  >
    <Icon size={14} />
    {children}
  </button>
);


// ========== СКАНИРОВАНИЯ ==========

const ScanLogsView = () => {
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
    if (!confirm('Удалить ВСЕ логи сканирований? Это действие нельзя отменить.')) return;
    try {
      const res = await clearScanLogs();
      toast.success(`Удалено записей: ${res.deleted}`);
      loadLogs(activeTab);
    } catch (e) {
      toast.error('Ошибка: ' + (e.response?.data?.detail || e.message));
    }
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
    <>
      <div className="flex gap-2 mb-3 flex-wrap items-center">
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
        <Button variant={todayOnly ? 'primary' : 'secondary'} size="sm" icon={Calendar} onClick={() => setTodayOnly((v) => !v)}>
          Только сегодня
        </Button>
        <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => loadLogs(activeTab)}>
          Обновить
        </Button>
        <Button variant="secondary" size="sm" icon={Trash2} onClick={handleClear}>
          Очистить всё
        </Button>
      </div>

      <div className="border-b border-slate-200 mb-4 flex gap-0 overflow-x-auto">
        {SCAN_TABS.map((t) => {
          const isActive = activeTab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
                isActive ? 'border-slate-900 text-slate-900 font-semibold' : 'border-transparent text-slate-500 hover:text-slate-700 font-medium'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${t.dot}`} />
              {t.label}
            </button>
          );
        })}
      </div>

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
                        {log.scan_timestamp && (<> · скан {formatDateTime(log.scan_timestamp)}</>)}
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
    </>
  );
};


// ========== АКТИВНОСТЬ КАБИНЕТОВ ==========

const CabinetActivityView = () => {
  const [filter, setFilter] = useState('all');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [todayOnly, setTodayOnly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const f = ACTIVITY_FILTERS.find((x) => x.key === filter);
      const data = await getCabinetActivity({ eventType: f?.filter, limit: 500 });
      setItems(data);
    } catch (error) {
      console.error('Не удалось загрузить активность:', error);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000); // каждые 10 сек
    return () => clearInterval(interval);
  }, [load]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const todayStr = new Date().toISOString().slice(0, 10);
    return items.filter((it) => {
      if (todayOnly) {
        const d = new Date(it.timestamp).toISOString().slice(0, 10);
        if (d !== todayStr) return false;
      }
      if (q) {
        const hay = [it.employee_name || '', it.username_attempted || '', it.ip_address || ''].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, searchQuery, todayOnly]);

  const handleClear = async () => {
    if (!confirm('Удалить ВЕСЬ лог активности кабинетов? Это действие нельзя отменить.')) return;
    try {
      const res = await clearCabinetActivity();
      toast.success(`Удалено: ${res.deleted}`);
      load();
    } catch (e) {
      toast.error('Ошибка: ' + (e.response?.data?.detail || e.message));
    }
  };

  return (
    <>
      <div className="flex gap-2 mb-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Поиск по ФИО, логину или IP..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 pl-8 pr-3 bg-white border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>
        <Button variant={todayOnly ? 'primary' : 'secondary'} size="sm" icon={Calendar} onClick={() => setTodayOnly((v) => !v)}>
          Только сегодня
        </Button>
        <Button variant="secondary" size="sm" icon={RefreshCw} onClick={load}>
          Обновить
        </Button>
        <Button variant="secondary" size="sm" icon={Trash2} onClick={handleClear}>
          Очистить всё
        </Button>
      </div>

      <div className="border-b border-slate-200 mb-4 flex gap-0 overflow-x-auto">
        {ACTIVITY_FILTERS.map((t) => {
          const isActive = filter === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={`px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
                isActive ? 'border-slate-900 text-slate-900 font-semibold' : 'border-transparent text-slate-500 hover:text-slate-700 font-medium'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {loading && items.length === 0 ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-slate-200 border-t-slate-900 mx-auto mb-3"></div>
            <p className="text-sm text-slate-500">Загрузка...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Inbox size={32} className="mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-semibold text-slate-700 mb-0.5">
              {items.length === 0 ? 'Активности нет' : 'Ничего не найдено'}
            </p>
            <p className="text-xs text-slate-500">
              {items.length === 0 ? 'Сотрудники ещё не заходили в свои кабинеты' : 'Попробуй убрать фильтры'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.map((it) => {
              const meta = ACTIVITY_LABELS[it.event_type] || { label: it.event_type, icon: Eye, tone: 'slate' };
              const tone = TONE_CLASSES[meta.tone] || TONE_CLASSES.slate;
              const Icon = meta.icon;
              const ua = parseUa(it.user_agent);
              const isAdmin = it.role === 'admin';
              const who = it.employee_name || it.username_attempted || (isAdmin ? 'Администратор' : '—');
              return (
                <li key={it.id} className="px-4 py-3 hover:bg-slate-50/60">
                  <div className="flex items-start gap-3">
                    <Icon size={15} className={`${tone.text} mt-0.5 flex-shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap mb-0.5">
                        <span className={`text-sm font-semibold ${tone.text}`}>
                          {meta.label}
                        </span>
                        <span className="text-sm text-slate-700 truncate">
                          {who}
                        </span>
                        {isAdmin && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 text-amber-700 text-[10px] rounded font-bold uppercase tracking-wider">
                            <Shield size={10} />
                            admin
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-wrap text-[11px] text-slate-400 font-mono">
                        <span>{formatDateTime(it.timestamp)}</span>
                        {it.ip_address && (
                          <span className="inline-flex items-center gap-1">
                            <Globe size={11} />
                            {it.ip_address}
                          </span>
                        )}
                        {ua && (
                          <span className="inline-flex items-center gap-1">
                            {ua.isMobile ? <Smartphone size={11} /> : <Globe size={11} />}
                            {ua.text}
                          </span>
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
        Найдено: <span className="font-semibold text-slate-600">{filtered.length}</span> из {items.length}. Обновление каждые 10 сек. <br />
        Просмотры разделов кабинета дедуплицируются — повторные клики/обновления в течение 5 минут не пишутся.
      </div>
    </>
  );
};

export default Logs;
