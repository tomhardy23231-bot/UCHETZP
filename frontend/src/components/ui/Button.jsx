// components/ui/Button.jsx — единая кнопка в стиле Linear/Vercel.
// Минимальные тени, тонкие границы, плотная типографика.
import React from 'react';

const VARIANTS = {
  primary: 'bg-slate-900 text-white hover:bg-slate-800 active:bg-slate-950 disabled:bg-slate-400',
  secondary: 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-50',
  ghost: 'text-slate-600 hover:bg-slate-100 active:bg-slate-200 disabled:opacity-50',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800 disabled:opacity-50',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50',
  warning: 'bg-amber-500 text-white hover:bg-amber-600 active:bg-amber-700 disabled:opacity-50',
};

const SIZES = {
  xs: 'h-7 px-2.5 text-xs gap-1',
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
  lg: 'h-10 px-5 text-sm gap-2',
};

const Button = ({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  iconRight: IconRight,
  children,
  className = '',
  ...rest
}) => {
  const cls = `
    inline-flex items-center justify-center font-medium rounded-md
    transition-colors disabled:cursor-not-allowed
    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1
    ${VARIANTS[variant] || VARIANTS.secondary}
    ${SIZES[size] || SIZES.md}
    ${className}
  `.replace(/\s+/g, ' ').trim();

  const iconSize = size === 'xs' ? 14 : size === 'sm' ? 15 : 16;

  return (
    <button className={cls} {...rest}>
      {Icon && <Icon size={iconSize} />}
      {children}
      {IconRight && <IconRight size={iconSize} />}
    </button>
  );
};

export default Button;
