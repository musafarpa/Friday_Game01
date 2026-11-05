import React from 'react';
import { MessageCircle } from 'lucide-react';

interface WhatsAppButtonProps {
  url: string;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  className?: string;
}

export const WhatsAppButton: React.FC<WhatsAppButtonProps> = ({
  url,
  label = 'Share via WhatsApp',
  size = 'md',
  fullWidth = false,
  className = '',
}) => {
  const sizeStyles = {
    sm: 'text-xs py-2 px-3 min-h-[38px]',
    md: 'text-sm py-2.5 px-4 min-h-[44px]',
    lg: 'text-base py-3 px-5 min-h-[48px]',
  };

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-bold bg-[#25D366] hover:bg-[#20ba59] active:bg-[#1caa51] text-white shadow-lg shadow-[#25D366]/20 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#25D366]/50 ${
        sizeStyles[size]
      } ${fullWidth ? 'w-full' : ''} ${className}`}
      aria-label={label}
    >
      <MessageCircle className="w-5 h-5 fill-current shrink-0" />
      <span>{label}</span>
    </a>
  );
};
