/**
 * Short, human-friendly booking reference derived from the booking id.
 * Display + lookup only (not a secret): the last 8 chars of the cuid, uppercased.
 * Shared by the confirmation, the public read model and the self-service panel so
 * the same code the customer sees is the one we match on.
 */
export function referenceFor(id: string): string {
  return id.slice(-8).toUpperCase();
}
