// Аналитический блок Dashboard: forecast + heatmap + payroll trend + top employees.
// Все карточки кликабельные — открывают модалку с детализацией.
import React, { useEffect, useMemo, useState } from 'react';
import {
  TrendingUp, Target, Clock,
  Activity, ChevronRight, X, Crown, BarChart3, FlameKindling,
} from 'lucide-react';
import {
  getDashboardHeatmap, getDashboardPayrollTrend,
  getDashboardTopEmployees, getDashboardPayrollForecast,
} from '../../api/client';
import Avatar from '../ui/Avatar';

const formatMoney = (n) =>
  Math.round(Number(n) || 0).toLocaleString('ru-RU');

const formatHours = (n) => `${(Number(n) || 0).toFixed(1)}ч`;

const formatMonth = (m) => {
  if (!m) return '';
  const [y, mn] = m.split('-').map(Number);
  return new Date(y, mn - 1, 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
};

const WEEKDAYS_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const WEEKDAYS_RU_LONG = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

// `selectedMonth` (YYYY-MM) — общий селектор сверху страницы. Применяется
// к heatmap, top-employees и forecast. Trend chart показывает последние
// 6 месяцев независимо от выбранного.
const AnalyticsBlock = ({ selectedMonth }) => {
  const [heatmap, setHeatmap] = useState(null);
  const [trend, setTrend] = useState(null);
  const [tops, setTops] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [loading, setLoading] = useState(true);

  // Модалки drilldown
  const [trendModal, setTrendModal] = useState(null);
  const [topModal, setTopModal] = useState(null);
  const [heatModal, setHeatModal] = useState(null);
  const [forecastModal, setForecastModal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getDashboardHeatmap(selectedMonth).catch(() => null),
      getDashboardPayrollTrend(6).catch(() => null),
      getDashboardTopEmployees(selectedMonth).catch(() => null),
      getDashboardPayrollForecast(selectedMonth).catch(() => null),
    ]).then(([h, t, top, f]) => {
      if (cancelled) return;
      setHeatmap(h);
      setTrend(t);
      setTops(top);
      setForecast(f);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [selectedMonth]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-40 rounded-lg bg-slate-100 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <>
      {/* ROW 1: forecast + payroll trend */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-3">
        <ForecastTile data={forecast} onClick={() => setForecastModal(true)} />
        <div className="lg:col-span-2">
          <PayrollTrendCard data={trend} onSelectMonth={(m) => setTrendModal(m)} />
        </div>
      </div>

      {/* ROW 2: heatmap */}
      <div className="mb-3">
        <HeatmapCard data={heatmap} onCellClick={(cell) => setHeatModal(cell)} />
      </div>

      {/* ROW 3: top employees */}
      <div className="mb-6">
        <TopEmployeesCard data={tops} onOpen={(criterion) => setTopModal(criterion)} />
      </div>

      {/* Modals */}
      {trendModal && (
        <TrendBreakdownModal monthData={trendModal} onClose={() => setTrendModal(null)} />
      )}
      {topModal && (
        <TopEmployeesModal data={tops} criterion={topModal} onClose={() => setTopModal(null)} />
      )}
      {heatModal && (
        <HeatmapCellModal cell={heatModal} onClose={() => setHeatModal(null)} />
      )}
      {forecastModal && forecast && (
        <ForecastModal data={forecast} onClose={() => setForecastModal(false)} />
      )}
    </>
  );
};

// ---------- FORECAST TILE ----------
const ForecastTile = ({ data, onClick }) => {
  if (!data) return <div className="bg-white border border-slate-200 rounded-lg p-4 h-full">Нет данных</div>;
  const {
    current, projected_accrued, projected_extra,
    elapsed_workdays, remaining_workdays, is_current_month,
    smart_forecast, history, confidence, accuracy,
  } = data;
  const accruedNow = current.accrued ?? 0;
  const headline = is_current_month
    ? (smart_forecast?.value ?? projected_accrued)
    : accruedNow;
  const total = elapsed_workdays + remaining_workdays;
  const pct = total > 0 ? Math.round((elapsed_workdays / total) * 100) : 100;
  const usingSkill = is_current_month && smart_forecast?.method === 'skill_weighted';
  const weights = smart_forecast?.weights || {};
  // Топ-сигнал по весу — для подписи
  const topSignal = Object.entries(weights).sort((a, b) => b[1] - a[1])[0];
  const SIGNAL_RU = { pace: 'темп', dow: 'паттерны по дням недели', history: 'история' };

  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left w-full bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-lg p-5 hover:shadow-lg transition-shadow group h-full flex flex-col justify-between min-h-[160px]"
    >
      <div>
        <div className="flex items-center justify-between mb-1 gap-2">
          <span className="text-[11px] uppercase tracking-wider text-slate-400 font-medium truncate">
            {is_current_month ? 'Прогноз ФОТ к концу месяца' : 'ФОТ за месяц'}
          </span>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {accuracy && (
              <span
                className="text-[9px] uppercase tracking-wider text-emerald-300 bg-emerald-900/40 px-1.5 py-0.5 rounded font-medium"
                title={`Средняя ошибка прогноза по ${accuracy.samples} наблюдениям`}
              >
                ±{accuracy.mape_pct}%
              </span>
            )}
            <Activity size={14} className="text-slate-400 group-hover:text-white transition-colors" />
          </div>
        </div>
        <div className="text-3xl font-bold tabular-nums mt-2">
          {formatMoney(headline)} <span className="text-lg text-slate-400">₴</span>
        </div>
        {is_current_month && confidence && confidence.sigma > 0 && (
          <div className="text-[10px] text-slate-400 mt-0.5 font-mono">
            от <span className="text-white font-semibold">{formatMoney(confidence.low)}</span>
            {' '}до <span className="text-white font-semibold">{formatMoney(confidence.high)}</span> ₴
          </div>
        )}
        <div className="text-[11px] text-slate-400 mt-1 leading-snug">
          {is_current_month ? (
            <>
              уже начислено <span className="text-white font-semibold">{formatMoney(accruedNow)} ₴</span>
              {topSignal && topSignal[1] > 0 && (
                <>
                  {' '}· основа <span className="text-white font-semibold">{SIGNAL_RU[topSignal[0]]}</span>
                  {' '}<span className="text-white font-semibold">{Math.round(topSignal[1] * 100)}%</span>
                </>
              )}
              {usingSkill ? (
                <span className="text-emerald-300/80"> · обучен на {smart_forecast.snapshots_learned_from} наблюдениях</span>
              ) : (
                <span className="text-amber-300/70"> · собирает данные для самообучения</span>
              )}
            </>
          ) : (
            <>часовая часть + сдельная + премии · итог за <span className="capitalize">{formatMonth(data.month)}</span></>
          )}
        </div>
      </div>
      {is_current_month && total > 0 && (
        <div className="mt-3">
          <div className="flex justify-between text-[10px] text-slate-400 mb-1">
            <span>{elapsed_workdays} раб. дн. прошло</span>
            <span>{remaining_workdays} осталось</span>
          </div>
          <div className="h-1.5 bg-slate-700/50 rounded overflow-hidden">
            <div
              className="h-full bg-emerald-400 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}
      <div className="text-[10px] text-slate-500 mt-2 group-hover:text-slate-400 transition-colors">
        тап — все цифры и формула
      </div>
    </button>
  );
};

const ForecastModal = ({ data, onClose }) => {
  const {
    current, projected_to_pay, projected_accrued, projected_extra,
    elapsed_workdays, remaining_workdays, is_current_month, month,
    smart_forecast, history, confidence, accuracy,
  } = data;
  const accruedNow = current.accrued ?? (current.base_rate + current.piecework + current.bonuses);
  const ratePerDay = elapsed_workdays > 0 ? (current.base_rate + current.piecework) / elapsed_workdays : 0;
  const finalForecast = is_current_month ? (smart_forecast?.value ?? projected_accrued) : accruedNow;
  const usingSkill = is_current_month && smart_forecast?.method === 'skill_weighted';
  const weights = smart_forecast?.weights || {};
  const signals = smart_forecast?.signals || {};
  const mapes = smart_forecast?.signal_mapes || {};
  const maxSample = history?.samples?.length
    ? Math.max(...history.samples.map((s) => s.accrued), finalForecast)
    : finalForecast;

  return (
    <ModalShell title={`${is_current_month ? 'Прогноз ФОТ' : 'ФОТ'} · ${formatMonth(month)}`} onClose={onClose} icon={Activity}>
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Уже начислено" value={`${formatMoney(accruedNow)} ₴`} mono />
          <Stat
            label={is_current_month ? 'Прогноз ФОТ к концу месяца' : 'Итог ФОТ'}
            value={`${formatMoney(finalForecast)} ₴`}
            mono accent="text-emerald-600"
          />
          <Stat label="Прошло рабочих дней" value={elapsed_workdays} />
          <Stat label="Осталось рабочих дней" value={remaining_workdays} />
        </div>

        {/* Историческая динамика — мини-бар-чарт */}
        {is_current_month && history?.samples?.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-md p-3">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
              История · последние {history.months_used}{' '}
              {history.months_used === 1 ? 'месяц' : history.months_used < 5 ? 'месяца' : 'месяцев'}
            </p>
            <div className="space-y-1.5">
              {history.samples.slice().reverse().map((s) => {
                const w = (s.accrued / maxSample) * 100;
                return (
                  <div key={s.month} className="flex items-center gap-2 text-xs">
                    <span className="capitalize text-slate-500 w-20 flex-shrink-0">
                      {new Date(s.month + '-02').toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' })}
                    </span>
                    <div className="flex-1 h-4 bg-slate-100 rounded overflow-hidden">
                      <div className="h-full bg-slate-300" style={{ width: `${w}%` }} />
                    </div>
                    <span className="font-mono font-semibold text-slate-700 tabular-nums w-20 text-right flex-shrink-0">
                      {formatMoney(s.accrued)} ₴
                    </span>
                  </div>
                );
              })}
              <div className="flex items-center gap-2 text-xs pt-2 border-t border-slate-100">
                <span className="text-slate-700 font-medium w-20 flex-shrink-0">Среднее</span>
                <div className="flex-1 h-4 bg-blue-50 rounded overflow-hidden">
                  <div
                    className="h-full bg-blue-300"
                    style={{ width: `${(history.avg_accrued / maxSample) * 100}%` }}
                  />
                </div>
                <span className="font-mono font-bold text-blue-700 tabular-nums w-20 text-right flex-shrink-0">
                  {formatMoney(history.avg_accrued)} ₴
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-emerald-700 font-semibold w-20 flex-shrink-0 capitalize">
                  {new Date(month + '-02').toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' })}
                </span>
                <div className="flex-1 h-4 bg-emerald-50 rounded overflow-hidden">
                  <div
                    className="h-full bg-emerald-400"
                    style={{ width: `${(finalForecast / maxSample) * 100}%` }}
                  />
                </div>
                <span className="font-mono font-bold text-emerald-700 tabular-nums w-20 text-right flex-shrink-0">
                  {formatMoney(finalForecast)} ₴
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="bg-slate-50 border border-slate-200 rounded-md p-3">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Структура за месяц</p>
          <Row label="Часовая часть" value={`+${formatMoney(current.base_rate)} ₴`} />
          <Row label="Сдельная" value={`+${formatMoney(current.piecework)} ₴`} />
          <Row label="Премии" value={`+${formatMoney(current.bonuses)} ₴`} positive />
          <div className="my-1.5 border-t border-slate-200" />
          <Row label="Начислено всего" value={`${formatMoney(accruedNow)} ₴`} bold />
          <div className="my-1.5 border-t border-slate-200" />
          <Row label="Авансы" value={`−${formatMoney(current.advances)} ₴`} negative />
          <Row label="Штрафы" value={`−${formatMoney(current.fines)} ₴`} negative />
          <Row label="К выплате на руки" value={`${formatMoney(current.to_pay)} ₴`} />
          {is_current_month && (
            <>
              <div className="my-1.5 border-t border-slate-200" />
              <Row label="Прогноз доначисления (по темпу)" value={`+${formatMoney(projected_extra)} ₴`} positive />
              <Row label="Прогноз итога (только по темпу)" value={`${formatMoney(projected_accrued ?? 0)} ₴`} />
              <Row label="Итоговый прогноз (бленд сигналов)" value={`${formatMoney(finalForecast)} ₴`} bold />
              {usingSkill && (
                <div className="text-[10px] text-slate-500 italic mt-1">
                  Веса подобраны по точности сигналов на {smart_forecast.snapshots_learned_from} наблюдениях
                </div>
              )}
            </>
          )}
        </div>

        {is_current_month && smart_forecast && (
          <div className="bg-blue-50 border border-blue-200 rounded-md p-3 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-xs font-medium text-blue-900 uppercase tracking-wider">Три сигнала прогноза</p>
              {accuracy && (
                <span className="text-[10px] uppercase tracking-wider text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded font-semibold">
                  средняя ошибка ±{accuracy.mape_pct}% · {accuracy.samples} наблюд.
                </span>
              )}
            </div>

            {/* Три сигнала рядом — value + weight + per-signal MAPE */}
            <div className="space-y-2">
              <SignalBar
                label="Темп"
                description="линейная экстраполяция текущего темпа"
                value={signals.pace}
                weight={weights.pace}
                mape={mapes.pace}
                color="blue"
              />
              <SignalBar
                label="Дни недели"
                description={`по каждому сотруднику · ${smart_forecast.dow_data_points} наблюдений за ${smart_forecast.dow_lookback_days} дней`}
                value={signals.dow}
                weight={weights.dow}
                mape={mapes.dow}
                color="violet"
              />
              <SignalBar
                label="История"
                description={`среднее за ${history.months_used} ${history.months_used === 1 ? 'месяц' : history.months_used < 5 ? 'месяца' : 'месяцев'}`}
                value={signals.history}
                weight={weights.history}
                mape={mapes.history}
                color="amber"
              />
            </div>

            <div className="bg-white border border-blue-200 rounded-md p-2.5 flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">Итоговый прогноз</div>
                <div className="text-lg font-bold tabular-nums text-emerald-700">
                  {formatMoney(finalForecast)} ₴
                </div>
                {confidence && confidence.sigma > 0 && (
                  <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                    интервал: {formatMoney(confidence.low)} – {formatMoney(confidence.high)} ₴
                  </div>
                )}
              </div>
              <div className="text-right text-[10px] text-slate-500 leading-snug max-w-[180px]">
                {usingSkill ? (
                  <>веса подобраны<br />по точности сигналов<br />за <span className="font-semibold">{smart_forecast.snapshots_learned_from}</span> наблюдений</>
                ) : (
                  <>веса по доступности данных<br />и прогрессу месяца<br />(ещё мало истории)</>
                )}
              </div>
            </div>

            <p className="text-[10px] text-blue-800/80 leading-relaxed pt-1 border-t border-blue-200">
              Прогноз самообучается: каждый день сохраняется снимок с тремя сигналами. Когда месяц завершается — фиксируется факт, и сигнал, который ошибался меньше, начинает получать больший вес в следующих расчётах. Премии/авансы/штрафы экстраполировать нельзя — они уже учтены в начисленном «как есть».
            </p>
          </div>
        )}
      </div>
    </ModalShell>
  );
};

// ---------- PAYROLL TREND ----------
const PayrollTrendCard = ({ data, onSelectMonth }) => {
  if (!data || !data.months?.length) {
    return <div className="bg-white border border-slate-200 rounded-lg p-4">Нет данных</div>;
  }
  const months = data.months;
  // Используем «начислено» (accrued = base + piecework + bonuses), а не to_pay,
  // чтобы выплата авансами не «съедала» столбец до нуля.
  const max = Math.max(1, ...months.map((m) => m.accrued_total ?? 0));

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3 md:p-4 h-full min-w-0">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <BarChart3 size={15} className="text-slate-400 flex-shrink-0" />
        <h3 className="text-sm font-semibold text-slate-900">Начислено · 6 месяцев</h3>
        <span className="text-[10px] md:text-xs text-slate-400 ml-auto">тап столбец — детали</span>
      </div>
      <div className="flex items-end gap-2 h-32">
        {months.map((m) => {
          const v = m.accrued_total ?? 0;
          const h = (v / max) * 100;
          const isLast = m === months[months.length - 1];
          return (
            <button
              key={m.month}
              type="button"
              onClick={() => onSelectMonth(m)}
              className="flex-1 group flex flex-col justify-end h-full"
              title={`${formatMonth(m.month)}: ${formatMoney(v)} ₴ начислено`}
            >
              <div className="text-[10px] text-slate-500 font-mono mb-0.5 text-center tabular-nums">
                {v > 0 ? `${formatMoney(v / 1000)}к` : '—'}
              </div>
              <div
                className={`rounded-t transition-all relative ${
                  isLast
                    ? 'bg-emerald-500 group-hover:bg-emerald-600'
                    : 'bg-slate-300 group-hover:bg-slate-500'
                }`}
                style={{ height: `${Math.max(2, h)}%`, minHeight: '2px' }}
              >
                {m.is_closed && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-400 rounded-full ring-1 ring-white" title="Месяц закрыт" />
                )}
              </div>
              <div className="text-[10px] text-slate-500 mt-1 capitalize text-center truncate">
                {new Date(m.month + '-02').toLocaleDateString('ru-RU', { month: 'short' })}
              </div>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] text-slate-400 leading-snug">
        Начислено = часовая часть + сдельная + премии. Авансы и штрафы не вычитаются — столбец показывает «сколько заработано».
      </p>
    </div>
  );
};

const TrendBreakdownModal = ({ monthData, onClose }) => {
  return (
    <ModalShell title={`Начислено · ${formatMonth(monthData.month)}`} onClose={onClose} icon={BarChart3}>
      <div className="p-5 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-emerald-50 border border-emerald-200 rounded-md p-3">
            <div className="text-[10px] uppercase tracking-wider text-emerald-700 font-medium mb-1">Начислено</div>
            <div className="text-xl font-bold tabular-nums text-emerald-900">
              {formatMoney(monthData.accrued_total ?? 0)} <span className="text-xs text-emerald-700/70">₴</span>
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-md p-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-medium mb-1">К выплате (за вычетом авансов/штрафов)</div>
            <div className="text-xl font-bold tabular-nums text-slate-900">
              {formatMoney(monthData.to_pay_total ?? 0)} <span className="text-xs text-slate-500">₴</span>
            </div>
          </div>
        </div>
        {monthData.is_closed && (
          <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-800">
            Месяц закрыт — расчёт зафиксирован.
          </div>
        )}
        <div className="border border-slate-200 rounded-md max-h-[400px] overflow-y-auto">
          <ul className="divide-y divide-slate-100">
            {monthData.breakdown.map((b) => (
              <li key={b.employee_id} className="flex items-center gap-3 px-3 py-2.5">
                <Avatar name={b.employee_name} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900 truncate">{b.employee_name}</div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    {formatHours(b.hours)} · {b.points.toFixed(0)} оч.
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-mono font-semibold text-emerald-700 tabular-nums">
                    {formatMoney(b.accrued ?? 0)} ₴
                  </div>
                  <div className="text-[10px] font-mono text-slate-400 tabular-nums">
                    к выплате {formatMoney(b.to_pay)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </ModalShell>
  );
};

// ---------- HEATMAP ----------
const HeatmapCard = ({ data, onCellClick }) => {
  if (!data?.matrix) return <div className="bg-white border border-slate-200 rounded-lg p-4">Нет данных</div>;
  // Сожмём часы в активный диапазон 6..23 (рабочее время и поздние уходы) — иначе слишком много пустых столбцов
  const HOUR_FROM = 6;
  const HOUR_TO = 23;
  const max = Math.max(1, ...data.matrix.flat());

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3 md:p-4 min-w-0">
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <FlameKindling size={15} className="text-amber-500 flex-shrink-0" />
        <h3 className="text-sm font-semibold text-slate-900 min-w-0">Тепло-карта · <span className="capitalize">{formatMonth(data.month)}</span></h3>
        <div className="ml-auto flex items-center gap-1.5 text-[10px] text-slate-500">
          <span className="hidden sm:inline">меньше</span>
          <div className="flex gap-0.5">
            {[0.05, 0.2, 0.4, 0.7, 1].map((v) => (
              <div key={v} className="w-3 h-3 rounded" style={{ backgroundColor: heatColor(v) }} />
            ))}
          </div>
          <span className="hidden sm:inline">больше</span>
        </div>
      </div>
      <p className="text-[11px] md:text-xs text-slate-500 mb-3">
        Только <span className="font-medium text-slate-700">отметки прихода</span> (уходы не считаются).
        Всего: <span className="font-mono font-semibold text-slate-700">{data.total_scans}</span>.
      </p>

      <div className="overflow-x-auto">
        <table className="text-[10px] font-mono w-full">
          <thead>
            <tr>
              <th className="w-8" />
              {Array.from({ length: HOUR_TO - HOUR_FROM + 1 }, (_, i) => HOUR_FROM + i).map((h) => (
                <th key={h} className="text-slate-400 font-normal pb-1 px-0.5 text-center">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.matrix.map((row, wd) => (
              <tr key={wd}>
                <td className="text-slate-400 pr-2 text-right">{WEEKDAYS_RU[wd]}</td>
                {row.slice(HOUR_FROM, HOUR_TO + 1).map((count, idx) => {
                  const hour = HOUR_FROM + idx;
                  const intensity = count > 0 ? count / max : 0;
                  return (
                    <td key={hour} className="px-0.5 py-0.5">
                      <button
                        type="button"
                        onClick={() => count > 0 && onCellClick({ weekday: wd, hour, count })}
                        disabled={count === 0}
                        className={`w-full aspect-square rounded transition-all ${
                          count > 0
                            ? 'cursor-pointer hover:ring-2 hover:ring-amber-400 hover:ring-offset-1'
                            : 'cursor-default'
                        }`}
                        style={{ backgroundColor: count > 0 ? heatColor(intensity) : '#f1f5f9' }}
                        title={count > 0 ? `${WEEKDAYS_RU_LONG[wd]} ${hour}:00 — ${count} приход${count === 1 ? '' : count < 5 ? 'а' : 'ов'}` : ''}
                      >
                        {count > 0 && intensity > 0.5 && (
                          <span className="text-white font-semibold text-[9px]">{count}</span>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// шкала: оранжевые оттенки от очень светлого до густого
function heatColor(t) {
  // t в [0..1]
  const tt = Math.max(0, Math.min(1, t));
  // от #FFF7ED (255,247,237) до #C2410C (194,65,12)
  const r = Math.round(255 + (194 - 255) * tt);
  const g = Math.round(247 + (65 - 247) * tt);
  const b = Math.round(237 + (12 - 237) * tt);
  return `rgb(${r},${g},${b})`;
}

const HeatmapCellModal = ({ cell, onClose }) => {
  return (
    <ModalShell title="Слот тепло-карты" onClose={onClose} icon={FlameKindling}>
      <div className="p-5">
        <p className="text-sm text-slate-700 mb-3">
          {WEEKDAYS_RU_LONG[cell.weekday]}, <span className="font-mono font-semibold">{cell.hour}:00–{cell.hour + 1}:00</span>
        </p>
        <div className="bg-amber-50 border border-amber-200 rounded-md p-3 flex items-center gap-2">
          <FlameKindling size={20} className="text-amber-500" />
          <div>
            <div className="text-2xl font-bold text-amber-800 tabular-nums">{cell.count}</div>
            <div className="text-xs text-amber-700">приход{cell.count === 1 ? '' : cell.count < 5 ? 'а' : 'ов'} за период</div>
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-3 leading-relaxed">
          Полный список приходов в этот слот можно посмотреть в Журнале.
        </p>
      </div>
    </ModalShell>
  );
};

// ---------- TOP EMPLOYEES ----------
const TopEmployeesCard = ({ data, onOpen }) => {
  if (!data) return null;
  const cards = [
    { key: 'hours',   label: 'По часам',       icon: Clock,      color: 'blue',    list: data.by_hours,   valueFmt: (e) => formatHours(e.hours) },
    { key: 'points',  label: 'По очкам',       icon: Target,     color: 'indigo',  list: data.by_points,  valueFmt: (e) => `${e.points.toFixed(0)} оч.` },
    { key: 'bonuses', label: 'По премиям',     icon: TrendingUp, color: 'emerald', list: data.by_bonuses, valueFmt: (e) => `+${formatMoney(e.bonuses)} ₴` },
  ];
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {cards.map((c) => {
        const Icon = c.icon;
        const top3 = c.list.slice(0, 3).filter((e, idx, arr) => {
          // показываем только если есть ненулевые значения (хотя бы у первого)
          if (idx === 0) {
            const v = c.key === 'hours' ? e.hours : c.key === 'points' ? e.points : e.bonuses;
            return v > 0;
          }
          return true;
        });
        const colorMap = {
          blue:    'text-blue-600 bg-blue-50',
          indigo:  'text-indigo-600 bg-indigo-50',
          emerald: 'text-emerald-600 bg-emerald-50',
        };
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => onOpen(c.key)}
            className="text-left bg-white border border-slate-200 rounded-lg p-3 hover:border-slate-300 hover:shadow-sm transition-all group"
          >
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-1.5">
                <div className={`w-7 h-7 rounded-md flex items-center justify-center ${colorMap[c.color]}`}>
                  <Icon size={14} />
                </div>
                <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">{c.label}</span>
              </div>
              <ChevronRight size={14} className="text-slate-300 group-hover:text-slate-500 transition-colors" />
            </div>
            {top3.length === 0 ? (
              <p className="text-xs text-slate-400 px-1 py-3 text-center">Нет данных</p>
            ) : (
              <ul className="space-y-1.5">
                {top3.map((e, idx) => (
                  <li key={e.employee_id} className="flex items-center gap-2 min-w-0">
                    <span className={`w-5 h-5 text-[10px] font-bold rounded flex items-center justify-center flex-shrink-0 ${
                      idx === 0 ? 'bg-amber-100 text-amber-700' :
                      idx === 1 ? 'bg-slate-100 text-slate-600' :
                                  'bg-orange-50 text-orange-700'
                    }`}>
                      {idx === 0 ? <Crown size={10} /> : idx + 1}
                    </span>
                    <span className="text-xs text-slate-800 truncate flex-1 min-w-0 font-medium">{e.employee_name}</span>
                    <span className="text-xs font-mono font-semibold text-slate-900 tabular-nums flex-shrink-0">
                      {c.valueFmt(e)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </button>
        );
      })}
    </div>
  );
};

const TopEmployeesModal = ({ data, criterion, onClose }) => {
  const config = {
    hours:   { title: 'Топ по часам',   list: data.by_hours,   valueFmt: (e) => formatHours(e.hours), icon: Clock },
    points:  { title: 'Топ по очкам',   list: data.by_points,  valueFmt: (e) => `${e.points.toFixed(0)} оч.`, icon: Target },
    bonuses: { title: 'Топ по премиям', list: data.by_bonuses, valueFmt: (e) => `+${formatMoney(e.bonuses)} ₴`, icon: TrendingUp },
  }[criterion];
  if (!config) return null;
  return (
    <ModalShell title={`${config.title} · ${formatMonth(data.month)}`} onClose={onClose} icon={config.icon}>
      <div className="max-h-[500px] overflow-y-auto">
        <ul className="divide-y divide-slate-100">
          {config.list.map((e, idx) => {
            const isZero = (criterion === 'hours' ? e.hours : criterion === 'points' ? e.points : e.bonuses) <= 0;
            return (
              <li key={e.employee_id} className={`flex items-center gap-3 px-5 py-2.5 ${isZero ? 'opacity-50' : ''}`}>
                <span className={`w-7 text-center text-sm font-semibold ${
                  idx < 3 ? 'text-slate-700' : 'text-slate-400'
                }`}>{idx + 1}</span>
                <Avatar name={e.employee_name} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900 truncate">{e.employee_name}</div>
                  <div className="text-[11px] text-slate-500 truncate">{e.position}</div>
                </div>
                <div className="text-sm font-mono font-semibold text-slate-900 tabular-nums">
                  {config.valueFmt(e)}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </ModalShell>
  );
};

// ---------- SHARED HELPERS ----------
const ModalShell = ({ title, onClose, icon: Icon, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" onClick={onClose}>
    <div
      className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2.5 px-5 py-3 border-b border-slate-100">
        {Icon && <Icon size={16} className="text-slate-400" />}
        <h3 className="text-sm font-semibold text-slate-900 flex-1">{title}</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors">
          <X size={16} />
        </button>
      </div>
      <div className="overflow-y-auto">{children}</div>
    </div>
  </div>
);

// Один сигнал прогноза: лейбл, текущее значение, его вес в блендинге, и MAPE если есть
const SignalBar = ({ label, description, value, weight, mape, color }) => {
  const colorMap = {
    blue:   { bg: 'bg-blue-100',   bar: 'bg-blue-500',   text: 'text-blue-900' },
    violet: { bg: 'bg-violet-100', bar: 'bg-violet-500', text: 'text-violet-900' },
    amber:  { bg: 'bg-amber-100',  bar: 'bg-amber-500',  text: 'text-amber-900' },
  }[color] || { bg: 'bg-slate-100', bar: 'bg-slate-500', text: 'text-slate-900' };
  const w = (weight ?? 0) * 100;
  const hasValue = value != null;
  return (
    <div className="bg-white/80 border border-blue-100 rounded-md p-2 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className={`text-xs font-semibold ${colorMap.text} truncate`}>{label}</div>
          <div className="text-[10px] text-slate-500 truncate">{description}</div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className={`text-sm font-mono font-semibold tabular-nums ${hasValue ? 'text-slate-900' : 'text-slate-300'}`}>
            {hasValue ? `${formatMoney(value)} ₴` : '—'}
          </div>
          {mape != null && (
            <div className="text-[9px] text-slate-500">истор. ошибка ±{mape}%</div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className={`flex-1 h-1.5 ${colorMap.bg} rounded overflow-hidden`}>
          <div className={`h-full ${colorMap.bar} transition-all`} style={{ width: `${w}%` }} />
        </div>
        <span className="text-[10px] font-mono font-semibold text-slate-700 tabular-nums w-10 text-right">
          {w > 0 ? `${Math.round(w)}%` : '—'}
        </span>
      </div>
    </div>
  );
};

const Stat = ({ label, value, mono, accent }) => (
  <div className="bg-slate-50 border border-slate-200 rounded-md p-3">
    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-medium mb-1">{label}</div>
    <div className={`text-lg font-semibold ${mono ? 'font-mono tabular-nums' : ''} ${accent || 'text-slate-900'}`}>
      {value}
    </div>
  </div>
);

const Row = ({ label, value, positive, negative, bold }) => (
  <div className={`flex items-center justify-between text-xs py-0.5 ${bold ? 'font-semibold text-slate-900' : ''}`}>
    <span className="text-slate-600">{label}</span>
    <span className={`font-mono tabular-nums ${
      positive ? 'text-emerald-600' :
      negative ? 'text-rose-600' :
      bold ? 'text-slate-900' : 'text-slate-700'
    }`}>{value}</span>
  </div>
);

export default AnalyticsBlock;
