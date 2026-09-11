// pages/Scanner.jsx — состояние и управление аппаратным сканером.
//
// Важно понимать при чтении: сервер не может обратиться к сканеру напрямую —
// тот стоит за NAT. Всё здесь работает через очередь: кнопка кладёт команду,
// устройство забирает её на ближайшем heartbeat. Поэтому после нажатия статус
// сначала «ждёт», и только потом «выполнено» — мгновенной реакции не бывает.
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ScanLine, Wifi, WifiOff, BatteryMedium, Inbox, Cpu, Clock, RefreshCw,
  RotateCcw, Trash2, Send, Volume2, AlertTriangle, CheckCircle2, XCircle,
  Moon, Settings2, UploadCloud, HardDrive, History, Loader2, Pencil,
} from 'lucide-react';
import {
  getScannerDevices, getScannerHistory, getScannerCommands,
  sendScannerCommand, cancelScannerCommand, updateScannerConfig, renameScanner,
  getScannerFirmware, uploadScannerFirmware, deleteScannerFirmware,
  assignScannerFirmware, cancelScannerUpdate,
} from '../api/client';
import toast from 'react-hot-toast';
import Button from '../components/ui/Button';
import Card, { CardBody, CardHeader } from '../components/ui/Card';

const REFRESH_MS = 10000;

const STATUS_TONE = {
  online:   { dot: 'bg-emerald-500', ring: 'bg-emerald-500/20', text: 'text-emerald-700', badge: 'bg-emerald-50 border-emerald-200' },
  sleeping: { dot: 'bg-indigo-400',  ring: 'bg-indigo-400/20',  text: 'text-indigo-700',  badge: 'bg-indigo-50 border-indigo-200' },
  offline:  { dot: 'bg-rose-500',    ring: 'bg-rose-500/20',    text: 'text-rose-700',    badge: 'bg-rose-50 border-rose-200' },
  never:    { dot: 'bg-amber-500',   ring: 'bg-amber-500/20',   text: 'text-amber-700',   badge: 'bg-amber-50 border-amber-200' },
};

const COMMAND_LABELS = {
  reboot: 'Перезагрузка',
  clear_queue: 'Очистка очереди',
  flush_queue: 'Досыл очереди',
  identify: 'Звуковой сигнал',
  reload_config: 'Перечитать настройки',
};

const CMD_STATUS = {
  pending: { label: 'Ждёт, пока сканер выйдет на связь', tone: 'text-amber-600', icon: Clock },
  sent:    { label: 'Отправлена, ждём отчёта',           tone: 'text-blue-600',  icon: Send },
  done:    { label: 'Выполнена',                          tone: 'text-emerald-600', icon: CheckCircle2 },
  failed:  { label: 'Не выполнена',                       tone: 'text-rose-600',  icon: XCircle },
  expired: { label: 'Протухла',                           tone: 'text-slate-400', icon: XCircle },
};

const RESET_REASONS = {
  poweron: 'включение питания',
  sw: 'программная перезагрузка',
  panic: 'аварийный сбой',
  int_wdt: 'сторожевой таймер',
  task_wdt: 'сторожевой таймер задачи',
  wdt: 'сторожевой таймер',
  deepsleep: 'выход из сна',
  brownout: 'просадка питания',
  ext: 'внешний сброс',
  unknown: 'неизвестно',
};

const WEEKDAYS = [
  { v: 1, l: 'Пн' }, { v: 2, l: 'Вт' }, { v: 3, l: 'Ср' }, { v: 4, l: 'Чт' },
  { v: 5, l: 'Пт' }, { v: 6, l: 'Сб' }, { v: 7, l: 'Вс' },
];

const formatDateTime = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
};

