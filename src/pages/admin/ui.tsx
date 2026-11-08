import React from 'react';
import { GameStatus } from '../../types';
import { Badge } from '../../components/Badge';

export const inputCls =
  'w-full bg-background-darker border border-background-border rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 min-h-[44px] disabled:opacity-60';

export const labelCls = 'block text-xs font-bold uppercase text-slate-400 mb-1';

export const primaryBtn =
  'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs sm:text-sm min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed transition-all';

export const ghostBtn =
  'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-background-border bg-background-darker hover:bg-background-hover text-slate-200 text-xs sm:text-sm font-semibold min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed transition-all';

export function statusVariant(s: GameStatus): 'success' | 'purple' | 'danger' | 'warning' | 'cyan' | 'neutral' {
  switch (s) {
    case 'active':
      return 'success';
    case 'completed':
      return 'purple';
    case 'cancelled':
      return 'danger';
    case 'paused':
    case 'waiting_for_answers':
      return 'warning';
    case 'registration_open':
      return 'cyan';
    default:
      return 'neutral';
  }
}

export const statusLabel = (s: GameStatus) =>
  ({
    draft: 'DRAFT',
    registration_open: 'REGISTRATION OPEN',
    ready: 'READY',
    active: 'IN PROGRESS',
    paused: 'PAUSED',
    waiting_for_answers: 'PAUSED',
    completed: 'COMPLETED',
    cancelled: 'CANCELLED',
  }[s] ?? String(s).toUpperCase());

export const StatusBadge: React.FC<{ status: GameStatus; size?: 'sm' | 'md' }> = ({ status, size = 'sm' }) => (
  <Badge variant={statusVariant(status)} size={size}>
    {statusLabel(status)}
  </Badge>
);

export const Modal: React.FC<{ title: string; subtitle?: string; onClose?: () => void; children: React.ReactNode; wide?: boolean; testId?: string }> = ({
  title,
  subtitle,
  children,
  wide,
  testId,
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={title} data-testid={testId}>
    <div className={`bg-background-card border border-background-border w-full ${wide ? 'max-w-lg' : 'max-w-md'} max-h-[92vh] overflow-y-auto rounded-2xl p-5 sm:p-6 shadow-2xl`}>
      <h3 className="text-lg font-bold text-white mb-1">{title}</h3>
      {subtitle && <p className="text-xs text-slate-400 mb-4">{subtitle}</p>}
      {children}
    </div>
  </div>
);

export const ErrorBox: React.FC<{ message?: string }> = ({ message }) =>
  message ? (
    <div role="alert" className="mb-4 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs">
      {message}
    </div>
  ) : null;

export const ConfirmDialog: React.FC<{
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  tone?: 'danger' | 'primary' | 'warning';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ title, body, confirmLabel, tone = 'primary', busy, onConfirm, onCancel }) => {
  const toneCls =
    tone === 'danger'
      ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/30'
      : tone === 'warning'
      ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/30'
      : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/30';
  return (
    <Modal title={title} testId="confirm-dialog">
      <div className="text-sm text-slate-300 space-y-2 mb-5">{body}</div>
      <div className="flex items-center justify-end gap-3">
        <button type="button" onClick={onCancel} disabled={busy} className={ghostBtn} data-testid="confirm-cancel">
          Keep as is
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={`px-5 py-2.5 rounded-xl text-white font-bold text-xs sm:text-sm shadow-md min-h-[44px] disabled:opacity-50 ${toneCls}`}
          data-testid="confirm-ok"
        >
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
};

export const StatCard: React.FC<{
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: string;
  testId?: string;
}> = ({ label, value, sub, icon, tone = 'text-white', testId }) => (
  <div className="p-5 rounded-2xl bg-background-card border border-background-border" data-testid={testId}>
    <div className="flex items-center justify-between text-slate-400 mb-2">
      <span className="text-xs font-semibold uppercase">{label}</span>
      {icon}
    </div>
    <div className={`text-2xl sm:text-3xl font-extrabold ${tone}`}>{value}</div>
    {sub && <div className="mt-2 text-[11px] text-slate-400">{sub}</div>}
  </div>
);

export const EmptyState: React.FC<{ icon?: React.ReactNode; title: string; hint?: string; action?: React.ReactNode }> = ({ icon, title, hint, action }) => (
  <div className="text-center py-12 px-4 rounded-2xl bg-background-card border border-background-border">
    {icon}
    <p className="text-slate-300 font-semibold text-base mt-3">{title}</p>
    {hint && <p className="text-slate-500 text-xs mt-1 max-w-sm mx-auto">{hint}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);
