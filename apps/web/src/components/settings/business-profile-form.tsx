'use client';

import { useState, useTransition } from 'react';
import { Check } from 'lucide-react';
import { Button } from '@booking/ui/button';
import { saveBusinessProfileAction } from '@/server/settings/actions';

export interface ProfileValues {
  name: string;
  timezone: string;
  currency: string;
  email: string | null;
  phone: string | null;
}

const CONTROL =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

export function BusinessProfileForm({
  profile,
  timezones,
  currencies,
}: {
  profile: ProfileValues;
  timezones: string[];
  currencies: string[];
}) {
  const [name, setName] = useState(profile.name);
  const [timezone, setTimezone] = useState(profile.timezone);
  const [currency, setCurrency] = useState(profile.currency);
  const [email, setEmail] = useState(profile.email ?? '');
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  // Guarantee the current values are selectable even if the runtime list is empty.
  const tzOptions = timezones.length ? (timezones.includes(timezone) ? timezones : [timezone, ...timezones]) : [timezone];
  const curOptions = currencies.length ? (currencies.includes(currency) ? currencies : [currency, ...currencies]) : [currency];

  function save() {
    setError(null);
    setSaved(false);
    start(async () => {
      const res = await saveBusinessProfileAction({
        name,
        timezone,
        currency,
        email: email.trim() || null,
        phone: phone.trim() || null,
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        setError(res.error ?? 'Could not save.');
      }
    });
  }

  return (
    <div className="max-w-2xl space-y-5 rounded-xl border border-border bg-card p-5">
      <div>
        <h2 className="text-base font-semibold">Business profile</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          The name, timezone and currency used across the admin, availability and customer notifications.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Business name">
            <input className={CONTROL} value={name} onChange={(e) => setName(e.target.value)} placeholder="Aurora Spa" />
          </Field>
        </div>

        <Field label="Timezone" hint="Drives availability, the calendar and reminder timing.">
          <select className={CONTROL} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            {tzOptions.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Currency" hint="How prices and payments are displayed.">
          <select className={CONTROL} value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {curOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Contact email" hint="Optional. Shown to customers on confirmations.">
          <input className={CONTROL} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="hello@aurora.example" />
        </Field>

        <Field label="Contact phone" hint="Optional.">
          <input className={CONTROL} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 0100" />
        </Field>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={pending || !name.trim()}>
          {pending ? 'Saving…' : 'Save changes'}
        </Button>
        {saved ? (
          <span className="flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
            <Check className="size-4" /> Saved
          </span>
        ) : null}
      </div>
    </div>
  );
}
