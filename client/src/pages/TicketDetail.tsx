import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarClock,
  CircleDot,
  Lock,
  Mail,
  Send,
  StickyNote,
  Tag,
  TriangleAlert,
  UserPlus,
  UserRound,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { useToast } from '../components/toast';
import {
  Avatar,
  Button,
  EmptyState,
  PageLoader,
  PriorityBadge,
  Select,
  SlaIndicator,
  SlaPill,
  StatusBadge,
  slaText,
} from '../components/ui';
import { api } from '../lib/api';
import { CATEGORY_LABEL, SLA_LABEL, STATUS_LABEL, formatDateTime, timeAgo } from '../lib/format';
import type { Status, Ticket, TicketDetail, TimelineEvent, User } from '../lib/types';

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function DetailRow({ icon: Icon, label, children }: { icon: typeof Tag; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-1.5 text-sm">
      <Icon className="mt-0.5 size-4 shrink-0 text-slate-400" />
      <div className="w-20 shrink-0 text-slate-500">{label}</div>
      <div className="min-w-0 flex-1 text-slate-800">{children}</div>
    </div>
  );
}

function MessageCard({ event, ticket, viewer }: { event: TimelineEvent; ticket: Ticket; viewer: User }) {
  const isNote = event.type === 'NOTE';
  const fromAgent = event.actor.role === 'AGENT';
  const mine = event.actor.id === viewer.id;
  return (
    <li className="relative flex gap-3">
      <Avatar user={event.actor} size="md" className="relative z-10" />
      <div
        className={clsx(
          'min-w-0 flex-1 rounded-xl border p-4',
          isNote
            ? 'border-amber-200 bg-amber-50/70'
            : fromAgent
              ? 'border-indigo-100 bg-indigo-50/40'
              : 'border-slate-200 bg-white',
        )}
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="font-semibold text-slate-900">{mine ? 'You' : event.actor.name}</span>
          {fromAgent ? (
            <span className="rounded bg-indigo-100 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-indigo-700">
              Support
            </span>
          ) : (
            event.actor.id === ticket.customer.id && <span className="text-xs text-slate-500">{event.actor.company}</span>
          )}
          {isNote && (
            <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-amber-800">
              <Lock className="size-2.5" /> Internal note
            </span>
          )}
          <span className="ml-auto text-xs text-slate-400" title={formatDateTime(event.createdAt)}>
            {timeAgo(event.createdAt)}
          </span>
        </div>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{event.body}</p>
      </div>
    </li>
  );
}

function SystemEvent({ event, viewer }: { event: TimelineEvent; viewer: User }) {
  const who = event.actor.id === viewer.id ? 'You' : event.actor.name;
  let content: ReactNode;
  let icon = CircleDot;
  if (event.type === 'STATUS_CHANGED') {
    content = (
      <>
        <span className="font-medium text-slate-700">{who}</span> changed status
        {event.fromValue && <StatusBadge status={event.fromValue as Status} className="scale-90" />}
        <ArrowRight className="size-3 text-slate-400" />
        <StatusBadge status={event.toValue as Status} className="scale-90" />
        {event.actor.role === 'CUSTOMER' && <span className="text-slate-400">(automatic, after customer reply)</span>}
      </>
    );
  } else if (event.type === 'ASSIGNED') {
    icon = UserPlus;
    content = event.toLabel ? (
      <>
        <span className="font-medium text-slate-700">{who}</span>
        {event.toValue === event.actor.id ? ' took ownership' : <> assigned to <span className="font-medium text-slate-700">{event.toLabel}</span></>}
        {event.fromLabel && <span className="text-slate-400">(was {event.fromLabel})</span>}
      </>
    ) : (
      <>
        <span className="font-medium text-slate-700">{who}</span> unassigned {event.fromLabel}
      </>
    );
  } else {
    content = (
      <>
        <span className="font-medium text-slate-700">{who}</span> opened this ticket
      </>
    );
  }
  const Icon = icon;
  return (
    <li className="relative flex items-center gap-3 pl-2">
      <div className="relative z-10 flex size-5 items-center justify-center rounded-full bg-white ring-1 ring-slate-200">
        <Icon className="size-3 text-slate-400" />
      </div>
      <div className="flex flex-1 flex-wrap items-center gap-1.5 text-xs text-slate-500">
        {content}
        <span className="ml-auto text-slate-400" title={formatDateTime(event.createdAt)}>
          {timeAgo(event.createdAt)}
        </span>
      </div>
    </li>
  );
}

