import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { getFormConfig, saveFormDesign, loadResolvedForm } from '../src/form/config';
import { getPublicBookingData } from '../src/public/booking-data';

const prisma = new PrismaClient();

let slug = '';
let businessId = '';
let presetThemeId = '';

beforeAll(async () => {
  slug = `form-${Date.now()}`;
  const biz = await prisma.business.create({ data: { slug, name: 'Form Co', timezone: 'UTC' } });
  businessId = biz.id;
  // A preset theme + default config pointing at it (mirrors the seed).
  const preset = await prisma.formTheme.create({
    data: { businessId, key: 'minimal', name: 'Minimal', isPreset: true, tokens: { primary: '#4f46e5', radius: '0.625rem', font: 'system' } },
  });
  presetThemeId = preset.id;
  await prisma.formConfiguration.create({
    data: { businessId, name: 'Default Booking Form', isDefault: true, themeId: preset.id, steps: ['service', 'employee', 'datetime', 'details', 'confirm'] },
  });
});

afterAll(async () => {
  await prisma.business.deleteMany({ where: { id: businessId } });
  await prisma.$disconnect();
});

describe('getFormConfig', () => {
  it('returns resolved defaults and the preset catalogue', async () => {
    const cfg = await getFormConfig(businessId, prisma);
    expect(cfg.theme.primary).toBe('#4f46e5');
    expect(cfg.settings.daysAhead).toBe(14);
    expect(cfg.steps).toContain('employee');
    expect(cfg.presets.map((p) => p.key)).toEqual(['minimal', 'luxury', 'modern', 'medical', 'editorial']);
  });
});

describe('saveFormDesign', () => {
  it('writes tokens to a NEW custom theme (leaving the preset untouched) and updates settings/steps', async () => {
    const saved = await saveFormDesign(
      businessId,
      {
        tokens: { primary: '#0ea5e9', radius: '1rem', font: 'sans' },
        settings: { daysAhead: 30, minLeadMinutes: 120, showPrices: false, requirePhone: true, allowAnyEmployee: false, confirmationMessage: 'See you soon!' },
        steps: ['service', 'datetime', 'details', 'confirm'], // employee step removed
      },
      prisma,
    );
    expect(saved.theme.primary).toBe('#0ea5e9');
    expect(saved.settings.daysAhead).toBe(30);
    expect(saved.steps).not.toContain('employee');

    // The preset theme must be unchanged.
    const preset = await prisma.formTheme.findUnique({ where: { id: presetThemeId } });
    expect((preset?.tokens as { primary: string }).primary).toBe('#4f46e5');

    // A custom, non-preset theme now exists and the default config points at it.
    const custom = await prisma.formTheme.findFirst({ where: { businessId, key: 'custom', isPreset: false } });
    expect(custom).not.toBeNull();
    const config = await prisma.formConfiguration.findFirst({ where: { businessId, isDefault: true } });
    expect(config?.themeId).toBe(custom!.id);

    // Re-loading resolves the saved values.
    const reloaded = await loadResolvedForm(businessId, prisma);
    expect(reloaded.theme.primary).toBe('#0ea5e9');
    expect(reloaded.settings.requirePhone).toBe(true);
  });

  it('updates the SAME custom theme on a second save (no duplicate)', async () => {
    await saveFormDesign(
      businessId,
      {
        tokens: { primary: '#b91c1c', radius: '0rem', font: 'serif' },
        settings: { daysAhead: 7, minLeadMinutes: 0, showPrices: true, requirePhone: false, allowAnyEmployee: true, confirmationMessage: '' },
        steps: ['service', 'employee', 'datetime', 'details', 'confirm'],
      },
      prisma,
    );
    const customThemes = await prisma.formTheme.findMany({ where: { businessId, key: 'custom' } });
    expect(customThemes).toHaveLength(1);
    expect((customThemes[0]?.tokens as { primary: string }).primary).toBe('#b91c1c');
  });

  it('surfaces the resolved form through the public read model', async () => {
    const data = await getPublicBookingData(slug, prisma);
    expect(data?.form.theme.primary).toBe('#b91c1c');
    expect(data?.form.settings.daysAhead).toBe(7);
    expect(data?.form.steps).toContain('employee');
  });
});
