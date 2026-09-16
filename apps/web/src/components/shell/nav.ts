import {
  LayoutDashboard,
  Calendar,
  CalendarCheck,
  Users,
  Scissors,
  UserCog,
  MapPin,
  Ticket,
  CreditCard,
  Bell,
  BarChart3,
  Plug,
  Paintbrush,
  Settings,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Phase in which this section becomes functional (drives the placeholder). */
  phase: number;
}

/** Admin navigation, per the product spec's admin navigation list. */
export const NAV_SECTIONS: { heading: string; items: NavItem[] }[] = [
  {
    heading: 'Workspace',
    items: [
      { label: 'Overview', href: '/admin', icon: LayoutDashboard, phase: 5 },
      { label: 'Calendar', href: '/admin/calendar', icon: Calendar, phase: 6 },
      { label: 'Bookings', href: '/admin/bookings', icon: CalendarCheck, phase: 7 },
      { label: 'Customers', href: '/admin/customers', icon: Users, phase: 11 },
    ],
  },
  {
    heading: 'Catalog',
    items: [
      { label: 'Services', href: '/admin/services', icon: Scissors, phase: 5 },
      { label: 'Employees', href: '/admin/employees', icon: UserCog, phase: 12 },
      { label: 'Locations', href: '/admin/locations', icon: MapPin, phase: 5 },
      { label: 'Events', href: '/admin/events', icon: Ticket, phase: 19 },
    ],
  },
  {
    heading: 'Operations',
    items: [
      { label: 'Payments', href: '/admin/payments', icon: CreditCard, phase: 18 },
      { label: 'Notifications', href: '/admin/notifications', icon: Bell, phase: 13 },
      { label: 'Analytics', href: '/admin/analytics', icon: BarChart3, phase: 20 },
      { label: 'Integrations', href: '/admin/integrations', icon: Plug, phase: 16 },
    ],
  },
  {
    heading: 'Configure',
    items: [
      { label: 'Form Designer', href: '/admin/form-designer', icon: Paintbrush, phase: 10 },
      { label: 'Settings', href: '/admin/settings', icon: Settings, phase: 19 },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);
