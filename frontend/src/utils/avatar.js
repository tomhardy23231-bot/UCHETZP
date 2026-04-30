// utils/avatar.js — единое место для аватарок (цвет + инициалы из ФИО).
// Раньше эта функция была дублирована в 3 местах с разными палитрами.

const PALETTE = [
  'bg-blue-500',
  'bg-indigo-500',
  'bg-violet-500',
  'bg-fuchsia-500',
  'bg-rose-500',
  'bg-orange-500',
  'bg-amber-500',
  'bg-emerald-500',
  'bg-teal-500',
  'bg-cyan-500',
];

// Хэшируем по всему имени, чтобы цвет не зависел от первой буквы
const hash = (str) => {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
};

export const getAvatarColor = (name) => {
  if (!name) return 'bg-slate-400';
  return PALETTE[hash(name) % PALETTE.length];
};

export const getInitials = (name) => {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const letters = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('');
  return letters || '?';
};
