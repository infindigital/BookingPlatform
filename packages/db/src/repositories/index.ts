import type { PrismaClient } from '@prisma/client';
import { prisma } from '../client';
import { ServiceRepository } from './service.repository';
import { CustomerRepository } from './customer.repository';
import { BookingRepository } from './booking.repository';
import { BusinessRepository } from './business.repository';

export { BaseRepository } from './base';
export { ServiceRepository } from './service.repository';
export { CustomerRepository } from './customer.repository';
export { BookingRepository } from './booking.repository';
export { BusinessRepository } from './business.repository';

/**
 * Build the set of business-scoped repositories for a resolved tenant.
 * This is the single entry point domain/API code uses to touch the database,
 * guaranteeing every query is scoped by businessId.
 */
export function repositoriesFor(businessId: string, db: PrismaClient = prisma) {
  return {
    services: new ServiceRepository(businessId, db),
    customers: new CustomerRepository(businessId, db),
    bookings: new BookingRepository(businessId, db),
  };
}

export type BusinessRepositories = ReturnType<typeof repositoriesFor>;

export const businessRepository = new BusinessRepository();