function Composer({ ticket, isAgent, onSent }: { ticket: Ticket; isAgent: boolean; onSent: (d: TicketDetail) => void }) {
  const toast = useToast();
  const [mode, setMode] = useState<'reply' | 'note'>('reply');
  const [body, setBody] = useState('');
  const [status, setStatus] = useState<Status | ''>('');
  const send = useMutation({
    mutationFn: () =>
      api.reply(ticket.id, {
        body,
        internal: mode === 'note' || undefined,
        status: isAgent && status ? status : undefined,
      }),
    onSuccess: (data) => {
      setBody('');
      setStatus('');
      onSent(data);
      toast('success', mode === 'note' ? 'Internal note added.' : 'Reply sent.');
    },
    onError: (err: Error) => toast('error', err.message),
  });

  if (ticket.status === 'CLOSED') {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
        <Lock className="size-4" /> This ticket is closed. {isAgent ? 'No further replies can be added.' : 'Please open a new ticket if you need more help.'}
      </div>
    );
  }

  const willReopen = !isAgent && (ticket.status === 'WAITING_FOR_CUSTOMER' || ticket.status === 'RESOLVED');
  return (
    <form
      className={clsx('overflow-hidden rounded-xl border bg-white shadow-xs transition focus-within:ring-4', mode === 'note' ? 'border-amber-300 focus-within:ring-amber-500/15' : 'border-slate-300 focus-within:border-brand-500 focus-within:ring-brand-500/15')}
      onSubmit={(e) => {
        e.preventDefault();
        if (body.trim()) send.mutate();
      }}
    >
      {isAgent && (
        <div className="flex gap-1 border-b border-slate-200 bg-slate-50 px-2 pt-2">
          {(['reply', 'note'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={clsx(
                'inline-flex items-center gap-1.5 rounded-t-lg px-3 py-1.5 text-sm font-medium transition',
                mode === m ? 'border border-b-0 border-slate-200 bg-white text-slate-900' : 'border border-transparent text-slate-500 hover:text-slate-800',
              )}
            >
              {m === 'reply' ? <Send className="size-3.5" /> : <StickyNote className="size-3.5" />}
              {m === 'reply' ? 'Reply to customer' : 'Internal note'}
            </button>
          ))}
        </div>
      )}
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && body.trim()) send.mutate();
        }}
        rows={4}
        placeholder={mode === 'note' ? 'Only agents can see internal notes…' : isAgent ? `Reply to ${ticket.customer.name}…` : 'Write a reply…'}
        className={clsx('block w-full resize-y border-0 px-4 py-3 text-sm outline-none placeholder:text-slate-400', mode === 'note' && 'bg-amber-50/40')}
      />
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-3 py-2">
        {isAgent && ticket.allowedTransitions.length > 0 && (
          <label className="flex items-center gap-2 text-xs text-slate-500">
            and set status
            <Select value={status} onChange={(e) => setStatus(e.target.value as Status | '')} className="py-1 text-xs">
              <option value="">Keep {STATUS_LABEL[ticket.status].toLowerCase()}</option>
              {ticket.allowedTransitions.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </label>
        )}
        {willReopen && <span className="text-xs text-slate-500">Replying sends this ticket back to the support team.</span>}
        <span className="ml-auto hidden text-[11px] text-slate-400 sm:inline">Ctrl + Enter to send</span>
        <Button type="submit" size="sm" icon={mode === 'note' ? StickyNote : Send} loading={send.isPending} disabled={!body.trim()} variant="primary">
          {mode === 'note' ? 'Add note' : 'Send reply'}
        </Button>
      </div>
    </form>
  );
}

