'use server';

import { revalidatePath } from 'next/cache';
import {
  repositoriesFor,
  writeAudit,
  type RoleRow,
  type PermissionRow,
  type TeamMemberRow,
  type AuditFilter,
  type AuditPage,
} from '@booking/db';
import { DomainError } from '@booking/core';
import { requirePermission } from '@/server/auth/guard';
import { logger } from '@/lib/logger';

export interface AccessActionResult {
  ok: boolean;
  error?: string;
}

export interface RoleFormInput {
  name: string;
  description: string | null;
  permissionKeys: string[];
}

function refresh(): void {
  revalidatePath('/admin/access');
}

function fail(event: string, error: unknown, fallback: string): AccessActionResult {
  if (error instanceof DomainError) return { ok: false, error: error.message };
  logger.error(event, { message: (error as Error)?.message });
  return { ok: false, error: fallback };
}

// --- Reads ------------------------------------------------------------------

export async function listRolesAction(): Promise<RoleRow[]> {
  const session = await requirePermission('settings.manage');
  return repositoriesFor(session.user.businessId).roles.listRoles();
}

export async function listPermissionsAction(): Promise<PermissionRow[]> {
  const session = await requirePermission('settings.manage');
  return repositoriesFor(session.user.businessId).roles.listPermissions();
}

export async function listTeamAction(): Promise<TeamMemberRow[]> {
  const session = await requirePermission('settings.manage');
  return repositoriesFor(session.user.businessId).roles.listTeam();
}

export async function loadAuditLogAction(filter: AuditFilter = {}): Promise<AuditPage> {
  const session = await requirePermission('settings.manage');
  return repositoriesFor(session.user.businessId).audit.list(filter);
}

// --- Role mutations ---------------------------------------------------------

export async function createRoleAction(input: RoleFormInput): Promise<AccessActionResult> {
  const session = await requirePermission('settings.manage');
  try {
    const repos = repositoriesFor(session.user.businessId);
    const role = await repos.roles.createRole({
      name: input.name,
      description: input.description,
      permissionKeys: input.permissionKeys,
    });
    await writeAudit({
      businessId: session.user.businessId,
      actorUserId: session.user.id,
      action: 'access.role.create',
      entity: 'Role',
      entityId: role.id,
      metadata: { name: input.name.trim(), permissions: input.permissionKeys.length },
    });
    refresh();
    return { ok: true };
  } catch (error) {
    return fail('access.role.create.failed', error, 'Could not create the role.');
  }
}

export async function updateRoleAction(id: string, input: RoleFormInput): Promise<AccessActionResult> {
  const session = await requirePermission('settings.manage');
  try {
    const repos = repositoriesFor(session.user.businessId);
    await repos.roles.updateRole(id, {
      name: input.name,
      description: input.description,
      permissionKeys: input.permissionKeys,
    });
    await writeAudit({
      businessId: session.user.businessId,
      actorUserId: session.user.id,
      action: 'access.role.update',
      entity: 'Role',
      entityId: id,
      metadata: { name: input.name.trim(), permissions: input.permissionKeys.length },
    });
    refresh();
    return { ok: true };
  } catch (error) {
    return fail('access.role.update.failed', error, 'Could not update the role.');
  }
}

export async function deleteRoleAction(id: string): Promise<AccessActionResult> {
  const session = await requirePermission('settings.manage');
  try {
    const repos = repositoriesFor(session.user.businessId);
    await repos.roles.deleteRole(id);
    await writeAudit({
      businessId: session.user.businessId,
      actorUserId: session.user.id,
      action: 'access.role.delete',
      entity: 'Role',
      entityId: id,
    });
    refresh();
    return { ok: true };
  } catch (error) {
    return fail('access.role.delete.failed', error, 'Could not delete the role.');
  }
}

// --- Team role assignment ---------------------------------------------------

export async function setUserRolesAction(userId: string, roleIds: string[]): Promise<AccessActionResult> {
  const session = await requirePermission('settings.manage');
  try {
    const repos = repositoriesFor(session.user.businessId);
    await repos.roles.setUserRoles(userId, roleIds);
    await writeAudit({
      businessId: session.user.businessId,
      actorUserId: session.user.id,
      action: 'access.userRoles.update',
      entity: 'User',
      entityId: userId,
      metadata: { roles: roleIds.length },
    });
    refresh();
    return { ok: true };
  } catch (error) {
    return fail('access.userRoles.update.failed', error, 'Could not update role assignments.');
  }
}
