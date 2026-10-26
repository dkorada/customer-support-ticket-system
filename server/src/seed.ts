import type { PrismaClient } from '@prisma/client';
import type { Category, Priority, Status } from './domain/constants';
import {
  assertAssignment,
  assertCanReply,
  assertTransition,
  resolvedAtAfter,
  statusAfterCustomerReply,
} from './domain/workflow';

/**
 * Demo data. Every ticket is built by replaying a sequence of actions through
 * the same workflow rules the API enforces, so the seeded timelines are always
 * valid histories. Timestamps are relative to "now", which keeps the SLA flags
 * meaningful whenever the database is (re)seeded.
 */

const AGENTS = {
  maya: { id: 'agent-maya', name: 'Maya Chen', email: 'maya.chen@beacon.support', title: 'Support Lead' },
  daniel: { id: 'agent-daniel', name: 'Daniel Okafor', email: 'daniel.okafor@beacon.support', title: 'Senior Support Engineer' },
  priya: { id: 'agent-priya', name: 'Priya Raman', email: 'priya.raman@beacon.support', title: 'Billing Specialist' },
  lucas: { id: 'agent-lucas', name: 'Lucas Ferreira', email: 'lucas.ferreira@beacon.support', title: 'Support Engineer' },
} as const;

const CUSTOMERS = {
  sarah: { id: 'customer-sarah', name: 'Sarah Mitchell', email: 'sarah@brightpath.io', company: 'Brightpath Logistics' },
  omar: { id: 'customer-omar', name: 'Omar Haddad', email: 'omar@cedarlabs.dev', company: 'Cedar Labs' },
  elena: { id: 'customer-elena', name: 'Elena Rossi', email: 'elena.rossi@vela.studio', company: 'Vela Studio' },
  james: { id: 'customer-james', name: 'James Whitaker', email: 'j.whitaker@northfield.co', company: 'Northfield & Co' },
  aiko: { id: 'customer-aiko', name: 'Aiko Tanaka', email: 'aiko@harborhealth.org', company: 'Harbor Health' },
  noah: { id: 'customer-noah', name: 'Noah Bennett', email: 'noah@quillandink.shop', company: 'Quill & Ink' },
} as const;

type AgentKey = keyof typeof AGENTS;
type CustomerKey = keyof typeof CUSTOMERS;

type Step =
  | ['assign', AgentKey | null]
  | ['status', Status]
  | ['agent', string]
  | ['customer', string]
  | ['note', string];

interface TicketSpec {
  customer: CustomerKey;
  subject: string;
  description: string;
  priority: Priority;
  category: Category;
  /** Hours since the ticket was created. */
  ageHours: number;
  /** Hours after creation at which the last step happened (defaults to 90% of the age). */
  spanHours?: number;
  /** The agent performing the steps (assignment target is set explicitly). */
  agent?: AgentKey;
  steps: Step[];
}

