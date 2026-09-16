/**
 * Static demo configuration placeholder (Phase 1).
 *
 * This is NOT domain data and NOT seed data — it is a small, DB-free descriptor
 * used by the foundation shell/landing page. Real seeded demo businesses,
 * services and bookings arrive in Phase 2 (database) via Prisma seeds.
 *
 * Branding here is configuration-driven, never hard-coded into components,
 * matching the "no hard-coded client branding" principle.
 */
export interface DemoConfig {
  productName: string;
  tagline: string;
  demoBusinessSlug: string;
  supportedProviders: {
    databases: string[];
    notificationChannels: string[];
  };
  phase: number;
}

export const demoConfig: DemoConfig = {
  productName: 'Universal Premium Booking',
  tagline: 'A standalone, embeddable booking engine.',
  demoBusinessSlug: 'demo-business',
  supportedProviders: {
    databases: ['postgresql', 'mysql'],
    notificationChannels: ['email', 'whatsapp', 'sms'],
  },
  phase: 1,
};
