// utils/exportCsv.js — простой экспорт в CSV/Excel без зависимостей.
// CSV с кодировкой UTF-8 и BOM, чтобы Excel правильно показал кириллицу.

const escapeCell = (val) => {
  if (val === null || val === undefined) return '';
  const s = String(val);
  // Если есть спецсимвол — оборачиваем в кавычки и экранируем кавычки внутри
  if (s.includes(';') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
};

/**
 * Сохраняет таблицу как CSV-файл, который Excel откроет по двойному клику.
 * @param {string} filename — имя файла без расширения
 * @param {string[]} headers — заголовки столбцов
 * @param {Array<Array<any>>} rows — массив строк (каждая строка — массив ячеек)
 */
export const downloadCsv = (filename, headers, rows) => {
  const lines = [headers.map(escapeCell).join(';')];
  rows.forEach((row) => lines.push(row.map(escapeCell).join(';')));

  // BOM (﻿) для корректной кириллицы в Excel
  const csv = '﻿' + lines.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