const TICKETS: TicketSpec[] = [
  // ---- HIGH priority (4h target) ----
  {
    customer: 'sarah',
    subject: 'Production dashboard returns 502 for all users',
    description:
      'Since about an hour ago every user on our workspace gets a 502 Bad Gateway when opening the Operations dashboard. Other pages load fine. This is blocking our dispatch team.',
    priority: 'HIGH',
    category: 'TECHNICAL',
    ageHours: 6.5,
    agent: 'daniel',
    steps: [
      ['assign', 'daniel'],
      ['status', 'IN_PROGRESS'],
      ['agent', "Thanks Sarah, I can reproduce the 502 on your workspace. I've escalated to our platform team and will update you within the hour."],
      ['note', 'Gateway logs show the dashboard query timing out after 30s. Looks related to the widget cache migration last night.'],
      ['customer', 'Any update? The dispatch team is working off spreadsheets right now.'],
    ],
  },
  {
    customer: 'aiko',
    subject: 'Unable to export patient intake report (PDF blank)',
    description:
      'Exporting the weekly intake report to PDF produces a blank document. CSV export works. We need this for a compliance submission due tomorrow morning.',
    priority: 'HIGH',
    category: 'BUG',
    ageHours: 9,
    steps: [],
  },
  {
    customer: 'james',
    subject: 'Charged twice for the annual plan',
    description:
      'Our card was charged $4,800 twice on the same day for the annual Business plan renewal. Please refund the duplicate charge. Invoice numbers INV-20931 and INV-20932.',
    priority: 'HIGH',
    category: 'BILLING',
    ageHours: 3.3,
    agent: 'priya',
    steps: [
      ['assign', 'priya'],
      ['status', 'IN_PROGRESS'],
      ['agent', "Hi James, I'm sorry about this. I can see both charges and have started the refund for INV-20932. I'll confirm once the payment processor accepts it."],
    ],
  },
  {
    customer: 'omar',
    subject: 'SSO login loop after IdP certificate rotation',
    description:
      'We rotated the signing certificate on our Okta tenant and now users are stuck in a redirect loop when signing in with SSO. Password login is disabled for our org.',
    priority: 'HIGH',
    category: 'ACCOUNT',
    ageHours: 1.2,
    agent: 'maya',
    steps: [['assign', 'lucas']],
  },
  {
    customer: 'elena',
    subject: 'Webhook deliveries failing with signature mismatch',
    description:
      'All webhook deliveries to our endpoint started failing signature verification this morning. We did not change our secret.',
    priority: 'HIGH',
    category: 'TECHNICAL',
    ageHours: 30,
    spanHours: 2.6,
    agent: 'daniel',
    steps: [
      ['assign', 'daniel'],
      ['status', 'IN_PROGRESS'],
      ['agent', 'We found a regression in how the payload was serialised before signing. A fix is deployed, and failed deliveries are being retried automatically.'],
      ['customer', 'Confirmed, deliveries are green again. Thank you for the quick turnaround!'],
      ['status', 'RESOLVED'],
    ],
  },
  {
    customer: 'noah',
    subject: 'Storefront checkout widget not loading',
    description: 'The embedded checkout widget shows a spinner forever on our product pages. Started after we updated our theme.',
    priority: 'HIGH',
    category: 'BUG',
    ageHours: 52,
    spanHours: 7.5,
    agent: 'lucas',
    steps: [
      ['assign', 'lucas'],
      ['status', 'IN_PROGRESS'],
      ['agent', 'Could you share the URL of a product page and the name of the theme you switched to?'],
      ['status', 'WAITING_FOR_CUSTOMER'],
      ['customer', 'Sure: quillandink.shop/products/fountain-pen-set, theme is "Ledger 2.0".'],
      ['agent', 'The new theme loads a script that blocks third-party iframes. Adding our domain to its allow-list fixes it; I have sent the exact snippet by email.'],
      ['status', 'RESOLVED'],
      ['status', 'CLOSED'],
    ],
  },

  // ---- MEDIUM priority (24h target) ----
  {
    customer: 'sarah',
    subject: 'Add two more seats to our workspace',
    description: 'We are onboarding two new dispatchers next week. How do we add seats mid-cycle and how is it prorated?',
    priority: 'MEDIUM',
    category: 'BILLING',
    ageHours: 20,
    agent: 'priya',
    steps: [
      ['assign', 'priya'],
      ['status', 'IN_PROGRESS'],
      ['agent', 'Seats added mid-cycle are prorated to the day. I can add them for you now. Should they start on Monday?'],
      ['status', 'WAITING_FOR_CUSTOMER'],
    ],
  },
  {
    customer: 'omar',
    subject: 'API rate limit lower than documented',
    description:
      'Our API key is being throttled at 60 requests/minute, but the docs say the Growth plan includes 300/minute. Response headers confirm a limit of 60.',
    priority: 'MEDIUM',
    category: 'TECHNICAL',
    ageHours: 31,
    agent: 'lucas',
    steps: [
      ['assign', 'lucas'],
      ['status', 'IN_PROGRESS'],
      ['note', 'Key was created before the plan upgrade; limits are cached per key. Need billing to confirm the plan change date.'],
    ],
  },
  {
    customer: 'elena',
    subject: 'Calendar sync duplicates recurring events',
    description: 'Every recurring meeting synced from Google Calendar shows up twice in the team planner view.',
    priority: 'MEDIUM',
    category: 'BUG',
    ageHours: 50,
    steps: [],
  },
  {
    customer: 'james',
    subject: 'Change the account owner to our new COO',
    description: 'Please transfer ownership of the Northfield workspace from me to Rachel Ortiz (rachel.ortiz@northfield.co).',
    priority: 'MEDIUM',
    category: 'ACCOUNT',
    ageHours: 5,
    agent: 'maya',
    steps: [['assign', 'maya']],
  },
  {
    customer: 'aiko',
    subject: 'Reports page is slow for date ranges over 90 days',
    description: 'Loading the utilisation report for a 6-month range takes over a minute. Shorter ranges are fast.',
    priority: 'MEDIUM',
    category: 'TECHNICAL',
    ageHours: 10,
    steps: [],
  },
  {
    customer: 'noah',
    subject: 'Invoices should show our VAT number',
    description: 'Our accountant needs the VAT number GB 123 4567 89 printed on every invoice. Can you add it, and reissue last month\'s invoice?',
    priority: 'MEDIUM',
    category: 'BILLING',
    ageHours: 70,
    spanHours: 18,
    agent: 'priya',
    steps: [
      ['assign', 'priya'],
      ['status', 'IN_PROGRESS'],
      ['agent', 'Done. Your VAT number is now on all future invoices, and I have reissued September\'s invoice. You will find it under Billing → Invoices.'],
      ['status', 'RESOLVED'],
    ],
  },
  {
    customer: 'sarah',
    subject: 'Driver app crashes when uploading proof-of-delivery photos',
    description: 'On Android 14 the driver app crashes after taking the photo. iOS works. Happens on Pixel 7 and Galaxy S23.',
    priority: 'MEDIUM',
    category: 'BUG',
    ageHours: 96,
    spanHours: 40,
    agent: 'daniel',
    steps: [
      ['assign', 'daniel'],
      ['status', 'IN_PROGRESS'],
      ['agent', 'Thanks for the device details. Could you send a crash log from one affected phone? Settings → Help → Send diagnostics.'],
      ['status', 'WAITING_FOR_CUSTOMER'],
      ['customer', 'Diagnostics sent from the Pixel 7 just now.'],
      ['note', 'Crash is in the image compression library on Android 14. Fix is in the 4.12.1 release.'],
      ['agent', 'Version 4.12.1 with the fix is now live on the Play Store. Updating the app resolves the crash.'],
      ['status', 'RESOLVED'],
    ],
  },
  {
    customer: 'omar',
    subject: 'Request: audit log export for SOC 2',
    description: 'Our auditors asked for a full export of admin actions for the last 12 months. Is there a self-serve way to get this?',
    priority: 'MEDIUM',
    category: 'ACCOUNT',
    ageHours: 120,
    spanHours: 20,
    agent: 'maya',
    steps: [
      ['assign', 'maya'],
      ['status', 'IN_PROGRESS'],
      ['agent', 'You can export it from Admin → Security → Audit log → Export CSV. Exports cover up to 13 months.'],
      ['status', 'RESOLVED'],
      ['status', 'CLOSED'],
    ],
  },

  // ---- LOW priority (72h target) ----
  {
    customer: 'elena',
    subject: 'Dark mode for the client portal?',
    description: 'Our designers would love a dark theme for the client portal. Is that on the roadmap?',
    priority: 'LOW',
    category: 'FEATURE_REQUEST',
    ageHours: 8,
    steps: [],
  },
  {
    customer: 'james',
    subject: 'Typo on the billing settings page',
    description: '"Recieve invoices by email" should be "Receive". Minor, but our finance team noticed.',
    priority: 'LOW',
    category: 'OTHER',
    ageHours: 30,
    agent: 'lucas',
    steps: [
      ['assign', 'lucas'],
      ['status', 'IN_PROGRESS'],
      ['note', 'Copy fix is in review, ships with Thursday\'s release.'],
    ],
  },
  {
    customer: 'aiko',
    subject: 'Allow custom fields on intake forms',
    description: 'We would like to add a "preferred pharmacy" field to the intake form. Is there a way to add custom fields?',
    priority: 'LOW',
    category: 'FEATURE_REQUEST',
    ageHours: 60,
    agent: 'maya',
    steps: [
      ['assign', 'maya'],
      ['status', 'IN_PROGRESS'],
      ['agent', 'Custom fields are in beta. I can enable them for your workspace. How many forms would you use them on?'],
      ['status', 'WAITING_FOR_CUSTOMER'],
    ],
  },
  {
    customer: 'noah',
    subject: 'How do I change the order confirmation email template?',
    description: 'I want to add our logo and a thank-you note to the order confirmation email.',
    priority: 'LOW',
    category: 'OTHER',
    ageHours: 100,
    steps: [],
  },
  {
    customer: 'sarah',
    subject: 'Keyboard shortcut to jump between routes',
    description: 'Power users on our team would love a shortcut to move to the next/previous route in the planner.',
    priority: 'LOW',
    category: 'FEATURE_REQUEST',
    ageHours: 160,
    spanHours: 90,
    agent: 'lucas',
    steps: [
      ['assign', 'lucas'],
      ['status', 'IN_PROGRESS'],
      ['agent', 'Good news: J/K shortcuts for next/previous route shipped in today\'s release. Press ? in the planner to see all shortcuts.'],
      ['status', 'RESOLVED'],
    ],
  },
  {
    customer: 'omar',
    subject: 'Update company address on our account',
    description: 'We moved offices. New address: 48 Harbour Street, Floor 3, Bristol BS1 4QA.',
    priority: 'LOW',
    category: 'ACCOUNT',
    ageHours: 40,
    spanHours: 6,
    agent: 'priya',
    steps: [
      ['assign', 'priya'],
      ['status', 'IN_PROGRESS'],
      ['agent', 'Your company address is updated and will appear on your next invoice.'],
      ['status', 'RESOLVED'],
      ['status', 'CLOSED'],
    ],
  },
  {
    customer: 'elena',
    subject: 'Question about data retention for archived projects',
    description: 'How long do you keep files for projects we archive? We need to know for our client contracts.',
    priority: 'LOW',
    category: 'OTHER',
    ageHours: 26,
    steps: [['assign', 'maya']],
  },
  {
    customer: 'james',
    subject: 'Duplicate ticket: double charge',
    description: 'Sending again in case the first one did not go through: we were charged twice for the annual plan.',
    priority: 'LOW',
    category: 'BILLING',
    ageHours: 3,
    spanHours: 0.5,
    agent: 'priya',
    steps: [
      ['note', 'Duplicate of the double-charge ticket already in progress. Closing this one.'],
      ['status', 'CLOSED'],
    ],
  },
  {
    customer: 'aiko',
    subject: 'Bulk import of staff accounts via CSV',
    description: 'We need to add 140 staff accounts. Is there a CSV import, and what columns does it expect?',
    priority: 'MEDIUM',
    category: 'ACCOUNT',
    ageHours: 2,
    steps: [],
  },
  {
    customer: 'noah',
    subject: 'Discount codes not applying to bundles',
    description: 'Customers report that the code AUTUMN15 does not apply when a bundle is in the cart. Single products work.',
    priority: 'HIGH',
    category: 'BUG',
    ageHours: 0.4,
    steps: [],
  },
];

