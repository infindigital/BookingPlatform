'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Moon, Search, Sun } from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@booking/ui/command';
import { NAV_ITEMS } from './nav';

/**
 * Global search + command palette. Renders a search-styled trigger for the
 * top bar and the ⌘K / Ctrl+K dialog. Navigation search is fully functional;
 * entity search (customers, bookings…) is wired as those phases land.
 */
export function CommandPalette() {
  const router = useRouter();
  const { setTheme, resolvedTheme } = useTheme();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const run = useCallback((fn: () => void) => {
    setOpen(false);
    fn();
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-full max-w-xs items-center gap-2 rounded-md border border-border bg-background px-3 text-sm text-muted-foreground transition-colors hover:bg-accent/50"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] sm:inline">
          ⌘K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search or jump to…" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Navigate">
            {NAV_ITEMS.map((item) => (
              <CommandItem
                key={item.href}
                value={`nav ${item.label}`}
                onSelect={() => run(() => router.push(item.href))}
              >
                <item.icon />
                {item.label}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Preferences">
            <CommandItem
              value="toggle theme dark light"
              onSelect={() =>
                run(() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark'))
              }
            >
              {resolvedTheme === 'dark' ? <Sun /> : <Moon />}
              Toggle theme
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
