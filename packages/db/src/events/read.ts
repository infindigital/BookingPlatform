import type { PrismaClient } from '@prisma/client';
import {
  occupiedSeats,
  seatsRemaining,
  occupiesSeat,
  type EventStatus,
  type EventRegistrationStatus,
} from '@booking/core';
import { prisma } from '../client';
import { EventRepository } from './event.repository';

export interface EventListRow {
  id: string;
  title: string;
  description: string | null;
  startISO: string;
  endISO: string;
  status: EventStatus;
  capacity: number;
  price: number;
  currency: string;
  registeredSeats: number;
  remaining: number;
  attendeeCount: number;
  locationId: string | null;
  employeeId: string | null;
  locationName: string | null;
  hostName: string | null;
}

export interface EventRegistrationRow {
  id: string;
  customerName: string;
  email: string;
  seats: number;
  status: EventRegistrationStatus;
  note: string | null;
  createdISO: string;
}

export interface EventDetail extends EventListRow {
  registrations: EventRegistrationRow[];
}

type RegSummary = { seats: number; status: EventRegistrationStatus };

function seatFigures(capacity: number, regs: RegSummary[]) {
  const registeredSeats = occupiedSeats(regs);
  return {
    registeredSeats,
    remaining: seatsRemaining(capacity, registeredSeats),
    attendeeCount: regs.filter((r) => occupiesSeat(r.status)).length,
  };
}

export async function getEventsList(
  businessId: string,
  filters: { status?: EventStatus; includeCancelled?: boolean } = {},
  db: PrismaClient = prisma,
): Promise<EventListRow[]> {
  const repo = new EventRepository(businessId, db);
  const events = await repo.list(filters);
  return events.map((e) => {
    const figures = seatFigures(e.capacity, e.registrations);
    return {
      id: e.id,
      title: e.title,
      description: e.description,
      startISO: e.startAt.toISOString(),
      endISO: e.endAt.toISOString(),
      status: e.status,
      capacity: e.capacity,
      price: Number(e.price.toString()),
      currency: e.currency,
      locationId: e.locationId,
      employeeId: e.employeeId,
      locationName: e.location?.name ?? null,
      hostName: e.employee ? `${e.employee.firstName} ${e.employee.lastName}`.trim() : null,
      ...figures,
    };
  });
}

export async function getEventDetail(
  businessId: string,
  eventId: string,
  db: PrismaClient = prisma,
): Promise<EventDetail | null> {
  const repo = new EventRepository(businessId, db);
  const e = await repo.getById(eventId);
  if (!e) return null;
  const figures = seatFigures(
    e.capacity,
    e.registrations.map((r) => ({ seats: r.seats, status: r.status })),
  );
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    startISO: e.startAt.toISOString(),
    endISO: e.endAt.toISOString(),
    status: e.status,
    capacity: e.capacity,
    price: Number(e.price.toString()),
    currency: e.currency,
    locationId: e.locationId,
    employeeId: e.employeeId,
    locationName: e.location?.name ?? null,
    hostName: e.employee ? `${e.employee.firstName} ${e.employee.lastName}`.trim() : null,
    ...figures,
    registrations: e.registrations.map((r) => ({
      id: r.id,
      customerName: `${r.customer.firstName} ${r.customer.lastName}`.trim(),
      email: r.customer.email,
      seats: r.seats,
      status: r.status,
      note: r.note,
      createdISO: r.createdAt.toISOString(),
    })),
  };
}
