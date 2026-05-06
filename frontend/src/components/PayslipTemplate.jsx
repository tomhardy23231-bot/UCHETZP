// components/PayslipTemplate.jsx — печатная форма расчётного листа.
// Гарантированно один лист A4: контейнер фиксирован 210×297 мм с overflow:hidden,
// внутри JS-масштаб подгоняет содержимое если оно больше высоты страницы (например,
// много транзакций). При типовом расчёте scale=1; при перегрузе — пропорциональное
// уменьшение, текст остаётся читаемым.
import React, { useLayoutEffect, useRef, useState } from 'react';

const formatMonth = (m) => {
  if (!m) return '';
  const [y, mn] = m.split('-').map(Number);
  return new Date(y, mn - 1, 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
};

const formatDateOnly = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
};

const formatMoney = (n, opts = {}) => {
  const v = Number(n) || 0;
  return v.toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...opts,
  });
};

// Маскировка номера счёта: ···· ···· ···· 3456
const maskBankAcc = (acc) => {
  if (!acc) return '—';
  const digits = String(acc).replace(/\D/g, '');
  if (digits.length < 4) return acc;
  return `···· ···· ···· ${digits.slice(-4)}`;
};

// 1mm = 3.7795 CSS px при 96dpi (стандарт для печати/canvas)
const MM_TO_PX = 3.7795275591;
const A4_HEIGHT_PX = 297 * MM_TO_PX;
const A4_WIDTH_PX = 210 * MM_TO_PX;

