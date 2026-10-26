import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Send } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/Layout';
import { useToast } from '../components/toast';
import { Button } from '../components/ui';
import { api } from '../lib/api';
import { CATEGORY_LABEL, PRIORITY_LABEL } from '../lib/format';
import type { Category, Priority } from '../lib/types';

const PRIORITIES: { value: Priority; hint: string; sla: string; dot: string }[] = [
  { value: 'LOW', hint: 'Questions, feedback, small issues', sla: '72 hours', dot: 'bg-slate-400' },
  { value: 'MEDIUM', hint: 'Something is not working as expected', sla: '24 hours', dot: 'bg-amber-500' },
  { value: 'HIGH', hint: 'Critical: work is blocked', sla: '4 hours', dot: 'bg-rose-500' },
];

export function NewTicketPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Category>('TECHNICAL');
  const [priority, setPriority] = useState<Priority>('MEDIUM');

  const create = useMutation({
    mutationFn: () => api.createTicket({ subject, description, category, priority }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      toast('success', `Ticket #${data.ticket.number} submitted. We'll be in touch soon.`);
      navigate(`/tickets/${data.ticket.id}`);
    },
    onError: (err: Error) => toast('error', err.message),
  });

  return (
    <div>
      <PageHeader title="Submit a request" description="Tell us what's going on and our team will pick it up." width="max-w-3xl" />
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        <form
          className="card space-y-6 p-5 sm:p-6"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div>
            <label className="label" htmlFor="subject">
              Subject
            </label>
            <input
              id="subject"
              className="input"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="A short summary of the issue"
              required
              minLength={3}
              maxLength={160}
            />
          </div>

          <div>
            <label className="label" htmlFor="category">
              Category
            </label>
            <select id="category" className="input" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
              {(Object.keys(CATEGORY_LABEL) as Category[]).map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </div>

          <fieldset>
            <legend className="label">Priority</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              {PRIORITIES.map((p) => (
                <label
                  key={p.value}
                  className={clsx(
                    'relative cursor-pointer rounded-xl border p-3.5 transition',
                    priority === p.value ? 'border-brand-500 bg-brand-50/50 ring-4 ring-brand-500/10' : 'border-slate-200 hover:border-slate-300',
                  )}
                >
                  <input type="radio" name="priority" value={p.value} checked={priority === p.value} onChange={() => setPriority(p.value)} className="sr-only" />
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <span className={clsx('size-2 rounded-full', p.dot)} /> {PRIORITY_LABEL[p.value]}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{p.hint}</div>
                  <div className="mt-2 text-[11px] font-medium text-slate-400">Target: {p.sla}</div>
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label className="label" htmlFor="description">
              Description
            </label>
            <textarea
              id="description"
              className="input min-h-36 resize-y"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What happened? What did you expect? Include any steps, links or error messages."
              required
              minLength={10}
            />
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-5">
            <Button type="button" variant="ghost" onClick={() => navigate(-1)}>
              Cancel
            </Button>
            <Button type="submit" icon={Send} loading={create.isPending}>
              Submit ticket
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
