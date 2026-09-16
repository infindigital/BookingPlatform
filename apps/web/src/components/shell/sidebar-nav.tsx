'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@booking/ui/lib/cn';
import { NAV_SECTIONS } from './nav';

/** Shared nav list used by both the desktop sidebar and the mobile drawer. */
export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-5 px-3 py-4">
      {NAV_SECTIONS.map((section) => (
        <div key={section.heading}>
          <p className="px-3 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {section.heading}
          </p>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active =
                item.href === '/admin'
                  ? pathname === '/admin'
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'group flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                      active
                        ? 'bg-accent font-medium text-accent-foreground'
                        : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                    )}
                  >
                    <item.icon
                      className={cn(
                        'size-4 shrink-0',
                        active ? 'text-foreground' : 'text-muted-foreground',
                      )}
                    />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
