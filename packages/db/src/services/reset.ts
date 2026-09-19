import type { PrismaClient } from '@prisma/client';
import { prisma } from '../client';

/**
 * Clean-slate reset for a single business. Wipes all operational data - services,
 * categories, employees (and their schedules), customers, bookings, and the
 * notification history - so the owner can rebuild their catalog from scratch.
 *
 * Deliberately KEPT: the business itself, its locations and business hours, its
 * form design (theme + configuration), and the login accounts that hold the
 * Administrator role. `keepUserId` is the acting admin and is never removed,
 * even if their roles were somehow misconfigured.
 *
 * Runs in a single transaction and deletes in FK-safe order (bookings before the
 * services they reference, since Booking.serviceId uses onDelete: Restrict).
 */

export interface ResetSummary {
  bookings: number;
  customers: number;
  employees: number;
  services: number;
  categories: number;
  notifications: number;
  removedLogins: number;
}

export async function resetBusinessData(
  businessId: string,
  keepUserId: string,
  db: PrismaClient = prisma,
): Promise<ResetSummary> {
  if (!businessId) throw new Error('resetBusinessData requires a businessId.');

  return db.$transaction(async (tx) => {
    const [bookings, customers, employees, services, categories, notifications] = await Promise.all([
      tx.booking.count({ where: { businessId } }),
      tx.customer.count({ where: { businessId } }),
      tx.employee.count({ where: { businessId } }),
      tx.service.count({ where: { businessId } }),
      tx.serviceCategory.count({ where: { businessId } }),
      tx.notificationLog.count({ where: { businessId } }),
    ]);

    // 1. Notification history first (jobs may point at bookings via SetNull).
    await tx.notificationLog.deleteMany({ where: { businessId } });
    await tx.notificationJob.deleteMany({ where: { businessId } });

    // 2. Bookings and their dependents (items, payments, custom-field values
    //    cascade from the booking row).
    await tx.booking.deleteMany({ where: { businessId } });

    // 3. Customers (notes and event registrations cascade).
    await tx.customerNote.deleteMany({ where: { businessId } });
    await tx.customer.deleteMany({ where: { businessId } });

    // 4. Employees (working hours, breaks, time off, blocked time cascade).
    await tx.employeeService.deleteMany({ where: { businessId } });
    await tx.employee.deleteMany({ where: { businessId } });

    // 5. Services and categories (safe now that no bookings reference them).
    await tx.serviceExtra.deleteMany({ where: { businessId } });
    await tx.service.deleteMany({ where: { businessId } });
    await tx.serviceCategory.deleteMany({ where: { businessId } });

    // 6. Remove staff login accounts, keeping every administrator and the
    //    acting user no matter what.
    const adminRole = await tx.role.findFirst({
      where: { businessId, name: 'Administrator' },
      select: { id: true },
    });
    const users = await tx.user.findMany({
      where: { businessId },
      select: { id: true, roles: { select: { roleId: true } } },
    });
    const removableUserIds = users
      .filter(
        (u) =>
          u.id !== keepUserId &&
          !(adminRole && u.roles.some((r) => r.roleId === adminRole.id)),
      )
      .map((u) => u.id);
    if (removableUserIds.length) {
      await tx.userRole.deleteMany({ where: { userId: { in: removableUserIds } } });
      await tx.user.deleteMany({ where: { id: { in: removableUserIds } } });
    }

    return {
      bookings,
      customers,
      employees,
      services,
      categories,
      notifications,
      removedLogins: removableUserIds.length,
    };
  });
}
