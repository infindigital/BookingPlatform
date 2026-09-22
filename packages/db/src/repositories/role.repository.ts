import { Prisma } from '@prisma/client';
import { ValidationError, isKnownPermission } from '@booking/core';
import { BaseRepository } from './base';

export interface RoleInput {
  name: string;
  description?: string | null;
  permissionKeys: string[];
}

export interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissionKeys: string[];
  userCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PermissionRow {
  key: string;
  description: string | null;
}

export interface TeamMemberRow {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  roleIds: string[];
}

/**
 * Business-scoped access to roles, the global permission catalogue, and
 * user-role assignments. System roles (e.g. "Administrator") are protected
 * from edits and deletion so a tenant can never lock itself out.
 */
export class RoleRepository extends BaseRepository {
  async listRoles(): Promise<RoleRow[]> {
    const roles = await this.db.role.findMany({
      where: this.scope(),
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      include: {
        permissions: { include: { permission: { select: { key: true } } } },
        _count: { select: { users: true } },
      },
    });
    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      permissionKeys: r.permissions.map((p) => p.permission.key).sort(),
      userCount: r._count.users,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  /** Global permission catalogue (not tenant-owned). */
  listPermissions(): Promise<PermissionRow[]> {
    return this.db.permission.findMany({
      orderBy: { key: 'asc' },
      select: { key: true, description: true },
    });
  }

  async listTeam(): Promise<TeamMemberRow[]> {
    const users = await this.db.user.findMany({
      where: this.scope(),
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      include: { roles: { select: { roleId: true } } },
    });
    return users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      isActive: u.isActive,
      roleIds: u.roles.map((r) => r.roleId),
    }));
  }

  private async resolvePermissionIds(keys: string[]): Promise<string[]> {
    const unique = [...new Set(keys)];
    for (const key of unique) {
      if (!isKnownPermission(key)) throw new ValidationError(`Unknown permission: ${key}`);
    }
    if (unique.length === 0) return [];
    const rows = await this.db.permission.findMany({
      where: { key: { in: unique } },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  private normaliseName(raw: string): string {
    const name = raw.trim();
    if (!name) throw new ValidationError('A role name is required.');
    if (name.length > 100) throw new ValidationError('The role name is too long.');
    return name;
  }

  async createRole(input: RoleInput): Promise<{ id: string }> {
    const name = this.normaliseName(input.name);
    const permissionIds = await this.resolvePermissionIds(input.permissionKeys);
    try {
      return await this.db.role.create({
        data: {
          businessId: this.businessId,
          name,
          description: input.description?.trim() || null,
          isSystem: false,
          permissions: { create: permissionIds.map((permissionId) => ({ permissionId })) },
        },
        select: { id: true },
      });
    } catch (error) {
      throw this.mapUniqueError(error);
    }
  }

  async updateRole(id: string, input: RoleInput): Promise<void> {
    const existing = await this.db.role.findFirst({
      where: this.scope({ id }),
      select: { id: true, isSystem: true },
    });
    if (!existing) throw new ValidationError('That role no longer exists.');
    if (existing.isSystem) throw new ValidationError('System roles cannot be edited.');
    const name = this.normaliseName(input.name);
    const permissionIds = await this.resolvePermissionIds(input.permissionKeys);
    try {
      await this.db.$transaction([
        this.db.role.update({
          where: { id: existing.id },
          data: { name, description: input.description?.trim() || null },
        }),
        this.db.rolePermission.deleteMany({ where: { roleId: existing.id } }),
        this.db.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({ roleId: existing.id, permissionId })),
          skipDuplicates: true,
        }),
      ]);
    } catch (error) {
      throw this.mapUniqueError(error);
    }
  }

  async deleteRole(id: string): Promise<void> {
    const existing = await this.db.role.findFirst({
      where: this.scope({ id }),
      select: { id: true, isSystem: true },
    });
    if (!existing) throw new ValidationError('That role no longer exists.');
    if (existing.isSystem) throw new ValidationError('System roles cannot be deleted.');
    // RolePermission and UserRole rows cascade on role deletion.
    await this.db.role.delete({ where: { id: existing.id } });
  }

  async setUserRoles(userId: string, roleIds: string[]): Promise<void> {
    const user = await this.db.user.findFirst({
      where: this.scope({ id: userId }),
      select: { id: true },
    });
    if (!user) throw new ValidationError('That team member no longer exists.');
    const unique = [...new Set(roleIds)];
    if (unique.length > 0) {
      const valid = await this.db.role.findMany({
        where: this.scope({ id: { in: unique } }),
        select: { id: true },
      });
      if (valid.length !== unique.length) {
        throw new ValidationError('One or more roles are not valid for this business.');
      }
    }
    await this.db.$transaction([
      this.db.userRole.deleteMany({ where: { userId: user.id } }),
      this.db.userRole.createMany({
        data: unique.map((roleId) => ({ userId: user.id, roleId })),
        skipDuplicates: true,
      }),
    ]);
  }

  private mapUniqueError(error: unknown): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return new ValidationError('A role with that name already exists.');
    }
    return error;
  }
}
