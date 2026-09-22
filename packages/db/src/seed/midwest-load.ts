import type { PrismaClient } from '@prisma/client';
import { PERMISSION_KEYS } from '@booking/core';
import { hashPassword } from '../auth/password';

/**
 * Idempotent production loader for a real business (Midwest Identity Services).
 *
 * Unlike the demo seed, this NEVER creates customers or bookings and never
 * invents data: it upserts exactly the tenant, catalogue, hours, and staff you
 * supply in a data file. Safe to re-run - every write is keyed by a stable
 * identifier (business slug, website public key, names within the business), so
 * running it twice updates in place rather than duplicating.
 *
 * The permission catalogue and the two system roles (Administrator, Employee)
 * are provisioned so the Access admin (Phase E) works immediately.
 */

export type LocationMode = 'IN_PERSON' | 'MOBILE' | 'VIRTUAL';

export interface MidwestBusinessData {
  name: string;
  slug: string;
  timezone?: string;
  currency?: string;
  email?: string | null;
  phone?: string | null;
}

export interface MidwestWebsiteData {
  name: string;
  publicKey: string;
  domain?: string | null;
}

export interface MidwestLocationData {
  name: string;
  address?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
  instructions?: string | null;
  mode?: LocationMode;
  timezone?: string | null;
}

export interface MidwestHoursData {
  /** 0 = Sunday .. 6 = Saturday. */
  dayOfWeek: number;
  /** "HH:mm" - required unless isClosed. */
  openTime?: string;
  closeTime?: string;
  isClosed?: boolean;
}

export interface MidwestServiceData {
  name: string;
  description?: string | null;
  durationMinutes: number;
  price?: number;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
  capacity?: number;
  minAdvanceMinutes?: number;
  maxAdvanceDays?: number | null;
  color?: string | null;
  isActive?: boolean;
}

export interface MidwestCategoryData {
  name: string;
  description?: string | null;
  services: MidwestServiceData[];
}

export interface MidwestBreakData {
  startTime: string;
  endTime: string;
  label?: string | null;
}

export interface MidwestEmployeeWorkingHoursData {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  breaks?: MidwestBreakData[];
}

export interface MidwestEmployeeData {
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
  /** Service names (from `categories`) this employee provides. */
  services?: string[];
  workingHours?: MidwestEmployeeWorkingHoursData[];
}

export interface MidwestAdminData {
  email: string;
  name: string;
  /** Optional initial password. When omitted, the admin signs in via magic link. */
  password?: string;
}

export interface MidwestData {
  business: MidwestBusinessData;
  website: MidwestWebsiteData;
  location: MidwestLocationData;
  businessHours: MidwestHoursData[];
  categories: MidwestCategoryData[];
  admin: MidwestAdminData;
  employees?: MidwestEmployeeData[];
}

export interface MidwestLoadSummary {
  business: string;
  location: string;
  categories: number;
  services: number;
  employees: number;
  adminEmail: string;
}

