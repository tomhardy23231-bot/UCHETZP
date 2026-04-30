// components/ui/Avatar.jsx — единый аватар-кружок с инициалами.
import React from 'react';
import { getAvatarColor, getInitials } from '../../utils/avatar';

const SIZES = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-14 h-14 text-lg',
};

const Avatar = ({ name, size = 'md', className = '' }) => (
  <div
    className={`${SIZES[size]} ${getAvatarColor(name)} rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0 ${className}`}
    title={name}
  >
    {getInitials(name)}
  </div>
);

export default Avatar;
