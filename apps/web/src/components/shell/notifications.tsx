'use client';

import { Bell } from 'lucide-react';
import { Button } from '@booking/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@booking/ui/dropdown-menu';

/**
 * Notification-center shell. The live notification feed is wired in Phase 13
 * (notification engine); this is the honest empty-state UI for now.
 */
export function Notifications() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Notifications">
          <Bell />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="text-sm font-medium text-foreground">
          Notifications
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="px-3 py-8 text-center">
          <Bell className="mx-auto size-5 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">You&apos;re all caught up</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Booking activity will appear here.
          </p>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
