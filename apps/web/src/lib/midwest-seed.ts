import type { MidwestData } from '@booking/db';

/**
 * Midwest Identity Services dataset (client data) used by /api/admin/load-midwest
 * so the catalogue can be provisioned from the browser without the CLI.
 *
 * Working hours: only Monday-Thursday (10:00-15:00) were provided, so Friday,
 * Saturday and Sunday are set closed - adjust once the remaining days are known.
 * Prices and service durations are placeholders (durations are estimates) to set
 * in the admin. Days off and special days are preserved exactly as supplied; the
 * SpecialDay schema stores date + hours + location, so the featured service and
 * "+N services" are captured in the special-day label.
 */
export const MIDWEST_SEED: MidwestData = {
  business: {
    name: 'Midwest Identity Services',
    slug: 'midwest-identity-services',
    timezone: 'America/Chicago',
    currency: 'USD',
    email: 'mwfingerprinting@gmail.com',
    phone: '8164420295',
  },
  website: {
    name: 'Midwest Identity Services',
    publicKey: 'pk_midwest_live',
    domain: null,
  },
  location: {
    name: 'Main Office',
    address: '8101 E. Bannister Rd',
    city: 'Kansas City',
    state: 'MO',
    postalCode: '64134',
    country: 'US',
    phone: '8164420295',
    mode: 'IN_PERSON',
    timezone: 'America/Chicago',
  },
  businessHours: [
    { dayOfWeek: 0, isClosed: true },
    { dayOfWeek: 1, openTime: '10:00', closeTime: '15:00' },
    { dayOfWeek: 2, openTime: '10:00', closeTime: '15:00' },
    { dayOfWeek: 3, openTime: '10:00', closeTime: '15:00' },
    { dayOfWeek: 4, openTime: '10:00', closeTime: '15:00' },
    { dayOfWeek: 5, isClosed: true },
    { dayOfWeek: 6, isClosed: true },
  ],
  categories: [
    {
      name: 'Fingerprinting',
      description: 'Ink and electronic (Live Scan) fingerprinting services.',
      services: [
        { name: 'ATF Fingerprinting', durationMinutes: 30, price: 0 },
        { name: 'Florida Live Scan and/or AHCA (FDLE Fingerprinting)', durationMinutes: 30, price: 0 },
        { name: 'Group Fingerprinting', durationMinutes: 60, price: 0 },
        { name: 'NICS Appeal / Firearm Denial Fingerprints - Electronic Submission (Live Scan)', durationMinutes: 30, price: 0 },
        { name: 'FD-258 Fingerprinting - In Office', durationMinutes: 20, price: 0 },
        { name: 'FBI Background Check Fingerprinting (Live Scan)', durationMinutes: 30, price: 0 },
        { name: 'Mobile Fingerprinting - We come to you', durationMinutes: 45, price: 0 },
      ],
    },
    {
      name: 'Apostille',
      description: 'Document authentication and apostille services.',
      services: [{ name: 'Apostille Service', durationMinutes: 30, price: 0 }],
    },
    {
      name: 'Notary',
      description: 'In-office and mobile notary services.',
      services: [
        { name: 'Notary Services - We Come To You', durationMinutes: 45, price: 0 },
        { name: 'Notary Services - In Office', durationMinutes: 15, price: 0 },
      ],
    },
    {
      name: 'Officiant',
      description: 'Marriage officiant services.',
      services: [{ name: 'Quick Sign Marriage Officiant', durationMinutes: 30, price: 0 }],
    },
  ],
  admin: {
    email: 'mwfingerprinting@gmail.com',
    name: 'Admin Panel',
    password: 'password123',
  },
  employees: [
    {
      firstName: 'Admin',
      lastName: 'Panel',
      email: 'mwfingerprinting@gmail.com',
      phone: '8164420295',
      title: 'Owner',
      services: [
        'ATF Fingerprinting',
        'Florida Live Scan and/or AHCA (FDLE Fingerprinting)',
        'Group Fingerprinting',
        'NICS Appeal / Firearm Denial Fingerprints - Electronic Submission (Live Scan)',
        'FD-258 Fingerprinting - In Office',
        'FBI Background Check Fingerprinting (Live Scan)',
        'Mobile Fingerprinting - We come to you',
        'Apostille Service',
        'Notary Services - We Come To You',
        'Notary Services - In Office',
        'Quick Sign Marriage Officiant',
      ],
      workingHours: [
        { dayOfWeek: 1, startTime: '10:00', endTime: '15:00' },
        { dayOfWeek: 2, startTime: '10:00', endTime: '15:00' },
        { dayOfWeek: 3, startTime: '10:00', endTime: '15:00' },
        { dayOfWeek: 4, startTime: '10:00', endTime: '15:00' },
      ],
      daysOff: [
        { start: '2026-09-15', reason: 'School work' },
        { start: '2026-09-16', reason: 'Traveling to Columbia' },
        { start: '2026-09-17', reason: 'Class day' },
        { start: '2026-09-20', reason: 'Rest day' },
        { start: '2026-09-21', reason: 'Drug testing' },
        { start: '2026-09-22', end: '2026-09-24', reason: 'Meetings' },
        { start: '2026-09-27', reason: 'Rest' },
        { start: '2026-09-29', end: '2026-09-30', reason: 'Traveling' },
      ],
    },
  ],
  specialDays: [
    { date: '2026-09-21', openTime: '09:00', closeTime: '12:30', name: 'Apostille Service (+7 services)' },
    { date: '2026-09-24', openTime: '10:00', closeTime: '12:00', name: 'FD-258 Fingerprinting - In Office (+6 services)' },
    { date: '2026-09-28', endDate: '2026-09-29', openTime: '11:00', closeTime: '14:30', name: 'FD-258 Fingerprinting - In Office (+1 service)' },
  ],
};
