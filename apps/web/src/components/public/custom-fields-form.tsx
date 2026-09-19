'use client';

import type { CustomFieldDef } from '@booking/core';
import { isCheckboxChecked } from '@booking/core';

const CONTROL =
  'h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

/**
 * Renders a service's custom booking fields and collects answers into a flat
 * { fieldId: value } map. Validation of required/format lives in the shared core
 * validator; here we only surface the required marker and let the wizard gate
 * "Continue" on required completeness.
 */
export function CustomFieldsForm({
  fields,
  values,
  onChange,
}: {
  fields: CustomFieldDef[];
  values: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  if (fields.length === 0) return null;
  const set = (id: string, value: string) => onChange({ ...values, [id]: value });

  return (
    <div className="space-y-3 border-t border-border pt-3">
      {fields.map((f) => {
        const value = values[f.id] ?? '';
        const label = (
          <span className="text-xs font-medium text-muted-foreground">
            {f.label}
            {f.required ? ' *' : ''}
          </span>
        );

        if (f.type === 'CHECKBOX') {
          return (
            <label key={f.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isCheckboxChecked(value)}
                onChange={(e) => set(f.id, e.target.checked ? 'true' : 'false')}
                className="size-4 rounded border-border accent-primary"
              />
              <span>
                {f.label}
                {f.required ? ' *' : ''}
              </span>
            </label>
          );
        }

        if (f.type === 'TEXTAREA') {
          return (
            <label key={f.id} className="block space-y-1">
              {label}
              <textarea
                className={`${CONTROL} h-auto py-2`}
                rows={3}
                placeholder={f.placeholder ?? ''}
                value={value}
                onChange={(e) => set(f.id, e.target.value)}
                required={f.required}
              />
            </label>
          );
        }

        if (f.type === 'SELECT' || f.type === 'RADIO') {
          return (
            <label key={f.id} className="block space-y-1">
              {label}
              <select className={CONTROL} value={value} onChange={(e) => set(f.id, e.target.value)} required={f.required}>
                <option value="">Select…</option>
                {f.options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
          );
        }

        const inputType =
          f.type === 'NUMBER' ? 'number' : f.type === 'EMAIL' ? 'email' : f.type === 'DATE' ? 'date' : f.type === 'PHONE' ? 'tel' : 'text';
        return (
          <label key={f.id} className="block space-y-1">
            {label}
            <input
              type={inputType}
              className={CONTROL}
              placeholder={f.placeholder ?? ''}
              value={value}
              onChange={(e) => set(f.id, e.target.value)}
              required={f.required}
            />
          </label>
        );
      })}
    </div>
  );
}
