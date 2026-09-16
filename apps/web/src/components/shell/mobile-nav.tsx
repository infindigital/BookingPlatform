'use client';

import { useState } from 'react';
import { Menu } from 'lucide-react';
import { Button } from '@booking/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@booking/ui/sheet';
import { Brand } from './brand';
import { SidebarNav } from './sidebar-nav';

export function MobileNav({ businessSlug }: { businessSlug?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="p-0">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <Brand businessSlug={businessSlug} />
        <div className="overflow-y-auto">
          <SidebarNav onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
