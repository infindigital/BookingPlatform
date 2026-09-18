import type { PrismaClient } from '@prisma/client';
import { createBooking } from '../booking/create-booking';
import { hashPassword } from '../auth/password';

/**
 * Demo seed - a single demo business with isolated, realistic data. Importable so
 * it can run from the CLI (`prisma/seed.ts`) or a one-time runtime bootstrap.
 * Idempotent by default: skips when the demo business already exists (pass
 * `{ force: true }` to rebuild its data cleanly).
 */

const DEMO_PASSWORD = 'password123';
const DEMO_SLUG = 'demo-business';
const PUBLIC_KEY = 'pk_demo_booking_123';

const PERMISSIONS = [
  'booking.read',
  'booking.write',
  'booking.approve',
  'service.manage',
  'employee.manage',
  'customer.manage',
  'payment.manage',
  'settings.manage',
  'analytics.read',
  'event.manage',
];

const FORM_THEMES = [
  { key: 'minimal', name: 'Minimal' },
  { key: 'luxury', name: 'Luxury' },
  { key: 'modern', name: 'Modern' },
  { key: 'medical', name: 'Medical' },
  { key: 'editorial', name: 'Editorial' },
];

/** Next occurrence of the given weekday at hour:00 UTC, from today. */
function nextWeekdayAt(weekday: number, hour: number): Date {
  const d = new Date();
  d.setUTCHours(hour, 0, 0, 0);
  const delta = (weekday - d.getUTCDay() + 7) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + delta);
  return d;
}

/** Today at hour:minute UTC - used so the demo dashboard has live "today" data. */
function todayAt(hour: number, minute = 0): Date {
  const d = new Date();
  d.setUTCHours(hour, minute, 0, 0);
  return d;
}

export interface SeedSummary {
  seeded: boolean;
  business?: string;
  services?: number;
  employees?: number;
  customers?: number;
  bookings?: number;
}