function StatusControls({ ticket, onChange }: { ticket: Ticket; onChange: (d: TicketDetail) => void }) {
  const toast = useToast();
  const mutation = useMutation({
    mutationFn: (status: Status) => api.setStatus(ticket.id, status),
    onSuccess: (data, status) => {
      onChange(data);
      toast('success', `Status changed to ${STATUS_LABEL[status]}.`);
    },
    onError: (err: Error) => toast('error', err.message),
  });
  const needsAssignee = !ticket.assignee;
  return (
    <Section title="Status">
      <StatusBadge status={ticket.status} className="text-sm" />
      {ticket.allowedTransitions.length ? (
        <>
          <div className="mt-4 text-xs font-medium text-slate-500">Move to</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {ticket.allowedTransitions.map((s) => {
              const blocked = s === 'IN_PROGRESS' && needsAssignee;
              return (
                <Button
                  key={s}
                  size="sm"
                  variant={s === 'RESOLVED' ? 'primary' : 'secondary'}
                  loading={mutation.isPending && mutation.variables === s}
                  disabled={mutation.isPending || blocked}
                  title={blocked ? 'Assign the ticket first' : undefined}
                  onClick={() => mutation.mutate(s)}
                >
                  {STATUS_LABEL[s]}
                </Button>
              );
            })}
          </div>
          {needsAssignee && ticket.allowedTransitions.includes('IN_PROGRESS') && (
            <p className="mt-2 text-xs text-slate-500">Assign an agent before starting work.</p>
          )}
        </>
      ) : (
        <p className="mt-3 text-xs text-slate-500">Closed is a final status. No further changes are possible.</p>
      )}
    </Section>
  );
}

function AssigneeControls({ ticket, viewer, onChange }: { ticket: Ticket; viewer: User; onChange: (d: TicketDetail) => void }) {
  const toast = useToast();
  const agents = useQuery({ queryKey: ['agents'], queryFn: api.agents, staleTime: Infinity });
  const mutation = useMutation({
    mutationFn: (assigneeId: string | null) => api.assign(ticket.id, assigneeId),
    onSuccess: (data) => {
      onChange(data);
      toast('success', data.ticket.assignee ? `Assigned to ${data.ticket.assignee.name}.` : 'Ticket unassigned.');
    },
    onError: (err: Error) => toast('error', err.message),
  });
  const closed = ticket.status === 'CLOSED';
  const canUnassign = ticket.status === 'OPEN';
  return (
    <Section
      title="Assignee"
      action={
        !closed && ticket.assignee?.id !== viewer.id ? (
          <button onClick={() => mutation.mutate(viewer.id)} className="text-xs font-medium text-brand-600 hover:text-brand-700" disabled={mutation.isPending}>
            Assign to me
          </button>
        ) : null
      }
    >
      <div className="flex items-center gap-3">
        {ticket.assignee ? (
          <>
            <Avatar user={ticket.assignee} size="md" />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-slate-900">{ticket.assignee.name}</div>
              <div className="truncate text-xs text-slate-500">{ticket.assignee.title}</div>
            </div>
          </>
        ) : (
          <>
            <span className="flex size-9 items-center justify-center rounded-full border border-dashed border-slate-300">
              <UserRound className="size-4 text-slate-400" />
            </span>
            <span className="text-sm text-slate-500">Nobody yet</span>
          </>
        )}
      </div>
      {!closed && (
        <Select
          className="mt-3 w-full"
          value={ticket.assignee?.id ?? ''}
          disabled={mutation.isPending}
          onChange={(e) => mutation.mutate(e.target.value || null)}
        >
          <option value="" disabled={!canUnassign}>
            {canUnassign ? 'Unassigned' : 'Unassigned (only while open)'}
          </option>
          {agents.data?.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
              {a.id === viewer.id ? ' (you)' : ''}
            </option>
          ))}
        </Select>
      )}
    </Section>
  );
}

function SlaCard({ ticket }: { ticket: Ticket }) {
  const { sla } = ticket;
  const done = sla.state === 'MET' || sla.state === 'MISSED';
  return (
    <Section title="SLA" action={<SlaPill sla={sla} />}>
      <SlaIndicator sla={sla} />
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-slate-50 p-2">
          <dt className="text-slate-500">Target</dt>
          <dd className="mt-0.5 font-medium text-slate-800">{sla.targetHours} hours</dd>
        </div>
        <div className="rounded-lg bg-slate-50 p-2">
          <dt className="text-slate-500">{done ? 'Resolved' : 'Due'}</dt>
          <dd className="mt-0.5 font-medium text-slate-800">{formatDateTime(done && ticket.resolvedAt ? ticket.resolvedAt : sla.dueAt)}</dd>
        </div>
      </dl>
      {sla.state === 'BREACHED' && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700">
          <TriangleAlert className="mt-px size-3.5 shrink-0" />
          This {ticket.priority.toLowerCase()} priority ticket is past its {sla.targetHours}h target. {slaText(sla)}.
        </div>
      )}
    </Section>
  );
}

