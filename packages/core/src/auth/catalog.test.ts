import { describe, it, expect } from 'vitest';
import {
  PERMISSION_CATALOG,
  PERMISSION_KEYS,
  permissionLabel,
  isKnownPermission,
  groupedPermissions,
} from './catalog';

describe('permission catalog', () => {
  it('has unique keys', () => {
    const keys = PERMISSION_CATALOG.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('PERMISSION_KEYS mirrors the catalog order', () => {
    expect(PERMISSION_KEYS).toEqual(PERMISSION_CATALOG.map((p) => p.key));
  });

  it('every entry has a label, description, and group', () => {
    for (const def of PERMISSION_CATALOG) {
      expect(def.label.length).toBeGreaterThan(0);
      expect(def.description.length).toBeGreaterThan(0);
      expect(def.group.length).toBeGreaterThan(0);
    }
  });

  it('resolves labels and falls back to the key', () => {
    expect(permissionLabel('settings.manage')).toBe('Manage settings');
    expect(permissionLabel('unknown.key')).toBe('unknown.key');
  });

  it('recognises known keys only', () => {
    expect(isKnownPermission('booking.approve')).toBe(true);
    expect(isKnownPermission('booking.destroy')).toBe(false);
  });

  it('groups without dropping any permission', () => {
    const groups = groupedPermissions();
    const flat = groups.flatMap((g) => g.permissions.map((p) => p.key));
    expect(flat.sort()).toEqual([...PERMISSION_KEYS].sort());
    expect(new Set(groups.map((g) => g.group)).size).toBe(groups.length);
  });
});
