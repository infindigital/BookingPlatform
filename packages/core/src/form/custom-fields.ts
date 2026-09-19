/**
 * Per-service custom booking fields (pure, UI-independent).
 *
 * The admin can attach extra questions to a service; customers answer them on
 * the booking form. This module defines the shared field shape and a single
 * validator used by both the public API (server-side, authoritative) and the
 * booking UI, so the same rules apply everywhere. No I/O, no dependencies.
 */

export type CustomFieldType = 'TEXT' | 'TEXTAREA' | 'NUMBER' | 'SELECT' | 'CHECKBOX' | 'RADIO' | 'DATE' | 'PHONE' | 'EMAIL';

export const CUSTOM_FIELD_TYPES: readonly CustomFieldType[] = [
  'TEXT',
  'TEXTAREA',
  'NUMBER',
  'SELECT',
  'CHECKBOX',
  'RADIO',
  'DATE',
  'PHONE',
  'EMAIL',
];

/** A field definition as exposed to the booking form (no internal ids beyond id). */
export interface CustomFieldDef {
  id: string;
  label: string;
  type: CustomFieldType;
  required: boolean;
  /** Choices for SELECT / RADIO (ignored otherwise). */
  options: string[];
  placeholder: string | null;
}

/** A single answer, keyed by field id. Values are always strings over the wire. */
export type CustomFieldAnswers = Record<string, string>;

/** A validated, storable answer paired with its field's label (denormalised). */
export interface ResolvedAnswer {
  fieldId: string;
  label: string;
  value: string;
}

export interface CustomFieldValidation {
  ok: boolean;
  /** Field id -> human error, for inline display. */
  errors: Record<string, string>;
  /** Cleaned answers to persist (only for fields that have a value). */
  answers: ResolvedAnswer[];
}

const MAX_TEXT = 2000;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True when a checkbox answer counts as "checked". */
export function isCheckboxChecked(value: string | undefined): boolean {
  const v = (value ?? '').trim().toLowerCase();
  return v === 'true' || v === 'on' || v === '1' || v === 'yes';
}

/**
 * Validate a set of answers against the field definitions. Unknown keys are
 * ignored; missing optional fields are skipped. Returns cleaned answers ready
 * to store (with denormalised labels) and any per-field errors.
 */
export function validateCustomFieldAnswers(
  fields: CustomFieldDef[],
  raw: CustomFieldAnswers,
): CustomFieldValidation {
  const errors: Record<string, string> = {};
  const answers: ResolvedAnswer[] = [];

  for (const field of fields) {
    const rawValue = raw[field.id];
    const value = typeof rawValue === 'string' ? rawValue.trim() : '';

    if (field.type === 'CHECKBOX') {
      const checked = isCheckboxChecked(rawValue);
      if (field.required && !checked) {
        errors[field.id] = `${field.label} is required.`;
        continue;
      }
      // Store a stable canonical value only when checked.
      if (checked) answers.push({ fieldId: field.id, label: field.label, value: 'Yes' });
      continue;
    }

    if (!value) {
      if (field.required) errors[field.id] = `${field.label} is required.`;
      continue;
    }

    if (value.length > MAX_TEXT) {
      errors[field.id] = `${field.label} is too long.`;
      continue;
    }

    switch (field.type) {
      case 'NUMBER':
        if (!Number.isFinite(Number(value))) {
          errors[field.id] = `${field.label} must be a number.`;
          continue;
        }
        break;
      case 'EMAIL':
        if (!EMAIL_RE.test(value)) {
          errors[field.id] = `${field.label} must be a valid email.`;
          continue;
        }
        break;
      case 'DATE':
        if (!DATE_RE.test(value)) {
          errors[field.id] = `${field.label} must be a valid date.`;
          continue;
        }
        break;
      case 'SELECT':
      case 'RADIO':
        if (field.options.length > 0 && !field.options.includes(value)) {
          errors[field.id] = `Choose a valid option for ${field.label}.`;
          continue;
        }
        break;
      default:
        break;
    }

    answers.push({ fieldId: field.id, label: field.label, value });
  }

  return { ok: Object.keys(errors).length === 0, errors, answers };
}
