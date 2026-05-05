// components/payroll/TransactionModal.jsx — одна универсальная модалка
// для всех 4 типов транзакций (премия, аванс, штраф, сдельная). Раньше было
// 4 копии 90% одинакового кода.
import React, { useState, useEffect } from 'react';
import { TrendingUp, Wallet, AlertTriangle, Target } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';

// Конфигурация по типу транзакции — что показать и как назвать
const TYPE_CONFIG = {
  BONUS: {
    title: 'Премия',
    icon: TrendingUp,
    accent: 'success',
    fields: ['amount', 'comment', 'date'],
    amountLabel: 'Сумма (грн)',
    commentLabel: 'Комментарий',
    placeholder: '1000.00',
  },
  ADVANCE: {
    title: 'Аванс',
    icon: Wallet,
    accent: 'warning',
    fields: ['amount', 'comment', 'date'],
    amountLabel: 'Сумма (грн)',
    commentLabel: 'Комментарий',
    placeholder: '5000.00',
  },
  FINE: {
    title: 'Штраф',
    icon: AlertTriangle,
    accent: 'danger',
    fields: ['amount', 'comment', 'date'],
    amountLabel: 'Сумма (грн)',
    commentLabel: 'Причина штрафа',
    placeholder: '500.00',
  },
  POINTS: {
    title: 'Сдельная работа',
    icon: Target,
    accent: 'primary',
    fields: ['points', 'comment', 'date'],
    commentLabel: 'Комментарий',
    placeholder: '100',
  },
};

const TransactionModal = ({
  open,
  onClose,
  type,            // 'BONUS' | 'ADVANCE' | 'FINE' | 'POINTS'
  defaultDate,     // YYYY-MM-DD — 1-е число просматриваемого месяца (бакет)
  pointValue,      // только для POINTS — для подсветки расчёта
  onSubmit,        // ({ amount, points_count, comment, date }) => Promise
}) => {
  const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.BONUS;
  const [amount, setAmount] = useState('');
  const [points, setPoints] = useState('');
  const [comment, setComment] = useState('');

  // Дата на бэкенде хранит «месяц-бакет» (по ней группируются транзакции
  // через startswith('YYYY-MM')). Поэтому всегда отправляем 1-е число
  // выбранного сверху месяца. Фактический момент создания записи фиксируется
  // в created_at на сервере и используется в UI как «реальная дата».
  const bucketDate = defaultDate; // YYYY-MM-01

  const periodLabel = React.useMemo(() => {
    if (!defaultDate) return '';
    const [y, m] = defaultDate.split('-').map(Number);
    if (!y || !m) return '';
    return new Date(y, m - 1, 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  }, [defaultDate]);

  const todayLabel = React.useMemo(
    () => new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    [open] // пересчитываем при каждом открытии модалки
  );

  // Сбрасываем значения при открытии
  useEffect(() => {
    if (open) {
      setAmount('');
      setPoints('');
      setComment('');
    }
  }, [open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const isPoints = type === 'POINTS';
    await onSubmit({
      amount: isPoints ? 0 : parseFloat(amount) || 0,
      points_count: isPoints ? parseFloat(points) || 0 : null,
      comment: comment || null,
      date: bucketDate,
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={cfg.title} icon={cfg.icon} size="md">
      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        {cfg.fields.includes('amount') && (
          <div>
            <label className="block text-xs font-medium text-slate-600 uppercase tracking-wider mb-1.5">
              {cfg.amountLabel} *
            </label>
            <input
              type="number" step="0.01" min="0" required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm font-medium"
              placeholder={cfg.placeholder}
              autoFocus
            />
          </div>
        )}

        {cfg.fields.includes('points') && (
          <div>
            <label className="block text-xs font-medium text-slate-600 uppercase tracking-wider mb-1.5">
              Очки *
            </label>
            <input
              type="number" step="0.01" required
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm font-medium"
              placeholder={cfg.placeholder}
              autoFocus
            />
            {points && pointValue != null && (
              <div className="mt-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-sm text-slate-600">
                {points} × {pointValue.toFixed(2)} = <span className="font-semibold text-slate-900">{(parseFloat(points) * pointValue).toFixed(2)} ₴</span>
              </div>
            )}
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-slate-600 uppercase tracking-wider mb-1.5">
            {cfg.commentLabel}
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm resize-none"
            placeholder="Описание..."
          />
        </div>

        <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-600 flex items-center justify-between gap-3">
          <span>
            Запись от <span className="font-semibold text-slate-900">{todayLabel}</span>
          </span>
          <span className="text-slate-400">→</span>
          <span className="text-right">
            попадёт в <span className="font-semibold text-slate-900 capitalize">{periodLabel}</span>
          </span>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Отмена</Button>
          <Button type="submit" variant={cfg.accent}>Добавить</Button>
        </div>
      </form>
    </Modal>
  );
};

export default TransactionModal;
