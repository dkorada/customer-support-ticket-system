import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  Flame,
  GitBranch,
  Inbox,
  LogOut,
  Menu,
  Plus,
  RotateCcw,
  Ticket,
  UserRound,
  UserPlus,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';
import { api } from '../lib/api';
import { Logo } from './Logo';
import { useToast } from './toast';
import { Avatar } from './ui';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  count?: number;
  tone?: 'danger';
}

function NavItemLink({ item, onClick }: { item: NavItem; onClick?: () => void }) {
  const location = useLocation();
  const [path, search = ''] = item.to.split('?');
  const active = location.pathname === path && new URLSearchParams(location.search).toString() === new URLSearchParams(search).toString();
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      onClick={onClick}
      className={clsx(
        'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
        active ? 'bg-white/10 text-white' : 'text-indigo-100/70 hover:bg-white/5 hover:text-white',
      )}
    >
      <Icon className={clsx('size-[18px]', active ? 'text-indigo-300' : 'text-indigo-200/50 group-hover:text-indigo-200')} />
      <span className="flex-1">{item.label}</span>
      {item.count !== undefined && item.count > 0 && (
        <span
          className={clsx(
            'min-w-6 rounded-full px-1.5 py-0.5 text-center text-[11px] font-semibold',
            item.tone === 'danger' ? 'bg-rose-500/90 text-white' : 'bg-white/10 text-indigo-100',
          )}
        >
          {item.count}
        </span>
      )}
    </NavLink>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user, signOut } = useAuth();
  const isAgent = user?.role === 'AGENT';
  const queryClient = useQueryClient();
  const toast = useToast();
  const stats = useQuery({ queryKey: ['stats'], queryFn: api.stats, enabled: isAgent, refetchInterval: 60_000 });
  const reset = useMutation({
    mutationFn: api.resetDemo,
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast('success', 'Demo data has been reset.');
    },
    onError: (err: Error) => toast('error', err.message),
  });

  const s = stats.data;
  const items: NavItem[] = isAgent
    ? [
        { to: '/queue', label: 'All tickets', icon: Inbox, count: s?.active },
        { to: '/queue?assignee=me', label: 'Assigned to me', icon: UserRound, count: s?.mine },
        { to: '/queue?assignee=unassigned', label: 'Unassigned', icon: UserPlus, count: s?.unassigned },
        { to: '/queue?sla=BREACHED', label: 'SLA breached', icon: Flame, count: s?.breached, tone: 'danger' },
      ]
    : [
        { to: '/tickets', label: 'My tickets', icon: Ticket },
        { to: '/tickets/new', label: 'New ticket', icon: Plus },
      ];

  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-ink-950 to-ink-900 px-3 py-5">
      <div className="px-2">
        <Link to="/" onClick={onNavigate}>
          <Logo dark />
        </Link>
      </div>

      <div className="mt-8 px-3 text-[11px] font-semibold uppercase tracking-wider text-indigo-200/40">
        {isAgent ? 'Queue' : 'Support'}
      </div>
      <nav className="mt-2 space-y-0.5">
        {items.map((item) => (
          <NavItemLink key={item.to} item={item} onClick={onNavigate} />
        ))}
      </nav>

      <div className="mt-6 px-3 text-[11px] font-semibold uppercase tracking-wider text-indigo-200/40">Reference</div>
      <nav className="mt-2 space-y-0.5">
        <NavItemLink item={{ to: '/workflow', label: 'Workflow & SLA rules', icon: GitBranch }} onClick={onNavigate} />
      </nav>

      <div className="mt-auto space-y-3">
        {isAgent && (
          <button
            onClick={() => reset.mutate()}
            disabled={reset.isPending}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-indigo-200/60 transition hover:bg-white/5 hover:text-white disabled:opacity-50"
          >
            <RotateCcw className={clsx('size-3.5', reset.isPending && 'animate-spin')} />
            Reset demo data
          </button>
        )}
        {user && (
          <div className="flex items-center gap-3 rounded-xl bg-white/5 p-2.5 ring-1 ring-white/10">
            <Avatar user={user} size="md" className="ring-0" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-white">{user.name}</div>
              <div className="truncate text-xs text-indigo-200/60">{isAgent ? user.title : user.company}</div>
            </div>
            <button
              onClick={signOut}
              title="Switch persona"
              className="rounded-md p-1.5 text-indigo-200/60 transition hover:bg-white/10 hover:text-white"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function Layout() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex h-full">
      <aside className="hidden w-64 shrink-0 lg:block">
        <div className="fixed inset-y-0 w-64">
          <Sidebar />
        </div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 shadow-xl">
            <Sidebar onNavigate={() => setOpen(false)} />
            <button onClick={() => setOpen(false)} className="absolute right-3 top-5 rounded-md p-1 text-indigo-200 hover:bg-white/10" aria-label="Close menu">
              <X className="size-5" />
            </button>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
          <button onClick={() => setOpen(true)} className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100" aria-label="Open menu">
            <Menu className="size-5" />
          </button>
          <Logo />
        </header>
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  children,
  width = 'max-w-7xl',
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  width?: string;
}) {
  return (
    <div className="border-b border-slate-200 bg-white">
      <div className={clsx('mx-auto px-4 py-6 sm:px-6 lg:px-8', width)}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
            {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}