export async function seedDatabase(prisma: PrismaClient, now: Date = new Date()) {
  await prisma.$transaction([
    prisma.timelineEvent.deleteMany(),
    prisma.ticket.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  const created = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * 3_600_000);

  await prisma.user.createMany({
    data: [
      ...Object.values(AGENTS).map((a) => ({ ...a, role: 'AGENT', createdAt: created(24 * 400) })),
      ...Object.values(CUSTOMERS).map((c) => ({ ...c, role: 'CUSTOMER', createdAt: created(24 * 200) })),
    ],
  });

  // Oldest first so ticket numbers increase with creation time.
  const specs = [...TICKETS].sort((a, b) => b.ageHours - a.ageHours);
  let number = 1000;

  for (const spec of specs) {
    number += 1;
    const customerId = CUSTOMERS[spec.customer].id;
    const actingAgentId = AGENTS[spec.agent ?? 'maya'].id;
    const t0 = created(spec.ageHours);
    const span = (spec.spanHours ?? spec.ageHours * 0.9) * 3_600_000;
    const at = (i: number) => new Date(t0.getTime() + (span * (i + 1)) / spec.steps.length);

    let status: Status = 'OPEN';
    let assigneeId: string | null = null;
    let resolvedAt: Date | null = null;
    let updatedAt = t0;
    const events: { actorId: string; type: string; fromValue?: string | null; toValue?: string | null; body?: string; createdAt: Date }[] = [
      { actorId: customerId, type: 'CREATED', toValue: 'OPEN', createdAt: t0 },
    ];

    const setStatus = (to: Status, actorId: string, when: Date) => {
      assertTransition({ status, assigneeId }, to);
      events.push({ actorId, type: 'STATUS_CHANGED', fromValue: status, toValue: to, createdAt: when });
      resolvedAt = resolvedAtAfter(to, resolvedAt, when);
      status = to;
    };

    spec.steps.forEach((step, i) => {
      const when = at(i);
      updatedAt = when;
      switch (step[0]) {
        case 'assign': {
          const to = step[1] ? AGENTS[step[1]].id : null;
          assertAssignment({ status, assigneeId }, to);
          events.push({ actorId: actingAgentId, type: 'ASSIGNED', fromValue: assigneeId, toValue: to, createdAt: when });
          assigneeId = to;
          break;
        }
        case 'status':
          setStatus(step[1], actingAgentId, when);
          break;
        case 'agent':
        case 'note':
          assertCanReply({ status, assigneeId });
          events.push({ actorId: actingAgentId, type: step[0] === 'agent' ? 'REPLY' : 'NOTE', body: step[1], createdAt: when });
          break;
        case 'customer': {
          assertCanReply({ status, assigneeId });
          events.push({ actorId: customerId, type: 'REPLY', body: step[1], createdAt: when });
          const next = statusAfterCustomerReply({ status, assigneeId });
          if (next) setStatus(next, customerId, new Date(when.getTime() + 1));
          break;
        }
      }
    });

    await prisma.ticket.create({
      data: {
        number,
        subject: spec.subject,
        description: spec.description,
        priority: spec.priority,
        category: spec.category,
        status,
        customerId,
        assigneeId,
        resolvedAt,
        createdAt: t0,
        updatedAt,
        events: { create: events },
      },
    });
  }

  return { users: Object.keys(AGENTS).length + Object.keys(CUSTOMERS).length, tickets: specs.length };
}
