// pages/cabinet/CabinetPayroll.jsx — зарплата за месяц (mobile-first)
import React, { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft, ChevronRight, Wallet, Timer, Target, TrendingUp,
  TrendingDown, AlertTriangle, Calculator, ReceiptText
} from 'lucide-react';
import { getMyPayroll, getMyTransactions } from '../../api/client';

const formatMonth = (m) => {
  const [year, month] = m.split('-').map(Number);
  return new Date(year, month - 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
};

const formatMoney = (n) => Math.round(n || 0).toLocaleString('ru-RU');

const TRANSACTION_TYPES = {
  bonus:   { label: 'Премия',  icon: TrendingUp,    color: 'emerald', sign: '+' },
  advance: { label: 'Аванс',   icon: Wallet,        color: 'amber',   sign: '−' },
  fine:    { label: 'Штраф',   icon: AlertTriangle, color: 'rose',    sign: '−' },
  points:  { label: 'Очки',    icon: Target,        color: 'indigo',  sign: '+' },
};

const CabinetPayroll = () => {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [payroll, setPayroll] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadMonth = useCallback(async () => {
    setLoading(true);
    try {
      const [pr, tr] = await Promise.all([
        getMyPayroll(month),
        getMyTransactions(month),
      ]);
      setPayroll(pr);
      setTransactions(tr);
    } catch (error) {
      console.error('Не удалось загрузить расчёт:', error);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    loadMonth();
  }, [loadMonth]);

  const changeMonth = (delta) => {
    const [year, mm] = month.split('-').map(Number);
    const next = new Date(year, mm - 1 + delta, 1);
    setMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
  };

  return (
    <div className="space-y-4">
      {/* Месяц-навигация */}
      <div className="flex items-center justify-between bg-white rounded-2xl p-2 shadow-soft border border-slate-100">
        <button
          onClick={() => changeMonth(-1)}
          className="w-11 h-11 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 active:bg-slate-200 transition-soft"
          aria-label="Предыдущий месяц"
        >
          <ChevronLeft size={22} />
        </button>
        <div className="text-center">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Месяц</p>
          <p className="text-base font-black text-slate-800 capitalize">{formatMonth(month)}</p>
        </div>
        <button
          onClick={() => changeMonth(1)}
          className="w-11 h-11 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 active:bg-slate-200 transition-soft"
          aria-label="Следующий месяц"
        >
          <ChevronRight size={22} />
        </button>
      </div>

      {loading && !payroll ? (
        <div className="flex flex-col items-center justify-center pt-16 text-slate-400">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mb-4"></div>
          <p className="text-sm">Считаем...</p>
        </div>
      ) : payroll ? (
        <>
          {/* Большая цифра — к выплате */}
          <div className="rounded-3xl p-6 text-white shadow-lg bg-gradient-to-br from-emerald-500 to-teal-600">
            <div className="flex items-center gap-2 opacity-90">
              <Wallet size={18} />
              <p className="text-[11px] font-bold uppercase tracking-widest">К выплате</p>
            </div>
            <p className="text-5xl font-black tracking-tighter mt-2">
              {formatMoney(payroll.to_pay)}
              <span className="text-2xl font-bold opacity-70 ml-1">₴</span>
            </p>
            <p className="text-xs font-medium opacity-80 mt-2">
              Предварительный расчёт. Финальную сумму подтверждает руководитель.
            </p>
          </div>

          {/* Часы и базовая ставка */}
          <div className="bg-white rounded-2xl p-4 shadow-soft border border-slate-100">
            <div className="flex items-center gap-2 mb-3">
              <Timer size={16} className="text-blue-500" />
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Базовая часть</p>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <MiniStat label="Ставка" value={`${formatMoney(payroll.salary_rate_used)} ₴`} sub="мес" />
              <MiniStat label="Часовая" value={`${payroll.hourly_rate.toFixed(0)} ₴`} sub="час" />
              <MiniStat label="Часов" value={payroll.total_hours_worked.toFixed(1)} sub="ч" />
            </div>
            <div className="flex items-center justify-between bg-blue-50 rounded-xl px-4 py-3">
              <span className="text-sm font-bold text-blue-700">Заработано по часам</span>
              <span className="text-lg font-black text-blue-700">{formatMoney(payroll.base_rate)} ₴</span>
            </div>
          </div>

          {/* Сдельная (очки) */}
          {payroll.total_points > 0 && (
            <div className="bg-white rounded-2xl p-4 shadow-soft border border-slate-100">
              <div className="flex items-center gap-2 mb-3">
                <Target size={16} className="text-indigo-500" />
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Сдельная (очки)</p>
              </div>
              <div className="flex items-center justify-between bg-indigo-50 rounded-xl px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-indigo-700">
                    {payroll.total_points.toFixed(1)} × {payroll.point_rate_used.toFixed(2)} ₴
                  </p>
                </div>
                <span className="text-lg font-black text-indigo-700">{formatMoney(payroll.piecework_sum)} ₴</span>
              </div>
            </div>
          )}

          {/* Премии / авансы / штрафы — компактные пары */}
          <div className="grid grid-cols-3 gap-3">
            <SummaryCard
              icon={<TrendingUp size={16} />}
              label="Премии"
              value={`+${formatMoney(payroll.bonuses_total)}`}
              color="emerald"
            />
            <SummaryCard
              icon={<Wallet size={16} />}
              label="Авансы"
              value={`−${formatMoney(payroll.advances_total)}`}
              color="amber"
            />
            <SummaryCard
              icon={<AlertTriangle size={16} />}
              label="Штрафы"
              value={`−${formatMoney(payroll.fines_total)}`}
              color="rose"
            />
          </div>

          {/* Итого с разбивкой */}
          <div className="bg-white rounded-2xl p-4 shadow-soft border border-slate-100">
            <div className="flex items-center gap-2 mb-3">
              <Calculator size={16} className="text-slate-500" />
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Расчёт</p>
            </div>
            <div className="space-y-2 text-sm">
              <BreakdownRow label="По часам" value={`+${formatMoney(payroll.base_rate)}`} />
              {payroll.piecework_sum > 0 && <BreakdownRow label="Очки" value={`+${formatMoney(payroll.piecework_sum)}`} />}
              {payroll.bonuses_total > 0 && <BreakdownRow label="Премии" value={`+${formatMoney(payroll.bonuses_total)}`} positive />}
              {payroll.advances_total > 0 && <BreakdownRow label="Авансы" value={`−${formatMoney(payroll.advances_total)}`} negative />}
              {payroll.fines_total > 0 && <BreakdownRow label="Штрафы" value={`−${formatMoney(payroll.fines_total)}`} negative />}
              <div className="border-t border-slate-200 pt-2 flex items-center justify-between">
                <span className="font-black text-slate-800">Итого</span>
                <span className="font-black text-slate-900 text-lg">{formatMoney(payroll.to_pay)} ₴</span>
              </div>
            </div>
          </div>

          {/* Список транзакций */}
          {transactions.length > 0 && (
            <div className="bg-white rounded-2xl p-4 shadow-soft border border-slate-100">
              <div className="flex items-center gap-2 mb-3">
                <ReceiptText size={16} className="text-slate-500" />
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Все начисления</p>
              </div>
              <div className="divide-y divide-slate-100 -mx-4 -mb-4">
                {transactions.map((t) => {
                  const cfg = TRANSACTION_TYPES[t.type] || { label: t.type, icon: ReceiptText, color: 'slate', sign: '' };
                  const Icon = cfg.icon;
                  return (
                    <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        cfg.color === 'emerald' ? 'bg-emerald-50 text-emerald-600' :
                        cfg.color === 'amber' ? 'bg-amber-50 text-amber-600' :
                        cfg.color === 'rose' ? 'bg-rose-50 text-rose-600' :
                        'bg-indigo-50 text-indigo-600'
                      }`}>
                        <Icon size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-800 truncate">
                          {cfg.label}
                          {t.type === 'points' && t.points_count != null && (
                            <span className="font-medium text-slate-400 ml-1">{t.points_count} оч.</span>
                          )}
                        </p>
                        {t.comment && <p className="text-xs text-slate-500 truncate">{t.comment}</p>}
                        <p className="text-[10px] text-slate-400 font-medium">
                          {new Date(t.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                        </p>
                      </div>
                      <span className={`font-black text-sm tabular-nums ${
                        cfg.color === 'emerald' || cfg.color === 'indigo' ? 'text-emerald-600' :
                        'text-rose-600'
                      }`}>
                        {cfg.sign}{formatMoney(t.amount)} ₴
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="text-center pt-16">
          <p className="text-slate-500 font-medium">Не удалось загрузить расчёт</p>
        </div>
      )}
    </div>
  );
};

const MiniStat = ({ label, value, sub }) => (
  <div className="bg-slate-50 rounded-xl p-2.5">
    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{label}</p>
    <p className="text-sm font-black text-slate-800 leading-tight">
      {value}
      {sub && <span className="text-[10px] font-medium text-slate-400 ml-1">/{sub}</span>}
    </p>
  </div>
);

const COLOR_BG = {
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  amber: 'bg-amber-50 text-amber-700 border-amber-100',
  rose: 'bg-rose-50 text-rose-700 border-rose-100',
};

const SummaryCard = ({ icon, label, value, color }) => (
  <div className={`rounded-2xl p-3 border ${COLOR_BG[color]}`}>
    <div className="flex items-center gap-1 mb-1.5 opacity-80">
      {icon}
      <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
    </div>
    <p className="text-base font-black tabular-nums">{value}</p>
  </div>
);

const BreakdownRow = ({ label, value, positive, negative }) => (
  <div className="flex items-center justify-between">
    <span className="text-slate-500">{label}</span>
    <span className={`font-bold tabular-nums ${
      positive ? 'text-emerald-600' : negative ? 'text-rose-600' : 'text-slate-800'
    }`}>
      {value}
    </span>
  </div>
);

export default CabinetPayroll;
