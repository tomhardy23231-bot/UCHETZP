import React from 'react';

const PayslipTemplate = React.forwardRef(({ employee, payrollData, transactions }, ref) => {
    if (!employee || !payrollData || !transactions) {
        return <div ref={ref}>Loading payslip data...</div>;
    }

    const formatMonth = (monthStr) => {
        const [year, month] = monthStr.split('-');
        const date = new Date(year, month - 1);
        return date.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
    };

    const getTransactionIcon = (type) => {
        switch (type) {
            case 'bonus': return '⬆️';
            case 'advance': return '💰';
            case 'fine': return '⬇️';
            case 'points': return '🎯';
            default: return '';
        }
    };

    const getTransactionLabel = (type) => {
        switch (type) {
            case 'bonus': return 'Премия';
            case 'advance': return 'Аванс';
            case 'fine': return 'Штраф';
            case 'points': return 'Сдельная';
            default: return type;
        }
    };

    const earnings = payrollData.details.filter(d => ['bonus', 'points'].includes(d.type));
    const deductions = payrollData.details.filter(d => ['advance', 'fine'].includes(d.type));

    const totalEarnings = payrollData.base_rate + payrollData.piecework_sum + payrollData.bonuses_total;
    const totalDeductions = payrollData.advances_total + payrollData.fines_total;

    return (
        <div ref={ref} className="p-8 bg-white text-gray-800 w-[210mm] min-h-[297mm] mx-auto shadow-lg">
            {/* Header */}
            <div className="flex justify-between items-center border-b-4 border-blue-600 pb-4 mb-8">
                <div>
                    <h1 className="text-5xl font-extrabold text-blue-800 tracking-tight">PAYSLIP</h1>
                    <p className="text-xl text-gray-600 mt-2">Payroll System</p>
                </div>
                <div className="text-right">
                    <p className="text-xl font-semibold text-gray-700">{formatMonth(payrollData.month)}</p>
                    <p className="text-md text-gray-500">Payroll Period</p>
                </div>
            </div>

            {/* Employee Details */}
            <div className="grid grid-cols-2 gap-4 mb-8 bg-blue-50 p-6 rounded-lg">
                <div>
                    <p className="text-sm font-medium text-blue-700">Сотрудник</p>
                    <p className="text-2xl font-bold text-gray-900">{employee.name}</p>
                </div>
                <div>
                    <p className="text-sm font-medium text-blue-700">Должность</p>
                    <p className="text-xl text-gray-800">{employee.position}</p>
                </div>
                <div>
                    <p className="text-sm font-medium text-blue-700">ID Сотрудника</p>
                    <p className="text-xl text-gray-800">{employee.id}</p>
                </div>
                <div>
                    <p className="text-sm font-medium text-blue-700">Телефон</p>
                    <p className="text-xl text-gray-800">{employee.phone || 'N/A'}</p>
                </div>
            </div>

            {/* Key Metrics Section */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <div className="bg-blue-100 p-4 rounded-lg text-center shadow-sm">
                    <p className="text-sm text-blue-700">Часов отработано</p>
                    <p className="text-3xl font-bold text-blue-800">{payrollData.total_hours_worked?.toFixed(1) || '0.0'}h</p>
                    <p className="text-xs text-blue-600">@{payrollData.hourly_rate?.toFixed(2) || '0.00'} ₴/час</p>
                </div>
                <div className="bg-purple-100 p-4 rounded-lg text-center shadow-sm">
                    <p className="text-sm text-purple-700">Набрано баллов</p>
                    <p className="text-3xl font-bold text-purple-800">{payrollData.total_points?.toFixed(0) || '0'} pts</p>
                    <p className="text-xs text-purple-600">@{payrollData.point_rate_used?.toFixed(2) || '0.00'} ₴/балл</p>
                </div>
                <div className="bg-emerald-100 p-4 rounded-lg text-center shadow-sm">
                    <p className="text-sm text-emerald-700">Месячная ставка</p>
                    <p className="text-3xl font-bold text-emerald-800">{employee.rate.toFixed(2)} ₴</p>
                    <p className="text-xs text-emerald-600">Текущая</p>
                </div>
                <div className="bg-indigo-100 p-4 rounded-lg text-center shadow-sm">
                    <p className="text-sm text-indigo-700">Номер счёта</p>
                    <p className="text-xl font-bold text-indigo-800">{employee.bank_acc || 'N/A'}</p>
                    <p className="text-xs text-indigo-600">16 цифр</p>
                </div>
            </div>

            {/* Financial Breakdown */}
            <div className="grid grid-cols-2 gap-8 mb-8">
                {/* Earnings */}
                <div>
                    <h3 className="text-2xl font-bold text-emerald-700 border-b-2 border-emerald-300 pb-2 mb-4 flex items-center">
                        <span className="mr-2">📈</span> Начисления
                    </h3>
                    <div className="space-y-3">
                        <div className="flex justify-between items-center text-lg py-2 border-b border-gray-100">
                            <span className="font-medium">Базовая зарплата</span>
                            <span className="font-semibold text-gray-800">{payrollData.base_rate?.toFixed(2)} ₴</span>
                        </div>
                        {payrollData.piecework_sum > 0 && (
                            <div className="flex justify-between items-center text-lg py-2 border-b border-gray-100">
                                <span className="font-medium">Сдельная оплата</span>
                                <span className="font-semibold text-gray-800">{payrollData.piecework_sum.toFixed(2)} ₴</span>
                            </div>
                        )}
                        {earnings.map((detail, index) => (
                            <div key={index} className="flex justify-between items-center text-lg py-2 border-b border-gray-100">
                                <span className="font-medium flex items-center gap-2">{getTransactionIcon(detail.type)} {getTransactionLabel(detail.type)} {detail.comment && <span className="text-sm text-gray-500">({detail.comment})</span>}</span>
                                <span className="font-semibold text-emerald-600">+{detail.amount.toFixed(2)} ₴</span>
                            </div>
                        ))}
                    </div>
                    <div className="flex justify-between items-center text-xl font-bold pt-4 border-t-2 border-emerald-300 mt-4">
                        <span>ИТОГО НАЧИСЛЕНО</span>
                        <span className="text-emerald-700">{totalEarnings.toFixed(2)} ₴</span>
                    </div>
                </div>

                {/* Deductions */}
                <div>
                    <h3 className="text-2xl font-bold text-rose-700 border-b-2 border-rose-300 pb-2 mb-4 flex items-center">
                        <span className="mr-2">📉</span> Удержания
                    </h3>
                    <div className="space-y-3">
                        {deductions.map((detail, index) => (
                            <div key={index} className="flex justify-between items-center text-lg py-2 border-b border-gray-100">
                                <span className="font-medium flex items-center gap-2">{getTransactionIcon(detail.type)} {getTransactionLabel(detail.type)} {detail.comment && <span className="text-sm text-gray-500">({detail.comment})</span>}</span>
                                <span className="font-semibold text-rose-600">-{detail.amount.toFixed(2)} ₴</span>
                            </div>
                        ))}
                        {totalDeductions === 0 && (
                            <div className="text-center text-gray-500 py-4">Нет удержаний</div>
                        )}
                    </div>
                    <div className="flex justify-between items-center text-xl font-bold pt-4 border-t-2 border-rose-300 mt-4">
                        <span>ИТОГО УДЕРЖАНО</span>
                        <span className="text-rose-700">-{totalDeductions.toFixed(2)} ₴</span>
                    </div>
                </div>
            </div>

            {/* Net Pay */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white p-8 rounded-lg text-center shadow-xl">
                <p className="text-xl font-medium mb-2">ИТОГО К ВЫПЛАТЕ</p>
                <p className="text-6xl font-extrabold">{payrollData.to_pay?.toFixed(2) || '0.00'} ₴</p>
            </div>

            {/* Footer */}
            <div className="mt-8 pt-4 border-t border-gray-200 text-center text-gray-500 text-sm">
                <p>Сгенерировано: {new Date().toLocaleDateString('ru-RU')} {new Date().toLocaleTimeString('ru-RU')}</p>
                <p>&copy; {new Date().getFullYear()} Payroll System. All rights reserved.</p>
            </div>
        </div>
    );
});

export default PayslipTemplate;
