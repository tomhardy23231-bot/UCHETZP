// pages/Analytics.jsx — отдельная страница с аналитическими блоками,
// общий month-selector сверху прокидывается во все секции.
import React from 'react';
import { ChevronLeft, ChevronRight, BarChart3 } from 'lucide-react';
import { useTtlLocalStorage } from '../hooks/useTtlLocalStorage';
import AnalyticsBlock from '../components/dashboard/AnalyticsBlock';

const formatMonth = (m) => {
  if (!m) return '';
  const [y, mn] = m.split('-').map(Number);
  return new Date(y, mn - 1, 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
};

const Analytics = () => {
  const [selectedMonth, setSelectedMonth] = useTtlLocalStorage(
    'app_shared_month',
    new Date().toISOString().slice(0, 7)
  );

  const handlePrevMonth = () => {
    const d = new Date(selectedMonth + '-02');
    d.setMonth(d.getMonth() - 1);
    setSelectedMonth(d.toISOString().slice(0, 7));
  };
  const handleNextMonth = () => {
    const d = new Date(selectedMonth + '-02');
    d.setMonth(d.getMonth() + 1);
    setSelectedMonth(d.toISOString().slice(0, 7));
  };

  return (
    <div className="min-h-screen px-3 sm:px-6 md:px-8 py-4 md:py-6">
      <div className="mb-5 md:mb-6 flex items-end justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <h1 className="text-xl md:text-2xl font-semibold text-slate-900 tracking-tight">Аналитика</h1>
            <p className="text-xs md:text-sm text-slate-500 mt-0.5">
              Прогноз ФОТ, тепло-карта приходов, топы и тренды
            </p>
          </div>

          <div className="flex items-center bg-white border border-slate-200 rounded-md h-9 md:ml-2">
            <button
              onClick={handlePrevMonth}
              className="px-2 h-full text-slate-500 hover:text-slate-900 hover:bg-slate-50 rounded-l-md transition-colors"
              aria-label="Предыдущий месяц"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="px-3 text-sm font-medium text-slate-900 capitalize min-w-[140px] text-center">
              {formatMonth(selectedMonth)}
            </span>
            <button
              onClick={handleNextMonth}
              className="px-2 h-full text-slate-500 hover:text-slate-900 hover:bg-slate-50 rounded-r-md transition-colors"
              aria-label="Следующий месяц"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500 font-medium">
          <BarChart3 size={14} className="text-slate-400" />
          Все данные за выбранный месяц
        </div>
      </div>

      <AnalyticsBlock selectedMonth={selectedMonth} />
    </div>
  );
};

export default Analytics;
