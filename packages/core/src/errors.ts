/** Domain error taxonomy (framework-free). */

export class DomainError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

/** Raised when a booking cannot be placed because the slot is already taken. */
export class BookingConflictError extends DomainError {
  constructor(message = 'The requested time slot is no longer available.') {
    super('BOOKING_CONFLICT', message);
  }
}

/** Raised when an event registration cannot be placed because it is sold out. */
export class EventCapacityError extends DomainError {
  constructor(message = 'This event does not have enough remaining seats.') {
    super('EVENT_CAPACITY', message);
  }
}

/** Raised when an entity is accessed outside its owning business (tenant leak guard). */
export class TenantIsolationError extends DomainError {
  constructor(message = 'Cross-business data access is not permitted.') {
    super('TENANT_ISOLATION', message);
  }
}

/** Raised when a domain invariant (e.g. invalid interval) is violated. */
export class ValidationError extends DomainError {
  constructor(message: string) {
    super('VALIDATION', message);
  }
}
