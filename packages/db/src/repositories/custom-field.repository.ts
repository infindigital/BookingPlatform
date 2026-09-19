import type { CustomFieldType, Prisma } from '@prisma/client';
import { BaseRepository } from './base';

/**
 * Per-service custom booking fields. A field with a null serviceId applies to
 * every service; one with a serviceId applies only to that service. Options for
 * SELECT / RADIO are stored as a JSON string array. Every query is tenant-scoped.
 */

export interface CustomFieldInput {
  /** Null -> applies to every service. */
  serviceId?: string | null;
  label: string;
  type: CustomFieldType;
  required?: boolean;
  options?: string[];
  placeholder?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

/** Options come back from Prisma as `Json`; normalise to a string array. */
export function optionsToArray(value: Prisma.JsonValue | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

function slugKey(label: string): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'field';
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}_${suffix}`;
}

export class CustomFieldRepository extends BaseRepository {
  /** Every field defined for a specific service (admin builder view). */
  listForService(serviceId: string) {
    return this.db.customField.findMany({
      where: this.scope({ serviceId }),
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /** Active fields applicable to a booking for this service (service-specific + global). */
  listApplicable(serviceId: string) {
    return this.db.customField.findMany({
      where: this.scope({ isActive: true, OR: [{ serviceId }, { serviceId: null }] }),
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  getById(id: string) {
    return this.db.customField.findFirst({ where: this.scope({ id }) });
  }

  async create(input: CustomFieldInput) {
    // A service id, when given, must belong to this tenant.
    if (input.serviceId) {
      const owned = await this.db.service.findFirst({ where: this.scope({ id: input.serviceId }), select: { id: true } });
      if (!owned) throw new Error('Service not found in this business.');
    }
    return this.db.customField.create({
      data: {
        businessId: this.businessId,
        serviceId: input.serviceId ?? null,
        key: slugKey(input.label),
        label: input.label.slice(0, 160),
        type: input.type,
        required: input.required ?? false,
        options: input.options ?? [],
        placeholder: input.placeholder?.slice(0, 200) || null,
        sortOrder: input.sortOrder ?? 0,
        isActive: input.isActive ?? true,
      },
    });
  }

  update(id: string, input: Omit<CustomFieldInput, 'serviceId'>) {
    // updateMany with a scoped where guarantees we never touch another tenant's row.
    return this.db.customField.updateMany({
      where: this.scope({ id }),
      data: {
        label: input.label.slice(0, 160),
        type: input.type,
        required: input.required ?? false,
        options: input.options ?? [],
        placeholder: input.placeholder?.slice(0, 200) || null,
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
  }

  delete(id: string) {
    return this.db.customField.deleteMany({ where: this.scope({ id }) });
  }
}
