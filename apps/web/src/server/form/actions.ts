'use server';

import { saveFormDesign, writeAudit } from '@booking/db';
import type { FormThemeTokens, FormSettings, FormStepKey } from '@booking/core';
import { requirePermission } from '@/server/auth/guard';
import { logger } from '@/lib/logger';

export interface SaveDesignState {
  ok: boolean;
  error?: string;
  savedAt?: number;
}

/**
 * Persist a Form Designer edit. Gated on `settings.manage`. The pure core
 * resolvers inside `saveFormDesign` clamp/validate everything, so a tampered
 * client cannot store out-of-range values. The public /book/[slug] page renders
 * on demand, so saved changes appear on its next load.
 */
export async function saveFormDesignAction(input: {
  tokens: FormThemeTokens;
  settings: FormSettings;
  steps: FormStepKey[];
}): Promise<SaveDesignState> {
  const session = await requirePermission('settings.manage');
  try {
    await saveFormDesign(session.user.businessId, input);
    await writeAudit({
      businessId: session.user.businessId,
      actorUserId: session.user.id,
      action: 'form.design.save',
      entity: 'FormConfiguration',
    });
    return { ok: true, savedAt: Date.now() };
  } catch (error) {
    logger.error('form.design.save.failed', { message: (error as Error)?.message });
    return { ok: false, error: 'Could not save your changes. Please try again.' };
  }
}