const formatAgo = (seconds) => {
  if (seconds == null) return '—';
  if (seconds < 60) return `${seconds} с назад`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m} мин назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч ${m % 60} мин назад`;
  return `${Math.floor(h / 24)} д ${h % 24} ч назад`;
};

const formatUptime = (seconds) => {
  if (seconds == null) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h >= 24) return `${Math.floor(h / 24)} д ${h % 24} ч`;
  if (h > 0) return `${h} ч ${m} мин`;
  return `${m} мин`;
};

const formatBytes = (b) => (b == null ? '—' : `${Math.round(b / 1024)} КБ`);

const errorText = (e, fallback) => {
  const d = e?.response?.data?.detail;
  return typeof d === 'string' ? d : fallback;
};

// ========== МЕЛКИЕ ЭЛЕМЕНТЫ ==========

const WifiBars = ({ quality, rssi }) => {
  if (rssi == null) return <WifiOff size={16} className="text-slate-300" />;
  const bars = quality >= 75 ? 4 : quality >= 50 ? 3 : quality >= 25 ? 2 : 1;
  return (
    <span className="inline-flex items-end gap-[2px] h-4" title={`${rssi} dBm`}>
      {[1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={`w-[3px] rounded-sm ${i <= bars ? 'bg-slate-700' : 'bg-slate-200'}`}
          style={{ height: `${i * 25}%` }}
        />
      ))}
    </span>
  );
};

const Metric = ({ icon: Icon, label, value, sub, tone = 'text-slate-900', children }) => (
  <div className="px-4 py-3 border border-slate-200 rounded-lg bg-white">
    <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-400 mb-1.5">
      {Icon && <Icon size={12} />}
      {label}
    </div>
    <div className={`text-lg font-semibold leading-none ${tone}`}>
      {children || value}
    </div>
    {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
  </div>
);

// Мини-график без внешних библиотек: точек мало (одна на 5 минут),
// тащить ради этого charting-либу не за чем.
const Sparkline = ({ points, accessor, color, label, unit, domain }) => {
  const values = points.map(accessor).filter((v) => v != null);
  if (values.length < 2) {
    return (
      <div className="text-xs text-slate-400 py-6 text-center">
        {label}: данных пока мало
      </div>
    );
  }

  const lo = domain ? domain[0] : Math.min(...values);
  const hi = domain ? domain[1] : Math.max(...values);
  const span = hi - lo || 1;
  const W = 100, H = 28;

  const coords = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W;
    const y = H - ((v - lo) / span) * H;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs text-slate-500">{label}</span>
        <span className="text-xs font-medium text-slate-700">
          {values[values.length - 1]}{unit}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-8 overflow-visible">
        <polyline
          points={coords.join(' ')}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <div className="flex justify-between text-[10px] text-slate-300 mt-0.5">
        <span>{lo}{unit}</span>
        <span>{hi}{unit}</span>
      </div>
    </div>
  );
};

// ========== СЕКЦИИ ==========

const StatusHeader = ({ device, onRename }) => {
  const tone = STATUS_TONE[device.status] || STATUS_TONE.never;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(device.name || device.device_id);

  const save = async () => {
    setEditing(false);
    if (draft.trim() && draft.trim() !== device.name) await onRename(draft.trim());
  };

  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div className="flex items-start gap-3">
        <span className="relative flex h-3 w-3 mt-1.5">
          {device.status === 'online' && (
            <span className={`animate-ping absolute h-full w-full rounded-full ${tone.ring}`} />
          )}
          <span className={`relative rounded-full h-3 w-3 ${tone.dot}`} />
        </span>
        <div>
          {editing ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={save}
              onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
              className="text-lg font-semibold text-slate-900 border-b border-slate-300 focus:outline-none focus:border-slate-900 bg-transparent"
            />
          ) : (
            <button
              onClick={() => { setDraft(device.name || device.device_id); setEditing(true); }}
              className="group inline-flex items-center gap-1.5 text-lg font-semibold text-slate-900"
              title="Переименовать"
            >
              {device.name || device.device_id}
              <Pencil size={12} className="text-slate-300 group-hover:text-slate-500" />
            </button>
          )}
          <div className={`text-sm ${tone.text}`}>{device.status_label}</div>
          <div className="text-xs text-slate-400 mt-0.5">
            {device.device_id}
            {device.fw_version && <> · прошивка {device.fw_version}</>}
            {device.ip_address && <> · {device.ip_address}</>}
            {device.ssid && <> · сеть {device.ssid}</>}
          </div>
        </div>
      </div>
      <div className="text-right">
        <div className="text-xs text-slate-400">последний выход на связь</div>
        <div className="text-sm text-slate-700">{formatAgo(device.seconds_since_seen)}</div>
        <div className="text-[11px] text-slate-300">{formatDateTime(device.last_seen_at)}</div>
      </div>
    </div>
  );
};

const Commands = ({ device, onCommand, busy }) => {
  const run = async (command, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    await onCommand(command);
  };

  const asleep = device.status === 'sleeping';
  const unreachable = device.status === 'offline' || device.status === 'never';

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm" variant="secondary" icon={RotateCcw} disabled={busy}
          onClick={() => run('reboot', 'Перезагрузить сканер?\n\nНеотправленные отметки не потеряются — они лежат в файле на устройстве.')}
        >
          Перезагрузить
        </Button>
        <Button
          size="sm" variant="secondary" icon={Send} disabled={busy}
          onClick={() => run('flush_queue')}
        >
          Дослать очередь
        </Button>
        <Button
          size="sm" variant="secondary" icon={Volume2} disabled={busy || asleep}
          title={asleep ? 'Сканер спит — звук и подсветка выключены' : 'Пискнуть и мигнуть подсветкой'}
          onClick={() => run('identify')}
        >
          Пикнуть
        </Button>
        <Button
          size="sm" variant="secondary" icon={Settings2} disabled={busy}
          onClick={() => run('reload_config')}
        >
          Перечитать настройки
        </Button>
        <Button
          size="sm" variant="danger" icon={Trash2} disabled={busy || !device.queue_size}
          onClick={() => run(
            'clear_queue',
            `Стереть очередь сканера?\n\nВ ней ${device.queue_size} неотправленных отметок. ` +
            'Они будут потеряны безвозвратно — сотрудники за эти приходы и уходы не отчитаются.\n\n' +
            'Сначала попробуйте «Дослать очередь».'
          )}
        >
          Очистить очередь
        </Button>
      </div>

      {device.pending_commands > 0 && (
        <div className="text-xs text-amber-600 flex items-center gap-1.5">
          <Clock size={12} />
          Команд в очереди: {device.pending_commands}
          {unreachable
            ? ' — выполнятся, когда сканер выйдет на связь'
            : asleep
              ? ' — выполнятся на ближайшей ночной проверке связи'
              : ' — выполнятся в течение нескольких секунд'}
        </div>
      )}
    </div>
  );
};

const SettingsForm = ({ device, onSave, saving }) => {
  const [form, setForm] = useState(device.config);
  const [dirty, setDirty] = useState(false);

  // Пока админ не трогал форму — подтягиваем значения с сервера. Как только
  // начал править, перестаём: иначе автообновление затрёт набранное.
  useEffect(() => {
    if (!dirty) setForm(device.config);
  }, [device.config, dirty]);

  const set = (key, value) => { setDirty(true); setForm((f) => ({ ...f, [key]: value })); };

  const toggleDay = (d) => {
    const days = form.work_days || [];
    set('work_days', days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort());
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!(form.work_days || []).length) {
      toast.error('Отметьте хотя бы один рабочий день — иначе сканер уснёт навсегда');
      return;
    }
    await onSave(form);
    setDirty(false);
  };

  const noSleepLocal = form.no_sleep_until
    ? new Date(form.no_sleep_until).toISOString().slice(0, 16)
    : '';

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Как часто выходит на связь" hint="секунд между heartbeat. Чаще — быстрее реакция на команды, больше расход">
          <input
            type="number" min="10" max="3600" value={form.heartbeat_sec ?? 30}
            onChange={(e) => set('heartbeat_sec', Number(e.target.value))}
            className={INPUT}
          />
        </Field>
        <Field
          label="Окно дебаунса"
          hint="секунд, в течение которых повторный скан той же карты игнорируется. Меньше 60 нельзя: сервер сам отклоняет отметку раньше чем через минуту после предыдущей, и сканер обещал бы уход, которого не будет"
        >
          <input
            type="number" min="60" max="7200" value={form.debounce_sec ?? 300}
            onChange={(e) => set('debounce_sec', Number(e.target.value))}
            className={INPUT}
          />
        </Field>
        <Field label="Громкость" hint="0–100 %">
          <input
            type="range" min="0" max="100" value={form.volume_percent ?? 50}
            onChange={(e) => set('volume_percent', Number(e.target.value))}
            className="w-full accent-slate-900"
          />
          <div className="text-xs text-slate-500 mt-1">{form.volume_percent ?? 50} %</div>
        </Field>
        <Field label="Яркость подсветки" hint="0–255">
          <input
            type="range" min="0" max="255" value={form.led_brightness ?? 100}
            onChange={(e) => set('led_brightness', Number(e.target.value))}
            className="w-full accent-slate-900"
          />
          <div className="text-xs text-slate-500 mt-1">{form.led_brightness ?? 100}</div>
        </Field>
      </div>

      <div className="pt-4 border-t border-slate-100">
        <label className="flex items-center gap-2 mb-4">
          <input
            type="checkbox" checked={!!form.sleep_enabled}
            onChange={(e) => set('sleep_enabled', e.target.checked)}
            className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
          />
          <span className="text-sm font-medium text-slate-800">Засыпать вне рабочих часов</span>
        </label>

        {form.sleep_enabled && (
          <div className="space-y-4 pl-6">
            <div className="grid grid-cols-2 gap-4 max-w-sm">
              <Field label="Просыпаться в">
                <input type="time" value={form.work_start || '06:00'}
                       onChange={(e) => set('work_start', e.target.value)} className={INPUT} />
              </Field>
              <Field label="Засыпать в">
                <input type="time" value={form.work_end || '19:30'}
                       onChange={(e) => set('work_end', e.target.value)} className={INPUT} />
              </Field>
            </div>

            <Field label="Рабочие дни" hint="в остальные дни сканер спит целиком">
              <div className="flex gap-1">
                {WEEKDAYS.map((d) => {
                  const on = (form.work_days || []).includes(d.v);
                  return (
                    <button
                      key={d.v} type="button" onClick={() => toggleDay(d.v)}
                      className={`w-10 h-8 rounded-md text-xs font-medium border transition-colors ${
                        on ? 'bg-slate-900 text-white border-slate-900'
                           : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                    >
                      {d.l}
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field
              label="Во сне выходить на связь каждые"
              hint="минут. Сканер ненадолго просыпается, отчитывается и забирает команды — за счёт этого панель видит его круглосуточно. 0 — не просыпаться до утра, тогда ночью он недоступен"
            >
              <input
                type="number" min="0" max="720" value={form.night_checkin_min ?? 30}
                onChange={(e) => set('night_checkin_min', Number(e.target.value))}
                className={`${INPUT} max-w-[8rem]`}
              />
            </Field>

            <Field label="Не спать до" hint="режим обслуживания: до этого момента сканер не уснёт, что бы ни говорило расписание">
              <div className="flex gap-2 items-center flex-wrap">
                <input
                  type="datetime-local" value={noSleepLocal}
                  onChange={(e) => set('no_sleep_until', e.target.value ? new Date(e.target.value).toISOString() : null)}
                  className={`${INPUT} max-w-[14rem]`}
                />
                {form.no_sleep_until && (
                  <Button type="button" size="xs" variant="ghost"
                          onClick={() => set('no_sleep_until', null)}>
                    сбросить
                  </Button>
                )}
              </div>
            </Field>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" variant="primary" size="sm" disabled={saving || !dirty}>
          {saving ? 'Сохраняю…' : 'Сохранить настройки'}
        </Button>
        {dirty && <span className="text-xs text-amber-600">есть несохранённые изменения</span>}
        <span className="text-xs text-slate-400">
          сканер подхватит их на ближайшем heartbeat
        </span>
      </div>
    </form>
  );
};

