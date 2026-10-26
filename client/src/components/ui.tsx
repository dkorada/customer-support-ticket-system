import clsx from 'clsx';
import {
  CircleCheckBig,
  CircleDot,
  CirclePause,
  Clock,
  Flame,
  LoaderCircle,
  Archive,
  TriangleAlert,
  CircleCheck,
  type LucideIcon,
} from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { PRIORITY_LABEL, SLA_LABEL, STATUS_LABEL, formatDuration, initials } from '../lib/format';
import type { Priority, Sla, Status, User } from '../lib/types';

const AVATAR_COLORS = [
  'bg-indigo-100 text-indigo-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-800',
  'bg-rose-100 text-rose-700',
  'bg-sky-100 text-sky-700',
  'bg-violet-100 text-violet-700',
  'bg-teal-100 text-teal-700',
  'bg-orange-100 text-orange-700',
];

function colorFor(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function Avatar({ user, size = 'md', className }: { user: Pick<User, 'id' | 'name'>; size?: 'xs' | 'sm' | 'md' | 'lg'; className?: string }) {
  return (
    <span
      title={user.name}
      className={clsx(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold ring-2 ring-white',
        colorFor(user.id),
        {
          'size-5 text-[9px]': size === 'xs',
          'size-7 text-[11px]': size === 'sm',
          'size-9 text-xs': size === 'md',
          'size-11 text-sm': size === 'lg',
        },
        className,
      )}
    >
      {initials(user.name)}
    </span>
  );
}

const STATUS_STYLE: Record<Status, { className: string; icon: LucideIcon }> = {
  OPEN: { className: 'bg-sky-50 text-sky-700 ring-sky-600/20', icon: CircleDot },
  IN_PROGRESS: { className: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20', icon: LoaderCircle },
  WAITING_FOR_CUSTOMER: { className: 'bg-amber-50 text-amber-800 ring-amber-600/25', icon: CirclePause },
  RESOLVED: { className: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', icon: CircleCheckBig },
  CLOSED: { className: 'bg-slate-100 text-slate-600 ring-slate-500/20', icon: Archive },
};

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const { className: style, icon: Icon } = STATUS_STYLE[status];
  return (
    <span className={clsx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', style, className)}>
      <Icon className="size-3" strokeWidth={2.5} />
      {STATUS_LABEL[status]}
    </span>
  );
}

const PRIORITY_STYLE: Record<Priority, { dot: string; text: string }> = {
  HIGH: { dot: 'bg-rose-500', text: 'text-rose-700' },
  MEDIUM: { dot: 'bg-amber-500', text: 'text-amber-700' },
  LOW: { dot: 'bg-slate-400', text: 'text-slate-600' },
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  const s = PRIORITY_STYLE[priority];
  return (
    <span className={clsx('inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium', s.text)}>
      <span className={clsx('size-2 rounded-full', s.dot)} />
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

const SLA_STYLE = {
  ON_TRACK: { className: 'text-emerald-700', bar: 'bg-emerald-500', icon: Clock },
  AT_RISK: { className: 'text-amber-700', bar: 'bg-amber-500', icon: TriangleAlert },
  BREACHED: { className: 'text-rose-700', bar: 'bg-rose-500', icon: Flame },
  MET: { className: 'text-slate-500', bar: 'bg-emerald-400', icon: CircleCheck },
  MISSED: { className: 'text-slate-500', bar: 'bg-rose-300', icon: TriangleAlert },
} as const;

export function slaText(sla: Sla) {
  switch (sla.state) {
    case 'BREACHED':
      return `Overdue ${formatDuration(sla.remainingMs)}`;
    case 'AT_RISK':
    case 'ON_TRACK':
      return `${formatDuration(sla.remainingMs)} left`;
    case 'MET':
      return `Met · ${formatDuration(sla.elapsedMs)}`;
    case 'MISSED':
      return `Missed · ${formatDuration(sla.elapsedMs)}`;
  }
}

/** Compact SLA indicator for tables: icon, time left/overdue and a progress bar. */
export function SlaIndicator({ sla, showBar = true }: { sla: Sla; showBar?: boolean }) {
  const s = SLA_STYLE[sla.state];
  const Icon = s.icon;
  const pct = Math.min(100, Math.max(4, sla.ratio * 100));
  return (
    <div className="min-w-[7.5rem]" title={`${SLA_LABEL[sla.state]} · target ${sla.targetHours}h`}>
      <div className={clsx('flex items-center gap-1 text-xs font-medium', s.className)}>
        <Icon className={clsx('size-3.5', sla.state === 'BREACHED' && 'animate-pulse')} strokeWidth={2.25} />
        {slaText(sla)}
      </div>
      {showBar && (
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-slate-100">
          <div className={clsx('h-full rounded-full', s.bar)} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

export function SlaPill({ sla }: { sla: Sla }) {
  const tone = {
    ON_TRACK: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    AT_RISK: 'bg-amber-50 text-amber-800 ring-amber-600/25',
    BREACHED: 'bg-rose-50 text-rose-700 ring-rose-600/20',
    MET: 'bg-slate-50 text-slate-600 ring-slate-500/20',
    MISSED: 'bg-slate-50 text-slate-600 ring-slate-500/20',
  }[sla.state];
  const Icon = SLA_STYLE[sla.state].icon;
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', tone)}>
      <Icon className="size-3" strokeWidth={2.5} />
      {SLA_LABEL[sla.state]}
    </span>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  loading?: boolean;
  icon?: LucideIcon;
};

export function Button({ variant = 'primary', size = 'md', loading, icon: Icon, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition focus-visible:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-60',
        size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm',
        {
          'bg-brand-600 text-white shadow-sm hover:bg-brand-700 focus-visible:ring-brand-500/25': variant === 'primary',
          'border border-slate-300 bg-white text-slate-700 shadow-xs hover:bg-slate-50 focus-visible:ring-slate-400/20': variant === 'secondary',
          'text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-slate-400/20': variant === 'ghost',
          'bg-rose-600 text-white shadow-sm hover:bg-rose-700 focus-visible:ring-rose-500/25': variant === 'danger',
        },
        className,
      )}
    >
      {loading ? <LoaderCircle className="size-4 animate-spin" /> : Icon ? <Icon className={size === 'sm' ? 'size-3.5' : 'size-4'} /> : null}
      {children}
    </button>
  );
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...rest}
      className={clsx(
        'rounded-lg border border-slate-300 bg-white py-1.5 pl-2.5 pr-8 text-sm text-slate-700 shadow-xs outline-none transition hover:border-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15',
        className,
      )}
    >
      {children}
    </select>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={clsx('size-5 animate-spin text-brand-500', className)} />;
}

export function PageLoader() {
  return (
    <div className="flex h-64 items-center justify-center">
      <Spinner className="size-7" />
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-slate-100">
        <Icon className="size-6 text-slate-400" />
      </div>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {children && <div className="mt-1 max-w-sm text-sm text-slate-500">{children}</div>}
    </div>
  );
}