const PayslipTemplate = React.forwardRef(({ employee, payrollData, transactions }, ref) => {
  const innerRef = useRef(null);
  const [scale, setScale] = useState(1);

  // Измеряем реальную высоту содержимого и подгоняем масштаб так чтобы помещалось в A4.
  // Учитываем мелкий запас 4px на округление, чтоб иногда не выпадало в перерасчёт.
  useLayoutEffect(() => {
    const fit = () => {
      const el = innerRef.current;
      if (!el) return;
      // Сбрасываем scale=1 чтобы измерить нативную высоту, потом считаем
      el.style.transform = 'scale(1)';
      el.style.width = '100%';
      const contentH = el.scrollHeight;
      const targetH = A4_HEIGHT_PX - 4;
      const newScale = contentH > targetH ? targetH / contentH : 1;
      setScale(newScale);
    };
    fit();
    // Повторно после загрузки шрифтов — вёрстка может слегка сдвинуться
    const t1 = window.setTimeout(fit, 100);
    const t2 = window.setTimeout(fit, 500);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  }, [employee, payrollData, transactions]);

  if (!employee || !payrollData) {
    return <div ref={ref}>Нет данных для печати</div>;
  }

  const docNumber = `РЛ-${(payrollData.month || '').replace('-', '')}-${String(employee.id).padStart(4, '0')}`;
  const generatedAt = new Date();
  const generatedAtStr = `${generatedAt.toLocaleDateString('ru-RU')}, ${generatedAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;

  const txList = transactions || [];
  const bonusTx   = txList.filter((t) => t.type === 'bonus');
  const advanceTx = txList.filter((t) => t.type === 'advance');
  const fineTx    = txList.filter((t) => t.type === 'fine');

  const totalAccrued = (payrollData.base_rate || 0) + (payrollData.piecework_sum || 0) + (payrollData.bonuses_total || 0);
  const totalDeducted = (payrollData.advances_total || 0) + (payrollData.fines_total || 0);

  return (
    <div
      ref={ref}
      className="bg-white text-slate-900 mx-auto"
      style={{
        width: `${A4_WIDTH_PX}px`,
        height: `${A4_HEIGHT_PX}px`,
        overflow: 'hidden',
        position: 'relative',
        boxSizing: 'border-box',
        fontFamily: '"Segoe UI", "Helvetica Neue", Arial, sans-serif',
      }}
    >
      <div
        ref={innerRef}
        style={{
          transformOrigin: 'top left',
          transform: `scale(${scale})`,
          width: `${100 / scale}%`,
          padding: '12mm 14mm',
          boxSizing: 'border-box',
          fontSize: '10pt',
          lineHeight: 1.35,
        }}
      >
        {/* HEADER */}
        <div className="border-b-2 border-slate-900 pb-2.5 mb-3">
          <div className="flex items-end justify-between gap-6">
            <div>
              <p className="text-[8pt] uppercase tracking-[0.2em] text-slate-500 font-semibold">Расчётный документ</p>
              <h1 className="text-[16pt] font-bold tracking-tight leading-none mt-0.5">Расчётный лист</h1>
              <p className="text-[9pt] text-slate-600 mt-0.5">о начислении и выплате заработной платы</p>
            </div>
            <div className="text-right text-[8.5pt] font-mono">
              <div className="text-slate-500 uppercase tracking-wider">№ {docNumber}</div>
              <div className="text-slate-900 font-semibold mt-0.5">от {generatedAt.toLocaleDateString('ru-RU')}</div>
              <div className="text-slate-500 mt-0.5 capitalize">за {formatMonth(payrollData.month)}</div>
            </div>
          </div>
        </div>

        {/* СОТРУДНИК — 3 колонки */}
        <Section title="Сведения о сотруднике">
          <div className="grid grid-cols-3 gap-x-4 gap-y-1.5">
            <Field label="ФИО" value={<span className="font-semibold">{employee.name}</span>} colSpan={2} />
            <Field label="Должность" value={employee.position || '—'} />
            <Field label="Табельный №" value={`№${String(employee.id).padStart(4, '0')}`} mono />
            <Field label="Телефон" value={employee.phone || '—'} mono />
            <Field label="ID карты" value={employee.card_id || '—'} mono />
            <Field
              label="Расчётный счёт"
              value={<span className="font-mono">{maskBankAcc(employee.bank_acc)}</span>}
              colSpan={3}
            />
          </div>
        </Section>

        {/* ПАРАМЕТРЫ */}
        <Section title="Параметры расчёта">
          <div className="grid grid-cols-4 gap-2.5">
            <ParamCell
              label="Месячная ставка"
              value={`${formatMoney(payrollData.salary_rate_used)} ₴`}
              sub="по штатному"
            />
            <ParamCell
              label="Часовая ставка"
              value={`${formatMoney(payrollData.hourly_rate)} ₴/ч`}
              sub="ставка ÷ (21×9)"
            />
            <ParamCell
              label="Цена балла"
              value={`${formatMoney(payrollData.point_rate_used)} ₴`}
              sub="за единицу"
            />
            <ParamCell
              label="Отработано"
              value={`${(payrollData.total_hours_worked || 0).toFixed(2)} ч`}
              sub={`баллов: ${(payrollData.total_points || 0).toFixed(0)}`}
            />
          </div>
        </Section>

        {/* I. НАЧИСЛЕНО */}
        <Section title="I. Начислено">
          <table className="w-full text-[9.5pt]" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr className="border-y border-slate-900 text-[8.5pt] uppercase tracking-wider text-slate-700">
                <th className="text-left py-1.5 pr-2 font-semibold w-[6%]">№</th>
                <th className="text-left py-1.5 pr-2 font-semibold w-[10%]">Дата</th>
                <th className="text-left py-1.5 pr-2 font-semibold w-[24%]">Вид начисления</th>
                <th className="text-left py-1.5 pr-2 font-semibold">Основание / расчёт</th>
                <th className="text-right py-1.5 pl-2 font-semibold w-[18%]">Сумма, ₴</th>
              </tr>
            </thead>
            <tbody>
              <PayslipRow
                num={1}
                date="—"
                kind="Оплата по часам"
                basis={`${(payrollData.total_hours_worked || 0).toFixed(2)} ч × ${formatMoney(payrollData.hourly_rate)} ₴/ч`}
                amount={payrollData.base_rate}
              />
              {payrollData.piecework_sum > 0 && (
                <PayslipRow
                  num={2}
                  date="—"
                  kind="Сдельная работа"
                  basis={`${(payrollData.total_points || 0).toFixed(0)} б × ${formatMoney(payrollData.point_rate_used)} ₴`}
                  amount={payrollData.piecework_sum}
                />
              )}
              {bonusTx.map((t, i) => (
                <PayslipRow
                  key={`b-${t.id}`}
                  num={(payrollData.piecework_sum > 0 ? 3 : 2) + i}
                  date={formatDateOnly(t.created_at || t.date)}
                  kind="Премия"
                  basis={t.comment || '—'}
                  amount={t.amount}
                />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-900 font-semibold">
                <td colSpan={4} className="text-right py-1.5 pr-2 uppercase tracking-wider text-[8.5pt]">Итого начислено</td>
                <td className="text-right py-1.5 pl-2 font-mono tabular-nums text-[10.5pt]">{formatMoney(totalAccrued)} ₴</td>
              </tr>
            </tfoot>
          </table>
        </Section>

        {/* II. УДЕРЖАНО */}
        <Section title="II. Удержано и выдано в счёт">
          {(advanceTx.length === 0 && fineTx.length === 0) ? (
            <p className="text-[9.5pt] text-slate-500 italic py-2 px-2 border border-slate-200 bg-slate-50">
              Удержаний и авансов в этом периоде не было.
            </p>
          ) : (
            <table className="w-full text-[9.5pt]" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr className="border-y border-slate-900 text-[8.5pt] uppercase tracking-wider text-slate-700">
                  <th className="text-left py-1.5 pr-2 font-semibold w-[6%]">№</th>
                  <th className="text-left py-1.5 pr-2 font-semibold w-[10%]">Дата</th>
                  <th className="text-left py-1.5 pr-2 font-semibold w-[24%]">Вид</th>
                  <th className="text-left py-1.5 pr-2 font-semibold">Основание</th>
                  <th className="text-right py-1.5 pl-2 font-semibold w-[18%]">Сумма, ₴</th>
                </tr>
              </thead>
              <tbody>
                {advanceTx.map((t, i) => (
                  <PayslipRow
                    key={`a-${t.id}`}
                    num={i + 1}
                    date={formatDateOnly(t.created_at || t.date)}
                    kind="Аванс"
                    basis={t.comment || 'выдано ранее в счёт зарплаты'}
                    amount={t.amount}
                    negative
                  />
                ))}
                {fineTx.map((t, i) => (
                  <PayslipRow
                    key={`f-${t.id}`}
                    num={advanceTx.length + i + 1}
                    date={formatDateOnly(t.created_at || t.date)}
                    kind="Удержание"
                    basis={t.comment || '—'}
                    amount={t.amount}
                    negative
                  />
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-900 font-semibold">
                  <td colSpan={4} className="text-right py-1.5 pr-2 uppercase tracking-wider text-[8.5pt]">Итого удержано</td>
                  <td className="text-right py-1.5 pl-2 font-mono tabular-nums text-[10.5pt]">−{formatMoney(totalDeducted)} ₴</td>
                </tr>
              </tfoot>
            </table>
          )}
        </Section>

        {/* III. К ВЫПЛАТЕ */}
        <div className="mt-3 mb-4 border-2 border-slate-900">
          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 text-white">
            <div>
              <p className="text-[8.5pt] uppercase tracking-[0.2em] opacity-70">III. К выплате на руки</p>
              <p className="text-[7.5pt] opacity-60 mt-0.5">начислено − удержано</p>
            </div>
            <p className="text-[18pt] font-bold font-mono tabular-nums leading-none">
              {formatMoney(payrollData.to_pay)} ₴
            </p>
          </div>
          <div className="grid grid-cols-3 text-[8.5pt] divide-x divide-slate-200">
            <SummaryRow label="Начислено" value={`${formatMoney(totalAccrued)} ₴`} />
            <SummaryRow label="Удержано" value={`−${formatMoney(totalDeducted)} ₴`} />
            <SummaryRow label="К выплате" value={`${formatMoney(payrollData.to_pay)} ₴`} bold />
          </div>
        </div>

        {/* ПОДПИСИ */}
        <div className="grid grid-cols-2 gap-10 mt-4 mb-3">
          <SignatureBlock label="Расчёт произвёл" />
          <SignatureBlock label="Сумму получил" />
        </div>

        {/* FOOTER */}
        <div className="border-t border-slate-300 pt-2 text-[7.5pt] text-slate-500 leading-snug">
          <p>
            Документ № {docNumber} сформирован автоматически {generatedAtStr}.
            Расчёт произведён по данным учёта за период {formatMonth(payrollData.month)}.
          </p>
          <p className="mt-0.5">
            Носит справочный характер. При расхождениях обращайтесь к руководителю до подписания.
          </p>
        </div>
      </div>
    </div>
  );
});

// ============ ПОДКОМПОНЕНТЫ ============

const Section = ({ title, children }) => (
  <div className="mb-3">
    <h2 className="text-[9pt] uppercase tracking-[0.15em] font-semibold text-slate-700 border-b border-slate-300 pb-0.5 mb-2">
      {title}
    </h2>
    {children}
  </div>
);

const Field = ({ label, value, mono, colSpan }) => (
  <div className={colSpan === 2 ? 'col-span-2' : colSpan === 3 ? 'col-span-3' : ''}>
    <div className="text-[7.5pt] uppercase tracking-wider text-slate-500 font-medium">{label}</div>
    <div className={`text-[10pt] text-slate-900 ${mono ? 'font-mono' : ''}`}>{value}</div>
  </div>
);

const ParamCell = ({ label, value, sub }) => (
  <div className="border border-slate-300 px-2.5 py-1.5">
    <div className="text-[7pt] uppercase tracking-wider text-slate-500 font-medium">{label}</div>
    <div className="text-[10.5pt] font-semibold font-mono tabular-nums text-slate-900 mt-0.5 leading-tight">{value}</div>
    {sub && <div className="text-[7pt] text-slate-500 mt-0.5">{sub}</div>}
  </div>
);

const PayslipRow = ({ num, date, kind, basis, amount, negative }) => (
  <tr className="border-b border-slate-200">
    <td className="py-1 pr-2 text-slate-500 font-mono">{num}</td>
    <td className="py-1 pr-2 text-slate-700 font-mono">{date}</td>
    <td className="py-1 pr-2 text-slate-900 font-medium">{kind}</td>
    <td className="py-1 pr-2 text-slate-600">{basis}</td>
    <td className={`py-1 pl-2 text-right font-mono tabular-nums ${negative ? 'text-rose-700' : 'text-slate-900'}`}>
      {negative ? '−' : ''}{formatMoney(amount)}
    </td>
  </tr>
);

const SummaryRow = ({ label, value, bold }) => (
  <div className="px-3 py-1.5">
    <div className="text-[7.5pt] uppercase tracking-wider text-slate-500 font-medium">{label}</div>
    <div className={`text-[10pt] font-mono tabular-nums mt-0.5 ${bold ? 'font-bold text-slate-900' : 'text-slate-700'}`}>
      {value}
    </div>
  </div>
);

const SignatureBlock = ({ label }) => (
  <div>
    <div className="text-[8.5pt] uppercase tracking-wider text-slate-500 font-medium mb-1.5">{label}</div>
    <div className="border-b border-slate-900 h-5" />
    <div className="flex justify-between text-[7.5pt] text-slate-500 mt-0.5">
      <span>подпись / расшифровка</span>
      <span>дата</span>
    </div>
  </div>
);

PayslipTemplate.displayName = 'PayslipTemplate';
export default PayslipTemplate;