export async function seedDemo(db: PrismaClient, opts: { force?: boolean } = {}): Promise<SeedSummary> {
  const existing = await db.business.findUnique({ where: { slug: DEMO_SLUG }, select: { id: true } });
  if (existing && !opts.force) {
    return { seeded: false };
  }

  // 1. Tenant root (idempotent by slug).
  const business = await db.business.upsert({
    where: { slug: DEMO_SLUG },
    update: {},
    create: { slug: DEMO_SLUG, name: 'Aurora Studio', timezone: 'UTC', currency: 'USD', email: 'hello@aurora.example' },
  });
  const businessId = business.id;

  // Clean this business's dependent data for a deterministic reseed.
  await db.notificationLog.deleteMany({ where: { businessId } });
  await db.notificationJob.deleteMany({ where: { businessId } });
  await db.booking.deleteMany({ where: { businessId } });
  await db.customer.deleteMany({ where: { businessId } });
  await db.employeeService.deleteMany({ where: { businessId } });
  await db.service.deleteMany({ where: { businessId } });
  await db.serviceCategory.deleteMany({ where: { businessId } });
  await db.employeeWorkingHours.deleteMany({ where: { businessId } });
  await db.employee.deleteMany({ where: { businessId } });
  await db.businessHours.deleteMany({ where: { businessId } });
  await db.notificationTemplate.deleteMany({ where: { businessId } });
  await db.formConfiguration.deleteMany({ where: { businessId } });
  await db.formTheme.deleteMany({ where: { businessId } });

  // 2. Website (widget entry point) - domain-less "paste anywhere" public key.
  await db.website.upsert({
    where: { publicKey: PUBLIC_KEY },
    update: { businessId, domain: null },
    create: { businessId, name: 'Aurora Website', domain: null, publicKey: PUBLIC_KEY },
  });

  // 3. Permissions (global) + roles.
  for (const key of PERMISSIONS) {
    await db.permission.upsert({ where: { key }, update: {}, create: { key } });
  }
  const allPerms = await db.permission.findMany();
  const adminRole = await db.role.upsert({
    where: { businessId_name: { businessId, name: 'Administrator' } },
    update: {},
    create: { businessId, name: 'Administrator', isSystem: true },
  });
  await db.rolePermission.deleteMany({ where: { roleId: adminRole.id } });
  await db.rolePermission.createMany({
    data: allPerms.map((p) => ({ roleId: adminRole.id, permissionId: p.id })),
    skipDuplicates: true,
  });
  const employeeRole = await db.role.upsert({
    where: { businessId_name: { businessId, name: 'Employee' } },
    update: {},
    create: { businessId, name: 'Employee', isSystem: true },
  });
  const empPerms = allPerms.filter((p) => ['booking.read', 'customer.manage'].includes(p.key));
  await db.rolePermission.deleteMany({ where: { roleId: employeeRole.id } });
  await db.rolePermission.createMany({
    data: empPerms.map((p) => ({ roleId: employeeRole.id, permissionId: p.id })),
    skipDuplicates: true,
  });

  // 4. Admin user with a real (hashed) password.
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const admin = await db.user.upsert({
    where: { businessId_email: { businessId, email: 'admin@aurora.example' } },
    update: { passwordHash },
    create: { businessId, email: 'admin@aurora.example', name: 'Avery Admin', passwordHash },
  });
  await db.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
    update: {},
    create: { userId: admin.id, roleId: adminRole.id },
  });

  // 5. Location + business hours (Mon-Fri 09:00-17:00).
  const location = await db.location.create({ data: { businessId, name: 'Downtown Studio', address: '1 Market St' } });
  for (let day = 1; day <= 5; day++) {
    await db.businessHours.create({
      data: { businessId, locationId: location.id, dayOfWeek: day, openTime: '09:00', closeTime: '17:00' },
    });
  }

  // 6. Category + services.
  const category = await db.serviceCategory.create({ data: { businessId, name: 'Consultations', sortOrder: 0 } });
  const haircut = await db.service.create({
    data: { businessId, categoryId: category.id, name: 'Signature Consultation', durationMinutes: 60, price: 120, bufferAfterMinutes: 10, color: '#4f46e5' },
  });
  const styling = await db.service.create({
    data: { businessId, categoryId: category.id, name: 'Express Session', durationMinutes: 30, price: 60, color: '#0ea5e9' },
  });

  // 7. Employees + services + working hours.
  const emmaUser = await db.user.upsert({
    where: { businessId_email: { businessId, email: 'emma@aurora.example' } },
    update: { passwordHash },
    create: { businessId, email: 'emma@aurora.example', name: 'Emma Rivera', passwordHash },
  });
  await db.userRole.upsert({
    where: { userId_roleId: { userId: emmaUser.id, roleId: employeeRole.id } },
    update: {},
    create: { userId: emmaUser.id, roleId: employeeRole.id },
  });
  const emma = await db.employee.create({
    data: { businessId, userId: emmaUser.id, firstName: 'Emma', lastName: 'Rivera', title: 'Senior Specialist', email: 'emma@aurora.example' },
  });
  const noah = await db.employee.create({
    data: { businessId, firstName: 'Noah', lastName: 'Chen', title: 'Specialist', email: 'noah@aurora.example' },
  });
  await db.employeeService.createMany({
    data: [
      { businessId, employeeId: emma.id, serviceId: haircut.id },
      { businessId, employeeId: emma.id, serviceId: styling.id },
      { businessId, employeeId: noah.id, serviceId: styling.id },
    ],
  });
  for (const emp of [emma, noah]) {
    for (let day = 1; day <= 5; day++) {
      const hours = await db.employeeWorkingHours.create({
        data: { businessId, employeeId: emp.id, locationId: location.id, dayOfWeek: day, startTime: '09:00', endTime: '17:00' },
      });
      await db.break.create({
        data: { businessId, employeeWorkingHoursId: hours.id, startTime: '12:00', endTime: '13:00', label: 'Lunch' },
      });
    }
  }

  // 8. Customers.
  const mia = await db.customer.create({
    data: { businessId, firstName: 'Mia', lastName: 'Thompson', email: 'mia@example.com', phone: '+1 555 0100' },
  });
  const liam = await db.customer.create({
    data: { businessId, firstName: 'Liam', lastName: 'Walsh', email: 'liam@example.com', phone: '+1 555 0101' },
  });

  // 9. Bookings via the transaction-safe primitive.
  const monday9 = nextWeekdayAt(1, 9);
  const monday11 = nextWeekdayAt(1, 11);
  const tuesday14 = nextWeekdayAt(2, 14);
  await createBooking({ businessId, customerId: mia.id, serviceId: haircut.id, employeeId: emma.id, locationId: location.id, startAt: monday9, endAt: new Date(monday9.getTime() + 60 * 60000), priceTotal: 120, status: 'PENDING', source: 'widget' }, db);
  await createBooking({ businessId, customerId: liam.id, serviceId: styling.id, employeeId: emma.id, locationId: location.id, startAt: monday11, endAt: new Date(monday11.getTime() + 30 * 60000), priceTotal: 60, status: 'ACCEPTED', source: 'admin' }, db);
  await createBooking({ businessId, customerId: mia.id, serviceId: styling.id, employeeId: noah.id, locationId: location.id, startAt: tuesday14, endAt: new Date(tuesday14.getTime() + 30 * 60000), priceTotal: 60, status: 'ACCEPTED', source: 'widget' }, db);

  const todayMorning = todayAt(10, 0);
  const todayMidday = todayAt(11, 30);
  const todayAfternoon = todayAt(14, 30);
  await createBooking({ businessId, customerId: mia.id, serviceId: haircut.id, employeeId: emma.id, locationId: location.id, startAt: todayMorning, endAt: new Date(todayMorning.getTime() + 60 * 60000), priceTotal: 120, status: 'ACCEPTED', source: 'admin' }, db);
  await createBooking({ businessId, customerId: liam.id, serviceId: styling.id, employeeId: noah.id, locationId: location.id, startAt: todayMidday, endAt: new Date(todayMidday.getTime() + 30 * 60000), priceTotal: 60, status: 'PENDING', source: 'widget' }, db);
  await createBooking({ businessId, customerId: liam.id, serviceId: styling.id, employeeId: emma.id, locationId: location.id, startAt: todayAfternoon, endAt: new Date(todayAfternoon.getTime() + 30 * 60000), priceTotal: 60, status: 'ACCEPTED', source: 'widget' }, db);

  const daysAgoAt = (days: number, hour: number) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - days);
    d.setUTCHours(hour, 0, 0, 0);
    return d;
  };
  const past = [
    { customerId: mia.id, serviceId: haircut.id, employeeId: emma.id, price: 120, duration: 60, at: daysAgoAt(30, 10) },
    { customerId: mia.id, serviceId: styling.id, employeeId: noah.id, price: 60, duration: 30, at: daysAgoAt(60, 13) },
    { customerId: liam.id, serviceId: styling.id, employeeId: emma.id, price: 60, duration: 30, at: daysAgoAt(20, 15) },
  ];
  for (const p of past) {
    await createBooking({ businessId, customerId: p.customerId, serviceId: p.serviceId, employeeId: p.employeeId, locationId: location.id, startAt: p.at, endAt: new Date(p.at.getTime() + p.duration * 60000), priceTotal: p.price, status: 'COMPLETED', source: 'widget' }, db);
  }
  await db.customerNote.create({
    data: { businessId, customerId: mia.id, authorUserId: admin.id, body: 'VIP - prefers Emma and morning appointments.' },
  });

  // 11. Form themes (5 presets) + default configuration.
  const themes: { id: string; key: string }[] = [];
  for (const t of FORM_THEMES) {
    const theme = await db.formTheme.create({
      data: { businessId, key: t.key, name: t.name, isPreset: true, tokens: { primary: '#4f46e5', radius: '0.625rem', font: 'system' } },
    });
    themes.push({ id: theme.id, key: t.key });
  }
  await db.formConfiguration.create({
    data: { businessId, name: 'Default Booking Form', themeId: themes[0]?.id, isDefault: true, steps: ['service', 'employee', 'datetime', 'details', 'confirm'] },
  });

  const [services, employees, bookings, customers] = await Promise.all([
    db.service.count({ where: { businessId } }),
    db.employee.count({ where: { businessId } }),
    db.booking.count({ where: { businessId } }),
    db.customer.count({ where: { businessId } }),
  ]);

  return { seeded: true, business: business.name, services, employees, customers, bookings };
}