/** Permissions granted to the non-admin Employee system role. */
const EMPLOYEE_ROLE_PERMISSIONS = ['booking.read', 'booking.write', 'customer.manage'];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Midwest load: ${message}`);
}

export async function loadMidwest(db: PrismaClient, data: MidwestData): Promise<MidwestLoadSummary> {
  assert(data?.business?.slug, 'business.slug is required');
  assert(data.business.name, 'business.name is required');
  assert(data.website?.publicKey, 'website.publicKey is required');
  assert(data.location?.name, 'location.name is required');
  assert(data.admin?.email, 'admin.email is required');
  assert(Array.isArray(data.categories), 'categories must be an array');

  // 1. Tenant root.
  const business = await db.business.upsert({
    where: { slug: data.business.slug },
    update: {
      name: data.business.name,
      timezone: data.business.timezone ?? undefined,
      currency: data.business.currency ?? undefined,
      email: data.business.email ?? null,
      phone: data.business.phone ?? null,
    },
    create: {
      slug: data.business.slug,
      name: data.business.name,
      timezone: data.business.timezone ?? 'UTC',
      currency: data.business.currency ?? 'USD',
      email: data.business.email ?? null,
      phone: data.business.phone ?? null,
    },
  });
  const businessId = business.id;

  // 2. Public website (widget entry point).
  await db.website.upsert({
    where: { publicKey: data.website.publicKey },
    update: { businessId, name: data.website.name, domain: data.website.domain ?? null },
    create: {
      businessId,
      name: data.website.name,
      publicKey: data.website.publicKey,
      domain: data.website.domain ?? null,
    },
  });

  // 3. Permission catalogue + system roles.
  for (const key of PERMISSION_KEYS) {
    await db.permission.upsert({ where: { key }, update: {}, create: { key } });
  }
  const allPerms = await db.permission.findMany();
  const adminRole = await db.role.upsert({
    where: { businessId_name: { businessId, name: 'Administrator' } },
    update: { isSystem: true },
    create: { businessId, name: 'Administrator', isSystem: true },
  });
  await db.rolePermission.deleteMany({ where: { roleId: adminRole.id } });
  await db.rolePermission.createMany({
    data: allPerms.map((p) => ({ roleId: adminRole.id, permissionId: p.id })),
    skipDuplicates: true,
  });
  const employeeRole = await db.role.upsert({
    where: { businessId_name: { businessId, name: 'Employee' } },
    update: { isSystem: true },
    create: { businessId, name: 'Employee', isSystem: true },
  });
  const employeePerms = allPerms.filter((p) => EMPLOYEE_ROLE_PERMISSIONS.includes(p.key));
  await db.rolePermission.deleteMany({ where: { roleId: employeeRole.id } });
  await db.rolePermission.createMany({
    data: employeePerms.map((p) => ({ roleId: employeeRole.id, permissionId: p.id })),
    skipDuplicates: true,
  });

  // 4. Admin user mapped to the Administrator role.
  const passwordHash = data.admin.password ? await hashPassword(data.admin.password) : undefined;
  const admin = await db.user.upsert({
    where: { businessId_email: { businessId, email: data.admin.email } },
    update: { name: data.admin.name, ...(passwordHash ? { passwordHash } : {}) },
    create: { businessId, email: data.admin.email, name: data.admin.name, passwordHash: passwordHash ?? null },
  });
  await db.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
    update: {},
    create: { userId: admin.id, roleId: adminRole.id },
  });

  // 5. Primary location (find-or-create by name within the business).
  const loc = data.location;
  const existingLocation = await db.location.findFirst({ where: { businessId, name: loc.name }, select: { id: true } });
  const locationValues = {
    address: loc.address ?? null,
    addressLine2: loc.addressLine2 ?? null,
    city: loc.city ?? null,
    state: loc.state ?? null,
    postalCode: loc.postalCode ?? null,
    country: loc.country ?? null,
    phone: loc.phone ?? null,
    email: loc.email ?? null,
    instructions: loc.instructions ?? null,
    mode: loc.mode ?? 'IN_PERSON',
    timezone: loc.timezone ?? null,
    isDefault: true,
    isActive: true,
  };
  const location = existingLocation
    ? await db.location.update({ where: { id: existingLocation.id }, data: locationValues })
    : await db.location.create({ data: { businessId, name: loc.name, ...locationValues } });

  // 6. Weekly business hours (replace, so re-runs stay in sync).
  await db.businessHours.deleteMany({ where: { businessId } });
  if (data.businessHours.length > 0) {
    await db.businessHours.createMany({
      data: data.businessHours.map((h) => ({
        businessId,
        locationId: location.id,
        dayOfWeek: h.dayOfWeek,
        openTime: h.openTime ?? '00:00',
        closeTime: h.closeTime ?? '00:00',
        isClosed: h.isClosed ?? false,
      })),
    });
  }

  // 7. Service categories + services (find-or-create by name).
  const serviceIdByName = new Map<string, string>();
  let serviceCount = 0;
  for (const [index, cat] of data.categories.entries()) {
    assert(cat.name, 'every category needs a name');
    const existingCat = await db.serviceCategory.findFirst({ where: { businessId, name: cat.name }, select: { id: true } });
    const category = existingCat
      ? await db.serviceCategory.update({
          where: { id: existingCat.id },
          data: { description: cat.description ?? null, sortOrder: index },
        })
      : await db.serviceCategory.create({
          data: { businessId, name: cat.name, description: cat.description ?? null, sortOrder: index },
        });

    for (const svc of cat.services ?? []) {
      assert(svc.name, `every service in "${cat.name}" needs a name`);
      assert(
        typeof svc.durationMinutes === 'number' && svc.durationMinutes > 0,
        `service "${svc.name}" needs a positive durationMinutes`,
      );
      const serviceValues = {
        categoryId: category.id,
        description: svc.description ?? null,
        durationMinutes: svc.durationMinutes,
        price: svc.price ?? 0,
        bufferBeforeMinutes: svc.bufferBeforeMinutes ?? 0,
        bufferAfterMinutes: svc.bufferAfterMinutes ?? 0,
        capacity: svc.capacity ?? 1,
        minAdvanceMinutes: svc.minAdvanceMinutes ?? 0,
        maxAdvanceDays: svc.maxAdvanceDays ?? null,
        color: svc.color ?? null,
        isActive: svc.isActive ?? true,
      };
      const existingSvc = await db.service.findFirst({ where: { businessId, name: svc.name }, select: { id: true } });
      const service = existingSvc
        ? await db.service.update({ where: { id: existingSvc.id }, data: serviceValues })
        : await db.service.create({ data: { businessId, name: svc.name, ...serviceValues } });
      serviceIdByName.set(svc.name, service.id);
      serviceCount += 1;
    }
  }

  // 8. Employees (optional). Find-or-create by email, else by full name.
  let employeeCount = 0;
  for (const emp of data.employees ?? []) {
    assert(emp.firstName && emp.lastName, 'every employee needs firstName and lastName');
    const existingEmp = emp.email
      ? await db.employee.findFirst({ where: { businessId, email: emp.email }, select: { id: true } })
      : await db.employee.findFirst({
          where: { businessId, firstName: emp.firstName, lastName: emp.lastName },
          select: { id: true },
        });
    const employeeValues = {
      firstName: emp.firstName,
      lastName: emp.lastName,
      email: emp.email ?? null,
      phone: emp.phone ?? null,
      title: emp.title ?? null,
    };
    const employee = existingEmp
      ? await db.employee.update({ where: { id: existingEmp.id }, data: employeeValues })
      : await db.employee.create({ data: { businessId, ...employeeValues } });
    employeeCount += 1;

    // Service assignments (replace).
    await db.employeeService.deleteMany({ where: { businessId, employeeId: employee.id } });
    const serviceIds = (emp.services ?? [])
      .map((name) => serviceIdByName.get(name))
      .filter((id): id is string => Boolean(id));
    if (serviceIds.length > 0) {
      await db.employeeService.createMany({
        data: serviceIds.map((serviceId) => ({ businessId, employeeId: employee.id, serviceId })),
        skipDuplicates: true,
      });
    }

    // Working hours + breaks (replace).
    await db.employeeWorkingHours.deleteMany({ where: { businessId, employeeId: employee.id } });
    for (const wh of emp.workingHours ?? []) {
      const hours = await db.employeeWorkingHours.create({
        data: {
          businessId,
          employeeId: employee.id,
          locationId: location.id,
          dayOfWeek: wh.dayOfWeek,
          startTime: wh.startTime,
          endTime: wh.endTime,
        },
      });
      for (const br of wh.breaks ?? []) {
        await db.break.create({
          data: {
            businessId,
            employeeWorkingHoursId: hours.id,
            startTime: br.startTime,
            endTime: br.endTime,
            label: br.label ?? null,
          },
        });
      }
    }
  }

  return {
    business: business.name,
    location: location.name,
    categories: data.categories.length,
    services: serviceCount,
    employees: employeeCount,
    adminEmail: data.admin.email,
  };
}
