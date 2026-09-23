import type { MidwestData } from '@booking/db';

/**
 * Committed Midwest Identity Services dataset used by the runtime loader route
 * (/api/admin/load-midwest), so the catalogue can be provisioned from the
 * browser without running the CLI. Contact details, prices, and the sample staff
 * member are sensible placeholders to edit in the admin; the service lines
 * (Fingerprinting, Notary, Apostille) are the real offerings.
 */
export const MIDWEST_SEED: MidwestData = {
  business: {
    name: 'Midwest Identity Services',
    slug: 'midwest-identity-services',
    timezone: 'America/Chicago',
    currency: 'USD',
    email: 'info@midwestidentityservices.com',
    phone: null,
  },
  website: {
    name: 'Midwest Identity Services',
    publicKey: 'pk_midwest_live',
    domain: null,
  },
  location: {
    name: 'Kansas City Office',
    address: null,
    city: 'Kansas City',
    state: 'MO',
    country: 'US',
    mode: 'IN_PERSON',
    timezone: 'America/Chicago',
  },
  businessHours: [
    { dayOfWeek: 0, isClosed: true },
    { dayOfWeek: 1, openTime: '09:00', closeTime: '17:00' },
    { dayOfWeek: 2, openTime: '09:00', closeTime: '17:00' },
    { dayOfWeek: 3, openTime: '09:00', closeTime: '17:00' },
    { dayOfWeek: 4, openTime: '09:00', closeTime: '17:00' },
    { dayOfWeek: 5, openTime: '09:00', closeTime: '17:00' },
    { dayOfWeek: 6, isClosed: true },
  ],
  categories: [
    {
      name: 'Fingerprinting',
      description: 'Ink and electronic fingerprinting services.',
      services: [
        { name: 'Ink Card Fingerprinting (FD-258)', description: 'Traditional ink fingerprint cards.', durationMinutes: 20, price: 0 },
        { name: 'Live Scan / Electronic Fingerprinting', description: 'Digital fingerprint capture and submission.', durationMinutes: 15, price: 0 },
        { name: 'Background Check Fingerprinting', description: 'Fingerprinting for employment or licensing checks.', durationMinutes: 20, price: 0 },
      ],
    },
    {
      name: 'Notary',
      description: 'Notarization and mobile notary services.',
      services: [
        { name: 'General Notarization', description: 'Standard notarization per document.', durationMinutes: 15, price: 0 },
        { name: 'Mobile Notary Visit', description: 'Notary travels to the client location.', durationMinutes: 30, price: 0 },
        { name: 'Loan Signing', description: 'Notarization of loan and closing documents.', durationMinutes: 60, price: 0 },
      ],
    },
    {
      name: 'Apostille',
      description: 'Document authentication and apostille services.',
      services: [
        { name: 'Document Apostille / Authentication', description: 'Apostille or authentication for use abroad.', durationMinutes: 15, price: 0 },
        { name: 'Expedited Apostille', description: 'Rush processing for apostille requests.', durationMinutes: 15, price: 0 },
      ],
    },
  ],
  admin: {
    email: 'admin@midwestidentity.com',
    name: 'Midwest Admin',
    password: 'password123',
  },
  employees: [
    {
      firstName: 'Front',
      lastName: 'Desk',
      title: 'Fingerprint Technician & Notary',
      email: 'frontdesk@midwestidentity.com',
      services: [
        'Ink Card Fingerprinting (FD-258)',
        'Live Scan / Electronic Fingerprinting',
        'Background Check Fingerprinting',
        'General Notarization',
        'Mobile Notary Visit',
      ],
      workingHours: [
        { dayOfWeek: 1, startTime: '09:00', endTime: '17:00', breaks: [{ startTime: '12:00', endTime: '13:00', label: 'Lunch' }] },
        { dayOfWeek: 2, startTime: '09:00', endTime: '17:00', breaks: [{ startTime: '12:00', endTime: '13:00', label: 'Lunch' }] },
        { dayOfWeek: 3, startTime: '09:00', endTime: '17:00', breaks: [{ startTime: '12:00', endTime: '13:00', label: 'Lunch' }] },
        { dayOfWeek: 4, startTime: '09:00', endTime: '17:00', breaks: [{ startTime: '12:00', endTime: '13:00', label: 'Lunch' }] },
        { dayOfWeek: 5, startTime: '09:00', endTime: '17:00', breaks: [{ startTime: '12:00', endTime: '13:00', label: 'Lunch' }] },
      ],
    },
  ],
};
