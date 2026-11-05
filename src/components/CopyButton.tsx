import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { copyToClipboard } from '../utils/sharing';

interface CopyButtonProps {
  textToCopy: string;
  label?: string;
  copiedLabel?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'outline' | 'solid' | 'ghost';
  fullWidth?: boolean;
  className?: string;
}

export const CopyButton: React.FC<CopyButtonProps> = ({
  textToCopy,
  label = 'Copy Link',
  copiedLabel = 'Copied!',
  size = 'md',
  variant = 'outline',
  fullWidth = false,
  className = '',
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const success = await copyToClipboard(textToCopy);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    }
  };

  const sizeStyles = {
    sm: 'text-xs py-2 px-3 min-h-[38px]',
    md: 'text-sm py-2.5 px-4 min-h-[44px]',
    lg: 'text-base py-3 px-5 min-h-[48px]',
  };

  const variantStyles = {
    outline: 'border border-slate-700 bg-slate-800/80 hover:bg-slate-700/80 text-slate-200',
    solid: 'bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white shadow-lg shadow-indigo-600/25',
    ghost: 'hover:bg-slate-800 text-slate-300 hover:text-white',
  };

  return (
    <button
      onClick={handleCopy}
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${
        sizeStyles[size]
      } ${variantStyles[variant]} ${fullWidth ? 'w-full' : ''} ${className}`}
      aria-label={label}
    >
      {copied ? (
        <>
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="text-emerald-400 font-bold">{copiedLabel}</span>
        </>
      ) : (
        <>
          <Copy className="w-4 h-4 shrink-0" />
          <span>{label}</span>
        </>
      )}
    </button>
  );
};
