/**
 * Demo seed — a single demo business with isolated, realistic data.
 * Idempotent: re-running rebuilds the demo business's data cleanly.
 * Cost policy: runs against the free/local Postgres dev database.
 */
import { PrismaClient, type NotificationEvent } from '@prisma/client';
import { createBooking } from '../src/booking/create-booking';

const prisma = new PrismaClient();

const DEMO_SLUG = 'demo-business';
const PUBLIC_KEY = 'pk_demo_booking_123';

const PERMISSIONS = [
  'booking.read',
  'booking.write',
  'booking.approve',
  'service.manage',
  'employee.manage',
  'customer.manage',
  'settings.manage',
  'analytics.read',
];

const FORM_THEMES = [
  { key: 'minimal', name: 'Minimal' },
  { key: 'luxury', name: 'Luxury' },
  { key: 'modern', name: 'Modern' },
  { key: 'medical', name: 'Medical' },
  { key: 'editorial', name: 'Editorial' },
];

const NOTIFICATION_EVENTS: NotificationEvent[] = [
  'BOOKING_CREATED',
  'BOOKING_ACCEPTED',
  'BOOKING_REJECTED',
  'BOOKING_CANCELLED',
  'BOOKING_RESCHEDULED',
  'BOOKING_COMPLETED',
  'BOOKING_REMINDER',
];

/** Next occurrence of the given weekday at hour:00 UTC, from today. */
function nextWeekdayAt(weekday: number, hour: number): Date {
  const d = new Date();
  d.setUTCHours(hour, 0, 0, 0);
  const delta = (weekday - d.getUTCDay() + 7) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + delta);
  return d;
}

