/**
 * Notification templating (pure, UI-independent).
 *
 * Templates are stored per business/event/channel in the database, but the
 * DEFAULT copy and the variable substitution live here so the admin editor, the
 * dispatcher and the preview all agree on the same rules. Substitution is a safe,
 * allow-listed `{{ token }}` replace - never `eval`, never arbitrary property access.
 */

export type NotificationEventKey =
  | 'BOOKING_CREATED'
  | 'BOOKING_ACCEPTED'
  | 'BOOKING_REJECTED'
  | 'BOOKING_CANCELLED'
  | 'BOOKING_RESCHEDULED'
  | 'BOOKING_COMPLETED'
  | 'BOOKING_REMINDER'
  | 'BOOKING_FOLLOW_UP';

export type NotificationChannelKey = 'EMAIL' | 'WHATSAPP' | 'SMS';

export interface NotificationTemplateContent {
  subject: string;
  body: string;
}

export interface NotificationEventMeta {
  event: NotificationEventKey;
  label: string;
  description: string;
  /** Whether this event fires an immediate message when it happens. */
  immediate: boolean;
}

/** Ordered event catalogue with human labels for the admin UI. */
export const NOTIFICATION_EVENTS: readonly NotificationEventMeta[] = [
  { event: 'BOOKING_CREATED', label: 'Booking received', description: 'Sent when a new booking is submitted and awaits confirmation.', immediate: true },
  { event: 'BOOKING_ACCEPTED', label: 'Booking confirmed', description: 'Sent when a booking is approved.', immediate: true },
  { event: 'BOOKING_REJECTED', label: 'Booking declined', description: 'Sent when a booking request is declined.', immediate: true },
  { event: 'BOOKING_CANCELLED', label: 'Booking cancelled', description: 'Sent when a booking is cancelled.', immediate: true },
  { event: 'BOOKING_RESCHEDULED', label: 'Booking rescheduled', description: 'Sent when a booking moves to a new time.', immediate: true },
  { event: 'BOOKING_COMPLETED', label: 'Booking completed', description: 'Sent after an appointment is marked complete.', immediate: true },
  { event: 'BOOKING_REMINDER', label: 'Appointment reminder', description: 'Sent ahead of an upcoming appointment.', immediate: false },
  { event: 'BOOKING_FOLLOW_UP', label: 'Follow-up', description: 'Sent after an appointment as a thank-you / follow-up.', immediate: false },
];

export const NOTIFICATION_CHANNELS: readonly NotificationChannelKey[] = ['EMAIL', 'WHATSAPP', 'SMS'];

/**
 * The variables a template may reference. Kept as an allow-list so the editor can
 * offer them and the renderer can reject anything unknown.
 */
export const TEMPLATE_VARIABLES: readonly { token: string; description: string }[] = [
  { token: 'customer.firstName', description: "Customer's first name" },
  { token: 'customer.lastName', description: "Customer's last name" },
  { token: 'customer.name', description: "Customer's full name" },
  { token: 'business.name', description: 'Your business name' },
  { token: 'service.name', description: 'Service booked' },
  { token: 'booking.date', description: 'Appointment date' },
  { token: 'booking.time', description: 'Appointment time' },
  { token: 'booking.reference', description: 'Booking reference code' },
  { token: 'booking.employee', description: 'Assigned team member' },
  { token: 'booking.price', description: 'Total price' },
  { token: 'booking.manageUrl', description: 'Link to view / reschedule / cancel' },
  { token: 'booking.location', description: 'Location name' },
  { token: 'booking.address', description: 'Location address (or the customer’s address for mobile visits)' },
  { token: 'booking.mapUrl', description: 'Map / directions link for the location' },
  { token: 'booking.customerAddress', description: "Customer's address for a mobile visit" },
];

/** Default English copy for every event (EMAIL). Other channels reuse the body. */
export const DEFAULT_TEMPLATES: Record<NotificationEventKey, NotificationTemplateContent> = {
  BOOKING_CREATED: {
    subject: 'We received your booking - {{business.name}}',
    body: 'Hi {{customer.firstName}},\n\nThanks for booking {{service.name}} on {{booking.date}} at {{booking.time}}. Your request is pending confirmation.\n\nReference: {{booking.reference}}\n\n{{business.name}}',
  },
  BOOKING_ACCEPTED: {
    subject: 'Your booking is confirmed - {{business.name}}',
    body: 'Hi {{customer.firstName}},\n\nYour appointment for {{service.name}} on {{booking.date}} at {{booking.time}} is confirmed with {{booking.employee}}.\n\nReference: {{booking.reference}}\n\nSee you soon,\n{{business.name}}',
  },
  BOOKING_REJECTED: {
    subject: 'About your booking request - {{business.name}}',
    body: 'Hi {{customer.firstName}},\n\nUnfortunately we could not confirm your request for {{service.name}} on {{booking.date}}. Please try another time.\n\n{{business.name}}',
  },
  BOOKING_CANCELLED: {
    subject: 'Your booking was cancelled - {{business.name}}',
    body: 'Hi {{customer.firstName}},\n\nYour appointment for {{service.name}} on {{booking.date}} at {{booking.time}} has been cancelled.\n\nReference: {{booking.reference}}\n\n{{business.name}}',
  },
  BOOKING_RESCHEDULED: {
    subject: 'Your booking was rescheduled - {{business.name}}',
    body: 'Hi {{customer.firstName}},\n\nYour appointment for {{service.name}} has moved to {{booking.date}} at {{booking.time}}.\n\nReference: {{booking.reference}}\n\n{{business.name}}',
  },
  BOOKING_COMPLETED: {
    subject: 'Thanks for visiting - {{business.name}}',
    body: 'Hi {{customer.firstName}},\n\nThank you for visiting us for {{service.name}}. We hope to see you again soon!\n\n{{business.name}}',
  },
  BOOKING_REMINDER: {
    subject: 'Reminder: your appointment is coming up - {{business.name}}',
    body: 'Hi {{customer.firstName}},\n\nThis is a reminder for your {{service.name}} appointment on {{booking.date}} at {{booking.time}} with {{booking.employee}}.\n\nReference: {{booking.reference}}\n\n{{business.name}}',
  },
  BOOKING_FOLLOW_UP: {
    subject: 'How was your visit? - {{business.name}}',
    body: 'Hi {{customer.firstName}},\n\nWe hope you enjoyed your {{service.name}} appointment. We would love to see you again.\n\n{{business.name}}',
  },
};

export function defaultTemplate(event: NotificationEventKey): NotificationTemplateContent {
  return DEFAULT_TEMPLATES[event];
}

const TOKEN_RE = /\{\{\s*([\w.]+)\s*\}\}/g;

/**
 * Replace `{{ token }}` occurrences using the provided variable map. Unknown or
 * missing tokens render as an empty string so a message never leaks a raw
 * placeholder to a customer.
 */
export function renderTemplate(text: string, vars: Record<string, string | null | undefined>): string {
  if (!text) return '';
  return text.replace(TOKEN_RE, (_m, token: string) => {
    const value = vars[token];
    return value === null || value === undefined ? '' : String(value);
  });
}

/** List the distinct tokens referenced by a template body/subject. */
export function templateTokens(text: string): string[] {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(TOKEN_RE);
  while ((m = re.exec(text)) !== null) if (m[1]) out.add(m[1]);
  return [...out];
}
