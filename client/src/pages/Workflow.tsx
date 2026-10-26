import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Check, Clock, Flame, Lock, MessageSquare, TriangleAlert, UserPlus, X } from 'lucide-react';
import { PageHeader } from '../components/Layout';
import { PageLoader, StatusBadge } from '../components/ui';
import { api } from '../lib/api';
import { PRIORITY_LABEL, STATUS_ORDER } from '../lib/format';
import type { Status } from '../lib/types';

const DESCRIPTIONS: Record<Status, string> = {
  OPEN: 'New ticket, waiting to be picked up.',
  IN_PROGRESS: 'An agent owns the ticket and is working on it.',
  WAITING_FOR_CUSTOMER: 'The agent needs information from the customer.',
  RESOLVED: 'A fix or answer has been provided. Can be reopened.',
  CLOSED: 'Final. No more changes or replies.',
};

const RULES = [
  { icon: UserPlus, text: 'A ticket must have an assignee before it can move to In progress.' },
  { icon: UserPlus, text: 'Tickets can be reassigned in any status except Closed; they can only be unassigned while Open.' },
  { icon: MessageSquare, text: 'A customer reply on a ticket that is Waiting on customer or Resolved moves it back to In progress automatically.' },
  { icon: Lock, text: 'Closed is final: no status changes, reassignment or replies. Internal notes are visible to agents only.' },
  { icon: Clock, text: 'The SLA clock starts when the ticket is created and stops when it is resolved or closed. Reopening restarts it.' },
];

export function WorkflowPage() {
  const meta = useQuery({ queryKey: ['meta'], queryFn: api.meta, staleTime: Infinity });
  if (meta.isPending) return <PageLoader />;
  if (!meta.data) return null;
  const { transitions, priorities, slaAtRiskRatio } = meta.data;

  return (
    <div>
      <PageHeader title="Workflow & SLA rules" description="These rules are enforced by the API. Invalid changes are rejected." />
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <section className="card p-5">
          <h2 className="text-sm font-semibold text-slate-900">Typical lifecycle</h2>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {STATUS_ORDER.map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <StatusBadge status={s} className="px-3 py-1 text-sm" />
                {i < STATUS_ORDER.length - 1 && <ArrowRight className="size-4 text-slate-300" />}
              </div>
            ))}
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="card p-5">
            <h2 className="text-sm font-semibold text-slate-900">Allowed transitions</h2>
            <ul className="mt-4 divide-y divide-slate-100">
              {STATUS_ORDER.map((from) => (
                <li key={from} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={from} />
                    <span className="text-xs text-slate-500">{DESCRIPTIONS[from]}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-1 text-xs text-slate-500">
                    <ArrowRight className="size-3.5 text-slate-400" />
                    {transitions[from].length ? (
                      transitions[from].map((to) => <StatusBadge key={to} status={to} className="opacity-90" />)
                    ) : (
                      <span className="italic">No further transitions</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="card overflow-hidden">
            <div className="p-5 pb-3">
              <h2 className="text-sm font-semibold text-slate-900">Transition matrix</h2>
              <p className="mt-1 text-xs text-slate-500">Rows are the current status, columns the requested one.</p>
            </div>
            <div className="overflow-x-auto px-5 pb-5">
              <table className="w-full min-w-[480px] text-center text-xs">
                <thead>
                  <tr>
                    <th className="p-2 text-left font-medium text-slate-500">From \ To</th>
                    {STATUS_ORDER.map((s) => (
                      <th key={s} className="p-2 font-medium text-slate-600">
                        {s.replaceAll('_', ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {STATUS_ORDER.map((from) => (
                    <tr key={from} className="border-t border-slate-100">
                      <td className="p-2 text-left">
                        <StatusBadge status={from} />
                      </td>
                      {STATUS_ORDER.map((to) => (
                        <td key={to} className="p-2">
                          {from === to ? (
                            <span className="text-slate-300">–</span>
                          ) : transitions[from].includes(to) ? (
                            <Check className="mx-auto size-4 text-emerald-500" strokeWidth={2.5} />
                          ) : (
                            <X className="mx-auto size-3.5 text-slate-300" />
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="card p-5">
            <h2 className="text-sm font-semibold text-slate-900">Guard rules</h2>
            <ul className="mt-4 space-y-3">
              {RULES.map(({ icon: Icon, text }) => (
                <li key={text} className="flex gap-3 text-sm text-slate-700">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-indigo-50">
                    <Icon className="size-4 text-indigo-600" />
                  </span>
                  <span className="pt-1">{text}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="card p-5">
            <h2 className="text-sm font-semibold text-slate-900">SLA targets</h2>
            <p className="mt-1 text-xs text-slate-500">Time from creation to resolution, by priority.</p>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {[...priorities].reverse().map((p) => (
                <div key={p.value} className="rounded-xl border border-slate-200 p-4 text-center">
                  <div className="text-xs font-medium text-slate-500">{PRIORITY_LABEL[p.value]}</div>
                  <div className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{p.slaHours}h</div>
                </div>
              ))}
            </div>
            <ul className="mt-4 space-y-2 text-sm text-slate-700">
              <li className="flex items-center gap-2">
                <Clock className="size-4 text-emerald-600" /> <b className="font-medium">On track</b> — under {Math.round(slaAtRiskRatio * 100)}% of the target used
              </li>
              <li className="flex items-center gap-2">
                <TriangleAlert className="size-4 text-amber-600" /> <b className="font-medium">At risk</b> — {Math.round(slaAtRiskRatio * 100)}% or more of the target used
              </li>
              <li className="flex items-center gap-2">
                <Flame className="size-4 text-rose-600" /> <b className="font-medium">Breached</b> — still active and older than the target
              </li>
              <li className="flex items-center gap-2">
                <Check className="size-4 text-slate-500" /> <b className="font-medium">Met / Missed</b> — resolved within / after the target
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
