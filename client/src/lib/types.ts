export type Role = 'CUSTOMER' | 'AGENT';
export type Status = 'OPEN' | 'IN_PROGRESS' | 'WAITING_FOR_CUSTOMER' | 'RESOLVED' | 'CLOSED';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH';
export type Category = 'BILLING' | 'TECHNICAL' | 'ACCOUNT' | 'FEATURE_REQUEST' | 'BUG' | 'OTHER';
export type SlaState = 'ON_TRACK' | 'AT_RISK' | 'BREACHED' | 'MET' | 'MISSED';
export type EventType = 'CREATED' | 'STATUS_CHANGED' | 'ASSIGNED' | 'REPLY' | 'NOTE';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  title: string | null;
  company: string | null;
}

export interface Sla {
  state: SlaState;
  breached: boolean;
  targetHours: number;
  dueAt: string;
  elapsedMs: number;
  remainingMs: number;
  ratio: number;
}

export interface Ticket {
  id: string;
  number: number;
  subject: string;
  description: string;
  priority: Priority;
  category: Category;
  status: Status;
  customer: User;
  assignee: User | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  replyCount: number;
  sla: Sla;
  allowedTransitions: Status[];
}

export interface TimelineEvent {
  id: string;
  type: EventType;
  actor: User;
  fromValue: string | null;
  toValue: string | null;
  fromLabel: string | null;
  toLabel: string | null;
  body: string | null;
  createdAt: string;
}

export interface TicketDetail {
  ticket: Ticket;
  timeline: TimelineEvent[];
}

export interface Stats {
  total: number;
  byStatus: Record<Status, number>;
  active: number;
  breached: number;
  atRisk: number;
  unassigned: number;
  mine: number;
  slaMetRate: number | null;
}

export interface Meta {
  statuses: { value: Status; label: string }[];
  priorities: { value: Priority; label: string; slaHours: number }[];
  categories: { value: Category; label: string }[];
  transitions: Record<Status, Status[]>;
  slaAtRiskRatio: number;
}
