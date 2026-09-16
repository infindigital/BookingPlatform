import type { PrismaClient } from '@prisma/client';
import { prisma } from '../client';

export interface FormService {
  id: string;
  name: string;
  durationMinutes: number;
  price: number;
  color: string | null;
}
export interface FormEmployee {
  id: string;
  name: string;
  /** Service ids this employee can perform (empty ⇒ treat as any). */
  serviceIds: string[];
}
export interface FormLocation {
  id: string;
  name: string;
}
export interface FormCustomer {
  id: string;
  name: string;
  email: string;
}

export interface BookingFormData {
  services: FormService[];
  employees: FormEmployee[];
  locations: FormLocation[];
  customers: FormCustomer[];
  currency: string;
}

/** Reference data for the admin "new booking" form. Tenant-scoped. */
export async function getBookingFormData(
  businessId: string,
  db: PrismaClient = prisma,
): Promise<BookingFormData> {
  if (!businessId) throw new Error('getBookingFormData requires a businessId.');

  const [business, services, employees, locations, customers] = await Promise.all([
    db.business.findUnique({ where: { id: businessId }, select: { currency: true } }),
    db.service.findMany({
      where: { businessId, isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, durationMinutes: true, price: true, color: true },
    }),
    db.employee.findMany({
      where: { businessId, isActive: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      select: { id: true, firstName: true, lastName: true, services: { select: { serviceId: true } } },
    }),
    db.location.findMany({ where: { businessId }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    db.customer.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, firstName: true, lastName: true, email: true },
    }),
  ]);

  return {
    currency: business?.currency ?? 'USD',
    services: services.map((s) => ({
      id: s.id,
      name: s.name,
      durationMinutes: s.durationMinutes,
      price: Number(s.price.toString()),
      color: s.color,
    })),
    employees: employees.map((e) => ({
      id: e.id,
      name: `${e.firstName} ${e.lastName}`.trim(),
      serviceIds: e.services.map((x) => x.serviceId),
    })),
    locations,
    customers: customers.map((c) => ({
      id: c.id,
      name: `${c.firstName} ${c.lastName}`.trim(),
      email: c.email,
    })),
  };
}
