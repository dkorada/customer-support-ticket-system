import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Inbox, MessageSquare, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { PageHeader } from '../components/Layout';
import { Avatar, EmptyState, PageLoader, PriorityBadge, StatusBadge } from '../components/ui';
import { api } from '../lib/api';
import { CATEGORY_LABEL, timeAgo } from '../lib/format';

export function MyTicketsPage() {
  const { user } = useAuth();
  const tickets = useQuery({ queryKey: ['tickets', 'mine'], queryFn: () => api.tickets({ sort: 'updated' }) });
  const open = tickets.data?.filter((t) => t.status !== 'RESOLVED' && t.status !== 'CLOSED') ?? [];
  const done = tickets.data?.filter((t) => t.status === 'RESOLVED' || t.status === 'CLOSED') ?? [];

  const list = (items: NonNullable<typeof tickets.data>) => (
    <ul className="card divide-y divide-slate-100 overflow-hidden">
      {items.map((t) => (
        <li key={t.id}>
          <Link to={`/tickets/${t.id}`} className="flex items-center gap-4 px-4 py-4 transition hover:bg-slate-50 sm:px-5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-slate-400">#{t.number}</span>
                <span className="truncate font-medium text-slate-900">{t.subject}</span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-500">
                <StatusBadge status={t.status} />
                <PriorityBadge priority={t.priority} />
                <span>{CATEGORY_LABEL[t.category]}</span>
                {t.replyCount > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <MessageSquare className="size-3" /> {t.replyCount}
                  </span>
                )}
                <span>Updated {timeAgo(t.updatedAt)}</span>
              </div>
            </div>
            {t.assignee && (
              <div className="hidden items-center gap-2 text-xs text-slate-500 sm:flex">
                <Avatar user={t.assignee} size="sm" />
                {t.assignee.name}
              </div>
            )}
            <ChevronRight className="size-4 shrink-0 text-slate-300" />
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <div>
      <PageHeader
        title={`Hi ${user?.name.split(' ')[0]}, how can we help?`}
        description="Track your support requests and reply to our team."
        width="max-w-4xl"
        actions={
          <Link
            to="/tickets/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700"
          >
            <Plus className="size-4" /> New ticket
          </Link>
        }
      />
      <div className="mx-auto max-w-4xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
        {tickets.isPending ? (
          <PageLoader />
        ) : !tickets.data?.length ? (
          <div className="card">
            <EmptyState icon={Inbox} title="No tickets yet">
              When you submit a request it will appear here.
            </EmptyState>
          </div>
        ) : (
          <>
            <section>
              <h2 className="mb-3 text-sm font-semibold text-slate-900">
                Open requests <span className="font-normal text-slate-400">({open.length})</span>
              </h2>
              {open.length ? list(open) : <p className="text-sm text-slate-500">Nothing open. All caught up!</p>}
            </section>
            {done.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-semibold text-slate-900">
                  Resolved &amp; closed <span className="font-normal text-slate-400">({done.length})</span>
                </h2>
                {list(done)}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
