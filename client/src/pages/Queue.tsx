import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { CircleCheck, Flame, Inbox, MessageSquare, Search, TriangleAlert, UserPlus, X, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/Layout';
import { Avatar, EmptyState, PageLoader, PriorityBadge, Select, SlaIndicator, StatusBadge } from '../components/ui';
import { api, type TicketQuery } from '../lib/api';
import { CATEGORY_LABEL, PRIORITY_LABEL, PRIORITY_ORDER, STATUS_LABEL, STATUS_ORDER, timeAgo } from '../lib/format';
import type { Priority, Status } from '../lib/types';

const ACTIVE: Status[] = ['OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER'];

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  to,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  tone: 'indigo' | 'rose' | 'amber' | 'slate' | 'emerald';
  to?: string;
}) {
  const tones = {
    indigo: 'bg-indigo-50 text-indigo-600',
    rose: 'bg-rose-50 text-rose-600',
    amber: 'bg-amber-50 text-amber-600',
    slate: 'bg-slate-100 text-slate-600',
    emerald: 'bg-emerald-50 text-emerald-600',
  };
  const body = (
    <div className="card flex items-center gap-4 p-4 transition hover:border-slate-300">
      <div className={clsx('flex size-10 shrink-0 items-center justify-center rounded-lg', tones[tone])}>
        <Icon className="size-5" />
      </div>
      <div className="min-w-0">
        <div className="text-xs font-medium text-slate-500">{label}</div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-semibold tracking-tight text-slate-900">{value}</span>
          {hint && <span className="truncate text-xs text-slate-400">{hint}</span>}
        </div>
      </div>
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

export function QueuePage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const statusParam = params.get('status') ?? 'ACTIVE';
  const priority = params.get('priority') ?? '';
  const assignee = params.get('assignee') ?? '';
  const sla = params.get('sla') ?? '';
  const sort = params.get('sort') ?? 'sla';
  const q = params.get('q') ?? '';
  const [search, setSearch] = useState(q);

  useEffect(() => setSearch(q), [q]);

  const update = (key: string, value: string, fallback = '') => {
    const next = new URLSearchParams(params);
    if (value && value !== fallback) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  // Debounced search box.
  useEffect(() => {
    const t = setTimeout(() => {
      if (search !== q) update('q', search.trim());
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const query: TicketQuery = {
    status: statusParam === 'ALL' ? undefined : statusParam === 'ACTIVE' ? (sla === 'BREACHED' ? undefined : ACTIVE) : [statusParam as Status],
    priority: priority ? [priority as Priority] : undefined,
    assignee: assignee || undefined,
    sla: sla ? [sla] : undefined,
    q: q || undefined,
    sort,
  };

  const tickets = useQuery({ queryKey: ['tickets', query], queryFn: () => api.tickets(query), refetchInterval: 30_000 });
  const stats = useQuery({ queryKey: ['stats'], queryFn: api.stats, refetchInterval: 60_000 });
  const agents = useQuery({ queryKey: ['agents'], queryFn: api.agents, staleTime: Infinity });

  const hasFilters = statusParam !== 'ACTIVE' || priority || assignee || sla || q;
  const title =
    assignee === 'me' ? 'Assigned to me' : assignee === 'unassigned' ? 'Unassigned tickets' : sla === 'BREACHED' ? 'SLA breached' : 'All tickets';

  const s = stats.data;
  return (
    <div>
      <PageHeader title={title} description="Work the queue: tickets closest to breaching their SLA are listed first.">
        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Active tickets" value={s?.active ?? '–'} hint={s ? `${s.byStatus.OPEN} open` : undefined} icon={Inbox} tone="indigo" to="/queue" />
          <StatCard label="SLA breached" value={s?.breached ?? '–'} hint={s ? `${s.atRisk} at risk` : undefined} icon={Flame} tone="rose" to="/queue?sla=BREACHED" />
          <StatCard label="Unassigned" value={s?.unassigned ?? '–'} hint="need an owner" icon={UserPlus} tone="amber" to="/queue?assignee=unassigned" />
          <StatCard
            label="SLA met (resolved)"
            value={s?.slaMetRate != null ? `${Math.round(s.slaMetRate * 100)}%` : '–'}
            hint={s ? `${s.byStatus.RESOLVED + s.byStatus.CLOSED} done` : undefined}
            icon={CircleCheck}
            tone="emerald"
          />
        </div>
      </PageHeader>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50/60 p-3">
            <div className="relative min-w-64 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search subject, customer or #number"
                className="input py-1.5 pl-9"
              />
            </div>
            <Select value={statusParam} onChange={(e) => update('status', e.target.value, 'ACTIVE')} aria-label="Status">
              <option value="ACTIVE">Active statuses</option>
              <option value="ALL">All statuses</option>
              {STATUS_ORDER.map((st) => (
                <option key={st} value={st}>
                  {STATUS_LABEL[st]}
                </option>
              ))}
            </Select>
            <Select value={priority} onChange={(e) => update('priority', e.target.value)} aria-label="Priority">
              <option value="">Any priority</option>
              {PRIORITY_ORDER.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]} priority
                </option>
              ))}
            </Select>
            <Select value={assignee} onChange={(e) => update('assignee', e.target.value)} aria-label="Assignee">
              <option value="">Any assignee</option>
              <option value="me">Assigned to me</option>
              <option value="unassigned">Unassigned</option>
              {agents.data?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
            <Select value={sla} onChange={(e) => update('sla', e.target.value)} aria-label="SLA">
              <option value="">Any SLA state</option>
              <option value="BREACHED">Breached</option>
              <option value="AT_RISK">At risk</option>
              <option value="ON_TRACK">On track</option>
              <option value="MET">Met</option>
              <option value="MISSED">Missed</option>
            </Select>
            <Select value={sort} onChange={(e) => update('sort', e.target.value, 'sla')} aria-label="Sort">
              <option value="sla">Sort: SLA due</option>
              <option value="priority">Sort: Priority</option>
              <option value="newest">Sort: Newest</option>
              <option value="oldest">Sort: Oldest</option>
              <option value="updated">Sort: Recently updated</option>
            </Select>
            {hasFilters && (
              <button
                onClick={() => setParams({}, { replace: true })}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              >
                <X className="size-4" /> Clear
              </button>
            )}
          </div>

          {tickets.isPending ? (
            <PageLoader />
          ) : tickets.isError ? (
            <EmptyState icon={TriangleAlert} title="Could not load tickets">
              {tickets.error.message}
            </EmptyState>
          ) : tickets.data.length === 0 ? (
            <EmptyState icon={Inbox} title="No tickets match these filters">
              Try clearing a filter or widening the status.
            </EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] table-fixed text-left text-sm">
                <colgroup>
                  <col />
                  <col className="w-[190px]" />
                  <col className="w-[96px]" />
                  <col className="w-[170px]" />
                  <col className="w-[180px]" />
                  <col className="w-[104px]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-medium uppercase tracking-wide text-slate-500">
                    <th className="py-2.5 pl-4 pr-3 font-medium">Ticket</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="px-3 py-2.5 font-medium">Priority</th>
                    <th className="px-3 py-2.5 font-medium">SLA</th>
                    <th className="px-3 py-2.5 font-medium">Assignee</th>
                    <th className="py-2.5 pl-3 pr-4 text-right font-medium">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tickets.data.map((t) => (
                    <tr
                      key={t.id}
                      onClick={() => navigate(`/tickets/${t.id}`)}
                      className={clsx(
                        'cursor-pointer transition hover:bg-slate-50',
                        t.sla.state === 'BREACHED' && 'bg-rose-50/40 hover:bg-rose-50/70',
                      )}
                    >
                      <td className="py-3 pl-4 pr-3">
                        <div className="flex items-center gap-2">
                          <span className="shrink-0 font-mono text-xs text-slate-400">#{t.number}</span>
                          <Link
                            to={`/tickets/${t.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="truncate font-medium text-slate-900 hover:text-brand-600"
                          >
                            {t.subject}
                          </Link>
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-slate-500">
                          <span className="truncate">
                            {t.customer.name} · {t.customer.company}
                          </span>
                          <span className="text-slate-300">•</span>
                          <span>{CATEGORY_LABEL[t.category]}</span>
                          {t.replyCount > 0 && (
                            <>
                              <span className="text-slate-300">•</span>
                              <span className="inline-flex items-center gap-0.5">
                                <MessageSquare className="size-3" /> {t.replyCount}
                              </span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge status={t.status} />
                      </td>
                      <td className="px-3 py-3">
                        <PriorityBadge priority={t.priority} />
                      </td>
                      <td className="px-3 py-3">
                        <SlaIndicator sla={t.sla} />
                      </td>
                      <td className="px-3 py-3">
                        {t.assignee ? (
                          <div className="flex items-center gap-2">
                            <Avatar user={t.assignee} size="sm" />
                            <span className="truncate text-sm text-slate-700">{t.assignee.name}</span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-sm text-slate-400">
                            <span className="size-7 rounded-full border border-dashed border-slate-300" />
                            Unassigned
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap py-3 pl-3 pr-4 text-right text-xs text-slate-500">{timeAgo(t.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="border-t border-slate-200 px-4 py-2.5 text-xs text-slate-500">
                {tickets.data.length} ticket{tickets.data.length === 1 ? '' : 's'}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
