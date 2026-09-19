import { describe, it, expect } from 'vitest';
import { validateCustomFieldAnswers, isCheckboxChecked, type CustomFieldDef } from './custom-fields';

function field(over: Partial<CustomFieldDef> & Pick<CustomFieldDef, 'id' | 'type'>): CustomFieldDef {
  return { label: over.label ?? over.id, required: false, options: [], placeholder: null, ...over };
}

describe('validateCustomFieldAnswers', () => {
  it('accepts a valid set and returns denormalised answers', () => {
    const fields: CustomFieldDef[] = [
      field({ id: 'a', type: 'TEXT', label: 'Name', required: true }),
      field({ id: 'b', type: 'SELECT', label: 'Size', options: ['S', 'M', 'L'] }),
    ];
    const res = validateCustomFieldAnswers(fields, { a: 'Jo', b: 'M' });
    expect(res.ok).toBe(true);
    expect(res.answers).toEqual([
      { fieldId: 'a', label: 'Name', value: 'Jo' },
      { fieldId: 'b', label: 'Size', value: 'M' },
    ]);
  });

  it('flags a missing required field and skips empty optional ones', () => {
    const fields: CustomFieldDef[] = [
      field({ id: 'a', type: 'TEXT', label: 'Name', required: true }),
      field({ id: 'b', type: 'TEXT', label: 'Company' }),
    ];
    const res = validateCustomFieldAnswers(fields, { a: '', b: '' });
    expect(res.ok).toBe(false);
    expect(res.errors.a).toContain('required');
    expect(res.answers).toHaveLength(0);
  });

  it('validates number, email, date and select membership', () => {
    const fields: CustomFieldDef[] = [
      field({ id: 'n', type: 'NUMBER', label: 'Qty' }),
      field({ id: 'e', type: 'EMAIL', label: 'Email' }),
      field({ id: 'd', type: 'DATE', label: 'DOB' }),
      field({ id: 's', type: 'RADIO', label: 'Pick', options: ['x', 'y'] }),
    ];
    const res = validateCustomFieldAnswers(fields, { n: 'abc', e: 'nope', d: '13/2020', s: 'z' });
    expect(res.ok).toBe(false);
    expect(Object.keys(res.errors).sort()).toEqual(['d', 'e', 'n', 's']);
  });

  it('treats a required checkbox as needing to be checked, and stores "Yes"', () => {
    const fields: CustomFieldDef[] = [field({ id: 'c', type: 'CHECKBOX', label: 'Agree', required: true })];
    expect(validateCustomFieldAnswers(fields, { c: 'false' }).ok).toBe(false);
    const ok = validateCustomFieldAnswers(fields, { c: 'true' });
    expect(ok.ok).toBe(true);
    expect(ok.answers[0]).toEqual({ fieldId: 'c', label: 'Agree', value: 'Yes' });
  });

  it('recognises common checkbox truthy encodings', () => {
    expect(isCheckboxChecked('on')).toBe(true);
    expect(isCheckboxChecked('yes')).toBe(true);
    expect(isCheckboxChecked('')).toBe(false);
  });
});
