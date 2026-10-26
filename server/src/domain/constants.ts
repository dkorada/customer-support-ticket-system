export const ROLES = ['CUSTOMER', 'AGENT'] as const;
export type Role = (typeof ROLES)[number];

export const STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'RESOLVED', 'CLOSED'] as const;
export type Status = (typeof STATUSES)[number];

export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const CATEGORIES = ['BILLING', 'TECHNICAL', 'ACCOUNT', 'FEATURE_REQUEST', 'BUG', 'OTHER'] as const;
export type Category = (typeof CATEGORIES)[number];

export const EVENT_TYPES = ['CREATED', 'STATUS_CHANGED', 'ASSIGNED', 'REPLY', 'NOTE'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const STATUS_LABELS: Record<Status, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  WAITING_FOR_CUSTOMER: 'Waiting for customer',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

export const PRIORITY_LABELS: Record<Priority, string> = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' };

export const CATEGORY_LABELS: Record<Category, string> = {
  BILLING: 'Billing',
  TECHNICAL: 'Technical',
  ACCOUNT: 'Account',
  FEATURE_REQUEST: 'Feature request',
  BUG: 'Bug',
  OTHER: 'Other',
};
