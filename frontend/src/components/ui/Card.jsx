// components/ui/Card.jsx — карточка в Linear-стиле: белый фон, тонкая граница,
// без избыточных теней.
import React from 'react';

const Card = ({ children, className = '', as: Tag = 'div', ...rest }) => (
  <Tag
    className={`bg-white border border-slate-200 rounded-lg ${className}`}
    {...rest}
  >
    {children}
  </Tag>
);

export const CardHeader = ({ children, className = '' }) => (
  <div className={`px-5 py-4 border-b border-slate-100 ${className}`}>{children}</div>
);

export const CardBody = ({ children, className = '' }) => (
  <div className={`p-5 ${className}`}>{children}</div>
);

export default Card;
