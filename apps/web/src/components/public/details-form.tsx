'use client';

export interface CustomerDetails {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  notes: string;
}

const CONTROL =
  'h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function DetailsForm({
  value,
  onChange,
  requirePhone = false,
  showLastName = true,
  showPhone = true,
  showNotes = true,
}: {
  value: CustomerDetails;
  onChange: (next: CustomerDetails) => void;
  requirePhone?: boolean;
  showLastName?: boolean;
  showPhone?: boolean;
  showNotes?: boolean;
}) {
  const set = (patch: Partial<CustomerDetails>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-3">
      <div className={`grid grid-cols-1 gap-3 ${showLastName ? 'sm:grid-cols-2' : ''}`}>
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">First name *</span>
          <input
            className={CONTROL}
            value={value.firstName}
            onChange={(e) => set({ firstName: e.target.value })}
            autoComplete="given-name"
            required
          />
        </label>
        {showLastName ? (
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Last name</span>
            <input
              className={CONTROL}
              value={value.lastName}
              onChange={(e) => set({ lastName: e.target.value })}
              autoComplete="family-name"
            />
          </label>
        ) : null}
      </div>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted-foreground">Email *</span>
        <input
          type="email"
          className={CONTROL}
          value={value.email}
          onChange={(e) => set({ email: e.target.value })}
          autoComplete="email"
          required
        />
      </label>
      {showPhone ? (
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Phone{requirePhone ? ' *' : ''}</span>
          <input
            type="tel"
            className={CONTROL}
            value={value.phone}
            onChange={(e) => set({ phone: e.target.value })}
            autoComplete="tel"
            required={requirePhone}
          />
        </label>
      ) : null}
      {showNotes ? (
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Notes</span>
          <textarea
            className={`${CONTROL} h-auto py-2`}
            rows={3}
            placeholder="Anything we should know?"
            value={value.notes}
            onChange={(e) => set({ notes: e.target.value })}
          />
        </label>
      ) : null}
    </div>
  );
}
