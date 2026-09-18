'use client';

import { useState } from 'react';
import { Building2, MapPin, Clock, CalendarOff, type LucideIcon } from 'lucide-react';
import type { DayHours } from '@booking/core';
import type { HolidayRow } from '@booking/db';
import { BusinessProfileForm, type ProfileValues } from './business-profile-form';
import { LocationsManager, type LocationView } from './locations-manager';
import { BusinessHoursForm } from './business-hours-form';
import { HolidaysManager } from './holidays-manager';

type Tab = 'general' | 'locations' | 'hours' | 'closures';

const TABS: { key: Tab; label: string; icon: LucideIcon }[] = [
  { key: 'general', label: 'General', icon: Building2 },
  { key: 'locations', label: 'Locations', icon: MapPin },
  { key: 'hours', label: 'Opening hours', icon: Clock },
  { key: 'closures', label: 'Closures', icon: CalendarOff },
];

export function SettingsWorkspace({
  profile,
  locations,
  week,
  holidays,
  timezones,
  currencies,
}: {
  profile: ProfileValues;
  locations: LocationView[];
  week: DayHours[];
  holidays: HolidayRow[];
  timezones: string[];
  currencies: string[];
}) {
  const [tab, setTab] = useState<Tab>('general');

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your business profile, locations, opening hours, and closures. These shape availability and how customers see you.
        </p>
      </header>

      <div className="flex items-center gap-1 overflow-x-auto border-b border-border">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              tab === key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'general' && <BusinessProfileForm profile={profile} timezones={timezones} currencies={currencies} />}
      {tab === 'locations' && <LocationsManager initial={locations} timezones={timezones} />}
      {tab === 'hours' && <BusinessHoursForm initial={week} />}
      {tab === 'closures' && <HolidaysManager initial={holidays} />}
    </div>
  );
}
