export { prisma } from './client';
export * from './repositories/index';
export { createBooking, type CreateBookingInput } from './booking/create-booking';
export type {
  Prisma,
  Business,
  Booking,
  Customer,
  Service,
  Employee,
  BookingStatus,
  PaymentStatus,
} from '@prisma/client';