export function TicketDetailPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const detail = useQuery({ queryKey: ['ticket', id], queryFn: () => api.ticket(id), refetchInterval: 30_000 });
  const isAgent = user?.role === 'AGENT';

  const onChange = (data: TicketDetail) => {
    queryClient.setQueryData(['ticket', id], data);
    queryClient.invalidateQueries({ queryKey: ['tickets'] });
    queryClient.invalidateQueries({ queryKey: ['stats'] });
  };

  if (detail.isPending) return <PageLoader />;
  if (detail.isError || !user) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <EmptyState icon={TriangleAlert} title="Ticket not found">
          It may have been removed, or you may not have access to it.{' '}
          <Link to="/" className="font-medium text-brand-600">
            Back to tickets
          </Link>
        </EmptyState>
      </div>
    );
  }

  const { ticket, timeline } = detail.data;
  const created = timeline.find((e) => e.type === 'CREATED');
  const messages = timeline.filter((e) => e.type !== 'CREATED');
  const replyCount = timeline.filter((e) => e.type === 'REPLY').length;

  return (
    <div>
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <Link to={isAgent ? '/queue' : '/tickets'} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
            <ArrowLeft className="size-4" /> {isAgent ? 'Back to queue' : 'My tickets'}
          </Link>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 font-mono text-sm text-slate-400">#{ticket.number}</div>
              <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{ticket.subject}</h1>
              <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
                <StatusBadge status={ticket.status} />
                <PriorityBadge priority={ticket.priority} />
                <span className="text-slate-300">|</span>
                <SlaPill sla={ticket.sla} />
                <span className="text-xs text-slate-500">Opened {timeAgo(ticket.createdAt)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-8">
        <div className="min-w-0 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Conversation &amp; history</h2>
            <span className="text-xs text-slate-500">
              {replyCount} {replyCount === 1 ? 'reply' : 'replies'} · {timeline.length} events
            </span>
          </div>

          <ol className="relative space-y-4 before:absolute before:bottom-4 before:left-[17px] before:top-4 before:w-px before:bg-slate-200">
            {created && (
              <MessageCard event={{ ...created, type: 'REPLY', body: ticket.description }} ticket={ticket} viewer={user} />
            )}
            {created && <SystemEvent event={created} viewer={user} />}
            {messages.map((e) =>
              e.type === 'REPLY' || e.type === 'NOTE' ? (
                <MessageCard key={e.id} event={e} ticket={ticket} viewer={user} />
              ) : (
                <SystemEvent key={e.id} event={e} viewer={user} />
              ),
            )}
          </ol>

          <Composer ticket={ticket} isAgent={isAgent} onSent={onChange} />
        </div>

        <aside className="space-y-4">
          {isAgent && <StatusControls ticket={ticket} onChange={onChange} />}
          {isAgent && <AssigneeControls ticket={ticket} viewer={user} onChange={onChange} />}
          <SlaCard ticket={ticket} />
          <Section title="Details">
            <DetailRow icon={UserRound} label="Customer">
              {ticket.customer.name}
            </DetailRow>
            <DetailRow icon={Building2} label="Company">
              {ticket.customer.company}
            </DetailRow>
            <DetailRow icon={Mail} label="Email">
              <span className="break-all">{ticket.customer.email}</span>
            </DetailRow>
            <DetailRow icon={Tag} label="Category">
              {CATEGORY_LABEL[ticket.category]}
            </DetailRow>
            <DetailRow icon={CalendarClock} label="Created">
              {formatDateTime(ticket.createdAt)}
            </DetailRow>
            {!isAgent && ticket.assignee && (
              <DetailRow icon={UserPlus} label="Handled by">
                {ticket.assignee.name}
              </DetailRow>
            )}
          </Section>
          {!isAgent && (
            <p className="px-1 text-xs text-slate-500">
              {SLA_LABEL[ticket.sla.state]} · we aim to resolve {ticket.priority.toLowerCase()} priority tickets within {ticket.sla.targetHours} hours.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
