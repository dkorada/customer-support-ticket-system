import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Clock, GitBranch, History, Headphones, ShieldCheck, UserRound } from 'lucide-react';
import { useAuth } from '../auth';
import { Logo } from '../components/Logo';
import { Avatar, PageLoader } from '../components/ui';
import { api } from '../lib/api';
import type { User } from '../lib/types';

const FEATURES = [
  { icon: GitBranch, title: 'Guarded status workflow', text: 'Only valid transitions are allowed, enforced by the API.' },
  { icon: Clock, title: 'SLA tracking', text: 'Tickets past their priority target are flagged automatically.' },
  { icon: History, title: 'Full audit timeline', text: 'Every status change, assignment and reply is recorded.' },
  { icon: ShieldCheck, title: 'Customer privacy', text: 'Customers only ever see their own tickets.' },
];

function PersonaButton({ user, onPick }: { user: User; onPick: () => void }) {
  return (
    <button
      onClick={onPick}
      className="group flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-xs transition hover:-translate-y-px hover:border-brand-500/50 hover:shadow-md hover:shadow-brand-500/5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/20"
    >
      <Avatar user={user} size="md" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-slate-900">{user.name}</div>
        <div className="truncate text-xs text-slate-500">{user.role === 'AGENT' ? user.title : user.company}</div>
      </div>
      <ArrowRight className="size-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500" />
    </button>
  );
}

export function LoginPage() {
  const { signIn } = useAuth();
  const users = useQuery({ queryKey: ['users'], queryFn: api.users });
  const agents = users.data?.filter((u) => u.role === 'AGENT') ?? [];
  const customers = users.data?.filter((u) => u.role === 'CUSTOMER') ?? [];

  return (
    <div className="grid min-h-full lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-ink-950 via-ink-900 to-indigo-950 p-12 text-white lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -right-32 -top-32 size-96 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -left-20 size-96 rounded-full bg-violet-600/20 blur-3xl" />
        <div className="relative">
          <Logo dark />
        </div>
        <div className="relative mt-auto">
          <h1 className="max-w-md text-4xl font-semibold leading-tight tracking-tight">
            Every customer conversation, <span className="text-indigo-300">on time</span> and on record.
          </h1>
          <p className="mt-4 max-w-md text-base text-indigo-100/70">
            Beacon gives your support team one queue, a clear workflow and SLA targets that never slip through the cracks.
          </p>
          <div className="mt-10 grid max-w-lg grid-cols-2 gap-5">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <div key={title}>
                <div className="flex size-9 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
                  <Icon className="size-[18px] text-indigo-200" />
                </div>
                <div className="mt-3 text-sm font-semibold">{title}</div>
                <div className="mt-1 text-sm text-indigo-100/60">{text}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="relative mt-12 text-xs text-indigo-200/40">Demo environment · data resets periodically</div>
      </div>

      <div className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-xl">
          <div className="lg:hidden">
            <Logo />
          </div>
          <h2 className="mt-8 text-2xl font-semibold tracking-tight text-slate-900 lg:mt-0">Choose a demo persona</h2>
          <p className="mt-1.5 text-sm text-slate-500">
            Sign in as a support agent to work the queue, or as a customer to submit and follow your own tickets.
          </p>

          {users.isPending ? (
            <PageLoader />
          ) : users.isError ? (
            <div className="mt-8 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              Could not reach the API. {users.error.message}
            </div>
          ) : (
            <div className="mt-8 space-y-8">
              <section>
                <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <Headphones className="size-3.5" /> Support agents
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {agents.map((u) => (
                    <PersonaButton key={u.id} user={u} onPick={() => signIn(u.id)} />
                  ))}
                </div>
              </section>
              <section>
                <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <UserRound className="size-3.5" /> Customers
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {customers.map((u) => (
                    <PersonaButton key={u.id} user={u} onPick={() => signIn(u.id)} />
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
