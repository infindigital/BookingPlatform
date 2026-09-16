/**
 * Pure RBAC permission checks (framework-free, no I/O). Permission keys mirror
 * the seeded catalog, e.g. "booking.approve", "service.manage".
 */
export function hasPermission(
  permissions: readonly string[] | undefined | null,
  required: string,
): boolean {
  return !!permissions && permissions.includes(required);
}

export function hasAnyPermission(
  permissions: readonly string[] | undefined | null,
  required: readonly string[],
): boolean {
  return !!permissions && required.some((r) => permissions.includes(r));
}

export function hasAllPermissions(
  permissions: readonly string[] | undefined | null,
  required: readonly string[],
): boolean {
  return !!permissions && required.every((r) => permissions.includes(r));
}
