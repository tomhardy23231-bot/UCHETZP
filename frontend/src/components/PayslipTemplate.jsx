// components/PayslipTemplate.jsx — печатная форма расчётного листа.
// Один лист A4, чёрно-белая типографика, табличная вёрстка чисел.
// Никаких эмодзи и градиентов — это серьёзный документ.
import React from 'react';

const formatMonth = (m) => {
  if (!m) return '';
  const [y, mn] = m.split('-').map(Number);
  return new Date(y, mn - 1, 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
};

const formatDateShort = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
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

const TX_LABEL = {
  bonus:   'Премия',
  advance: 'Аванс',
  fine:    'Удержание',
  points:  'Сдельная',
};

// Маскировка номера счёта: 1234 5678 9012 3456 → ···· ···· ···· 3456
const maskBankAcc = (acc) => {
  if (!acc) return '—';
  const digits = String(acc).replace(/\D/g, '');
  if (digits.length < 4) return acc;
  const last4 = digits.slice(-4);
  const prefix = '···· ···· ····';
  return `${prefix} ${last4}`;
};

const PayslipTemplate = React.forwardRef(({ employee, payrollData, transactions }, ref) => {
  if (!employee || !payrollData) {
    return <div ref={ref}>Нет данных для печати</div>;
  }

  const docNumber = `РЛ-${payrollData.month?.replace('-', '')}-${String(employee.id).padStart(4, '0')}`;
  const generatedAt = new Date();
  const generatedAtStr = `${generatedAt.toLocaleDateString('ru-RU')}, ${generatedAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;

  // Разбиваем транзакции: bonus/points → начисления; advance/fine → удержания
  const txList = transactions || [];
  const bonusTx   = txList.filter((t) => t.type === 'bonus');
  const pointsTx  = txList.filter((t) => t.type === 'points');
  const advanceTx = txList.filter((t) => t.type === 'advance');
  const fineTx    = txList.filter((t) => t.type === 'fine');

  const totalAccrued = (payrollData.base_rate || 0) + (payrollData.piecework_sum || 0) + (payrollData.bonuses_total || 0);
  const totalDeducted = (payrollData.advances_total || 0) + (payrollData.fines_total || 0);

  return (
    <div
      ref={ref}
      className="payslip-doc bg-white text-slate-900 mx-auto"
      style={{
        width: '210mm',
        minHeight: '297mm',
        padding: '18mm 16mm',
        fontFamily: '"Segoe UI", "Helvetica Neue", Arial, sans-serif',
        fontSize: '11pt',
        lineHeight: 1.45,
        boxSizing: 'border-box',
      }}
    >
      {/* ============ HEADER ============ */}
      <div className="border-b-2 border-slate-900 pb-4 mb-6">
        <div className="flex items-end justify-between gap-6">
          <div>
            <p className="text-[9pt] uppercase tracking-[0.2em] text-slate-500 font-semibold">Расчётный документ</p>
            <h1 className="text-[20pt] font-bold tracking-tight leading-none mt-1">Расчётный лист</h1>
            <p className="text-[10pt] text-slate-600 mt-1">
              о начислении и выплате заработной платы
            </p>
          </div>
          <div className="text-right text-[9pt] font-mono">
            <div className="text-slate-500 uppercase tracking-wider">№ {docNumber}</div>
            <div className="text-slate-900 font-semibold mt-0.5">от {generatedAt.toLocaleDateString('ru-RU')}</div>
          </div>
        </div>
      </div>

      {/* ============ ШАПКА: ПЕРИОД + СОТРУДНИК ============ */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        <Field label="Расчётный период" value={
          <span className="capitalize font-semibold">{formatMonth(payrollData.month)}</span>
        } />
        <Field label="Дата формирования" value={generatedAtStr} mono />
      </div>

      <Section title="Сведения о сотруднике">
        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
          <Field label="ФИО" value={<span className="font-semibold">{employee.name}</span>} />
          <Field label="Должность" value={employee.position || '—'} />
          <Field label="Табельный номер" value={`№${String(employee.id).padStart(4, '0')}`} mono />
          <Field label="Телефон" value={employee.phone || '—'} mono />
          <Field
            label="Расчётный счёт"
            value={<span className="font-mono">{maskBankAcc(employee.bank_acc)}</span>}
          />
          <Field
            label="ID карты доступа"
            value={<span className="font-mono">{employee.card_id || '—'}</span>}
          />
        </div>
      </Section>

      {/* ============ ПАРАМЕТРЫ РАСЧЁТА ============ */}
      <Section title="Параметры расчёта">
        <div className="grid grid-cols-4 gap-4">
          <ParamCell
            label="Месячная ставка"
            value={`${formatMoney(payrollData.salary_rate_used)} ₴`}
            sub="по штатному расписанию"
          />
          <ParamCell
            label="Часовая ставка"
            value={`${formatMoney(payrollData.hourly_rate)} ₴/ч`}
            sub="ставка ÷ (21 × 9)"
          />
          <ParamCell
            label="Цена балла"
            value={`${formatMoney(payrollData.point_rate_used)} ₴`}
            sub="за единицу выработки"
          />
          <ParamCell
            label="Отработано"
            value={`${(payrollData.total_hours_worked || 0).toFixed(2)} ч`}
            sub={`баллов: ${(payrollData.total_points || 0).toFixed(0)}`}
          />
        </div>
      </Section>

      {/* ============ НАЧИСЛЕНИЯ ============ */}
      <Section title="I. Начислено">
        <table className="w-full text-[10pt]" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr className="border-y border-slate-900 text-[9pt] uppercase tracking-wider text-slate-700">
              <th className="text-left py-2 pr-2 font-semibold w-[8%]">№</th>
              <th className="text-left py-2 pr-2 font-semibold w-[14%]">Дата</th>
              <th className="text-left py-2 pr-2 font-semibold w-[24%]">Вид начисления</th>
              <th className="text-left py-2 pr-2 font-semibold">Основание / расчёт</th>
              <th className="text-right py-2 pl-2 font-semibold w-[18%]">Сумма, ₴</th>
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
            {pointsTx.length > 0 && pointsTx.some((t) => t.amount > 0) && (
              <tr className="border-b border-dashed border-slate-300 text-[8pt] text-slate-500 italic">
                <td colSpan={5} className="py-1.5 px-2">
                  Дополнительные сдельные транзакции учтены в строке «Сдельная работа»
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-900 font-semibold">
              <td colSpan={4} className="text-right py-2 pr-2 uppercase tracking-wider text-[9pt]">Итого начислено</td>
              <td className="text-right py-2 pl-2 font-mono tabular-nums text-[11pt]">{formatMoney(totalAccrued)} ₴</td>
            </tr>
          </tfoot>
        </table>
      </Section>

      {/* ============ УДЕРЖАНИЯ ============ */}
      <Section title="II. Удержано и выдано в счёт">
        {(advanceTx.length === 0 && fineTx.length === 0) ? (
          <p className="text-[10pt] text-slate-500 italic py-3 px-2 border border-slate-200 bg-slate-50">
            Удержаний и авансов в этом периоде не было.
          </p>
        ) : (
          <table className="w-full text-[10pt]" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr className="border-y border-slate-900 text-[9pt] uppercase tracking-wider text-slate-700">
                <th className="text-left py-2 pr-2 font-semibold w-[8%]">№</th>
                <th className="text-left py-2 pr-2 font-semibold w-[14%]">Дата</th>
                <th className="text-left py-2 pr-2 font-semibold w-[24%]">Вид</th>
                <th className="text-left py-2 pr-2 font-semibold">Основание</th>
                <th className="text-right py-2 pl-2 font-semibold w-[18%]">Сумма, ₴</th>
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
                <td colSpan={4} className="text-right py-2 pr-2 uppercase tracking-wider text-[9pt]">Итого удержано</td>
                <td className="text-right py-2 pl-2 font-mono tabular-nums text-[11pt]">−{formatMoney(totalDeducted)} ₴</td>
              </tr>
            </tfoot>
          </table>
        )}
      </Section>

      {/* ============ К ВЫПЛАТЕ ============ */}
      <div className="mt-6 mb-8 border-2 border-slate-900">
        <div className="flex items-center justify-between px-5 py-4 bg-slate-900 text-white">
          <div>
            <p className="text-[9pt] uppercase tracking-[0.2em] opacity-70">III. К выплате на руки</p>
            <p className="text-[8pt] opacity-60 mt-0.5">начислено − удержано</p>
          </div>
          <p className="text-[22pt] font-bold font-mono tabular-nums leading-none">
            {formatMoney(payrollData.to_pay)} ₴
          </p>
        </div>
        <div className="grid grid-cols-3 text-[9pt] divide-x divide-slate-200">
          <SummaryRow label="Начислено" value={`${formatMoney(totalAccrued)} ₴`} />
          <SummaryRow label="Удержано" value={`−${formatMoney(totalDeducted)} ₴`} />
          <SummaryRow label="К выплате" value={`${formatMoney(payrollData.to_pay)} ₴`} bold />
        </div>
      </div>

      {/* ============ ПОДПИСИ ============ */}
      <div className="grid grid-cols-2 gap-12 mt-10 mb-6">
        <SignatureBlock label="Расчёт произвёл" />
        <SignatureBlock label="Сумму получил" />
      </div>

      {/* ============ FOOTER ============ */}
      <div className="border-t border-slate-300 pt-3 text-[8pt] text-slate-500 leading-relaxed">
        <p>
          Документ № {docNumber} сформирован автоматически {generatedAtStr}.
          Расчёт произведён по данным учёта посещаемости и начислений за период {formatMonth(payrollData.month)}.
        </p>
        <p className="mt-1">
          Носит справочный характер. При расхождениях обращайтесь к руководителю до подписания.
        </p>
      </div>
    </div>
  );
});

// ============ ПОДКОМПОНЕНТЫ ============

const Section = ({ title, children }) => (
  <div className="mb-5">
    <h2 className="text-[10pt] uppercase tracking-[0.15em] font-semibold text-slate-700 border-b border-slate-300 pb-1 mb-3">
      {title}
    </h2>
    {children}
  </div>
);

const Field = ({ label, value, mono }) => (
  <div>
    <div className="text-[8.5pt] uppercase tracking-wider text-slate-500 font-medium">{label}</div>
    <div className={`text-[10.5pt] text-slate-900 mt-0.5 ${mono ? 'font-mono' : ''}`}>{value}</div>
  </div>
);

const ParamCell = ({ label, value, sub }) => (
  <div className="border border-slate-300 px-3 py-2.5">
    <div className="text-[8pt] uppercase tracking-wider text-slate-500 font-medium">{label}</div>
    <div className="text-[12pt] font-semibold font-mono tabular-nums text-slate-900 mt-0.5 leading-tight">{value}</div>
    {sub && <div className="text-[8pt] text-slate-500 mt-0.5">{sub}</div>}
  </div>
);

const PayslipRow = ({ num, date, kind, basis, amount, negative }) => (
  <tr className="border-b border-slate-200">
    <td className="py-2 pr-2 text-slate-500 font-mono">{num}</td>
    <td className="py-2 pr-2 text-slate-700 font-mono">{date}</td>
    <td className="py-2 pr-2 text-slate-900 font-medium">{kind}</td>
    <td className="py-2 pr-2 text-slate-600">{basis}</td>
    <td className={`py-2 pl-2 text-right font-mono tabular-nums ${negative ? 'text-rose-700' : 'text-slate-900'}`}>
      {negative ? '−' : ''}{formatMoney(amount)}
    </td>
  </tr>
);

const SummaryRow = ({ label, value, bold }) => (
  <div className="px-4 py-2">
    <div className="text-[8pt] uppercase tracking-wider text-slate-500 font-medium">{label}</div>
    <div className={`text-[11pt] font-mono tabular-nums mt-0.5 ${bold ? 'font-bold text-slate-900' : 'text-slate-700'}`}>
      {value}
    </div>
  </div>
);

const SignatureBlock = ({ label }) => (
  <div>
    <div className="text-[9pt] uppercase tracking-wider text-slate-500 font-medium mb-2">{label}</div>
    <div className="border-b border-slate-900 h-7" />
    <div className="flex justify-between text-[8pt] text-slate-500 mt-1">
      <span>подпись / расшифровка</span>
      <span>дата</span>
    </div>
  </div>
);

PayslipTemplate.displayName = 'PayslipTemplate';
export default PayslipTemplate;
