/**
 * Human-readable catalogue of the RBAC permission keys. This is the single
 * source of truth for which permissions exist, how they group in the admin
 * UI, and what each one grants. Framework-free and I/O-free so it can be
 * shared by the seed, the database layer, and the web UI.
 */
export interface PermissionDef {
  /** Stable key stored in the Permission table, e.g. "booking.approve". */
  key: string;
  /** Short label shown in the roles editor. */
  label: string;
  /** One-line explanation of what the permission grants. */
  description: string;
  /** Display grouping in the permission picker. */
  group: string;
}

export const PERMISSION_CATALOG: readonly PermissionDef[] = [
  {
    key: 'booking.read',
    group: 'Bookings',
    label: 'View bookings',
    description: 'See appointments, customers, and schedule details.',
  },
  {
    key: 'booking.write',
    group: 'Bookings',
    label: 'Manage bookings',
    description: 'Create, reschedule, and cancel appointments.',
  },
  {
    key: 'booking.approve',
    group: 'Bookings',
    label: 'Approve bookings',
    description: 'Confirm or reject appointments that need review.',
  },
  {
    key: 'service.manage',
    group: 'Catalog',
    label: 'Manage services',
    description: 'Edit services, categories, pricing, and booking rules.',
  },
  {
    key: 'event.manage',
    group: 'Catalog',
    label: 'Manage events',
    description: 'Create and manage events and their registrations.',
  },
  {
    key: 'employee.manage',
    group: 'Team',
    label: 'Manage employees',
    description: 'Edit staff profiles, working hours, and assignments.',
  },
  {
    key: 'customer.manage',
    group: 'Team',
    label: 'Manage customers',
    description: 'View and edit customer records and notes.',
  },
  {
    key: 'payment.manage',
    group: 'Finance',
    label: 'Manage payments',
    description: 'Configure payment providers and view transactions.',
  },
  {
    key: 'analytics.read',
    group: 'Insights',
    label: 'View analytics',
    description: 'Access dashboards and performance reports.',
  },
  {
    key: 'settings.manage',
    group: 'Configuration',
    label: 'Manage settings',
    description: 'Business profile, notifications, integrations, roles, and access.',
  },
];

/** Ordered list of every known permission key. */
export const PERMISSION_KEYS: readonly string[] = PERMISSION_CATALOG.map((p) => p.key);

const CATALOG_BY_KEY = new Map(PERMISSION_CATALOG.map((p) => [p.key, p]));

/** Friendly label for a permission key, falling back to the key itself. */
export function permissionLabel(key: string): string {
  return CATALOG_BY_KEY.get(key)?.label ?? key;
}

/** Whether a key is part of the known catalogue. */
export function isKnownPermission(key: string): boolean {
  return CATALOG_BY_KEY.has(key);
}

export interface PermissionGroup {
  group: string;
  permissions: PermissionDef[];
}

/** Group the catalogue for display, preserving first-seen group order. */
export function groupedPermissions(): PermissionGroup[] {
  const groups: PermissionGroup[] = [];
  for (const def of PERMISSION_CATALOG) {
    let bucket = groups.find((g) => g.group === def.group);
    if (!bucket) {
      bucket = { group: def.group, permissions: [] };
      groups.push(bucket);
    }
    bucket.permissions.push(def);
  }
  return groups;
}
