import type { Prisma } from '@prisma/client';
import { sanitizeEventKeys, type WebhookEventKey } from '@booking/core';
import { BaseRepository } from '../repositories/base';
import { generateWebhookSecret } from './signing';

/**
 * Tenant-scoped access to webhook endpoints. Every query is bound to the
 * business via the BaseRepository scope so one tenant can never see or mutate
 * another's endpoints. `events` is stored as a JSON string array of subscribable
 * keys (always sanitized on the way in).
 */

export interface WebhookInput {
  url: string;
  events: string[];
  isActive?: boolean;
}

export class WebhookRepository extends BaseRepository {
  list() {
    return this.db.webhook.findMany({ where: this.scope(), orderBy: { createdAt: 'desc' } });
  }

  getById(id: string) {
    return this.db.webhook.findFirst({ where: this.scope({ id }) });
  }

  create(input: WebhookInput) {
    const events = sanitizeEventKeys(input.events);
    return this.db.webhook.create({
      data: {
        businessId: this.businessId,
        url: input.url,
        secret: generateWebhookSecret(),
        events: events as unknown as Prisma.InputJsonValue,
        isActive: input.isActive ?? true,
      },
    });
  }

  async update(id: string, input: WebhookInput) {
    const events = sanitizeEventKeys(input.events);
    const res = await this.db.webhook.updateMany({
      where: this.scope({ id }),
      data: {
        url: input.url,
        events: events as unknown as Prisma.InputJsonValue,
        isActive: input.isActive ?? true,
      },
    });
    return res.count > 0;
  }

  async setActive(id: string, isActive: boolean) {
    const res = await this.db.webhook.updateMany({ where: this.scope({ id }), data: { isActive } });
    return res.count > 0;
  }

  /** Rotate the signing secret; returns the new secret or null if not found. */
  async rotateSecret(id: string): Promise<string | null> {
    const secret = generateWebhookSecret();
    const res = await this.db.webhook.updateMany({ where: this.scope({ id }), data: { secret } });
    return res.count > 0 ? secret : null;
  }

  async remove(id: string) {
    const res = await this.db.webhook.deleteMany({ where: this.scope({ id }) });
    return res.count > 0;
  }

  /** Active endpoints subscribed to a given event key. */
  async activeForEvent(event: WebhookEventKey) {
    const rows = await this.db.webhook.findMany({ where: this.scope({ isActive: true }) });
    return rows.filter((w) => sanitizeEventKeys(w.events).includes(event));
  }
}
