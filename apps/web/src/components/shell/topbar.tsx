import { MobileNav } from './mobile-nav';
import { CommandPalette } from './command-palette';
import { Notifications } from './notifications';
import { ModeToggle } from './mode-toggle';
import { UserMenu } from './user-menu';

export function Topbar({
  name,
  email,
  businessSlug,
}: {
  name: string;
  email: string;
  businessSlug: string;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur">
      <MobileNav businessSlug={businessSlug} />
      <div className="flex flex-1 items-center">
        <CommandPalette />
      </div>
      <div className="flex items-center gap-1">
        <Notifications />
        <ModeToggle />
        <UserMenu name={name} email={email} />
      </div>
    </header>
  );
}
