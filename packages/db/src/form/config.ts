import type { Prisma, PrismaClient } from '@prisma/client';
import {
  resolveFormTheme,
  resolveFormSettings,
  resolveSteps,
  FORM_THEME_PRESETS,
  type FormThemeTokens,
  type FormSettings,
  type FormStepKey,
} from '@booking/core';
import { prisma } from '../client';

/**
 * Form Designer data layer. The default FormConfiguration owns the flow's
 * `steps` and `settings`; its linked FormTheme owns the visual `tokens`.
 * Everything is resolved through the pure core resolvers so callers always get
 * clean, clamped values regardless of what is stored.
 */

export interface ResolvedForm {
  theme: FormThemeTokens;
  settings: FormSettings;
  steps: FormStepKey[];
}

export interface FormConfigForAdmin extends ResolvedForm {
  presets: { key: string; name: string; tokens: FormThemeTokens }[];
}

/** Custom (business-owned, editable) theme key — presets stay immutable. */
const CUSTOM_THEME_KEY = 'custom';

const PRESET_META: Record<string, string> = {
  minimal: 'Minimal',
  luxury: 'Luxury',
  modern: 'Modern',
  medical: 'Medical',
  editorial: 'Editorial',
};

/** Load and resolve a business's default booking-form config (theme + settings + steps). */
export async function loadResolvedForm(businessId: string, db: PrismaClient = prisma): Promise<ResolvedForm> {
  const config = await db.formConfiguration.findFirst({
    where: { businessId, isDefault: true },
    include: { theme: { select: { tokens: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return {
    theme: resolveFormTheme(config?.theme?.tokens),
    settings: resolveFormSettings(config?.settings),
    steps: resolveSteps(config?.steps),
  };
}

export async function getFormConfig(businessId: string, db: PrismaClient = prisma): Promise<FormConfigForAdmin> {
  const resolved = await loadResolvedForm(businessId, db);
  return {
    ...resolved,
    presets: Object.entries(FORM_THEME_PRESETS).map(([key, tokens]) => ({
      key,
      name: PRESET_META[key] ?? key,
      tokens,
    })),
  };
}

export interface SaveFormDesignInput {
  tokens: FormThemeTokens;
  settings: FormSettings;
  steps: FormStepKey[];
}

/**
 * Persist a design edit. Tokens are written to a business-owned "custom" theme
 * (created on first save so shared presets are never mutated); settings + steps
 * are written to the default configuration. Tenant-scoped throughout.
 */
export async function saveFormDesign(
  businessId: string,
  input: SaveFormDesignInput,
  db: PrismaClient = prisma,
): Promise<ResolvedForm> {
  const tokens = resolveFormTheme(input.tokens);
  const settings = resolveFormSettings(input.settings);
  const steps = resolveSteps(input.steps);

  // Prisma's Json columns want an indexable value; our resolved shapes are safe.
  const tokensJson = tokens as unknown as Prisma.InputJsonValue;
  const settingsJson = settings as unknown as Prisma.InputJsonValue;
  const stepsJson = steps as unknown as Prisma.InputJsonValue;

  // 1. Ensure the business has an editable custom theme carrying the tokens.
  const existingTheme = await db.formTheme.findFirst({ where: { businessId, key: CUSTOM_THEME_KEY, isPreset: false } });
  const theme = existingTheme
    ? await db.formTheme.update({ where: { id: existingTheme.id }, data: { tokens: tokensJson } })
    : await db.formTheme.create({
        data: { businessId, key: CUSTOM_THEME_KEY, name: 'Custom', isPreset: false, tokens: tokensJson },
      });

  // 2. Ensure a default configuration exists and points at the custom theme.
  const existingConfig = await db.formConfiguration.findFirst({ where: { businessId, isDefault: true } });
  if (existingConfig) {
    await db.formConfiguration.update({
      where: { id: existingConfig.id },
      data: { themeId: theme.id, settings: settingsJson, steps: stepsJson },
    });
  } else {
    await db.formConfiguration.create({
      data: { businessId, name: 'Default Booking Form', isDefault: true, themeId: theme.id, settings: settingsJson, steps: stepsJson },
    });
  }

  return { theme: tokens, settings, steps };
}
