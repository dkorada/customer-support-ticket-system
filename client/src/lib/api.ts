import type { Category, Meta, Priority, Stats, Status, Ticket, TicketDetail, User } from './types';

const SESSION_KEY = 'beacon.userId';

export const session = {
  get(): string | null {
    try {
      return localStorage.getItem(SESSION_KEY);
    } catch {
      return null;
    }
  },
  set(id: string | null) {
    try {
      if (id) localStorage.setItem(SESSION_KEY, id);
      else localStorage.removeItem(SESSION_KEY);
    } catch {
      /* storage unavailable: session lasts for this page only */
    }
  },
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const userId = session.get();
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(userId ? { 'X-User-Id': userId } : {}),
      ...init.headers,
    },
  });
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, body?.error?.message ?? `Request failed (${res.status})`, body?.error?.code);
  }
  return body as T;
}

export interface TicketQuery {
  status?: Status[];
  priority?: Priority[];
  assignee?: string;
  sla?: string[];
  q?: string;
  sort?: string;
}

function toSearch(query: TicketQuery) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value) ? value.length : value) params.set(key, Array.isArray(value) ? value.join(',') : value);
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

export const api = {
  meta: () => request<Meta>('/meta'),
  users: () => request<User[]>('/users'),
  me: () => request<User>('/me'),
  agents: () => request<User[]>('/agents'),
  stats: () => request<Stats>('/stats'),
  tickets: (query: TicketQuery = {}) => request<Ticket[]>(`/tickets${toSearch(query)}`),
  ticket: (id: string) => request<TicketDetail>(`/tickets/${id}`),
  createTicket: (input: { subject: string; description: string; priority: Priority; category: Category }) =>
    request<TicketDetail>('/tickets', { method: 'POST', body: JSON.stringify(input) }),
  setStatus: (id: string, status: Status) =>
    request<TicketDetail>(`/tickets/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  assign: (id: string, assigneeId: string | null) =>
    request<TicketDetail>(`/tickets/${id}/assignee`, { method: 'PATCH', body: JSON.stringify({ assigneeId }) }),
  reply: (id: string, input: { body: string; internal?: boolean; status?: Status }) =>
    request<TicketDetail>(`/tickets/${id}/replies`, { method: 'POST', body: JSON.stringify(input) }),
  resetDemo: () => request<{ ok: true }>('/demo/reset', { method: 'POST' }),
};
