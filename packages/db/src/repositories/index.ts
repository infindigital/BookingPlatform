import type { PrismaClient } from '@prisma/client';
import { prisma } from '../client';
import { ServiceRepository } from './service.repository';
import { CustomerRepository } from './customer.repository';
import { BookingRepository } from './booking.repository';
import { BusinessRepository } from './business.repository';
import { EmployeeRepository } from './employee.repository';
import { WebhookRepository } from '../integrations/webhook.repository';
import { PaymentRepository } from '../payments/payment.repository';
import { SettingsRepository } from '../settings/settings.repository';

export { BaseRepository } from './base';
export { ServiceRepository } from './service.repository';
export { CustomerRepository } from './customer.repository';
export { BookingRepository } from './booking.repository';
export { BusinessRepository } from './business.repository';
export {
  EmployeeRepository,
  type EmployeeProfileInput,
  type ServiceAssignmentInput,
  type WorkingWindowInput,
} from './employee.repository';
export { WebhookRepository, type WebhookInput } from '../integrations/webhook.repository';

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
    employees: new EmployeeRepository(businessId, db),
    webhooks: new WebhookRepository(businessId, db),
    payments: new PaymentRepository(businessId, db),
    settings: new SettingsRepository(businessId, db),
  };
}

export type BusinessRepositories = ReturnType<typeof repositoriesFor>;

export const businessRepository = new BusinessRepository();
