import React from 'react';
import { getAvatarForPlayer } from '../utils/avatars';

interface PlayerAvatarProps {
  displayName: string;
  playerCode?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showCode?: boolean;
  selected?: boolean;
  className?: string;
}

export const PlayerAvatar: React.FC<PlayerAvatarProps> = ({
  displayName,
  playerCode,
  size = 'md',
  showCode = true,
  selected = false,
  className = '',
}) => {
  const avatar = getAvatarForPlayer(displayName || playerCode || 'Player');

  const sizeStyles = {
    sm: 'w-8 h-8 text-sm',
    md: 'w-11 h-11 text-lg',
    lg: 'w-16 h-16 text-2xl',
    xl: 'w-24 h-24 text-4xl',
  };

  const codeBadgeStyles = {
    sm: 'text-[9px] -bottom-1 -right-1 px-1 py-0.2',
    md: 'text-[10px] -bottom-1 -right-1 px-1.5 py-0.5',
    lg: 'text-xs -bottom-1.5 -right-1 px-2 py-0.5',
    xl: 'text-sm -bottom-2 -right-1 px-2.5 py-1',
  };

  return (
    <div className={`relative inline-block ${className}`}>
      <div
        className={`${sizeStyles[size]} rounded-2xl bg-gradient-to-tr ${avatar.gradient} p-[2px] shadow-md transition-all duration-300 ${
          selected ? 'ring-2 ring-indigo-400 scale-105 shadow-indigo-500/40' : ''
        }`}
      >
        <div className="w-full h-full bg-[#111726]/80 rounded-[14px] flex items-center justify-center select-none backdrop-blur-sm">
          <span>{avatar.emoji}</span>
        </div>
      </div>

      {showCode && playerCode && (
        <span
          className={`absolute ${codeBadgeStyles[size]} rounded-md font-extrabold uppercase bg-indigo-600 text-white border border-indigo-400/50 shadow-md flex items-center justify-center font-mono`}
        >
          {playerCode}
        </span>
      )}
    </div>
  );
};