async function main() {
  // 1. Tenant root (idempotent by slug).
  const business = await prisma.business.upsert({
    where: { slug: DEMO_SLUG },
    update: {},
    create: {
      slug: DEMO_SLUG,
      name: 'Aurora Studio',
      timezone: 'UTC',
      currency: 'USD',
      email: 'hello@aurora.example',
    },
  });
  const businessId = business.id;

  // Clean this business's dependent data for a deterministic reseed.
  await prisma.booking.deleteMany({ where: { businessId } });
  await prisma.customer.deleteMany({ where: { businessId } });
  await prisma.employeeService.deleteMany({ where: { businessId } });
  await prisma.service.deleteMany({ where: { businessId } });
  await prisma.serviceCategory.deleteMany({ where: { businessId } });
  await prisma.employeeWorkingHours.deleteMany({ where: { businessId } });
  await prisma.employee.deleteMany({ where: { businessId } });
  await prisma.businessHours.deleteMany({ where: { businessId } });
  await prisma.notificationTemplate.deleteMany({ where: { businessId } });
  await prisma.formConfiguration.deleteMany({ where: { businessId } });
  await prisma.formTheme.deleteMany({ where: { businessId } });

  // 2. Website (widget entry point).
  await prisma.website.upsert({
    where: { publicKey: PUBLIC_KEY },
    update: { businessId },
    create: { businessId, name: 'Aurora Website', domain: 'aurora.example', publicKey: PUBLIC_KEY },
  });

  // 3. Permissions (global) + roles.
  for (const key of PERMISSIONS) {
    await prisma.permission.upsert({ where: { key }, update: {}, create: { key } });
  }
  const allPerms = await prisma.permission.findMany();
  const adminRole = await prisma.role.upsert({
    where: { businessId_name: { businessId, name: 'Administrator' } },
    update: {},
    create: { businessId, name: 'Administrator', isSystem: true },
  });
  await prisma.rolePermission.deleteMany({ where: { roleId: adminRole.id } });
  await prisma.rolePermission.createMany({
    data: allPerms.map((p) => ({ roleId: adminRole.id, permissionId: p.id })),
    skipDuplicates: true,
  });
  const employeeRole = await prisma.role.upsert({
    where: { businessId_name: { businessId, name: 'Employee' } },
    update: {},
    create: { businessId, name: 'Employee', isSystem: true },
  });
  const empPerms = allPerms.filter((p) => ['booking.read', 'customer.manage'].includes(p.key));
  await prisma.rolePermission.deleteMany({ where: { roleId: employeeRole.id } });
  await prisma.rolePermission.createMany({
    data: empPerms.map((p) => ({ roleId: employeeRole.id, permissionId: p.id })),
    skipDuplicates: true,
  });

  // 4. Admin user (passwordless placeholder — real auth in Phase 3).
  const admin = await prisma.user.upsert({
    where: { businessId_email: { businessId, email: 'admin@aurora.example' } },
    update: {},
    create: { businessId, email: 'admin@aurora.example', name: 'Avery Admin' },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
    update: {},
    create: { userId: admin.id, roleId: adminRole.id },
  });

  // 5. Location + business hours (Mon–Fri 09:00–17:00).
  const location = await prisma.location.create({
    data: { businessId, name: 'Downtown Studio', address: '1 Market St' },
  });
  for (let day = 1; day <= 5; day++) {
    await prisma.businessHours.create({
      data: { businessId, locationId: location.id, dayOfWeek: day, openTime: '09:00', closeTime: '17:00' },
    });
  }

  // 6. Category + services.
  const category = await prisma.serviceCategory.create({
    data: { businessId, name: 'Consultations', sortOrder: 0 },
  });
  const haircut = await prisma.service.create({
    data: { businessId, categoryId: category.id, name: 'Signature Consultation', durationMinutes: 60, price: 120, bufferAfterMinutes: 10, color: '#4f46e5' },
  });
  const styling = await prisma.service.create({
    data: { businessId, categoryId: category.id, name: 'Express Session', durationMinutes: 30, price: 60, color: '#0ea5e9' },
  });

  // 7. Employees + services + working hours.
  const emma = await prisma.employee.create({
    data: { businessId, firstName: 'Emma', lastName: 'Rivera', title: 'Senior Specialist', email: 'emma@aurora.example' },
  });
  const noah = await prisma.employee.create({
    data: { businessId, firstName: 'Noah', lastName: 'Chen', title: 'Specialist', email: 'noah@aurora.example' },
  });
  await prisma.employeeService.createMany({
    data: [
      { businessId, employeeId: emma.id, serviceId: haircut.id },
      { businessId, employeeId: emma.id, serviceId: styling.id },
      { businessId, employeeId: noah.id, serviceId: styling.id },
    ],
  });
  for (const emp of [emma, noah]) {
    for (let day = 1; day <= 5; day++) {
      await prisma.employeeWorkingHours.create({
        data: { businessId, employeeId: emp.id, locationId: location.id, dayOfWeek: day, startTime: '09:00', endTime: '17:00' },
      });
    }
  }

  // 8. Customers.
  const mia = await prisma.customer.create({
    data: { businessId, firstName: 'Mia', lastName: 'Thompson', email: 'mia@example.com', phone: '+1 555 0100' },
  });
  const liam = await prisma.customer.create({
    data: { businessId, firstName: 'Liam', lastName: 'Walsh', email: 'liam@example.com', phone: '+1 555 0101' },
  });

  // 9. Bookings via the transaction-safe primitive (realistic, non-conflicting).
  const monday9 = nextWeekdayAt(1, 9);
  const monday11 = nextWeekdayAt(1, 11);
  const tuesday14 = nextWeekdayAt(2, 14);

  await createBooking(
    {
      businessId, customerId: mia.id, serviceId: haircut.id, employeeId: emma.id, locationId: location.id,
      startAt: monday9, endAt: new Date(monday9.getTime() + 60 * 60000),
      priceTotal: 120, status: 'PENDING', source: 'widget',
    },
    prisma,
  );
  await createBooking(
    {
      businessId, customerId: liam.id, serviceId: styling.id, employeeId: emma.id, locationId: location.id,
      startAt: monday11, endAt: new Date(monday11.getTime() + 30 * 60000),
      priceTotal: 60, status: 'ACCEPTED', source: 'admin',
    },
    prisma,
  );
  await createBooking(
    {
      businessId, customerId: mia.id, serviceId: styling.id, employeeId: noah.id, locationId: location.id,
      startAt: tuesday14, endAt: new Date(tuesday14.getTime() + 30 * 60000),
      priceTotal: 60, status: 'ACCEPTED', source: 'widget',
    },
    prisma,
  );

  // 10. Notification templates (email) for each booking event.
  for (const event of NOTIFICATION_EVENTS) {
    await prisma.notificationTemplate.create({
      data: {
        businessId, event, channel: 'EMAIL',
        subject: `${event.replace(/_/g, ' ').toLowerCase()} — {{business.name}}`,
        body: `Hi {{customer.firstName}}, your booking for {{service.name}} on {{booking.startAt}} is now ${event.replace('BOOKING_', '').toLowerCase()}.`,
      },
    });
  }

  // 11. Form themes (5 presets) + default configuration.
  const themes = [] as { id: string; key: string }[];
  for (const t of FORM_THEMES) {
    const theme = await prisma.formTheme.create({
      data: {
        businessId, key: t.key, name: t.name, isPreset: true,
        tokens: { primary: '#4f46e5', radius: '0.625rem', font: 'system' },
      },
    });
    themes.push({ id: theme.id, key: t.key });
  }
  await prisma.formConfiguration.create({
    data: {
      businessId, name: 'Default Booking Form', themeId: themes[0]?.id, isDefault: true,
      steps: ['service', 'employee', 'datetime', 'details', 'confirm'],
    },
  });

  const [services, employees, bookings, customers] = await Promise.all([
    prisma.service.count({ where: { businessId } }),
    prisma.employee.count({ where: { businessId } }),
    prisma.booking.count({ where: { businessId } }),
    prisma.customer.count({ where: { businessId } }),
  ]);

  // eslint-disable-next-line no-console
  console.log('Seed complete:', { business: business.name, services, employees, customers, bookings });
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