const INPUT = 'w-full h-9 px-3 rounded-md border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400';

const Field = ({ label, hint, children }) => (
  <div>
    <label className="block text-xs font-medium text-slate-700 mb-1.5">{label}</label>
    {children}
    {hint && <p className="text-[11px] text-slate-400 mt-1 leading-snug">{hint}</p>}
  </div>
);

const FirmwareSection = ({ device, builds, onUpload, onDelete, onAssign, onCancel, busy }) => {
  const [version, setVersion] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState(null);
  const fileRef = useRef(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!file || !version.trim()) {
      toast.error('Нужны и файл .bin, и версия');
      return;
    }
    await onUpload(version.trim(), notes.trim(), file);
    setVersion(''); setNotes(''); setFile(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const pending = device.target_firmware_id
    ? builds.find((b) => b.id === device.target_firmware_id)
    : null;

  return (
    <div className="space-y-5">
      {pending && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-md bg-blue-50 border border-blue-200">
          <Loader2 size={14} className="text-blue-600 mt-0.5 animate-spin" />
          <div className="flex-1 text-sm text-blue-800">
            Назначено обновление до <b>{pending.version}</b>. Сканер скачает и поставит его
            сам на ближайшем выходе на связь, затем перезагрузится.
            {device.last_ota_error && (
              <div className="text-rose-700 mt-1">Прошлая попытка сорвалась: {device.last_ota_error}</div>
            )}
          </div>
          <Button size="xs" variant="ghost" disabled={busy} onClick={onCancel}>Отменить</Button>
        </div>
      )}

      <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
        <Field label="Файл прошивки (.bin)">
          <input
            ref={fileRef} type="file" accept=".bin"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-slate-200 file:text-sm file:bg-white hover:file:bg-slate-50"
          />
        </Field>
        <Field label="Версия" hint="должна совпадать с FW_VERSION внутри прошивки">
          <input value={version} onChange={(e) => setVersion(e.target.value)}
                 placeholder="2.0.1" className={INPUT} />
        </Field>
        <Button type="submit" variant="primary" size="sm" icon={UploadCloud} disabled={busy}>
          Загрузить
        </Button>
        <div className="sm:col-span-3">
          <input value={notes} onChange={(e) => setNotes(e.target.value)}
                 placeholder="Что изменилось (необязательно)" className={INPUT} />
        </div>
      </form>

      {builds.length === 0 ? (
        <p className="text-sm text-slate-400">Сборок пока нет.</p>
      ) : (
        <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
          {builds.map((b, index) => {
            const current = b.version === device.fw_version;
            // Самая свежая загруженная сборка, которую ещё не поставили.
            // Список отсортирован новыми вверх, поэтому это просто первая.
            const fresh = index === 0 && !current && device.target_firmware_id !== b.id;
            return (
              <div key={b.id}
                   className={`flex items-center gap-3 px-4 py-2.5 ${fresh ? 'bg-blue-50/50' : 'bg-white'}`}>
                <HardDrive size={14} className="text-slate-300 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-800 flex items-center gap-2">
                    {b.version}
                    {current && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                        стоит сейчас
                      </span>
                    )}
                    {fresh && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                        новая, не установлена
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 truncate">
                    {formatBytes(b.size_bytes)} · {formatDateTime(b.uploaded_at)}
                    {b.uploaded_by && <> · {b.uploaded_by}</>}
                    {b.notes && <> · {b.notes}</>}
                  </div>
                </div>
                <Button
                  size="xs" variant="secondary" disabled={busy || current || device.target_firmware_id === b.id}
                  onClick={() => onAssign(b.id)}
                >
                  Поставить
                </Button>
                <Button size="xs" variant="ghost" icon={Trash2} disabled={busy}
                        onClick={() => onDelete(b.id)} title="Удалить сборку" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const CommandHistory = ({ commands, onCancel, busy }) => {
  if (!commands.length) return <p className="text-sm text-slate-400">Команд ещё не отправляли.</p>;
  return (
    <div className="divide-y divide-slate-100">
      {commands.map((c) => {
        const st = CMD_STATUS[c.status] || CMD_STATUS.expired;
        const Icon = st.icon;
        return (
          <div key={c.id} className="flex items-start gap-3 py-2.5">
            <Icon size={14} className={`${st.tone} mt-0.5 flex-shrink-0`} />
            <div className="min-w-0 flex-1">
              <div className="text-sm text-slate-800">
                {COMMAND_LABELS[c.command] || c.command}
                {c.created_by && <span className="text-slate-400"> · {c.created_by}</span>}
              </div>
              <div className="text-xs text-slate-400">
                {formatDateTime(c.created_at)} · <span className={st.tone}>{st.label}</span>
                {c.result && <> · {c.result}</>}
              </div>
            </div>
            {c.status === 'pending' && (
              <Button size="xs" variant="ghost" disabled={busy} onClick={() => onCancel(c.id)}>
                отменить
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
};

const EmptyState = () => (
  <Card>
    <CardBody className="py-12 text-center">
      <ScanLine size={32} className="mx-auto text-slate-300 mb-4" />
      <h2 className="text-base font-semibold text-slate-800">Сканер ещё ни разу не выходил на связь</h2>
      <p className="text-sm text-slate-500 mt-2 max-w-lg mx-auto leading-relaxed">
        Устройство появится здесь само, как только пришлёт первый heartbeat. Для этого нужно,
        чтобы на нём стояла прошивка версии 2.0.0 или новее.
      </p>
      <div className="mt-5 text-left max-w-lg mx-auto text-sm text-slate-600 space-y-2">
        <div className="flex gap-2"><b className="text-slate-400">1.</b>
          Задайте на сервере переменную окружения <code className="px-1 bg-slate-100 rounded">SCANNER_DEVICE_KEY</code>.</div>
        <div className="flex gap-2"><b className="text-slate-400">2.</b>
          Пропишите тот же ключ в <code className="px-1 bg-slate-100 rounded">DEVICE_KEY</code> в файле прошивки.</div>
        <div className="flex gap-2"><b className="text-slate-400">3.</b>
          Залейте прошивку по OTA из локальной сети или по USB — это единственный раз, когда
          к сканеру придётся подойти.</div>
      </div>
    </CardBody>
  </Card>
);

// ========== СТРАНИЦА ==========

const Scanner = () => {
  const [devices, setDevices] = useState(null);
  const [history, setHistory] = useState([]);
  const [commands, setCommands] = useState([]);
  const [builds, setBuilds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);

  const device = devices?.[0] || null;
  const deviceId = device?.device_id;

  const loadDevices = useCallback(async () => {
    // Автообновление не должно наслаиваться само на себя, если сервер тормозит.
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const list = await getScannerDevices();
      setDevices(list);
      return list;
    } catch (e) {
      toast.error(errorText(e, 'Не удалось получить состояние сканера'));
      setDevices([]);
    } finally {
      inFlight.current = false;
    }
  }, []);

  const loadDetails = useCallback(async (id) => {
    if (!id) return;
    try {
      const [h, c, b] = await Promise.all([
        getScannerHistory(id, 24),
        getScannerCommands(id, 30),
        getScannerFirmware(),
      ]);
      setHistory(h); setCommands(c); setBuilds(b);
    } catch (e) {
      toast.error(errorText(e, 'Не удалось загрузить детали сканера'));
    }
  }, []);

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      const list = await loadDevices();
      if (stopped) return;
      const id = list?.[0]?.device_id;
      if (id) await loadDetails(id);
    };
    tick();
    const timer = setInterval(tick, REFRESH_MS);
    return () => { stopped = true; clearInterval(timer); };
  }, [loadDevices, loadDetails]);

  const refresh = async () => {
    const list = await loadDevices();
    if (list?.[0]?.device_id) await loadDetails(list[0].device_id);
  };

  const withBusy = async (fn, okMessage) => {
    setBusy(true);
    try {
      await fn();
      if (okMessage) toast.success(okMessage);
      await refresh();
    } catch (e) {
      toast.error(errorText(e, 'Не получилось'));
    } finally {
      setBusy(false);
    }
  };

  const handleCommand = (command) => withBusy(
    () => sendScannerCommand(deviceId, command),
    'Команда поставлена в очередь'
  );

  const handleSaveConfig = async (config) => {
    setSaving(true);
    try {
      await updateScannerConfig(deviceId, config);
      toast.success('Настройки сохранены');
      await refresh();
    } catch (e) {
      toast.error(errorText(e, 'Не удалось сохранить настройки'));
    } finally {
      setSaving(false);
    }
  };

  if (devices === null) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400">
        <Loader2 size={20} className="animate-spin mr-2" /> Загрузка…
      </div>
    );
  }

  return (
    <div className="min-h-screen px-3 sm:px-6 md:px-8 py-4 md:py-6 space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold text-slate-900 tracking-tight">Сканер</h1>
          <p className="text-xs md:text-sm text-slate-500 mt-0.5">
            Состояние устройства на проходной и управление им
          </p>
        </div>
        <Button size="sm" variant="secondary" icon={RefreshCw} onClick={refresh} disabled={busy}>
          Обновить
        </Button>
      </div>

      {!device ? <EmptyState /> : (
        <>
          <Card>
            <CardBody className="space-y-5">
              <StatusHeader
                device={device}
                onRename={(name) => withBusy(() => renameScanner(deviceId, name), 'Имя изменено')}
              />

              {device.alerts.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 space-y-1">
                  {device.alerts.map((a, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-amber-900">
                      <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                      <span>{a}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <Metric icon={Wifi} label="Сигнал"
                        sub={device.rssi != null ? `${device.rssi} dBm` : 'нет данных'}>
                  <span className="flex items-center gap-2">
                    <WifiBars quality={device.wifi_quality} rssi={device.rssi} />
                    {device.wifi_quality != null ? `${device.wifi_quality}%` : '—'}
                  </span>
                </Metric>
                <Metric
                  icon={BatteryMedium} label="Батарея"
                  value={device.battery_percent != null ? `${device.battery_percent}%` : '—'}
                  sub={device.battery_voltage ? `${device.battery_voltage.toFixed(2)} В` : null}
                  tone={device.battery_percent != null && device.battery_percent <= 20
                    ? 'text-rose-600' : 'text-slate-900'}
                />
                <Metric
                  icon={Inbox} label="Очередь"
                  value={device.queue_size ?? '—'}
                  sub="неотправленных отметок"
                  tone={device.queue_size ? 'text-amber-600' : 'text-slate-900'}
                />
                <Metric icon={Clock} label="Аптайм" value={formatUptime(device.uptime_sec)}
                        sub={RESET_REASONS[device.reset_reason] || device.reset_reason || null} />
                <Metric icon={Cpu} label="Память" value={formatBytes(device.free_heap)}
                        sub="свободно" />
                <Metric icon={Moon} label="Режим"
                        value={device.config?.sleep_enabled ? 'по расписанию' : 'круглосуточно'}
                        sub={device.config?.sleep_enabled
                          ? `${device.config.work_start}–${device.config.work_end}` : 'сон выключен'} />
              </div>

              <div className="pt-1">
                <Commands device={device} onCommand={handleCommand} busy={busy} />
              </div>
            </CardBody>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <Card className="lg:col-span-1">
              <CardHeader>
                <h2 className="text-sm font-semibold text-slate-800">За последние сутки</h2>
              </CardHeader>
              <CardBody className="space-y-5">
                <Sparkline points={history} accessor={(p) => p.rssi} color="#2563eb"
                           label="Сигнал Wi-Fi" unit=" dBm" />
                <Sparkline points={history} accessor={(p) => p.battery_percent} color="#059669"
                           label="Батарея" unit="%" domain={[0, 100]} />
                <Sparkline points={history} accessor={(p) => p.queue_size} color="#d97706"
                           label="Очередь" unit="" />
              </CardBody>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <h2 className="text-sm font-semibold text-slate-800">Настройки и расписание</h2>
              </CardHeader>
              <CardBody>
                <SettingsForm device={device} onSave={handleSaveConfig} saving={saving} />
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <UploadCloud size={14} className="text-slate-400" /> Прошивка по воздуху
              </h2>
            </CardHeader>
            <CardBody>
              <FirmwareSection
                device={device} builds={builds} busy={busy}
                onUpload={(v, n, f) => withBusy(() => uploadScannerFirmware(v, n, f), 'Прошивка загружена')}
                onDelete={(id) => withBusy(() => deleteScannerFirmware(id), 'Сборка удалена')}
                onAssign={(id) => withBusy(() => assignScannerFirmware(deviceId, id), 'Обновление назначено')}
                onCancel={() => withBusy(() => cancelScannerUpdate(deviceId), 'Обновление отменено')}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <History size={14} className="text-slate-400" /> История команд
              </h2>
            </CardHeader>
            <CardBody>
              <CommandHistory
                commands={commands} busy={busy}
                onCancel={(id) => withBusy(() => cancelScannerCommand(deviceId, id), 'Команда отменена')}
              />
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
};

export default Scanner;
